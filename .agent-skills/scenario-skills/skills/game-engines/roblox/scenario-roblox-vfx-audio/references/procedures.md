# Procedures (scenario-roblox-vfx-audio)

Every procedure names its test and result. Live tests ran in Roblox Studio 0.743 on macOS through
the built-in Studio MCP server, driven by the scenario-roblox-expert toolkit. Test ids: `L` live,
`O` offline. The code blocks below are the code the tests run: the live runner loads each block by
its id, so a block that drifts from the tests fails them. Ids such as P10 or L7 index the tests;
never use them as names in game code. Standalone versions without the kit, with plain names, are in
[copy-ready.md](copy-ready.md).

## 1. Toolkit

`scripts/rbx_vfx_audio.py` imports the lead's `rbx_run`, `rbx_review` and `rbx_mcp`. Import it from
a sibling script:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent / "scenario-roblox-vfx-audio" / "scripts"))
import rbx_vfx_audio as VA
```

| Function                                            | Returns                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `run(studio, code, dm="Edit", kit=(), lead_kit=())` | `{ok, result, error, output}` with this skill's modules inlined; error lines point into `code`           |
| `sync_runtime(studio)`                              | writes VfxKit, AudioKit, FxReplicator, Footsteps as new ModuleScripts in `ReplicatedStorage.VfxAudio`    |
| `timeline(studio, build, times, out_dir, cam, at)`  | freeze-frame captures at effect times, plus a contact sheet and image checks                             |
| `make_flipbook(frames, out, cols=4, size=1024)`     | a transparent `size` px sheet, frames left to right, top to bottom                                       |
| `check_flipbook(png, layout, frames=None)`          | `ok`, `flags` (not-a-multiple, not-square, over-1024, no-alpha, touches-cell-edge, frame-count-mismatch) |
| `check_audio(path)`                                 | `ok`, `flags`, seconds, sample rate, channels, LUFS, true peak (ffprobe, ffmpeg)                         |
| `prepare_audio(src, out, kind)`                     | trimmed, 48 kHz, leveled file, then `check_audio` of it                                                  |

CLI: `rbx_vfx_audio.py check-audio f.ogg`, `prepare-audio in.wav out.ogg music`,
`check-flipbook sheet.png Grid4x4`.

AgentKit modules in `scripts/agentkit/vfx-audio/` (inline them with `run(kit=[...])`, or ship them
in the game):

| Module                 | Use                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VfxKit`               | `build(spec, parent)`, `emit(root)`, `play(template, cf, parent)`, `lifetime(root)`, `clear`, `setTimeScale`, `count`, `arc(beam, bulge)`, `bezier(...)`                         |
| `VfxAudit`             | `audit(root, {mobile, alwaysOnBudget})`: rate and lifetime caps, zero-speed orientation, Brightness ignored, flipbook on the default texture, beam segments, missing attachments |
| `AudioKit`             | `player`, `wire`, `chain`, `bus`, `emitter`, `listener`, `duck`, `paths`, `audible`, `meter`, `assetPeak`                                                                        |
| `AudioAudit`           | `audit(game)`: empty Asset, dead-end players, disconnected wires, bad emitter parents, no listener, legacy Sound traps                                                           |
| `runtime/FxReplicator` | server-validated effects drawn on each client (section 11)                                                                                                                       |
| `runtime/Footsteps`    | material-aware steps on the Audio API (section 12)                                                                                                                               |

Effect specs are data. A layer is `{kind, name, at, props, attrs}`; kinds are `emitter`, `beam`
(`at0`, `at1`, optional `arc`), `trail` (`at0`, `at1`), `light`, `sound` (`asset`, optional
`curve`). Number pairs become `NumberRange`, `{{time, value}}` lists become sequences. Attributes
drive playback: `EmitCount`, `EmitDelay`, `EmitDuration`, `Loop` (projectiles), `PlayOnEmit`
(audio).

## 2. Effect templates from data

Build templates once in Edit (or in a build script) and keep them in `ReplicatedStorage.FxLibrary`;
clients clone them. Every texture below is built into Studio, so the block runs in any place. Not
every built-in reads as a stand-in: `explosion01_smoke_main.dds` and `fire_sparks_main.dds` are near
black in RGB (maximum 0.15 and 0.19, measured with ImageMagick), so a smoke layer made with them
vanished on the dark test stage and sparks added nothing at LightEmission 1 (observed in the first
live run). `smoke_main.dds` and `SquareParticle.png` read.

