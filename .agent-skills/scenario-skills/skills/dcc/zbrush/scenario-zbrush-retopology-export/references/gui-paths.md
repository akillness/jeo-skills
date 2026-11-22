# GUI paths, hotkeys and gestures (for a human or a computer-use agent)

The same procedures as `procedures.md`, as a person works them in ZBrush 2026.2.1 on macOS. Palette
paths read Palette > Sub-palette > Item. Hotkeys come from the sources (recorded on Windows); on
macOS the docs' "Ctrl" usually means Command, but Control+W (not Command+W) makes a polygroup and
Command+W QUITS ZBrush since 2023.0.1 (version deltas 3.13): never send Command+W. Map any other
modifier per shortcut before relying on it [verify].

Item labels checked in the 2026.2.1 resources are marked [uistr] (UI strings) or [cmdxml] (command
list); the rest come from the videos and docs.

## Display and navigation for topology review

| Action                                   | GUI                                                                    | Hotkey                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Polyframe (loops and group colors)       | Transform > PolyF (id " Pf" [cmdxml])                                  | Shift+F                                                  |
| Solo the active SubTool                  | Transform > Solo                                                       |                                                          |
| Transparency / Ghost                     | Transform > Transp, Ghost                                              |                                                          |
| Double-sided display (holes, back faces) | Tool > Display Properties > Double; Flip for inverted normals [cmdxml] |                                                          |
| Neutral material                         | Material > MatCap Gray                                                 |                                                          |
| Snapshot for side-by-side compare        | Transform > Snapshot                                                   | Shift+S (clear with Ctrl+N)                              |
| Symmetry                                 | Transform > Activate Symmetry, >X<                                     | X                                                        |
| Isolate a polygroup                      |                                                                        | Ctrl+Shift+click the group (again to hide it)            |
| Selection rectangle / hide               |                                                                        | Ctrl+Shift drag (Space moves it), add Alt to hide        |
| Show all                                 |                                                                        | Ctrl+Shift+click empty canvas                            |
| Grow / shrink visibility                 | Tool > Visibility > Grow, Shrink [cmdxml]                              | Ctrl+Shift+X, Ctrl+Shift+S (Pavlovich; [verify] on 2026) |

## Polygroups and border smoothing

| Action                           | GUI or gesture                                                                                                                                               | Source                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Group from mask or visible       | mask, then Control+W                                                                                                                                         | Pavlovich n5 00:04:52      |
| Mask a ring                      | MaskPen, Ctrl+Alt tap on the model = Sharpen Mask, Ctrl tap = Blur Mask                                                                                      | Pavlovich n5 00:04:20      |
| Fill a masked ring               | Tool > Masking > Mask Region: Analyze Region, Fill Region                                                                                                    | Pavlovich n5 00:04:52      |
| Straight group borders           | Ctrl+Shift, pick SliceCurve, draw; Alt tap once bends, twice straightens; Space moves                                                                        | Pavlovich n5 00:13:02      |
| Groups per shell                 | Tool > Polygroups > Auto Groups [cmdxml]                                                                                                                     |                            |
| Hard-edge groups                 | Tool > Polygroups > Groups By Normals, MaxAngle (45 isolated cylinder caps) [cmdxml]                                                                         | Pavlovich n5 01:05:34      |
| Groups from color                | Tool > Polygroups > From Polypaint, PTolerance [cmdxml]                                                                                                      |                            |
| Merge strays                     | Tool > Polygroups > Merge Stray Groups, Merge Similar Groups [cmdxml]                                                                                        | Pavlovich n5 00:14:45      |
| Mask to group with support loops | Tool > Geometry > Edge Loop > Edgeloop Masked Border [cmdxml]                                                                                                | Drust IpTYcGxxsdM 00:05:08 |
| Smooth group borders (brush)     | hold Shift, Brush > Smooth Brush Modifiers > Weighted Smooth Mode 6, stroke along borders                                                                    | Pavlovich n5 00:05:27      |
| Smooth group borders (buttons)   | Tool > Masking > Mask By Feature (Groups on, Border and Crease off), GrowMask, Inverse; Tool > Deformation > Polish By Features (closed circle keeps volume) | Pavlovich n5 00:15:18      |
| Masks through thin ears          | Ctrl, Brush > Auto Masking > BackfaceMask                                                                                                                    | Pavlovich n5 00:11:13      |
| Paint groups with ZModeler       | B Z M, Alt-paint polygons, tap Shift to pick a group                                                                                                         | Pavlovich n5 00:11:16      |

