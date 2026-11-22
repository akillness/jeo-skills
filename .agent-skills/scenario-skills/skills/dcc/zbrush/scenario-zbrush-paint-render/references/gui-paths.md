# GUI paths, hotkeys and settings (for a computer-use agent or a human)

The same operations as `procedures.md`, as a person does them in the ZBrush 2026.2.1 interface.
Tags: [doc] Maxon help; [expert] shown by the named expert; [strings] label present in this build's
UI string table (`ZData/ZLang/english/UInterface.zsc`, 2026-09-24); [verify] not confirmed. macOS:
docs write Ctrl for Command, but Control+W assigns a polygroup and Command+W quits ZBrush (version
deltas 3.13): never press Command+W.

## Paint setup

| Action                                           | Where                                                                                                                                                 | Notes                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Paint without sculpting                          | top shelf: Rgb on, Zadd and Zsub off                                                                                                                  | FlippedNormals 00:03:09 [expert]                                                                 |
| Color plus material / color only / material only | Draw: Mrgb, Rgb, M                                                                                                                                    | decides what FillObject assigns [doc]                                                            |
| Paint strength                                   | Draw: Rgb Intensity                                                                                                                                   | also scales FillObject (FlippedNormals 00:02:51) [expert]                                        |
| Main and secondary color                         | Color palette picker; V swaps (SwitchColor [strings]); C picks the color under the cursor; Alt paints the secondary color (Alternate)                 | [doc] [expert]                                                                                   |
| Fill the SubTool                                 | Color > FillObject (tooltip "Fill 3D Object Masked" [strings])                                                                                        | masked and hidden parts stay untouched [expert Pavlovich mW4P 00:06:30; n5 01:00:48]             |
| Fill every SubTool                               | Zplugin > SubTool Master > Fill, "color and material"                                                                                                 | Pavlovich FvpG 00:06:50 [expert]                                                                 |
| Show or hide paint                               | Tool > Polypaint > Colorize, or the paintbrush icon of a SubTool; Shift-click the icon for all SubTools                                               | on an unpainted SubTool Colorize fills white [doc]; Shift-click [expert Pavlovich 040h 00:12:23] |
| Paint from groups                                | Tool > Polypaint > Polypaint From Polygroups                                                                                                          | [doc]                                                                                            |
| Paint from a texture                             | Tool > Polypaint > Polypaint From Texture                                                                                                             | divide to about the texture's pixel count first [doc]                                            |
| Global recolor                                   | Tool > Polypaint > Adjust Colors (dialog: Tint, HSV Hue, HSV Saturation, HSV Intensity, RGB Intensity, RGB Contrast, RGB Gamma; OK, Cancel [strings]) | Pablo 01:27:43, 01:31:53 [expert]; blocks a script? [verify live_p06]                            |
| Solo one SubTool                                 | Solo button on the right shelf                                                                                                                        | eyes stop recoloring with the active SubTool (Pablo 01:12:40) [expert]                           |
| Stage snapshot                                   | Shift+S (canvas snapshot); or Duplicate the SubTool per stage                                                                                         | Pablo 00:55:58, 01:05:27 [expert]                                                                |

## Brushes, strokes, alphas for paint

- Standard brush for everything (FlippedNormals "one brush, one alpha, one hotkey" 00:16:00)
  [expert].
- Stroke > Color Spray with Alpha 07 or 08 for speckled zones; Alpha 22 at full intensity for veins;
  doc: Colorized Spray, Draw Size 150 cover, 100 or less zones at RGB about 30, Alpha 25 spatter,
  Alpha 07 wash at RGB about 10 [expert] [doc].
- Stroke > Modifiers color variance about 0.5 (Pablo 01:34:01, uncertain caption) [verify].
- Soft custom brush and Color Spray blends; C to sample and paint across instead of blurring
  (FlippedNormals 00:06:01) [expert].

## Symmetry for paint

- Transform > Activate Symmetry, X. For a posed or asymmetric sculpt with symmetric topology:
  Transform > Use Posable Symmetry; fails after DynaMesh or Sculptris Pro (FlippedNormals 00:03:09
  to 00:04:01) [expert].
- Mirror paint side to side: paint one side; in Undo History Ctrl+click the marker before the paint;
  Tool > Masking > Mask Changed Points; Flip By Posable Symmetry; Inverse; Tool > Polypaint > Mirror
  By Posable Symmetry; Ctrl+click the marker again. Without a mask the mirror averages both sides
  [doc]. The undo-marker step is not scriptable; an agent paints with symmetry before posing instead
  [added].

## Masking for paint passes (Tool > Masking)

