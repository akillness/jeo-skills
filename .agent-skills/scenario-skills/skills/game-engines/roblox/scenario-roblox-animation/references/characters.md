# Characters and creatures

Import a skinned creature and make it a rig, play its clips on players and NPCs, plant its feet,
check a dynamic head before upload, check an FBX clip after import, and keep characters cheap.

Status. The kit functions used here pass the Lune unit tests
(`tests/code/scenario-roblox-animation/unit.luau`, 19 of 19 on 2026-10-19) and the static checks
with both type solvers: `AnimRig.bounds`, `AnimRig.prepareImport`, `AnimClip.timecode`,
`AnimClip.frames`, `AnimIK.leg` (structure only), `AnimIK.planSteps`, `AnimIK.stepArc`,
`AnimFace.VALIDATION`, `AnimFace.REQUIRED`, `AnimFace.headCheck`, `AnimFace.bodyCheck`. The Luau
blocks on this page ran as written in Studio 0.743 on 2026-10-19 (only the clip ids, the patrol
points, `PLAYABLE` and `LEG_LENGTH` take test values) and pass in
`tests/code/scenario-roblox-animation/run_live.py`: L17 section 1 on an Edit-built stand-in for a
Custom import (the Importer is GUI only), L18 the section 5 check, L19 the section 4 check on a
player avatar and the five validation poses, L20 section 3 on a 15 degree ramp, L21 the section 2
NPC, L22 the section 2 setup, `Animate` and hit scripts on a creature player character. The Python
preview loop in section 4 is not yet run as written (L19 plays the same five poses from a client
chunk). The kit functions it calls from the live run (`AnimClip.load`, `AnimFace.clip`,
`AnimIK.target`, `AnimAudit`, `pose_sheet`) keep the status recorded in `procedures.md`.

## 1. Custom skinned import to a playable or NPC rig

What the import gives you:

- The 3D Importer's Rig Type is R15, Custom or No Rig (Importer docs). With Custom, a skinned
  creature arrives as a Model whose root is a Part named `RootPart` (Size 2, 2, 1) holding the
  bones, next to an `AnimationController`; the model pivots on that `RootPart` (Mykaiju, NI7GXKLwk6U
  00:28:17, 00:35:47). There is no `HumanoidRootPart`: `rig.HumanoidRootPart` errors until you add
  one.
- Bones move the render, never the collision (Rigging docs). The creature needs its own collider.
- The importer's Anchored option is disabled for rigged meshes (Importer docs), and an Animation
  Editor import fails mostly because the HumanoidRootPart is not anchored (Nisky, EM9u4gIHoRg
  00:28:00, 00:28:32).
- R15 Humanoid: root height above the ground = 0.5 x root `Size.Y` + `HipHeight` (Humanoid
  reference). A HipHeight typed during Play is lost (DatBoiEle, V0AtCS4wmig 00:14:03).
- Clips are exported in place, with no root motion: the Humanoid or your own controller moves the
  model (DatBoiEle, V0AtCS4wmig 00:01:09).

Recipe:

1. Import with Rig Type Custom (`gui-paths.md`, Import and rigs).
2. Wrap the importer root and size the collider with `AnimRig.prepareImport` (below). It adds a
   `HumanoidRootPart` box spanning the creature's bounds from `hipHeight` above the feet to the top,
   joins the importer root to it with a Motor6D named `Root`, welds parts that no joint holds, turns
   collision off everywhere else, sets PrimaryPart, anchors the new root, and leaves one Animator
   under the controller you ask for (Humanoid for a player character, AnimationController for an
   NPC). A Humanoid on a rig with no `Neck` joint gets `RequiresNeck` false: with it on, a missing
   or broken Neck joint kills the Humanoid (Humanoid reference).
3. Import or author the clips on the prepared rig, root still anchored (section 5). A pose binds by
   its name under the pose of its joint's Part0 or its parent bone, and the path may start below the
   rig's root, so a clip authored on the raw import (`RootPart` at its top) still plays after the
   wrap. A pose alone at the top of the clip, or under another name, does not bind (Studio 0.743).