<!-- snippet: P1 -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local VfxKit = require(ReplicatedStorage.VfxAudio.VfxKit)

local library = ReplicatedStorage:FindFirstChild("FxLibrary") or Instance.new("Folder")
library.Name = "FxLibrary"
library.Parent = ReplicatedStorage

local P = "rbxasset://textures/particles/"
local HOT = { { 0, Color3.fromRGB(255, 244, 200) }, { 0.35, Color3.fromRGB(255, 150, 50) }, { 1, Color3.fromRGB(110, 30, 10) } }
local OMNI = Vector2.new(180, 180)

local specs = {
	{
		name = "Boom",
		layers = {
			{ kind = "emitter", name = "Flash", attrs = { EmitCount = 1 }, props = {
				Texture = P .. "explosion01_core_main.dds", Lifetime = 0.15, Speed = 0, ZOffset = 1,
				Size = { { 0, 4 }, { 1, 12 } }, Transparency = { { 0, 0 }, { 1, 1 } }, LightEmission = 1 } },
			{ kind = "emitter", name = "Core", attrs = { EmitCount = 8 }, props = {
				Texture = P .. "explosion01_core_main.dds", Lifetime = { 0.35, 0.6 }, Speed = { 3, 8 }, Drag = 4,
				SpreadAngle = OMNI, Size = { { 0, 3 }, { 1, 8 } }, Transparency = { { 0, 0 }, { 0.7, 0.4 }, { 1, 1 } },
				Color = HOT, LightEmission = 1, Rotation = { 0, 360 }, RotSpeed = { -90, 90 } } },
			{ kind = "emitter", name = "Smoke", attrs = { EmitCount = 8, EmitDelay = 0.08 }, props = {
				Texture = P .. "smoke_main.dds", Lifetime = { 0.9, 1.4 }, Speed = { 3, 7 }, Drag = 3,
				SpreadAngle = OMNI, Acceleration = Vector3.new(0, 3, 0), Size = { { 0, 3 }, { 1, 9 } },
				Transparency = { { 0, 0.15 }, { 1, 1 } }, Color = Color3.fromRGB(150, 140, 130), LightInfluence = 0.5,
				Rotation = { 0, 360 } } },
			{ kind = "emitter", name = "Sparks", attrs = { EmitCount = 24 }, props = {
				Texture = P .. "SquareParticle.png", Lifetime = { 0.3, 0.6 }, Speed = { 25, 45 }, Drag = 5,
				SpreadAngle = OMNI, Acceleration = Vector3.new(0, -40, 0),
				Orientation = Enum.ParticleOrientation.VelocityParallel, Size = { { 0, 0.6 }, { 1, 0 } },
				Color = Color3.fromRGB(255, 190, 90), LightEmission = 1 } },
			-- Speed 0.01, not 0: a velocity-oriented particle with no velocity is not drawn
			{ kind = "emitter", name = "Shockwave", attrs = { EmitCount = 1 }, props = {
				Texture = P .. "explosion01_shockwave_main.dds", Lifetime = 0.35, Speed = 0.01,
				Orientation = Enum.ParticleOrientation.VelocityPerpendicular, EmissionDirection = Enum.NormalId.Top,
				Size = { { 0, 1 }, { 1, 16 } }, Transparency = { { 0, 0.2 }, { 1, 1 } }, LightEmission = 1 } },
			{ kind = "light", name = "Light", attrs = { EmitDuration = 0.15 }, props = {
				Brightness = 6, Range = 16, Color = Color3.fromRGB(255, 170, 80) } },
			{ kind = "sound", name = "Sound", asset = "rbxasset://sounds/impact_explosion_03.mp3", props = { Volume = 1 } },
		},
	},
	{
		name = "Slash",
		layers = {
			{ kind = "beam", name = "Arc", at0 = Vector3.new(-5, 1.5, 0), at1 = Vector3.new(5, 1.5, 0),
				arc = Vector3.new(0, 0, -1), attrs = { EmitDuration = 0.18 }, props = {
				Width0 = 2.5, Width1 = 0.2, Segments = 20, FaceCamera = true, LightEmission = 1,
				Color = { { 0, Color3.fromRGB(230, 255, 250) }, { 1, Color3.fromRGB(40, 220, 170) } },
				Transparency = { { 0, 0 }, { 0.8, 0.3 }, { 1, 1 } } } },
			{ kind = "emitter", name = "Sparks", at = Vector3.new(0, 1.5, -3), attrs = { EmitCount = 14 }, props = {
				Texture = P .. "SquareParticle.png", Lifetime = { 0.2, 0.4 }, Speed = { 15, 30 }, Drag = 6,
				SpreadAngle = Vector2.new(60, 60), Orientation = Enum.ParticleOrientation.VelocityParallel,
				Size = { { 0, 0.5 }, { 1, 0 } }, Color = Color3.fromRGB(120, 255, 210), LightEmission = 1 } },
		},
	},
	{
		name = "Fireball",
		layers = {
			{ kind = "emitter", name = "Core", attrs = { EmitCount = 6, Loop = true }, props = {
				Texture = P .. "fire_main.dds", Rate = 80, Lifetime = { 0.25, 0.4 }, Speed = { 0.5, 1.5 },
				SpreadAngle = OMNI, Size = { { 0, 2.6 }, { 1, 0.6 } }, Transparency = { { 0, 0.1 }, { 1, 1 } },
				Color = HOT, LightEmission = 1, Rotation = { 0, 360 }, RotSpeed = { -180, 180 } } },
			{ kind = "emitter", name = "Embers", attrs = { Loop = true }, props = {
				Texture = P .. "SquareParticle.png", Rate = 30, Lifetime = { 0.5, 0.8 }, Speed = { 1, 3 },
				SpreadAngle = OMNI, Size = { { 0, 0.35 }, { 1, 0 } }, Color = Color3.fromRGB(255, 160, 60),
				LightEmission = 1 } },
			{ kind = "trail", name = "Trail", at0 = Vector3.new(0, 0.9, 0), at1 = Vector3.new(0, -0.9, 0), props = {
				Lifetime = 0.35, MinLength = 0.05, FaceCamera = true, WidthScale = { { 0, 1 }, { 1, 0 } },
				Transparency = { { 0, 0.15 }, { 1, 1 } }, Color = HOT, LightEmission = 1 } },
			{ kind = "light", name = "Light", props = { Brightness = 3, Range = 12, Color = Color3.fromRGB(255, 150, 60) } },
		},
	},
}

