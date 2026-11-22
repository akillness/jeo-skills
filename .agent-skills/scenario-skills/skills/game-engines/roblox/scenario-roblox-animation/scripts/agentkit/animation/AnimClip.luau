--!nonstrict
-- AgentKit AnimClip: animation clips built in code, registered for Studio tests, loaded, stepped
-- and reported. The Animation Editor is GUI-only; these clips are its scriptable substitute.
-- keyframes() and fromSamples() also run in Lune (Instance trees only); the rest needs Studio.
--
--   spec = {
--     name = "Swing", loop = false, priority = "Action",
--     keys = {{t = 0, poses = {RightUpperArm = CFrame}, easing = "Cubic", direction = "InOut"}},
--     markers = {{t = 0.4, name = "Hit", value = "heavy"}},
--     names = {[0.8] = "End"},            -- named keyframes (GetTimeOfKeyframe, "End")
--     face = {{t = 0, values = {JawDrop = 0.5}}},   -- curves() only: FaceControls channels
--   }
--   AnimClip.keyframes(tree, spec)   KeyframeSequence (tree from AnimRig.tree)
--   AnimClip.curves(tree, spec)      CurveAnimation (EulerRotationCurve XYZ, Vector3Curve, MarkerCurve)
--   AnimClip.fromSamples(tree, data) KeyframeSequence from per-frame samples (Blender bridge)
--   AnimClip.register(clip)          temporary id, Studio only (hash for KFS and CurveAnimation)
--   AnimClip.load(animator, id, opt) AnimationTrack once Length > 0 (a fresh id loads async)
--   AnimClip.at(animator, track, t)  pose the rig at track time t in Edit (StepAnimations)
--   AnimClip.tracks(animator)        report of playing tracks
--   AnimClip.timecode(seconds, fps)  "1:18": the Animation Editor's seconds:frames (runs in Lune)
--   AnimClip.frames(kfs, fps)        frame count and keys off the 1/fps grid of a clip (runs in Lune)

local AnimClip = {}

local function enum(e, v, default)
	if typeof(v) == "EnumItem" then
		return v
	end
	return e[v or default]
end

local function keyTimes(spec)
	local times, seen = {}, {}
	for _, k in spec.keys or {} do
		if not seen[k.t] then
			seen[k.t] = true
			table.insert(times, k.t)
		end
	end
	for _, m in spec.markers or {} do
		if not seen[m.t] then
			seen[m.t] = true
			table.insert(times, m.t)
		end
	end
	table.sort(times)
	return times
end

-- Builds the nested Pose chain root -> name inside one Keyframe; parents that are only on the
-- path get Weight 0 so they pass through without overriding lower-priority tracks.
local function poseAt(kf, cache, tree, name)
	if cache[name] then
		return cache[name]
	end
	local chain = {}
	local cur = name
	while cur do
		table.insert(chain, 1, cur)
		cur = tree.parentOf[cur]
	end
	local parent = kf
	for _, n in chain do
		local p = cache[n]
		if not p then
			p = Instance.new("Pose")
			p.Name = n
			p.Weight = 0
			p.Parent = parent
			cache[n] = p
		end
		parent = p
	end
	return cache[name]
end

function AnimClip.keyframes(tree, spec)
	local kfs = Instance.new("KeyframeSequence")
	kfs.Name = spec.name or "Clip"
	kfs.Loop = spec.loop == true
	kfs.Priority = enum(Enum.AnimationPriority, spec.priority, "Action")
	local frames = {}
	for _, t in keyTimes(spec) do
		local kf = Instance.new("Keyframe")
		kf.Time = t
		if spec.names and spec.names[t] then
			kf.Name = spec.names[t]
		end
		kf.Parent = kfs
		frames[t] = { kf = kf, cache = {} }
	end
	for _, k in spec.keys or {} do
		local f = frames[k.t]
		for name, cf in k.poses do
			local p = poseAt(f.kf, f.cache, tree, name)
			p.CFrame = cf
			p.Weight = 1
			p.EasingStyle = enum(Enum.PoseEasingStyle, k.easing, "Linear")
			p.EasingDirection = enum(Enum.PoseEasingDirection, k.direction, "In")
		end
	end
	for _, m in spec.markers or {} do
		local mk = Instance.new("KeyframeMarker")
		mk.Name = m.name
		mk.Value = m.value or ""
		mk.Parent = frames[m.t].kf
	end
	return kfs
