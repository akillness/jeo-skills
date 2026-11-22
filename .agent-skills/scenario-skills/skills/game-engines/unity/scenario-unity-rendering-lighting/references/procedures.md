# Procedures (copyable, each with its live test and result)

All ran in Unity 6000.3.21f1 (URP 17.3) on macOS 26.5.1, Apple M5 Max, Metal, on 2026-09-24 (v0.1,
then the v0.2 refactor after blind grade Y3: P2b, P2c, P7 step 4, P9 audit v2, P11 step 3, P13 to
P16), in `tests/projects/unity-rendering-lighting` (APFS clone of Base3D_URP, path with spaces).
Tests: `tests/code/unity-rendering-lighting/`; every result line is in
`archive/tests/unity-rendering-lighting/live_results.jsonl`, captures in
`archive/tests/unity-rendering-lighting/captures/`. Header for every snippet:

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-rendering-lighting/scripts")
import ut_lighting as L                      # also puts scenario-unity-expert/scripts on sys.path
import ut_run, ut_review, ut_stat
P = L.project("<project>/tests/projects/<skill>")   # clone + core AgentKit + AgentKit/Lighting
```

C# jobs live in `scripts/AgentKit/Lighting/` (namespace `AgentKit.Lighting`, compiled into
Assembly-CSharp-Editor next to the core AgentKit). Engine calls are named in each procedure (report
format of scenario-unity-expert `toolkit-map.md`).

---

## P1. Report which URP asset each quality level renders with

```python
rep = ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ReportPipeline")["result"]
for lv in rep["levels"]:
    print(lv["name"], lv["asset"], lv["falls_back_to_graphics_default"], lv["urp"]["renderers"][0]["rendering_path"])
assert all(not lv["falls_back_to_graphics_default"] for lv in rep["levels"])
[f for f in rep["findings"] if f["severity"] != "info"]      # mobile bandwidth traps, STP+MSAA, GRD chain, post off with HDR
```

Engine calls: `QualitySettings.GetRenderPipelineAssetAt(i)`,
`GraphicsSettings.defaultRenderPipeline` / `currentRenderPipeline`,
`new SerializedObject(asset).FindProperty("m_...")` for 45 asset fields,
`UniversalRendererData.renderingMode / depthPrimingMode / copyDepthMode / postProcessData / rendererFeatures`,
`SerializedObject(QualitySettings.asset).FindProperty("m_PerPlatformDefaultQuality")`.

Test: `test_01_tiers.py` (01a, 01c). Result: pass, 2 levels (Mobile -> `Mobile_RPAsset`, PC ->
`PC_RPAsset`), none falling back, platform defaults Standalone 1 (PC), Android/iPhone/WebGL 0
(Mobile); template findings 0. Template facts read: PC renderer Forward+ with SSAO, Mobile renderer
Forward without features.

## P2. Two tiers from a JSON spec, readback in a fresh process

```python
PC = {"quality": "PC", "asset": "Assets/Settings/PC_RPAsset.asset",
      "asset_props": {"m_RequireDepthTexture": True, "m_RequireOpaqueTexture": False, "m_SupportsHDR": True,
                      "m_HDRColorBufferPrecision": 0, "m_MSAA": 4, "m_RenderScale": 1.0, "m_UpscalingFilter": 0,
                      "m_LightProbeSystem": 1, "m_MainLightShadowmapResolution": 2048, "m_ShadowDistance": 60.0,
                      "m_ShadowCascadeCount": 2, "m_Cascade2Split": 0.25, "m_SoftShadowsSupported": True,
                      "m_SoftShadowQuality": 2, "m_AdditionalLightShadowsSupported": True,
                      "m_AdditionalLightsShadowmapResolution": 2048, "m_MixedLightingSupported": True,
                      "m_ColorGradingMode": 1, "m_UseSRPBatcher": True, "m_SupportsDynamicBatching": False,
                      "m_StoreActionsOptimization": 0},
      "renderer_props": {"renderingMode": "ForwardPlus", "depthPrimingMode": "Disabled", "copyDepthMode": "AfterOpaques"}}
MOBILE = {"quality": "Mobile", "asset": "Assets/Settings/Mobile_RPAsset.asset",
          "asset_props": {"m_RequireDepthTexture": False, "m_RequireOpaqueTexture": False, "m_MSAA": 2,
                          "m_RenderScale": 0.85, "m_LightProbeSystem": 1, "m_MainLightShadowmapResolution": 1024,
                          "m_ShadowDistance": 30.0, "m_ShadowCascadeCount": 1, "m_SoftShadowsSupported": False,
                          "m_AdditionalLightShadowsSupported": False, "m_AdditionalLightsPerObjectLimit": 4,
                          "m_ShadowDepthBias": 0.1, "m_ShadowNormalBias": 0.5,     # template ships 1 / 1: see P11
                          "m_ColorGradingMode": 1, "m_SupportsDynamicBatching": False},
          "renderer_props": {"renderingMode": "Forward", "depthPrimingMode": "Disabled", "copyDepthMode": "AfterTransparents"},
          "quality_props": {"shadowmaskMode": 0}}                                  # QualitySettings level field
ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ConfigureTiers",
                  {"tiers": [PC, MOBILE], "platform_defaults": {"Standalone": "PC", "Android": "Mobile", "iPhone": "Mobile"}})
after = ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ReportPipeline")["result"]     # NEW process
chk = L.tier_check(after, {"PC": {"asset": PC["asset_props"], "asset_path": PC["asset"],
                                  "renderer": {"rendering_path": "ForwardPlus"}},
                           "Mobile": {"asset": MOBILE["asset_props"], "renderer": {"rendering_path": "Forward"}}})
