# Expert notes (scenario-unity-2d)

Principles and judgment calls by source, with timestamps. [added] marks this skill's own judgment;
[obs] marks what the live runs on Unity 6000.3.21f1 showed (numbers in `procedures.md`). Where
experts disagree, the deciding condition is given.

## 1. Resolution, PPU, scale (2D e-book 6.3, Jarek Majewski)

- Screen and asset resolution are independent: PPU = max vertical resolution / (orthographic Size x
  2), computed at the CLOSEST zoom. 4K at Size 5: 216; zoomed to Size 3: 360; rigged sprites "a bit
  higher" because meshes stretch (p. 21).
- Decide scale first and keep it: 1 unit = 1 m, player 0.5 to 2 units, tiles 1 unit; visible height
  = Size x 2 (p. 20). Test 21:9 so the camera does not reveal the level's edges (p. 18). [obs] At
  2560 x 1080 the demo camera showed 53 art pixels of void past the level's left edge that 16:9 hid.
- Paint HD art at the highest target resolution, one resolution for all assets, scale down for
  low-end; spend memory on hero assets (p. 18, p. 21).
- Pixel art: PPU = tile pixel size so one tile is one unit (Brackeys ryISV_nH8qw [00:01:08]);
  raising PPU, not scaling objects, is "the right way to resize graphics" (Tamara HbKbxN6Oo6I
  [00:04:03]). The pixel import costs memory: 121 KB DXT5 to 484 KB RGBA32 for a 352 x 352 sheet,
  accepted for crisp pixels (Brackeys [frame 00:02:21]).

## 2. Pixel perfect (6.3 Manual; Unity 2qeNu2QApAM)

- Five coupled settings: one PPU on every sprite, Filter Point, Compression None, pivots on whole
  pixels, camera Assets PPU = sprite PPU (Manual "Set up your sprites"). Max Size never below the
  texture's size or Unity resamples it (2qeNu2QApAM [00:03:38]).
- URP ships its own Pixel Perfect Camera; "Don't install the separate 2D Pixel Perfect package,
  which works only with the Built-In Render Pipeline" (Manual, Important box). The 6.3 e-book's
  package list and the 6000.4 intro page still name it: follow the 6.3 how-to pages.
- Pixel Snapping aligns SPRITE rendering only (Transform unchanged); lights, bloom and particles
  stay at screen resolution; Upscale Render Texture renders at the reference resolution and upscales
  everything, with upright pixels on rotation (Manual reference; 2qeNu2QApAM [00:01:47]). [obs] 100%
  uniform 6 x 6 blocks at 1080p with Upscale Render Texture, 71% with Pixel Snapping (the lights).
- Retro AA vs Point: the Manual frames it as a trade-off, "Retro AA ... prevents sprites shimmering
  when they move, but can make pixels look blurry" ("Make pixels sharper"). [obs] URP 17.3 source:
  the final blit is Point; Filter Mode only drives the Stretch Fill upscale pass (Retro AA = point
  to the nearest multiple, then bilinear). [obs] Measured over a 10-frame sub-pixel pan at 1366 x
  768 Stretch Fill: Point leaves 0.61% of pixels changing per frame (min rigid 0.981), Retro AA
  0.31% (0.991) at twice the softness (0.189 vs 0.092). Deciding condition: pick an integer Crop
  Frame (None, Windowbox, Pillarbox, Letterbox) and the question disappears (rigid 0.9997, whole
  art-pixel steps); under Stretch Fill, Retro AA for motion-heavy games, Point for stills and slow
  scenes.
