--!nonstrict
-- GameplayAudit: static gameplay findings on an instance tree (Studio Edit data model or a place
-- file in Lune). Complements the lead's Audit (deprecated APIs) with constraint, hitbox, pathfinding
-- and combat rules. Every property read goes through pcall with a default (Lune knows saved values only).
--
--   local r = GameplayAudit.run(game)    -- {findings = {{severity, rule, path, message}}, tally, counts}
--   GameplayAudit.runtime(folder)        -- playtest Server: client-owned NPC roots

local GameplayAudit = {}

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function add(out, severity, rule, inst, message)
	table.insert(out, {
		severity = severity,
		rule = rule,
		path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
		message = message,
		area = "gameplay",
	})
end

-- Constraints that need both attachments.
local TWO = {
	SpringConstraint = true,
	CylindricalConstraint = true,
	HingeConstraint = true,
	PrismaticConstraint = true,
	BallSocketConstraint = true,
	RopeConstraint = true,
	RodConstraint = true,
	LineForce = true,
	PlaneConstraint = true,
	UniversalConstraint = true,
	TorsionSpringConstraint = true,
}
local LEGACY = {
	BodyVelocity = true,
	BodyGyro = true,
	BodyPosition = true,
	BodyAngularVelocity = true,
	BodyForce = true,
	BodyThrust = true,
	RocketPropulsion = true,
}
local DEBUG_NAMES = { "hitbox", "tracer", "debug", "visual", "waypoint", "marker" }

local function looksDebug(inst)
	local n = string.lower(inst.Name)
	local parent = inst.Parent
	local pn = if parent then string.lower(parent.Name) else ""
	for _, k in ipairs(DEBUG_NAMES) do
		if string.find(n, k, 1, true) or string.find(pn, k, 1, true) then
			return true
		end
	end
	return false
end

-- Script source rules: Lua patterns per line, comments stripped.
GameplayAudit.SOURCE_RULES = {
	{ "FilterDescendantsInstances", "info", "filter-descendants", "superseded: RaycastParams/OverlapParams ExcludeInstances or IncludeInstances" },
	{ "%.FilterType%s*=", "info", "filter-type", "superseded: set ExcludeInstances or IncludeInstances instead of FilterType" },
	{ "MoveToFinished:Wait%s*%(", "warn", "moveto-wait", "MoveTo gives up after 8 s with reached=false: re-issue MoveTo and handle reached == false" },
	{ "%.Velocity%s*=", "warn", "velocity-write", "BasePart.Velocity is deprecated: AssemblyLinearVelocity or ApplyImpulse" },
	{ "FireServer%s*%(.-[Dd]amage", "warn", "client-damage", "client sends damage: send intent, compute damage on the server" },
	{ "%f[%w_.:]tick%s*%(", "info", "tick", "tick() is unreliable for timing: time() or os.clock()" },
	{ "Region3%.new", "warn", "region3", "Region3 queries are legacy: GetPartBoundsInBox, GetPartBoundsInRadius, GetPartsInPart" },
	{ "FindPartsInRegion3", "warn", "region3", "FindPartsInRegion3 is legacy: GetPartBoundsInBox with OverlapParams" },
	{ "%.Throttle%f[^%w_]", "info", "seat-int", "VehicleSeat.Throttle is -1, 0, 1: ThrottleFloat gives analog gamepad and touch input" },
	{ "%.Steer%f[^%w_]", "info", "seat-int", "VehicleSeat.Steer is -1, 0, 1: SteerFloat gives analog gamepad and touch input" },
	{ "ComputeRawPathAsync", "warn", "legacy-path", "deprecated: PathfindingService:CreatePath then Path:ComputeAsync" },
	{ "FindPathAsync", "warn", "legacy-path", "deprecated: PathfindingService:CreatePath then Path:ComputeAsync" },
}

local function source(s)
	local ok, src = pcall(function()
		return s.Source
	end)
	return if ok and type(src) == "string" then src else nil
end

