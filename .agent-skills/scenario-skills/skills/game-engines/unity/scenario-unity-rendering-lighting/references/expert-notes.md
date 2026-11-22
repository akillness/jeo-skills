# Expert notes: principles and judgment, by expert

Each line is attributed with its source id and timestamp (videos) or section (docs); full references
in `sources.md`. [added] marks this skill's own additions, [observed] facts measured on this Mac in
Unity 6000.3.21f1 on 2026-09-24 (`tests/code/unity-rendering-lighting/`, results in
`archive/tests/unity-rendering-lighting/live_results.jsonl`). Where experts disagree, the deciding
condition is given.

## Pierre Yves Donzallaz (Unity senior lighting artist; Crysis, Ryse, GTA V, RDR2). PYD = yqCHiZrgKzs (HDRP, 2020); PYD22 = DlxuvvYZO4Q (HDRP Sponza, 2022)

- **Exposure is the foundation.** Wrong exposure forces nonsense intensities; natural and artificial
  light never balance (PYD [00:20:21], [00:28:42]). "If you want to light your Scene in a physically
  correct way, it is crucial that you use the right exposure." URP 6.3 translation: exposure is
  Fixed only (Color Adjustments Post Exposure, rps); choose it once per zone and never use it to
  rescue a light [added].
- **EV anchors** (EV100): sunny 14, overcast 10, sunset 8, very bright interior 6, night street 2,
  very dark interior 1, moonlit -1 (PYD [00:17:37] to [00:19:48]); PYD22 slide: moonless -2, moonlit
  1, interior 4, low sun 8, cloudy 11, sunlit 14 (frame 00:03:59). Sun about 100,000 lux at about
  5500 K; moon 0.5 lux at 4100 K; street lamp 2500 lm; headlight 2000 lm at 7000 K (PYD [00:34:51]
  to [00:36:57]). Fixed exposure default 0 is night and whites out daylight (use about 13.5,
  [00:21:56]).
- **Auto exposure limits come from fixed-exposure tests** of the brightest and darkest areas (13 and
  6 EV in Sponza), then Automatic clamped to them (PYD22 [00:12:22] to [00:12:55]). URP has no auto
  exposure in 6.3: the URP equivalent is one Post Exposure per zone in local Volumes (PYD
  [00:21:25]: "Override Exposure in a volume per time of day or per zone").
- **Neutral inputs stay neutral:** shadows black for opaque casters, fog white, bloom tint white;
  color comes from lights and sky (PYD [00:39:38], [00:51:58], [01:03:39]).
- **Tonemapper:** ACES by default, Neutral for asset review because ACES adds contrast and
  desaturation (PYD [01:00:59], [01:01:29]). No tonemapping: clamped highlights, "terrible".
- **Volumes:** explicit priorities (two globals on the same parameter: last active wins,
  unpredictable, [00:15:33]); camera-specific effects (DoF, exposure, heavy fog) in a local volume
  on the camera ([00:16:03]).
- **Shadows:** shadow fade distance is the main shadow optimization; "very common for current-gen
  games to have a shadow distance under 30 meters" for local lights (2020, [00:43:15]); sun 200 m
  over a large plaza ([00:41:43]). Filtering quality over raw resolution ([00:40:09]). Slope-scale
  depth bias over normal bias in HDRP ([00:42:43]). Light leaks after a local light's shadow fades
  are a light-layer problem ([00:58:48]); URP 6.3: Rendering Layers on lights (EBL).
- **Reflection probes beat SSR;** a box probe around an enclosed area both captures it and shields
  it from the sky reflection ([00:46:37], [00:50:18]). PYD22: 13 probes for the Sponza atrium,
  surfaces under the same light share a probe, a probe restricted to the dark zone so it does not
  capture sun, box 4 x 4 x 25 m, blend 0.25 m ([00:09:07] to [00:10:14], frame 00:10:09).
