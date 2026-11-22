--!nonstrict
-- AgentKit AnimRig: joints, hierarchy, building, sampling and resetting of animated rigs.
-- Handles Motor6D (custom rigs), AnimationConstraint (R15 avatars since the Avatar Joint Upgrade)
-- and Bone (skinned meshes). Runs in Studio through rbx_run; tree(), path(), bounds() and
-- prepareImport() also run in Lune.
--
--   AnimRig.joints(model)            {{name, class, joint, part0, part1}} sorted by name
--   AnimRig.joint(model, name)       the joint of either class, or nil
--   AnimRig.tree(model)              {parentOf = {child = parent}, root = name, kind = {name = class}}
--   AnimRig.path(tree, name)         {"HumanoidRootPart", "LowerTorso", ...} root first
--   AnimRig.build(spec)              Model of Parts joined by Motor6D, with an Animator
--   AnimRig.sample(model)            {jointName = {rx, ry, rz, x, y, z}} (degrees, studs)
--   AnimRig.reset(model)             joints whose Transform was not identity, set back to identity
--   AnimRig.dirty(model, eps)        names of joints whose Transform is not identity
--   AnimRig.bounds(model, frame, skip)   {min, max, size} of the BaseParts in `frame`, center (world)
--   AnimRig.prepareImport(model, spec)   Custom-rig import -> HumanoidRootPart collider, Root Motor6D,
--                                        welds, one Animator; report (runs in Lune, see the function)

local AnimRig = {}

local function isJoint(d)
	return d:IsA("Motor6D") or d:IsA("AnimationConstraint")
end
AnimRig.isJoint = isJoint

-- AnimationConstraint exposes Part0/Part1/C0/C1 as read-only aliases; read the attachments instead.
function AnimRig.parts(j)
	if j:IsA("AnimationConstraint") then
		local a0, a1 = j.Attachment0, j.Attachment1
		return a0 and a0.Parent or nil, a1 and a1.Parent or nil
	end
	return j.Part0, j.Part1
end

function AnimRig.joints(model)
	local out = {}
	for _, d in model:GetDescendants() do
		if isJoint(d) then
			local p0, p1 = AnimRig.parts(d)
			table.insert(out, { name = d.Name, class = d.ClassName, joint = d, part0 = p0, part1 = p1 })
		end
	end
	table.sort(out, function(a, b)
		return a.name < b.name
	end)
	return out
end

function AnimRig.joint(model, name)
	for _, d in model:GetDescendants() do
		if isJoint(d) and d.Name == name then
			return d
		end
	end
	return nil
end

-- Pose names follow the part (Part1) of each joint, then Bone names below their part.
function AnimRig.tree(model)
	local parentOf, kind = {}, {}
	for _, d in model:GetDescendants() do
		if isJoint(d) then
			local p0, p1 = AnimRig.parts(d)
			if p0 and p1 then
				parentOf[p1.Name] = p0.Name
				kind[p1.Name] = p1.ClassName
				kind[p0.Name] = kind[p0.Name] or p0.ClassName
			end
		elseif d:IsA("Bone") then
			parentOf[d.Name] = d.Parent.Name
			kind[d.Name] = "Bone"
		end
	end
	local root = nil
	for _, parent in parentOf do
		if parentOf[parent] == nil then
			root = parent
			break
		end
	end
	return { parentOf = parentOf, root = root, kind = kind }
end

function AnimRig.path(tree, name)
	local chain, seen = {}, {}
	local cur = name
	while cur and not seen[cur] do
		seen[cur] = true
		table.insert(chain, 1, cur)
		cur = tree.parentOf[cur]
	end
	return chain
end

-- spec = {
--   name = "Creature", controller = "AnimationController" | "Humanoid", hipHeight = 2,
--   root = {name = "HumanoidRootPart", size = Vector3, cframe = CFrame, anchored = false},
--   parts = {{name, parent, size, cframe (part, world), joint = CFrame (joint frame, world),
--             jointName, color = Color3, transparency}},
-- }
-- Parts are welded by Motor6D with C0 and C1 taken from the world joint frame, so Transform
-- rotates each part about its joint. Built unparented: set Parent once at the end.
function AnimRig.build(spec)
	local model = Instance.new("Model")
	model.Name = spec.name or "Rig"
	local byName = {}
	local r = spec.root or {}
	local root = Instance.new("Part")
	root.Name = r.name or "HumanoidRootPart"
	root.Size = r.size or Vector3.new(2, 2, 1)
	root.CFrame = r.cframe or CFrame.new()
	root.Transparency = r.transparency or 1
	root.CanCollide = r.canCollide ~= false
	root.Anchored = r.anchored == true
	root.Parent = model
	byName[root.Name] = root
	for _, p in spec.parts or {} do
		local part = Instance.new("Part")
		part.Name = p.name
		part.Size = p.size or Vector3.new(1, 1, 1)
		part.CFrame = p.cframe
		part.CanCollide = false
		part.CanQuery = p.canQuery == true
		part.CanTouch = false
		part.Massless = true
		part.Color = p.color or Color3.fromRGB(163, 162, 165)
		part.Transparency = p.transparency or 0
		part.Parent = model
		byName[p.name] = part
		local parent = byName[p.parent]
		assert(parent, "AnimRig.build: parent " .. tostring(p.parent) .. " must come before " .. p.name)
		local jf = p.joint or p.cframe
		local m = Instance.new("Motor6D")
		m.Name = p.jointName or p.name
		m.Part0 = parent
		m.Part1 = part
		m.C0 = parent.CFrame:ToObjectSpace(jf)
		m.C1 = part.CFrame:ToObjectSpace(jf)
		m.Parent = part
	end
	model.PrimaryPart = root
	local holder
	if spec.controller == "Humanoid" then
		holder = Instance.new("Humanoid")
		holder.RigType = Enum.HumanoidRigType.R15
		if spec.hipHeight then
			holder.HipHeight = spec.hipHeight
		end
	else
		holder = Instance.new("AnimationController")
	end
	holder.Parent = model
	Instance.new("Animator").Parent = holder
	return model