function GameplayAudit.scripts(root, out)
	out = out or {}
	for _, s in ipairs(root:GetDescendants()) do
		if not s:IsA("LuaSourceContainer") then
			continue
		end
		local src = source(s)
		if not src then
			continue
		end
		local lines = {}
		for line in (src .. "\n"):gmatch("(.-)\n") do
			table.insert(lines, (line:gsub("%-%-.*$", "")))
		end
		local hasTouched, hasDamage = false, false
		for i, code in ipairs(lines) do
			for _, r in ipairs(GameplayAudit.SOURCE_RULES) do
				if code:find(r[1]) then
					add(out, r[2], r[3], s, string.format("line %d: %s", i, r[4]))
				end
			end
			if code:find(":ComputeAsync%s*%(") then
				local ctx = code .. (lines[i - 1] or "") .. (lines[i - 2] or "")
				if not ctx:find("pcall") then
					add(out, "warn", "computeasync-unprotected", s,
						string.format("line %d: ComputeAsync can throw: pcall it and check path.Status == Success", i))
				end
			end
			if code:find("%.Touched") then
				hasTouched = true
			end
			if code:find("TakeDamage") or code:find("%.Health%s*=") then
				hasDamage = true
			end
		end
		if hasTouched and hasDamage then
			add(out, "warn", "touched-damage", s,
				"Touched drives damage: a client-owned part can fake touches; query on the server (spatial query or cast) and validate")
		end
	end
	return out
end

function GameplayAudit.instances(root, out)
	out = out or {}
	local springsByAtt = {}
	local all = root:GetDescendants()
	for _, d in ipairs(all) do
		if d.ClassName == "SpringConstraint" then
			local a0 = prop(d, "Attachment0", nil)
			if a0 then
				springsByAtt[a0] = true
			end
		end
	end
	for _, d in ipairs(all) do
		local cls = d.ClassName
		if LEGACY[cls] then
			add(out, "warn", "legacy-mover", d, cls .. " is deprecated: LinearVelocity, AlignPosition, AlignOrientation, VectorForce, LineForce")
		elseif d:IsA("Constraint") then
			local enabled = prop(d, "Enabled", true)
			local a0 = prop(d, "Attachment0", nil)
			local a1 = prop(d, "Attachment1", nil)
			if enabled and a0 == nil then
				add(out, "error", "constraint-no-attachment", d, cls .. " has no Attachment0: it does nothing, silently")
			elseif enabled and TWO[cls] and a1 == nil then
				add(out, "error", "constraint-no-attachment", d, cls .. " needs Attachment1")
			end
			if cls == "LinearVelocity" and prop(d, "MaxForce", 1) == 0 then
				add(out, "warn", "mover-zero-limit", d, "LinearVelocity.MaxForce is 0: it cannot move anything")
			elseif cls == "AngularVelocity" and prop(d, "MaxTorque", 1) == 0 then
				add(out, "warn", "mover-zero-limit", d, "AngularVelocity.MaxTorque is 0: raise it above what the spin needs")
			end
			if (cls == "CylindricalConstraint" or cls == "PrismaticConstraint") and a0 and springsByAtt[a0] then
				if not prop(d, "LimitsEnabled", false) then
					add(out, "warn", "suspension-no-limits", d, "suspension slide without limits: the wheel travels without end")
				elseif prop(d, "UpperLimit", -1) >= 0 then
					add(out, "warn", "suspension-upper", d, "UpperLimit >= 0 lets the spring reach zero length: keep it below 0 (for example -1)")
				end
			end
		elseif d:IsA("BasePart") and looksDebug(d) and prop(d, "CanQuery", true) and not prop(d, "CanCollide", true) then
			add(out, "warn", "debug-queryable", d, "debug or visual part with CanQuery true: casts and spatial queries will hit it")
		end
	end
	return out
end

function GameplayAudit.run(root)
	local findings = {}
	GameplayAudit.instances(root, findings)
	GameplayAudit.scripts(root, findings)
	local tally = { error = 0, warn = 0, info = 0 }
	for _, f in ipairs(findings) do
		tally[f.severity] += 1
	end
	return { findings = findings, tally = tally }
end

-- Playtest Server only: NPC roots a client owns can be moved by that client.
function GameplayAudit.runtime(npcFolder)
	local out = {}
	for _, d in ipairs(npcFolder:GetDescendants()) do
		if d.Name == "HumanoidRootPart" and d:IsA("BasePart") and not d.Anchored then
			local owner = d:GetNetworkOwner()
			if owner ~= nil then
				add(out, "error", "npc-client-owned", d, "NPC root owned by " .. owner.Name .. ": SetNetworkOwner(nil) after parenting")
			end
		end
	end
	return out
end

return GameplayAudit