- **The sky probe is the enemy of interiors:** without GI it tints interiors diffusely and
  specularly; weak artificial lights and blue-green materials are the sky leaking; dimming it with
  the Indirect Lighting Controller is "not the proper way" (PYD22 [00:03:22], [00:05:58],
  [00:08:17]). Mirror override (smoothness 1, black albedo) as a specular audit ([00:08:17]).
  [observed] Before a local reflection probe, the wooden table (smoothness 0.3) read gray-blue in
  the interior test (Table_Top blue minus red -0.07); after one box probe it read as wood (-0.39);
  the chrome ball went from +0.05 to -0.25 in one run (Editor captures of metals are unreliable, see
  the observations below).
- **Bake settings he used** (PYD22 frame 00:03:43): direct 8 to 16, indirect and environment 128 to
  256, 4 bounces, 25 texels per unit (4 cm), padding 2, max 2048, directional, Normal Quality
  compression; bake 31 s lightmaps vs 8 s probe volumes vs 3 s legacy probes (frame 00:19:51).
- **Verdict:** lightmaps remain the cheapest on mobile; probe volumes "more interpolated" but
  scalable; mix techniques (PYD22 [00:20:08], [00:28:57]).

## Ciro Continisio (Unity EMEA lead evangelist). CC = hMnetI4-dNY (URP + GPU lightmapper, 2020)

- **Look through the player's eyes**, from the gameplay camera with textures on; artists chase acne
  nobody sees ([00:11:23], [00:58:39]).
- **Settings split by cost:** lightmap size, compression, directional mode change runtime memory
  (directional doubles the lightmap count) and must be agreed early per device with a technical
  owner; samples, bounces and filters change only bake time: "whether that's a nice bake or a bad
  bake the pictures are the same, the game doesn't care" ([00:35:51] to [00:36:56]). Iterate low,
  bake final rarely (for example nightly, [00:37:30]).
- **Shadow distance to what the view shows:** poles 10 m apart, 40 m leaves the last ones
  unshadowed, 600 m blurs everything, about 70 chosen ([00:07:28], [00:08:03]). With Subtractive,
  drop it very low so the whole map serves the few dynamic casters ([00:41:17]).
- **Texel economy:** Scale In Lightmap 0.2 for background, 1 for the play area ([00:17:30]); plants
  and small rocks Contribute GI but Receive GI from probes ([00:48:30]).
- **Filtering stays inside UV charts;** hand-authored lightmap UVs decide where blur may cross;
  A-Trous is edge-aware and stops bleed from texels under intersecting geometry that Gaussian
  spreads ([00:24:22] to [00:28:17]). Deciding condition vs Brackeys ("Gaussian in 90% of cases",
  VnG2gOKV9dw [00:13:31]): intersecting environment props favor A-Trous.
- **Fake thin emissives** with baked area lights just in front of them ([00:15:16]).
- **Probes where characters go** and where light changes; none in unreachable spots ([00:46:20] to
  [00:47:26]). Reflection probes by interest zone: exterior box plus interior box at Importance 2
  ([00:54:35]).
- **Wrong normals spill light** from nowhere: check normals before settings ([00:58:05]).

## Unity lighting team, Unite 2024 (Chapelain, Grange, Llewelyn). APV24 = IpVuIZYFRg4 (Unity 6 Preview, URP demos)

- APV is "now the preferred choice for most projects" ([00:05:12]); Light Probe Groups survive for
  wearables and legacy hardware without compute ([00:08:31]). Deciding condition: compute support
  and texture-sampling budget.
- **Density is a budget you direct:** full 1 m range in interiors, a coarser override on open
  exteriors, background capped at 27 m; volumes merge, "create as many volumes as you want"
  ([00:11:54] to [00:14:25]). Defaults read on screen: min 1 m, max 81 m, Validity Threshold 0.75,
  Virtual Offset on, Dilation off (frame 00:11:01).
