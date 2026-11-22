# Procedures (scenario-roblox-animation)

Every procedure names its test and result. Live tests ran in Roblox Studio 0.743 on macOS through
the built-in Studio MCP server (`tests/code/scenario-roblox-animation/run_live.py`, one command for
L0 to L16). Offline checks ran with luau-lsp 1.70, Selene 0.32, StyLua 2.6, Lune 0.11 and Blender
5.2.1 in background mode (`run_offline.sh`, O1 to O5). The Luau below is the exact code the tests
ran (the test id is dropped from each first comment); each block names the AgentKit modules it needs
(inlined by `rbx_animation.run(..., kit=[...])`, nothing is written into the place). Test scene: an
R15 dummy `workspace.AnimTests.Dummy` at (0, 3, -10), built by P1.

## 0. Toolkit

### rbx_animation.py (runner side)

```python
import sys
sys.path.insert(0, "skills/scenario-roblox-animation/scripts")
import rbx_animation as A   # also puts scenario-roblox-expert/scripts on sys.path
import rbx_env
from rbx_play import Playtest

with rbx_env.place_slot():
    s = rbx_env.open_place("path/to/place.rbxl")          # binds the window if it is already open
    r = A.run(s, "return AnimRig.tree(workspace.Rig)", kit=["AnimRig"])
    sheet = A.pose_sheet(s, SETUP_LUAU, [0, 0.25, 0.5], "out/", {"camera_position": [7, 4.5, -13],
                         "look_at_position": [0, 3.5, -10.5]})
```

| Function                                                                                                  | Returns                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kit_source(names)`                                                                                       | Luau source defining the named modules as locals (order matters: AnimRig before AnimClip)                                                                                                                                                                                                                                                                                                      |
| `run(studio, code, dm="Edit", kit=(), lead_kit=(), timeout=None)`                                         | the `rbx_run.run` dict (`ok`, `result`, `error`, `output`)                                                                                                                                                                                                                                                                                                                                     |
| `blender(cmd, **opts)`                                                                                    | dict parsed from `blender_roblox_anim.py` (runs `blender -b --factory-startup`)                                                                                                                                                                                                                                                                                                                |
| `samples_luau(json_path)`                                                                                 | a Luau expression that decodes a `sample` JSON                                                                                                                                                                                                                                                                                                                                                 |
| `pose_sheet(studio, setup, times, out_dir, camera, name="pose", reset=None, kit=("AnimRig", "AnimClip"))` | `{ok, captures, sheet, poses, frame_diffs, checks, blank, retries, reset}`; `setup` defines `rig`, `animator`, `track`; a blank capture (window not drawing) is retaken up to 4 times, a capture that gets no answer is tried once more after 5 s, and the rig is reset even when a step fails; add `"AnimFace"` to `kit` for face clips (the `kit` argument is new and not yet run in Studio) |
| `audit_source(path_or_text, client=False)`                                                                | AnimAudit findings for one file, through Lune                                                                                                                                                                                                                                                                                                                                                  |

CLI: `rbx_animation.py blender <cmd> --key value`, `rbx_animation.py audit <file.luau ...>` (exit 1
on an error finding).

### blender_roblox_anim.py (Blender side)

`blender -b --factory-startup --python blender_roblox_anim.py -- <command>`; each command prints one
`RBXANIM_JSON {...}` line.

| Command                                                             | Does                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `make-test-rig --out rig.blend [--bad]`                             | 10-bone creature, skinned boxes, one 24 fps walk; `--bad` makes 60 fps, scale keys, 5 influences, Root weights |
| `audit --blend rig.blend`                                           | fps, frame range, actions, NLA tracks, scale keys, influences per vertex, Root weights                         |
| `export --blend rig.blend --out a.fbx [--with-mesh] [--leaf-bones]` | FBX with the settings of section P10                                                                           |
| `inspect-fbx --fbx a.fbx`                                           | re-import into an empty scene: bones, armature scale, `_end` leaf bones, actions and frame ranges              |
| `sample --blend rig.blend --out s.json [--scale 1] [--action NAME]` | rest frames in Roblox space, per-frame local poses `{x, y, z, qx, qy, qz, qw}`, bone tails                     |

Axes: a Blender world vector (x, y, z) is (-x, z, y) in Roblox, which maps Blender's -Y forward to
Roblox's -Z forward [added]. Bone-local frames keep Blender's convention (Y along the bone), so
local pose rotations need no conversion.

### AgentKit modules (`scripts/agentkit/animation/`)

| Module    | API                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AnimRig   | `joints(model)`, `joint(model, name)`, `parts(joint)`, `tree(model)`, `path(tree, name)`, `build(spec)`, `sample(model)`, `dirty(model, eps)`, `reset(model)`, `bounds(model, frame, skip)`, `prepareImport(model, spec)`                                   |
| AnimClip  | `keyframes(tree, spec)`, `curves(tree, spec)`, `fromSamples(tree, data, opts)`, `register(clip)`, `load(animator, idOrClip, opts)`, `at(animator, track, t)`, `settle(animator, seconds)`, `tracks(animator)`, `timecode(seconds, fps)`, `frames(kfs, fps)` |
| AnimIK    | `reach(character, opts)`, `lookAt(character, target, opts)`, `target(name, cframe, parent)`, `gap(ik)`, `check(ik)`, `leg(model, opts)`, `planSteps(legs, stride)`, `stepArc(a, b, t, height)`                                                              |
| AnimFace  | `POSES`, `clip(name, pose, opts)`, `hold(faceControls, getPose)`, `read(faceControls, names)`, `VALIDATION`, `REQUIRED`, `ATTACHMENTS`, `headCheck(head)`, `bodyCheck(model)`                                                                               |
| AnimAudit | `source(src, path, opts)`, `scripts(root)`, `rigs(root, opts)`, `all(dm, opts)`                                                                                                                                                                             |

`AnimRig.tree`, `AnimRig.path`, `AnimClip.keyframes`, `AnimClip.fromSamples`, `AnimAudit.source` and
`AnimAudit.rigs` also run in Lune (O3). The functions added after the live run (`AnimRig.bounds`,
`AnimRig.prepareImport`, `AnimClip.timecode`, `AnimClip.frames`, `AnimIK.leg`, `AnimIK.planSteps`,
`AnimIK.stepArc`, `AnimFace.headCheck`, `AnimFace.bodyCheck` and the AnimFace tables) pass Lune unit
tests (O3) and ran in Studio 0.743 on 2026-10-19 through the `references/characters.md` blocks that
use them, as written: L17 to L22 pass.

## P1. Inspect a rig

Goal: know the joint classes and the pose path before writing any clip. Kit: AnimRig. Edit data
model. This chunk also builds the test scene for P2 to P5.

```lua
-- Edit: fresh test scene, then what an R15 avatar rig is made of in this build.
local Players = game:GetService("Players")
local old = workspace:FindFirstChild("AnimTests")
if old then
	old:Destroy()
end
for _, n in { "ProbeRig", "CustomHumanoid", "BoneProbe", "IKTargetPart", "NPC1", "Creature" } do
	local x = workspace:FindFirstChild(n)
	if x then
		x:Destroy()
	end
end
local clips = game:GetService("ServerStorage"):FindFirstChild("AnimTestClips")
if clips then
	clips:Destroy()
end
clips = Instance.new("Folder")
clips.Name = "AnimTestClips"
clips.Parent = game:GetService("ServerStorage")
local folder = Instance.new("Folder")
folder.Name = "AnimTests"
folder.Parent = workspace

local desc = Instance.new("HumanoidDescription")
-- light gray body so poses read in captures
for _, prop in { "HeadColor", "TorsoColor", "LeftArmColor", "RightArmColor", "LeftLegColor", "RightLegColor" } do
	desc[prop] = Color3.fromRGB(205, 205, 210)
end
local rig = Players:CreateHumanoidModelFromDescriptionAsync(desc, Enum.HumanoidRigType.R15)
rig.Name = "Dummy"
rig:PivotTo(CFrame.new(0, 3, -10))
rig.HumanoidRootPart.Anchored = true
rig.Parent = folder

local classes = {}
for _, d in rig:GetDescendants() do
	if d:IsA("JointInstance") or d:IsA("Constraint") then
		classes[d.ClassName] = (classes[d.ClassName] or 0) + 1
	end
