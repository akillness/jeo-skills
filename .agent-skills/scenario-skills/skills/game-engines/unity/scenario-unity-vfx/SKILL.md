---
name: scenario-unity-vfx
description: "Use when making or fixing real-time VFX in Unity 6.3: explosions, fireballs, projectiles with muzzle, trail and impact, spells, slashes, shockwaves, smoke, sparks, Particle System (Shuriken) or VFX Graph ('VFX Graph explosion', 'particles look bad', 'effect kills fps on mobile', 'too much overdraw'), mesh effects with scrolling textures, an uber VFX shader with LUT ramps, Custom Data and custom vertex streams, flipbooks and VFX textures, pink particles after URP upgrade, VFX budgets and readability."
license: MIT
---

# Unity VFX (real-time VFX artist)

Expert VFX serves the game first: the player must read what happens, where the danger is and when it
ends, on the target device, with the real number of copies on screen. Craft (layers, contrast,
motion, textures) and budget (fill, particles, draw calls, memory) are both measured here: every
effect is stepped frame by frame offscreen, looked at, and counted. Target: Unity 6000.3.21f1, URP
17.3, VFX Graph 17.3.0, macOS Apple Silicon. If a sibling skill named here is missing from your
available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps, `ut_run`,
`ut_review`, `ut_stat`, AgentKit).

**Status (2026-09-24, after the blind-grade refactor):** every procedure ran in Unity 6000.3.21f1
through `tests/code/unity-vfx/` (results in `archive/tests/unity-vfx/live_results.jsonl`, numbers in
[`references/procedures.md`](references/procedures.md)).

## Stance (the expert delta)

1. **Gameplay before beauty** (Jason Keyser, ex-Riot). The primary shape equals the gameplay
   boundary; brightness is a budget spent by importance (idle and basic attacks subdued, game
   changers and ultimates bright); effects end with the gameplay state; review with N copies, not
   one. Tag every root with `VfxTier` and check the ladder (`ut_vfx.importance_ladder`; observed:
   slash 0.39 < muzzle 0.46 < impact 1.50 < shockwave 2.60 < explosion 5.99), the crowd
   (`crowd_readability`: 20 explosions at gameplay spacing read as 20 shapes, packed 2.2 m apart
   only 6) and the tail after a stop.
2. **On mobile, a texture moving over a mesh beats a particle cloud** (Nikola Damjanov, Nordeus:
   about 90% of shipped effects; particles are fluff, 100 per emitter max; overdraw hurts more than
   draw calls). Observed: the same shockwave as one ring mesh drew 1 layer everywhere, 0.037
   full-screen equivalents (FSE) at peak, versus 5 to 7 layers where they cover and 0.35 FSE for 36
   puffs. Measure fill per frame, not particle counts.
3. **Choose the system by platform and data flow.** Every target phone, WebGL, per-particle C#,
   Unity physics collisions: the Particle System, scriptable module by module. Thousands to millions
   of GPU particles, depth-buffer collisions, decals, six-way smoke, GPU events: VFX Graph, which
   needs compute and runs on Android only on a subset of high-end URP devices (e-book) and on the
   Web only through WebGPU, experimental in 6.3.
4. **One uber material, per-particle data from Custom Data.** Nordeus's uber shader: grayscale R
   colored by a LUT ramp, G emission, B alpha override, linear fade, erosion, second alpha, Blend
   and Cull per material. `AgentKit/VFX/Uber` is that shader as text; per-instance variation
   (erosion curve, random UV offset, wipe) comes from the Custom Data module through custom vertex
   streams (Hovl Studio: "a random number cannot be made in a shader"), so one material serves every
   variant and the SRP Batcher stays on. Stream order is a contract the audit checks.
5. **A VFX Graph is a black box with a public API** (VFX Graph e-book; Orson Favrel, Unity). Copy a
   template, expose a few properties and events, drive them with cached IDs; commands are deferred
   and `aliveParticleCount` reads -1 until the first readback, then refreshes every 60 frames
   (observed). Memory is capacity x stored attributes; bounds decide culling; sorting costs a
   dispatch; a point cache when particles only need positions, an SDF to conform or collide (both
   scriptable, P8, P12).
