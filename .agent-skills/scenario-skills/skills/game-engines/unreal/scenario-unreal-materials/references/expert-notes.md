# Expert notes: principles and judgment, by expert

Distilled from `notes/materials/` and `notes/shading/` (all notes and the four digests). Timestamps
are `[video_id hh:mm:ss]`; doc sections are named. `[added]` marks reasoning of this skill's author;
`[verify]` marks what the installed 5.8 must confirm. Credentials and URLs: `sources.md`.

## Jon Lauf and Jason Nadro (Epic: Fortnite Technical Art Director, Cosmetics; UE Rendering Architecture Lead), "Systemic Shader Reduction", Unreal Fest 2026, UE 5.8 [wobQ8ZKQpbc]

- **Shaders are a product of dimensions.** Materials (x quality levels) x vertex factory types
  (about 30) x shader types (about 155); every usage flag adds a whole row, and a flag on a parent
  adds that row to every child with a unique static permutation [00:05:32, 00:07:46]. Fortnite went
  from 1,946,344 shaders (14.34 GB on PC) to 623,160 (4.39 GB) in under six months [00:01:45,
  00:02:19].
- **Count unique static sets, not switches.** "It's more about the unique static parameter sets
  across all your material instances" [00:22:41]. Two flags x three unique MIs = six permutations;
  one more parent flag adds three, one more unique MI adds two [00:23:50, 00:24:25].
  `ue_materials.lauf_permutations` encodes this.
- **Static switch rule.** Only when the gated function contains texture samplers (low-end hardware
  has few sampler slots) or heavy math most instances skip; otherwise a plain If [00:40:24].
  UV-channel pickers are the anti-example [00:39:52].
- **If node pattern.** Parameter into A, 0.5 into B, use A > B or A < B; A == B "incurs some
  additional threshold cost", and A > B already evaluates as >= [00:40:56].
- **Enums for artist choices.** A scalar parameter bound to an enumeration shows a dropdown in the
  MI and returns the index; keep a small generic library (True/False, On/Off, UV channel, blend
  mode) [00:41:30, 00:42:02]. The talk presents it as a 5.8 feature, but the 5.7 release notes
  already list the enumeration and its MaterialEditingLibrary functions: date it 5.7 (release notes
  win).
- **Static Component Mask Parameter is obsolete:** Channel Mask Parameter for one channel, dot(RGB,
  float3 of 1s and 0s) then saturate for several [00:42:35]; it was the biggest recommendation in
  Fortnite's Experiments panel ("801, 25%") [screen 00:18:02].
- **Parents carry the fewest usage flags; instances opt in** through 5.8 Usage Flag Overrides
  [00:16:23, 00:44:18] [verify: not in the saved release notes]. Turn off Project Settings >
  Rendering > Materials "Automatically set Material usage flags in editor default": it silently
  added flags when a material was dropped on a mesh [00:31:10]. Duplicated parents inherit every
  flag they ever had [00:30:05].
- **Trim flags without regressions.** Derive each MI's flags from its referencers (Niagara System
  two levels up, Static Mesh with Nanite on, Skeletal Mesh with clothing assets), override them to
  true on the MIs (release branch), then clear the parent (main branch, QA runway); simply turning
  flags off renders shipped assets with the fallback material [00:32:46, 00:34:25, 00:37:09].
  Result: about 1,000 MI overrides, more than 200,000 permutations and 2 GB saved [00:37:41].
  `set_base_material_usage` works on MIs although the docs said materials only [00:37:09] [verify].
- **Flag price list:** default material 10 shaders, +Skeletal 20, +Niagara mesh particles 27, every
  flag 186 [00:06:28, screen 00:07:05]. Used with Static Mesh can be off in 5.8: do it for UI,
  Niagara and sprite materials; create UI materials from Content Browser > Material > UI Material
  [00:18:38, 00:19:54].
- **Curate the master from data.** Python summed true switches over every MI (cloth fuzz 27%,
  MetalLUT 17%, thin film 15%...); the new parent kept the top 10 functions and was closed to new
  ones; bespoke looks duplicate it [00:29:31].
