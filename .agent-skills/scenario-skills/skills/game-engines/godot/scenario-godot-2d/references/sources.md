# scenario-godot-2d: sources

Notes for every source are in `notes/2d-gameplay/` (digests `_digest_videos_2d-gameplay.md`,
`_digest_docs_2d-gameplay.md`). Credentials are as stated in the notes; "unverified" means the
channel's claims were not checked. Version facts: `sources/godot-version-deltas.md`. Live evidence:
`tests/live_evidence/godot-2d/`.

## Videos

| Source                                          | Expert, credential                                                                   | URL                                         | Best for                                                    | Best timestamps                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| 5 tips for better platformer controls           | The Shaggy Dev, Godot educator (unverified); 2022                                    | https://www.youtube.com/watch?v=Bsy8pknHc0M | buffer, coyote, ledge push, jump math                       | 00:01:04, 00:01:37, 00:02:10, 00:04:13             |
| 2D Platformer Quick Start Guide                 | Chris' Tutorials, Godot educator (unverified); 4.0.1                                 | https://www.youtube.com/watch?v=43c-Sm5GMbc | scene setup order, camera Physics callback                  | 00:10:23, 00:20:34, 00:28:37                       |
| Top-Down Action Game Tutorial, Part 1           | Coding With Russ, Godot educator (unverified); 2025                                  | https://www.youtube.com/watch?v=NNnuXie3xVU | 8-direction body, `Input.get_vector`, 4-direction animation | 00:05:36, 00:15:25                                 |
| Designing Better 2D Top-Down Movement           | BT Plays Games, indie dev (unverified); 4.3                                          | https://www.youtube.com/watch?v=m71-kZgYXlw | acceleration bugs, steering minimum step                    | 00:07:30 to 00:09:31, 00:14:08                     |
| A Complete Guide to Y-SORTING in 4.3+           | DevWorm, Godot educator (unverified)                                                 | https://www.youtube.com/watch?v=lvuLjMAr_BE | container, feet origin, tile y_sort_origin, shadow sprite   | 00:07:09, 00:09:24, 00:13:41, 00:22:14             |
| In Depth TILEMAP Tutorial for 4.3+              | DevWorm (captions garbled)                                                           | https://www.youtube.com/watch?v=ZutpG0_CYrQ | multi-cell tiles, tile animation, terrain painting          | 00:08:47, 00:24:13, 00:32:47                       |
| Draw fewer tiles with a Dual-Grid               | jess::codes, indie dev (unverified); repo jess-hammer/dual-grid-tilemap-system-godot | https://www.youtube.com/watch?v=jEWFSv3ivTg | 16-tile dual grid and its offsets                           | 00:02:26, 00:04:06                                 |
| Godot 4.3 TileMapLayer Terrains                 | bluuDevGames, Spanish (captions translated)                                          | https://www.youtube.com/watch?v=CLcFC6ku240 | terrain bit painting order, layered terrain families        | 00:12:28, 00:16:51                                 |
| 2D TileMapLayer Navigation + Avoiding Obstacles | Coding Quests, Godot educator (unverified); 4.3                                      | https://www.youtube.com/watch?v=7ZAF_fn3VOc | cutting tile navigation under obstacles (not run here)      | 00:10:34 to 00:12:46                               |
| Everything to Know about the CAMERA2D           | DevWorm; 4.2 era                                                                     | https://www.youtube.com/watch?v=RlSpjIb7TLo | smoothing values, limits, drag                              | 00:08:14, 00:20:01, 00:20:33                       |
| How to Make a Good 2D Camera                    | Mark Brown, Game Maker's Toolkit (verified channel)                                  | https://www.youtube.com/watch?v=TdWFzpgnljs | camera behavior spec                                        | 00:00:26 to 00:09:51                               |
| Making physics fun (GodotCon 2024)              | Stephan Bogner, Super Pewter Games (Godot Engine channel)                            | https://www.youtube.com/watch?v=HFBNd4Z4vXM | RigidBody2D players, collision layer discipline             | 00:04:25, 00:10:58 to 00:14:17                     |
| Smooth Pixel Art Camera (4.4)                   | Barry's Dev Hell, indie dev (unverified)                                             | https://www.youtube.com/watch?v=DwVPFbDoyoc | sub-pixel camera over a low-res SubViewport                 | 00:03:10 to 00:05:44                               |
| Pixel Art Settings in Godot 4                   | Heartbeast (Benjamin Anderson), Godot educator (unverified); 4.4                     | https://www.youtube.com/watch?v=15t2Y0kXd6E | the four pixel-art settings, canvas_items vs viewport       | 00:01:09 to 00:06:38                               |
| Master 2D Light Systems                         | Cashew OldDew, Godot educator (unverified); 4.3 and 4.4                              | https://www.youtube.com/watch?v=suzF2Y166eA | CanvasModulate, occluders, cull modes, masks, normal maps   | 00:03:18, 00:12:22, 00:13:09 to 00:19:35, 00:23:13 |
| Godot 4.3 Parallax2D Node                       | Michael Games, Godot educator (unverified)                                           | https://www.youtube.com/watch?v=ge1QiDmwS4k | scroll_scale layering, repeat and autoscroll                | 00:04:45, 00:06:35, 00:08:17                       |
| Automated Testing With GdUnit4                  | Godotneers (notes in automation-pipeline-tests)                                      | https://www.youtube.com/watch?v=CreugthdgJ0 | separate body from brain                                    | 00:18:14                                           |

## Official documentation (retrieved 2026-10-02; copies in `sources/docs/2d-gameplay__*.md`)

| Page                                | URL                                                                                                            | Best for                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Using CharacterBody2D/3D            | https://docs.godotengine.org/en/stable/tutorials/physics/using_character_body_2d.html                          | move_and_slide vs move_and_collide, motion modes, defaults |
| Physics interpolation, introduction | https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/physics_interpolation_introduction.html | why jitter happens, when not to interpolate                |
| 2D lights and shadows               | https://docs.godotengine.org/en/stable/tutorials/2d/2d_lights_and_shadows.html                                 | nodes, occluders, light resolution, snap shader            |
| Multiple resolutions                | https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html                           | stretch recipes, integer scaling, fullscreen               |
| Using TileMaps                      | https://docs.godotengine.org/en/stable/tutorials/2d/using_tilemaps.html                                        | TileMapLayer, painting, terrains, navigation advice        |
| Using TileSets                      | https://docs.godotengine.org/en/stable/tutorials/2d/using_tilesets.html                                        | atlas, layers, terrains, alternatives, scene tiles         |

## Version facts

- `sources/godot-version-deltas.md`, section 6 (2D, TileMapLayer and 2D physics) and the rename
  tables: TileMapLayer 4.3, Parallax2D 4.3, Camera2D renames and inverted zoom, chunked tile physics
  4.5, one-way direction 4.7, 2D physics interpolation 4.3, stretch defaults of a hand-written
  project.godot.

## Sister skills

- scenario-sprite-pipeline (manifest contract: `frames`, `w`, `h`, `ground`; keyed sprites),
  scenario-game-assets, scenario-sprite-animation: where generated sprites and tilesets come from.
