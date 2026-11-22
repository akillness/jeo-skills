# Copy-ready code (scenario-roblox-vfx-audio)

Standalone scripts for an answer or a game that does not ship this skill's kit. Each one stands
alone: no `require` of `VfxKit`, `AudioKit`, `FxReplicator` or `Footsteps`. Use the names in this
file in game code. The section numbers and test ids in [procedures.md](procedures.md) (P10, L7)
index this skill's tests; they are not names for game code.

Status of every block is stated under it. "From the kit" means the lines were copied from modules
that passed the live run of 2026-10-19 (12 of 12 tests in Studio 0.743); joining and trimming them
is new, so a joined script counts as not yet run until a test runs it as written. Live tests L12 to
L16 (2026-10-19) ran sections 1 to 5 as written, with the kit's game scripts disabled. Every block
here passes `rbx_check` in strict mode with both Luau solvers (offline test O2).

## 1. Combat effects every player sees

The server checks the request, picks the point, and tells nearby clients a name and a CFrame. Each
client clones the template from `ReplicatedStorage.FxLibrary` and plays it. Effect instances never
replicate, so the server holds none (Develuper, TkNZETIu0CM [00:02:15, 00:04:42]; the broadcast
design is [added]). Projectiles travel on every client from origin, velocity and server time, so a
laggy client still draws them in the right place.

Templates are Models with a PrimaryPart. Layer timing lives in attributes: `EmitCount`, `EmitDelay`,
`EmitDuration` on emitters, beams, trails and lights, and `Loop` on emitters that stay on during a
projectile's flight (Twist VFX, zlKdwujvP2A [00:00:29]).

<!-- snippet: copy_fx_server -->

```lua
-- ServerScriptService/FxServer (Script)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local library = ReplicatedStorage:WaitForChild("FxLibrary")
local RADIUS = 400 -- only players this close to the effect are told
local RULES: { [string]: any } = {
	Slash = { cooldown = 0.4, range = 60 }, -- seconds between casts, studs of reach
	Fireball = { cooldown = 1, range = 200, speed = 60, impact = "Boom" }, -- a projectile
}

local net = Instance.new("Folder")
net.Name = "FxNet"
local request = Instance.new("RemoteEvent")
request.Name = "Request"
request.Parent = net
local play = Instance.new("RemoteEvent")
play.Name = "Play"
play.Parent = net
net.Parent = ReplicatedStorage

local function finite(v: Vector3): boolean
	return v.X == v.X and v.Y == v.Y and v.Z == v.Z and v.Magnitude < 1e6
end

-- CFrame at `pos` whose +Y is `normal`: impacts face away from the surface.
local function alignUp(pos: Vector3, normal: Vector3): CFrame
	local up = normal.Unit
	local ref = math.abs(up.Y) > 0.99 and Vector3.xAxis or Vector3.yAxis
	local right = ref:Cross(up).Unit
	return CFrame.fromMatrix(pos, right, up)
end

local function send(kind: string, origin: Vector3, ...)
	for _, p in Players:GetPlayers() do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root and (root.Position - origin).Magnitude <= RADIUS then
			play:FireClient(p, kind, ...)
		end
	end
end

-- Server-side projectile: a ray per frame along the path, no part. Clients draw it from the same numbers.
local nextId = 0
local function launch(caster: Model, rule, origin: Vector3, velocity: Vector3, name: string)
	nextId += 1
	local id = nextId
	send("projectile", origin, id, name, origin, velocity, workspace:GetServerTimeNow())
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { caster }
	local pos, travelled = origin, 0
	local conn: RBXScriptConnection
	conn = RunService.Heartbeat:Connect(function(dt)
		local step = velocity * dt
		local hit = workspace:Raycast(pos, step, params)
		travelled += step.Magnitude
		if hit or travelled > rule.range then
			conn:Disconnect()
			local at = if hit then alignUp(hit.Position, hit.Normal) else alignUp(pos + step, Vector3.yAxis)
			send("impact", at.Position, id, rule.impact, at)
			-- damage belongs here, on the server, from hit.Instance
		else
			pos += step
		end
	end)
end

local last: { [Player]: { [string]: number } } = {}
request.OnServerEvent:Connect(function(player: Player, name: any, target: any)
	if typeof(name) ~= "string" or typeof(target) ~= "Vector3" or not finite(target) then
		return
	end
	local rule = RULES[name]
	if not rule or not library:FindFirstChild(name) then
		return
	end
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not char or not root then
		return
	end
	local now = os.clock()
	local times = last[player] or {}
	if now - (times[name] or -math.huge) < rule.cooldown then
		return
	end
	times[name] = now
	last[player] = times
	local offset = target - root.Position
	if rule.speed then
		local dir = offset.Unit
		launch(char, rule, root.Position + dir * 3, dir * rule.speed, name)
		return
	end
	if offset.Magnitude > rule.range then
		return
	end
	-- The server picks the point: a ray from the caster, never the client's claim of what it hit.
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { char }
	local hit = workspace:Raycast(root.Position, offset, params)
	local cf = if hit then alignUp(hit.Position, hit.Normal) else alignUp(target, Vector3.yAxis)
	send("burst", cf.Position, name, cf)
end)

Players.PlayerRemoving:Connect(function(p)
	last[p] = nil
end)
```

