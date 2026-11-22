# Expert notes: lighting and rendering

The depth behind SKILL.md, grouped by expert, with timestamps (video id [hh:mm:ss]) or book and doc
sections. Source files: `notes/lighting-rendering/` (both digests and every note) and
`notes/lookdev/_digest_lookdev_arnold_materials.md` for the product-shot lessons. Keys as in
`sources.md`. [added] marks this skill's own formalizations; every number without a cite is [added]
and is a starting point to calibrate.

Caveat on independence: Tanzillo's critique (TZ-C) and the SIGGRAPH talk (KT) share Michael
Tanzillo, so their agreement is one school (Blue Sky). Brejon (video and book) is the independent
voice and quotes Animal Logic, Ilion, DreamWorks and Pixar lighters. No source gives numeric
key-to-fill ratios ("everything about ratios is qualitative", Brejon book note): the stop targets in
`MOOD_RATIO_STOPS` are ours.

## Michael Tanzillo, Lighting Critique (TZ-C, 5X4-uavfVgA, 2024)

Senior Lighting TD, Blue Sky Studios; co-author of "Lighting for Animation". The only
critique-format source: the order and vocabulary a lead uses on a finished frame.

- **Order of a pass over a frame:** watch as a viewer; compare with the artist's own reference and
  name what it does structurally; squint; fix the value structure; redirect the eye; offer the
  alternative read; check physical plausibility; hunt technical artifacts; paint over to prove the
  note [00:00:39] [00:08:06] [00:11:53] [00:08:38] [00:12:27] [00:13:34] [00:05:53] [00:03:24]
  [00:16:27].
- **Squint test:** "if I kind of just like squint my eyes to the image my eye just really wants to
  go up into here" [00:11:53]. Bright overhead sources drag the eye up; fix with leading lines down,
  a bigger pool of light at the subject, darker windows and highlights high in frame [00:12:27]
  [00:13:00]. Code: `saliency` + `focus_check`, finding `eye_path` with the "pulled UP" message.
- **Back-to-front black levels:** "we want the most lifted back here we want midtone values here and
  then the darkest here in the foreground" [00:08:38]; unimportant background can lose contrast
  entirely [00:11:53]; atmospheric falloff even in stylized films (Spider-Verse) [00:15:20]. Code:
  `depth_structure` on Z, subject excluded.
- **A lone hue is an eye magnet:** "the only red element in this very very cool blue scene"
  [00:14:39]. Code: `isolated_hues`.
- **Physical signatures inside a frame:** window light diffuses with distance, so far shadows cannot
  be razor sharp; enlarge the light [00:05:53] [00:06:58]; rays from one distant source run parallel
  [00:12:27]; skin needs oily specular on the lit side [00:06:26]; SSS "some, not much" [00:07:31].
- **Local fix under a liberal contract:** a separate key light-linked to a second character to match
  the first one's wrap [00:06:58].
- **Set dressing for light:** primitive blockers inside unseen rooms break a uniform window glow
  [00:18:07]; practicals need a hot core [00:18:39].
- **Technical tells:** dark outline on DOF edges (a multiplied edge in Nuke) [00:03:24]; a
  background staying sharp while the foreground racks focus [00:03:58]; a wall rendering pure black
  means a broken material [00:08:38].
- He labels his late notes "very nitpicky" [00:19:12]: structure first, polish last.

## Jasmine Katatikarn and Michael Tanzillo, Secrets From A Lighting Artist (KT, iYTjebUHX9o, SIGGRAPH 2020)

Senior Lighting TDs, Blue Sky (about ten films each).

- **Three goals for every decision:** mood, visual shaping, directing the eye to the most important
  element [00:04:18] [00:42:33]; the first question is "what is the story I am trying to tell?"
  [00:16:50]; the target is the story action (the hand touching the nose in How to Train Your
  Dragon), not the face by default [00:15:49] [00:16:21].