## ZRemesher (Tool > Geometry > ZRemesher)

Items [cmdxml] [uistr]: ZRemesher, Retry, Legacy (2018), FreezeBorder, FreezeGroups, SmoothGroups
(slider next to KeepGroups, default 1), KeepGroups, KeepCreases, DetectEdges, Target Polygons Count
(thousands), Half, Same, Double, Adapt, AdaptiveSize (default 50), Curves Strength (default 50), Use
Polypaint, ColorDensity, KeepPolypaint.

| Action                                  | GUI or gesture                                                                                                                                                     | Source                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Type a target                           | turn Same off, type Target Polygons Count                                                                                                                          | Pavlovich n5 00:16:26                |
| Alternative midline algorithm           | Alt+click ZRemesher                                                                                                                                                | ZRemesher doc; Pavlovich n5 00:48:31 |
| Guide curves                            | ZRemesherGuide brush (Brush palette, filter Z); Alt-draw across to delete one; closed curve around a limb against spirals                                          | Drust IpTYcGxxsdM 00:02:08; doc      |
| Curves from groups                      | Stroke > Curve Functions: Border and Creased edges off, Polygroups on, Frame Mesh [cmdxml "Stroke:Frame Mesh"]; then KeepGroups off, Curves Strength 100           | Drust 8D-xqasgUws 00:03:41           |
| Density by paint                        | Color > FillObject white first, Colorize on; Standard brush Rgb on, Zadd off; Color Density 2 (pink, more), 0.25 (blue, fewer); Use Polypaint on                   | Pavlovich n5 01:00:48 to 01:02:38    |
| Partial remesh                          | hide all but the region, FreezeBorder on, ZRemesher (levels are deleted)                                                                                           | Drust 0TlG4Ex9lQA                    |
| Compare variants                        | Retry after Retry-compatible changes, then scrub the Undo History bar; go back to the chosen one before moving on (the last Retry stays in the scene)              | ZRemesher 4.0 doc                    |
| Alternative midline (computer-use step) | Shift+S snapshot of the normal result, undo, Alt+click ZRemesher at the same target (Pavlovich tried 1 and 1.5), compare nape and brow; Ctrl+N clears the snapshot | Pavlovich n5 00:48:05 to 00:49:05    |

## 2026 Retopo brush (B, R, E) and legacy manual tools

Setup: select Retopo (228 patches on its icon in 2026.1.1), X for symmetry, first click on the
model: Yes = new retopo SubTool (dense sculpt), No = convert the current light mesh (a ZRemesher
result); Polyframe and Transparency turn on. Brush > Retopology: Adaptive Draw Size, Move by Draw
Size, Focal Shift Adjust, Alternate Smooth, Snap Threshold (frame I4 00:14:32). Leave visible
exactly the SubTools the new mesh should wrap (Pablo I4nePXDTrhQ 00:08:33).

