# Expert notes: shading judgment by source

Principles with their source and timestamp (`[hh:mm:ss]` in the video), grouped by expert. Notes
live in `notes/shaders/`; digests `_digest_docs_shaders.md`, `_digest_videos_shaders.md`,
`_digest_visual_shaders.md`. "Observed" = run in Unity 6000.3.21f1 on this Mac on 2026-09-24
(`references/procedures.md`). My own additions are marked [added]. When sources disagree, the
deciding condition is given.

## 0. Observed here (strongest evidence, shapes the stance)

- The Manual's DepthNormals example (`return float4(normalWS * 0.5 + 0.5, 1)`) disagrees with URP
  17.3: URP's `DepthNormalsPass.hlsl` writes the raw normal into a signed target and
  `SampleSceneNormals` does not decode. In a normals view the Manual-style sphere reads (222,
  251, 207) where the correct one reads (177, 246, 135). SSAO and normal outlines inherit the error.
- `LIGHT_LOOP_BEGIN` skips extra directional lights under Forward+ (installed `RealtimeLights.hlsl`:
  `lightIndex += URP_FP_DIRECTIONAL_LIGHTS_COUNT`). A toon shader without the directional pre-loop
  lost a second directional light under Forward+ and kept it under Forward. Unity's own Shader Graph
  17.3 Custom Lighting sample (Toon) has the same gap; repointing its String-mode node to a
  File-mode `.hlsl` with the pre-loop fixed it, no graph editor involved.
- Depth Priming Forced hides an opaque shader without a DepthOnly pass (confirms the 6.3 Manual);
  the same scene keeps every shader built on `AgentPasses.hlsl`.
- Depth Texture off on the URP asset changed nothing while SSAO still requested depth; with SSAO off
  too, the water turned to solid foam (every probe 209). A hidden dependency like the one
  VGEz8oKyMpY suspects for normals.
- Variants: `AgentKit/Lit` has a 7,688-variant full space; Unity's funnel for a macOS AssetBundle
  build: 4,046 per stage, 62 after settings filtering, 13 after built-in stripping, 13 shipped. A
  `shader_feature` keyword ships variants only when a material in the build enables it (0 then 6
  `_NORMALMAP` variants).
- Cost: per 1080p full-screen draw on an Apple M5 Max, 64 multiply-adds cost 0.007 to 0.029 ms, 64
  `sin` 0.29 to 0.34 ms, 64 float4 `sin` 0.89 to 1.19 ms (4 runs; the v0.2 full run: 0.033 / 0.42 /
  1.40 ms, same ranking). Timing needs interleaving, warm-up and synchronous shader compilation
  (`ShaderUtil.allowAsyncCompilation = false`), or the editor's placeholder shader gets timed.
- An HDR emissive edge at (4, 1.1, 0.15) washed to cream under the template's Neutral tonemapping;
  (1.2, 0.35, 0.03) kept its orange (four-value sweep).
- `Renderer.SetShaderUserValue` does not exist; `MeshRenderer` and `SkinnedMeshRenderer` have it
  (6.3). One material, three renderers, three dissolve amounts rendered correctly.