end
local shoulder = AnimRig.joint(rig, "RightShoulder")
local p0, p1 = AnimRig.parts(shoulder)
local aliasOk, alias = pcall(function()
	return shoulder.Part0.Name
end)
local writeOk, writeErr = pcall(function()
	shoulder.C0 = CFrame.new()
end)
local tree = AnimRig.tree(rig)
return {
	classes = classes,
	shoulderClass = shoulder.ClassName,
	shoulderIsMotor6D = shoulder:IsA("Motor6D"),
	parts = { p0 and p0.Name, p1 and p1.Name },
	part0Alias = aliasOk and alias or tostring(alias),
	c0Write = writeOk and "ok" or tostring(writeErr),
	root = tree.root,
	pathToHand = AnimRig.path(tree, "RightHand"),
	animator = rig.Humanoid:FindFirstChildOfClass("Animator") ~= nil,
	faceControls = rig.Head:FindFirstChildOfClass("FaceControls") ~= nil,
	animate = rig:FindFirstChild("Animate") ~= nil,
	joints = #AnimRig.joints(rig),
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L1 (L1, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L1):** run in Studio 0.743 on 2026-10-19:
pass, 15 AnimationConstraint and 14 BallSocketConstraint joints, `IsA("Motor6D")` false, C0 write:
"Unable to assign property C0. Property is read only", Part0 alias reads `UpperTorso`.

- `AnimationConstraint:IsA("Motor6D")` is false, so `FindFirstChildOfClass("Motor6D")` finds nothing
  on an upgraded avatar.
- Its parts come from `Attachment0.Parent` and `Attachment1.Parent`; `Part0` and `Part1` still read
  as aliases.
- The pose path follows the joints' parts:
  `HumanoidRootPart > LowerTorso > UpperTorso > RightUpperArm`.

## P2. Build a KeyframeSequence in code, load it, step it, read markers

Goal: a clip that an agent can author and verify without the Animation Editor. Kit: AnimRig,
AnimClip. Edit data model.

```lua
-- Edit: KeyframeSequence built in code, registered, loaded, stepped; markers and named keyframes.
local rig = workspace:WaitForChild("AnimTests"):WaitForChild("Dummy")
local animator = rig.Humanoid.Animator
for _, t in animator:GetPlayingAnimationTracks() do
	t:Stop(0)
end
local tree = AnimRig.tree(rig)
local clip = AnimClip.keyframes(tree, {
	name = "Raise",
	priority = "Action",
	keys = {
		{ t = 0, poses = { RightUpperArm = CFrame.new() } },
		{ t = 1, poses = { RightUpperArm = CFrame.Angles(math.rad(90), 0, 0) } },
	},
	markers = {
		{ t = 0.5, name = "Mid", value = "x" },
		{ t = 1, name = "Hit", value = "heavy" },
		-- a fresh hash every run, so the load below is a first load
		{ t = 0.1, name = "Nonce", value = tostring(os.clock()) },
	},
	names = { [1] = "End" },
})
clip.Parent = game:GetService("ServerStorage"):WaitForChild("AnimTestClips")
local id = AnimClip.register(clip)
local anim = Instance.new("Animation")
anim.AnimationId = id
local track = animator:LoadAnimation(anim)
local lengthAtLoad = track.Length
local t0 = os.clock()
while track.Length == 0 and os.clock() - t0 < 5 do
	task.wait()
end
local loadWait = os.clock() - t0
local fired = {}
track:GetMarkerReachedSignal("Mid"):Connect(function(v)
	table.insert(fired, "Mid:" .. v)
end)
track:GetMarkerReachedSignal("Hit"):Connect(function(v)
	table.insert(fired, "Hit:" .. v)
end)
track:Play(0)
animator:StepAnimations(0)
local samples = {}
for _ = 1, 4 do
	animator:StepAnimations(0.25)
	local rx = math.deg((rig.RightUpperArm.RightShoulder.Transform:ToEulerAnglesXYZ()))
	table.insert(samples, math.floor(rx * 10 + 0.5) / 10)
end
task.wait()
local endOk, endTime = pcall(function()
	return track:GetTimeOfKeyframe("End")
end)
local markerOk, markerErr = pcall(function()
	return track:GetTimeOfKeyframe("Hit")
end)
local stillPosed = #AnimRig.dirty(rig)
track:Stop(0)
animator:StepAnimations(0)
rig:SetAttribute("RaiseId", id)
return {
	id = id,
	idIsHash = #id == 32,
	lengthAtLoad = lengthAtLoad,
	length = track.Length,
	loadWait = math.floor(loadWait * 1000 + 0.5) / 1000,
	samples = samples,
	fired = fired,
	endTime = endOk and endTime or tostring(endTime),
	markerAsKeyframe = markerOk and "found" or tostring(markerErr),
	posedAfterEnd = stillPosed,
	reset = AnimRig.reset(rig),
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L2 (L2, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L2):** run in Studio 0.743 on 2026-10-19:
pass, Length 0 at load, 1 after 0.009 s; shoulder [22.5, 45, 67.5, 90] degrees at 0.25 s steps;
markers [Mid:x, Hit:heavy]; `GetTimeOfKeyframe("End")` 1; a marker name is not a keyframe name
("Could not find a keyframe by that name!").

- `AnimClip.keyframes` writes the nested Pose chain from the root, with Weight 0 on path-only
  parents (P4 shows why).
- A fresh hash loads asynchronously: `Length` is 0 right after `LoadAnimation`, and stepping does
  nothing until it loads.
- `Animator:StepAnimations(dt)` is plugin-level and works through the Studio MCP server in Edit.
  Markers fire during Edit stepping.
- `GetTimeOfKeyframe` takes a keyframe name (set with `names`), not a marker name.
- Name the last keyframe `End` for clips that replace default animations: the default Animate script
  listens for it (Animation Editor docs).

## P3. Build a CurveAnimation in code

Goal: the curve format (EulerRotationCurve, Vector3Curve, FloatCurve, MarkerCurve), registered
through AnimationClipProvider, and a clean start for every Edit measurement. Kit: AnimRig, AnimClip.
Edit data model.

```lua
-- Edit: the clip as a CurveAnimation (EulerRotationCurve, MarkerCurve), and the fade-out of a
-- clip that ended on its own, which still blends into the next clip.
local rig = workspace:WaitForChild("AnimTests"):WaitForChild("Dummy")
local animator = rig.Humanoid.Animator
AnimClip.settle(animator)
local tree = AnimRig.tree(rig)
local raised = CFrame.Angles(math.rad(90), 0, 0)
local function rx()
	return math.floor(math.deg((rig.RightUpperArm.RightShoulder.Transform:ToEulerAnglesXYZ())) * 10 + 0.5) / 10
end
local clip = AnimClip.curves(tree, {
	name = "RaiseCurve",
	priority = "Action",
	keys = {
		{ t = 0, poses = { RightUpperArm = CFrame.new() } },
		{ t = 1, poses = { RightUpperArm = raised } },
	},
	markers = { { t = 0.5, name = "Hit", value = "heavy" }, { t = 0.9, name = "Nonce", value = tostring(os.clock()) } },
})
clip.Parent = game:GetService("ServerStorage"):WaitForChild("AnimTestClips")
local track, id = AnimClip.load(animator, clip)
local fired = {}
track:GetMarkerReachedSignal("Hit"):Connect(function(v)
	table.insert(fired, v)
end)
-- Samples every 0.125 s from 0 to 1.
local function run()
	track:Play(0)
	animator:StepAnimations(0)
	local samples = { rx() }
	for _ = 1, 8 do
		animator:StepAnimations(0.125)
		table.insert(samples, rx())
	end
	track:Stop(0)
	return samples
end
local clean = run()
-- A short clip held at 90 degrees runs to its end; Stop(0) and a zero step follow.
local hold = AnimClip.keyframes(tree, {
	name = "Hold90",
	priority = "Action",
	keys = { { t = 0, poses = { RightUpperArm = raised } }, { t = 0.25, poses = { RightUpperArm = raised } } },
})
local holdTrack = AnimClip.load(animator, hold)
holdTrack:Play(0)
animator:StepAnimations(0.3)
local holdPlayingAtEnd = holdTrack.IsPlaying
holdTrack:Stop(0)
animator:StepAnimations(0)
local afterEnded = run()
AnimClip.settle(animator)
local afterSettle = run()
task.wait() -- marker signals are deferred
AnimClip.settle(animator)
return {
	id = id,
	length = track.Length,
	priority = track.Priority.Name,
	clean = clean,
	holdPlayingAtEnd = holdPlayingAtEnd,
	afterEnded = afterEnded,
	afterSettle = afterSettle,
	fired = fired,
	reset = AnimRig.reset(rig),
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L3 (L3, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L3):** run in Studio 0.743 on 2026-10-19:
pass, shoulder [0, 11.2, 22.5, 33.7, 45, 56.3, 67.5, 78.8, 90] degrees every 0.125 s from 0 to 1 s;
right after a clip held at 90 degrees ended on its own (IsPlaying false) and got Stop(0): [45, 39.9,
31.8, 33.7, 45, 56.3, 67.5, 78.8, 90]; after `AnimClip.settle`: [0, 11.2, 22.5, 33.7, 45, 56.3,
67.5, 78.8, 90]; Hit marker [heavy, heavy, heavy].

- Folders mirror the part hierarchy (`HumanoidRootPart > LowerTorso > UpperTorso > RightUpperArm`),
  each with `Rotation` and `Position` channels.
- Markers live in one `MarkerCurve` per name at the clip's root.
- A non-looped clip that reaches its end keeps fading out and blends its last pose into the next
  clip. `Stop(0)` and a zero step do not cut that fade [added].
- In Edit, call `AnimClip.settle(animator)` (stop every track, step 0.5 s) before each measured
  clip. In game, the same fade smooths the change; play the next clip with an explicit fade if the
  timing matters.
- The default fade-out after a natural end lasts about 0.3 s: L6 measured `Ended` 316 ms after
  `Stopped`.

## P4. Layering: priorities, weights, fades, partial keying

Goal: predict which track wins each joint. Kit: AnimRig, AnimClip. Edit data model.

```lua
-- Edit: priorities, weights, fades, partial keying, identity keys and pass-through poses.
local rig = workspace:WaitForChild("AnimTests"):WaitForChild("Dummy")
local animator = rig.Humanoid.Animator
local tree = AnimRig.tree(rig)
local nonce = tostring(os.clock())

local function stopAll()
	for _, t in animator:GetPlayingAnimationTracks() do
		t:Stop(0)
	end
	animator:StepAnimations(0)
end

-- A looping clip holding fixed X rotations (degrees) on the named parts.
local function hold(name, priority, angles)
	local poses = {}
	for part, deg in angles do
		poses[part] = CFrame.Angles(math.rad(deg), 0, 0)
	end
	local clip = AnimClip.keyframes(tree, {
		name = name,
		loop = true,
		priority = priority,
		keys = { { t = 0, poses = poses }, { t = 1, poses = poses } },
		markers = { { t = 0.5, name = "Nonce", value = nonce .. name } },
	})
	return (AnimClip.load(animator, clip, { name = name }))
end

local function rx(joint)
	local j = AnimRig.joint(rig, joint)
	return math.floor(math.deg((j.Transform:ToEulerAnglesXYZ())) * 10 + 0.5) / 10
end
local function waistY()
	return math.floor(math.deg(select(2, rig.UpperTorso.Waist.Transform:ToEulerAnglesXYZ())) * 10 + 0.5) / 10
end

local out = {}
AnimClip.settle(animator) -- an earlier clip that ended on its own would still blend in
local idle = hold("Idle30", "Idle", { RightUpperArm = 30, LeftUpperLeg = 20 })
local act = hold("Act90", "Action", { RightUpperArm = 90 })
local act2 = hold("Act60", "Action", { RightUpperArm = 60 })

idle:Play(0)
act:Play(0)
animator:StepAnimations(0.1)
out.higherPriority = { shoulder = rx("RightShoulder"), hipUnkeyed = rx("LeftHip") }

act2:Play(0)
animator:StepAnimations(0.1)
out.samePriorityEqual = rx("RightShoulder")

act2:AdjustWeight(0.25, 0)
animator:StepAnimations(0.1)
out.samePriority1vs025 = rx("RightShoulder")

act2:Stop(0)
act:AdjustWeight(0.5, 0)
animator:StepAnimations(0.1)
out.actionHalfOverIdle = rx("RightShoulder")

-- Fade-in of a never-played track.
stopAll()
idle:Play(0)
local fresh = hold("Fresh90", "Action", { RightUpperArm = 90 })
fresh:Play(0.4)
local fade = {}
for _ = 1, 5 do
	animator:StepAnimations(0.1)
	table.insert(fade, { w = math.floor(fresh.WeightCurrent * 100 + 0.5) / 100, shoulder = rx("RightShoulder") })
end
out.fadeIn = fade

-- Fade-out: Stop(0.4) ramps the weight down, the lower priority comes back.
fresh:Stop(0.4)
local fadeOut = {}
for _ = 1, 5 do
	animator:StepAnimations(0.1)
	table.insert(fadeOut, { w = math.floor(fresh.WeightCurrent * 100 + 0.5) / 100, shoulder = rx("RightShoulder") })
end
out.fadeOut = fadeOut

-- An identity key at Action still overrides a Movement clip on that joint.
stopAll()
local walk = hold("Walk40", "Movement", { LeftUpperLeg = 40 })
local legs = hold("ActLegs0", "Action", { LeftUpperLeg = 0, RightUpperArm = 90 })
walk:Play(0)
legs:Play(0)
animator:StepAnimations(0.1)
out.identityKeyOverrides = rx("LeftHip")

-- Pass-through poses: Weight 0 lets the lower priority through, Weight 1 (the default) overrides it.
stopAll()
local KSP = game:GetService("KeyframeSequenceProvider")
local function raw(priority, build)
	local kfs = Instance.new("KeyframeSequence")
	kfs.Loop = true
	kfs.Priority = priority
	for _, t in { 0, 1 } do
		local kf = Instance.new("Keyframe")
		kf.Time = t
		kf.Parent = kfs
		build(kf)
	end
	local m = Instance.new("KeyframeMarker")
	m.Name = "Nonce"
	m.Value = nonce .. tostring(priority) .. tostring(math.random())
	m.Parent = kfs:GetKeyframes()[1]
	return (AnimClip.load(animator, KSP:RegisterKeyframeSequence(kfs)))
end
local function P(name, parent, cf, w)
	local p = Instance.new("Pose")
	p.Name = name
	p.CFrame = cf or CFrame.new()
	if w then
		p.Weight = w
	end
	p.Parent = parent
	return p
end
local twist = raw(Enum.AnimationPriority.Idle, function(kf)
	P("UpperTorso", P("LowerTorso", P("HumanoidRootPart", kf)), CFrame.Angles(0, math.rad(30), 0))
end)
local function armOnly(w)
	return raw(Enum.AnimationPriority.Action, function(kf)
		local u = P("UpperTorso", P("LowerTorso", P("HumanoidRootPart", kf, nil, w), nil, w), nil, w)
		P("RightUpperArm", u, CFrame.Angles(math.rad(90), 0, 0))
	end)
end
twist:Play(0)
animator:StepAnimations(0.1)
out.waistIdleOnly = waistY()
local a0 = armOnly(0)
a0:Play(0)
animator:StepAnimations(0.1)
out.waistUnderWeight0Path = waistY()
a0:Stop(0)
local a1 = armOnly(1)
a1:Play(0)
animator:StepAnimations(0.1)
out.waistUnderWeight1Path = waistY()
a1:Stop(0)
local flat = raw(Enum.AnimationPriority.Action, function(kf)
	P("RightUpperArm", kf, CFrame.Angles(math.rad(90), 0, 0))
end)
flat:Play(0)
animator:StepAnimations(0.1)
out.flatPose = { arm = rx("RightShoulder"), waist = waistY() }
stopAll()
out.reset = AnimRig.reset(rig)
return out
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L4 (L4, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L4):** run in Studio 0.743 on 2026-10-19:
pass, Action 90 over Idle 30: shoulder 90, unkeyed hip keeps 20; equal-priority 90 and 60: 75 at
equal weights, 84 at 1 and 0.25; Action at 0.5 over Idle: 60; fade-in weights [0.25, 0.5, 0.75, 1,
1]; fade-out [0.75, 0.5, 0.25, 0, 0]; identity key overrides Movement: hip 0; waist under Weight 0
path 30, under Weight 1 path 0; flat Pose under the keyframe: arm 0.

- A higher priority wins only the joints it keys; other joints keep the lower track (hip stays 20).
- Within one priority, tracks blend as a weighted mean: 75 for 90 and 60 degrees at equal weights,
  84 at weights 1 and 0.25.
- Two early runs read 77.2 at equal weights: the clip of the previous test was still fading out
  (P3). Settle the Animator before measuring a blend.
- Fades are linear over the fade time in both directions.
- An identity key is still a key: an Action clip that keys a leg at rest freezes the walk on that
  leg.
- Pose `Weight` is deprecated in the API reference but still applies [added]: path-only parents at
  Weight 1 overwrite the lower track's waist.
- A Pose placed directly under the Keyframe, outside the hierarchy, does nothing.

## P5. Preview in Edit and leave the rig clean

Goal: capture a clip at chosen times without a playtest, then reset. Kit: AnimRig, AnimClip,
AnimAudit.

Runner side (`run_live.py` L5):

```python
setup = '''local rig = workspace.AnimTests.Dummy
local animator = rig.Humanoid.Animator
local id = rig:GetAttribute("RaiseId")
local track
for _, t in animator:GetPlayingAnimationTracks() do
	if t.Animation and t.Animation.AnimationId == id then track = t end
end
if not track then
	local a = Instance.new("Animation")
	a.AnimationId = id
	track = animator:LoadAnimation(a)
end
'''
sheet = A.pose_sheet(s, setup, [0, 0.25, 0.5, 0.75, 1.0], "evidence/pose_raise",
                     {"camera_position": [7, 4.5, -13], "look_at_position": [0, 3.5, -10.5]}, name="raise")
```

Then the audit of a posed rig:

```lua
-- Edit: a preview leaves the pose on the joints; AnimAudit reports it, AnimRig.reset clears it.
local rig = workspace:WaitForChild("AnimTests"):WaitForChild("Dummy")
local animator = rig.Humanoid.Animator
local anim = Instance.new("Animation")
anim.AnimationId = rig:GetAttribute("RaiseId")
local track = animator:LoadAnimation(anim)
AnimClip.at(animator, track, 0.5)
local function posed()
	local n = 0
	for _, f in AnimAudit.rigs(workspace:WaitForChild("AnimTests"), { edit = true }) do
		if f.rule == "posed-in-edit" then
			n += 1
		end
	end
	return n
end
local playing = #animator:GetPlayingAnimationTracks()
track:Stop(0)
animator:StepAnimations(0)
local afterStop = posed()
local reset = AnimRig.reset(rig)
return { playingWhilePosed = playing, posedAfterStop = afterStop, reset = reset, posedAfterReset = posed() }
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L5 (L5, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L5):** run in Studio 0.743 on 2026-10-19:
pass, arm [0, 22.5, 45, 67.5, 90] degrees at 0, 0.25, 0.5, 0.75, 1 s; frame differences [0.002,
0.002, 0.003, 0.003]; posed joints after Stop 1, after reset 0; sheet
`tests/live_evidence/scenario-roblox-animation/pose_raise/raise_sheet.png`.

- A stopped track leaves its last pose on the joints in Edit; saving then stores a posed rig.
  `AnimRig.reset` sets every non-identity `Transform` back.
- Read the contact sheet, never the single captures one by one.

## P6. Play on the player's character and check replication and timing

Goal: the owning client plays; the server must see the same pose. Kit: AnimRig, AnimClip. Playtest.

Client:

```lua
-- Client: the owner plays a code-built clip on its own character.
local char = game:GetService("Players").LocalPlayer.Character
local animator = char.Humanoid:WaitForChild("Animator")
local arm = CFrame.Angles(math.rad(90), 0, 0)
local clip = AnimClip.keyframes(AnimRig.tree(char), {
	name = "ClientRaise",
	loop = true,
	priority = "Action",
	keys = { { t = 0, poses = { RightUpperArm = arm } }, { t = 1, poses = { RightUpperArm = arm } } },
	markers = { { t = 0.5, name = "Nonce", value = tostring(os.clock()) } },
})
local track, id = AnimClip.load(animator, clip, { name = "ClientRaise" })
track:Play(0)
task.wait(0.5)
local rs = AnimRig.joint(char, "RightShoulder")
local root = char.HumanoidRootPart
local cam = workspace.CurrentCamera
cam.CameraType = Enum.CameraType.Scriptable
cam.CFrame = CFrame.lookAt(root.Position + root.CFrame.RightVector * 7 + Vector3.new(0, 1.5, 0), root.Position + Vector3.new(0, 1, 0))
return {
	id = id,
	name = track.Name,
	length = track.Length,
	rx = math.deg((rs.Transform:ToEulerAnglesXYZ())),
	tracks = AnimClip.tracks(animator),
}
```

Server (`__ID__` is the client's id):

```lua
-- Server: what the server sees of the client-played track.
local ID = "__ID__"
local char = game:GetService("Players"):GetPlayers()[1].Character
local animator = char.Humanoid.Animator
local seen
for _, t in animator:GetPlayingAnimationTracks() do
	if t.Animation and t.Animation.AnimationId == ID then
		seen = t
	end
end
local rs = AnimRig.joint(char, "RightShoulder")
return {
	found = seen ~= nil,
	name = seen and seen.Name or "",
	priority = seen and seen.Priority.Name or "",
	weight = seen and seen.WeightCurrent or -1,
	length = seen and seen.Length or -1,
	rx = math.deg((rs.Transform:ToEulerAnglesXYZ())),
	playing = #animator:GetPlayingAnimationTracks(),
}
```

Client, timing:

```lua
-- Client: marker timing at real frame rate, Play's speed argument, Stopped and Ended.
local RunService = game:GetService("RunService")
local char = game:GetService("Players").LocalPlayer.Character
local animator = char.Humanoid.Animator
for _, t in animator:GetPlayingAnimationTracks() do
	if t.Name == "ClientRaise" then
		t:Stop(0)
	end
end
local clip = AnimClip.keyframes(AnimRig.tree(char), {
	name = "Swing",
	priority = "Action",
	keys = {
		{ t = 0, poses = { LeftUpperArm = CFrame.new() } },
		{ t = 0.5, poses = { LeftUpperArm = CFrame.Angles(math.rad(60), 0, 0) } },
		{ t = 1, poses = { LeftUpperArm = CFrame.Angles(math.rad(120), 0, 0) } },
	},
	markers = { { t = 0.5, name = "Hit", value = "light" }, { t = 0.9, name = "Nonce", value = tostring(os.clock()) } },
})
local track = AnimClip.load(animator, clip)
local hitAt, endedAt, stoppedAt
track:GetMarkerReachedSignal("Hit"):Connect(function(v)
	hitAt = { os.clock(), track.TimePosition, v }
end)
track.Ended:Connect(function()
	endedAt = os.clock()
end)
track.Stopped:Connect(function()
	stoppedAt = os.clock()
end)
track:AdjustSpeed(0.5)
local speedBeforePlay = track.Speed
local start = os.clock()
track:Play(0.1, 1, 2)
local speedAfterPlay = track.Speed
local frames = 0
while not endedAt and os.clock() - start < 3 do
	RunService.Heartbeat:Wait()
	frames += 1
end
local function ms(x)
	return x and math.floor((x - start) * 1000 + 0.5) or -1
end
return {
	speedBeforePlay = speedBeforePlay,
	speedAfterPlay = speedAfterPlay,
	hitMs = hitAt and ms(hitAt[1]) or -1,
	hitTrackTime = hitAt and hitAt[2] or -1,
	hitValue = hitAt and hitAt[3] or "",
	stoppedMs = ms(stoppedAt),
	endedMs = ms(endedAt),
	frameMs = math.floor((os.clock() - start) / math.max(frames, 1) * 1000 * 10 + 0.5) / 10,
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L6 (L6, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L6):** run in Studio 0.743 on 2026-10-19:
pass, client shoulder 90.00 degrees; server finds the track (name `Animation`, priority Action,
shoulder 90.00); speed 0.5 after AdjustSpeed then 2 after Play; marker at 267 ms (track time 0.533),
Stopped 500 ms, Ended 817 ms, frame 16.3 ms.

- Track names do not replicate: the server sees the generic name. Match tracks by
  `Animation.AnimationId`.
- In a Studio playtest, a temporary id registered on the client also posed the joints on the server.
  A live server needs a published id.
- `Play(fade, weight, speed)` sets the speed; an earlier `AdjustSpeed` is overridden.
- `Stopped` fires when playback ends; `Ended` fires after the fade-out, about 0.3 s later here.

## P7. Faces on a dynamic head

Goal: an expression that holds and replicates. Kit: AnimClip, AnimFace. Playtest with an avatar that
has a dynamic head.

Client, what reverts and what holds:

```lua
-- Client: FaceControls on the player's dynamic head: single writes and tweens revert,
-- a write every PreSimulation holds.
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local char = game:GetService("Players").LocalPlayer.Character
local fc = char.Head:FindFirstChildOfClass("FaceControls")
if not fc then
	return { faceControls = false }
end
local out = { faceControls = true }
fc.JawDrop = 0.8
task.wait(0.5)
out.singleWrite = fc.JawDrop
local tw = TweenService:Create(fc, TweenInfo.new(0.25), { JawDrop = 0.7 })
tw:Play()
task.wait(0.15)
local mid = fc.JawDrop
tw.Completed:Wait()
local atEnd = fc.JawDrop
task.wait(0.3)
out.tween = { mid = mid, atEnd = atEnd, after = fc.JawDrop }
local conn = AnimFace.hold(fc, function()
	return { JawDrop = 0.8 }
end)
task.wait(0.3)
local held = fc.JawDrop
local atRender
local c2 = RunService.PreRender:Connect(function()
	atRender = fc.JawDrop
end)
task.wait(0.1)
c2:Disconnect()
conn:Disconnect()
task.wait(0.4)
out.perFrame = { held = held, atPreRender = atRender, afterDisconnect = fc.JawDrop }
local head = char.Head
local cam = workspace.CurrentCamera
cam.CameraType = Enum.CameraType.Scriptable
cam.FieldOfView = 30
cam.CFrame = CFrame.lookAt(head.Position + head.CFrame.LookVector * 3 + Vector3.new(0, 0.2, 0), head.Position)
return out
```

Client, the face clip:

```lua
-- Client: a face clip (CurveAnimation with a FaceControls folder) holds the expression.
local char = game:GetService("Players").LocalPlayer.Character
local fc = char.Head:FindFirstChildOfClass("FaceControls")
local animator = char.Humanoid.Animator
local clip = AnimFace.clip("Surprised", AnimFace.POSES.Surprised)
local track, id = AnimClip.load(animator, clip, { name = "FaceSurprised" })
track:Play(0.1)
task.wait(0.5)
return {
	id = id,
	length = track.Length,
	values = AnimFace.read(fc, { "JawDrop", "LeftInnerBrowRaiser", "RightOuterBrowRaiser" }),
}
```

Server:

```lua
-- Server: the face clip played by the owning client replicates.
local char = game:GetService("Players"):GetPlayers()[1].Character
local fc = char.Head:FindFirstChildOfClass("FaceControls")
return AnimFace.read(fc, { "JawDrop", "LeftInnerBrowRaiser", "RightOuterBrowRaiser" })
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L10 (L10, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L10):** run in Studio 0.743 on 2026-10-19:
pass, single write 0 after 0.5 s; tween 0.70 at completion, 0 0.3 s later; per-frame write 0.80
(also at PreRender), 0 after disconnect; face clip {LeftInnerBrowRaiser: 1, JawDrop: 0.55,
RightOuterBrowRaiser: 0.8} on the client, {LeftInnerBrowRaiser: 1, JawDrop: 0.55,
RightOuterBrowRaiser: 0.8} on the server; neutral versus clip capture difference 0.0019.

Client, the single write again with every Animator track stopped (run last in the playtest):

```lua
-- Client: the same single FaceControls write with every track on the Animator stopped.
local char = game:GetService("Players").LocalPlayer.Character
local animator = char.Humanoid.Animator
local fc = char.Head:FindFirstChildOfClass("FaceControls")
if not fc then
	return { faceControls = false }
end
for _, t in animator:GetPlayingAnimationTracks() do
	t:Stop(0)
end
task.wait(0.5)
local playingAtWrite = #animator:GetPlayingAnimationTracks()
fc.JawDrop = 0.8
local atWrite = fc.JawDrop
task.wait(0.5)
return {
	faceControls = true,
	playingAtWrite = playingAtWrite,
	atWrite = atWrite,
	after05 = fc.JawDrop,
	playingAfter = #animator:GetPlayingAnimationTracks(),
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L16 (L16, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L16):** run in Studio 0.743 on 2026-10-19:
pass, tracks playing at the write 0; JawDrop 0.80 right after the write, 0 0.5 s later; tracks
playing then 0.

- Single writes and tweens revert on a player's head: do not drive expressions that way.
- A per-frame write in PreSimulation (`AnimFace.hold`) holds on the writing client. The test did not
  read the server during the hold; use a clip when others must see the face.
- A face clip (`AnimFace.clip`) holds, replicates to the server, and plays like any track (priority,
  fade, stop).
- On the test avatar's head, the jaw drop showed as an open mouth and the brow values did not show.
  Judge expressions on the target head with a neutral and an expression capture side by side
  (`play_face_neutral.png`, `play_face.png`).

## P8. NPCs and creatures animated from the server

Goal: server-played tracks on an R15 NPC and on a part-built creature with an AnimationController.
Kit: AnimRig, AnimClip. Playtest.

Server:

```lua
-- Server: an R15 NPC and a part-built creature animated from the server.
local Players = game:GetService("Players")
local folder = workspace:FindFirstChild("ServerRigs") or Instance.new("Folder")
folder.Name = "ServerRigs"
folder.Parent = workspace
local npc = Players:CreateHumanoidModelFromDescriptionAsync(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
npc.Name = "NPC"
npc:PivotTo(CFrame.new(-8, 3, -8))
npc.Parent = folder
local wave = CFrame.Angles(math.rad(150), 0, 0)
local npcClip = AnimClip.keyframes(AnimRig.tree(npc), {
	name = "Wave",
	loop = true,
	keys = { { t = 0, poses = { LeftUpperArm = wave } }, { t = 1, poses = { LeftUpperArm = wave } } },
	markers = { { t = 0.5, name = "Nonce", value = tostring(os.clock()) } },
})
local npcTrack = AnimClip.load(npc.Humanoid.Animator, npcClip)
npcTrack:Play(0)

local here = CFrame.new(8, 2, -8)
local creature = AnimRig.build({
	name = "Creature",
	controller = "AnimationController",
	root = { cframe = here, size = Vector3.new(2, 1, 4), anchored = true },
	parts = {
		{ name = "Body", parent = "HumanoidRootPart", size = Vector3.new(2, 1.5, 4), cframe = here },
		{
			name = "Tail",
			parent = "Body",
			size = Vector3.new(0.5, 0.5, 3),
			cframe = here * CFrame.new(0, 0, 3.5),
			joint = here * CFrame.new(0, 0, 2),
			jointName = "TailJoint",
		},
	},
})
creature.Parent = folder
local tail = AnimClip.keyframes(AnimRig.tree(creature), {
	name = "TailSwing",
	loop = true,
	priority = "Idle",
	keys = {
		{ t = 0, poses = { Tail = CFrame.Angles(0, math.rad(-40), 0) }, easing = "Cubic", direction = "InOut" },
		{ t = 0.5, poses = { Tail = CFrame.Angles(0, math.rad(40), 0) }, easing = "Cubic", direction = "InOut" },
		{ t = 1, poses = { Tail = CFrame.Angles(0, math.rad(-40), 0) }, easing = "Cubic", direction = "InOut" },
	},
	markers = { { t = 0.25, name = "Nonce", value = tostring(os.clock()) } },
})
local tailTrack = AnimClip.load(creature.AnimationController.Animator, tail)
tailTrack:Play(0)
task.wait(0.3)
return {
	npcPlaying = npcTrack.IsPlaying,
	creaturePlaying = tailTrack.IsPlaying,
	creatureJoint = creature.Tail.TailJoint.ClassName,
	tailYaw = math.deg(select(2, creature.Tail.TailJoint.Transform:ToEulerAnglesXYZ())),
}
```

Client:

```lua
-- Client: the server-played tracks replicate to the client.
local folder = workspace:WaitForChild("ServerRigs", 5)
local npc = folder:WaitForChild("NPC", 5)
local creature = folder:WaitForChild("Creature", 5)
task.wait(0.5)
local tails = {}
for _ = 1, 6 do
	task.wait(0.1)
	table.insert(tails, math.floor(math.deg(select(2, creature.Tail.TailJoint.Transform:ToEulerAnglesXYZ()))))
end
local cam = workspace.CurrentCamera
cam.CameraType = Enum.CameraType.Scriptable
cam.CFrame = CFrame.lookAt(Vector3.new(0, 7, 6), Vector3.new(0, 2, -8))
return {
	npcTracks = AnimClip.tracks(npc.Humanoid:WaitForChild("Animator")),
	creatureTracks = AnimClip.tracks(creature.AnimationController:WaitForChild("Animator")),
	npcArm = math.deg((npc.LeftUpperArm.LeftShoulder.Transform:ToEulerAnglesXYZ())),
	tails = tails,
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L7 (L7, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L7):** run in Studio 0.743 on 2026-10-19:
pass, client sees the NPC track at weight 1, NPC arm 150.00 degrees, creature tail [-40, -39, -21,
23, 38, 39] degrees over 0.6 s (span 79).

- `AnimRig.build` joins parts with Motor6D, C0 and C1 taken from a world joint frame, and adds an
  AnimationController with an Animator.
- Easing per key (`easing = "Cubic", direction = "InOut"`) shapes the tail swing.
- For many NPCs, cull by distance: anchor and disable Animators out of range (Peter McNeill, RDC
  2025 rwLEnBtXr30 00:09:24).
- A Custom skinned import (root named `RootPart`), complete player and NPC scripts that play their
  tracks, and creature foot planting: `characters.md`.

## P9. Procedural layer on top of the tracks

Goal: aim, lean or look offsets that stack on the animation. Kit: AnimRig. Playtest, client.

```lua
-- Client: a procedural layer multiplied into Transform in PreSimulation, on top of the tracks.
local RunService = game:GetService("RunService")
local char = game:GetService("Players").LocalPlayer.Character
local neck = AnimRig.joint(char, "Neck")
local animator = char.Humanoid.Animator
local applied, skipped = 0, 0
local conn = RunService.PreSimulation:Connect(function()
	if animator.EvaluationThrottled then
		skipped += 1
		return
	end
	neck.Transform = CFrame.Angles(0, math.rad(45), 0) * neck.Transform
	applied += 1
end)
task.wait(0.5)
local yaw = math.deg(select(2, neck.Transform:ToEulerAnglesXYZ()))
local headLook = char.Head.CFrame.LookVector
local rootLook = char.HumanoidRootPart.CFrame.LookVector
local headVsRoot = math.deg(math.acos(math.clamp(headLook:Dot(rootLook), -1, 1)))
conn:Disconnect()
task.wait(0.2)
local after = math.deg(select(2, neck.Transform:ToEulerAnglesXYZ()))
local okC0, errC0 = pcall(function()
	neck.C0 = neck.C0
end)
return {
	neckClass = neck.ClassName,
	applied = applied,
	skipped = skipped,
	neckYaw = yaw,
	headYawVsRoot = headVsRoot,
	neckYawAfterDisconnect = after,
	c0Write = okC0 and "ok" or tostring(errC0),
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L8 (L8, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L8):** run in Studio 0.743 on 2026-10-19:
pass, joint class AnimationConstraint; 31 frames applied, 0 skipped; neck yaw 41.90 degrees, head
45.41 degrees off the root, -2.98 after disconnect; C0 write: "Unable to assign property C0.
Property is read only".

- Multiply the offset into `Transform` every PreSimulation: the Animator rewrites `Transform` each
  frame, so the layer must run each frame.
- Skip the work when `Animator.EvaluationThrottled` is true.
- `Transform` does not replicate (Suphi Kaner, BRYp2-rdpXQ 00:02:12): run the layer on every client
  that should see it.

## P10. Blender to Studio

Goal: a Blender action that plays in Studio with the same pose, and an FBX with the Roblox settings.
Blender side runs headless; the Studio side runs in Edit. Kit: AnimRig, AnimClip.

```python
b = A.blender("make-test-rig", out="rig.blend")              # or your own .blend
audit = A.blender("audit", blend="rig.blend")                 # findings must be empty
A.blender("export", blend="rig.blend", out="walk.fbx")        # armature only, Roblox settings
fbx = A.blender("inspect-fbx", fbx="walk.fbx")                # no _end bones, 25 frames
A.blender("sample", blend="rig.blend", out="walk.json", scale=2)
r = A.run(s, LUAU_BELOW.replace("__DATA__", A.samples_luau("walk.json")), kit=["AnimRig", "AnimClip"])
```

FBX settings written by `export` (Mykaiju, NI7GXKLwk6U 00:24:30, 00:25:51; Add Leaf Bones and
Simplify from his speech): Object Types Armature, Scale 1.0, Apply Scalings All Local
(`FBX_SCALE_NONE`), Forward -Z, Up Y, Apply Unit, Use Space Transform, Apply Transform off, Add Leaf
Bones off, Bake Animation with Key All Bones, NLA Strips off, All Actions off, Force Start/End
Keying on, Sampling Rate 1, Simplify 0.

**Test:** `tests/code/scenario-roblox-animation/run_offline.sh` (O4). **Result (O4):** run offline
(luau-lsp, Selene, StyLua, Lune 0.11, Blender 5.2.1) on 2026-10-19: pass, good rig audit []; bad rig
audit [fps, influences, root-weights, scale-keys]; FBX 98172 bytes, 10 bones, armature scale after
re-import [1.0, 1.0, 1.0], leaf bones [] (Blender default: 6 `_end` bones), actions [{name:
Creature|Scene, start: 1.0, end: 25.0}].

Studio side:

```lua
-- Edit: Blender samples -> part rig -> KeyframeSequence -> stepped pose matches Blender's bone tails.
-- __DATA__ is replaced by rbx_animation.samples_luau(<sample json>).
local data = __DATA__
local folder = workspace:WaitForChild("AnimTests")
local old = folder:FindFirstChild("BlenderCreature")
if old then
	old:Destroy()
end
local origin = CFrame.new(-12, 1, -16)
local function cf(a)
	return CFrame.new(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12])
end
local parts = {}
for i, b in data.rest do
	local jf = origin * cf(b.cframe)
	table.insert(parts, {
		name = b.name,
		parent = b.parent or "HumanoidRootPart",
		size = Vector3.new(0.3, math.max(b.length, 0.2), 0.3),
		cframe = jf * CFrame.new(0, b.length / 2, 0),
		joint = jf,
		color = Color3.fromHSV((i * 0.13) % 1, 0.6, 0.9),
	})
end
local rig = AnimRig.build({
	name = "BlenderCreature",
	controller = "AnimationController",
	root = { cframe = origin, size = Vector3.new(0.4, 0.4, 0.4), anchored = true },
	parts = parts,
})
rig.Parent = folder
local animator = rig.AnimationController.Animator
local kfs = AnimClip.fromSamples(AnimRig.tree(rig), data, { name = "BlenderWalk", priority = "Action" })
kfs.Parent = game:GetService("ServerStorage"):WaitForChild("AnimTestClips")
local track, id = AnimClip.load(animator, kfs)
rig:SetAttribute("ClipId", id)

local frames, worst, worstParts = {}, 0, 0
for _, f in { 0, 6, 12, 18, 23 } do
	AnimClip.at(animator, track, f / data.fps)
	-- Forward kinematics from C0 * Transform, independent of whether Edit moves the parts.
	local posed = { HumanoidRootPart = rig.HumanoidRootPart.CFrame }
	local err = 0
	for _, b in data.rest do
		local m = rig[b.name]:FindFirstChildOfClass("Motor6D")
		local joint = posed[b.parent or "HumanoidRootPart"] * m.C0 * m.Transform
		posed[b.name] = joint * m.C1:Inverse()
		local e = data.tails[b.name][f + 1]
		local expected = origin * Vector3.new(e[1], e[2], e[3])
		err = math.max(err, (joint * Vector3.new(0, b.length, 0) - expected).Magnitude)
		local fromPart = (rig[b.name].CFrame * m.C1) * Vector3.new(0, b.length, 0)
		worstParts = math.max(worstParts, (fromPart - expected).Magnitude)
	end
	worst = math.max(worst, err)
	table.insert(frames, { frame = f, time = math.floor(track.TimePosition * 1000 + 0.5) / 1000, maxError = err })
end
track:Stop(0)
animator:StepAnimations(0)
return {
	bones = #data.rest,
	keyframes = #kfs:GetKeyframes(),
	length = track.Length,
	frames = frames,
	maxTailError = worst,
	maxTailErrorFromParts = worstParts,
	reset = AnimRig.reset(rig),
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L12 (L12, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L12):** run in Studio 0.743 on 2026-10-19:
pass, 10 bones, 25 keyframes, Length 1; worst bone-tail error 0.00019 studs from the joints and
0.00019 from the part positions; sheet
`tests/live_evidence/scenario-roblox-animation/pose_blender/creature_sheet.png`.

- The Studio import of the FBX (Animation Editor > `⋯` > Import > From FBX Animation) is GUI-only
  and was not run here; the sample bridge proves the same pose in code. After a GUI import, check
  the clip length (24 fps: 25 frames read 1:00) and remove `RBX_MICROBONE_NODES` from Workspace; the
  full import checklist and its code check (`AnimClip.frames`) are in `characters.md`, section 5.
- The FBX re-import names the take after the object and the scene and starts it at frame 1 in
  Blender.
- Choose the scale with the rig: the bridge uses the same factor for rest positions, pose
  translations and tails.

## P11. Custom humanoids, Adaptive Animation and Bones

Goal: know what code can and cannot set up on a non-standard rig. Kit: AnimRig, AnimClip. Edit data
model.

```lua
-- Edit: renamed joints, HumanoidRigDescription, AutoRig, graph classes, Bones.
local folder = workspace:WaitForChild("AnimTests")
local src = folder.Dummy
local rig = src:Clone()
rig.Name = "CustomHumanoid"
for _, d in rig:GetDescendants() do
	if d:IsA("LuaSourceContainer") then
		d:Destroy()
	end
end
rig.RightUpperArm.Name = "ArmUpper_R"
rig.ArmUpper_R.RightShoulder.Name = "Shoulder_R"
rig:PivotTo(CFrame.new(6, 3, -10))
rig.Parent = folder
local out = {}
local hrd = Instance.new("HumanoidRigDescription")
out.jointNames = #hrd:GetJointNames()
local okAuto, errAuto = pcall(function()
	hrd:AutoRig(rig)
end)
out.autoRig = okAuto and "ok" or tostring(errAuto)
hrd.Parent = rig.Humanoid
local map = {}
for _, j in AnimRig.joints(rig) do
	map[j.name] = j.joint
end
map.RightShoulder = map.Shoulder_R
local set = 0
for _, n in hrd:GetJointNames() do
	if map[n] and pcall(function()
		hrd[n] = map[n]
	end) then
		set += 1
	end
end
out.mapped = set
-- An R15 clip (poses named RightUpperArm, LeftUpperArm) on the renamed rig.
local tree = AnimRig.tree(src)
local clip = AnimClip.keyframes(tree, {
	name = "R15Arms",
	loop = true,
	keys = {
		{
			t = 0,
			poses = { RightUpperArm = CFrame.Angles(math.rad(90), 0, 0), LeftUpperArm = CFrame.Angles(math.rad(45), 0, 0) },
		},
		{
			t = 1,
			poses = { RightUpperArm = CFrame.Angles(math.rad(90), 0, 0), LeftUpperArm = CFrame.Angles(math.rad(45), 0, 0) },
		},
	},
	markers = { { t = 0.5, name = "Nonce", value = tostring(os.clock()) } },
})
local animator = rig.Humanoid.Animator
local track = AnimClip.load(animator, clip)
track:Play(0)
animator:StepAnimations(0.2)
out.renamedJoint = math.floor(math.deg((rig.ArmUpper_R.Shoulder_R.Transform:ToEulerAnglesXYZ())) + 0.5)
out.normalJoint = math.floor(math.deg((rig.LeftUpperArm.LeftShoulder.Transform:ToEulerAnglesXYZ())) + 0.5)
track:Stop(0)
animator:StepAnimations(0)
AnimRig.reset(rig)
rig:Destroy()
out.graphClass = select(2, pcall(function()
	return Instance.new("AnimationGraphDefinition").ClassName
end))

-- Bones under a part animate through nested Poses named after the bones.
local m = Instance.new("Model")
m.Name = "BoneRig"
local root = Instance.new("Part")
root.Name = "HumanoidRootPart"
root.Anchored = true
root.Size = Vector3.new(1, 1, 1)
root.CFrame = CFrame.new(-6, 4, -10)
root.Parent = m
local body = Instance.new("Part")
body.Name = "Body"
body.Size = Vector3.new(1, 1, 1)
body.CFrame = root.CFrame
body.Parent = m
local j = Instance.new("Motor6D")
j.Name = "RootJoint"
j.Part0 = root
j.Part1 = body
j.Parent = body
local spine = Instance.new("Bone")
spine.Name = "Spine"
spine.CFrame = CFrame.new(0, 0.5, 0)
spine.Parent = body
local neck = Instance.new("Bone")
neck.Name = "Neck"
neck.CFrame = CFrame.new(0, 1, 0)
neck.Parent = spine
local ac = Instance.new("AnimationController")
ac.Parent = m
local an = Instance.new("Animator")
an.Parent = ac
m.PrimaryPart = root
m.Parent = folder
local btree = AnimRig.tree(m)
local bclip = AnimClip.keyframes(btree, {
	name = "NeckTurn",
	loop = true,
	keys = {
		{ t = 0, poses = { Neck = CFrame.new() } },
		{ t = 1, poses = { Neck = CFrame.Angles(0, 0, math.rad(60)) } },
	},
	markers = { { t = 0.5, name = "Nonce", value = tostring(os.clock()) } },
})
local bt = AnimClip.load(an, bclip)
bt:Play(0)
an:StepAnimations(0.5)
out.bonePath = AnimRig.path(btree, "Neck")
out.neckZ = math.floor(math.deg(select(3, neck.Transform:ToEulerAnglesXYZ())) * 10 + 0.5) / 10
bt:Stop(0)
an:StepAnimations(0)
AnimRig.reset(m)
m:Destroy()
return out
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L14 (L14, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L14):** run in Studio 0.743 on 2026-10-19:
pass, `AutoRig`: "The current thread cannot call 'AutoRig' (lacking capability RobloxScript)"; 22
joint names, 15 mapped; renamed shoulder 0 degrees, normal shoulder 45; Bone path [HumanoidRootPart,
Body, Spine, Neck], neck bone 30 degrees at t 0.5; `AnimationGraphDefinition` creatable.

- Poses bind by part and bone name. A renamed part does not animate from an R15 clip, even with the
  HumanoidRigDescription joints mapped in code.
- A pose binds under the pose of its joint's Part0 or its parent bone, and the path may start below
  the rig's root: a clip authored on a Custom import's raw rig (`RootPart` at its top) still plays
  after `AnimRig.prepareImport`; a pose alone at the top of the clip or under another name stays at
  0 (L17).
- The documented retargeting path uses the Adaptive Animation tool (joint assignment and T-pose,
  GUI) and published clips; not run here.
- Bones animate through Poses nested under their part (`HumanoidRootPart > Body > Spine > Neck`);
  `AnimRig.tree` includes them.

## P12. IKControl: reach and look-at

Goal: hands and heads that follow targets, created on the server. Kit: AnimIK. Playtest.

Server, reach:

```lua
-- Server: a hand IKControl created on the server reaches a target.
local char = game:GetService("Players"):GetPlayers()[1].Character
local root = char.HumanoidRootPart
root.Anchored = true
local part, att = AnimIK.target("IKReachTarget", root.CFrame * CFrame.new(1.2, 1.2, -1.6), workspace)
part.Transparency = 0
part.Color = Color3.fromRGB(255, 60, 60)
local ik = AnimIK.reach(char, { side = "Right", limb = "Arm", target = att })
local gaps = {}
for _ = 1, 6 do
	task.wait(0.1)
	table.insert(gaps, math.floor(AnimIK.gap(ik) * 1000 + 0.5) / 1000)
end
return {
	problems = AnimIK.check(ik),
	gaps = gaps,
	chainCount = ik:GetChainCount(),
	chainLength = ik:GetChainLength(),
}
```

Client:

```lua
-- Client: the server-created IKControl drives the arm on the client too.
local char = game:GetService("Players").LocalPlayer.Character
local ik = char.Humanoid:WaitForChild("ReachRight", 5)
local gaps = {}
for _ = 1, 5 do
	task.wait(0.1)
	table.insert(gaps, math.floor(AnimIK.gap(ik) * 1000 + 0.5) / 1000)
end
return { replicated = ik ~= nil, gaps = gaps }
```

Server, limits and smoothing:

```lua
-- Server: unreachable target, half weight, SmoothTime.
local char = game:GetService("Players"):GetPlayers()[1].Character
local root = char.HumanoidRootPart
local ik = char.Humanoid.ReachRight
local part = workspace:WaitForChild("IKReachTarget")
part.CFrame = root.CFrame * CFrame.new(1.5, 1, -6)
task.wait(0.4)
local unreachable = AnimIK.gap(ik)
ik.Weight = 0.5
part.CFrame = root.CFrame * CFrame.new(1.2, 1.2, -1.6)
task.wait(0.4)
local half = AnimIK.gap(ik)
ik.Weight = 1
ik.SmoothTime = 0.5
part.CFrame = root.CFrame * CFrame.new(1.2, 2.2, -1.2)
local smooth = {}
for _ = 1, 6 do
	task.wait(0.1)
	table.insert(smooth, math.floor(AnimIK.gap(ik) * 1000 + 0.5) / 1000)
end
ik.SmoothTime = 0.05
return { unreachableGap = unreachable, halfWeightGap = half, smooth05 = smooth }
```

Server, look-at:

```lua
-- Server: head look-at with Weight 0.999.
local char = game:GetService("Players"):GetPlayers()[1].Character
local root = char.HumanoidRootPart
local part, att = AnimIK.target("IKLookTarget", root.CFrame * CFrame.new(-4, 2.5, -4), workspace)
part.Transparency = 0
part.Color = Color3.fromRGB(60, 120, 255)
local look = AnimIK.lookAt(char, att)
task.wait(0.6)
local head = char.Head
local function angleTo(p)
	return math.deg(math.acos(math.clamp(head.CFrame.LookVector:Dot((p - head.Position).Unit), -1, 1)))
end
local on = angleTo(att.WorldPosition)
look.Enabled = false
task.wait(0.4)
local off = angleTo(att.WorldPosition)
look.Enabled = true
task.wait(0.4)
return { weight = look.Weight, problems = AnimIK.check(look), angleOn = on, angleOff = off }
```

Client camera for the capture, then cleanup:

```lua
local char = game:GetService("Players").LocalPlayer.Character
local root = char.HumanoidRootPart
local cam = workspace.CurrentCamera
cam.CameraType = Enum.CameraType.Scriptable
cam.CFrame = CFrame.lookAt(
	root.Position + root.CFrame.RightVector * 7 + Vector3.new(0, 2, 0) - root.CFrame.LookVector * 3,
	root.Position + Vector3.new(0, 1, 0) + root.CFrame.LookVector
)
return { lookAt = char.Humanoid:FindFirstChild("LookAt") ~= nil }
```

```lua
local char = game:GetService("Players"):GetPlayers()[1].Character
for _, n in { "ReachRight", "LookAt" } do
	local ik = char.Humanoid:FindFirstChild(n)
	if ik then
		ik:Destroy()
	end
end
for _, n in { "IKReachTarget", "IKLookTarget" } do
	local p = workspace:FindFirstChild(n)
	if p then
		p:Destroy()
	end
end
char.HumanoidRootPart.Anchored = false
return true
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L9 (L9, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L9):** run in Studio 0.743 on 2026-10-19:
pass, server gap [0.201, 0.219, 0.219, 0.219, 0.219, 0.219] studs every 0.1 s; client gap [0.221,
0.222, 0.224, 0.225, 0.226]; chain 2 joints, 1.604 studs; unreachable 4.17; Weight 0.5 1.11;
SmoothTime 0.5 [1.833, 1.449, 1.032, 0.667, 0.43, 0.368]; look-at Weight 0.999, head 0.05 degrees
off the target, 45.51 with the IKControl disabled.

- The measured gap is from the hand part's center to the target; it settles near 0.2 studs, not 0.
- An unreachable target leaves the arm fully extended toward it; Weight 0.5 stops halfway.
- SmoothTime spreads the motion over time; keep it near 0.05 for hands on props and higher for
  heads.
- Elbow direction: set `Pole` from code (hidden in Properties) and add Hinge and BallSocket
  constraints as the IKControl docs describe.

## P13. Replace default animations through the Animate script

Goal: custom idle, walk or run on player characters without rewriting Animate. Kit: AnimRig,
AnimClip. Playtest.

Server:

```lua
-- Server: replace the idle by changing the Animate script's values on a spawned character.
local char = game:GetService("Players"):GetPlayers()[1].Character
local tilt = CFrame.Angles(0, 0, math.rad(60))
local nonce = tostring(os.clock())
local clip = AnimClip.keyframes(AnimRig.tree(char), {
	name = "TiltIdle",
	loop = true,
	priority = "Core",
	keys = { { t = 0, poses = { RightUpperArm = tilt } }, { t = 1, poses = { RightUpperArm = tilt } } },
	markers = { { t = 0.5, name = "Nonce", value = nonce } },
})
local id = AnimClip.register(clip)
local idle = char.Animate.idle
idle.Animation1.AnimationId = id
idle.Animation2.AnimationId = id
return { id = id }
```

Client (`__ID__` comes from the server result):

```lua
-- Client: the playing idle keeps its old clip after the value change, although its Animation
-- already reports the new id; the Animate script loads the new clip at the next state change.
local ID = "__ID__"
local char = game:GetService("Players").LocalPlayer.Character
local hum = char.Humanoid
local animator = hum.Animator
local shoulder = AnimRig.joint(char, "RightShoulder")
local function state()
	local found
	for _, t in animator:GetPlayingAnimationTracks() do
		if t.Animation and t.Animation.AnimationId == ID then
			found = t
		end
	end
	return {
		idMatches = found ~= nil,
		length = found and math.floor(found.Length * 100 + 0.5) / 100 or -1,
		shoulderZ = math.floor(math.deg(select(3, shoulder.Transform:ToEulerAnglesXYZ())) + 0.5),
	}
end
task.wait(1)
local before = state()
-- A jump is a state change: Animate stops the idle, then plays it again on landing.
local airborne = { [Enum.HumanoidStateType.Jumping] = true, [Enum.HumanoidStateType.Freefall] = true }
local jumped, landed, method = false, false, "Jump"
hum.Jump = true
local t0 = os.clock()
while os.clock() - t0 < 4 do
	local s = hum:GetState()
	if airborne[s] then
		jumped = true
	elseif jumped then
		landed = true
		break
	elseif os.clock() - t0 > 0.5 and method == "Jump" then
		method = "ChangeState"
		hum:ChangeState(Enum.HumanoidStateType.Jumping)
	end
	task.wait()
end
task.wait(1)
return {
	idleValue = char.Animate.idle.Animation1.AnimationId,
	beforeStateChange = before,
	jumped = jumped,
	landed = landed,
	jumpMethod = method,
	afterStateChange = state(),
}
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L11 (L11, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L11):** run in Studio 0.743 on 2026-10-19:
pass, before a state change the playing idle's Animation reports the new id (true) but plays the old
clip: Length 3.77, shoulder Z 2 degrees; jump true, landed true; after landing: Length 1, shoulder Z
60 degrees; the temporary id was registered on the server only.

- Changing a value does not restart the playing idle. Its `Animation` already reports the new id
  while the old clip plays, so an id match is not proof: check `Length` or the joint.
- The Animate script loads the new clip at the next state change (here a jump and landing).
- Set the values on `CharacterAppearanceLoaded`, before Animate plays anything, and stop the playing
  tracks with `Stop(0)` (Use Animations docs).
- In a Studio playtest, a temporary id registered on the server played on the client. Shipped games
  need published ids.

## P14. Audit animation code and rigs

Goal: catch outdated APIs, Studio-only ids, posed rigs and editor leftovers. Kit: AnimAudit. Edit
data model.

```lua
-- Edit: AnimAudit on deliberately wrong scripts and rigs, and on the clean test rigs.
local SS = game:GetService("ServerStorage")
local old = SS:FindFirstChild("AnimAuditFixtures")
if old then
	old:Destroy()
end
local fx = Instance.new("Folder")
fx.Name = "AnimAuditFixtures"
fx.Parent = SS
local function script(class, name, src)
	local s = Instance.new(class)
	s.Name = name
	s.Source = src
	s.Parent = fx
	return s
end
script(
	"Script",
	"FixtureLegacyLoad",
	table.concat({
		"local humanoid = script.Parent:WaitForChild('Humanoid')",
		"local track = humanoid:LoadAnimation(script.Swing)",
		"track.KeyframeReached:Connect(print)",
		"local m = script.Parent:FindFirstChildOfClass('Motor6D')",
		"script.Parent.UpperTorso.Neck.C0 = CFrame.new()",
		"script.Swing.AnimationId = 'active://3'",
		"game:GetService('KeyframeSequenceProvider'):RegisterKeyframeSequence(script.Kfs)",
	}, "\n")
)
script(
	"LocalScript",
	"FixtureFaceTween",
	"local fc = script.Parent.Head.FaceControls\ngame:GetService('TweenService'):Create(fc, TweenInfo.new(0.2), {JawDrop = 1}):Play()\n"
		.. "local Abilities = require('@rbx/AvatarAbilities')\n"
)
script(
	"ModuleScript",
	"FixtureAbility",
	table.concat({
		"local AvatarAbilities = require('@rbx/AvatarAbilities')",
		"local def = AvatarAbilities.AbilityDefinition.new()",
		"def.RunsWhile = function(ctx) return ctx.Input.Pressed end",
		"function def.OnUpdate(abilityCtx, dt)",
		"\ttask.wait(0.1)",
		"\tabilityCtx.Timer = math.random()",
		"\tabilityCtx.Instance:Destroy()",
		"end",
		"return def",
	}, "\n")
)
-- Rig fixtures.
local rig = Instance.new("Model")
rig.Name = "FixtureRig"
rig.Parent = fx
local hum = Instance.new("Humanoid")
hum.Parent = rig
local ik = Instance.new("IKControl")
ik.Type = Enum.IKControlType.LookAt
ik.Weight = 1
ik.Parent = hum
local saves = Instance.new("Folder")
saves.Name = "AnimSaves"
saves.Parent = rig
local a1 = Instance.new("Animation")
a1.Name = "EmptyId"
a1.Parent = rig
local a2 = Instance.new("Animation")
a2.Name = "HashId"
a2.AnimationId = string.rep("ab", 16)
a2.Parent = rig
local world = Instance.new("Folder")
world.Name = "AuditWorldFixtures"
world.Parent = workspace:WaitForChild("AnimTests")
local loose = Instance.new("KeyframeSequence")
loose.Name = "LooseClip"
loose.Parent = world
local found = {}
local function collect(list)
	for _, f in list do
		found[f.rule] = (found[f.rule] or 0) + 1
	end
end
collect(AnimAudit.scripts(fx))
collect(AnimAudit.rigs(fx))
collect(AnimAudit.rigs(world))
-- Clean rigs: no error and no warn expected (the scene must be reset first).
local clean = {}
for _, f in AnimAudit.rigs(workspace:WaitForChild("AnimTests"), { edit = true }) do
	if f.severity ~= "info" and not f.path:find("AuditWorldFixtures", 1, true) then
		table.insert(clean, f.rule .. " " .. f.path)
	end
end
-- The default Animate script of the Dummy, for the record.
local animateFindings = {}
local animate = workspace:WaitForChild("AnimTests"):WaitForChild("Dummy"):WaitForChild("Animate") :: LocalScript
for _, f in AnimAudit.source(animate.Source, "Animate") do
	table.insert(animateFindings, f.rule)
end
world:Destroy()
return { found = found, cleanRigFindings = clean, animateFindings = animateFindings }
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L13 (L13, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L13):** run in Studio 0.743 on 2026-10-19:
pass, rules found [ability-ctx-field, ability-destroy, ability-input-in-rule, ability-random,
ability-yield, c0-write, ccl-client-require, clip-in-world, editor-metadata, empty-animation-id,
face-tween, humanoid-loadanimation, ik-incomplete, ik-lookat-weight, keyframe-reached, motor6d-only,
no-animator, register-in-game, temp-animation-id]; clean rigs: []; the default Animate script itself
reports [humanoid-loadanimation, keyframe-reached].

**Test:** `tests/code/scenario-roblox-animation/run_offline.sh` (O3). **Result (O3):** run offline
(luau-lsp, Selene, StyLua, Lune 0.11, Blender 5.2.1) on 2026-10-19: pass, 19 of 19 Lune unit tests.

- Rules: `humanoid-loadanimation`, `controller-loadanimation`, `keyframe-reached`, `motor6d-only`,
  `c0-write`, `temp-animation-id`, `register-in-game`, `face-tween`, `ccl-client-require`, the
  `ability-*` rules for CCL ability modules, `no-animator`, `ik-incomplete`, `ik-lookat-weight`,
  `ik-target-collides`, `editor-metadata`, `import-leftover`, `clip-in-world`, `empty-animation-id`,
  `posed-in-edit`.
- The default Animate script uses `Humanoid:LoadAnimation` and `KeyframeReached` itself: exclude it,
  or read its findings as expected.

## P15. Character Controller Library check

Goal: know whether the CCL is on before requiring it. Playtest, client and server.

```lua
-- Client and Server: require("@rbx/AvatarAbilities") with the Character Controller Library off.
local done, res = false, nil
task.spawn(function()
	res = table.pack(pcall(function()
		-- the cast only silences luau-lsp, which cannot resolve @rbx paths
		return typeof((require :: any)("@rbx/AvatarAbilities"))
	end))
	done = true
end)
local t0 = os.clock()
while not done and os.clock() - t0 < 3 do
	task.wait()
end
return { returned = done, result = res and tostring(res[2]) or "" }
```

**Test:** `tests/code/scenario-roblox-animation/run_live.py` --only L15 (L15, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L15):** run in Studio 0.743 on 2026-10-19:
pass, client returned false within 3 s; server returned true with `table`.

- With the CCL off, the client `require` never returns: guard it with a timeout as above or check
  the setting first.
- Ability modules follow the CCL rules: no yields, deterministic callbacks, no `Destroy`, input only
  through `Input` fields, data in `abilityCtx.State` or `.Local` (Character Controller Library
  docs). AnimAudit checks them.

## Final scene check

**Test:** `tests/code/scenario-roblox-animation/run_live.py` (L0, chunks in
`tests/code/scenario-roblox-animation/luau/`). **Result (L0):** run in Studio 0.743 on 2026-10-19:
pass, posed joints left per rig {Dummy: 0, PreparedCreature: 0, CreatureHumanoid: 0,
BlenderCreature: 0, PlayerCreatureSource: 0}.

## Offline checks

**Test:** `tests/code/scenario-roblox-animation/run_offline.sh` (O1). **Result (O1):** run offline
(luau-lsp, Selene, StyLua, Lune 0.11, Blender 5.2.1) on 2026-10-19: pass, 5 modules, 0 errors.

**Test:** `tests/code/scenario-roblox-animation/run_offline.sh` (O2). **Result (O2):** run offline
(luau-lsp, Selene, StyLua, Lune 0.11, Blender 5.2.1) on 2026-10-19: pass, 47 chunks and 35
documentation blocks, 0 errors.

## Not run, and why

- Studio import of an FBX animation and of a rigged model: GUI-only dialogs (Animation Editor
  import, 3D Importer). The sample bridge (P10) covers the pose.
- Publishing clips: uploads are out of scope for agents; a live server needs published ids.
- Adaptive Animation joint assignment and T-pose: GUI-only tool, and `AutoRig` needs RobloxScript
  capability.
- Server Authority behavior (8 tracks per Animator, `GetTrackByAnimationId` after rollback):
  `AuthorityMode` is a Properties-window setting that plugin-level Luau cannot read or set.
- Character Controller Library abilities: the beta toggle is GUI-only (File > Beta Features).
- Face Editor and face capture: GUI-only.
