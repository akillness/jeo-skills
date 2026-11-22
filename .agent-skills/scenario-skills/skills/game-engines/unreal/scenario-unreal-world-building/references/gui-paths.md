# GUI paths: scenario-unreal-world-building (for a computer-use agent or a human)

The same procedures as `procedures.md`, through the editor. UE 5.8 names; macOS uses Cmd where the
docs say Ctrl [verify]. 5.6 redesigned the viewport toolbars (`ToolMenusViewportToolbars 0` restores
the old ones) and hid the level editor Settings menu (`LevelEditorToolbarSettings 1`). Items marked
[verify] come from older screenshots.

## Map and World Partition (P2)

- New map: File > New Level > Open World (or Empty Open World).
- Convert: Tools > Convert Level.
- Grid: Window > World Settings > World Partition Setup (Grid Name, Cell Size, Loading Range,
  Preview Grids). New 5.8 maps use the runtime hash with partitions, so the fields may sit under a
  partition entry [verify].
- Regions: Window > World Partition > World Partition Editor; drag a box, right-click > Load Region
  from Selection; Shift+drag snaps to the grid, double-click moves the camera, Shift+double-click
  starts PIE there, Ctrl+double-click loads a region.
- World Bookmarks (5.6): Window > World Partition > World Bookmarks (camera, loaded regions, Data
  Layer states).
- Minimap: Build > World Partition > Build Minimap (needs Project Settings > Rendering > Enable
  virtual texture support).
- Debug in PIE: backtick console, `wp.Runtime.ToggleDrawRuntimeHash2D`, `wp.Runtime.HLOD 0`.

## Landscape (P3, P4)

- Create: mode dropdown > Landscape (Shift+2) > Manage > New > Import from File: Section Size 63x63
  quads, Sections Per Component 2x2, Number of Components 16 x 16, Overall Resolution 2017 x 2017,
  Location Z = `actor_z_cm` and Scale 100, 100, `z_scale` from the export's import JSON (P3; the
  blockout valley gives about 15,443 cm and 63.68). Never type Scale Z 100 for a heightmap exported
  with another Z. Component outline colors: yellow actor, light green component, medium green
  section, dark green quad.
- Material: select the Landscape > Details > Landscape Material. In the landscape material instance
  (materials owner): per-layer specular, anti-tiling (Distance Blend, Cell Bombing), triplanar on
  the steep layer; in the master, Landscape Layer Coords Mapping Type XZ or YZ for side projection.
- Layers: Paint tab > target layers (Add, or Populate from materials) > + > Weight-Blended Layer
  (normal) to create each Layer Info.
- Edit layers: Layers panel > + ; lock and eye icons; cog opens the Edit Layer Inspector;
  right-click for Rename, Collapse (destructive), Clear.
- Visualize: View > Landscape Visualizers > Layer Debug; Lit > Visualizers > Layer Contribution.
- Build: Build > Build Landscape (5.6 merged physical materials, grass maps and Nanite into it).
- Patches: drag a Landscape Patch actor; Blend Mode Max, Zero Height Meaning = Landscape Z; move the
  actor root, not the component.
- Nanite landscape: Landscape Details > Nanite > Enable, then Build Data.
- River: Place Actors > Water Body River; Selected Points panel for width, depth, velocity per
  point; Visualize River Width handles.

## Data Layers and HLOD (P5, P6)

- Data Layer asset: Content Browser > right-click > Miscellaneous > Data Layer (type Editor or
  Runtime). Instance: Window > World Partition > Data Layer Outliner, drag the asset in. Assign:
  select actors > right-click in the outliner > Add Selected Actors to Data Layer, or Details > Data
  Layers. Make Current Data Layer for new actors.
- HLOD Layer asset: Content Drawer > right-click > Miscellaneous > HLOD Layer (Layer Type, Parent
  Layer, merge or proxy settings; 5.8 editor loading behavior and ray tracing far field). Assign:
  actor Details > HLOD Layer; Data Layer default; World Settings > default HLOD layer.
- Build: Build > Build HLODs; 5.8 Build HLOD for Selection, or right-click a region in the World
  Partition Editor > Build HLOD for Selected Region.
- Inspect: viewport View Mode > Level of Detail Coloration > Hierarchical LOD Coloration (green
  sources, blue proxies).
- Proxy settings: HLOD Layer asset > Mesh Merge / Proxy settings: Allow Distance Fields (off on
  far-only proxies after the lighter agrees), Merge Distance and Unresolved Geometry Color
  (Simplified), Override Spatial Sampling Distance.
