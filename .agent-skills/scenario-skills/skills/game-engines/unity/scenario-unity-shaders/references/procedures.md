# scenario-unity-shaders procedures (copyable, each with its live test and result)

All ran in Unity 6000.3.21f1 (URP 17.3, Shader Graph 17.3) on macOS 26.5.1, Apple M5 Max, Metal, on
2026-09-24, project `tests/projects/unity-shaders` (APFS clone of `Base3D_URP`, path with spaces).
Tests: `tests/code/unity-shaders/` (`test_live_shaders.py` stages, `test_live_variants.py` sections,
`test_live_pso.py`, `test_offline.py`, `run_all.sh --live`). v0.1 had 55 live checks; the v0.2
refactor (after the Y4 blind grade) added P15 to P19 and live checks in P7 and P13 (73 live checks
in total, all passing). Results: `archive/tests/unity-shaders/live_results.jsonl`; frames, generated
code, player logs and contact sheets: `archive/tests/unity-shaders/out/<stage>/`.

Header for every snippet:

```python
import sys
sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-shaders/scripts")
import ut_env, ut_run, ut_review, ut_shaders
P = ut_env.base_project("3d", "<project>/tests/projects/<skill>")   # APFS clone, AgentKit installed
ut_shaders.install(P)   # Assets/Editor/AgentKit/Shaders (jobs), Assets/AgentShaders/Runtime (feature), Assets/AgentShaders/Shaders
```

If a GUI editor holds the project, run the same jobs through `ut_live.call(P, "<method>", args)`
(scenario-unity-expert); the text edits of assets in P9 need the editor closed.

---

## P1. Pipeline inventory before touching a shader

```python
r = ut_run.run_method(P, "AgentKit.Shaders.RendererFeatureJobs.ListFeatures")
# per quality level: URP asset, depth/opaque texture, every renderer with rendering mode and features
for q in r["result"]["quality_levels"]:
    print(q["quality_level"], q["asset"], q["depth_texture"], [(rd["path"], rd["rendering_mode"], rd["features"]) for rd in q["renderers"]])
kw = ut_shaders.urp_lit_keywords()        # multi_compile lines of the INSTALLED Lit.shader forward pass (44 lines on 6000.3.21f1)
```

Engine calls: `QualitySettings.GetRenderPipelineAssetAt`,
`UniversalRenderPipelineAsset.rendererDataList`, `ScriptableRendererData.rendererFeatures`. Test:
stage `feature` (`list_features_all_quality_levels`), offline `urp_lit_keywords_installed`. Result:
pass. Template facts: active quality PC uses `PC_RPAsset` (Depth and Opaque Texture on, soft shadows
High) with `PC_Renderer` in Forward+ and SSAO (plus the 4 features added in P10); quality Mobile
uses `Mobile_RPAsset` (Depth Texture off) with `Mobile_Renderer` in Forward and 0 features: an
effect added only to `PC_Renderer` does nothing on the Mobile tier.

## P2. Hand-written URP lit shader with all passes (the template)

Files: `scripts/Shaders/AgentLit.shader`, `AgentPasses.hlsl`. The load-bearing parts:

```hlsl
SubShader {
  Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
  HLSLINCLUDE
  #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
  TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
  CBUFFER_START(UnityPerMaterial)          // every non-texture property, identical in every pass
      float4 _BaseMap_ST; half4 _BaseColor; half _Metallic; half _Smoothness; half _UseNormalMap; half _BumpScale; half4 _EmissionColor;
  CBUFFER_END
  ENDHLSL
  Pass { Name "ForwardLit" Tags { "LightMode"="UniversalForward" }
    HLSLPROGRAM
    #pragma shader_feature_local _NORMALMAP
    #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
    #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
    #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
    #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
    #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
    #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
    #pragma multi_compile_instancing
    #include_with_pragmas "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Fog.hlsl"
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
    // fragment: fill SurfaceData and InputData (positionWS, NormalizeNormalPerPixel(normal), view dir,
    // TransformWorldToShadowCoord, fog, SampleSH, GetNormalizedScreenSpaceUV(positionCS)), then
    // half4 c = UniversalFragmentPBR(inputData, surface); c.rgb = MixFog(c.rgb, inputData.fogCoord);
    ENDHLSL }
  Pass { Name "ShadowCaster" Tags { "LightMode"="ShadowCaster" } ZWrite On ZTest LEqual ColorMask 0
    HLSLPROGRAM
    #pragma vertex AgentShadowVertex
    #pragma fragment AgentShadowFragment
    #pragma multi_compile_instancing
    #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
    #include "AgentPasses.hlsl"                // ApplyShadowBias + ApplyShadowClamping, runs AGENT_DISPLACE/AGENT_CLIP
    ENDHLSL }
  Pass { Name "DepthOnly" Tags { "LightMode"="DepthOnly" } ZWrite On ColorMask R   ... AgentDepthOnlyVertex / AgentDepthOnlyFragment }
  Pass { Name "DepthNormals" Tags { "LightMode"="DepthNormals" } ZWrite On          ... AgentDepthOnlyVertex / AgentDepthNormalsFragment }
}
FallBack "Hidden/Universal Render Pipeline/FallbackError"
```

`AgentDepthNormalsFragment` returns `half4(NormalizeNormalPerPixel(normalWS), 0)` (octahedral-packed
under `_GBUFFER_NORMALS_OCT`), the encoding URP's own pass writes and `SampleSceneNormals` reads.
`UniversalFragmentPBR` already walks the cluster loop and the extra directional lights. Not covered
on purpose: lightmaps and APV (`LIGHTMAP_ON`, `ProbeVolumeVariants.hlsl`, the `SAMPLE_GI` branches
of `LitForwardPass.hlsl`), light layers, decals, a Meta pass, a GBuffer pass for Deferred. Test:
stages `validate` and `main`. Result: pass. `validate_shaders_zero_errors`: 6 shaders and 1 compute,
0 import and 0 compile errors for Metal (vertex and fragment of every pass), passes
ForwardLit/UniversalForward, ShadowCaster/SHADOWCASTER, DepthOnly, DepthNormals, 20.5 s.
`lit_casts_and_receives_shadow`: ground under the sphere luma 81.7 vs 155.6 open ground.
`agentlit_matches_urp_lit`: center pixel (192, 40, 34) vs URP Lit (193, 40, 35). SRP Batcher:
compatible (read after the capture).