assert chk["ok"], chk["mismatches"]
L.shadow_density(2048, 60, cascades=2, split1=0.25), L.shadow_density(1024, 30)   # 68 vs 34 texels/m near
L.atlas_plan(spots=4, points=1, atlas=1024, tier_px=256)                         # fits
```

Engine calls: `SerializedProperty.boolValue / intValue / floatValue` +
`ApplyModifiedPropertiesWithoutUndo` for `m_` keys (no C# setter in URP 17.3 for soft shadows,
additional-light shadows, light probe system, mixed lighting, rendering layers, SH bands; observed),
`PropertyInfo.SetValue` on `UniversalRendererData.renderingMode` etc.,
`m_QualitySettings.Array.data[i].customRenderPipeline` and `m_PerPlatformDefaultQuality` on
`ProjectSettings/QualitySettings.asset`, `AssetDatabase.SaveAssets()`. `copy_from` duplicates an
asset and its renderer (`AssetDatabase.CopyAsset` + rewired `m_RendererDataList`) for a third tier.

Test: `test_01_tiers.py`. Result: pass (final run); ConfigureTiers 15.4 s (31 PC edits, 29 Mobile
edits, plus `quality_props` `shadowmaskMode` PC 1 / Mobile 0); fresh-process readback 62 fields, 0
mismatches, 0 findings, shadowmask modes read back; enums read back as their values (`m_MSAA` 4 =
4x) with `__name` companions. Shadow maths: PC 68.3 texels/m in the first cascade, Mobile 34.1,
template PC (2048, 50 m, 4 cascades) 166.5; Manual example 51.2 vs 102.4; atlas 4 spots + 1 point at
256: 512 fails, 1024 fits.

## P2b. GPU Resident Drawer on the Forward+ PC tier (the whole chain)

```python
ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ConfigureTiers", {
    "tiers": [{"quality": "PC", "asset": "Assets/Settings/PC_RPAsset.asset", "asset_props": {"m_GPUResidentDrawerMode": 1}}],
    "graphics": {"brg_stripping": "KeepAll", "static_batching": {"StandaloneOSX": False}}})   # project-wide prerequisites
rep = ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ReportPipeline")["result"]          # fresh process
rep["graphics"]; [f for f in rep["findings"] if f["code"].startswith("urp.grd")]                   # must be empty
# then AgentProfile.PlayModeTimings before/after: draw_calls, batches, setpass_calls, main_thread_ms
```

Engine calls: `m_GPUResidentDrawerMode` (1 = Instanced Drawing), `m_BrgStripping` on
`ProjectSettings/GraphicsSettings.asset` through SerializedObject
(`EditorGraphicsSettings.batchRendererGroupShaderStrippingMode` is read-only; values
KeepIfEntitiesGraphics 0, StripAll 1, KeepAll 2),
`PlayerSettings.SetStaticBatchingForPlatform(BuildTarget, bool)`. ReportPipeline rules:
`urp.grd_path` (not Forward+ or Deferred+), `urp.grd_srp_batcher`, `urp.grd_brg_stripped` (error),
`urp.grd_static_batching` (warn), `urp.grd_mobile` (info: never GLES).

Test: `test_12_grd_tier.py` (900 cubes sharing one mesh, three URP Lit materials,
`LightingTestScenes.BuildManyPropsScene`). Result: pass. GRD mode alone raised
`urp.grd_brg_stripped` and `urp.grd_static_batching` (the template ships BRG KeepIfEntitiesGraphics
and static batching on); after the graphics edits the fresh-process report was clean. Editor Play
mode, 1920 x 1080 offscreen: draw calls and batches 2,455 to 38, SetPass 37 to 27, main thread 3.41
to 1.19 ms (first run); 2,439 to 22, SetPass 21 to 11, main thread 1.91 to 0.59 ms (full run, after
the tier profiles of P2c). The project's original GRD mode, BRG stripping and static batching were
restored. Draw calls are an Editor trend; the Frame Debugger's "Hybrid Batch Group" entries and a
development player are the verdict (scenario-unity-performance).

## P2c. Per-tier post on each URP asset's volume profile, SSAO and grading per tier

```python
ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ConfigureTiers", {"tiers": [
    {"quality": "PC", "asset": "Assets/Settings/PC_RPAsset.asset",
     "volume_profile": "Assets/Settings/Tiers/PC_TierProfile.asset", "volume_replace": True,
     "volume_overrides": {"Bloom": {"filter": "Gaussian", "highQualityFiltering": True},
                          "ProbeVolumesOptions": {"leakReductionMode": "Quality"}},
     "renderer_features": {"ScreenSpaceAmbientOcclusion": {"m_Settings.Downsample": True}}},
    {"quality": "Mobile", "asset": "Assets/Settings/Mobile_RPAsset.asset",
     "volume_profile": "Assets/Settings/Tiers/Mobile_TierProfile.asset", "volume_replace": True,
     "volume_overrides": {"Bloom": {"filter": "Kawase", "highQualityFiltering": False, "downscale": "Quarter", "maxIterations": 4},
                          "ProbeVolumesOptions": {"leakReductionMode": "Performance"}}}]})
rep = ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ReportPipeline")["result"]
lv["urp"]["volume_profile"], lv["urp"]["volume_profile_components"], lv["urp"]["renderers"][0]["features"][i]["settings"]
```

Rule: the scene volume holds the look (tonemapper, color adjustments, SMH, bloom threshold,
intensity, scatter, vignette); the tier profile holds the cost (bloom filter, HQ filtering,
downscale, iterations, DoF off, APV leak reduction). A parameter set in a scene volume wins on every
tier.

Engine calls: `UniversalRenderPipelineAsset.volumeProfile` (public setter),
`LightingPost.EnsureProfile` + `ApplyOverrides` (shared with SetupVolume; components added as
sub-assets), renderer features found by type or name, `ScriptableRendererFeature.SetActive`,
`m_Settings.*` through SerializedObject; ReportPipeline reads each asset's profile, each feature's
`m_Settings`, and flags `post.bloom_hq_mobile`, `post.dof_mobile`, `urp.ssao_mobile`,
`urp.opaque_texture_mobile`, `tiers.grading_mode_mismatch`, `tiers.lut_size_mismatch`.

Test: `test_13_tier_post_profiles.py`. Result: pass. Template fact: both template URP assets
reference `SampleSceneProfile.asset` (HQ bloom on), so the v0.2 rule flagged `post.bloom_hq_mobile`
on the untouched Mobile tier. Readback in a fresh process: one profile per tier, Mobile Bloom Kawase
/ no HQ / Quarter / 4, Leak Reduction Performance, PC SSAO Downsample true, no findings. Stack proof
on the outdoor scene (its global volume sets saturation 18 and no White Balance): the Mobile
profile's White Balance +40 applied (blue-minus-red 0.058 to -0.080) while its saturation -100 was
ignored (saturation 0.27 to 0.34: the scene's value won); both proof overrides removed after. Mobile
set to LDR grading raised `tiers.grading_mode_mismatch`; restored. Sheet:
`captures/tier_post_stack.png`. The 6.3 filters are `Bloom.filter` Gaussian, Dual, Kawase; their GPU
cost was not measured here (no phone): compare in a device capture.

## P3. Bookmarks, gray cards and the stage capture

```python
# once per scene (any job): AgentKit.AgentCapture.SaveBookmark("B_Street", pos, lookAt, 60f) and gray cards
# (URP Lit, _BaseColor = new Color(0.18f,0.18f,0.18f).gamma: linear albedo 0.18)
cap = ut_run.run_method(P, "AgentKit.Lighting.LightingCapture.CaptureStage",
                        {"scene": "Assets/Scenes/Lighting/OutdoorDay.unity", "stage": "s1",
                         "probes": ["GreyCard_Sun", "GreyCard_Shade"], "quality": "PC"}, graphics=True)
