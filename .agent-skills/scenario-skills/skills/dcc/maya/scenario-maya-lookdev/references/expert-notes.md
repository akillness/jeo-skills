# Expert notes: look development (the depth behind SKILL.md)

Citations: `[video id hh:mm:ss]` for videos (all auto captions, no frames: settings shown only on
screen are lost), doc sections by name, `[added]` for this skill's own reasoning. Full notes:
`notes/lookdev/`, plus `notes/lighting-rendering/_digest_rendering_arnold_color.md` (color) and
`notes/groom/_digest_groom_production_render_export.md` (hair). All four practitioner videos predate
OpenPBR and use aiStandardSurface; their recipes transfer with the renames in "OpenPBR and Standard
Surface" below.

## J Hill: hyper-realistic character rendering (mpk6IurOWbs)

Lead Character Artist at Turtle Rock Studios (Apex Legends, Titanfall 2, Back 4 Blood). Best source
for skin, displacement and the per-map rules.

**Skin in one shader.** Base color map into subsurface color, subsurface weight 1 (base weight then
irrelevant), radius as a color (1, 0.35, 0.2), the values Arnold recommends, encoding that red
travels farthest [00:16:53] [00:17:25] [00:17:58]. Subsurface scale 0.1 for a centimeter scene with
a real-size head, so the mean free path is 1 mm, 0.35 mm, 0.2 mm [00:18:31]. Specular IOR 1.4 from
the skin preset; roughness eyeballed first, then from the map [00:19:36]. He picks randomwalk v2
because it looks better to him, while admitting the doc pitches it for thin objects [00:19:03]. SSS
scenes are noisier, mostly color noise, and need diffuse and SSS samples, not just camera AA
[00:19:36] [00:20:08].

- Judge skin by three tests: a light through the ear, a nose that is not waxy, the corners of the
  eyelids [00:18:31] [00:20:08]. Render small regions at higher samples to judge through noise
  [00:20:08].
- OpenPBR mapping: `subsurface_weight` 1, `subsurface_color` from the map, `subsurface_radius` = 1
  mm in scene units (the scalar), `subsurface_radius_scale` (1, 0.35, 0.2) (Arnold OpenPBR doc,
  Radius Scale: "When rendering skin, you should use a color like 1.0, 0.35, 0.2"). The Standard
  Surface doc example is 0.37, 0.14, 0.07 cm, about 3.7 times deeper [added comparison]; decide with
  the ear and nose tests.

**Texture node rules.** Base color stays sRGB; roughness and every data map Raw; grayscale maps
through outAlpha with Alpha Is Luminance on. EXR files came in Raw automatically in his setup, PNGs
did not [00:20:38] [00:21:10] [00:21:43]. A spec (noise) map goes into specular weight and dims the
skin, so he raises the file's exposure to about 1.5 [00:22:52] [00:23:58]. Fine-tune roughness with
the file's Color Balance [00:22:18].