for _, spec in specs do
	local old = library:FindFirstChild(spec.name)
	if old then
		old:Destroy()
	end
	VfxKit.build(spec, library)
end
return VfxKit.count(library)
```

Test L1: run in Studio 0.743 on 2026-10-19: pass, 3 templates (Boom, Fireball, Slash) with 8
emitters, 1 beam, 1 trail, 2 lights and 1 sound; the cloned Wire was remapped and connected;
`lifetime()` 2.59 s for Boom, 0.40 s for Slash; EmitDuration layers started off.

## 3. Freeze-frame review over time

A capture takes about a second, so a live effect is never caught at a known time. `timeline` emits,
waits `t`, sets `TimeScale` 0 on every emitter, captures, and repeats for each `t`; beams, trails
and lights are not frozen. Read the contact sheet, never the single frames.

<!-- snippet: P2 -->

```python
from rbx_mcp import Studio
from rbx_vfx_audio import timeline

PREVIEW = """
local fx = workspace.Fx:FindFirstChild("Preview")
if not fx then
	fx = game:GetService("ReplicatedStorage").FxLibrary.Boom:Clone()
	fx.Name = "Preview"
	fx:PivotTo(CFrame.new(0, 4, -30))
	fx.Parent = workspace.Fx
end
return fx
"""
with Studio(place="my-place.rbxl") as studio:
    r = timeline(studio, PREVIEW, [0.05, 0.15, 0.35, 0.7, 1.6], "review/boom", cam=[0, 9, -8], at=[0, 6, -30])