rev = L.stage_review(cap, previous=prev_rev)     # image_checks + card EV + flags + contact sheet
assert rev["errors"] == 0; print(rev["flags"]); # then OPEN rev["sheet"]
L.annotate(shot_png, {k: v["rect_px"] for k, v in shot["probes"].items() if v["visible"]}, "/abs/check.png")
```

Engine calls: `EditorSceneManager.OpenScene`, `QualitySettings.SetQualityLevel(i, true)`, per
bookmark `AgentCapture.CaptureView` (template camera copy, `RenderPipeline.SubmitRenderRequest` into
an sRGB RenderTexture, warm-up frame, `ReadPixels`, `EncodeToPNG`); probe rectangles from
`Camera.WorldToViewportPoint` of the renderer bounds (central 50%, PNG top-left origin) and
visibility by `Physics.Raycast`.

Scene builders used by the tests: `LightingScenes.BuildOutdoorDemo` (village square, 32 renderers,
poles 10 m apart, 2 cards, dynamic capsule, 4 bookmarks) and `BuildInteriorDemo` (room with 0.3 m
walls, window, door, baked lamp, 2 cards, chrome ball, 4 bookmarks). Both use Cube, Cylinder and
Sphere only: `CreatePrimitive(Plane)` and `(Quad)` have no uv2 (observed).

v0.2: the envelope also carries `global_keywords` read after the last shot (`_CLUSTER_LIGHT_LOOP` =
Forward+ or Deferred+ ran, `SHADOWS_SHADOWMASK` = a Shadowmask mode, `LIGHTMAP_SHADOW_MIXING` =
Shadowmask or Subtractive, not Distance Shadowmask), which P13 uses.

Test: `test_02_outdoor.py`, `test_03_interior.py`. Result: pass, 4 shots per stage in 8 to 14 s per
job, 0 errors; the annotated capture shows the rectangle on the card
(`captures/outdoor_s1_street_probes.png`). Stage flags fired as designed: cards moving more than 1
EV after the bake and after the ACES switch, saturation falling 21 to 22% when the zone exposure was
raised.

## P4. Exposure first, then lights (and again under the final tonemapper)

```python
# a) lookdev: fixed exposure + Neutral (URP 6.3 has Fixed exposure only)
ut_run.run_method(P, "AgentKit.Lighting.LightingPost.SetupVolume", {"scene": S, "profile": "Assets/Lighting/Profiles/Lookdev.asset",
                  "overrides": {"Tonemapping": {"mode": "Neutral"}, "ColorAdjustments": {"postExposure": 0.0}}, "replace": True})
# b) solve the sun from a capture WITHOUT tonemapping (the card reads scene-linear until it clips)
ev = rev0["best_probes"]["GreyCard_Sun"]["ev_vs_grey"]; sun = round(sun0 * 2 ** -ev, 3)
ut_run.run_method(P, "AgentKit.Lighting.LightingScenes.SetLights", {"scene": S, "lights": [{"name": "Sun", "intensity": sun}]})
# c) interiors: one exposure per zone in a local volume (priority 1)
ut_run.run_method(P, "AgentKit.Lighting.LightingPost.SetupVolume", {"scene": S, "profile": ".../InteriorExposure.asset",
                  "volume": "Interior Exposure", "global": False, "priority": 1,
                  "box": {"center": [0, 1.5, 0], "size": [8, 3, 6], "blend": 1.0},
                  "overrides": {"ColorAdjustments": {"postExposure": -0.5 - wall_card_ev}}})
# d) after choosing the final tonemapper: re-solve, iterating (the display response is not linear)
samples = [(zone_ev, wall_ev_under_aces)]
e = L.next_exposure(-0.5, samples)        # then capture, append (e, measured), repeat until within 0.25 EV
```

Engine calls: `VolumeProfile.Add(type)` + `AssetDatabase.AddObjectToAsset(component, profile)`
(without it the override vanishes on reload), `VolumeParameter.value` + `overrideState = true` by
reflection, `Volume.isGlobal / priority / blendDistance / sharedProfile`, `BoxCollider.isTrigger`,
`UniversalAdditionalCameraData.renderPostProcessing`;
`Light.intensity / colorTemperature / useColorTemperature`, `RenderSettings.sun / ambientMode`.

Tests: `test_02_outdoor.py` (s0, s1), `test_03_interior.py` (i2, i5). Result: pass. Outdoor (v0.2
run): sun 2.0 (the baseline's "1.5 to 2") read +1.03 EV on the card with no tonemapper and was
flagged (band -0.5..+0.5); solved sun 0.977 read +0.16 EV under Neutral. (v0.1 read +0.88 and solved
1.089: its s0 still had the Neutral tonemapper of the template's shared asset profile, see P2c.)
Interior after the bake: wall card -3.27 EV at exposure 0; zone Post Exposure +2.77 brought the wall
to -0.56 and the table to -0.66. ACES + grade moved the wall card -1.41 EV (i3 -0.61 to i4 -2.03); a
one-step re-solve overshoots (a 1.5 EV exposure change moved the card about 2.7 EV: slope about
1.76), hence `next_exposure` iterates: step 1 Post Exposure 4.30 put the wall at +0.65 EV, step 2
(secant) 3.64 at -0.37 (target -0.5, within 0.25). Offline: the secant converges in 2 to 3 steps on
a slope-1.76 response.

## P5. Headless bake with a report (lightmaps and APV)

```python
b = ut_run.run_method(P, "AgentKit.Lighting.LightingBake.Bake", {
        "scene": "Assets/Scenes/Lighting/Interior.unity", "gi": "lightmaps", "apv": True, "mode": "BakedIndirect",
        "preset": "final", "settings": {"lightmapMaxSize": 1024},          # memory fields: fix per platform first
        "probe_lit": ["MirrorBall"], "lightmap_scale": {"Outside_Ground": 0.1}}, graphics=True, timeout=3600)
