// AgentKit.Lighting v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24). Read-only lighting audit
// of a scene against the active URP asset, in the core findings format
// {severity, code, path, message, fix}. Never saves.
//
// Job (-nographics is fine):
//   AgentKit.Lighting.LightingAudit.AuditLighting   args: scene, small_size (0.5 m), tier (quality
//       level to audit against; default the active one), mobile (default: tier name contains
//       "mobile"), style ("stylized" adds the stylized low-end rules), max_shaders (4)
// Rules (source in the message): Lighting Settings asset and lightmapper; lights (additional
// directional shadows, shadowed-light atlas budget with spot = 1 map and point = 6, Indirect
// Multiplier outside 0 to 1, shadow strength); static renderers without lightmap UVs, tiny
// lightmapped props, non-uniform scale; glossy materials outside every reflection probe;
// volumes (tonemapping with HDR, equal global priorities, camera effects in global volumes);
// Skybox ambient with APV sky occlusion; depth priming with custom shaders that lack DepthOnly or
// DepthNormals passes (they render invisible, 6.3 URP Manual). v0.2: more than 4 shadowed Mixed
// lights on one lightmapped surface under Shadowmask; shaders on GI renderers that cannot show
// lightmaps (no LIGHTMAP_ON), shadowmask (no SHADOWS_SHADOWMASK) or feed the bake (no Meta pass);
// static renderers left out of GI; APV Rendering Layer Masks without Use Rendering Layers;
// stylized low-end rules (Lit on a mobile tier, many shaders, shadow maps above 1024 with soft
// shadows).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Lighting
{
    public static class LightingAudit
    {
        static string PathOf(Component c)
        {
            var t = c.transform;
            var s = t.name;
            while (t.parent != null) { t = t.parent; s = t.name + "/" + s; }
            return c.gameObject.scene.name + ":" + s;
        }

        /// <summary>LightMode tags of every pass of a shader (URP: UniversalForward, ShadowCaster,
        /// DepthOnly, DepthNormals, Meta, ...), read from the compiled shader data
        /// (ShaderUtil.GetShaderData), which works without a graphics device. The runtime
        /// Shader.passCount / FindPassTagValue path missed URP Lit's passes in a -nographics editor
        /// (observed 2026-09-24), so it is only a fallback.</summary>
        public static HashSet<string> LightModes(Shader sh)
        {
            var res = new HashSet<string>();
            if (sh == null) return res;
            var tag = new ShaderTagId("LightMode");
            var data = ShaderUtil.GetShaderData(sh);
            if (data != null)
                for (int s = 0; s < data.SubshaderCount; s++)
                {
                    var sub = data.GetSubshader(s);
                    for (int p = 0; p < sub.PassCount; p++)
                    {
                        var v = sub.GetPass(p).FindTagValue(tag);
                        res.Add(string.IsNullOrEmpty(v.name) ? "<none>" : v.name);
                    }
                }
            if (res.Count == 0)
                for (int i = 0; i < sh.passCount; i++)
                {
                    var v = sh.FindPassTagValue(i, tag);
                    res.Add(string.IsNullOrEmpty(v.name) ? "<none>" : v.name);
                }
            return res;
        }

        /// <summary>URP additional-light shadow atlas: spot = 1 map, point = 6 (cube faces); up to 16
        /// maps per atlas; 1 map fills it, 2 to 4 tile 2x2, 5 to 16 tile 4x4 (6.3 Manual, URP e-book).</summary>
        public static Dictionary<string, object> AtlasBudget(int spots, int points, int atlas, int tierRes)
        {
            int maps = spots + 6 * points;
            int grid = maps <= 1 ? 1 : maps <= 4 ? 2 : 4;
            int perMap = atlas / grid;
            bool overflow = maps > 16 || perMap < tierRes;
            return new Dictionary<string, object>
            {
                { "maps", maps }, { "grid", grid + "x" + grid }, { "max_per_map_px", maps > 16 ? atlas / 4 : perMap },
                { "requested_px", tierRes }, { "overflow", overflow },
            };
        }

        public static void AuditLighting()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene");
                var scene = string.IsNullOrEmpty(scenePath) ? EditorSceneManager.GetActiveScene() : EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                if (AgentJob.Has("tier")) QualitySettings.SetQualityLevel(LightingUtil.QualityIndex(AgentJob.Str("tier")), false);
                var f = new AgentAudit.Findings();
                var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
                var facts = new Dictionary<string, object> { { "scene", scene.path }, { "urp_asset", urp ? AssetDatabase.GetAssetPath(urp) : null } };
                var so = urp ? new SerializedObject(urp) : null;

                // --- lighting settings
                bool hasLs = Lightmapping.TryGetLightingSettings(out var ls);   // the getter throws when none is assigned
                facts["lighting_settings"] = hasLs;
                if (!hasLs)
                    f.Add("warn", "light.no_lighting_settings", scene.path, "no Lighting Settings asset: bakes use defaults and the scene cannot be tuned per platform", "Lighting window > New Lighting Settings, or LightingBake.Bake");
                else
                {
                    facts["lightmapper"] = ls.lightmapper.ToString();
                    if (ls.lightmapper == LightingSettings.Lightmapper.ProgressiveCPU && SystemInfo.processorType.Contains("Apple"))
                        f.Add("error", "light.cpu_lightmapper_apple", scene.path, "Progressive CPU lightmapper selected: unsupported on Apple Silicon", "ProgressiveGPU");
                    if (ls.bakedGI && ls.indirectSampleCount < 256)
                        f.Add("info", "light.low_samples", scene.path, "indirect samples " + ls.indirectSampleCount + " (< 256): fine for previews, denoisers smear below about 256 (6.3 Manual)", "final bake at 256+");
                }

                // --- lights
                var lights = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None);
                var sun = RenderSettings.sun;
                int shadowedSpots = 0, shadowedPoints = 0, mixed = 0;
                var lightFacts = new List<object>();
                foreach (var l in lights)
                {
                    lightFacts.Add(LightingScenes.DescribeLight(l));
                    var p = PathOf(l);
                    if (l.lightmapBakeType == LightmapBakeType.Mixed) mixed++;
                    if (l.type == LightType.Directional && l != sun && l.shadows != LightShadows.None && lights.Count(x => x.type == LightType.Directional && x.shadows != LightShadows.None) > 1)
                        f.Add("warn", "light.extra_directional_shadows", p, "URP does not render shadows from additional directional lights", "spot or point light for extra shadows");
                    if (l.lightmapBakeType != LightmapBakeType.Baked && l.shadows != LightShadows.None)
                    {
                        if (l.type == LightType.Spot) shadowedSpots++;
                        if (l.type == LightType.Point) shadowedPoints++;
                    }
                    if (l.lightmapBakeType != LightmapBakeType.Realtime && (l.bounceIntensity <= 0f || l.bounceIntensity > 1f))
                        f.Add("warn", "light.indirect_multiplier", p, "Indirect Multiplier " + l.bounceIntensity + ": 0 bakes no bounce, above 1 breaks energy conservation (6.3 Manual)", "keep 0 < value <= 1");
                    if (l.shadows != LightShadows.None && l.shadowStrength < 0.8f)
                        f.Add("info", "light.shadow_strength", p, "shadow strength " + l.shadowStrength.ToString("0.00") + ": a fake ambient fill (Kyle Banks uses about 0.9 for readability); fix GI and exposure first (Pierre Yves Donzallaz keeps shadows black)", null);
                }
                facts["lights"] = lightFacts;
                if (urp != null && (shadowedSpots + shadowedPoints) > 0)
                {
                    bool addShadows = so.FindProperty("m_AdditionalLightShadowsSupported").boolValue;
                    int atlas = so.FindProperty("m_AdditionalLightsShadowmapResolution").intValue;
                    int tier = so.FindProperty("m_AdditionalLightsShadowResolutionTierMedium").intValue;
                    var bud = AtlasBudget(shadowedSpots, shadowedPoints, atlas, tier);
                    facts["additional_shadow_atlas"] = bud;
                    if (!addShadows)
                        f.Add("warn", "light.additional_shadows_off", facts["urp_asset"] as string, (shadowedSpots + shadowedPoints) + " realtime spot/point lights want shadows but the URP asset has additional-light shadows off", "enable on tiers that can afford it, or bake those lights");
                    else if ((bool)bud["overflow"])
                        f.Add("warn", "light.shadow_atlas_overflow", facts["urp_asset"] as string, "shadow maps " + bud["maps"] + " (spot 1, point 6) at " + tier + " px do not fit a " + atlas + " atlas: URP shrinks every map and logs a warning", "bigger atlas, fewer shadowed point lights, or bake them");
                }
                if (urp != null && so.FindProperty("m_ShadowDistance").floatValue > 0)
                    facts["shadow_distance_m"] = so.FindProperty("m_ShadowDistance").floatValue;

                // --- renderers
                float small = AgentJob.Float("small_size", 0.5f);
                int noUv2 = 0, tinyLm = 0, contrib = 0;
                var glossy = new List<Renderer>();
                foreach (var mr in UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
                {
                    var p = PathOf(mr);
                    var flags = GameObjectUtility.GetStaticEditorFlags(mr.gameObject);
                    bool gi = (flags & StaticEditorFlags.ContributeGI) != 0;
                    if (gi) contrib++;
                    var mf = mr.GetComponent<MeshFilter>();
                    var mesh = mf ? mf.sharedMesh : null;
                    if (gi && mr.receiveGI == ReceiveGI.Lightmaps && mesh != null && mesh.uv2.Length == 0)
                    {
                        bool gen = false;
                        var mp = AssetDatabase.GetAssetPath(mesh);
                        if (AssetImporter.GetAtPath(mp) is ModelImporter mi) gen = mi.generateSecondaryUV;
                        if (!gen)
                        {
                            noUv2++;
                            f.Add("error", "light.no_lightmap_uv", p, "lightmapped mesh '" + mesh.name + "' has no lightmap UVs (uv2); built-in Plane and Quad primitives have none", "Generate Lightmap UVs (Margin Method Calculate), author UV1, use a Cube, or Receive GI = Light Probes");
                        }
                    }
                    var ext = mr.bounds.size;
                    if (gi && mr.receiveGI == ReceiveGI.Lightmaps && Mathf.Max(ext.x, Mathf.Max(ext.y, ext.z)) < small)
                    {
                        tinyLm++;
                        f.Add("info", "light.small_lightmapped", p, "small prop (" + Mathf.Max(ext.x, Mathf.Max(ext.y, ext.z)).ToString("0.00") + " m) takes lightmap space and bake time", "Receive GI = Light Probes (Ciro Continisio hMnetI4-dNY [00:48:30])");
                    }
                    var ls3 = mr.transform.lossyScale;
                    if (gi && mr.receiveGI == ReceiveGI.Lightmaps && mesh != null && mesh.uv2.Length > 0 && (Mathf.Abs(ls3.x - ls3.y) > 0.01f * Mathf.Abs(ls3.x) || Mathf.Abs(ls3.x - ls3.z) > 0.01f * Mathf.Abs(ls3.x)) && Mathf.Max(ls3.x, Mathf.Max(ls3.y, ls3.z)) / Mathf.Max(0.001f, Mathf.Min(ls3.x, Mathf.Min(ls3.y, ls3.z))) > 8f)
                        f.Add("info", "light.stretched_lightmap", p, "non-uniform scale x" + (Mathf.Max(ls3.x, Mathf.Max(ls3.y, ls3.z)) / Mathf.Max(0.001f, Mathf.Min(ls3.x, Mathf.Min(ls3.y, ls3.z)))).ToString("0") + ": lightmap texels stretch (area distortion)", "model the proportions, or check the Baked Lightmap draw mode");
                    foreach (var m in mr.sharedMaterials)
                    {
                        if (m == null) continue;
                        float sm = m.HasProperty("_Smoothness") ? m.GetFloat("_Smoothness") : 0f;
                        float me = m.HasProperty("_Metallic") ? m.GetFloat("_Metallic") : 0f;
                        if (sm >= 0.8f || me >= 0.5f) { glossy.Add(mr); break; }
                    }
                }
                facts["static_gi_renderers"] = contrib;
                // --- reflection probes cover glossy surfaces
                var probes = UnityEngine.Object.FindObjectsByType<ReflectionProbe>(FindObjectsSortMode.None);
                facts["reflection_probes"] = probes.Length;
                foreach (var g in glossy)
                {
                    bool covered = probes.Any(rp => rp.bounds.Contains(g.bounds.center));
                    if (!covered)
                        f.Add("warn", "light.glossy_without_probe", PathOf(g), "glossy or metallic surface outside every reflection probe: it reflects the sky, also indoors (Kyle Banks 1agSNKuAfTM [00:17:21])", "box-projected reflection probe per lighting zone, importance above the exterior probe");
                }
                // --- volumes
                var vols = UnityEngine.Object.FindObjectsByType<Volume>(FindObjectsSortMode.None);
                bool anyTonemap = vols.Any(v => v.sharedProfile && v.sharedProfile.TryGet<Tonemapping>(out var tm) && tm.active && tm.mode.overrideState && tm.mode.value != TonemappingMode.None);
                var gdp = LightingPost.GraphicsDefaultProfile();
                if (!anyTonemap && gdp != null && gdp.TryGet<Tonemapping>(out var gtm) && gtm.mode.value != TonemappingMode.None) anyTonemap = true;
                facts["tonemapping"] = anyTonemap;
                if (urp != null && urp.supportsHDR && !anyTonemap)
                    f.Add("warn", "post.no_tonemapping", scene.path, "HDR on and no tonemapper in any volume: highlights clip ('terrible', Pierre Yves Donzallaz yqCHiZrgKzs [01:01:29])", "Tonemapping Neutral for lookdev, ACES or Neutral for the final look");
                foreach (var g in vols.Where(v => v.isGlobal).GroupBy(v => v.priority).Where(g => g.Count() > 1))
                    f.Add("warn", "post.equal_priority", scene.path, "global volumes with equal priority " + g.Key + ": creation order decides", "Global 0, locals 1+ (URP e-book)");
                foreach (var v in vols.Where(v => v.isGlobal && v.sharedProfile))
                    if (v.sharedProfile.TryGet<DepthOfField>(out var dof) && dof.active && dof.mode.overrideState && dof.mode.value != DepthOfFieldMode.Off)
                        f.Add("info", "post.global_dof", PathOf(v), "depth of field in a global volume also blurs Scene view captures", "local volume on the camera (Pierre Yves Donzallaz yqCHiZrgKzs [00:16:03])");
                // --- environment
                facts["ambient_mode"] = RenderSettings.ambientMode.ToString();
                var bakingSets = AssetDatabase.FindAssets("t:ProbeVolumeBakingSet").Select(AssetDatabase.GUIDToAssetPath).Select(AssetDatabase.LoadAssetAtPath<ProbeVolumeBakingSet>).Where(b => b != null && b.sceneGUIDs.Contains(AssetDatabase.AssetPathToGUID(scene.path))).ToList();
                if (bakingSets.Any(b => b.skyOcclusion) && RenderSettings.ambientMode == AmbientMode.Skybox)
                    f.Add("warn", "light.sky_occlusion_skybox", scene.path, "APV sky occlusion with Skybox ambient: URP updates the ambient probe at runtime only in Color or Gradient mode", "Environment Lighting Source Color/Gradient driven by script (URP e-book)");
                // Unity 6 gives every new scene a default Lighting Data Asset (EBL), so "no LDA" is not the
                // test: a bake leaves a scene-owned LDA under Assets/ (observed 2026-09-24).
                var lda = Lightmapping.GetLightingDataAssetForScene(scene);
                var ldaPath = lda ? AssetDatabase.GetAssetPath(lda) : null;
                facts["lighting_data_asset"] = string.IsNullOrEmpty(ldaPath) ? (lda ? "<default, not an asset file>" : null) : ldaPath;
                bool baked = !string.IsNullOrEmpty(ldaPath) && ldaPath.StartsWith("Assets/");
                facts["baked"] = baked;
                if (!baked && mixed + lights.Count(l => l.lightmapBakeType == LightmapBakeType.Baked) > 0)
                    f.Add("warn", "light.not_baked", scene.path, "Mixed or Baked lights but the scene has never been baked: indirect light and the Skybox ambient probe are not baked (Unity 6 does not auto-bake)", "Generate Lighting (LightingBake.Bake)");
                // --- v0.2: Shadowmask channel budget (4 shadowed Mixed lights per texel, 6.3 Manual)
                bool shadowmaskMode = hasLs && ls.bakedGI && ls.mixedBakeMode == MixedLightingMode.Shadowmask;
                var mixedShadowed = lights.Where(l => l.isActiveAndEnabled && l.lightmapBakeType == LightmapBakeType.Mixed && l.shadows != LightShadows.None).ToList();
                facts["mixed_shadowed_lights"] = mixedShadowed.Count;
                int maxOverlap = 0;
                var mrs = UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None);
                bool GiOn(MeshRenderer mr) => (GameObjectUtility.GetStaticEditorFlags(mr.gameObject) & StaticEditorFlags.ContributeGI) != 0;
                if (shadowmaskMode && mixedShadowed.Count > 4)
                    foreach (var mr in mrs.Where(m => GiOn(m) && m.receiveGI == ReceiveGI.Lightmaps))
                    {
                        var b = mr.bounds;
                        var hits = mixedShadowed.Where(l => l.type == LightType.Directional ||
                            ((l.type == LightType.Point || l.type == LightType.Spot) && b.SqrDistance(l.transform.position) <= l.range * l.range)).ToList();
                        maxOverlap = Math.Max(maxOverlap, hits.Count);
                        if (hits.Count > 4)
                            f.Add("warn", "light.shadowmask_overlap", PathOf(mr), hits.Count + " shadowed Mixed lights reach this lightmapped surface (" + string.Join(", ", hits.Select(l => l.name)) + "): a shadowmask texel holds 4 (RGBA); the extras are fully baked and stay baked on rebake (6.3 Manual)", "at most 4 overlapping shadowed Mixed lights per surface (Scene view Light Overlap draw mode); make the extras Baked, Realtime, or shadowless");
                    }
                facts["max_mixed_overlap"] = maxOverlap;
                // --- v0.2: can each GI renderer's shader show and feed the bake?
                var shaderInfo = new Dictionary<Shader, (bool lm, bool sm, bool meta)>();
                var reported = new HashSet<string>();
                int staticNotGi = 0;
                foreach (var mr in mrs)
                {
                    var flags = GameObjectUtility.GetStaticEditorFlags(mr.gameObject);
                    bool gi = (flags & StaticEditorFlags.ContributeGI) != 0;
                    if (!gi && flags != 0 && hasLs && ls.bakedGI)
                    {
                        staticNotGi++;
                        f.Add("info", "light.static_not_gi", PathOf(mr), "marked static (" + flags + ") but not Contribute GI: it casts no baked shadow or bounce, and under Shadowmask its shadow stays realtime", "small props keep Contribute GI and take Receive GI = Light Probes (Ciro Continisio hMnetI4-dNY [00:48:30]; 6.3 Manual)");
                    }
                    if (!gi) continue;
                    foreach (var m in mr.sharedMaterials)
                    {
                        if (m == null || m.shader == null) continue;
                        var sh = m.shader;
                        if (!shaderInfo.TryGetValue(sh, out var inf))
                        {
                            var kw = sh.keywordSpace.keywordNames;
                            inf = (kw.Contains("LIGHTMAP_ON"), kw.Contains("SHADOWS_SHADOWMASK"), LightModes(sh).Any(x => string.Equals(x, "Meta", StringComparison.OrdinalIgnoreCase)));
                            shaderInfo[sh] = inf;
                        }
                        if (!inf.meta && reported.Add("meta:" + sh.name))
                            f.Add("warn", "light.shader_no_meta", sh.name, "shader '" + sh.name + "' on a Contribute GI renderer has no Meta pass: its albedo and emission do not feed the bake (6.3 Manual, no baked GI)", "add a Meta pass (scenario-unity-shaders), or use a URP lit shader");
                        if (mr.receiveGI == ReceiveGI.Lightmaps && !inf.lm && reported.Add("lm:" + sh.name))
                            f.Add("warn", "light.shader_no_lightmap", sh.name, "shader '" + sh.name + "' on a lightmapped renderer declares no LIGHTMAP_ON variant: it shows none of the baked light (wasted lightmap space if truly unlit; a custom-lit or toon shader loses its bake)", "custom lighting must sample lightmaps, shadowmask and probes (6.3 Shader Graph: URP Unlit target with custom lighting; HLSL: multi_compile LIGHTMAP_ON, SHADOWS_SHADOWMASK, PROBE_VOLUMES_L1 L2), or Receive GI = Light Probes");
                        if (shadowmaskMode && mr.receiveGI == ReceiveGI.Lightmaps && inf.lm && !inf.sm && reported.Add("sm:" + sh.name))
                            f.Add("warn", "light.shader_no_shadowmask", sh.name, "Shadowmask bake but shader '" + sh.name + "' declares no SHADOWS_SHADOWMASK variant: static shadows beyond the realtime range disappear", "add the shadowmask keyword and sampling (scenario-unity-shaders)");
                    }
                }
                facts["static_not_gi"] = staticNotGi;
                // --- v0.2: APV Rendering Layer Masks need Use Rendering Layers on the URP asset
                foreach (var set in LightingUtil.BakingSetsFor(scene.path))
                {
                    var layers = LightingUtil.BakingSetLayers(set);
                    facts["apv_rendering_layers"] = layers;
                    if ((bool)layers["use_rendering_layers"] && so != null && !so.FindProperty("m_SupportsLightLayers").boolValue)
                        f.Add("error", "apv.masks_without_rendering_layers", facts["urp_asset"] as string, "baking set " + set.name + " uses APV Rendering Layer Masks but the URP asset has Use Rendering Layers off (6.3 Manual, APV light leaks step 3)", "m_SupportsLightLayers true on this tier's asset (ConfigureTiers), rebake");
                }
                // --- v0.2: stylized low-end rules (style = "stylized")
                string tierName = QualitySettings.names[QualitySettings.GetQualityLevel()];
                bool mobileTier = AgentJob.Has("mobile") ? AgentJob.Bool("mobile") : tierName.ToLowerInvariant().Contains("mobile");
                var opaqueMats = mrs.SelectMany(m => m.sharedMaterials).Where(m => m != null && m.shader != null && m.renderQueue < 2450).Distinct().ToList();
                var shaderNames = opaqueMats.Select(m => m.shader.name).Distinct().ToList();
                facts["opaque_materials"] = opaqueMats.Count;
                facts["opaque_shaders"] = shaderNames;
                if (AgentJob.Str("style", "") == "stylized")
                {
                    int litCount = opaqueMats.Count(m => m.shader.name == "Universal Render Pipeline/Lit" || m.shader.name == "Universal Render Pipeline/Complex Lit");
                    if (mobileTier && litCount > 0)
                        f.Add("info", "style.lit_on_low_end", tierName, litCount + " opaque materials use URP Lit (PBR) on a mobile tier", "Simple Lit (Blinn-Phong, non-PBR) is the stylized low-end choice (URP e-book, Lit or Simple Lit; HCXCmHgV7Sk [00:18:53]); swap per tier with a material variant or shader LOD");
                    int maxShaders = AgentJob.Int("max_shaders", 4);
                    if (shaderNames.Count > maxShaders)
                        f.Add("info", "style.many_shaders", scene.path, shaderNames.Count + " opaque shaders (" + string.Join(", ", shaderNames.Take(6)) + ")", "one shared world shader with a palette texture and triplanar noise batches as one (Kyle Banks 1agSNKuAfTM [00:22:04]: 7 samples over 3 textures, fine on Switch); threshold " + maxShaders + " [added]");
                    if (so != null && so.FindProperty("m_SoftShadowsSupported").boolValue && so.FindProperty("m_MainLightShadowmapResolution").intValue > 1024)
                        f.Add("info", "style.shadow_res_crisp", facts["urp_asset"] as string, "main light shadow map " + so.FindProperty("m_MainLightShadowmapResolution").intValue + " with soft shadows", "1024 was the sweet spot for a stylized room with soft shadows; higher looked too crisp (URP e-book, Main Light shadow resolution); budget by texels per metre");
                }

                // --- depth priming vs custom shaders
                var r0 = urp ? LightingUtil.RendererData(urp) : null;
                facts["depth_priming"] = r0 ? r0.depthPrimingMode.ToString() : null;
                if (r0 != null && r0.depthPrimingMode != DepthPrimingMode.Disabled)
                {
                    var shaders = new HashSet<Shader>();
                    foreach (var mr in UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None))
                        foreach (var m in mr.sharedMaterials)
                            if (m && m.shader && m.renderQueue < 2450) shaders.Add(m.shader);
                    foreach (var sh in shaders)
                    {
                        var modes = LightModes(sh);
                        if (!modes.Contains("DepthOnly") || !modes.Contains("DepthNormals"))
                            f.Add("error", "urp.depth_priming_missing_pass", sh.name, "depth priming " + r0.depthPrimingMode + " and opaque shader '" + sh.name + "' lacks " + (modes.Contains("DepthOnly") ? "" : "DepthOnly ") + (modes.Contains("DepthNormals") ? "" : "DepthNormals") + " pass: it renders invisible (6.3 URP Manual)", "add DepthOnly and DepthNormals passes (scenario-unity-shaders), or Depth Priming Disabled");
                    }
                }
                facts["counts_detail"] = new Dictionary<string, object> { { "no_uv2", noUv2 }, { "tiny_lightmapped", tinyLm }, { "glossy", glossy.Count } };
                return new Dictionary<string, object> { { "facts", facts }, { "findings", f.items }, { "counts", f.Counts() } };
            });
        }
    }
}