- **Leak ladder in their order:** Debug Probe Sampling (8 probes and weights per pixel), light
  Normal/View Bias (about 0.1 and 0.175), Interior/Exterior Rendering Layer masks and rebake (probes
  take the layer their rays hit most), Leak Reduction Mode Quality (up to 3 samples, never an
  invalid probe) on console and desktop, Performance acceptable on mobile after a look ([00:18:13]
  to [00:23:13]). Rendering Layers beat biases for clean interior/exterior splits because they
  change which probes are allowed.
- **Leak Reduction per platform:** Quality samples up to 3 times and never uses an invalid probe, "a
  slight performance overhead especially on low-end mobile"; Performance samples once and was "still
  usable" in the tent after a look ([00:22:36], [00:23:13]). In URP set it per tier in the tier's
  asset volume profile (ProbeVolumesOptions), Performance on phones, Quality on PC [added: the
  mechanism, tested in test 13].
- **Rendering Layer masks need Use Rendering Layers** on the URP asset (6.3 Manual, APV light leaks
  step 3); up to 4 masks; objects whose layers match no mask sample every valid probe; the demo
  assigned Interior and Exterior with a small editor script ([00:19:51], [00:20:58]).
- **SSAO and APV density substitute for each other:** SSAO restores the contact occlusion 1 m probes
  miss; without SSAO add one subdivision level in key areas (1 m to 0.3 m, 9 MB per scenario)
  ([00:25:24], frame 00:23:44).
- **Cost measured:** PS4 1080p lightmaps 0.203 ms, APV Performance 0.666 ms, Quality 0.830 ms,
  scenario blending 0.176 ms; memory Oasis APV 14.5 MB (9.5 MB positions once + 5 MB per scenario)
  vs 42.7 MB lightmaps (frames 00:07:47, 00:23:43). Deciding condition lightmaps vs APV: per-pixel
  GPU budget (lightmaps cheaper), memory and disk (APV smaller), UV authoring and iteration (APV),
  contact shadows (lightmaps; or SSAO / one more APV subdivision, [00:25:24]).
- **Sky occlusion vs lighting scenarios:** sky occlusion is one cheap bake that animates only
  skylight (a realtime sun loses its bounce); scenarios store full indirect incl. local lights;
  place one at every color or intensity change, closer where change is fast, about 8 for afternoon
  to midnight ([00:31:00] to [00:37:44]). Blend by real direct intensity, not by time (50 lux
  mid-way is about 75% blend, [00:44:57]). Compress intensities with one project-wide factor if auto
  exposure must travel the range (all lights / 30, [00:48:47]); "Using non-physically based values
  is also valid, as long as you know what you're doing" ([00:51:33]).

## Unity graphics product team, Unite 2025. U25 = K3-wPnhmDi4 (Unity 6.3 LTS)

- Renderer choice: Forward for budget mobile and most XR; Forward+ or Deferred+ for many realtime
  lights; HDRP for PC/console with ready-made advanced lighting ([00:19:48]). URP Deferred on iPhone
  14 Pro used 60% less bandwidth than Built-in deferred (memoryless G-buffers, [00:29:22]): Deferred
  on tilers is a device-and-API question, not a blanket no.
- **Render Graph Viewer is the bandwidth audit:** blue line = merged native pass; Depth Texture
  inserts a copy and a final blit unless copied After Transparents; DoF makes depth non-memoryless
  ([00:30:26] to [00:34:40]). Depth prepass on PC and console, not on mobile ([00:36:45]).
- **Lighting basics first:** the sky feeds the ambient probe; in URP "you need to bake the ambient
  probe to make it change" ([00:43:52]); dynamic objects stay sky-tinted indoors until probes exist
  ([00:45:56]); small lightmap receivers make bakes take hours ([00:44:53]); Light Probe Groups
  break on large multi-part objects ([00:49:01]); "in any probe system in the world, there are light
  leaks" ([00:50:36]).
