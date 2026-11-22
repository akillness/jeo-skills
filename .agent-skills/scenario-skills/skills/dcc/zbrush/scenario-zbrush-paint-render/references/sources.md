# Sources of scenario-zbrush-paint-render

Each entry: source, who, credential, where, what it is best for, best timestamps. Notes live in
`notes/polypaint/`, `notes/rendering/` and the stylized digest
`notes/stylized/_digest_stylized_hair_polypaint_visual.md` of the project.

## Evidence produced by this project (highest weight for what exists on this install)

- Offline tests `tests/code/zbrush-paint-render/test_zb_paint.py` (36 tests, pass 2026-09-24,
  results in `offline_results.json`). Best for: the color maths (Lab, HSV), zone checks, map
  budgets, blend modes, turntable rules, and the call order of the ZBrush-side functions against a
  fake.
- Live tests `tests/code/zbrush-paint-render/live_p01..p06_*.py` with `run_live.sh`: written, **not
  yet run in ZBrush**.
- UI string table of the installed build,
  `/Applications/Maxon ZBrush 2026/ZData/ZLang/english/UInterface.zsc`, read 2026-09-24 (the
  [strings] tag). Best for: labels that exist in 2026.2.1: Rgb Intensity; FillObject's tooltip "Fill
  3D Object Masked"; Tool:[Masking] groups (Mask By Cavity, Mask By AO, Mask By Smoothness, Mask
  PeaksAndValleys, Mask By Color, Mask Adjust); Zplugin > Ambient Occlusion items including mask and
  color outputs; the Adjust Colors dialog buttons and its MaskByColor sliders; Render modes Flat,
  Fast, Preview, Best; Redshift Renderer and AOV items; BPR pass thumbnails; Draw:[Cameras]:Store
  Cam; the Movie Turntable prompt about an existing recording.
- Shipped files: `ZData/Materials/Startup/SkinShade4.ZMT`,
  `ZData/Materials/MatCap/MatCap White01.ZMT`, `MatCap Gray.ZMT`,
  `ZData/Materials/RedshiftMaterials/*.zmt` (including ShadowCatcher),
  `ZData/Redshift/DefaultPanorama.exr`, `ZData/ZPlugs64/AmbientOcclusion.zsc`,
  `MultiMapExporter.zsc`, `SubToolMaster.zsc`.
- Maxon CLI `mx1 product list` (2026-09-24): Redshift "uninstalled, unlicensed"; ZBrush 2026.2.1 on
  a trial. Best for: the BPR-first default on this Mac.
- Lead evidence (`<skills>/scenario-zbrush-expert`, tests v01 to v03): bridge, dialog-free
  `Document:Export` and `Tool:Export`, synthesized strokes, silent `set()` on wrong paths.
- `sources/zbrush-version-deltas.md` sections 3.7 (polypaint and texturing) and 3.9 (rendering).
  Best for: 2026 facts (Substance Bridge Send PolyPaint, Redshift AOVs and OIDN, movie formats, Mask
  by Smoothness fixed in 2024, ZRemesher Keep Polypaint).

## Experts

- **FlippedNormals: Henning Sanden and Morten Jaeger**, former senior film character artists (MPC,
  Cinesite). "Polypaint a Head in ZBrush: Color Theory" (2018-04-12, 33:00),
  https://www.youtube.com/watch?v=8iAbH3zSQak. Best for: color zones in thirds, depth decides hue,
  neutral material, per-vertex resolution, value and eye contrast, map size from vertex count, Flip
  V. Timestamps: zones 00:00:31; FillObject at RGB Intensity 00:02:16 to 00:02:51; Rgb and Zadd
  00:03:09; Color Spray 00:04:35; sampling blend 00:06:01; per vertex 00:08:17 to 00:08:50; neutral
  matcaps 00:10:51 to 00:12:29; value pass 00:14:16; eyes 00:18:44; bone near surface 00:20:50;
  exaggerate for shaders 00:25:26; map size 00:30:32 to 00:31:22; FlipV 00:31:54.
- **Pablo Munoz Gomez**, concept and character artist, Maxon ZBrushLIVE presenter, Pablander Academy
  founder. "Let's Make It Happen" livestream, polypainting skin with masks and Adjust Colors
  (2025-10-01, 1:55:17), https://www.youtube.com/watch?v=d03QU-eUaPo. Best for: zone-first skin with
  anatomical reasons, cover at low opacity, mask plus Mask Adjust plus color passes, AO plugin,
  saturation as the stylization dial, eyes. Timestamps: materials 00:44:58; zone map 00:46:36 to
  00:55:26; stage duplicates 00:55:58; blend 01:02:03; cover 01:06:35; saturation 01:10:30; cavity
  pass 01:16:40 to 01:20:29; smoothness and peaks 01:26:05 to 01:30:43; wash 01:31:16; tint
  01:31:53; AO plugin 01:37:25; back of head 01:39:49; eyes 01:41:30 to 01:47:03; export 01:49:50.
