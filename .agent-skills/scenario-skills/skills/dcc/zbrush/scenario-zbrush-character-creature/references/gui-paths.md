# GUI paths: the same procedures by hand (for a computer-use agent or a human)

Palette paths, hotkeys, brushes and settings behind procedures C1 to C20. Hotkeys come from the
source videos (2018 to 2025 builds); treat any hotkey as [verify] on 2026.2.1. On macOS, ZBrush docs
write "Ctrl" for Command in most places, but Control+W assigns a polygroup and **Cmd+W quits
ZBrush** since 2023.0.1: never send Cmd+W. Brush files named below exist in
`/Applications/Maxon ZBrush 2026/ZData/BrushPresets` or `Lightbox/Brushes` (local listing
2026-09-24) unless marked "not shipped". In the palette the brush file DamStandard.ZBP shows as
Dam_Standard, but the item path `Brush:Dam_Standard` did not resolve through the SDK (README): a
script selects it through `zb_ops.select_brush`.

## Navigation and review (C1)

- **Views.** Rotate with Shift for snapped views. P toggles perspective. F frames. Transform > PolyF
  shows the wireframe.
- **Materials.** MatCap Gray for form, SkinShade4 for folds (Pavlovich), Flat Color for silhouettes.
  A raking light comes from Light palette placement.
- **Before copy.** Tool > SubTool > Duplicate, then Tool > Geometry > X Position to park it beside
  the original (Kingslien judges beside a duplicate).
- **Upside down.** Rotate the model 180 degrees on screen (Costa).
- **Renders.** BPR with Shift+R; Redshift in Render > Redshift Renderer
  (scenario-zbrush-paint-render), the in-ZBrush route for the three-light SSS check: sharp detail
  must survive in the highlights.
- **Painter route.** Texture > Substance Bridge (2026.2): Send to Painter, Low & High, Auto-Bake
  Maps; Force UV Auto-Unwrap off when UVs exist.

## Masses and face (C2 to C4)

- **Block-in.**
  - Move is B, M, V: Dots, Z 51, Focal Shift 0.
  - Clay block-in: ClayBuildup is B, C, B, at Z 20 and Focal Shift -56 as a stand-in for
    RK_BallStylus (not shipped).
  - TrimAdaptive, Z 100, Focal Shift -83, for the forehead box.
  - Standard is B, S, T: Dots, Z 25, for the mouth line.
  - Inflat, Dots, Z 10, for the mouth-corner blend. (Kingslien frames.)
- **Carving.** Alt inverts ZAdd to ZSub.
- **Sculptris Pro.** The top-bar S icon, or Stroke > Sculptris Pro; delete levels first (Tool >
  Geometry > Del Lower and Del Higher). Brush > Depth > Imbed lowered for the nostril.
- **Masks.**
  - Hold Ctrl for MaskPen or MaskLasso; Ctrl+Alt removes mask.
  - Ctrl-click on the masked model blurs the mask (Pablo); Ctrl-click on empty canvas inverts it
    [verify].
  - Tool > Masking > BlurMask, Inverse, Clear.
  - Mask By Cavity, with its Blur and Intensity sliders and Cavity Profile curve; Mask By Smoothness
    (Range, Falloff); Mask PeaksAndValleys; Mask Ambient Occlusion.
- **Polygroup isolation.** Ctrl+Shift click isolates a polygroup; Control+W groups the visible part.
- **Auto-masking.** Brush > Auto Masking > Mask By Polygroups at 100 keeps a stroke inside the
  polygroup it starts on (shipped macro "Toggle Mask By Polygroups").
- **Deformation sliders.** Tool > Deformation: Offset (percent of the unit radius), Size (100
  doubles), Inflat, Smooth, Polish, Rotate, Bend, SBend, Twist, Taper, Gravity. Click the X, Y, Z
  letters inside a slider to constrain it to world axes.
- **Symmetry.** Transform > Activate Symmetry, >X<; posed figures: Transform > Use Posable Symmetry
  (Eaton).

## Stack and layers (C5, C6)

- **Divide.** Tool > Geometry > Divide (Ctrl+D), with Smt off for the first levels when joints must
  stay sharp (Eaton). SDiv slider; Lower Res and Higher Res; Del Lower and Del Higher.
- **HD Geometry.** Tool > Geometry HD > DivideHD, only on a stack planned for it from the start: 3
  to 4 regular levels (top 1 to 2M), then 3 to 4 DivideHD (J Hill, Costa). On a 6 or 7-level regular
  stack, stay regular.
  - Hide the polygroups you do not need before entering (Costa); Auto Groups With UV gives one group
    per UDIM.
  - Enter a region: A over the mesh, with perspective off and aimed off the front axis (Costa).
  - Preview the HD model: A with the cursor away from the model.
  - Solo shows only the HD region.
  - Region size comes from Preferences > Mem > MaxPolyPerMesh.
  - BPR of HD: Render > Render Properties > HDGeometry.