## P3. Static lint before compiling (seconds, no Unity)

```python
f = ut_shaders.lint_shader_file(P + "/Assets/AgentShaders/Shaders/AgentLit.shader")
assert not [x for x in f if x["severity"] == "error"], f
ut_shaders.lint_custom_function(open(hlsl).read(), "X.hlsl", used_function_names=["MyFunc_float"])
ut_shaders.lint_compute(open(compute).read(), "X.compute")
```

Rules: CGPROGRAM, UnityCG, Surface Shader, GrabPass, UsePass, `fixed`; RenderPipeline tag;
Core.hlsl; one UnityPerMaterial CBUFFER holding every used property and `_ST`; opaque passes
(DepthOnly error, DepthNormals and ShadowCaster warn); `_CLUSTER_LIGHT_LOOP` and shadow keywords in
lit shaders; `inputData` name and directional pre-loop around `LIGHT_LOOP_BEGIN`; clip shared across
passes; Blend implies ZWrite Off and the Transparent queue; no non-LOD texture fetch in a vertex
function; no `#if` on a `dynamic_branch` keyword; no `if (KW)` on a keyword declared with a
`_vertex`/`_fragment` suffix (v0.2, observed compile error, P15); `_FORWARD_PLUS`, `SHADOWS_SCREEN`,
`ComputeScreenPos` (deprecated since URP 11: the installed 17.3 keeps it in
`ShaderVariablesFunctions.deprecated.hlsl`; use `GetNormalizedScreenSpaceUV(positionCS)` or
`positionCS.xy / _ScaledScreenParams.xy`). Custom Function: guard, `_float`/`_half`, inputs before
outputs, `SHADERGRAPH_PREVIEW` branch, file-scope uniforms, directional pre-loop. Compute: `//` on a
`#pragma kernel` line, buffer `GetDimensions`, texture atomics, missing bounds check. Test:
`test_offline.py`. Result: pass, 32 checks (v0.2; 22 in v0.1): a Built-in shader and a broken URP
shader trip every expected rule; all shipped templates, `AgentCustomLighting.hlsl` and
`AgentCompute.compute` lint clean; the v0.2 helpers (P15 to P19) have their own checks.

## P4. Compile a shader for the target API and read its facts

```python
r = ut_run.run_method(P, "AgentKit.Shaders.ShaderJobs.ValidateShaders",
                      {"paths": ["Assets/AgentShaders/Shaders"], "platform": "Metal", "build_target": "StandaloneOSX"})
assert r["ok"] and r["result"]["bad"] == 0
for s in r["result"]["shaders"]:
    own = [ss for ss in s["subshaders"] if ss["own"]][0]      # a FallBack adds its subshaders to ShaderData
    print(s["name"], [(p["name"], p["light_mode"], p["keyword_count"]) for p in own["passes"]], s["inspector_variant_counts"])
```

Engine calls: `AssetDatabase.ImportAsset(ForceSynchronousImport)`, `ShaderUtil.GetShaderMessages`,
`ShaderUtil.GetShaderData(shader).GetSubshader(i).GetPass(j).CompileVariant(ShaderType, keywords, ShaderCompilerPlatform.Metal, BuildTarget.StandaloneOSX)`,
`ShaderUtil.GetPassKeywords(shader, new PassIdentifier(si, pi))`,
`Shader.FindPassTagValue(subshader, pass, "LightMode")`; internal `ShaderUtil.GetVariantCount` and
`GetSRPBatcherCompatibilityCode` through reflection (null if they move). With `-nographics` the
ACTIVE subshader is the FallBack's (no GPU): judge the shader's own subshader, compiled for the
platform you pass. `ShaderJobs.ApiProbe {"names": [...]}` lists where a member lives in THIS editor
before you write code against it (a compile error aborts every batch job). Test: stage `validate`
(`validate_shaders_zero_errors`, `api_probe`). Result: pass (see P2).
`variant_estimate_vs_inspector`: offline estimate 7,688 vs the Inspector's 7,697 (it counts the
FallBack passes). `ApiProbe` located `SetShaderUserValue(UInt32)` on `MeshRenderer`,
`SkinnedMeshRenderer`, `SpriteShapeRenderer`, `TilemapRenderer` (not `Renderer`).

## P5. Materials, a test bench and many shots in one editor boot

```python
ut_run.run_method(P, "AgentKit.Shaders.ShaderJobs.SetupMaterials", {"materials": [
    {"path": "Assets/AgentShaders/Materials/M_Toon.mat", "shader": "AgentKit/Toon",
     "colors": {"_BaseColor": [1, 0.55, 0.2, 1], "_ShadowTint": [0.32, 0.3, 0.55, 1]}},
    {"path": "Assets/AgentShaders/Materials/M_Lit_N.mat", "shader": "AgentKit/Lit", "floats": {"_UseNormalMap": 1},
     "keywords_on": ["_NORMALMAP"]}]})          # a [Toggle(KW)] float does NOT enable the keyword from script
ut_run.run_method(P, "AgentKit.Shaders.ShaderLab.BuildScene", {
    "scene": "Assets/AgentShaders/Scenes/Lab.unity",       # copy of SampleScene: camera, sun, Global Volume (Bloom, Tonemapping)
    "ground": {"material": "Assets/AgentShaders/Materials/M_Ground.mat", "size": 40},
    "objects": [{"name": "Hero", "mesh": "Capsule", "material": "Assets/AgentShaders/Materials/M_Toon.mat", "position": [0, 1.3, 0]},
                {"name": "Water", "mesh": "Grid:160:24", "material": "...", "cast_shadows": False}],   # Grid:N:size = mesh asset
    "sun": {"rotation": [50, 30, 0], "intensity": 2, "shadows": "Soft"},
    "lights": [{"type": "Directional", "name": "FillDir", "rotation": [20, -120, 0], "intensity": 0.8}],
    "bookmarks": [{"name": "front", "position": [0, 4.2, -9.5], "look_at": [0, 0.8, 0.8], "fov": 50}]})
r = ut_run.run_method(P, "AgentKit.Shaders.ShaderLab.Shots", {
    "scene": "Assets/AgentShaders/Scenes/Lab.unity", "width": 1280, "height": 720,
    "probes": [{"name": "shadow", "world": [0.7, 0, 1.2]}],        # returned per view as pixel (x, y, depth)
    "shots": [{"name": "base"},
              {"name": "fill_off", "set": [{"object": "FillDir", "active": False}]},
              {"name": "d05", "set": [{"material": "Assets/.../M_Dissolve.mat", "float": "_Dissolve", "value": 0.5},
                                      {"renderer": "Hero", "user_value": 29491}]},
              {"name": "primed", "set": [{"urp": {"depth_priming": "Forced"}}]},
              {"name": "fwd", "set": [{"urp": {"rendering_mode": "Forward"}}]}]}, graphics=True)
rev = ut_review.review_capture(r)                   # then OPEN rev["sheet"]
s = r["result"]["shots"][0]; x, y, _ = s["probes"]["shadow"]; rgb = ut_shaders.sample(s["path"], x, y, 3)
```

