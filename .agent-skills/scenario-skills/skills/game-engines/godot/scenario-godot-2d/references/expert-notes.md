# scenario-godot-2d: expert notes (principles and judgment, attributed)

Format: claim (source, timestamp). "Live:" lines say what the Godot 4.7.2 tests of 2026-10-02 showed
(see procedures.md). [added] marks this skill's own additions. Sources and credentials: sources.md.

## Controllers and feel

**The Shaggy Dev, "5 tips for better platformer controls" (Bsy8pknHc0M)**

- Never a rigid body for the player: the friction that makes ground movement good makes it stick to
  walls in a jump (00:00:00).
- Forgive in time and space: jump buffer while falling (00:01:04), coyote time from the moment the
  fall starts (00:01:37), ledge push-off from upward rays on each side of the head (00:02:10).
  Window length is a difficulty knob (00:02:10).
- Custom jump: heavier fall gravity, variable height; cutting velocity by a percentage on release
  gives a smoother arc than zeroing it (00:03:41, 00:04:13).
- Solve gravity and take-off speed from max height and time to apex; make the height a multiple of
  the tile size so gaps are designed (00:04:13).
- Live: the formulas give 56 px on paper and 53.5 px in Godot, because `move_and_slide` integrates
  semi-implicitly; adding g·dt/2 to the take-off speed lands 56.25 px [added]. Corner correction
  turned a 34 px clipped jump into the full 56 px. A 56 px jump at 120 px/s clears 4 tiles of 16 px,
  not 5.

**BT Plays Games, "Designing Better 2D Top-Down Movement" (m71-kZgYXlw)**

- Unbounded additive acceleration needs `limit_length`; subtracting decel from the vector length
  goes negative, flips the vector and vibrates around zero; use `move_toward` (00:07:30 to
  00:09:31).
- Steering (`velocity += (target - velocity) * k`) never reaches the target; enforce a minimum step
  (00:14:08). Tune by feel (00:10:06).
- Live: the subtract version flipped sign 55 times in 60 ticks; `move_toward` stopped at exactly 0;
  steering without a minimum step was still 119.999 px/s after 53 ticks and never reached 0.

**Godot docs, "Using CharacterBody2D"**

- The body is code-driven; move it only in `_physics_process`; `move_and_slide` rewrites `velocity`.
  In FLOATING mode every collision is a wall, so floor helpers do not apply; GROUNDED for side
  views, FLOATING for top-down.
- Live: pushing diagonally into a wall, FLOATING slid 55 px in 30 ticks keeping its speed, GROUNDED
  34.5 px.

**Godotneers (CreugthdgJ0, automation-pipeline-tests notes) and Chris' Tutorials (43c-Sm5GMbc)**

- Split brain and body: the body reads an intent, so input, AI and tests drive the same code
  (Godotneers 00:18:14). Replace `ui_*` actions with your own (43c-Sm5GMbc 00:20:34). Hair is not
  collidable: keep the shape on the body (00:14:13).

**Stephan Bogner, GodotCon 2024 "Making physics fun" (HFBNd4Z4vXM)**

- Use RigidBody2D only when the world must push back (pushables, soft bodies), moving it in
  `_integrate_forces` (00:04:25, 00:05:31).
- One collision layer per object, many masks; name layers by what the checker needs ("bombable");
  layer and mask on the same object works by accident (00:10:58 to 00:14:17).
- Live: a new body has layer 1 and mask 1; setting layer 2 without clearing 1 gave 2 bits, so clear
  first (`collision_layer = 0`).

## Camera

**Mark Brown, Game Maker's Toolkit "How to Make a Good 2D Camera" (TdWFzpgnljs)**

- A camera pinned to the character is jittery, jumpy, short-sighted and static (00:00:00). Ask what
  the player needs to see (00:02:35).
- Lookahead by facing with a glide between sides, or scaled by speed (00:00:26 to 00:02:35). Ignore
  jumps and set a new baseline on landing; treat axes separately; place the hero lower (00:03:06 to
  00:05:06).
- Damping hides small shifts, but lag leaves the character ahead of the camera and eats lookahead
  room (00:05:06). Shake along the action's direction, hit stop, and an option to turn shake off
  (00:08:16 to 00:09:51).