4. Playable: a copy named `StarterCharacter` in StarterPlayer, root unanchored (Character bodies
   import docs; DatBoiEle 00:11:53 to 00:13:30), plus your own `Animate` (section 2). NPC: a copy in
   ServerStorage that the server clones (section 2).

Renaming `RootPart` to `HumanoidRootPart` also satisfies the Humanoid, but the 2 x 2 x 1 box then
stays the only collider, at the importer's origin. Wrapping keeps the importer root untouched and
sizes the collider to the body. Rename before authoring clips: a Motor6D pose authored under
`RootPart` no longer binds once that part is renamed.

```lua
-- Edit, through rbx_animation.run(studio, code, kit=["AnimRig"]). Run in Studio 0.743 (2026-10-19).
local ServerStorage = game:GetService("ServerStorage")
local StarterPlayer = game:GetService("StarterPlayer")
local PLAYABLE = true -- false: an NPC moved by its own controller (section 2)
local LEG_LENGTH = 1.5 -- studs from the soles to the belly, measured on the model
local model = workspace:WaitForChild("Creature") :: Model -- the imported Model, renamed Creature
local report = AnimRig.prepareImport(model, {
	controller = if PLAYABLE then "Humanoid" else "AnimationController",
	hipHeight = if PLAYABLE then LEG_LENGTH else 0,
})
local tree = AnimRig.tree(model)
if PLAYABLE then
	local character = model:Clone()
	character.Name = "StarterCharacter"
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart
	root.Anchored = false
	character.Parent = StarterPlayer
	StarterPlayer.LoadCharacterAppearance = false -- avatar clothing and accessories are made for avatar bodies
else
	model:Clone().Parent = ServerStorage -- keeps the name Creature
end
return {
	created = report.created,
	size = report.size,
	hipHeight = report.hipHeight,
	welded = report.welded,
	bones = report.bones,
	controller = report.controller,
	treeRoot = tree.root,
}
```

GATE: `created` true (false means the model already had a HumanoidRootPart, which was kept),
`treeRoot` is `HumanoidRootPart`, `AnimRig.path(tree, <a foot bone>)` starts `HumanoidRootPart`,
`RootPart`; a capture with the collider at Transparency 0.5 shows the box over the body with its
bottom `hipHeight` above the soles; in a playtest the feet touch the floor and the creature does not
walk through a wall.

## 2. Play the clips: player character and NPC

The scripts below define every name they use: the input action and the remote come from the setup
chunk, the hit query is inline. With scenario-roblox-gameplay installed, its `Hitbox` module and
input actions can replace them; an answer that uses them shows their install step
(`rbx_gameplay.install`).

Setup, once, in Edit:

```lua
-- Edit: the attack input and the hit remote used by the two scripts below. Run in Studio 0.743 (2026-10-19).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local context = (ReplicatedStorage:FindFirstChild("CreatureInput") or Instance.new("InputContext")) :: InputContext
context.Name = "CreatureInput"
context.Parent = ReplicatedStorage
local attack = (context:FindFirstChild("Attack") or Instance.new("InputAction")) :: InputAction
attack.Name = "Attack"
attack.Parent = context
for name, key in { Key = Enum.KeyCode.F, Mouse = Enum.KeyCode.MouseLeftButton, Pad = Enum.KeyCode.ButtonX } do
	local binding = (attack:FindFirstChild(name) or Instance.new("InputBinding")) :: InputBinding
	binding.Name = name
	binding.KeyCode = key
	binding.Parent = attack
end
-- Touch: one more InputBinding whose UIButton is an on-screen button (Input Action System docs).
local remote = ReplicatedStorage:FindFirstChild("CreatureHit") or Instance.new("RemoteEvent")
remote.Name = "CreatureHit"
remote.Parent = ReplicatedStorage
return { bindings = #attack:GetChildren(), remote = remote:GetFullName() }
```

Player character, a LocalScript named `Animate` in StarterCharacterScripts. It takes the place of
the default Animate, whose R15 clips do not bind to a creature's parts:

