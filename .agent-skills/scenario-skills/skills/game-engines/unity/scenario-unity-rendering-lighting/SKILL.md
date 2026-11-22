---
name: scenario-unity-rendering-lighting
description: "Use when setting up URP (or choosing URP vs HDRP), configuring URP assets and quality tiers for PC and phones, lighting a stylized or realistic Unity scene (sun, sky, baked or mixed lightmaps, Shadowmask, Adaptive Probe Volumes, reflection probes), or fixing blurry shadows, light leaks, gray bakes, washed-out images, tonemapping and grading, bloom too expensive on mobile, TAA, STP or MSAA choices, GPU Resident Drawer setup, shader warm-up hitches, or a custom shader that vanished or lost its baked light."
license: MIT
---

# Rendering and lighting (lighter / graphics TA)

Expert lighting in Unity is a measured loop: fix exposure, light to anchors, bake, grade, judging
every stage from the same camera bookmarks with numbers (gray cards, clipping, bake memory, native
passes) before taste. This skill drives URP 17.3 on Unity 6.3 from code; everything here ran in
Unity 6000.3.21f1 on an Apple M5 Max (Metal) on 2026-09-24. If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, `ut_run`, `AgentCapture`, `AgentProfile`,
`ut_review`, 6.3 traps).

## Stance (the expert delta)

1. **Exposure first, lights second** (Pierre Yves Donzallaz, yqCHiZrgKzs [00:20:21]). URP 6.3 has
   Fixed exposure only: one Post Exposure per zone, lights solved from an 18% gray card (the unaided
   sun 2.0 read +1.03 EV with no tonemapper; the solved 0.98 read +0.16 EV under Neutral).
2. **Expect gray after baking; fix it in post under the tonemapper you chose early** (Kyle Banks,
   1agSNKuAfTM [00:04:58]; PYD [01:01:29]): Neutral for lookdev; contrast, saturation, Shadows
   Midtones Highlights pushed too far, then dialed back. ACES darkens (K3-wPnhmDi4 [00:54:50];
   measured -1.4 EV): re-solve exposure under it.
3. **Shadow distance before resolution** (6.3 Manual; HCXCmHgV7Sk [00:15:32]): 1024 over 10 m beats
   2048 over 40 m. Max Distance = farthest dynamic shadow the player sees; last cascade ends at the
   last caster. Stylized room with soft shadows: 1024 was the sweet spot, higher looked "too crisp"
   (URP e-book).
4. **The asset that renders is the Quality level's, and so is its post** (URPS [00:03:14],
   [00:30:06]). Report before editing. Unity 6 stacks the Graphics default profile, the active URP
   asset's profile, then scene volumes, per parameter: tier-dependent post (bloom cost, DoF, APV
   leak reduction) goes on each tier's asset profile, never in scene volumes, which win on every
   tier (measured). The template's two assets share one profile, and its Neutral tonemapper.
5. **Bake what does not move; split settings by cost** (Ciro Continisio, hMnetI4-dNY [00:35:51]):
   texel density, max size, directional mode and shadowmask cost memory, samples and bounces only
   bake time. Small props keep Contribute GI with Receive GI = Light Probes ([00:48:30]). A
   shadowmask texel holds 4 shadowed Mixed lights (6.3 Manual). Lightmaps sample 3 to 4 times
   cheaper than APV but take 3 times the memory (APV24 IpVuIZYFRg4 frame 00:23:43): phones keep
   lightmaps for static geometry.
6. **The sky is the default interior light** (PYD22 DlxuvvYZO4Q [00:08:17]; U25 [00:45:56]). Without
   baked GI and a local box probe, interiors and glossy surfaces take the sky (a smoothness-0.3
   table read gray-blue until one probe existed).
7. **Stylized is a production choice, not a filter** (Kyle Banks [00:22:04] to [00:23:06]): one
   palette texture, triplanar world noise, one shared shader (7 samples over 3 textures, fine on
   Switch); Simple Lit on the low tier (URP e-book); Subtractive as the cheapest mixed mode (TRB). A
   toon shader must still sample lightmaps, shadowmask and probes or the bake vanishes; 6.3 builds
   custom lighting on the URP Unlit target (deltas section 5).