Material, renderer-value, feature and URP edits are reverted at the end of the job
(`keep_changes: true` to keep). SRP Batcher compatibility per shader is in
`r["result"]["srp_batcher"]`. Shadow probe points: `shadow_point()` in `test_live_shaders.py`
projects an object center along the sun's forward vector to y = 0. Test: stage `main`. Result: pass,
16 frames (8 shots x 2 views) in 17.6 s, 0 image-check errors, 0 magenta. Probe results: see P2, P6,
P7, P8.

## P6. Custom lighting with the 6.3 cluster loop (toon)

File: `scripts/Shaders/AgentToon.shader`. The loop every custom-lit shader or Custom Function needs:

```hlsl
InputData inputData = (InputData)0;                   // LIGHT_LOOP_BEGIN reads exactly this name
inputData.positionWS = input.positionWS;
inputData.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(input.positionCS);
inputData.shadowMask = half4(1, 1, 1, 1);
Light mainLight = GetMainLight(TransformWorldToShadowCoord(input.positionWS), input.positionWS, inputData.shadowMask);
half ramp = smoothstep(_RampOffset, _RampOffset + max(_RampSmoothness, 0.001h), dot(N, mainLight.direction) * 0.5h + 0.5h)
          * mainLight.shadowAttenuation;              // cast shadows join the toon band (MinionsArt)
half3 color = albedo * mainLight.color * lerp(_ShadowTint.rgb, 1.0h, ramp);   // tint = shadow floor
#if defined(_ADDITIONAL_LIGHTS)
    uint lightCount = GetAdditionalLightsCount();
    #if USE_CLUSTER_LIGHT_LOOP                        // Forward+: extra directional lights are NOT in the cluster loop
    [loop] for (uint i = 0; i < min(URP_FP_DIRECTIONAL_LIGHTS_COUNT, MAX_VISIBLE_LIGHTS); i++)
        additional += ToonAdditional(GetAdditionalLight(i, inputData.positionWS, inputData.shadowMask), N);
    #endif
    LIGHT_LOOP_BEGIN(lightCount)
        additional += ToonAdditional(GetAdditionalLight(lightIndex, inputData.positionWS, inputData.shadowMask), N);
    LIGHT_LOOP_END
#endif
```

Test: stages `main` and `stylized`. Result: pass. `forward_plus_extra_directional_light`: toon right
side blue 101 with the fill directional light vs 82 without (AgentLit 38 vs 28).
`forward_plus_point_light_cluster_loop`: green 182 vs 169 with the point light off.
`forward_path_extra_directional_light`: identical numbers under Forward, and the `PathProbe` cube
proves the switch (red under Forward+ = `_CLUSTER_LIGHT_LOOP` variant, green under Forward).
Negative control `no_preloop_loses_directional_under_forward_plus`: the same shader without the
pre-loop reads blue 60.2 vs 59.5 (light lost) under Forward+ and 67.6 vs 59.5 under Forward.
`toon_bands_sharper_than_pbr`: 2.2 % of scanline pixels in the transition band vs 30 % for AgentLit.

## P7. Stylized water with depth fade (transparent)

File: `scripts/Shaders/AgentWater.shader`. Core:

```hlsl
// vertex: waves ADDED to world Y with an analytic normal; eyeDepth = -TransformWorldToView(positionWS).z
float2 screenUV = input.positionCS.xy / _ScaledScreenParams.xy;           // dynamic-resolution safe
float waterDepth = max(LinearEyeDepth(SampleSceneDepth(screenUV), _ZBufferParams) - input.eyeDepth, 0);
half g = saturate(waterDepth / _DepthDistance);                          // one mask: color, alpha, shore calm
half4 water = lerp(_ShallowColor, _DeepColor, g);
half3 nTS = BlendNormalRNM(UnpackNormal(SAMPLE_TEXTURE2D(_NormalMap, s, uv + _ScrollA.xy * t)),
                           UnpackNormal(SAMPLE_TEXTURE2D(_NormalMap, s, uv * 1.37 + _ScrollB.xy * t)));   // blend, not add
half foam = step(AgentGradientNoise2D(positionWS.xz + t * 0.05, _FoamNoiseScale), 1 - saturate(waterDepth / _FoamDistance));
// t = _Time.y * _TimeScale + _TimeOffset (TimeScale 0 = deterministic captures); UVs from world XZ
```

Setup: Depth Texture on in every URP asset that renders water
(`ShaderJobs.ConfigureUrp {"depth_texture": true}`); renderer Cast Shadows off;
`Blend SrcAlpha OneMinusSrcAlpha`, `ZWrite Off`, Transparent queue; a subdivided mesh
(`Grid:160:24`). Tileable normal map from integer-period waves: `write_water_normal()` in
`test_live_shaders.py`, imported with `ShaderJobs.ImportTextures {"type": "NormalMap"}`. Test: stage
`water`. Result: pass. `water_depth_fade_monotonic`: blue/red ratio 0.96, 1.05, 2.19, 2.08, 2.28
from shore to deep (luma is not monotonic: fresnel brightens grazing water). `water_shore_foam`:
shore luma 190 vs 162 nearby. `water_moves_with_time`: 13.7 % of pixels change between t = 3 and
3.8. `water_depth_texture_hidden_dependency`: Depth Texture off on the URP asset changes nothing
while SSAO requests depth; with SSAO off too every probe reads 209 (the water turns to solid foam).
Shore calm (v0.2, stage `shore`): the same depth mask scales the detail normals,
`nTS.xy *= _NormalStrength * saturate(g * 2)` (Unity water tutorial gRq-IdShxpU [00:06:12]: Normal
Strength lerped by the depth gradient). `water_normals_fade_at_shore`: mean |RGB| change when
`_NormalStrength` goes 0.6 to 0, 25x25 px box per probe, shore to deep: 0.69, 3.41, 7.71, 15.45,
13.93 (shallow/deep 0.045). Contact sheet `out/shore/contact_sheet.png`: the shallow band is calm in
both shots.