```lua
-- LocalScript "Animate" in StarterCharacterScripts. Run in Studio 0.743 (2026-10-19).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local character = script.Parent
local humanoid = character:WaitForChild("Humanoid") :: Humanoid
local animator = humanoid:WaitForChild("Animator") :: Animator
local IDS = { Idle = "rbxassetid://0", Walk = "rbxassetid://0", Attack = "rbxassetid://0" } -- your published ids
local AUTHORED_SPEED = 8 -- studs per second the walk clip covers at speed 1
local PRIORITY = {
	Idle = Enum.AnimationPriority.Idle,
	Walk = Enum.AnimationPriority.Movement,
	Attack = Enum.AnimationPriority.Action,
}

local tracks: { [string]: AnimationTrack } = {}
for name, id in IDS do
	assert(id ~= "rbxassetid://0", name .. ": set the published id")
	local animation = Instance.new("Animation")
	animation.AnimationId = id
	local track = animator:LoadAnimation(animation)
	track.Priority = PRIORITY[name]
	track.Looped = name ~= "Attack"
	tracks[name] = track
end
tracks.Idle:Play(0.2)

humanoid.Running:Connect(function(speed)
	if speed > 0.5 then
		if not tracks.Walk.IsPlaying then
			tracks.Walk:Play(0.2)
		end
		tracks.Walk:AdjustSpeed(speed / AUTHORED_SPEED) -- the feet keep pace with the ground
	elseif tracks.Walk.IsPlaying then
		tracks.Walk:Stop(0.2)
	end
end)

local attack = ReplicatedStorage:WaitForChild("CreatureInput"):WaitForChild("Attack") :: InputAction
local hit = ReplicatedStorage:WaitForChild("CreatureHit") :: RemoteEvent
attack.Pressed:Connect(function()
	if not tracks.Attack.IsPlaying then
		tracks.Attack:Play(0.05)
	end
end)
tracks.Attack:GetMarkerReachedSignal("Hit"):Connect(function(strength)
	hit:FireServer(strength) -- the server checks the cooldown and finds the victims itself
end)
```

Server side of the player's attack, a Script in ServerScriptService:

```lua
-- Script in ServerScriptService: the server decides what the attack hits. Run in Studio 0.743 (2026-10-19).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local hit = ReplicatedStorage:WaitForChild("CreatureHit") :: RemoteEvent
local REACH, BOX, COOLDOWN = 4, Vector3.new(6, 5, 6), 0.5
local DAMAGE = { light = 10, heavy = 25 }
local lastHit: { [Player]: number } = {}

-- Characters with a living Humanoid in a box, one entry per character rather than per limb.
local function victims(attacker: Model, box: CFrame, size: Vector3): { [Model]: Humanoid }
	local params = OverlapParams.new()
	params.ExcludeInstances = { attacker }
	local found = {}
	for _, part in workspace:GetPartBoundsInBox(box, size, params) do
		local model = part:FindFirstAncestorOfClass("Model")
		local humanoid = model and model:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health > 0 then
			found[model] = humanoid
		end
	end
	return found
end

hit.OnServerEvent:Connect(function(player, strength)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
	local now = os.clock()
	if not root or now - (lastHit[player] or 0) < COOLDOWN then
		return
	end
	lastHit[player] = now
	local damage = DAMAGE[strength] or DAMAGE.light -- client data only picks from the table
	for _, humanoid in victims(character, root.CFrame * CFrame.new(0, 0, -REACH), BOX) do
		humanoid:TakeDamage(damage)
	end
end)
Players.PlayerRemoving:Connect(function(player)
	lastHit[player] = nil
end)
```

NPC creature, a Script in ServerScriptService. It clones the copy from section 1
(AnimationController, `hipHeight` 0), moves it by CFrame instead of a Humanoid (Improve performance
docs, Humanoids), plays and switches its tracks, hits on the `Hit` marker, and sleeps when no player
is near (Peter McNeill, RDC 2025 rwLEnBtXr30 00:09:24):

