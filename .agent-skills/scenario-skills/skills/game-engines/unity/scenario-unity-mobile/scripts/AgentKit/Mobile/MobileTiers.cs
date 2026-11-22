// scenario-unity-mobile v0.1 (Unity Expert Skills, 2026-09-24). Mobile quality tiers (one URP asset per
// Quality level) and the URP mobile audit, through serialization (field names read from the
// 6000.3.21f1 template YAML; a missing field throws instead of silently doing nothing).
//
// Jobs (batch: ut_run.run_method(P, "AgentKit.Mobile.MobileTiers.<Job>", args, build_target="Android")):
//   ApplyTiers      args: tiers [{name, rename_from?, source, asset, settings{}, quality{}}],
//                   renderer {path, settings{}}, platforms ["Android","iPhone"], default_tier, editor_current
//   AuditRendering  args: platforms (default Android, iPhone). Findings in the AgentAudit format.
// Friendly keys (see Map below) or raw m_* names are accepted in settings.
// Expert basis: Depth Priming Disabled on mobile, Store Actions Auto/Discard, Depth/Opaque
// texture off unless sampled, HDR 32-bit when needed, Additional Lights per vertex or off, soft
// shadows off, Native RenderPass on (6.3 Manual, "Configure for better performance in URP");
// a PC Quality level can stay active on an Android target (Unity, 2J0kDtUGlrY [frame 00:10:28]).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_tiers.py.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;

namespace AgentKit.Mobile
{
    public static class MobileTiers
    {
        const string QualityAssetPath = "ProjectSettings/QualitySettings.asset";

        static readonly Dictionary<string, string> AssetMap = new Dictionary<string, string>
        {
            { "depth_texture", "m_RequireDepthTexture" }, { "opaque_texture", "m_RequireOpaqueTexture" },
            { "hdr", "m_SupportsHDR" }, { "hdr_precision", "m_HDRColorBufferPrecision" }, { "msaa", "m_MSAA" },
            { "render_scale", "m_RenderScale" }, { "upscaling_filter", "m_UpscalingFilter" },
            { "lod_cross_fade", "m_EnableLODCrossFade" }, { "main_light", "m_MainLightRenderingMode" },
            { "main_shadow_resolution", "m_MainLightShadowmapResolution" },
            { "additional_lights", "m_AdditionalLightsRenderingMode" }, { "additional_lights_per_object", "m_AdditionalLightsPerObjectLimit" },
            { "additional_light_shadows", "m_AdditionalLightShadowsSupported" },
            { "probe_blending", "m_ReflectionProbeBlending" }, { "box_projection", "m_ReflectionProbeBoxProjection" },
            { "shadow_distance", "m_ShadowDistance" }, { "cascades", "m_ShadowCascadeCount" },
            { "soft_shadows", "m_SoftShadowsSupported" }, { "srp_batcher", "m_UseSRPBatcher" },
            { "store_actions", "m_StoreActionsOptimization" }, { "gpu_resident_drawer", "m_GPUResidentDrawerMode" },
            { "volume_update", "m_VolumeFrameworkUpdateMode" },
        };

        static readonly Dictionary<string, string> RendererMap = new Dictionary<string, string>
        {
            { "rendering_path", "m_RenderingMode" }, { "depth_priming", "m_DepthPrimingMode" },
            { "copy_depth", "m_CopyDepthMode" }, { "intermediate_texture", "m_IntermediateTextureMode" },
            { "native_render_pass", "m_UseNativeRenderPass" },
        };

