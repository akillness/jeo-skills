# Expert notes: polypaint, rendering, presentation

The depth behind SKILL.md, by expert, with source and timestamp. Video ids resolve to URLs in
`sources.md`. `[added]` marks this skill's own reasoning or thresholds; `[strings]` marks labels
read from this build's UI string table (`ZData/ZLang/english/UInterface.zsc`, 2026-09-24), which
prove a label exists, not its palette position.

## 1. FlippedNormals: Henning Sanden and Morten Jaeger (8iAbH3zSQak, 2018)

Former senior film character artists (MPC, Cinesite). ZBrush 2018 on screen, tools unchanged
in 2026.

Principles

- The common failure is uniform beige "skin color". Real skin gets its hues from veins, fat and bone
  underneath [00:00:56 to 00:02:03].
- Color zones in thirds, from James Gurney's "Color Zones of the Face": golden or yellow forehead;
  red middle third (cheeks, nose, ears); blue, green or gray lower third in men (beard shadow). "Not
  a hard rule, just a tool" [00:00:31 to 00:01:29].
- Depth decides the hue. Where bone is near the surface the color is lighter and less saturated,
  "like red latex stretched over a fist" [00:20:50]. Thin skin shows blood; fat hides it [00:01:29].
- Paint broad first, like an underpainting or an airbrusher. The start looks bad on purpose
  [00:04:01 to 00:05:40].
- Organic speckle beats smooth gradients: Stroke Color Spray with Alpha 07 or 08 gives it "for free"
  [00:04:35 to 00:05:40]. Blend by sampling a neighbor color (C) and painting across, never by
  blurring [00:06:01].
- Polypaint is per vertex ("every vertex a color, not every polygon"). A lower level paints blurry.
  Paint only when the sculpt is done, and never add levels afterwards [00:08:17 to 00:08:50].
- Judge color on a neutral material: SkinShade4 (neutral but bright) or MatCap White01 (no crazy
  specular), plus a Flat Color view. A red or skin-tinted MatCap makes you overcompensate [00:10:51
  to 00:12:29].
- Value: darken selectively where light never reaches (inside the nostrils, deep creases). Avoid
  painting shadows in general [00:14:16 to 00:15:57].
- Contrast directs the eye. Put the strongest value or saturation contrast at the eyes, and spend
  most time on eyes and mouth, where digital doubles usually fail [00:18:44 to 00:20:22].
- Paint to be diluted. Matcaps flatter depth, and much of the variation "disappears the moment you
  put it into a shader", so exaggerate [00:25:26 to 00:26:13].
- Texture size follows vertex count. About 4M polygons needs about a 2K map (2048 x 2048 is about 4M
  pixels). A 4K map (16M pixels) is wasted on a 4M mesh, and soft paint would even survive at 1K
  [00:30:32 to 00:31:22].
- Hand paint the broad pass in ZBrush; pore-level color comes from polarized photos or projected
  scan maps in Mari [00:21:56 to 00:24:21].

Numbers

- FillObject applies at the current RGB Intensity: 10 percent fills at 10 percent [00:02:16 to
  00:02:51].
- Paint mode: Rgb on, Zadd and Zsub off, else you sculpt while painting [00:03:09].
- Rgb Intensity 100 at first, around 41 later; Z Intensity 25; Draw Size about 6 to 16 (frame
  readouts) [00:03:08 to 00:22:38].
- Alpha 22 at full intensity gives veins [00:21:23].
- Multi Map Exporter, Texture From Polypaint: Map Size by vertex count, Map Border high (frames show
  4 and 16), FlipV on, Create All Maps; UVs required [00:29:59 to 00:31:54].

Mistakes: painting on a lower level; adding levels after painting; a tinted matcap; shadows painted
everywhere; smeared lips on a character that needs tight lips [00:13:51]; a map too big for the
mesh; forgetting FlipV [00:31:54].