Status: validation, `alignUp`, `send` and the projectile and impact messages are from the kit
(`FxReplicator`, test L10: 4 of 5 spam requests rejected on cooldown, range, type and unknown
requests rejected, 0 effect instances on the server). The per-frame server hit test replaces the
test's timer and is new. As written: run live (Studio 0.743), test L13 with FxClient below: one
FxNet, the Fireball's impact sent where its ray hit, 0 effect instances on the server. Rejection
counters for debugging were dropped.

<!-- snippet: copy_fx_client -->

```lua
-- StarterPlayerScripts/FxClient (LocalScript)
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local library = ReplicatedStorage:WaitForChild("FxLibrary")
local net = ReplicatedStorage:WaitForChild("FxNet")
local play = net:WaitForChild("Play") :: RemoteEvent
local request = net:WaitForChild("Request") :: RemoteEvent
local CULL_DISTANCE = 400 -- studs from the camera; farther effects are not drawn

local fxFolder = workspace:FindFirstChild("Fx")
if not fxFolder then
	fxFolder = Instance.new("Folder")
	fxFolder.Name = "Fx"
	fxFolder.Parent = workspace
end

-- Fire every layer once: EmitCount bursts, EmitDuration windows, sounds from the start.
local function emit(root: Instance)
	for _, d in root:GetDescendants() do
		local count = d:GetAttribute("EmitCount") :: number?
		local delay = (d:GetAttribute("EmitDelay") :: number?) or 0
		local duration = d:GetAttribute("EmitDuration") :: number?
		if d:IsA("ParticleEmitter") and count then
			if delay > 0 then
				task.delay(delay, function()
					if d.Parent then
						d:Emit(count)
					end
				end)
			else
				d:Emit(count)
			end
		end
		if duration and (d:IsA("ParticleEmitter") or d:IsA("Beam") or d:IsA("Trail") or d:IsA("Light")) then
			local layer = d :: any -- all four classes have Enabled
			task.delay(delay, function()
				layer.Enabled = true
				task.delay(duration, function()
					layer.Enabled = false
				end)
			end)
		end
		if d:IsA("AudioPlayer") and d:GetAttribute("PlayOnEmit") ~= false then
			d.TimePosition = 0
			d:Play()
		end
	end
end

-- Seconds until the last particle, trail segment and sound is gone.
local function lifetime(root: Instance): number
	local t = 0
	for _, d in root:GetDescendants() do
		local delay = (d:GetAttribute("EmitDelay") :: number?) or 0
		local duration = (d:GetAttribute("EmitDuration") :: number?) or 0
		if d:IsA("ParticleEmitter") then
			t = math.max(t, delay + duration + d.Lifetime.Max / math.max(d.TimeScale, 0.01))
		elseif d:IsA("Trail") then
			t = math.max(t, delay + duration + d.Lifetime)
		elseif d:IsA("Beam") or d:IsA("Light") then
			t = math.max(t, delay + duration)
		elseif d:IsA("AudioPlayer") then
			t = math.max(t, d.TimeLength / math.max(d.PlaybackSpeed, 0.01))
		end
	end
	return t
end

local function playAt(template: Model, cf: CFrame)
	local fx = template:Clone()
	fx:PivotTo(cf)
	fx.Parent = fxFolder
	emit(fx)
	task.delay(lifetime(fx) + 0.25, function()
		fx:Destroy()
	end)
end

local function stopLayers(model: Instance)
	for _, d in model:GetDescendants() do
		if d:IsA("ParticleEmitter") or d:IsA("Beam") or d:IsA("Trail") or d:IsA("Light") then
			(d :: any).Enabled = false
		elseif d:IsA("AudioPlayer") then
			d:Stop()
		end
	end
end

local function far(pos: Vector3): boolean
	local cam = workspace.CurrentCamera
	return cam ~= nil and (cam.CFrame.Position - pos).Magnitude > CULL_DISTANCE
end

type Flight = { fx: Model, origin: Vector3, velocity: Vector3, t0: number }
local live: { [number]: Flight } = {} -- projectiles in flight, by id

play.OnClientEvent:Connect(function(kind: string, ...)
	if kind == "burst" then
		local name, cf = ...
		local template = library:FindFirstChild(name) :: Model?
		if template and not far(cf.Position) then
			playAt(template, cf)
		end
	elseif kind == "projectile" then
		local id, name, origin, velocity, t0 = ...
		local template = library:FindFirstChild(name) :: Model?
		if not template then
			return
		end
		local fx = template:Clone()
		fx:PivotTo(CFrame.lookAlong(origin, velocity))
		fx.Parent = fxFolder
		emit(fx)
		for _, d in fx:GetDescendants() do
			if d:IsA("ParticleEmitter") and d:GetAttribute("Loop") then
				d.Enabled = true
			end
		end
		live[id] = { fx = fx, origin = origin, velocity = velocity, t0 = t0 }
	elseif kind == "impact" then
		local id, name, cf = ...
		local p = live[id]
		if p then
			live[id] = nil
			stopLayers(p.fx)
			-- let live particles and the trail finish instead of popping them
			task.delay(lifetime(p.fx), function()
				p.fx:Destroy()
			end)
		end
		local template = library:FindFirstChild(name) :: Model?
		if template and not far(cf.Position) then
			playAt(template, cf)
		end
	end
end)

-- Every client places each projectile from server time, so all screens agree.
RunService.RenderStepped:Connect(function()
	local now = workspace:GetServerTimeNow()
	for _, p in live do
		p.fx:PivotTo(CFrame.lookAlong(p.origin + p.velocity * (now - p.t0), p.velocity))
	end
end)

-- Input example [added]: Q casts a fireball toward the mouse. Swap in your own input and aim.
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local mouse = Players.LocalPlayer:GetMouse()
UserInputService.InputBegan:Connect(function(input, processed)
	if not processed and input.KeyCode == Enum.KeyCode.Q then
		request:FireServer("Fireball", mouse.Hit.Position)
	end
end)
```