- Judge pixel perfection in MOTION, not only on stills (docs digest checklist, "shimmer in a motion
  sequence"; Manual: "no shimmer when sprites move"). [obs] URP 17.3 `PixelPerfectCamera.PixelSnap`
  rounds the camera position to its units per pixel before every render, so with the component on a
  pan moves the frame by whole pixels; without it, 2.8% of pixels crawl per frame at 1366 x 768
  (`ut_2d.shimmer_check`).
- Scripted positions that should sit on the art grid (parallax layers, spawned props, a camera
  target): round to 1/PPU (doc note, Agent translation: `Round(pos * PPU) / PPU`) or call the URP
  component's own `PixelPerfectCamera.RoundToPixel(position)` [obs API, URP 17.3]; Pixel Snapping
  and the camera snap only affect rendering, gameplay code still sees sub-pixel positions (Manual
  reference).
- Reference 320 x 180 scales by integers to 720p (x4), 1080p (x6), 1440p (x8), 4K (x12) [added
  arithmetic]. Light sprites need the art PPU and Point too (2qeNu2QApAM [00:07:06]).

## 3. Sorting (2D e-book)

- Plan sorting layers in the mockup and keep them few: 2D lights target sorting layers and every
  layer or blend-style switch can break light batching (p. 24 to 26, p. 131). Sasquatch (1h-hSlffawM
  [00:07:18]) adds layers per light for rim lights; the deciding condition is light batching: few
  layers wins at scale.
- A Sorting Group on the root of every multi-sprite character, or its parts interleave with
  another's: "It's not a bug. This is just how sorting works." (p. 27). Top-down, isometric,
  brawler: Transparency Sort Mode Custom Axis (0, 1, 0) on the 2D Renderer (p. 26).

## 4. Atlases (Unity hXlpnwD-TgY; Unite SdrMgxChrRQ)

- Under the SRP Batcher with URP sprite shaders an atlas lowers neither Batches (21 with or without)
  nor SetPass (2 with or without); used textures drop from 23 / 4.8 MB to 4 / 2 MB ([00:05:21] to
  [00:08:06]). SetPass is still worth reading, because it separates the legacy Sprites-Default
  shader (21 SetPass without an atlas, 2 with one: there the atlas does help, [00:04:15] to
  [00:05:21]) from SRP Batcher-compatible sprite shaders (2 either way). So judge a URP atlas by
  used textures and memory, never by Batches or SetPass. [obs] Bench of 20 sprites: batches 21/21,
  SetPass 2/2, bound textures 20 to 1; memory was NOT lower (tiny 16 px icons, 62% page usage): an
  atlas is not automatically a memory win, check usage.
- Compress once: sources uncompressed and lossless, compression on the atlas per platform
  ([00:12:21]). Deciding condition for pixel art: compression changes pixel colors (2qeNu2QApAM
  [00:02:24]) and the video's 32 px pixel-art icon atlas stays Compression None ([frame 00:18:40]),
  so pixel pages stay None (or High Quality after a side-by-side check); blanket compression is
  mistake 8 ([00:13:27]).
- The Sprite Atlas Analyzer (6.3, 2D Tooling; Window > Analysis > Sprite Atlas Analyzer) is the
  audit tool: six reports (page count > 1, compressed sources, wastage > 400 KB, sprite count <= 1,
  secondary texture mismatch, all atlases) ([00:08:06], e-book p. 135); Read/Write on packed sources
  doubles memory because the source stays resident next to the atlas ([00:11:49]). [obs] Its classes
  are internal (`Insider` namespace, 1.0.3), so an agent runs `AtlasJobs.AuditAtlases`, which
  reproduces the reports plus Read/Write, and opens the window only for a human. Grouping is the one
  mistake no tool catches: pack what is on screen or loaded together, then split by
  secondary-texture set and compression tier ([00:08:38], [00:14:33]); one page per atlas ("no
  strong use case for a base map atlas that has more than one page", Unite [00:29:39]).
- Tight mesh by default, Full Rect only for rectangles; Read/Write off; placeholder flat normals
  keep packing plans stable ([00:09:42], [00:11:49], [00:15:07]). Large projects: Sprite Atlas mode
  "V2 - Enabled for Builds" ([00:15:39]). Runtime atlas creation is 6.4+ ([00:19:56]).

## 5. Tilemaps (Tilemap Extras 6.0 docs; e-book; Tamara; Brackeys)

- Rules run top to bottom, first match wins: order by frequency; custom rules subclass `RuleTile<T>`
  with codes from 3 (docs).
- Reskin choice (docs "Create variants of a rule tile", More menu; docs digest delta 15): a Rule
  Override Tile keeps ONE rule set and swaps sprites, so later rule fixes reach every skin; a Rule
  Tile Template (More > Create Rule Tile Template) copies the rules onto a new sheet with the same
  layout, an independent tile. Deciding condition: skins that must stay in sync, override; a new
  tileset that will diverge, template. [obs] `RuleOverrideTile.ApplyOverrides` + `Override()` by
  script, verified cell by cell (P4c).
- AutoTile (6.1+, docs digest delta 16) vs Rule Tile: AutoTile wins for a standard floor-layout
  sheet (Mask_2x2 corners and corridors, 16 layouts; Mask_3x3 T-junctions and crossroads, 48;
  several Used Textures plus Random for variety; duplicate masks outlined red, top-left sprite wins)
  because nobody writes rules; Rule Tile wins when you need per-rule colliders, Random or Animation
  outputs, Fixed vs Rotated transforms for directional art, custom neighbor rules, or scripted
  authoring. [obs] AutoTile mask painting has no public API (`AutoTile.AddSprite` is internal in
  Tilemap Extras 6.0.2), so for an agent AutoTile is a human or computer-use step (e-book p. 54).
- Tilemaps are also the gameplay data grid: data tilemaps, `WorldToCell`, `GetTile<T>` (e-book p. 59
  to 61; Tamara [00:09:08]). Per-cell mutable state does not belong on shared Tile assets [added].
- Collision: Tilemap Collider 2D with Use Delaunay Mesh ("fewer shapes and small triangles"),
  Composite Operation Merge into a Composite Collider 2D (Outlines for smooth terrain), body Static;
  keep per-tile colliders if tiles change at runtime (e-book p. 91 to 92). [obs] Delaunay measured
  on 197 cells: no change for Grid or rectangular Sprite colliders nor for the merged composite;
  with a concave 16-point custom physics outline, 1379 shapes (7 per tile) become 985 (5 per tile).
  So it matters for irregular tiles kept per tile. [obs] The generated fallback physics shape of
  every 16 px sprite tested was a 4-point rectangle: shaped tiles need a Custom Physics Shape
  (Sprite Editor, or `ISpritePhysicsOutlineDataProvider` by script). Overlays with transparency on
  their own tilemap with a higher order (Brackeys [00:07:44]).
- Anti-bleeding for smooth tiles: atlas without rotation, alpha dilation, slight overlap;
  point-filtered pixel art does not bleed (e-book p. 58).
- Platformer art is directional [added]: grass must stay on top, so Rotated rule transforms are
  wrong for ground sets; use Fixed (or MirrorX).

## 6. 2D lights (GDC 2023 YhrwKF_i-BI; e-book p. 98 to 136; Sasquatch 1h-hSlffawM)

- Never ship a pitch-black area: a tinted Global light at low intensity (Happy Harvest 0.25)
  [00:11:43]; one Global light per blend style per sorting layer (e-book p. 98).
- Normal and mask maps go on the sprite asset as secondary textures (`_NormalMap`, `_MaskTex`) so
  all sprites share one Sprite-Lit material: "one draw call instead of hundreds" (e-book p. 102).
  Enable Normal Maps on the light or they do nothing (GDC [00:12:31]). [obs] With normals on, the
  torch-lit platform read 0.262 mean luma vs 0.282 off: the N.L term dims flat faces, so retune
  intensity after enabling.
- Imports: normal maps as Normal map type (GDC [frame 00:06:25]); PSD-layer normal maps as Sprite
  with sRGB off (e-book p. 124): deciding condition is the source type. Mask maps Default, sRGB on
  (GDC [frame 00:08:53]).
- Paint albedo without directional light (AO only) when using normal maps (e-book p. 109);
  generators only for bevels and surfaces, not characters (p. 104).
- Rim light: blend style Additive with mask R, Normal Maps on, low Distance (e-book p. 111;
  Sasquatch [00:07:18]); hero readability via a mask-channel light (GDC "Multiply with Mask (G)"
  [frame 00:08:15]).
- Top-down shadow cheats: feet-only casters, blob shadows as Multiply sprite lights, building
  shadows as freeform negative lights tweened between four shapes with equal point counts (e-book p.
  114 to 119; GDC [frame 00:13:01], [frame 00:15:15]). Infinite casters for small night light pools
  only.
- Cost is fill rate: "one large light can have worse performance than several small lights"; few
  shadow-casting lights and blend styles; low render scale; Normal Map Quality Fast instead of
  Accurate; test on the lowest target (e-book p. 131 to 132; GDC [frame 00:18:43]; Fast also in
  Sasquatch 1h-hSlffawM [00:04:16]). [obs] Renderer 2D Data defaults in the 6.3 template: render
  scale 0.5, 16 light and 1 shadow render textures (so the GDC slide shows defaults, not tuned
  values).
- Why sorting layers cost (e-book p. 131 to 132: lights batch across contiguous layers; the 2D Light
  Batching Debugger shows which lights to add or remove). [obs] URP 17.3 source: consecutive sorting
  layers share a batch only if every visible light lights both or neither and every shadow caster
  shadows both or neither (`LayerUtility.CanBatchLightsInLayer`), and the Render Graph runs the
  normal, shadow and light passes once per batch, so a light that skips one layer makes every other
  light draw again per batch. On the demo level the player fill light (Background and Ground only)
  gave 4 batches, URP's own count 4, light fill 3.64 screens instead of about 0.99. Bench at 4K
  (`LightFillBench`, 32 lights, setups interleaved, 6 runs): shadows x5.4 to x5.9, one
  layer-skipping light (3 batches) +72 to +101%, normal maps on +15 to +36%, large vs small lights
  slower in every run but by 8 to 43%, Accurate vs Fast within noise. On a desktop GPU in the Editor
  the fill-rate effect of light SIZE is real but noisy; the e-book's warning targets low-end
  devices, so measure there (scenario-unity-performance) and use `LightCost`'s deterministic fill
  proxy to compare setups. Deciding condition against Sasquatch's per-light layers (next line): few
  layers when lights are many or the tier is low; an extra layer only where the look needs it,
  costed with `LightJobs.LightCost`.
- Exclude the player's sorting layer from a player-following fill light, or global + fill
  overexposes the player (Sasquatch [00:01:35]). [obs] Costs light batches (above): the cheaper
  alternative is a dimmer fill that lights every layer, when the look allows it [added].

## 7. Animation (Brackeys hkaysu1Z-N8; Sasquatch IXwEsV8yXk4; Tarodev vLDK0eHwsho; e-book)

- Sprite-sheet transitions: Has Exit Time off, Duration 0; there is nothing to blend (Sasquatch
  [00:01:53]; Brackeys [00:08:07]). Any State transitions need Can Transition To Self off (Brackeys
  [00:16:17]). 12 samples, not the 60 default (Brackeys [00:03:42]).
- Drive physical-outcome parameters (landed, crouching) from the controller, never from input
  (Brackeys [00:18:57]).
- One animation style per game (Sasquatch [00:13:43]); frame-by-frame for pixel art and effects
  baked into drawings; no rigging for jams (Sasquatch [00:11:19]); no skeletal animation for many
  small objects (e-book p. 136).
- Rig once, reskin many: base prefab with bones, IK and Sprite Library; skins are Prefab Variants
  that paste the skeleton and swap the Sprite Library (e-book p. 84). Animate IK targets, not bones
  (Tarodev [00:05:53]); Use Layer Grouping on the PSD importer (Tarodev [00:03:35]). 6.3:
  single-bone sprites skip deformation, about 10% CPU and 30% GPU gain with Burst (Unite
  [00:33:37]).

## 8. Platformer feel (Tarodev repo and video; GMTK/Celeste; Dawnosaur)

- A controller is curves plus forgiveness: coyote time, jump buffer, variable height, clamped fall,
  apex hang, corner correction (GMTK [00:09:28]; Dawnosaur [00:03:39]; Tarodev [00:00:32]). "Working
  on the player's intent" (Thorson, GMTK [00:11:03]); buffering is "possibly the most vital hidden
  feature" (Tarodev [00:01:06]).
- Own the velocity: read and latch input in Update, then collisions, jump, horizontal, gravity,
  apply in FixedUpdate; coyote and buffer as timestamp windows re-armed on landing, consumed on jump
  (Tarodev source). [obs] One press gave exactly one jump at 30, 60 and 144 fps with 50 Hz physics.
- Variable height has three methods with different feel: cut velocity 50% (Super Meat Boy, precise),
  raise gravity on release (Tarodev x3, smooth), hold speed while held (Celeste VarJumpTime 0.2 s,
  recalled from its public code in the GMTK note, unverified) (Dawnosaur [00:00:36]; GMTK). Deciding
  condition: precision (cut) vs smooth arc (gravity) vs long controllable rise (sustain). [obs] Same
  Tarodev stats, measured = replayed: tap / full 0.375 (gravity x3), 0.327 (cut 0.5); sustain with
  JumpPower 36 more than doubles the jump (13.46), so retune: JumpPower 18.7 holds to 5.52 with a
  1.78 tap and a 0.38 s rise instead of 0.32 s (offline replay). `PlatformerStats.JumpCut` selects
  the method.
- Each forgiveness trick is a separate code path (GMTK [00:09:28]) and gets its own toggle so a
  human can A/B it: Tarodev ships the tricks "toggled on and off in the demo" ([00:02:24]), Nijman
  plays with and without each ([00:31:43]). [obs] `PlatformerStats`: UseCoyoteTime, UseJumpBuffer,
  UseVariableJump, UseFallClamp, UseApexModifier, UseCornerCorrection, each covered by an on/off
  PlayMode test.
- Hazards: "small spike hitboxes: touching the tip does not kill" is on Celeste's forgiveness list
  (GMTK [00:09:28]); the agent translation is a collider-to-sprite ratio below 1. [obs] `Hazard2D`
  with a 2 px side and 3 px top inset [added]: a 1 px graze survives, a 5 px overlap still hits.
- Apex band: half gravity while |vy| is small near the peak, plus a small acceleration boost
  (Dawnosaur [00:02:06], [00:02:29]); corner nudge when the head clips a ledge (Tarodev [00:01:52]).
  Neither is in the free repo [obs: grep of the saved source].
- Celeste profile: about 6 frames to top speed, 3 to stop, jump about 3 body heights (Mario 4, Meat
  Boy 6), massive air friction, no skid (GMTK [00:02:01], [00:03:42], [00:04:14]). Movement must be
  fun in an empty room; movement and levels are tuned together (GMTK [00:13:24], [00:14:33]).
- The air friction is a choice, not a default: "release the stick mid-air and the character falls
  almost straight down, making precise landings easy" (GMTK [00:04:14]); other valid profiles keep
  momentum (N++ strong air control, Sonic long acceleration, GMTK [00:15:23]). Tarodev's
  AirDeceleration 30 is half the ground value. [obs] After releasing at top speed in the air: 30
  drifts 3.128 units (5.7 body widths, 24 steps), 240 drifts 0.272 (0.5 width, 3 steps, about
  Celeste's measured 3-frame ground stop) [added value]. Deciding condition: small platforms and
  spikes, high; flow and momentum, low; state the drift in body widths either way. Tarodev's ground
  stop is also slower than Celeste's: 12 steps (0.24 s) vs about 3 frames.
- One-way platforms (6.3 Manual, Platform Effector 2D: Use One Way, Surface Arc, side friction off,
  Collider Mask; the collider needs Used By Effector). [obs] A custom-cast controller must know
  them: its ceiling cast would bonk under the platform and its ground cast would report ground while
  passing up through it. `PlatformerController2D` skips one-way colliders overhead, accepts them
  underfoot only on their top face while not rising, and drops through on Down + Jump
  (`Physics2D.IgnoreCollision` for 0.25 s [added]). Its casts also ignore triggers
  (`ContactFilter2D.useTriggers = false`): with the default Queries Hit Triggers, a plain
  `CapsuleCast` counts a trigger as ground.
- Who owns motion: precision platformer = own the velocity (Celeste, Tarodev); physics-rich game =
  Dynamic body with forces and explicit knockback (Dawnosaur); simple top-down = velocity or
  MovePosition (Brackeys). Kinematic bodies need Full Kinematic Contacts to get callbacks with other
  kinematic or static bodies (6.3 Manual).
- Wall jump: reduce, never remove, run control and lerp it back (Dawnosaur [00:05:04]).
- [obs] The Tarodev repo initializes `_timeJumpWasPressed` to 0: a player who lands within the first
  0.2 s of play gets a phantom buffered jump. Initialize to float.MinValue.

## 9. Camera and juice (Sasquatch 9dzBrLUIF8g; Nijman AJdEqssNZ-U; GMTK)

- The camera is part of feel: "getting your interpolation settings right is actually one of the
  secret elements of having a really good player controller" (Sasquatch [00:01:04]). Facing bias
  with an eased, decoupled follow target, never parented ([00:03:26] to [00:05:02]). Static camera
  per room for precision games (Celeste, GMTK [00:04:49]).
- Asymmetric vertical damping: loose rising, tight falling, so an enemy below is visible in time
  ([00:05:37]); switch past a fall-speed threshold so small vertical changes do not flip it, back
  once vertical speed is at least 0 ([00:07:14]); lerp the damping rather than moving the camera
  ([00:06:43]). His values are on screen only. [obs] `CinemachineFallDamping` (0.6 s / 0.1 s / -15
  u/s / 0.2 s blend, [added]): in a 40-unit drop a fixed 0.6 s damping let the feet reach or pass
  the bottom edge (min view below -0.53 to 0.0 units over 4 runs), the switch kept 3.24 to 3.41
  units visible; hysteresis held through speed jitter around the threshold.
- Rooms: one camera per room; swap on trigger EXIT using the exit direction, never on enter, so a
  player who stops in the doorway and turns back keeps the right camera ([00:14:11], [00:14:43]);
  only the starting room's camera live at scene start ([00:17:24]); bounds fitted with straight
  edges to walls and floor and ending exactly at a secret room's border ([00:02:10], [00:08:19],
  [00:16:52]); Oversize Window for small coves is expensive and can leave the bounds ([00:09:56]);
  corridor cameras with a tall dead zone, locked cameras for boss rooms ([00:15:48], [00:16:52]).
  [obs] `CinemachineRoomSwap` (Priority + `Prioritize()`), tested both ways and with a turn-back;
  `ut_2d.bounds_hide_secrets` checks confiner rects against secret rooms.
- Frame the action, not the player: lead toward aim and bullets, kick opposite to each shot (Nijman
  [00:15:17], [00:25:47]).
- Hit stop about 20 ms per hit (Nijman [00:18:22]); Celeste freezes 4 frames on dash (GMTK
  [00:08:40]): 20 to 70 ms. Subtle juice for precision games, heavy for arcade shooters; always a
  shake-off option (Nijman [00:32:14]).
- Every button needs a cost; permanence tells the fight's story; bullets "at least the size of a rib
  cage" (Nijman [00:16:45], [00:13:11], [00:10:14]).

## 10. Physics and 6.3 additions (6.3 Manual; Unite SdrMgxChrRQ)

- Never move a Dynamic body through its Transform; changing Body Type at runtime re-evaluates
  contacts; Continuous only for fast movers; prune the Layer Collision Matrix (Manual).
- LowLevelPhysics2D (Box2D v3) is a separate system: no components, struct handles, several worlds,
  up to 64 cores, jobs; old Rigidbody2D components unchanged; compute-shader platforms; renamed
  PhysicsCore2D (Unity.U2D.Physics) in 6.5 (Manual; Unite [00:17:18] to [00:22:57]; deltas section
  13).
- 3D in 2D (6.3): Z planes with depth writes (depth of field, parallax) vs Sort 3D as 2D (guest in
  sorting layers); 2D lights reach a mesh only through a Sorting Group on the right sorting layer
  (Unite [00:10:33], [00:12:47]).
