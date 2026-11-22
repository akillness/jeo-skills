// AgentKit.Lighting v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24). Headless bakes with a
// report an agent can assert on: bake time, lightmap count and memory, APV data size, reflection
// probes, warnings the bake printed.
//
// Job (needs a graphics device: ut_run.run_method(..., graphics=True); -nographics cannot bake GI):
//   AgentKit.Lighting.LightingBake.Bake   args:
//     scene                 scene path (required)
//     gi                    "lightmaps" (static geometry lightmapped, small props on probes) or
//                           "apv" (every renderer on Adaptive Probe Volumes, no lightmaps)
//     apv                   true: add a Global Adaptive Probe Volume (also with gi=lightmaps, so
//                           dynamic objects get per-pixel probe lighting); switches every quality
//                           level's URP asset to Light Probe System = Adaptive Probe Volumes
//     mode                  "BakedIndirect" | "Shadowmask" | "Subtractive" (Mixed lights)
//     preset                "preview" | "final"; settings {LightingSettings property: value} override it
//     lighting_settings     asset path (default next to the scene)
//     small_size            renderers whose largest bounds extent is below this (m) receive GI
//                           from probes, not lightmaps (Ciro Continisio hMnetI4-dNY [00:48:30]); 0.5
//     dynamic               names of objects that stay dynamic (never static; "*_Dynamic" too)
//     probe_lit             names of static objects that receive GI from probes (still contribute)
//     lightmap_scale        {name: Scale In Lightmap}: 0.1 to 0.5 for background (Ciro Continisio [00:17:30])
//     reflection_probes     [{name, center, size, importance, box_projection, resolution, blend}]
//     apv_layers            {"masks": [{"name": "Interior", "mask": 2}, {"name": "Exterior", "mask": 1}],
//                           "renderers": {"Interior": ["Wall", "Ceiling"], "Exterior": ["Outside_"]}}:
//                           APV Rendering Layer Masks (max 4; the leak fix that changes WHICH probes a
//                           pixel may use, APV24 [00:19:51]): turns Use Rendering Layers on for every
//                           level's URP asset (required), writes the baking set's non-public
//                           useRenderingLayers / renderingLayerMasks through SerializedObject, sets
//                           Renderer.renderingLayerMask on objects whose name starts with a listed
//                           prefix. Needs an existing baking set: bake the scene once with APV first.
//                           {"masks": []} clears the masks: the baking set keeps them across rebakes.
//   Returns bake_seconds, lightmaps (per texture size, format, GPU MB estimate, disk MB), totals,
//   apv (baking set files and MB), reflection probe textures, lighting data asset size, the
//   settings split into memory-affecting and bake-time-only groups, and bake warnings.
// On Apple Silicon only the GPU lightmapper exists (6.3 system requirements); this job refuses
// ProgressiveCPU there, and refuses to run under -nographics (a -nographics editor cannot bake GI).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Debug = UnityEngine.Debug;

namespace AgentKit.Lighting
{
    public static class LightingBake
    {
        /// <summary>Iterate cheap, bake final rarely (Ciro Continisio hMnetI4-dNY [00:36:56]).
        /// Final values follow Pierre Yves Donzallaz's Sponza bake (DlxuvvYZO4Q frame 00:03:43):
        /// 256 indirect and environment samples (denoisers want at least 256, 6.3 Manual), 4 bounces.
        /// Texel density is per project: 25 texels per unit was his architectural interior.</summary>
        public static Dictionary<string, object> Preset(string name)
        {
            if (name == "final")
                return new Dictionary<string, object>
                {
                    { "lightmapResolution", 20f }, { "directSampleCount", 32 }, { "indirectSampleCount", 256 },
                    { "environmentSampleCount", 256 }, { "maxBounces", 4 }, { "lightmapPadding", 4 },
                    { "filteringMode", "Advanced" }, { "denoiserTypeDirect", "OpenImage" }, { "denoiserTypeIndirect", "OpenImage" },
                    { "denoiserTypeAO", "OpenImage" }, { "filterTypeDirect", "ATrous" }, { "filterTypeIndirect", "ATrous" },
                    { "filterTypeAO", "ATrous" },
                };
            return new Dictionary<string, object>
            {
                { "lightmapResolution", 8f }, { "directSampleCount", 16 }, { "indirectSampleCount", 64 },
                { "environmentSampleCount", 64 }, { "maxBounces", 2 }, { "lightmapPadding", 2 }, { "filteringMode", "Auto" },
            };
        }