end

local function round(x, d)
	local m = 10 ^ (d or 2)
	return math.floor(x * m + 0.5) / m
end

function AnimRig.sample(model)
	local out = {}
	for _, d in model:GetDescendants() do
		if isJoint(d) or d:IsA("Bone") then
			local t = d.Transform
			local rx, ry, rz = t:ToEulerAnglesXYZ()
			out[d.Name] = {
				rx = round(math.deg(rx)),
				ry = round(math.deg(ry)),
				rz = round(math.deg(rz)),
				x = round(t.X, 3),
				y = round(t.Y, 3),
				z = round(t.Z, 3),
			}
		end
	end
	return out
end

local function isIdentity(cf, eps)
	local c = { cf:GetComponents() }
	local ident = { 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1 }
	for i = 1, 12 do
		if math.abs(c[i] - ident[i]) > eps then
			return false
		end
	end
	return true
end

function AnimRig.dirty(model, eps)
	local out = {}
	for _, d in model:GetDescendants() do
		if (isJoint(d) or d:IsA("Bone")) and not isIdentity(d.Transform, eps or 1e-4) then
			table.insert(out, d.Name)
		end
	end
	table.sort(out)
	return out
end

-- Animator:StepAnimations leaves the last pose on the joints after the tracks stop (docs and
-- observed): a preview in Edit saves a posed rig into the place unless the joints are reset.
function AnimRig.reset(model)
	local n = 0
	for _, d in model:GetDescendants() do
		if (isJoint(d) or d:IsA("Bone")) and not isIdentity(d.Transform, 1e-6) then
			d.Transform = CFrame.new()
			n += 1
		end
	end
	return n
end

local CORNERS = {}
for _, x in { -1, 1 } do
	for _, y in { -1, 1 } do
		for _, z in { -1, 1 } do
			table.insert(CORNERS, Vector3.new(x, y, z))
		end
	end
end

