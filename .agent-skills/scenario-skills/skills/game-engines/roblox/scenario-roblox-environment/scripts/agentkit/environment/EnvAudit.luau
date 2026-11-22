--!nonstrict
-- AgentKit environment/EnvAudit: environment checks the lead's Audit does not make.
-- Studio: rbx_environment.run(s, "return EnvAudit.all(game)", kit=["EnvAudit"]) in the Edit data model.
-- Offline: lune run lune_env_audit.luau place.rbxl (Lune sees saved properties, including the
-- not-scriptable streaming settings that Studio scripts cannot read).
--
--   EnvAudit.all(root)  {counts, streaming, findings = {{severity, rule, path, message}}, tally}
--   EnvAudit.materials(root), EnvAudit.lighting(root), EnvAudit.geometry(root), EnvAudit.streaming(root)
--
-- Severities: "error" (broken), "warn" (likely wrong or costly), "info" (worth a look).

local EnvAudit = {}

local MAX_PER_RULE = 12
EnvAudit.FAR = 10000 -- [added] studs from the origin before precision drift is worth a look
EnvAudit.CSG_TRIANGLES = 20000 -- solid modeling doc: results above this are simplified or fail
EnvAudit.LIGHT_RANGE_MAX = 120
EnvAudit.STREAMING = { -- streaming doc, recommended baseline
	StreamingMinRadius = 64,
	StreamingTargetRadius = 1024,
	StreamingIntegrityMode = "PauseOutsideLoadedArea",
	StreamOutBehavior = "Opportunistic",
	ModelStreamingBehavior = "Improved",
}
EnvAudit.TERRAIN_MATERIALS = {
	"Grass",
	"LeafyGrass",
	"Ground",
	"Mud",
	"Sand",
	"Sandstone",
	"Rock",
	"Basalt",
	"Slate",
	"Limestone",
	"Pavement",
	"Cobblestone",
	"Brick",
	"Concrete",
	"Asphalt",
	"Snow",
	"Glacier",
	"Ice",
	"Salt",
	"CrackedLava",
	"WoodPlanks",
}

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
	return v
end

local function add(out, severity, rule, inst, message)
	out.byRule = out.byRule or {}
	local n = (out.byRule[rule] or 0) + 1
	out.byRule[rule] = n
	if n <= MAX_PER_RULE then
		table.insert(out, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
		})
	end
end

local function variantsByName(root)
	local ms = root:FindFirstChildOfClass("MaterialService")
	local by = {}
	if not ms then
		return by
	end
	for _, v in ms:GetDescendants() do
		if v:IsA("MaterialVariant") then
			by[v.Name] = by[v.Name] or {}
			table.insert(by[v.Name], v)
		end
	end
	return by, ms
end

function EnvAudit.materials(root)
	local out = {}
	local by, ms = variantsByName(root)
	for name, list in by do
		local seen = {}
		for _, v in list do
			local base = enumName(prop(v, "BaseMaterial", "?"))
			if seen[base] then
				add(
					out,
					"warn",
					"variant-duplicate-name",
					v,
					"two MaterialVariants named " .. name .. " for " .. tostring(base) .. ": the link is ambiguous"
				)
			end
			seen[base] = true
		end
	end
	local ws = root:FindFirstChildOfClass("Workspace")
	for _, p in (ws and ws:GetDescendants() or {}) do
		if not p:IsA("BasePart") then
			continue
		end
		local vname = prop(p, "MaterialVariant", "")
		if vname ~= "" then
			local ok = false
			for _, v in by[vname] or {} do
				if enumName(prop(v, "BaseMaterial")) == enumName(prop(p, "Material")) then
					ok = true
				end
			end
			if not ok then
				add(
					out,
					"error",
					"variant-missing",
					p,
					string.format(
						"MaterialVariant %q not found for %s (renamed, deleted or wrong BaseMaterial): the part shows the plain material",
						vname,
						tostring(enumName(prop(p, "Material")))
					)
				)
			end
			if p:IsA("MeshPart") and p:FindFirstChildOfClass("SurfaceAppearance") then
				add(
					out,
					"info",
					"surfaceappearance-and-variant",
					p,
					"SurfaceAppearance maps win; only the variant's physics apply"
				)
			end
		end
	end
	-- Overrides: GetBaseMaterialOverride in Studio; the <Material>Name properties in a file (Lune).
	if ms then
		for _, mat in EnvAudit.TERRAIN_MATERIALS do
			local name
			local okGet, v = pcall(function()
				return ms:GetBaseMaterialOverride(Enum.Material[mat])
			end)
			if okGet then
				name = v
			else
				name = prop(ms, mat .. "Name", nil)
			end
			if name and name ~= "" and name ~= mat then
				local found = false
				for _, cand in by[name] or {} do
					if enumName(prop(cand, "BaseMaterial")) == mat then
						found = true
					end
				end
				if not found then
					add(
						out,
						"error",
						"override-missing",
						ms,
						string.format("%s is overridden by %q, which is not a %s MaterialVariant", mat, name, mat)
					)
				end
			end
		end
	end
	return out
