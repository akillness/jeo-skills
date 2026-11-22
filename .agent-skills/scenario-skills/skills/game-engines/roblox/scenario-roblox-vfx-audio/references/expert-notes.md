# Expert notes (scenario-roblox-vfx-audio)

Principles and judgment from the sources, with timestamps. "Observed" means checked in Roblox Studio
0.743 by this skill's tests; [added] marks this skill's own additions. Full source list:
[sources.md](sources.md).

## Building effects

**Twist VFX, How to Make Slash VFX (zlKdwujvP2A)**

- A slash is many textures emitted once, not one big sprite: five or more layers, a dark green base,
  yellow-green hot spots and a near-black underlayer [00:00:13-00:06:13]. "Don't be afraid to just
  spam slash textures cause you're only emitting one" [00:05:40].
- Emit counts live in an `EmitCount` attribute so one generic loop drives any effect [00:00:29].
- Speed 0.001 to 0.01 for perpendicular-facing particles: "if your speed is zero, it'll just
  disappear" [00:00:13]. Observed: Speed 0 with `VelocityPerpendicular` drew nothing; 0.01 drew.
- RotSpeed is degrees per second, so a 0.3 s particle needs values far above 360 for a full turn;
  tune by eye [00:04:02].
- Layers only need ZOffset steps of 0.001; large offsets only to sit over a character or the ground
  [00:02:24].
- Beam semicircle: CurveSize = diameter x 2/3, rotate 90 degrees, FaceCamera on; Segments up to
  about 50 only when it curves [00:10:55, 00:56:19]. On screen: attachments at plus and minus 9.5
  studs with CurveSize 12.667 [00:11:50]. Observed: a 20-stud chord with CurveSize 13.33 puts the
  apex 10 studs out, the radius.
- Beams show their back face at one end; accepted for fast slashes [00:12:00].
- Never tween a rotation to exactly 180 degrees, use 175: "sometimes it'll just rotate backwards"
  [00:31:30]. Rotation tweens must be shorter than size tweens or replays break [00:35:36].
- "If you can make out the shape super well, it's generally lasting too long": impact flash Lifetime
  0.05 s [00:44:26].
- Debris: SpreadAngle 180, Speed about 100, Drag about 7, Acceleration about -30, Lifetime 0.5 to 1
  [00:46:16-00:50:49]. Neon wind meshes need end transparency about 0.97 [00:41:00]. A Highlight on
  the character pulses during the slash: FillTransparency from about 0.4 to 0.6 and back, Circular
  InOut, Reverses true, half the beam's duration, DepthMode AlwaysOnTop on screen
  [00:41:42-00:43:21, 00:42:01]; reset the start value if a tween stalls [00:51:54]. A hit flash
  built on it: [copy-ready.md](copy-ready.md#5-highlight-hit-flash).
- Build from references, not from scratch [00:49:09]. The finished effect is subtle at real speed
  [00:58:08].

**MoldySugar (XXCGWREKpo0, 9dQR7FySSLg)**

- Templates (models holding emitters, beams, trails, lights) live in ReplicatedStorage; clone to a
  CFrame into a workspace folder and emit by looping descendants [XXCGWREKpo0 00:00:29-00:03:26].
- Bursts use `Emit`; lingering effects toggle `Enabled`; an explosion combines both with a short
  delay [XXCGWREKpo0 00:04:16-00:05:22].
- Raise Editor Quality Level before judging, or effects look wrong [9dQR7FySSLg 00:00:06]. Plugin
  "retime" multipliers are the same as `TimeScale` [9dQR7FySSLg 00:04:18]. Observed: `TimeScale` 0
  freezes particles; two captures 1.5 s apart were identical.
- His single client LocalScript suits showcases only; games need the server split below (Develuper).

**TrendyV2 (xzZeP65SSlA, rIXyQ4RAwws)**

- Fire: two attachments (inner core, outer layer), a 4x4 OneShot flipbook, LightEmission about 0.8,
  Brightness 5, Lifetime 0.5, Rate 2, Speed 0.001; the outer layer darker, dimmer and fading
  [xzZeP65SSlA 00:05:16].
- Judge particles in play mode [xzZeP65SSlA 00:06:20].
- Brightness is editable only when LightInfluence is below 1 [rIXyQ4RAwws 00:02:35]. Observed:
  Brightness 1 and 6 looked identical at LightInfluence 1; 0.5 was brighter; 0 brightest.
- A Trail needs both attachments or shows nothing; a Beam joins two attachments, a Trail follows a
  moving one [rIXyQ4RAwws 00:03:07-00:04:04].

**DatBoiEle (l8wZp4JHXjw)**

- Flipbooks are the base skill for custom effects [00:03:43]. Pipeline: frames, a 4x4 (short) or 8x8
  (long) grid, transparent PNG; recheck mode, rotation and SpreadAngle after import
  [00:06:27-00:06:59].
- Stylized waterfalls are stacked Beams with TextureSpeed, not particles [00:01:48].

**Roblox docs, particle emitters**

- 400 particles per second per emitter, 100 on mobile; Lifetime capped at 20 s.
- Flipbook layouts 2x2, 4x4, 8x8; an 8x8 sheet in 1024 x 1024 holds 64 frames; FlipbookFramerate at
  most 30; low-memory clients turn flipbooks off, so reuse textures.
- Observed: `FlipbookIncompatible` read "Particle texture must be 1024 by 1024 to use flipbooks."
  with layout None, on a working Grid2x2, and on a 2048 px built-in sheet that animated. Ship 1024 x
  1024 as documented; do not test the property.
- Observed: `Instance.new("ParticleEmitter")` gives LightInfluence 0, Rate 20, Lifetime 5 to 10,
  Speed 5 and the sparkles texture; Beam gives Segments 10 and TextureLength 1; Trail gives
  Lifetime 2.

## Replicating combat effects

**Develuper (TkNZETIu0CM)**

- Local effects are seen only by the local player. Play instant feedback (muzzle flash, sound) on
  the client, impacts through the server; the server raycasts for the hit position [00:02:15,
  00:03:31, 00:04:42].
- Fire effects at animation events (a `shoot` marker on the shot frame) [00:02:57].
- Aura templates sit in ReplicatedStorage and are copied onto characters on spawn, stored per
  character to avoid duplicates [00:06:51-00:08:30].

Deciding condition [added]: Develuper's "server" effects replicate instances. When many players
watch many effects, broadcast the server's decision (name and CFrame, or projectile origin, velocity
and server time) and let each client clone and cull. Observed with FxReplicator: the server's effect
folder stayed empty while the client played and cleaned up its copies.