```lua
-- Script in ServerScriptService: the NPC creature. Run in Studio 0.743 (2026-10-19).
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local IDS = { Idle = "rbxassetid://0", Walk = "rbxassetid://0", Attack = "rbxassetid://0" } -- your published ids
local SPEED, AUTHORED_SPEED = 6, 6 -- patrol speed, and the speed the walk clip covers at speed 1
local AGGRO, SLEEP, REACH, BOX, DAMAGE = 8, 120, 4, Vector3.new(6, 5, 6), 15
local PATROL = { Vector3.new(-20, 0, 0), Vector3.new(20, 0, 0) } -- points on the ground
local PRIORITY = {
	Idle = Enum.AnimationPriority.Idle,
	Walk = Enum.AnimationPriority.Movement,
	Attack = Enum.AnimationPriority.Action,
}

local creature = (ServerStorage:WaitForChild("Creature") :: Model):Clone()
local root = creature:WaitForChild("HumanoidRootPart") :: BasePart
root.Anchored = true -- moved by CFrame below, not by physics
local controller = creature:FindFirstChildOfClass("AnimationController") :: AnimationController
local animator = controller:FindFirstChildOfClass("Animator") :: Animator
local lift = Vector3.new(0, root.Size.Y / 2, 0) -- with hipHeight 0 the collider reaches the ground
creature:PivotTo(CFrame.new(PATROL[1] + lift))
creature.Parent = workspace

local tracks: { [string]: AnimationTrack } = {}
for name, id in IDS do
	assert(id ~= "rbxassetid://0", name .. ": set the published id")
	local animation = Instance.new("Animation")
	animation.AnimationId = id
	local track = animator:LoadAnimation(animation)
	track.Priority = PRIORITY[name]
	track.Looped = name ~= "Attack"
	tracks[name] = track
end
tracks.Idle:Play(0.2)

local function victims(attacker: Model, box: CFrame, size: Vector3): { [Model]: Humanoid }
	local params = OverlapParams.new()
	params.ExcludeInstances = { attacker }
	local found = {}
	for _, part in workspace:GetPartBoundsInBox(box, size, params) do
		local model = part:FindFirstAncestorOfClass("Model")
		local humanoid = model and model:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health > 0 then
			found[model] = humanoid
		end
	end
	return found
end

tracks.Attack:GetMarkerReachedSignal("Hit"):Connect(function()
	for _, humanoid in victims(creature, root.CFrame * CFrame.new(0, 0, -REACH), BOX) do
		humanoid:TakeDamage(DAMAGE)
	end
end)

local function nearestPlayer(): (BasePart?, number)
	local best, bestDistance = nil, math.huge
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local other = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if other then
			local d = (other.Position - root.Position).Magnitude
			if d < bestDistance then
				best, bestDistance = other, d
			end
		end
	end
	return best, bestDistance
end

local goal, awake = 2, true
RunService.Heartbeat:Connect(function(dt)
	local target, distance = nearestPlayer()
	if distance > SLEEP then -- out of range: no tracks, no movement
		if awake then
			awake = false
			for _, track in animator:GetPlayingAnimationTracks() do
				track:Stop(0.2)
			end
		end
		return
	elseif not awake then
		awake = true
		tracks.Idle:Play(0.2)
	end
	if tracks.Attack.IsPlaying then
		return
	end
	if target and distance < AGGRO then
		tracks.Walk:Stop(0.2)
		local flat = Vector3.new(target.Position.X, root.Position.Y, target.Position.Z)
		if (flat - root.Position).Magnitude > 0.1 then
			creature:PivotTo(CFrame.lookAt(root.Position, flat))
		end
		tracks.Attack:Play(0.1)
		return
	end
	local offset = PATROL[goal] + lift - root.Position
	if offset.Magnitude < 0.5 then
		goal = goal % #PATROL + 1
		return
	end
	local position = root.Position + offset.Unit * math.min(SPEED * dt, offset.Magnitude)
	creature:PivotTo(CFrame.lookAt(position, position + offset.Unit))
	if not tracks.Walk.IsPlaying then
		tracks.Walk:Play(0.2)
		tracks.Walk:AdjustSpeed(SPEED / AUTHORED_SPEED)
	end
end)
```