- **Michael Pavlovich**, Director of Character, Weapon and Vehicle Art at Certain Affinity, Maxon
  ZBrushLIVE streamer. Four ZBrush 2025 videos:
  - "Redshift In-Depth Guide" (2025-01-13, 1:06:31), https://www.youtube.com/watch?v=040hAJ3-cTw.
    Best for: every Redshift control, Smooth Surface bruises, creases, lights, HDRI, shadow catcher,
    Render Recall, speed ladder, document sizes, materials, movie. Timestamps 00:02:25, 00:02:56,
    00:09:02, 00:14:01 to 00:21:26, 00:23:12, 00:27:45, 00:33:32, 00:37:19, 00:41:10, 00:43:00 to
    00:47:55, 00:52:05, 01:02:00.
  - "Redshift Quickstart: Lights, Materials, Settings and Turntables" (2025-01-13, 22:00),
    https://www.youtube.com/watch?v=FvpG2tCP8Lw. Best for: SubTool Master Fill, Use Material Color,
    turntable settings and traps. Timestamps 00:04:25, 00:05:13, 00:06:50, 00:10:02, 00:19:24 to
    00:21:10.
  - "Redshift and BPR Passes: AOV Rendering and Photoshop Compositing" (2025-01-13, 28:37),
    https://www.youtube.com/watch?v=lEP73nEu3Tc. Best for: which passes, blend modes, cheap BPR rim,
    fill, reflection and clown passes, print size. Timestamps 00:01:13, 00:02:18, 00:04:50,
    00:05:46, 00:08:29, 00:12:21, 00:14:55 to 00:16:50, 00:18:16, 00:23:20.
  - "Redshift Baker 360" (2025-01-15, 8:59), https://www.youtube.com/watch?v=mW4P0T6tR7k. Best for:
    baking a lit look into polypaint, AO plugin plus Fill Object through the inverted mask, New From
    Polypaint, Clone, Export. Timestamps 00:02:40, 00:05:47, 00:06:30 to 00:07:06, 00:07:49 to
    00:08:36.
  - Also "ZBrush Topology: Face, Body, Whatever!" (2023-11-05),
    https://www.youtube.com/watch?v=n5_cZK-9peg, for FillObject on an isolated polygroup [01:00:48
    to 01:02:38] (note in `notes/retopology-uv/`).
- **Joseph Drust**, Pixologic, #AskZBrush "How can I decimate a model into quads so it's easier to
  rig and animate?" (2016-10-28), https://www.youtube.com/watch?v=_ips3GhWI0s. Best for: Project All
  transfers polypaint only with the target's polypaint on [00:05:25 to 00:06:29] (note in
  `notes/retopology-uv/`).
- **#AskZBrush UV clips** (Maxon/Pixologic), note
  `notes/retopology-uv/askzbrush-uvs - AskZBrush UVs on Subdivided Mesh and UV Relax (2 clips).md`.
  Best for: UV Master Work on Clone keeps polypaint [cemmalvugFk 00:04:00 to 00:07:28].
- **Zachary Berger** (Lightstorm, Avatar), **Rakan Khamash** (Blizzard), **Guillaume Tiberghien**
  (Keos Masons), via `notes/character/_digest_character_creature_studio.md`. Best for: grayscale
  approval renders, color early for design and late for production, value read with the strongest
  contrast at the face.

## Maxon documentation

- ZBrush 2026 help, polypaint, color, masking, Spotlight and texture maps (12 pages):
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/3d-modeling/painting-your-model/polypaint/polypaint.html
  and linked pages; local copy `sources/docs/paint-pose-render-print__polypaint-spotlight.md`. Best
  for: button names and behaviors (FillObject and draw modes, Colorize, Polypaint From Texture and
  Polygroups, every mask generator and Mask Adjust, Posable Symmetry mirror, Spotlight dial, texture
  creation), Painting a Head values.
- ZBrush 2026 help, rendering (15 pages):
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/materials-lights-rendering/rendering/rendering.html
  and
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/materials-lights-rendering/rendering/redshift/redshift.html;
  local copy `sources/docs/paint-pose-render-print__rendering-redshift-bpr-keyshot.md`. Best for:
  Redshift settings and materials, AOVs, BPR passes, Smooth Surface, print resolution, KeyShot
  bridge, movies.
- Multi Map Exporter and UV Map docs (`sources/docs/topology-export__multi-map-exporter-maps.md`,
  `topology-export__uv-master-uv-map.md`). Best for: Map Size, Flip V, UV Map Size, Uvp, Delete UV.
- ZBrush Python SDK 2026.1 examples: `ex_sys_timeline_camera.py` (Maxon turntable framing rule, 0.75
  margin, Euler keys (0,90,180), (0,180,180), (0,270,0)), the SubTool clone example with
  `Draw:Mrgb`, `set_color`, `Color:FillObject`; the GUI reference for `set_color` and the modeling
  reference for `pixol_pick` (local `sources/docs/automation__zbrush-py-sdk-*.md`).
- Shipped macro CreateEyeballs (`sources/docs/automation__zscript-shipped-macros-2026.md`):
  `Draw:Mrgb`, `Draw:Rgb`, `Draw:M`, `Color:R/G/B`, `Color:FillObject`, `Material:ToyPlastic`, store
  and restore of the draw state.

## Other references used for maths [added]

- CIELAB conversion (sRGB D65, CIE 1976) and the just-noticeable difference of about 2.3 (Sharma,
  Digital Color Imaging Handbook, 2003) for zone thresholds.
- Immerkaer, "Fast Noise Variance Estimation" (Computer Vision and Image Understanding, 1996) for
  `noise_sigma`.
- W3C Compositing and Blending Level 1 for the soft light and overlay formulas in `blend`.