- **Layers.**
  - Tool > Layers > New (at the top level; turns REC on).
  - The REC circle on the layer row turns recording off, at the top level only.
  - Eye icon, Intensity slider.
  - Bake All, Split, Duplicate, Delete.
  - Rename (a text prompt).
  - Record Deformation Animation writes an MDD file.
- **Morph targets.** Tool > Morph Target > StoreMT, Switch, DelMT. The Morph brush is B, M, O.

## Reprojection with danger zones (C19)

- At the top level: Tool > Morph Target > StoreMT, then Tool > Layers > New (FlippedNormals).
- Only source and target visible (Solo, or the SubTool eye icons).
- Eye, mouth and nostril interiors: Ctrl+Shift click the interior polygroup to isolate it, Tool >
  Visibility > Grow once or twice until it passes the lid, mask the visible part (Ctrl-click on the
  model, or Tool > Masking), Tool > Visibility > ShowPt.
- Tool > SubTool > Project: PA Blur lowered, then Project All.
- Walk the levels with the SDiv slider, toggling the layer's eye icon; look at eyes, mouth,
  nostrils, armpits, between the fingers, crotch.
- Repair with the Morph brush, or mask, Tool > Masking > Inverse and Project All again on the
  region. Do not smooth.

## Skin and scales (C7 to C11)

- **Surface Noise.** Tool > Surface > Noise opens NoiseMaker the first time.
  - NoisePlug opens the generators (Scales, Snake Skin, Voronoi...). Set Strength to 0.5 or -0.5
    before opening it, to see the preview.
  - Alpha mode loads a 16-bit tiling height map.
  - Strength by Mask and Magnify by Mask; Open and Save presets.
  - Apply To Mesh; SNorm 100 at high strength.
  - Transform > Quick 3D Edit must be on for the preview.
  - Snake Skin: raise Scale Variability and Amplitude (doc). UV projection can seam; check a
    close-up.
  - Alpha Angle, X/Y Scale and Offset (NoiseMaker 2.0, 2026.0) turn the tile to each region's flow;
    paint a region mask first, then Magnify by Mask and Strength by Mask 1.
- **Alpha tile** (Henning):
  - Tool > Plane3D, Make PolyMesh3D, Smt off, Divide to about 1M.
  - Document > Width and Height 1024 > Resize, Ctrl+N, redraw the plane, F, perspective off, Actual.
  - Alpha > Transfer > GrabDoc; Alpha > Modify > MidValue 50 (he records a macro on Alt+A); Alpha >
    Export.
  - Calibration dots: mask a small circle in a corner, Tool > Deformation > Inflate typed to 50 (not
    dragged), -50 in another corner. Both taller and deeper than any detail.
  - Test on the model three times while building: grab, Alpha > Modify > Surface, switch to the
    creature, new layer, DragRect with Focal Shift -100, look, delete the layer.
  - Save finished alphas in the Asset Directory: Preferences > Asset Directory > Open Directory,
    then LightBox > Alphas (2026.1+).