print(r["sheet"], [c["flags"] for c in r["checks"]])
```

Judge the sheet with `critique.md`: a readable silhouette at the first frame, hot core first, smoke
after, nothing left at the last frame.

Test L2: run in Studio 0.743 on 2026-10-19: pass, 5 freeze-frames, each differs from the next
(changed fraction 0.022 to 0.055), two captures 1.5 s apart at TimeScale 0 identical; mean luma 0.15
to 0.18. Sheet judged: round flash at 0.05 s, hot core ringed by sparks at 0.15 s, fireball with
sparks thrown out at 0.35 s, gray smoke at 0.7 s, nothing left at 1.6 s. The light is not frozen:
one run caught its pool at 0.05 s, the final run did not.

## 4. Audit an effect library

<!-- snippet: P3 -->

```lua
-- Edit or Client; VfxAudit is inlined by rbx_vfx_audio.run(kit = ["VfxAudit"]).
local library = game:GetService("ReplicatedStorage").FxLibrary
return VfxAudit.audit(library, { mobile = true, alwaysOnBudget = 20 })
```

Errors block shipping; warnings need a reason; `info` is advice. The always-on budget is per scene
and is a team number [added], not an engine limit.

Test L3: run in Studio 0.743 on 2026-10-19: pass, clean library 0 findings (8 emitters, EmitCount
sum 62, 0 always on); the fixture raised all 9 planted rules (beam-segments, brightness-ignored,
default-texture, flipbook-default-texture, lifetime-over-cap, no-fade-out, rate-over-cap,
trail-missing-attachment, zero-speed-velocity-orientation).

## 5. Beam arcs

A beam is a cubic Bezier: P1 sits `CurveSize0` studs along Attachment0's +X, P2 sits `CurveSize1`
studs along Attachment1's -X (Beam docs). For a semicircle, point both attachments' +X at the bulge
and set `CurveSize0 = h`, `CurveSize1 = -h` with `h = chord x 2/3`: the midpoint then lies `0.75 h`
from the chord, which is the radius.

<!-- snippet: P4 -->

```lua
local VfxKit = require(game:GetService("ReplicatedStorage").VfxAudio.VfxKit)

local part = Instance.new("Part")
part.Name = "ArcDemo"
part.Anchored = true
part.CanCollide = false
part.Transparency = 1
part.Position = Vector3.new(0, 2, -30)
local a0, a1 = Instance.new("Attachment"), Instance.new("Attachment")
a0.Position, a1.Position = Vector3.new(-10, 0, 0), Vector3.new(10, 0, 0)
a0.Parent, a1.Parent = part, part
local beam = Instance.new("Beam")
beam.Attachment0, beam.Attachment1 = a0, a1
beam.Segments = 24 -- a curve needs segments; Instance.new gives 10
beam.Width0, beam.Width1 = 0.6, 0.6
beam.FaceCamera = true
beam.LightEmission = 1
beam.Parent = part
part.Parent = workspace.Fx

local h = VfxKit.arc(beam, Vector3.yAxis)
local apex = VfxKit.bezier(a0.WorldPosition, a0.WorldCFrame.RightVector, beam.CurveSize0,
	a1.WorldPosition, a1.WorldCFrame.RightVector, beam.CurveSize1, 0.5)
return { h = h, apexHeight = apex.Y - a0.WorldPosition.Y } -- expect 13.33 and 10
```

Test L4: run in Studio 0.743 on 2026-10-19: pass, 20-stud chord: CurveSize 13.33, midpoint 10.0
studs above the ends (the radius). Capture judged: the arc passes through the apex marker; the
TextureLength 4 beam shows four glows, the TextureLength 1 beam one stretched glow.

## 6. Flipbook sheets

Pack the frames (from scenario-sprite-animation or scenario-game-assets) offline, check the sheet,
then upload it through Asset Manager (a human step: the agent never uploads).

<!-- snippet: P5sheet -->

```python
from pathlib import Path
from rbx_vfx_audio import check_flipbook, make_flipbook