- v0.2 (after the Y4 blind grade), all run here:
  - PSO warm-up in a development macOS player (Metal): one traced `OSXPlayer_Metal.graphicsstate`
    (23 variants, 26 to 27 graphics states, 4 AgentKit shaders plus URP post) took gameplay
    first-use uploads from 14 (twice, cold) to 0, by `Shader.CreateGPUProgram` marker counts and by
    the player log; warm-up 1.8 to 2.4 ms in one frame. `CreateGraphicsGraphicsPipelineImpl` (the
    Manual's PSO marker) does not exist on Metal; Metal names its PSO work
    `CreateGraphicsPipelineAsync` and `GpuProgramMetal.CreateCachedPipelineAsync`. The 6.3 Log
    Shader Compilation line is
    `Uploaded shader variant to the GPU driver: <shader> (instance ..), pass, stage, keywords, time`,
    not the blog's `Compiled Shader:`.
  - Shader Build Settings (scripted through `EditorGraphicsSettings.SetShaderBuildSettings`):
    excluding AgentLit's soft shadow set 13 to 11 shipped variants; a Type Override to
    `shader_feature` on the same GLOBAL runtime keywords strips them (soft shadows turn hard); a
    Type Override to `dynamic_branch` is honored only for a keyword the code tests with `if()` (10
    to 6 on a probe shader) and silently ignored for one tested with `#if` (URP 17.3's soft shadow
    and SSAO code), and `if()`-tested keywords need a declaration without a stage suffix or the
    other stage fails to compile.
  - Post-processing variants follow every VolumeProfile ASSET under Assets/ (installed
    `ShaderBuildPreprocessor`: `FindAssets("t:VolumeProfile")`, `Has<T>()`), not the scenes: an
    unused Bloom HQ + dirt profile in no scene took UberPost from 433 to 577 variants, moving it out
    restored 433. The Default Volume Profile holds all 19 overrides (URP re-adds them before each
    build), so film grain, distortion and chromatic aberration variants (216 each) ship although no
    scene uses them.
  - Shader Graph Alpha Clipping without Allow Material Override puts `#define _ALPHATEST_ON 1` in
    all 8 generated passes and no `_ALPHATEST_ON` keyword exists; with the override every pass
    declares the keyword (installed `UniversalTarget.cs`, read in the generated code).
  - Water: the shore mask calms the detail normals: normal-strength A/B changes 0.7 (mean |RGB|) at
    the shore vs 15.5 in deep water.
  - Precision: desktop PlatformDefault defines `half` as `float` (engine doc), measured half/float
    0.92 to 1.00 over three runs (noise); Unified 0.77 to 0.89 on the M5 Max.
- SRP Batcher compatibility reads "Not initialized" until the shader has rendered once with the
  pipeline. With `-nographics`, the active subshader is the FallBack's. Unity reports the
  ShadowCaster LightMode tag as `SHADOWCASTER`. The 6.3 build log prints variant counts with the OS
  thousands separator (`2.560`).

## 1. Unity 6.3 Manual and package docs (Unity Technologies)

Writing custom shaders in URP (note `doc-urp-custom-shaders`):

- ShaderLab plus `HLSLPROGRAM`; never mix SRP and Built-in includes (HLSLPROGRAM block note).
- SRP Batcher: every material property in one `UnityPerMaterial` CBUFFER, engine built-ins in
  `UnityPerDraw` (SRP Batcher page).
- An opaque shader needs DepthOnly (Depth Priming) and DepthNormals (SSAO); every pass must produce
  the same fragments (Depth-only page, "Important").
- Screen UV = `positionHCS.xy / _ScaledScreenParams.xy` (dynamic resolution); depth code branches on
  `UNITY_REVERSED_Z`; sky mask at `0.0001` or `0.9999` (Reconstruct world position).
- Forward+ and Deferred+ ignore `_ADDITIONAL_LIGHTS`: declare `_CLUSTER_LIGHT_LOOP` and use
  `LIGHT_LOOP_BEGIN` with `InputData inputData` in scope (Keywords and macros reference). Nuance
  from the installed code: `Core.hlsl` defines `_ADDITIONAL_LIGHTS 1` whenever `_CLUSTER_LIGHT_LOOP`
  is on, so `#ifdef _ADDITIONAL_LIGHTS` blocks still run (videos digest).
- `_Color` and `_MainTex` are treated as main color and texture even without attributes.

Render graph, renderer features, Full Screen Pass (note `doc-urp-render-graph`):

- `RecordRenderGraph` declares resources and never records commands; render functions static;
  `AddRenderPasses` runs per camera per frame and must not allocate; `Create()` reruns on every
  Inspector change (Write a render pass; Inject a render pass).
- Blit once and set `resourceData.cameraColor = destination` (Blit, "Avoid blitting back"); fewer
  passes is the optimization; `AddUnsafePass` forfeits merging; framebuffer fetch
  (`SetInputAttachment`, `LOAD_FRAMEBUFFER_X_INPUT`) keeps TBDR passes merged (Optimize).
- A pass nobody reads is culled; `AllowPassCulling(false)` is for debugging only.
- Full Screen Pass: zero code, three injection points, Requirements declare camera textures.
  Correction from the installed `FullScreenPassRendererFeature.cs` (visual digest): Fetch Color
  Buffer (default on) binds `_BlitTexture`; Requirements Color only declares a read of the opaque
  texture; keep Pass index 0 (the Fullscreen graph's DrawProcedural pass).

Shader variants and PSO warm-up (note `doc-shader-variants`, Manual part):

- `shader_feature` by default, `multi_compile` for runtime toggles; sets group exclusive keywords;
  stage suffixes cut combinations but are ignored on GL, GLES and Vulkan.
- `dynamic_branch`: test with `if`, never `#if` (always false); writing every keyword test as `if`
  lets Shader Build Settings convert a keyword between variants and dynamic branching without code
  changes.
- More than 128 keywords per shader slows the project; 4 are reserved. 8 sets of 3 `multi_compile`
  keywords exceed 6,000 variants.
- Unity 6 Shader Build Settings (Graphics settings, overridable per build profile) set a keyword's
  type or exclude it.
- Post-processing variants are kept for Volume overrides found in any scene of the PROJECT (Manual;
  the installed URP 17.3 code is stricter: any VolumeProfile asset under Assets/, section 0);
  disable unused URP features in EVERY URP asset of the build; never ship URP assets with different
  rendering paths (doubles variants per keyword).
- First-use stutter: trace PSOs with `GraphicsStateCollection` in a development build, one
  collection per graphics API and platform ("GPU states can vary per API"), save `.graphicsstate`,
  warm up with `WarmUp` or `WarmUpProgressively` behind a loading screen; confirm no
  `Shader.CreateGPUProgram` or `CreateGraphicsGraphicsPipelineImpl` markers in gameplay (on Metal
  the second marker does not exist: section 0). Proven here: `procedures.md` P18.

Shader Graph 17.3 (note `doc-shadergraph-custom-function`):

- File mode: unique include guard per file, `_float`/`_half` suffix on every function, Name without
  the suffix; inputs then `out` outputs; uniforms declared in the file are globals only
  (`Shader.SetGlobalX`).
- Keyword Reference names get a leading underscore; Enum keywords are enabled as `REFERENCE_SUFFIX`
  with the others disabled by hand; Allow Definition Override emits `if` for Shader Build Settings
  overrides.
- Custom lighting: Unlit graph, Keep Lighting Variants on, Default Decal Blending and Default SSAO
  off; Forward and Forward+ only; multiple lights need a Custom Function loop (no `for` in graphs).
- Dynamic Branch during development for build speed, variants late for runtime speed (Introduction
  to keywords). Deciding condition vs the Manual: target GPU class (old mobile suffers from dynamic
  branches), branch symmetry, project phase.

Compute shaders (note `doc-compute-shaders`):

- Judge on the least capable platform: out-of-bounds access can crash non-DX GPUs; new buffers can
  hold NaN; bind every declared resource.
- Metal: no texture atomics, no `GetDimensions` on buffers (pass sizes as constants). `RWTexture<T>`
  must match the RenderTexture format for GL, GLES and Vulkan. GLES 3.1 guarantees 4 compute
  buffers.
- No `//` comment on a `#pragma kernel` line.

## 2. Cyanilux, "Writing Shader Code in URP v2" (note `doc-cyanilux-urp-shader-code`, URP 10 to 12 era)

- Put the CBUFFER in `HLSLINCLUDE` so every pass shares it; `UsePass` and copying `LitInput.hlsl`
  break the SRP Batcher or redefine the CBUFFER (UnityPerMaterial CBUFFER; ShadowCaster).
- Values that are not per material go through `Shader.SetGlobalX`; `material.SetX` on a property
  outside Properties and the CBUFFER glitches under the SRP Batcher. Arrays are global only, max
  1023 elements, else StructuredBuffer.
- Multi-pass: extra unnamed passes break the batcher; alternatives are a second material (few
  objects), RenderObjects with an override material (many objects, loses properties), or a custom
  LightMode rendered by RenderObjects (keeps properties, code only). Deciding condition: object
  count and whether properties must be kept.
- Precision: float for positions, UVs, trig; half for directions and colors; `fixed` does not exist
  in HLSL.
- Built-in to URP table: `UnityObjectToClipPos` to `TransformObjectToHClip`, `ShadeSH9` to
  `SampleSH`/`SAMPLE_GI`, `UNITY_APPLY_FOG` to `MixFog`, `tex2Dlod` to `SAMPLE_TEXTURE2D_LOD`,
  `SHADOW_ATTENUATION` to `GetMainLight(shadowCoord)`, `GrabPass` to `SampleSceneColor` (transparent
  queue only).
- Outdated for 6.3: `_FORWARD_PLUS`, 256/64 keyword limits, `_MainTex` + `CommandBuffer.Blit` for
  image effects (6.3: `_BlitTexture`, `AddBlitPass`), `ComputeScreenPos`.

## 3. Attilio Carotenuto, Technical Lead at Unity, "Shader Variants Optimization and Troubleshooting Tips" (blog 2024)

- Variants are a build-time, load-time and memory tax: builds hours longer and shader memory above 1
  GB when unmanaged.
- Never strip blind: Strict Shader Variant Matching shows a missing variant as the error shader with
  a console message instead of a silent closest match.
- Read the funnel in `Editor.log` (Full variant space, After settings filtering, After built-in
  stripping, After scriptable stripping), per-API program counts and compressed sizes; track them
  per build and fail on growth.
- Scriptable stripping: `IPreprocessShaders`, iterate backwards, `RemoveAt`; order with
  `callbackOrder`; skip in development builds if debug variants matter. Playthrough-recorded Shader
  Variant Collections are for investigation, not a strip whitelist (they miss device-only paths and
  rot). Deciding condition vs the Manual: preload or warm-up is fine, whitelist stripping is risky.
- Android caches compiled shaders: reinstall before a Log Shader Compilation pass. Deduplication
  saves disk only.

## 4. Daniel Ilett, author of "Building Quality Shaders for Unity" (Apress, 2022)

Your First URP Shader (eMWrMRdP5jY, Unity 6.0):

- Pick the pipeline before writing code: pipeline libraries differ [00:00:00]; the stock Unlit
  template is Built-in [00:00:34] (6.3 ships Create > Shader > URP Unlit Shader).
- Zero-initialize outputs with `(v2f)0` [00:11:04]. Make mistakes on purpose to learn the errors
  [00:14:21].

Lighting and Shadows in Code (bH--RU6qyTw, Unity 6.0):

- "Keyword soup": copy the keywords from URP's own `Lit.shader` [00:13:46] [00:14:51]; declare all
  three main light shadow keywords [00:16:30].
- `NormalizeNormalPerPixel` [00:07:11]; `exp2(glossiness)` for an even slider [00:12:38]; ambient
  from `SampleSH` and a Fresnel rim to sit next to URP Lit [00:17:35] [00:19:14]; bitangent times
  `tangent.w * unity_WorldTransformParams.w` for mirrored meshes [00:24:45].
- ShadowCaster: `_LightDirection`/`_LightPosition` outside the CBUFFER, `ApplyShadowBias` then
  `ApplyShadowClamping` [00:35:06] [00:36:12]; displacement and discard repeated in shadow and depth
  passes [00:37:52]. Corrections from the installed URP 17.3: the shadow mask uses the static
  lightmap UV (TEXCOORD1), and the cluster loop misses extra directional lights (confirmed
  observed).

Shader Graph Custom Functions (F8bAI6dIrto, 2022.3):

- File mode as soon as code grows; `_float` suffix; Name without it; inputs then outputs [00:02:13]
  [00:04:25]; `SHADERGRAPH_PREVIEW` branch [00:03:17]; sanity check that the graph looks unchanged
  after swapping in the node [00:05:32]; loop over existing lights in HLSL, not duplicated sub
  graphs [00:10:29] [00:11:01].

Post Processing and Render Graph (26gbtRTokVo, Unity 6.0):

- Read the Render Graph Viewer first [00:01:06]; render functions static [00:13:18]; never read and
  write one texture in one pass [00:11:03]; temp copies without MSAA or depth [00:16:01];
  `ConfigureInput(Depth)` makes depth exist [00:29:56]; a Volume effect that does nothing means the
  feature is missing from the renderer [00:26:38]; a shader reached through `Shader.Find` needs
  `Resources` or a serialized reference [00:22:11]. Disagreement: he copies then blits back; the
  docs and Unity's sample blit once and repoint `cameraColor`. Deciding condition: teaching clarity
  vs one fewer full-screen pass on bandwidth-bound GPUs.

Fullscreen Outline Post Process (VGEz8oKyMpY, 2022.2):

- Combine normal and color edges; a threshold of 0 makes every pixel an edge (floor 0.01)
  [00:03:44]; color edges get noisy on textured scenes [00:02:09]; Requirements decide which buffers
  exist [00:07:07]; Fullscreen graphs cannot use Volumes [00:07:29]. Deciding condition for edge
  sources: flat-colored scenes favor color edges, textured scenes depth and normals.

## 5. Freya Holmér, creator of Shader Forge (kfM-yu0iQBk, 2021 course)

- Shaders never crash: values are unclamped, NaN spreads silently; output intermediates as colors,
  `frac` reveals overshoot, `saturate` clamps, `smoothstep` adds a cubic you may not want [01:39:44]
  [01:57:25] [02:01:40] [02:04:24].
- Work goes where it runs least often: vertex before fragment unless the mesh is dense and far
  [01:45:54].
- Float everywhere until you must optimize; half on mobile, where it can produce hard-to-debug
  artifacts [01:19:53] [01:20:26]. Deciding condition vs Ilett ("tiny" savings, F8bAI6dIrto
  [00:02:45]) and Cloward (vector width and instruction type, measured, E82XxlXMJs4 [00:16:19]):
  target GPU and whether a device profiler shows ALU-bound. Observed: a desktop A/B cannot answer it
  (PlatformDefault compiles half as float).
- Transparent = `ZWrite Off` AND the Transparent queue; RenderType only tags [02:44:37] [02:45:44];
  `ZTest GEqual` draws only the hidden part (ghost behind walls) [02:51:46]; stacked transparent
  quads near the camera cost fill rate [02:43:31].
- Integer-period waves loop seamlessly: `cos(x * TAU * n)` [02:12:05]; vertex texture fetch needs an
  explicit mip [03:48:58]; aniso and trilinear pay under low cameras, not top-down [03:45:42].
- Corrections [added]: `_Time` is (t/20, t, 2t, 3t); a mip chain adds about one third of memory.

## 6. Ben Cloward, Senior Technical Artist on Unity's Shader Graph team (E82XxlXMJs4)

- Instruction count is "a very inaccurate measure" [00:01:06]; loops count at max trip count
  [00:15:44]; float4 about 4x float [00:11:34] [00:16:19]; sine 16 cycles per component vs multiply
  4 on Radeon [00:10:25]; tanh and atan2 64+ [00:13:50] [00:15:30]; cycle costs are hardware
  specific [00:16:52]. Gate on measured GPU time [00:17:59].

## 7. Joyce (MinionsArt), shader artist, solo developer of Astro Kat (FIP6I1x6lMA)

- Receiving shadows in a stylized graph needs a Custom Function [00:00:26]; File mode past one line
  [00:00:57].
- Half-Lambert into `smoothstep(offset, offset + smoothness)` times `shadowAttenuation`, then a tint
  floor: cast shadows join the band [00:04:34] [00:05:11] [00:09:32]; output the light direction for
  a lit-side rim (Fresnel times N.L, Step 0.5) [00:11:09]; default additive masks to black
  [00:13:54].
- Outdated in 6.3: `SHADOWS_SCREEN` (Built-in keyword), `ComputeScreenPos`, the
  Lit-graph-as-container trick (6.3: Unlit plus Keep Lighting Variants). Smoothness 0 divides by
  zero inside smoothstep [added]: floor it.

## 8. Unity (official), URP Water Shader Graph (gRq-IdShxpU, 2019.3)

- Color and opacity follow depth: one 0..1 mask from scene depth minus surface depth, clamped,
  drives color, alpha and shore normal strength [00:01:15] [00:03:06] [00:06:12] (Normal Strength =
  Lerp(Normal Strength property, depth gradient), step 10 of the note; measured here, section 0).
- Two normal maps in opposite directions at different speeds (Time/50, Time/-25) hide tiling [frame
  00:05:43]; subdivided mesh for waves [00:00:09]; Cast Shadows off, alpha clip threshold 0
  [00:03:56] [00:04:28].
- Corrections [added]: blend normals (RNM or Normal Blend), do not add them; add wave height to Y,
  do not replace it; world XZ UVs keep water tiles continuous; perspective cameras only for eye
  depth.

## 9. Brackeys (Asbjørn Thirslund), Dissolve Shader Graph (taMp1g1pBeE, 2018)

- Dissolve = noise vs threshold with alpha clip, then an emissive band from the same test shifted by
  an edge width, or the band is clipped away [00:02:56] [00:05:31] [00:06:04]; HDR color plus Bloom
  makes the glow [00:07:11]; render both faces [00:08:15].
- [added] Gameplay needs a per-object amount, not Sine Time; object- or world-space noise avoids UV
  seams; edge width is in noise units, so the band's width varies with the gradient (observed: a
  height ramp makes wide bands).

## 10. Unity (official), Render Graph intro and dither feature (U8PygjYAF7A, project by Nik Lever, 6.0)

- Feature = manager, pass = worker [00:06:18]; the pass declares `requiresIntermediateTexture`
  itself [00:08:32]; `GetTextureDesc(source)`, rename, `clearBuffer = false`, `AddBlitPass`, swap
  `cameraColor` [00:09:06] [00:10:42] [00:11:15].
- Guard the back buffer; post effects at After Rendering Post Processing, never After Rendering
  [00:10:10] [00:16:10] (observed: the guard fires). Local volumes need a local profile [00:13:03].
  Viewer legend: green read, red write, blue line merged, globe global [00:01:40]; framebuffer fetch
  keeps TBDR data on chip [00:17:54].
- [inference in the note, adopted] check the Volume in `AddRenderPasses`, not in
  `RecordRenderGraph`, or the intermediate texture stays forced.

## 11. Compute and GPU-driven rendering

Matt Gambell (Game Dev Guide), BrZ4pWwkpto: compute pays at scale because of transfer overhead
[00:06:38]; `enableRandomWrite` before binding [00:04:41]; structs and stride must match [00:08:55];
nothing changes until `GetData` [00:09:35]. [added] ceil-divided dispatch with bounds checks;
`AsyncGPUReadback` per frame.

Sebastian Lague, X-iSQQgOd1A: kernels per domain (per agent, per pixel) [00:11:52] [00:12:24];
spatial fields in textures, diffusion as a blur, four species in RGBA [00:12:57] [00:16:02]; look at
a GPU hash at large size before trusting it [00:11:52]; prototype small (320 x 180, 250 agents) then
scale [00:13:30]. [added] never blur in place: ping-pong.

Garrett Gunnell (Acerola), Y0Ko0kvwfgA: the per-frame CPU to GPU copy is the bottleneck; compute
writes instance data into a GPU buffer the draw reads [00:03:39] [00:04:46]; GPU instances do not
exist for the CPU [00:04:46]; 2.16 M triangles and 4.32 M vertex invocations per frame at about 500
fps [00:06:29]; one instruction scales by millions [00:13:29]; couple parameters physically (tall
grass sways slower, yellows at the tips) [00:09:15] [00:11:16]; billboards fail from above
[00:14:07]. Unity 6.3 names: `Graphics.RenderMeshIndirect`, `GraphicsBuffer.IndirectDrawIndexedArgs`
(installed CoreModule). Geometry shaders do not run on Metal [added].

## 12. Disagreements and their deciding conditions

| Question                           | Positions                                                                                       | Decide by                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Shader Graph or HLSL               | graphs for artists, HLSL for passes and loops (Ilett); Built-in: code, URP: graphs (Freya)      | who edits it; lighting loops or custom passes needed; for an agent, text authorability             |
| Full Screen Pass or custom feature | zero code (Manual, Ilett 2023) vs Volume-driven multi-pass (Ilett 2026, Unity sample)           | Volume blending, several passes, custom textures, depth-only input                                 |
| Blit back or repoint               | copy then blit back (Ilett) vs `cameraColor = destination` (docs, Unity sample)                 | bandwidth-bound target (mobile, TBDR): repoint                                                     |
| Dynamic branch or variants         | development speed (Shader Graph docs) vs runtime speed on old mobile (Manual)                   | target GPU class, branch symmetry, project phase                                                   |
| Luminance weights                  | Rec. 601 (dither sample) vs Rec. 709 (Manual)                                                   | stylized threshold: either; perceptual grayscale on linear color: Rec. 709                         |
| Time in shader or property         | Sine Time (Brackeys), Time (water) vs a Dissolve property, Volume value                         | ambient loop vs gameplay-triggered per-object event                                                |
| Edge source for outlines           | normals plus color (Ilett 2023) vs depth plus normals Roberts (Ilett 2026)                      | flat-colored vs textured scenes                                                                    |
| Shader Variant Collections         | debugging only (Carotenuto) vs preload to avoid closest match (Manual)                          | preload and warm-up fine; strip whitelist risky                                                    |
| Half precision                     | float until you must (Freya), savings tiny (Ilett), vector width and instruction type (Cloward) | mobile target with a profiler showing ALU-bound; never judged on desktop (PlatformDefault = float) |
| Which scenes keep post variants    | any scene of the project (Manual) vs any VolumeProfile asset under Assets/ (installed URP 17.3) | trust the installed code: audit profiles (`PostProcessingAudit`)                                   |

## 13. PSO warm-up (run here, `procedures.md` P18)

1. Development build; a boot component (`AgentPsoProbe`) calls `BeginTrace()` at startup and
   `EndTrace()` + `SaveToFile(path)` after a content tour (`UnityEngine.Experimental.Rendering`,
   signatures checked in 6000.3.21f1).
2. One collection per graphics API and platform, named `<platform>_<api>.graphicsstate`
   (`ut_shaders.pso_collection_name`); retrieve with `adb pull` or `SendToEditor` on devices; after
   shader changes re-trace and check coverage (`PsoJobs.InspectCollection` lists shaders and passes;
   `ContainsVariant` per variant).
3. Loading scene: `LoadFromFile`, refuse a collection traced on another API or platform, `WarmUp` or
   `WarmUpProgressively(n)` per frame until `isWarmedUp`, then activate gameplay.
4. Gate: gameplay frames show 0 `Shader.CreateGPUProgram` samples and 0 logged uploads (both
   measured by the probe and `run_pso_player`); the cold control must show some, or the bench proves
   nothing. scenario-unity-performance owns device captures.