- **Mood levers:** value, position, hue, saturation, softness, color psychology [00:04:40]; hue
  alone moves the Epic deer shot from romance to documentary to alien threat [00:05:11]; soft and
  shadowless reads happy, high contrast dread (Doris Day vs Elizabeth Taylor) [00:06:14]; warm skin
  is life, cool light on warm skin drains it (Incredibles office) [00:07:47]; food must be warm
  [00:08:19].
- **Shaping:** light-to-dark or warm-to-cool falloff across every form; "nothing in the real world
  is a constant tone" [00:10:11] [00:12:20]; Rembrandt key about 45 degrees to the side and slightly
  above, the lit triangle on the far cheek [00:11:15] [00:11:47].
- **Directing the eye with contrast pairs:** light over dark, dark over light, warm over cool,
  complementary hues, saturated over desaturated, detailed over abstract [00:13:22] [00:13:54]
  [00:14:26]; the Piper shadow was painted in for the story [00:13:54]; 7 frames is enough for a
  read [00:13:22].
- **Brighten by darkening the surround:** pushing the subject clips it; after darkening the
  background the character "looks so much brighter" with unchanged values (simultaneous contrast)
  [00:29:59] [00:30:31] [00:31:04]. Code: `separation`, `subject_clipping`, and the fix text of
  both.
- **Demo order (hero version):** fill value first, then key for Rembrandt shaping, rim for
  separation, specular pass for fleshy skin, falloff across the couch, eye dings, vignette, glow
  [00:27:52] [00:28:24] [00:28:55] [00:29:26] [00:31:04].
- **Hard-luck version:** frontal top-down key, cooled light, haze behind the character to separate a
  cool figure from a greenish set [00:32:08] [00:32:39] [00:35:50]; one RGB pass carries three
  interactive lights [00:33:43]; two keyed spotlights close enough to blow out fake a passing car
  [00:34:15] [00:35:18].
- **Pipeline:** the master lighter lights 3 or 4 key shots with the art director and paint-overs;
  shot lighters inherit the rig in packets and match "in its own way" [00:50:00] [00:50:32]; a
  lighter owns whole shots [00:25:42]; about 3 to 4 days of rough passes before first dailies, 9 to
  11 approved shots in a strong week [00:53:11] [00:53:44].
- **Lighting vs comp:** get 90% of the look in the beauty because shaping cannot be faked in comp
  [00:45:39]; triage notes: "the key needs to be moved" is lighting, "lift that fill by 10" is comp
  [00:47:19]; build for predictable notes (interactive lights as separate passes) [00:44:14]; the
  cheapest solution that hits the note wins (cars as roto shapes on a released film) [00:41:16].
- **Judge in the cut:** a beautiful shot that does not match its neighbors is rejected [00:18:25]
  [00:18:56].

## Chris Brejon, Master and Shot Lighting, Night Bar (BR, PHskvc6WYWI, 2020)

Lighting supervisor (Illumination Mac Guff, Animal Logic, Weta, Framestore); Guerilla Render on
screen, so no settings port.

- **The contract first:** Illumination is "very conservative" (masters made universal), Animal Logic
  treats "almost every shot [as] a master on its own" [00:00:32] [00:01:06]; his own verdict "Over
  continuity, I choose cinematography" [01:07:51]. Allowed shot tweaks in his exercise: exposure,
  position and rotation, on and off [00:37:17]; color too on Lego Batman [00:37:51].
- **References before any light:** two days lost lighting without one [00:08:13]; posterize a film
  frame into key, wrap, rim and core zones, the core "is not a light" [00:09:19]; the wide reference
  showed the two characters keyed from opposite directions [00:09:53].
- **Test shading:** ACES view, everything on a linear 0.18 gray [00:04:21] [00:04:54].
- **Practicals first; dark characters are good news** [00:19:46]; practicals at their physical
  places with IES patterns, "too simple, too poor" without them [00:17:37] [00:18:10]; they license
  the dramatic lights: a strong key with nothing motivating it looks weird [00:22:30]. "Reality is
  boring" [00:22:30].
