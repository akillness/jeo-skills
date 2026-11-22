--!nonstrict
-- PerfAudit: static performance budget audit of a place (Edit data model, or offline in Lune).
-- Complements the lead's Audit (per-part physics flags, deprecated APIs) and the environment audit
-- (per-model streaming modes, SLIM): this one counts what costs memory, draw calls, physics and
-- bandwidth, and greps script sources for the costly patterns the experts name.
--
--   PerfAudit.all(game)  {counts, budget, settings, findings = {{severity, rule, path, message}}, tally}
--
-- Thresholds marked [added] in the skill are defaults, not Roblox limits.

local PerfAudit = {}

local MAX_PER_RULE = 10
local PART_KB = 1 -- McNeill: about 1 KB of client memory per part (RDC 2024, RDC 2025)
local INSTANCE_BUDGET = 150000 -- McNeill: about 10,000 instances per second on join
local MOVING_NEAR_PLAYER = 50 -- McNeill: plan for about 50 moving assemblies near a player

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function enumName(v)
	if typeof(v) == "EnumItem" then
		return v.Name
	end
	if type(v) == "string" then
		return v:match("([^%.]+)$") or v
	end
	return tostring(v)
end

-- Asset ids: Studio saves MeshContent, TextureContent and the *MapContent properties; Lune then has no
-- MeshId or TextureID value to read. Read the Content property first and fall back to the string one.
local function contentUri(v: any): string?
	if type(v) == "string" then
		return if v ~= "" then v else nil
	end
	if typeof(v) == "Content" then
		local ok, uri = pcall(function()
			return v.Uri
		end)
		return if ok and type(uri) == "string" and uri ~= "" then uri else nil
	end
	return nil
end

local function assetId(inst: Instance, names: { string }): string?
	for _, name in names do
		local id = contentUri(prop(inst, name, nil))
		if id then
			return id
		end
	end
	return nil
end

local MESH = { "MeshContent", "MeshId" }
local SA_MAPS = {
	{ "ColorMapContent", "ColorMap" },
	{ "NormalMapContent", "NormalMap" },
	{ "RoughnessMapContent", "RoughnessMap" },
	{ "MetalnessMapContent", "MetalnessMap" },
}
-- Image properties by class; the object that carries the image in memory is the part for a SurfaceAppearance,
-- Decal or Texture, and the instance itself otherwise.
local IMAGE_PROPS = {
	MeshPart = { { "TextureContent", "TextureID" } },
	SurfaceAppearance = SA_MAPS,
	MaterialVariant = SA_MAPS,
	Decal = { { "ColorMapContent", "Texture" } },
	Texture = { { "ColorMapContent", "Texture" } },
	ParticleEmitter = { { "TextureContent", "Texture" } },
	Beam = { { "TextureContent", "Texture" } },
	Trail = { { "TextureContent", "Texture" } },
	ImageLabel = { { "ImageContent", "Image" } },
	ImageButton = { { "ImageContent", "Image" } },
}

local function add(out, severity, rule, inst, message)
	out.byRule[rule] = (out.byRule[rule] or 0) + 1
	if out.byRule[rule] <= MAX_PER_RULE then
		table.insert(out.findings, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
		})
	end
end

local function inCharacter(inst)
	local m = inst:FindFirstAncestorOfClass("Model")
	while m do
		if m:FindFirstChildOfClass("Humanoid") then
			return true
		end
		m = m:FindFirstAncestorOfClass("Model")
	end
	return false
end

local function serverSide(s)
	if s.ClassName == "LocalScript" then
		return false
	end
	if s.ClassName == "ModuleScript" then
		return s:FindFirstAncestorOfClass("ServerScriptService") ~= nil or s:FindFirstAncestorOfClass("ServerStorage") ~= nil
	end
	local rc = enumName(prop(s, "RunContext", "Legacy"))
	return rc ~= "Client"
end

