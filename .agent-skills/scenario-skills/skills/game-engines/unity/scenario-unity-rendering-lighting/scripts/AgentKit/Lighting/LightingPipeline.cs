// AgentKit.Lighting v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24). URP pipeline assets and
// quality tiers from code.
//
// Jobs (-nographics is fine for both):
//   AgentKit.Lighting.LightingPipeline.ReportPipeline   args: none. Which URP asset each quality
//       level renders with (its own or the Graphics default), the key asset and renderer fields,
//       per-platform default levels, the per-tier volume profile on each asset, renderer features
//       with their settings, GRD prerequisites (BatchRendererGroup Variants, static batching), and
//       findings (mobile bandwidth traps, STP + MSAA, the full GRD chain, post disabled with HDR,
//       SSAO / opaque texture / HQ bloom / DoF on a mobile tier, grading mode or LUT size differing
//       between tiers, APV masks without Use Rendering Layers). Run it FIRST, and again in a fresh
//       process as the readback check.
//   AgentKit.Lighting.LightingPipeline.ConfigureTiers   args: tiers [{quality, asset, copy_from?,
//       asset_props {...}, renderer_props {...}, quality_props {"shadowmaskMode": 0},
//       renderer_features {"ScreenSpaceAmbientOcclusion": {"active": false, "m_Settings.Downsample": true}},
//       volume_profile "Assets/Settings/Mobile_Tier.asset", volume_overrides {"Bloom": {...}},
//       volume_replace false}], platform_defaults {"Standalone": "PC", ...},
//       graphics {"brg_stripping": "KeepAll", "static_batching": {"StandaloneOSX": false}}.
//       Keys "m_..." are serialized fields (read-only in C#), others public properties. The volume
//       profile on the URP asset sits between the Graphics default profile and scene volumes (Unity 6
//       stack, HCXCmHgV7Sk [00:30:06]): per-tier post lives there.
// Why: URP asset fields such as soft shadows, additional-light shadows, the light probe system or
// mixed lighting have no public setter in URP 17.3 (observed 2026-09-24), and a quality level
// whose slot is None silently renders with the Graphics default (URP settings tutorial, HCXCmHgV7Sk
// [00:03:14]).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Lighting
{
    public static class LightingPipeline
    {
        /// <summary>URP asset fields reported by ReportPipeline (serialized names, URP 17.3).</summary>
        public static readonly string[] AssetFields =
        {
            "m_RequireDepthTexture", "m_RequireOpaqueTexture", "m_SupportsHDR", "m_HDRColorBufferPrecision", "m_MSAA",
            "m_RenderScale", "m_UpscalingFilter", "m_LightProbeSystem", "m_ProbeVolumeSHBands", "m_ShEvalMode",
            "m_MainLightRenderingMode", "m_MainLightShadowsSupported", "m_MainLightShadowmapResolution",
            "m_AdditionalLightsRenderingMode", "m_AdditionalLightsPerObjectLimit", "m_AdditionalLightShadowsSupported",
            "m_AdditionalLightsShadowmapResolution", "m_AdditionalLightsShadowResolutionTierLow",
            "m_AdditionalLightsShadowResolutionTierMedium", "m_AdditionalLightsShadowResolutionTierHigh",
            "m_ReflectionProbeBlending", "m_ReflectionProbeBoxProjection", "m_ShadowDistance", "m_ShadowCascadeCount",
            "m_Cascade2Split", "m_Cascade3Split", "m_Cascade4Split", "m_CascadeBorder", "m_ShadowDepthBias", "m_ShadowNormalBias",
            "m_SoftShadowsSupported", "m_SoftShadowQuality", "m_ConservativeEnclosingSphere", "m_UseSRPBatcher",
            "m_SupportsDynamicBatching", "m_MixedLightingSupported", "m_SupportsLightLayers", "m_StoreActionsOptimization",
            "m_ColorGradingMode", "m_ColorGradingLutSize", "m_GPUResidentDrawerMode", "m_SupportsTerrainHoles",
            "m_EnableLODCrossFade", "m_SupportsLightCookies", "m_UseFastSRGBLinearConversion",
        };

        public static readonly string[] RendererFields =
        {
            "m_RenderingMode", "m_DepthPrimingMode", "m_CopyDepthMode", "m_ShadowTransparentReceive",
            "m_IntermediateTextureMode", "m_UseNativeRenderPass", "postProcessData",
        };

        public static Dictionary<string, object> DescribeAsset(UniversalRenderPipelineAsset a)
        {
            var d = new Dictionary<string, object>
            {
                { "path", AssetDatabase.GetAssetPath(a) },
                { "fields", LightingUtil.ReadFields(a, AssetFields) },
                { "is_stp_used", a.isStpUsed },
                { "msaa", a.msaaSampleCount },
                { "volume_profile", a.volumeProfile ? AssetDatabase.GetAssetPath(a.volumeProfile) : null },
                { "volume_profile_components", LightingPost.DescribeProfile(a.volumeProfile) },
            };
            var rs = new List<object>();
            foreach (var r in LightingUtil.AllRendererData(a))
            {
                var feats = new List<object>();
                foreach (var f in r.rendererFeatures)
                    if (f != null) feats.Add(new Dictionary<string, object> { { "name", f.name }, { "type", f.GetType().Name }, { "active", f.isActive }, { "settings", LightingUtil.ReadChildren(f, "m_Settings") } });
                rs.Add(new Dictionary<string, object>
                {
                    { "path", AssetDatabase.GetAssetPath(r) },
                    { "rendering_path", r.renderingMode.ToString() },
                    { "depth_priming", r.depthPrimingMode.ToString() },
                    { "depth_texture_mode", r.copyDepthMode.ToString() },
                    { "post_processing_enabled", r.postProcessData != null },
                    { "fields", LightingUtil.ReadFields(r, RendererFields) },
                    { "features", feats },
                });
            }
            d["renderers"] = rs;
            return d;
        }

        static Dictionary<string, object> PlatformDefaults()
        {
            var d = new Dictionary<string, object>();
            var qs = LightingUtil.QualitySettingsAsset();
            if (qs == null) return d;
            var map = new SerializedObject(qs).FindProperty("m_PerPlatformDefaultQuality");
            for (int i = 0; map != null && i < map.arraySize; i++)
            {
                var e = map.GetArrayElementAtIndex(i);
                var k = e.FindPropertyRelative("first");
                var v = e.FindPropertyRelative("second");
                if (k != null && v != null) d[k.stringValue] = v.intValue;
            }
            return d;
        }

        /// <summary>Project-wide prerequisites of the GPU Resident Drawer: BatchRendererGroup Variants
        /// (Keep All, or its variants are stripped from builds) and static batching per platform
        /// (GRD wants it off: URP asset Inspector warning, HCXCmHgV7Sk frame 00:10:47).</summary>
        public static Dictionary<string, object> GraphicsFacts()
        {
            var sb = new Dictionary<string, object>();
            foreach (var t in new[] { BuildTarget.StandaloneOSX, BuildTarget.Android, BuildTarget.iOS })
                sb[t.ToString()] = PlayerSettings.GetStaticBatchingForPlatform(t);
            return new Dictionary<string, object>
            {
                { "brg_stripping", UnityEditor.Rendering.EditorGraphicsSettings.batchRendererGroupShaderStrippingMode.ToString() },
                { "static_batching", sb },
            };
        }

        /// <summary>Rules a lighting TA checks on every URP asset. "mobile" marks assets used by a
        /// level that is the default for Android or iPhone, or whose level name contains "mobile".</summary>
        static void Flags(UniversalRenderPipelineAsset a, bool mobile, string where, AgentAudit.Findings f)
        {
            var so = new SerializedObject(a);
            int I(string n) => so.FindProperty(n).intValue;
            bool B(string n) => so.FindProperty(n).boolValue;
            float F(string n) => so.FindProperty(n).floatValue;
            if (B("m_SupportsHDR") && I("m_HDRColorBufferPrecision") == 1 && mobile)
                f.Add("warn", "urp.hdr64_mobile", where, "64-bit HDR on a mobile tier costs bandwidth (URP asset reference)", "32-bit unless Alpha Processing needs alpha");
            if (mobile && B("m_SoftShadowsSupported") && I("m_SoftShadowQuality") >= 3)
                f.Add("warn", "urp.soft_shadows_high_mobile", where, "soft shadows High (7x7 tent) on a mobile tier: high impact on tile-based GPUs", "off, or Low (4 PCF taps)");
            if (mobile && I("m_StoreActionsOptimization") == 2)
                f.Add("warn", "urp.store_actions_store", where, "Store Actions = Store significantly increases bandwidth on tile-based GPUs", "Auto");
            if (mobile && B("m_SupportsDynamicBatching"))
                f.Add("info", "urp.dynamic_batching", where, "dynamic batching on (deprecated in 6.5, obsolete in 6.6)", "SRP Batcher, instancing");
            if (mobile && B("m_RequireOpaqueTexture") && I("m_MSAA") > 1)
                f.Add("warn", "urp.msaa_opaque_texture", where, "Opaque Texture on with MSAA: MSAA is silently ignored on devices without StoreAndResolve", "turn Opaque Texture off on this tier, or accept no MSAA");
            if (a.isStpUsed && I("m_MSAA") > 1)
                f.Add("warn", "urp.stp_with_msaa", where, "STP forces TAA, which cannot run with MSAA: the MSAA setting is wasted", "MSAA Disabled on STP tiers");
            if (F("m_ShadowDistance") > 150)
                f.Add("info", "urp.shadow_distance_large", where, "main light shadow Max Distance " + F("m_ShadowDistance") + " m spreads the map thin", "set it to the farthest dynamic shadow the player sees; distance before resolution");
            if (I("m_GPUResidentDrawerMode") != 0)
            {
                var r0 = LightingUtil.RendererData(a);
                if (r0 != null && r0.renderingMode != RenderingMode.ForwardPlus && r0.renderingMode != RenderingMode.DeferredPlus)
                    f.Add("error", "urp.grd_path", where, "GPU Resident Drawer on but the renderer is " + r0.renderingMode + ": nothing is drawn through it", "Forward+ (scenario-unity-performance owns GRD)");
                if (!B("m_UseSRPBatcher"))
                    f.Add("error", "urp.grd_srp_batcher", where, "GPU Resident Drawer needs the SRP Batcher", "enable SRP Batcher");
                var brg = UnityEditor.Rendering.EditorGraphicsSettings.batchRendererGroupShaderStrippingMode.ToString();
                if (brg != "KeepAll")
                    f.Add("error", "urp.grd_brg_stripped", where, "GPU Resident Drawer on but BatchRendererGroup Variants = " + brg + ": its instanced variants are stripped from builds (6.3 Manual)", "Project Settings > Graphics > BatchRendererGroup Variants = Keep All (ConfigureTiers graphics.brg_stripping)");
                foreach (var t in mobile ? new[] { BuildTarget.Android, BuildTarget.iOS } : new[] { BuildTarget.StandaloneOSX })
                    if (PlayerSettings.GetStaticBatchingForPlatform(t))
                        f.Add("warn", "urp.grd_static_batching", where, "GPU Resident Drawer on with static batching on for " + t + ": static batches bypass the drawer (Inspector warning)", "Player > Static Batching off (ConfigureTiers graphics.static_batching)");
                if (mobile)
                    f.Add("info", "urp.grd_mobile", where, "GPU Resident Drawer on a mobile tier: needs compute, never OpenGL ES (disabled there); measure on the device", "keep it for Vulkan/Metal devices, verify batches in a development player");
            }
            if (mobile && B("m_RequireOpaqueTexture"))
                f.Add("warn", "urp.opaque_texture_mobile", where, "Opaque Texture on a mobile tier: a colour copy that splits the native render pass (store and reload on tilers)", "off unless a shader samples _CameraOpaqueTexture; audit with LightingCapture.PassAudit");
            var vp = a.volumeProfile;
            if (mobile && vp != null)
            {
                if (vp.TryGet<Bloom>(out var bl) && bl.active && bl.highQualityFiltering.overrideState && bl.highQualityFiltering.value)
                    f.Add("warn", "post.bloom_hq_mobile", AssetDatabase.GetAssetPath(vp), "Bloom High Quality Filtering on the mobile tier profile (SBS [00:02:24])", "off; Downscale Half or Quarter, Max Iterations about 5, try the 6.3 Kawase or Dual filter");
                if (vp.TryGet<DepthOfField>(out var dof) && dof.active && dof.mode.overrideState && dof.mode.value != DepthOfFieldMode.Off)
                    f.Add("warn", "post.dof_mobile", AssetDatabase.GetAssetPath(vp), "Depth of Field on the mobile tier profile: an extra full-screen pass and camera depth stops being memoryless (U25 [00:33:35])", "off on phones");
            }
            foreach (var r in LightingUtil.AllRendererData(a))
            {
                var rp = AssetDatabase.GetAssetPath(r);
                if (r.postProcessData == null && B("m_SupportsHDR"))
                    f.Add("warn", "urp.post_off_with_hdr", rp, "post-processing disabled on the renderer: no tonemapping, HDR lighting clips (HCXCmHgV7Sk [00:30:41])", "enable Post-processing on the renderer");
                if (r.depthPrimingMode != DepthPrimingMode.Disabled)
                {
                    if (mobile) f.Add("warn", "urp.depth_priming_mobile", rp, "depth priming on a mobile tier: not supported on TBDR mobile at runtime, Auto unsupported on Android/iOS", "Disabled on mobile; depth prepass is a PC/console tool");
                    if (I("m_MSAA") > 1) f.Add("warn", "urp.depth_priming_msaa", rp, "depth priming is not supported with MSAA", "disable one of them");
                    f.Add("info", "urp.depth_priming_custom_shaders", rp, "depth priming on: custom opaque shaders without DepthOnly and DepthNormals passes render invisible", "run AuditLighting (checks scene shaders)");
                }
                if (mobile && (r.renderingMode == RenderingMode.Deferred || r.renderingMode == RenderingMode.DeferredPlus))
                    f.Add("info", "urp.deferred_mobile", rp, "Deferred on a mobile tier: G-buffer passes; cheap only where G-buffers stay memoryless (Metal, Vulkan framebuffer fetch)", "Forward for budget mobile (Unite 2025 K3-wPnhmDi4 [00:19:48])");
                foreach (var feat in r.rendererFeatures)
                    if (mobile && feat != null && feat.isActive && feat.GetType().Name.Contains("AmbientOcclusion"))
                        f.Add("info", "urp.ssao_mobile", rp, "SSAO active on a mobile tier: extra full-screen passes that break tile merging (1 to 2 ms per full-screen pass on a Quest 2-class tiler, RK [00:14:30])", "off on phones, or Downsample + After Opaque; one more APV subdivision in key areas substitutes for contact AO (APV24 [00:25:24])");
                if (mobile && B("m_RequireDepthTexture") && r.copyDepthMode == CopyDepthMode.AfterOpaques)
                    f.Add("warn", "urp.depth_copy_after_opaques_mobile", rp, "Depth Texture copied After Opaques on a mobile tier: store and reload of the colour buffer (worse with MSAA)", "After Transparents, or Depth Texture off");
            }
        }

        public static void ReportPipeline()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var defaults = PlatformDefaults();
                var names = QualitySettings.names;
                var mobileLevels = new HashSet<int>();
                foreach (var k in new[] { "Android", "iPhone" })
                    if (defaults.TryGetValue(k, out var v)) mobileLevels.Add(System.Convert.ToInt32(v));
                var levels = new List<object>();
                for (int i = 0; i < names.Length; i++)
                {
                    var asset = LightingUtil.ResolvedAsset(i, out bool fallback);
                    bool mobile = mobileLevels.Contains(i) || names[i].ToLowerInvariant().Contains("mobile");
                    var lvlProp = new SerializedObject(LightingUtil.QualitySettingsAsset()).FindProperty("m_QualitySettings").GetArrayElementAtIndex(i);
                    var entry = new Dictionary<string, object>
                    {
                        { "index", i }, { "name", names[i] }, { "falls_back_to_graphics_default", fallback },
                        { "shadowmask_mode", lvlProp.FindPropertyRelative("shadowmaskMode")?.intValue },
                        { "asset", asset ? AssetDatabase.GetAssetPath(asset) : null }, { "mobile_tier", mobile },
                    };
                    if (fallback)
                        f.Add("warn", "quality.level_without_asset", names[i], "quality level has no pipeline asset: it renders with the Graphics default, so edits to other assets change nothing here", "assign one URP asset per level");
                    if (asset is UniversalRenderPipelineAsset urp)
                    {
                        entry["urp"] = DescribeAsset(urp);
                        Flags(urp, mobile, AssetDatabase.GetAssetPath(urp), f);
                    }
                    levels.Add(entry);
                }
                // cross-tier: one grading mode and one LUT size for every tier (LDR applies a LUT after
                // tonemapping, SBS frame 00:03:31; LUT sizes cannot be mixed, 6.3 Manual)
                var urps = Enumerable.Range(0, names.Length).Select(i => LightingUtil.ResolvedAsset(i, out _) as UniversalRenderPipelineAsset).Where(x => x != null).Distinct().ToList();
                if (urps.Select(x => x.colorGradingMode).Distinct().Count() > 1)
                    f.Add("warn", "tiers.grading_mode_mismatch", string.Join(", ", urps.Select(x => AssetDatabase.GetAssetPath(x))), "tiers grade in different modes (" + string.Join("/", urps.Select(x => x.colorGradingMode.ToString())) + "): a LUT or grade tuned under HDR looks different under LDR, so the tiers drift apart", "one Grading Mode (HDR) on every tier");
                if (urps.Select(x => x.colorGradingLutSize).Distinct().Count() > 1)
                    f.Add("warn", "tiers.lut_size_mismatch", string.Join(", ", urps.Select(x => AssetDatabase.GetAssetPath(x))), "tiers use different LUT sizes: decide the size before grading starts, sizes cannot be mixed", "one LUT Size (32) on every tier");
                // APV rendering layer masks need Use Rendering Layers on every asset that renders them
                foreach (var guid in AssetDatabase.FindAssets("t:ProbeVolumeBakingSet"))
                {
                    var set = AssetDatabase.LoadAssetAtPath<ProbeVolumeBakingSet>(AssetDatabase.GUIDToAssetPath(guid));
                    if (set == null || !(bool)LightingUtil.BakingSetLayers(set)["use_rendering_layers"]) continue;
                    foreach (var u in urps.Where(x => !new SerializedObject(x).FindProperty("m_SupportsLightLayers").boolValue))
                        f.Add("error", "apv.masks_without_rendering_layers", AssetDatabase.GetAssetPath(u), "baking set " + set.name + " uses APV Rendering Layer Masks but this URP asset has Use Rendering Layers off (6.3 Manual, APV light leaks)", "m_SupportsLightLayers true on every tier's asset");
                }
                return new Dictionary<string, object>
                {
                    { "graphics", GraphicsFacts() },
                    { "active_level", names[QualitySettings.GetQualityLevel()] },
                    { "graphics_default", GraphicsSettings.defaultRenderPipeline ? AssetDatabase.GetAssetPath(GraphicsSettings.defaultRenderPipeline) : null },
                    { "current", GraphicsSettings.currentRenderPipeline ? AssetDatabase.GetAssetPath(GraphicsSettings.currentRenderPipeline) : null },
                    { "color_space", PlayerSettings.colorSpace.ToString() },
                    { "platform_defaults", defaults },
                    { "levels", levels },
                    { "findings", f.items }, { "counts", f.Counts() },
                };
            });
        }

        /// <summary>Copy a URP asset and its default renderer to a new path, rewiring the copy to the
        /// copied renderer (AssetDatabase.CopyAsset alone would share the renderer).</summary>
        public static UniversalRenderPipelineAsset CopyTier(string fromPath, string toPath)
        {
            var src = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(fromPath);
            if (src == null) throw new ArgumentException("copy_from not found: " + fromPath);
            if (!AssetDatabase.CopyAsset(fromPath, toPath)) throw new InvalidOperationException("CopyAsset failed: " + toPath);
            var dst = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(toPath);
            var r = LightingUtil.RendererData(src);
            if (r != null)
            {
                var rPath = AssetDatabase.GetAssetPath(r);
                var rDst = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(toPath), System.IO.Path.GetFileNameWithoutExtension(toPath) + "_Renderer.asset").Replace('\\', '/');
                if (!AssetDatabase.CopyAsset(rPath, rDst)) throw new InvalidOperationException("CopyAsset failed: " + rDst);
                var so = new SerializedObject(dst);
                var list = so.FindProperty("m_RendererDataList");
                list.arraySize = 1;
                list.GetArrayElementAtIndex(0).objectReferenceValue = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rDst);
                so.FindProperty("m_DefaultRendererIndex").intValue = 0;
                so.ApplyModifiedPropertiesWithoutUndo();
            }
            return dst;
        }

        public static void ConfigureTiers()
        {
            AgentJob.Run(() =>
            {
                var qs = LightingUtil.QualitySettingsAsset();
                var qso = new SerializedObject(qs);
                var levelsProp = qso.FindProperty("m_QualitySettings");
                var done = new List<object>();
                var created = new List<string>();
                foreach (var o in AgentJob.List("tiers"))
                {
                    var t = (Dictionary<string, object>)o;
                    var assetPath = (string)t["asset"];
                    var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(assetPath);
                    if (asset == null && t.TryGetValue("copy_from", out var cf)) { asset = CopyTier((string)cf, assetPath); created.Add(assetPath); }
                    if (asset == null) throw new ArgumentException("URP asset not found: " + assetPath);
                    var appliedAsset = LightingUtil.SetMembers(asset, t.TryGetValue("asset_props", out var ap) ? ap as Dictionary<string, object> : null);
                    var renderer = LightingUtil.RendererData(asset);
                    var appliedRenderer = LightingUtil.SetMembers(renderer, t.TryGetValue("renderer_props", out var rp) ? rp as Dictionary<string, object> : null);
                    // renderer features by type or object name: {"active": bool, "m_Settings.X": value}
                    var featureEdits = new List<object>();
                    if (t.TryGetValue("renderer_features", out var rfo) && rfo is Dictionary<string, object> rfd)
                        foreach (var kv in rfd)
                        {
                            var feat = renderer.rendererFeatures.FirstOrDefault(x => x != null && (x.GetType().Name == kv.Key || x.name == kv.Key));
                            if (feat == null) throw new ArgumentException("renderer " + renderer.name + " has no feature " + kv.Key);
                            var props = new Dictionary<string, object>((Dictionary<string, object>)kv.Value);
                            if (props.TryGetValue("active", out var act)) { feat.SetActive(LightingUtil.ToBool(act)); props.Remove("active"); featureEdits.Add(kv.Key + ".active=" + act); }
                            foreach (var e in LightingUtil.SetMembers(feat, props)) featureEdits.Add(kv.Key + "." + e);
                            EditorUtility.SetDirty(feat);
                        }
                    // per-tier volume profile on the URP asset (between the Graphics default and scene volumes)
                    Dictionary<string, object> profileState = null;
                    if (t.TryGetValue("volume_profile", out var vpo) && vpo is string vpPath && !string.IsNullOrEmpty(vpPath))
                    {
                        var prof = LightingPost.EnsureProfile(vpPath);
                        LightingPost.ApplyOverrides(prof, t.TryGetValue("volume_overrides", out var vo) ? vo as Dictionary<string, object> : null,
                                                    t.TryGetValue("volume_replace", out var vr) && LightingUtil.ToBool(vr));
                        asset.volumeProfile = prof;
                        EditorUtility.SetDirty(asset);
                        profileState = LightingPost.DescribeProfile(prof);
                    }
                    int level = LightingUtil.QualityIndex((string)t["quality"]);
                    var lvl = levelsProp.GetArrayElementAtIndex(level);
                    lvl.FindPropertyRelative("customRenderPipeline").objectReferenceValue = asset;
                    // per-level QualitySettings fields, e.g. {"shadowmaskMode": 0} (0 Shadowmask: static shadows
                    // baked everywhere; 1 Distance Shadowmask: realtime up to Max Distance)
                    var qualityEdits = new List<object>();
                    if (t.TryGetValue("quality_props", out var qp) && qp is Dictionary<string, object> qd)
                        foreach (var kv in qd)
                        {
                            var sp = lvl.FindPropertyRelative(kv.Key);
                            if (sp == null) throw new ArgumentException("quality level has no field " + kv.Key);
                            if (sp.propertyType == SerializedPropertyType.Boolean) sp.boolValue = LightingUtil.ToBool(kv.Value);
                            else if (sp.propertyType == SerializedPropertyType.Float) sp.floatValue = (float)AgentJson.ToDouble(kv.Value);
                            else sp.intValue = (int)AgentJson.ToDouble(kv.Value);
                            qualityEdits.Add(kv.Key + "=" + AgentJson.Serialize(kv.Value));
                        }
                    done.Add(new Dictionary<string, object>
                    {
                        { "quality", t["quality"] }, { "level", level }, { "asset", assetPath }, { "renderer", AssetDatabase.GetAssetPath(renderer) },
                        { "asset_edits", appliedAsset }, { "renderer_edits", appliedRenderer }, { "quality_edits", qualityEdits },
                        { "feature_edits", featureEdits }, { "volume_profile", profileState },
                    });
                }
                // per-platform default quality level (serialized map: BuildTargetGroup name -> level index)
                var pd = AgentJob.Dict("platform_defaults");
                if (pd.Count > 0)
                {
                    var map = qso.FindProperty("m_PerPlatformDefaultQuality");
                    foreach (var kv in pd)
                    {
                        int level = LightingUtil.QualityIndex(System.Convert.ToString(kv.Value));
                        bool found = false;
                        for (int i = 0; i < map.arraySize; i++)
                        {
                            var e = map.GetArrayElementAtIndex(i);
                            if (e.FindPropertyRelative("first").stringValue != kv.Key) continue;
                            e.FindPropertyRelative("second").intValue = level;
                            found = true;
                        }
                        if (!found)
                        {
                            map.arraySize++;
                            var e = map.GetArrayElementAtIndex(map.arraySize - 1);
                            e.FindPropertyRelative("first").stringValue = kv.Key;
                            e.FindPropertyRelative("second").intValue = level;
                        }
                    }
                }
                qso.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(qs);
                if (AgentJob.Has("graphics_default"))
                    GraphicsSettings.defaultRenderPipeline = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(AgentJob.Str("graphics_default"));
                // project-wide GRD prerequisites: BatchRendererGroup Variants (read-only in C#: serialized
                // m_BrgStripping on GraphicsSettings) and static batching per platform
                var gfx = AgentJob.Dict("graphics");
                var gfxEdits = new List<object>();
                if (gfx.TryGetValue("brg_stripping", out var brgo))
                {
                    var modeType = typeof(UnityEditor.Rendering.EditorGraphicsSettings).GetProperty("batchRendererGroupShaderStrippingMode").PropertyType;
                    int v = System.Convert.ToInt32(Enum.Parse(modeType, System.Convert.ToString(brgo), true));
                    var gso = new SerializedObject(LightingUtil.GraphicsSettingsAsset());
                    gso.FindProperty("m_BrgStripping").intValue = v;
                    gso.ApplyModifiedPropertiesWithoutUndo();
                    gfxEdits.Add("m_BrgStripping=" + brgo);
                }
                if (gfx.TryGetValue("static_batching", out var sbo) && sbo is Dictionary<string, object> sbd)
                    foreach (var kv in sbd)
                    {
                        PlayerSettings.SetStaticBatchingForPlatform((BuildTarget)Enum.Parse(typeof(BuildTarget), kv.Key, true), LightingUtil.ToBool(kv.Value));
                        gfxEdits.Add("static_batching." + kv.Key + "=" + kv.Value);
                    }
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "tiers", done }, { "created", created }, { "graphics_edits", gfxEdits }, { "note", "readback: run ReportPipeline in a fresh process" } };
            });
        }
    }
}