- "Be careful sometimes with ACES tone mapper because it can darken the scene quite a bit"
  ([00:54:50]).
- **Heat is the phone limit:** a phone runs at about 5 W with no active cooling and memory bandwidth
  is the main power consumer, so keep passes on tile ([00:26:45] to [00:28:20]). Verdicts on phones
  come from a thermal soak on the device, not the Editor [added: procedure owned by
  scenario-unity-mobile].
- **PSO hitches:** trace graphics states with GraphicsStateCollection in a development build, save
  them, then warm up progressively (the demo warmed 3 PSOs per step behind a progress bar); one
  collection per graphics API and platform; 6.1 extends warm-up to older APIs, 6.4 adds WebGPU
  ([00:17:11] to [00:19:48]). Shader Build Settings per build profile turn chosen keywords into
  dynamic branches for fast builds and keep multi_compile for old mobile GPUs ([00:15:36] to
  [00:16:37]).
- **GPU Resident Drawer** moves CPU-bound frames to the GPU (LEGO benchmark); Renderer Shader User
  Value keeps per-object variation in one SRP batch (4 draws vs 241) ([00:21:55] to [00:26:14]).
  [observed] Switching the interior grade from Neutral to ACES (plus contrast 14, saturation 18)
  moved the wall gray card from -0.58 to -2.0 EV; re-solving the zone exposure brought it back.

## Kyle Banks (solo developer, Farewell North). KB = 1agSNKuAfTM (URP, Unity 6.0)

- **Emotion first**, then the sun placed for it (diagonal through the key opening) ([00:03:25] to
  [00:03:55]).
- **Expect gray after baking;** fix it with ACES, contrast, saturation and Shadows Midtones
  Highlights ("my three go-tos"), each pushed too far then dialed back ([00:04:58], [00:12:36] to
  [00:14:08]).
- Interior bake: lower skybox intensity, boost albedo/indirect ([00:04:26]). Shadow strength about
  0.9 for readability (contested: PYD keeps opaque shadows black; deciding condition: weak GI and
  wide display variance vs solid GI; fix GI and exposure first).
- Bloom: intentional blowout is a style choice; too much bloom is the classic beginner mistake; then
  cut cost with Downscale Half and Max Iterations about 5 ([00:14:39], [00:15:10]). Film grain
  subtle, as anti-banding for streamed footage, behind a setting ([00:15:42]).
- Every expensive effect gets a quality ladder and a cheap fallback (volumetrics half to one-eighth
  resolution, light cards when off, [00:08:39] to [00:10:14]). A mirror reflects the skybox until a
  probe is baked in front of it ([00:17:21]).
- **Three AO layers stack:** material occlusion maps (crevices), baked AO, SSAO as a renderer
  feature for contacts; SSAO is "really easy to go too far" ([00:02:31], [00:05:32]).
- **The stylized recipe (Control-inspired nautical scene):** shape, light, contrast and color before
  textures; one palette texture for the whole world, each object UV-unwrapped into palette cells (no
  per-object textures, no careful packing); multiplied by a global world-space triplanar noise, plus
  the same detail texture tiled everywhere and a planar-mapped normal for grit; every object on the
  same shader, "drawn in a single batch", 7 texture samples across 3 textures, light enough for
  Switch; volumetrics from SDF approximations of light shapes (cheaper than shadow-map marching for
  many lights, no shadows); light cards on the main spot (two cones with scrolling noise); built-in
  fog in light blue for a cold mood ([00:21:32] to [00:24:10]). Agent translation [added]: the
  palette and triplanar world shader are a scenario-unity-shaders deliverable (hand-written HLSL or
  a duplicated Shader Graph template); this skill checks the result with the audit facts
  `opaque_shaders` and `style.many_shaders`, and lights it like any other scene (exposure, cards,
  bake).

## Ryan Keeble (technical artist, Mighty Games). RK = bl0vKZkzNOs (URP on Quest 2, 2021)