**Normal maps: rarely.** He cannot get aiNormalMap to work and uses bump2d in Tangent Space Normals,
Alpha Is Luminance on, outAlpha into bump value, flip green depending on the export [00:24:31]
[00:25:04] [00:25:37]. In Maya 2027.1 aiNormalMap gains a MIKKTSpace mode (What's New 2027), the
tangent basis Painter bakes with [added], which removes his reason.

**Displacement over normal maps for close-ups.** ZBrush Multi Map Exporter, 32-bit EXR, 8K, file Raw
into a displacementShader on the shading group's displacement slot; scalar zero value must match the
bake, 0.5 for mid-gray maps, 0 for his [00:16:20] [00:26:26] [00:26:59]. Shape: catclark, 2
iterations while working, 3 to 4 for finals, autobump on [00:27:32] [00:28:06]. "Use autobump in
SSS" tripled shader evaluations, finals only [00:29:12] [00:29:44]; that render option is deprecated
in current Arnold (sampling doc). A/B in Render View snapshots: the normal-mapped nose "looks flat
to me and fake", the displaced one "looks like the light is actually going in there because it is"
[00:28:39].

**Micro detail.** Hand-sculpted pores plus a tiny tiled aiCellNoise in alligator mode (amplitude
0.003 to 0.004) added in an aiComposite (plus), routed through red channels because not every node
has an alpha [00:34:14] [00:34:48] [00:35:20]. The mix of hand and procedural creates skin "chatter"
[00:36:59]. It raises effective roughness ("that's what roughness is, actual tiny microscopic
noise"), so pull roughness down or push the coat [00:37:31] [00:38:04]. Zero-at-0 bakes let masks
multiply cleanly: a second aiComposite (multiply) by a lips mask removes the noise from the lips
[00:46:32] [00:47:04].

**Oil as a second specular lobe.** Reuse the roughness map, inverted and crunched through an
aiRampFloat into coat weight (T-zone, nose tip, lips white, a little everywhere), coat roughness
about 0.1, IOR "like water" [00:30:40] [00:31:44] [00:32:16] [00:32:49].
`mx_shade.skin(oil_mask_from=...)` does the invert-and-crunch with an aiRange [added substitute].

**Masks and layers.** Custom masks as Painter user channels (L8) with a black base fill so empty
areas export black, not white [00:40:09] [00:40:41] [00:43:24]. Layered makeup: aiLayerShader with
the skin as input1, an eyeshadow shader as input2, mix2 from the mask; the displacement lives on the
old shading engine and must move to the new one [00:48:03] [00:49:07]. Glitter: aiFlakes into the
eyeshadow's normal camera, tiny scale, density max [00:50:39] [00:51:11].

**Working habits.** One or two changes per render because Arnold feedback is slow [00:51:43]
[00:52:16]; save renders as EXR to keep highlight data [00:33:23]; the first render is slow because
Arnold builds .tx [00:06:15]. Hair: melanin driven by a ramp, lighter toward the tips, plus a color
ramp for pink tips [00:52:31].

## Arvid Schneider: realistic car render in Arnold (cpMBRIWwghg)

Arnold and Maya lighting and look-dev instructor; VFX lighting supervisor (ILM and Image Engine
alumnus per the lighting digest). Best source for hard-surface realism and M5 (the watch).

**Thesis: break it up.** "Just look at the reflections, are they perfectly straight or are they
broken up" [00:35:49]; "always break up your shapes, always break up the roughness" [00:54:59].
Shade from the reference photo, not from recipes: "all cars are slightly different" [00:17:06]
[00:42:51].

**Materials built from observation.**

- Leather: orange-beige base toward the reference; aiCellNoise alligator, red channel into aiBump2d,
  scale 400 then 500 on all axes, 2 or 3 octaves, then the bump reduced to "really subtle";
  roughness near 0.2 [00:03:29] [00:04:33] [00:05:05].
- Rubber: linear base 0.01 to 0.04 typed with the color picker's management off (0.04 is charcoal)
  [00:06:25]; sidewall detail from the reference photo projected in UV space through an aiRange into
  aiBump2d about 0.02 [00:06:57] [00:08:02]; micro noise (scale up to 250) in a second, chained
  aiBump2d [00:08:34] [00:09:08]; roughness from a large aiNoise (scale 10 to 20) through aiRange
  smoothstep, min 0.2 max 0.4, for "glossy oily areas" [00:09:40] [00:10:47].
- Brushed brake disc: fine-line noise (frequency about 500) positioned by the distance output of a
  Worley cell noise (randomness off) in UV space, into specular rotation; anisotropy up; nothing
  shows until roughness is above 0; roughness about 0.15; specular samples 3 [00:11:48] to
  [00:15:43]. The doc adds: rotation maps must not be filtered (mipmap bias about -8 or closest
  filter) and faceting needs smooth tangents plus at least one subdivision iteration (Standard
  Surface, Specular Rotation and Anisotropy).
- Heat tint: thin film thickness up, darker base so it reads hot, noise on thickness [00:15:43]
  [00:16:16].
- Glass: roughness 0, transmission 1, light teal-green tint; "lower depth = more color", like
  shallow vs deep water; depth ended about 2 to 2.5 in his scene [00:17:40] [00:18:13] [00:21:29].
  Sun strip: a UV ramp scales the depth through an aiColorCorrect [00:18:48] to [00:20:57].
- Side-window dimples: Worley cell noise masked to side windows by a per-shape
  `mtoa_constant_windowMask` read with aiUserDataInt (default 0) [00:22:33] to [00:24:38]. First as
  bump (too strong, and the reference shows them in reflections, not silhouette), then as roughness
  through aiComplement and aiRange (max about 0.15) [00:25:11] to [00:27:55]. Decider for bump vs
  roughness: where the real effect is visible.
- Headlight iridescence: thin film thickness from aiFacingRatio (inverted, bias, gain) through
  aiRange 0 to 2000 nm, so only grazing angles iridesce; faint noise bump (scale about 10): "you
  don't want perfect mirror-like reflections" [00:28:36] to [00:32:53].

**Car paint, layer by layer (aiCarPaint).** "What I always first do, I just kill everything": no
color, flake density 0, coat 0 [00:36:52]. Base (blue-purple, Oren-Nayar for shape) [00:37:24];
specular up, a layer above the base that flakes need [00:37:58]; flake density traded against base
visibility [00:38:29]; flake scale from a close-up camera against a close-up photo, 0.001 typed
below the UI's displayed precision, ending near 0.025 [00:39:01] [00:42:20]; flake roughness about
0.2, color for the metallic look [00:40:07]; flip-flop ramp lighter facing, darker grazing
[00:40:41]; coat up [00:41:48]. Orange peel and panel waviness: an aiLayerFloat of aiNoise at scales
3, 25, 80, 200, each mixed about 0.01 (0.09 is "way too much"), into an aiBump2d driving the **coat
normal, not the base normal camera**; watch highlights "jump" across panels when orbiting [00:43:25]
to [00:47:46]. Dust from occlusion and curvature masks [00:48:20].

**Integration and finishing** (mostly scenario-maya-lighting-rendering's job): aiShadowMatte with
the HDRI projected as its background through a color correct ("fix the plate, not the lighting"), AO
multiplied for contact [00:49:49] [00:50:54]; imagers: lift crushed CG blacks about 0.15, vignette,
slightly warm bloom [00:52:51] [00:53:24]; denoise last in his session and "be careful that you
don't get rid of all your little flakes" [00:54:27]. The Arnold doc puts denoisers first in the
imager chain; keep his caution on fine speculars.

**Production habit.** Assign materials by name through Render Setup collections with material
overrides so remodeled parts keep their shaders [00:01:37] [00:02:11].

**For a product hero (the watch, M5).** Reflections are the product: the light rig is the shapes
seen in the metal (lighting skill); steel from the F0/F82 table with low roughness and a subtle
ranged noise; brushed faces with anisotropy, rotation and smooth tangents; the crystal clear, a
light tint over its real thickness, a faint facing-ratio thin film for the AR coating and a touch of
breakup so the dial's refraction is not perfect; leather with the alligator bump; slate with high
diffuse roughness and large-scale roughness variation (notes, "What the car render teaches").

**Arvid on fur shading (EXF_7Zgg65M, 2017).** Roughness encodes cleanliness: low for shiny, higher
for dusty fur; fur is texture-driven (melanin 0, texture into base color); light it with a key along
the groom direction plus an HDRI dome [00:33:00] [00:34:32] [00:36:35] (groom digest).

## Reza Sarkamari: Substance Painter to Maya with Arnold (ZtEiVa3MPLg)

VFX artist and educator, Nuke Certified Trainer, Autodesk Maya Certified Professional. Best source
for the handoff contract.

- Prune before export: toggle each channel and keep only those that change the look; delete layers
  that do nothing. "Do you really need all of these maps?" [00:02:47] [00:03:21] [00:04:29].
- Match the lighting to judge the transfer: export the environment Painter displayed (Assets >
  Environment > right-click > Export resource) and use it on the skydome, with the same focal length
  [00:05:03] [00:05:38] [00:13:10] [00:13:42].
- Export Textures (Ctrl+Shift+E), "Arnold (AiStandard)" template, PNG, EXR or TIFF, "not JPEG ...
  way too compressed" [00:06:40] [00:07:14]. Duplicate the preset to add an AO channel with the UDIM
  token [00:08:17] to [00:10:56].
- Name every node and shading group so errors point somewhere [00:15:11].
- The table [00:27:44]: base color sRGB, AIL off, outColor; roughness, metallic, opacity, height
  Raw, AIL on, outAlpha; normal Raw, AIL off, through aiNormalMap ("works beautifully") or bump2d in
  Tangent Space Normals; with bump2d check Arnold Flip R and Flip G are unchecked [00:19:10]
  [00:20:17] [00:21:10] [00:26:30].
- AO multiplied into base color through multiplyDivide to recover occlusion "not picked up by the
  ray trace" [00:16:19]; one input per attribute, combine with a math node [00:16:51]. The others
  never do this (decider below).
- Validate by rotating the dome and watching roughness breakup react [00:26:30] [00:27:08].

## Raycast: look development setup for VFX (vPHhVrxxThU)

Self-described VFX generalist (film, TV, commercials; identity unverified). Several values said with
"I think". Best source for the lookdev rig and a few rare fixes.

- Lookdev exists so assets hold in the sequence lighting; in VFX you lookdev under the sequence's
  graded, plate-matched HDRI [00:00:51] [00:01:58].
- Asset prep: at the origin, grouped, named, namespaces merged to root, frozen, history deleted
  [00:02:46] [00:03:20] [00:06:01].
- Camera `render_cam` with `chromeBall_geo` (Chrome preset), `greyBall_geo` (Lambert, 0.5 "I think")
  and a Macbeth chart as children, so "whenever I move around my camera, they stay exactly in the
  same place" [00:04:02] [00:05:11] [00:05:46]. His video description corrects the chart: a Lambert
  or diffuse shader, not a surface shader.
- Turntable: asset locator 0 to 360 over frames 1 to 6, HDR locator 0 to 360 over 6 to 12; the asset
  spins first, then the light [00:06:35] [00:07:43] [00:08:21]. Keying 360 one frame past the range
  avoids a duplicate frame on loop [added].
- HDRI exposure 10 for his dark bracketed HDRI [00:10:34]; green spill from the environment fixed in
  the HDRI (Nuke key), not on the asset [00:36:02].
- One textured shader is fine for a background prop with clean metalness; on a feature split metal
  and wood [00:11:20] [00:11:56].
- Pre-build .tx with TX Manager before loading many textures or UDIMs: auto-tx on heavy assets can
  "kill Maya" [00:13:04] [00:14:34]. Data maps 16-bit; "it won't look good if you can't open scenes"
  [00:16:20] [00:20:58].
- Base color arrived Raw (it was a .tx: the default rule) and had to be set to sRGB; Mari color maps
  are likely linear [00:17:28].
- Hypershade had wired outAlpha, but the 8/16-bit maps have no alpha: connect outColorR [00:19:14]
  [00:19:46].
- Combine normal and height at separate strengths: aiNormalMap.outValue into the hidden normalCamera
  of a bump2d that takes the height [00:21:27] to [00:24:13].
- AOV review (N, specular, diffuse_albedo, direct, indirect): his normal map was too strong, cut to
  a quarter [00:25:17] [00:26:23].
- Color-correct nodes between texture and shader are the lookdev loop; roughness gamma is the
  biggest lever; contrast 2 then gamma down turned wet wood matte [00:27:11] [00:28:18] [00:30:05].
- Firefly triage in metals: raise AA (6) and specular samples; if specks stay, suspect height or
  metalness maps, halve the bump, last resort aiClamp 0 to 1 on the texture [00:33:06] to
  [00:35:23].
- Sanity check: the chrome ball reflects exactly the surroundings, the gray ball matches similar
  chart values [00:38:03] [00:38:38].

## Arnold: OpenPBR Surface (official intro tEUiIBApw-U and the parameter doc)

- One physical stack: base substrate (metal or dielectric: glossy-diffuse, subsurface or
  translucent), optional coat with its own medium, optional fuzz, plus thin film, emission,
  thin-walled [00:01:12] [00:09:39] [00:10:51].
- Metals: base color = F0, specular color = F82 edge tint ("separately controls the color seen near
  the silhouette of the metals" [00:02:51]); chrome goes slightly blue at the edge; mirror =
  metalness 1, roughness 0, base color and weight 1 (Base Metalness). Twelve metals in
  `mx_shade.METALS_OPENPBR` (aluminum, brass, chromium, copper, gold, iron, nickel, platinum,
  silver, steel, titanium, zinc); some values exceed 1 (gold F0 red 1.059) and are used as printed.
  Base metalness between 0 and 1 is legitimate for rust [00:01:46].
- "It got darker" is physics: rough highlights are dimmer (energy conserved) [00:08:30]; a coat
  darkens the base (coat darkening default 1) [00:10:15]. Never fix by pushing weights above 1; only
  specular weight above 1 stays physical (Energy Conservation, Specular Weight).
- Transmission color is Beer-Lambert absorption, light and subtle; saturated values mean infinite
  density; with depth 0 the color is a non-physical tint. Depth is a world length: "if you see no
  effect, check scene scale" (Transmission Color, Depth).
- Dispersion: Abbe 10 to 70 typical, default 20, lower is more; off until dispersion scale is above
  0 [00:07:41] [00:08:13]. The page prints "9 | 55 (diamond preset) | 92 (sapphire preset)" under an
  image row; real sapphire is about 72 [added].
- Subsurface: radius is mean free path ("the larger this radius, the more translucent" [00:05:20]);
  radius scale sets per-channel distance, not the rendered color; anisotropy toward 1 is forward
  scattering, more translucent with a brighter rim [00:05:53]; SSS needs outward normals, polymeshes
  only; `sss_setname` (now `interior_set`) blurs across shapes such as teeth and gums.
- Coat tints what is below; a rough coat roughens the base; coat normal separate from the base
  normal for rain, glazing, carbon fiber, car paint (Coat).
- Fuzz: weight = density, roughness = fiber shape; fabric, dust, peach fuzz (Fuzz).
- Thin film: micrometers, 0 to 1 useful, colors fade above 1 [00:12:35]; film IOR shifts the hue;
  drive thickness with a ranged noise (Thin Film).
- Emission: luminance in nits, 1000 nits matches Standard Surface emission 1 (What's New 2025,
  nits_per_unit); small bright emitters are noisy, use a mesh light when it must light the scene.
- Thin walled only for single-sided sheets; opacity below 1 only makes sense with thin walled or 0
  everywhere (Geometry).
- Caustics off by default; on the outer cornea they add believability to eyes (Advanced).
- Arnold core defaults from `kick -info openpbr_surface` (What's New 2025, Arnold 7.3.4): base color
  0.8, specular roughness 0.3, specular IOR 1.5, transmission depth 0, dispersion Abbe 20 and
  scale 0. The parameter tables print specular roughness 0.2 and coat roughness 0.1; the Maya node
  may differ again [verify with the probe].

## Arnold: Standard Surface, Standard Hair, subdivision and displacement (doc)

- Standard Surface semantics that differ: with metalness on, specular weight and color only control
  the edge tint; thin film in nanometers (0 to 2000, 3000 removes iridescence); SSS radius is the
  RGB color and scale the scalar; dispersion Abbe 0 = off; sheen instead of fuzz; coat affect color
  and roughness instead of darkening. Transmission scatter needs the mesh's Opaque on; opacity needs
  Opaque off. Randomwalk (default) handles concavities; v2 goes deeper in thin, backlit regions but
  is costlier and noisier. Coat color white for realistic cases; bare metal wants coat 0.
- Standard Hair: realistic hair has no diffuse and no tints; melanin 0.2 blonde, 0.5 red and brown,
  1.0 black, melanin redness for pheomelanin, randomize for per-strand variation; textures go into
  base color with melanin 0; roughness 0.2; IOR 1.55 (outside 1.4 to 1.6 only for wet hair); shift 0
  to 10 degrees (measured 2.3 to 3.7), 0 for synthetic; blond needs extra depth and more specular or
  AA samples; opacity below 1 costs a lot. MtoA 5.6 adds `scattering_mode`: accurate is rounder in
  close-ups but 10 to 30 percent slower, adaptive switches by on-screen thickness (What's New 2027).
  Load MtoA before XGen; XGen Interactive Groom assigns `hairPhysicalShader` by default (groom
  digest).
- Subdivision: iterations quadruple polygons per level (2 Maya smooth levels plus 4 Arnold
  iterations = 4096x); never stack Arnold subdivision on Smooth Mesh Preview, "Arnold will also
  render this preview smoothed state"; adaptive error 0 = uniform, stable in animation; raster space
  is a problem with instances.
- Displacement: map Raw, pre-processed with maketx; the displacement node on the shading group's
  displacement slot. Per-object height multiplies the shader's scale, per-object zero value adds to
  the shader's, padding takes the maximum, autobump on the shader wins. "The proper workflow ... is
  to have the shader give the final displacement value and then to offset the bounding box with the
  bounds padding attribute" (too low clips to black, too high is slow). Autobump moves high
  frequencies into bump, needs UVs, evaluates at Pref (bump2d on displaced points compounds). Vector
  displacement: catclark with enough iterations, 32-bit EXR, connect the whole vector, tangent space
  for deforming meshes.

## Color management for look dev (Maya 2027 help, Arnold ACES page, Brejon, Maya Learning Channel FODVxXOIrvM)

- OCIO v2 Maya-default config, ACEScg rendering space, ACES sRGB view (Maya 2027 help). The default
  input role is `sRGB Encoded Rec.709 (sRGB)` since 2026.2; the help spells linear sRGB
  "scene-linear Rec.709-sRGB" and "scene-linear Rec 709/sRGB"; ACES 1.x configs call Raw "Utility -
  Raw" (version deltas 2.7).
- Rules set the initial space of new file nodes only; Reapply Rules resets every node without Ignore
  Color Space File Rules; rules live in user preferences, so another machine or `mayapy` may assign
  other spaces (help; [added consequence]).
- EXR, HDR and float TIFF are almost always scene-linear Rec.709/sRGB; data maps Raw; plates in
  their camera space (help, Determine the correct color space). Under ACEScg, Raw means "no
  conversion", right only for data or files already in ACEScg (Brejon).
- Swatches and ramps are rendering-space numbers: changing the rendering space mid-project changes
  every color; delete .tx after a rendering-space change (help; Brejon Cornell box).
- Under the ACES sRGB view, scene 1.0 displays at about 0.81 and display white needs a bit more than
  16 [FODVxXOIrvM 00:02:13]: pre-2022 values are re-judged, not copied.

## Disagreements and the deciding condition

| Topic                         | Positions                                                                                                                                                                                                 | Decider                                                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| aiNormalMap vs bump2d         | Sarkamari aiNormalMap [ZtEiVa3MPLg 00:21:10]; Raycast aiNormalMap plus bump2d for height [vPHhVrxxThU 00:22:34]; J Hill bump2d only [mpk6IurOWbs 00:24:31]                                                | combine normal and height at separate strengths: hybrid; otherwise aiNormalMap, in MIKKTSpace mode on 2027.1+ for Painter bakes [verify on a bevel]                                                                |
| Channel flips                 | J Hill flips green [mpk6IurOWbs 00:25:37]; Sarkamari unchecks Flip R and G [ZtEiVa3MPLg 00:26:30]; Raycast Flip R off [vPHhVrxxThU 00:23:07]                                                              | the export convention: OpenGL Y+ for Maya and Arnold [added]; DirectX inverts Y; confirm on a bevel or hemisphere render                                                                                           |
| AO into base color            | Sarkamari yes [ZtEiVa3MPLg 00:16:19]; the others never; Arvid only on the shadow matte [cpMBRIWwghg 00:50:54]                                                                                             | matching a Painter or real-time look, or detail below geometry resolution: subtle; path-traced hero: skip (double occlusion) [added]                                                                               |
| HDRI as the light             | Raycast lights with the graded plate HDRI [vPHhVrxxThU 00:01:58]; J Hill "would never just use an HDRI" for a portrait [mpk6IurOWbs 00:07:20]                                                             | plate integration vs beauty or product shot; for look dev itself a neutral HDRI plus the reference strip                                                                                                           |
| Normal maps at all            | J Hill avoids them in Arnold [mpk6IurOWbs 00:28:39]; Sarkamari and Raycast rely on them                                                                                                                   | hero organic close-up: displacement; prop or background: normal map                                                                                                                                                |
| One shader or many            | Raycast one for a background prop [vPHhVrxxThU 00:11:20]; Arvid per material [cpMBRIWwghg 00:02:11]                                                                                                       | hero vs background, and how much per-material tuning lighting will ask for                                                                                                                                         |
| SSS type                      | J Hill randomwalk v2 by taste [mpk6IurOWbs 00:19:03]; doc keeps randomwalk default, v2 costlier                                                                                                           | render budget and backlit thin features (ears)                                                                                                                                                                     |
| Skin radius                   | J Hill 1 mm [mpk6IurOWbs 00:18:31]; doc example about 3.7 mm                                                                                                                                              | the ear backlight and nose waxiness test on the asset                                                                                                                                                              |
| Gray ball                     | Raycast 0.5 "I think" [vPHhVrxxThU 00:38:03]; 18 percent common [added]                                                                                                                                   | the studio convention, recorded in the scene                                                                                                                                                                       |
| HDRI color space              | J Hill and Raycast Raw [mpk6IurOWbs 00:04:07] [vPHhVrxxThU 00:10:34]; Maya 2027 help and Arnold ACES page                                                                                                 | the rendering space: Raw only in linear Rec.709; linear Rec.709 under ACEScg                                                                                                                                       |
| Dimples as bump or roughness  | Arvid tried bump, moved to roughness [cpMBRIWwghg 00:25:45]                                                                                                                                               | where the real effect shows: silhouette (bump) or reflections (roughness)                                                                                                                                          |
| Denoiser placement            | Arvid last in his session [cpMBRIWwghg 00:54:27]; Arnold doc first in the chain                                                                                                                           | chain order from the doc; Arvid's caution for flakes and brushing                                                                                                                                                  |
| Dispersion on a watch crystal | lookdev digest P9: small dispersion scale with the sapphire preset's Abbe; OpenPBR doc checklist: "dispersion only for gems"                                                                              | the geometry: parallel faces send every wavelength out parallel to its entry, so a flat crystal shows no visible fringe and only pays the samples; faceted gems and close-up beveled edges disperse [added optics] |
| Pre-baked TX or auto-TX       | Raycast pre-builds with TX Manager [vPHhVrxxThU 00:13:04]; J Hill lets the first render build them [mpk6IurOWbs 00:06:15]; Arvid pre-bakes for farms, auto-TX off, use existing on [XZfsqJ0_9go 00:14:44] | one machine and a few maps: auto-TX is fine; heavy assets, UDIMs or any batch: pre-bake                                                                                                                            |

## What reads as CG

Perfectly straight reflections and uniform roughness [cpMBRIWwghg 00:35:49]; polished steel or glass
without a smudge or fingerprint anywhere (the OpenPBR doc's roughness-map example is a fingerprint
map; Arvid's cell-noise smudges on glass [cpMBRIWwghg 00:25:11]); perfect refraction through glass
or plastic [cpMBRIWwghg 00:32:20]; detail only in a normal map on a smooth silhouette [mpk6IurOWbs
00:28:39]; no subtle variation in color, value and roughness [mpk6IurOWbs 00:23:24]; crushed blacks
[cpMBRIWwghg 00:52:51]; flat-on lifeless framing [mpk6IurOWbs 00:05:42]; wrong texture color spaces
(washed out, double dark, roughness stuck) [vPHhVrxxThU 00:36:58]; energy-breaking values above 1
(OpenPBR doc).

## Gaps in the sources

Eyes are barely covered (J Hill's character has closed eyes; only the cornea caustics line in the
doc). Fabric is only the fuzz lobe. No frames exist, so node graphs and values shown only on screen
are lost. No source covers look dev for game engines; for engine targets, shade for export and judge
in the engine.