8. **On tilers, bandwidth is the budget; prove it** (6.3 Manual; U25 [00:30:26]; Ryan Keeble,
   bl0vKZkzNOs [00:14:30]): Forward, no depth or opaque texture unless needed (copy After
   Transparents), no soft shadows, MSAA 2x, 1 to 2 ms per extra full-screen pass on a Quest 2-class
   GPU. `PassAudit` reads the Render Graph's native passes: a depth copy After Opaques or the Opaque
   Texture splits the opaque, skybox and transparent pass (measured).

## Establish first

Ask once: platforms and device tiers (compute or GLES); frame budget (mobile at 65%); one emotion
sentence (KB [00:03:25]), references, stylized or realistic; time of day; what moves; interiors;
custom shaders; baked-memory budget.

| Decision      | Default                                                                                                                                                                                                                                                         | Change when                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Pipeline      | URP 17.3                                                                                                                                                                                                                                                        | HDRP only for PC/console needing its exclusive features; no new features, no mobile, web or Switch 1 (rps) |
| PC tier       | Forward+, depth texture, MSAA 4x, HDR 32-bit, 2048 shadows over 60 m in 2 cascades, soft Medium, additional shadows, Distance Shadowmask (verified on Forward+), GPU Resident Drawer when draw calls bind the CPU                                               | device tests                                                                                               |
| Mobile tier   | Forward, no depth/opaque texture (the Opaque Texture also silently drops MSAA without StoreAndResolve), MSAA 2x, render scale 0.85, 1024 shadows over 30 m, 1 cascade, soft off, no additional shadows, Shadowmask mode, bias 0.1 / 0.5 (template 1 / 1 leaked) | a wide device spread: add a low tier with `copy_from` (Simple Lit, no realtime shadows) [added]            |
| Post per tier | one Grading Mode (HDR) and LUT 32 everywhere; Mobile profile: bloom Kawase or Dual (6.3), no HQ filtering, Half or Quarter, at most 5 iterations, no DoF, no SSAO, Leak Reduction Performance; PC: SSAO Downsample, Leak Reduction Quality                      | art direction                                                                                              |
| GI            | Static geometry lightmapped with a Mixed sun (Shadowmask where a phone tier bakes static sun shadows, else Baked Indirect); APV for dynamic objects; open or changing layouts: APV only                                                                         | Subtractive for low-end stylized (CC [00:41:17]); APV scenarios or sky occlusion for time of day           |
| Probes        | Adaptive Probe Volumes                                                                                                                                                                                                                                          | Light Probe Groups without compute or when probes must move (APV24 [00:08:31])                             |
| AA            | PC MSAA 4x or TAA/STP; mobile MSAA 2x or FXAA                                                                                                                                                                                                                   | TAA/STP never with MSAA, stacking or dynamic resolution; STP not on GLES                                   |

## Workflow

Channel: `ut_run.run_method(P, "AgentKit.Lighting....", args, graphics=True)` for anything that
renders or bakes; `-nographics` only for reports, tiers, volumes and audits (it cannot bake GI:
`Bake` refuses). Plain command (`L.raw_command`):
`Unity -batchmode -nographics -quit -projectPath P -logFile <job>/unity.log -executeMethod <method> -agentJob <job>`,
args in `<job>/args.json`, result on the `AGENT_RESULT` line. Full code and results:
[`references/procedures.md`](references/procedures.md).

1. **Report the pipeline.** `LightingPipeline.ReportPipeline`: asset per level, renderer, features,
   asset profile, GRD prerequisites. GATE: every level has its own asset.
2. **Tiers as data.** `ConfigureTiers` (`asset_props`, `renderer_props`, `quality_props`,
   `renderer_features`, `volume_profile` + `volume_overrides`, project `graphics` for BRG variants
   and static batching), then ReportPipeline in a new process and `L.tier_check`. GATE: 0
   mismatches, 0 errors (grading mismatch, GRD chain, APV masks without Use Rendering Layers).
3. **Bookmarks and cards.** `AgentView_*` cameras, gray cards (sun, shade, one per zone), a chrome
   ball indoors; `CaptureStage`. GATE: `L.stage_review` 0 errors; sheet opened.
4. **Exposure, then lights.** Lookdev volume (Neutral, fixed Post Exposure); sun `I * 2^-EV(card)`;
   other lights by ratio; zone exposure volumes at priority 1. GATE: sunlit card within half a stop;
   sun-to-shade at most 4 stops [added].
