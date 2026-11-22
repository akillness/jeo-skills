--!nonstrict
-- AgentKit AnimFace: expressions on dynamic heads (FaceControls).
-- Observed in Studio 0.743: on a player character a single write or a finished tween to
-- FaceControls snaps back to 0 within 0.4 s, even with no track playing. Two ways hold:
--   1. a face clip (CurveAnimation with a FaceControls folder) played on the Animator, which
--      replicates to the server and other clients like any track;
--   2. a write every frame in PreSimulation (after the animation step), local to that client.
--
--   AnimFace.POSES                 FACS presets (0 to 1 per FaceControls property)
--   AnimFace.clip(name, pose, opt) CurveAnimation holding `pose` (opt.loop, opt.priority, opt.ramp)
--   AnimFace.hold(fc, getPose)     RBXScriptConnection writing getPose() every PreSimulation
--   AnimFace.read(fc, names)       {name = value}
--   AnimFace.VALIDATION            the five action-unit tests of head validation, with their values
--   AnimFace.REQUIRED              the 17 FACS poses every dynamic head needs
--   AnimFace.headCheck(head)       {problems, notes} for a dynamic head MeshPart (runs in Lune)
--   AnimFace.bodyCheck(model)      cages (WrapTarget) and the 19 attachments of a body (runs in Lune)

local AnimFace = {}

AnimFace.POSES = {
	Neutral = {},
	Happy = { LeftLipCornerPuller = 0.8, RightLipCornerPuller = 0.8, LeftCheekRaiser = 0.5, RightCheekRaiser = 0.5 },
	Sad = { LeftLipCornerDown = 0.7, RightLipCornerDown = 0.7, LeftInnerBrowRaiser = 0.6, RightInnerBrowRaiser = 0.6 },
	Surprised = {
		JawDrop = 0.55,
		LeftInnerBrowRaiser = 1,
		RightInnerBrowRaiser = 1,
		LeftOuterBrowRaiser = 0.8,
		RightOuterBrowRaiser = 0.8,
	},
	Angry = { LeftBrowLowerer = 0.9, RightBrowLowerer = 0.9, LeftNoseWrinkler = 0.4, RightNoseWrinkler = 0.4 },
	Blink = { LeftEyeClosed = 1, RightEyeClosed = 1 },
}

function AnimFace.clip(name, pose, opts)
	opts = opts or {}
	local ca = Instance.new("CurveAnimation")
	ca.Name = name
	ca.Loop = opts.loop ~= false
	ca.Priority = opts.priority or Enum.AnimationPriority.Action
	local folder = Instance.new("Folder")
	folder.Name = "FaceControls"
	folder.Parent = ca
	local ramp = opts.ramp or 0.15
	local length = math.max(opts.length or 1, ramp)
	for prop, v in pose do
		local c = Instance.new("FloatCurve")
		c.Name = prop
		c.Parent = folder
		if ramp > 0 then
			c:InsertKey(FloatCurveKey.new(0, 0, Enum.KeyInterpolationMode.Linear))
		end
		c:InsertKey(FloatCurveKey.new(ramp, v, Enum.KeyInterpolationMode.Constant))
		c:InsertKey(FloatCurveKey.new(length, v, Enum.KeyInterpolationMode.Constant))
	end
	return ca
end

function AnimFace.hold(fc, getPose)
	return game:GetService("RunService").PreSimulation:Connect(function()
		for prop, v in getPose() do
			fc[prop] = v
		end
	end)
end

function AnimFace.read(fc, names)
	local out = {}
	for _, n in names do
		out[n] = math.floor(fc[n] * 1000 + 0.5) / 1000
	end
	return out
end