frames = sorted(Path("frames").glob("*.png"))  # 16 frames in play order
info = make_flipbook(frames, "smoke_4x4.png", cols=4)  # 1024 x 1024, 256 px cells, 2 px transparent gutters
report = check_flipbook("smoke_4x4.png", "Grid4x4", frames=len(frames))
print(info["size"], report["flags"])
```

<!-- snippet: P5emitter -->

```lua
local SHEET = "rbxasset://textures/AvatarEditorImages/Sheet.png" -- stand-in; use your uploaded sheet id
local holder = Instance.new("Part")
holder.Name = "FlipbookDemo"
holder.Anchored = true
holder.CanCollide = false
holder.Transparency = 1
holder.Position = Vector3.new(0, 8, -30)
local attachment = Instance.new("Attachment")
attachment.Parent = holder
local pe = Instance.new("ParticleEmitter")
pe.Texture = SHEET
pe.FlipbookLayout = Enum.ParticleFlipbookLayout.Grid2x2 -- must match the sheet's grid
pe.FlipbookMode = Enum.ParticleFlipbookMode.OneShot -- the whole sheet once per particle life
pe.Lifetime = NumberRange.new(2)
pe.Rate = 0
pe.Speed = NumberRange.new(0)
pe.Size = NumberSequence.new(6)
pe.LightInfluence = 0
pe.Parent = attachment
holder.Parent = workspace.Fx
return { incompatible = pe.FlipbookIncompatible }
```

`FlipbookIncompatible` read the same text with layout None, with a working Grid2x2, and on a 2048 px
sheet that animated: treat it as a hint, never as a status (observed).

Tests L5 and O3: run in Studio 0.743 on 2026-10-19: pass, Grid2x2 OneShot on a 2048 px built-in
sheet, two freeze-frames differ by 13.9 %; `FlipbookIncompatible` read the 1024 text in every state.
Sheet judged: 0.25 s showed the sheet's top-left cell at full strength; 1.25 s showed a dimmer image
with the top-right cell's icons and the bottom-left cell's ring and disc together, so frames advance
but their timing and any blending are not pinned down. O3 offline: pass, 1024 x 1024 sheet, 16
cells, 0 bleeding; odd sizes, no alpha, over 1024 and frames touching the cell edge were flagged.

## 7. Audio graph: bus, effect chain, meter

<!-- snippet: P6 -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local AudioKit = require(ReplicatedStorage.VfxAudio.AudioKit)

local music = AudioKit.player("rbxasset://sounds/impact_water.mp3", { Looping = true, Volume = 0.8 }, SoundService)
music.Name = "Music"
local eq = Instance.new("AudioEqualizer")
eq.Name = "MusicEQ"
eq.HighGain = -12 -- dB: tucks the bed under effects and voice
local bus = AudioKit.bus("MusicBus", SoundService) -- an AudioFader wired to an AudioDeviceOutput named Out
local wires = AudioKit.chain(music, { eq }, bus, SoundService) -- 1 effect, 2 wires
local meter = Instance.new("AudioAnalyzer")
meter.Name = "MusicMeter"
meter.Parent = SoundService
AudioKit.wire(eq, meter) -- a second wire on the same Output pin: a tap, the chain is unchanged
music:Play()
return { wires = #wires, reaches = AudioKit.paths(music) }
```

<!-- snippet: P6audit -->

```lua
-- AudioAudit is inlined by rbx_vfx_audio.run(kit = ["AudioAudit"]); execute_luau can read DefaultListenerLocation.
return AudioAudit.audit(game)
```

What the agent can prove without ears: every `Wire.Connected` is true, `paths()` reaches
`AudioDeviceOutput`, `IsPlaying` and `TimePosition` move, the analyzer reads a level. What it
cannot: tone, balance, timing against picture, fatigue. Those go to `critique.md` for a person.

Test L6: run in Studio 0.743 on 2026-10-19: pass, 4 of 4 wires connected, paths reach AudioAnalyzer
and AudioDeviceOutput; in Edit `TimePosition` advanced 1.23 s, analyzer RMS 0.062, peak 0.55, bus
fader at Volume 0; `Ended` fired on a 0.33 s file; the fixture raised emitter-bad-parent,
emitter-no-input, no-listener, no-listener-for-group, player-dead-end, player-no-asset,
sound-parented-to-group, sounds-in-soundservice, wire-disconnected, and a Wire to a bad pin read
Connected false.

## 8. 3D sound: emitter, listener, audibility

<!-- snippet: P7 -->

```lua
local AudioKit = require(game:GetService("ReplicatedStorage").VfxAudio.AudioKit)

local speaker = Instance.new("Part")
speaker.Name = "Speaker"
speaker.Anchored = true
speaker.Size = Vector3.one * 2
speaker.Position = Vector3.new(0, 4, -40)
speaker.Parent = workspace.Fx
local hum = AudioKit.player("rbxasset://sounds/impact_water.mp3", { Looping = true }, speaker)
local emitter = AudioKit.emitter(speaker, { [0] = 1, [50] = 0.5, [80] = 0 }) -- studs -> volume
AudioKit.wire(hum, emitter)

local ear = Instance.new("Part")
ear.Name = "Ear"
ear.Anchored = true
ear.Size = Vector3.one
ear.Position = Vector3.new(0, 4, -10)
ear.Parent = workspace.Fx
local listener = Instance.new("AudioListener")
listener.Parent = ear
local meter = Instance.new("AudioAnalyzer")
meter.Parent = ear
AudioKit.wire(listener, meter)
hum:Play()
return { audibility = listener:GetAudibilityFor(emitter), listeners = #emitter:GetInteractingListeners() }
```

