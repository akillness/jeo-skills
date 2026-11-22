---
name: scenario-unity-shaders
description: "Use when a Unity 6.3 URP task involves shaders: hand-written HLSL, Shader Graph water, toon, dissolve or outline, Custom Function nodes, a renderer feature or full-screen effect on Render Graph, compute shaders, shader variants, keywords, stripping, Shader Build Settings, PSO warm-up, or shader cost; or when a material turns pink or invisible, casts no shadow, ignores extra lights under Forward+, an effect 'does nothing', the game stutters the first time something appears, or builds bloat with variants."
license: MIT
---

# Unity shaders (technical artist, shading)

Expert shading in Unity 6.3 is a shader you can prove: it compiles for the target graphics API,
every pass agrees, its variants are counted after stripping, its first use is shown warm, its cost
is measured in GPU milliseconds, and its look is checked in a capture with numbers. An agent without
a mouse gets there through text: hand-written URP HLSL is the primary route, Shader Graph is used
through existing graphs driven by exposed properties plus agent-owned `.hlsl` behind Custom Function
nodes, and new graph wiring is a GUI step ([`references/gui-paths.md`](references/gui-paths.md)).
Target: 6000.3.21f1, URP 17.3, Shader Graph 17.3, Metal on Apple Silicon. If a sibling skill named
here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user
to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Its toolkit
(`ut_env`, `ut_run`, `ut_review`, AgentKit) is imported, never copied.

**Status (2026-09-24, after the blind-grade refactor):** every procedure ran in Unity 6000.3.21f1
here: `tests/code/unity-shaders/run_all.sh --live` (73 live checks including a development-player
PSO proof, 32 offline checks, all passing; evidence in `archive/tests/unity-shaders/`).

## Stance (the expert delta)

1. **Text first, graphs by template.** Shader Graph has no loops and almost no lighting nodes, so
   lights and loops live in HLSL (Daniel Ilett, F8bAI6dIrto [00:07:13]); its one advantage is
   generated depth and shadow passes (bH--RU6qyTw [00:38:24]), which `AgentPasses.hlsl` gives
   hand-written shaders too. With graphs, duplicate one, set its exposed references, put changing
   logic in a File-mode `.hlsl`. Graph Settings bind every pass: Alpha Clipping without Allow
   Material Override writes `#define _ALPHATEST_ON 1` into all 8 generated passes, and no Boolean
   keyword removes it (installed `UniversalTarget.cs`, observed).
2. **Every pass must agree.** Displacement and `clip()` run in ShadowCaster, DepthOnly and
   DepthNormals too (6.3 Manual; Ilett [00:37:52]). A missing DepthOnly pass makes an opaque shader
   invisible with Depth Priming (observed). DepthNormals writes the raw world normal: the Manual's
   `normal * 0.5 + 0.5` example reads back wrong in SSAO and outlines (observed).
3. **Read the installed pipeline, not the tutorial.** Copy keywords from the installed `Lit.shader`
   (Ilett [00:14:51]; `ut_shaders.urp_lit_keywords()`): 6.3 has `_CLUSTER_LIGHT_LOOP` and four soft
   shadow variants. `LIGHT_LOOP_BEGIN` skips directional lights, so a custom loop needs a
   directional pre-loop under Forward+; Unity's own Custom Lighting sample lacks it (observed).
4. **Variants are a budget counted after stripping.** `shader_feature` for material toggles,
   `multi_compile` only for runtime C# toggles, `dynamic_branch` tested with `if`, never `#if` (6.3
   Manual). Strict Shader Variant Matching before stripping, then the funnel in the build log
   (Carotenuto, Unity blog 2024). A `shader_feature` (or `_local`) variant ships only if a material
   in the build enables it (observed 0 vs 6): never toggle one from runtime C#. Unity 6 Shader Build
   Settings exclude or retype keywords with zero code, but a `dynamic_branch` override is silently
   ignored for `#if`-tested keywords, URP's soft shadow and SSAO sets included (observed).
5. **First use is proven warm.** Trace one `GraphicsStateCollection` per graphics API and platform
   in a development player, warm it behind the loading screen, and show gameplay frames with zero
   `Shader.CreateGPUProgram` samples and zero logged uploads (6.3 Manual; observed 14 to 0 on
   Metal).
6. **Cost is GPU time, not instruction count.** Loops count at max trip, float4 costs about 4x
   float, transcendentals cost many cycles (Ben Cloward, E82XxlXMJs4 [00:15:44]). Measured here: 64
   `sin` on a float4 about 3x a float, 10x or more a multiply-add loop. Half pays only where a
   device profiler shows ALU-bound (Freya Holmér, kfM-yu0iQBk [01:20:26]): desktop PlatformDefault
   compiles `half` as `float`.
