# Expert notes: real-time VFX in Unity (principles and judgment by source)

Citations: video id plus `[hh:mm:ss]`; `[frame hh:mm:ss]` = value read on screen in the contact
sheets; docs as (page, heading); Fred Moreau's thread as "Post N". Items marked [added] are this
skill's own inference or observation, not a source claim. "Observed" = measured on this Mac on
2026-09-24 through `tests/code/unity-vfx/` (numbers in `references/procedures.md`). Source list with
credentials: `references/sources.md`.

## Jason Keyser, ex-Riot VFX artist, founder of VFX Apprentice (`BOE8osaPzOY`, 2018, engine agnostic)

- **A VFX artist is a game developer first**: AAA-looking effects in a game that is not clear is
  failure [00:00:00]. The review question is always "can the player tell what is happening, where
  the danger is, and whether it is still active" [00:01:39], [00:11:55], [00:15:34].
- **Three effect pillars per game**, never "stylized" or "realistic" alone: Ori (ambient life,
  ethereal, mysterious magic), Overwatch (punchy, personality in shapes, competitive integrity: in
  and out fast) [00:04:55] to [00:07:08].
- **Primary shape carries gameplay, secondary shapes add flavor and never override it** [00:09:11].
  **The visual boundary equals the damage boundary**: Teemo's mushroom keeps a clear edge; Sona's
  ultimate tapered visually while the hitbox was a rectangle [00:10:17] to [00:11:55]. Observed: the
  kit's explosion is authored at 1 m and scaled to the gameplay radius; `VfxBudget.VisualRadius`
  measured the primary layer at 0.96 x the 1.5 m damage radius.
- **Brightness and impact are a budget spent by gameplay importance**: idle subtle, basic attacks
  subdued, then defensive, damaging, game changers (they "need their space to breathe"), ultimates
  in and out fast [00:12:03] to [00:15:34]. Lingering makes players wonder whether it still deals
  damage [00:15:01].
- **Context sets the amount**: the right Tristana jump for one champion is noise with 200 on screen
  [00:16:08]. Review with the real density (N copies), not the effect alone. Observed:
  `ut_vfx.crowd_readability` counts 20 separate cores for 20 explosions at a 4 m gameplay spacing, 6
  when packed 2.2 m apart (P4c, P4a).
- **Agent translation of the importance scale** [added]: a `VfxTier` component (importance, gameplay
  radius, duration, frequent) on every root; `ut_vfx.importance_ladder` compares the peak light each
  effect adds (`effect_energy`) with one camera. Observed ladder (P18): slash 0.39 < muzzle 0.46 <
  impact 1.50 < shockwave 2.60 < explosion 5.99. A loop stopped with its gameplay state must be gone
  within 0.5 s [added threshold]; the projectile was gone 0.22 s after StopEmitting (P19).

## Nikola Damjanov, Nordeus (Spellsouls, shipped mobile PvP; Unite Europe 2017, `YZWKdw03Gls`)

- **Readability first, then theme and fidelity** [00:07:13]; noisy, contrasty textures turn to mush
  when several spells overlap on a small screen [00:09:54].
- **Overdraw is the bigger pain than draw calls** [00:24:35]. **About 90% of effects are textures
  moving over meshes**; particles are secondary fluff, **hard limit 100 per emitter** [00:28:02],
  [00:35:33]. Observed (P14b): the same shockwave as one ring mesh with a scrolling uber material
  drew 1 layer everywhere (0.037 FSE at peak, 1 particle, 1 draw call) against 5 to 7 layers where
  covered (0.35 FSE, 36 particles) for a puff ring covering 1.6x the pixels. Deciding condition in
  the disagreements table below.
- **Budgets by spell tier**: 8 to 10 draw calls for a high-level spell, 5 to 6 low-level, 2 to 3 per
  instance of a multi-target spell [00:25:08]; no post-processing on the low end, glow faked with an
  extra element [00:25:42]; unique textures 256 typical, 512 max, sheets 1K "when we beg"
  [00:46:03]; everything compressed except LUTs [00:49:26]; max 10 bones, 2 influences [00:30:59].