## Audio API

**Cookie Tech (FminS9nvqJg)**

- The graph as hardware: player (CD player), wire, effect (pedal), emitter (speaker), listener
  (ears), device output (headphones) [00:06:26-00:08:05].
- Silent output: emitters "spit into the void" unless an AudioListener wired to an AudioDeviceOutput
  exists [00:14:59]. Observed: in a template place with `DefaultListenerLocation` Default, a
  playtest had no listener and no output; Camera created `Workspace.Camera.AudioListener` and
  `SoundService.AudioDeviceOutput` on the client only.
- An AudioEmitter must sit under an Attachment, Camera or PVInstance [00:10:01].
- Each effect in a chain costs one more wire [00:19:35]. Interaction groups pair emitters and
  listeners without wires [00:31:08].
- Outdated: "AudioPlayer has no volume" (it now has `Volume`, 0 to 10); the beta toggle is gone.

**ByteBlox (LAYhd_j-thI)**

- Sources, targets and wires; an AudioListener is both a target (hears emitters) and a source
  (outputs what it hears) [00:00:36-00:03:35]. n effects need n + 1 wires [00:05:46].

**BrawlDev (b0hawic22jg, iZlh13mUwtU)**

- Distinct `AudioInteractionGroup` values isolate radios or NPC ears [b0hawic22jg 00:07:29,
  00:20:44]. Observed: an emitter moved to group "Radio" dropped to audibility 0 for the
  default-group listener.
- An AudioAnalyzer `RmsLevel` above 0.1 works as a loudness trigger for gameplay from a microphone
  [b0hawic22jg 00:21:49].
- Draw the graph before building it [b0hawic22jg 00:22:21].
- Legacy: SoundGroup Volume multiplies (0.5 x 0.5 = 0.25) [iZlh13mUwtU 00:19:17]. His parenting of
  Sounds under a group conflicts with the docs: set `Sound.SoundGroup`.

**Observed in Studio 0.743 (no expert covered these)**

- Pins: AudioPlayer and AudioListener output `Output`; AudioEmitter, AudioDeviceOutput and
  AudioAnalyzer take `Input` only; AudioCompressor takes `Input` and `Sidechain`.
- `Wire.Connected` reads false when an end is outside the DataModel, with a bad pin name, and on the
  wire that closes a cycle.
- `GetAudibilityFor` with the default curve read about 4 / distance (0.133 at 30 studs, 0.044 at
  90); a custom curve {0: 1, 50: 0.5, 80: 0} read 0.9 at 10, 0.5 at 50, 0.17 at 70 (linear between
  points) and 0 at 90, and the measured level followed (test L7).
- `rbxasset://sounds/...` built-in files load in AudioPlayer, so tests need no uploads.
- Audio plays in the Edit data model through `execute_luau`, and analyzers measure it there.

## Footsteps

**GnomeCode (PNYtTkMidE8)**

- The default running sound is one looped file that drifts from the feet [00:00:33-00:01:46].
- Put `footstep` animation events with `left` or `right` on the frames of maximum contact
  [00:04:42-00:06:04].
- Group materials into a few sound sets to limit downloads; per-set volume 0.3 or 0.5
  [00:08:23-00:08:56].
- His Animate replacement is from 2022; the Audio API replaces `Sound` for new work.

Observed [added]: the default character sounds are legacy `Sound`s made by the `RbxCharacterSounds`
LocalScript (9 under the root part); an empty LocalScript of that name in StarterPlayerScripts left
0 (test L9). Options and a marker-plus-stride script:
[copy-ready.md](copy-ready.md#3-footsteps-from-animation-markers-with-material-groups). The default
R15 run and walk animations carry no KeyframeMarkers, and the run cycle (0.625 s at Speed 1.13 to
1.18 at WalkSpeed 16) covers about 4.4 studs per step. `Humanoid.MoveDirection` stayed 0 while
Studio's navigation walked the character, so stride counting reads root velocity.

## Disagreements and deciding conditions

- **Client or server effects:** caster feedback on the client at once; anything others must see goes
  through the server's decision; instances replicate only for persistent world effects [added].
- **Many beams or few:** stacked beams for hero slashes (Twist VFX [00:15:19]) versus their draw
  cost on mobile [00:20:14]: decide by target device and how many play at once.
- **Listener on the camera or on the character:** camera for what the player sees; character or part
  listeners for in-world microphones and NPC ears (Cookie Tech versus BrawlDev).