-- Source patterns: {rule, severity, test(src, isServer), message}
local PATTERNS = {
	{
		"server-tween",
		"warn",
		function(src, server)
			return server and src:find("TweenService", 1, true) ~= nil and src:find(":Create(", 1, true) ~= nil
		end,
		"server-side TweenService replicates the property every frame: tween on the client",
	},
	{
		"server-per-frame-cframe",
		"warn",
		function(src, server)
			return server and (src:find("Heartbeat", 1, true) or src:find("Stepped", 1, true)) ~= nil
				and (src:find("%.CFrame%s*=") or src:find(":PivotTo%(")) ~= nil
		end,
		"server writes CFrames from a per-frame event: each write replicates; move cosmetic motion to clients",
	},
	{
		"per-frame-scan",
		"warn",
		function(src)
			local perFrame = src:find("Heartbeat", 1, true) or src:find("RenderStepped", 1, true)
				or src:find("PreRender", 1, true) or src:find("PreSimulation", 1, true)
			local scan = src:find(":GetDescendants()", 1, true) or src:find(":GetChildren()", 1, true)
				or src:find(":Raycast(", 1, true) or src:find(":GetPartBoundsInRadius(", 1, true)
			return perFrame ~= nil and scan ~= nil
		end,
		"a per-frame handler and a scene scan in the same script: check that the scan does not run every frame",
	},
	{
		"preload-everything",
		"warn",
		function(src)
			return src:find("PreloadAsync%(%s*game:GetChildren") ~= nil or src:find("PreloadAsync%(%s*{%s*workspace") ~= nil
				or src:find("PreloadAsync%(%s*workspace") ~= nil or src:find("RequestQueueSize", 1, true) ~= nil
		end,
		"preloading the whole game or waiting on RequestQueueSize lengthens load: preload only the loading screen and spawn assets",
	},
	{
		"no-profile-labels",
		"info",
		function(src)
			return (src:find("Heartbeat", 1, true) or src:find("PreRender", 1, true) or src:find("PreSimulation", 1, true)) ~= nil
				and src:find("debug.profilebegin", 1, true) == nil
		end,
		"per-frame code without debug.profilebegin labels: it shows as one anonymous block in the MicroProfiler",
	},
}

