# Critique: how the experts judge paint, renders and presentation

Use this rubric on every review sheet before moving on and before delivering. Each item says what to
look at, the measurable check when there is one (`zb_paint` function), and whose rule it is.
Severity: **B** blocker (do not deliver), **M** major (fix in this stage), **m** minor (note it).
Thresholds marked [added] are this skill's starting values, to calibrate on live renders.

## 0. How to look

- Three looks for color, every time: Flat Color (pure albedo), a neutral material (SkinShade4 or
  MatCap White01), and the final renderer (BPR or Redshift). Never judge color on a tinted MatCap
  (FlippedNormals 8iAbH3zSQak 00:10:51; Pablo d03QU-eUaPo 00:44:58). `zp.paint_review(out, look)`
  with "flat", "skin", "white", "bpr".
- Views: front, three-quarter, profile, back, top. The back of the head gets the same finish as the
  face (Pablo 01:39:49).
- Two scales: 100 percent crop for breakup, noise and edges; a thumbnail (about 256 px) for the read
  of zones and values, the agent's squint [added method].
- Stage comparisons side by side, never from memory: stage duplicates or ZTL versions (Pablo
  00:55:58) and Render Recall for renders (Pavlovich 040hAJ3-cTw 00:41:10).

## 1. Skin color, realistic

| #    | Look for                                                                                                                                                                                                    | Measurable                                                                       | Rule                                                                 | Sev |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --- |
| 1.1  | Not one beige: warm and cool zones exist                                                                                                                                                                    | `skin_zone_checks`: "not uniform beige" (zone spread at least one JND, 2.3 Lab)  | FlippedNormals 00:00:56                                              | B   |
| 1.2  | Forehead yellower than the midface; cheeks, nose, ears redder; lower third of a man bluer or grayer                                                                                                         | "forehead yellower", "midface redder", "lower third bluer (male)"                | Gurney via FlippedNormals 00:00:31; Pablo 00:47:39                   | M   |
| 1.3  | Zones follow anatomy: yellow over bone and fat, red on thin tissue (eyelids, ears, nostrils, lips), blue in hollows (orbits, under the cheekbones)                                                          | visual on Flat front and profile                                                 | Pablo 00:49:16 to 00:52:37                                           | M   |
| 1.4  | Sex, age, build and skin tone respected: less blue low on a woman; more yellow on a fat character; purple and orange instead of blue and red on dark skin; heavier red in strained creases on an older face | visual                                                                           | Pablo 00:48:11 to 00:54:18, 01:06:35; FlippedNormals 00:28:20        | M   |
| 1.5  | Realistic saturation: stays under the middle of the picker; photo reference saturation not copied                                                                                                           | "realistic saturation under the middle of the picker" (mean HSV S < 0.5)         | Pablo 01:10:30, 01:35:06                                             | M   |
| 1.6  | No clown after the cover pass: pure zone hues do not show as patches                                                                                                                                        | "no clown" (share of pixels with S > 0.75 at most 5 percent [added])             | Pablo 01:05:27                                                       | B   |
| 1.7  | Organic breakup, not airbrush gradients                                                                                                                                                                     | "organic speckle" (L* high-pass std at least 1.0 [added]); visual at 100 percent | FlippedNormals 00:05:07; Pablo 01:02:36                              | M   |
| 1.8  | Strongest value or saturation contrast at the eyes; eyes and mouth got the most time                                                                                                                        | "strongest value contrast at the eyes"                                           | FlippedNormals 00:18:44 to 00:20:22                                  | M   |
| 1.9  | Lips: edge definition fits the character (tight for a young woman, looser for an old man)                                                                                                                   | visual close-up                                                                  | FlippedNormals 00:13:19 to 00:13:51                                  | m   |
| 1.10 | Shadows are not painted in, except where light never reaches (nostrils, deep creases) unless the target is a polypaint-only presentation                                                                    | visual on Flat                                                                   | FlippedNormals 00:14:16 (see the disagreement table in expert-notes) | M   |
| 1.11 | Cavity and AO passes compound subtly: each barely shows alone, together they read as complex skin; no dirty rings                                                                                           | `mask_coverage` proved each mask; visual                                         | Pablo 01:20:29                                                       | M   |
| 1.12 | Pushed enough for the renderer: the final render still shows the zones (shaders dilute polypaint)                                                                                                           | compare Flat and final render region stats                                       | FlippedNormals 00:25:26                                              | M   |
| 1.13 | Eyes: dark iris over most of the visible eye, lighter bottom and darker top, lighter toward the pupil; eyes slightly divergent                                                                              | visual close-up                                                                  | Pablo 01:41:30 to 01:47:03                                           | M   |
| 1.14 | Back of the head and ears finished to the face's level                                                                                                                                                      | back and profile views                                                           | Pablo 01:39:49                                                       | m   |

