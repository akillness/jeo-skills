# GUI paths (Unity 6.3, for a computer-use agent or a human)

The same procedures through windows and menus. Sculpting, painting and foliage brushes are GUI-only
work: the scripted route is `TerrainData` (see `procedures.md`). Paths checked against the 6.3
Manual and package docs in `notes/world-3d/`; items marked [verify] were not clicked on this Mac (no
GUI session during the tests).

## Terrain

| Task                          | Path                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create a tile                 | GameObject > 3D Object > Terrain (creates the Terrain GameObject and a TerrainData asset)                                                                                                                                                                                                             |
| size and resolutions (first!) | select Terrain > Inspector > Terrain Settings (gear) > Mesh Resolution: Terrain Width, Length, Height; Texture Resolutions: Heightmap Resolution (2^n+1), Control Texture Resolution, Base Texture Resolution; Detail Resolution Per Patch (16), Detail Resolution                                    |
| import a heightmap            | Terrain Settings > Texture Resolutions (On Terrain Data) > Import Raw: Depth Bit 16, Resolution, Byte Order (Windows = little-endian), Flip Vertically, Terrain Size                                                                                                                                  |
| batch settings, multi-tile    | Window > Terrain > Terrain Toolbox (Create New Terrain, Terrain Settings, Terrain Utilities; splat and heightmap import/export)                                                                                                                                                                       |
| sculpt                        | Scene view Terrain Toolbar overlay > Sculpt Mode (Raise or Lower, Set Height, Smooth, Stamp, Noise, Erosion > Hydraulic/Thermal/Wind with Terrain Tools); macro forms with a huge weak brush, details small (smnLYvF40s4)                                                                             |
| paint layers                  | Terrain Toolbar > Materials Mode > Paint Texture; Terrain Layers list > Add Layer (palette order fixed before painting); Brush Masks overlay: + to add Height, Slope, Aspect, Concavity, Layer filters (layer painting only)                                                                          |
| trees                         | Terrain Toolbar > Foliage Mode > Paint Trees > Edit Trees > Add Tree (prefab, Height and Width random ranges, Lock Width to Height, Color Variation); Mass Place Trees (untick Keep Existing Trees = wipes the tile)                                                                                  |
| details                       | Foliage Mode > Paint Details > Edit Details > Add Detail Mesh (Use GPU Instancing on, distinct Noise Seed) or Add Grass Texture (dense fields only)                                                                                                                                                   |
| neighbors                     | Terrain Settings > Basic Settings: Grouping ID, Auto Connect, Reconnect; Terrain Toolbar > Neighbor Terrains Mode                                                                                                                                                                                     |
| distances and cost            | Terrain Settings > Basic Terrain: Pixel Error, Base Map Dist., Draw Instanced; Tree and Detail Objects: Detail Distance, Detail Density Scale, Tree Distance, Billboard Start, Fade Length, Max Mesh Trees (ignored by SpeedTree and, observed, by LOD Group trees: edit the tree prefab's LOD Group) |
| global overrides              | Edit > Project Settings > Quality > Terrain Setting Overrides; tile opt-out: Ignore Quality Settings                                                                                                                                                                                                  |
| shortcuts                     | , and . brushes; < and > objects; [ and ] size; - and = opacity (Unity > Shortcuts, category Terrain on macOS) [verify]                                                                                                                                                                               |

## ProBuilder 6.1.2 (no ProBuilder window since 6.0)

| Task                | Path                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| install             | Window > Package Manager > Unity Registry > ProBuilder 6.1.2 (URP needs no support sample in 6.x: the default material is a Shader Graph)                                                                                                                          |
| tool context        | Scene view Tools overlay > Active Context: ProBuilder                                                                                                                                                                                                              |
| new shape           | Tools overlay > New Shape (short click: last shape; long click: menu Cube, Plane, Stairs, Door, Arch, Prism...); type sizes in Shape Settings before drawing; Pivot: Center or First Corner [verify label; the API enum is `FirstVertex`]                          |
| irregular footprint | Tools overlay > New PolyShape; click points, close on the first, set Extrusion. Re-entering the PolyShape (or shape) tool rebuilds the mesh and discards every later extrusion and cut: lock the footprint before detailing (observed in code: 12 faces back to 7) |
| snapping            | Grid and Snap overlay: Grid Snapping on, Increment 1 m; Tool Settings > Handle Rotation Global; hold Cmd while drawing                                                                                                                                             |
| openings            | Face mode, select front and back faces > Inset, Delete; or Insert Edge Loop twice, delete, Bridge Edges, Weld Vertices (0.01)                                                                                                                                      |
| extrude             | Face mode > Shift + move; Edge mode > Bridge                                                                                                                                                                                                                       |
| lightmap UVs        | Tools > ProBuilder > Actions > Lightmap UVs (fills missing UV2 in all open scenes); per-object on the ProBuilderMesh component                                                                                                                                     |
| vertex color legend | Tools > ProBuilder > Editors > Open Vertex Color Editor [verify menu name]                                                                                                                                                                                         |
| export to art       | Scene view context menu > ProBuilderMesh > Export (OBJ, STL, PLY, Asset); GameObject > Export To FBX with the FBX Exporter                                                                                                                                         |
| graybox plan        | Quad (GameObject > 3D Object > Quad), Rotation X 90, Scale 100 x 100 x 1, Position Z 50, URP Lit material with the plan image (YsBniZ5ya7k)                                                                                                                        |

## Modular kit and prefabs

| Task                   | Path                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| replace pieces in bulk | select instances in the Hierarchy, drag the new prefab onto one with Ctrl (Cmd on macOS [verify]) > Replace; or right-click > Prefab > Replace [verify in 6.3] |
| variant                | Project window: right-click a prefab > Create > Prefab Variant                                                                                                 |
| default parent         | Hierarchy right-click a container > Set as Default Parent (clear it after)                                                                                     |
| lock and hide          | Hierarchy pickability (hand) and visibility (eye) toggles                                                                                                      |
| clutter                | place by hand from several viewpoints; the scripted raycast scatter replaces Polybrush (deprecated, Tools > Polybrush only if installed by name)               |

## Roads and splines

| Task                 | Path                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| draw a spline        | GameObject > Spline > Draw Splines Tool; Spline tool context to move knots and tangents                                                                                                   |
| scatter along        | Add Component > Spline Instantiate (trees, lamps, fences)                                                                                                                                 |
| decals on roads only | URP Renderer asset > Add Renderer Feature > Decal (Use Rendering Layers on); Project Settings > Tags and Layers > Rendering Layers; road MeshRenderer and Decal Projector share the layer |

## Navigation, lighting check

| Task                  | Path                                                                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bake NavMesh          | GameObject with NavMesh Surface (AI Navigation 2.0.14) > Collect Objects Volume, Use Geometry Physics Colliders > Bake; exclude notes and the player (NavMesh Modifier > Ignore From Build)                                                                                                                     |
| doors, roofs, stories | door leaf: Add Component > NavMesh Modifier > Ignore From Build; roof container: NavMesh Modifier > Override Area > Not Walkable (Apply To Children); NavMesh Surface > Advanced > Build Height Mesh for stairs and stories; stairs or ladders: Add Component > NavMesh Link (start, end, width, Bidirectional) |
| one surface per area  | Hierarchy search "t:NavMeshSurface": volumes of the same agent type must not overlap, or rebake every overlapping one after content changes                                                                                                                                                                     |
| show NavMesh          | Scene view overlays > AI Navigation > Surfaces > Show NavMesh                                                                                                                                                                                                                                                   |
| quick bake            | Window > Rendering > Lighting > New Lighting Settings; Lightmapper Progressive GPU (CPU unsupported on Apple Silicon); Lightmap Resolution 2; Generate Lighting                                                                                                                                                 |
| fog and sky           | Window > Rendering > Lighting > Environment: Skybox Material, Fog (Color, Mode Exponential Squared, Density)                                                                                                                                                                                                    |

## Multi-scene streaming

| Task                   | Path                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| open additively        | Project window: right-click scene > Open Scene Additive; or drag scenes into the Hierarchy; Option-drag adds without loading                                                                                                                               |
| active scene           | Hierarchy scene header More menu (three dots) > Set Active Scene (the active scene's lighting and fog apply)                                                                                                                                               |
| build list             | File > Build Profiles > Scene List (core first; the shared list is `EditorBuildSettings.scenes`)                                                                                                                                                           |
| measure loading        | Window > Analysis > Profiler attached to a development build (Autoconnect Profiler): marker "Application.Integrate Assets in Background" per frame against the priority budget                                                                             |
| memory after unload    | Window > Analysis > Memory Profiler (package 1.1.12): capture in the Player before the loads and after unload + sweep, then Compare Snapshots                                                                                                              |
| before and after       | Window > Analysis > Profile Analyzer (package 1.4.0): Pull Data of about 200 frames, change one thing, pull 200 more, Compare view (median, histograms)                                                                                                    |
| lighting across scenes | open the core plus every chunk; Window > Rendering > Lighting > Adaptive Probe Volumes: one Baking Set with all scenes; Generate Lighting; Window > Rendering > Occlusion Culling > Bake with all scenes open (scenario-unity-rendering-lighting) [verify] |

## Captures and review

| Task                    | Path                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| save a view             | position the Scene view, GameObject > Align With View on a camera named `AgentView_<name>`, disable the Camera component                                                   |
| Game view look          | Game view at the target resolution; Frame Debugger (Window > Analysis > Frame Debugger) for batches per draw                                                               |
| popping                 | walk the camera at eye height through the Detail Distance and the tree LOD distances (Scene view camera speed low); fog does not hide a pop where visibility is still high |
| gym                     | open `World_Gym.unity`; play the real controller down every lane with the real camera rig; rebuild it (ut_world.build_gym) whenever the controller or rig changes          |
| generated scene hygiene | terminal in the repo: `git update-index --skip-worktree <scene>`; `--no-skip-worktree` before committing an intended regeneration                                          |