end

local function folderAt(ca, cache, tree, name)
	if cache[name] then
		return cache[name]
	end
	local chain = {}
	local cur = name
	while cur do
		table.insert(chain, 1, cur)
		cur = tree.parentOf[cur]
	end
	local parent = ca
	for _, n in chain do
		local f = cache[n]
		if not f then
			f = Instance.new("Folder")
			f.Name = n
			f.Parent = parent
			cache[n] = f
		end
		parent = f
	end
	return cache[name]
end

local MODE = {
	Linear = Enum.KeyInterpolationMode.Linear,
	Constant = Enum.KeyInterpolationMode.Constant,
	Cubic = Enum.KeyInterpolationMode.Cubic,
	CubicV2 = Enum.KeyInterpolationMode.Cubic,
}

function AnimClip.curves(tree, spec)
	local ca = Instance.new("CurveAnimation")
	ca.Name = spec.name or "Clip"
	ca.Loop = spec.loop == true
	ca.Priority = enum(Enum.AnimationPriority, spec.priority, "Action")
	local cache, chans = {}, {}
	for _, k in spec.keys or {} do
		local mode = MODE[k.easing or "Linear"] or Enum.KeyInterpolationMode.Cubic
		for name, cf in k.poses do
			local ch = chans[name]
			if not ch then
				local f = folderAt(ca, cache, tree, name)
				local rot = Instance.new("EulerRotationCurve")
				rot.Name = "Rotation"
				rot.RotationOrder = Enum.RotationOrder.XYZ
				rot.Parent = f
				local pos = Instance.new("Vector3Curve")
				pos.Name = "Position"
				pos.Parent = f
				ch = { rot = rot, pos = pos }
				chans[name] = ch
			end
			local rx, ry, rz = cf:ToEulerAnglesXYZ()
			ch.rot:X():InsertKey(FloatCurveKey.new(k.t, rx, mode))
			ch.rot:Y():InsertKey(FloatCurveKey.new(k.t, ry, mode))
			ch.rot:Z():InsertKey(FloatCurveKey.new(k.t, rz, mode))
			ch.pos:X():InsertKey(FloatCurveKey.new(k.t, cf.X, mode))
			ch.pos:Y():InsertKey(FloatCurveKey.new(k.t, cf.Y, mode))
			ch.pos:Z():InsertKey(FloatCurveKey.new(k.t, cf.Z, mode))
		end
	end
	local faceFolder
	for _, k in spec.face or {} do
		if not faceFolder then
			faceFolder = Instance.new("Folder")
			faceFolder.Name = "FaceControls"
			faceFolder.Parent = ca
		end
		for prop, v in k.values do
			local c = faceFolder:FindFirstChild(prop)
			if not c then
				c = Instance.new("FloatCurve")
				c.Name = prop
				c.Parent = faceFolder
			end
			c:InsertKey(FloatCurveKey.new(k.t, v, MODE[k.easing or "Linear"] or Enum.KeyInterpolationMode.Linear))
		end
	end
	local markerCurves = {}
	for _, m in spec.markers or {} do
		local mc = markerCurves[m.name]
		if not mc then
			mc = Instance.new("MarkerCurve")
			mc.Name = m.name
			mc.Parent = ca
			markerCurves[m.name] = mc
		end
		mc:InsertMarkerAtTime(m.t, m.value or "")
	end
	return ca
end

-- data = {fps = 24, frames = n, poses = {boneName = {{x, y, z, qx, qy, qz, qw}, ...}}}: one
-- Keyframe per frame, Linear, local transforms already in Roblox joint space.
function AnimClip.fromSamples(tree, data, opts)
	opts = opts or {}
	local keys = {}
	for i = 1, data.frames do
		local poses = {}
		for name, list in data.poses do
			local s = list[i]
			poses[name] = CFrame.new(s[1], s[2], s[3], s[4], s[5], s[6], s[7])
		end
		table.insert(keys, { t = (i - 1) / data.fps, poses = poses, easing = "Linear" })
	end
	return AnimClip.keyframes(tree, {
		name = opts.name or data.name or "Imported",
		loop = opts.loop,
		priority = opts.priority or "Action",
		keys = keys,
		markers = opts.markers,
	})