7. **Render Graph shape.** `RecordRenderGraph` declares, never records; blit once into a new texture
   then `resourceData.cameraColor = destination`; gate in `AddRenderPasses`; refuse the back buffer
   (6.3 docs; Unity dither sample, U8PygjYAF7A [00:09:06] [00:10:10]).
8. **One scalar field, one threshold, two colors; look and measure.** Toon, water, dissolve, outline
   and dither threshold a 0..1 value (visual digest); the water's depth mask also calms its shore
   normals (gRq-IdShxpU [00:06:12]). Offset an emissive edge from the clip test (Brackeys,
   taMp1g1pBeE [00:05:31]). Output intermediates as colors (Freya [01:57:25]), then assert pixels at
   projected probes.

## Establish first

- **Platforms and graphics APIs**: Metal, Vulkan, DX12, GLES 3.x, WebGL 2 or WebGPU. Compute runs on
  Metal, Vulkan, DX11/12 and GLES 3.1+ (4 buffers guaranteed on GLES 3.1), not on GLES 3.0 or WebGL
  2; the Web gets it through WebGPU (experimental in 6.3). The GPU Resident Drawer and STP exclude
  GLES entirely.
- **Rendering path per renderer** (Forward, Forward+, Deferred+): decides the light-loop code;
  Shader Graph custom lighting works in Forward and Forward+ only.
- **URP assets per quality level**: Depth and Opaque Texture, soft shadows, SSAO. The template's
  `Mobile_RPAsset` has Depth Texture off: depth-faded water needs it on or a baked shore mask.
- **Style and authors**: toon or PBR; artists editing graphs (keep a graph, agent owns the `.hlsl`)
  or code only.
- **Per-object values**: material instance, `MeshRenderer`/`SkinnedMeshRenderer.SetShaderUserValue`
  (6.3, SRP Batcher friendly), or `MaterialPropertyBlock` (breaks the SRP Batcher).
- **Budgets**: GPU ms for the effect, variants per shader, overdraw, first-use hitches. Defaults
  when silent: URP 17.3 Forward+, PC and mobile tiers from the template, HLSL, shaders under
  `Assets/AgentShaders/`.

## Workflow

1. **Install and inventory.** `ut_shaders.install(P)`; `RendererFeatureJobs.ListFeatures` (every
   quality level, asset, renderer, feature); `lint_shader_file`, `shadergraph_summary` (targets,
   properties, Graph Settings findings), `lint_project_keywords`. GATE: pipeline facts in the plan;
   lint errors listed.
2. **Author.** Start from [`scripts/Shaders/`](scripts/Shaders/): `AgentLit`, `AgentToon`,
   `AgentWater`, `AgentDissolve`, `AgentEdgeOutline`, `AgentGrayscale`, `AgentCompute`, shared
   `AgentPasses.hlsl` (`AGENT_CLIP`/`AGENT_DISPLACE`) and `AgentNoise.hlsl`. Graph route:
   `ShaderGraphJobs.ImportPackageSample`, `DuplicateGraph`, `shadergraph_set_target_settings`,
   `GeneratedCode`, `AgentCustomLighting.hlsl`. GATE: lint zero errors.
3. **Compile for the target.** `ShaderJobs.ValidateShaders` (`ShaderUtil.GetShaderMessages` plus
   `CompileVariant` per pass for Metal). GATE: zero errors, the four opaque passes present.
4. **Bench and look.** `SetupMaterials`, `ShaderLab.BuildScene`, `ShaderLab.Shots` (many shots per
   boot: material, renderer, feature and URP changes; probes projected to pixels). GATE: `ut_review`
   flags clean, contact sheet opened, probe numbers (shadow darker than open ground, dissolve shadow
   gone at 1, extra lights change the lit side).
5. **Full-screen effects.** `RendererFeatureJobs.AddFeature` with `AgentFullscreenFeature` or the
   zero-code `FullScreenPassRendererFeature`. GATE: on/off captures differ as intended; no
   back-buffer error.
6. **Variants.** `VariantJobs.StrippingSettings` (strict matching on), `BuildShaderBundle` for the
   shipping materials, `parse_variant_funnel`, `variant_budget_check`, strip rules or
   `KeywordOverrides` (Shader Build Settings), `PostProcessingAudit` (every VolumeProfile under
   Assets/ keeps its post variants). GATE: shipped count per shader under budget; logger total
   equals Unity's "After scriptable stripping"; overrides cleared or committed on purpose.
7. **First-use stutter.** `PsoJobs.BuildPsoScene`, `ut_run.build(development=True)`,
   `ut_shaders.run_pso_player` trace, cold, warm; `PsoJobs.InspectCollection`; ship
   `StreamingAssets/PSO/<platform>_<api>.graphicsstate` read by `AgentPsoProbe`. GATE: `pso_gate`
   clean (cold shows uploads, warm shows none by marker and by log).
