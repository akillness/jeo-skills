# GUI paths (scenario-unity-2d)

Windows, menus and settings for the same procedures, for a human or a computer-use agent. Unity 6.3
(6000.3) labels; [verify] where a label comes from docs of another version and was not seen in this
editor.

## Project and settings

| Task                      | Path                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New 2D project            | Unity Hub > New project > Universal 2D (URP with the 2D Renderer, 2D packages, a Global Light 2D in the default scene)                                                                         |
| Sorting layers            | Edit > Project Settings > Tags and Layers > Sorting Layers (higher in the list = further back)                                                                                                 |
| Physics layers and matrix | Edit > Project Settings > Tags and Layers > Layers; Edit > Project Settings > Physics 2D > Layer Collision Matrix (Disable All, then enable pairs)                                             |
| Physics 2D settings       | Edit > Project Settings > Physics 2D (General Settings, Simulation Mode, Gizmos, Multithreading, Low Level tab for LowLevelPhysics2D)                                                          |
| Fixed timestep            | Edit > Project Settings > Time > Fixed Timestep (0.02 default)                                                                                                                                 |
| Input handling            | Edit > Project Settings > Player > Other Settings > Active Input Handling (templates: Input System Package)                                                                                    |
| Sprite Atlas mode         | Edit > Project Settings > Editor > Sprite Atlas > Mode ("Sprite Atlas V2 - Enabled" or "Enabled for Builds")                                                                                   |
| 2D Renderer settings      | select `Assets/Settings/Renderer2D.asset` > Transparency Sort Mode / Axis, Light Blend Styles, Light Render Textures (Render Scale, Max Light / Shadow Render Textures), Default Material Type |

## Sprites

| Task                           | Path                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import settings                | select the texture > Inspector: Texture Type Sprite (2D and UI), Sprite Mode Single/Multiple, Pixels Per Unit, Mesh Type, Filter Mode, Compression, Max Size > Apply |
| Slice a sheet                  | Inspector > Open Sprite Editor > Slice > Grid By Cell Size (e.g. 16 x 16) > Slice > Apply                                                                            |
| Pixel pivots                   | Sprite Editor > select sprite > Sprite overlay: Pivot Custom, Pivot Unit Mode Pixels                                                                                 |
| Secondary textures             | Sprite Editor > module dropdown > Secondary Textures > + > name from the dropdown (`_NormalMap`, `_MaskTex`) > texture > Apply                                       |
| Custom outline / physics shape | Sprite Editor > Custom Outline / Custom Physics Shape (16 px sprites otherwise get a rectangle)                                                                      |
| Normal map from a heightmap    | select texture > Texture Type Normal map > Create from Grayscale, Bumpiness, Filtering Smooth                                                                        |

## Atlases

| Task                | Path                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create              | Project window > Create > 2D > Sprite Atlas; lock the Inspector; Objects for Packing > + ; Pack Preview                                                    |
| Settings            | atlas Inspector: Type Master/Variant, Include in Build, Allow Rotation, Tight Packing, Padding, Filter Mode, platform tabs (Max Size, Format, Compression) |
| Analyzer            | Window > Analysis > Sprite Atlas Analyzer > Analyze (2D Tooling package, in the 6.3 Universal 2D template)                                                 |
| Batches and SetPass | Game view > Stats; Window > Analysis > Frame Debugger ("SRP Batch" events); Window > Analysis > Profiler > Rendering                                       |

## Tilemaps

| Task                                 | Path                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create                               | GameObject > 2D Object > Tilemap > Rectangular (Isometric, Hexagonal variants)                                                                                            |
| Palette                              | Window > 2D > Tile Palette > Create New Palette; drag sprites in (saves Tile assets); Active Tilemap dropdown                                                             |
| Painting tools                       | S select, M move, B brush, U box fill, I picker, D eraser, G flood fill, [ ] rotate, Shift+[ ] flip                                                                       |
| Rule Tile                            | Create > 2D > Tiles > Rule Tile; Tiling Rules +; click the 3 x 3 grid (green arrow This, red cross NotThis); Output, Collider, Rule transform                             |
| Rule Override / Auto / Animated Tile | Create > 2D > Tiles > Rule Override Tile (Tile = source rule tile, fill Override Sprite column) / Auto Tile (Mask_2x2 or Mask_3x3, paint red masks) / Animated Tile       |
| Rule Tile Template                   | Rule Tile inspector > More menu > Create Rule Tile Template (reuse the rules with another sheet of the same layout)                                                       |
| Collision                            | Tilemap: Add Component Tilemap Collider 2D (Composite Operation Merge, Use Delaunay Mesh) + Composite Collider 2D (Geometry Type Outlines); Rigidbody 2D Body Type Static |
| One-way platform                     | platform collider: Used By Effector on; Add Component > Physics 2D > Platform Effector 2D: Use One Way, Surface Arc 180, Use Side Friction off, Use Side Bounce off       |
| Hazard hitbox                        | spike object: Box Collider 2D Is Trigger, Edit Collider smaller than the sprite (or `Hazard2D` > context Reset fits it)                                                   |