- Each extra full-screen pass costs 1 to 2 ms on a Quest 2-class tiler; a trivial saturation feature
  cost 2 ms plus a forced final blit ([00:14:30] to [00:16:07]). Bloom must be designed in from the
  start ([00:48:09]). Absolute timings came from a capture tool (18.5 ms at 72 fps): use them
  relatively [added].
- Bloom must be designed in from the start: it wants 64-bit buffers the Quest hardware is not
  optimized for ([00:48:09]). 6.3 adds Kawase and Dual bloom filters (deltas section 5): on a phone
  tier they are the lever to try next to Downscale and Max Iterations; their cost was not measured
  here (no device) [added].
- HDR emissive edges alias under MSAA; FXAA restricted to HDR pixels via the bloom prefilter mask
  ([00:28:42] to [00:44:03]). Per-object LUT grading in environment shaders spares characters and UI
  ([00:22:55]). His Execute-based custom renderer is obsolete in 6.3 (Render Graph only); Render
  Graph now automates merging and load/store choices.

## URP settings tour (Unity official, Nik Lever e-book companion). URPS = HCXCmHgV7Sk (6.0)

- "Invariably this is because the URP asset displayed in the inspector window is not the one being
  used to render the game view" ([00:03:14]): the Quality level's asset wins; None falls back to the
  Graphics default.
- Pole test: Max Distance 16 too short, 50 adequate, 60 crisp, 400 blurry (1 cascade) ([00:14:59]);
  "Aim for the minimum distance that gives acceptable shadows"; "Always choose the last cascade to
  be at most the distance of the last shadow caster" ([00:16:38]). Cascades: 1 for small scenes, 2
  to 3 for large distances.
- Post-processing disabled on the renderer also removes tonemapping: blown-out HDR ([00:30:41]).
  Unity 6 volume stack: Graphics default profile, URP asset profile, scene volumes ([00:30:06]). GRD
  warns that static batching should be off (frame 00:10:47).
- Shaders: Lit (PBR, balanced default), Simple Lit (Blinn-Phong, non-physical: mobile, VR,
  stylized), Unlit, Complex Lit (Lit plus Clear Coat) ([00:18:53] to [00:21:42]).

## Brackeys (BP = 9tjYz6Ab0oc, BL = VnG2gOKV9dw), Sasquatch B Studios (SBS = xxM6AUHqTMA), Fist Full of Shrimp (FFS = zdHu69-_jrY)