6. **Layers with one job each, contrast, order, motion** (Sirhaian, Gabriel Aguiar, Nordeus). Dark
   alpha body under additive heat, glow on top, distinct sorting orders for stacked alpha layers; no
   linear curves except loops, fast and slow elements mixed, a burst when a loop starts, something
   always moving; a variant sheet plays as a random fixed frame per particle, never as animation;
   sparks shrink while fire grows; every layer fades in and out.
7. **Do not paint what you can borrow or compute; import at the size the screen shows** (Simon
   Trümpler; Nordeus 256 typical, 512 max). Borrowed flipbooks get blending and a decelerating frame
   curve; simple shapes are generated; sprites get soft edges from motion blur, not Gaussian, and
   keep their values off the border; channel-packed data textures import linear (as sRGB a 0.5 gray
   reads 0.21, observed); LUTs stay uncompressed.
8. **In 6.3, Shader Graph particle shaders drop GPU instancing on mesh particles** silently (Fred
   Moreau, Unity): +69% main-thread time at 5,000 cubes with identical draw calls (observed). The
   audit flags it; the fix comes from scenario-unity-shaders.

## Establish first

Ask once: target tiers and frame budget (default 30 fps at 65% on mobile = 21.7 ms); compute
available; post-processing on the lowest tier (no Bloom means faking glow with an additive layer);
gameplay camera and distance; each effect's importance tier, frequency, damage radius and duration;
copies on screen at worst (default 20); three effect pillars (Keyser); lit or unlit world, time of
day. Defaults: URP, Shuriken, mesh-first on mobile, no post on the low tier, budgets
`ut_vfx.BUDGETS["mobile"]`.

## Workflow

1. **Brief in numbers.** Tier, radius, duration, copies, budgets. GATE: every later check has a
   threshold (`ut_vfx.BUDGETS`, marked source or [added]).
2. **Choose the system and the backbone** (Stance 2, 3). Shuriken:
   `VfxShuriken.Build(parent, Layer, seed)` per layer; a mesh layer sets `Layer.mesh`
   (`VfxMeshes.Ring`, `Cone`, `QuadXZ`, Color32 vertex alpha). VFX Graph:
   `VfxGraphJobs.CopyTemplate`, then expose in the GUI
   ([`references/gui-paths.md`](references/gui-paths.md)) or, unsupported, `VfxGraphJobs.Author`.
   GATE: `VfxGraphJobs.Contract` lists every property and event gameplay uses.
3. **Textures and materials.** `VfxTextures.ImportVfxTexture` (Clamp, tier size; data textures sRGB
   off); URP particle materials through `VfxMaterials.Particle` (inspector logic via
   `BaseShaderGUI.SetMaterialKeywords`); uber materials through `VfxUber.Create(path, UberSpec)`
   with keywords set on the asset, never toggled at runtime. Fire, sparks, trails and magic stay
   unlit; smoke and dust go Simple Lit or six-way when lighting changes; URP particle shaders cast
   no shadows. GATE: queue 3000, expected keywords, no magenta, no Built-in shader (audit).
4. **Build the effect.** Worked examples: `VfxFireballKit.Build` (projectile, muzzle, impact with
   scorch and hot core, explosion) and `VfxMeshFx.Build` (mesh shockwave, particle shockwave, slash
   with Custom Data). Custom Data: `Layer.custom1X/custom1Y/custom2X/custom2Y` (curves or random
   ranges) sets the module and `VfxUber.Streams`. Spawn code calls `VfxSeed.Reseed(go)`: fixed seeds
   are for captures. GATE: `VfxAudit.AuditPrefabs` 0 errors; warns explained.
5. **Step and look.** `VfxSequence.CaptureEffect` (any prefab: copies with distinct seeds, `stop_t`
   for loops, shader time pinned to simulated time) or `CaptureFireball`; `ut_review.review_images`;
   OPEN the contact sheet. GATE: no blank or magenta frame;
   [`references/critique.md`](references/critique.md) A and B pass.
6. **Measure.** `VfxBudget.Overdraw` (layers per pixel, FSE, heatmap), `Counts`, `VisualRadius`
   (mesh-aware), `ScreenTexel`; `ut_vfx.effect_verdict` or `sequence_verdict`, `texel_verdict`,
   `importance_ladder` across the set, `crowd_readability` on `VfxStress.StressOverdraw` at gameplay
   spacing, `motion_gaps` on evenly spaced loop frames; stress profile with
   `AgentKit.AgentProfile.PlayModeTimings` against a 0-copy scene. GATE: verdicts pass or warn with
   a written reason; frame delta within the VFX share.