## P8. Dissolve that clips in every pass, per material or per renderer

File: `scripts/Shaders/AgentDissolve.shader`:

```hlsl
float DissolveAmount() { return _UseRendererValue > 0.5 ? (unity_RendererUserValue & 0xFFFFu) / 65535.0 : _Dissolve; }
float DissolveField(float3 positionOS) {                 // object-space 3D noise: no UV seams
    float n = AgentFbm3D(positionOS * _NoiseScale);
    float h = saturate((positionOS.y - _HeightMin) / max(_HeightMax - _HeightMin, 1e-4));
    return saturate(lerp(n, h * 0.85 + n * 0.15, _DirectionWeight)); }
#define AGENT_CLIP(uv, positionOS, positionWS) clip(DissolveField(positionOS) - DissolveAmount())   // all passes
// forward: edge = step(field, amount + _EdgeWidth) * step(0.001, amount); emission = _EdgeColor.rgb * edge; Cull Off, flip N on back faces
```

Per renderer on ONE shared material (SRP Batcher and GPU Resident Drawer friendly,
`unity_RendererUserValue` is in UnityPerDraw):

```csharp
meshRenderer.SetShaderUserValue((uint)(amount * 65535f));   // MeshRenderer / SkinnedMeshRenderer, 6.3; runtime-only value
```

For a character that normally renders opaque, swap to the dissolve material when the effect starts
(both materials in the build) rather than toggling a `shader_feature` keyword [added from the
variant rules]: alpha test costs on tile GPUs and a runtime-toggled `shader_feature` variant may be
stripped (P11 proves the stripping, P19 lints for it). A Shader Graph dissolve with Alpha Clipping
on clips in every pass all the time, whatever Boolean keyword it has (P17). Test: stages `main` and
`stylized`. Result: pass. `dissolve_shadow_follows_clip`: shadow luma 82 at amount 0, 158 at amount
1 (open ground 162). `per_renderer_user_value`: three spheres, one material, values 0 / 0.45 / 0.8:
green-minus-red at the probe 131 / 5 / -10 (base 130). `dissolve_hdr_edge_visible`: 268 saturated
orange samples with edge (1.2, 0.35, 0.03); (4, 1.1, 0.15) washed to cream under the template's
Neutral tonemapping (observed in a four-value sweep, `out/edge_test/sheet.png`). Tested on
`MeshRenderer`; `SkinnedMeshRenderer.SetShaderUserValue` exists (ApiProbe) but was not rendered
here.

## P9. Shader Graph without the graph editor

```python
# 1. bring graphs in (the scripted twin of Package Manager > Samples > Import): files are copied WITH .meta (GUID refs)
r = ut_run.run_method(P, "AgentKit.Shaders.ShaderGraphJobs.ImportPackageSample",
                      {"package": "com.unity.shadergraph", "sample": "CustomLighting", "dest": "Assets/Samples/ShaderGraph/CustomLighting"})
# 2. duplicate a template graph and read the references Material.SetX must use
d = ut_run.run_method(P, "AgentKit.Shaders.ShaderGraphJobs.DuplicateGraph",
                      {"source": "Assets/Samples/ShaderGraph/CustomLighting/Custom Lighting Toon.shadergraph",
                       "dest": "Assets/AgentShaders/Graphs/HeroToon.shadergraph"})
refs = [(p["reference"], p["type"]) for p in d["result"]["properties"]]
summary = ut_shaders.shadergraph_summary(P + "/Assets/AgentShaders/Graphs/HeroToon.shadergraph")   # offline: targets, properties, keywords, Custom Functions
# 3. material from the graph (a .shadergraph path loads as a Shader), then bench and shots as in P5
ut_run.run_method(P, "AgentKit.Shaders.ShaderJobs.SetupMaterials", {"materials": [
    {"path": "Assets/AgentShaders/Materials/M_HeroToonGraph.mat", "shader": "Assets/AgentShaders/Graphs/HeroToon.shadergraph",
     "colors": {"_EmissionColor": [1, 0.45, 0.25, 1]}}]})
# 4. change logic without the editor: repoint a Custom Function node to an agent-owned File-mode .hlsl
#    (editor CLOSED: this edits the asset text; keep a copy of the original)
guid = ut_shaders.asset_guid(P + "/Assets/AgentShaders/Shaders/AgentCustomLighting.hlsl")
ut_shaders.shadergraph_repoint_custom_function(sub_graph_path, "AddAdditionalLightsHalfLambert", guid, "AgentAdditionalLightsHalfLambert")
ut_run.run_method(P, "AgentKit.Shaders.ShaderGraphJobs.GraphReport", {"paths": ["Assets/AgentShaders/Graphs/HeroToon.shadergraph"]})
```

File-mode rules (`AgentCustomLighting.hlsl`): one guard per file, `Name_float` and `Name_half`, the
node's Name field without the suffix, parameters in the node's port order (inputs, then `out`),
`SHADERGRAPH_PREVIEW` branch. Custom lighting graphs in 6.3: Unlit target with Keep Lighting
Variants on (GUI, `gui-paths.md`). Test: stage `graph` (also `shader_properties_of_graph`:
`ShaderJobs.ShaderProperties` on the `.shadergraph` path). Result: pass. 4 sample graphs imported
without errors (125 files, 13.6 s); HeroToon duplicated, SRP Batcher compatible, references
`_BaseMap`, `_BumpMap`, `_MetallicGlossMap`, `_EmissionMap`, `_EmissionColor`.
`sample_graph_ignores_extra_directional_forward_plus`: Unity's Toon sample graph reads blue 152.6
with and without the fill directional light under Forward+, 162.7 vs 152.6 under Forward.
`custom_function_file_mode_fix`: after repointing the String-mode node of
`AdditionalLightsHalfLambert.shadersubgraph` to `AgentCustomLighting.hlsl` (same ports, plus the
directional pre-loop), Forward+ reads 162.7 vs 152.6: fixed. `custom_function_hlsl_compiles`: every
entry point, both precisions, compiles in a URP pass.