- A single Color Lookup LUT can replace the whole color section: grade a screenshot, apply the same
  edits to a neutral LUT strip, assign it (BP [00:08:22]); the LUT must match the tiers' one Grading
  Mode and LUT size (a generated LUT by code is the agent's substitute [added, not run]). Camera
  Dithering hides banding in dark gradients (BP [00:11:46]).
- "You should always use some kind of tonemapper when you have HDR enabled" (BP [00:04:00]); ACES
  plus a little Post Exposure for a bright look ([00:04:52]); Lift Gamma Gain grades more naturally
  than SMH ([00:07:47]); the camera's Post Processing checkbox is required ([00:02:13]).
- Bleeding: padding first, then texels; compression can band; Stitch Seams on complex objects (BL
  [00:09:26] to [00:11:24]). Samples and bounces cost bake time only (BL [00:12:06]). His Built-in,
  Enlighten and Auto Generate workflow is outdated.
- Under LDR grading a LUT is applied after tonemapping (SBS frame 00:03:31); Bloom High Quality
  Filtering off for performance ([00:02:24]); DoF does nothing for 2D sprites ([00:06:10]).
- Two Sided shadow casting fixes thin-mesh shadows at a cost; bias too high detaches shadows, zero
  brings acne (FFS [00:02:10], [00:07:36]). FFS's "more cascades give a smoother fade" is wrong:
  cascades distribute texels; the fade is Last Border (6.3 Manual).

## Unity documentation (6.3 Manual, URP Unity 6 e-book by Nik Lever, HDRP 2022 e-book, 2026 strategy)

- **Strategy (rps):** URP for anything new; HDRP in maintenance ("no new features are planned"), PC
  and console only (no mobile, web, Switch 1); Built-in deprecated in 6.5. URP 6.3 cannot: auto
  exposure, physical light units, SSR, SSGI, contact shadows, volumetric fog, IES, realtime area
  lights, transparent shadow casting (alpha clip only), shadows from additional directional lights.
  Brief a URP scene around these limits.
- **Shadows (ASSET, EBL):** Max Distance before resolution (40 m to 10 m let 1024 beat 2048); atlas
  spot 1, point 6 maps, up to 16, tiling 1 / 2x2 / 4x4; overflow shrinks every map and logs a
  warning; soft shadows Low 4 PCF taps (mobile), Medium 5x5 tent (desktop default), High 7x7; soft
  shadows high impact on tile-based mobile and untethered XR; Conservative Enclosing Sphere on for
  new projects.
- **Traps (ASSET):** Depth Priming makes custom opaque shaders invisible without DepthOnly and
  DepthNormals passes; unsupported with Deferred, MSAA, or TBDR mobile at runtime; Auto unsupported
  on Android, iOS, Apple TV. MSAA silently off with Opaque Texture on devices without
  StoreAndResolve. Store Actions = Store significantly increases bandwidth on tilers. Depth Texture
  After Transparents saves a store and reload on mobile. TAA and STP cannot run with MSAA, camera
  stacking or dynamic resolution; STP forces TAA, stays on at Render Scale 1.0, needs compute, never
  GLES. Forward+ ignores Per Object Limit and forces per-pixel lights.
- **Baking (TRB):** most defects trace to geometry and UVs (one-sided walls, intersecting props,
  overlapping UVs); denoisers need about 256 samples; fireflies 4K+ indirect; lightmaps are
  mipmapped (spacing that holds up close can leak far away); per-texture overrides on lightmaps are
  wiped by every rebake; Shadowmask stores 4 lights per texel; double-sided GI only on thin meshes;
  APV leak order: wall thickness, APV Options biases, Rendering Layer masks (max 4), smaller
  dilation and virtual offset, Probe Adjustment Volume (solves most, not all).
- **Stylized and low end (EBL):** Lit is PBR and best avoided on low-end mobile; Simple Lit is
  non-PBR Blinn-Phong suited to stylized low end; Baked Lit for static objects that never need
  realtime light. With soft shadows, above 1024 the stylized haunted room's shadows looked "too
  crisp". Mixed modes: Subtractive bakes the Mixed directional light's direct light into static
  geometry ("most suitable option for low-end hardware", static cannot shadow dynamic except through
  probes, tune Realtime Shadow Color); Baked Indirect "expensive, not ideal for mobile"; Shadowmask
  highest fidelity, most memory, mid to high end. GRD example: 3569 to 506 batches.
- **Shadowmask channels (TRB):** shadowmask textures share the lightmap layout and hold up to 4
  lights per texel (RGBA); where more than 4 Mixed lights overlap the extras become fully baked and
  stay so on rebake; check with the Light Overlap draw mode.
- **Grading (ASSET, SBS):** HDR grading works before tonemapping, LDR after with limited range;
  under LDR a LUT applies after tonemapping (SBS frame 00:03:31); LUT sizes cannot be mixed, decide
  before grading. So every tier grades in one mode.
- **Distance Shadowmask on Forward+ (rps vs observed):** the 6.3 feature table lists URP Distance
  Shadowmask as "Forward rendering path only"; the same table lists MSAA the same way although the
  rendering path comparison gives Forward+ MSAA. Measured on 6000.3.21f1 (test 11): Distance
  Shadowmask renders identically on Forward+ and Forward. Deciding condition: trust the P13
  measurement on the installed version; re-run it on Deferred or Deferred+ tiers (the Manual says to
  avoid Shadowmask with Deferred).
- **Ambient (EBL):** Unity 6 removed the SkyManager auto-bake: after a Skybox change, Generate
  Lighting; only Color and Gradient ambient update at runtime; APV sky occlusion needs the GPU
  lightmapper and Color/Gradient ambient.
- **Reflection (rps, EBL):** URP blends sky + 1 local probe (or 2 probes without sky), box
  projection yes, no per-probe resolution; one probe per lighting zone, box projection indoors.
- **Volumes (EBR, HDRP e-book):** Global 0, locals 1+; many volumes cost CPU; profile edits in Play
  mode persist on the asset; `SubmitRenderRequest` into a RenderTexture is the documented offscreen
  capture (the agent's eyes).

## This skill's observations [observed, 2026-09-24, Unity 6000.3.21f1, URP 17.3, Apple M5 Max, Metal]

- URP sun intensity 2 (what the unaided baseline picks) at Post Exposure 0: a sun-facing 18% gray
  card read +1.03 EV with no tonemapper (v0.2; sky ambient included, so sun 1 reads about 0 EV); the
  solved 0.98 read +0.16 EV under Neutral. v0.1 recorded +0.88 EV (and +0.19 EV at sun 1) believing
  there was no tonemapper, but the template's shared asset profile was applying Neutral (see the
  v0.2 observation below).
- `GameObject.CreatePrimitive(Plane)` and `(Quad)` have no uv2 (lightmap UVs); Cube, Sphere,
  Capsule, Cylinder do.
- Many URP asset fields have no public setter in C# (soft shadows, additional-light shadows, light
  probe system, mixed lighting, rendering layers, SH bands): edit them through SerializedObject; a
  fresh-process readback confirmed 58 fields.
