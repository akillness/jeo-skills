# GUI paths: palettes, hotkeys and brushes for hard surface

For a computer-use agent (or a human) doing the steps the bridge cannot do, and for mapping a
tutorial to item paths. macOS conventions: the docs write "Ctrl" (treat each modifier as [verify]);
Control+W groups, and **Cmd+W quits ZBrush** (2023.0.1): never send it. Evidence: [doc] Maxon docs,
[strings] label present in `ZData/ZLang/english/UInterface.zsc` (2026.2.1), [macro] shipped macro,
otherwise the expert who shows it.

## Internal labels (what item paths use)

Duplicate labels in Tool > Geometry are disambiguated by prefixes [strings]; the NanoMesh prefix is
proven by the Create Instance Subtool macro (`Tool:NanoMesh:m.Width`) [macro]:

- **Dynamic Subdiv:** `s.Dynamic`, `s.Apply`, `s.QGrid`, `s.Coverage`, `s.Constant`, `s.Bevel`,
  `s.Chamfer`, `s.FlatSubdiv`, `s.SmoothSubdiv`, `s.Thickness`, `s.Segments`, `s.Post SubDiv`,
  `s.Offset`, `s.Smoothness`, `s.MicroPoly On`.
- **Crease:** `Crease` (bubble help "Crease Border"), `CreaseAll`, `CTolerance`, `CreaseLvl`,
  `UnCrease`, `UnCreaseAll`, `Crease PG`, `UnCrease PG`, `Crease UM`, `UnCrease UM`.
  - Crease Bevel: `B.Bevel`, `B.PropWidth`, `B.Resolution`, `B.EdgeSharp`, `B.Bevel Width`.
- **EdgeLoop:**
  - Edgeloop Masked Border [macro];
  - `GroupsLoops` with `Loops` and `GPolish`;
  - Panel Loops: `P.Panel Loops`, `P.Loops`, `P.Double`, `P.Append`, `P.Inner`, `P.Thickness`,
    `P.Polish`, `P.Ignore Groups`, `P.RegroupPanels`, `P.RegroupLoops`, `P.Bevel`, `P.Elevation`,
    `P.Bevel Profile`;
  - Delete Loops: `D.Partial`, `D.Groups`.
- **ZRemesher:** `Retry`, `Legacy (2018)` (still in the resources), `FreezeBorder`, `FreezeGroups`,
  `KeepGroups`, `SmoothGroups`, `KeepCreases`, `DetectEdges`, `AdaptiveSize`, `Use Polypaint`,
  `ColorDensity`, `KeepPolypaint`, `Target Polygons Count`, Half, Same, Double, `Adapt`,
  `Curves Strength`.
- **Polygroups:** `Auto Groups`, `Groups By Normals` with `MaxAngle`, `GroupVisible` (the macro path
  is `Tool:Polygroups:Group Visible`), `Group Masked`, `Group Masked Clear Mask`,
  `Group As Dynamesh Sub`, `From Polypaint`.
- **Array Mesh:** `a.Array Mesh`, `a.Transpose`, `a.Lock Pos`, `a.Lock Size`, `a.Append New`,
  `a.Reset`, `a.Repeat`, `a.Chain`, `a.AlignToPath`, `a.Offset`, `a.Scale`, `a.Rotate`, `a.Pivot`
  (modes), `a.X Amount`, `a.Y Amount`, `a.Z Amount`, `a.X Mirror`, `a.Make Mesh`,
  `a.Convert To NanoMesh`.
- **NanoMesh:** `m.NanoMesh On`, `m.Index`, `m.Edit Mesh`, `m.EditPlacement`, `m.ShowPlacement`,
  `m.Prop`, `m.Fit`, `m.Fill`, `m.Clip`, `m.Size`, `m.Width`, `m.Length`, `m.Height` (with `WVar`,
  `LVar`, `HVar`), `m.XOffset` .. `m.ZOffset`, `m.XRotation` .. `m.ZRotation` (with `ZRVar`),
  `m.H Tile`, `m.V Tile`, `m.Pattern`, `m.Random Distribution`, `m.Align To Normal`,
  `m.One To Mesh`, `m.All To Brush`, `m.Replace NanoMesh From Brush`.

## Dynamic Subdivision and creasing