`GetAudibilityFor` is the engine's own prediction (distance and angle curves, interaction groups);
use it in tests instead of guessing from distance.

Test L7: run in Studio 0.743 on 2026-10-19: pass, curve {0: 1, 50: 0.5, 80: 0}: `GetAudibilityFor`
read 0.90, 0.70, 0.50, 0.17, 0.00 at 10, 30, 50, 70, 90 studs; the listener's RMS relative to 10
studs was 1.00, 0.77, 0.56, 0.18, 0.00; a listener outside the emitter's AudioInteractionGroup got
audibility 0 and RMS 0.

## 9. Ducking with a sidechain

<!-- snippet: P8 -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local AudioKit = require(ReplicatedStorage.VfxAudio.AudioKit)

local bed = AudioKit.player("rbxasset://sounds/impact_water.mp3", { Looping = true }, SoundService)
bed.Name = "Bed"
local hit = AudioKit.player("rbxasset://sounds/impact_explosion_03.mp3", {}, SoundService)
hit.Name = "Hit"
-- Threshold in dB (-60 to 0), Ratio 1 to 50, Attack and Release in seconds
local ducker = AudioKit.duck(bed, hit, { Threshold = -30, Ratio = 8, Attack = 0.01, Release = 0.3 }, SoundService)
local mix = AudioKit.bus("Mix", SoundService)
AudioKit.wire(ducker, mix)
AudioKit.wire(hit, mix) -- the Sidechain wire only feeds the detector; route the trigger to be heard
return { ducker = ducker:GetFullName() }
```

Test L8: run in Studio 0.743 on 2026-10-19: pass, bed RMS 0.081 alone, 0.0064 while the hit fed the
sidechain (-21 dB), 0.062 after release.

## 10. Listener setup

A place made from a template kept `DefaultListenerLocation` at Default, and a playtest then had no
`AudioListener` and no `AudioDeviceOutput` anywhere, so every `AudioEmitter` was silent (observed).
Set it to Camera (or Character) once, in Edit:

<!-- snippet: P9edit -->

```lua
-- Edit only: DefaultListenerLocation needs plugin security (command bar or execute_luau)
local SoundService = game:GetService("SoundService")
SoundService.DefaultListenerLocation = Enum.ListenerLocation.Camera
return tostring(SoundService.DefaultListenerLocation)
```

<!-- snippet: P9check -->

```lua
-- Client, during a playtest: is anything there to hear the emitters?
local found = { listeners = {}, outputs = {} }
for _, d in game:GetDescendants() do
	if d:IsA("AudioListener") then
		table.insert(found.listeners, d:GetFullName())
	elseif d:IsA("AudioDeviceOutput") then
		table.insert(found.outputs, d:GetFullName())
	end
end
return found
```

Test L9: run in Studio 0.743 on 2026-10-19: pass, Default: no AudioListener and no AudioDeviceOutput
on the client or the server, AudioAudit `no-listener`, 0 listeners for the footsteps emitter;
Camera: Workspace.Camera.AudioListener, SoundService.AudioDeviceOutput on the client, 1 interacting
listener, 0 audit warnings. The empty `RbxCharacterSounds` LocalScript took legacy character Sounds
from 9 to 0.

## 11. Combat VFX replication

The server validates and decides where; each client builds and plays the effect. Instances never
replicate, so the server's `workspace.Fx` stays empty and each client culls by distance.

<!-- snippet: P10server -->

```lua
-- ServerScriptService/FxServer (Script)
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local FxReplicator = require(ReplicatedStorage.VfxAudio.FxReplicator)

