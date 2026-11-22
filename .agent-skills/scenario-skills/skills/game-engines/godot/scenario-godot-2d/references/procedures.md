# scenario-godot-2d: agent procedures (full code paths, live results)

Every procedure ran in Godot 4.7.2.stable.official.ed1daf0bf (standard build, Metal, macOS, Apple
Silicon) on 2026-10-02 through the scenario-godot-expert toolkit (`gd_env`, `gd_run`, `gd_review`).
Live suite: `tests/code/godot-2d/test_2d_live.py` (L1 to L18, fresh Base2D clone per run under
`tests/projects/godot-2d/runs/<stamp>/G6`). Offline suite: `tests/code/godot-2d/test_2d_offline.py`
(20 checks on `gd_2d.py`). Final full run: 18/18 pass, evidence
`tests/live_evidence/godot-2d/live_20261002-214300.json`, contact sheet
`captures_20261002-214300.png`, logs and result files copied under
`tests/live_evidence/godot-2d/run_20261002-214300/`. Offline: 20/20 pass.

Code lives in the skill: `scripts/gd_2d.py` (Python, runner side) and `scripts/agentkit/2d/`
(GDScript, copied into a project's `addons/agentkit/2d/` by `gd_2d.install_kit`). Test jobs are in
`tests/code/godot-2d/jobs/`.

## 0. Setup

```python
import sys
sys.path.insert(0, "<skills>/scenario-godot-expert/scripts"); sys.path.insert(0, "<skills>/scenario-godot-2d/scripts")
import gd_env, gd_run, gd_review, gd_2d
P = gd_env.base_project("2d", "<repo>/tests/projects/godot-2d/Work")   # APFS clone + AgentKit
gd_2d.install_kit(P)                     # addons/agentkit/2d/*.gd, *.gdshader
keys = gd_2d.pixel_art_settings(P, base=(320, 180), mode="viewport", aspect="keep", window_scale=4)
gd_run.import_project(P)
```

Physics jobs: `gd_run.run_script(P, "res://jobs/x.gd", args, extra_args=["--fixed-fps", "60"])`.
With a fixed frame delta the run is deterministic and fast: the platformer job took 80 s in real
time and 0.66 s with `--fixed-fps 60` [added, measured]. Render jobs:
`headless=False, window=(160, 90)` (larger only when the measurement needs it), and
`--fixed-fps 144` to reproduce a 144 Hz monitor exactly.

Test pattern for one physics move: the body emits `stepped` at the end of its `step()`; the job sets
the intent fields, then `await body.stepped`. Awaiting `physics_frame` instead resumes before the
body's own `_physics_process`, so the state read is one move old [added, measured]. Lambdas capture
locals by value: count signals into an Array (`var box := [false]`).

## 1. Pixel-art project settings and the stretch matrix (L1, L2)

`gd_2d.pixel_art_settings(project, base, mode, aspect, window_scale, snap=False, interpolation=True, ticks=60, filter_nearest=True)`
writes these keys explicitly (a hand-written project.godot gets stretch `disabled` and `keep`, per
the deltas file): viewport width and height, window width and height override (base x window_scale),
stretch mode, aspect, `scale_mode="integer"`, physics ticks, `physics/common/physics_interpolation`,
`rendering/textures/canvas_textures/default_texture_filter=0` (Nearest), and
`rendering/2d/snap/snap_2d_transforms_to_pixel` (`false` unless `snap=True`, which clears the snap
`gd_env.new_project(pixel_art=True)` writes).

Check that the keys took effect, not only that the file changed: job `stretch_matrix.gd` reads the
root Window at startup, then resizes the root headless (`root.size = s`) and reads
`get_final_transform()`.

Run in Godot 4.7.2 on 2026-10-02: pass. The root picked up size 320x180, mode viewport (2), stretch
integer (1), aspect keep (1), default filter nearest (0), interpolation on.

| Window                     | Scale (viewport or canvas_items, integer) | Bars     | Fractional scale |
| -------------------------- | ----------------------------------------- | -------- | ---------------- |
| 1280x720                   | 4                                         | 0, 0     | 4.0              |
| 1366x768                   | 4                                         | 43, 24   | 4.266            |
| 1440x900                   | 4                                         | 80, 90   | 4.5              |
| 1920x1080                  | 6                                         | 0, 0     | 6.0              |
| 2560x1440                  | 8                                         | 0, 0     | 8.0              |
| 1170x2532 (portrait phone) | 3                                         | 105, 996 | 3.656            |

`gd_2d.integer_scales(base, sizes)` predicts the same numbers offline. What each mode renders at was
measured windowed in L12: the root texture is 320x180 in `viewport` mode and 640x360 (the window) in
`canvas_items` mode. Engine defaults read in L18: default texture filter Linear (1), 2D transform
snap off, physics interpolation off.

## 2. TileSet from an atlas PNG, in code (L3, L4, L18)

The TileSet editor (tile creation, polygon drawing, terrain bit painting) is a viewport tool.
Substitute: `tileset_builder.gd`.

```gdscript
const TB = preload("res://addons/agentkit/2d/tileset_builder.gd")
var info := {}
var ts: TileSet = TB.build_tileset({"texture": "res://art/blob47.png", "tile_size": Vector2i(16, 16),
    "terrain_mode": "corners_and_sides", "collision": "full", "occlusion": true, "one_way": [[0, 0]]}, info)
ResourceSaver.save(ts, "res://tiles/ground.tres")      # external TileSet, shared by every layer
```

Order that works: `tile_size` first (docs: set it before creating atlas tiles), physics layer
(`collision_layer = 1 << (n - 1)`), occlusion layer, terrain set and terrain, atlas source with
`texture_region_size`, `ts.add_source(src)` before writing terrain data on tiles, then per cell:
skip fully transparent cells (`img.get_region(rect).is_invisible()`, as the editor does),
`create_tile`, collision polygon (full rectangle centered on the tile, or the alpha outline from
`BitMap.opaque_to_polygons` shifted by minus half a tile), occluder, then `terrain_set`, `terrain`,
peering bits. Peering bits come from the art: probes 1 px inside each edge middle and corner say
whether terrain reaches that side; corners are written only when `is_valid_terrain_peering_bit`
accepts them. One-way tiles get a 4 px lip polygon with `set_collision_polygon_one_way`.

Run in Godot 4.7.2 on 2026-10-02: pass. 47 tiles from the 128x96 blob atlas, 16 from the sides
atlas. L18: two occluder polygons on one occlusion layer of one tile (count 2, still 2 after save
and reload). One-way tile: a body jumping from the floor (y 160) passed up through the platform to y
103.6 and came to rest on its top at y 112.0, `is_on_floor()` true.

Placeholder art for grayboxes and tests: `gd_2d.make_blob47_atlas`, `make_sides16_atlas`,
`make_dual_grid_atlas` draw atlases whose pixels encode their own peering bits.

## 3. Terrain painting and the terrain audit (L3, L4)

```gdscript
const TT = preload("res://addons/agentkit/2d/terrain_tools.gd")
var cells := TT.cells_from_ascii(rows, "#")             # rows: Array of strings, "#" = ground
layer.set_cells_terrain_connect(cells, 0, 0)            # terrain set 0, terrain 0
var audit := TT.audit_layer(layer)                     # each cell's bits vs its real neighbours
```

`audit_layer` compares every painted cell's peering bits with what its neighbors require (sides, and
corners when both adjacent sides connect, the 47-blob rule) and returns `side_mismatches`,
`corner_mismatches`, `missing_tile_data` and examples. Job: `terrain_paint.gd` (paints an 11-row
sampler, audits, saves the scene).