5. **Bake.** `LightingAudit.AuditLighting` first (contributors, lightmap UVs, shaders that cannot
   show or feed the bake, Shadowmask overlap, `style: "stylized"` rules), then `LightingBake.Bake`
   preview, then final. Verify the Lighting Mode each tier really renders with the shadowmask range
   scene (P13). GATE: bake report within budget, no UV warnings, audit 0 errors.
6. **Reflections and leaks.** Box probes per zone (importance 2, blend 0.25 m). Leak ladder: wall
   thickness near probe spacing, APV Options biases (0.1 / 0.175), Rendering Layer masks
   (`apv_layers`, max 4, rebake), Probe Adjustment Volume last (APV24 [00:18:13] to [00:23:13]).
   GATE: mid-smooth surfaces not sky-blue indoors (blue-minus-red at or below 0).
7. **Grade.** Final look in the scene volume, cost fields in the tier profiles, exposure re-solved.
   GATE: saturation and contrast above the baked stage, clipped at most 5%, cards in band.
8. **Measure.** `AgentProfile` + `ut_stat.budget_check`; `PassAudit` per tier; PC vs Mobile
   captures; a development player for tier-only oddities (P12) and the PSO trace and progressive
   warm-up (P15). GATE: budget as a trend, device verdict after a thermal soak with a vendor GPU
   capture (scenario-unity-mobile); Mobile within 0.35 EV and 15% saturation of PC [added].

## Numbers

| Value                                                                   | Relative to                                                           | Source         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------- |
| EV100 14 sun, 10 overcast, 8 sunset, 6 bright interior, 1 dark interior | real-world anchors; URP has no EV, use ratios                         | PYD [00:17:37] |
| 51 vs 102 texels/m                                                      | 2048 over 40 m vs 1024 over 10 m                                      | 6.3 Manual     |
| spot 1, point 6, max 16 maps                                            | additional-light shadow atlas                                         | 6.3 Manual     |
| 256 samples; 4 lights per texel                                         | denoiser floor; shadowmask channels                                   | 6.3 Manual     |
| 0.2 background, 1 play area                                             | Scale In Lightmap                                                     | CC [00:17:30]  |
| 0.20 vs 0.67 to 0.83 ms; 42.7 vs 14.5 MB                                | lightmaps vs APV sampling (PS4 1080p); memory                         | APV24          |
| 1,723 / 9 / 0 / 0 px                                                    | sun leak on Mobile: template bias, 0.1 / 0.5, Shadowmask, Subtractive | observed       |
| 1.33 vs 0.67 MB                                                         | interior lightmap set, Shadowmask vs Subtractive (512 x 512)          | observed       |
| about 2,450 to 22 to 38 draw calls; main thread / 3                     | 900 cubes, GRD off vs on, Editor Play mode                            | observed       |
| 6 / 8 / 7 native passes                                                 | Mobile: depth off / copy After Opaques / After Transparents           | observed       |
| 14 PSOs, warmed in 5 frames                                             | outdoor scene, Metal development player, 3 per frame                  | observed       |
| 1 to 2 ms per full-screen pass                                          | Quest 2-class tiler                                                   | RK [00:14:30]  |

## Quality gates

- **Measurable:** fresh-process tier readback 0 mismatches; ReportPipeline and AuditLighting 0
  errors; bake within budget; cards in band under the final tonemapper; clipped at most 5%, crushed
  at most 30%; chrome ball not sky-blue indoors; far shadows present where the tier promises them
  (P13); opaque, skybox and transparent in one native pass on phones; `budget_check` as a trend.
- **Visual:** the stage sheet after every stage; crisp shadows without acne or seams; no leaks at
  joints; no sky tint; the emotion sentence describes the frame; Mobile reads as the same image
  ([`references/critique.md`](references/critique.md)).

## Common mistakes