        /// <summary>CC's split: these change runtime memory and must be fixed per platform with a
        /// technical owner; the rest only change bake time (hMnetI4-dNY [00:35:51]).</summary>
        public static readonly string[] MemoryFields = { "lightmapResolution", "lightmapMaxSize", "lightmapCompression", "directionalityMode", "lightmapPadding", "mixedBakeMode" };
        public static readonly string[] BakeTimeFields =
        {
            "directSampleCount", "indirectSampleCount", "environmentSampleCount", "maxBounces", "minBounces", "filteringMode",
            "denoiserTypeDirect", "denoiserTypeIndirect", "denoiserTypeAO", "filterTypeDirect", "filterTypeIndirect",
            "filterTypeAO", "environmentImportanceSampling", "lightProbeSampleCountMultiplier", "lightmapper", "ao",
        };

        static object Get(LightingSettings ls, string n)
        {
            // LightmapsMode has obsolete aliases, so ToString() prints "Single, Dual" for Directional
            if (n == "directionalityMode") return ls.directionalityMode == LightmapsMode.CombinedDirectional ? "Directional" : "NonDirectional";
            var p = typeof(LightingSettings).GetProperty(n);
            var v = p != null ? p.GetValue(ls) : null;
            return v is Enum ? v.ToString() : v;
        }

        public static Dictionary<string, object> TextureFacts(Texture2D t)
        {
            if (t == null) return null;
            long gpu = 0;
            int w = t.width, h = t.height;
            for (int m = 0; m < t.mipmapCount; m++)
            {
                gpu += GraphicsFormatUtility.ComputeMipmapSize(Math.Max(1, w), Math.Max(1, h), t.graphicsFormat);
                w /= 2; h /= 2;
            }
            var path = AssetDatabase.GetAssetPath(t);
            return new Dictionary<string, object>
            {
                { "name", t.name }, { "path", path }, { "width", t.width }, { "height", t.height }, { "format", t.graphicsFormat.ToString() },
                { "mips", t.mipmapCount }, { "gpu_mb", LightingUtil.MB(gpu) },
                { "runtime_mb", LightingUtil.MB(UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(t)) },
                { "disk_mb", LightingUtil.MB(LightingUtil.FileSize(path)) },
            };
        }