        // enum words -> serialized int values, per field (URP 17.3 source enums)
        static Dictionary<string, int> W(params object[] kv)
        {
            var d = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < kv.Length; i += 2) d[(string)kv[i]] = (int)kv[i + 1];
            return d;
        }
        static readonly Dictionary<string, Dictionary<string, int>> EnumWords = new Dictionary<string, Dictionary<string, int>>
        {
            { "m_AdditionalLightsRenderingMode", W("disabled", 0, "per_pixel", 1, "per_vertex", 2) },   // LightRenderingMode
            { "m_MainLightRenderingMode", W("disabled", 0, "per_pixel", 1) },
            { "m_StoreActionsOptimization", W("auto", 0, "discard", 1, "store", 2) },
            { "m_VolumeFrameworkUpdateMode", W("every_frame", 0, "via_scripting", 1) },
            { "m_RenderingMode", W("forward", 0, "deferred", 1, "forward_plus", 2, "deferred_plus", 3) },
            { "m_DepthPrimingMode", W("disabled", 0, "auto", 1, "forced", 2) },
            { "m_CopyDepthMode", W("after_opaques", 0, "after_transparents", 1, "force_prepass", 2) },
            { "m_IntermediateTextureMode", W("auto", 0, "always", 1) },
            { "m_GPUResidentDrawerMode", W("disabled", 0, "instanced_drawing", 1) },
            { "m_HDRColorBufferPrecision", W("32", 0, "64", 1) },
            { "m_UpscalingFilter", W("auto", 0, "linear", 1, "point", 2, "fsr", 3, "stp", 4) },
        };