- `GetComponent<T>() ?? AddComponent<T>()` fails in the Editor for a missing native component (fake
  null, MissingComponentException): use `== null`.
- `LightingSettings.autoGenerate` is obsolete (CS0618) in 6.3; `LightmapsMode.ToString()` prints
  "Single, Dual" for Directional (obsolete aliases).
- Bakes on the GPU lightmapper, headless: outdoor APV 28.5 s cold and 8.7 s warm, 14.3 MB of
  baking-set files (7.3 MB without the debug support data); interior lightmaps 6 to 15 s (GPU shared
  with other editors), one 512 x 512 BC6H set (color + directional) 0.67 MB GPU, plus 5.1 MB APV for
  dynamic objects; in Shadowmask mode a 512 x 512 shadowmask added 0.67 MB.
- The URP template's Mobile asset ships shadow bias depth 1 / normal 1. With 1024 px over 30 m and
  hard shadows, the realtime sun leaked through the wall-ceiling joint of the 0.3 m-walled room (a
  sawtooth line: 1,811 new near-white pixels vs PC); bias 0.1 / 0.5 left 25; a Shadowmask bake with
  the Mobile quality level on Shadowmask mode (static shadows baked, realtime map for dynamic
  casters) left 2 and smoothed the stair-stepped sun patch. Matches FFS [00:07:36] (bias too high =
  leaks) and CC's advice to bake what does not move.
- Depth Priming Forced with MSAA off made a forward-only custom shader invisible (the sphere showed
  the ground behind it); the same shader with DepthOnly and DepthNormals passes rendered; with MSAA
  4x the forward-only sphere rendered again, because priming is not supported with MSAA. The trap
  therefore appears the day a tier moves from MSAA to TAA or STP.
- Editor batch captures rendered baked reflection probes black on metals on the Forward path (Mobile
  tier) every time, and on Forward+ in one of three runs, through both `SubmitRenderRequest` and
  `Camera.Render`, while `GetClosestReflectionProbes` returned the right probe and the mid-rough
  table did take the probe; 3 and 10 extra warm-up frames did not change it. macOS players on both
  paths (`_CLUSTER_LIGHT_LOOP` on and off) rendered the reflection correctly. Verify metal
  reflections in a player.