- **5.8 engine changes that retire folklore:** shader set follows the translated graph (a zero PDO
  or a WPO switched off no longer compiles extra shaders,
  `r.Material.UseShaderCompilationParameters`) [00:13:13]; ISMs share the local vertex factory on
  GPU Scene platforms [00:12:06]; translucency compiles only the skylight variant [00:15:24]. Opt-in
  levers after measuring: `r.SkinCache.CompileShaders=2` with `r.SkinCache.Allow=1` (Fortnite's
  biggest win, 2,353 MB) and `slate.MaterialShaderMode=2` [00:11:34, 00:14:19, 00:15:57].
- **Numbers are upper bounds.** The live Total Shaders overlay and ListShaders are conservative;
  cook deduplication changes them [slide 00:18:57]. One new permutation of the weapon master is
  about 22 shaders [screen 00:17:54].
- **Judgment:** treat permutations as a content budget enforced like any other rule; "convenience
  has a compile cost" [00:43:10, slide 00:17:09].

## Oskar Swierad (Tech Art Aid; later Lead Technical Artist, Cyberpunk 2077: Phantom Liberty), "True Instruction Cost", 2021 [y0QASid1v8w]

- **The instruction count is "an approximation but often it's total nonsense"** [00:20:57]: sine and
  cosine added 2 instructions and about 40 GCN cycles; tangent added 0 and about 56 [00:19:14,
  00:21:15]. Compare materials by GPU time, never by count across math types.
- **Texture samples are the expensive operation:** the instruction is cheap, the VRAM round trip is
  "like 200 cycles" [00:32:31, 00:35:57]. Twelve samples in one material is "absolutely not" a good
  idea [00:39:02].
- **Free math:** the compiler issues the sample early and waits only where the result is used;
  independent math runs during the fetch [00:39:34, 00:46:03]. Dependent math cannot hide.
- **Coherent UVs and mips make sampling affordable:** noise-distorted UVs defeat the cache; with
  coherent UVs and mips "we pay like one tenth of the cost or even less"; never disable mips to fix
  blur [00:50:02, 00:53:23, 00:53:57].
- **Several samples of one texture are several samples.** Atlasing helps files and streaming, not
  the shader; pack grayscale maps that share UVs into channels (7/16 to 6/16 samplers on screen)
  [00:55:37, 00:56:35].
- **Custom nodes block constant folding** (31 vs 29 instructions for the same math) [00:14:34];
  benchmark only with live parameters [00:12:54]; open every material function and sum it, "cheap"
  in a name is not a measurement [00:22:31]; do not hand-reorder math, the compiler does [00:26:28].
- **Curve Atlas gradient maps** colorize packed grayscale instead of color maps, but the atlas is
  itself a sampler (6/16 back to 7/16) [00:59:27, 01:03:29].
- **Judgment:** cycles and GPU ms decide; the GCN table is 2017-era AMD, so on this Mac treat it as
  a ranking and trust measured ms [added].

## Nathaniel Morgan (Epic, Principal Technical Artist, rendering product owner), "Everything You Wanted to Know About Substrate", Unreal Fest Stockholm 2025 [SqPaL8HS_Lw]

- **One slab first:** "If you can get away with a single slab, do it" [00:25:45]; a slab replaces
  seven legacy shading models [00:16:25]; your material graph "is now your shading model"
  [00:41:17].
- **Operator costs:** Horizontal Blend evaluates one slab where Mix is exactly 0 or 1 and both in
  full elsewhere, so cost follows the non-unitary region [00:29:38] (without parameter blending, on
  Adaptive: a parameter-blended blend is one slab everywhere [00:37:35] and Blendable keeps one slab
  per pixel [00:12:51], so mask sharpness is then artistic); Vertical Coat is dearer than Horizontal
  Blend [00:30:10]; Add breaks energy conservation and is valid only when one input is purely
  emissive [00:30:18]; Select evaluates one slab (SelectValue > 0.5 ? B : A), the way to mix slabs
  with different Subsurface Profiles (dither plus TAA) [00:33:51, 00:34:25]; Coverage Weight is
  presence, not transmittance [00:32:19].