Status: from the kit (`FxReplicator.client` and `VfxKit.emit`, `lifetime`, `play`; test L10: 1 copy
in flight, 2 at impact, 0 at the end, the Boom read at impact on the play sheet). Local prediction
and test counters were dropped; the input example is new (not run: the test fires the remote
directly). As one script: run live (Studio 0.743), test L13: Slash, Fireball and Boom drawn on the
client in that order, the Fireball moved 28 studs, 3 effects at most, 0 left after the impact.

## 2. An audio graph with wires, a bus, an effect, ducking and 3D sound

One Wire per hop, and n effects need n + 1 wires (ByteBlox, LAYhd_j-thI [00:05:46]; Cookie Tech,
FminS9nvqJg [00:19:35]). A 3D source is an `AudioEmitter` under an Attachment or a part, heard
through an `AudioListener` (Cookie Tech [00:14:59]).

```
Music -> MusicEQ -> Ducker (Input) -> MusicBus -> Speakers
Hit -----------------------------------> SfxBus -> Speakers
Hit -> Ducker (Sidechain pin): the music dips while a hit plays
Crackle -> AudioEmitter on the Torch part -> camera AudioListener -> device output (made by Studio)
```

<!-- snippet: copy_audio_build -->

```lua
-- Run once in Edit (command bar or a build script); the graph saves with the place.
local SoundService = game:GetService("SoundService")

local function wire(src: Instance, dst: Instance, targetPin: string?): Wire
	local w = Instance.new("Wire")
	w.SourceInstance = src
	w.TargetInstance = dst
	if targetPin then
		w.TargetName = targetPin -- "Input" by default; a compressor also has "Sidechain"
	end
	w.Parent = dst
	return w
end

local function player(name: string, asset: string, looping: boolean, parent: Instance): AudioPlayer
	local p = Instance.new("AudioPlayer")
	p.Name = name
	p.Asset = asset -- AssetId is deprecated
	p.Looping = looping
	p.Parent = parent
	return p
end

local speakers = Instance.new("AudioDeviceOutput")
speakers.Name = "Speakers"
speakers.Parent = SoundService

local musicBus = Instance.new("AudioFader")
musicBus.Name = "MusicBus"
musicBus.Volume = 0.8 -- 0 to 3
musicBus.Parent = SoundService
wire(musicBus, speakers)

local sfxBus = Instance.new("AudioFader")
sfxBus.Name = "SfxBus"
sfxBus.Parent = SoundService
wire(sfxBus, speakers)

-- Built-in files stand in for uploads; replace with your rbxassetid:// ids.
local music = player("Music", "rbxasset://sounds/impact_water.mp3", true, SoundService)
local hit = player("Hit", "rbxasset://sounds/impact_explosion_03.mp3", false, SoundService)

local eq = Instance.new("AudioEqualizer")
eq.Name = "MusicEQ"
eq.HighGain = -12 -- dB: tucks the bed under effects and voice
eq.Parent = SoundService

local ducker = Instance.new("AudioCompressor")
ducker.Name = "Ducker"
ducker.Threshold = -30 -- dB, -60 to 0
ducker.Ratio = 8 -- 1 to 50
ducker.Attack = 0.01 -- seconds
ducker.Release = 0.3 -- seconds
ducker.Parent = SoundService

wire(music, eq)
wire(eq, ducker, "Input")
wire(ducker, musicBus)
wire(hit, sfxBus)
wire(hit, ducker, "Sidechain") -- feeds the detector only; the SfxBus wire is what you hear

-- 3D: an emitter on a part; the listener comes from DefaultListenerLocation.
local torch = workspace:FindFirstChild("Torch")
if not torch then
	local part = Instance.new("Part")
	part.Name = "Torch"
	part.Anchored = true
	part.Position = Vector3.new(0, 4, -20)
	part.Parent = workspace
	torch = part
end
local spot = Instance.new("Attachment")
spot.Name = "SoundSpot"
spot.Parent = torch
local emitter = Instance.new("AudioEmitter")
emitter:SetDistanceAttenuation({ [0] = 1, [50] = 0.5, [80] = 0 }) -- studs -> volume
emitter.Parent = spot -- under a Folder or a Model it would be silent
local crackle = player("Crackle", "rbxasset://sounds/impact_water.mp3", true, spot)
wire(crackle, emitter)

-- Edit only (plugin security): without this a playtest had no listener at all (observed).
SoundService.DefaultListenerLocation = Enum.ListenerLocation.Camera
```

