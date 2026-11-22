// scenario-unity-gameplay AgentKit jobs (Unity Expert Skills v0.1, 2026-09-24): NavMesh baked from code,
// validated by queries, made visible for a capture, and the 200-agent crowd scene.
//   BuildNavArena   arena + patrol enemy + player stand-in, NavMeshSurface baked and SAVED as an
//                   asset next to the scene (what the Bake button does), path and sample checks,
//                   optional voxel-size sweep and the unsaved-bake control: BuildNavMesh() without
//                   CreateAsset embeds the NavMeshData in the scene and the scene file silently
//                   turns BINARY (observed 6000.3.21f1), which breaks text diffs and merges.
//   NavMeshOverlay  NavMesh.CalculateTriangulation() -> a bright mesh + a top-down bookmark, saved
//                   as a copy of the scene, so AgentCapture shows the NavMesh (the Scene view overlay
//                   does not exist in batch mode).
//   BuildCrowdScene N enemies (default 200) + director mode + moving target + AIBudgetMeter, baked,
//                   for AgentKit.AgentProfile.PlayModeTimings.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using Object = UnityEngine.Object;

namespace AgentKit.Gameplay
{
    public static class GameplayScenes
    {
        public const string Root = "Assets/AgentKit.Gameplay";
        public const string ArenaScene = Root + "/Scenes/GameplayArena.unity";
        public const string CrowdScene = Root + "/Scenes/GameplayCrowd.unity";