r = b["result"]
r["bake_seconds"], r["lightmap_gpu_mb"], r["lightmap_disk_mb"], r["apv_mb_without_support"], r["bake_messages"]
r["settings_memory"], r["settings_bake_time"]                        # CC's split, as data
# outdoor, probes only: {"gi": "apv"}   (every renderer Receive GI = Light Probes, no lightmaps)
```

Before baking: `AuditLighting` (P9) for contributors, lightmap UVs, shaders that cannot show or feed
the bake and the Shadowmask channel budget; small lightmap receivers make bakes take hours (U25
[00:44:53]). Never in a `-nographics` editor: `Bake` throws "no graphics device" (P16).

Engine calls: get-or-create `LightingSettings` asset (`lightmapper = ProgressiveGPU`, `bakedGI`,
`mixedBakeMode`, samples, bounces, `filteringMode = Advanced`, `denoiserType* = OpenImage`,
`filterType* = ATrous`, `lightmapResolution`, `lightmapMaxSize`, `lightmapPadding`),
`Lightmapping.SetLightingSettingsForScene`,
`GameObjectUtility.SetStaticEditorFlags(ContributeGI | ReflectionProbeStatic | Occluder/OccludeeStatic)`
(no BatchingStatic: GRD wants static batching off), `MeshRenderer.receiveGI / scaleInLightmap`,
`m_LightProbeSystem = 1` on every level's asset, `ProbeVolume.mode = Global`, `ReflectionProbe`
(Baked, box), `Application.logMessageReceived` during `Lightmapping.Bake()`; report from
`LightmapSettings.lightmaps` (`GraphicsFormatUtility.ComputeMipmapSize` per mip),
`Profiler.GetRuntimeMemorySizeLong`, `Lightmapping.GetLightingDataAssetForScene`,
`ProbeVolumeBakingSet` files (`*.bytes`). Refuses ProgressiveCPU on Apple Silicon.

Tests: `test_02_outdoor.py`, `test_03_interior.py`, `test_10_mobile_interior.py` (Shadowmask).
Result: pass. Outdoor APV only: first bake 28.5 s (cold GI cache), 5.0 to 8.7 s on reruns; 14.26 MB
of baking-set files, 7.26 MB without the debug support data; 31 renderers probe-lit, 1 dynamic, 0
lightmaps; both quality levels switched to Adaptive Probe Volumes. Interior lightmaps + APV for
dynamic objects: 6.0, 7.4 and 15.0 s on three runs (the GPU was shared with other agents' editors);
one 512 x 512 set (color + directional, RGB BC6H), 0.67 MB GPU with mips, 2.04 MB of source files on
disk; 20 renderers lightmapped, 3 probe-lit (chrome ball and pedestal by name, the 0.4 m table card
by size); the Global APV for dynamic objects added 5.1 to 5.4 MB (2.6 to 2.9 MB without support
data). Shadowmask mode (P11): 13.4 s, a third 512 x 512 texture (shadowmask, B4G4R4A4) took the set
to 1.33 MB GPU. No bake warnings; OpenImageDenoise ran on Apple Silicon. Presets: preview (8
texels/unit, 64 samples, 2 bounces, Auto filter) and final (20 texels/unit, 256 indirect and
environment, 4 bounces, A-Trous + OIDN).

## P6. Reflection probes per zone, checked with a chrome ball

```python
ut_run.run_method(P, "AgentKit.Lighting.LightingBake.Bake", dict(BAKE, reflection_probes=[
    {"name": "RP_Room", "center": [0, 1.5, 0], "size": [8, 3, 6], "importance": 2, "box_projection": True,
     "resolution": 128, "blend": 0.25}]), graphics=True)
rev = L.stage_review(capture_with_probes(["MirrorBall", "Table_Top"]))
rev["best_probes"]["MirrorBall"]["blue_minus_red"]      # <= 0 indoors: it reflects the room, not the sky
```

Engine calls: `ReflectionProbe.mode = Baked`, `size`, `boxProjection`, `importance`, `resolution`,
`blendDistance`; baked by `Lightmapping.Bake()`; `ReflectionProbe.bakedTexture` for the report.

Test: `test_03_interior.py` (i3). Result: pass; rebake 5.4 to 8 s, probe texture 0.25 MB (128 px
EXR). The robust signal is the mid-smooth wood: Table_Top blue-minus-red -0.07 before the probe,
-0.39 after (final run; -0.28 in an earlier run): the sky specular on smoothness 0.3 wood had been
reading gray-blue. The chrome ball went from +0.05 to -0.25 in one run, but rendered black from i3
on in the final run: Editor batch captures of baked reflection probes on metals are unreliable
(always black on the Forward path, sometimes on Forward+; 3 and 10 extra warm-up frames did not
help), while macOS players rendered them on both paths (P12). `stage_review` flags a black non-card
probe and points to P12.

## P7. APV leak ladder

```python
# 1. diagnose: dark references (corner bookmark, wall card) vs the lightmapped version of the room
# 2. geometry: wall thickness near the local probe spacing (a modeling fix, scenario-unity-world-building)
# 3. sampling biases and leak reduction, no rebake (runtime sampling):
ut_run.run_method(P, "AgentKit.Lighting.LightingPost.SetupVolume", {"scene": S, "profile": ".../APVOptions.asset",
    "volume": "APV Options", "priority": 2,
    "overrides": {"ProbeVolumesOptions": {"normalBias": 0.1, "viewBias": 0.175, "leakReductionMode": "Quality"}}})