7. **VFX Graph runtime check** (`VfxGraphJobs.PlayTest`): offscreen camera target, property + event,
   counts after the deferred frames, N instances batched, culled when turned away;
   `ut_vfx.graph_hygiene(vfx_yaml_facts(...), peak_alive)`. GATE: counts proportional to the exposed
   rate, `unbatchedInstanceCount == 0`, culling both ways, capacity near the alive count.
8. **Fix one thing, re-run 5 to 7, compare** (`ut_review.compare`, heatmaps side by side). Deliver
   with evidence (scenario-unity-expert report format).

## Numbers

| Value                                  | Relative to                                                                                     | Source         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------- |
| about 90%                              | effects that are textures moving over meshes (mobile)                                           | Nordeus        |
| 100                                    | max particles per emitter, mobile                                                               | Nordeus        |
| 8 to 10 / 5 to 6 / 2 to 3              | draw calls per high-level / low-level / multi-target SPELL (by gameplay level, not device tier) | Nordeus        |
| 256 typical, 512 max; LUT uncompressed | VFX texture import, mobile                                                                      | Nordeus        |
| 0.1 to 0.2 s; 0.15 to 0.2 s            | muzzle and flash life; trail time of a fast projectile                                          | Gabriel Aguiar |
| about 0.3 s                            | slash lifetime (= the swing)                                                                    | Hovl Studio    |
| scorch 1.75 to 2, hot core 0.75 to 1.3 | two stacked marks on the hit surface                                                            | Gabriel Aguiar |
| 50 units/s                             | VFX Graph Spawn Over Distance threshold                                                         | 17.3 source    |
| 0.5 s; 0.5 to 4                        | tail after the gameplay stop; texels across a particle / its screen pixels (detailed textures)  | [added]        |
| 1 vs 5 to 7 layers, 0.037 vs 0.35 FSE  | ring mesh vs 36-puff shockwave at peak, 960 x 540                                               | observed       |
| 0.51 FSE, p95 11, 98 particles         | fireball kit beat at peak (mobile tier)                                                         | observed       |
| 1.05 FSE, 540 particles; +0.22 ms CPU  | 20 explosions at their peak; replayed together vs none (editor, indicative)                     | observed       |
| 0.89 vs 1.51 ms                        | 5,000 mesh particles: URP Particles/Unlit vs 6.3 Shader Graph particle template                 | observed       |

## Quality gates

- **Measurable:** audit `counts.error == 0`; effect or sequence verdict pass or explained warn
  (fill, particles, visual/gameplay radius 0.85 to 1.2, 0 particles after the window, tail under 0.5
  s); ladder pass; crowd pass at gameplay spacing; texel verdict; stress delta; VFX Graph contract,
  counts, batching, culling, hygiene.
- **Visual:** contact sheet opened; head brightest in flight; nothing cut by geometry; layers fade;
  heatmap hotspots match something visible; consecutive instances differ.

## Common mistakes

| Mistake                                             | What it looks like                                            | Fix                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| A particle cloud where a mesh would do (mobile)     | 5 to 7 overlapping layers for a ring (observed)               | ring or arc mesh + scrolling uber material, 1 layer                  |
| Custom Data without the matching streams            | shader reads zeros: no erosion, no hot start (observed)       | `VfxUber.Streams`; audit `vfx.stream_mismatch`                       |
| Channel-packed texture imported as sRGB             | dark, eroded effect                                           | sRGB off; audit `vfx.data_texture_srgb`                              |
| Float vertex colors on a mesh particle's mesh       | flat dark blue, alpha 0.25; a MeshRenderer is fine (observed) | `Mesh.SetColors(List<Color32>)`; audit `vfx.mesh_color_format`       |
| Linear size or erosion curves                       | mechanical motion; six in the v0.1 kit (observed)             | `EaseOut`/`EaseIn`/`Decelerate`; audit `vfx.linear_curve`            |
| Variant sheet played as animation                   | every particle swaps shape together                           | random fixed frame: Frame over Time random between two constants     |
| Distortion drawn after the transparent it surrounds | the glow under it vanishes (31% left, observed)               | draw distortion first: lower order or larger Sorting Fudge           |
| Kit seeds shipped fixed                             | every shot identical                                          | `VfxSeed.Reseed` on spawn                                            |
| Instantiate and Destroy per shot at high fire rate  | allocation spikes                                             | pool: replay with Clear + Play (`VfxStressSpawner`), prewarm at load |
| Close explosion fills the screen                    | full-screen fill spike                                        | Renderer Max Particle Size (kit: 0.35 mobile) [added]                |
| Billows or flash centered on the hit point          | hard straight cut into the surface                            | offset along the normal (mobile) or soft particles (PC)              |
| Equal sorting orders on stacked alpha layers        | flicker                                                       | distinct orders, glow on top                                         |
| Legacy particle materials left in URP               | still draw, so nobody notices; no URP features                | `VfxMaterials.MigrateLegacyJob`, compare captures                    |
| Asserting VFX Graph counts on the send frame        | -1 or stale values                                            | wait the deferred frame and 60+ frames                               |
| Profiling in batch Play mode at uncapped fps        | 300 frames = 0.3 s of effect                                  | `Time.captureDeltaTime = 1f / 60f`, 600 frames                       |