## 2. Color, stylized

| #   | Look for                                                                                                                                                                                   | Measurable                                | Rule                                      | Sev |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------- | --- |
| 2.1 | Saturation is a choice: pushed past the middle of the picker on purpose, consistently across parts                                                                                         | `zone_report` mean saturation per part    | Pablo 01:10:30                            | M   |
| 2.2 | Value read before hue: a grayscale version of the color render still separates face, clothes and props, with the strongest contrast at the face; darkest values kept for lashes and pupils | convert the beauty to L*; compare regions | Guillaume, character digest (UthCuDB1IEQ) | M   |
| 2.3 | Temperature zones still present but simplified (fewer, cleaner transitions)                                                                                                                | visual                                    | FlippedNormals thirds, simplified [added] | m   |
| 2.4 | Parts are flat and clean where the design says flat (scarf, boots), with breakup only where the design wants texture                                                                       | visual on Flat                            | [added]                                   | m   |

## 3. Color deliverable (texture or vertex color)

| #   | Look for                                                                                                        | Measurable                                                                  | Rule                                                    | Sev |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- | --- |
| 3.1 | Painted at the highest level, no level added afterwards                                                         | `paint_state()["at_top_level"]`, level count unchanged since painting       | FlippedNormals 00:08:17 to 00:08:50                     | B   |
| 3.2 | Map size matches the vertex count (about 4M points per 2K; a 4K on a 4M mesh is wasted)                         | `map_budget(points, side)["pass"]`; `recommend_map_size`                    | FlippedNormals 00:30:32; doc Texture Maps               | M   |
| 3.3 | UVs exist before the bake; unwrapped on a clone so polypaint survived                                           | `stats()["uv_bbox"]`; colors unchanged on the Flat review after the UV step | FlippedNormals 00:29:59; AskZBrush cemmalvugFk 00:04:00 | B   |
| 3.4 | Flip V set for other applications; orientation checked with an asymmetric mark                                  | a known mark lands where expected in the exported map (live_p04 method)     | FlippedNormals 00:31:54                                 | M   |
| 3.5 | No background color at UV seams; no overlaps                                                                    | Texture Map > Fix Seam; New From UV Check shows no red                      | doc Texture Map reference                               | M   |
| 3.6 | Texture display off again after the bake, so later paint is visible                                             | `paint_state()["tex_on"] == 0`                                              | doc Spotlight basics                                    | m   |
| 3.7 | Vertex color route: the target app reads it (OBJ `#MRGB` lines or GoZ), or Substance Bridge Send PolyPaint used | file check                                                                  | Pablo 01:49:50; version deltas 3.7                      | M   |

## 4. Render

| #   | Look for                                                                                                                                                  | Measurable                                                                                      | Rule                                                    | Sev |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --- |
| 4.1 | Perspective on for beauty renders (orthographic only for technical views)                                                                                 | `render_setup` read-back                                                                        | Pavlovich 040h 00:02:56                                 | M   |
| 4.2 | Subject framed, not clipped, same framing across views                                                                                                    | `render_checks`: "subject not clipped"; same bbox rule in every view                            | [added]                                                 | B   |
| 4.3 | Value range used: deep shadows and bright highlights without clipping                                                                                     | `render_checks`: L* span at least 50, clipped whites and blacks at most 0.5 percent [added]     | [added]                                                 | M   |
| 4.4 | No shading bruises on low-poly parts; hard edges catch a soft highlight                                                                                   | visual close-up; Smooth Surface off on low-poly hard parts, Crease Level one below SmoothSubdiv | Pavlovich 040h 00:14:01 to 00:21:26; doc Smooth Surface | M   |
| 4.5 | Shadows not cut by the floor edge; floor or shadow catcher grounds the object                                                                             | visual; Grid Size raised                                                                        | Pavlovich 040h 00:37:50; doc Tips                       | M   |
| 4.6 | Grain acceptable at 100 percent after denoise (finals)                                                                                                    | `noise_sigma` at most 2.0 on 0..255 [added]                                                     | Pavlovich 040h 00:44:36                                 | M   |
| 4.7 | Redshift only: polypaint visible (Polypaint material, Use Material Color 0, white Base, SSS Weight below 1); texture on a Redshift material, not a MatCap | visual; material parameters read back                                                           | doc Redshift Materials, Tips; Pavlovich 00:52:05        | B   |
| 4.8 | Lighting intent: key, fill and rim readable; ZBrush main light at 0.1 when an HDRI lights the scene, never 0                                              | visual                                                                                          | Pavlovich 040h 00:23:12                                 | m   |
| 4.9 | Test and final settings differ as intended: small document and Error Threshold 1 for tests, full size and 0.01 for finals                                 | recorded settings                                                                               | Pavlovich 040h 00:28:52, 00:44:03                       | m   |