-- Dynamic head validation projects the cage's eye and mouth landmarks onto the head and checks that
-- these five poses move them (Dynamic head specifications; Roblox Learn, OwhkWzSBnf0 00:01:39).
AnimFace.VALIDATION = {
	{ name = "LeftEyeBlink", pose = { LeftEyeClosed = 1, EyesLookDown = 1 } },
	{ name = "RightEyeBlink", pose = { RightEyeClosed = 1, EyesLookDown = 1 } },
	{ name = "MouthOpen", pose = { JawDrop = 1 } },
	{ name = "Happy", pose = { Pucker = 1, LeftLipCornerPuller = 1, RightLipCornerPuller = 1 } },
	{
		name = "Sad",
		pose = {
			ChinRaiser = 1,
			ChinRaiserUpperLip = 1,
			LeftCheekRaiser = 0.85,
			RightCheekRaiser = 0.85,
			LeftInnerBrowRaiser = 1,
			RightInnerBrowRaiser = 1,
			LeftLipCornerDown = 1,
			RightLipCornerDown = 1,
			LeftLowerLipDepressor = 1,
			RightLowerLipDepressor = 1,
		},
	},
}

AnimFace.REQUIRED = {
	"LeftEyeClosed",
	"RightEyeClosed",
	"EyesLookDown",
	"JawDrop",
	"Pucker",
	"LeftLipCornerPuller",
	"RightLipCornerPuller",
	"ChinRaiser",
	"ChinRaiserUpperLip",
	"LeftCheekRaiser",
	"RightCheekRaiser",
	"LeftInnerBrowRaiser",
	"RightInnerBrowRaiser",
	"LeftLipCornerDown",
	"RightLipCornerDown",
	"LeftLowerLipDepressor",
	"RightLowerLipDepressor",
}

-- The 19 avatar attachments (Character body specifications), four of them on the head. Modeling
-- files name them `FaceCenter_Att`; Studio rigs name them `FaceCenterAttachment`. Both are accepted.
AnimFace.ATTACHMENTS = {
	"FaceCenter",
	"FaceFront",
	"Hat",
	"Hair",
	"LeftCollar",
	"RightCollar",
	"Neck",
	"BodyBack",
	"BodyFront",
	"Root",
	"WaistFront",
	"WaistBack",
	"WaistCenter",
	"RightShoulder",
	"RightGrip",
	"LeftShoulder",
	"LeftGrip",
	"RightFoot",
	"LeftFoot",
}

local function attachmentIn(parent, base, recursive)
	return parent:FindFirstChild(base .. "Attachment", recursive) or parent:FindFirstChild(base .. "_Att", recursive)
end

-- Unset properties raise in Lune; Studio returns the value.
local function read(inst, prop, default)
	local ok, v = pcall(function()
		return inst[prop]
	end)
	return if ok and v ~= nil then v else default
end

-- A dynamic head before Avatar Setup or upload: FaceControls, an outer cage (WrapTarget), the four
-- head attachments; notes when the color map sits in TextureID (Jezixa, apZsJqsKdw4 00:16:18, puts it
-- in a SurfaceAppearance ColorMap with skin areas transparent; the docs accept both).
function AnimFace.headCheck(head)
	local problems, notes = {}, {}
	if not head:FindFirstChildOfClass("FaceControls") then
		table.insert(problems, "no FaceControls: not a dynamic head")
	end
	if not head:FindFirstChildOfClass("WrapTarget") then
		table.insert(problems, "no WrapTarget: the outer cage is missing")
	end
	for i = 1, 4 do
		local base = AnimFace.ATTACHMENTS[i]
		if not attachmentIn(head, base, false) then
			table.insert(problems, "missing " .. base .. "Attachment")
		end
	end
	local sa = head:FindFirstChildOfClass("SurfaceAppearance")
	if read(head, "TextureID", "") ~= "" and not sa then
		table.insert(notes, "color map on TextureID: a SurfaceAppearance ColorMap lets MeshPart.Color show skin")
	end
	return { problems = problems, notes = notes }
end

-- A full avatar body: 15 cages (one WrapTarget per body part, head included) and 19 attachments
-- (Dynamic Heads docs). Never add or remove vertices of Roblox's standard cage meshes.
function AnimFace.bodyCheck(model)
	local cages = 0
	for _, d in model:GetDescendants() do
		if d:IsA("WrapTarget") then
			cages += 1
		end
	end
	local missing = {}
	for _, base in AnimFace.ATTACHMENTS do
		if not attachmentIn(model, base, true) then
			table.insert(missing, base)
		end
	end
	return { cages = cages, attachments = #AnimFace.ATTACHMENTS - #missing, missing = missing }
end

return AnimFace