| Generator                                                              | Controls                                                                                                                                  | Notes                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Mask By Cavity                                                         | Blur (100 softens), Intensity (sharpens; negative inverts), Cavity Profile curve                                                          | view with Preferences > Edit > Masked Object Dimming 5 and Flat Color [doc] |
| Mask Ambient Occlusion (group Mask By AO)                              | Occlusion Intensity, AO ScanDist, AO Aperture, AO Rays                                                                                    | slow on millions of polygons (Pablo 01:37:25) [expert]                      |
| Mask By Smoothness                                                     | Range, Falloff: set before pressing                                                                                                       | fixed again in 2024 (version deltas 3.2) [doc]                              |
| Mask PeaksAndValleys                                                   | PVRange (Pablo 14), PVCoverage                                                                                                            | [doc] [expert]                                                              |
| Mask By Color                                                          | Mask By Intensity, Mask By Hue, Mask By Saturation (texture or polypaint)                                                                 | [doc]                                                                       |
| Mask By Polypaint                                                      | dialog, 8 color channels, tolerance, Blur up to 25                                                                                        | grayed out without visible polypaint [doc]                                  |
| Mask Adjust                                                            | Apply, Blur, Mask Adjust Profile curve                                                                                                    | absolute: change Blur between presses [doc]                                 |
| Mask Changed Points, Boost, Dilute, Grow, Shrink, Grow All, Shrink All | buttons                                                                                                                                   | [doc] [strings]                                                             |
| Canvas gestures                                                        | Ctrl+click canvas inverts; Ctrl+drag on empty canvas clears; Ctrl+click the mesh blurs; View Mask toggles the display (Pablo maps Ctrl+H) | [expert]                                                                    |

Zplugin > Ambient Occlusion (ships since 2021.6): distance, aperture, samples, resolution,
OcclusionVolume (include other SubTools), Recalc, Compute, output mask or color (polypaint), smooth
[strings]. Pablo: invert, tint through the mask [01:37:25]; Pavlovich: invert, navy, Fill Object
[mW4P 00:06:30].

## Spotlight (dial driven: a computer-use path)

- Texture > Import, Add To Spotlight (or double-click a texture in LightBox); Shift+Z toggles
  Spotlight; Z switches between the dial and painting; Radius above 0 or Z does nothing [doc].
- Dial: rotate, scale, move, nudge, clone, opacity (does not change the amount painted), fade, pin
  (repeat the spot under the dial center), restore, fill. Pure black is transparent. Save Spotlight
  and Load Spotlight store sets [doc].
- Brush > Samples > Spotlight Projection off uses the images as reference only; MidValue and Alpha
  Blur sliders since 2023.2 (version deltas 3.2) [doc].
- No texture displayed on the model while painting [doc].

## Texture and vertex color

| Action                                  | Where                                                                                                                      | Notes                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Map size                                | Tool > UV Map > UV Map Size; presets 512 to 4096                                                                           | [doc]                                                                                        |
| Planar, cylindrical, spherical, box UVs | Tool > UV Map: Uvp, Uvc, Uvs, Uvb [strings]; Delete UV [doc]                                                               | Uvp maps from the Preview window orientation [doc]                                           |
| Real UVs                                | Zplugin > UV Master > Work on Clone, Unwrap, Copy UVs, back to the original, Paste UVs; or Tool > UV Map > Create (Unwrap) | Work on Clone keeps polypaint (AskZBrush) [expert]; owner: scenario-zbrush-retopology-export |
| Bake paint to a map                     | Tool > Texture Map > New From Polypaint; Clone Txtr; Texture > Flip V (Flpv [strings]); Texture > Export                   | Pavlovich mW4P 00:07:49 to 00:08:36 [expert]                                                 |
| Fix seams, check overlaps               | Tool > Texture Map > Fix Seam; New From UV Check (red = overlap)                                                           | [doc]                                                                                        |
| Map batch                               | Zplugin > Multi Map Exporter: Texture from Polypaint, Map Size, Map Border high, FlipV, Create All Maps                    | FlippedNormals 00:29:59 to 00:31:54 [expert]                                                 |
| To Substance 3D Painter                 | Texture > Substance Bridge > Send to Painter, Send PolyPaint (fill layer)                                                  | 2026.2.0 (version deltas 3.6) [doc] [strings]                                                |
| Vertex color OBJ                        | Tool > Export with polypaint (Preferences > ImportExport)                                                                  | [verify preference name]                                                                     |

## Materials for judging and rendering

- Judge color: SkinShade4, MatCap White01, Flat Color (FlippedNormals 00:10:51; Pablo 00:44:58);
  Pablo's free Albedo Polypaint matcap is not installed here [expert].
- Form read: MatCap Gray (lead review default).
- BPR light passes: BasicMaterial, black color, Specular 84 (Pavlovich lEP7 00:15:28) [expert].
- Redshift materials (shipped in `ZData/Materials/RedshiftMaterials`): Basic, Clay, Plastic,
  RSPlastic, ShadowCatcher and about 60 more. Material > Modifiers: Use Material Color (0 =
  polypaint drives color), Is Shadow Catcher, Metalness, Reflect roughness, Reflect IOR, SSS amount,
  SSS scale, SSS Mode, Emission weight [strings] [doc]. Drag-and-drop crashed in 2025: select, M,
  Fill Object (Pavlovich FvpG 00:04:25) [expert].

## Render

