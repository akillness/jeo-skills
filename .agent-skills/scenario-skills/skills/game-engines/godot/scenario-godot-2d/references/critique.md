# scenario-godot-2d: self-critique rubric

Score each line pass or fail before calling a 2D task done. A fail on a "must" line means the work
is not done. Every "must" has a measurement from procedures.md behind it.

## Project and import (must)

- [ ] project.godot read back after writing: base size, stretch mode, aspect, scale_mode `integer`
      for pixel art, default texture filter, physics ticks, `physics/common/physics_interpolation`.
      Proof: `stretch_matrix.gd` reports what the root Window picked up, not what the file says.
- [ ] Integer factor and bars listed for the target windows (`gd_2d.integer_scales`), including the
      smallest, 3840x2160, and a phone portrait size if mobile is in scope. Base 640x360 unless the
      art is native 320x180; fullscreen ships as Exclusive Fullscreen
      (`display/window/size/mode=4`), since 1 px less costs one factor (R1).
- [ ] `gd_2d.audit_imports(P)` clean: Lossless, no mipmaps, `fix_alpha_border` on; for pixel art
      `detect_3d/compress_to = 0`. Any texture loaded at runtime from a file goes through
      `fix_alpha_edges()`.
- [ ] After any `.import` edit, the `.ctex` changed (size or time). An edit Godot did not see is the
      most common silent failure.

## Generated art (must, when art comes from scenario-* skills)

- [ ] `detect_pixel_scale` and `pixel_grid_check` run on every AI pixel-art image: scale known,
      phase known, uniform fraction near 1.0, else `snap_to_grid` before import.
- [ ] Every clip registered on its `ground` line; the lowest ink pixel of each clip lands at the
      same world y (measured: -1 for every clip).
- [ ] Fringe check with `key_fringe` on a capture over a neutral background at a non-integer scale
      (0.7, not 0.75 on 4x art): 0 tinted pixels.

## Tiles (must)

- [ ] TileSet saved as an external `.tres`; tile size set first; fully transparent atlas cells
      skipped.
- [ ] Terrain mode matches the tile count: 47 tiles = Match Corners and Sides; 16 sides-only tiles =
      Match Sides. `terrain_tools.audit_layer` reports 0 side and 0 corner mismatches.
- [ ] A capture of a sampler (ring, cross, single cells, inner corners) looked at on a contact
      sheet. Index checks pass on wrong art.
- [ ] Solid tiles have collision; one-way tiles proven by a body passing from below and landing on
      top.
- [ ] Animated tiles have free cells for their frames (`has_room_for_tile` true; R4). Terrains
      painted from the land side.
- [ ] Every CollisionObject2D has one named layer bit (`layer_names/2d_physics/layer_N`), masks as
      needed (R3).

## Controllers (must)

- [ ] Physics tests under `--fixed-fps 60`, one move per `await body.stepped`.
- [ ] Jump cut factor checked against its minimum height (one-tick tap measured, or (cut·v)²/2g;
      R7).
- [ ] Platformer: apex within 0.5 px of the design height; coyote and buffer counted in moves (6 and
      5 at 0.1 s and 60 ticks with the kit's rules); variable height (tap well under full); largest
      gap cleared stated in tiles; no snag running across tile seams (0 slow moves, 0 wall
      contacts).
- [ ] Top-down: stops at exactly 0 with no sign flip; diagonal speed equals straight speed; FLOATING
      mode.

## Camera and motion (must)

- [ ] Camera y unchanged during a jump in place (platformer), re-baselined after landing; a long
      fall keeps the player inside the screen (band + one tick).
- [ ] Limits from the TileMapLayer used rect; screen center clamped at the map edge.
- [ ] Shake has an off switch and decays to 0. Zoom only through `Camera2D.zoom`; `process_callback`
      Physics when interpolation is off.
- [ ] Jitter decision recorded: physics interpolation on (measured floor 0.289 px RMS at 144 Hz), or
      the reason it is off (networked game). Never Idle smoothing on a physics-moved target with
      interpolation off.
- [ ] Pixel-locked smooth camera, if used: background steps of 1 screen px at the target scale,
      measured from frames.

## Lights, sorting, parallax (must when present)

- [ ] CanvasModulate present; every PointLight2D has a texture; shadow lights have occluders.
- [ ] Owners of occluders that should be lit are lit: luma measured against a no-occluder control;
      cull mode chosen by measurement (screen winding decides).
- [ ] Pixel art: light falloff blockiness matches the art (viewport stretch or SubViewport world);
      the snap shader alone only steps shadow edges.
- [ ] Y-sort: container not root, origins at feet, tall tiles with `y_sort_origin`; overlap test
      both ways (behind and in front). Ground shadows are separate sprites (`z_index -1`,
      `z_as_relative` false), not baked into the character (R6).
- [ ] Pixel-art light bands, if wanted, come from a CONSTANT gradient (R5); `shadow_filter` None.
- [ ] Parallax: shift per scroll_scale measured; no gap at the lowest zoom the game uses; no seam
      over 90 autoscroll frames.

## Hygiene (must)

- [ ] `audit_2d.gd:scenes` with no warn findings on shipped scenes.
- [ ] Every script compiles (`check_all` plus `kit_compile.gd` for the kit).
- [ ] No deprecated nodes: TileMap, ParallaxBackground, ParallaxLayer.

## Judgment (should)

- [ ] Stretch mode chosen for a reason: `viewport` (locked grid, pixelated light and rotation) or
      `canvas_items` (smooth rotation, sub-pixel motion), and the reason stated.
- [ ] Numbers in a Resource (`platformer_tuning.gd`), not scattered constants, so tests and game
      read the same values.
- [ ] Feel numbers reported with their frame of reference: px, px/s, ticks at 60, tiles of N px.
- [ ] Anything not measured is called "not yet run", with the reason.
