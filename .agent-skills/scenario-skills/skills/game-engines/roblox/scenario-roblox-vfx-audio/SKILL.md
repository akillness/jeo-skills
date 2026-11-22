---
name: scenario-roblox-vfx-audio
description: "Use when making or fixing Roblox visual effects or game audio: ParticleEmitter, Beam, Trail, flipbook sprite sheets, slash, hit, impact, explosion, fireball, aura or projectile VFX; effects only one player sees, effects that lag or pile up, particles invisible, popping or too bright; the Audio API (AudioPlayer, Wire, AudioEmitter, AudioListener, AudioDeviceOutput, effects), \"no sound\", \"3D sound not working\", music, ducking, footsteps, SoundGroup volumes; or importing Scenario-generated sound effects, music, voice or VFX sheets into a Roblox game."
license: MIT
---

# Roblox VFX and audio

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert effects read in one glance and get out of the way: layered bursts emitted once, decided by
the server and drawn by each client. Expert audio is a wired graph proven connected and measured
before anyone listens. The agent builds effects as data, freezes and captures them over time, and
checks audio through `Wire.Connected`, `GetAudibilityFor` and analyzers; a person's ear judges the
mix. If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

**Status (2026-10-19):** 17 of 17 live tests pass in Studio 0.743 (two on a rerun after MCP
timeouts), with playtests, the copy-ready scripts included; 5 of 5 offline checks pass (`rbx_check`
0 errors on the modules and every snippet, flipbook and audio file checks, Lune arc math). Listening
is left to a person.

## Stance (the expert delta)

1. **Layers emitted once, not one big sprite.** Stack five or more textures (hot spots, a dark
   underlayer) and emit each once from an `EmitCount` attribute (Twist VFX, zlKdwujvP2A
   [00:00:13-00:06:13]; MoldySugar, XXCGWREKpo0 [00:00:29]). Bursts use `Emit`, lingering tails use
   `Enabled` (MoldySugar [00:04:16]).
2. **If you can make out the flash's shape, it lasts too long.** Impact flash Lifetime about 0.05 s,
   slash layers 0.2 to 0.3 s (Twist VFX [00:44:26, 00:00:13]).
3. **Velocity-oriented particles need Speed 0.001 to 0.01, never 0.** "If your speed is zero, it'll
   just disappear" (Twist VFX [00:00:13]). Confirmed: a `VelocityPerpendicular` particle at Speed 0
   drew nothing, at 0.01 it drew.