Run in Godot 4.7.2 on 2026-10-02: pass.

- 47-blob set, mode Match Corners and Sides: 91 cells, 0 mismatches. One call for all cells: 2.7 ms.
  One call per cell: 6.5 ms, identical tiles on all 91 cells and 0 mismatches.
- 16-tile set (every side combination) in Match Sides: 0 side mismatches. The same 16 tiles in Match
  Corners and Sides: 32 side and 10 corner mismatches, and the capture shows broken shapes. A
  16-tile set has no inner-corner tiles, so concave corners render as steps (visible in the L17
  capture): that is the art, not a bug.
- `get_terrain_set_mode` enum: 0 = corners and sides, 1 = corners, 2 = sides.

## 4. Dual grid (L5, L17)

`dual_grid.gd` (`@tool`, Node2D): a world TileMapLayer holds the data (hidden at runtime), a display
TileMapLayer offset by minus half a tile draws one of 16 tiles per display cell. Index = TL*1 +
TR*2 + BL*4 + BR*8 from the 4 world cells under it; atlas coords (index % 4, index / 4); index 0
erases. World-to-display uses offsets (0,0), (1,0), (0,1), (1,1); display-to-world uses the negated
ones (jess::codes, jEWFSv3ivTg 00:04:06).

```gdscript
var dg := DualGrid.new(); dg.world = world_layer; dg.display = display_layer
dg.set_world_cell(Vector2i(5, 3), true)      # updates the 4 display cells around it
dg.rebuild()                                 # whole map
```

