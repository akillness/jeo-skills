---
name: scenario-godot-2d
description: "Use when building a 2D game in Godot 4.7: make a platformer or top-down controller that feels right (coyote time, jump buffer, jump height), TileMapLayer and TileSet in code, terrains and autotiles that pick wrong tiles, a dual grid, a camera that jitters or stutters, pixel art that looks blurry or uneven, stretch and integer scaling, 2D lights and shadows, y-sort order wrong, parallax gaps, or importing AI-generated sprites and tilesets from Scenario."
license: MIT
---

# Godot 2D (developer and artist)

Target: Godot 4.7.2 standard build, macOS, run headless or in small windows through the
scenario-godot-expert toolkit.

Expert level in 2D means feel and pixels are measured, not eyeballed: a jump has a height in tiles
and a coyote window in ticks, a camera has a lag in pixels, a pixel-art screen has an integer factor
and a fringe count. The agent builds tiles, controllers and cameras in code, proves them with
deterministic physics runs and frame read-backs, and only then calls them done. If a sibling skill
named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the
user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, review loop, toolkit `gd_env`, `gd_run`,
`gd_review`, 4.x traps).

## Stance (the expert delta)

1. **Feel is numbers you can test.** Solve gravity and take-off speed from jump height and time to
   apex, and make the height a multiple of the tile size (The Shaggy Dev, Bsy8pknHc0M [00:04:13]).
   Godot then loses about v·dt/2 of it: 53.5 px for a 56 px design at 60 ticks, measured. The kit
   adds g·dt/2 and lands 56.25 px [added].
2. **Forgive in time and space.** Coyote time, jump buffer, corner correction and a jump cut are
   each a few lines (The Shaggy Dev). Count windows in whole ticks: float timers gave 5 coyote moves
   for 0.1 s instead of 6 [added, measured].
3. **Top-down: `move_toward`, not length arithmetic.** Additive acceleration needs `limit_length`;
   subtracting decel from the length goes negative and vibrates (55 sign flips in 60 ticks,
   measured). Steering never arrives without a minimum step (BT Plays Games, m71-kZgYXlw [00:07:30],
   [00:14:08]).
4. **A camera is designed, not parented.** Lookahead, ignore jumps and re-baseline on landing,
   damping, shake with an off switch (Mark Brown, GMTK). Damping lags by speed/damping and eats
   lookahead: 32 px of lookahead gave a 16 px lead at 120 px/s, so state both numbers. Zoom with
   `Camera2D.zoom` (2 zooms in), never by resizing the viewport (DevWorm, RlSpjIb7TLo [00:08:14]).
5. **Jitter is a tick-rate problem.** At 144 Hz with 60 physics ticks, physics interpolation gave
   the ideal 0.289 px RMS for every camera setup. Without it the background stepped 0, 1, 2 px, and
   Idle camera smoothing made the player wobble 3 px. `Camera2D.process_callback` defaults to Idle:
   with interpolation off, set `CAMERA2D_PROCESS_PHYSICS` yourself (Chris' Tutorials, 43c-Sm5GMbc
   [00:28:37]); with it on, Godot forces Physics.
