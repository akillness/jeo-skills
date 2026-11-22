--!nonstrict
-- AgentKit AnimIK: IKControl set-ups that pass the required-property checks, plus measurements.
-- Create IKControls from a server Script so they replicate; Pole and EndEffectorOffset are hidden
-- in the Properties window and are set here.
--
--   AnimIK.reach(character, opts)  hand or foot IKControl; opts = {side = "Right", limb = "Arm",
--                                  target = Attachment or BasePart, type = "Position",
--                                  weight = 1, smooth = 0.05, priority = 0, pole = Attachment,
--                                  name = "ReachRight", enabled = true}
--   AnimIK.lookAt(character, target, opts)  head look-at, Weight 0.999, ChainRoot UpperTorso
--   AnimIK.target(name, cframe, parent)     invisible anchored target part with an Attachment
--   AnimIK.gap(ik)                  distance from the end effector to the target, studs
--   AnimIK.check(ik)                {problems}
--   AnimIK.leg(model, opts)         creature leg: IKControl, target in IKTargets, Pole under the root
--   AnimIK.planSteps(legs, stride)  which legs start a step now (pure, runs in Lune)
--   AnimIK.stepArc(a, b, t, height) foot position along a step (pure, runs in Lune)

local AnimIK = {}

local LIMBS = {
	Arm = { root = "UpperArm", effector = "Hand" },
	Leg = { root = "UpperLeg", effector = "Foot" },
}

local function holder(character)
	return character:FindFirstChildOfClass("Humanoid") or character:FindFirstChildOfClass("AnimationController")
end

function AnimIK.target(name, cframe, parent)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = Vector3.new(0.3, 0.3, 0.3)
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	p.Transparency = 1
	p.CFrame = cframe
	local a = Instance.new("Attachment")
	a.Name = "Target"
	a.Parent = p
	p.Parent = parent
	return p, a
end

local function ik(character, name)
	local h = holder(character)
	assert(h, "AnimIK: no Humanoid or AnimationController in " .. character:GetFullName())
	local c = h:FindFirstChild(name)
	if not c then
		c = Instance.new("IKControl")
		c.Name = name
		c.Parent = h
	end
	return c
end

function AnimIK.reach(character, opts)
	local side = opts.side or "Right"
	local limb = LIMBS[opts.limb or "Arm"]
	local c = ik(character, opts.name or ("Reach" .. side))
	c.Type = Enum.IKControlType[opts.type or "Position"]
	c.ChainRoot = character:FindFirstChild(side .. (opts.chainRoot or limb.root))
	c.EndEffector = character:FindFirstChild(side .. limb.effector)
	c.Target = opts.target
	c.Weight = opts.weight or 1
	c.SmoothTime = opts.smooth or 0.05
	c.Priority = opts.priority or 0
	if opts.pole then
		c.Pole = opts.pole
	end
	c.Enabled = opts.enabled ~= false
	return c
end

-- Weight 0.999 rather than 1: at 1 the neck twists when the target passes behind the character
-- (Suphi Kaner, 8fV-XOOj6O4 00:53:00).
function AnimIK.lookAt(character, target, opts)
	opts = opts or {}
	local c = ik(character, opts.name or "LookAt")
	c.Type = Enum.IKControlType.LookAt
	c.ChainRoot = character:FindFirstChild(opts.chainRoot or "UpperTorso")
	c.EndEffector = character:FindFirstChild("Head")
	c.Target = target
	c.Weight = opts.weight or 0.999
	c.SmoothTime = opts.smooth or 0.1
	c.Priority = opts.priority or 0
	c.Enabled = opts.enabled ~= false
	return c
end

local function worldPos(x)
	if x == nil then
		return nil
	end
	if x:IsA("Attachment") then
		return x.WorldPosition
	end
	if x:IsA("Bone") then
		return x.TransformedWorldCFrame.Position
	end
	return x.Position
end

function AnimIK.gap(c)
	local a, b = worldPos(c.EndEffector), worldPos(c.Target)
	if not a or not b then
		return math.huge
	end
	return (a - b).Magnitude
end

