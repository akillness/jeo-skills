---
name: scenario-unity-2d
description: 'Use when building a 2D game in Unity 6.3 URP: pixel-art or HD sprite import and PPU, sprite atlases, Tilemaps, Rule Tiles and reskins, the 2D Renderer and 2D lights with normal maps, 2D animation, a platformer or top-down controller ("make a platformer controller that feels good", coyote time, jump buffer, one-way platforms, spikes), Pixel Perfect Camera, a follow or room camera, hit stop and screen shake; or when pixel art looks blurry or shimmers, tiles show seams, 2D lights do nothing or cost too much, the jump feels floaty, or the camera loses the player when falling.'
license: MIT
---

# Unity 2D (developer and artist)

Expert 2D work in Unity 6.3 is a chain of coupled settings proven by numbers and a frame: one PPU
from art to camera, atlases judged by what they save, tiles and lights authored as data and costed,
a camera that moves in whole pixels, and a controller whose feel is measured, not asserted.
Everything below was run in Unity 6000.3.21f1 through batch jobs and PlayMode tests
([`references/procedures.md`](references/procedures.md)). If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps).

## Stance (the expert delta)

1. **Pixel perfect is a pipeline, and URP already ships the camera.** One PPU on every sprite (tile
   px = 1 unit), Point, Compression None, whole-pixel pivots, Assets PPU = sprite PPU. Never install
   `com.unity.2d.pixel-perfect` in URP: it is the Built-in component (6.3 Manual). Measured: 100%
   uniform 6 x 6 blocks at 1080p.
2. **Pick Grid Snapping by what must be pixelated, and judge pixels in motion.** Pixel Snapping
   snaps sprites only; lights, bloom, particles stay at screen resolution (2qeNu2QApAM [00:01:47]);
   Upscale Render Texture pixelates everything. Retro AA vs Point is shimmer vs blur (Manual), and
   in URP 17.3 it only acts under Stretch Fill. Measured over a sub-pixel pan: integer framing moves
   in whole art pixels (rigid 0.9997); Stretch Fill Point leaves 0.6% of pixels shimmering per
   frame, Retro AA 0.3% at twice the softness; no Pixel Perfect Camera, 2.8%.
3. **Under the SRP Batcher an atlas cuts textures, not Batches or SetPass.** Measured 21/21 batches,
   2/2 SetPass, bound textures 20 to 1 (Unity hXlpnwD-TgY [00:05:55], [00:07:32]); memory only drops
   when usage is high. Compress once, on the atlas, except pixel-art pages stay None: compression
   shifts pixel colors (2qeNu2QApAM [00:02:24]). `AuditAtlases` reproduces the 6.3 Sprite Atlas
   Analyzer reports plus Read/Write; grouping by co-visibility is the step no tool does.