-- Box around a model's BaseParts, measured in `frame` (default: world axes), so a rotated import
-- still gets a box aligned with the creature. Bones have no size: the skinned MeshParts carry it.
-- skip = {[part] = true} leaves parts out (the importer's 2x2x1 root, for instance).
function AnimRig.bounds(model, frame, skip)
	frame = frame or CFrame.new()
	local inv = frame:Inverse()
	local lo, hi = nil, nil
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") and not (skip and skip[d]) then
			local half = d.Size / 2
			for _, s in CORNERS do
				local p = inv * (d.CFrame * (half * s))
				lo = if lo then lo:Min(p) else p
				hi = if hi then hi:Max(p) else p
			end
		end
	end
	if not lo then
		return nil
	end
	return { min = lo, max = hi, size = hi - lo, center = frame * CFrame.new((lo + hi) / 2) }
end

-- Parts held together by joints (Motor6D, Weld, WeldConstraint, AnimationConstraint, RigidConstraint).
local function linkedFrom(model, start)
	local adj = {}
	local function link(a, b)
		if a and b then
			adj[a] = adj[a] or {}
			adj[b] = adj[b] or {}
			table.insert(adj[a], b)
			table.insert(adj[b], a)
		end
	end
	for _, d in model:GetDescendants() do
		if d:IsA("JointInstance") or d:IsA("WeldConstraint") then
			link(d.Part0, d.Part1)
		elseif d:IsA("AnimationConstraint") or d:IsA("RigidConstraint") then
			local a0, a1 = d.Attachment0, d.Attachment1
			link(a0 and a0.Parent, a1 and a1.Parent)
		end
	end
	local seen, stack = { [start] = true }, { start }
	while #stack > 0 do
		for _, q in adj[table.remove(stack)] or {} do
			if not seen[q] then
				seen[q] = true
				table.insert(stack, q)
			end
		end
	end
	return seen
end

-- Turns a 3D Importer "Custom" rig into a rig that Humanoid, Animator and gameplay code expect.
-- The importer names a skinned rig's root `RootPart` (a 2x2x1 Part holding the bones, beside an
-- AnimationController; Mykaiju, NI7GXKLwk6U 00:35:47), and bones move the render, never the collision
-- (Rigging docs). This wraps that root: a new `HumanoidRootPart` box sized to the creature becomes the
-- collider and PrimaryPart, a Motor6D named Root joins it to the importer root, parts no joint holds
-- are welded to the importer root, every other part stops colliding, and one Animator sits under the
-- chosen controller (a Humanoid gets RequiresNeck false when the rig has no Neck joint). A model that
-- already has a HumanoidRootPart keeps it and its collision flags.
-- Clips authored on the raw import still play after it: the wrap keeps `RootPart`, and a pose binds by its
-- name under the pose of its joint's Part0 or its parent bone (observed in Studio 0.743).
-- spec = {
--   controller = "Humanoid" | "AnimationController"  (default: keep a Humanoid, else AnimationController)
--   hipHeight = studs from the feet up to the collider (Humanoid.HipHeight; default half the height
--               for a Humanoid, 0 for an AnimationController, whose box then reaches the ground)
--   footprint = 1     scale of the collider's X and Z against the creature's bounds
--   anchored = true   anchored HumanoidRootPart (clip import needs it; unanchor before play)
-- }
function AnimRig.prepareImport(model, spec)
	spec = spec or {}
	local hrp = model:FindFirstChild("HumanoidRootPart")
	local root = model:FindFirstChild("RootPart") or model.PrimaryPart or hrp
	assert(
		root and root:IsA("BasePart"),
		"AnimRig.prepareImport: no RootPart, PrimaryPart or HumanoidRootPart in " .. model.Name
	)
	local hum = model:FindFirstChildOfClass("Humanoid")
	local want = spec.controller or (if hum then "Humanoid" else "AnimationController")
	local report = { created = false, welded = 0, bones = 0, importerRoot = root.Name, hipHeight = 0 }
	if hrp == nil then
		local box = AnimRig.bounds(model, root.CFrame, { [root] = true })
		assert(box, "AnimRig.prepareImport: no mesh or part besides " .. root.Name)
		local hip = spec.hipHeight or (if want == "Humanoid" then box.size.Y / 2 else 0)
		assert(hip < box.size.Y - 0.1, "AnimRig.prepareImport: hipHeight leaves no room for the collider")
		local fp = spec.footprint or 1
		local size = Vector3.new(box.size.X * fp, box.size.Y - hip, box.size.Z * fp)
		local mid = (box.min + box.max) / 2
		hrp = Instance.new("Part")
		hrp.Name = "HumanoidRootPart"
		hrp.Size = size
		hrp.CFrame = root.CFrame * CFrame.new(mid.X, box.min.Y + hip + size.Y / 2, mid.Z)
		hrp.Anchored = true
		hrp.Transparency = 1
		hrp.CanCollide = true
		hrp.CanQuery = true
		hrp.CanTouch = true
		hrp.Parent = model
		local m = Instance.new("Motor6D")
		m.Name = "Root"
		m.Part0 = hrp
		m.Part1 = root
		m.C0 = hrp.CFrame:Inverse() * root.CFrame
		m.C1 = CFrame.new()
		m.Parent = root
		for _, d in model:GetDescendants() do
			if d:IsA("BasePart") and d ~= hrp then
				d.Anchored = false
				d.CanCollide = false
				d.CanTouch = false
				d.Massless = true
			end
		end
		root.Transparency = 1
		root.CanQuery = false
		report.created = true
		report.hipHeight = hip
		report.size = { size.X, size.Y, size.Z }
	end
	local held = linkedFrom(model, hrp)
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") and not held[d] then
			local w = Instance.new("WeldConstraint")
			w.Name = "ImportWeld"
			w.Part0 = root
			w.Part1 = d
			w.Parent = d
			report.welded += 1
		elseif d:IsA("Bone") then
			report.bones += 1
		end
	end
	local ctl = model:FindFirstChildOfClass("AnimationController")
	local holder
	if want == "Humanoid" then
		if ctl then
			ctl:Destroy() -- one Animator drives the rig
		end
		holder = hum or Instance.new("Humanoid")
		holder.RigType = Enum.HumanoidRigType.R15
		if report.created then
			holder.HipHeight = report.hipHeight
		end
		-- RequiresNeck (default true) kills the Humanoid when its Neck joint is missing or broken
		-- (Humanoid reference); a creature rig often has no joint of that name.
		if not AnimRig.joint(model, "Neck") then
			holder.RequiresNeck = false
		end
		report.requiresNeck = holder.RequiresNeck
	else
		if hum and spec.controller == "AnimationController" then
			hum:Destroy()
		end
		holder = ctl or Instance.new("AnimationController")
	end
	holder.Parent = model
	if not holder:FindFirstChildOfClass("Animator") then
		Instance.new("Animator").Parent = holder
	end
	model.PrimaryPart = hrp
	hrp.Anchored = spec.anchored ~= false
	report.root = hrp
	report.controller = holder.ClassName
	return report
end

return AnimRig