## 2. Pablo Munoz Gomez (d03QU-eUaPo, livestream 2025-10-01)

Concept and character artist, ZBrushLIVE presenter, Pablander Academy founder. The most
agent-friendly recipe in the sources: after a short zone map, almost every refinement is a mask plus
a color operation.

Order of work

1. Material: SkinShade4, or his free "Albedo Polypaint" matcap (no reflection, a little shading). A
   colored matcap contaminates the color and the export looks awful elsewhere [00:44:58 to
   00:46:36].
2. Zone map in pure hues. Fill pure yellow (Color > FillObject), then paint yellow at the top, red
   in the middle, blue (more cyan) at the bottom with symmetry on [00:46:36 to 00:48:11]. The
   choices "are not arbitrary" [00:55:26]:
   - Yellow where fat or bone blocks light: cranium, glabella, nose bridge, fat around the eyes,
     prominent cheekbones [00:49:16 to 00:49:49, 00:55:26].
   - Red where tissue is thin or SSS is strong: eyelids, ear cartilage, nostrils, mouth [00:50:21 to
     00:50:56].
   - Blue in hollows and in areas that receive less light: cheeks over the teeth, orbits, above the
     clavicle, parietal and occipital regions [00:50:56 to 00:52:37, 00:54:51].
   - Male: more blue low (stubble) [00:48:11]. Fat character: more yellow [00:48:42]. Female: less
     blue at the bottom, more red [00:54:18].
   - Duplicate the SubTool at each stage as a comparison frame [00:55:58].
3. Blend with texture: Color Spray with Alpha 08 in between colors, noisy breakup, checked in
   Render > Flat against Preview [01:02:03 to 01:03:46]. "Still looks like a clown" is the expected
   state here [01:05:27].
4. Cover with skin: a fleshy neutral color over the whole face at low opacity, so the zones shine
   through; then a lighter yellowish color; then saturated orange-red accents on membranes with a
   higher RGB Intensity and a smaller brush [01:06:35 to 01:12:08]. Darker skin: purple instead of
   blue, orange instead of red, same zones [01:06:35]. Experienced painters can skip the pure-hue
   stage [01:08:14].
5. Integrate: Solo so the eyes stop recoloring with the active SubTool; bluish desaturated tones,
   pink cheeks, a darker tone toward the center of the face, a dark mouth interior [01:12:40 to
   01:14:54].
6. Cavity pass at the highest level: Mask By Cavity; the raw mask is harsh, so shape it in Mask
   Adjust and Apply; invert; hide the mask display; paint a darker, redder color with a large brush;
   clear [01:16:40 to 01:20:29].
7. Smoothness pass: PeaksAndValleys tried with PVRange 14 and less coverage, then Mask By Smoothness
   with a larger Range; Mask Adjust; invert; Tool > Polypaint > Adjust Colors with the mask hidden:
   saturation down, hue toward yellow, intensity up, RGB contrast on blue; clear [01:26:05 to
   01:29:59].
8. Peaks and valleys pass on a region, a little more saturated and darker [01:29:59].
9. Wash: a very light color at large size and low intensity desaturates for realism [01:31:16]. He
   keeps the unwashed version because he likes saturation.
10. Creature tint on the whole mesh: Adjust Colors, Tint 1 to preview a pinkish red, then reduce;
    Hue, Saturation, Intensity; RGB Intensity per channel; RGB Contrast [01:31:53 to 01:33:29].
11. Color variance on the brush (Stroke > Modifiers, about 0.5) [01:34:01, uncertain caption]. Paint
    very saturated red where a later wash will pull it back [01:35:39].
12. Ambient Occlusion plugin: Zplugin > Ambient Occlusion > Compute makes a ray-traced AO mask with
    contact shadows, far more accurate and faster than Mask By AO on millions of polygons; invert;
    tint (test with green first), then a purple-red undertone [01:37:25 to 01:39:04].