## Lights

| Task           | Path                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add lights     | GameObject > Light > Global Light 2D / Spot Light 2D / Freeform Light 2D / Sprite Light 2D ("Spot" is `Light2D.LightType.Point` in code)                                                          |
| Per light      | Light 2D Inspector: Color, Intensity, Radius/Angles, Falloff, Target Sorting Layers, Blending (Blend Style, Light Order, Overlap Operation), Shadows, Volumetric, Normal Maps (Quality, Distance) |
| Shadow casters | Add Component > Rendering > 2D > Shadow Caster 2D (casting source defaults to the renderer outline in Unity 6; Casting Option)                                                                    |
| Batching       | Window > 2D > Light Batching Debugger (menu item seen in URP 17.3 source; batches per sorting-layer range, and which lights or casters split them)                                                |
| Cost           | Rendering Debugger (Window > Analysis > Rendering Debugger) Overdraw for sprites and tilemaps (e-book p. 136); Profiler Rendering module; test on the lowest target device                        |

## Camera

| Task                        | Path                                                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pixel Perfect Camera        | Main Camera > Add Component > Rendering > 2D > Pixel Perfect Camera: Asset Pixels Per Unit, Reference Resolution, Crop Frame, Grid Snapping, Filter Mode, Run In Edit Mode; never install the "2D Pixel Perfect" package in URP                                                                 |
| Editor grid                 | Scene view > Grid and Snap overlay > Grid Size = 1 / Assets PPU, Grid Snapping on                                                                                                                                                                                                               |
| Cinemachine 3               | Package Manager > add by name `com.unity.cinemachine` version 3.1.7 (the 6000.3.21f1 default is 2.10.7); GameObject > Cinemachine > Cinemachine Camera; add Position Composer, Cinemachine Confiner 2D (Bounding Shape 2D = trigger Composite Collider 2D), Cinemachine Pixel Perfect extension |
| Fall damping and room swaps | CinemachineCamera > Add Component > Cinemachine Fall Damping (AgentKit); door: Box Collider 2D Is Trigger + Cinemachine Room Swap (First Room, Second Room); CinemachineBrain Default Blend (Ease In Out 2 s by default, Sasquatch [00:17:58])                                                  |

## Animation

| Task          | Path                                                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clips         | select the character > Window > Animation > Animation > Create; drag sprites into the timeline; Samples (enable Show Sample Rate in the window menu if hidden)                                        |
| State machine | Window > Animation > Animator: right-click state > Make Transition; Parameters tab; transition Inspector: Has Exit Time off, Settings > Transition Duration 0, Can Transition To Self (Any State) off |
| Rigging       | PSB > Sprite Editor > Skinning Editor: Create Bone, Auto Geometry (sliders 0, Weights on), Bone Influence, Weight Brush; Copy / Paste for skins                                                       |
| IK            | root > Add Component IK Manager 2D > + Limb solver > Effector > Create Target (Flip if the limb bends the wrong way)                                                                                  |
| Sprite swap   | Create > 2D > Sprite Library Asset; Sprite Library + Sprite Resolver components; Scene view Sprite Swap overlay                                                                                       |

## Tests

| Task                        | Path                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Run the PlayMode feel tests | Window > General > Test Runner > PlayMode > Run All (the agent runs `ut_run.run_tests(P, "PlayMode", graphics=True)`)              |
| Frame timings               | Window > Analysis > Profiler (CPU, Rendering, Memory modules) in Play mode; the agent runs `AgentKit.AgentProfile.PlayModeTimings` |