end

function AnimClip.register(clip)
	if clip:IsA("KeyframeSequence") then
		return game:GetService("KeyframeSequenceProvider"):RegisterKeyframeSequence(clip)
	end
	return game:GetService("AnimationClipProvider"):RegisterAnimationClip(clip)
end

-- A freshly registered id loads asynchronously: Length reads 0 and stepping does nothing until it
-- has loaded (observed in Studio 0.743). Wait for Length before playing or stepping.
function AnimClip.load(animator, idOrClip, opts)
	opts = opts or {}
	local id = idOrClip
	if typeof(idOrClip) == "Instance" then
		id = AnimClip.register(idOrClip)
	end
	local anim = Instance.new("Animation")
	anim.Name = opts.name or "Clip"
	anim.AnimationId = id
	local track = animator:LoadAnimation(anim)
	local deadline = os.clock() + (opts.timeout or 5)
	while track.Length == 0 and os.clock() < deadline do
		task.wait()
	end
	if track.Length == 0 and not opts.allowEmpty then
		error("AnimClip.load: track Length still 0 after " .. tostring(opts.timeout or 5) .. " s for " .. tostring(id))
	end
	if opts.priority then
		track.Priority = enum(Enum.AnimationPriority, opts.priority, "Action")
	end
	return track, id
end

-- Edit-mode posing: StepAnimations is plugin-level and works from the Studio MCP server. It
-- advances every playing track of the Animator, so stop the others first for a clean pose.
function AnimClip.at(animator, track, t)
	if not track.IsPlaying then
		track:Play(0)
		animator:StepAnimations(0)
	end
	local dt = t - track.TimePosition
	if dt < 0 then
		track.TimePosition = t
		dt = 0
	end
	animator:StepAnimations(dt)
	return track.TimePosition
end

-- Edit-mode reset between clips: a non-looped track that reached its end keeps fading out (about
-- 0.3 s) and blends its last pose into the next clip; Stop(0) and a zero step do not cut it.
function AnimClip.settle(animator, seconds)
	local n = 0
	for _, t in animator:GetPlayingAnimationTracks() do
		t:Stop(0)
		n += 1
	end
	animator:StepAnimations(seconds or 0.5)
	return n
end

function AnimClip.tracks(animator)
	local out = {}
	for _, t in animator:GetPlayingAnimationTracks() do
		table.insert(out, {
			id = t.Animation and t.Animation.AnimationId or "",
			name = t.Name,
			priority = t.Priority.Name,
			weight = math.floor(t.WeightCurrent * 1000 + 0.5) / 1000,
			target = math.floor(t.WeightTarget * 1000 + 0.5) / 1000,
			speed = t.Speed,
			time = math.floor(t.TimePosition * 1000 + 0.5) / 1000,
			length = t.Length,
			looped = t.Looped,
		})
	end
	table.sort(out, function(a, b)
		return a.id < b.id
	end)
	return out
end

-- The Animation Editor shows a clip's length as seconds:frames: at 24 fps a 42-frame clip reads 1:18
-- and a 100-frame clip 4:04 (Mykaiju, NI7GXKLwk6U 00:29:10, 00:30:43).
function AnimClip.timecode(seconds, fps)
	fps = fps or 24
	local total = math.floor(seconds * fps + 0.5)
	return string.format("%d:%02d", total // fps, total % fps)
end

-- Proves the frame rate of an imported or saved KeyframeSequence: one key per frame on the 1/fps
-- grid, so offGrid is 0 and frames + 1 keys. A 60 fps export shows keys off the 24 fps grid.
function AnimClip.frames(kfs, fps)
	fps = fps or 24
	local last, off, n = 0, 0, 0
	for _, kf in kfs:GetChildren() do
		if kf:IsA("Keyframe") then
			n += 1
			last = math.max(last, kf.Time)
			local f = kf.Time * fps
			if math.abs(f - math.floor(f + 0.5)) > 1e-3 then
				off += 1
			end
		end
	end
	return {
		keyframes = n,
		length = last,
		frames = math.floor(last * fps + 0.5),
		offGrid = off,
		label = AnimClip.timecode(last, fps),
	}
end

return AnimClip