# 4. Rendering Layer masks (max 4): Use Rendering Layers forced on every tier's asset, masks written into
#    the baking set, renderers assigned by name prefix, rebake (the set must exist: bake once with APV first)
ut_run.run_method(P, "AgentKit.Lighting.LightingBake.Bake", {"scene": S, "gi": "apv", "preset": "final", "apv_layers": {
    "masks": [{"name": "Interior", "mask": 2}, {"name": "Exterior", "mask": 1}],
    "renderers": {"Interior": ["Wall_", "Ceiling", "Floor", "Table_", "Crate_", "Shelf"], "Exterior": ["Outside_"]}}},
    graphics=True)["result"]["apv_layers"]["readback"]
# 5. last resort: ProbeAdjustmentVolume (mode Invalidate Probes, size over the leak), rebake     [not run]
```

Engine calls: `ProbeVolumesOptions.normalBias / viewBias / leakReductionMode`
(UnityEngine.Rendering, found by name), volume priority above the scene's global volume.

Test: `test_08_apv_leaks.py`. Result: pass as a measurement; APV-only copy of the room (11.1 s bake,
5.1 MB): the Options override (Normal Bias 0.1, View Bias 0.175, Leak Reduction Quality,
`APVLeakReductionMode` set by name) moved the gray cards by at most 0.06 EV and changed 7% of the
corner view's pixels. This room (0.3 m walls, 1 m minimum spacing, window lit) showed no measurable
leak to fix, so the rebake steps were not needed; the job path is proven, the leak case is not
reproduced. Step 4 (v0.2): `ProbeVolumeBakingSet.useRenderingLayers` and `renderingLayerMasks`
(`ProbeLayerMask {name, mask}`) are non-public but serialized, so the job writes them through
SerializedObject and reads them back. Result: pass; rebake 1.9 to 2.3 s, readback Interior 2 /
Exterior 1, 23 renderers assigned, APV data 5.09 to 5.40 MB (the baking set keeps its masks across
rebakes and scene rebuilds: the test's first bake passes `apv_layers: {"masks": []}` to start
clean); the room still showed no measurable leak (cards identical, 0.03% of corner pixels changed),
so the path is proven and the leak case is not reproduced. With Use Rendering Layers turned off on
the Mobile asset, both `AuditLighting` and `ReportPipeline` raised
`apv.masks_without_rendering_layers` (error); restored. Step 5 not run: the Probe Adjustment Volume
needs a located leak (GUI path in `gui-paths.md`).

## P8. Grade by data (the gray-after-bake fix)

```python
FINAL = {"Tonemapping": {"mode": "ACES"},
         "ColorAdjustments": {"postExposure": 0.35, "contrast": 12, "saturation": 18},     # outdoors: this volume owns exposure
         "ShadowsMidtonesHighlights": {"shadows": [1, 1, 1, -0.04], "midtones": [1, 1, 1, 0.04]},
         "Bloom": {"threshold": 1.0, "intensity": 0.35, "scatter": 0.6, "highQualityFiltering": False,
                   "downscale": "Half", "maxIterations": 5},
         "Vignette": {"intensity": 0.18, "smoothness": 0.4}}
ut_run.run_method(P, "AgentKit.Lighting.LightingPost.SetupVolume",
                  {"scene": S, "profile": "Assets/Lighting/Profiles/OutdoorFinal.asset", "overrides": FINAL, "replace": True})
rev3 = L.stage_review(capture, previous=rev2)     # saturation and std_luma up, clipped <= 5%, cards in band
```

Where a local zone volume sets Post Exposure at a higher priority, leave `postExposure` out of the
grade: parameters blend per parameter and the zone wins (observed in the interior). On a multi-tier
project, move the bloom cost fields (`highQualityFiltering`, `downscale`, `maxIterations`, `filter`)
out of this scene grade into the tier profiles (P2c): a scene value wins on every tier (observed,
test 13).

Tests: `test_02_outdoor.py` (s3, s4), `test_03_interior.py` (i4). Result: pass. Outdoor s2 to s3
(v0.2 run): saturation A_Wide 0.27 to 0.40 after s4, 0% clipped, sunlit card +0.27 EV; the critique
flagged the shade card 4.0 stops under the sunlit one (limit 4; 4.2 in v0.1), so s4 lowered contrast
to 4 and lifted the shadows band (+0.06): 3.3 stops, no flags. Interior i3 to i4: saturation up
(A_Room 0.363 to 0.548), clipped 0.1 to 3.2%, cards -1.4 to -1.6 EV (ACES), re-solved in P4 d.

## P9. Measure: frame time, audit, tiers side by side

```python
r = ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings", {"scene": S, "frames": 300, "warmup": 60,
                      "target_fps": 60, "width": 1920, "height": 1080}, graphics=True, quit=False, timeout=900)