## 5. Passes and composite

| #   | Look for                                                                                            | Rule                               | Sev |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------- | --- |
| 5.1 | Every pass lines up with the beauty (one stored camera, same framing)                               | Pavlovich lEP7 00:12:21            | B   |
| 5.2 | Passes composited through the Mask pass; the BPR Shaded pass edge is not anti-aliased on purpose    | doc BPR passes; Pavlovich 00:04:50 | M   |
| 5.3 | Shadow and AO tinted cool, not muddy; reflections tinted to the environment                         | Pavlovich 00:08:29 to 00:10:11     | m   |
| 5.4 | The composite improves on the beauty when toggled against it                                        | Pavlovich 00:11:41                 | M   |
| 5.5 | ID pass: one flat color per part, full coverage of the subject (`id_pass` coverage and part pixels) | Pavlovich 00:16:50                 | m   |

## 6. Turntable

| #   | Look for                                                                                                                     | Measurable                                                                         | Sev |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --- |
| 6.1 | Upright in every frame                                                                                                       | `upright_score` > 0 on a model with a top marker (live_p05 settles the Euler rule) | B   |
| 6.2 | Constant framing and scale; no drift                                                                                         | same silhouette height within a few percent across frames [added]                  | M   |
| 6.3 | Frame count and length as briefed; the loop does not repeat frame 0 at the end                                               | frames = n, yaw step = 360 / n                                                     | M   |
| 6.4 | Render quality matches the stills (BPR per frame, or a Redshift render first for Movie > Turntable, Pavlovich FvpG 00:19:56) | visual                                                                             | M   |

## 7. Portfolio presentation

- Grayscale form renders separate from color renders (Berger, character digest PcuC8K-bz44
  00:06:33). **M**
- The set: beauty in four views, albedo (Flat) views, a turntable, the ID pass, and a close-up of
  the face or focal area. **M** [added set]
- Resolution fits the medium: 1920 x 1080 for screens (Pavlovich), pixels = inches x 300 ppi for
  print (doc), Pavlovich's 3200 x 2133 postcard. **m**
- The report says what was measured, what was only looked at, and what did not run. **B** (honesty)

## 8. Test cases from the scenarios (finishing stages)

### Z1 finishing: stylized cartoon adventurer bust (big nose, strong brow, simple ears, scarf)

A strong finishing plan contains:

- Parts as SubTools filled per part (skin, scarf, eyes, hair or hat) with `fill_subtools`; stylized
  saturation chosen on purpose (Pablo 01:10:30).
- Skin temperature zones still present on the face, simplified: yellow forehead and brow, red nose,
  cheeks and ears, a cooler lower third if male (FlippedNormals thirds; Pablo zones), by generated
  zone image or synthesized strokes, with `skin_zone_checks(style="stylized")`.
- Eyes with the iris lens fake and a slight divergence (Pablo 01:41:30 to 01:47:03); strongest
  contrast at the eyes (FlippedNormals 00:18:44).
- A grayscale value read of the color render (Guillaume).
- BPR renders front, three-quarter and profile with perspective on, floor shadow, 1920 x 1080; a
  scripted turntable; a portfolio sheet with MatCap Gray, albedo and beauty.
- Honest limits: organic breakup and lip edges are the weak spots without a tablet.

### Z2 finishing: realistic reptilian creature head for a film close-up