GATE (playtest): on the client, `AnimClip.tracks(animator)` shows Idle playing at rest and Walk at
weight 1 while moving; `character:GetChildren()` holds one `Animate` (at runtime the engine adds a
`mood` StringValue and a `ScaleDampeningPercent` NumberValue under it, none of the default clip
values); the attack marker fires once per swing and the target's Health drops once; the client sees
the NPC's tracks (P8); past `SLEEP` the NPC reports no playing track. Victims need a Humanoid: give
an AnimationController creature a health attribute if players must hit it. This NPC is a moving
skinned Model without a Humanoid, the case the docs flag for FastCluster rebuilds (section 6):
profile it at the target NPC count.

## 3. Creature foot planting

Roox4's recipe (DPpAsjUr278): one IKControl per leg under the Humanoid, with EndEffector the last
leg part, Target a part in an `IKTargets` folder (CanCollide, CanTouch and CanQuery off, Massless)
and ChainRoot the first leg part [00:02:44]; a downward raycast above each leg measures the step
[00:03:49]; a Pole Attachment per leg under the HumanoidRootPart on the side the knee bends
[00:04:21]; an AlignOrientation on the root (Mode OneAttachment, very large MaxTorque) so the body
tilts with the slope as well as turning [00:05:50]. His stepping module is closed; the step logic
here (`AnimIK.planSteps`, `AnimIK.stepArc`) is written from his description [added].

- IKControls are created on the server so they replicate, and enabled once their target sits on the
  foot (Suphi Kaner, 8fV-XOOj6O4 00:18:56). `Pole` is hidden in the Properties window; `AnimIK.leg`
  sets it from code (00:09:49).
- `IKControl.Priority`: a higher value solves later and can override the others (IKControl
  reference; Suphi Kaner 00:54:40, hands at Priority 1 so the torso and head solve first). Separate
  legs share no joint, so their order does not matter; give the higher Priority to the control that
  must win where chains share joints, such as a head look-at over a spine bend.
- Raycasts that measure the step exclude the creature; the target parts never collide or get
  queried.

```lua
-- Script in ServerScriptService, for a four-legged creature prepared with AnimRig.prepareImport(model,
-- {controller = "Humanoid", hipHeight = legLength}) whose legs are parts or bones named UpperLeg* and
-- Foot*. Inline AnimRig and AnimIK. Run in Studio 0.743 (2026-10-19).
local RunService = game:GetService("RunService")
local creature = workspace:WaitForChild("Creature") :: Model
local root = creature:WaitForChild("HumanoidRootPart") :: BasePart
local humanoid = creature:FindFirstChildOfClass("Humanoid") :: Humanoid
root.Anchored = false -- prepareImport anchors it for clip import
root:SetNetworkOwner(nil) -- an NPC: the server simulates it, so the feet and the body agree
local STRIDE, LIFT, STEP_TIME = 1.5, 0.6, 0.15 -- studs, studs, seconds
-- Groups 1 and 2 are diagonal pairs. pole: root-space point the knee bends toward (left is -X).
local LEGS = {
	{ name = "LegFL", chainRoot = "UpperLegFL", effector = "FootFL", group = 1, pole = Vector3.new(-4, 2, -3) },
	{ name = "LegFR", chainRoot = "UpperLegFR", effector = "FootFR", group = 2, pole = Vector3.new(4, 2, -3) },
	{ name = "LegBL", chainRoot = "UpperLegBL", effector = "FootBL", group = 2, pole = Vector3.new(-4, 2, 3) },
	{ name = "LegBR", chainRoot = "UpperLegBR", effector = "FootBR", group = 1, pole = Vector3.new(4, 2, 3) },
}

local params = RaycastParams.new()
params.ExcludeInstances = { creature }
local function ground(above: Vector3): Vector3?
	local reach = humanoid.HipHeight + root.Size.Y + 4
	local result = workspace:Raycast(above + Vector3.new(0, reach / 2, 0), Vector3.new(0, -reach, 0), params)
	return result and result.Position
end

local legs = {}
for _, spec in LEGS do
	local ik, target = AnimIK.leg(creature, spec)
	local floor = ground(target.Position)
	table.insert(legs, {
		target = target,
		group = spec.group,
		rest = root.CFrame:PointToObjectSpace(target.Position), -- where the foot stands, root space
		sole = Vector3.new(0, if floor then target.Position.Y - floor.Y else 0, 0), -- effector above the ground
		planted = target.Position,
		ideal = target.Position,
		stepping = false,
	})
	ik.Enabled = true -- the target already sits on the foot, so nothing snaps
end

local tilt = Instance.new("Attachment")
tilt.Name = "TiltAttachment"
tilt.Parent = root
local align = Instance.new("AlignOrientation")
align.Mode = Enum.OrientationAlignmentMode.OneAttachment
align.Attachment0 = tilt
align.MaxTorque = math.huge
align.Responsiveness = 20
align.Parent = root
humanoid.AutoRotate = false -- the AlignOrientation turns the body

local function step(leg)
	leg.stepping = true
	local from, to, start = leg.planted, leg.ideal, os.clock()
	task.spawn(function()
		local t = 0
		while t < 1 do
			t = (os.clock() - start) / STEP_TIME
			leg.target.Position = AnimIK.stepArc(from, to, t, LIFT)
			RunService.Heartbeat:Wait()
		end
		leg.planted = to
		leg.stepping = false
	end)
end

local heading = (root.CFrame.LookVector * Vector3.new(1, 0, 1)).Unit
RunService.Heartbeat:Connect(function()
	local lead = humanoid.MoveDirection * humanoid.WalkSpeed * STEP_TIME -- land the foot ahead
	for _, leg in legs do
		local hit = ground(root.CFrame:PointToWorldSpace(leg.rest) + lead)
		leg.ideal = if hit then hit + leg.sole else leg.planted -- the sole lands on the ground, not the effector
	end
	for _, i in AnimIK.planSteps(legs, STRIDE) do
		step(legs[i])
	end
	if humanoid.MoveDirection.Magnitude > 0.1 then
		heading = humanoid.MoveDirection.Unit
	end
	-- Yaw from the move direction, pitch from the front and back foot hits [added; Roox4 aims the
	-- AlignOrientation at the move target for both].
	local front = (legs[1].ideal + legs[2].ideal) / 2
	local back = (legs[3].ideal + legs[4].ideal) / 2
	local run = Vector3.new(front.X - back.X, 0, front.Z - back.Z).Magnitude
	local pitch = if run > 0.1 then math.atan2(front.Y - back.Y, run) else 0
	align.CFrame = CFrame.lookAt(Vector3.zero, heading) * CFrame.Angles(pitch, 0, 0)
end)
```