| Gesture                                                                                     | Effect                                                                        | Source                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| click                                                                                       | virtual point, projected on visible SubTools                                  | I4 00:07:56             |
| hold Space, hover, click                                                                    | preview and create a polygon from the points inside the Space circle          | I4 00:08:33             |
| right-click then Space                                                                      | reach the Space-mode Draw Size                                                | I4 00:10:21             |
| Space, click-drag along a point line                                                        | a strip in one gesture                                                        | I4 00:11:38             |
| drag a point, edge or polygon                                                               | move it (Move by Draw Size off = one point)                                   | I4 00:13:53             |
| Alt-click                                                                                   | delete a point or polygon                                                     | I4 00:12:46, 00:15:58   |
| Ctrl-drag in empty canvas                                                                   | clear stray virtual points and temporary geometry                             | I4 00:17:03; Retopo doc |
| Alt-drag an edge; tap Alt while dragging                                                    | extrude the edge; toggle whole border (edgeloop, polyloop)                    | I4 00:16:30; doc        |
| Alt-drag an edge, release Alt, Ctrl and drag sideways                                       | set the number of loops                                                       | Retopo doc              |
| Alt-drag from a vertex                                                                      | extrude a quad from the point                                                 | I4 00:19:59             |
| Space over an edge, drag across                                                             | insert one edge loop                                                          | I4 00:20:58             |
| Space, click, release Space with the button down, drag sideways                             | several evenly spaced loops                                                   | I4 00:22:04             |
| Alt-drag across a loop (red line)                                                           | delete the loop                                                               | I4 00:23:05             |
| Alt-drag from a point, then Alt again                                                       | strip line, then a strip remembering the point count; click outside to accept | I4 00:25:32             |
| IMM Viewer > Human patch: click pivot, Alt-drag, Alt on a corner, click outside, Space-drag | place, scale, skew, accept, average a patch                                   | I4 00:29:38 to 00:32:06 |
| Shift                                                                                       | Smooth Retopo (at the end, not while building)                                | I4 00:18:42             |
| Tool > Geometry > Modify Topology > Mirror And Weld                                         | rebuild a clean center line                                                   | I4 00:34:48             |

Checks while working: hide the reference, look for triangles and broken loops (Retopo doc). Legacy
routes: Topology brush (B, T, O; no subdivision levels, Draw Size 1 for zero thickness), ZSphere
topology (Tool > Topology > Select Topo, about 15,000 points maximum, Clone the target first),
ZModeler Topo (Pavlovich n5 00:25:05 to 00:41:14).

## Projection and the subdivision stack

| Action                            | GUI                                                                                                                                                                                               | Source                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Duplicate the source              | Tool > SubTool > Duplicate (Edit mode on)                                                                                                                                                         | Drust R2MzFqWMaWY                                |
| Store a safety state              | Tool > Morph Target > StoreMT                                                                                                                                                                     | Drust nxMYYsyJt3o 00:02:52                       |
| Project                           | Tool > SubTool > Project: Dist 0.1, Mean, PA Blur, ProjectionShell, Farthest, Outer, Inner, Project All                                                                                           | Drust; Gaboury                                   |
| Divide                            | Tool > Geometry > Divide (Smt, Suv)                                                                                                                                                               | Ctrl+D                                           |
| Project History                   | Undo History: Ctrl-click the detailed state, move the orange marker to the latest, Tool > SubTool > Project History (Color off)                                                                   | Gaboury 34D6VljTjBs 00:04:20                     |
| Fix spikes                        | Morph brush (B M, pick Morph) over the spikes; engulf with a big ClayBuildup or Move; mask the rest, Ctrl-click canvas to invert, Project All                                                     | Drust nxMYYsyJt3o 00:03:25 to 00:07:11           |
| Freeze levels                     | Tool > Geometry > Freeze SubDivision Levels (below SDiv), edit, press again                                                                                                                       | Drust NrsuP4Vj4Lg                                |
| Relax a stretched top level       | three or more levels below the top: Tool > SubTool > Reproject Higher Subdiv                                                                                                                      | Projection doc                                   |
| Safety nets before projecting     | at the TOP level: Tool > Morph Target > StoreMT, then Tool > Layers > New (REC turns on)                                                                                                          | FlippedNormals Zp07GW3rND0 00:02:13              |
| Protect the eyes                  | Ctrl+Shift click the eye-interior polygroup (isolates it), Tool > Visibility > Grow once or twice (past the lid), Tool > Masking > MaskAll, Ctrl+Shift click empty canvas (show all), Project All | FlippedNormals 00:05:31 to 00:06:03              |
| Repair a busted area              | Morph brush (B M, pick Morph) back to the stored target; or mask the good part, Ctrl-click canvas to invert, Project All again (local reprojection); never Shift-smooth rogue vertices            | FlippedNormals 00:04:27, 00:06:36, 00:09:27      |
| Color pass                        | the paintbrush icon of BOTH SubTools on in the SubTool list (Tool > Polypaint > Colorize), last level only, Project All                                                                           | Drust PrFQXjs_6_w 00:16:35, _ips3GhWI0s 00:05:57 |
| Drop the morph target before maps | Tool > Morph Target > DelMT                                                                                                                                                                       | Drust 2zDAtaQqwh8 00:01:44 [verify]              |

