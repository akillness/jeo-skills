# GUI paths (for a computer-use agent or a person at the machine)

The same procedures as `procedures.md`, where the work lives in a window rather than in code. Menu
names come from the 5.6 to 5.8 sources; UE 5.6 redesigned the viewport toolbars and hid the level
editor Settings menu (version deltas), so expect small differences and mark what you confirm. On
macOS, Ctrl shortcuts in the docs usually map to Cmd [verify].

## Capture from the editor

- **Trace menu (status bar, bottom right):** Channels, Trace Screenshot (Ctrl+F9), Trace Bookmark,
  Region Name and Begin Region, Stat Named Events toggle, destination Trace Store or File, Start
  Trace, Save Trace Snapshot, Open Insights after Trace, Open Trace Store Directory, Open Profiling
  Directory (HITCH [00:48:49], on screen). Tick Stat Named Events before a Niagara or Blueprint
  capture (NIA [00:13:08]).
- **Open Unreal Insights:** Tools > Unreal Insights > Run Unreal Insights, or the standalone app in
  `Engine/Binaries/Mac/UnrealInsights.app` (INS). Start it before the game so it records the live
  session; otherwise Connection tab > Connect (late connect).
- **Viewport stats:** viewport menu > Stat > Engine > FPS and Unit (STAT); Show FPS with
  Ctrl+Shift+H (ARI22 [00:14:13]).
- **ProfileGPU:** Ctrl+Shift+Comma or the `ProfileGPU` console command; with 5.6's GPU Profiler 2.0
  the log carries the table, the old GPU Visualizer window may not open [verify] (ARI22 [00:16:20];
  rn56).

## Read a trace in Unreal Insights (KEN; NORSE)

1. Session Browser > double-click the trace (or drag the `.utrace` onto the window); it opens in
   Timing Insights.
2. **Frames panel** (top): one bar per frame, lines at 16.7, 33.3, 50 and 66.7 ms; scroll zooms,
   Shift+scroll zooms vertically; right-click to turn rendering frames off when the selection lands
   on them (NORSE [00:21:42]).
3. Sort or click the tallest bar; **Timing panel**: find the thread with the longest bar, then its
   longest marker that is not idle, Wait for Tasks or Frame Sync.
4. Select an event next to a wait: Insights draws the **dependency arrow** to the prerequisite task
   on a worker; select that task (KEN [00:25:56]).
5. **Timers** and **Counters** tabs: count, inclusive and exclusive time over the selected range;
   double-click a timer to highlight every instance; right-click > Plot Timer and add the game frame
   stat series to sum same-name timers per frame (FFW [00:12:15]).
6. **Callers/Callees** (bottom right): the hot-path icon marks the expensive path.
7. Shortcuts: Ctrl+F Quick Find, F frame selection, Y GPU track, U CPU track, I I/O tracks, L asset
   loading, B bookmarks, V hide empty timelines, Enter selects an event's time range (INS).
8. **GPU tracks (5.6+):** graphics and compute pipes on one timeline; GPU Work, GPU Wait, Wait Fence
   and Signal Fence states (KEN [00:21:19]).
9. **Asset Loading Insights:** Loading GameThread and AsyncLoadingThread tracks, IoDispatcher,
   IoService, I/O Activity; the package table sorts packages by processing time (KEN [00:32:26]).
10. **Memory Insights** (Menu > Memory Insights, Development build traced with memory from process
    start): Investigation panel, Memory Leaks query with markers A, B, C, group by Callstack, R
    expands the critical path (ARI22 [00:36:47]; INS). On a Mac, callstack channels are not listed:
    use Instruments Allocations instead.
11. **World Partition Insights (5.8):** Spatial Profiler tab; export a minimap background with
    `wp.Editor.ExportMinimapForInsights` (TL part 2). World Streaming Insights is Experimental:
    enable its plugin in `Engine/Programs/UnrealInsights/Config/DefaultEngine.ini` and trace
    `WorldStreaming` (INS; rn58).

## View modes that locate costs (level viewport)

- View Mode menu > **Nanite Visualization**: Mask (green = Nanite), Evaluate WPO, Pixel
  Programmable, Helper Lanes, Clusters, Overdraw, Tessellation (W4R [00:28:52]; OZ24; FFW
  [00:16:14]). Order: Evaluate WPO and Pixel Programmable first, Overdraw last and only after a
  measured problem (OZ24 [00:31:00] [00:32:13]); the two sources describe the Evaluate WPO colors
  oppositely, so read the legend [verify]. Overdraw on the frame after a camera cut shows lost
  occlusion history (W4R [00:45:16]).
- View Mode menu > **Lumen**: Performance Overview (pixels tracing dedicated reflection rays), Lumen
  Scene, Surface Cache (purple = not covered by cards) (OZ24 [00:39:00] [00:42:33]).