13. Finish the back of the head to the level of the face [01:39:49].
14. Eyes: a dark iris over most of the visible eye; lighter at the bottom and darker at the top to
    fake the cornea lens; lighter toward the pupil; then rotate the eyes slightly apart, because
    straight eyes look dead [01:41:30 to 01:47:03].
15. Export: polypaint is vertex color. OBJ with polypaint into Marmoset or Blender, or Substance
    Painter as an albedo base [01:49:50 to 01:52:39].

Principles

- Saturation is the stylization dial. Realistic skin stays in the lower-left, desaturated half of
  the picker; crossing the middle takes it into stylized territory [01:10:30 to 01:11:35].
- Highlights desaturate toward the light color and shadows look more saturated. Pushing saturation
  past the natural norm reads as stylized, even under realistic light [01:22:45 to 01:25:00].
- Photo references are usually color-boosted: do not copy their saturation [01:35:06].
- Mask Adjust is the control point of every generated mask [01:17:45].
- Polypaint during sculpting is a "working polypaint" that holds the palette, not a texture
  [01:01:32].

## 3. Maxon documentation: polypaint, color, masking, Spotlight, texture maps

`sources/docs/paint-pose-render-print__polypaint-spotlight.md` (12 pages, 2026 help site).

- Polypaint needs no UVs and no fixed map size; resolution lives in the mesh ("Make sure there are
  sufficient polygons"). Spotlight is polypaint too (Polypaint; Spotlight basics).
- A displayed texture map hides polypaint: Texture Off before painting or projecting (Spotlight
  basics; Painting a Head).
- FillObject obeys the draw mode: Mrgb assigns color and material, Rgb color only, M material only
  (Color palette). The shipped CreateEyeballs macro stores Draw:Mrgb, Rgb, M and Color:R, G, B, sets
  Mrgb 1, fills, then restores all of them (macros doc).
- Colorize on an unpainted SubTool fills it white; afterwards it toggles the display (Polypaint
  reference).
- Polypaint From Polygroups turns group colors into paint; the reverse trip through a texture is
  "unlikely to be precise" (Polypaint reference).
- Painting a Head values: cover with a dull tone (Colorized Spray, Draw Size 150); zones with Draw
  Size 100 or less at RGB Intensity about 30; Alpha 25 for spatter; unify with a light near-white
  color at RGB Intensity about 10 "as a wash", never opaque in one spot. "The forehead is usually
  yellowish, the muzzle of the mouth is reddish and the ears have a slightly purplish tint. Think in
  terms of warm and cool color combinations."
- Mask By Cavity: Blur 100 softens, Intensity sharpens (negative inverts), a Cavity Profile curve
  maps depth to mask. View it with Preferences > Edit > Masked Object Dimming at 5 and the Flat
  Color material.
- Mask Ambient Occlusion: Occlusion Intensity enlarges the dark area, AO ScanDist the reach, AO
  Aperture the spread; view with Flat Color. Mask By Smoothness: set Range and Falloff before
  pressing. PeaksAndValleys: PVRange (falloff distance), PVCoverage (amount). Mask By Color
  (Intensity, Hue, Saturation) reads the texture or, without one, the polypaint.
- Mask Adjust Apply is "absolute rather than accumulative": repeated presses change nothing unless
  Blur changes.
- Mask by PolyPaint: eight color channels with tolerance, Blur up to 25; grayed out without visible
  polypaint.
- Flip and Mirror by Posable Symmetry: store an undo marker, Mask Changed Points, Flip mask by
  posable symmetry, Inverse, Mirror By Posable Symmetry. Without a mask, Mirror averages both sides
  (faded).
- Spotlight: import to the Texture palette, Add To Spotlight; Shift+Z toggles, Z paints; Radius 0
  disables painting; Opacity does not change the amount painted (RGB and Z Intensity do); pure black
  is transparent; Pin Spotlight repeats one spot; Nudge distorts to fit a sculpt.
- Convert a texture to polypaint: divide until the polycount is near the texture's pixel count ("a
  2k texture map has 4 million pixels in it. Your UVs only use 70% or less of that space so the
  pixel count is close to 3 million"), then Polypaint From Texture.
- Bake polypaint to a map: UVs at SDiv 1 (PUV, UV Master or outside, Store MT trick), UV Map Size
  2048, SDiv highest, Texture Map > New From Polypaint. Fix Seam repairs background color at seams;
  New From UV Check shows overlaps in red.

## 4. Michael Pavlovich: Redshift in depth (040hAJ3-cTw, 2025)

Director of Character, Weapon and Vehicle Art at Certain Affinity, ZBrushLIVE streamer. ZBrush 2025
on Windows.

- Turn Render > Redshift Renderer > Redshift on once; BPR or Shift+R then renders with Redshift;
  every render stays in the BPR and AOV slots [00:02:25 to 00:02:56].
- Perspective on (P) before rendering, or the render is orthographic [00:02:56].
- Floor: Shift+P; Elevation -1 snaps to the lowest SubTool; raise Grid Size so shadows are not cut
  [00:03:51 to 00:04:58, 00:37:50]. Store Cam for repeatable views; focal length 50 [00:05:16 to
  00:05:48].
- Color and material per SubTool: standard brush, ZAdd off, M or MRGB, RGB Intensity 100, Color >
  Fill Object. Filling turns Colorize on. Shift-click the Colorize icon toggles it for all SubTools
  [00:09:02 to 00:12:54].
- Ctrl+R renders a region; Escape pauses; Escape during a bucket render stops it and still denoises
  [00:13:25, 00:45:09].
- Smooth Surface is on for every SubTool by default and averages normals: "bruises" on low-poly
  meshes. Turn it off and use control loops or creases with Dynamic Subdivision. Crease Level one
  below SmoothSubdiv (3 with 4) gives a soft edge highlight; equal gives razor CG edges [00:14:01 to
  00:21:26].
- Keep the ZBrush main light on at 0.1 intensity: off makes material previews vanish [00:23:12]. The
  background slot lights the scene even with Use Default Panorama off [00:33:32]. EXR gamma 2.2; a
  JPEG loads at 1 and sticks [00:34:06 to 00:35:11].
- Shadow catcher: floor material Shadow Catcher, or any material with Is Shadow Catcher 1; floor
  reflections with Metalness 1 and low roughness [00:37:19 to 00:40:16].
- Render Recall keeps the last 100 renders with material, light, color and filter settings; compare
  side by side, re-render from a recalled state; depth of field is not stored [00:41:10 to 00:42:17,
  00:51:34].
- Speed ladder: a smaller document first, then Error Threshold (0.01 default; 1 took 4 s instead of
  9 s), then iterations; Progressive 64 default, 25 with denoise for checks, 1 is useless [00:28:52,
  00:43:00 to 00:47:55].
- Image size: Document Width 1920, Pro off, Height 1080, Resize, clear, redraw, Edit; tests at 720 x
  405 or 1280 x 720 [00:27:45 to 00:30:33].
- Use Material Color 0: polypaint drives color; keep the Base swatch white [00:52:05 to 00:53:52].
  Glass IOR 1.5, water 1.333, iron 2.95 [00:57:47]. SSS scale depends on units (C4D cm, ZBrush mm),
  mode 2 Random Walk most accurate [00:59:07]. Emission Weight 100 overrides polypaint and adds
  noise [01:00:34].
- Camera movie: keyframe camera positions on the Timeline, one Redshift render first, then
  Ctrl+Shift click the slider to render every frame; Export with H [01:02:00 to 01:04:42]. Save a
  render preset (Render:Save) and a ZPR for materials and lights [01:05:28].

## 5. Michael Pavlovich: Redshift quickstart and turntable (FvpG2tCP8Lw, 2025)

- ZPlugin > SubTool Master > Fill "color and material" fills every SubTool at once [00:06:50].
- Drag-and-drop of Redshift materials crashed his 2025 build: select the material, M, Fill Object
  [00:04:25].
- Use Material Color 1 overrides polypaint; setting it back to 0 still tints with the swatch, so set
  the swatch white [00:05:13 to 00:06:16].
- Loading the default EXR looks dark: raise Redshift Exposure from 0.35 to 1 [00:10:02].
- Turntable: Movie palette, Document, Large, overlay and background image opacity 0, frames (180
  default; he meant 30), then a Redshift render first; Movie > Turntable renders every frame with
  Redshift. Without the prior Redshift render it records viewport quality, a quick preview [00:19:24
  to 00:20:28]. Escape did not stop it [00:21:00]. Check the frame count before launching.

## 6. Michael Pavlovich: Redshift and BPR passes for compositing (lEP73nEu3Tc, 2025)

- Rebuild the beauty from passes so each component gets its own levels, hue and opacity; tuning
  beats re-rendering [00:04:34, 00:11:41].
- Document at print size: 3200 x 2133 px (4 x 6 postcard proportion) [00:01:13].
- Redshift AOVs: All, Denoise All; save Beauty, Diffuse, Reflection, Shadow, AO, GI, Depth, World
  Position, Bump Normal; skip unused ones. Add BPR Depth and Mask [00:02:18 to 00:02:38].
- Utility passes hide masks in single channels: check R, G, B of normals and world position
  [00:03:30].
- Blend modes: Diffuse base; Reflection Screen (or Soft Light for BPR reflections) with clipped
  Levels and Hue/Sat; Shadow and AO Multiply, tinted cool; GI Lighten; rim and fill Screen; bloom
  Screen [00:05:46 to 00:26:32].
- Keep a stored camera so every pass lines up [00:12:21]. Turn Redshift off before BPR passes
  [00:12:53].
- BPR AO: blur 1, resolution up, rays up a little; his Redshift AO looked better [00:12:55,
  00:20:25].
- Cheap BPR light passes: Standard Basic material (not Redshift), color black so only light shows,
  Specular 84 with a tighter curve, one light sent behind and left for "light rim", the other side
  broader and weaker for "light fill" [00:14:55 to 00:16:27]. Generic reflection: Colorize off for
  all, white, a shiny MatCap [00:13:49].
- Clown pass: Polyframe lines off, Flat Color, one polygroup per SubTool, white [00:16:50].
  Selections by part in the composite [00:19:20].
- Finishing: lens blur from depth, dodge, burn, fake SSS on midtones, bloom, background gradient
  [00:23:20 to 00:27:25].

## 7. Michael Pavlovich: Redshift Baker 360 (mW4P0T6tR7k, 2025)

- Any material can be baked: set up lights and materials as for a render, then Redshift Baker 360
  projects the look into polypaint from many angles [00:01:22 to 00:03:11]. Total steps = Longitude
  x Latitude (doc).
- Judge the bake with Flat Color in a neutral scene; if moving the light changes nothing, the bake
  worked [00:05:47]. MicroPoly in Dynamic Subdivision makes the preview look wrong [00:04:15].
- Polish: Adjust Colors; ZPlugin Ambient Occlusion mask with Occlusion Volume for all SubTools,
  inverted, a navy color, Color > Fill Object adds baked AO [00:06:18 to 00:07:06]. This is the
  expert evidence that FillObject paints through a mask.
- Texture: New From Polypaint, Clone Texture, Texture > Export as JPEG [00:07:49 to 00:08:36]. "An
  easy way to bake in some ambient occlusion, some lighting, and material properties to get a
  reliable color map" [00:08:05].

## 8. Maxon documentation: rendering (Redshift, BPR, LightCap, KeyShot, movies)

`sources/docs/paint-pose-render-print__rendering-redshift-bpr-keyshot.md`.

- Redshift is a separate application that must be installed; GPU if supported, else CPU. On this Mac
  `mx1 product list` shows Redshift "uninstalled, unlicensed" (2026-09-24): BPR is the renderer
  until Emmanuel installs it.
- BPR renders 3D models anti-aliased at full document size with all SubTools; Best is for 2D work.
- Smooth Surface: "designed for making low resolution and faceted meshes look good, so don't use it
  with high resolution meshes!"
- Redshift Polypaint Materials have Use Material Color off, so polypaint drives color; Preset Color
  Materials override it. Textures need a Redshift material (MatCaps will not show them); higher SSS
  Weight shows less polypaint (1 shows none); LightCaps are not supported by Redshift; Redshift
  materials hide polyframes.
- PBR: Metalness 0 to 1, keep Reflection Weight 1, dielectric IOR 1.4 to 1.6, SSS Mode 2 random walk
  for thin detailed geometry, Coat IOR 1 disables coat. Transmission needs Double on.
- Gamma Correction 2.2 on Windows, 1.8 on macOS.
- Tests: Disable DynamicSubdiv, ArrayMesh, NanoMesh. Render Recall does not reload the model. Region
  render Ctrl+R.
- AOVs: Beauty, Shadow (cast shadows as white), SSS, GI (multiplied by diffuse), Background,
  Diffuse, Reflection (no light speculars), Refraction; possibly AO, World Position, Bump Normal,
  Depth (flagged "may not make it into the release"). The 2026.2.1 string table lists Beauty,
  Shadow, AO, SSS, GI, Depth, Background, Bump Normal, Diffuse, Object ID, World Position,
  Reflection, Refraction and "Export All to PSD" [strings]. Depth filter Full for anti-aliased,
  Center Sample for exact depth.
- BPR passes: click a pass icon to save; Shadow and AO need their options on before rendering. The
  Shaded pass is not anti-aliased at the silhouette on purpose: composite with the Mask pass.
- Print resolution: pixels = inches x ppi (300 ppi for magazine or book); resize the document before
  starting.
- Redshift and Turntable/TimeLine: "Simply do a Redshift render first then do the Turntable."
- KeyShot bridge: one-way; save KeyShot renders yourself.
- Movies: MP4 on both systems, MOV on macOS since 2025; width or height above 4095 px is resized
  (version deltas 3.9).

## 9. Related experts outside this skill's folders

- Pavlovich, topology video (n5_cZK-9peg, 2023): for ZRemesher density he isolates a polygroup and
  uses Color > FillObject at Rgb Intensity 100, starting from a white fill [01:00:48 to 01:02:38].
  That is a zone fill by polygroup, done with Ctrl+Shift clicks the SDK cannot send.
- #AskZBrush, Joseph Drust (_ips3GhWI0s, 2016): Project All transfers polypaint only when the target
  has polypaint enabled; otherwise a popup asks. Project geometry first, color last [00:05:25 to
  00:06:29].
- #AskZBrush UV clips (cemmalvugFk): never unwrap the subdivided, painted SubTool in UV Master
  directly; Work on Clone, Copy UVs, Paste UVs, because control painting erases polypaint [00:04:00
  to 00:07:28].
- Character digest: Berger (Lightstorm) keeps color as a separate approval and presents grayscale to
  discuss anatomy [PcuC8K-bz44 00:06:33, 00:37:47]; Blizzard polypaints the blockout to read the
  design [FRZtVXpAokc 00:37:33]; Guillaume adds no color until the modeling is tight and checks a
  grayscale value read with the strongest contrast at the face [UthCuDB1IEQ 00:48:59]. Deciding
  condition: design exploration uses color, production and anatomy approval stay gray.

## 10. Where the experts disagree

| Choice                       | Option A                                                             | Option B                                                                                                    | Deciding condition                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First fill                   | A dull skin base (FlippedNormals 00:02:16; doc Painting a Head)      | Pure yellow, zones, skin only later (Pablo 00:46:36)                                                        | For an agent the zone-first route is more checkable (zone_report on each stage); experienced painters skip it (Pablo 01:08:14)                                 |
| Blending                     | Sample with C and paint across, never blur (FlippedNormals 00:06:01) | Color Spray passes, washes, Adjust Colors through masks (Pablo 01:02:36, 01:31:16)                          | Local transitions: sampling. Global temperature or saturation: washes and masked fills                                                                         |
| Painted shadow               | Only where light never goes (FlippedNormals 00:14:16)                | AO-driven purple undertone and dark mouth interior on purpose (Pablo 01:37:25, 01:14:54)                    | Final renderer with ray-traced occlusion and SSS: keep albedo clean. Polypaint-only presentation, stylized look or game albedo without AO: paint the undertone |
| Saturation                   | Exaggerate, shaders wash it out (FlippedNormals 00:25:26)            | Stay desaturated for realism, saturate for stylized, over-saturate before a wash (Pablo 01:10:30, 01:35:39) | Target style, and whether a wash or shader follows                                                                                                             |
| Mask Adjust Apply            | Pressed twice (Pablo 01:18:52)                                       | Absolute, repeats do nothing unless Blur changes (doc)                                                      | Trust the doc; change Blur between presses; live_p02 records the 2026.2.1 behavior                                                                             |
| Mask By AO vs AO plugin      | Mask By AO (doc)                                                     | Zplugin Ambient Occlusion, faster and more accurate on dense meshes (Pablo 01:37:25)                        | Millions of polygons or contact shadows between SubTools: the plugin (Occlusion Volume, Pavlovich 00:06:30)                                                    |
| Render path                  | Redshift with AOVs (Pavlovich)                                       | BPR with cheap light, reflection and clown passes (Pavlovich)                                               | Redshift only when installed; BPR for utility passes and on this Mac today                                                                                     |
| Low-poly smoothing at render | Dynamic Subdivision with creases (Pavlovich 00:15:43)                | Redshift Smooth Surface                                                                                     | Hard edges: creases. Smooth organic low-res shapes only: Smooth Surface; never on high-res (doc)                                                               |
| Turntable                    | Movie > Turntable after a Redshift render (Pavlovich FvpG 00:20:28)  | Scripted frames plus Document:Export [added]                                                                | An agent cannot stop Movie > Turntable (Escape failed for Pavlovich) and it asks about an existing movie [strings]: scripted frames, assembled outside ZBrush  |
| Main light "off"             | 0.1 (040h 00:23:12)                                                  | 0.001 (FvpG 00:07:23, caption)                                                                              | Either keeps material previews alive; never 0                                                                                                                  |

## 11. What transfers to an agent without a mouse [added]

- Transfers well (deterministic): FillObject at a chosen RGB Intensity, per SubTool, through a
  generated mask, through a hidden or split polygroup; every mask generator plus Mask Adjust,
  Inverse, Clear; AO plugin; Polypaint From Polygroups; Polypaint From Texture from an image the
  agent generates; New From Polypaint; BPR and Document:Export; scripted turntables; Python
  composites of passes; numeric color gates on Flat renders.
- Transfers partly: zone layout (a generated zone image through planar UVs, or synthesized Color
  Spray strokes with the proven stroke engine; placement is good, organic breakup is weaker than a
  hand); eyes and lips (a generated iris image on a spherical-UV eye; lips by mask or stroke).
- Stays weak: sampling blends with C (pixol_pick plus a low-intensity stroke is a rough stand-in),
  Spotlight dial work (clicks and drags on a widget: a computer-use path), curve widgets (Mask
  Adjust and Cavity profiles: keep defaults, vary Blur), the Adjust Colors dialog until live_p06
  shows it is scriptable.