- **Parameter blending** is "one of the most impactful optimizations" [00:36:04]: near-lossless on
  Horizontal Blend, lossy on Vertical Coat (transmission, attenuation, depth replaced by a
  heuristic) [00:37:35, 00:38:08]; it propagates to every operator beneath, "this isn't something
  you retrofit" [00:38:43]; parameter-blended operators do not count toward the eight-closure limit
  [00:36:04].
- **Window > Substrate panel** lists every feature a material uses in the order it will be
  downgraded and previews the parameter-blending result: the first stop when a Substrate material
  surprises [00:12:51, 00:38:43].
- **A Vertical Coat needs a transmissive top:** MFP 0 on the top slab means the bottom is never
  evaluated [00:27:15].
- **Legacy Specular is a narrow encoding:** IOR 1 to 1.788 maps to F0 0 to 0.08; carbon fiber is
  about 0.18, gems and semiconductors also exceed 0.08, so F0 audits need class exceptions
  [00:09:30]. F90 is a hue/saturation shift relative to F0, not a grazing color; a Specular Profile
  gives an exact curve [00:18:40]. Large MFP on opaque materials gives noise [00:20:55].
- **Gray Metallic blends are a parameterization flaw** (white-edged transitions); Diffuse Albedo
  plus F0 blends continuously, and the composed path runs only in transition tiles [00:07:13,
  00:07:46].
- **Migration:** legacy materials compile onto Substrate unchanged; adding a Substrate node or
  converting is "a one-way trip for that material"; never turn Substrate off after that [00:14:46,
  00:15:19].
- **Lumen hit lighting uses the fully simplified material but still evaluates every input:**
  texture-heavy multi-slab graphs cost in ray tracing too [00:25:45].
- **Outdated in the talk:** Adaptive "intended to be the new default" [00:10:29] was reversed in 5.7
  (Blendable default); upgraded projects do not auto-enable Substrate (Substrate overview, New
  Projects).

## Ben Cloward (20+ years game tech art, ShaderFX co-creator, ex-BioWare Cg Supervisor)

### Substrate series, 2026 [P5I38f2O6W8, a94Lpu1_4dg, VrY_SSvWdQ4, sf-K257zWh8, wvzBD5u1GeE, Q3ZNWiQ4lZE, Z281PRQInRA]

- **Substrate is still PBR without the training wheels** [P5I38f2O6W8 00:02:19]; enabling it is "a
  one-way trip" [00:04:07].
- **GBuffer memory:** legacy 16 B/px (about 132 MB at 4K), Blendable a fixed 20, Adaptive up to 80
  (about 663 MB, "five times" legacy) [00:05:13, 00:05:46, 00:06:19]. Adaptive only when shipping
  high-end PC; it falls back per platform [00:06:54, 00:07:26]. (His "20%" is +25%.)
- **Legacy to Substrate math:** Diffuse Albedo = lerp(BaseColor, 0, Metallic); F0 = lerp(Specular x
  0.08, BaseColor, Metallic); leave F90 unconnected; metals black diffuse, dielectrics F0 below 0.08
  [a94Lpu1_4dg 00:03:25, 00:14:02, 00:16:16]. Do not build Fresnel yourself [00:10:04].
- **When Substrate earns its complexity:** colored dielectric F0 (only microstructures: soap, nacre,
  feathers), metal/non-metal side by side (two slabs, Horizontal Blend; gray metallic "looks like
  it's covered with plaster"), true vertical layers (clear coat over carbon weave, top slab
  roughness 0.05, MFP 10) [VrY_SSvWdQ4 00:02:58, 00:05:39, 00:09:38].