- **Dramatic lights one by one, each rendered on all four shots** [00:25:14]: key = "the main
  shaping light... not necessarily the strongest" [00:23:36], a small area source for sharp shadows
  [00:27:59]; wrap (Deakins' term) "a bit front lit, lower in exposure, and a bit more saturated",
  about twice the key's size [00:26:54] [00:27:59]; rim outlines and faces the camera; a rim that
  only catches hair is wasted [00:27:59] [00:30:11]; top light reads natural, from below scary
  [00:30:43]; volumetric lights are the only linked lights [00:31:14].
- **No light on the camera side facing the characters:** "we don't want them to lose contrast"
  [00:13:46]. Code: the wrap is pushed at least 30 degrees off the lens axis [added threshold].
- **Volumetrics from the first render**, adding them later "looks like crap" [00:33:29] [00:34:01].
- **Shot lighting:** sfumato on the CU [00:38:24]; counterchange, "when I have light in the
  background, I have shadow in the foreground and vice versa" [00:38:56]; never dark on dark on a
  face [00:40:02]; a bright object between two characters ties them [00:41:07]; foreground dark and
  contrasty, generally [00:29:06]; areas left dark on purpose [00:42:13].
- **Color last and split by medium:** orange and teal between volume and surfaces so they do not
  blend to gray [00:47:40] [00:49:19].
- **Comp checks:** LPE layers sum exactly to the beauty, "It's mathematic" [00:59:41]; merge plus on
  RGB, not RGBA, or alpha accumulates [01:00:14]; carry the grade back as a multiplier on the light
  color (gain 0.2 0.5 2 on 0.6 0.42 0.13 gives 0.12 0.21 0.26) [01:02:57] [01:03:30]. Code:
  `check_sums`, `grade_to_light(mode="multiply")` reproduces the example exactly (offline test).
- **Groups:** 30 lights, 9 light AOVs by category [01:12:25].
- **DOF in 3D:** "you will spend more time tweaking defocus in Nuke" [00:54:45]; bokeh needs energy
  (small bright sources) [00:55:51].

## Chris Brejon, CG Cinematography, chapters 6, 8, 8.5 (BR-B)

- **Continuity is cultural:** "as long as the shots belong to the same world" (ch6 § Continuity);
  audiences forgive a moved key between cuts but notice a signature feature (a strong rim) that
  comes and goes (Walvoord; ch6 § Hugo, § Speed Racer). The Lion King team moved the sun on
  virtually every shot (ch6 § The Lion King). Code: `compare_frames` group energy in stops per
  character's rim [added].
- **Balance:** "You guys have too many light sources at the same intensity. You cannot pick one
  above the others" (Freckelton, ch6 § Balance); a rim as strong as the key is the most common
  failure; symmetric lighting only when the art direction is symmetric (ch6 § Planet 51, § Lego
  Batman). Code: `group_levels` gap, `rim_equals_key`, `symmetric_face`.
- **Contrast, negative space, vignetting:** the eye goes to the most contrasted area (ch6 §
  Contrast); a white sheet behind a poorly lit head can beat complex lighting (ch6 § Hannibal);
  darker foreground, brighter far background (ch6 § Negative space); fade lights at the periphery
  with blockers, a default directional "would blast everything equally" (ch6 § Vignetting); place
  the lamp where you want attention (ch6 § Matrix Reloaded).
- **Shot lighting procedure (ch8):** watch the full sequence and answer the question list first (§
  Watch the full sequence); render the rig out of the box and agree a direction with the lead; a
  15-frame shot does not deserve a week (§ Do a first pass); optimize because each artist owns the
  shot's render time, but check a "useless" light's reflections before deleting it: with quadratic
  decay diffuse falls off faster than reflection (§ Optimization); widest shots first, close-ups
  last (§ Close up lighting); one master per camera axis (§ Start with practical lights); break the
  rig two or three times a day (§ Master lighting and its limits); constrain lights only to keep an
  effect on a moving character, never practicals (§ Constrain of lights, § Constrain in The Star).
- **Character lighting (ch8.5):** five portrait rules (Ilion): no harsh shadows, no flat lighting,
  no black areas, one shadow direction, do not cut the face in half (§ Introduction); light upstage,
  Munich turned the sun in every shot to avoid lighting downstage (§ Lighting upstage and
  downstage); wrap "is really the art of making multiple lights appear to be one light" (Walvoord, §
  Dramatic Character lighting); never ambient (§ Ambient lighting); top light supports the
  environment, dropped for low-key looks (§ Top light); "I never create special lights for the
  eyes"; highlight present unless the character is dead or defeated, sharp for anger, bigger and
  dimmer for thinking (§ Eyes lighting, § Eyes and psychology); name natural and practical lights by
  what they are, dramatic lights by what they do (§ Natural Lighting vocabulary).

## Chris Brejon, CG Cinematography, chapters 1, 1.5, 9: color and comp (BRJ-CM)

- **The color workflow is the first project decision** (Ch.1 § The first and most important
  decision); scene-linear is compulsory and viewing it without an S-shaped view transform is wrong
  (Ch.1 § Scene-Linear workflow, § Display-linear confusion).
- **Without tone mapping you over-rig:** you lower burnt lights, lose GI and SSS, add lights, "and
  this is how you end up with a complicated rig of 50 lights" (Ch.1 § A simple visual example).
- **ACEScg is different, not better;** never render in ACES2065-1; ACES 1.x output transforms skew
  saturated blues toward magenta and clip saturated volumetrics (Ch.1.5 § A closer look at ACEScg, §
  Why ACEScg?, § Hue skews and Gamut Clipping).
- **After a rendering-space change, delete the TX files** (Ch.1.5 § Cornell box example).
- **EXR half for beauty and AOVs, float for Z and P, DWAB for size** (Ch.1 § Format). This skill
  writes zip by default because the pure reader and every comp package read it [added choice].
- **Clamps:** indirect clamp no lower than 10 in his experience, pixel clamp 30 to 50 in studios;
  low clamps desaturate blooms (Ch.1 § Range; Ch.9 § Exposure and clamping example).
- **Exposure QC:** go down and up five stops, find the brightest pixel, squint, thumbnail, flip
  (Ch.9). Code: `exposure_bracket`, `exr_sanity`.
- **Glow as an exposure check:** "Don't arbitrarily tweak the glow, tweak your light's exposure
  instead" (Ch.9 § Exposure control by Lens effect).
- **Nail it in CG:** "the more you leave to compensate in comp, the cheaper the movie will tend to
  look"; roll comp balance back into the lights; repeated issues go back to the source (shoji
  screens fixed in surfacing because a grade cannot brighten GI or reflections); animated lights
  belong in LPEs (Ch.9 § The only rule, § LPE and AOVs, § Shoji screens, § What we SHOULD not do in
  3d).