summ = ut_stat.summarize_csv(r["result"]["csv"], target_ms=ut_stat.fps_to_ms(60))
a = ut_run.run_method(P, "AgentKit.Lighting.LightingAudit.AuditLighting", {"scene": S, "tier": "PC"})["result"]
pc = ut_run.run_method(P, "AgentKit.Lighting.LightingCapture.CaptureStage", {"scene": S, "stage": "tier", "quality": "PC"}, graphics=True)
mo = ut_run.run_method(P, "AgentKit.Lighting.LightingCapture.CaptureStage", {"scene": S, "stage": "tier", "quality": "Mobile"}, graphics=True)
ut_review.compare(pc_png, mo_png)       # + log-average EV and saturation deltas from stage_review metrics
```

Audit rules (engine calls): `Lightmapping.TryGetLightingSettings`, lights
(`Light.type/shadows/bounceIntensity/shadowStrength`, atlas maps spot 1 point 6), `Mesh.uv2` +
`ModelImporter.generateSecondaryUV`, `Renderer.bounds` vs `ReflectionProbe.bounds` for glossy
materials (`_Smoothness >= 0.8` or `_Metallic >= 0.5`), `Volume` priorities and `Tonemapping.mode`
(plus the Graphics default profile), `ProbeVolumeBakingSet.skyOcclusion` vs
`RenderSettings.ambientMode`, a scene-owned `LightingDataAsset` under `Assets/` (Unity 6 gives
unbaked scenes a default one), depth priming vs pass LightModes from `ShaderUtil.GetShaderData` (the
runtime `Shader.FindPassTagValue` missed URP Lit's passes in a `-nographics` editor).

Audit v2 rules (args `tier`, `mobile`, `style: "stylized"`, `max_shaders` 4):
`light.shadowmask_overlap` (more than 4 shadowed Mixed lights reach one lightmapped surface under
Shadowmask: point and spot range spheres vs `Renderer.bounds`, directional everywhere),
`light.shader_no_lightmap` / `light.shader_no_shadowmask` (`Shader.keywordSpace.keywordNames` lacks
`LIGHTMAP_ON` / `SHADOWS_SHADOWMASK` on a lightmapped renderer: the toon-shader trap),
`light.shader_no_meta` (no Meta LightMode on a Contribute GI renderer), `light.static_not_gi`
(static flags without Contribute GI in a baked scene), `apv.masks_without_rendering_layers`, and
with `style: "stylized"`: `style.lit_on_low_end`, `style.many_shaders`, `style.shadow_res_crisp`.
Observed keyword spaces: URP Lit and Simple Lit declare LIGHTMAP_ON, SHADOWS_SHADOWMASK,
LIGHTMAP_SHADOW_MIXING, PROBE_VOLUMES_L1/L2; URP Unlit declares SHADOWS_SHADOWMASK but no
LIGHTMAP_ON.

Tests: `test_06_profile_audit.py`, `test_04_tier_captures.py`, `test_07_audit_negative.py`,
`test_16_audit_v2_negative.py`. Results (final run): pass. Test 16: the trap scene (Shadowmask
settings, 1 directional + 5 point shadowed Mixed lights over one floor, a hand-written shader with
LIGHTMAP_ON and Meta but no SHADOWS_SHADOWMASK, one with neither, six opaque shaders, an
occluder-only static prop) raised all 7 expected codes on the Mobile tier and
`style.shadow_res_crisp` on PC (2048 + soft), the Meta rule named only the shader without a Meta
pass, and the lightmapped interior raised none of the shader, overlap or GI rules.

- Frame time, Editor Play mode, 1920 x 1080 offscreen, 300 frames: outdoor CPU frame p50 1.39 ms,
  p95 2.10, max 9.6, 0 hitches, 120 draw calls, 24 SetPass, 17.8k triangles; interior p50 1.31 ms,
  p95 4.11, 86 draw calls, 25 SetPass, 4.8k triangles; budget pass at 16.67 ms; GPU time not
  measured in the Editor (`bound_by` unknown), Render Thread counter missing; GC p50 88 B per frame
  in one scene and 244 KB in the other in this run (Editor noise: judge allocations in a development
  player).
- Audit: outdoor 0 findings; interior 0 errors, 0 warnings, 14 info (`light.stretched_lightmap` on
  scaled-cube walls and floor). Negative control (Plane floor lightmapped, chrome ball without
  probe, two shadowed directional lights, Indirect Multiplier 0, 3 point + 1 spot shadowed lights =
  19 maps, no tonemapper, no Lighting Settings, never baked): all 8 expected codes found.
- Tiers: outdoor views within 0.04 EV and 1% saturation between PC and Mobile (the poles beyond 30 m
  lose their small shadows on Mobile: 0.3% of pixels changed); interior views within 0.2 EV and 2%,
  except the chrome-ball view (the Editor Forward-path artifact, reported, not counted).

## P10. Depth Priming check for custom shaders

```python
a = ut_run.run_method(P, "AgentKit.Lighting.LightingAudit.AuditLighting", {"scene": S, "tier": "PC"})["result"]
[f for f in a["findings"] if f["code"] == "urp.depth_priming_missing_pass"]   # shaders that would vanish
# the fix belongs to scenario-unity-shaders: add DepthOnly and DepthNormals passes (LightMode tags), or keep priming Disabled
```

Engine calls: `UniversalRendererData.depthPrimingMode`, per opaque material shader
`ShaderUtil.GetShaderData(sh).GetSubshader(i).GetPass(j).FindTagValue(new ShaderTagId("LightMode"))`.

Test: `test_05_depth_priming.py` (two hand-written URP unlit shaders, with and without the depth
passes; PC renderer toggled and restored). Result: pass. MSAA off + priming Disabled: both spheres
rendered. MSAA off + priming Forced: the forward-only sphere was invisible (its rectangle showed the
ground, sRGB 0.59 gray), the one with DepthOnly and DepthNormals rendered. MSAA 4x + Forced: both
rendered (priming is not supported with MSAA, so it silently switched off). The audit named only
`AgentTests/UnlitNoDepth` (URP Lit correctly passed). Sheet: `captures/depth_priming_sheet.png`.

## P11. Mobile tier on interiors: shadow bias, then bake the sun

```python
# 1. template Mobile asset: m_ShadowDepthBias 1, m_ShadowNormalBias 1 -> lower to the PC values
ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ConfigureTiers", {"tiers": [{"quality": "Mobile",
    "asset": "Assets/Settings/Mobile_RPAsset.asset", "asset_props": {"m_ShadowDepthBias": 0.1, "m_ShadowNormalBias": 0.5}}]})
# 2. static interior: bake the sun's static shadows for mobile, keep realtime on PC
ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ConfigureTiers", {"tiers": [
    {"quality": "Mobile", "asset": "Assets/Settings/Mobile_RPAsset.asset", "quality_props": {"shadowmaskMode": 0}},
    {"quality": "PC", "asset": "Assets/Settings/PC_RPAsset.asset", "quality_props": {"shadowmaskMode": 1}}]})