        // ------------------------------------------------------------------ ApplyTiers
        public static void ApplyTiers()
        {
            AgentJob.Run(() =>
            {
                var platforms = AgentJob.List("platforms").Select(p => p.ToString()).ToList();
                if (platforms.Count == 0) platforms = new List<string> { "Android", "iPhone" };
                var written = new List<object>();
                AssetDatabase.StartAssetEditing();
                var created = new List<string>();
                try
                {
                    foreach (var t in AgentJob.List("tiers").Cast<Dictionary<string, object>>())
                    {
                        var src = Get(t, "source", "Assets/Settings/Mobile_RPAsset.asset");
                        var dst = Get(t, "asset", null) ?? throw new ArgumentException("tier needs 'asset'");
                        if (AssetDatabase.LoadMainAssetAtPath(dst) == null)
                        {
                            if (!AssetDatabase.CopyAsset(src, dst)) throw new InvalidOperationException("CopyAsset failed " + src + " -> " + dst);
                            created.Add(dst);
                        }
                    }
                }
                finally { AssetDatabase.StopAssetEditing(); }
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

                var r = AgentJob.Dict("renderer");
                Dictionary<string, object> rendererResult = null;
                if (r != null && r.Count > 0)
                {
                    var rp = Get(r, "path", "Assets/Settings/Mobile_Renderer.asset");
                    var rd = AssetDatabase.LoadMainAssetAtPath(rp) ?? throw new System.IO.FileNotFoundException(rp);
                    rendererResult = WriteFields(rd, r.ContainsKey("settings") ? (Dictionary<string, object>)r["settings"] : new Dictionary<string, object>(), RendererMap);
                }

                var qsObj = AssetDatabase.LoadAllAssetsAtPath(QualityAssetPath)[0];
                var qso = new SerializedObject(qsObj);
                var levels = qso.FindProperty("m_QualitySettings") ?? throw new InvalidOperationException("m_QualitySettings not found");
                foreach (var t in AgentJob.List("tiers").Cast<Dictionary<string, object>>())
                {
                    var name = Get(t, "name", null) ?? throw new ArgumentException("tier needs 'name'");
                    var assetPath = Get(t, "asset", null);
                    var asset = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(assetPath) ?? throw new InvalidOperationException("not a render pipeline asset: " + assetPath);
                    var assetFields = WriteFields(asset, t.ContainsKey("settings") ? (Dictionary<string, object>)t["settings"] : new Dictionary<string, object>(), AssetMap);

                    int idx = IndexOf(levels, name);
                    var renameFrom = Get(t, "rename_from", null);
                    if (idx < 0 && renameFrom != null && IndexOf(levels, renameFrom) >= 0)
                    {
                        idx = IndexOf(levels, renameFrom);
                        levels.GetArrayElementAtIndex(idx).FindPropertyRelative("name").stringValue = name;
                    }
                    if (idx < 0)
                    {
                        levels.arraySize++;                           // duplicates the last level
                        idx = levels.arraySize - 1;
                        levels.GetArrayElementAtIndex(idx).FindPropertyRelative("name").stringValue = name;
                    }
                    var lvl = levels.GetArrayElementAtIndex(idx);
                    lvl.FindPropertyRelative("customRenderPipeline").objectReferenceValue = asset;
                    var q = t.ContainsKey("quality") ? (Dictionary<string, object>)t["quality"] : new Dictionary<string, object>();
                    foreach (var kv in q) SetProp(lvl.FindPropertyRelative(kv.Key) ?? throw new ArgumentException("quality field not found: " + kv.Key), kv.Value);
                    // mobile tiers: excluded from Standalone, included on the mobile platforms
                    var ex = lvl.FindPropertyRelative("excludedTargetPlatforms");
                    var exList = new List<string>();
                    for (int i = 0; i < ex.arraySize; i++) exList.Add(ex.GetArrayElementAtIndex(i).stringValue);
                    exList.RemoveAll(platforms.Contains);
                    if (!exList.Contains("Standalone")) exList.Add("Standalone");
                    ex.arraySize = exList.Count;
                    for (int i = 0; i < exList.Count; i++) ex.GetArrayElementAtIndex(i).stringValue = exList[i];
                    written.Add(new Dictionary<string, object> { { "level", name }, { "index", idx }, { "asset", assetPath }, { "fields", assetFields }, { "excluded", exList } });
                }

                // non-tier levels: exclude them from the mobile platforms so they are not shipped
                var tierNames = AgentJob.List("tiers").Cast<Dictionary<string, object>>().Select(t => (string)t["name"]).ToList();
                var excludedOthers = new List<string>();
                if (AgentJob.Bool("exclude_other_levels", true))
                    for (int i = 0; i < levels.arraySize; i++)
                    {
                        var lvl = levels.GetArrayElementAtIndex(i);
                        var n = lvl.FindPropertyRelative("name").stringValue;
                        if (tierNames.Contains(n)) continue;
                        var ex = lvl.FindPropertyRelative("excludedTargetPlatforms");
                        var exList = new List<string>();
                        for (int k = 0; k < ex.arraySize; k++) exList.Add(ex.GetArrayElementAtIndex(k).stringValue);
                        foreach (var p in platforms) if (!exList.Contains(p)) exList.Add(p);
                        ex.arraySize = exList.Count;
                        for (int k = 0; k < exList.Count; k++) ex.GetArrayElementAtIndex(k).stringValue = exList[k];
                        excludedOthers.Add(n);
                    }

                var def = AgentJob.Str("default_tier");
                var defaults = new Dictionary<string, object>();
                if (!string.IsNullOrEmpty(def))
                {
                    int di = IndexOf(levels, def);
                    if (di < 0) throw new ArgumentException("default_tier not found: " + def);
                    var map = qso.FindProperty("m_PerPlatformDefaultQuality") ?? throw new InvalidOperationException("m_PerPlatformDefaultQuality not found");
                    foreach (var p in platforms)
                    {
                        bool set = false;
                        for (int i = 0; i < map.arraySize; i++)
                        {
                            var e = map.GetArrayElementAtIndex(i);
                            var first = e.FindPropertyRelative("first");
                            if (first != null && first.stringValue == p) { e.FindPropertyRelative("second").intValue = di; set = true; }
                        }
                        if (!set) throw new InvalidOperationException("platform not in m_PerPlatformDefaultQuality: " + p);
                        defaults[p] = def;
                    }
                }
                var cur = AgentJob.Str("editor_current");
                if (!string.IsNullOrEmpty(cur)) qso.FindProperty("m_CurrentQuality").intValue = IndexOf(levels, cur);
                qso.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(qsObj);
                AssetDatabase.SaveAssets();
                if (!string.IsNullOrEmpty(cur)) QualitySettings.SetQualityLevel(Array.IndexOf(QualitySettings.names, cur), true);

                return new Dictionary<string, object>
                {
                    { "created_assets", created }, { "tiers", written }, { "renderer", rendererResult },
                    { "per_platform_default", defaults }, { "excluded_other_levels", excludedOthers },
                    { "quality_names", QualitySettings.names }, { "current_quality", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                };
            });
        }

        // ------------------------------------------------------------------ SetEditorQuality
        /// <summary>Make a tier the Editor's current Quality level (persisted in QualitySettings.asset),
        /// so Editor captures and Play-mode profiles use the mobile URP asset. A batch editor launched
        /// with -buildTarget Android keeps its current level (observed: "PC"); players use the
        /// per-platform default instead. args: name</summary>
        public static void SetEditorQuality()
        {
            AgentJob.Run(() =>
            {
                var name = AgentJob.Str("name") ?? throw new ArgumentException("name required");
                int idx = Array.IndexOf(QualitySettings.names, name);
                if (idx < 0) throw new ArgumentException("no Quality level '" + name + "' in " + string.Join(",", QualitySettings.names));
                var qsObj = AssetDatabase.LoadAllAssetsAtPath(QualityAssetPath)[0];
                var qso = new SerializedObject(qsObj);
                qso.FindProperty("m_CurrentQuality").intValue = idx;
                qso.ApplyModifiedPropertiesWithoutUndo();
                QualitySettings.SetQualityLevel(idx, true);
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "current", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                    { "pipeline", GraphicsSettings.currentRenderPipeline ? AssetDatabase.GetAssetPath(GraphicsSettings.currentRenderPipeline) : null },
                };
            });
        }