| Mistake                                           | What it looks like                                         | Fix                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Lights by feel, exposure to rescue them           | card +0.9 EV, interiors never balance                      | gray card, fixed exposure, solve lights                                                            |
| Resolution raised instead of distance lowered     | 4096 still soft near the camera                            | Max Distance to the last visible dynamic shadow                                                    |
| CPU lightmapper or `-nographics` bake on this Mac | refused, or nothing baked                                  | GPU lightmapper, `graphics=True`; there is no CPU fallback on Apple Silicon                        |
| Small props with Contribute GI off                | no baked contact shadow; realtime shadows under Shadowmask | Contribute GI on, Receive GI = Light Probes                                                        |
| More than 4 shadowed Mixed lights on one surface  | extra lights frozen as fully baked                         | `light.shadowmask_overlap`; make extras Baked or Realtime                                          |
| Toon or custom shader on lightmapped geometry     | baked light and shadows gone                               | `light.shader_no_lightmap` / `no_shadowmask` / `no_meta`; scenario-unity-shaders adds the variants |
| Per-tier bloom set in the scene volume            | Mobile keeps PC bloom cost                                 | cost fields only on tier profiles                                                                  |
| One tier LDR, one HDR                             | tiers drift apart after grading                            | one Grading Mode (HDR), one LUT size                                                               |
| APV masks without Use Rendering Layers            | masks ignored on that tier                                 | `m_SupportsLightLayers` on every asset                                                             |
| No local reflection probe indoors                 | chrome and wood reflect sky                                | box probe per zone, importance 2                                                                   |
| Depth Priming on with custom shaders              | objects vanish once MSAA is off                            | DepthOnly and DepthNormals passes, or priming Disabled                                             |
| Template Mobile bias 1 / 1 on thin walls          | sawtooth sun along the wall-ceiling joint                  | bias 0.1 / 0.5; bake the sun (Shadowmask or Subtractive)                                           |
| GRD on without its chain                          | nothing batches                                            | BRG Variants Keep All, SRP Batcher, Forward+, static batching off                                  |

## Handoffs

- **Receives:** blockouts from scenario-unity-world-building (static flags, lightmap UVs checked
  here); shaders from scenario-unity-shaders (DepthOnly, DepthNormals, Meta passes; LIGHTMAP_ON and
  SHADOWS_SHADOWMASK variants when lightmapped); budgets from scenario-unity-performance and
  scenario-unity-mobile.
- **Delivers:** tiers (JSON spec + readback), tier profiles, bakes with their report, stage sheets,
  pass audits. To scenario-unity-shaders: the stylized shading brief (palette, shared shader, ramp
  on the URP Unlit target that samples lightmaps, shadowmask and APV; Simple Lit variants for the
  low tier) and Render Graph passes. To scenario-unity-performance: GRD bench CSVs and GPU
  questions. To scenario-unity-mobile: the Mobile tier, PSO traces per graphics API, the thermal
  soak and vendor GPU captures (Xcode, Android GPU Inspector, Arm Performance Studio, Snapdragon
  Profiler). To scenario-unity-pipeline-automation: raw command lines for CI. 2D Renderer lights:
  scenario-unity-2d.

## Unity 6.3 notes

- Render Graph only; `_CLUSTER_LIGHT_LOOP` replaces `_FORWARD_PLUS`. The Render Graph Viewer can
  attach to a device player; `PassAudit` reads internals by reflection (`available: false` if they
  move).
- URP exposure Fixed only, no physical light units, SSR or volumetrics; HDRP in maintenance;
  Built-in deprecated in 6.5.
- The feature table says Distance Shadowmask is "Forward rendering path only" (it says the same of
  MSAA); on 6000.3.21f1 it rendered on Forward+ exactly as on Forward (P13).
- GPU lightmapper only on Apple Silicon; CPU lightmapper deprecated in 6.6; OptiX deprecated in 6.5.
- Bloom `filter`: Gaussian, Dual, Kawase (new in 6.3). `GraphicsStateCollection` is experimental.
  `APVLeakReductionMode.ValidityBased` is an obsolete alias that `ToString()` prints for
  Performance.
- Dynamic batching deprecated in 6.5. STP forces TAA, needs compute, never GLES.

## References

- `references/procedures.md`: procedures P1 to P16 as copyable code, each with its live test and
  result.
- `references/critique.md`: the rubric for captures, cards, bakes, reflections, grade, tiers,
  bandwidth.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, the stylized
  recipe, disagreements, observations.
- [`references/gui-paths.md`](references/gui-paths.md): windows and menus for the same procedures.
- [`references/sources.md`](references/sources.md): sources, credentials, timestamps, baseline gaps,
  revision history.
- [`scripts/ut_lighting.py`](scripts/ut_lighting.py),
  [`scripts/AgentKit/Lighting/*.cs`](scripts/AgentKit/Lighting/),
  [`scripts/Runtime/*.cs`](scripts/Runtime/) (player helpers: verification builds only).
