// scenario-unity-performance v0.2 (2026-09-24). Draw-call configuration for Unity 6.3 URP: audit, then
// the GPU Resident Drawer (GRD) setup, as batch jobs.
//
//   ut_run.run_method(P, "AgentKit.Performance.PerfRendering.Audit", {"scene": "Assets/Scenes/X.unity"})
//   ut_run.run_method(P, "AgentKit.Performance.PerfRendering.EnableGpuResidentDrawer",
//                     {"occlusion": false, "static_batching_off": ["StandaloneOSX"], "dry_run": false})
//
// Rules encoded (6.3 Manual "Choose a method for optimizing draw calls" and "Enable the GPU
// Resident Drawer in URP"; URP 17.3 source for the checks the Manual does not list):
// - URP/HDRP: SRP Batcher on + GRD; material "Enable GPU Instancing" OFF (extra variants);
//   static batching OFF (incompatible with BRG and GRD). Built-in keeps static batching.
// - GRD does nothing unless: Project Settings > Graphics > BatchRendererGroup Variants = Keep All
//   (EditorGraphicsSettings.batchRendererGroupShaderStrippingMode), URP asset GRD = Instanced
//   Drawing, and EVERY renderer in the asset's Renderer List uses Forward+ or Deferred+
//   (UniversalRenderPipelineAsset.IsGPUResidentDrawerSupportedBySRP loops over all of them:
//   one Forward renderer in the list disables GRD for the whole asset) [obs: URP 17.3 source].
// - In the Editor, GRD runs in Play mode; Edit mode only with "allow in edit mode" (core RP
//   GPUResidentDrawer.Validator) [obs]. Measure in Play mode or a player, never the Scene view.
// - Per object: Mesh Renderer, no MaterialPropertyBlock, Light Probes not Use Proxy Volume, no
//   realtime GI, DOTS-instancing shader, no OnRenderObject-style callbacks. The exclusion
//   component DisallowGPUDrivenRendering is internal in core RP 17.3 [obs]: Add Component in the
//   Inspector, or reflection.
// - GPU occlusion culling (UniversalRenderPipelineAsset.gpuResidentDrawerEnableOcclusionCullingInCameras
//   in 17.3) only with a measured gain: it adds depth-pyramid work and helps only vertex-bound,
//   heavily occluded scenes (Unity graphics PMs, Oc6T4hh5gaI [00:29:04]).
// Findings use the core AgentAudit format: severity, code (perf.*), path, message, fix.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Performance
{
    public static class PerfRendering
    {
        // ------------------------------------------------------------------ helpers
        public static List<UniversalRenderPipelineAsset> ActiveUrpAssets()
        {
            var list = new List<UniversalRenderPipelineAsset>();
            void Add(RenderPipelineAsset a)
            {
                if (a is UniversalRenderPipelineAsset u && !list.Contains(u)) list.Add(u);
            }
            Add(GraphicsSettings.defaultRenderPipeline);
            for (int i = 0; i < QualitySettings.names.Length; i++) Add(QualitySettings.GetRenderPipelineAssetAt(i));
            return list;
        }

        public static List<ScriptableRendererData> Renderers(UniversalRenderPipelineAsset a)
        {
            var res = new List<ScriptableRendererData>();
            foreach (var r in a.rendererDataList) if (r != null) res.Add(r);
            return res;
        }

        static readonly BuildTarget[] k_DefaultTargets = { BuildTarget.StandaloneOSX };

        static List<BuildTarget> Targets()
        {
            var t = new List<BuildTarget>();
            foreach (var o in AgentJob.List("platforms"))
                if (Enum.TryParse(o.ToString(), true, out BuildTarget bt)) t.Add(bt);
            if (t.Count == 0)
            {
                t.AddRange(k_DefaultTargets);
                if (!t.Contains(EditorUserBuildSettings.activeBuildTarget)) t.Add(EditorUserBuildSettings.activeBuildTarget);
            }
            return t;
        }

        // ------------------------------------------------------------------ audit
        public static Dictionary<string, object> AuditConfig(AgentAudit.Findings f)
        {
            var urp = ActiveUrpAssets();
            var assets = new List<object>();
            bool anyGrd = false;
            foreach (var a in urp)
            {
                var path = AssetDatabase.GetAssetPath(a);
                var rends = Renderers(a).Select(r => new Dictionary<string, object>
                {
                    { "name", r.name }, { "path", AssetDatabase.GetAssetPath(r) },
                    { "rendering_path", r is UniversalRendererData u ? u.renderingMode.ToString() : r.GetType().Name },
                    { "cluster_light_loop", r is UniversalRendererData u2 && u2.usesClusterLightLoop },
                }).ToList();
                bool grdOn = a.gpuResidentDrawerMode == GPUResidentDrawerMode.InstancedDrawing;
                anyGrd |= grdOn;
                assets.Add(new Dictionary<string, object>
                {
                    { "path", path }, { "srp_batcher", a.useSRPBatcher }, { "gpu_resident_drawer", a.gpuResidentDrawerMode.ToString() },
                    { "gpu_occlusion", a.gpuResidentDrawerEnableOcclusionCullingInCameras }, { "renderers", rends },
                    { "msaa", a.msaaSampleCount }, { "render_scale", a.renderScale }, { "hdr", a.supportsHDR },
                    { "shadow_distance", a.shadowDistance }, { "lod_cross_fade", a.enableLODCrossFade },
                    { "upscaling", a.upscalingFilter.ToString() },
                });
                if (!a.useSRPBatcher)
                    f.Add("error", "perf.srp_batcher_off", path, "SRP Batcher is off: every draw re-uploads material state", "useSRPBatcher = true");
                if (grdOn)
                {
                    foreach (var r in Renderers(a))
                        if (!(r is UniversalRendererData u && u.usesClusterLightLoop))
                            f.Add("error", "perf.grd_renderer_path", AssetDatabase.GetAssetPath(r),
                                "GPU Resident Drawer is on but this renderer is not Forward+ or Deferred+: GRD is disabled for the whole asset",
                                "UniversalRendererData.renderingMode = RenderingMode.ForwardPlus");
                    if (a.gpuResidentDrawerEnableOcclusionCullingInCameras)
                        f.Add("info", "perf.gpu_occlusion_on", path, "GPU occlusion culling on: keep it only with a measured GPU gain (vertex-bound, heavy occlusion)", null);
                }
            }
            var brg = EditorGraphicsSettings.batchRendererGroupShaderStrippingMode;
            if (anyGrd && brg != BatchRendererGroupStrippingMode.KeepAll)
                f.Add("error", "perf.grd_brg_stripped", "ProjectSettings/GraphicsSettings.asset",
                    "GPU Resident Drawer is on but BatchRendererGroup Variants = " + brg + ": GRD silently does nothing",
                    "Project Settings > Graphics > Shader Stripping > BatchRendererGroup Variants = Keep All");
            var stat = new Dictionary<string, object>();
            foreach (var t in Targets())
            {
                bool sb = PlayerSettings.GetStaticBatchingForPlatform(t);
                stat[t.ToString()] = sb;
                if (anyGrd && sb)
                    f.Add("warn", "perf.static_batching_with_grd", "ProjectSettings/ProjectSettings.asset",
                        "static batching on for " + t + " while GRD is on: incompatible with BRG/GRD (6.3 Manual)",
                        "PlayerSettings.SetStaticBatchingForPlatform(" + t + ", false)");
            }
            var nbt = NamedBuildTarget.FromBuildTargetGroup(BuildPipeline.GetBuildTargetGroup(EditorUserBuildSettings.activeBuildTarget));
            var player = new Dictionary<string, object>
            {
                { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                { "scripting_backend", PlayerSettings.GetScriptingBackend(nbt).ToString() },
                { "managed_stripping", PlayerSettings.GetManagedStrippingLevel(nbt).ToString() },
                { "il2cpp_code_generation", PlayerSettings.GetIl2CppCodeGeneration(nbt).ToString() },
                { "strip_engine_code", PlayerSettings.stripEngineCode },
                { "strip_unused_mesh_components", PlayerSettings.stripUnusedMeshComponents },
                { "incremental_gc", PlayerSettings.gcIncremental },
                { "graphics_jobs", PlayerSettings.graphicsJobs },
                { "graphics_job_mode", PlayerSettings.graphicsJobMode.ToString() },
                { "frame_timing_stats", PlayerSettings.enableFrameTimingStats },
                { "log_shader_compilation", GraphicsSettings.logWhenShaderIsCompiled },
                { "quality_levels", QualitySettings.names.ToList() },
                { "quality_level", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                { "vsync_count_current_level", QualitySettings.vSyncCount },
                // v0.2 additions (2026-09-24 refactor)
                { "prebake_collision_meshes", PlayerSettings.bakeCollisionMeshes },
                { "mip_stripping", PlayerSettings.mipStripping },
                { "stack_trace_log", PlayerSettings.GetStackTraceLogType(LogType.Log).ToString() },
                { "stack_trace_warning", PlayerSettings.GetStackTraceLogType(LogType.Warning).ToString() },
                { "shader_chunk_size_mb", PlayerSettings.GetDefaultShaderChunkSizeInMB() },
                { "shader_chunk_count", PlayerSettings.GetDefaultShaderChunkCount() },
            };
            var quality = new Dictionary<string, object>
            {
                { "async_upload_buffer_mb", QualitySettings.asyncUploadBufferSize },
                { "async_upload_time_slice_ms", QualitySettings.asyncUploadTimeSlice },
                { "async_upload_persistent", QualitySettings.asyncUploadPersistentBuffer },
                { "mipmap_streaming", QualitySettings.streamingMipmapsActive },
                { "mipmap_streaming_budget_mb", QualitySettings.streamingMipmapsMemoryBudget },
                { "lod_bias", QualitySettings.lodBias }, { "mesh_lod_threshold", QualitySettings.meshLodThreshold },
            };
            // Ring buffer memory is never returned once allocated (console/PC e-book p. 31): a raised
            // buffer must be justified by the largest texture a scene uploads.
            if (QualitySettings.asyncUploadBufferSize > 32)
                f.Add("info", "perf.async_upload_buffer", "ProjectSettings/QualitySettings.asset",
                    "asyncUploadBufferSize = " + QualitySettings.asyncUploadBufferSize + " MB: size it to the largest texture loaded; the ring buffer memory is never returned",
                    "keep the default 16 MB unless uploads stall on a texture larger than it");
            if (PlayerSettings.GetStackTraceLogType(LogType.Log) != StackTraceLogType.None)
                f.Add("info", "perf.release_stack_traces", "ProjectSettings/ProjectSettings.asset",
                    "Log stack traces = " + PlayerSettings.GetStackTraceLogType(LogType.Log) + ": every Debug.Log in a player walks the stack (per-frame logging cost 48.55 ms of an 80 ms dev frame, xjsqv8nj0cw [00:10:23])",
                    "release: PlayerSettings.SetStackTraceLogType(LogType.Log and Warning, None); route logs through a [Conditional(\"ENABLE_LOG\")] wrapper (console e-book p. 41-42)");
            // Graphics jobs per platform. Split is the default and the fastest mode on DX12 and
            // Vulkan (Oc6T4hh5gaI [00:03:04], [frame 00:03:52]: DX12 Split 217 fps, Legacy 199,
            // plain DX12 176, Native 161); the SRP Batcher multithreads only with graphics jobs on
            // DX12, Vulkan and consoles (6.3 Manual table). Metal (macOS, iOS) is reported, not judged.
            var gjobs = new Dictionary<string, object>();
            var ship = Targets();
            foreach (var t in new[] { BuildTarget.StandaloneOSX, BuildTarget.StandaloneWindows64, BuildTarget.Android, BuildTarget.iOS })
            {
                try
                {
                    // per-platform getters are internal in 6000.3.21f1 (reflection); the public
                    // PlayerSettings.graphicsJobs / graphicsJobMode read the active target only
                    const System.Reflection.BindingFlags bf = System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic;
                    var getOn = typeof(PlayerSettings).GetMethod("GetGraphicsJobsForPlatform", bf, null, new[] { typeof(BuildTarget) }, null);
                    var getMode = typeof(PlayerSettings).GetMethod("GetGraphicsJobModeForPlatform", bf, null, new[] { typeof(BuildTarget) }, null);
                    bool on = getOn != null ? (bool)getOn.Invoke(null, new object[] { t }) : (t == EditorUserBuildSettings.activeBuildTarget && PlayerSettings.graphicsJobs);
                    var mode = getMode != null ? (GraphicsJobMode)getMode.Invoke(null, new object[] { t }) : PlayerSettings.graphicsJobMode;
                    string apis;
                    try { apis = string.Join(",", PlayerSettings.GetGraphicsAPIs(t)); } catch (Exception) { apis = "?"; }
                    gjobs[t.ToString()] = new Dictionary<string, object> { { "on", on }, { "mode", mode.ToString() }, { "apis", apis } };
                    bool splitApi = t == BuildTarget.StandaloneWindows64 || t == BuildTarget.Android;
                    if (splitApi && ship.Contains(t) && (!on || mode != GraphicsJobMode.Split))
                        f.Add("info", "perf.graphics_jobs_split", "ProjectSettings/ProjectSettings.asset",
                            t + ": graphics jobs " + (on ? "on, mode " + mode : "off") + "; Split is the default and the fastest mode on DX12/Vulkan, and the SRP Batcher multithreads only with graphics jobs",
                            "Player Settings > Other Settings > Graphics Jobs on, Graphics Jobs Mode = Split for " + t + " (PlayerSettings.graphicsJobs / graphicsJobMode with that target active); A/B in a player");
                }
                catch (Exception e) { gjobs[t.ToString()] = "unavailable: " + e.GetType().Name; }
            }
            // Build Profiles: with a PLATFORM profile active, an EditorUserBuildSettings change (for
            // example development) applies to every platform profile; with a build profile active,
            // only to that profile (6.3 Manual, Shared build settings note).
            string activeProfile = null;
            try
            {
                var bp = Type.GetType("UnityEditor.Build.Profile.BuildProfile, UnityEditor.CoreModule");
                var act = bp?.GetMethod("GetActiveBuildProfile", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)?.Invoke(null, null) as UnityEngine.Object;
                activeProfile = act != null ? AssetDatabase.GetAssetPath(act) : null;
            }
            catch (Exception) { }
            if (activeProfile == null)
                f.Add("info", "perf.platform_profile_shared", "File > Build Profiles",
                    "a platform profile is active: EditorUserBuildSettings changes (development, connectProfiler) apply to ALL platform profiles",
                    "script benchmark builds through BuildPlayerOptions flags (PerfBuild) or a dedicated build profile asset");
            return new Dictionary<string, object>
            {
                { "urp_assets", assets }, { "brg_variants", brg.ToString() }, { "static_batching", stat },
                { "gpu_resident_drawer_on", anyGrd }, { "player", player }, { "quality", quality },
                { "graphics_jobs", gjobs }, { "active_build_profile", activeProfile ?? "(platform profile)" },
            };
        }

        public static Dictionary<string, object> AuditOpenScene(AgentAudit.Findings f, bool grdOn)
        {
            var renderers = UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            var cams = UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsInactive.Exclude, FindObjectsSortMode.None)
                .Where(c => c.enabled && c.targetTexture == null && !c.name.StartsWith("AgentView_")).ToList();
            if (cams.Count > 1)
                f.Add("warn", "perf.cameras", string.Join(", ", cams.Select(c => c.name)),
                    cams.Count + " enabled screen cameras: each one reruns culling, sorting and batching (up to 1 ms CPU each on mobile)",
                    "one camera; overlays via URP Render Objects renderer features");
            int mesh = 0, skinned = 0, mpb = 0, probeProxy = 0, staticBatch = 0, lodOverlap = 0, noMat = 0;
            var mats = new HashSet<Material>();
            var shaders = new HashSet<Shader>();
            var meshes = new HashSet<Mesh>();
            var instancingMats = new HashSet<Material>();
            foreach (var r in renderers)
            {
                if (r is MeshRenderer) mesh++;
                else if (r is SkinnedMeshRenderer) skinned++;
                if (r.HasPropertyBlock()) mpb++;
                if (r.lightProbeUsage == LightProbeUsage.UseProxyVolume) probeProxy++;
                if (GameObjectUtility.AreStaticEditorFlagsSet(r.gameObject, StaticEditorFlags.BatchingStatic)) staticBatch++;
                foreach (var m in r.sharedMaterials)
                {
                    if (m == null) { noMat++; continue; }
                    mats.Add(m);
                    if (m.shader) shaders.Add(m.shader);
                    if (m.enableInstancing) instancingMats.Add(m);
                }
                var mf = r.GetComponent<MeshFilter>();
                if (mf && mf.sharedMesh)
                {
                    meshes.Add(mf.sharedMesh);
                    if (mf.sharedMesh.lodCount > 1 && r.GetComponentInParent<LODGroup>() != null) lodOverlap++;
                }
            }
            var scenePath = EditorSceneManager.GetActiveScene().path;
            if (mpb > 0)
                f.Add("warn", "perf.material_property_block", scenePath, mpb + " renderers carry a MaterialPropertyBlock (edit time): breaks SRP Batcher and GRD compatibility",
                    "Material Variants or a few shared materials");
            if (instancingMats.Count > 0 && GraphicsSettings.currentRenderPipeline != null)
                f.Add("warn", "perf.material_instancing_urp", string.Join(", ", instancingMats.Take(5).Select(m => AssetDatabase.GetAssetPath(m))),
                    instancingMats.Count + " materials have Enable GPU Instancing on in an SRP project: extra variants, no gain under SRP Batcher/GRD (6.3 Manual)",
                    "Material.enableInstancing = false");
            if (grdOn && staticBatch > 0)
                f.Add("warn", "perf.batching_static_with_grd", scenePath, staticBatch + " renderers are Batching Static while GRD is on (and static batching forces Mesh LOD to LOD0)",
                    "clear StaticEditorFlags.BatchingStatic or disable static batching in Player settings");
            if (probeProxy > 0)
                f.Add("warn", "perf.lppv", scenePath, probeProxy + " renderers use Light Probe Proxy Volumes: not GRD compatible, deprecated in URP", "Adaptive Probe Volumes or Blend Probes");
            if (lodOverlap > 0)
                f.Add("warn", "perf.meshlod_and_lodgroup", scenePath, lodOverlap + " renderers have generated Mesh LODs under an LODGroup: 'not recommended' (6.3 Manual)", "pick one LOD system per asset");
            var grd = GrdEligibility(renderers);
            var inel = (Dictionary<string, object>)grd["ineligible_by_reason"];
            if (grdOn && inel.Count > 0)
                f.Add("warn", "perf.grd_fallout", scenePath,
                    (int)grd["ineligible"] + " of " + renderers.Length + " renderers cannot go through the GPU Resident Drawer (" + string.Join(", ", inel.Keys) + "): each keeps its own draw",
                    "fix the reason (Material Variants instead of MPB, Mesh Renderer, DOTS-instancing shader, no LPPV, static GI only, no OnRenderObject), or accept it; confirm at runtime with PerfFrameDebug.Capture (Hybrid Batch Group draws)");
            // Culling levers the GPU section needs (console/PC e-book p. 86 to 88): per-layer cull
            // distances, baked occlusion data. Occlusion costs CPU, disk and RAM: keep it only with a gain.
            var culling = new List<object>();
            foreach (var c in cams)
            {
                int layered = c.layerCullDistances.Count(d => d > 0f);
                culling.Add(new Dictionary<string, object>
                {
                    { "camera", c.name }, { "far_clip", c.farClipPlane }, { "layer_cull_distances_set", layered },
                    { "occlusion_culling", c.useOcclusionCulling },
                });
            }
            // Runtime MeshCollider cooking: a prefab MeshCollider still cooks on the main thread when
            // it is instantiated or activated unless Prebake Collision Meshes is on or the mesh was
            // baked with Physics.BakeMesh (Borromeo CmD8MVGkDxQ [00:06:16]; Code Monkey 2gP-2rQ3o_Q [00:10:25])
            int meshColliders = UnityEngine.Object.FindObjectsByType<MeshCollider>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length;
            if (meshColliders > 0 && !PlayerSettings.bakeCollisionMeshes)
                f.Add("info", "perf.mesh_collider_cooking", scenePath,
                    meshColliders + " MeshColliders and Prebake Collision Meshes off: colliders cook on the main thread when instantiated or activated (marker Physics.BakePhysXCollisionMeshData)",
                    "PlayerSettings.bakeCollisionMeshes = true for scene and prefab meshes; Physics.BakeMesh in a job for runtime meshes");
            return new Dictionary<string, object>
            {
                { "scene", scenePath }, { "renderers", renderers.Length }, { "mesh_renderers", mesh }, { "skinned", skinned },
                { "unique_materials", mats.Count }, { "unique_shaders", shaders.Count }, { "unique_meshes", meshes.Count },
                { "property_blocks", mpb }, { "batching_static", staticBatch }, { "instancing_materials", instancingMats.Count },
                { "lppv", probeProxy }, { "lod_overlap", lodOverlap }, { "missing_materials", noMat },
                { "screen_cameras", cams.Select(c => c.name).ToList() },
                { "grd_eligibility", grd }, { "culling", culling },
                { "occlusion_data_bytes", StaticOcclusionCulling.umbraDataSize }, { "mesh_colliders", meshColliders },
            };
        }

        static readonly Dictionary<Type, bool> s_CallbackTypes = new Dictionary<Type, bool>();

        static bool HasRenderCallback(Type t)
        {
            if (s_CallbackTypes.TryGetValue(t, out var v)) return v;
            const System.Reflection.BindingFlags bf = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic;
            v = t.GetMethod("OnRenderObject", bf) != null || t.GetMethod("OnWillRenderObject", bf) != null;
            s_CallbackTypes[t] = v;
            return v;
        }

        /// <summary>Static per-renderer GPU Resident Drawer eligibility (6.3 Manual "Make a GameObject
        /// compatible with the GPU Resident Drawer"): Mesh Renderer, no MaterialPropertyBlock (edit
        /// time only: MPBs set by scripts at runtime show in PerfFrameDebug.Capture), Light Probes not
        /// Use Proxy Volume, no realtime GI, a DOTS-instancing shader, no OnRenderObject-style
        /// callbacks, not under Disallow GPU Driven Rendering. The engine makes the final call at
        /// runtime; this names the likely reasons before any capture.</summary>
        public static Dictionary<string, object> GrdEligibility(Renderer[] renderers)
        {
            bool realtimeGI = false;
            try { realtimeGI = Lightmapping.lightingSettings != null && Lightmapping.lightingSettings.realtimeGI; } catch (Exception) { }
            var reasons = new Dictionary<string, int>();
            var samples = new Dictionary<string, List<string>>();
            var dotsCache = new Dictionary<Shader, bool>();
            int eligible = 0, ineligible = 0;
            bool anyDots = false;
            void Add(string reason, Renderer r)
            {
                reasons[reason] = (reasons.TryGetValue(reason, out var n) ? n : 0) + 1;
                if (!samples.TryGetValue(reason, out var l)) samples[reason] = l = new List<string>();
                if (l.Count < 5) l.Add(r.name);
            }
            foreach (var r in renderers)
            {
                var before = reasons.Values.Sum();
                if (!(r is MeshRenderer)) { Add("not_mesh_renderer:" + r.GetType().Name, r); }
                else
                {
                    if (r.HasPropertyBlock()) Add("property_block", r);
                    if (r.lightProbeUsage == LightProbeUsage.UseProxyVolume) Add("lppv", r);
                    if (realtimeGI && GameObjectUtility.AreStaticEditorFlagsSet(r.gameObject, StaticEditorFlags.ContributeGI)
                        && ((MeshRenderer)r).receiveGI == ReceiveGI.Lightmaps) Add("realtime_gi", r);
                    foreach (var m in r.sharedMaterials)
                    {
                        if (m == null || m.shader == null) continue;
                        if (!dotsCache.TryGetValue(m.shader, out var dots))
                        {
                            dots = m.shader.keywordSpace.keywordNames.Contains("DOTS_INSTANCING_ON");
                            dotsCache[m.shader] = dots;
                        }
                        anyDots |= dots;
                        if (!dots) { Add("shader_without_dots_instancing:" + m.shader.name, r); break; }
                    }
                    foreach (var mb in r.GetComponents<MonoBehaviour>())
                        if (mb != null && HasRenderCallback(mb.GetType())) { Add("render_callback:" + mb.GetType().Name, r); break; }
                    for (var t = r.transform; t != null; t = t.parent)
                        if (t.GetComponents<Component>().Any(c => c != null && c.GetType().Name == "DisallowGPUDrivenRendering")) { Add("disallow_component", r); break; }
                }
                if (reasons.Values.Sum() > before) ineligible++; else eligible++;
            }
            return new Dictionary<string, object>
            {
                { "eligible", eligible }, { "ineligible", ineligible },
                { "ineligible_by_reason", reasons.ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                { "samples", samples.ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                { "realtime_gi_enabled", realtimeGI }, { "dots_keyword_seen", anyDots },
                { "note", "static check; runtime MaterialPropertyBlocks and the engine's own decision: PerfFrameDebug.Capture" },
            };
        }

        /// <summary>Job: configuration audit (+ the given scene). Read-only.</summary>
        public static void Audit()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var cfg = AuditConfig(f);
                object scene = null;
                if (AgentJob.Has("scene"))
                {
                    EditorSceneManager.OpenScene(AgentJob.Str("scene"), OpenSceneMode.Single);
                    scene = AuditOpenScene(f, (bool)cfg["gpu_resident_drawer_on"]);
                }
                return new Dictionary<string, object> { { "config", cfg }, { "scene", scene }, { "findings", f.items }, { "counts", f.Counts() } };
            });
        }

        // ------------------------------------------------------------------ enable GRD
        /// <summary>Job: apply every GRD prerequisite to the URP assets used by Graphics and all
        /// Quality levels (or only `assets`, a list of asset paths: a mobile tier on Forward may be
        /// a deliberate choice). args: occlusion (bool, default false), static_batching_off (list of
        /// BuildTarget names, default StandaloneOSX + active), mode ("InstancedDrawing" or
        /// "Disabled" to revert), dry_run (bool). Returns what changed (before -> after).</summary>
        public static void EnableGpuResidentDrawer()
        {
            AgentJob.Run(() =>
            {
                bool dry = AgentJob.Bool("dry_run");
                bool occlusion = AgentJob.Bool("occlusion");
                var mode = AgentJob.Str("mode", "InstancedDrawing") == "Disabled" ? GPUResidentDrawerMode.Disabled : GPUResidentDrawerMode.InstancedDrawing;
                var changes = new List<object>();
                void Change(string what, object before, object after)
                {
                    if (!Equals(before?.ToString(), after?.ToString()))
                        changes.Add(new Dictionary<string, object> { { "setting", what }, { "before", before?.ToString() }, { "after", after?.ToString() } });
                }
                if (mode == GPUResidentDrawerMode.InstancedDrawing)
                {
                    var brg = EditorGraphicsSettings.batchRendererGroupShaderStrippingMode;
                    Change("GraphicsSettings.BatchRendererGroupVariants", brg, BatchRendererGroupStrippingMode.KeepAll);
                    if (!dry && brg != BatchRendererGroupStrippingMode.KeepAll)
                        SetBrgKeepAll();
                }
                var only = AgentJob.List("assets").Select(o => o.ToString()).ToList();  // limit to some URP assets
                foreach (var a in ActiveUrpAssets())
                {
                    var path = AssetDatabase.GetAssetPath(a);
                    if (only.Count > 0 && !only.Contains(path)) continue;
                    Change(path + ":useSRPBatcher", a.useSRPBatcher, true);
                    Change(path + ":gpuResidentDrawerMode", a.gpuResidentDrawerMode, mode);
                    Change(path + ":gpuOcclusion", a.gpuResidentDrawerEnableOcclusionCullingInCameras, occlusion && mode != GPUResidentDrawerMode.Disabled);
                    if (!dry)
                    {
                        Undo.RecordObject(a, "Agent: GPU Resident Drawer");
                        a.useSRPBatcher = true;
                        a.gpuResidentDrawerMode = mode;
                        a.gpuResidentDrawerEnableOcclusionCullingInCameras = occlusion && mode != GPUResidentDrawerMode.Disabled;
                        EditorUtility.SetDirty(a);
                    }
                    if (mode == GPUResidentDrawerMode.Disabled) continue;
                    foreach (var r in Renderers(a))
                    {
                        if (!(r is UniversalRendererData u)) continue;
                        if (u.usesClusterLightLoop) continue;
                        var target = u.renderingMode == RenderingMode.Deferred ? RenderingMode.DeferredPlus : RenderingMode.ForwardPlus;
                        Change(AssetDatabase.GetAssetPath(u) + ":renderingMode", u.renderingMode, target);
                        if (!dry) { Undo.RecordObject(u, "Agent: Forward+"); u.renderingMode = target; EditorUtility.SetDirty(u); }
                    }
                }
                var targets = new List<BuildTarget>();
                foreach (var o in AgentJob.List("static_batching_off"))
                    if (Enum.TryParse(o.ToString(), true, out BuildTarget bt)) targets.Add(bt);
                if (targets.Count == 0) targets = Targets();
                foreach (var t in targets)
                {
                    bool want = mode == GPUResidentDrawerMode.Disabled;  // revert restores static batching
                    Change("PlayerSettings.StaticBatching." + t, PlayerSettings.GetStaticBatchingForPlatform(t), want);
                    if (!dry) PlayerSettings.SetStaticBatchingForPlatform(t, want);
                }
                if (!dry) AssetDatabase.SaveAssets();
                var f = new AgentAudit.Findings();
                var cfg = AuditConfig(f);
                return new Dictionary<string, object>
                {
                    { "dry_run", dry }, { "changes", changes }, { "after", cfg }, { "findings", f.items }, { "counts", f.Counts() },
                };
            });
        }

        static void SetBrgKeepAll()
        {
            // Public setter where it exists; SerializedObject on GraphicsSettings.asset otherwise.
            var prop = typeof(EditorGraphicsSettings).GetProperty("batchRendererGroupShaderStrippingMode");
            if (prop != null && prop.CanWrite)
            {
                prop.SetValue(null, BatchRendererGroupStrippingMode.KeepAll);
                return;
            }
            var gs = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset").FirstOrDefault();
            if (gs == null) throw new InvalidOperationException("GraphicsSettings.asset not found");
            var so = new SerializedObject(gs);
            var p = so.FindProperty("m_BrgStripping");
            if (p == null) throw new InvalidOperationException("m_BrgStripping not found in GraphicsSettings.asset");
            p.intValue = (int)BatchRendererGroupStrippingMode.KeepAll;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
