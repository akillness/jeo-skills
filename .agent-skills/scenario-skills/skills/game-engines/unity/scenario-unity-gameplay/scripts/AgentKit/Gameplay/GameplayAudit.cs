// scenario-unity-gameplay AgentKit jobs (Unity Expert Skills v0.2, 2026-09-24): the gameplay audit of a
// scene (physics settings, bodies, moving triggers, character controllers, navigation, audio routing)
// in the core findings format {severity, code, path, message, fix}, and three benchmarks.
//   ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.AuditGameplayScene", {"scene": "..."})
//   ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.PerceptionBenchmark", {"counts": [200, 2000, 20000]})
//   ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.ProximityBenchmark", {"cases": [[1000, 20], [10000, 200]]})
//   ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudit.UpdateOrderBenchmark", {"counts": [1000, 10000]})
using System.Collections.Generic;
using System.Linq;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;

namespace AgentKit.Gameplay
{
    public static class GameplayAudit
    {
        static string PathOf(Component c)
        {
            var t = c.transform; var p = t.name;
            while (t.parent != null) { t = t.parent; p = t.name + "/" + p; }
            return c.gameObject.scene.name + ":" + p;
        }

        public static void AuditGameplayScene()
        {
            AgentJob.Run(() =>
            {
                var scene = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var f = new AgentAudit.Findings();
                var dm = GameplaySetup.SettingsObject("ProjectSettings/DynamicsManager.asset");

                // ---- project physics settings
                if (Mathf.Abs(Time.maximumDeltaTime - 1f / 3f) < 1e-3f)
                    f.Add("info", "physics.max_dt_default", "ProjectSettings/TimeManager.asset",
                        $"Maximum Allowed Timestep is the default 0.333 s: up to {Mathf.FloorToInt(Time.maximumDeltaTime / Time.fixedDeltaTime)} catch-up steps in one frame",
                        "cap it (0.1 = 5 steps at 50 Hz) if hitches must not snowball; the simulation then slows down instead");
                if (dm.FindProperty("m_AutoSyncTransforms").boolValue)
                    f.Add("warn", "physics.auto_sync", "ProjectSettings/DynamicsManager.asset", "Auto Sync Transforms is on (deprecated in 6.3): a sync before every query", "off; call Physics.SyncTransforms() where a query must see a moved collider");
                if (!Physics.reuseCollisionCallbacks)
                    f.Add("warn", "physics.reuse_callbacks_off", "ProjectSettings/DynamicsManager.asset", "Reuse Collision Callbacks is off: one Collision allocation per callback", "turn it on and never store the Collision object");
                if (Physics.queriesHitTriggers)
                    f.Add("info", "physics.queries_hit_triggers", "ProjectSettings/DynamicsManager.asset", "Queries Hit Triggers is on (6.3 default): raycasts hit trigger volumes", "pass QueryTriggerInteraction explicitly in every query");
                int proj = LayerMask.NameToLayer("Projectile");
                if (proj >= 0 && !Physics.GetIgnoreLayerCollision(proj, proj))
                    f.Add("warn", "physics.projectile_self_collision", "Layer Collision Matrix", "Projectile collides with Projectile", "untick Projectile x Projectile unless the design needs it");
                int pairs = 0;
                for (int a = 8; a < 32; a++) for (int b = a; b < 32; b++)
                    if (!string.IsNullOrEmpty(LayerMask.LayerToName(a)) && !string.IsNullOrEmpty(LayerMask.LayerToName(b)) && !Physics.GetIgnoreLayerCollision(a, b)) pairs++;

                // ---- bodies and colliders
                var bodies = Object.FindObjectsByType<Rigidbody>(FindObjectsSortMode.None);
                int ccdDyn = 0, ccdSpec = 0, interp = 0;
                foreach (var rb in bodies)
                {
                    if (rb.collisionDetectionMode == CollisionDetectionMode.ContinuousDynamic) ccdDyn++;
                    if (rb.collisionDetectionMode == CollisionDetectionMode.ContinuousSpeculative) ccdSpec++;
                    if (rb.interpolation != RigidbodyInterpolation.None) interp++;
                    if (!rb.isKinematic)
                        foreach (var mc in rb.GetComponentsInChildren<MeshCollider>())
                            if (!mc.convex) f.Add("error", "physics.concave_dynamic", PathOf(mc), "non-convex MeshCollider under a non-kinematic Rigidbody", "convex hull or compound primitives");
                }
                if (ccdDyn > 0) f.Add("warn", "physics.ccd_dynamic", "scene", ccdDyn + " bodies on Continuous Dynamic (last resort, cost grows with interactions)", "Continuous Speculative first; Continuous for static geometry only");
                // proximity through triggers on moving objects: every moving collider pays transform sync (Survival Kids [00:43:04])
                int movingTriggers = Object.FindObjectsByType<Collider>(FindObjectsSortMode.None)
                    .Count(c => c.isTrigger && c.enabled && (c.attachedRigidbody != null || c.GetComponentInParent<NavMeshAgent>() != null));
                if (movingTriggers >= 100)
                    f.Add("info", "physics.many_moving_triggers", "scene", movingTriggers + " trigger colliders on moving objects: proximity by triggers pays transform sync for each",
                        "your own list with sqrMagnitude, or a spatial grid / KD tree rebuilt per frame in a Burst job (ProximityBenchmark)");

                // ---- character controllers (6.3 Manual numbers)
                foreach (var cc in Object.FindObjectsByType<CharacterController>(FindObjectsSortMode.None))
                {
                    float minSkin = Mathf.Max(0.01f, 0.1f * cc.radius);
                    if (cc.skinWidth < minSkin) f.Add("warn", "cc.skin_width", PathOf(cc), $"skinWidth {cc.skinWidth:0.###} < max(0.01, 10% of radius) = {minSkin:0.###}: the usual cause of a stuck character", "raise skinWidth");
                    if (cc.minMoveDistance > 0f) f.Add("warn", "cc.min_move", PathOf(cc), "minMoveDistance > 0 drops small moves", "0");
                    float scale = cc.height / 2f;
                    if (cc.stepOffset < 0.1f * scale || cc.stepOffset > 0.4f * scale) f.Add("info", "cc.step_offset", PathOf(cc), $"stepOffset {cc.stepOffset:0.##} outside 0.1 to 0.4 m for a 2 m human (scaled)", "0.1 to 0.4 at 2 m height");
                    var ccBody = cc.GetComponent<Rigidbody>();   // `!= null`, never `is`: Editor fake nulls
                    if (ccBody != null && !ccBody.isKinematic) f.Add("error", "cc.with_dynamic_body", PathOf(cc), "CharacterController + non-kinematic Rigidbody: two motion authorities", "remove the Rigidbody or make it kinematic");
                }

                // ---- navigation
                var agents = Object.FindObjectsByType<NavMeshAgent>(FindObjectsSortMode.None);
                foreach (var ag in agents)
                {
                    var rb = ag.GetComponent<Rigidbody>();
                    if (rb != null && !rb.isKinematic && ag.enabled) f.Add("error", "nav.agent_dynamic_body", PathOf(ag), "NavMeshAgent + non-kinematic Rigidbody: race condition (AI Navigation manual)", "Is Kinematic on");
                    var ob = ag.GetComponent<NavMeshObstacle>();
                    if (ob != null && ob.enabled && ag.enabled) f.Add("error", "nav.agent_and_obstacle", PathOf(ag), "agent and obstacle both enabled: the agent avoids itself", "enable only one (obstacle on death)");
                    var anim = ag.GetComponent<Animator>();
                    if (anim != null && anim.applyRootMotion && ag.updatePosition) f.Add("warn", "nav.root_motion_and_agent", PathOf(ag), "Apply Root Motion and the agent both move the transform", "one direction of flow: root motion off, or agent.updatePosition = false");
                }
                foreach (var ob in Object.FindObjectsByType<NavMeshObstacle>(FindObjectsSortMode.None))
                {
                    var rb = ob.GetComponent<Rigidbody>();
                    if (ob.carving && !ob.carveOnlyStationary && rb != null && !rb.isKinematic) f.Add("warn", "nav.carve_moving", PathOf(ob), "carving re-computed while a physics body moves", "Carve Only Stationary for physics props");
                }
                var surfaces = Object.FindObjectsByType<NavMeshSurface>(FindObjectsSortMode.None);
                foreach (var s in surfaces)
                {
                    if (s.navMeshData == null) f.Add("error", "nav.not_baked", PathOf(s), "NavMeshSurface has no NavMeshData", "BuildNavMesh() then save the data as an asset");
                    else if (string.IsNullOrEmpty(AssetDatabase.GetAssetPath(s.navMeshData))) f.Add("error", "nav.data_not_asset", PathOf(s), "NavMeshData lives only in memory: lost when the scene reloads", "AssetDatabase.CreateAsset(surface.navMeshData, ...) before saving the scene");
                    var st = NavMesh.GetSettingsByID(s.agentTypeID);
                    if (s.overrideVoxelSize)
                    {
                        float vpr = st.agentRadius / Mathf.Max(1e-4f, s.voxelSize);
                        if (vpr < 1f || vpr > 8f) f.Add("warn", "nav.voxel_size", PathOf(s), $"{vpr:0.#} voxels per agent radius (manual: 3 default, 1-2 open areas, 4-6 interiors, >8 rarely helps)", "voxelSize = agentRadius / 3");
                    }
                }
                if (agents.Length > 0 && surfaces.Length == 0) f.Add("error", "nav.no_surface", "scene", "NavMeshAgents but no NavMeshSurface (AI Navigation 2.x bakes per surface)", "add a NavMeshSurface and bake");

                // ---- audio
                var sources = Object.FindObjectsByType<AudioSource>(FindObjectsSortMode.None);
                int unrouted = 0;
                foreach (var a in sources)
                {
                    if (a.outputAudioMixerGroup == null) { unrouted++; f.Add("warn", "audio.no_mixer_group", PathOf(a), "Output None (the default) bypasses every mixer: sliders, snapshots and ducking miss it", "assign an AudioMixerGroup"); }
                    if (a.loop && a.spatialBlend > 0.5f && a.clip != null && a.clip.length > 30f) f.Add("info", "audio.music_3d", PathOf(a), "long looping clip on a 3D source (downmixed to mono)", "music on spatialBlend 0");
                }
                int listeners = Object.FindObjectsByType<AudioListener>(FindObjectsSortMode.None).Count(l => l.enabled);
                if (listeners > 1) f.Add("error", "audio.listeners", "scene", listeners + " enabled AudioListeners (one per scene)", "keep one, on the camera or the player");
                if (listeners == 0 && sources.Length > 0) f.Add("warn", "audio.no_listener", "scene", "AudioSources but no AudioListener", "add one");

                return new Dictionary<string, object>
                {
                    { "scene", EditorSceneManager.GetActiveScene().path },
                    { "counts", f.Counts() }, { "findings", f.items },
                    { "facts", new Dictionary<string, object>
                        {
                            { "rigidbodies", bodies.Length }, { "ccd_speculative", ccdSpec }, { "ccd_dynamic", ccdDyn }, { "interpolated", interp },
                            { "agents", agents.Length }, { "surfaces", surfaces.Length }, { "audio_sources", sources.Length }, { "unrouted_sources", unrouted },
                            { "listeners", listeners }, { "user_layer_pairs_colliding", pairs },
                            { "fixed_dt", Time.fixedDeltaTime }, { "max_dt", Time.maximumDeltaTime },
                        } },
                };
            });
        }