## UVs

| Action              | GUI                                                                                                                                                  | Source                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Map size and border | Tool > UV Map > UV Map Size (presets to 4096, slider to 8192), UV Map Border                                                                         | Gaboury cemmalvugFk 00:00:51   |
| Native unwrap       | Tool > UV Map > Create (Unwrap): Auto Seams or Creased Edges [uistr], Symmetry, Unwrap                                                               | Pavlovich cvqoVUX5aBw          |
| Seams from groups   | Tool > Geometry > Crease > UnCreaseAll, Crease PG [cmdxml]                                                                                           | Pavlovich 00:03:49             |
| Surgical seams      | ZModeler (B Z M), hover a point, Space, Crease Shortest Path, click point to point; set the edge action to Do Nothing first                          | Pavlovich 00:05:26 to 00:08:11 |
| Seams back from UVs | Create (Unwrap) > Crease Seams (Shift keeps existing creases)                                                                                        | UV doc; Pavlovich 00:10:25     |
| View the layout     | Bump 0, Tool > UV Map > Morph UV                                                                                                                     | Pavlovich 00:02:12             |
| Overlap check       | Tool > Texture Map > New From UV Check (red = overlap)                                                                                               | Pavlovich 00:01:06             |
| UV Master           | Zplugin > UV Master: Work On Clone, Symmetry, Polygroups, Unwrap, CheckSeams, Flatten, UnFlatten, Copy UVs, (select the original), Paste UVs [uistr] | Gaboury cemmalvugFk            |
| Control painting    | Enable Control Painting, Protect (face), Attract (back), Density x2 to x4 or /2 to /4, AttractFromAmbientOccl [uistr]                                | UV Master doc                  |
| Move islands        | on a flattened clone: W (Gizmo), Ctrl-tap a group, symmetry off, move and scale                                                                      | Pavlovich 00:08:11             |

## Maps

| Action                          | GUI                                                                                                                                                                                                                                                                                                                       | Source                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| MME                             | Zplugin > Multi Map Exporter: Displacement, Vector Displacement, Normal, Texture from Polypaint, Ambient Occlusion, Cavity, Export Mesh; SubTools, Merge Maps, Layers, FlipV, Map Size, Map Border; Export Options (File names, Load/Save Presets, Switch MT, Estimate Time) and per-map options; Create All Maps [uistr] | MME doc; FlippedNormals                         |
| Film displacement preset        | Displacement only, SubTools on, Merge Maps off (EXR), Map Border max, FlipV on, SubDiv level 1, Adaptive off, DpSubPix 0, SmoothUV on, Mid 0.5, 32Bit, exr, 3 Channels off; UDIM file names with a dot before the tile                                                                                                    | FlippedNormals -ThBTEc8L_M 00:04:09 to 00:14:22 |
| One SubTool normal map          | Tool > Normal Map: Tangent, Adaptive, SmoothUV, SwitchRG, SNormals, FlipR/G/B, Create NormalMap, Clone NM; Texture > Export                                                                                                                                                                                               | Drust n0qqpwvn-jA                               |
| One SubTool displacement        | Tool > Displacement Map: Mid (0 to 100, default 50), Scale, 32Bit, 3 Channels, Adaptive, DPSubPix, SmoothUV, Flip V, Create And Export Map                                                                                                                                                                                | MME doc                                         |
| Color ID                        | Tool > Polypaint > Polypaint From Polygroups; Tool > Texture Map > New From Polypaint (Unweld Groups Border first on low poly)                                                                                                                                                                                            | Drust RYGkbSUaHHg                               |
| Vector displacement diagnostics | Tool > Vector Displacement Map > Create Diagnostic Files; Preferences > ImportExport > FlipAndSwitch                                                                                                                                                                                                                      | MME doc                                         |
| Never                           | press ESC during MME (UVs can be lost)                                                                                                                                                                                                                                                                                    | MME doc                                         |