Run in Godot 4.7.2 on 2026-10-02: pass. 91 world cells gave 164 display cells, 0 index mismatches,
display offset (-8, -8), carving and restoring a cell touched the expected cells, exports survive a
scene save. The index check passed while the first placeholder atlas drew its isolated quarters
inverted (pies floating off the shape); only the capture showed it. Fixed in `make_dual_grid_atlas`
(quarters flush with the tile's outer edges, rounded at the tile center) and checked by eye in the
L17 contact sheet.

## 5. Platformer controller with numbers (L6)

Files: `platformer_tuning.gd` (Resource with the design numbers) and `platformer_body.gd`
(CharacterBody2D). Body and brain are split: the body reads `intent_x`, `jump_pressed`, `jump_held`;
with `use_input` on it fills them from the Input Map (`move_left`, `move_right`, `jump`), a test or
AI sets them itself.

Design numbers (16 px tiles, [added] starting values): max speed 120 px/s, ground accel 1200 px/s²
(0.1 s to max), decel 1600, air accel 900; jump height 56 px (3.5 tiles), time to apex 0.35 s, time
to land 0.28 s, jump cut 0.4, apex hang gravity x0.6 under 30 px/s, max fall 420 px/s; coyote 0.1 s,
buffer 0.1 s, corner correction 4 px. Gravity up = 2h / t² = 914.3 px/s², down = 1428.6, take-off
speed = 2h / t = 320 px/s (Shaggy Dev, Bsy8pknHc0M 00:04:13: solve from height and time to apex).

Two engine facts the body handles [added, measured]:

- `move_and_slide` integrates velocity before position, so the apex lands about v·dt/2 short: 53.5
  px for a 56 px design at 60 ticks. `jump_velocity()` adds g·dt/2 (327.6 px/s) and the apex lands
  on 56.25 px.
- Timers in float seconds decremented on the last floor tick gave 5 coyote moves for 0.1 s. Timers
  are whole ticks (`ticks(0.1)` = 6), coyote counts down only off the floor, the buffer counts down
  after each move.

Run in Godot 4.7.2 on 2026-10-02 (`platformer_feel.gd`, `--fixed-fps 60`): pass.

| Measure                                                                      | Result                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Full jump                                                                    | 56.25 px, apex at move 22, 39 moves in the air                  |
| One-tick tap (variable height)                                               | 12.79 px                                                        |
| Coyote 0.1 s                                                                 | jump accepted up to 6 airborne moves, refused at 7              |
| Buffer 0.1 s                                                                 | press accepted up to 5 moves before landing                     |
| Head clips a ceiling corner by 3 px                                          | 33.99 px without correction; 56.25 px with it (1 nudge of 4 px) |
| Largest gap cleared at 120 px/s, running take-off                            | 4 tiles (5 fails)                                               |
| Run on a tiled floor, rectangle and capsule, 120 px/s; rectangle at 600 px/s | no snag: 0 slow moves after reaching max, 0 wall contacts       |
| Time to max speed                                                            | 6 moves (0.1 s); 30 moves at 600 px/s                           |
| Real Input Map (`Input.action_press`)                                        | jump fired, vx 120 after holding right                          |

## 6. Top-down controller (L7)

`topdown_body.gd`: FLOATING motion mode (docs: every collision is a wall), `intent.limit_length(1)`,
`facing` keeps the last direction, two models.

```gdscript
# linear: caps speed and stops at exactly zero
velocity = velocity.move_toward(intent * max_speed, (accel if intent else decel) * dt)
# steer: frame-rate independent, with a minimum step so it reaches the target
var k := 1.0 - pow(1.0 - steer_k, dt * 60.0)
```

Run in Godot 4.7.2 on 2026-10-02 (`topdown_feel.gd`): pass.

- Linear (accel 900, decel 1200): max speed in 8 moves, back to exactly 0 in 6 moves, 0 sign flips.
- The hand-written "subtract decel from the length" version (BT Plays Games, m71-kZgYXlw 00:07:30)
  flipped direction 55 times in 60 ticks, ending in a +11.67 / -10 px/s oscillation.
- Diagonal input (1, 1) capped at 120 px/s; the raw vector would give 169.7.
- Steering (k 0.2): with a 6 px/s minimum step, max in 12 moves and exactly 0 in 12; without it,
  119.999 after 53 moves and never 0 in 240 moves (m71-kZgYXlw 00:14:08 confirmed).
- Pushing diagonally into a wall for 30 moves: FLOATING slid 54.97 px and kept (84.85, -84.85)
  velocity; GROUNDED slid 34.52 px.

## 7. Follow camera (L8)

`follow_camera_2d.gd` (Camera2D, not a child of the player) implements the GMTK behaviors
(TdWFzpgnljs): lookahead by facing with a glide, platformer baseline (ignore jumps, re-baseline on
landing, follow a fall past a band), exponential damping, shake as trauma on `offset` with
`shake_enabled` for accessibility, limits from `TileMapLayer.get_used_rect()` via
`set_limits_from_layer(layer)`. It moves in the physics step.

Run in Godot 4.7.2 on 2026-10-02 (`camera_follow.gd`, `--fixed-fps 60`, view 320x180): pass.

- Jump in place: player rose 56.25 px, camera y moved 0.
- Landing on a step 2 tiles up: baseline moved 160 to 128 after landing (move 34), camera eased over
  about 40 moves.
- Lookahead 32 px at damping 8: the camera led the player by 16 px, not 32. Exponential damping lags
  by speed/damping (120/8 = 15 px) and that lag eats the lookahead (GMTK warns about this,
  00:05:06). Raise lookahead or damping together.
- Long fall at 420 px/s: the first version let the player reach 100 px below center, off a 180 px
  screen (48 px band + 52 px of damping lag). The script now clamps the focus to the band; measured
  55 px (48 + one tick of fall).
- Limits clamp the screen center to 160 px at the map's left edge; shake off gives offset (0, 0);
  shake on gives 4.7 px at trauma 1 and decays to 0 in 1 s.
- Damping as `lerp(f, target, 1 - exp(-k dt))` closes 90% of a gap in 0.29 to 0.30 s at 30, 60 and
  144 Hz. A fixed `lerp(f, target, 0.1)` per frame takes 0.73 s at 30 Hz and 0.15 s at 144 Hz.

## 8. Jitter at high refresh: physics interpolation and camera setup (L9)

Job `jitter_matrix.gd`, windowed 160x90 at `--fixed-fps 144` with 60 physics ticks: a body moves at
100 px/s, each rendered frame is read back, and the residual of the player's screen x and of the
background offset against a straight line is measured.

Run in Godot 4.7.2 on 2026-10-02: pass.

| Setup                                                                          | Background RMS (px) | Background steps          | Player screen x                              |
| ------------------------------------------------------------------------------ | ------------------- | ------------------------- | -------------------------------------------- |
| Interpolation on, any camera (child, smoothing idle or physics, follow script) | 0.289               | 99 x 1 px, 44 x 0         | fixed (follow script: 2 positions, 0.16 RMS) |
| Interpolation off, camera child of player or physics smoothing                 | 0.55                | 40 x 2 px, 20 x 1, 83 x 0 | fixed                                        |
| Interpolation off, Camera2D smoothing in Idle                                  | 0.288               | smooth                    | wobbles over 3 px, 0.58 RMS                  |
| Interpolation on + 2D transform snap                                           | 0.289               | smooth                    | child: 0.08 RMS, follow script: 0.47 RMS     |

0.289 px is the quantization floor (1/sqrt(12)): interpolation gives the ideal result. With
interpolation on, Godot prints "Camera2D overridden to physics process mode due to use of physics
interpolation." Snap did not help here and made the follow camera worse, so `pixel_art_settings`
leaves it off by default.

## 9. Smooth camera over a locked pixel grid (L10)

`pixel_viewport.gd` (Control): the world renders in a SubViewport at base size + 2 px, its view on
whole pixels via `viewport.canvas_transform`, and the container moves by the sub-pixel remainder
times the scale (Barry's Dev Hell, DwVPFbDoyoc 00:03:10 to 00:05:44; the +2 px margin and -scale
offset are his edge fix). Set `target_position` every rendered frame.

The first version used a Camera2D inside the SubViewport. With physics interpolation on, Godot
forced that camera to the physics callback, so it moved at 60 Hz while the shift moved at 144 Hz,
and the image jumped by -5 and +3 px. The canvas transform avoids it [added, measured].

Run in Godot 4.7.2 on 2026-10-02 (`subpixel_camera.gd`, 80x45 art at 4x in a 320x180 window,
`--fixed-fps 144`, pan at 30 art px/s): pass. Snapped view: background steps of 4 screen px (30
steps, 113 still frames). Sub-pixel view: steps of 1 px (119) and 0 (24), mean 0.83 px = 30 x 4
/ 144. The world image stays 82x47 native pixels.

## 10. Generated sprites into SpriteFrames (L11, offline)

Input: a scenario-sprite-pipeline manifest,
`clips.<character>.<clip> = {src, frames, w, h, ground, fps?, loop?}` with `ground` = frame 0's ink
bottom row.

```gdscript
const SFB = preload("res://addons/agentkit/2d/sprite_frames_builder.gd")
var sf := SFB.from_manifest("res://art/sprites/manifest.json", "hero", info)   # missing clips are skipped
ResourceSaver.save(sf, "res://art/sprites/hero_frames.tres")
var spr := AnimatedSprite2D.new(); spr.sprite_frames = sf; SFB.register(spr)     # origin on the feet
```

`register` sets `centered = false` and `offset = (-w/2, -(ground + 1))` for whichever clip plays, so
clips framed differently by the generator stand on the same point, and Y-sort compares feet.

Python checks before import (offline suite, pass): `detect_pixel_scale(png)` found 4 on a 4x strip
and on the same strip shifted by (2, 1); `pixel_grid_check(png, 4)` found phase (2, 1) with 100%
uniform blocks; `snap_to_grid` returned the native 144x24 strip; `alpha_key_report` counts
transparent pixels that keep the key RGB (all of them in a keyed strip); `ground_line` gives the
feet row.

Run in Godot 4.7.2 on 2026-10-02 (`sprite_import.gd`, windowed 320x90): pass. idle 6 frames at 8
fps, run 8 frames at 12 fps, missing `attack` skipped; the clip geometry survives a save as
metadata; the lowest ink pixel of both clips lands at world y -1 (offsets (-48, -88) and (-64,
-92)). Key fringe, frame drawn at 0.7x with linear filtering over gray:

| Source                                                              | Magenta-tinted pixels |
| ------------------------------------------------------------------- | --------------------- |
| Imported, default (`process/fix_alpha_border` on)                   | 0                     |
| Imported with `fix_alpha_border=false`                              | 73                    |
| Runtime `Image.load_from_file`, raw                                 | 73                    |
| Runtime load + `Image.fix_alpha_edges()` (what `load_texture` does) | 0                     |

Two traps found on the way [added, measured]: at 0.75x, 4x-upscaled art never samples across a block
edge, so a fringe test there shows nothing (use a scale like 0.7); and `gd_2d.set_import_params`
must write lowercase `false` (Python's `False` was read as the default) and push the `.import` mtime
forward, because an edit in the same second as the last import was skipped by the next `--import`.

Real Scenario generation: not yet run. The Scenario MCP needs a team and project choice from the
user, which this agent could not ask for; 0 CU spent. The stand-in strips follow the pipeline's
contract (keyed RGB in transparent pixels, nearest upscale, ground row).

## 11. 2D lights and shadows (L12)

```gdscript
var cm := CanvasModulate.new(); cm.color = Color(0.15, 0.15, 0.2)
var g := GradientTexture2D.new(); g.width = 256; g.height = 256
g.fill = GradientTexture2D.FILL_RADIAL; g.fill_from = Vector2(0.5, 0.5); g.fill_to = Vector2(0.5, 0.0)
var grad := Gradient.new(); grad.set_color(0, Color(1, 1, 1, 1)); grad.set_color(1, Color(1, 1, 1, 0)); g.gradient = grad
var light := PointLight2D.new(); light.texture = g; light.shadow_enabled = true
# occluders: tileset_builder with "occlusion": true (outline from tile alpha), or LightOccluder2D
```

Run in Godot 4.7.2 on 2026-10-02 (`light_matrix.gd`, windowed 640x360, art 320x180): pass.

- CanvasModulate: far corner luma 32 (unlit floor 0.8 x 0.15). Open floor 85 px from the light: 114.
  Behind a 3x3 wall block: 32 (full shadow).
- Self-shadowing and cull mode, wall as Polygon2D + LightOccluder2D: with cull Disabled the wall is
  dark (20). The wall is lit (71, same as with no occluder) only when the cull mode is the opposite
  of its on-screen winding: a polygon clockwise on screen (y down) needs `CULL_COUNTER_CLOCKWISE`, a
  counter-clockwise one needs `CULL_CLOCKWISE`. Outlines from `BitMap.opaque_to_polygons` came out
  counter-clockwise on screen, so tile occluders need `CULL_CLOCKWISE`. Rule for an agent: if the
  owner stays dark, switch to the other cull mode and measure.
- Per-tile occluders on a block: with `CULL_CLOCKWISE` the tile facing the light is lit (100); the
  inner tiles stay dark (20) because their neighbors' occluders shadow them.
- Pixel-art light: in `viewport` mode lights render at 320x180, so falloff and shadow edges are in
  art pixels. In `canvas_items` mode they render at 640x360. The docs'
  `LIGHT_VERTEX`/`SHADOW_VERTEX` snap shader (`pixel_light.gdshader`, px 8) stepped the shadow edges
  in 8 px blocks (550 pixels changed) but left the point light falloff smooth (4x4 block uniformity
  unchanged at 2.7%). For pixelated falloff, use `viewport` stretch or a SubViewport world.

## 12. Y-sort (L13)

Rules: `y_sort_enabled` on a container Node2D, never on the world root (DevWorm, lvuLjMAr_BE
00:07:09); the node origin at the feet, art moved with `offset` (00:13:41); tall tiles get
`texture_origin` and `y_sort_origin` (00:22:14).

```gdscript
tree.offset = Vector2(0, -16)          # 16x32 art drawn above the origin: origin = trunk base
td.texture_origin = Vector2i(0, 8); td.y_sort_origin = 8   # tall tile: sort by the cell bottom
layer.y_sort_enabled = true            # its cells sort with the container's other children
```

Run in Godot 4.7.2 on 2026-10-02 (`ysort_probe.gd`, windowed 160x90, color read at the overlap):
pass. Feet origin: player 4 px above the trunk base is behind the tree, 4 px below is in front.
Centered origin: player in front in both cases (wrong). Tall tile with `y_sort_origin = 8`: correct
both ways; without it: player in front in both cases (wrong).

## 13. Parallax2D (L14)

```gdscript
const PT = preload("res://addons/agentkit/2d/parallax_tools.gd")
world.add_child(PT.make_layer(tex, Vector2(0.5, 1.0), 25.0, true, PT.repeat_times_for(320, cam_zoom, tex.get_width())))
```

Run in Godot 4.7.2 on 2026-10-02 (`parallax_probe.gd`, windowed 160x90, `--fixed-fps 60`): pass.
Camera moved 100 px: planes at scroll_scale 0, 0.25, 0.5, 1 moved 0, 25, 50, 100 px on screen. Plane
as wide as the view: no gap at zoom 1 with `repeat_times` 1; zoom 0.5 needed 3 (9 gap px with 1 or
2); zoom 0.25 needed 5 (80, 44, 4, 4, 0 gap px for 1 to 5). `repeat_times_for` returns ceil(visible
width / plane width) + 1 (2, 3, 5). Autoscroll at -37 px/s with `repeat_size` = texture width: 0
frames with a seam over 90 frames (after the first 3 frames, where the plane is not placed yet).

## 14. Scene audit (L15)

`run_script(P, "res://addons/agentkit/2d/audit_2d.gd:scenes", {"paths": [...]})` (no paths: every
.tscn outside addons). Rules: `deprecated_node` (TileMap, ParallaxBackground, ParallaxLayer),
`light_no_texture`, `lights_no_modulate`, `shadow_no_occluder`, `camera_idle_smoothing` (only when
interpolation is off: the L9 wobble), `ysort_centre_origin`, `tile_ysort_alone`, `mask_zero`,
`several_cameras`, `empty_body`.

Run in Godot 4.7.2 on 2026-10-02 (`audit_fixture.gd`): pass. A fixture with one of each mistake
fired every rule except `camera_idle_smoothing`, which correctly stayed silent because the project
has interpolation on (it fired in the Probe project with interpolation off). The terrain, sides and
dual-grid scenes and main.tscn: no findings. `gd_2d.audit_imports(P)` flags lossy compression,
mipmaps, `fix_alpha_border` off, and for pixel art `detect_3d/compress_to != 0`; L1 flagged exactly
the one texture imported with the fringe-prone setting.

## 15. Compile gate (L16)

`gd_run.check_all(P)` compiles the jobs (15 files, 0 errors). `agent_audit.gd:scripts` skips
`addons/agentkit/`, so `kit_compile.gd` loads every kit script and the shader with
`CACHE_MODE_IGNORE`: 12 files, 0 errors.

## 16. Round 2 additions (R1 to R6, after the G6 blind grade)

Suite: `tests/code/godot-2d/round2_live.py` (jobs `round2_facts.gd`, `round2_zoom_frames.gd`,
`round2_snippets.gd` headless, `round2_render.gd` windowed 160x90) on
`tests/projects/godot-2d/round2` (Base2D clone, kit installed,
`pixel_art_settings(base=(640, 360), mode="viewport", aspect="keep", window_scale=2)`). Final run
2026-10-02: 4/4 jobs `ok`, evidence `tests/live_evidence/godot-2d/round2_20261002-223902.json`. The
one engine error in R4 is provoked on purpose (`expect_errors = true`).

**R1. Integer stretch to 4K and the Exclusive Fullscreen strip.** Same method as section 1, with
`root.content_scale_size` set per base and the root resized headless; 1919 and 2159 px heights stand
in for a fullscreen window that loses 1 px.

| Window    | 320x180: scale, bars | 640x360: scale, bars |
| --------- | -------------------- | -------------------- |
| 1280x720  | 4, (0, 0)            | 2, (0, 0)            |
| 1366x768  | 4, (43, 24)          | 2, (43, 24)          |
| 1920x1080 | 6, (0, 0)            | 3, (0, 0)            |
| 2560x1440 | 8, (0, 0)            | 4, (0, 0)            |
| 3840x2160 | 12, (0, 0)           | 6, (0, 0)            |
| 1920x1079 | 5, (160, 90)         | 2, (320, 180)        |
| 3840x2159 | 11, (160, 90)        | 5, (320, 180)        |

Both bases integer-scale to every 16:9 target without bars; the docs recommend 640x360. One missing
pixel row costs a whole factor, which is why the docs ask for Exclusive Fullscreen.
`DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN` = 4 (`FULLSCREEN` = 3); project key
`display/window/size/mode` exists, so write `display/window/size/mode=4`. Not run: a real switch
between the two modes on a display (the 1 px strip itself is an OS behavior).

**R2. Camera2D defaults and zoom.**

```gdscript
var cam := Camera2D.new()          # process_callback == 1 (CAMERA2D_PROCESS_IDLE); PHYSICS is 0
cam.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS   # needed when physics interpolation is off
cam.zoom = Vector2(2, 2)           # zoom in: canvas scale 2. Never resize the viewport to zoom.
```

Result: default 1 (Idle); root canvas scale 1.0 at zoom 1 and 2.0 at zoom 2 (8 frames waited). Frame
by frame with interpolation on (`round2_zoom_frames.gd`): 1.0, 1.40, 1.81, 2.0, then 2.10, 2.93,
3.76, 4.0 for zoom 4: the zoom eases over one physics tick, and Godot logged "Camera2D overridden to
physics process mode due to use of physics interpolation." A test that reads the zoom 1 frame after
setting it sees an intermediate value.

**R3. Collision layers named and single** (Bogner, HFBNd4Z4vXM 00:10:58 to 00:14:17).

```gdscript
ProjectSettings.set_setting("layer_names/2d_physics/layer_1", "world")   # names by what the checker needs
body.collision_layer = 0; body.set_collision_layer_value(3, true)        # exactly one layer bit
static func bit_count(v: int) -> int:
	var n := 0
	while v:
		n += v & 1; v >>= 1
	return n
```

Result: the snippet ran as printed (`round2_snippets.gd`: 1 bit after the reset, 2 after also
setting layer 1); the name reads back ("world"); a new CharacterBody2D has layer 1 and mask 1;
`set_collision_layer_value(2, true)` without clearing gave 2 bits. Audit rule for a scene: every
CollisionObject2D with `bit_count(collision_layer) > 1` is listed for review.

**R4. Tile animation needs free cells to the right** (DevWorm, ZutpG0_CYrQ 00:24:13). Atlas with
tiles at (0, 0) and (1, 0): `has_room_for_tile((0, 0), (1, 1), 0, (0, 0), 2, (0, 0))` false;
`set_tile_animation_frames_count((0, 0), 2)` logged "Cannot set animation columns count, tiles are
already present in the space the tile would cover." and kept 1 frame. After `remove_tile((1, 0))`
the same call gave 2 frames. Check `has_room_for_tile` before adding frames; lay animated tiles out
with empty cells after them.

**R5. Banded pixel-art light, shadow filter.**

```gdscript
var grad := Gradient.new()
grad.offsets = PackedFloat32Array([0.0, 0.33, 0.66, 1.0])
grad.colors = PackedColorArray([Color(1,1,1,1), Color(1,1,1,0.6), Color(1,1,1,0.25), Color(1,1,1,0)])
grad.interpolation_mode = Gradient.GRADIENT_INTERPOLATE_CONSTANT   # 1; default LINEAR is 0
light.texture = <GradientTexture2D, FILL_RADIAL, 128x128, this gradient>
light.shadow_filter = Light2D.SHADOW_FILTER_NONE                   # 0, already the default
```

Result (luma along 64 px from the light center, CanvasModulate 0.1, floor 0.8): CONSTANT 4 distinct
levels (224, 143, 72 and the ambient), LINEAR 64 levels (222 down to 37). `Gradient.sample` with
CONSTANT returns the left stop's value (1, 1, 1, 1, 0.5, 0.5, 0.5, 0.15 ...). Combine with
`viewport` stretch so each band edge is also on art pixels.

**R6. Separate shadow sprite** (DevWorm, lvuLjMAr_BE 00:09:24). Y-sorted container, tree (origin at
trunk base y 50), player in front (feet y 60), its 14x6 shadow reaching 12 px up over the trunk;
color read at the overlap.

```gdscript
var shadow := Sprite2D.new(); shadow.texture = shadow_tex; shadow.position = Vector2(0, -12)
shadow.z_index = -1; shadow.z_as_relative = false; player.add_child(shadow)
```

| Case                                                    | At the overlap               |
| ------------------------------------------------------- | ---------------------------- |
| Shadow as a plain child (same as baked into the sprite) | shadow over the tree (wrong) |
| `z_index -1`, `z_as_relative` false                     | tree over the shadow         |
| `z_index -1`, `z_as_relative` true, player z 0          | tree over the shadow         |
| player `z_index 1`, shadow -1 relative (sum 0)          | shadow over the tree (wrong) |
| player `z_index 1`, shadow -1 absolute                  | tree over the shadow         |

So `z_index -1` alone is enough while the character stays at z 0; `z_as_relative = false` keeps it
right once the character gets its own z (jump, flying layer). DevWorm's recipe (both) is the safe
default.

**R7. Jump cut minimum height.** No new run: the section 5 one-tick tap (cut 0.4, take-off 327.6
px/s, g up 914.3) rose 12.79 px. The formula (cut·v)² / 2g gives 9.4 px for the cut alone; the tick
before the release adds the rest. Compute it before choosing a cut factor: 0.4 gives under one 16 px
tile.

## Not yet run

- Real Scenario sprite or tileset generation (team and project choice needed; see 10).
- Cutting tile navigation under an obstacle layer with `_tile_data_runtime_update` (Coding Quests,
  7ZAF_fn3VOc 00:10:34): navigation belongs to scenario-godot-gameplay; ClassDB does not list the
  virtual methods, so only a runtime test would prove it.
- Normal and specular maps on CanvasTexture, light `height` (suzF2Y166eA 00:23:13): not measured.
- Exclusive Fullscreen vs Fullscreen on a real display: the factor loss from a 1 px strip is
  measured (R1), the OS strip itself is not.