        // ------------------------------------------------------------------ helpers
        public static Material Mat(string name, Color c)
        {
            Directory.CreateDirectory(Root + "/Materials");
            var path = Root + "/Materials/" + name + ".mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                var sh = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                m = new Material(sh);
                AssetDatabase.CreateAsset(m, path);
            }
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c); else m.color = c;
            EditorUtility.SetDirty(m);
            return m;
        }

        public static Material UnlitMat(string name, Color c)
        {
            Directory.CreateDirectory(Root + "/Materials");
            var path = Root + "/Materials/" + name + ".mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Unlit/Color"));
                AssetDatabase.CreateAsset(m, path);
            }
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c); else m.color = c;
            EditorUtility.SetDirty(m);
            return m;
        }

        static GameObject Box(string name, Vector3 center, Vector3 size, Material m, int layer, Transform parent)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.position = center;
            go.transform.localScale = size;
            go.GetComponent<Renderer>().sharedMaterial = m;
            go.layer = layer;
            return go;
        }

        static GameObject Ground(float size, Material m, int layer, Transform parent)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Plane);
            g.name = "Ground";
            g.transform.SetParent(parent, false);
            g.transform.localScale = new Vector3(size / 10f, 1f, size / 10f);
            g.GetComponent<Renderer>().sharedMaterial = m;
            g.layer = layer;
            return g;
        }

        static void Walls(float half, float height, Material m, int layer, Transform parent)
        {
            Box("Wall_N", new Vector3(0, height / 2, half), new Vector3(2 * half + 0.5f, height, 0.5f), m, layer, parent);
            Box("Wall_S", new Vector3(0, height / 2, -half), new Vector3(2 * half + 0.5f, height, 0.5f), m, layer, parent);
            Box("Wall_E", new Vector3(half, height / 2, 0), new Vector3(0.5f, height, 2 * half + 0.5f), m, layer, parent);
            Box("Wall_W", new Vector3(-half, height / 2, 0), new Vector3(0.5f, height, 2 * half + 0.5f), m, layer, parent);
        }

        public static GameObject Capsule(string name, Vector3 pos, Material m, int layer)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);   // 2 m tall, radius 0.5
            go.name = name;
            go.transform.position = pos + Vector3.up;                     // pivot at the centre
            go.GetComponent<Renderer>().sharedMaterial = m;
            go.layer = layer;
            var rb = go.AddComponent<Rigidbody>();
            rb.isKinematic = true;                                        // agent-driven: never a non-kinematic body
            rb.useGravity = false;
            return go;
        }

        /// <summary>Bake one surface and persist the NavMeshData as an asset next to the scene, like
        /// the Inspector's Bake button. Returns (ms, asset path). Observed twice on 2026-09-24: after
        /// saving a new scene over an existing scene file, the live NavMesh was empty (0 triangles, every
        /// query PathInvalid) while the saved data was fine on reopen. So queries are preceded by
        /// EnsureLoaded, which re-registers the surface data when empty.</summary>
        public static (double ms, string asset) BakeAndSave(NavMeshSurface s, string scenePath, bool save = true)
        {
            var sw = Stopwatch.StartNew();
            s.BuildNavMesh();
            double ms = sw.Elapsed.TotalMilliseconds;
            string asset = null;
            ReloadedAfterSave = false;
            if (save && s.navMeshData != null)
            {
                var dir = Path.Combine(Path.GetDirectoryName(scenePath), Path.GetFileNameWithoutExtension(scenePath)).Replace('\\', '/');
                Directory.CreateDirectory(dir);
                asset = dir + "/NavMesh-" + s.gameObject.name + ".asset";
                AssetDatabase.CreateAsset(s.navMeshData, asset);          // regenerated data: replaced on rebake
                EditorUtility.SetDirty(s);
                ReloadedAfterSave |= EnsureLoaded(s);
            }
            return (ms, asset);
        }

        public static bool ReloadedAfterSave;

        /// <summary>If the live NavMesh is empty although the surface has data, toggle the surface
        /// (OnDisable/OnEnable = RemoveData/AddData). Returns true when a reload was needed.</summary>
        public static bool EnsureLoaded(NavMeshSurface s)
        {
            if (s == null || s.navMeshData == null || NavMesh.CalculateTriangulation().vertices.Length > 0) return false;
            s.enabled = false; s.enabled = true;
            return true;
        }

        static NavMeshSurface Surface(Transform parent, int envLayer, float voxelsPerRadius, bool heightMesh, out float agentRadius)
        {
            var go = new GameObject("NavSurface");
            go.transform.SetParent(parent, false);
            var s = go.AddComponent<NavMeshSurface>();
            s.agentTypeID = 0;                                             // Humanoid; one surface per agent type
            s.collectObjects = CollectObjects.All;
            s.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
            s.layerMask = 1 << envLayer;                                   // agents, player, projectiles never baked
            var st = NavMesh.GetSettingsByID(s.agentTypeID);
            agentRadius = st.agentRadius;
            s.overrideVoxelSize = true;
            s.voxelSize = agentRadius / Mathf.Max(0.5f, voxelsPerRadius); // manual rule: 3 per radius, 4-6 indoors
            s.buildHeightMesh = heightMesh;
            return s;
        }

        static void AddToBuildSettings(string scene)
        {
            var list = EditorBuildSettings.scenes.Where(x => x.path != scene).ToList();
            list.Add(new EditorBuildSettingsScene(scene, true));
            EditorBuildSettings.scenes = list.ToArray();
        }

        static Dictionary<string, object> PathCheck(Vector3 a, Vector3 b)
        {
            var p = new NavMeshPath();
            bool ok = NavMesh.CalculatePath(a, b, NavMesh.AllAreas, p);
            float len = 0f;
            for (int i = 1; i < p.corners.Length; i++) len += Vector3.Distance(p.corners[i - 1], p.corners[i]);
            return new Dictionary<string, object> { { "calc", ok }, { "status", p.status.ToString() }, { "length", Math.Round(len, 2) }, { "corners", p.corners.Length } };
        }

        /// <summary>Force Text scenes start with "%YAML"; a binary scene does not.</summary>
        public static bool IsTextScene(string assetPath)
        {
            var full = AgentJob.ResolvePath(assetPath);
            if (!File.Exists(full)) return false;
            using (var fs = File.OpenRead(full))
            {
                var buf = new byte[5];
                int n = fs.Read(buf, 0, 5);
                return n == 5 && System.Text.Encoding.ASCII.GetString(buf) == "%YAML";
            }
        }

        static Dictionary<string, object> TriStats()
        {
            var t = NavMesh.CalculateTriangulation();
            return new Dictionary<string, object> { { "vertices", t.vertices.Length }, { "triangles", t.indices.Length / 3 } };
        }

        // ------------------------------------------------------------------ arena
        public static readonly Vector3[] ArenaWaypoints =
        {
            new Vector3(-8, 0, -8), new Vector3(8, 0, -8), new Vector3(8, 0, -1), new Vector3(-8, 0, -1),
        };
        public static readonly Vector3 HidingSpot = new Vector3(-6, 0, 10);
        public static readonly Vector3 DoorSouth = new Vector3(6, 0, 2), DoorNorth = new Vector3(6, 0, 6);

        /// <summary>args: scene, voxels_per_radius (3), height_mesh (false), door_width (1.6),
        /// sweep ([1,2,3,6] voxels per radius, or [] to skip), unsaved_trap (false).</summary>
        public static void BuildNavArena()
        {
            AgentJob.Run(() =>
            {
                GameplaySetup.EnsureLayers(GameplaySetup.DefaultLayers);
                int env = GameplaySetup.Layer("Environment"), pl = GameplaySetup.Layer("Player"), en = GameplaySetup.Layer("Enemy");
                string scenePath = AgentJob.Str("scene", ArenaScene);
                float vpr = AgentJob.Float("voxels_per_radius", 3f);
                float door = AgentJob.Float("door_width", 1.6f);
                Directory.CreateDirectory(Path.GetDirectoryName(scenePath));

                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                var level = new GameObject("Level").transform;
                var mGround = Mat("M_Ground", new Color(0.42f, 0.44f, 0.40f));
                var mWall = Mat("M_Wall", new Color(0.78f, 0.76f, 0.70f));
                Ground(30f, mGround, env, level);
                Walls(15f, 2f, mWall, env, level);
                // divider at z = 4 with one door: blocks line of sight, forces paths through the door
                float dx = 6f, a = dx - door / 2f, b = dx + door / 2f;
                Box("Divider_A", new Vector3((-15f + a) / 2f, 1.5f, 4f), new Vector3(a + 15f, 3f, 0.4f), mWall, env, level);
                Box("Divider_B", new Vector3((b + 15f) / 2f, 1.5f, 4f), new Vector3(15f - b, 3f, 0.4f), mWall, env, level);
                Box("Crate_1", new Vector3(-2f, 0.5f, -4.5f), new Vector3(1.5f, 1f, 1.5f), Mat("M_Crate", new Color(0.7f, 0.42f, 0.2f)), env, level);
                Box("Crate_2", new Vector3(3f, 0.5f, 10f), new Vector3(2f, 1f, 1f), Mat("M_Crate", new Color(0.7f, 0.42f, 0.2f)), env, level);

                var surface = Surface(level, env, vpr, AgentJob.Bool("height_mesh", false), out float agentRadius);

                // player stand-in, hidden behind the divider
                var player = Capsule("Player", HidingSpot, Mat("M_Player", new Color(0.15f, 0.45f, 0.95f)), pl);
                var hp = player.AddComponent<Health>(); hp.max = hp.current = 1000f;
                var mover = player.AddComponent<TargetMover>(); mover.moving = false;

                // enemy on the patrol square
                var enemy = Capsule("Enemy", ArenaWaypoints[0], Mat("M_Enemy", new Color(0.9f, 0.2f, 0.2f)), en);
                enemy.transform.rotation = Quaternion.LookRotation(Vector3.right);
                var agent = enemy.AddComponent<NavMeshAgent>();
                agent.radius = 0.4f; agent.height = 2f; agent.baseOffset = 1f;   // pivot at the capsule centre
                agent.speed = 2f; agent.angularSpeed = 540f; agent.acceleration = 16f;
                agent.obstacleAvoidanceType = ObstacleAvoidanceType.MedQualityObstacleAvoidance;
                var brain = enemy.AddComponent<EnemyBrain>();
                brain.target = player.transform; brain.targetHealth = hp;
                brain.waypoints = ArenaWaypoints.ToArray();
                brain.occluders = 1 << env;
                brain.eyeHeight = 0.6f;                 // pivot is the capsule centre (1 m up): eye at 1.6 m
                brain.targetAimHeight = 0f;

                var (ms, asset) = BakeAndSave(surface, scenePath);
                // camera looks at the arena from above-south, for captures
                var cam = Camera.main;
                cam.transform.position = new Vector3(0f, 26f, -22f);
                cam.transform.LookAt(new Vector3(0f, 0f, 0f));
                AgentCapture.SaveBookmark("ArenaTop", new Vector3(0f, 34f, -0.01f), Vector3.zero, 55f);
                EditorSceneManager.SaveScene(scene, scenePath);
                AddToBuildSettings(scenePath);
                bool reloadAfterSceneSave = EnsureLoaded(surface);

                var checks = new Dictionary<string, object>();
                for (int i = 0; i < ArenaWaypoints.Length; i++)
                    checks["wp" + i + "->wp" + ((i + 1) % ArenaWaypoints.Length)] = PathCheck(ArenaWaypoints[i], ArenaWaypoints[(i + 1) % ArenaWaypoints.Length]);
                checks["door"] = PathCheck(DoorSouth, DoorNorth);
                checks["enemy->hiding"] = PathCheck(ArenaWaypoints[0], HidingSpot);
                var samples = new List<object>();
                foreach (var p in new[] { ArenaWaypoints[0], HidingSpot, new Vector3(0, 0, -4.5f) })
                {
                    bool hit = NavMesh.SamplePosition(p, out var nh, 1.0f, NavMesh.AllAreas);
                    samples.Add(new Dictionary<string, object> { { "point", p }, { "on_navmesh", hit }, { "offset", hit ? Math.Round(Vector3.Distance(p, nh.position), 3) : -1 } });
                }
                var result = new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "navmesh_asset", asset }, { "bake_ms", Math.Round(ms, 1) },
                    { "agent_radius", agentRadius }, { "voxel_size", surface.voxelSize }, { "voxels_per_radius", vpr },
                    { "tris", TriStats() }, { "paths", checks }, { "samples", samples }, { "door_width", door },
                    { "scene_is_text", IsTextScene(scenePath) }, { "reloaded_after_asset_save", ReloadedAfterSave }, { "reloaded_after_scene_save", reloadAfterSceneSave },
                };

                // persistence: reopen the saved scene and query again
                EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var s2 = Object.FindFirstObjectByType<NavMeshSurface>();
                result["reopened"] = new Dictionary<string, object>
                {
                    { "has_data", s2 != null && s2.navMeshData != null },
                    { "data_asset", s2 != null && s2.navMeshData != null ? AssetDatabase.GetAssetPath(s2.navMeshData) : null },
                    { "door_path", PathCheck(DoorSouth, DoorNorth)["status"] },
                };

                // voxel sweep: bake time and whether the 1.2 m door survives erosion
                var sweep = new List<object>();
                foreach (var o in AgentJob.Has("sweep") ? AgentJob.List("sweep") : new List<object> { 1.0, 2.0, 3.0, 6.0 })
                {
                    float v = (float)AgentJson.ToDouble(o);
                    s2.overrideVoxelSize = true;
                    s2.voxelSize = agentRadius / v;
                    var sw = Stopwatch.StartNew();
                    s2.BuildNavMesh();                                          // in memory only: not saved
                    sweep.Add(new Dictionary<string, object>
                    {
                        { "voxels_per_radius", v }, { "voxel_size", Math.Round(s2.voxelSize, 4) }, { "bake_ms", Math.Round(sw.Elapsed.TotalMilliseconds, 1) },
                        { "tris", TriStats()["triangles"] }, { "door", PathCheck(DoorSouth, DoorNorth)["status"] },
                    });
                }
                result["sweep"] = sweep;

                // control pair: the same tiny scene saved with an unbaked surface, then baked WITHOUT
                // saving the NavMeshData as an asset
                if (AgentJob.Bool("unsaved_trap", false))
                {
                    var ctrlPath = Root + "/Scenes/Trap_Control_NoBake.unity";
                    var trapPath = Root + "/Scenes/Trap_UnsavedBake.unity";
                    var cs = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    Ground(10f, mGround, env, null);
                    Surface(null, env, 3f, false, out _);
                    EditorSceneManager.SaveScene(cs, ctrlPath);
                    var ts = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    Ground(10f, mGround, env, null);
                    var tsurf = Surface(null, env, 3f, false, out _);
                    tsurf.BuildNavMesh();
                    bool before = tsurf.navMeshData != null;
                    EditorSceneManager.SaveScene(ts, trapPath);
                    EditorSceneManager.OpenScene(trapPath, OpenSceneMode.Single);
                    var t2 = Object.FindFirstObjectByType<NavMeshSurface>();
                    result["unsaved_trap"] = new Dictionary<string, object>
                    {
                        { "data_before_save", before }, { "data_after_reopen", t2 != null && t2.navMeshData != null },
                        { "data_is_asset", t2 != null && t2.navMeshData != null && !string.IsNullOrEmpty(AssetDatabase.GetAssetPath(t2.navMeshData)) && AssetDatabase.GetAssetPath(t2.navMeshData) != trapPath },
                        { "trap_scene_is_text", IsTextScene(trapPath) }, { "control_scene_is_text", IsTextScene(ctrlPath) },
                        { "serialization_mode", EditorSettings.serializationMode.ToString() },
                    };
                }
                return result;
            });
        }

        // ------------------------------------------------------------------ visual substitute for the NavMesh overlay
        /// <summary>args: scene (arena), out_scene (scene copy with the overlay). Adds AgentNavOverlay
        /// (bright unlit mesh 5 cm above the NavMesh) and an AgentView_NavTop bookmark.</summary>
        public static void NavMeshOverlay()
        {
            AgentJob.Run(() =>
            {
                var src = AgentJob.Str("scene", ArenaScene);
                var dst = AgentJob.Str("out_scene", src.Replace(".unity", "_NavOverlay.unity"));
                var scene = EditorSceneManager.OpenScene(src, OpenSceneMode.Single);
                var tri = NavMesh.CalculateTriangulation();
                if (tri.vertices.Length == 0) throw new InvalidOperationException("no NavMesh loaded in " + src);
                var mesh = new Mesh { name = "AgentNavOverlay", indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
                mesh.vertices = tri.vertices.Select(v => v + Vector3.up * 0.05f).ToArray();
                mesh.triangles = tri.indices;
                mesh.RecalculateNormals();
                var meshPath = Path.Combine(Path.GetDirectoryName(dst), Path.GetFileNameWithoutExtension(dst) + "_mesh.asset").Replace('\\', '/');
                AssetDatabase.CreateAsset(mesh, meshPath);
                var go = GameObject.Find("AgentNavOverlay") ?? new GameObject("AgentNavOverlay");
                // no `??` on UnityEngine.Object: GetComponent can return a fake null in the Editor
                var mf = go.GetComponent<MeshFilter>(); if (!mf) mf = go.AddComponent<MeshFilter>();
                mf.sharedMesh = mesh;
                var mr = go.GetComponent<MeshRenderer>(); if (!mr) mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = UnlitMat("M_NavOverlay", new Color(0.1f, 0.85f, 0.9f));
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                var b = mesh.bounds;
                AgentCapture.SaveBookmark("NavTop", b.center + Vector3.up * (Mathf.Max(b.size.x, b.size.z) * 1.05f) + Vector3.back * 0.01f, b.center, 55f);
                EditorSceneManager.SaveScene(scene, dst, true);
                return new Dictionary<string, object>
                {
                    { "scene", dst }, { "vertices", tri.vertices.Length }, { "triangles", tri.indices.Length / 3 },
                    { "areas", tri.areas.Distinct().Count() }, { "bounds", b },
                };
            });
        }

        // ------------------------------------------------------------------ crowd
        /// <summary>args: count (200), mode (EveryFrame|Sliced|SlicedBurst), avoidance
        /// (High|Good|Med|Low|None), tick_hz (10), scene, label.</summary>
        public static void BuildCrowdScene()
        {
            AgentJob.Run(() =>
            {
                GameplaySetup.EnsureLayers(GameplaySetup.DefaultLayers);
                int env = GameplaySetup.Layer("Environment"), pl = GameplaySetup.Layer("Player"), en = GameplaySetup.Layer("Enemy");
                int count = AgentJob.Int("count", 200);
                var mode = (DirectorMode)Enum.Parse(typeof(DirectorMode), AgentJob.Str("mode", "Sliced"));
                var avoid = AgentJob.Str("avoidance", "Low");
                var avoidance = avoid.StartsWith("High") ? ObstacleAvoidanceType.HighQualityObstacleAvoidance
                    : avoid.StartsWith("Good") ? ObstacleAvoidanceType.GoodQualityObstacleAvoidance
                    : avoid.StartsWith("Med") ? ObstacleAvoidanceType.MedQualityObstacleAvoidance
                    : avoid.StartsWith("None") ? ObstacleAvoidanceType.NoObstacleAvoidance
                    : ObstacleAvoidanceType.LowQualityObstacleAvoidance;
                string scenePath = AgentJob.Str("scene", CrowdScene);
                Directory.CreateDirectory(Path.GetDirectoryName(scenePath));

                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                var level = new GameObject("Level").transform;
                var mWall = Mat("M_Wall", new Color(0.78f, 0.76f, 0.70f));
                Ground(64f, Mat("M_Ground", new Color(0.42f, 0.44f, 0.40f)), env, level);
                Walls(32f, 2f, mWall, env, level);
                for (int i = 0; i < 12; i++)
                {
                    float ang = i * Mathf.PI * 2f / 12f;
                    Box("Pillar_" + i, new Vector3(Mathf.Cos(ang) * 20f, 1.5f, Mathf.Sin(ang) * 20f), new Vector3(2f, 3f, 2f), mWall, env, level);
                }
                var surface = Surface(level, env, 3f, false, out _);
                var (ms, asset) = BakeAndSave(surface, scenePath);

                var player = Capsule("Player", new Vector3(12f, 0f, 0f), Mat("M_Player", new Color(0.15f, 0.45f, 0.95f)), pl);
                var hp = player.AddComponent<Health>(); hp.max = hp.current = 1e9f;
                var mover = player.AddComponent<TargetMover>(); mover.radius = 12f; mover.speed = 3f; mover.moving = true;

                var director = new GameObject("EnemyDirector").AddComponent<EnemyDirector>();
                director.mode = mode; director.avoidance = avoidance; director.target = player.transform;
                director.tickHz = AgentJob.Float("tick_hz", 10f);
                var meter = director.gameObject.AddComponent<AIBudgetMeter>();
                meter.label = AgentJob.Str("label", mode + "/" + avoid);

                var mEnemy = Mat("M_Enemy", new Color(0.9f, 0.2f, 0.2f));
                var enemies = new GameObject("Enemies").transform;
                int cols = Mathf.CeilToInt(Mathf.Sqrt(count * 1.6f));
                int placed = 0;
                for (int r = 0; placed < count && r < 200; r++)
                    for (int c = 0; c < cols && placed < count; c++)
                    {
                        var p = new Vector3(-27f + c * (54f / Mathf.Max(1, cols - 1)), 0f, -27f + r * 2.6f);
                        if (p.z > 27f) break;
                        if (!NavMesh.SamplePosition(p, out var hit, 1.0f, NavMesh.AllAreas)) continue;   // skip pillars
                        var e = Capsule("Enemy_" + placed, hit.position, mEnemy, en);
                        e.transform.SetParent(enemies, true);
                        e.transform.rotation = Quaternion.Euler(0f, (placed * 137) % 360, 0f);
                        var ag = e.AddComponent<NavMeshAgent>();
                        ag.radius = 0.4f; ag.height = 2f; ag.baseOffset = 1f; ag.speed = 2f; ag.angularSpeed = 540f; ag.acceleration = 16f;
                        ag.obstacleAvoidanceType = avoidance;
                        ag.avoidancePriority = 40 + placed % 20;                // spread priorities: fewer deadlocks
                        var br = e.AddComponent<EnemyBrain>();
                        br.target = player.transform; br.targetHealth = hp;
                        br.waypoints = new[] { hit.position + new Vector3(-2, 0, -2), hit.position + new Vector3(2, 0, -2), hit.position + new Vector3(2, 0, 2), hit.position + new Vector3(-2, 0, 2) };
                        br.occluders = 1 << env; br.eyeHeight = 0.6f; br.targetAimHeight = 0f;
                        br.recordTransitions = false;
                        br.selfTick = mode == DirectorMode.EveryFrame;
                        placed++;
                    }
                var cam = Camera.main;
                cam.transform.position = new Vector3(0f, 72f, -0.01f);
                cam.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
                cam.fieldOfView = 50f;
                EditorSceneManager.SaveScene(scene, scenePath);
                AddToBuildSettings(scenePath);
                return new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "agents", placed }, { "mode", mode.ToString() }, { "avoidance", avoidance.ToString() },
                    { "tick_hz", director.tickHz }, { "bake_ms", Math.Round(ms, 1) }, { "navmesh_asset", asset },
                };
            });
        }
    }
}