4. **The controller owns the velocity; forgiveness is design, each trick behind a toggle.** Latch
   input in Update; collisions, jump, horizontal, gravity, apply in FixedUpdate; coyote and buffer
   are timestamp windows (Tarodev source). "Working on the player's intent" (Thorson, GMTK
   yorTG9at90g [00:11:03]), so coyote, buffer, variable jump, fall clamp, apex hang and corner
   correction each get an on/off toggle for A/B play (Tarodev 3sWTzMsmdx8 [00:02:24]), and hazard
   hitboxes are smaller than the art (GMTK [00:09:28]). Two choices are feel decisions, never
   defaults: the **variable-height method** (velocity cut 50% precise, gravity x3 smooth, sustain
   while held long; Dawnosaur 2S3g8CgBG1g [00:00:36]) and the **air friction** (Tarodev
   AirDeceleration 30 drifts 3.1 units, 5.7 body widths, after release; Celeste's "massive air
   friction" drops almost straight down, GMTK [00:04:14]; 240 stops in 3 steps).
5. **Lights are routed by sorting layers and paid per light batch.** Consecutive sorting layers
   share a light batch only if every visible light lights both or neither, and the normal, shadow
   and light passes run once per batch (URP 17.3 source). A player fill light that skips the
   Characters layer (Sasquatch 1h-hSlffawM [00:01:35]) split the demo level from 1 batch into 4 and
   light fill from 0.99 to 3.64 screens. Cost is fill rate (e-book p. 131): bench at 4K over 6 runs,
   shadows x5.4 to x5.9, the batch split +72 to +101%, normal maps +15 to +36%, large vs small
   lights +8 to +43% (noisy). Never a pitch-black area (Global 0.25, GDC YhrwKF_i-BI [00:11:43]);
   enable normal maps on the light (GDC [00:12:31]); Fast on low tiers.
6. **Sprite animation never blends and follows the controller.** Exit time off, duration 0, Any
   State self-transition off; parameters from what the controller did, not from input (Brackeys
   hkaysu1Z-N8 [00:16:17], [00:18:57]).
7. **The camera and the juice are part of feel.** Loose vertical damping rising, tight once falling
   past a speed threshold, back at vertical speed 0 (hysteresis), lerped (Sasquatch 9dzBrLUIF8g
   [00:05:37], [00:07:14]): in a 40-unit drop a fixed 0.6 s damping let the feet reach the bottom
   edge, the switch kept 3.2 to 3.4 units below in view. Swap room cameras on trigger EXIT by exit
   direction ([00:14:43]); bounds end exactly at a secret room ([00:02:10]). Hit stop 20 ms (Nijman
   AJdEqssNZ-U [00:18:22]) to 67 ms (Celeste, GMTK [00:08:40]) on unscaled time, extend not stack;
   shake with an off option (Nijman [00:32:14]).
8. **Be honest about GUI-only editors.** Tile Palette, Rule Tile inspector, AutoTile masks, Sprite
   Editor, Skinning Editor and the Animator window are mouse tools. Agents author through
   `Tilemap.SetTiles`, `RuleTile.m_TilingRules`, `RuleOverrideTile.ApplyOverrides`,
   `ISpriteEditorDataProvider`, `AnimatorController`; rigging and AutoTile masks stay human
   ([`references/gui-paths.md`](references/gui-paths.md)).

## Establish first

Ask once: pixel art or HD (defaults: pixel, 16 PPU, 320 x 180); target screens including 21:9 and
phones; camera model (static rooms, follow with bias and fall damping, lead toward action);
real-time 2D lights or painted light, and the lowest tier; controller profile (precision: own the
velocity, high air friction; momentum: low air friction; physics-rich: Dynamic body with forces;
top-down: velocity); jump height in tiles and the variable-height method; hazards and one-way
platforms; input devices. Then `ut_2d.project(P)`.

## Workflow

1. **Project.** `TwoDSetup.ProjectSetup`: sorting layers back to front (few: they drive light
   batching), Player and Ground layers. GATE: order read back, no pixel-perfect package, Input
   System, fixed step 0.02 s.
2. **Import.** `SpriteJobs.ImportPixelArt` (slicing, pixel pivots, `_NormalMap`) or `ImportHD` (PPU
   = height / (2 x ortho), e-book p. 21); shaped tiles get `SetPhysicsOutline` (16 px sprites
   generate a 4-point rectangle). GATE: `AuditSprites` 0 errors; one PPU.
3. **Atlases.** `AtlasJobs.BuildAtlas` per co-visible group, lit and plain apart, pixel pages
   uncompressed. GATE: 1 page, 0 findings, grouping rule written.
4. **Level.** `TilemapJobs.CreateRuleTile` + `BuildLevel`; reskins with `CreateRuleOverrideTile`;
   Composite Merge, Outlines, Static; per-tile colliders only for runtime edits, then Use Delaunay
   Mesh. GATE: `rule_mismatches == 0` (reskin read-back too), drop probe within 0.05 units, capture
   shows no seams.
5. **Actors and animation.** `AnimJobs.BuildSpriteAnimator`, `LevelJobs.Populate` (player,
   `Hazard2D` spikes with inset hitboxes, one-way platforms). GATE: `LintAnimator` 0 errors;
   hitbox-to-art ratios below 1.
6. **Lights.** `LightJobs.LightRig`, then `LightJobs.LightCost` (tier; engine check once the camera
   exists). GATE: `Audit2D` 0 errors; replica light batches = URP's own count; every batch break and
   every light over half the view justified; normals on/off capture pair differs.
7. **Camera.** `CameraJobs.SetupPixelPerfect`, `CapturePixelPerfect`; a sub-pixel pan
   (`ut_2d.pan_shots`) scored by `ut_2d.shimmer_check`; follow cameras through
   `CinemachineJobs.Setup` (CM 3.1.7 pinned) plus `CinemachineFallDamping` and
   `CinemachineRoomSwap`. GATE: `pixel_block_check` >= 0.999 at 1080p and 720p, pan min rigid >=
   0.99, `void_columns` 0 at 21:9, `bounds_hide_secrets` ok, contact sheet looked at.
8. **Feel.** PlayMode tests with simulated input (`ut_run.run_tests(P, "PlayMode", graphics=True)`).
   GATE: apex = 50 Hz prediction, windows within one step, one press = one jump at 30/60/144 fps,
   each toggle A/B, method and air-drift numbers stated. Feel itself is a human verdict: ship
   toggles and numbers.
9. **Deliver.** `Audit2D.Scene` clean; `AgentProfile.PlayModeTimings` budget pass; report each step
   with its Unity call, then Verified and Assumed.

## Numbers

| Value                                                                                                                                 | Relative to                | Source                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------ |
| PPU = H / (2 x ortho size): 216 at 4K Size 5                                                                                          | HD art, closest zoom       | e-book p. 21                   |
| 320 x 180: x4 720p, x6 1080p, x8 1440p, x12 4K; ortho 5.625 at 16 PPU                                                                 | pixel reference            | Manual; [added] arithmetic     |
| MaxSpeed 14, Accel 120, GroundDecel 60, AirDecel 30, JumpPower 36, FallAccel 110, MaxFall 40, release x3, Coyote 0.15 s, Buffer 0.2 s | Tarodev stats (u/s, u/s^2) | Tarodev repo                   |
| apex 5.536 at 50 Hz (formula 5.89), rise 0.32 s; tap: gravity x3 2.08, cut 0.5 1.81, sustain (JumpPower 18.7) 1.78 of 5.52            | those stats                | measured, replay               |
| air drift after release at top speed: AirDecel 30 3.13 units (24 steps), 240 0.27 (3 steps)                                           | 0.55-unit body             | measured                       |
| Celeste: about 6 frames to top speed, 3 to stop, jump about 3 body heights (Mario 4, Meat Boy 6)                                      | 60 fps frames              | GMTK [00:02:01], [00:03:42]    |
| apex band gravity x0.5 below 5 u/s held (+0.08 s); corner nudge 0.25 units                                                            | added tricks               | Dawnosaur [00:02:06]; [added]  |
| hazard hitbox inset 2 px sides, 3 px top: 0.75 x 0.625 of a 16 x 8 spike                                                              | art                        | [added] values                 |
| fall damping 0.6 s loose, 0.1 s tight, switch below -15 u/s, back at 0, 0.2 s blend                                                   | follow camera              | [added] values; rule Sasquatch |
| hit stop 0.02 to 0.07 s                                                                                                               | real time                  | Nijman; GMTK                   |
| Global light 0.25; light render scale 0.5 (template)                                                                                  | lighting                   | GDC; observed                  |
| one atlas page; wastage flag > 400 KB                                                                                                 | per atlas                  | hXlpnwD-TgY                    |
| 12 samples per second for sprite clips                                                                                                | frame-by-frame             | Brackeys [00:03:42]            |

## Quality gates

- **Measurable:** audits at 0 errors (`AuditSprites`, `AuditAtlases`, `Audit2D`, `LintAnimator`);
  `rule_mismatches == 0`; drop probe < 0.05; `pixel_block_check` >= 0.999; pan rigid >= 0.99;
  `void_columns` 0 at 21:9; light batches replica = engine; PlayMode suite 0 failures; frame budget
  pass with `ut_stat.summarize_csv`.
- **Visual:** every capture through `ut_review.review_images` and a contact sheet you open, 2x crops
  for pixel edges; lighting pair; `critique.md` sections A to H.

## Common mistakes

| Mistake                                                         | What it looks like                                     | Fix                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| 2D Pixel Perfect package in URP                                 | wrong component, settings ignored                      | URP `PixelPerfectCamera`                                                    |
| PPU per sprite, Bilinear, compressed                            | blur, color shift, uneven pixels                       | ImportPixelArt + AuditSprites                                               |
| shimmer judged on stills                                        | crisp frames, crawling pixels in motion                | `pan_shots` + `shimmer_check`; integer Crop Frame                           |
| batch capture right after OpenScene                             | only the Global light shows                            | `CameraJobs.WarmLights2D`                                                   |
| Light2D added by script                                         | shadows on, normals off (`normalMapQuality` read-only) | set both; SerializedObject `m_NormalMapQuality`                             |
| a light skipping one sorting layer                              | light batches split, every light redrawn               | same Target Sorting Layers where the look allows; `LightCost`               |
| Accurate normals, big lights, many shadows on mobile            | fill-rate bound frame                                  | Fast, smaller lights, 1 to 2 shadow lights                                  |
| atlas judged by Batches or SetPass                              | "atlas does nothing"                                   | used textures and memory                                                    |
| compressed pixel-art atlas page                                 | color shifts in flat pixels                            | Compression None on pixel pages                                             |
| `_timeJumpWasPressed = 0` (Tarodev)                             | phantom jump on first landing                          | `float.MinValue`                                                            |
| input read in FixedUpdate                                       | lost presses at high fps                               | latch in Update                                                             |
| ground and ceiling casts that hit triggers or one-way platforms | "grounded" on a trigger, head bonks under a platform   | `useTriggers = false`; skip one-way colliders (as `PlatformerController2D`) |
| one AirDeceleration for every game                              | slides off small platforms, or no momentum             | choose by level; state the drift                                            |
| hazard hitbox = art                                             | death on a 1 px graze                                  | `Hazard2D.FitHitbox` inset                                                  |
| Rotated rule transform on ground                                | grass on walls                                         | Fixed or MirrorX                                                            |
| duplicated Rule Tile for a reskin                               | rule fixes applied twice or missed                     | Rule Override Tile                                                          |
| blended sprite transitions                                      | late, smeared switches                                 | exit time off, duration 0                                                   |
| fixed vertical damping on a follow camera                       | player falls out of the frame                          | `CinemachineFallDamping`                                                    |
| room swap on trigger enter                                      | wrong camera when the player turns back                | swap on exit by direction                                                   |
| legacy `Input.GetAxis`                                          | runtime exception (templates)                          | Input System actions                                                        |

## Handoffs

- **Receives:** sprites and tiles from scenario-game-assets, scenario-sprite-pipeline,
  scenario-textures (PNG, intended PPU, palette); input actions from scenario-unity-architecture;
  the pipeline asset from scenario-unity-rendering-lighting.
- **Delivers:** Cinemachine 3 rigs to scenario-unity-animation (bounds, ortho, pixel ratio, fall
  damping, room swaps); Sprite Custom Lit and Sort 3D as 2D shaders to scenario-unity-shaders;
  pixel-grid particles to scenario-unity-vfx; light batches, fill and bench numbers to
  scenario-unity-performance; texture formats to scenario-unity-mobile; Web size to
  scenario-unity-web; postprocessors and CI runs to scenario-unity-pipeline-automation; HUD to
  scenario-unity-ui; non-platformer physics to scenario-unity-gameplay. Every packet carries job
  ids, audit counts, PlayMode metrics and contact sheets.

## Unity 6.3 notes

- `UnityEngine.Rendering.Universal.PixelPerfectCamera` (URP 17.3): Grid Snapping dropdown; Filter
  Mode has no public setter; the camera position is rounded to the pixel grid before every render.
- Universal 2D template: Input System only, Sprite Atlas V2, 2D Tooling 1.0.3 (Window > Analysis >
  Sprite Atlas Analyzer), Tilemap Extras 6.0.2 (AutoTile masks: no public API), 2D Animation 13.0.5,
  SRP Batcher on. Window > 2D > Light Batching Debugger shows the light batches `LightCost`
  computes.
- `Rigidbody2D.linearVelocity`, `bodyType`; `Physics2D.autoSyncTransforms` obsolete;
  LowLevelPhysics2D renamed PhysicsCore2D in 6.5.
- 3D in 2D: Mesh2D-Lit-Default and Sort 3D as 2D; 2D lights reach meshes through a Sorting Group.
- Cinemachine defaults to 2.10.7: pin `com.unity.cinemachine` 3.1.7; core in 6.6. Runtime atlases
  arrive in 6.4; PVRTC removed in 6.4.

## References

- `references/procedures.md`: procedures P0 to P14, Unity APIs, live tests, measured results.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, timestamps,
  deciding conditions.
- [`references/critique.md`](references/critique.md): the rubric (import, atlases, tiles, lights,
  camera, feel, animation and juice, report).
- `references/gui-paths.md`: windows and menus for the same work.
- [`references/sources.md`](references/sources.md): sources, credentials, timestamps, revision
  history.
- [`scripts/ut_2d.py`](scripts/ut_2d.py): install, resolution and feel math (jump methods, air
  drift), art generators, `pixel_block_check`, `shimmer_check`, `void_columns`,
  `bounds_hide_secrets`, metrics.
- [`scripts/AgentKit/TwoD/`](scripts/AgentKit/TwoD/): editor jobs (setup, sprites, atlases,
  tilemaps, level, lights and light cost, camera, Cinemachine, animation, audit, LowLevelPhysics2D).
- [`scripts/Runtime/TwoD/`](scripts/Runtime/TwoD/): `PlatformerController2D`, `PlatformerStats`,
  `Hazard2D`, `FallDampingSwitch`, `PlatformerAnimatorBridge`, `HitStop`, `CameraShake2D`,
  `TopDownMover2D`; [`scripts/Runtime/TwoDCinemachine/`](scripts/Runtime/TwoDCinemachine/):
  `Cinemachine2DRig`, `CinemachineFallDamping`, `CinemachineRoomSwap` (compile only with CM3).