## Ears and hands on their own

| Action                 | GUI or gesture                                                                                                                                         | Source                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Split the part         | Ctrl+Shift drag over the ear or hand, Tool > SubTool > Split Hidden (or Groups Split on its group)                                                     | Pavlovich n5 00:43:57, 00:58:36 |
| Polish the open border | Tool > Masking > Mask By Feature with Border only, GrowMask, Inverse, Tool > Deformation > Polish By Features (open circle)                            | Pavlovich n5 00:44:36           |
| Remesh the part        | ZRemesher; hand Adaptive Size about 14; ear: Half repeatedly without groups, projecting after each pass                                                | n5 00:45:42, 00:59:42           |
| Exact re-weld          | remesh the whole limb first, split, FreezeBorder on for each part ("probably not great for animation")                                                 | n5 01:03:44                     |
| Re-join                | MergeDown with Weld on (Uv off without UVs) or Modify Topology > WeldPoints; stitch leftovers with ZModeler Stitch Two Points where deformation is low | n5 00:47:31, 00:59:42           |

## Scale and export

| Action                   | GUI                                                                                                                                                                                                                                                                          | Source                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Read internal size       | Tool > Geometry > Size: XYZ Size (longest axis), X/Y/Z Size                                                                                                                                                                                                                  | Gallagher 00:15:42           |
| Measure                  | W then Y for the Transpose line; the readout uses Export Scale                                                                                                                                                                                                               | Gallagher 00:06:15, 00:19:46 |
| Export scale and offsets | Tool > Export: Scale, X Offset, Y Offset, Z Offset (internal units)                                                                                                                                                                                                          | Drust; Gallagher             |
| OBJ switches             | Tool > Export: Qud or Tri, Txr, Flp, Mrg ("Merge Uv Cords" [uistr]), Grp ("Export Sub Groups" [uistr]), Smooth Normals; Export                                                                                                                                               | EXP doc                      |
| Normalize a simple tool  | Tool > Deformation > Unify (never on a character with layers)                                                                                                                                                                                                                | Gallagher 00:27:16           |
| Rescale a complex tool   | Save As, new primitive with Export Scale set, Zplugin > SubTool Master > MultiAppend                                                                                                                                                                                         | Gallagher 00:38:48           |
| Scale Master             | Zplugin > Scale Master: Set Scene Scale (dialog), Sliders to Subtool Size, X/Y/Z, All, Resize Subtool, ZBrush Scale Unify, Export to Unit Scale [uistr]                                                                                                                      | Robinson bICt_XruvQM         |
| GoZ                      | top of the Tool palette: GoZ, All, Visible, R (first press picks the app)                                                                                                                                                                                                    | GoZ doc                      |
| FBX                      | Zplugin > FBX ExportImport: Selected/Visible/All, FBX 2009 to 2020, bin, Layers, Tris, axis preset (MayaYUp, MayaZUp, 3ds Max, Toolbag, Unity, MotionB, OpenGL, DirectX, LightWv), SNormals, Embed Maps; Options: Export Polygroups as Mats; Export (options window) [uistr] | FBX doc                      |
| Substance Bridge         | Texture > Substance Bridge: Send to Painter (All, Visible, Active), Texture Sets (Per Subtool, Per PolyGroup), PolyPaint, Subdivision Level (Current, Low & High), Auto-Bake, Force Auto-Unwrap, Smooth Normals [uistr]                                                      | Substance Bridge doc         |

## Decimation