## P10. Render Graph renderer feature: full-screen effect, added by script, on and off

Runtime file (outside any Editor folder): `scripts/Runtime/AgentFullscreenFeature.cs`. The pass:

```csharp
public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
{
    var resourceData = frameData.Get<UniversalResourceData>();
    if (resourceData.isActiveTargetBackBuffer) { Debug.LogError($"{m_Name}: ... back buffer ..."); return; }
    TextureHandle source = resourceData.activeColorTexture;
    TextureDesc desc = renderGraph.GetTextureDesc(source);            // graph-derived, change only what differs
    desc.name = "CameraColor-" + m_Name; desc.clearBuffer = false;
    TextureHandle destination = renderGraph.CreateTexture(desc);
    var blit = new RenderGraphUtils.BlitMaterialParameters(source, destination, m_Material, m_PassIndex);
    if (m_Inputs == ScriptableRenderPassInput.None) renderGraph.AddBlitPass(blit, passName: m_Name);
    else using (var b = renderGraph.AddBlitPass(blit, passName: m_Name, returnBuilder: true)) {
        if ((m_Inputs & ScriptableRenderPassInput.Depth) != 0) b.UseTexture(resourceData.cameraDepthTexture);
        if ((m_Inputs & ScriptableRenderPassInput.Normal) != 0) b.UseTexture(resourceData.cameraNormalsTexture); }
    resourceData.cameraColor = destination;                           // no blit back
}
// Setup (called from AddRenderPasses after the gates): renderPassEvent = evt; ConfigureInput(inputs); requiresIntermediateTexture = true;
// Feature.AddRenderPasses: return if no material, bad pass index, Preview/Reflection camera, or _Strength <= 0.
```

Shaders: SRP Blit style (`Core.hlsl` + Core RP `Blit.hlsl`, `#pragma vertex Vert`, sample
`_BlitTexture` with `input.texcoord`): `AgentGrayscale.shader`, `AgentEdgeOutline.shader` (depth and
normals Roberts cross, needs `Depth|Normal`).

```python
ut_run.run_method(P, "AgentKit.Shaders.RendererFeatureJobs.AddFeature", {"renderer": "Assets/Settings/PC_Renderer.asset", "features": [
    {"type": "AgentKit.Rendering.AgentFullscreenFeature", "name": "AgentOutline", "active": False,
     "fields": {"material": "Assets/AgentShaders/Materials/M_EdgeOutline.mat",
                "injectionPoint": "BeforeRenderingPostProcessing", "requirements": "Depth|Normal"}},
    {"type": "UnityEngine.Rendering.Universal.FullScreenPassRendererFeature", "name": "FSP_Grayscale", "active": False,
     "fields": {"passMaterial": "Assets/AgentShaders/Materials/M_Grayscale.mat", "injectionPoint": "AfterRenderingPostProcessing",
                "fetchColorBuffer": True}}]})          # idempotent by name; adds to m_RendererFeatures AND m_RendererFeatureMap
# toggle in shots: {"renderer_data": ".../PC_Renderer.asset", "feature": "AgentOutline", "active": True, "fields": {...}}
g = ut_shaders.region_stats(png)["gray_share"]         # 1.0 when the grayscale pass ran
```

Full Screen Pass facts (installed code): keep Pass index 0; Fetch Color Buffer (default on) is what
binds `_BlitTexture`; Requirements Color only declares a read of the opaque texture. Test: stage
`feature`. Result: pass. 4 features added to `PC_Renderer` (5 serialized features, 5 map entries).
`feature_grayscale_on_off`: gray share 0.008 off, 1.0 on. `full_screen_pass_feature_by_script`: 1.0.
`feature_outline_on_off`: 1.1 % of pixels change; the outline also draws with SSAO off (the pass's
own `ConfigureInput(Normal)` produces the normals texture). `after_rendering_refuses_back_buffer`:
injection After Rendering logs the back-buffer error and draws nothing (gray share 0.008).
`manual_depthnormals_example_is_encoded`: in a normals view the Manual-style sphere reads (222,
251, 207) vs (177, 246, 135) for AgentLit at the same normal. Contact sheet:
`out/feature/contact_sheet.png`.

## P11. Variant count, funnel, stripping and the shader_feature rule

```python
ut_run.run_method(P, "AgentKit.Shaders.VariantJobs.StrippingSettings", {"strict_variant_matching": True, "log_shader_compilation": True})
a = ut_run.run_method(P, "AgentKit.Shaders.VariantJobs.BuildShaderBundle",
                      {"assets": ["Assets/AgentShaders/Materials/M_AgentLit_Red.mat", "..."], "target": "StandaloneOSX", "bundle": "base"})
shipped = {k: v["total"] for k, v in a["result"]["shaders"].items()}            # IPreprocessShaders logger, callbackOrder int.MaxValue
funnel = ut_shaders.parse_variant_funnel(open(a["log"]).read())["totals"]      # Unity's own numbers per shader
b = ut_run.run_method(P, "AgentKit.Shaders.VariantJobs.BuildShaderBundle", {"assets": [...], "bundle": "stripped",
      "strip_rules": [{"shader": "AgentKit/Lit", "keyword": "_SCREEN_SPACE_OCCLUSION", "skip_development": False}]})
findings = ut_shaders.variant_budget_check(funnel, {"AgentKit/Lit": 16, "*": 64}, baseline=previous_funnel)
est = ut_shaders.variant_estimate(open(shader_path).read())                   # offline full space per pass
```

Stripper pattern (`AgentStripRules`): `IPreprocessShaders.OnProcessShader(shader, snippet, data)`,
iterate `data` backwards, `data.RemoveAt(i)` when `data[i].shaderKeywordSet.GetShaderKeywords()`
holds the keyword; `callbackOrder` 0. The Unity 6.3 log prints the funnel per pass and stage, with
the OS thousands separator (`Full variant space: 2.560` here). Test: `test_live_variants.py`.
Result: pass. `AgentKit/Lit` funnel 4,046 (per stage) to 62 after settings filtering to 13 after
built-in stripping, 13 shipped; the logger total equals Unity's "After scriptable stripping" (13).
Strip rule: 13 to 9 (4 removed), Toon unchanged. `shader_feature_needs_a_material`: 13 variants and
0 with `_NORMALMAP` without a normal-mapped material, 19 and 6 with one. First bundle build 63.9 s,
cached rebuilds about 3 s. Not run: a development player tour with Strict Shader Variant Matching
and Log Shader Compilation (needs a player run; the settings are set and read here).