- **Glass recipe:** Translucent Colored Transmittance (Gray if untinted), Surface Translucency
  Volume, Refraction Method IOR from F0, slab Sub-Surface Type Simple Volume, Transmittance-To-MFP
  with thickness 0.02, IOR-To-F0 1.5; Pixel Normal Offset for flat planes or when screen-edge seams
  appear; a sphere is IOR's worst case; frosted needs "Substrate translucent material rough
  refraction" (0.2 misty, 1 frosty) [sf-K257zWh8 00:00:33 to 00:18:22]. In Substrate "I'm actually
  setting how far into the material light travels" [00:06:26].
- **SSS:** MFP as a scalar in cm, MFP Scale from a mask hijacking an unused channel (metallic on
  fruit) [wvzBD5u1GeE 00:05:26, 00:07:32]. **Fuzz** beats a Fresnel node (uses light direction and
  shadows): roughness 0.1 to 0.5, amount 0.3 to 0.5 [Q3ZNWiQ4lZE 00:02:51, 00:04:29]. **Second
  roughness** renders only on Adaptive, doubles specular per light, still beats a second slab
  [Z281PRQInRA 00:05:35, 00:06:39].

### Terrain Shaders, 2025 to 2026 [-UZlUUQSGgQ, gjOO5g4cgng, 0L5Azq6ugyo, ucuSaiDuqiM, 4q6EekzAUI0]

- **Budget = samples per layer x layers,** tile breakup multiplies it; pack every layer into CR (RGB
  color, A roughness) and NOH (RG normal, B AO, A height): 4 layers go from 24 samples to 8
  [-UZlUUQSGgQ 00:09:04, 00:12:36]. Local detail (roots) goes to decals: "with decals, you only pay
  ... around where the decal is placed" [00:05:55].
- **Import:** CR BC7 sRGB on, NOH BC7 sRGB off, never Normalmap ("it'll get rid of that extra data")
  [gjOO5g4cgng 00:11:02, 00:13:42]; never above 2048 in engine; find where detail lives (soil color
  LOD bias 5, normal LOD bias 2) [00:08:49, 00:12:35]. Normal Z: constant 0.5 on noisy terrain
  instead of DeriveNormalZ [00:33:21]. Bake strength and tint offline [00:22:25].
- **Structure:** a layer function per layer into Landscape Layer Blend, base LB Alpha Blend, others
  LB Height Blend; names must match the Paint tab [0L5Azq6ugyo 00:12:01, 00:15:20]. Specular 0.5 is
  right for about 90% of non-metals; use Specular only as cavity occlusion (CheapContrast 2, x 0.5)
  [00:01:19, 00:05:50]. Prime tiling scales so grids never align, in the 300s, 400s and 600s (world
  units per tile) [00:20:30, 00:21:38].
- **RVT:** the same material writes (RVT Output) and reads (RVT Sample); the write runs only when
  pages update, so the landscape material "can be significantly more complicated" [ucuSaiDuqiM
  00:27:53, 00:31:52]; size the volume to the area that matters [00:21:05]; forgetting the sample's
  Virtual Texture is the classic mistake [00:28:28].
- **Auto material:** altitude mask, terrain angle mask (center -0.32, pixel normal 0.8 to 1.0: 0
  gives "transparent" blends), HeightLerp; snow center Lerp(-1, 0.5) over altitude 1000 to 10000,
  contrast 25; maximize blend area [4q6EekzAUI0 00:17:26, 00:18:33, 00:22:39, 00:43:29].

### Materials 101 (UE4 era, principles still hold) [fePsD_8p9vM, h95X255NhOo, pXOknekvmwE]

- **PBR guardrails:** base color sRGB 20 to 240, floor about 50 when rough; no lighting in albedo;
  metals sRGB 180 or brighter ("no such thing as dark metal"); metallic binary; specular map =
  crevice x 0.5 [fePsD_8p9vM 00:05:28, 00:06:41, 00:14:25, 00:20:55, 00:22:48].