A strong finishing plan contains:

- Color is a lookdev reference: painted at the top level after the sculpt is final, never before
  adding levels (FlippedNormals 00:08:17).
- Mask-driven passes: darker scale crevices through the inverted cavity mask, lighter scale tops
  through the cavity mask itself, which protects the grooves (doc Mask By Cavity: paint the surface
  of scales without the grooves; `mask_pass(..., invert=False)`), AO plugin undertone on millions of
  polygons (Pablo 01:37:25), a desaturating wash if realism demands (Pablo 01:31:16), each pass
  through `mask_pass` at low intensity.
- Zone logic transferred to the creature: thin tissue (eyelids, gular skin, nostrils) warmer, bony
  plates lighter and less saturated (FlippedNormals 00:20:50; Pablo zones) [added transfer].
- Albedo kept clean of painted shadow when the film renderer does ray-traced occlusion and SSS
  (expert-notes disagreement table).
- Texture: UVs from scenario-zbrush-retopology-export (UV Master Work on Clone keeps polypaint),
  `texture_from_polypaint` at the size `recommend_map_size` gives, Flip V, or Multi Map Exporter
  Texture from Polypaint in the map batch; vertex count checked against map size.
- Presentation: grayscale approval renders for anatomy (Berger) and color lookdev renders
  separately; BPR with raking key and rim; passes composited through the Mask pass.

## 9. New evaluation prompts for this domain (for the orchestrator's GREEN tests)

### PR1. Realistic skin polypaint without a tablet

Prompt: "A finished sculpt of a 50-year-old man's head (single SubTool, 4.2 million points, eyes as
separate SubTools, no UVs) is open in ZBrush 2026. Polypaint realistic skin without a mouse or
tablet, bake a color texture for Substance Painter or Marmoset, and prove that the result is neither
uniform beige nor clown makeup. Give the stages, the exact buttons, sliders or SDK calls, the
numbers, and the checks you run on renders." A strong answer contains: paint at the top level and
never add levels afterwards; Rgb on with Zadd and Zsub off; neutral material plus Flat for judging;
a zone map by anatomy (yellow bone and fat, red thin tissue, blue hollows and the male lower third)
made without strokes (generated zone image and planar projection, or synthesized strokes) then a
low-intensity cover; FillObject honoring RGB Intensity and masks; cavity, peaks and valleys or
smoothness, and AO plugin passes with Mask Adjust and Inverse; a wash for realism; eyes with the
lens fake; UVs on a clone (Work on Clone, Paste UVs) before the bake; a 2K map for about 4M points
with Flip V; numeric checks on Flat renders (zone hue order, saturation under the middle of the
picker, no clown, speckle, eye contrast) plus looking at the sheets; honest limits (organic breakup,
C-key sampling, the Adjust Colors dialog).

### PR2. Portfolio presentation and turntable on a Mac without Redshift

Prompt: "A painted stylized collectible (body, clothes, scarf, eyes and a base as separate SubTools)
must be presented for a portfolio: four beauty views and matching grayscale views at 1920 x 1080, a
clown (ID) pass, shadow and AO passes composited over the beauty, and a 10-second turntable MP4.
Redshift is not installed on this Mac. Which renderer and settings, how do you script it without a
mouse, which traps do you avoid, and what do you check before delivery?" A strong answer contains:
BPR (Redshift missing, so no Redshift materials or AOVs); perspective on, floor shadows with enough
Grid Size, test at small size then final at 1920 x 1080, resizing the document clears the canvas so
redraw and re-enter Edit; Document:Export as the dialog-free way to save renders; BPR pass
thumbnails may open a save dialog, so a fallback (configuration renders, solo renders per SubTool
for the ID pass instead of Ctrl+W on every SubTool); composite in Python with Multiply for shadow
and AO through the mask; a scripted turntable with absolute Euler triples (never added degrees)
checked for upright frames, assembled with ffmpeg (for example 120 frames at 12 fps for 10 s),
because Movie > Turntable cannot be stopped from a script and asks about an existing movie; the
gray-view trap (polypaint shows over any MatCap, so gray views need Colorize off on every SubTool,
Pavlovich's Shift-click, then restored; SubTools filled in M or MRGB also keep their material);
render checks (framing, value span, clipping, noise) and looking at the contact sheet; delivering
the paths and what was not verified.