| Action                | Where / hotkey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Notes                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Render                | Render > BPR, Shift+R                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | also Redshift when it is on [doc]                                    |
| Region render         | Ctrl+R with the cursor over the area; Render > Cursor                                                                                                                                                                                                                                                                                                                                                                                                                                                | [doc] [strings]                                                      |
| Stop                  | Esc (a bucket render stops and still denoises)                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Pavlovich 040h 00:45:09 [expert]                                     |
| Display modes         | Render > Flat, Fast, Preview, Best                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Flat for pure color (Pablo 01:03:11) [doc]                           |
| BPR switches          | Render > Render Properties: Shadows, AOcclusion, SSS, Transparent; BPR Shadow and BPR AO sub-palettes (Rays, Angle, Res, Blur)                                                                                                                                                                                                                                                                                                                                                                       | turn Shadow and AO on before rendering to get those passes [doc]     |
| BPR passes            | Render > BPR RenderPass thumbnails: Com, Img, Dep, Shdw, AmOc, mask, SSS, Floor [strings]; click to save                                                                                                                                                                                                                                                                                                                                                                                             | Shaded pass edge not anti-aliased on purpose [doc]                   |
| Redshift              | Render > Redshift Renderer: Redshift, Floor Material, Floor Color, Gamma Correction (1.8 macOS), Render Quality, Denoising, Error Threshold, Samples Per Pixel, Progressive Rendering, Progressive Iterations, Primary and Secondary GI Engine Quality, GI Bounce, GI Rays, Depth Of Field, Focus Depth, Focus Radius, Disable DynamicSubdiv, Disable ArrayMesh, Disable NanoMesh, Redshift Baker 360 with Bake Longitude Steps, Bake Latitude Steps, Bake Color Mode, Preserve Highlights [strings] | needs the Redshift application (uninstalled on this Mac, 2026-09-24) |
| Redshift AOVs         | Render > Redshift AOV Passes: P.All, N.All (denoise all), per-pass buttons (Bty, GI, Bkgrd, BuNo, Obj ID, W Pos...), Export All to PSD [strings]                                                                                                                                                                                                                                                                                                                                                     | Pavlovich lEP7 00:00:40 [expert]                                     |
| Render Recall         | Render: Store Renders, Render Recall slider, Previous Recall, Next Recall [strings]                                                                                                                                                                                                                                                                                                                                                                                                                  | last 100 renders; DOF not stored [expert]                            |
| Per-SubTool smoothing | Tool > SubTool > Redshift Properties > Smooth Surface                                                                                                                                                                                                                                                                                                                                                                                                                                                | low-res organic only [doc]                                           |
| Save presets          | Render > Save, Load; File > Save As a ZPR for lights and materials                                                                                                                                                                                                                                                                                                                                                                                                                                   | Pavlovich 01:05:28 [expert]                                          |

## Scene, camera, lights, document

- Perspective P; floor Shift+P; Draw > Elevation (-1 snaps to the lowest SubTool), Grid Size (raise
  it for shadows), Angle Of View (focal length 50 in Pavlovich's Universal camera) [expert]
  [strings].
- Draw > Cameras > Store Cam, Select Camera (repeatable views; the name prompt is a text dialog
  [verify]) [strings].
- Light palette: click the light dot to place it, click again to send it behind (rim), tap a bulb to
  select and again to switch it on; Intensity (keep 0.1 when an HDRI lights the scene), Shadow,
  color; Redshift Light Properties: Shadow Strength, Shadow Softness, Shadow Samples, Light Distance
  (1.1 default), Light Range, Intensity Multiplier, Decay Type, Decay Start [expert] [strings].
- Light > Background: environment texture, Longitude, Latitude, Tilt, Rotate With Object, Exposure,
  Gamma (2.2 for EXR; a JPEG sets 1), Redshift Exposure (default EXR looks dark: 0.35 to 1),
  Redshift HDR Shadows [expert] [strings]. LightBox > Texture > Panoramas.
- Document: Width, Height, Pro off to unlink them, Resize; the canvas clears, redraw the tool and
  press T (Edit); Zoom to see the frame, Actual for real pixels; Back color swatch [expert].

## Movies and turntables

- Movie > Doc (document only), Large (100 percent), Turntable (Record Turntable), Modifiers:
  turntable frames (180 default), Overlay Image and Title Image opacity 0; Play Movie; Export with H
  for highest quality; MP4, MOV on macOS; above 4095 px resized [expert] [doc].
- A Redshift render first, then Turntable, or it records viewport quality (Pavlovich FvpG 00:19:56).
  Escape did not stop it (00:21:00). With a movie in memory, Turntable asks "Export Existing" or
  "New Turntable" [strings].
- Timeline: Movie > TimeLine Show; click the timeline to key the camera; Ctrl+Shift click the slider
  renders every frame with Redshift (Pavlovich 040h 01:03:36) [expert].

## Hotkeys used here

C pick color; V swap colors; Alt secondary color; Shift+S snapshot; Shift+R render; Ctrl+R region
render; Esc stop; P perspective; Shift+P floor; Shift+Z Spotlight on or off; Z Spotlight paint mode;
T Edit; comma LightBox; D and Shift+D Dynamic Subdivision on and off [doc] [expert].