- **Compression:** decision table (color Default, normals Normalmap, masks Masks, one quality
  channel Grayscale, three or four quality channels BC7); sRGB only for color; Compress Without
  Alpha on 3-channel color; sampler type must match compression [h95X255NhOo 00:15:45, 00:09:39,
  00:04:00, 00:17:26]; alpha is the best-kept channel of a BC3 mask, so roughness goes there
  [00:08:33]; the Alpha setting keeps only the alpha channel [00:13:03].
- **World-aligned kits:** World Aligned Texture and Normal, two sets at 64 and 48 plus 3D noise
  (Fast Gradient, scale 0.01, levels 5, x4, saturate) hide modular seams [pXOknekvmwE 00:12:23,
  00:08:57]; cost is three samples per texture per set [added].

## PrismaticaDev (indie developer, UE materials educator), RVT Ultimate Starter Guide, 2025 [RLEPA16QDRw]

- RVTs "trade performance for memory" and "are not supposed to be constantly updated" [00:13:07,
  00:10:53]; any page update redraws every writer in it; footprints and trails belong in render
  targets [00:11:59].
- The write pass is an orthographic capture at time 0: Panner frozen, distance measured from the
  capture, no parallax, MPC changes do not refresh pages [00:20:14, 00:23:04, 00:25:23, 00:16:44].
  Keep such effects in the read pass or behind Runtime Virtual Texture Replace [00:44:15].
- World-space normals in the RVT (tangent to world on write, world to tangent on read) [00:31:58].
  Write order = Translucency Sort Priority: landscape -1, a default canvas plane near -1e9
  [00:51:42, 00:53:24].
- Each distinct RVT sampled adds a large fixed unpack cost: pack masks into spare channels of one
  RVT per domain; put frequently updated data in its own small RVT [01:04:29, 01:07:19, 01:00:25].
- Mesh-to-landscape blend through a World Height RVT; a VertexInterpolator on the height lookup cut
  377 to 288 instructions [00:35:24, 00:40:53] (safe only where the same pages are sampled per pixel
  elsewhere: vertex sampling gives no VT feedback, RVT doc) [added reasoning].
- Idle update cost about 0.01 ms, a writer moving across many tiles about 0.4 ms in `stat gpu`
  [00:14:31].

## Chris Pollitt (Sumo Digital, principal technical artist), Material Layering Systems, SDC23 [SAr7oPKsgLE]

- An MLS is "a shared library of tiling materials ... combined together in layer stacks using unique
  masks" [00:01:12]; it replaces ubershaders that duplicate libraries, cascade recompiles and
  "switch wall" [00:02:48, 00:03:53].
- "The cost of your stack is based partly on the attributes you're blending across it":
  attribute-specific layers (`_A`, `_N`, `_AORMN`) instead of switches [00:09:28, 00:10:35]. Two
  unique textures per asset (a normal and one RGB mask) [00:05:53].
- Value-clamped ID masks: 4 bands per channel (16 masks), up to 32; signed channel weights build
  virtual masks [00:14:54, 00:17:05]. Per-actor random wear and world-space directional blends
  (water line, top-down snow, north moss) turn one asset into 20 variants [00:18:11, 00:20:11].
- Height in the normal's blue channel as BC1 instead of BC5 at half the memory; artists could not
  tell except on mirror-flat surfaces [00:23:25]. "Even point blank ... you're probably not even
  going to see over 2K" [00:29:20]. Advises against Epic's stock layers ("too much freedom")
  [00:37:19].
- Deciding condition vs a lean master [added from the digest]: a big library with many materials
  favors an MLS; a small kit favors one lean master with few switches. In Substrate, Material Layers
  do parameter blending only (Substrate overview, Relationship to Material Layers).

## Visual Tech Art (self-described senior tech artist, unverified), Physically Based Cel Shading, 2024 [eBS3BOI5KnM]

- Toon shading is an exposure problem: quantize log2 of HDR luminance (EV) before the tonemapper, so
  "our postprocess is not changing at all the brightness of the scene" [00:18:18, 00:18:52].
