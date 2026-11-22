--!nonstrict
-- UGCCheck: wear test and Studio's own UGC validator, both local.
-- validate() needs a Player, so it runs in the Server data model of a playtest. Checks that need an
-- uploaded asset (ownership, moderation, asset type of the mesh ID) cannot pass on session content:
-- read the returned strings, fix what is local, and stop before upload.
--
--   local r = UGCCheck.validate(accessory, Enum.AccessoryType.Hat)    -- {called, valid, errors}
--   local w = UGCCheck.wear(accessory)                                 -- {rig, gap, attachmentError, ...}

local UGCCheck = {}

function UGCCheck.validate(acc: Accessory, accessoryType: Enum.AccessoryType, player: Player?)
	player = player or game:GetService("Players"):GetPlayers()[1]
	if not player then
		return { called = false, error = "no Player: run in the Server data model of a playtest" }
	end
	local ok, valid, errors
	for attempt = 1, 2 do
		ok, valid, errors = pcall(function()
			return game:GetService("AvatarCreationService"):ValidateUGCAccessoryAsync(player, acc, accessoryType)
		end)
		-- the validator allows 10 calls per 60 seconds (live); wait out the window once
		if ok or attempt == 2 or not string.find(tostring(valid), "request limit", 1, true) then
			break
		end
		task.wait(61)
	end
	if not ok then
		return { called = false, error = tostring(valid) }
	end
	return { called = true, valid = valid, errors = errors or {} }
end

-- R15 rig from a default HumanoidDescription; falls back to a block head with a HatAttachment
-- when the default body parts cannot load.
function UGCCheck.rig(parent: Instance?)
	local ok, rig = pcall(function()
		return game:GetService("Players")
			:CreateHumanoidModelFromDescriptionAsync(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
	end)
	if ok and rig then
		rig.Name = "WearTestRig"
		rig.Parent = parent or workspace
		return rig, "R15"
	end
	local model = Instance.new("Model")
	model.Name = "WearTestRig"
	local head = Instance.new("Part")
	head.Name = "Head"
	head.Size = Vector3.new(1.2, 1.2, 1.2)
	head.Anchored = true
	head.Parent = model
	local hat = Instance.new("Attachment")
	hat.Name = "HatAttachment"
	hat.Position = Vector3.new(0, 0.6, 0)
	hat.Parent = head
	Instance.new("Humanoid").Parent = model
	model.PrimaryPart = head
	model.Parent = parent or workspace
	return model, "block (" .. tostring(rig) .. ")"
end

-- Wear the accessory and measure how it sits: gap between the mesh bottom and the head top
-- (negative = the hat sinks into the head, which is what a hat should do a little).
function UGCCheck.wear(acc: Accessory, given: Model?, parent: Instance?)
	local rig: Model, kind = given :: Model, "given"
	if not given then
		rig, kind = UGCCheck.rig(parent)
	end
	local hum = rig:FindFirstChildOfClass("Humanoid")
	local head = rig:FindFirstChild("Head")
	assert(hum and head, "rig needs a Humanoid and a Head")
	for _, p in rig:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = true
		end
	end
	hum:AddAccessory(acc)
	local handle = acc:FindFirstChild("Handle")
	-- the Avatar Joint Upgrade joins accessories with a RigidConstraint instead of an AccessoryWeld
	local joint = handle:FindFirstChildWhichIsA("JointInstance") or handle:FindFirstChildWhichIsA("RigidConstraint")
	local myAtt, headAtt
	for _, a in handle:GetChildren() do
		if a:IsA("Attachment") then
			myAtt = a
			headAtt = rig:FindFirstChild(a.Name, true)
			if headAtt == a then
				headAtt = nil
			end
		end
	end
	local attErr = (myAtt and headAtt) and (myAtt.WorldPosition - headAtt.WorldPosition).Magnitude or nil
	local headTop = head.Position.Y + head.Size.Y / 2
	local meshBottom = handle.Position.Y - handle.Size.Y / 2
	-- clearance: the mesh's X and Z width in a thin slice at the head top. Narrower than the head
	-- means the head pokes through the crown. Needs object content (an EditableMesh behind the part).
	local opening
	local em = handle.MeshContent.Object
	if em then
		local vs = em:GetVertices()
		local lo, hi = em:GetPosition(vs[1]), em:GetPosition(vs[1])
		for _, v in vs do
			local q = em:GetPosition(v)
			lo, hi = lo:Min(q), hi:Max(q)
		end
		local k, c = handle.Size / (hi - lo), (hi + lo) / 2
		local xMin, xMax, zMin, zMax = math.huge, -math.huge, math.huge, -math.huge
		for _, v in vs do
			local w = handle.CFrame:PointToWorldSpace((em:GetPosition(v) - c) * k)
			if math.abs(w.Y - (headTop + 0.05)) <= 0.05 then
				local l = head.CFrame:PointToObjectSpace(w)
				xMin, xMax, zMin, zMax = math.min(xMin, l.X), math.max(xMax, l.X), math.min(zMin, l.Z), math.max(zMax, l.Z)
			end
		end
		if xMax > xMin then
			opening = { x = math.round((xMax - xMin) * 1000) / 1000, z = math.round((zMax - zMin) * 1000) / 1000 }
			opening.clears = opening.x >= head.Size.X and opening.z >= head.Size.Z
		end
	end
	return {
		opening = opening,
		rig = kind,
		joint = joint and joint.ClassName,
		attachment = myAtt and myAtt.Name,
		attachmentError = attErr and math.round(attErr * 1000) / 1000,
		gap = math.round((meshBottom - headTop) * 1000) / 1000,
		headSize = { head.Size.X, head.Size.Y, head.Size.Z },
		handleSize = { handle.Size.X, handle.Size.Y, handle.Size.Z },
	}
end

return UGCCheck
