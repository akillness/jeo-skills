# Critique rubric: judging a material system before calling it done

Use after every build round. Score each line 0 (missing or wrong), 1 (partly), 2 (met with
evidence). Evidence means a file: a lint or census report, a CSV, a capture. A line without evidence
scores 0 whatever the preview looks like. Deliver only when every "blocking" line scores 2 and the
total is at least 80% of the lines that apply.

Order matters: measurable checks first (they are cheap and objective), captures second, eyes last.
Before looking at any capture, run `ue_review.review_images` (or `image_checks`) and read its flags:
an agent once approved an all-white frame (scenario-unreal-expert).

## 1. System design (blocking)

- [ ] One master per domain and blend mode; nothing that differs by blend mode, domain or shading
      model is a static switch (each would fork anyway) [added, consistent with HSPR].
- [ ] Every static switch gates texture samples or heavy math most instances skip; the plan says
      which (`lint_graph` rule `static_switch_cheap` absent) (Lauf [wobQ8ZKQpbc 00:40:24]).
- [ ] No Static Component Mask Parameter; no If using the A == B pin; no Custom node doing plain
      arithmetic (Lauf [00:42:35, 00:40:56]; Swierad [y0QASid1v8w 00:14:34]).
- [ ] Approved presets written down; `census()` unique static sets per root at most that number; no
      override at the parent default; HSPR only on presets (mat-upd 5.7).
- [ ] Parent usage flags limited to what every child needs; instance overrides for the rest;
      "Automatically set usage" off on the material and in Project Settings (Lauf [00:31:10,
      00:44:18]).
- [ ] Per-actor variation through Custom Primitive Data or Per Instance Random, not new instances
      (VTA [eBS3BOI5KnM 00:13:20]; Sumo [SAr7oPKsgLE 00:18:11]).
- [ ] Architecture written: lean master or Material Layering System, with the projected
      `lauf_permutations` (x quality levels when a Quality Switch is used) and the library size as
      the deciding numbers (Sumo [SAr7oPKsgLE 00:03:20]; Nadro [wobQ8ZKQpbc 00:05:32]).
- [ ] Every switch added after the first plan has a `switch_ranking` count; functions few instances
      use live in a duplicate or sibling, not behind a new switch (Lauf [00:29:31]).
- [ ] World-wide values (wetness, alert state, dirt level) come from at most 2 MPCs per material,
      parameters reserved early (`mpc_limit` absent) (instances doc, Limitations).
- [ ] Kit variety and seams considered: value-clamped ID masks instead of binary paint IDs,
      world-aligned projection across modular seams, world-space directional blends; each option's
      samples counted (Sumo [SAr7oPKsgLE 00:14:54, 00:20:11]; Ben [pXOknekvmwE 00:12:57]).

## 2. Cost (blocking where measured)

- [ ] Samples per preset within budget, all on Shared: Wrap where more than a handful; grayscale
      maps that share UVs are packed (`pack_grayscale` absent) (Tech Art Aid [00:56:35]).
- [ ] No dependent or noise-distorted UV reads on large surfaces unless the effect needs them and
      the cost was measured (`dependent_read`) [00:50:02].
- [ ] `cost_census` within the project budgets: samples including material functions (every
      `function_not_expanded` opened and summed, "cheap" in a name is not a measurement),
      transcendentals split into independent (hidden in fetch latency) and dependent (paid in full);
      dependent ones moved to vertex or Customized UVs when possible [00:20:57, 00:39:34, 00:46:03,
      00:22:31].
- [ ] No node deleted "to strip shaders" without `shader_count` before and after: 5.8 compiles only
      connected, non-zero outputs (Nadro [wobQ8ZKQpbc 00:13:13]).
- [ ] GPU A/B on a fixed camera: frame GPU and the relevant pass (BasePass, Translucency, DBuffer
      decals) per preset against the baseline; instruction counts reported as context only (P9).
- [ ] Shader count per root from `shader_count` (ListShaders, upper bound) within the project budget
      (Nadro [00:18:57]).