8. **Cost.** `GpuCostJobs.MeasureFullscreenCost` A/B, interleaved, async compilation off
   (`precision_model` for half tests). GATE: faster in ms beyond noise; device numbers from a
   development player (scenario-unity-performance).
9. **Deliver.** Shaders, materials, feature assets, `.graphicsstate` per API, and the evidence
   packet (Handoffs).

## Numbers

| Value                                                      | Relative to                                                                                                  | Source              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- |
| 7,688 full; 4,046 per stage; 62 after settings; 13 shipped | `AgentKit/Lit` in a macOS AssetBundle build with the template's URP assets                                   | observed            |
| 13 to 11                                                   | AgentLit shipped variants after excluding the soft shadow set in Shader Build Settings                       | observed            |
| 433 to 577                                                 | UberPost variants when one unused Bloom HQ + dirt profile sits under Assets/                                 | observed            |
| 14 to 0; 1.8 to 2.4 ms                                     | first-use GPU program uploads in gameplay, cold vs warm; warm-up of 26 to 27 PSOs in one frame, macOS player | observed            |
| 0.007 to 0.033 / 0.29 to 0.42 / 0.89 to 1.66 ms            | one 1080p full-screen draw: 64 multiply-adds / 64 `sin` / 64 float4 `sin`, M5 Max; compare within one run    | observed            |
| 0.92 to 1.00 / 0.77 to 0.89                                | half4 over float4 `sin` time, PlatformDefault / Unified precision model, M5 Max (noise about 10 %)           | observed            |
| more than 128 keywords, 4 reserved                         | per shader: compile slows                                                                                    | 6.3 Manual          |
| 2000 / 2450 / 3000                                         | Geometry / AlphaTest / Transparent queues                                                                    | Cyanilux            |
| 64x1x1, 8x8x1                                              | compute thread groups; ceil-divided dispatch plus bounds check                                               | 6.3 Manual, [added] |
| (1.2, 0.35, 0.03) vs (4, 1.1, 0.15)                        | HDR dissolve edge that stays orange vs washes to cream under Neutral tonemapping                             | observed            |
| 0.2126, 0.7152, 0.0722                                     | Rec. 709 luminance on linear color                                                                           | 6.3 Manual          |

## Quality gates

- **Measurable:** lint and `lint_project_keywords` zero errors; `ValidateShaders` zero errors for
  the target API; SRP Batcher compatible (read after a render); probes (shadow luma under 0.75x open
  ground; dissolve shadow restored at 1; extra lights change the lit side in Forward and Forward+;
  water normals calmer at the shore than deep); feature on/off difference; shipped variants under
  budget and stable; no stray VolumeProfile; `pso_gate` clean per API; GPU ms A/B; compute GPU
  equals CPU (max error below 1e-5).
- **Visual:** contact sheet opened; toon bands sharp; water hue shift, calm shore, foam, motion;
  dissolve edge keeps its hue; outline on silhouettes only; no magenta.

## Common mistakes

| Mistake                                                                         | What it looks like                                                | Fix                                                                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| no DepthOnly pass                                                               | object vanishes with Depth Priming Forced                         | `AgentDepthOnlyVertex/Fragment`                                                              |
| clip only in the forward pass                                                   | dissolved object still casts a full shadow                        | `AGENT_CLIP` shared by all passes                                                            |
| DepthNormals returns `n * 0.5 + 0.5`                                            | wrong SSAO and outlines                                           | return the raw normal                                                                        |
| `LIGHT_LOOP_BEGIN` without a directional pre-loop                               | a second directional light lights nothing under Forward+          | loop `URP_FP_DIRECTIONAL_LIGHTS_COUNT` first                                                 |
| `_FORWARD_PLUS`, `SHADOWS_SCREEN`, `ComputeScreenPos` (deprecated since URP 11) | compile warning, dead shadow branch                               | `_CLUSTER_LIGHT_LOOP`, `GetMainLight(shadowCoord)`, `GetNormalizedScreenSpaceUV(positionCS)` |
| `shader_feature_local` toggled from runtime C# (dissolve "on hit")              | variant missing in the player: pink or closest match              | material swap, or `multi_compile_local`; `lint_project_keywords`                             |
| a Boolean keyword to skip Shader Graph Alpha Clipping                           | whole object alpha-tested in every pass, all the time             | Allow Material Override (`_ALPHATEST_ON` keyword) or a second opaque material                |
| `dynamic_branch` Type Override on an `#if`-tested keyword                       | variant count unchanged                                           | test with `if()`, declare without a stage suffix                                             |
| `if (KW)` on a `_fragment`-suffixed keyword                                     | "a known keyword but not declared in this pass"                   | declare it for all stages                                                                    |
| stray VolumeProfile assets (samples, tests)                                     | post variants for effects no scene uses                           | move them out of Assets/; `PostProcessingAudit`                                              |
| one PSO collection for every API, or none proven                                | first-use hitches on device                                       | per-API trace, cold vs warm runs                                                             |
| Depth Texture off on the URP asset                                              | water turns to solid foam; hidden while SSAO still requests depth | enable on every URP asset that renders it; test with SSAO off                                |
| feature missing from one renderer                                               | "the effect does nothing" on one quality level                    | `ListFeatures` across quality levels                                                         |
| After Rendering injection                                                       | nothing drawn, back-buffer error                                  | After Rendering Post Processing                                                              |
| HDR edge color 4 and up                                                         | emissive edge washes to cream                                     | 1 to 1.5, Bloom carries the glow                                                             |
| judging cost by instruction count, or half on desktop                           | "optimized" shader no faster                                      | `MeasureFullscreenCost`; half on the device                                                  |
| properties outside `UnityPerMaterial`                                           | SRP Batcher off, values bleed                                     | one CBUFFER in `HLSLINCLUDE`                                                                 |