- View Mode menu > **Virtual Shadow Map**: cached pages, clipmap levels, VSM Nanite overdraw (OZ24
  [00:48:25]).
- View Mode menu > Optimization Viewmodes > **Light Complexity** for overlapping lights; **Player
  Collision** for the physics world (NORSE [00:50:08]; HITCH [00:20:48]).
- Show > Lumen > Screen Traces off, to split screen-trace and world-trace artifacts (OZ24
  [00:42:00]).

## Settings and assets

- **Engine Scalability Settings:** viewport Performance and Scalability menu, or the toolbar
  Settings menu where visible (SCAL; rn56 hid Settings by default, `LevelEditorToolbarSettings 1`
  shows it).
- **Device Profiles window:** Window > Developer Tools > Device Profiles [verify location in 5.8]
  (SCAL).
- **Project Settings:** Engine > Physics (default collision complexity, "Use Simple as Complex"
  [verify label]); Editor > UMG Editor (property binding rule); Engine > Rendering (Lumen, HWRT,
  Virtual Textures, Shadow Map Method, Allow Static Lighting); Maps & Modes (Editor Startup Map,
  Game Default Map); search "Tick Animation On Skeletal Mesh Init" (OZ26; HITCH [00:26:02]).
- **World Settings > World Partition Setup > Runtime Cells Transformer Stack:** add
  `WorldPartitionRuntimeCellTransformerISM` (Allowed Classes StaticMeshActor, Min Num Instances)
  and, after it, the FastGeo transformer (HITCH [00:11:10]; W4S [00:26:41]).
- **Packed Level Actor:** select actors > right-click > Level > Create Level Instance, then Create
  Packed Level Actor (HITCH [00:08:40]).
- **Foliage mode:** select a foliage type > Details > Enable Density Scaling, Nanite Pixel
  Programmable Distance (5.8), WPO disable distance; Foliage mode > Select to tell foliage from
  landscape grass (FFW [00:19:42] [00:35:58]).
- **Mobility audit:** select props in the Outliner (filter StaticMeshActor) > Details > Transform >
  Mobility; Static unless something moves them (ARG [00:11:54]).
- **Water:** the Single Layer Water opaque-depth cutoff that culls Lumen under deep water (W4R
  [00:35:18]); the talk gives no setting name: search the water body and water material Details for
  "depth" [verify].
- **Blocking-load validator:** install CommonValidators (github.com/Flassari/CommonValidators) as a
  project plugin, then Content Browser > right-click a folder > Validate Assets, or Tools > Validate
  Data [verify menu names] (HITCH [00:45:16]).
- **Decals:** select all decal actors to see their volumes; Details > Fade Screen Size, Detail Mode
  (FFW [00:38:42] [00:44:28]).
- **Materials:** Material Editor Details > Translucency Pass (Before DOF), Blend Mode; Alt-click the
  Pixel Depth Offset pin to disconnect it, Apply (NORSE [00:48:38]; FFW [00:21:13]).
- **Chaos Visual Debugger:** Tools > Debug > Chaos Visual Debugger; toggle simple and complex
  geometry flags; 5.8 adds a triangle mesh complexity view (NORSE [00:34:34]; TL part 2).
- **Niagara:** Tools > Debug > Niagara Debugger (Debug HUD with Show Overview, FX Outliner); Effect
  Type assets from Content Browser > FX (menu naming differs between sources) (NIA [00:07:44]
  [00:20:16]).
- **Blocking load nodes:** Blueprint editor, replace Load Class Asset Blocking with Async Load Class
  Asset and continue from Completed (ARI22 [00:27:22]).
- **Route markers in a packaged build:** Sequencer > + Track > Event Track; key an event per
  waypoint and bind it to a console command (Trace.Bookmark, Trace.Screenshot, csvprofile stop,
  quit) [verify binding path] (owner scenario-unreal-cinematics).
- **Asset Audit, Size Map, Reference Viewer:** Window > Developer Tools > Asset Audit; right-click
  an asset > Size Map or Reference Viewer (zen chunking doc).
- **Packaging:** Platforms menu > Mac > Binary Configuration > Package Project; Project Launcher
  under Platforms (PKG).

## Apple tools (MOB)

- **Xcode Debug Navigator gauges** while running from Xcode: CPU, GPU, frame rate, memory, energy.
- **Xcode Metal frame capture:** Debug > Capture GPU Workload [added]; per-pass GPU time, limiters,
  most expensive shaders.
- **Instruments:** templates Time Profiler (sampling), Metal System Trace (Metal calls, shader
  compiler track, drawable waits, thermal and GPU performance state tracks), Allocations, Power
  Profiler; traces save to disk and can be shared.