## Arvid Schneider, Cinematic Lighting Techniques (ARV-L, 2SDDFiQQH5g, 2020)

VFX lighting supervisor (ILM, Image Engine alumnus).

- **Physical size and distance:** tiny sources make "painting" reflections; lights hugging the
  subject burn out and break when it moves [00:02:50] [00:03:24].
- **Key strongest; tone down competitors** [00:02:50] [00:06:51] (the decider against Brejon's "main
  shaping light" is in SKILL.md).
- **Exposure 15 to 20 in his cm scene** [00:03:58]; this skill's `exposure_for_target` formula lands
  in that range at 1 to 2 m [added derivation]; spread is the softbox grid, default 1 fully open
  [00:04:30] [00:05:02]; Kelvin for warm and cool [00:05:08].
- **Name by role:** `lgt_key_01`, `lgt_rim_01`, `lgt_bounce_01`, `lgt_kick_01` [00:06:16]
  [00:12:25]; keep alternative setups as toggled groups [00:10:45] [00:11:19].
- **Cool and warm contrast between key and rim** is "the most seen way", match the reference
  [00:07:24]; a subtle up-light card helps read the expression [00:08:31] [00:09:37]; small source
  harsh, big source soft [00:09:04].
- **Blocker to shape falloff** instead of re-aiming [00:14:30]; barndoors are spot-only in Arnold
  (LGT), use blockers on area lights [added from doc].
- "It's super important that everything has roundness to it" [00:18:21].

## Arvid Schneider, 12 Tips for Faster and Beautiful Renders (ARV-T, XZfsqJ0_9go, 2020)

- **Less noise at the same samples is a faster render; find the noisy sampler first:** raising
  diffuse did nothing, one or two more light samples cleaned the frame; "no need at all to go crazy
  on your AA" [00:01:33] [00:03:38] [00:04:11]; kill diffuse and specular indirect first to see
  where the noise lives [00:04:44].
- **Ray depth is a visual A/B:** diffuse 4 for most interiors, test 6, keep the lower if equal;
  specular never above 2 unless glass panes or inter-reflecting metal [00:05:26] [00:05:59].
- **Samples multiply:** light samples down to 2 at AA 6 to 10 [00:07:12] (per-light advice now
  superseded by Global Light Sampling, still valid for the skydome).
- **HDRI resolution:** 1k usually, 4k max, 8k only for very reflective scenes; a 16k map changed
  only the visible background [00:07:54] [00:09:32].
- **Analytic lights over mesh lights and emission:** a cylinder area light replaced a tube mesh
  light, "amazing" noise difference [00:10:18] [00:10:51].
- **Reserve UI threads in GUI sessions** (-20 of 80) [00:13:05]; **pre-bake TX** with auto-convert
  off and use-existing on [00:14:13] [00:14:44]; stand-ins for heavy repeats [00:15:57].
- **Motion blur and DOF cost AA:** about 12 for motion blur, up to 20 for strong DOF, secondaries
  and light samples at 1; or Z and motion vector AOVs with instantaneous shutter for comp [00:18:50]
  [00:20:29] [00:21:35].
- **Denoise:** 6 s noisy plus denoise against 84 s brute force, "a bit too much blurring" in places
  [00:23:22] [00:26:04].

## Arvid Schneider, Realistic Car Render (ARV-C, cpMBRIWwghg, 2021): the product-shot lessons

Shading belongs to scenario-maya-lookdev; these are the lighting and finishing points.

- **Reflections are the tell and the product:** "just look at the reflections, are they perfectly
  straight" [00:35:49]; he recreated the reference's lights (a strong light and bonnet lights)
  before tuning the paint [00:36:21]. The skill turns this into `reflection_placement` and
  `plan_product_rig`.
- **Integration:** a shadow matte with the HDRI projected as its background, color-correct the plate
  not the lighting [00:49:49] [00:50:21]; AO multiply for contact [00:50:54].
- **Finishing:** "in CG it's always just too black": a subtle shadows lift (about 0.15), vignette, a
  warm bloom [00:52:51] [00:53:24]; denoise last in his session and do not erase the flakes
  [00:54:27]. The Arnold doc places the denoiser first in the imager chain (the order), Arvid's
  caution is about detail (the gate): `detail_loss`.

## J Hill, Hyper Realistic Character Rendering (JHILL, mpk6IurOWbs, 2022): portrait and product lighting

AAA lead character artist (Turtle Rock).

- "To make lights soft just like the real world it means that it must be large" [00:08:26]: a big
  disk key aimed slightly off center so the nose casts a shadow, exposure 16 "for this scale"
  [00:08:58].
- An outdoor sun HDRI gives hard portrait shadows; swap to a studio HDRI as fill [00:11:36]; the
  same exposure on a bigger light looks dimmer (normalize) [00:13:47]; rims can be small and hot
  [00:13:47]; skydome camera 0 for a black background [00:53:38]; keep alternate rigs in groups
  [00:54:44].

## Reza Sarkamari, Light AOVs with Maya and Nuke (SARK, _jGC7_fRlfw, 2022)

Nuke Certified Trainer.

- **Light groups exist so client notes can be answered in comp** without a re-render [00:11:28].
- **The name contract:** light AOV Light Group string plus a custom `RGBA_<group>` AOV; a typo
  renders an empty pass with no error [00:05:41] [00:06:15] [00:07:19]. Code: `group_contract`,
  `near_duplicates`, `check_sums` empty layers.
- Audit the rig in the Light Manager and solo each light first [00:01:28] [00:02:33]; tests at 540,
  finals at 1080; final AA 8, diffuse 2, specular 2, diffuse depth 2 for his toy product [00:07:52]
  [00:08:27]; merged EXR, half precision [00:08:59]; plus merges in Nuke, rebuild equals beauty
  checked by toggling [00:10:57] [00:13:33].

## Maya Learning Channel, Color Management: ACES default (MLC, FODVxXOIrvM, 2022)

- ACES tone map: rendering value "a bit more than 16" maps to display 1 and 1.0 to about 0.81
  [00:02:13]; the legacy sRGB gamma view clipped everything above 1 [00:02:46]. Old light values
  must be re-judged, not copied. `display_approx` reproduces 0.84 for 1.0 and 1.0 for 16 (offline
  test), a screening curve only.
- Policies and the `OCIO` variable override scene settings; a policy rewrites old scenes on open
  [00:03:21] [00:03:52] [00:04:22].

## Arnold and Maya 2027 documentation (SMP, AOV, LGT, CM)

- **Sampling model (SMP):** rays per pixel = AA^2 x samples^2 (AA 6 with specular 6 = 1296; AA 3
  diffuse 2 = 36) (§ Camera (AA), § Sampling); typical final AA 4 to 8, rarely 16; IPR defaults AA
  3, diffuse 2, specular 2, transmission 2, SSS 2 (§ Using AOVs to Identify Noise).
- **Noise map:** alpha to AA; indirect diffuse to diffuse; direct diffuse and direct specular to
  light samples; indirect specular to specular; transmission, SSS, volume to their samplers; diffuse
  seen through reflections only improves with AA (§ Clean Renders table, § Diffuse Surfaces Through
  Reflections). Setting a light's Samples to 0 disables it (LGT § Samples, Note).
- **Global Light Sampling:** one count, 4 or fewer on CPU, 1 or 0 when a skydome or distant light
  dominates; environment and distant lights are not managed by it (§ Global Light Sampling, §
  Limitations); MtoA 5.6.0 adds per-light sampling mode (local) and raises the GLS max to 1024
  (version deltas 2.6).
- **Adaptive:** only engages with AA >= 2 and Max AA > AA; for localized noise (DOF, blurred
  speculars, buzzing rims, hair); off in low-AA previews; Max AA 20 and threshold 0.015 in the text,
  0.05 in one caption (§ Adaptive Sampling) [verify the 2027 default].
- **Fireflies playbook** (§ Fireflies - Boat Scene, § Volumes - UFO scene, § Light Decay Filter):
  roughness, ray switch, visibility on the emitter, mesh light off its mesh, light decay filter,
  per-shader clamp, global clamp last. More specular samples did not help the sun-on-sea case.
- **Emission is the noisiest light:** emissive surface at diffuse 16 in 5:36 still noisier than a
  mesh light at diffuse 2 in 9 s (LGT § Mesh Light vs Emission).
- **Interiors lit by a skydome:** portals over every opening, Interior Only (LGT § Light Portal);
  final diffuse depth 4 (SMP § Denoising a Room Interior).
- **Lights (LGT):** power = color x intensity x 2^exposure; normalize on keeps energy constant with
  size; unsupported: Maya ambient, volume light, constant decay; blockers on any light, barndoor and
  gobo spot-only; instanced lights need light linking none; the skydome is not in the light linking
  window.
- **AOVs (AOV):** three additive sets rebuild RGBA; at most 16 light AOVs; ungrouped lights land in
  `<aov>_default`; in LPEs use `<L.'group'>`; per-light-group indirect AOVs exclude emission since
  Arnold 7.3 (version deltas 2.6); 8-bit outputs get the view transform, 16/32-bit the output
  transform, Raw by default (§ Arnold Driver Advanced Output > Color Management).
- **Denoisers (AOV):** OIDN imager by default in new scenes, Apple GPUs M1+, first in the chain, box
  filter, full frames; noice for finals and sequences with variance AOVs, N, Z, denoise albedo,
  Preserve Layer Name, not multipart; filter strength 0.45 (0.2 keeps texture, 0.8 for GI and SSS);
  `-ef` up to 2; no `-t` on macOS; OptiX and Arnold GPU absent on macOS.
- **Color (CM):** ACEScg default; the shipped rules tag .tx, .hdr and .exr Raw; rules live in user
  prefs; Apply Output Transform to Renderer only for previews, off for EXR; precedence scene <
  `OCIO` < policy.
- **Render Setup (CM):** collections top-down; `*foo*` misses namespaces; scripted time, distance,
  angle overrides in internal units; shader overrides fail on stand-ins; Render Setup nodes dropped
  on import or reference, so templates; exclusive with legacy layers per session.
- **Batch (LGT, PY, WN25):** command-line renders watermark without an Arnold license; since Arnold
  7.3 batch renders abort on a license failure by default (`abort_on_license_fail` true, batch
  only), and WN25 names `ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL` as the override (the 0 = watermark
  reading used by `mx_run` is [verify]); kick: `kick -licensecheck` before a long batch,
  `-set options.abort_on_license_fail true` to fail loudly (LGT § Useful Commands); Render > Render
  Sequence avoids the watermark interactively; kick loads every dylib in its working folder; save
  before rendering from a script.
- **Cameras (LGT § Cameras, § Aperture):** `aiApertureSize` is the RADIUS of the aperture in world
  units, `aiFocusDistance` the distance in perfect focus, blades 0 = circle; the doc's "smaller
  aperture, shallower depth of field" is a slip (smaller is deeper). Depth-of-field arithmetic is
  not in the sources: `dof_plan` and `dof_zone` use the thin-lens geometry with a circle of
  confusion of frame width / 1200 [added].
- **Skydome resolution (LGT § Resolution):** default 1000; match the HDRI for accurate reflections,
  often lower is fine, higher costs importance-table precompute. With Arvid's 1k for lighting (ARV-T
  00:07:54) the decider is whether something mirror-like sees the dome.