## Handoffs

- **Receives** from scenario-unity-rendering-lighting: URP assets per quality level, rendering path,
  Depth/Opaque Texture, post stack, tonemapping, the Default Volume Profile. From
  scenario-unity-vfx: particle shader needs (blend mode, soft particles, flipbooks);
  scenario-unity-vfx owns VFX Graph, the Particle System and effect budgets. From
  scenario-unity-world-building: water and terrain surfaces. From scenario-unity-architecture:
  gameplay code that drives materials.
- **Delivers** to scenario-unity-vfx and scenario-unity-world-building: shaders, materials with
  documented references, feature assets. To scenario-unity-performance: GPU ms tables, variant
  funnels, `.graphicsstate` files with the cold/warm proof for device captures. To
  scenario-unity-pipeline-automation: the variant budget and PSO gates for CI. To
  scenario-unity-mobile and scenario-unity-web: API limits (compute from GLES 3.1, none on GLES 3.0
  or WebGL 2), half precision to profile on device, mobile Depth Texture cost, alpha-test cost on
  tile GPUs.
- **Packet:** paths, `ValidateShaders` JSON, contact sheet, probes, funnel, PSO runs, cost table,
  Verified and Assumed.

## Unity 6.3 notes

- Render Graph only: Compatibility Mode removed (`URP_COMPATIBILITY_MODE` only to port, gone in
  6.4); `AddBlitPass` returns a builder (`returnBuilder: true`); After Rendering always follows the
  final blit (6.2+).
- `_CLUSTER_LIGHT_LOOP` replaced `_FORWARD_PLUS` (6.1); soft shadows have `_LOW/_MEDIUM/_HIGH`
  variants; fog is declared `dynamic_branch` in URP's `Fog.hlsl`.
- Shader Build Settings: `EditorGraphicsSettings.Get/SetShaderBuildSettings` (the active set; a
  build profile can override). `GraphicsStateCollection` is experimental; tracing needs a
  development player; on Metal `CreateGraphicsGraphicsPipelineImpl` does not exist. Log Shader
  Compilation prints `Uploaded shader variant to the GPU driver: ...`.
- URP re-adds every override to the Default Volume Profile before a build, so most post-processing
  variant families always ship.
- `SetShaderUserValue(uint)` exists on `MeshRenderer` and `SkinnedMeshRenderer`, not `Renderer`; the
  shader reads `unity_RendererUserValue`.
- Shader Graph 17.3: templates, custom lighting via Unlit plus Keep Lighting Variants; reflected
  HLSL nodes need 17.5, Preprocessor Directives arrive in 6.6. WebGPU is supported from 6.6;
  Built-in RP is deprecated from 6.5.

## References

- [`references/procedures.md`](references/procedures.md): P1 to P19, copyable code with live test
  and result.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, observed
  findings, disagreements.
- [`references/critique.md`](references/critique.md): the rubric before calling work done.
- `references/gui-paths.md`: the same procedures in the GUI.
- [`references/sources.md`](references/sources.md): sources, credentials, timestamps, revision
  history.
- [`scripts/ut_shaders.py`](scripts/ut_shaders.py): install, lints, variant and PSO helpers, Shader
  Graph reader and editor, pixel probes.
- [`scripts/AgentKit/Shaders/`](scripts/AgentKit/Shaders/): `ShaderJobs`, `ShaderLab`,
  `RendererFeatureJobs`, `VariantJobs`, `PsoJobs`, `ComputeJobs`, `GpuCostJobs`, `ShaderGraphJobs`.
- [`scripts/Runtime/`](scripts/Runtime/): `AgentFullscreenFeature.cs`, `AgentPsoProbe.cs` (runtime
  assembly); `scripts/Shaders/` (templates).