- [ ] Shader Complexity used only as a hint; never cited as proof of cheapness (mat-upd 5.8;
      Swierad).

## 3. Substrate (blocking on Substrate projects)

- [ ] `r.Substrate` and the GBuffer format match the written decision; Blendable for 60 Hz and
      constrained targets; Adaptive only with a named Adaptive-only need and its memory cost; the
      decision states that Blendable caps every platform and that Adaptive falls back per platform
      (P1; mat-upd 5.7).
- [ ] New graphs start from a Slab (or the Metalness helper into a Slab); no hand-added Substrate
      Shading Model node (`substrate_shading_models_node`) (Substrate overview, Additional Notes).
- [ ] Window > Substrate panel read for every multi-slab material: the features in downgrade order
      match the plan (Morgan [00:12:51, 00:38:43]).
- [ ] Worst-case closures within the profile (`substrate_closures`); parameter blending planned from
      the start on the right operators; not on Vertical Coats that carry transmission unless the
      platform forces it (Morgan [00:38:08, 00:38:43]).
- [ ] No Substrate Add unless one input is emissive only; every Vertical Coat top slab has a
      non-zero MFP; no Horizontal Blend with a constant Mix (Morgan [00:30:18, 00:27:15, 00:29:38]).
- [ ] Mask cost reasoning matches the operator: a parameter-blended Horizontal Blend is one slab
      everywhere and Blendable keeps one slab per pixel, so mask sharpness is artistic there
      (`mask_cost(..., parameter_blended=True)` or `blendable=True` gives `applies` False); only a
      Horizontal Blend without parameter blending on Adaptive is priced by its non-unitary share
      (Morgan [00:29:38, 00:37:35, 00:12:51]).
- [ ] No Adaptive-only features on a Blendable project (second roughness, glints); fuzz plus SSS on
      one slab accepted knowingly (Blendable keeps fuzz) (Ben [Z281PRQInRA 00:06:07]; Substrate
      overview).
- [ ] Converted-material inventory kept; nobody plans to turn Substrate off (Morgan [00:15:19]).

## 4. Values (blocking)

- [ ] Albedo textures: sRGB 20 (50 rough) to 240 over at least 99.5% of texels; metal regions at
      least 180 (`albedo_stats`) (Ben [fePsD_8p9vM]).
- [ ] Metallic binary except narrow transitions (`metallic_binary_share`); Specular at 0.5 or cavity
      x 0.5, never 0 on realistic assets (Ben; PBR doc).
- [ ] Substrate: dielectric F0 at most 0.08 except tagged gems, semiconductors, carbon fiber (up to
      about 0.18); metals albedo 0 and F0 average at least 0.5; F90 unconnected unless a hue shift
      is intended (`check_values`) (Ben [a94Lpu1_4dg 00:16:16]; Morgan [00:09:30, 00:18:40]).
- [ ] Measured metal values from the table (iron 0.56, aluminum 0.91, gold 1.0/0.77/0.34...), not
      eyeballed.
- [ ] Instance parameters pass `audit_instance_values_project` (P16), not only the source textures
      (Ben [a94Lpu1_4dg 00:16:16]).
- [ ] Specular occlusion from cavity where a cavity map exists (Specular = 0.5 x (1 - cavity), which
      dims F0 in crevices through the Metalness helper); the Specular buffer shows 0.5 with darker
      crevices (Ben [fePsD_8p9vM 00:14:25]; PBR doc Cavity Maps).

## 5. Textures (blocking)

- [ ] `audit_textures` passes: compression by role, sRGB only on color, no packed normal as
      Normalmap, sampler types match, no NoMipMaps on world content, no stray alpha (Ben
      [gjOO5g4cgng 00:11:02]; [h95X255NhOo]).
- [ ] Resident size at most 2048 for games (per-texture Maximum Texture Size or LOD bias, group caps
      understood); power-of-2 sizes so they stream (textures doc).
- [ ] BC7 only where BC1 artifacts show or channels are unrelated; HDR as BC6H; RDO judged with
      Final encode (textures doc).