More rows (VFX Graph composition, events, trails, capture traps): `references/critique.md` section
F.

## Handoffs

- **Receives** from scenario-unity-gameplay: hit point and normal, damage radius, projectile speed,
  fire rate; from scenario-unity-shaders: dissolve, trail, instanced Shader Graph particles, a
  variant review of `AgentKit/VFX/Uber`; from scenario-textures or scenario (Scenario MCP):
  flipbooks and masks, grayscale on black for additive; from scenario-unity-rendering-lighting:
  Bloom per tier, Depth and Opaque Texture per tier (soft particles, distortion), Decal feature.
- **Delivers** to scenario-unity-gameplay: prefabs with `VfxTier`, `FireballProjectile`-style glue,
  the effect contract; to scenario-unity-performance: stress scene, CSVs, heatmaps; to
  scenario-unity-mobile: tier budgets and cuts (least important layer first); to scenario-unity-web:
  VFX Graph only on WebGPU builds.
- Packet: project, channel, brief in numbers, job ids, contact sheets and heatmaps, verdict lines,
  Verified, Assumed.

## Unity 6.3 notes

- VFX Graph 17.3.0 is a core package; templates 01_Minimal_System to 06_Firework expose nothing;
  deprecated: one **Trigger Event** block with modes, **Set Position Shape**, **Collision Shape**,
  **Set Position From Source**, **Output Particle URP Lit Decal**; output sort is Auto, Off or On in
  YAML (0, 1, 2).
- `SetActiveVertexStreams` replaces `EnableVertexStreams`; URP particle shaders have no ShadowCaster
  pass and blend flipbooks without motion vectors (VFX Graph has Flipbook Motion Blend): keep
  motion-vector flipbooks for hero or slow elements (Nordeus); URP distortion samples the opaque
  texture, which holds no transparents.
- After 6.3: 6.5 deprecates and 6.6 obsoletes dynamic batching; 6.6 adds Shader Graph Preprocessor
  Directives and particle nodes; WebGPU leaves experimental in 6.6.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  disagreements and deciding conditions.
- `references/procedures.md`: P0 to P19 as copyable code with their live results.
- `references/critique.md`: the self-review rubric (gameplay, craft, budget, VFX Graph, honesty) and
  the full mistakes table.
- `references/gui-paths.md`: the same work through windows and menus.
- [`references/sources.md`](references/sources.md): every source, credential, URL, best timestamps,
  revision history.
- [`scripts/ut_vfx.py`](scripts/ut_vfx.py) (budgets, verdicts, ladder, crowd, texels, motion gaps,
  graph hygiene, `.vfx` facts, pCache); [`scripts/AgentKit/Vfx/`](scripts/AgentKit/Vfx/) (jobs, uber
  materials, meshes, mesh-first kit); [`scripts/Runtime/`](scripts/Runtime/) (stress spawner,
  projectile glue, `VfxTier`, `VfxSeed`); [`scripts/Shaders/`](scripts/Shaders/) (`VfxUber.shader`,
  `VfxOverdraw.shader`); [`scripts/EditorGraph/`](scripts/EditorGraph/) (unsupported graph
  authoring, SDF bake).