Zplugin > Decimation Master [uistr]: Options (Freeze borders, Keep UVs, Use and Keep Polypaint,
Polypaint weight), Pre-process Current or All, % of decimation or k Points / k Polys, Decimate
Current or All, presets 20 k, 35 k, 75 k, 150 k, 250 k, Custom, Utilities (Delete Caches, Export All
SubTools). Keep polygroups: Tool > Geometry > Modify Topology > Unweld Groups Border, Freeze borders
on, decimate, Tool > Polygroups > Auto Groups, Modify Topology > WeldPoints (Drust mRfA_WDvvrg).

## Cleanup of scans and generated meshes

| Action                           | GUI or gesture                                                                                                                                                                                                  | Source                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Inspect                          | MatCap Gray, colorize off, Double on, Polyframe                                                                                                                                                                 | Drust PrFQXjs_6_w 00:00:42                                           |
| Repair                           | Tool > Geometry > Mesh Integrity > Check Mesh Integrity, Fix Mesh [cmdxml]                                                                                                                                      | doc                                                                  |
| Fill holes                       | Tool > Geometry > Modify Topology > Close Holes (no levels)                                                                                                                                                     | Drust                                                                |
| Fill one hole, keep single-sided | isolate it (Ctrl+Shift rectangle), ZModeler, hover an edge, Space, Close, Concave Hole, click the border                                                                                                        | Drust udiPVJIODX0 00:02:47                                           |
| Thicken a thin shell             | W, Ctrl-click the fill group (masks the rest), side view, perspective off, Shift-drag the middle circle to push the fill back                                                                                   | Drust PrFQXjs_6_w 00:04:32 to 00:06:43                               |
| Plug a hole                      | SubTool > Append PolySphere, Tool > Deformation > Unify, E to scale, move in, Move brush (B M V) into shape, MergeDown ("Always OK")                                                                            | Drust PrFQXjs_6_w 00:07:16 to 00:10:33                               |
| Remove junk                      | Control+W all into one group, mask the junk, Control+W, Ctrl+Shift click to isolate then again to hide, Modify Topology > Del Hidden                                                                            | Drust 00:10:33                                                       |
| Split shells                     | Tool > SubTool > Split > Split To Parts (after Auto Groups)                                                                                                                                                     | doc                                                                  |
| Flat base                        | Ctrl+Shift, SliceCurve line under the lowest point, hide below, Del Hidden, re-DynaMesh                                                                                                                         | Drust 00:11:39                                                       |
| Re-DynaMesh                      | Ctrl-drag on empty canvas                                                                                                                                                                                       | Drust 00:09:27                                                       |
| Texture to geometry              | Tool > Masking > Mask By Intensity, colorize off, Tool > Deformation > Inflate a little                                                                                                                         | Drust 00:19:21                                                       |
| See texture while sculpting      | Material > BumpViewer                                                                                                                                                                                           | Drust 00:17:42                                                       |
| Symmetrize                       | Tool > Geometry > Modify Topology > Mirror And Weld; Tool > Deformation > Smart ReSym [cmdxml]                                                                                                                  |                                                                      |
| Keep polygroups through DynaMesh | turn the SubTool's paintbrush icon off (polypaint off) before DynaMesh; on, DynaMesh keeps polypaint instead of groups                                                                                          | DynaMesh doc, PolyGroups > Important; Pavlovich 8kWFv1cZlCE 00:20:06 |
| Merge parts inside the Tool      | order them with the SubTool list arrows (Tool > SubTool > MoveUp, MoveDown [cmdxml]), select the upper one, Tool > SubTool > Merge > MergeDown (Weld on to weld borders); MergeVisible makes a new Tool instead | Drust PrFQXjs_6_w 00:09:27; Pablo gitoJ7B8FmY 00:03:31               |
| Place a plug                     | SubTool > Append a sphere, then Tool > Geometry > X, Y, Z Position and XYZ Size [cmdxml] (typed values), MergeDown, re-DynaMesh; by hand Drust scales with E and moves it in                                    | Drust PrFQXjs_6_w 00:07:16                                           |
| Read forms under light           | Material > a Standard material (BasicMaterial), dock the Light palette, drag the orange dot, tap it to send the light behind (rim)                                                                              | Pavlovich aR02CwyPTUw 00:04:07, 00:04:39                             |