Status: the wire, player, bus, emitter and ducking lines are from the kit (`AudioKit`, tests L6 to
L8: 4 of 4 wires connected, the bus reached the device output, the bed dipped 21 dB under the hit,
audibility 0.5 at 50 studs and 0 past 80 with this curve). As one script: run live (Studio 0.743),
test L12 in Edit: 10 of 10 wires connected, the Music and Hit chains reach the device output, one
sidechain wire, the Torch emitter read 0.9 audibility at 10 studs (the curve's value) and a
measurable level. Start sounds at runtime from a script: `music:Play()`, `hit:Play()`.

<!-- snippet: copy_audio_check -->

```lua
-- Prove the graph before anyone listens: Edit, or a client during a playtest.
local SoundService = game:GetService("SoundService")
local music = SoundService:WaitForChild("Music") :: AudioPlayer
local meter = Instance.new("AudioAnalyzer")
meter.Parent = SoundService
local tap = Instance.new("Wire") -- a second wire on the bus output: a tap, the chain is unchanged
tap.SourceInstance = SoundService:WaitForChild("MusicBus")
tap.TargetInstance = meter
tap.Parent = meter

local start = os.clock()
while not music.IsReady and os.clock() - start < 3 do
	task.wait()
end
music:Play()
local t0 = music.TimePosition
local loudest = 0
start = os.clock()
while os.clock() - start < 1 do -- one reading can land in a quiet spot: keep the loudest frame
	task.wait()
	loudest = math.max(loudest, meter.RmsLevel)
end
local report = { playing = music.IsPlaying, advanced = music.TimePosition - t0, rms = loudest, broken = {} }
for _, d in game:GetDescendants() do
	if d:IsA("Wire") and not d.Connected then -- a bad pin name or a cycle reads false
		table.insert(report.broken, d:GetFullName())
	end
end
music:Stop()
meter:Destroy()
return report
```

Status: from the kit checks (test L6: `TimePosition` advanced 1.23 s, analyzer RMS 0.062). As one
script: run live (Studio 0.743), test L12: playing, 1.01 s advanced, RMS 0.21, no broken wire. It
reports every disconnected Wire in the game, leftovers of other graphs included: its first run
caught 3 left by an earlier test. Passing means `playing` true, `advanced` near 1, `rms` above 0 and
`broken` empty. Balance, timing and tone still need a person's ear.

## 3. Footsteps from animation markers, with material groups

GnomeCode syncs steps to animation events named exactly `footstep`, with parameter `left` or
`right`, on the frames of foot contact (PNYtTkMidE8 [00:04:42-00:06:04]). A material map folds many
materials into a few sound sets, so players download fewer files (PNYtTkMidE8 [00:08:23-00:08:56]).

Two facts change the setup in a default game:

- **The default R15 animations carry no markers** (observed: the run and walk clips returned 0
  `KeyframeMarker`s). Add the events to your own copy of the run and walk animations in the
  Animation Editor, publish them (a person's upload), and point the character's `Animate` script at
  them. Until then, the stride fallback below counts distance: 4.6 studs per step in test L11.
- **The default character sounds are legacy `Sound` objects**, made by the `RbxCharacterSounds`
  LocalScript (9 Sounds under the root part, observed). Their looped `Running` sound would double
  every step. Choose one:
  - Replace them all: an empty LocalScript named `RbxCharacterSounds` in StarterPlayer >
    StarterPlayerScripts takes the place of Roblox's script (observed: 9 legacy Sounds became 0).
    Add your own jump and land sounds.
  - Keep jump and land: set `Running.Volume` to 0, as the script below does.
  - `SoundService.CharacterSoundsUseNewApi` moves the default sounds to the Audio API (Properties of
    SoundService); not tested here.

<!-- snippet: copy_footsteps -->

```lua
-- StarterPlayer/StarterCharacterScripts/Footsteps (LocalScript)
local RunService = game:GetService("RunService")

local SETS: { [string]: { string } } = { -- 3 to 5 takes per set; built-in files stand in for uploads
	Default = { "rbxasset://sounds/action_jump_land.mp3", "rbxasset://sounds/action_get_up.mp3" },
	Grass = { "rbxasset://sounds/action_swim.mp3" },
}
local MAP: { [Enum.Material]: string } = { -- many materials, few sets
	[Enum.Material.Grass] = "Grass",
	[Enum.Material.LeafyGrass] = "Grass",
}
local VOLUME: { [string]: number } = { Default = 0.5, Grass = 0.3 } -- GnomeCode [00:08:56]
local MARKER = "footstep"
local STRIDE = 4.4 -- studs per step of the default R15 run at WalkSpeed 16 (observed)

local character = script:FindFirstAncestorOfClass("Model") :: Model -- the character this script was copied into
local humanoid = character:WaitForChild("Humanoid") :: Humanoid
local root = character:WaitForChild("HumanoidRootPart") :: BasePart
local animator = humanoid:WaitForChild("Animator") :: Animator

local running = root:FindFirstChild("Running")
if running and running:IsA("Sound") then
	running.Volume = 0 -- the legacy looped run sound
end

local feet = Instance.new("Attachment")
feet.Name = "Footsteps"
feet.Position = Vector3.new(0, -(root.Size.Y / 2 + humanoid.HipHeight), 0)
feet.Parent = root
local emitter = Instance.new("AudioEmitter")
emitter.Parent = feet

-- One AudioPlayer per take, wired once: switching Asset per step would reload it.
local takes: { [string]: { AudioPlayer } } = {}
for setName, assets in SETS do
	takes[setName] = {}
	for i, asset in assets do
		local p = Instance.new("AudioPlayer")
		p.Name = setName .. i
		p.Asset = asset
		p.Volume = VOLUME[setName] or 0.5
		p.Parent = feet
		local w = Instance.new("Wire")
		w.SourceInstance = p
		w.TargetInstance = emitter
		w.Parent = p
		table.insert(takes[setName], p)
	end
end

local lastIndex: { [string]: number } = {}
local function step()
	local mat = humanoid.FloorMaterial
	if mat == Enum.Material.Air then
		return
	end
	local setName = MAP[mat] or "Default"
	local list = takes[setName] or takes.Default
	local i = math.random(1, #list)
	if #list > 1 and i == lastIndex[setName] then
		i = i % #list + 1 -- never the same take twice in a row
	end
	lastIndex[setName] = i
	local p = list[i]
	p.PlaybackSpeed = 1 + (math.random() * 2 - 1) * 0.08
	p.TimePosition = 0
	p:Play()
end

-- Markers when the playing animation has them.
local markerSeen = false
local function hook(track: AnimationTrack)
	track:GetMarkerReachedSignal(MARKER):Connect(function(foot)
		markerSeen = true
		step() -- `foot` is "left" or "right": pan or pick a foot attachment from it
	end)
end
for _, track in animator:GetPlayingAnimationTracks() do
	hook(track)
end
animator.AnimationPlayed:Connect(hook)

-- Stride fallback: distance from the root's velocity (Humanoid.MoveDirection stays 0 under MoveTo).
local travelled = 0
RunService.Heartbeat:Connect(function(dt)
	if markerSeen or humanoid.FloorMaterial == Enum.Material.Air then
		return
	end
	local v = root.AssemblyLinearVelocity
	local speed = Vector3.new(v.X, 0, v.Z).Magnitude
	if speed < 1 then
		return
	end
	travelled += speed * dt
	if travelled >= STRIDE then
		travelled -= STRIDE
		step()
	end
end)
```

Status: from the kit (`Footsteps`, test L11: 14 steps over 64.2 studs with the Default set, the
Grass set on LeafyGrass, heard by the camera listener). As one script: run live (Studio 0.743), test
L14: 6 footstep markers gave 6 steps, on a clip registered for the session with
`KeyframeSequenceProvider:RegisterKeyframeSequence` (no upload); the two Default takes alternated on
plastic, 3 takes wired, 1 listener. The stride fallback of this script stood idle in that test; the
kit's version ran in L11.

<!-- snippet: copy_animate_ids -->

```lua
-- StarterPlayer/StarterCharacterScripts/UseStepAnimations (LocalScript)
-- Points the default Animate script at your published run and walk clips that carry footstep events.
local character = script:FindFirstAncestorOfClass("Model") :: Model -- the character this script was copied into
local animate = character:WaitForChild("Animate")
local runAnim = animate:WaitForChild("run"):WaitForChild("RunAnim") :: Animation
local walkAnim = animate:WaitForChild("walk"):WaitForChild("WalkAnim") :: Animation
runAnim.AnimationId = "rbxassetid://0" -- your run clip with footstep events
walkAnim.AnimationId = "rbxassetid://0" -- your walk clip with footstep events
```

Status: not yet run (needs Studio and uploaded clips). Marker authoring belongs to
scenario-roblox-animation.

## 4. Post effects for one player

Post effects under `Lighting` show to everyone; under the local `Camera` they show to one player
only, for example a blur behind a menu or a low-health tint (post-processing docs). Create them on
the client, because each client has its own Camera.

<!-- snippet: copy_camera_fx -->

```lua
-- StarterPlayerScripts/PlayerScreenFx (ModuleScript, required by your LocalScripts)
local TweenService = game:GetService("TweenService")
local camera = workspace.CurrentCamera

local tint = Instance.new("ColorCorrectionEffect")
tint.Name = "HurtTint"
tint.Parent = camera -- this player only

local blur = Instance.new("BlurEffect")
blur.Name = "MenuBlur"
blur.Size = 0
blur.Parent = camera

-- A red pulse when this player is hit.
local function hurtPulse()
	tint.TintColor = Color3.fromRGB(255, 140, 140)
	TweenService:Create(tint, TweenInfo.new(0.4), { TintColor = Color3.new(1, 1, 1) }):Play()
end

-- Blur the world behind an open menu.
local function setMenuBlur(open: boolean)
	TweenService:Create(blur, TweenInfo.new(0.2), { Size = if open then 16 else 0 }):Play()
end

return { hurtPulse = hurtPulse, setMenuBlur = setMenuBlur }
```

Status: run live (Studio 0.743), test L15: both effects under this client's Camera only, none on the
server or under Lighting; blur reached 16, the tint read G 0.69 mid-pulse and 1 after,
`setMenuBlur(false)` brought blur back to 0. The pulse and blur values are [added]. Judge them in a
playtest capture: Edit captures depend on the Editor Quality Level ([gui-paths.md](gui-paths.md)).
Global looks (warm light with cool shadows, Bloom) belong to scenario-roblox-environment.

## 5. Highlight hit flash

Twist VFX pulses a `Highlight` on the character during a slash: `FillTransparency` tweened from
about 0.4 to 0.6 with Circular, InOut, Reverses true, over half the beam's duration; DepthMode
AlwaysOnTop shows in the panel (zlKdwujvP2A [00:41:42-00:43:21, 00:42:01, 00:42:51]). If a tween
stalls because Studio lagged, reset the start value first ([00:51:54]). For a hit flash, the
Highlight starts hidden, pulses to about 0.4 and is removed after [added].

<!-- snippet: copy_hit_flash -->

```lua
-- ReplicatedStorage/HitFlash (ModuleScript). Client: flash a model that was hit, for example from FxClient.
local TweenService = game:GetService("TweenService")

local function hitFlash(model: Model, color: Color3, duration: number)
	local h = model:FindFirstChild("HitFlash") :: Highlight?
	if not h then
		local new = Instance.new("Highlight")
		new.Name = "HitFlash"
		new.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
		new.OutlineTransparency = 1
		new.Parent = model -- one per model, reused: a fresh hit restarts the pulse
		h = new
	end
	local flash = h :: Highlight
	flash.FillColor = color
	flash.FillTransparency = 1 -- reset first: a stalled tween leaves it anywhere
	local info = TweenInfo.new(duration / 2, Enum.EasingStyle.Circular, Enum.EasingDirection.InOut, 0, true)
	local tween = TweenService:Create(flash, info, { FillTransparency = 0.4 })
	tween.Completed:Once(function(state)
		if state == Enum.PlaybackState.Completed then
			flash:Destroy()
		end
	end)
	tween:Play()
end

return hitFlash
```

Status: run live (Studio 0.743), test L16: added AlwaysOnTop, not seen by the server, a second hit
reused it (1 Highlight), fill reached 0.40, removed after the pulse.

## 6. Test the fireball under lag

Set latency before starting the playtest, then cast, capture the projectile on the client at several
times, and check where the impact lands.

- **GUI (Network Simulator, docs `studio/network-simulator`):** File > Beta Features > enable New
  Device Simulator, then restart Studio. Test > Device Simulator, then the Network pill in the
  toolbar above the viewport. Pick a preset (Ideal Fiber, Wired Broadband, Home Wi-Fi, Standard
  Mobile, Bad Connection) or type inbound and outbound latency (0 to 1,000 ms), jitter and loss (0
  to 0.5 %). Select Apply before Play: edits only stage until then. The same values sit in File >
  Studio Settings > Network.
- **Code (Edit, plugin security):** the same `NetworkSettings` values; scenario-roblox-networking
  runs them live as `rbx_net.set_latency(studio, 100, 100)`.

<!-- snippet: copy_latency -->

```lua
-- Command bar in Edit, before Play. Set both back to 0 after the test.
local network = settings().Network
network.InboundNetworkMinDelayMs = 100
network.OutboundNetworkMinDelayMs = 100
```

Status: not run by this skill; the properties ran live in scenario-roblox-networking. What to check:
the projectile sits on the same path on every client, because each client places it from server
time; the caster sees their own cast after a round trip, which local prediction hides (draw at input
and skip the server's echo for the caster; the kit's `FxReplicator.request` does this, not run
live); impacts land where the server's ray hit.