ut_run.run_method(P, "AgentKit.Lighting.LightingBake.Bake", dict(BAKE, mode="Shadowmask"), graphics=True)
# 3. low end: Subtractive (sun direct light and static shadows in the lightmap, no shadowmask texture,
#    realtime shadows only from dynamic casters; tune RenderSettings.subtractiveShadowColor)
ut_run.run_method(P, "AgentKit.Lighting.LightingBake.Bake", dict(BAKE, mode="Subtractive"), graphics=True)
```

Engine calls: serialized `m_ShadowDepthBias` / `m_ShadowNormalBias` on the URP asset;
`m_QualitySettings.Array.data[i].shadowmaskMode` (0 Shadowmask: static shadows baked everywhere,
realtime map for dynamic casters; 1 Distance Shadowmask);
`LightingSettings.mixedBakeMode = Shadowmask`.

Test: `test_10_mobile_interior.py` (v0.2: starts from its own Baked Indirect bake, so it no longer
depends on the state test 3 leaves). Result: pass. Leak score (near-white pixels in the upper half
of the corner view that are not near-white on PC): template bias 1 / 1: 1,723 in the full run (1,708
standalone, 1,820 in v0.1; a sawtooth line of sun along the right wall-ceiling joint); bias 0.1 /
0.5: 9 (22); Shadowmask bake with the Mobile level on Shadowmask: 0 (4), and the stair-stepped sun
patch became the smooth baked one; Subtractive: 0. Cost: Shadowmask 1.33 MB GPU (a 512 x 512
B4G4R4A4 shadowmask added 0.67 MB), Subtractive 0.67 MB (no shadowmask texture), bakes 4.6 and 3.4
s. Sheet: `captures/mobile_interior_ladder.png`.

## P12. Re-check a tier-only oddity in a real player

```python
L.install_player_capture(P)                  # runtime helper, VERIFICATION builds only (Assets/AgentKitRuntime/)
b = ut_run.build(P, "macos", out="Builds/macOS/LightTest.app", scenes=[S])
pc = L.player_capture(os.path.join(P, "Builds/macOS/LightTest.app"), "/abs/player_D_Ball.png", view="D_Ball")
pc["written"], pc["quality"], pc["levels"], pc["cluster_light_loop"]      # which level and path actually ran
```

Engine calls: `BuildPipeline.BuildPlayer` (AgentBuild), the player started with
`-batchmode -agentOut <png> -agentView <bookmark> [-agentQuality <level>]`; the helper
(`[RuntimeInitializeOnLoadMethod]`) moves `Camera.main` to `AgentView_<view>`, waits 10 frames,
`Camera.Render()` into a RenderTexture, `EncodeToPNG`, logs
`AGENT_PLAYER_CAPTURE ... quality=... levels=... cluster_light_loop=...`
(`Shader.IsKeywordEnabled("_CLUSTER_LIGHT_LOOP")`: Forward+ ran), `Application.Quit`.

Test: `test_09_player_reflection.py` (PC renderer built once as Forward+ and once as Forward,
restored after). Result: pass. Build 6.5 to 26.6 s incremental (144 s the first time, 117 MB). Both
players rendered the chrome ball's box-probe reflection (center sRGB 0.85/0.71/0.55 on both), with
`cluster_light_loop` True for Forward+ and False for Forward, so the Editor's black ball is an
Editor batch artifact. The macOS player contained only the PC level (`levels=PC`): a level not
enabled for Standalone cannot be selected in that player, so switch the renderer of an included
level to test a path. Remove the helper (or keep it out of the shipping profile) before shipping.

## P13. Which Lighting Mode does each tier really render (Distance Shadowmask on Forward+)

```python
ut_run.run_method(P, "AgentKit.Lighting.LightingScenes.BuildShadowmaskRangeDemo", {"path": S})   # casters at 11 m and 45 m
tier = lambda path, mode, dist=None: ut_run.run_method(P, "AgentKit.Lighting.LightingPipeline.ConfigureTiers", {"tiers": [{
    "quality": "PC", "asset": PC, "renderer_props": {"renderingMode": path}, "quality_props": {"shadowmaskMode": mode},
    **({"asset_props": {"m_ShadowDistance": dist}} if dist else {})}]})
tier("ForwardPlus", 1, 20.0)                                   # Max Distance 20 m: the far caster is beyond it
ut_run.run_method(P, "AgentKit.Lighting.LightingBake.Bake", {"scene": S, "gi": "lightmaps", "mode": "Shadowmask"}, graphics=True)
PAIRS = [("Patch_Lit_Near", "Patch_Shadow_Near"), ("Patch_Lit_Far", "Patch_Shadow_Far")]
cap = ut_run.run_method(P, "AgentKit.Lighting.LightingCapture.CaptureStage", {"scene": S, "quality": "PC",
                        "probes": [p for pair in PAIRS for p in pair]}, graphics=True)
L.shadow_contrast(cap, PAIRS), cap["result"]["global_keywords"]
# rotate the sun without rebaking (LightingScenes.SetLights rotation [40, 270, 0]) and capture again:
# realtime shadows follow the sun, baked ones stay
```

Engine calls: `m_QualitySettings.Array.data[i].shadowmaskMode`,
`UniversalRendererData.renderingMode`, `LightingSettings.mixedBakeMode`, `Shader.IsKeywordEnabled`
after the render.

Test: `test_11_distance_shadowmask.py`. Result: pass; this answers the Y3 open question. Contrast in
stops (near, far), sun as baked / sun rotated 180 degrees without a rebake: control Baked Indirect
on Forward+ 1.93 / 0.04 (no far shadow: nothing beyond Max Distance); Distance Shadowmask on
Forward+ 1.93, 1.89 / 0.10, 1.89 (near shadow moved with the sun: realtime; far stayed: baked);
Distance Shadowmask on Forward identical; Shadowmask on Forward+ 1.93, 1.89 / 1.94, 1.89 (static
shadows baked everywhere). Full run: control 1.96 / 0.05, Distance Shadowmask 1.96, 1.99 / 0.06,
1.99 on both paths, Shadowmask 1.96, 1.99 / 1.97, 1.99. Keywords: Distance Shadowmask
SHADOWS_SHADOWMASK on, LIGHTMAP_SHADOW_MIXING off; Shadowmask both on; `_CLUSTER_LIGHT_LOOP` on
Forward+ only. So in 6000.3.21f1 Distance Shadowmask works on Forward+ despite the feature table's
"Forward rendering path only" (the same table says that of MSAA, which Forward+ supports). Bakes 5.6
and 9.1 s (2.7 and 3.2 s in the full run); the shadowmask added 2.67 MB on this 80 m ground at
preview density. Sheet: `captures/shadowmask_range_sheet.png`. Run the same check for Deferred or
Deferred+ tiers (the Manual says to avoid Subtractive and Shadowmask with Deferred).

## P14. Native render pass audit (the Render Graph Viewer's merge line, from code)

```python
r = ut_run.run_method(P, "AgentKit.Lighting.LightingCapture.PassAudit",
                      {"scene": S, "quality": "Mobile", "view": "B_Street"}, graphics=True)