function PerfAudit.all(root)
	local out = { findings = {}, byRule = {} }
	local ws = root:FindFirstChildOfClass("Workspace")
	local counts = {
		workspaceInstances = 0,
		baseParts = 0,
		meshParts = 0,
		unions = 0,
		unanchored = 0,
		transparent = 0,
		decalsTextures = 0,
		emitters = 0,
		lightsWithShadows = 0,
		smallShadowCasters = 0,
		npcHumanoids = 0,
		surfaceAppearances = 0,
		sounds = 0,
		soundsInSoundService = 0,
		taggedOrAttributedParts = 0,
		persistentModels = 0,
		scripts = 0,
		replicatedStorageInstances = 0,
		replicatedStorageParts = 0,
		replicatedFirstInstances = 0,
	}
	local meshIdsByName: { [string]: { [string]: boolean } } = {}

	if ws then
		for _, d in ws:GetDescendants() do
			counts.workspaceInstances += 1
			if d:IsA("BasePart") then
				counts.baseParts += 1
				local character = inCharacter(d)
				if d:IsA("MeshPart") then
					counts.meshParts += 1
					local id = assetId(d, MESH)
					if id then
						meshIdsByName[d.Name] = meshIdsByName[d.Name] or {}
						meshIdsByName[d.Name][id] = true
					end
				elseif d:IsA("UnionOperation") then
					counts.unions += 1
				end
				if not prop(d, "Anchored", true) and not character then
					counts.unanchored += 1
				end
				local tr = prop(d, "Transparency", 0)
				if tr > 0 and tr < 1 then
					counts.transparent += 1
				end
				if enumName(prop(d, "RenderFidelity", "Automatic")) == "Precise" and not character then
					add(out, "info", "render-fidelity-precise", d, "RenderFidelity Precise: full detail at every distance; Automatic unless it is a hero asset")
				end
				if d:IsA("TriangleMeshPart") and not prop(d, "CanCollide", true) then
					local fid = enumName(prop(d, "CollisionFidelity", "Default"))
					if fid ~= "Box" then
						add(out, "info", "collision-fidelity-decor", d, fid .. " collision on a non-colliding mesh: Box stores the least collision data")
					end
				end
				local size = prop(d, "Size", nil) -- Lune has no Vector3 global: no default object here
				local maxDim = if size then math.max(size.X, size.Y, size.Z) else 4
				if prop(d, "CastShadow", true) and maxDim < 2 and not character then
					counts.smallShadowCasters += 1
				end
				local attrs = 0
				local okA, a = pcall(function()
					return d:GetAttributes()
				end)
				if okA and a then
					for _ in a do
						attrs += 1
					end
				end
				local okT, tags = pcall(function()
					return d:GetTags()
				end)
				if attrs > 0 or (okT and tags and #tags > 0) then
					counts.taggedOrAttributedParts += 1
				end
			elseif d:IsA("Decal") then
				counts.decalsTextures += 1
			elseif d:IsA("ParticleEmitter") or d:IsA("Beam") or d:IsA("Trail") then
				counts.emitters += 1
			elseif d:IsA("Light") then
				if prop(d, "Shadows", false) then
					counts.lightsWithShadows += 1
				end
			elseif d:IsA("Humanoid") then
				counts.npcHumanoids += 1
			elseif d:IsA("SurfaceAppearance") then
				counts.surfaceAppearances += 1
			elseif d:IsA("Sound") then
				counts.sounds += 1
			elseif d:IsA("Model") then
				local mode = enumName(prop(d, "ModelStreamingMode", "Default"))
				if mode == "Persistent" or mode == "PersistentPerPlayer" then
					counts.persistentModels += 1
				end
			end
		end
	end

	local rs = root:FindFirstChildOfClass("ReplicatedStorage")
	if rs then
		for _, d in rs:GetDescendants() do
			counts.replicatedStorageInstances += 1
			if d:IsA("BasePart") then
				counts.replicatedStorageParts += 1
			end
		end
	end
	local rf = root:FindFirstChildOfClass("ReplicatedFirst")
	if rf then
		counts.replicatedFirstInstances = #rf:GetDescendants()
	end
	local ss = root:FindFirstChildOfClass("SoundService")
	if ss then
		for _, d in ss:GetDescendants() do
			if d:IsA("Sound") then
				counts.soundsInSoundService += 1
			end
		end
	end

	-- Scripts anywhere in the tree.
	for _, s in root:GetDescendants() do
		if s:IsA("LuaSourceContainer") then
			counts.scripts += 1
			local ok, src = pcall(function()
				return s.Source
			end)
			if ok and type(src) == "string" and #src > 0 then
				local server = serverSide(s)
				for _, pat in PATTERNS do
					if pat[3](src, server) then
						add(out, pat[2], pat[1], s, pat[4])
					end
				end
			end
		end
	end

	-- Budget lines.
	for name, ids in meshIdsByName do
		local n = 0
		for _ in ids do
			n += 1
		end
		if n > 1 then
			add(out, "warn", "mesh-duplicate-ids", name, string.format("%d MeshIds for MeshParts named %q: identical-looking meshes with different ids do not batch; reuse one id", n, name))
		end
	end
	if counts.workspaceInstances > INSTANCE_BUDGET then
		add(out, "warn", "instances-budget", "Workspace", string.format("%d instances in Workspace: over the 150,000 budget (about 10,000 per second to replicate on join)", counts.workspaceInstances))
	end
	if counts.unanchored > MOVING_NEAR_PLAYER then
		add(out, "warn", "unanchored-many", "Workspace", string.format("%d unanchored parts outside characters: each awake assembly costs physics and about 1 KB/s of bandwidth; anchor what does not need to move", counts.unanchored))
	end
	if counts.emitters > 0 then
		add(out, "info", "emitters", "Workspace", string.format("%d ParticleEmitters, Beams and Trails: about one draw call each in view and not occlusion culled; cull by distance", counts.emitters))
	end
	if counts.transparent > 0 then
		add(out, "info", "partial-transparency", "Workspace", string.format("%d partly transparent parts: they sort back to front and can break batching", counts.transparent))
	end
	if counts.smallShadowCasters > 100 then
		add(out, "info", "small-shadow-casters", "Workspace", string.format("%d parts under 2 studs cast shadows: CastShadow false on small parts", counts.smallShadowCasters))
	end
	if counts.npcHumanoids > 0 then
		add(out, "info", "npc-humanoids", "Workspace", string.format("%d Humanoids in the saved Workspace: static NPCs need only an AnimationController; moving ones need unused states disabled", counts.npcHumanoids))
	end
	if counts.soundsInSoundService > 0 then
		add(out, "info", "sounds-resident", "SoundService", string.format("%d Sound instances in SoundService: loaded audio stays resident; create on demand or AudioPlayer.AutoLoad false", counts.soundsInSoundService))
	end
	if counts.taggedOrAttributedParts > 1000 then
		add(out, "warn", "tags-attributes-replicate", "Workspace", string.format("%d parts carry tags or attributes: they replicate to every client; keep server-only data in Luau tables", counts.taggedOrAttributedParts))
	end
	if counts.replicatedStorageParts > 1000 then
		add(out, "warn", "replicated-heavy", "ReplicatedStorage", string.format("%d parts in ReplicatedStorage download to every client: keep maps and heavy assets in ServerStorage", counts.replicatedStorageParts))
	end

	local settings = {}
	if ws then
		for _, name in { "StreamingEnabled", "StreamingMinRadius", "StreamingTargetRadius", "ModelStreamingBehavior",
			"StreamingIntegrityMode", "PlayerCharacterDestroyBehavior", "PhysicsSteppingMethod", "ClientAnimatorThrottling" } do
			local ok, v = pcall(function()
				return ws[name]
			end)
			settings[name] = if ok then (if typeof(v) == "EnumItem" then v.Name else v) else "unreadable"
		end
	end

	local tally = { error = 0, warn = 0, info = 0 }
	for rule, n in out.byRule do
		local sev = "info"
		for _, f in out.findings do
			if f.rule == rule then
				sev = f.severity
				break
			end
		end
		tally[sev] += n
	end
	return {
		counts = counts,
		budget = {
			partMemoryMbEstimate = math.floor(counts.baseParts * PART_KB / 1024 * 10 + 0.5) / 10,
			joinSecondsEstimate = math.floor(counts.workspaceInstances / 10000 * 10 + 0.5) / 10,
		},
		settings = settings,
		findings = out.findings,
		byRule = out.byRule,
		tally = tally,
	}
end

-- PerfAudit.assets(game, top): client memory composition, draw groups, images per object, LevelOfDetail,
-- audio loading and rig counts. Static: no pixel sizes (not stored in the place) and no view, so draw groups
-- are an upper bound on what one view draws, before streaming and LOD.
--   composition  per container: side ("client" or "server"), instances, parts, meshParts, partMemoryMbEstimate
--   drawGroups   MeshParts keyed by mesh, material, MaterialVariant and image set; other parts keyed by class,
--                shape and material; groups, singleton groups, meshes split into several looks, top groups
--   images       distinct image ids, references, images per object (top), most shared ids
--   lod          Models by LevelOfDetail; audio: AutoLoad players, Sounds; rigs: Humanoids, static Humanoids,
--                AnimationControllers, Animators, models with skinned MeshParts and no Humanoid
local CLIENT_CONTAINERS = { "ReplicatedFirst", "ReplicatedStorage", "Workspace", "StarterGui", "StarterPack",
	"StarterPlayer", "Lighting", "SoundService", "MaterialService" }
local SERVER_CONTAINERS = { "ServerStorage", "ServerScriptService" }
local REPLICATED_FIRST_MAX = 500 -- [added] ReplicatedFirst should hold the loading screen, little else
local STREAMING_MESH_RADIUS = 1000 -- Roblox Learn: StreamingMesh needs a target radius of at least 1,000 studs

local function topN(list, n, field)
	table.sort(list, function(a, b)
		return a[field] > b[field]
	end)
	local out = {}
	for i = 1, math.min(n, #list) do
		out[i] = list[i]
	end
	return out
end

function PerfAudit.assets(root, top)
	top = top or 10
	local out = { findings = {}, byRule = {} }

	-- 1. What every client downloads, and what stays on the server.
	local composition = { clientInstances = 0, clientParts = 0, serverOnlyInstances = 0, serverOnlyParts = 0 }
	local function tallyContainer(name, side)
		local svc = root:FindFirstChildOfClass(name)
		if not svc then
			return
		end
		local c = { side = side, instances = 0, parts = 0, meshParts = 0 }
		for _, d in svc:GetDescendants() do
			c.instances += 1
			if d:IsA("BasePart") then
				c.parts += 1
				if d:IsA("MeshPart") then
					c.meshParts += 1
				end
			end
		end
		c.partMemoryMbEstimate = math.floor(c.parts * PART_KB / 1024 * 10 + 0.5) / 10
		composition[name] = c
		if side == "client" then
			composition.clientInstances += c.instances
			composition.clientParts += c.parts
		else
			composition.serverOnlyInstances += c.instances
			composition.serverOnlyParts += c.parts
		end
	end
	for _, name in CLIENT_CONTAINERS do
		tallyContainer(name, "client")
	end
	for _, name in SERVER_CONTAINERS do
		tallyContainer(name, "server")
	end
	local rf = composition.ReplicatedFirst
	if rf and (rf.instances > REPLICATED_FIRST_MAX or rf.parts > 0) then
		add(out, "info", "replicated-first-heavy", "ReplicatedFirst", string.format("%d instances and %d parts in ReplicatedFirst load before anything else: keep it to the loading screen", rf.instances, rf.parts))
	end

	-- 2. Draw groups and images.
	local groups, looksByMesh = {}, {}
	local partGroups, nPartGroups, unions, decals = {}, 0, 0, 0
	local rigs = { humanoids = 0, staticHumanoids = 0, animationControllers = 0, animators = 0, skinnedModelsNoHumanoid = 0 }
	local lod = {}
	local audio = { audioPlayers = 0, autoLoadPlayers = 0, sounds = 0 }
	local ws = root:FindFirstChildOfClass("Workspace")
	local function imageSet(part)
		local ids = {}
		local t = assetId(part, { "TextureContent", "TextureID" })
		if t then
			table.insert(ids, t)
		end
		local sa = part:FindFirstChildOfClass("SurfaceAppearance")
		if sa then
			for _, names in SA_MAPS do
				local id = assetId(sa, names)
				if id then
					table.insert(ids, id)
				end
			end
		end
		return table.concat(ids, "+"), #ids
	end
	local skinnedModels = {}
	for _, d in (if ws then ws:GetDescendants() else {}) do
		if d:IsA("MeshPart") then
			local mesh = assetId(d, MESH) or "(no mesh id)"
			local material = enumName(prop(d, "Material", "Plastic"))
			local variant = tostring(prop(d, "MaterialVariant", ""))
			local images, nImages = imageSet(d)
			local key = table.concat({ mesh, material, variant, images }, "|")
			local g = groups[key]
			if not g then
				g = { mesh = mesh, material = material, variant = variant, images = nImages, count = 0, example = d:GetFullName() }
				groups[key] = g
				looksByMesh[mesh] = (looksByMesh[mesh] or 0) + 1
			end
			g.count += 1
			if d:FindFirstChildWhichIsA("Bone", true) then
				local m = d:FindFirstAncestorOfClass("Model")
				if m then
					skinnedModels[m] = true
				end
			end
		elseif d:IsA("UnionOperation") then
			unions += 1
		elseif d:IsA("BasePart") then
			local key = table.concat({ d.ClassName, enumName(prop(d, "Shape", "Block")), enumName(prop(d, "Material", "Plastic")),
				tostring(prop(d, "MaterialVariant", "")) }, "|")
			if not partGroups[key] then
				partGroups[key] = 0
				nPartGroups += 1
			end
			partGroups[key] += 1
		elseif d:IsA("Decal") then
			decals += 1
		elseif d:IsA("Humanoid") then
			rigs.humanoids += 1
			local m = d.Parent
			local rootPart = m and (m:FindFirstChild("HumanoidRootPart") or (m:IsA("Model") and m.PrimaryPart))
			if rootPart and rootPart:IsA("BasePart") and prop(rootPart, "Anchored", false) then
				rigs.staticHumanoids += 1
				add(out, "info", "humanoid-static", m, "anchored rig with a Humanoid: a static NPC needs only an AnimationController and an Animator")
			end
		elseif d:IsA("AnimationController") then
			rigs.animationControllers += 1
		elseif d:IsA("Animator") then
			rigs.animators += 1
		elseif d:IsA("Model") then
			local level = enumName(prop(d, "LevelOfDetail", "Automatic"))
			lod[level] = (lod[level] or 0) + 1
		end
	end
	for m in skinnedModels do
		if not m:FindFirstChildWhichIsA("Humanoid", true) then
			rigs.skinnedModelsNoHumanoid += 1
			add(out, "info", "skinned-no-humanoid", m, "skinned MeshParts in a Model without a Humanoid: if it moves, read updateInvalidatedFastClusters before and after adding a Humanoid")
		end
	end

	local list, singletons, splitMeshes = {}, 0, 0
	for _, g in groups do
		table.insert(list, g)
		if g.count == 1 then
			singletons += 1
		end
	end
	for mesh, looks in looksByMesh do
		if looks > 1 then
			splitMeshes += 1
			add(out, "info", "mesh-several-looks", mesh, string.format("one mesh under %d material or image sets: each set draws apart", looks))
		end
	end
	if #list >= 20 and singletons * 2 > #list then
		add(out, "warn", "mesh-singletons", "Workspace", string.format("%d of %d MeshPart groups hold one part: reuse a few meshes and vary color, size and rotation", singletons, #list))
	end

	-- Images anywhere in the tree; per object, the distinct ids it keeps in memory.
	local refs, perObject, nRefs = {}, {}, 0
	for _, d in root:GetDescendants() do
		local spec = IMAGE_PROPS[d.ClassName]
		if spec then
			local owner = if (d:IsA("SurfaceAppearance") or d:IsA("Decal")) and d.Parent then d.Parent else d
			local key = owner:GetFullName()
			for _, names in spec do
				local id = assetId(d, names)
				if id then
					nRefs += 1
					refs[id] = (refs[id] or 0) + 1
					perObject[key] = perObject[key] or {}
					perObject[key][id] = true
				end
			end
		end
		if d:IsA("AudioPlayer") then
			audio.audioPlayers += 1
			if prop(d, "AutoLoad", true) then
				audio.autoLoadPlayers += 1
			end
		elseif d:IsA("Sound") then
			audio.sounds += 1
		end
	end
	local idList, objList = {}, {}
	for id, n in refs do
		table.insert(idList, { id = id, refs = n })
	end
	for path, ids in perObject do
		local n = 0
		for _ in ids do
			n += 1
		end
		table.insert(objList, { path = path, images = n })
	end
	if audio.autoLoadPlayers > 0 then
		add(out, "info", "audio-autoload", "AudioPlayer", string.format("%d AudioPlayers with AutoLoad true load at start: set it false for audio not needed at spawn", audio.autoLoadPlayers))
	end

	local radius = if ws then prop(ws, "StreamingTargetRadius", nil) else nil
	if (lod.StreamingMesh or 0) > 0 and type(radius) == "number" and radius < STREAMING_MESH_RADIUS then
		add(out, "warn", "lod-streamingmesh-radius", "Workspace", string.format("%d StreamingMesh models with StreamingTargetRadius %d: use 1,000 or more, or SLIM", lod.StreamingMesh, radius))
	end

	local severity, tally = {}, { error = 0, warn = 0, info = 0 }
	for _, f in out.findings do
		severity[f.rule] = f.severity
	end
	for rule, n in out.byRule do
		tally[severity[rule] or "info"] += n
	end
	return {
		composition = composition,
		drawGroups = {
			meshGroups = #list,
			singletonGroups = singletons,
			meshesWithSeveralLooks = splitMeshes,
			partGroups = nPartGroups,
			unions = unions,
			decalsTextures = decals,
			top = topN(list, top, "count"),
		},
		images = {
			distinct = #idList,
			references = nRefs,
			objects = #objList,
			topObjects = topN(objList, top, "images"),
			mostShared = topN(idList, top, "refs"),
			pixelSizes = "not stored in the place: read them in Studio (memory-and-crowds.md, M2)",
		},
		lod = lod,
		audio = audio,
		rigs = rigs,
		findings = out.findings,
		byRule = out.byRule,
		tally = tally,
	}
end

return PerfAudit