- **Dynamic Subdiv:** Tool > Geometry > Dynamic Subdiv. D turns Dynamic on and Shift+D off; the
  first time, ZBrush asks to confirm (Pavlovich). With classic levels, D and Shift+D step the levels
  instead [doc].
  - A 2026.2.1 note string offers "auto-activate Dynamic Subdiv" when a mesh has zero levels; set
    `s.Dynamic` by path instead.
  - Apply converts the preview to classic levels.
- **Crease:** Tool > Geometry > Crease.
  - Crease on a partially hidden mesh creases its open borders; Shift+click Crease creases all
    visible edges [doc].
  - CTolerance plus Crease creases by angle. Crease PG creases group borders. Crease UM / UnCrease
    UM act on the unmasked part (2024).
  - Bevel (with Bevel Width) adds a real bevel on creased edges. Holding Ctrl while changing the
    width follows polygroup borders (Pavlovich [verify]).
- **Polygroups:** Tool > Polygroups > Groups By Normals with MaxAngle; Control+W groups the visible
  or masked part.

## Booleans

- **Operators:** icons on each SubTool row in Tool > SubTool (Add, Subtract, Intersect), plus the
  bent arrow for Start.
- **Live Boolean** is the switch left of Edit on the top shelf, also Render > Render Booleans > Live
  Boolean. The same group holds Show Coplanar (Inside, Solo), Show Issues (Inside, Solo, Previous,
  Next) and the Coplanar threshold.