GATE (playtest, server): while walking on flat ground, each planted foot stays within 0.1 stud of
its target (`AnimIK.gap`) and at most one diagonal pair is in the air at a time; on a slope the
root's pitch follows the slope; a contact sheet of side captures (flat, uphill, downhill) shows no
foot sliding or sinking.

## 4. Dynamic heads: cages, attachments and validation

- A dynamic head is the mesh and textures, the facial animation (`FaceControls`), the cage
  (`WrapTarget`) and the attachments (Dynamic Heads docs). A full avatar body has 15 cages, one per
  body part including the head, and 19 attachments, four on the head (FaceCenter, FaceFront, Hat,
  Hair). Never add or remove vertices of Roblox's standard cage meshes: start from the project files
  (Dynamic Heads docs). Extra loop cuts on the cage give a UV error (Jezixa, apZsJqsKdw4 00:14:38).
- At least 17 FACS poses (`AnimFace.REQUIRED`); the head mesh at most 4,000 triangles (Jezixa
  00:06:30).
- Validation projects the cage's eye and mouth landmarks onto the head and checks five actions: left
  blink, right blink, mouth open, happy, sad, driven by the values in `AnimFace.VALIDATION` (Dynamic
  head specifications; Roblox Learn, OwhkWzSBnf0 00:01:39, 00:04:16, which counts 18 projected
  landmarks). The mouth landmark sits on the second vertex loop from the mouth opening
  (specifications).
- Landmarks fail to project: the cage sits beyond or below the surface, the head has gaps, or
  separate eyeballs or a mouth bag catch them. Keep the cage barely over the surface (OwhkWzSBnf0
  00:02:49, 00:03:21; caging best practices).
- Landmarks project but do not move: move the cage vertices onto the parts that move most, the
  eyelid rather than the eyeball for a blink and the moving lip for the mouth (OwhkWzSBnf0 00:03:43;
  Jezixa 00:17:06).