- **One uber VFX shader beats a zoo of stock shaders**: grayscale texture colored by a LUT (dynamic
  gradients only while iterating), channels as options of the same texture (R main, G emission or
  lightmap-like, B alpha override), linear fade along UV, alpha erosion with black and white points,
  a second alpha texture with its own tiling, per-material blend and cull [00:13:49] to [00:24:01].
  LUTs per class keep palettes consistent and are batch-editable images [00:15:54]. Agent version:
  `scripts/Shaders/VfxUber.shader` (URP unlit, `shader_feature_local` per feature, SRP Batcher
  layout) and `VfxUber.Create`; feature matrix verified (P14c). Two observations the talk does not
  cover: channel-packed data must import linear (as sRGB a 0.5 gray reads 0.21 and the effect turns
  dark and eroded), and keywords are set on material assets, never toggled at runtime (Unity 6
  builds compile only the variants shipped materials use) [added].
- **Motion rules**: no linear curves except loops and morph targets, contrast of fast and slow,
  always something moving, a burst at the start of each loop [00:11:47] to [00:12:19], [00:36:39].
  Randomize everything, even slightly [00:36:06]; one random sprite per particle from a sheet of
  very different sprites makes one emitter look like several [00:37:12]. Observed: the audit's
  motion lint (`vfx.linear_curve`, `no_speed_contrast`, `loop_no_start_burst`) found six linear size
  curves in the v0.1 fireball kit (P9c), now eased; random fixed frames verified from baked UVs
  (P16).
- **Low-end LOD: turn off the least important elements first** (fluff particles), which requires
  knowing primary versus secondary from the start [00:48:54]. Stripping physics for size means fake
  gravity with Force/Velocity over Lifetime [00:36:06].
- **Triangulate VFX meshes before export** so vertex alpha gradients interpolate as authored
  [00:29:29].

## Orson Favrel and Fred Moreau, Unity (Unite 2024 `20WjQIFl85o`; Orson's six-way talk GDC 2023 `uNzLQjpg6UE`)

- **Profile while authoring, not at the end** (Orson [00:30:37]). Millions of particles is a
  capability, not a target (Fred [00:34:32]).
- **VFX Graph memory = stored attributes x capacity**. Attributes written in Initialize or Update
  are stored; written in Output they are not: moving Set Color to Output took one smoke from 4.2 to
  3.4 MB; storing only angle Z to 3.1 MB; capacity near the real alive count to about 1.2 KB [?]
  [00:33:22] to [00:35:07]. Observed: 20 instances of a 512-capacity loop = 4.0 MB GPU in one batch
  (`VFXManager.GetBatchedEffectInfos`).
- **Bounds too big silently disable culling**: turn the camera away and check the culling state
  [00:31:43]. Observed: `VisualEffect.culled` false in view, true 5 frames after turning the camera
  away.
- **Sorting costs a dispatch**: turn it off on outputs where order does not matter (dark dense
  smoke) [00:35:40].