- **Stamping.**
  - Stroke > DragRect, DragDot or Spray; Draw > Focal Shift -100 (full stamp) or 0 (faded).
  - Alpha palette; Alpha > Modify curve for pore profiles (Costa).
  - Spray settings: Placement, Scale, Color, Flow (Costa's stubble: color near 0, flow toward 0).
  - Brush > Modifiers > Imbed.
- **Pores and wrinkles.**
  - Pores: Standard + a pore alpha on DragRect (Costa's Antro_ brushes are not shipped).
  - Wrinkles: Standard + Alpha 39, alpha curve sharpened (Costa).
  - Fine wrinkles: Standard, Spray, Alpha 60, Z 3, LazyStep 0.02 (J Hill).
  - Lips: Dam_Standard (B, D, S), Dots, LazyMouse on, LazyStep 0.04, LazyRadius 4, Z 33 (J Hill).
  - Elastic, cloned, on Spray with Alpha 16 for the directional pass (Costa).
  - Inflat Z 1 to 2 with a big Draw Size for organic micro texture.
- **Smoothing.** Hold Shift; pick the Shift brush in the Brush palette while holding Shift. Smooth
  Stronger and SmoothDirectional are in Lightbox > Brushes > Smooth.
- **Scale brushes that ship:** Lightbox > Brushes > Scales (ScalesLizard, ScalesSnake1 and 2,
  ScalesFish...). Alphas: Lightbox > Alphas (Scaly Skin, Leathery Skin, Bumpy Skin).
- **Color passes** (scenario-zbrush-paint-render): Rgb on, low Rgb Intensity 5 to 10, Spray (Costa).

## Asymmetry (C12)

- X toggles symmetry off, then use a large Move brush (J Hill).
- Or: Tool > Morph Target > StoreMT, sculpt, then Morph brush strokes with symmetry and RGB off
  (Lazov).
- Deformation > SmartReSym restores symmetry from a masked side.

## Cloth (C13 to C15)

- **Fold brushes.** Standard (Z 25), Clay (B, C, L, Z 80), Move (big Draw Size about 372), Smooth (Z
  100, Focal Shift -55) (Grassetti frames). Tension points are small appended spheres.
- **Dynamics palette** (dock it in a tray):
  - Simulation Iterations, Strength, Firmness, On Masked, On Brushed, Fade Border, Self Collision,
    Floor Collision, Allow Shrink, Allow Expand.
  - Gravity, Gravity Strength, Liquify, Set Direction.
  - Inflate, Deflate, Expand, Contract, each with an Amount and X, Y, Z buttons.
  - Collision Volume group: CollisionVolume, Recalc, Resolution, Inflate.
  - Run Simulation, stopped by a click in the document or the Spacebar; Max Simulation Points.
  - Draw > Elv sets the floor height (-1 follows the lowest SubTool).
- **Dynamic Subdiv.** Tool > Geometry > Dynamic Subdiv: Dynamic (D on, Shift+D off), SmoothSubdiv,
  Thickness, Offset, Apply.
- **Cloth brushes** (B, C, then a letter): ClothHook (B, C, K), ClothPull, ClothMove, ClothFold,
  ClothPinch, ClothPinchTrails (Brush > Modifiers > Trails 10 to 16), ClothSlide, ClothTwister,
  ClothWind, ClothDimple (DragDot, then wiggle in place), ClothInflate, ClothBall, ClothNudge,
  TransposeCloth (B, T, C, with the Gizmo).
- **Mesh Extract.** Mask, then Tool > SubTool > Extract (Thick 0.01 cloth, 0.03 leather; S Smt),
  Accept, then clear the mask on the source.
- **Close holes.** Tool > Geometry > Modify Topology > Close Holes, on a duplicate of an open
  collider.

## Fur and hair (C16)

- **FiberMesh.** Tool > FiberMesh > Preview, Accept, Open and Save presets (Lightbox > FiberMeshes;
  presets such as Fibers5.ZFP ship).
  - Modifiers: Max Fibers (thousands), Length, Coverage, Gravity (set the model orientation first),
    Twist, Revolve, Segments, Base and Tip Color, Profile (keep 1), Imbed, By Area, Clumps.
  - Width, Length and Color Profiles are curve editors.
  - Preview Settings: Fast Preview, PRE Vis.
  - BPR Settings: Sides, Anisotropic.
- **Groom brushes** (Brush > Groom): GroomHairToss, GroomerStrong, GroomBlower, GroomClumps,
  GroomTurbulence, GroomSpike, GroomSpinKnot and more. Turn RGB off while grooming.
- **Visibility tricks.** Color > FillObject on the fibers in a contrasting color; Document > Double,
  then AAHalf, for anti-aliased fibers.
- **Masking fibers.** Tool > Masking > Mask By Fibers: FiberMask, FiberUnmask, FiberMask Profile
  (left side = root).
- **Hair cards.** Brush > CurveFlat or CurveFlatSnap: drag a card, tap off to commit; Curve Res in
  Brush > Modifiers.

## Horns (C17)

- **Curve IMM** (Pablo):
  - Brush > Create InsertMesh > New from a straight side view with perspective off.
  - Stroke > Curve Mode.
  - Brush > Modifiers: Stretch, Curve Res 10, max bend 45 to 50.
  - Stroke > Curve Modifiers: Size on, falloff flipped.
  - Brush > Depth: Imbed 0; Lock Start; Brush > Save As.
- **Tube route.**
  - Tool > Cylinder3D, DynaMesh (Ctrl-drag on empty canvas re-meshes).
  - Transform > Activate Symmetry, Y, (R) radial with Radial Count 8, then 5, then 3.
  - Keep the straight, detailed tube as a master: Tool > SubTool > Duplicate, and decimate only the
    copy.
  - Zplugin > Decimation Master: Pre-process Current, % of decimation, Decimate Current.
  - Cracks on tusks and spikes in stages, large to small: Dam_Standard at full size, then smaller;
    Clay for a bone and rock feel (Starkie). Orb_Cracks is third-party and not shipped.
  - Gizmo 3D (W, then the gear): Taper, Bend Arc, Twist, Bend Curve with 5 or 6 points. Alt-click
    resets the gizmo orientation; do not do this after placing the horn.
- **Spiral3D.** Tool > Spiral3D, then Tool > Initialize sliders, then Make PolyMesh3D.

## Eyes and scale (C18)

- **Eyes.** Macro > Append Eyes (shipped): Insert Sphere3D, then Tool > Geometry > X, Y, Z Position
  and XYZ Size, Mirror And Weld on X, Material > ToyPlastic.
- **World scale.** Zplugin > Scale Master sets millimeters (scenario-zbrush-retopology-export owns
  export scale).