6. **Pixel-perfect is a stretch decision.** `viewport` + integer locks everything to art pixels,
   lights included. 640x360 (the docs' base) and 320x180 both integer-scale to 720p, 1080p, 1440p
   and 4K with no bars, measured; pick by native art size. Ship Exclusive Fullscreen (window mode
   4): a 1 px strip drops 640x360 on 4K from 6x to 5x, measured (docs, Multiple resolutions).
   `canvas_items` gives smooth rotation and sub-pixel motion (Heartbeast prefers it). For locked art
   with a gliding camera, render a SubViewport at base + 2 px and shift the upscaled image by the
   remainder (Barry's Dev Hell).
7. **Tiles are data you can audit.** One TileMapLayer per layer, an external TileSet, terrain mode
   matched to the tile count, and peering bits checked cell by cell. Paint the land, never the water
   side (DevWorm, ZutpG0_CYrQ [00:32:47]); in the GUI, paint bits outer ring first, then the center
   cross (bluuDevGames, CLcFC6ku240 [00:12:28]). Pick a dual grid (16 tiles, display layer offset
   half a tile) when every corner must round the same (jess::codes, jEWFSv3ivTg [00:02:26]). Then
   look at a sampler capture, because index checks pass on wrong art [added].
8. **Generated art is checked before import.** Find the pixel scale and grid phase, snap if
   off-grid, register every clip on its feet line, and check the key-color fringe under linear
   filtering [added, with scenario-sprite-pipeline].
9. **Physics layers are named and single.** One collision layer per object, many masks; name layers
   by what the checker needs ("bombable"), in `layer_names/2d_physics/layer_N` (Bogner, HFBNd4Z4vXM
   [00:10:58] to [00:14:17]). A new body starts on layer 1 and mask 1: adding a layer without
   clearing 1 gives 2 bits, measured.

## Establish first

| Question                                  | Why it changes the plan                                                           | Default                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Pixel art or smooth 2D?                   | stretch mode, filter, light resolution, camera method                             | pixel art: base 640x360 (320x180 for very small art), `viewport` + `keep` + integer, Nearest, Exclusive Fullscreen |
| Locked grid or smooth camera over pixels? | `viewport` alone, or [`pixel_viewport.gd`](scripts/agentkit/2d/pixel_viewport.gd) | smooth camera via `pixel_viewport.gd` when the camera moves slowly                                                 |
| Platformer or top-down?                   | GROUNDED or FLOATING, which kit body                                              | from the brief                                                                                                     |
| Tile size and terrain style               | 47-blob, 16-tile sides, or dual grid                                              | 16 px, 47-blob terrain                                                                                             |
| Target displays                           | integer factors and bars                                                          | 1280x720, 1366x768, 1920x1080, 2560x1440, 3840x2160                                                                |
| Refresh and networking                    | physics interpolation on or off                                                   | on (off for networked games with their own smoothing, docs)                                                        |
| Art source                                | Scenario manifest, hand-made, placeholder                                         | `gd_2d.make_*` placeholders until art lands                                                                        |

## Workflow

1. **Project.** `P = gd_env.base_project("2d", ...)`, `gd_2d.install_kit(P)`,
   `gd_2d.pixel_art_settings(P, ...)`, `gd_run.import_project(P)`. GATE: `stretch_matrix.gd` shows
   the root picked up base size, mode, integer stretch, Nearest and interpolation; the integer
   factor and bars for each target window match `gd_2d.integer_scales`.
2. **Art in.** For each generated image: `detect_pixel_scale`, `pixel_grid_check`, and
   `snap_to_grid` if the phase or scale is off. Then import, `audit_imports`, and build SpriteFrames
   from the manifest with [`sprite_frames_builder.gd`](scripts/agentkit/2d/sprite_frames_builder.gd)
   plus `register()` on each sprite. GATE: audit clean; every clip's lowest ink pixel lands on the
   same world y; `key_fringe` = 0 on a capture at a non-integer scale.
3. **Tiles.** [`tileset_builder.gd`](scripts/agentkit/2d/tileset_builder.gd) (tile size first,
   alpha-derived peering bits, collision, occluders, one-way lips), saved as `.tres`; paint with
   `set_cells_terrain_connect`. Use [`dual_grid.gd`](scripts/agentkit/2d/dual_grid.gd) when the art
   is a 16-tile dual set. GATE: `terrain_tools.audit_layer` gives 0 side and 0 corner mismatches; a
   sampler capture (ring, cross, single cells, inner corners) looks right on a contact sheet.
4. **Character.** [`platformer_body.gd`](scripts/agentkit/2d/platformer_body.gd) +
   [`platformer_tuning.gd`](scripts/agentkit/2d/platformer_tuning.gd) Resource, or
   [`topdown_body.gd`](scripts/agentkit/2d/topdown_body.gd). Brain and body are split so tests drive
   intents. GATE (`--fixed-fps 60`, one move per `await body.stepped`): apex within 0.5 px of
   design; coyote and buffer counted in moves; largest gap in tiles; no snag on tile seams; top-down
   stops at exactly 0 and diagonal speed equals straight speed.
5. **Camera.** [`follow_camera_2d.gd`](scripts/agentkit/2d/follow_camera_2d.gd) (physics step,
   limits from the layer's used rect), or `pixel_viewport.gd` for a smooth view over locked pixels.
   GATE: camera y still during a jump in place; re-baseline after landing; a long fall keeps the
   player on screen; shake off gives offset 0. In a windowed run at `--fixed-fps 144`, background
   steps are at most 1 px with interpolation on.
6. **Lights, sort, parallax.** CanvasModulate + PointLight2D with a radial GradientTexture2D;
   occluders from tile alpha; y-sorted container with feet origins; Parallax2D per plane. GATE: luma
   at probe points (lit, shadowed, owner lit vs a no-occluder control); overlap color test behind
   and in front; parallax shift equals scroll_scale times camera motion; no gap at the lowest zoom;
   no seam over 90 autoscroll frames.
7. **Audit and hand over.** `audit_2d.gd:scenes`, `gd_run.check_all`, `kit_compile.gd`, then a
   contact sheet of the captures (at most 1600 px), opened and looked at. GATE: no warn findings, 0
   compile errors, and the sheet shows no broken tiles, fringes or gaps. In a written plan, inline
   the core code (settings keys, jump maths, controller step, camera) so it runs without the kit;
   name kit files only as shortcuts.

## Numbers

| Value                                                                                                                                         | Measured or source         | Relative to                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------- |
| Base 320x180, integer: 4x at 1280x720 and 1366x768 (bars 43, 24), 6x at 1080p, 8x at 1440p, 12x at 4K, 3x at 1170x2532                        | live                       | window size                      |
| Base 640x360, integer: 2x at 720p and 1366x768 (bars 43, 24), 3x at 1080p, 4x at 1440p, 6x at 4K; 3840x2159 gives 5x with 320 and 180 px bars | live                       | window size                      |
| Jump 56 px, apex 0.35 s, fall 0.28 s: g up 914.3, g down 1428.6 px/s², take-off 327.6 px/s with compensation                                  | live, kit defaults [added] | 16 px tiles, 60 ticks            |
| Jump cut 0.4: a one-tick tap rises 12.79 px (under a tile); minimum height is about (cut·v)²/2g                                               | live, kit defaults         | 16 px tiles                      |
| Coyote 0.1 s = 6 airborne moves; buffer 0.1 s = 5 moves before landing                                                                        | live                       | 60 ticks                         |
| Corner correction 4 px: a 3 px head clip goes from 34 px to the full 56 px                                                                    | live                       | 10x14 body                       |
| 120 px/s run, 56 px jump: clears 4 tiles, not 5                                                                                               | live                       | 16 px tiles                      |
| Top-down 120 px/s, accel 900, decel 1200: 8 moves to max, 6 to stop                                                                           | live, kit defaults         | 60 ticks                         |
| Camera2D smoothing speed: default 5, about 3 felt right, 10 felt like none                                                                    | DevWorm; default read live | px/s smoothing units             |
| Exponential damping 8/s: 90% of a jump closed in 0.30 s at 30, 60 or 144 Hz; lag = speed / damping                                            | live                       | frame rate                       |
| Jitter floor 0.289 px RMS (interpolation on) vs 0.55 (off) at 144 Hz                                                                          | live                       | screen px                        |
| Sub-pixel camera at 4x: 1 px steps vs 4 px snapped                                                                                            | live                       | screen px                        |
| Parallax repeat_times for a plane as wide as the view: zoom 1 needs 1, 0.5 needs 3, 0.25 needs 5                                              | live                       | Camera2D zoom                    |
| Banded light: a 4-stop Gradient with `GRADIENT_INTERPOLATE_CONSTANT` gave 4 luma levels across 64 px, LINEAR 64                               | live                       | PointLight2D over CanvasModulate |
| Fringe: 73 tinted px without `fix_alpha_border` or `fix_alpha_edges()`, 0 with                                                                | live                       | 96 px frame at 0.7x              |

## Quality gates

Every GATE above, plus a contact sheet of the terrain sampler, dual grid, fringe strip and light
captures, opened and judged (rounded corners join the shape, no floating pieces, no magenta edge,
shadows from the right side). Rubric: critique.md.

## Common mistakes

| Mistake                                                   | What it looks like                                  | Fix                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Hand-written project.godot                                | stretch `disabled`, blurry pixels                   | `gd_2d.pixel_art_settings`, read the root back                                                                                       |
| 16-tile sides set in Match Corners and Sides              | holes and wrong edges (32 + 10 mismatches)          | Match Sides, or draw the 47-blob set                                                                                                 |
| Peering bits typed by hand                                | random edge pieces                                  | derive from tile alpha, audit                                                                                                        |
| Jump from the formula only                                | apex 2.5 px short, a gap that should clear does not | compensate g·dt/2 or measure and tune                                                                                                |
| Camera2D as child of the player and nothing else          | static, short-sighted, jumpy                        | `follow_camera_2d.gd`                                                                                                                |
| Idle camera smoothing, interpolation off                  | player shakes against the background at 144 Hz      | physics interpolation on                                                                                                             |
| Camera2D inside a pixel SubViewport with interpolation on | image jumps -5, +3 px                               | set `canvas_transform` (`pixel_viewport.gd`)                                                                                         |
| Snap shader expected to pixelate light                    | falloff still smooth                                | `viewport` stretch or a SubViewport world; bands from a CONSTANT gradient; `shadow_filter` None (the default)                        |
| Occluder owner goes dark                                  | wall or sprite unlit                                | flip cull mode (screen winding decides), check against a control                                                                     |
| Centered sprite origin in a y-sorted container            | player drawn over a tree it stands behind           | origin at the feet, art moved with `offset`; tall tiles get `y_sort_origin`                                                          |
| Zoom by changing the viewport or window size              | UI and pixel scale change with it                   | `Camera2D.zoom`                                                                                                                      |
| Fullscreen (mode 3) for integer pixel art                 | factor drops one step on a 1 px strip               | Exclusive Fullscreen (mode 4)                                                                                                        |
| Shadow baked into the character sprite                    | shadow drawn over the tree trunk behind             | separate shadow Sprite2D, `z_index = -1`; `z_as_relative = false` once the character has its own z (DevWorm, lvuLjMAr_BE [00:09:24]) |
| Tile animation over a neighboring tile                    | "tiles are already present", 1 frame kept           | erase the neighbors first (DevWorm, ZutpG0_CYrQ [00:24:13])                                                                          |
| Parallax with repeat_times 1 and zoom out                 | magenta or black gaps                               | `parallax_tools.repeat_times_for`                                                                                                    |
| Keyed sprite loaded at runtime with linear filtering      | magenta outline                                     | import it, or `Image.fix_alpha_edges()`                                                                                              |
| `.import` edited and reimported in the same second        | old texture still used                              | `gd_2d.set_import_params` (lowercase bools, mtime bump), check the `.ctex` changed                                                   |

## Handoffs

- **Receives from** scenario-sprite-pipeline, scenario-game-assets, scenario-sprite-animation: PNG
  or WebP strips, tilesets and a manifest with `frames`, `w`, `h`, `ground`. Ask for the native
  pixel size and key color.
- **Receives from** scenario-godot-architecture: project layout, autoloads, input action names.
- **Delivers to** scenario-godot-gameplay: bodies with intent fields and signals `jumped`, `landed`,
  `stepped`; TileMapLayers for navigation. scenario-godot-animation: SpriteFrames registered on
  feet.
- **Delivers to** scenario-godot-vfx, scenario-godot-shaders, scenario-godot-ui (HUD via
  `pixel_viewport.world_to_screen`), scenario-godot-performance-export, scenario-godot-audio (hooks
  on `landed`).
- **Escalate to** scenario-godot-expert for channel failures.

## Godot 4.7 notes

- TileMap and ParallaxBackground/ParallaxLayer are deprecated since 4.3: use TileMapLayer (4-arg
  `set_cell`) and Parallax2D. Tile physics is chunked by `physics_quadrant_size` since 4.5. One-way
  direction (`one_way_collision_direction`, default (0, 1)) is new in 4.7 (deltas file).
- Camera2D: `enabled` plus `make_current()`, `position_smoothing_enabled`, `ignore_rotation`. With
  interpolation on, a zoom change eases over one tick (2 to 3 frames to reach 2.0, measured).
- Defaults read in 4.7.2: canvas texture filter Linear, 2D transform snap off, physics interpolation
  off, CharacterBody2D safe margin 0.08 and floor snap 1 px. Texture import: Lossless, no mipmaps,
  `fix_alpha_border` on, `detect_3d/compress_to` 1.
- Several occluder polygons on one occlusion layer of one tile work in 4.7.2 (2, kept after save):
  the second occlusion layer of the 4.3 video (suzF2Y166eA [00:12:22]) is not needed.
- Godot 3 names to avoid: `KinematicBody2D`, `YSort`, `Light2D` as a node, `set_cellv`,
  `world_to_map`, `Camera2D.current`.

## References

- [`references/procedures.md`](references/procedures.md): procedures with code and live results;
  [`expert-notes.md`](references/expert-notes.md): principles by source with timestamps;
  [`critique.md`](references/critique.md): self-check rubric;
  [`gui-paths.md`](references/gui-paths.md): editor menus; [`sources.md`](references/sources.md):
  videos and docs.
- [`scripts/gd_2d.py`](scripts/gd_2d.py): settings, import audit, pixel-grid checks, jump maths,
  placeholder atlases. [`scripts/agentkit/2d/`](scripts/agentkit/2d/): tileset, terrain, dual grid,
  bodies, cameras, pixel viewport, sprite frames, parallax, audit, light shader.