        /// <summary>What the last bake left in the open scene: lightmaps, probes, APV data, reflection probes.</summary>
        public static Dictionary<string, object> Inventory(UnityEngine.SceneManagement.Scene scene)
        {
            var maps = new List<object>();
            double gpu = 0, disk = 0;
            int textures = 0;
            foreach (var lm in LightmapSettings.lightmaps)
            {
                var entry = new Dictionary<string, object>();
                foreach (var (key, tex) in new[] { ("color", lm.lightmapColor), ("dir", lm.lightmapDir), ("shadowmask", lm.shadowMask) })
                {
                    var f = TextureFacts(tex);
                    if (f == null) continue;
                    entry[key] = f;
                    gpu += (double)f["gpu_mb"];
                    disk += (double)f["disk_mb"];
                    textures++;
                }
                maps.Add(entry);
            }
            var lda = Lightmapping.GetLightingDataAssetForScene(scene);
            var ldaPath = lda ? AssetDatabase.GetAssetPath(lda) : null;
            // APV: baking sets and their data files (.bytes next to the baking set asset)
            var apv = new List<object>();
            double apvMb = 0, apvRuntimeMb = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:ProbeVolumeBakingSet"))
            {
                var p = AssetDatabase.GUIDToAssetPath(guid);
                var set = AssetDatabase.LoadAssetAtPath<ProbeVolumeBakingSet>(p);
                if (set == null) continue;
                var sceneGuid = AssetDatabase.AssetPathToGUID(scene.path);
                bool hasScene = set.sceneGUIDs.Contains(sceneGuid);
                var dir = Path.GetDirectoryName(AgentJob.ResolvePath(p));
                var files = new List<object>();
                double total = 0, runtime = 0;
                var stem = Path.GetFileNameWithoutExtension(p);
                if (Directory.Exists(dir))
                    foreach (var fp in Directory.GetFiles(dir, stem + "*.bytes"))
                    {
                        var mb = LightingUtil.MB(new FileInfo(fp).Length);
                        files.Add(new Dictionary<string, object> { { "file", Path.GetFileName(fp) }, { "mb", mb } });
                        total += mb;
                        // support data feeds the editor debug views, not the player [added, verify on a build]
                        if (!fp.Contains("Support")) runtime += mb;
                    }
                if (hasScene) { apvMb += total; apvRuntimeMb += runtime; }
                apv.Add(new Dictionary<string, object>
                {
                    { "baking_set", p }, { "contains_scene", hasScene }, { "scenarios", set.lightingScenarios.ToList() },
                    { "min_brick_m", set.minBrickSize }, { "cell_m", set.cellSizeInMeters }, { "sky_occlusion", set.skyOcclusion },
                    { "files", files }, { "mb", Math.Round(total, 3) }, { "mb_without_support", Math.Round(runtime, 3) },
                });
            }
            var rps = new List<object>();
            foreach (var rp in UnityEngine.Object.FindObjectsByType<ReflectionProbe>(FindObjectsSortMode.None))
            {
                var tex = rp.bakedTexture;
                var tp = tex ? AssetDatabase.GetAssetPath(tex) : null;
                rps.Add(new Dictionary<string, object>
                {
                    { "name", rp.name }, { "mode", rp.mode.ToString() }, { "baked", tex != null }, { "texture", tp },
                    { "disk_mb", LightingUtil.MB(LightingUtil.FileSize(tp)) }, { "box_projection", rp.boxProjection },
                    { "importance", rp.importance }, { "resolution", rp.resolution },
                });
            }
            return new Dictionary<string, object>
            {
                { "lightmap_sets", maps.Count }, { "lightmap_textures", textures }, { "lightmaps", maps },
                { "lightmap_gpu_mb", Math.Round(gpu, 3) }, { "lightmap_disk_mb", Math.Round(disk, 3) },
                { "light_probes", LightmapSettings.lightProbes ? LightmapSettings.lightProbes.count : 0 },
                { "lighting_data_asset", ldaPath }, { "lighting_data_mb", LightingUtil.MB(LightingUtil.FileSize(ldaPath)) },
                { "apv", apv }, { "apv_mb", Math.Round(apvMb, 3) }, { "apv_mb_without_support", Math.Round(apvRuntimeMb, 3) },
                { "reflection_probes", rps },
            };
        }

        /// <summary>Point every quality level's URP asset at one light probe system (1 = APV, 0 = Light
        /// Probe Groups). The field has no public setter in URP 17.3.</summary>
        public static List<object> SetProbeSystem(int system)
        {
            var res = new List<object>();
            var seen = new HashSet<UniversalRenderPipelineAsset>();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                if (!(LightingUtil.ResolvedAsset(i, out _) is UniversalRenderPipelineAsset a) || !seen.Add(a)) continue;
                LightingUtil.SetMembers(a, new Dictionary<string, object> { { "m_LightProbeSystem", system } });
                res.Add(AssetDatabase.GetAssetPath(a) + " -> " + a.lightProbeSystem);
            }
            AssetDatabase.SaveAssets();
            return res;
        }