4. **Beam arcs by rule, not by eye.** A semicircle needs CurveSize = chord x 2/3, both ends turned
   toward the bulge, FaceCamera on, and segments only when it curves (Twist VFX [00:10:55,
   00:56:19]). The midpoint then sits at the radius (Beam docs' Bezier, verified live).
5. **The server decides, every client draws.** Local effects are seen only locally, so impacts need
   the server and its raycast (Develuper, TkNZETIu0CM [00:02:15, 00:04:42]). Send the server's
   decision (name, CFrame, or origin, velocity and server time) to nearby clients and let each clone
   the template [added]: the server holds no effect instances, clients cull by distance.
6. **A silent world is a missing listener.** No AudioListener or AudioDeviceOutput means nothing is
   heard (Cookie Tech, FminS9nvqJg [00:14:59]). A template place kept `DefaultListenerLocation` at
   Default and a playtest had neither (observed). Set Camera once, in Edit.
7. **One Wire per hop, then prove it.** n effects need n + 1 wires (ByteBlox, LAYhd_j-thI
   [00:05:46]; Cookie Tech [00:19:35]). Assert every `Wire.Connected` and that the source reaches an
   `AudioDeviceOutput`; a bad pin name or a cycle reads false (observed).
8. **Footsteps follow the feet.** Use `footstep` animation events with `left` or `right` on contact
   frames and a few material sets, not one looped sound (GnomeCode, PNYtTkMidE8 [00:04:42,
   00:08:23]). The default R15 animations carry no markers and the default character sounds are
   legacy `Sound`s (observed): keep a stride fallback and mute or replace `Running`.

## Establish first

- **Who must see each effect:** the caster only (feedback, drawn at once) or everyone near
  (validated by the server).
- **Devices:** mobile caps each emitter at 100 particles per second and drops flipbooks on low
  memory (particle emitters docs).
- **References:** clips of the look; experts build from references, not from scratch (Twist VFX
  [00:49:09]).
- **Audio stack:** Audio API for new work; legacy `Sound` stays for existing games (not deprecated,
  deltas row 21). Voice chat on or off.
- **Assets:** built-in stand-ins, or uploaded IDs. Uploads are a human step (Asset Manager, from the
  Window menu or the Home tab); the agent prepares and checks files.

Defaults: templates in `ReplicatedStorage.FxLibrary`, a `workspace.Fx` folder for live copies,
`DefaultListenerLocation` Camera, AgentKit modules synced with `sync_runtime`.

## Procedure

Without the kit (an answer, or a game that does not ship it), use the standalone scripts in
[copy-ready.md](references/copy-ready.md): replicator, audio graph, marker footsteps, one-player
post effects, Highlight hit flash, lag test.

1. **Set up the place.** `VA.sync_runtime(studio)` writes VfxKit, AudioKit, FxReplicator and
   Footsteps as ModuleScripts; set `DefaultListenerLocation` to Camera
   ([listener setup](references/procedures.md#10-listener-setup)). GATE: modules present;
   `AudioAudit.audit(game)` reports no `no-listener`.
2. **Build templates as data.** One `VfxKit.build` spec per effect: emitter, beam, trail, light and
   sound layers, timing in attributes
   ([templates](references/procedures.md#2-effect-templates-from-data)). Set LightInfluence and
   textures explicitly. GATE: `VfxAudit` 0 errors, 0 warnings
   ([audit](references/procedures.md#4-audit-an-effect-library)).
3. **Review over time.** `VA.timeline` freezes the effect at chosen times with `TimeScale` 0 and
   captures each; open the contact sheet and judge it with [critique.md](references/critique.md).
   GATE: `image_checks` pass, consecutive frames differ, readable silhouette in the first frame,
   nothing left in the last.
4. **Replicate.** `FxReplicator.server` validates type, cooldown and range, raycasts, and
   broadcasts; `FxReplicator.client` plays and culls
   ([replication](references/procedures.md#11-combat-vfx-replication)). GATE in a playtest: server
   `workspace.Fx` stays at 0 children, client copies return to 0 after `lifetime()`, spam and
   out-of-range requests are rejected, play captures show the projectile and its trail.
5. **Wire the audio.** Buses are AudioFaders into one AudioDeviceOutput; effects go in with
   `AudioKit.chain`; 3D sources are AudioEmitters on Attachments
   ([audio graph](references/procedures.md#7-audio-graph-bus-effect-chain-meter)). GATE: all wires
   connected, `AudioKit.paths` reaches `AudioDeviceOutput`, `IsPlaying` and `TimePosition` move, an
   analyzer reads a level, `GetAudibilityFor` matches the intended curve.
6. **Mix behaviors.** Duck music under hits with an AudioCompressor `Sidechain`
   ([ducking](references/procedures.md#9-ducking-with-a-sidechain)); footsteps by marker or stride
   ([footsteps](references/procedures.md#12-footsteps)). GATE: measured reduction in dB; steps per
   distance and the set per floor material.
7. **Hand the ear pass to a person.** List what only a human can judge (critique.md, ear items) with
   the exact place and timestamps to listen to.

## Numbers

| Value                   | Number                                                                            | Relative to, source                             |
| ----------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| Emitter rate cap        | 400 per s; 100 per s on mobile                                                    | per emitter (docs)                              |
| Particle lifetime cap   | 20 s                                                                              | engine (docs)                                   |
| Impact flash            | Lifetime about 0.05 s                                                             | Twist VFX                                       |
| Slash layer             | Lifetime 0.2 to 0.3 s, Speed 0.001 to 0.01                                        | Twist VFX                                       |
| ZOffset between layers  | 0.001                                                                             | Twist VFX [00:02:24]                            |
| Beam semicircle         | CurveSize = chord x 2/3 (20-stud chord: 13.33, apex 10)                           | chord length (Twist VFX; live)                  |
| Curved beam segments    | up to about 50; Instance.new gives 10                                             | curvature (Twist VFX; observed)                 |
| Beam texture repeats    | Stretch: TextureLength times; Wrap and Static: length / TextureLength             | beam length (Beams docs)                        |
| Flipbook sheet          | 1024 x 1024; 2x2, 4x4 or 8x8; at most 30 fps                                      | per texture (docs)                              |
| Audio import            | under 20 MB, under 7 min, at most 48 kHz; mp3, ogg, wav, flac                     | per file (docs)                                 |
| AudioCompressor         | Threshold -60 to 0 dB, Ratio 1 to 50, Attack 0.0001 to 0.5 s, Release 0.01 to 5 s | reference                                       |
| AudioFader Volume       | 0 to 3                                                                            | reference                                       |
| Default emitter rolloff | about 4 / distance: 0.133 at 30 studs, 0.044 at 90                                | `GetAudibilityFor` (observed)                   |
| Footstep stride         | about 4.4 studs                                                                   | default R15 run at WalkSpeed 16 (observed)      |
| Footstep volumes        | 0.3 grass, 0.5 default                                                            | per material set (GnomeCode [00:08:23])         |
| Ducking start           | Threshold -30 dB, Ratio 8, Attack 0.01 s, Release 0.3 s                           | [added]; measured -21 dB on the music (test L8) |
| Loudness targets        | music -16 LUFS, true peak -1.5 dB; one-shots peak -1.5 dBFS                       | [added]                                         |

## Quality gates

- **Measurable:** VfxAudit and AudioAudit clean; every `Wire.Connected`; `paths()` reaches the
  output; analyzer `RmsLevel` above 0 while playing; server holds no effect instances; client copies
  back to 0; footstep counts per distance; audio files pass `check_audio`, sheets pass
  `check_flipbook`.
- **Visual:** freeze-frame contact sheets in Edit, play captures over time from a fixed camera,
  judged with [critique.md](references/critique.md). Raise Studio's Editor Quality Level before
  judging (File > Studio Settings > Rendering; MoldySugar, 9dQR7FySSLg;
  [gui-paths.md](references/gui-paths.md)).
- **Ear (human only):** balance, timing against the picture, tone, repetition fatigue, clipping by
  ear.

## Common mistakes

| Mistake                                                               | Symptom                                                          | Fix                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Speed 0 on a velocity-oriented emitter                                | the particle never shows                                         | Speed 0.001 to 0.01                                       |
| Brightness raised at LightInfluence 1                                 | no change (observed: 1 and 6 identical)                          | LightInfluence below 1 (TrendyV2, rIXyQ4RAwws [00:02:35]) |
| Emitter made with Instance.new                                        | LightInfluence 0 (observed) while a Studio insert gives 1 (docs) | set LightInfluence explicitly                             |
| Trail or Beam with one attachment                                     | nothing drawn                                                    | set Attachment0 and Attachment1                           |
| Effect cloned on the server                                           | doubled effects, network cost, no culling                        | broadcast, clone on clients                               |
| `Sound` parented to a SoundGroup                                      | group volume ignored                                             | set `Sound.SoundGroup` (docs)                             |
| `AudioPlayer.AssetId`                                                 | deprecated                                                       | `AudioPlayer.Asset`                                       |
| AudioEmitter under a Folder or Model                                  | silent                                                           | parent to an Attachment, a part or the Camera             |
| Listener left at Default                                              | 3D audio silent in play                                          | `DefaultListenerLocation` Camera                          |
| Footsteps from `MoveDirection`                                        | no steps under `Humanoid:MoveTo` (observed)                      | root velocity                                             |
| Built-in `explosion01_smoke_main` or `fire_sparks_main` as a stand-in | layer invisible: the texture is near black (observed)            | `smoke_main.dds`, `SquareParticle.png`                    |
| Editing `ModuleScript.Source` in Edit                                 | old code still runs (observed)                                   | replace the ModuleScript instance                         |

## Handoffs

- **From scenario-game-assets and scenario-sprite-animation:** VFX textures and flipbook frames
  (2x2, 4x4 or 8x8 grids). Pack with `make_flipbook`, check with `check_flipbook`, then a person
  uploads.
- **From scenario-audio and scenario-elevenlabs:** sound effects, music, voice. Run `prepare_audio`
  (trim, 48 kHz, level) and `check_audio`, then a person uploads.
- **From scenario-roblox-animation:** `footstep` and hit-frame markers on animations.
- **From scenario-roblox-gameplay:** hit events, projectile id, origin and velocity; this skill
  draws them.
- **With scenario-roblox-networking:** remote validation and rate limits for effect requests.
- **To scenario-roblox-environment:** ambient beds and the lighting effects read against. Lighting
  recipes live there: warm light with cool shadows (aq0Fi0R2FAY [00:03:38]), Bloom Threshold about
  0.03 (aq0Fi0R2FAY [00:07:37]).
- **To scenario-roblox-performance:** emitter, beam and flipbook counts per scene for the frame
  budget.

## Current Roblox notes

- Audio API is general since 2024-09-10; `AudioPlayer.Asset` replaces `AssetId`; AudioPlayer's
  internal volume doubled in 2025: recheck old levels (deltas row 21).
- The reference property is `SoundService.DefaultListenerLocation` (plugin security: set it in
  Edit).
- `FlipbookIncompatible` reads "Particle texture must be 1024 by 1024 to use flipbooks." with layout
  None and on sheets that animate (observed): a hint, not a status.
- An EditableImage set as a particle's `TextureContent` drew nothing, while the same image drew on a
  Decal (observed): preview sheets on a Decal.
- `Lighting.Technology` is superseded; lighting belongs to scenario-roblox-environment.

## References

- [references/procedures.md](references/procedures.md): toolkit API and every procedure with full
  code, test and result.
- [references/expert-notes.md](references/expert-notes.md): judgment by expert, with sources and
  timestamps.
- [references/critique.md](references/critique.md): the rubric for captures, graphs and the human
  ear pass.
- [references/gui-paths.md](references/gui-paths.md): Studio menus and panels for the same work.
- [references/copy-ready.md](references/copy-ready.md): standalone scripts with plain names, no kit
  needed.
- [references/sources.md](references/sources.md): every source with URL and best timestamps.
- [scripts/rbx_vfx_audio.py](scripts/rbx_vfx_audio.py): runner-side helpers (timeline, flipbooks,
  audio files).
- [scripts/agentkit/vfx-audio/](scripts/agentkit/vfx-audio/): VfxKit, VfxAudit, AudioKit,
  AudioAudit, runtime FxReplicator and Footsteps.