- A macOS player contains only the quality levels enabled for Standalone (`QualitySettings.names` =
  PC): a Mobile level cannot be selected there; switch the renderer of an included level to test a
  path.
- Under ACES + grade, the wall card moved 2.62 EV for a 1.49 EV Post Exposure change (slope 1.76):
  solve exposure iteratively (secant), not in one step.
- `ShaderUtil.GetShaderData` reads pass LightMode tags without a graphics device; `Shader.passCount`
  / `FindPassTagValue` missed URP Lit's DepthOnly and DepthNormals in a `-nographics` editor.
- Unity 6 gives a new, never-baked scene a default Lighting Data Asset: "no LDA" does not mean "not
  baked"; a bake writes a scene-owned LDA under `Assets/`.
- Once, a batch editor hung 9 minutes in shutdown after printing its `AGENT_RESULT` (ILPP
  unloading); the envelope was complete; the process was stopped by its PID.
- (v0.2) Distance Shadowmask on Forward+: with Max Distance 20 m, a static caster 11 m away and one
  45 m away, the far shadow was present only with a shadowmask bake (1.89 stops vs 0.04 under Baked
  Indirect); rotating the sun 180 degrees without a rebake moved the near shadow (0.10 stop left)
  and kept the far one (1.89) on Forward+ and Forward alike; under Shadowmask mode both stayed.
  Keywords: SHADOWS_SHADOWMASK on for both modes, LIGHTMAP_SHADOW_MIXING only for Shadowmask.
- (v0.2) GPU Resident Drawer on 900 cubes sharing one mesh (3 materials), Editor Play mode: draw
  calls and batches 2,455 to 38, SetPass 37 to 27, main thread 3.4 to 1.2 ms (a second run: 2,439 to
  22, 1.9 to 0.6 ms); the template ships BRG Variants KeepIfEntitiesGraphics and static batching on,
  which the report flags.
- (v0.2) Render Graph native passes on the Mobile tier (Metal): depth off 6, depth copy After
  Opaques 8 (opaque and skybox split from transparents), After Transparents 7 (merged again), Opaque
  Texture on 7 (split, plus Copy Color).
- (v0.2) The URP template's PC and Mobile assets share `SampleSceneProfile.asset` as their volume
  profile (Neutral tonemapping, bloom with HQ filtering, vignette). Giving each tier its own profile
  removed that tonemapper from scenes without their own grade: the outdoor "agent defaults" stage
  card moved from +0.88 EV (v0.1, under that Neutral tonemapper) to +1.03 EV (v0.2, no tonemapper;
  sun 2.0, so sun 1 reads about 0 EV in linear). Decide which profile owns the tonemapper.
- (v0.2) `APVLeakReductionMode.ValidityBased` is an [Obsolete] alias of Performance and
  `Enum.ToString()` prints it: read enum names skipping obsolete aliases.
- (v0.2) Keyword spaces: URP Lit and Simple Lit declare LIGHTMAP_ON, SHADOWS_SHADOWMASK,
  LIGHTMAP_SHADOW_MIXING, PROBE_VOLUMES_L1/L2; URP Unlit declares SHADOWS_SHADOWMASK only; a
  hand-written forward-only shader declares none.
- (v0.2) Subtractive on the interior: sun leak 0 px on Mobile, lightmap set 0.67 MB (no shadowmask
  texture) vs 1.33 MB in Shadowmask; APV Rendering Layer masks added 0.31 MB to the APV data (5.09
  to 5.40 MB) and changed nothing visible in a room without a leak.
- (v0.2) PSO: a macOS development player traced 14 variants and 14 graphics states over 120 frames
  of the outdoor scene (Metal) and warmed all of them in 5 frames at 3 per frame (17 ms).