        /// <summary>args: counts ([200, 2000, 20000]), iterations (200).</summary>
        public static void PerceptionBenchmark()
        {
            AgentJob.Run(() =>
            {
                var counts = AgentJob.Has("counts") ? AgentJob.List("counts").Select(o => (int)AgentJson.ToDouble(o)).ToList() : new List<int> { 200, 2000, 20000 };
                int it = AgentJob.Int("iterations", 200);
                var rows = new List<object>();
                foreach (var n in counts)
                {
                    var r = AgentKit.Gameplay.PerceptionBenchmark.Run(n, it);
                    rows.Add(new Dictionary<string, object>
                    {
                        { "agents", r.agents }, { "candidates", r.candidates }, { "match", r.resultsMatch },
                        { "managed_ms", System.Math.Round(r.managedMs, 5) }, { "burst_run_ms", System.Math.Round(r.burstRunMs, 5) },
                        { "burst_parallel_ms", System.Math.Round(r.burstParallelMs, 5) },
                        { "speedup_run", System.Math.Round(r.managedMs / System.Math.Max(1e-6, r.burstRunMs), 2) },
                        { "speedup_parallel", System.Math.Round(r.managedMs / System.Math.Max(1e-6, r.burstParallelMs), 2) },
                    });
                }
                return new Dictionary<string, object>
                {
                    { "rows", rows }, { "iterations", it }, { "job_workers", Unity.Jobs.LowLevel.Unsafe.JobsUtility.JobWorkerCount },
                    { "burst_enabled", Unity.Burst.BurstCompiler.IsEnabled },
                    { "note", "Editor numbers with job safety checks; confirm in a development player" },
                };
            });
        }

