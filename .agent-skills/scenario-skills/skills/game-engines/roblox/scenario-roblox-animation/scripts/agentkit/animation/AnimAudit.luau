--!nonstrict
-- AgentKit AnimAudit: static findings for animation code and rigs.
-- source() is pure string work and runs in Lune; scripts(), rigs() and all() need Studio (or a
-- Lune place tree for rigs).
--
--   AnimAudit.source(src, path)   findings for one script's source
--   AnimAudit.scripts(root)       source() over every LuaSourceContainer under root
--   AnimAudit.rigs(root)          rig findings (Animator, joints, IKControl, leftovers, previews)
--   AnimAudit.all(game)           {findings, tally = {error, warn, info}}
-- A finding is {severity, rule, path, message}.

local AnimAudit = {}

local function add(out, severity, rule, path, message)
	table.insert(out, { severity = severity, rule = rule, path = path, message = message })
end

-- Comments are stripped so that documentation text does not trigger code rules.
local function code(src)
	local s = src:gsub("%-%-%[(=*)%[.-%]%1%]", ""):gsub("%-%-[^\n]*", "")
	return s
end

local function lineOf(src, pos)
	local _, n = src:sub(1, pos):gsub("\n", "")
	return n + 1
end

local RULES = {
	{
		"error",
		"humanoid-loadanimation",
		"[Hh]umanoid[%w_]*%s*:%s*LoadAnimation%s*%(",
		"Humanoid:LoadAnimation is deprecated: use Animator:LoadAnimation (Animator created on the server)",
	},
	{
		"error",
		"controller-loadanimation",
		"AnimationController[%w_]*%s*:%s*LoadAnimation%s*%(",
		"AnimationController:LoadAnimation is deprecated: load through its child Animator",
	},
	{
		"warn",
		"keyframe-reached",
		"KeyframeReached",
		"KeyframeReached needs named keyframes: use GetMarkerReachedSignal with KeyframeMarkers",
	},
	{
		"warn",
		"motor6d-only",
		"OfClass%s*%(%s*[\"']Motor6D[\"']",
		"R15 avatars spawn with AnimationConstraint joints: accept both classes (AnimRig.joint)",
	},
	{
		"warn",
		"motor6d-only",
		"IsA%s*%(%s*[\"']Motor6D[\"']",
		'AnimationConstraint:IsA("Motor6D") is false: accept both classes',
	},
	{
		"error",
		"temp-animation-id",
		"active://",
		"active:// ids exist only in this Studio session: upload the clip and use rbxassetid://",
	},
	{
		"error",
		"temp-animation-id",
		"AnimationId%s*=%s*[\"']%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x%x[\"']",
		"a 32-hex AnimationId is a RegisterKeyframeSequence hash: Studio only, upload the clip",
	},
	{
		"warn",
		"register-in-game",
		":%s*Register%a*KeyframeSequence%s*%(",
		"RegisterKeyframeSequence ids work in Studio only: never ship it in game code",
	},
	{
		"warn",
		"register-in-game",
		":%s*Register%a*AnimationClip%s*%(",
		"RegisterAnimationClip ids work in Studio only: never ship it in game code",
	},
}

-- Ability modules run inside the engine's simulation step on client and server.
local ABILITY_RULES = {
	{ "error", "ability-yield", "task%.wait%s*%(", "ability callbacks must never yield" },
	{ "error", "ability-yield", "WaitForChild%s*%(", "ability callbacks must never yield" },
	{ "error", "ability-yield", "[^%w_%.]wait%s*%(", "ability callbacks must never yield" },
	{
		"error",
		"ability-destroy",
		":%s*Destroy%s*%(",
		"Destroy is restricted in simulation callbacks: set an attribute and react elsewhere",
	},
	{ "warn", "ability-random", "math%.random", "callbacks must be deterministic on client and server" },
	{ "warn", "ability-random", "Random%.new", "callbacks must be deterministic on client and server" },
	{
		"error",
		"ability-input-in-rule",
		"RunsWhile%s*=[^\n]*Input",
		"input never goes in RunsWhile: use Input.Mode or OutlivesInputWhile",
	},
	{
		"error",
		"ability-input-in-rule",
		"StartsWhen%s*=[^\n]*Input",
		"input never goes in StartsWhen: the Input field adds it",
	},
}

function AnimAudit.source(src, path, opts)
	opts = opts or {}
	local out = {}
	local c = code(src)
	for _, r in RULES do
		local pos = c:find(r[3])
		if pos then
			add(out, r[1], r[2], path .. ":" .. lineOf(c, pos), r[4])
		end
	end
	-- C0/C1 writes on R15 joint names: read-only once the avatar uses AnimationConstraint.
	for pos, line in c:gmatch("()([^\n]*%.C[01]%s*=[^=][^\n]*)") do
		if
			line:find("Neck")
			or line:find("Waist")
			or line:find("Shoulder")
			or line:find("Hip")
			or line:find("Root")
			or line:find("Elbow")
			or line:find("Wrist")
			or line:find("Knee")
			or line:find("Ankle")
		then
			add(
				out,
				"warn",
				"c0-write",
				path .. ":" .. lineOf(c, pos),
				"C0 and C1 are read-only on AnimationConstraint: multiply into Transform in PreSimulation"
			)
			break
		end
	end
	if c:find("TweenService") and c:find("FaceControls") then
		add(
			out,
			"warn",
			"face-tween",
			path,
			"FaceControls values written once or tweened revert to the animated value: write them every PreSimulation or play a face clip"
		)
	end
	local isAbility = c:find("AbilityDefinition") or c:find("OnUpdate") and c:find("@rbx/AvatarAbilities")
	if isAbility then
		for _, r in ABILITY_RULES do
			local pos = c:find(r[3])
			if pos then
				add(out, r[1], r[2], path .. ":" .. lineOf(c, pos), r[4])
			end
		end
		for pos, field in c:gmatch("()abilityCtx%.([%a_][%w_]*)%s*=[^=]") do
			if field ~= "State" and field ~= "Local" then
				add(
					out,
					"error",
					"ability-ctx-field",
					path .. ":" .. lineOf(c, pos),
					"custom data goes in abilityCtx.State or abilityCtx.Local, never on abilityCtx"
				)
				break
			end
		end
	end
	if opts.client and c:find("@rbx/AvatarAbilities", 1, true) then
		add(
			out,
			"warn",
			"ccl-client-require",
			path,
			'require("@rbx/AvatarAbilities") yields forever on the client while the CCL is off'
		)
	end
	return out