## P12. Compute shader with a GPU vs CPU test

```python
r = ut_run.run_method(P, "AgentKit.Shaders.ComputeJobs.RunComputeTemplate",
                      {"compute": "Assets/AgentShaders/Shaders/AgentCompute.compute", "count": 100003, "out_png": "/abs/pattern.png"},
                      graphics=True)                     # -nographics has no GPU device
```

Kernel rules (`AgentCompute.compute`): `if (id.x >= _Count) return;` with
`ceil(count / threadGroupX)` groups from `GetKernelThreadGroupSizes`; atomics on
`RWStructuredBuffer<uint>` (no texture atomics on Metal); `RWTexture2D<float4>` into an `ARGBFloat`
RenderTexture with `enableRandomWrite` set before `Create()`; buffers filled before use and released
in `finally`; `GetData` in tests only (`AsyncGPUReadback` per frame). Test: stage `compute`. Result:
pass on Metal: SquareAdd over 100,003 elements (1,563 groups of 64) max error 6e-8, 0 NaN; Histogram
bins sum 100,003, 0 mismatched with the CPU; Pattern PNG std 0.117.

## P13. Shader cost as GPU time (A/B)

```python
r = ut_run.run_method(P, "AgentKit.Shaders.GpuCostJobs.MeasureFullscreenCost", {
    "baseline": "Assets/.../M_Cost_Base.mat", "materials": ["Assets/.../A.mat", "Assets/.../B.mat"],
    "width": 1920, "height": 1080, "draws": 100, "samples": 11}, graphics=True)
for m in r["result"]["materials"]:
    print(m["material"], m["net_ms_per_fullscreen_draw"], m["net_ns_per_pixel"])
```