        /// <summary>args: cases ([[1000, 20], [10000, 200]] as [items, queries]), radius (5), iterations (100).
        /// Brute force (managed, Burst) vs a per-call Burst grid; see ProximityBenchmark.cs.</summary>
        public static void ProximityBenchmark()
        {
            AgentJob.Run(() =>
            {
                var cases = new List<int[]>();
                if (AgentJob.Has("cases"))
                    foreach (var o in AgentJob.List("cases"))
                        if (o is List<object> l && l.Count == 2) cases.Add(new[] { (int)AgentJson.ToDouble(l[0]), (int)AgentJson.ToDouble(l[1]) });
                if (cases.Count == 0) { cases.Add(new[] { 1000, 20 }); cases.Add(new[] { 10000, 200 }); }
                float radius = AgentJob.Float("radius", 5f);
                int it = AgentJob.Int("iterations", 100);
                var rows = new List<object>();
                foreach (var c in cases)
                {
                    var r = AgentKit.Gameplay.ProximityBenchmark.Run(c[0], c[1], radius, 100f, it);
                    rows.Add(new Dictionary<string, object>
                    {
                        { "items", r.items }, { "queries", r.queries }, { "match", r.match }, { "found", r.totalFound },
                        { "managed_ms", System.Math.Round(r.managedMs, 5) }, { "managed_per_query_ms", System.Math.Round(r.managedMs / r.queries, 5) },
                        { "burst_brute_ms", System.Math.Round(r.burstBruteMs, 5) },
                        { "grid_build_ms", System.Math.Round(r.gridBuildMs, 5) }, { "grid_query_ms", System.Math.Round(r.gridQueryMs, 5) },
                        { "grid_total_ms", System.Math.Round(r.gridBuildMs + r.gridQueryMs, 5) },
                    });
                }
                return new Dictionary<string, object>
                {
                    { "rows", rows }, { "radius", radius }, { "iterations", it }, { "burst_enabled", Unity.Burst.BurstCompiler.IsEnabled },
                    { "job_workers", Unity.Jobs.LowLevel.Unsafe.JobsUtility.JobWorkerCount },
                    { "note", "Editor numbers with job safety checks; confirm in a development player" },
                };
            });
        }