## Disagreements and their deciders

| Question                        | Positions                                                                                                                                                      | Decider                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the key the strongest light? | Arvid yes [ARV-L 00:06:51]; Brejon the main shaping light, not necessarily the strongest [BR 00:23:36]                                                         | pick the key by shape; test dominance of ONE group on the subject (balance), not "key is highest"                                            |
| Fill first or last, from where? | Mike fill first [KT 00:27:52]; Brejon no camera-side light, wrap front-ish [BR 00:13:46]                                                                       | order is habit; direction is the rule (never the lens axis, never ambient)                                                                   |
| Continuity                      | Blue Sky: match the master [KT 00:50:32]; Animal Logic: break it for a better shot [BR-B ch6 Lego Batman]                                                      | the studio's contract; the Walvoord test: directions may change, signature features may not                                                  |
| Light linking                   | Tanzillo: a linked second key as a local fix [TZ-C 00:06:58]; Brejon: none in the master except volume-only lights [BR 00:10:59]                               | local shot fix under a liberal contract; never in a shared master                                                                            |
| Eye lights                      | Mike adds eye dings [KT 00:31:04]; Brejon never [BR-B ch8.5 Eyes lighting]                                                                                     | portfolio still: a ding (often in comp); production: shape real sources                                                                      |
| Passes vs beauty                | Mike builds from key, spec, fill, rim passes [KT 00:27:20]; Jasmine beauty-first [KT 00:46:44]                                                                 | production is beauty-first with light groups for small moves                                                                                 |
| Haze                            | Brejon from the first render [BR 00:33:29]; Mike late, to separate [KT 00:35:50]                                                                               | atmosphere in the story world: from the start                                                                                                |
| DOF in 3D or comp               | Brejon 3D [BR 00:54:45]; roto cars defocused in comp [KT 00:40:41]; Arvid Z for comp is a budget call [ARV-T 00:19:23]                                         | hair, transparency, overlapping depth: 3D; small, flat, far: comp                                                                            |
| Light samples                   | Arvid 2 per light [ARV-T 00:06:39]; doc 3 to 4 per light (pre-GLS); GLS page one global count [SMP]                                                            | Maya 2027 uses GLS: global 4 on CPU; per-light only for skydome, distant and local-mode lights                                               |
| Rim strength                    | J Hill rims "small and hot" [JHILL 00:13:47]; Brejon no light as strong as the key [BR-B ch6 Balance]; Arvid reduces the rim when it competes [ARV-L 00:06:51] | small and hot is radiance on a small source: the rim's contribution on the subject stays at least 0.5 stop under the key's [added threshold] |
| Skydome resolution              | Arvid 1k for lighting, 8k only for very reflective scenes [ARV-T 00:07:54]; doc match the HDRI for reflections [LGT § Resolution]                              | mirror-like surfaces see the dome: HDRI width (cap 8k); lighting only: 1k                                                                    |
| Starting a noise pass           | Arvid everything at 0 [ARV-T 00:03:38]; doc render AOVs from defaults [SMP]                                                                                    | AOVs first (one render tells where), elimination only to confirm                                                                             |
| Denoiser                        | Arvid noice after an EXR batch [ARV-T 00:24:27]; docs OIDN by default [AOV]                                                                                    | macOS: OIDN for previews and most stills; noice with variance AOVs for sequences or co-denoised groups; never OptiX                          |
| Clamping                        | doc defaults 10 [SMP]; Brejon indirect >= 10, pixel 30 to 50 [BRJ-CM Ch.1]                                                                                     | fix fireflies at the source; global clamps as a floor                                                                                        |
| Fix in comp or 3D               | Sarkamari light AOVs for notes [SARK 00:11:28]; Brejon nail it in CG [BRJ-CM Ch.9]                                                                             | GI or reflections must change: 3D; many shots share it: source; else comp, then copy back                                                    |
| HDRI input space                | MtoA 2017 page Raw [LGT § Skydome]; Arnold ACES page calls Raw under ACEScg incorrect [CM]                                                                     | the rendering space: under ACEScg a linear-sRGB HDRI is linear Rec.709                                                                       |
| ACEScg                          | Maya default, industry recommended [MLC 00:00:38]; Brejon different, not better [BRJ-CM Ch.1.5]                                                                | the pipeline's config and delivery; keep the Maya default without a studio config, check saturated lights for skews                          |

## Outdated in the sources (do not copy into 2027 code)

- Guerilla Render numbers (2048 samples, 0.03 threshold, 16 bounces) do not port to Arnold [BR
  01:04:37].
- Per-light samples as the main knob and Low Light Threshold tuning predate GLS [ARV-T 00:06:39;
  SMP].
- "Output Denoising AOVs", AOV shaders and OptiX per-AOV filters sit in Legacy; noice "variance" is
  now Filter Strength.
- Maya IPR does not work with MtoA 5+: Arnold RenderView (version deltas 2.6).
- Viewing through sRGB gamma, gammaCorrect nodes, HDRIs on Raw under ACEScg, the downloaded ACES 1.2
  config, ACES2065-1 as a rendering space, hardcoded color-space strings (version deltas 2.7, 3).
- `maya -render` and `Render -pre/-post` are obsolete; `Render -log` is Windows only.
- Simple bloom and `bloom_radius` are deprecated in 5.6.0 (aperture mode).
- Constraining lights for shadow-map resolution belongs to the shadow-map era [BR-B ch8 Constrain of
  lights].