end

local function isClient(s)
	if s:IsA("LocalScript") then
		return true
	end
	return s:IsA("Script") and s.RunContext == Enum.RunContext.Client
end

function AnimAudit.scripts(root)
	local out = {}
	for _, s in root:GetDescendants() do
		if s:IsA("LuaSourceContainer") then
			local ok, src = pcall(function()
				return s.Source
			end)
			if ok and src then
				for _, f in AnimAudit.source(src, s:GetFullName(), { client = isClient(s) }) do
					table.insert(out, f)
				end
			end
		end
	end
	return out
end

local function isIdentity(cf)
	local c = { cf:GetComponents() }
	local ident = { 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }
	for i = 1, 12 do
		if math.abs(c[i] - ident[i]) > 1e-4 then
			return false
		end
	end
	return true
end

-- Lune knows only the property values saved in a file: unset ones raise, so read with a default.
local function prop(d, name, default)
	local ok, v = pcall(function()
		return d[name]
	end)
	if ok then
		return v
	end
	return default
end

function AnimAudit.rigs(root, opts)
	opts = opts or {}
	local out = {}
	for _, d in root:GetDescendants() do
		local path = d:GetFullName()
		if d:IsA("Humanoid") or d:IsA("AnimationController") then
			if not d:FindFirstChildOfClass("Animator") then
				add(out, "warn", "no-animator", path, "no Animator child: create it on the server so tracks replicate")
			end
		elseif d:IsA("IKControl") then
			for _, name in { "EndEffector", "Target", "ChainRoot" } do
				if prop(d, name, nil) == nil then
					add(out, "error", "ik-incomplete", path, "IKControl." .. name .. " is nil")
				end
			end
			if prop(d, "Type", nil) == Enum.IKControlType.LookAt and prop(d, "Weight", 1) >= 1 then
				add(out, "info", "ik-lookat-weight", path, "LookAt Weight 1 twists when the target is behind: 0.999")
			end
			local t = prop(d, "Target", nil)
			local part = t and (t:IsA("BasePart") and t or t.Parent)
			if
				part
				and part:IsA("BasePart")
				and (prop(part, "CanCollide", true) or prop(part, "CanQuery", true) or prop(part, "CanTouch", true))
			then
				add(out, "warn", "ik-target-collides", path, "IK target part should not collide, query or touch")
			end
		elseif (d.Name == "AnimSaves" or d.Name == "InitialPoses") and d.Parent and d.Parent:IsA("Model") then
			-- any class: an ObjectValue or a Folder, depending on the tool that saved the clips
			add(
				out,
				"warn",
				"editor-metadata",
				path,
				"Animation Editor data in a rig replicates with every clone: move it out"
			)
		elseif d.Name == "RBX_MICROBONE_NODES" and d.Parent and d.Parent:IsA("Workspace") then
			add(out, "info", "import-leftover", path, "folder created by the FBX animation import: remove after import")
		elseif
			(d:IsA("KeyframeSequence") or d:IsA("CurveAnimation")) and not d:FindFirstAncestorOfClass("ServerStorage")
		then
			add(
				out,
				"warn",
				"clip-in-world",
				path,
				"authoring data outside ServerStorage replicates: publish it and keep only the id"
			)
		elseif d:IsA("Animation") then
			local id = prop(d, "AnimationId", "")
			if id == "" then
				add(out, "error", "empty-animation-id", path, "Animation with no AnimationId")
			elseif id:find("active://", 1, true) or id:match("^%x+$") and #id == 32 then
				add(out, "error", "temp-animation-id", path, "temporary Studio id: upload the clip for live servers")
			end
		elseif (d:IsA("Motor6D") or d:IsA("AnimationConstraint") or d:IsA("Bone")) and opts.edit then
			if not isIdentity(prop(d, "Transform", CFrame.new())) then
				add(out, "warn", "posed-in-edit", path, "Transform left by a preview: AnimRig.reset before saving")
			end
		end
	end
	return out
end

function AnimAudit.all(dm, opts)
	opts = opts or {}
	local findings = {}
	for _, f in AnimAudit.scripts(dm) do
		table.insert(findings, f)
	end
	for _, f in AnimAudit.rigs(dm, opts) do
		table.insert(findings, f)
	end
	local tally = { error = 0, warn = 0, info = 0 }
	for _, f in findings do
		tally[f.severity] += 1
	end
	return { findings = findings, tally = tally }
end

return AnimAudit