- Jezixa puts the head's color map in a `SurfaceAppearance` ColorMap with the skin areas
  transparent, not in `MeshPart.TextureID` (00:06:40, 00:16:18); the docs accept either, and the
  transparent areas let `MeshPart.Color` show the skin tone.
- Model the head in its neutral pose and key face bones with rotation and location only (Jezixa
  00:12:53, 00:13:25). Avatar Setup > Check Face is the GUI preview (`gui-paths.md`).

```lua
-- Edit, through rbx_animation.run(studio, code, kit=["AnimFace"]). Run in Studio 0.743 (2026-10-19).
local model = workspace:WaitForChild("Avatar") :: Model -- the imported body, or a Model holding the head
local head = model:FindFirstChild("Head", true)
assert(head and head:IsA("MeshPart"), "no Head MeshPart in " .. model.Name)
return { head = AnimFace.headCheck(head), body = AnimFace.bodyCheck(model) }
```

GATE: no `problems` for the head; for a full body, `cages` 15 and `missing` empty.

Preview the five validation actions before Avatar Setup or upload, one capture each:

```python
# Not yet run (needs Studio). The model needs a Humanoid or AnimationController with an Animator.
import rbx_animation as A, rbx_review
SETUP = """
local rig = workspace:WaitForChild("Avatar")
local animator = rig:FindFirstChildWhichIsA("Animator", true)
local test = AnimFace.VALIDATION[%d]
local track = AnimClip.load(animator, AnimFace.clip(test.name, test.pose, { ramp = 0 }))
"""
FACE_CAM = {"camera_position": [0, 4.5, -4], "look_at_position": [0, 4.5, 0]}  # in front of the face
shots = []
for i in range(1, 6):
    r = A.pose_sheet(studio, SETUP % i, [0.5], "face_check", FACE_CAM, name=f"action{i}",
                     kit=("AnimRig", "AnimClip", "AnimFace"))
    shots += r["captures"]
sheet = rbx_review.contact_sheet(shots, "face_check/validation.png", cols=5, thumb=320)
```

GATE: read the sheet next to a neutral capture: each eye closes on its own, the mouth opens, the
corners rise for happy and drop for sad. A pose that barely moves the region its landmark covers
will fail validation.

## 5. FBX animation: export flags and import checks

Blender side (Mykaiju, NI7GXKLwk6U 00:24:30, 00:25:51 on screen; Add Leaf Bones and Simplify from
his speech): Armature only, Scale 1.00, Apply Scalings All Local, Forward -Z, Up Y, Apply Unit on,
Use Space Transform on, Apply Transform off, Add Leaf Bones off, Key All Bones on, NLA Strips off,
All Actions off (only the first action is read, 00:25:26), Force Start/End Keying on, Sampling Rate
1, Simplify 0 (Simplify 1 is smaller but IK-planted feet can shake, 00:25:59 to 00:31:39).
`blender_roblox_anim.py export` writes exactly these (P10).

Studio side, in order:

1. Anchor the rig's HumanoidRootPart before the import (Nisky, EM9u4gIHoRg 00:28:32), select the
   rig, then Animation Editor `⋯` > Import > From FBX Animation, rig source "selected" rather than
   the FBX's own model (Mykaiju 00:30:00).
2. Read the length in the Animation Editor: seconds:frames at 24 fps, 42 frames read 1:18 and 100
   frames 4:04 (00:29:10). The code check below reads the same from the saved clip.
3. Remove the `RBX_MICROBONE_NODES` folder the import adds to Workspace (00:29:02; `AnimAudit`
   reports it as `import-leftover`).
4. Feet shake after import: the scale was lost between Blender and Studio. Read the rig's scale in
   Studio, scale the Blender scene by the same number and re-export (00:32:38 to 00:33:45).
   Resetting the scale from Studio's dropdown broke imports in his tests (00:27:28).
5. The rig floats after a re-import at the corrected scale: put the root bone's origin at the hips
   and set HipHeight on playable rigs (00:34:54 to 00:36:32).