s = L.pass_summary(r)
s["graphs"][0]["native_pass_count"], s["graphs"][0]["opaque_sky_transparent_one_pass"], s["graphs"][0]["natives"]
```

Engine calls: one `AgentCapture.CaptureView`, then `RenderGraph.GetRegisteredRenderGraphs()` and, by
reflection (no public API in 6.3), `nativeCompiler.contextData.nativePassData` (`firstGraphPass`,
`numGraphPasses`, size, samples, attachments), `passData` (`culled`, `nativePassIndex`, `type`) and
`passNames`. `available: false` with the error if a later version renames them. `break_reason` read
NotOptimized for every pass in these batch runs: do not rely on it.

Test: `test_14_pass_audit.py` (Mobile tier, outdoor scene, Metal). Result: pass. Depth Texture off:
6 native passes, DrawOpaqueObjects + DrawSkybox + DrawTransparentObjects (+ Setup PostFX) in one, at
1088 x 612 (render scale 0.85), MSAA 2. Depth copy After Opaques: 8, opaque + skybox split from
transparents. After Transparents: 7, the three draws merged again, Copy Depth after them. Opaque
Texture on: 7, split again, plus a Copy Color pass. PC tier (Forward+, SSAO, depth After Opaques): a
DrawDepthNormalPrepass and Blit SSAO, then the three draws merged. Bloom shows as "Blit Bloom
Mipmaps (Kawase)" on the Mobile profile. The Viewer attached to the phone (6.3) and a device GPU
capture remain the verdict for store and load cost.

## P15. PSO tracing and progressive warm-up (shader hitches on phones)

```python
L.install_pso_warmup(P)                                   # scripts/Runtime/AgentPSOWarmup.cs, development/verification builds
b = ut_run.build(P, "macos", out="Builds/macOS/PSOTest.app", scenes=[S], development=True)   # tracing needs a development build
tr = L.pso_run(app, "trace", "/abs/outdoor_metal.graphicsstate", frames=120)   # BeginTrace, render, EndTrace, SaveToFile
wu = L.pso_run(app, "warm", "/abs/outdoor_metal.graphicsstate", per_frame=3)   # LoadFromFile, WarmUpProgressively(3) per frame
```

Engine calls (`UnityEngine.Experimental.Rendering.GraphicsStateCollection`): `BeginTrace()`,
`EndTrace()`, `SaveToFile(path)`, `LoadFromFile(path)`, `WarmUpProgressively(count, JobHandle)`
completed next frame, `isWarmedUp`, `variantCount`, `totalGraphicsStateCount`,
`completedWarmupCount`; `SendToEditor` exists for connected development players. In a shipping game
the warm-up runs behind the loading screen with a progress bar from
`completedWarmupCount / totalGraphicsStateCount` (Unite 2025 K3-wPnhmDi4 [00:17:11] to [00:19:48]).

Test: `test_17_pso_player.py`. Result: pass. macOS development player (315 to 325 MB, 14 to 26 s
incremental build), Metal, identical in both runs: 120 traced frames recorded 14 variants and 14
graphics states; the warm-up run loaded them and warmed all 14 in 5 frames (3 per frame, 17 ms). Not
run: phone traces (one per graphics API and device family; Vulkan and GLES need an Android device,
Metal on iPhone needs an iOS device), which belong to scenario-unity-mobile.

## P16. The plain command line, and the -nographics bake refusal

```python
raw = L.raw_command(P, "AgentKit.Lighting.LightingPipeline.ReportPipeline")     # writes <job>/args.json
subprocess.run(raw["cmd"], timeout=900)          # raw["shell"] for a terminal or CI
env = ut_run.parse_agent_result(open(raw["log"]).read())                         # or <job>/result.json
# Unity -batchmode -nographics -quit -projectPath P -logFile <job>/unity.log -executeMethod <method> -agentJob <job>
```

Test: `test_15_raw_cli_nographics.py`. Result: pass. The raw command ran in 5.5 to 8.7 s, exit code
0, AGENT_RESULT parsed, `result.json` written, 2 levels reported. `LightingBake.Bake` without
`graphics=True` failed fast with "no graphics device (editor started with -nographics)" instead of
reporting an empty bake.

---

## Offline tests

`test_offline.py` (system python3, no Unity): shadow density (Manual example), atlas plan (Manual
example, 19-map overflow), region stats (sRGB 118 reads 0 EV, top-left origin, sky tint), secant
exposure solver, tier check, best probes; v0.2: shadow contrast in stops, pass summary merge
detection, raw command shape. Result: 14 tests OK. Whole suite:
`tests/code/unity-rendering-lighting/run_all.sh` (offline, then 10 live tests in order, about 20
minutes with other agents' editors running): final run 2026-09-24 20:36 to 20:56, 38 of 38 live
result rows pass. All Python byte-compiles; all C# compiles with 0 errors and 0 CS0618 warnings in
the test project (`LightingSettings.autoGenerate` removed after the first compile flagged it). v0.2
full run 2026-09-24 21:44 to 21:58 (offline, then tests 1 to 17): 46 of 46 live result rows pass, 0
C# errors or warnings from the skill's code; test 8 was then made rerun-safe (masks cleared on its
first bake) and rerun alone: pass.
