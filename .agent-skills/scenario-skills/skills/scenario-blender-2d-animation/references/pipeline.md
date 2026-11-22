# Pipeline: the decisions that mattered

The reference shot is a 7.7-second side-scroller take: a hero runs right, jumps onto a floating
island for three coins, drops back down, runs under a tree that drops its fruit, and jumps into a
stacked tower that collapses with real physics. It exists in three looks (jungle, Halloween street,
snow valley) built by one script.

## Flat cards in depth, one orthographic camera

Every image is a flat plane in Blender's XZ plane, facing the camera (emission shader mixed with a
transparent BSDF through the image's alpha, blended render method, so nothing is lit or shaded
twice). The camera is orthographic (`ortho_scale` 16 for a 16 m wide view), looking along +Y, and
follows the hero with a little lag:

| Layer                                      | Depth (Y) | Follows the camera by  | What it means                                   |
| ------------------------------------------ | --------- | ---------------------- | ----------------------------------------------- |
| Sky                                        | 60        | 0.97                   | almost glued to the camera: infinitely far      |
| Far layer                                  | 50        | 0.85                   | tiled; slides slowly                            |
| Mid layer                                  | 40        | 0.6                    | tiled                                           |
| Ground                                     | 8         | 0 (fixed in the world) | tiled; the walkable line                        |
| Tree, island, pedestal, coins, hero, props | 0 to 9    | 0                      | the action plane                                |
| Foreground                                 | -10       | -0.45                  | moves against the camera: faster than the world |

With an orthographic camera depth alone never moves a layer: the parallax comes from a driver on
each layer's X location (`c * k`, where `c` is the camera's X). The Y depths only set the draw order
and look right when the scene is orbited for a breakdown.

## The numbers that change per look

Everything in `build_scene.py` is shared except the pictures and a short `config.json` (see
[examples/config.json](../examples/config.json)). Any key it leaves out keeps the script's default:

| Key                                                                            | Meaning                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tag`                                                                          | suffix of the output files (`_snow` gives `platformer_scene_snow.blend`)                                                                                                                                                  |
| `sea_h`, `sea_horizon`, `sea_base_z`                                           | far layer height in m, its horizon row as a share from the top, where the horizon sits                                                                                                                                    |
| `jungle_h`, `jungle_z0`                                                        | mid layer height in m and its bottom                                                                                                                                                                                      |
| `ground_h`, `ground_top`                                                       | ground strip height in m, and its walkable line as a share from the top                                                                                                                                                   |
| `island_top_px`, `pedestal_top_px`                                             | pixel row of the walkable top in the island and pedestal sprites                                                                                                                                                          |
| `palm_h`, `nuts`, `nut_size`                                                   | tree height, where each fruit hangs (x from the tree's center, z as a height in the scene), fruit size                                                                                                                    |
| `hero_h`, `run_fig_px`, `run_pad_px`, `run_canvas_px`, `jump_base_px`, `run_n` | hero height in m, the figure's height and the empty rows under the feet in the run frames, the clip's height (it sets the jump still's scale against the run frames), the feet row of the jump still, the run frame count |

`ground_top` deserves care: putting the feet exactly on the grass tips makes the hero float. Set it
so the feet sink about 10 cm into the lip.

## Hero: an image sequence and one still

The run is an image sequence on one plane (`hero_run/run_001.png` and on, cyclic, `run_n` frames).
Blender reports 0 x 0 for a sequence until it plays, so the script measures the first frame. In the
air the plane swaps to the jump still. Squash and stretch are three keyed scales per jump
(anticipation, launch, landing). A soft blob shadow follows the hero and shrinks with height.

The hero's speed (0.2 m per frame) is matched to the run cycle's stride, so the feet do not slide.

## Physics in a picture plane

- Every prop is a rigid body whose collision shape is its sprite's own outline: a convex hull traced
  from the alpha (`shapes.json`, normalized 0 to 1 per sprite), extruded through the plane, with the
  origin at the hull's centroid and the mass from its area, so a round pot rolls like a round pot.
- Two frictionless invisible walls per lane keep bodies in the picture plane (Blender has no 2D
  lock).
- The tower starts deactivated, so it stands until touched. The fruit are kinematic in the tree
  crown and released one by one when the hero passes.
- The hero's collider is a kinematic sphere that lives outside the props lane and slides in sideways
  just before the tower jump, then out once nothing is within reach. A collider that teleports into
  place flings pieces.
- `transform_apply` on collision meshes moved origins in the reference shot; build hull meshes
  directly at their centroid instead.
- The simulation is baked and saved with the file, so any frame can be opened or rendered out of
  order.

## A new look

1. A new concept frame, the same eight pictures with it as the reference, and a run clip from the
   new rest pose ([prompts.md](prompts.md)).
2. Process into `SET_DIR/game/` with the same file names.
3. Measure the per-look numbers into `SET_DIR/game/config.json`.
4. `build_scene.py -- --set SET_DIR --review`, check, then `--final`.

Nothing in the animation, camera or physics changes, so two looks line up frame for frame and can be
compared with a split screen.