        /// <summary>args: counts ([1000, 10000]), ticks (300). Sorted-by-type vs shuffled update order.</summary>
        public static void UpdateOrderBenchmark()
        {
            AgentJob.Run(() =>
            {
                var counts = AgentJob.Has("counts") ? AgentJob.List("counts").Select(o => (int)AgentJson.ToDouble(o)).ToList() : new List<int> { 1000, 10000 };
                int ticks = AgentJob.Int("ticks", 300);
                var rows = new List<object>();
                foreach (var n in counts)
                {
                    var r = AgentKit.Gameplay.UpdateOrderBenchmark.Run(n, ticks);
                    rows.Add(new Dictionary<string, object>
                    {
                        { "objects", r.objects }, { "types", r.types }, { "ticks", r.ticks },
                        { "sorted_mean_ms", System.Math.Round(r.sortedMean, 5) }, { "sorted_median_ms", System.Math.Round(r.sortedMedian, 5) }, { "sorted_max_ms", System.Math.Round(r.sortedMax, 5) },
                        { "shuffled_mean_ms", System.Math.Round(r.shuffledMean, 5) }, { "shuffled_median_ms", System.Math.Round(r.shuffledMedian, 5) }, { "shuffled_max_ms", System.Math.Round(r.shuffledMax, 5) },
                        { "mean_change_pct", System.Math.Round(100.0 * (r.sortedMean - r.shuffledMean) / System.Math.Max(1e-9, r.shuffledMean), 1) },
                    });
                }
                return new Dictionary<string, object> { { "rows", rows }, { "note", "Editor (Mono JIT) numbers; the order effect depends on the target CPU: confirm in a development player" } };
            });
        }
    }
}