Method: each sample executes `draws` full-screen triangles (additive blend so every fragment is
kept) into an offscreen target and blocks on a 1-pixel `AsyncGPUReadback`; materials interleaved
round by round; three warm-up rounds; median; `ShaderUtil.allowAsyncCompilation = false` during the
run (otherwise early samples time the editor's placeholder shader). `SystemInfo.supportsGpuRecorder`
was false here, so no `Recorder` GPU time. Test: stage `cost` (probe shader
`tests/code/unity-shaders/unity/Shaders/CostProbe.shader`). Result: pass on 4 consecutive runs after
the fix (the last one in the final full run); ms per 1080p draw on Apple M5 Max: 64 multiply-adds
0.007 to 0.029, 64 `sin` 0.29 to 0.34, 64 float4 `sin` 0.89 to 1.19 (v0.2 full run: 0.033 / 0.42 /
1.40; absolute times drift between runs, the interleaved ranking holds). The first version (no
interleaving, async compilation on) failed once with inverted results: kept as a lesson. Half vs
float (v0.2, stage `precision`, arg `"precision_model": "PlatformDefault" | "Unified"`, restored
after the run): the same 64-iteration `sin` loop on a float4 and on a half4 (`_COST_SIN4H`). The
engine doc of `ShaderPrecisionModel` says PlatformDefault defines `half` as `min16float` on mobile
targets and `float` elsewhere, so on this Mac the PlatformDefault pair is the same code: its ratio
is the noise. `half_precision_measured_per_model`, three runs: half/float 1.003, 0.92 and 0.963
under PlatformDefault, 0.82, 0.886 and 0.772 under Unified (float4 1.25 to 1.76 ms per 1080p draw
across runs). Verdict: a desktop A/B says nothing about mobile half; justify half on the device with
its profiler (Freya Holmér kfM-yu0iQBk [01:20:26]: float until you must optimize; Ben Cloward
E82XxlXMJs4 [00:16:19]: vector width and instruction type, measured).

## P14. Renderer and URP settings a shader depends on

```python
ut_run.run_method(P, "AgentKit.Shaders.ShaderJobs.ConfigureUrp", {"asset": "active", "depth_texture": True, "renderer": "Assets/Settings/PC_Renderer.asset",
                                                                  "rendering_mode": "ForwardPlus", "depth_priming": "Disabled",
                                                                  "features_active": {"ScreenSpaceAmbientOcclusion": True}})
```

Engine calls: `UniversalRenderPipelineAsset.supportsCameraDepthTexture/OpaqueTexture`,
`UniversalRendererData.renderingMode/depthPrimingMode`, `ScriptableRendererFeature.SetActive`,
`PlayerSettings.strictShaderVariantMatching`, `GraphicsSettings.logWhenShaderIsCompiled`.
`RendererFeatureJobs.SetFeatureActive {"renderer", "name", "active"}` toggles one feature and saves.
Test: stage `setup` (`configure_urp`), stage `feature` (`set_feature_active`), and the same setters
inside `ShaderLab.Shots` URP ops (stages `main`, `water`). Result: pass: PC_RPAsset, Forward+, depth
priming Disabled, SSAO active; `depth_priming_needs_depthonly`: the forward-only control cube
vanished under Forced, AgentLit unchanged.

## P15. Shader Build Settings by script (keyword exclusion and Type Override, Unity 6)

```python
ut_run.run_method(P, "AgentKit.Shaders.VariantJobs.KeywordOverrides", {"overrides": [
    {"keywords": ["_", "_SHADOWS_SOFT", "_SHADOWS_SOFT_LOW", "_SHADOWS_SOFT_MEDIUM", "_SHADOWS_SOFT_HIGH"],   # the declared set, exactly, with "_"
     "mode": "Default", "exclude": ["_SHADOWS_SOFT", "_SHADOWS_SOFT_LOW", "_SHADOWS_SOFT_MEDIUM", "_SHADOWS_SOFT_HIGH"]}],
    "shaders": ["AgentKit/Lit"]})
# mode: Default | AllVariants (multi_compile) | MaterialUsageBasedVariants (shader_feature) | SingleVariantWithDynamicBranching (dynamic_branch)
# then BuildShaderBundle (P11) to count; always finish with {"clear": True} or the next build inherits it
```

Engine calls: `EditorGraphicsSettings.GetShaderBuildSettings/SetShaderBuildSettings`,
`ShaderBuildSettings.KeywordDeclarationOverride` (`keywords` of
`KeywordOverrideInfo(name, keepInBuild)`, `variantGenerationMode`), `IsValid(out error)`; saved in
`ProjectSettings/GraphicsSettings.asset` under `m_ShaderBuildSettings`. The setter writes the ACTIVE
settings; a build profile with its own Shader Build Settings overrides them (6.3 Manual). The
editor's `keywordSpace` does not change (`isDynamic` stays false): the overrides act when a build
enumerates variants. Test: `test_live_variants.py sbs`. Result: pass (4 checks). Exclude the soft
set: AgentLit 13 to 11 shipped, soft variants 2 to 0, full space 4,046 to 974 (the soft shadow code
is compiled out). Type Override to shader_feature on the same set: 13 to 11, soft variants 0 (URP
enables these keywords globally at runtime, no material carries them, so the build strips them: soft
shadows turn hard). Type Override to dynamic_branch: on the probe shader `AgentTests/DynOverride` 10
to 6 variants for the keyword tested with `if (AGENT_KW_IF)`, unchanged (10) for the keyword tested
with `#if defined(AGENT_KW_PP)`, and unchanged on AgentLit's soft set (13): URP 17.3 tests the soft
set (`Shadows.hlsl`) and SSAO (`AmbientOcclusion.hlsl`) with `#if`, so the override is silently
ignored there; URP writes fog as `if (FOG_LINEAR)` and already declares it `dynamic_branch` in
`Fog.hlsl`. A first probe version declared `multi_compile_fragment _ AGENT_KW_IF`: the vertex stage
failed with "undeclared identifier 'AGENT_KW_IF' (a known keyword but not declared in this pass)":
`if()`-style keywords must be declared without a stage suffix (lint rule `if_keyword_stage_suffix`).
Settings cleared at the end (`shader_build_settings_cleared`).

## P16. Post-processing variants: audit the Volume Profiles, not the scenes

```python
a = ut_run.run_method(P, "AgentKit.Shaders.VariantJobs.PostProcessingAudit")
a["result"]["profiles"]                       # every VolumeProfile under Assets/: overrides, default?, used by a build scene?, families it keeps
a["result"]["profiles_outside_build_scenes"]  # candidates to move out of Assets/ (samples, tests, abandoned scenes)
a["result"]["kept_features"]                  # union: what Strip Unused Post Processing Variants must keep
# UberPost variants actually shipped: BuildShaderBundle {"assets": ["Packages/com.unity.render-pipelines.universal/Shaders/PostProcessing/UberPost.shader"]}
```

What URP 17.3 does (installed `ShaderBuildPreprocessor.GetSupportedFeaturesFromVolumes`):
`AssetDatabase.FindAssets("t:VolumeProfile")`, keeps paths under `Assets`, and for each profile
`Has<LensDistortion>()`, `Has<Tonemapping>()`, `Has<FilmGrain>()`, `Has<DepthOfField>()`,
`Has<MotionBlur>()`, `Has<PaniniProjection>()`, `Has<ChromaticAberration>()` and the Bloom
quality/dirt choice; scenes are not read and an override's active state does not matter. The 6.3
Manual says "Volume Overrides found in any scene of the project"; the installed code is stricter:
any profile ASSET under Assets/. `URPPreprocessBuild.EnsureVolumeProfile` re-adds every override to
the Default Volume Profile before a build ("required to avoid missing overrides at runtime"), so
film grain, lens distortion, chromatic aberration, depth of field, motion blur and Panini variants
are always kept; the stripping can only drop Bloom HQ/LQ/dirt variants no profile uses (a scriptable
stripper is the lever for the rest [added], proven with strict matching). Test:
`test_live_variants.py post`. Result: pass (3 checks). The template's Default Volume Profile has 19
overrides and keeps 8 families; UberPost ships 433 variants (film grain 216, distortion 216,
chromatic aberration 216, although no scene uses them). An unused profile with Bloom HQ + dirt, in
no build scene: 433 to 577 (`_BLOOM_HQ_DIRT` 0 to 144); moved out of Assets/ (to
`archive/tests/unity-shaders/moved/`): back to 433. UberPost bundle about 10 s.

## P17. Shader Graph Graph Settings without the editor, and the generated code

```python
ut_shaders.shadergraph_set_target_settings(src, out_path=dst, alpha_clip=True, allow_material_override=True)   # editor CLOSED
ut_shaders.shadergraph_summary(dst)["urp_target"], ["findings"]      # sg_alpha_clip_always when clip is on without override
g = ut_run.run_method(P, "AgentKit.Shaders.ShaderGraphJobs.GeneratedCode", {"paths": [dst_asset_path]})
rep = ut_shaders.generated_alpha_clip_report(open(g["result"]["graphs"][0]["file"]).read())   # per pass: defined / keyword / absent
```

Alpha Clipping in a URP target (installed `UniversalTarget.cs`, `AddAlphaClipControlToPass`): with
Allow Material Override OFF the target adds `#define _ALPHATEST_ON 1` to every pass (plus
`AlphaToMask On` for opaque); with it ON, `_ALPHATEST_ON` becomes a `shader_feature_local_fragment`
keyword driven by the material's `_AlphaClip`. A Blackboard Boolean keyword cannot remove the
define. For "clip only while dissolving": Allow Material Override plus
`BaseShaderGUI.SetMaterialKeywords`, or a second opaque material swapped in (P8). `GeneratedCode`
reads Shader Graph's internal
`ShaderGraphImporter.GetShaderText(path, out textures, AssetCollection, out GraphData)` by
reflection: the text the Inspector's "View Generated Shader" shows. Test: stage `graphclip`. Result:
pass. Toon sample copied twice with Alpha Clipping on: override OFF, 8 of 8 passes (Universal
Forward, DepthOnly, MotionVectors, DepthNormalsOnly, ShadowCaster, GBuffer, SceneSelectionPass,
ScenePickingPass) carry `#define _ALPHATEST_ON 1` and the keyword space has no `_ALPHATEST_ON`;
override ON, 8 of 8 declare the keyword and the keyword space lists `_ALPHATEST_ON`. Offline:
`shadergraph_alpha_clip_finding`.

## P18. PSO warm-up proven in a development player (GraphicsStateCollection)

```python
ut_run.run_method(P, "AgentKit.Shaders.PsoJobs.BuildPsoScene", {"scene": "Assets/AgentShaders/Scenes/PsoBench.unity",
    "ground": ".../M_Ground.mat", "volume_profile": "Assets/Settings/SampleSceneProfile.asset",
    "materials": [".../M_AgentLit_Red.mat", ".../M_Toon.mat", ".../M_Dissolve.mat", ".../M_Water.mat"]})   # "Content" inactive until warmed
ut_run.build(P, "macos", out="Builds/PsoBench/PsoBench.app", development=True, scenes=[scene])     # tracing needs a development player
gsc = out + "/" + ut_shaders.pso_collection_name("OSXPlayer", "Metal")          # ONE file per graphics API and platform
trace = ut_shaders.run_pso_player(app, "trace", out + "/trace.json", gsc=gsc)
ut_run.run_method(P, "AgentKit.Shaders.PsoJobs.InspectCollection", {"file": gsc, "expect_shaders": ["AgentKit/Lit", ...]}, graphics=True)
cold = ut_shaders.run_pso_player(app, "cold", out + "/cold.json")
warm = ut_shaders.run_pso_player(app, "warm", out + "/warm.json", gsc=gsc)
assert not [f for f in ut_shaders.pso_gate(trace, cold, warm) if f["severity"] == "error"]
# shipping: copy gsc to StreamingAssets/PSO/<platform>_<api>.graphicsstate; AgentPsoProbe (mode "ship" or no flag) finds it by name
```

Runtime (`scripts/Runtime/AgentPsoProbe.cs`, component in the boot scene):
`new GraphicsStateCollection()`, `BeginTrace()` at boot (returns false outside a development
player), `EndTrace()` + `SaveToFile(path)`; shipping side `LoadFromFile`, refuse a collection whose
`graphicsDeviceType` or `runtimePlatform` differs from the device, `WarmUp(default).Complete()` or
`WarmUpProgressively(n, default).Complete()` once per loading frame until `isWarmedUp`, then
activate the gameplay root. Proof, two channels over the gameplay frames: `ProfilerRecorder` sample
counts of `Shader.CreateGPUProgram` (plus the PSO markers), and the player log with Log Shader
Compilation on, whose 6.3 lines read
`Uploaded shader variant to the GPU driver: AgentKit/Lit (instance 0x19C), pass: ForwardLit, stage: fragment, keywords ..., time: 1.4 ms`
(the blog's `Compiled Shader:` format is gone; `count_compiled_shaders` reads both). Test:
`test_live_pso.py` (development macOS player, 311 MB, 141 s first build, 12 s incremental; 5
windowed runs of 60 gameplay frames). Result: pass (8 checks). Trace: 23 variants, 26 to 27 graphics
states, Metal, OSXPlayer, quality PC, 262 to 266 KB, covering the 4 AgentKit shaders plus URP Bloom,
UberPost, LutBuilderLdr, SSAO, CoreBlit and the skybox. Cold, twice per run over 4 runs: 14
`Shader.CreateGPUProgram` samples in gameplay (2.0 to 4.5 ms) and the same 14 uploads in the log
(DepthNormals and forward passes of the 4 shaders), worst gameplay frame 7.1 to 11.1 ms. Warm: 0 and
0; warm-up of 26 to 27 states in one frame, 1.8 to 2.4 ms; worst frame 5.5 to 8.4 ms. Ship (file
found in `StreamingAssets/PSO/OSXPlayer_Metal.graphicsstate`): 0 and 0. On Metal
`CreateGraphicsGraphicsPipelineImpl` does not exist (recorder invalid); the Metal PSO markers are
`CreateGraphicsPipelineAsync` and `GpuProgramMetal.CreateCachedPipelineAsync`, valid but 0 in
gameplay in every run, so on Metal the evidence is the GPU program marker and the log.
scenario-unity-performance owns device captures.

## P19. Runtime keyword toggles against shader_feature declarations

```python
findings = ut_shaders.lint_project_keywords(P)       # .shader/.hlsl/.shadergraph declarations vs runtime .cs (Editor folders skipped)
# or: ut_shaders.lint_runtime_keyword_toggles({"X.cs": text}, ut_shaders.keyword_declarations({"Y.shader": text}, [graph_paths]))
```

Rules: error `runtime_toggle_shader_feature` when runtime code calls
`EnableKeyword`/`DisableKeyword`/`SetKeyword` (string literal, `const string`, or
`new LocalKeyword(shader, "X")`) on a keyword declared only as `shader_feature` or
`shader_feature_local`, in code or as a Shader Graph Blackboard keyword with Definition Shader
Feature: the variant ships only if a material in the build enables it (P11: 0 then 6 `_NORMALMAP`
variants), so the player falls back to the closest variant. Warn `global_toggle_local_keyword` for
`Shader.EnableKeyword` / `CommandBuffer.EnableShaderKeyword` on a `_local` keyword. Editor scripts
are skipped on purpose: saving the keyword into a material asset is how a `shader_feature` variant
is kept. Fix: swap to a second material (both in the build), or `multi_compile_local`, or
`dynamic_branch` tested with `if()`. Test: `test_offline.py` (`lint_runtime_shader_feature_toggle`,
`lint_runtime_toggle_shadergraph_keyword`). Result: pass: the Y4 baseline's dissolve controller
pattern (`shader_feature_local _DISSOLVE`, `m.EnableKeyword("_DISSOLVE")`) is flagged three ways, a
`multi_compile_local` toggle is not.

## Not run here, and why

- Device GPU timings (Xcode Metal capture, Android GPU Inspector, Mali Offline Compiler) and mobile
  half precision: outside the editor, on the device.
- A second graphics API for the PSO proof: macOS players run Metal only; the Vulkan (Android) and
  DX12 collections need those players. The API guard (`api_match`) and the per-API file name are
  tested.
- Strict matching errors in a player tour: Strict Shader Variant Matching is set and read (P11); the
  P18 player logs show the uploads, not a strict-matching failure path.
- Deferred and Deferred+ paths (GBuffer pass, `UniversalForwardOnly`): the templates target Forward
  and Forward+.
- GPU-driven instancing (`Graphics.RenderMeshIndirect`): names verified in the installed CoreModule,
  no live test in this skill.