- [ ] Normal maps DirectX-style (green lit from below) (Ben [gjOO5g4cgng 00:04:18]); Normalize after
      making Mips on; distant shimmer handled by Composite Texture (roughness from normal) (textures
      doc).
- [ ] Every sample's Sampler Type matches its texture's compression (`lint_graph(..., textures=)`,
      no `sampler_type_mismatch`) (Ben [h95X255NhOo 00:16:54]); Alpha-compressed textures carry
      their data in A [00:13:03].
- [ ] Cooked build: `listtextures` rows within the profile cap and the pool
      (`texture_memory_findings`, P17); Platforms panel checked for textures that drop or stay
      inline (textures doc).

## 6. Glass, screens, decals

- [ ] Glass: Colored Transmittance only when tinted (Gray otherwise); Surface Translucency Volume
      unless local-light highlights matter; Pixel Normal Offset on flat panes; tint from
      Transmittance-To-MFP; frosted only with rough refraction on (Ben [sf-K257zWh8]).
- [ ] Capture of glass in front of a high-contrast background, at a silhouette: no hard refraction
      seams; tint visible "but not too in your face" [00:10:26, 00:17:49].
- [ ] Screens: emissive readable but not clipped under the scene's exposure; small bright screens do
      not make Lumen noisy (if they do, lower emissive and add a light) [added]; scrolling text
      under TSR does not smear (Temporal Responsiveness: experimental, masked,
      `r.Velocity.TemporalResponsiveness.Supported=1`, a small WPO on Nanite meshes; mat-upd 5.7);
      screen math stays independent of the content sample.
- [ ] Decals: blend mode valid for the pipeline (Convert To Decal in Substrate); decal masters with
      Used with Static Mesh off unless used as mesh decals (`decal_static_mesh`); each receiver's
      Decal Response is the union of the channels its decals write (`decal_response_for`);
      overlapping DBuffer-expression decals have distinct sort orders (they do not blend);
      characters do not receive; `stat gpu` with the Decals show flag on and off priced (decal doc).

## 7. Landscape and RVT

- [ ] Layer names match target layers; base layer LB Alpha Blend; layers painted per component
      within plan (mobile 3); prime tiling scales; no visible grid from far (Ben [0L5Azq6ugyo
      00:15:20, 00:20:30]; landscape doc).
- [ ] RVT write path free of Time, Panner, camera, parallax and MPC (`rvt_write_hazard` absent);
      world-space normals; at most two distinct RVTs sampled per material; landscape sort priority
      -1; writers static; SVT rebuilt after RVT edits (PrismaticaDev; RVT doc).
- [ ] VirtualTextureUpdate near zero on a still camera; near, mid and far captures show no blur,
      banding (YCoCg if smooth gradients band) or SVT seams.

## 8. Look (captures, judged last)

- [ ] Board under the level lighting and under a neutral rig: metal to paint transitions read as two
      real materials, never chalk or plaster (Ben [VrY_SSvWdQ4 00:05:39]; Morgan slide 00:08:23).
- [ ] Wear sits on edges and exposed corners, dirt in cavities and down-facing crevices; not uniform
      noise.
- [ ] Modular pieces assembled: no visible seam or tile grid across them (world-aligned where used)
      (Ben [pXOknekvmwE 00:13:33]).
- [ ] Buffer visualizations: Specular flat 0.5 with darker crevices, Base Color free of baked light,
      Roughness tells the wear story (Ben [0L5Azq6ugyo 00:09:13]).
- [ ] Substrate view modes: Material Count 1 almost everywhere on Blendable; Classification red only
      in real blend regions.
- [ ] After usage-flag or switch changes: one mesh of each type with every affected instance, no
      gray fallback; before/after `image_diff` of each preset within the chosen threshold.
- [ ] Toon: sun sweep at three elevations, a colored point light, night; bands clean, no back-side
      glow, patterns stick to animated meshes; post-process toon keeps the unstylized image's mean
      log luminance and leaves the sky unquantized.

## Report

State what was measured, on which camera and platform, what was only looked at, and every `[verify]`
still open. If a check was skipped because Unreal could not do it headless, say so.