```lua
-- Edit, after saving the imported clips in the Animation Editor; kit=["AnimRig", "AnimClip"].
-- Run in Studio 0.743 (2026-10-19).
local rig = workspace:WaitForChild("Creature") :: Model
local root = rig:FindFirstChild("HumanoidRootPart") :: BasePart?
local clips = {}
local saves = rig:FindFirstChild("AnimSaves") -- where the Animation Editor saves clips
if saves then
	for _, clip in saves:GetDescendants() do
		if clip:IsA("KeyframeSequence") then
			clips[clip.Name] = AnimClip.frames(clip, 24)
		end
	end
end
return {
	clips = clips, -- label "1:18" for 42 frames; offGrid 0 proves 24 fps
	rootAnchored = root ~= nil and root.Anchored,
	scale = rig:GetScale(), -- not 1: export from Blender at this scale
	microbones = workspace:FindFirstChild("RBX_MICROBONE_NODES") ~= nil,
}
```

GATE: every clip has `offGrid` 0 and the frame count of its Blender action; `microbones` false after
cleanup; the pose sheet of the clip (P5) shows planted feet. Move `AnimSaves` and `InitialPoses` out
of the shipped rig (`AnimAudit` rule `editor-metadata`).

## 6. Character and NPC cost

What belongs to animation; scenario-roblox-performance owns profiling, budgets and MicroProfiler
captures.

| Fact                                                                                                                                                | Source                                                                                                                                                            | What to do                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Humanoids cost CPU, memory and bandwidth; static NPCs do not need one                                                                               | Improve performance docs, Humanoids; Roblox Learn OCUZKJJR-TE 00:07:29                                                                                            | Static NPC: AnimationController with an Animator                                               |
| Moving NPCs at scale                                                                                                                                | Improve performance docs                                                                                                                                          | Own movement controller plus AnimationController (section 2)                                   |
| Skinned MeshParts moving in a Model without a Humanoid are re-sorted in spatial FastClusters every move; a Humanoid in the Model forces one cluster | Improve performance docs, Rendering                                                                                                                               | Moving skinned creature: profile both; the Humanoid fix adds memory                            |
| `updateInvalidatedFastClusters` above 4 ms means avatar instantiation or changes invalidate clusters                                                | Improve performance docs; Roblox Learn VDO_amtWfDw 00:06:07                                                                                                       | Spawn and change avatars less often; pool NPCs instead of destroying them                      |
| Size and scale changes rebuild FastClusters                                                                                                         | Improve performance docs                                                                                                                                          | Scale a rig once, before it enters Workspace; never `ScaleTo` during play                      |
| NPC animation on the server poses physics parts; radius culling halved server CPU in Dead Rails                                                     | McNeill, RDC 2025 rwLEnBtXr30 00:09:24                                                                                                                            | Out of range: anchor the root and stop the tracks (section 2)                                  |
| Many NPCs animated from the server                                                                                                                  | Improve performance docs                                                                                                                                          | Create their Animators on the clients and play near ones only                                  |
| Unused Humanoid states                                                                                                                              | Improve performance docs; Crusherfire YWyJHwynM1M 00:26:38                                                                                                        | `SetStateEnabled(state, false)`; `EvaluateStateMachine` false on static Humanoid NPCs          |
| Animator throttling                                                                                                                                 | Workspace and Animator reference; Crusherfire 00:32:00                                                                                                            | Keep `ClientAnimatorThrottling` enabled; `Animator.PreferLodEnabled` false only for a hero NPC |
| Pets and other cosmetic followers                                                                                                                   | consensus of the performance sources: cosmetic motion is not replicated; `BulkMoveTo` about 50% faster than per-part CFrame sets (Crusherfire 00:27:51, 00:31:13) | Client-only, anchored, moved in one `workspace:BulkMoveTo` per frame, culled by distance       |
| Occlusion culling does not cull NPC characters                                                                                                      | Crusherfire 00:17:49                                                                                                                                              | Cull by distance yourself                                                                      |

GATE: with the target NPC count in a playtest, the frame time and `updateInvalidatedFastClusters`
stay inside the budget set in scenario-roblox-performance, and server CPU drops when every player
walks out of range.