function AnimIK.check(c)
	local problems = {}
	for _, prop in { "EndEffector", "Target", "ChainRoot" } do
		if c[prop] == nil then
			table.insert(problems, prop .. " is nil")
		end
	end
	if c.ChainRoot and c.EndEffector and not c.EndEffector:IsDescendantOf(c.ChainRoot.Parent) then
		table.insert(problems, "EndEffector and ChainRoot are in different models")
	end
	if c.Type == Enum.IKControlType.LookAt and c.Weight >= 1 then
		table.insert(problems, "LookAt Weight 1: use 0.999")
	end
	return problems
end

local function worldCF(x)
	if x:IsA("Attachment") then -- Bone is an Attachment
		return x.WorldCFrame
	end
	return x.CFrame
end

-- Creature legs (Roox4, DPpAsjUr278 00:02:44, 00:04:21): one IKControl per leg under the Humanoid
-- or AnimationController; ChainRoot the first leg part or bone, EndEffector the last, Target an
-- invisible part in an IKTargets folder (no collide, query or touch, massless), Pole an Attachment
-- under the root on the side the knee bends toward. Pole is hidden in the Properties window
-- (Suphi Kaner, 8fV-XOOj6O4 00:09:49). Create from a server Script so the controls replicate.
-- opts = {name = "LegFL", chainRoot = "UpperLegFL", effector = "FootFL", pole = Vector3 (root space),
--         type = "Position", smooth = 0.05, priority = 0, enabled = false}
function AnimIK.leg(model, opts)
	local root = model:FindFirstChild("HumanoidRootPart") or model.PrimaryPart
	assert(root, "AnimIK.leg: no HumanoidRootPart or PrimaryPart in " .. model.Name)
	assert(opts.pole, "AnimIK.leg: pole (root-space Vector3 on the side the knee bends) is required")
	local chainRoot = model:FindFirstChild(opts.chainRoot, true)
	local effector = model:FindFirstChild(opts.effector, true)
	assert(chainRoot and effector, "AnimIK.leg: " .. opts.chainRoot .. " or " .. opts.effector .. " not found")
	local folder = model:FindFirstChild("IKTargets") or Instance.new("Folder")
	folder.Name = "IKTargets"
	folder.Parent = model
	local target = folder:FindFirstChild(opts.name) or AnimIK.target(opts.name, worldCF(effector), folder)
	local pole = root:FindFirstChild(opts.name .. "Pole") or Instance.new("Attachment")
	pole.Name = opts.name .. "Pole"
	pole.Position = opts.pole
	pole.Parent = root
	local c = ik(model, opts.name)
	c.Type = Enum.IKControlType[opts.type or "Position"]
	c.ChainRoot = chainRoot
	c.EndEffector = effector
	c.Target = target
	c.Pole = pole
	c.SmoothTime = opts.smooth or 0.05
	c.Priority = opts.priority or 0
	c.Enabled = opts.enabled == true
	return c, target
end

-- Gait decision for procedural legs. legs = {{planted = Vector3, ideal = Vector3, stepping = bool,
-- group = 1 or 2}}: a leg is due when its ideal spot (raycast under its hip) is more than `stride`
-- studs from where its foot stands. Legs of one group never lift while the other group is in the
-- air, so diagonal pairs alternate. Returns the indices to lift now, farthest first, one group only.
function AnimIK.planSteps(legs, stride)
	local airborne = {}
	for _, l in legs do
		if l.stepping then
			airborne[l.group or 1] = true
		end
	end
	local due = {}
	for i, l in legs do
		local other = if (l.group or 1) == 1 then 2 else 1
		if not l.stepping and not airborne[other] and (l.ideal - l.planted).Magnitude > stride then
			table.insert(due, i)
		end
	end
	table.sort(due, function(a, b)
		return (legs[a].ideal - legs[a].planted).Magnitude > (legs[b].ideal - legs[b].planted).Magnitude
	end)
	local out = {}
	for _, i in due do
		if (legs[i].group or 1) == (legs[due[1]].group or 1) then
			table.insert(out, i)
		end
	end
	return out
end

-- Foot position at `t` (0 to 1) of a step from `a` to `b`, lifted by `height` at mid-step.
function AnimIK.stepArc(a, b, t, height)
	local x = math.clamp(t, 0, 1)
	return a:Lerp(b, x) + Vector3.new(0, math.sin(x * math.pi) * height, 0)
end

return AnimIK