- PCG volumes: select the volume > Details > HLOD Layer, and Data Layers, before Generate (outputs
  inherit both).
- Streaming Source: actor > Add Component > World Partition Streaming Source (Target Grid, Shapes,
  Priority, Target State).

## Village and kits (P7)

- Snapping: viewport toolbar grid snap to the kit grid; local-space gizmo for rotated runs.
- Level Instance or Packed Level Actor: select actors > right-click > Level > Create Level Instance
  / Create Packed Level Actor (External Actors on, Pivot Center Min Z). Edit: right-click > Level >
  Edit, then Commit (Esc twice discards). Break: right-click > Level > Break (save the map version
  first).
- PCG Data Asset from a Level Instance: Content Browser > right-click the level > asset action
  submenu (entry name unreadable in the talk [verify]).
- Tags: actor Details > Actor > Tags (use a tagging widget with a fixed vocabulary, never free
  typing).
- Paths: landscape splines (Landscape mode > Manage > Splines, Ctrl+click to add points) on the
  Splines edit layer, following the points from `village_paths`; or the Recursive Pathfinding
  subgraph in a PCG graph.
- Fences: a Blueprint with a spline and a PCG component; the grammar string and module table as its
  graph parameters.

## Nanite (P8)

- Batch: Content Browser selection > right-click > Nanite > Enable.
- Per mesh: Static Mesh Editor > Details > Nanite Settings (Enable Nanite Support, Fallback Relative
  Error, Shape Preservation > Voxelize for Nanite Foliage, displacement maps).
- Construction: judge in View Mode > Nanite Visualization > Triangles and Clusters while dollying;
  fixes happen in the DCC (connected base, smoothing, fewer seams).
- Import: tick Build Nanite, untick Generate Lightmap UVs in Lumen projects.
- Tessellation: Material Details > Enable Tessellation; Displacement Scaling (Magnitude, Center).
- Views: viewport View Mode > Nanite Visualization > Triangles, Clusters, Overdraw, Tessellation.

## PCG (P9, P10)

- Graph: Content Browser > right-click > PCG > PCG Graph (Create Advanced Asset). Templates: Graph
  Settings > Is Template.
- Instance: right-click the graph > Create PCG Graph Instance; or select a PCG actor > PCG
  Component > Save Instance.
- Parameters: graph editor > Parameters panel > +; 5.8 parameter hierarchy editor for categories.
- Place: drag the graph into the level (creates a PCG Volume) or Place Actors > PCG Volume;
  Details > PCG Component > Graph, Is Partitioned, Generation Trigger, Seed, Generate.
- Debug: select a node, D (debug points), E (enable), A (attributes panel); profiling window for
  node times.
- Layer filter: Attribute Filter node Details > Warn on Data Missing Attribute (tick it), Use
  Constant Threshold, Target Attribute = the layer name without `$`.
- Spawner collision: Static Mesh Spawner > mesh entry > Descriptor > Collision (off by default; on
  for trunks and boulders).
- Grass mask: Landscape Grass Type assets with no meshes, painted through the landscape material;
  Generate Grass Maps node in the graph.
- Teleports: add a PCG Generation Source component (class name [verify]) to the teleport target
  actor, next to its World Partition Streaming Source.
- Runtime and partition settings: select PCGWorldActor in the Outliner: Partition Grid Size, Treat
  Editor Viewport as Generation Source, Enable World Partition Generation Sources, landscape cache.
- GPU: node Details > Execute on GPU, Skip Readback to CPU; Get Landscape Data > Get Height Only;
  custom HLSL: Window > Source Editor.
- Editor Mode (5.7): mode dropdown > PCG > Draw Spline, Draw Surface, Paint, Volume.
- Builder: Build menu PCG entries and the Builder Settings asset (5.5) [verify labels].

## Review (P13)

- Screenshots: console `HighResShot 1920x1080` [verify], or the viewport menu > High Resolution
  Screenshot.
- Stats: console `stat unit`, `stat gpu`; Trace status-bar widget > start trace; Unreal Insights for
  the file.
- Game view: G hides editor icons; F11 full-screen viewport.

## Validation and submit (P11, P14)

- Validate: Content Browser right-click > Asset Actions > Validate Assets [verify menu path]; Python
  validators register at startup through `init_unreal.py`.
- Submit OFPA work: the Revision Control status-bar menu > View Changelists [verify menu path],
  validate, submit from the editor (WP doc); revert generated PCG partition actors when builders own
  generation.
- Minimap and RVT: Project Settings > Rendering > Virtual Textures > Enable virtual texture support
  (restart).