- Live: with 32 px lookahead and damping 8 at 120 px/s, the real lead was 16 px; a 48 px fall band
  plus damping lag let a falling player reach 100 px below center, off a 180 px screen, until the
  script clamped the band (55 px measured).

**DevWorm, "Everything to Know about the CAMERA2D" (RlSpjIb7TLo)**

- Smoothing speed about 3 felt right; default 5; 1 sluggish, 10 like none (00:20:33).
- Live: zoom 2 gave canvas scale 2.0; with physics interpolation on the change eases over one tick
  (1.40, 1.81, 2.0 on successive frames). Zoom with `zoom`, never by resizing the viewport
  (00:08:14). Limits keep the void off screen (00:20:01).
- Deltas file: Camera2D zoom is inverted from Godot 3 (2 zooms in); `current` and
  `smoothing_enabled` are gone.

**Chris' Tutorials (43c-Sm5GMbc 00:28:37)**

- Smoothing jitters because Camera2D processes in Idle while the player moves in physics; set the
  callback to Physics.
- Live: default is Idle (1). At 144 Hz with interpolation off, Idle smoothing made the player wobble
  over 3 screen px; with physics interpolation on, every camera setup was at the quantization floor
  (0.289 px RMS) and Godot forced Camera2D to Physics itself.

**Godot docs, "Physics interpolation"**

- Physics ticks and frames do not line up, which gives staircase jitter; interpolation renders 1 to
  2 ticks in the past. Wrong tool for networked games with their own interpolation.
- Live: interpolation off at 144 Hz: background steps of 0, 1 and 2 px (0.55 px RMS); on: 0 and 1 px
  (0.289).

## Pixel-perfect rendering

**Heartbeast, "Pixel Art Settings in Godot 4" (15t2Y0kXd6E)**

- Small base viewport (320x180 or 640x360), window override 4x, default filter Nearest in Project
  Settings (00:01:09 to 00:03:30).
- He prefers `canvas_items` (clean rotation at full resolution); `viewport` is the purist look
  (00:05:30).

**Godot docs, "Multiple resolutions"**

- Pixel art: `viewport` + integer scale. 640x360 integer-scales to 720p, 1080p, 1440p and 4K with no
  bars. Exclusive Fullscreen, not Fullscreen, or the 1 px strip can lower the integer factor. A
  square base plus sensor orientation serves portrait and landscape.
- Live: 320x180 integer gave 4x at 1366x768 with 43 and 24 px bars, 6x at 1080p, 8x at 1440p, 12x at
  4K, 3x on a 1170x2532 phone. 640x360 gave 2x, 2x (bars 43, 24), 3x, 4x, 6x: both bases fit every
  16:9 target. One missing pixel row (3840x2159) dropped 640x360 to 5x and 320x180 to 11x, the strip
  Exclusive Fullscreen avoids.

**Barry's Dev Hell, "Smooth Pixel Art Camera" (DwVPFbDoyoc)**

- In an upscaled low-res game a smoothed camera snaps to whole pixels; keep the camera on whole
  pixels and move the upscaled image by the remainder (00:03:55). Render 2 extra pixels and offset
  the container by minus the scale so edges stay filled (00:05:10).
- Live: steps of 1 screen px instead of 4 at 4x. With physics interpolation on, a Camera2D in the
  SubViewport broke the method (camera at 60 Hz, shift at 144 Hz); setting the SubViewport
  `canvas_transform` instead fixed it [added].

## Tiles

**Godot docs, "Using TileSets" and "Using TileMaps"**

- Set tile size before creating atlas tiles. Save the TileSet externally. One TileMapLayer per
  layer. Scene tiles instance one scene per cell: keep them for gameplay objects. Built-in tile
  navigation is weak: bake to NavigationRegion2D. Terrain Path mode for roads that touch without
  connecting.

**bluuDevGames, "TileMapLayer Terrains" (CLcFC6ku240) and DevWorm, "In Depth TileMap"
(ZutpG0_CYrQ)**

- Paint the outer ring of bits first, then the center cross; families (flat, walls, stairs) are
  terrains of one set, elevation is another layer (CLcFC6ku240 00:12:28, 00:16:51). Paint the land,
  never the water side (ZutpG0_CYrQ 00:32:47). Tile animation needs neighboring auto-tiles erased
  first (00:24:13).