        // ------------------------------------------------------------------ AuditRendering
        public static void AuditRendering()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var platforms = AgentJob.List("platforms").Select(p => p.ToString()).ToList();
                if (platforms.Count == 0) platforms = new List<string> { "Android", "iPhone" };
                var qsObj = AssetDatabase.LoadAllAssetsAtPath(QualityAssetPath)[0];
                var qso = new SerializedObject(qsObj);
                var levels = qso.FindProperty("m_QualitySettings");
                var map = qso.FindProperty("m_PerPlatformDefaultQuality");
                var defaults = new Dictionary<string, object>();
                for (int i = 0; i < map.arraySize; i++)
                {
                    var e = map.GetArrayElementAtIndex(i);
                    var p = e.FindPropertyRelative("first").stringValue;
                    if (platforms.Contains(p)) defaults[p] = levels.GetArrayElementAtIndex(e.FindPropertyRelative("second").intValue).FindPropertyRelative("name").stringValue;
                }
                var levelFacts = new List<object>();
                bool androidGles = false, androidAutoApi = PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.Android);
                var androidApis = PlayerSettings.GetGraphicsAPIs(BuildTarget.Android).Select(a => a.ToString()).ToList();
                androidGles = androidApis.Any(a => a.StartsWith("OpenGLES"));
                if (androidAutoApi)
                    f.Add("info", "mobile.player.auto_graphics_api", "ProjectSettings:Android", "Auto Graphics API is on: shaders compile for every API (more variants, build time and size)",
                          "PlayerSettings.SetUseDefaultGraphicsAPIs(Android, false) + SetGraphicsAPIs (Vulkan, then OpenGLES3 only if min-spec needs it)");

                for (int i = 0; i < levels.arraySize; i++)
                {
                    var lvl = levels.GetArrayElementAtIndex(i);
                    var name = lvl.FindPropertyRelative("name").stringValue;
                    var ex = lvl.FindPropertyRelative("excludedTargetPlatforms");
                    var exList = new List<string>();
                    for (int k = 0; k < ex.arraySize; k++) exList.Add(ex.GetArrayElementAtIndex(k).stringValue);
                    var on = platforms.Where(p => !exList.Contains(p)).ToList();
                    if (on.Count == 0) continue;
                    var where = "Quality:" + name;
                    var rpa = lvl.FindPropertyRelative("customRenderPipeline").objectReferenceValue as RenderPipelineAsset ?? GraphicsSettings.defaultRenderPipeline;
                    var facts = new Dictionary<string, object> { { "level", name }, { "platforms", on }, { "vsync", lvl.FindPropertyRelative("vSyncCount").intValue } };
                    levelFacts.Add(facts);
                    if (lvl.FindPropertyRelative("vSyncCount").intValue > 0)
                        f.Add("info", "mobile.quality.vsync_ignored", where, "VSync Count is ignored on Android (the Quality inspector warns); mobile is effectively always vsynced, a missed refresh halves the frame rate",
                              "leave vSyncCount 0 and set Application.targetFrameRate per context");
                    if (rpa == null) { f.Add("error", "mobile.urp.no_asset", where, "no render pipeline asset for this level", "assign a mobile URP asset"); continue; }
                    var ap = AssetDatabase.GetAssetPath(rpa);
                    facts["asset"] = ap;
                    if (rpa.GetType().Name != "UniversalRenderPipelineAsset")
                    { f.Add("error", "mobile.urp.not_urp", where, "pipeline asset is " + rpa.GetType().Name, "URP for mobile"); continue; }
                    if (ap.IndexOf("PC", StringComparison.Ordinal) >= 0 || ap.IndexOf("Desktop", StringComparison.OrdinalIgnoreCase) >= 0)
                        f.Add("error", "mobile.urp.pc_asset_on_mobile", where, "a PC pipeline asset (" + ap + ") ships on " + string.Join(",", on),
                              "assign a mobile URP asset to this level, or exclude the level from mobile platforms");
                    var so = new SerializedObject(rpa);
                    int I(string n) => Req(so, n).intValue;
                    bool B(string n) => Req(so, n).boolValue;
                    float F(string n) => Req(so, n).floatValue;
                    int msaa = I("m_MSAA");
                    facts["depth_texture"] = B("m_RequireDepthTexture"); facts["opaque_texture"] = B("m_RequireOpaqueTexture");
                    facts["hdr"] = B("m_SupportsHDR"); facts["hdr_precision"] = I("m_HDRColorBufferPrecision") == 0 ? "32" : "64";
                    facts["msaa"] = msaa; facts["render_scale"] = F("m_RenderScale"); facts["upscaling_filter"] = I("m_UpscalingFilter");
                    facts["shadow_distance"] = F("m_ShadowDistance"); facts["cascades"] = I("m_ShadowCascadeCount");
                    facts["soft_shadows"] = B("m_SoftShadowsSupported"); facts["additional_lights"] = LightMode(I("m_AdditionalLightsRenderingMode"));
                    facts["additional_light_shadows"] = B("m_AdditionalLightShadowsSupported"); facts["srp_batcher"] = B("m_UseSRPBatcher");
                    facts["lod_cross_fade"] = B("m_EnableLODCrossFade"); facts["store_actions"] = new[] { "auto", "discard", "store" }[Mathf.Clamp(I("m_StoreActionsOptimization"), 0, 2)];
                    facts["gpu_resident_drawer"] = I("m_GPUResidentDrawerMode"); facts["main_shadow_resolution"] = I("m_MainLightShadowmapResolution");
                    facts["probe_blending"] = B("m_ReflectionProbeBlending"); facts["volume_update"] = I("m_VolumeFrameworkUpdateMode") == 1 ? "via_scripting" : "every_frame";

                    if (!B("m_UseSRPBatcher")) f.Add("error", "mobile.urp.srp_batcher_off", where, "SRP Batcher off", "enable SRP Batcher (keep shader variants and keywords few)");
                    if (B("m_RequireDepthTexture")) f.Add("warn", "mobile.urp.depth_texture", where, "Depth Texture on: an extra copy or prepass every frame", "off unless a shader or feature samples scene depth");
                    if (B("m_RequireOpaqueTexture")) f.Add("warn", "mobile.urp.opaque_texture", where, "Opaque Texture on: a full-screen copy every frame", "off unless a shader samples _CameraOpaqueTexture");
                    if (B("m_SupportsHDR") && I("m_HDRColorBufferPrecision") != 0) f.Add("warn", "mobile.urp.hdr_64bit", where, "HDR at 64-bit precision doubles colour bandwidth", "HDR Precision 32 Bit, or HDR off");
                    else if (B("m_SupportsHDR")) f.Add("info", "mobile.urp.hdr_on", where, "HDR on (32-bit)", "keep only if bloom or tonemapping need it; off saves bandwidth");
                    if (msaa >= 8) f.Add("warn", "mobile.urp.msaa_8x", where, "MSAA 8x", "2x or 4x at most on tile GPUs");
                    if (B("m_SoftShadowsSupported")) f.Add("warn", "mobile.urp.soft_shadows", where, "Soft Shadows on: high impact on tile-based GPUs (6.3 URP asset reference)", "off, or Soft Shadow Quality low");
                    if (B("m_AdditionalLightShadowsSupported")) f.Add("warn", "mobile.urp.additional_light_shadows", where, "additional light shadows on", "off on mobile tiers");
                    if (I("m_AdditionalLightsRenderingMode") == 1) f.Add("info", "mobile.urp.additional_lights_per_pixel", where, "Additional Lights Per Pixel", "Per Vertex or Disabled on low tiers (Forward)");
                    if (I("m_ShadowCascadeCount") > 2) f.Add("warn", "mobile.urp.cascades", where, I("m_ShadowCascadeCount") + " shadow cascades", "1 (or 2) cascades on mobile");
                    if (F("m_ShadowDistance") > 50f) f.Add("info", "mobile.urp.shadow_distance", where, "Max Shadow Distance " + F("m_ShadowDistance"), "shorten to what the camera needs (every metre costs shadow map texels)");
                    if (I("m_StoreActionsOptimization") == 2) f.Add("warn", "mobile.urp.store_actions_store", where, "Store Actions = Store (stores every render target: bandwidth)", "Auto or Discard");
                    if (F("m_RenderScale") > 1.0f) f.Add("warn", "mobile.urp.render_scale_above_1", where, "Render Scale " + F("m_RenderScale"), "<= 1 on phones; native resolution on high-DPI phones is rarely needed (e-book)");
                    if (B("m_EnableLODCrossFade")) f.Add("info", "mobile.urp.lod_cross_fade", where, "LOD Cross Fade on (uses alpha testing)", "off on low-end tiers (6.3 Manual)");
                    if (I("m_VolumeFrameworkUpdateMode") == 0) f.Add("info", "mobile.urp.volume_every_frame", where, "Volume Update Mode Every Frame", "Via Scripting when volumes are static, then CameraExtensions.UpdateVolumeStack(camera)");

                    var rlist = Req(so, "m_RendererDataList");
                    var rfacts = new List<object>();
                    for (int k = 0; k < rlist.arraySize; k++)
                    {
                        var rd = rlist.GetArrayElementAtIndex(k).objectReferenceValue;
                        if (rd == null) continue;
                        var rso = new SerializedObject(rd);
                        var rwhere = where + ":" + AssetDatabase.GetAssetPath(rd);
                        int mode = Req(rso, "m_RenderingMode").intValue, prime = Req(rso, "m_DepthPrimingMode").intValue;
                        int copy = Req(rso, "m_CopyDepthMode").intValue, inter = Req(rso, "m_IntermediateTextureMode").intValue;
                        bool nrp = Req(rso, "m_UseNativeRenderPass").boolValue;
                        rfacts.Add(new Dictionary<string, object>
                        {
                            { "path", AssetDatabase.GetAssetPath(rd) }, { "rendering_path", PathName(mode) },
                            { "depth_priming", new[] { "disabled", "auto", "forced" }[Mathf.Clamp(prime, 0, 2)] },
                            { "copy_depth", new[] { "after_opaques", "after_transparents", "force_prepass" }[Mathf.Clamp(copy, 0, 2)] },
                            { "intermediate_texture", inter == 0 ? "auto" : "always" }, { "native_render_pass", nrp },
                        });
                        if (prime != 0) f.Add("error", "mobile.urp.depth_priming", rwhere, "Depth Priming " + (prime == 1 ? "Auto" : "Forced") + " on a mobile renderer (Auto is not supported on Android/iOS; priming is unsupported on TBDR GPUs at runtime)",
                                              "Depth Priming Mode = Disabled for mobile renderers (6.3 Manual)");
                        if (!nrp) f.Add("warn", "mobile.urp.native_render_pass_off", rwhere, "Native RenderPass off: render targets go in and out of memory between passes", "enable Native RenderPass (Vulkan, Metal)");
                        if ((mode == 1 || mode == 3) && !nrp) f.Add("error", "mobile.urp.deferred_without_nrp", rwhere, "Deferred on tile GPUs without Native RenderPass: the G-buffer round-trips through memory (URP 17.3 uses framebuffer fetch only when Native RenderPass is on)",
                                                                    "enable Native RenderPass, or use Forward / Forward+");
                        if ((mode == 1 || mode == 3) && msaa > 1) f.Add("warn", "mobile.urp.deferred_msaa", rwhere, "MSAA is not supported with Deferred", "post AA (FXAA) or Forward");
                        if (mode == 1 || mode == 3) f.Add("info", "mobile.urp.deferred", rwhere, "Deferred path on a mobile tier", "Forward is the mobile default; Deferred only for many dynamic lights, and never with Rendering Layers (extra G-buffer target)");
                        if (inter == 1) f.Add("warn", "mobile.urp.intermediate_always", rwhere, "Intermediate Texture = Always (extra full-screen target)", "Auto, then confirm in the Frame Debugger that URP removed it");
                        if (Req(so, "m_RequireDepthTexture").boolValue && copy != 1) f.Add("info", "mobile.urp.copy_depth_mode", rwhere, "Depth Texture Mode is not After Transparents", "After Transparents avoids a render-target switch between opaques and transparents on mobile");
                        if (I("m_GPUResidentDrawerMode") != 0 && mode != 2 && mode != 3) f.Add("error", "mobile.urp.grd_inactive", rwhere, "GPU Resident Drawer on but the renderer is " + PathName(mode) + ": it silently does nothing", "Forward+ (and BatchRendererGroup Variants = Keep All), or turn GRD off");
                        if (I("m_GPUResidentDrawerMode") != 0 && androidGles) f.Add("warn", "mobile.urp.grd_gles", rwhere, "GPU Resident Drawer with OpenGLES in the Android API list (GRD needs compute, not GLES)", "Vulkan only, or accept GRD off on GLES devices");
                    }
                    facts["renderers"] = rfacts;
                }
                return new Dictionary<string, object>
                {
                    { "levels", levelFacts }, { "per_platform_default", defaults }, { "android_graphics_apis", androidApis },
                    { "android_auto_graphics_api", androidAutoApi }, { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                    { "editor_quality_level", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                    { "findings", f.items }, { "counts", f.Counts() },
                };
            });
        }

        // ------------------------------------------------------------------ helpers
        static string PathName(int mode) => mode == 0 ? "forward" : mode == 1 ? "deferred" : mode == 2 ? "forward_plus" : "deferred_plus";
        static string LightMode(int v) => v == 0 ? "disabled" : v == 1 ? "per_pixel" : "per_vertex";

        static SerializedProperty Req(SerializedObject so, string name)
            => so.FindProperty(name) ?? throw new InvalidOperationException("serialized field '" + name + "' not found on " + so.targetObject.name + " (URP version changed? dump the asset YAML)");

        static int IndexOf(SerializedProperty levels, string name)
        {
            for (int i = 0; i < levels.arraySize; i++)
                if (levels.GetArrayElementAtIndex(i).FindPropertyRelative("name").stringValue == name) return i;
            return -1;
        }

        static string Get(Dictionary<string, object> d, string k, string def) => d != null && d.TryGetValue(k, out var v) && v != null ? v.ToString() : def;

        static Dictionary<string, object> WriteFields(UnityEngine.Object target, Dictionary<string, object> settings, Dictionary<string, string> map)
        {
            var so = new SerializedObject(target);
            var res = new Dictionary<string, object>();
            foreach (var kv in settings)
            {
                var field = kv.Key.StartsWith("m_") ? kv.Key : (map.TryGetValue(kv.Key, out var m) ? m : throw new ArgumentException("unknown setting '" + kv.Key + "'"));
                var p = Req(so, field);
                SetProp(p, kv.Value);
                res[kv.Key] = kv.Value;
            }
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(target);
            AssetDatabase.SaveAssetIfDirty(target);
            return res;
        }

        static void SetProp(SerializedProperty p, object v)
        {
            switch (p.propertyType)
            {
                case SerializedPropertyType.Boolean: p.boolValue = v is bool b ? b : AgentJson.ToDouble(v) != 0; break;
                case SerializedPropertyType.Float: p.floatValue = (float)AgentJson.ToDouble(v); break;
                case SerializedPropertyType.Integer:
                case SerializedPropertyType.Enum:
                    if (v is string s && !double.TryParse(s, out _))
                    {
                        if (!EnumWords.TryGetValue(p.name, out var words) || !words.TryGetValue(s, out var iv))
                            throw new ArgumentException("unknown enum word '" + s + "' for " + p.name);
                        p.intValue = iv;
                    }
                    else p.intValue = (int)AgentJson.ToDouble(v);
                    break;
                case SerializedPropertyType.String: p.stringValue = v?.ToString(); break;
                default: throw new ArgumentException("unsupported property type " + p.propertyType + " for " + p.name);
            }
        }
    }
}