FxReplicator.server({
	library = ReplicatedStorage.FxLibrary,
	rules = { Slash = { cooldown = 0.4, range = 60 } }, -- seconds between casts, studs of reach
	radius = 400, -- only players this close receive the effect
})
```

<!-- snippet: P10client -->

```lua
-- StarterPlayerScripts/FxClient (LocalScript)
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local FxReplicator = require(ReplicatedStorage:WaitForChild("VfxAudio"):WaitForChild("FxReplicator"))

FxReplicator.client({ library = ReplicatedStorage:WaitForChild("FxLibrary"), cullDistance = 400 })
-- From input: draw at once, let the server confirm for everyone else.
-- FxReplicator.request("Slash", hitPosition, CFrame.new(hitPosition))
```

<!-- snippet: P10projectile -->

```lua
-- Server: a fireball from an ability or an NPC. Clients move it from (origin, velocity, server time).
local FxReplicator = require(game:GetService("ReplicatedStorage").VfxAudio.FxReplicator)
local origin, velocity = Vector3.new(-24, 6, -30), Vector3.new(12, 0, 0)
local id = 1
FxReplicator.projectile(id, "Fireball", origin, velocity)
task.delay(3.5, function() -- a real game impacts on its server-side hit test, not on a timer
	FxReplicator.impact(id, "Boom", CFrame.new(origin + velocity * 3.5))
end)
```

Test L10: run in Studio 0.743 on 2026-10-19: pass, of 5 rapid Slash requests the server rejected 4
on cooldown (2 accepted in all); range, type and unknown requests were each rejected with that
reason; server `workspace.Fx` max 0; client copies 1 in flight, 2 at impact, 0 at the end; impact
RMS 0.036 at the muted listener tap. Play sheet judged: the fireball crosses the frame left to right
over three captures, small at 34 studs with a faint trail and embers, and the Boom reads at impact.

## 12. Footsteps

<!-- snippet: P11 -->

```lua
-- StarterPlayerScripts/FootstepsClient (LocalScript)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Footsteps = require(ReplicatedStorage:WaitForChild("VfxAudio"):WaitForChild("Footsteps"))

local CONFIG = {
	-- built-in stand-ins so the script runs anywhere; replace with your uploaded takes, 3 to 5 per set
	sets = {
		Default = { "rbxasset://sounds/action_jump_land.mp3", "rbxasset://sounds/action_get_up.mp3" },
		Grass = { "rbxasset://sounds/action_swim.mp3" },
	},
	map = { [Enum.Material.LeafyGrass] = "Grass" }, -- many materials, few sets
	volume = { Default = 0.5, Grass = 0.35 },
}

local player = Players.LocalPlayer
local function onCharacter(character: Model)
	Footsteps.start(character, CONFIG)
end
if player.Character then
	onCharacter(player.Character)
end
player.CharacterAdded:Connect(onCharacter)
```

Test L11: run in Studio 0.743 on 2026-10-19: pass, 14 steps over 64.2 studs of SmoothPlastic with
the Default set (4.6 studs per step), then 13 more on the way to and across LeafyGrass, where the
set read Grass; the camera listener read up to 0.0058 RMS.

## 13. Audio files from generation to import

<!-- snippet: P12 -->

```python
from rbx_vfx_audio import check_audio, prepare_audio

for src, kind in [("raw/explosion.wav", "sfx"), ("raw/battle_theme.wav", "music")]:
    out = "ready/" + src.split("/")[-1].replace(".wav", ".mp3")  # .ogg needs an ffmpeg built with libvorbis
    r = prepare_audio(src, out, kind)  # trim, 48 kHz, level, then check
    print(out, r["ok"], r["flags"], r["seconds"], r["lufs"], r["true_peak_db"])
```

Import limits checked: mp3, ogg, wav or flac; under 20 MB; under 7 minutes; at most 48 kHz; mono,
stereo, 3.0 or 5.1 (audio assets docs). Loudness targets are [added] defaults: music and ambience
-16 LUFS integrated with -1.5 dB true peak, one-shots peak-normalized to -1.5 dBFS (sample peak; the
mp3 encode then read about -1.3 dB true peak); the mix is then set with Volume and faders. Upload
stays a human step (Asset Manager or Open Cloud with the user's key).

Test O4: run offline on 2026-10-19 (ffmpeg): pass, sfx mp3 48000 Hz, -11.7 LUFS, true peak -1.3 dB;
music -15.8 LUFS, true peak -4.0 dB; 96 kHz, m4a, over 7 minutes and 8 channels were flagged.