- **Lit outputs for non-emissive media, Six-way Smoke Lit for smoke that must survive day and
  night**; converting an output keeps the behavior [00:22:21]. Emissive energy (fire, sparks, magic,
  trails) stays unlit [added deciding condition, with Gabriel's trail below].
- **Gate child spawns with activation ports**: dust only on the first collision plus a random
  threshold, not one cloud per pebble ("nightmare on performances") [00:47:27]; Unity 6 collision
  attributes (count, normal, position) and Trigger Event On Collide [00:45:46].
- **One global drives a phenomenon everywhere** (rain intensity read by surfaces, VFX Graph through
  Custom HLSL, a fullscreen pass) [00:05:55] to [00:10:20]; VFX Graph has no direct global access,
  so a shared `.hlsl` include serves Shader Graph Custom Functions and VFX Custom HLSL [00:36:45] to
  [00:38:24].
- **Hand level designers one MonoBehaviour** that drives the VFX exposed properties, the light and
  the material together [00:27:52]; drive lights from it rather than from an Output Event (which
  disables instancing, docs).
- **Six-way**: bake light, not color; cheap to render, heavy in texture memory: spend effort on
  memory (small motion-vector texture about 256 x 256 lets you halve the frames), not ALU (uNz
  [00:02:30], [00:17:41]). Probe lighting is per vertex, so octagons or subdivided planes avoid
  faceting at night and trim overdraw (octagon crop factor 0.293 default) [00:16:54]. Animate
  contrast remap from high at birth to low at death [00:16:15]. Import: max size matching, BC7, sRGB
  matching the exporter [00:08:52].
- **Custom HLSL is the escape hatch**: parameters become ports; reference a `.hlsl` file so the
  logic is editable text; Preferences > Visual Effects > Show Additional Debug info shows the
  generated code [00:51:23] to [00:55:52].

## Fred Moreau, Unity product manager for VFX and shader tools (Unity Discussions, "Shuriken Particles and Shader Graph", Posts 1 to 11, 2025 to 2026)

- **Shader Graph shaders do not implement procedural instancing**, which the Particle System needs:
  a Shader Graph material on Mesh-mode particles silently falls back to dynamic batching, "which
  hits performance pretty badly as vertices are transformed on the CPU" (Post 10). 6.3 fix: inject
  `#pragma instancing_options procedural:ParticleInstancingSetup` with a String-mode Custom Function
  and include URP `ShaderLibrary/ParticlesInstancing.hlsl` (Posts 2, 3). 6.6 adds Preprocessor
  Directives and particle nodes (Posts 10, 11). Observed: the 6.3 template
  `0_Particle Unlit.shadergraph` contains no `instancing_options`; `VfxAudit` flags it
  (`vfx.sg_no_procedural`); with 5,000 instanced cubes the main thread took 1.51 ms against 0.89 ms
  for URP Particles/Unlit while draw calls and batches were identical (7).
- **With instancing, particle data lives in `unity_ParticleInstanceData[unity_InstanceID]`**, not
  vertex color and UVs: skip the buffer read and every particle loses its tint; custom data needs a
  redefined `UNITY_PARTICLE_INSTANCE_DATA` struct declared before the include and ordered like the
  streams (Posts 3, 6).
- **Vertex stream table** (Post 11): Normal only for Lit, Tangent only with normal maps, AnimFrame
  for sheet UVs when instanced, UV2 + AnimBlend when not; the mesh needs a second UV equal to the
  first. Turn instancing off temporarily to read the register hints (Post 6).
- **URP particle shaders in 6.3 have no ShadowCaster pass**: Renderer "Cast Shadows" does nothing
  (Post 11; checked in the 6.3 URP source).
- **Never add `PROCEDURAL_INSTANCING_ON` as a Multi-Compile keyword**
  ("UNITY_INSTANCING_PROCEDURAL_FUNC must be defined") (Post 2). **On HDRP, prefer VFX Graph** over
  Shuriken plus Shader Graph (Post 6).

## Gabriel Aguiar, game VFX artist and instructor (`adgeiUNlajY` 2023, `w3Xzzs1TWpk` 2021, `wvK6MNlmCCE` 2021, `xenW67bXTgM` 2018, `qh3TEYUN6cA` 2021)

- **Explosion = sparks, flash, fire, smoke**, each its own emitter and timing; no custom texture
  needed for a readable prototype (Default-Particle + HDR emission + Bloom) (adge [00:00:35] to
  [00:05:05]). Values: sparks life 0.2 to 0.8, speed 2 to 20, burst 15 to 25, Stretched Billboard
  speed scale 0.03 (0 stays round); flash life 0.1, burst exactly 1; fire burst 10; smoke longer,
  slower, bigger, darker, **Order in Layer -1** [00:00:35] to [00:05:05]. Opaque surface draws the
  quad as a square: Transparent [00:02:48].
- **Weapon kit = projectile, muzzle, hit, derived by duplicating one base** (xen [00:21:01],
  [00:26:33]): projectile a spinning additive mesh with a trail and a prewarmed blinking glow
  [00:01:12]; muzzle burst only, 0.1 to 0.2 s, cone sparks radius 0.1, angle 10 to 15 [00:21:01] to
  [00:24:43]; hit = muzzle turned to View alignment with sphere sparks [00:26:37]; muzzle forward =
  shot, hit up = surface normal via `FromToRotation` [00:28:23]. **Trail time scales with projectile
  speed**: preview 1 s, ship 0.15 to 0.2 s [00:09:33]. **Root duration = longest child lifetime**
  when cleanup reads it [00:31:08].
- **Over-life blocks in VFX Graph must be Multiply composition** after a Set block, or they
  overwrite it (adge [00:06:27], w3X [00:12:48], qh3 [00:08:08]). Name output contexts so Output
  Render Order is manageable (adge [00:10:21]).
- **Chain systems on the GPU**: an invisible carrier system for motion, strips from Trigger Event
  Over Distance ("a little bit heavier but much smoother"), children On Die with Set Position From
  Source (w3X [00:04:05] to [00:16:06]). Front trail half the size, half the life, brighter
  [00:07:51].
- **Trails**: gradient along UV.x, erode with subtracted noise instead of a flat fade, clamp before
  alpha; Unlit for emissive trails (Lit blows out); two stacked trails flicker at equal Order in
  Layer (wvK [00:04:02] to [00:11:31]). Unity's Trail Renderer "is not great" [00:12:12].
- **Ground slash**: shape in a mesh, look in UVs plus a 1D gradient (front brightest) (qh3
  [00:03:41]); pivot on the ground and a FixedUpdate raycast from y + 1 (a detection distance under
  1 never hits) [00:16:07], [00:17:28]; world-space child trails need Set Position (0,0,0) in Local
  [00:12:03]; Spawn Over Distance skips frames above 50 units/s (VelocityThreshold, checked in the
  17.3 source); two stacked decals, dark scorch (1.75 to 2) then a smaller emissive core (0.75 to
  1.3) [00:12:36] [00:13:42]. The fireball impact now carries that pair as flat quads oriented by
  the hit normal (mobile-safe), scorch 1.0 s, core 0.45 s.

## Sirhaian, Riot VFX artist (`5Mw6NpSEb2o`, 2018)

- **Layers with one job each**: alpha-blended body for shape and contrast, additive copy for heat,
  big soft glow, sparks; **darken the base so additive layers have contrast**; sort orders body 0,
  additive 1, sparks 1, **glow 2, "always above all else"** [00:08:49] to [00:16:28].
- **Motion Blur, not Gaussian, for soft edges that keep a crisp silhouette** [00:03:33]; **pixels
  never touch the texture border** [00:14:14] (audit `vfx.texture_border`, per sheet cell); white
  texture, color from the system [00:04:11]; random fixed frame from a 2 x 2 variant sheet
  [00:05:58] (Frame over Time random between two constants: every particle kept its cell from 0.2 s
  to 0.8 s and all four cells were used, P16); fire rises and grows, **sparks shrink** [00:13:04]
  (kit sparks now shrink); limited random rotation for flames [00:08:12].

## Hovl Studio, Asset Store VFX publisher (`5SosGQwPXdY`, 2020)

- **A slash is a mesh particle with a dissolving texture**, one burst, lifetime = the swing
  [00:02:37]. **Per-particle shader parameters come from Custom Data through vertex streams**
  (Custom1.xy dissolve curve, Custom2 random offset and hue): "a random number cannot be made in a
  shader" [00:07:34] to [00:17:32]. Smoke fades by alpha, not size [00:22:28]; distortion renders
  behind the element it surrounds (Sorting Fudge 2) [00:23:11]. In URP 6.3 particle distortion
  samples the opaque scene color, which never contains transparents, so the rule matters more
  [added, checked in the URP source]. Observed: `FX_Slash_Mesh` (uber material, Custom1.x erosion,
  Custom1.y emission, Custom2.x random offset, Custom2.y wipe) starts hot and fades out; with
  default streams the shader reads zeros and the slash stays flat (P15); two seeds give different
  slashes, the same seed identical frames. Distortion drawn after an additive glow left 31% of the
  glow's light; drawn before, 100% (P17). Mesh particles read mesh vertex colors as 8-bit: float
  colors arrive as garbage (flat dark blue, alpha 0.25), Color32 matches a MeshRenderer (P14d).

## Simon Trümpler, Wild Sheep Studio, author of the Textures for VFX database (GDC 2022, `KaNDezgsg4M`)

- **Aim for "good enough" first**, then polish with the art director [00:01:59]. **The fastest
  texture is one you do not make**: licensed third-party or in-house first; "using photos is not
  cheating"; prefer no-attribution licenses (ArtStation standard: 1 project, 2,000 sales)
  [00:07:07], [00:11:12], [00:48:37]. Flowchart: need a texture? third party? a simple dedicated
  tool? tileable (Substance)? else paint [00:16:31].
- **Make borrowed flipbooks production-ready**: color and size curves, frame blending, and **a
  decelerating frame rate (fast at the start, slow at the end)** [00:12:36] to [00:13:07]. Observed:
  the kit's billow flipbook plays through `VfxShuriken.Decelerate()`.
- **Author big (2048), import at the size the particle needs at its closest screen coverage**: a 32
  x 32 ash speck that reaches the camera is a blurry blob [00:18:38], [00:20:04]. Agent version
  [added]: `VfxBudget.ScreenTexel` measures each layer's largest on-screen size against the texels
  its texture spans; `ut_vfx.texel_verdict` warns below 0.5 for detailed textures and lets soft ones
  (a glow, `TextureDetail` 0.003) be magnified (P18: the explosion flash at 367 px on a 64 px glow
  passes, the billow at 0.72 passes).
- **Shader tricks beat texture work**: UV distortion, LUTs (a few colors stylize a realistic
  explosion), erosion "fakes complexity" [00:38:09] to [00:40:56]. Keep masks as separate grayscale
  images about 90% of the time (own tiling, panning, resolution); pack only when the shader contract
  is fixed [00:37:07].

## Brackeys (`FEA1wTMJAR0`, 2018) and Code Monkey (`LhvnIOlmXMM`, 2020)

- Brackeys: every module is one struct in C#; bursts for explosions, rate over time for loops, rate
  over distance for moving emitters [00:02:13]; **World collision is "pretty taxing"**, use Planes
  [00:06:19]; **trails render magenta without a trail material** [00:08:05] [frame 00:08:15];
  particle lights with a low ratio [00:07:28]; Limit Velocity drag sells explosions [00:04:45].
- Code Monkey: the graph asset and the GameObject are separate; per-instance overrides of exposed
  properties give many looks from one graph [00:04:22], [00:11:03]; raising spawn rate needs
  capacity [00:05:44]; bounds out of view hide the effect [00:06:12].

## Unity documentation (6.3 Manual; VFX Graph 17.3 manual; Unity 6 VFX e-book excerpt)

- **Legacy particle shaders in URP** [observed, contradicts the notes' expectation]: Legacy
  Shaders/Particles/Additive, Alpha Blended and Mobile/Particles/Additive still draw in 6.3 URP (not
  magenta); URP's upgrader maps only Standard Surface, Standard Unlit and the two VertexLit Blended
  shaders (URP 17.3 source). Migrating with the legacy tint doubled kept the look (PSNR 29 dB
  before/after).
- **Choosing** (6.3 Manual, Choosing your particle system solution): Shuriken for thousands,
  Built-in RP, per-particle C# read/write and Unity physics collisions and events; VFX Graph for
  millions on URP/HDRP with compute. VFX Graph on Android only on a high-end subset with URP
  (e-book); on the Web only with WebGPU, experimental in 6.3 (version deltas § 6, § 12). The Manual
  table's "frame buffer access HDRP only" is stale: URP 17.3 binds color and depth for VFX Graph
  (Unite 2024; URP source).
- **Deferred and asynchronous** (VFX Graph 17.3, Component API): `SendEvent` and `Simulate` run in
  the next `VisualEffect.Update`, after `LateUpdate`; `aliveParticleCount` is computed
  asynchronously "every second". Observed on 6000.3.21f1: it refreshes every 60 frames (about 1 s at
  60 fps, 0.05 to 0.1 s in batch Play mode at about 900 fps), reads **-1 until the first readback**
  (not 0), and `GetParticleSystemInfo(name).aliveCount` updates on the same beat.
- **Bounds** (Visual Effect Bounds): Recorded is the default and ships placeholder bounds until
  recorded and applied; Automatic forces "Always recompute bounds and simulate"; Output-stage size
  changes need Bounds Padding.
- **Instancing** (Instancing): per asset, batches of fixed capacity; Output Mesh and Output Event
  Handlers disable it; profiling panels disable it on the attached effect. Observed: 20 instances, 1
  batch, 0 unbatched, max 149 per batch.
- **Events** (Events; e-book): wiring an Event context into Spawn Start removes the implicit OnPlay
  binding (observed: the asset's event list became OnStop + Fire); regular event attributes are
  readable only in Initialize; a `VFXEventAttribute` belongs to one asset.
- **Silent failures** (Property interface; binder source): `GetX` of a missing property returns the
  default; compound types are flattened (`X_position`, `X_angles`, `X_scale`); Input Axis/Button/Key
  binders are no-ops without the legacy Input Manager.
- **SDF and point caches** (Representing complex shapes): point caches for points only (much
  cheaper), SDFs to conform, attract or collide; Bake Tool SDFs are normalized (largest side = 1,
  pass `GetActualBoxSize()`); per-frame bakes at low resolution (64) with `Dispose()`; pCache
  imports only float and uchar properties. Observed: an ASCII pCache written by
  `ut_vfx.write_pcache` imports as `PointCacheAsset` (1,024 points, two 32 x 32 RGBAHalf maps).
- **No GPU timings in the VFX profiling panel on Apple Silicon** (Performance and optimization).
- **Mesh particles need GPU instancing and an instancing shader**; the default particle material
  does not instance; custom Built-in instanced shaders need `#pragma target 4.5` (Apply GPU
  instancing). `EnableVertexStreams` is deprecated in 6.3: `SetActiveVertexStreams`.

## Where experts disagree, and the deciding condition

| Question                            | Positions                                                                                | Deciding condition                                                                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Particles or meshes as the backbone | Nordeus: 90% textures on meshes; Gabriel, Sirhaian, Hovl: particle layers                | Mobile overdraw budget and a fixed camera favor meshes; PC, free cameras, prototypes favor particles                                                                                                                                                           |
| Shuriken or VFX Graph               | Code Monkey, Gabriel: by need; Unite 2024: all VFX Graph                                 | Every target phone (VFX Graph needs compute and is supported on Android only on a high-end URP subset), WebGL, per-particle C#, Unity physics: Shuriken. Counts beyond thousands, GPU collisions, decals, six-way, GPU events on supported hardware: VFX Graph |
| Lit or unlit                        | Gabriel's trail unlit; Orson's smoke lit and six-way                                     | Emissive energy unlit; non-emissive media lit when lighting changes                                                                                                                                                                                            |
| Alpha fade or erosion               | Sirhaian, Hovl: alpha; Nordeus, Gabriel, Trümpler: erosion                               | Soft volumes fade; shaped elements (slashes, trails, cracks) erode to keep a crisp silhouette                                                                                                                                                                  |
| Make or source textures             | Gabriel paints; Trümpler sources                                                         | Shapes bound to a mesh UV or simple math: make or generate; organic media: source, photobash, simulate                                                                                                                                                         |
| Motion vectors or frame blending    | DKV, Orson: motion vectors; Trümpler: blending is good enough; Nordeus: MV for hero only | Big PC flipbooks save memory with a small MV texture; small or mobile effects pay an extra sample for little gain                                                                                                                                              |
| Channel packing                     | Nordeus, six-way: pack; Trümpler: separate 90%                                           | Pack when the shader contract is fixed; separate when layers need their own tiling or reuse                                                                                                                                                                    |
| Rate over time or distance          | Gabriel: distance is smoother but heavier                                                | Fast emitters use distance (and raise VFX Graph's 50 units/s VelocityThreshold); static emitters use time                                                                                                                                                      |