        /// <summary>APV Rendering Layer Masks on the scene's baking set, Use Rendering Layers on every
        /// level's URP asset, and Renderer.renderingLayerMask by object-name prefix.</summary>
        public static Dictionary<string, object> ApplyApvLayers(string scenePath, Dictionary<string, object> spec)
        {
            var sets = LightingUtil.BakingSetsFor(scenePath);
            var masks = (spec.TryGetValue("masks", out var mo) ? mo as List<object> : null) ?? new List<object>();
            // {"masks": []} clears them (the baking set keeps its masks across rebakes and scene rebuilds)
            if (sets.Count == 0 && masks.Count == 0) return new Dictionary<string, object> { { "baking_set", null }, { "renderers_assigned", 0 }, { "asset_edits", new List<object>() } };
            if (sets.Count == 0) throw new InvalidOperationException("no Adaptive Probe Volume baking set contains " + scenePath + ": bake it once with apv first, then pass apv_layers");
            if (masks.Count > 4) throw new ArgumentException("APV supports at most 4 Rendering Layer Masks (6.3 Manual)");
            var so = new SerializedObject(sets[0]);
            var use = so.FindProperty("useRenderingLayers");
            var arr = so.FindProperty("renderingLayerMasks");
            if (use == null || arr == null) throw new InvalidOperationException("ProbeVolumeBakingSet has no serialized useRenderingLayers / renderingLayerMasks in this Unity version: use the Lighting window (Adaptive Probe Volumes tab)");
            use.boolValue = masks.Count > 0;
            arr.arraySize = masks.Count;
            var byName = new Dictionary<string, long>();
            for (int i = 0; i < masks.Count; i++)
            {
                var m = (Dictionary<string, object>)masks[i];
                var e = arr.GetArrayElementAtIndex(i);
                e.FindPropertyRelative("name").stringValue = (string)m["name"];
                long bits = (long)AgentJson.ToDouble(m["mask"]);
                LightingUtil.SetMaskBits(e.FindPropertyRelative("mask"), bits);
                byName[(string)m["name"]] = bits;
            }
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(sets[0]);
            // Use Rendering Layers is required on the URP asset of every level that renders the scene
            var assetEdits = new List<object>();
            var seen = new HashSet<UniversalRenderPipelineAsset>();
            for (int i = 0; i < QualitySettings.names.Length; i++)
                if (LightingUtil.ResolvedAsset(i, out _) is UniversalRenderPipelineAsset a && seen.Add(a))
                {
                    var aso = new SerializedObject(a);
                    if (!aso.FindProperty("m_SupportsLightLayers").boolValue)
                    {
                        LightingUtil.SetMembers(a, new Dictionary<string, object> { { "m_SupportsLightLayers", true } });
                        assetEdits.Add(AssetDatabase.GetAssetPath(a) + ": m_SupportsLightLayers=true");
                    }
                }
            int assigned = 0;
            var renderers = (spec.TryGetValue("renderers", out var ro) ? ro as Dictionary<string, object> : null) ?? new Dictionary<string, object>();
            foreach (var mr in UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
                foreach (var kv in renderers)
                {
                    if (!byName.TryGetValue(kv.Key, out var bits)) throw new ArgumentException("renderers names an undeclared mask " + kv.Key);
                    if (((List<object>)kv.Value).Any(pfx => mr.name.StartsWith(pfx.ToString())))
                    {
                        mr.renderingLayerMask = (uint)bits;
                        EditorUtility.SetDirty(mr);
                        assigned++;
                        break;
                    }
                }
            return new Dictionary<string, object> { { "baking_set", AssetDatabase.GetAssetPath(sets[0]) }, { "renderers_assigned", assigned }, { "asset_edits", assetEdits } };
        }

        public static void Bake()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var scenePath = AgentJob.Str("scene");
                if (string.IsNullOrEmpty(scenePath)) throw new ArgumentException("scene is required");
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var gi = AgentJob.Str("gi", "lightmaps");
                bool useApv = gi == "apv" || AgentJob.Bool("apv", false);

                // 1. Lighting Settings asset (get-or-create, one per scene)
                var lsPath = AgentJob.Str("lighting_settings", Path.ChangeExtension(scenePath, null) + "_Lighting.lighting");
                var ls = AssetDatabase.LoadAssetAtPath<LightingSettings>(lsPath);
                if (ls == null)
                {
                    ls = new LightingSettings { name = Path.GetFileNameWithoutExtension(lsPath) };
                    AssetDatabase.CreateAsset(ls, lsPath);
                }
                ls.bakedGI = true;
                ls.realtimeGI = false;
                // no autoGenerate: obsolete in 6.3 (CS0618); Unity 6 never auto-bakes
                ls.lightmapper = LightingSettings.Lightmapper.ProgressiveGPU;
                ls.mixedBakeMode = (MixedLightingMode)Enum.Parse(typeof(MixedLightingMode), AgentJob.Str("mode", "IndirectOnly").Replace("BakedIndirect", "IndirectOnly"), true);
                var settings = Preset(AgentJob.Str("preset", "preview"));
                foreach (var kv in AgentJob.Dict("settings")) settings[kv.Key] = kv.Value;
                LightingUtil.SetMembers(ls, settings);
                if (ls.lightmapper == LightingSettings.Lightmapper.ProgressiveCPU && SystemInfo.processorType.Contains("Apple"))
                    throw new InvalidOperationException("Progressive CPU lightmapper does not run on Apple Silicon (6.3 system requirements): use ProgressiveGPU");
                Lightmapping.SetLightingSettingsForScene(scene, ls);

                // 2. static flags and GI receivers
                var dynamicNames = new HashSet<string>(AgentJob.List("dynamic").Select(o => o.ToString()));
                float small = AgentJob.Float("small_size", 0.5f);
                var probeNames = new HashSet<string>(AgentJob.List("probe_lit").Select(o => o.ToString()));
                var scales = AgentJob.Dict("lightmap_scale");   // {"Outside_Ground": 0.1}: texels where the player looks
                int lightmapped = 0, probeLit = 0, dyn = 0;
                foreach (var mr in UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
                {
                    var go = mr.gameObject;
                    bool isDynamic = dynamicNames.Contains(go.name) || go.name.EndsWith("_Dynamic");
                    if (isDynamic) { GameObjectUtility.SetStaticEditorFlags(go, (StaticEditorFlags)0); dyn++; continue; }
                    // ContributeGI + ReflectionProbeStatic; no BatchingStatic (GRD wants static batching off)
                    GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.ContributeGI | StaticEditorFlags.ReflectionProbeStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);
                    var ext = mr.bounds.size;
                    bool toProbes = gi == "apv" || probeNames.Contains(go.name) || Mathf.Max(ext.x, Mathf.Max(ext.y, ext.z)) < small;
                    mr.receiveGI = toProbes ? ReceiveGI.LightProbes : ReceiveGI.Lightmaps;
                    if (scales.TryGetValue(go.name, out var sc)) mr.scaleInLightmap = (float)AgentJson.ToDouble(sc);
                    if (toProbes) probeLit++; else lightmapped++;
                }

                // 3. probes
                var probeSystem = SetProbeSystem(useApv ? 1 : 0);
                if (useApv && UnityEngine.Object.FindObjectsByType<ProbeVolume>(FindObjectsSortMode.None).Length == 0)
                {
                    var pvGo = new GameObject("AdaptiveProbeVolume_Global");
                    var pv = pvGo.AddComponent<ProbeVolume>();
                    pv.mode = ProbeVolume.Mode.Global;
                }
                Dictionary<string, object> apvLayers = null;
                if (useApv && AgentJob.Has("apv_layers")) apvLayers = ApplyApvLayers(scenePath, AgentJob.Dict("apv_layers"));
                foreach (var o in AgentJob.List("reflection_probes"))
                {
                    var d = (Dictionary<string, object>)o;
                    var name = (string)d["name"];
                    var go = GameObject.Find(name);
                    if (go == null) go = new GameObject(name);
                    // never "GetComponent<T>() ?? AddComponent<T>()": in the Editor a missing component comes back as a
                    // fake-null object that ?? does not see (observed 2026-09-24: MissingComponentException)
                    var rp = go.GetComponent<ReflectionProbe>();
                    if (rp == null) rp = go.AddComponent<ReflectionProbe>();
                    rp.mode = ReflectionProbeMode.Baked;
                    go.transform.position = AgentJson.ToVector3(d.TryGetValue("center", out var c) ? c : null, go.transform.position);
                    rp.size = AgentJson.ToVector3(d.TryGetValue("size", out var s) ? s : null, new Vector3(10, 10, 10));
                    rp.boxProjection = !d.TryGetValue("box_projection", out var bp) || LightingUtil.ToBool(bp);
                    rp.importance = d.TryGetValue("importance", out var imp) ? (int)AgentJson.ToDouble(imp) : 1;
                    rp.resolution = d.TryGetValue("resolution", out var res) ? (int)AgentJson.ToDouble(res) : 128;
                    rp.blendDistance = d.TryGetValue("blend", out var bl) ? (float)AgentJson.ToDouble(bl) : 0.25f;
                }

                // 4. bake, collecting what the lightmapper prints
                var messages = new List<string>();
                Application.LogCallback cb = (msg, stack, type) =>
                {
                    if ((type == LogType.Warning || type == LogType.Error || type == LogType.Exception) && messages.Count < 60)
                        messages.Add(type + ": " + msg.Split('\n')[0]);
                };
                Application.logMessageReceived += cb;
                var sw = Stopwatch.StartNew();
                bool ok;
                try { ok = Lightmapping.Bake(); }
                finally { Application.logMessageReceived -= cb; }
                sw.Stop();
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                AssetDatabase.SaveAssets();
                if (!ok) throw new InvalidOperationException("Lightmapping.Bake() returned false: " + string.Join(" | ", messages.Take(5)));

                var inv = Inventory(scene);
                inv["bake_seconds"] = Math.Round(sw.Elapsed.TotalSeconds, 2);
                inv["scene"] = scene.path;
                inv["gi"] = gi;
                inv["apv_enabled"] = useApv;
                inv["probe_system"] = probeSystem;
                inv["renderers"] = new Dictionary<string, object> { { "lightmapped", lightmapped }, { "probe_lit", probeLit }, { "dynamic", dyn } };
                inv["lighting_settings"] = lsPath;
                inv["settings_memory"] = MemoryFields.ToDictionary(n => n, n => Get(ls, n));
                inv["settings_bake_time"] = BakeTimeFields.ToDictionary(n => n, n => Get(ls, n));
                inv["bake_messages"] = messages;
                if (apvLayers != null && apvLayers["baking_set"] != null)
                {
                    apvLayers["readback"] = LightingUtil.BakingSetLayers(AssetDatabase.LoadMainAssetAtPath((string)apvLayers["baking_set"]));
                    inv["apv_layers"] = apvLayers;
                }
                inv["gpu"] = SystemInfo.graphicsDeviceName;
                return inv;
            });
        }

        /// <summary>Read-only: the inventory of an already baked scene (no bake).</summary>
        public static void Report()
        {
            AgentJob.Run(() =>
            {
                var scene = EditorSceneManager.OpenScene(AgentJob.Str("scene"), OpenSceneMode.Single);
                var inv = Inventory(scene);
                inv["scene"] = scene.path;
                inv["has_lighting_settings"] = Lightmapping.TryGetLightingSettings(out var ls);   // the getter throws when unassigned
                if (ls != null) inv["lightmapper"] = ls.lightmapper.ToString();
                return inv;
            });
        }
    }
}