- The common recipe is wrong four ways: desaturation is perceptual (use max(R,G,B)), normalization
  maps colors to a sphere (divide by max), DiffuseColor lacks metals (use BaseColor), hard
  thresholds break with light changes [00:03:17 to 00:07:16].
- Asset rules: base color saturation at most 0.5; toon default Specular 0, Roughness 1, Metallic 0
  via Custom Primitive Data [00:13:20, 00:13:53]. Scene: sun 120,000 lux, source angle 0; Lumen at
  higher quality with minimum update speed so bands do not wobble [00:08:55, 00:12:11].
- Every fake is a balanced EV offset (metal rim +2 up, -2 down; outlines clamped +1 inside, -2
  outside); shrink outline kernels with distance, none below size 2 [00:26:40, 00:34:27, 00:31:07].

## Pitchfork Academy ("Vylocity", tutorial creator; credentials unverified), Toon shading in UE 5.8 [iMJJYXHMw4o]

- The Substrate Toon BSDF is a material model, not a post process; bands react to colored and
  multiple lights, sky and Lumen [00:02:00, 00:21:47]. Ramps live in a Toon Profile asset shared by
  many materials [00:07:02].
- Values: Diffuse Indirect Scale 1, Diffuse Ramp Includes Shadow on, Specular Indirect Scale 0
  (kills a back-side glow), Shadow Extinction 10 [00:12:28, 00:13:01]; metallic at most 0.8 to 0.9,
  roughness at least 0.35 to 0.4 on metals because reflections are not banded [00:05:49, 00:06:22];
  skip AO [00:16:46].
- Pattern UVs from Coordinate Basis Triplanar Dithered in pre-skinned space (3) stick to animated
  meshes [00:27:23] [verify node name]. Anisotropy adds cost [00:29:11]. The BSDF uses Base
  Color/Metallic/Specular, not Albedo/F0 [00:03:32]. Experimental, built on Blendable (5.8 notes).

## Chris Murphy (Epic Tech Consulting), Simple Stylization Techniques, GDC 2024 [exMzwH7EJUY] and companion page

- Stylized grass inherits the landscape: landscape writes base color, specular, roughness and
  PixelNormalWS to an RVT; grass samples it with Tangent Space Normal off and shadows off [00:02:04
  to 00:04:45].
- Stepping is round(x x N) / N on the right channel (saturation of SkyAtmosphereViewLuminance keeps
  a physical horizon) [00:07:26, 00:09:07]; stepped sky needs eye adaptation off [00:09:39].
- Overlay materials redraw the whole mesh once regardless of slot count and, as Translucent Unlit,
  read scene textures [00:12:15]; Curve Atlas plus Bounding Box UVW gives live-editable gradients
  [00:15:33].
- Post-process outlines run before AA ("Scene Color After DOF") or they shimmer; IsSky removes the
  sky; World Aligned Texture in post needs the WorldNormal scene texture [00:22:31, 00:23:06,
  00:24:16].

## Epic documentation (UE 5.8 pages saved in `sources/docs/`)

- **Substrate overview:** Blendable fixed memory and parity, Adaptive full features, SM6 only, +15%
  cook, forces DBuffer; parameter blending on the rightmost operator only (4 slabs 108 to 28 B/px);
  Blendable keeps one feature per pixel (Fuzz, then SSS, then Haziness); MFP equal to slab thickness
  passes 36%; conversion permanent; Convert To Decal needs Translucent Gray/Colored Transmittance or
  AlphaComposite.
- **Material updates 5.6 to 5.8:** 1 or 2 slabs for real-time; "If you set your project to
  Blendable, that becomes the ceiling"; HSPR tag (an editable switch is a permutation risk); Total
  Shaders overlay, ListShaders, GetExpressions, GetMaterialUsedTextures; MPC overrides (5.7);
  experimental Temporal Responsiveness node for scrolling text under TSR:
  `r.Velocity.TemporalResponsiveness.Supported=1`, masked, a small WPO on Nanite meshes,
  `r.TSR.Visualize 3` (5.7). Enum-bound scalars come from the 5.7 release notes, not this article.