- **Make Boolean Mesh:** Tool > SubTool > Boolean > Make Boolean Mesh, with DSDiv ("Allow Dynamic
  Subdiv") beside it. The folder menu has Boolean With DSDiv.
- **Preferences > Boolean:** Coplanar Threshold, Clean Slivers, Slivers Max Size. Keep the defaults.
- **Order of checks:** Show Coplanar before Make Boolean Mesh (red = coplanar, nudge the operand);
  after it, select the UMesh result and Show Issues (red outlines = holes, edges on more than 2
  polygons); Previous and Next jump between SubTools with issues [strings; LB doc Geometry
  Analysis].
- **Duplicate:** Ctrl+Shift+D. A duplicate reverts to Union (Pavlovich).

## ZModeler (B, Z, M)

Hover an element, press Space, then pick Action, Target, Options and Modifiers. The left-most entry
in each row is the default.

- **Polygon actions:**
  - QMesh (default): snaps and stays welded; Shift moves along the normal; a negative drag deletes.
  - Extrude (no snapping); Inset (Equidistant, Legacy; 2026.0 crease modifiers: Do Not Crease is the
    default, Crease New Edges creases the inner loop and the outer supporting edges for a crisp
    inset, Crease Inner Poly only the inner loop for a rounded one [strings; 6KZiNEO65YY
    00:01:40-00:02:44]); Bevel (2026.2.1 modifiers All Edges, Outer Edges, Inner Edges [strings]);
    Bridge (Two Polys, Connected Polys with Align to Normal); Delete; PolyGroup (Shift tap copies a
    group); Crease (Alt after clicking uncreases); Insert NanoMesh; Selection (2025.2).
  - Targets: A Single Poly, PolyGroup All, PolyGroup Island, Flat Island, Polyloop.
- **Edge actions:** Insert Single or Multiple EdgeLoops; Alt deletes; Interactive Elevation makes
  fillets; 2026.0 adds Crease or Do Not Crease (default Do Not Crease: a loop added with Dynamic on
  holds nothing until Crease is picked; the double dotted line confirms it); Multiple EdgeLoops can
  keep or alternate polygroups while creasing; Single EdgeLoop Snap Off, Quarter, Half or Custom,
  with Ctrl taps to cycle during the drag (easier to see with Dynamic off). Also Bevel, Bridge,
  Close (Concave = Close Holes, Convex = a domed cap), Collapse, Slide, Crease (EdgeLoop Complete or
  Partial), Extrude (Snap To Surface for retopology).
- **Point actions:** Do Nothing on the other element types stops mis-clicks.
- **Tips:** tap to replay the last action at the same value; Alt paints a temporary group (Polygon
  Selection in 2025.2 does it without Alt); X symmetry overrides the PolyGroup All target.
- **ZModeler brushes and presets:** Brush > Clone, then Save As (into the Asset Directory in
  2026.1). Presets go in the Space menu (2025.2; preset saving fixed in 2026.2.1). A saved brush or
  preset holding the action, target and crease option is what the bridge route (procedures P14)
  replays with one canvas input.
- **Build check:** before 2026.2.1 ZModeler could default to Extrude instead of QMesh when a face
  was selected; check the polygon action before trusting a QMesh step.

## Clip, Trim, Slice, Knife, Crease curves

- **Pick:** hold Ctrl+Shift and choose ClipCurve, TrimCurve, SliceCurve, KnifeCurve, KnifeLasso,
  KnifeRect, KnifeCircle or CreaseCurve in the Brush palette. From then on Ctrl+Shift calls that
  brush. `Brush:ClipCurve` is bound in `StartupHotkeys.txt`.
- **Draw:** Ctrl+Shift drag, then release the keys and keep the pen down. Alt tapped once bends,
  twice makes a sharp corner; Space moves the line. The drag direction or an Alt on release flips
  the Clip side.
- **Modifiers:** Ctrl+Shift+Space opens the modifier menu (Brush > Clip Brush Modifiers): Brush
  Radius (BRadius, a gap equal to Draw Size; hold Alt before release), By Polygroup, Split To Parts
  (2024), UnClip.
- **Rules:**
  - Clip never changes topology; never clip past the widest part.
  - Slice and Trim ignore symmetry: Mirror And Weld after.
  - Knife works with symmetry but cannot cut holes through the middle.
  - Slice, Trim and Knife refuse subdivision levels.
- The "Use Legacy TrimCurve" preference exists in 2026.2.1 [strings; location verify].
- **Visibility slot** (Ctrl+Shift, SelectRect or SelectLasso):
  - click a group to isolate it; drag on empty canvas to invert; tap to show all;
  - Ctrl+Shift+A grows to the whole connected part; Ctrl+Shift+X and Ctrl+Shift+S grow and shrink.

## Gizmo and deformers

- **Gizmo:** W, E, R move, scale and rotate; Y toggles the TransPose line.
- **Pivot:** Alt+click the surface to align the Gizmo to it. Unmasked Mesh Center and Reset Mesh
  Orientation (Alt) are operators; Sticky mode plus 1 repeats the last offset.
- **Deformers:** the gear icon opens Bend Arc, Bend Curve (set Curve Axis first), Taper, Twist,
  Deformer (FFD, Hard, Soft), Extender, Flatten (Slice Topology), Slice, Multi Slice, Bevel, Crease,
  Project Primitive, and Remesh by DynaMesh, Union, ZRemesher or Decimation. Drag the cones; commit
  with W or gear > Accept. Deformers refuse meshes with levels.
- **Local symmetry:** L.Sym follows the Gizmo center since 2023; turn its Dynamic toggle off for the
  classic behavior.

## IMM, NanoMesh, ArrayMesh

- **IMM brushes:** B, I, then M for the IMM Viewer (tabs since 2026.1).
  - DragRect by default; all stroke types since 2024.
  - Ctrl at the start of a drag snaps to the brush size. Alt stretches; Shift aligns to the nearest
    world plane; Space slides.
  - Dots with LazyMouse sets spacing through LazyStep (2 touches, 2.5 rivets). Curve Mode uses Curve
    Step (1 touches).
  - Automask Mesh Insert masks all but the new part: split it with Split Unmasked Points.
  - Z Intensity sets height; Strength Multiplier goes beyond it; Projection Strength conforms the
    part; Brush > Depth > Imbed sets the seating depth.
- **Create:** Brush > Create InsertMesh, Create InsertMultiMesh (all SubTools, folders become tabs),
  Create NanoMesh Brush. Unify and orient in an orthographic view first, name SubTools, then Brush >
  Save As into the Asset Directory.
- **NanoMesh:** ZModeler polygon action Insert NanoMesh (target PolyGroup All; a new NanoMesh brush
  defaults to A Single Poly); Tool > NanoMesh sliders (ZRotation with ZRVar for variation; Pattern H
  Tile, V Tile, Border, Corners; Align To Normal; Show Placement off); Shift during the drag adds a
  second index; Edit Mesh swaps the source, then Deformation > Unify fixes its size.
- **No face where a bolt goes:** drag a plane primitive, split it off, turn its Dynamic off, insert
  the NanoMesh on it, Show Placement off (Chervenka [00:20:15]).
- **Macro > Create Instance Subtool** (shipped) turns the selected SubTool into a NanoMesh instance
  on a 2 x 2 plane; it ends with an info note that must be closed.
- **Mesh From Brush:** Tool > Geometry > Modify Topology > MeshFromBrush replaces the SubTool with
  the current InsertMesh brush's mesh (bubble help "Create Mesh From Brush") [strings]; Chervenka
  duplicates a SubTool first, then ArrayMesh (Reset, Lock Position, Lock Size, Repeat, Rotate Z
  Amount 360), then Convert To NanoMesh for rotation variation [00:21:24]-[00:24:18].
- **Create InsertMesh prompt:** with an insert brush already selected, ZBrush asks APPEND or NEW
  [strings]; select a plain brush first to avoid it.
- **Levels block insertion:** keep a hidden, level-free placeholder PolyMesh3D at the top of the
  list, scaled inside the model, and insert while it is selected (Pavlovich QGNn1-ey6ME
  [00:14:07]-[00:15:46]).
- **ArrayMesh:** Tool > Array Mesh: turn it on, set Repeat, pick a mode (Offset, Scale, Rotate,
  Pivot) and its X, Y, Z Amount, or use TransPose mode to drag them. Then Make Mesh or Convert To
  NanoMesh.

## Sculpted hard-surface brushes (concept route)

- **hPolish** (B H P): Preserve Edge on; oversize it; Alt builds up, no Alt digs. **TrimDynamic** (B
  T D): bevels by breaking edges.
- **Planar and PlanarCut:** plane from the first contact. **TrimFront and TrimHole:** cut by camera
  angle.
- **Grooves:** Orb_Cracks makes a V groove (Lazy Mouse on); Dam_Standard with Alt raises a ridge
  that insists on the edge. The Clay brush with Alt makes a 45-degree chamfer (Plouffe).
- **Protection:** Brush > Auto Masking > BackfaceMask for thin parts; Brush > Depth > Depth Mask
  protects neighbors.
- **Move with AccuCurve** straightens edges.
- LightBox brushes sit in the Maxon tab (`Lightbox/Brushes`) since 2026.1.

## Masks, layers and mesh integrity

- **Mask cleanup (Klimer):** Tool > Masking > BlurMask, Inverse, BlurMask, Inverse, repeated; every
  corner gets the same fillet and stray bits go [00:46:21]-[00:47:32].
- **Mask by Polypaint:** Tool > Masking > Mask By Color > Mask By Polypaint, a color-pick dialog
  (GUI); Mask by Hue gives graded masks. Plan pockets and panels in polypaint first, one color per
  region (Pavlovich FAFtW_8zB5Q).
- **Layers:** Tool > Layers > New, then REC; the layer slider at a negative value carves in;
  Duplicate doubles the strength; Bake All commits. Layers break when geometry is added or removed
  (Klimer [00:49:08]).
- **Mesh Integrity:** Tool > Geometry > MeshIntegrity > Check Mesh Integrity reports through a note
  ("Mesh integrity test completed successfully" or "failed ... Please 'Fix Mesh'"); Fix Mesh repairs
  [strings; reference doc].

## Handoff features (2023 to 2026.2)

- **Substance Bridge (2026.2.0):** Texture > Substance Bridge: Send to Painter with All, Visible or
  Active; Subdivision Level Current or Low & High; Auto-Bake Maps; Smooth Normals; Send PolyPaint (a
  fill layer); Texture Sets Per Subtool or Per PolyGroup; Force UV Auto-Unwrap is global and strips
  existing UVs from every SubTool. Each send makes a new Painter project (VD 3.6).
- **Native UVs (2023):** Tool > UV Map > Create (Unwrap): Unwrap, Auto Seams, Creased Edges (seams
  on creases), Symmetry; run at the lowest level (VD 3.5).
- **Retopo brush (2026.1):** the first click asks Yes (a new retopo SubTool above the reference) or
  No (edit the current one); it switches on PolyFrame and transparency; a SubTool with levels cannot
  become the retopo mesh; Alt+drag extrudes edges, Ctrl during extrusion sets loop counts (VD 3.5).