- Live: with a tile at (1, 0), a 2-frame animation on (0, 0) was refused ("tiles are already
  present") and kept 1 frame; after removing (1, 0) it took 2.
- Live: a 16-tile (sides only) set is correct only in Match Sides; in Match Corners and Sides it
  produced 32 side and 10 corner mismatches. The frames of CLcFC6ku240 show "Match Co..." on a
  16-tile set: check the mode against the tile count.

**jess::codes, "Draw fewer tiles with a Dual-Grid" (jEWFSv3ivTg)**

- The world grid stores data and draws nothing; a display grid offset by half a tile picks one of 16
  tiles from the 4 world cells it overlaps; display-to-world uses the negated offsets (00:02:26,
  00:04:06). Choose it when corners must look equally rounded or edges are animated.
- Live: 164 display cells for 91 world cells, 0 index errors. An index check cannot see wrong art:
  the first placeholder atlas passed it with inverted corner quarters, caught only by looking at the
  capture.

## Y-sort

**DevWorm, "A Complete Guide to Y-SORTING in Godot 4.3+" (lvuLjMAr_BE)**

- Y-sort a dedicated container, never the world root (00:07:09). Move the art with `offset` so the
  origin is at the feet or trunk (00:13:41). Tall tiles: Texture Origin and Y Sort Origin per tile;
  only Y matters (00:22:14 to 00:26:04). Baked shadows overlap the player: separate shadow sprite
  with `z_as_relative = false` and a low `z_index` (00:09:24).
- Live (shadow): a baked or plain-child shadow drew over the trunk of a tree behind; `z_index -1`
  put it under the tree; `z_as_relative = false` was needed once the player had `z_index 1`.
- Live: origin at the trunk base sorted both ways correctly; centered origin and a tall tile without
  `y_sort_origin` drew the player in front even when it stood behind.

## Lights

**Cashew OldDew, "Master 2D Light Systems" (suzF2Y166eA)**

- CanvasModulate first; PointLight2D with a radial GradientTexture2D; masks and Z ranges (00:03:18).
  Occluder cull mode decides whether the owner is lit (00:13:09 to 00:19:03). Shadow item cull mask
  was broken in 4.3, fixed in 4.4 (00:19:35). Specular needs shininess below 1; light height changes
  normal-map self-shadowing (00:23:13, 00:28:24). One occluder polygon per tile per occlusion layer
  (00:12:22).
- Live: cull mode works, but "Clockwise for clockwise-drawn" is backwards in screen coordinates: a
  polygon clockwise on screen (y down) was lit with Counter Clockwise; alpha outlines came out
  counter-clockwise and need Clockwise. Two occluder polygons on one occlusion layer of one tile
  work in 4.7.2 (count 2, saved and reloaded).

**Godot docs, "2D lights and shadows"**

- Without CanvasModulate lights only brighten. Lights and shadows render at viewport resolution;
  Nearest filtering will not pixelate them; snap `LIGHT_VERTEX` and `SHADOW_VERTEX` in a shader.
  Shadow filter None for pixel art (the 4.7.2 default, 0). Additive sprites are cheaper but cannot
  light dark areas or cast shadows.
- Live: the snap shader stepped shadow edges but not the point light falloff; `viewport` stretch
  pixelates both. A CONSTANT gradient on the light texture gave 4 luma bands where LINEAR gave 64
  levels [added].

## Parallax

**Michael Games, "Godot 4.3 Parallax2D Node" (ge1QiDmwS4k)**

- scroll_scale 0 for the sky, 0.1 to 0.9 receding, above 1 foreground; unlink Y when vertical drift
  is unwanted; `repeat_size.x` = texture width and enough `repeat_times` while autoscroll runs
  (00:04:45, 00:06:35, 00:08:17).
- Live: screen shift matched scroll_scale exactly; zooming out to 0.5 needed 3 repeats and 0.25
  needed 5 for a plane as wide as the view.

## Sprite import [added, from the scenario-* skills and live tests]

- scenario-sprite-pipeline: clips carry `frames`, `w`, `h`, `ground` (frame 0's ink bottom);
  register every clip on that feet line; keyed sprites keep the key RGB in transparent pixels.
- Live: Godot's default texture import (`fix_alpha_border` on, Lossless, no mipmaps) removes the key
  color at the edge; a runtime `Image.load_from_file` keeps it and fringes under linear filtering
  until `fix_alpha_edges()` runs.