end

function EnvAudit.lighting(root)
	local out = {}
	local L = root:FindFirstChildOfClass("Lighting")
	local ws = root:FindFirstChildOfClass("Workspace")
	if L then
		local atm, sky = 0, 0
		for _, c in L:GetChildren() do
			if c:IsA("Atmosphere") then
				atm += 1
			elseif c:IsA("Sky") then
				sky += 1
			elseif c:IsA("BlurEffect") and prop(c, "Enabled", true) then
				add(out, "info", "blur-always-on", c, "a BlurEffect under Lighting blurs every frame for everyone")
			end
		end
		if atm > 1 then
			add(out, "warn", "multiple-atmosphere", L, atm .. " Atmosphere objects: only one is used")
		end
		if sky > 1 then
			add(out, "warn", "multiple-sky", L, sky .. " Sky objects: only one is used")
		end
		if atm > 0 and prop(L, "FogEnd", 100000) < 100000 then
			add(
				out,
				"info",
				"fog-hidden-by-atmosphere",
				L,
				"FogEnd is set but fog properties are ignored while an Atmosphere exists"
			)
		end
	end
	local shadowLights, lights = 0, 0
	for _, d in (ws and ws:GetDescendants() or {}) do
		if d:IsA("Light") then
			lights += 1
			if d.Name == d.ClassName then
				add(
					out,
					"warn",
					"light-unnamed",
					d,
					"name every light (" .. d.ClassName .. "): many identical names make tuning by hand slow"
				)
			end
			if prop(d, "Shadows", false) then
				shadowLights += 1
			end
			local range = prop(d, "Range", nil)
			if range and range >= EnvAudit.LIGHT_RANGE_MAX then
				add(
					out,
					"info",
					"light-range-cap",
					d,
					"Range is at the 120-stud cap; a second, farther light reaches further"
				)
			end
		elseif d:IsA("BasePart") then
			local transparent = prop(d, "Transparency", 0)
			local glass = enumName(prop(d, "Material", "")) == "Glass"
			if
				(glass or (transparent > 0.05 and transparent < 0.95))
				and prop(d, "CastShadow", true)
				and transparent > 0
			then
				add(
					out,
					"warn",
					"glass-casts-shadow",
					d,
					"a see-through part that casts shadows blocks the sun shaft behind it: CastShadow false"
				)
			end
		end
	end
	out.lights = lights
	out.shadowLights = shadowLights
	return out
end

function EnvAudit.geometry(root)
	local out = {}
	local ws = root:FindFirstChildOfClass("Workspace")
	local unions, triangles = 0, 0
	for _, p in (ws and ws:GetDescendants() or {}) do
		if not p:IsA("BasePart") then
			continue
		end
		local cf = prop(p, "CFrame", nil) -- Lune knows only the saved CFrame, not Position
		local pos = cf and cf.Position
		if pos and pos.Magnitude > EnvAudit.FAR then
			add(
				out,
				"info",
				"far-from-origin",
				p,
				string.format("%.0f studs from the origin: build near the origin", pos.Magnitude)
			)
		end
		if p:IsA("UnionOperation") then
			unions += 1
			local tri = prop(p, "TriangleCount", nil)
			if tri then
				triangles += tri
				if tri > EnvAudit.CSG_TRIANGLES then
					add(
						out,
						"warn",
						"union-triangles",
						p,
						tri .. " triangles: above the CSG limit, rebuild from parts or a mesh"
					)
				end
			end
			local fid = enumName(prop(p, "CollisionFidelity", nil))
			if (fid == "Hull" or fid == "Box") and p:GetAttribute("Opening") then
				add(
					out,
					"error",
					"opening-filled",
					p,
					fid .. " collision fills the opening of this union: use Default or build the opening from parts"
				)
			end
		end
		if p:GetAttribute("GrayboxRole") == "landmark" and enumName(prop(p, "Material", "")) == "SmoothPlastic" then
			add(out, "info", "graybox-placeholder", p, "landmark placeholder still in place")
		end
	end
	out.unions = unions
	out.unionTriangles = triangles
	return out
