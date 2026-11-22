# Critique rubric: judge a shader, a renderer feature or a variant plan before calling it done

Score each line 0 (missing), 1 (claimed), 2 (measured), 3 (measured and looked at). A deliverable
ships at 2 or more on every line that applies; any 0 on a "must" line blocks it. Write the score
with its evidence (job id, number, contact sheet path) in the handoff packet.

## A. Correctness (must)

| #   | Check                            | How                                                                                                                 | Pass                                                                               |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A1  | compiles for the target API      | `ShaderJobs.ValidateShaders` with the target `platform`                                                             | 0 import errors, 0 compile errors, every pass                                      |
| A2  | lint clean                       | `ut_shaders.lint_shader_file` / `lint_custom_function` / `lint_compute`                                             | 0 errors; every warning answered                                                   |
| A3  | passes agree                     | opaque: DepthOnly, DepthNormals, ShadowCaster present; displacement and clip shared (`AGENT_CLIP`/`AGENT_DISPLACE`) | a shadow probe follows the clipped or displaced shape (dissolve at 1: shadow gone) |
| A4  | Depth Priming safe               | a `Shots` op `{"urp": {"depth_priming": "Forced"}}`                                                                 | the object still renders                                                           |
| A5  | lights under the project's paths | shots with an extra point light and an extra directional light, Forward and Forward+ (`rendering_mode` op)          | lit side changes in both paths; the `PathProbe` idea proves the switch happened    |
| A6  | shadows cast and received        | probe under the object vs open ground                                                                               | shadow luma below 0.75x open ground                                                |
| A7  | SRP Batcher                      | `Shots` result `srp_batcher`                                                                                        | compatible (read after a render)                                                   |
| A8  | camera textures exist            | URP asset Depth or Opaque Texture on every asset that renders it; test with SSAO OFF                                | effect unchanged with SSAO off                                                     |
| A9  | no magenta, no blank             | `ut_review.image_checks` on every frame                                                                             | `magenta` and `blank` false                                                        |

## B. Look (must for visible work)

| #   | Check                              | Pass                                                                                                                                                                                                                                                  |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | contact sheet of every shot opened | the change is visible, nothing else changed                                                                                                                                                                                                           |
| B2  | toon                               | hard band where intended (transition share well below PBR), cast shadows inside the band, tint floor not black, rim only on the lit side, no leftover PBR shine                                                                                       |
| B3  | water                              | shallow to deep hue shift, calm shore (the depth mask also scales the detail normals: a `_NormalStrength` A/B changes the shore far less than deep water, P7), foam broken by noise, motion between two times, no visible normal-map grid at distance |
| B4  | dissolve                           | thin edge that keeps its hue under the project's tonemapping, no UV seams, inside faces lit, shadow matches the cut                                                                                                                                   |
| B5  | outline                            | silhouettes and creases, nothing on flat faces, width holds at the target resolution                                                                                                                                                                  |
| B6  | full-screen                        | at the intended injection point; off-state identical to the no-feature frame                                                                                                                                                                          |

## C. Cost and variants (must before a build)

| #   | Check                       | How                                                                                                                                                                                                           | Pass                                                                                                                                                                   |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | variant budget              | `VariantJobs.BuildShaderBundle` for the shipping materials, `parse_variant_funnel`, `variant_budget_check`                                                                                                    | under budget, no growth over the last build without a reason                                                                                                           |
| C2  | keyword types               | `multi_compile` only for runtime toggles; no `shader_feature(_local)` toggled from runtime C# or by a Shader Graph Shader Feature keyword; `dynamic_branch` tested with `if`, declared without a stage suffix | `ut_shaders.lint_project_keywords` 0 errors; `lint_shader` 0 errors                                                                                                    |
| C3  | strict matching             | Strict Shader Variant Matching on for test builds                                                                                                                                                             | set and read (`StrippingSettings`); player tour clean (scenario-unity-performance)                                                                                     |
| C4  | GPU cost                    | `GpuCostJobs.MeasureFullscreenCost` A/B, same resolution, interleaved; half vs float only under Unified or on the device                                                                                      | the new version is faster in ms beyond the run-to-run noise (about 10 % here); device numbers from a player                                                            |
| C5  | first-use stutter           | one `.graphicsstate` per graphics API and platform, traced in a development player; warm-up behind a loading screen (P18)                                                                                     | cold control shows first-use uploads, warm run shows 0 `Shader.CreateGPUProgram` samples and 0 logged uploads in gameplay (`pso_gate` clean)                           |
| C6  | Shader Build Settings       | overrides written by `VariantJobs.KeywordOverrides`, counted with a bundle build, cleared or committed on purpose                                                                                             | the count moved as intended; no `dynamic_branch` override on an `#if`-tested keyword (ignored) and no `shader_feature` override on a global runtime keyword (stripped) |
| C7  | post-processing variants    | `VariantJobs.PostProcessingAudit`                                                                                                                                                                             | no stray VolumeProfile under Assets/ (samples, tests, abandoned scenes); kept families match the game's effects                                                        |
| C8  | Shader Graph Graph Settings | `shadergraph_summary` findings; `ShaderGraphJobs.GeneratedCode`                                                                                                                                               | Alpha Clipping only where the object always clips, or Allow Material Override on                                                                                       |

## D. Maintainability and agent fitness

| #   | Check                                                                                                                                                                                                             | Pass     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D1  | one CBUFFER in `HLSLINCLUDE`, properties named `_BaseColor`/`_BaseMap` style, `[HDR]` on emissive colors, thresholds with a floor above 0, additive masks default black                                           | reviewed |
| D2  | graphs: exposed references documented (`ShaderProperties`), logic in a File-mode `.hlsl` with guard and suffixes                                                                                                  | reviewed |
| D3  | renderer features: runtime assembly, serialized material (no `Shader.Find`), gated in `AddRenderPasses`, no allocation per frame, present on every renderer of every quality level that needs it (`ListFeatures`) | reviewed |
| D4  | deterministic captures: time through a property (`_TimeScale` 0, `_TimeOffset`), fixed bookmarks                                                                                                                  | reviewed |
| D5  | report: each step with its engine call, Verified and Assumed lists                                                                                                                                                | present  |

## Red flags that fail a review on sight

- "Looks right in the Scene view" with no capture, or a capture nobody opened.
- An optimization justified by instruction count.
- A `.shader` with `CGPROGRAM`, `UnityCG.cginc`, `_FORWARD_PLUS`, `SHADOWS_SCREEN`,
  `ComputeScreenPos`, or a DepthNormals pass returning `n * 0.5 + 0.5`.
- A custom light loop without the directional pre-loop.
- A renderer feature using `Execute`, `OnCameraSetup`, `cmd.Blit` (pre-Render-Graph API: does not
  run in 6.3).
- Variant counts quoted from the Inspector as if they were the build's.
- A Shader Graph Boolean keyword presented as the way to turn Alpha Clipping off (it cannot:
  `#define _ALPHATEST_ON 1` in every pass).
- "PSO warm-up added" with no cold and warm player runs, or one collection reused across graphics
  APIs.
- `EnableKeyword` on a `shader_feature` keyword in gameplay code (the dissolve "on hit" pattern).