- **Instances, MPC, layers:** a material compiles per combination of static parameters used; MIC for
  static, MID only for runtime; MPCs carry world-wide values (wind, wetness, snow, time of day) more
  cheaply than many instance parameters; at most 2 per material (one game-wide, one per level);
  growing an MPC recompiles every user, so reserve parameters early.
- **Landscape materials:** layers act as static permutations per component; a layer name with no
  target weighs 0 forever; all-height blends make black spots; keep Opaque with Opacity Mask for
  holes; ES3.1 has 16 samplers.
- **RVT:** static writers; collision off on write-only writers; Num LODs 0 on the landscape; no
  virtual textures inside writer materials; a stale SVT is silently disabled;
  `r.VT.MaxUploadsPerFrame` 8 in game.
- **Textures:** BC7 for unrelated channels (BC7 RGB 2x BC1, RGBA = BC3 bytes); BC6H 8x smaller than
  RGBA16F; RDO is disk not memory; Final encode to judge; NPOT does not stream; final LOD bias =
  texture + group, clamped by the group; Normalize after making Mips keeps distant normals,
  Composite Texture moves lost normal variance into roughness; the Platforms panel and cooked
  `listtextures` are the ground truth, and an overflowing pool is fixed on the top users, not by
  raising `r.Streaming.PoolSize`.
- **PBR, blend modes, decals:** "Resist! All materials have specular"; metallic binary; painted
  metal is paint on metal; cavity map: Specular = Cavity x 0.5; decal receivers only for channels in
  use (each adds material code); overlapping DBuffer-expression decals do not blend, one wins by
  sort; Modulate decals become Translucent with DBuffer; mesh decals cost about 30% more per frame
  in the path tracer (The Origin sample).

## Where they disagree, and what decides

| Topic                            | Positions                                                                                          | Deciding condition                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Instruction count as a criterion | Swierad: meaningless across math types. Lauf: "high instruction count" justifies a switch          | Coarse filter within similar ALU only; ms on a fixed camera decides                                                                 |
| Static switch vs If              | Lauf: switch only for textures or heavy math; Swierad explains why (If computes both sides)        | What the branch gates                                                                                                               |
| Grow the master or duplicate     | Fortnite: curated top-10 parent, duplicates for bespoke; Sumo: MLS                                 | Reuse count; library size                                                                                                           |
| Usage flags on parent or MI      | pre-5.8 parent; Lauf: MIs from day one                                                             | Mixed mesh types or many MIs: MIs                                                                                                   |
| Packed normal + height           | Ben: BC7 NOH; Sumo: BC1 when noisy and rough                                                       | Mirror-flat surfaces (glass, polished panels) keep BC5 normals                                                                      |
| Adaptive default                 | Morgan (pre-5.7): Adaptive for SM6; 5.7 shipped Blendable                                          | 5.8: Blendable unless high-end PC or stills need Adaptive features; Blendable caps every platform, Adaptive falls back per platform |
| Mask sharpness as a cost lever   | Morgan: Horizontal Blend cost follows the non-unitary region; parameter blending makes it one slab | Lever only without parameter blending, on Adaptive; artistic otherwise                                                              |
| Toon technique                   | VTA: global EV post process; Pitchfork: per-material Toon BSDF                                     | Whole-world look and outlines: post; per-asset banding under colored lights: Toon BSDF (experimental)                               |
| Specular on toon assets          | VTA: 0 (camera highlights break bands); Pitchfork: 0.5                                             | Post-process toon: 0; Toon BSDF: 0.5 with the Specular Ramp                                                                         |
| One RVT or several               | PrismaticaDev: pack per domain; separate small RVT for frequently updated data                     | Update frequency vs fixed sampling cost                                                                                             |
| Vertex-stage RVT sampling        | PrismaticaDev: interpolate the height lookup; RVT doc: "extreme caution"                           | Only where the same pages are sampled per pixel anyway [added]                                                                      |