end

function EnvAudit.streaming(root)
	local out = {}
	local ws = root:FindFirstChildOfClass("Workspace")
	if not ws then
		return out
	end
	local settings = { StreamingEnabled = prop(ws, "StreamingEnabled", nil) }
	local unreadable = 0
	for name, want in EnvAudit.STREAMING do
		local v = enumName(prop(ws, name, nil))
		settings[name] = v
		if v == nil then
			unreadable += 1
		elseif settings.StreamingEnabled and v ~= want then
			add(
				out,
				"info",
				"streaming-baseline",
				ws,
				string.format("%s is %s; the streaming guide recommends %s", name, tostring(v), tostring(want))
			)
		end
	end
	settings.readable = unreadable == 0
	local radius = settings.StreamingTargetRadius
	for _, m in ws:GetDescendants() do
		if not m:IsA("Model") then
			continue
		end
		local mode = enumName(prop(m, "ModelStreamingMode", nil))
		local lod = enumName(prop(m, "LevelOfDetail", nil))
		if mode == "Persistent" or mode == "PersistentPerPlayer" then
			add(out, "info", "persistent-model", m, mode .. ": stays in memory for the whole session")
			local a = m.Parent
			while a and a ~= ws do
				if a:IsA("Model") and enumName(prop(a, "ModelStreamingMode", nil)) == "Atomic" then
					add(
						out,
						"warn",
						"persistent-in-atomic",
						m,
						"a persistent model inside an Atomic model makes the Atomic model persistent"
					)
					break
				end
				a = a.Parent
			end
		end
		if
			lod == "SLIM"
			and (m:FindFirstChildWhichIsA("Humanoid", true) or m:FindFirstChildWhichIsA("AnimationController", true))
		then
			add(out, "warn", "slim-animated", m, "SLIM level of detail is for static models; this one animates")
		end
		if lod == "StreamingMesh" and radius and radius < 1000 then
			add(
				out,
				"warn",
				"streamingmesh-radius",
				m,
				"StreamingMesh with StreamingTargetRadius "
					.. radius
					.. ": impostors appear only past about 1,000 studs; prefer SLIM"
			)
		end
	end
	out.settings = settings
	return out
end

function EnvAudit.counts(root)
	local ws = root:FindFirstChildOfClass("Workspace")
	local c = { parts = 0, meshParts = 0, unions = 0, lights = 0, models = 0, variants = 0 }
	for _, d in (ws and ws:GetDescendants() or {}) do
		if d:IsA("MeshPart") then
			c.meshParts += 1
		elseif d:IsA("UnionOperation") then
			c.unions += 1
		elseif d:IsA("BasePart") then
			c.parts += 1
		elseif d:IsA("Light") then
			c.lights += 1
		elseif d:IsA("Model") then
			c.models += 1
		end
	end
	local ms = root:FindFirstChildOfClass("MaterialService")
	for _, d in (ms and ms:GetDescendants() or {}) do
		if d:IsA("MaterialVariant") then
			c.variants += 1
		end
	end
	return c
end

function EnvAudit.all(root)
	local r = {
		counts = EnvAudit.counts(root),
		materials = EnvAudit.materials(root),
		lighting = EnvAudit.lighting(root),
		geometry = EnvAudit.geometry(root),
		streaming = EnvAudit.streaming(root),
	}
	local findings, tally = {}, { error = 0, warn = 0, info = 0 }
	for _, area in { "materials", "lighting", "geometry", "streaming" } do
		for _, f in ipairs(r[area]) do
			table.insert(findings, f)
			tally[f.severity] += 1
		end
	end
	return {
		counts = r.counts,
		lights = { total = r.lighting.lights, withShadows = r.lighting.shadowLights },
		unions = { count = r.geometry.unions, triangles = r.geometry.unionTriangles },
		streaming = r.streaming.settings,
		findings = findings,
		tally = tally,
	}
end

return EnvAudit
