// scenario-unity-world-building v0.1 (2026-09-24). Views, atmosphere, sightlines and scene streaming setup.
//
// SetupViews: fixed camera bookmarks (AgentCapture.SaveBookmark, AgentView_*), TourAnchor_* points
//   plus a ProfileTour component (Alba's automated tour), landmark sightline raycasts from every
//   anchor (A Short Hike's landmarks-first guidance ladder, level design e-book signposting), spawn
//   orientation toward the landmark (e-book: spawn facing where the player should go), and a fog
//   pass (distance fog + procedural sky whose ground matches the fog, hiding the horizon line).
// SetAtmosphere: fog on or off for before/after captures (Firewatch: fog simplifies texture noise
//   and builds depth layers; the gradient-strip fog itself is a fullscreen pass: scenario-unity-shaders).
// SplitForStreaming: copies the island to a persistent core scene (terrain, lights, fog, player,
//   WorldStreamer) plus chunk scenes (village, kit town) with no lights, registers all of them in
//   the build list by path (6.3: EditorBuildSettings.scenes is the shared scene list of Build
//   Profiles), keeps the core ACTIVE (it owns RenderSettings and receives Instantiate).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace AgentKit.World
{
    public static class WorldScenes
    {
        public const string Island = WorldCommon.Root + "/Scenes/World_Island.unity";
        public const string Core = WorldCommon.Root + "/Scenes/World_Core.unity";
        public const string ChunkVillage = WorldCommon.Root + "/Scenes/World_Chunk_Village.unity";
        public const string ChunkKit = WorldCommon.Root + "/Scenes/World_Chunk_KitTown.unity";
        const float Eye = 1.7f;

        public static void SetupViews()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", Island));
                var terrain = WorldCommon.FindTerrain();
                var tower = FindByPrefix("BO_BellTower");
                var village = GameObject.Find("Village_Blockout");
                var kit = GameObject.Find("KitTown");
                var road = GameObject.Find("Road_Main");
                if (tower == null || village == null || kit == null) throw new InvalidOperationException("run BuildVillage and BuildKitTown first");
                var towerTop = Bounds(tower).center + Vector3.up * Bounds(tower).extents.y * 0.8f;
                var summitTower = FindByPrefix("BO_Watchtower");
                var landmarkTops = new List<(GameObject go, Vector3 top)> { (tower, towerTop) };
                if (summitTower != null) landmarkTops.Add((summitTower, Bounds(summitTower).center + Vector3.up * Bounds(summitTower).extents.y * 0.8f));
                var roadMesh = road ? road.GetComponent<MeshFilter>().sharedMesh : null;
                Vector3 beach = roadMesh ? roadMesh.vertices[0] : new Vector3(470, 12, 60);
                Vector3 roadMid = roadMesh ? roadMesh.vertices[roadMesh.vertexCount / 2] : new Vector3(500, 30, 300);
                var plaza = village.transform.position + new Vector3(-14f, 0, -2f);
                var kitC = Bounds(kit).center;
                var forest = DensestTreeSpot(terrain);
                var hill = HighestPoint(terrain);

                // bookmarks: fixed views every iteration is compared against
                WorldCommon.RemoveRoot("AgentViews");
                var views = new GameObject("AgentViews");
                var vb = new List<object>();
                void Bm(string n, Vector3 pos, Vector3 look, float fov = 60f)
                {
                    var cam = AgentCapture.SaveBookmark(n, pos, look, fov);
                    cam.transform.SetParent(views.transform, true);
                    cam.farClipPlane = 3000f;
                    vb.Add(n);
                }
                Bm("A_Aerial", new Vector3(500, 260, 60), new Vector3(520, 30, 520), 55f);
                var farLook = landmarkTops.Count > 1 ? landmarkTops[1].top : towerTop;   // the summit landmark reads from afar
                Vector3 roadEnd = roadMesh ? roadMesh.vertices[roadMesh.vertexCount - 1] : plaza;
                Bm("B_Beach", Up(terrain, beach + new Vector3(0, 0, -6f)), farLook);
                Bm("C_Road", Up(terrain, roadMid), roadEnd + Vector3.up * 2f);
                var towerBase = new Vector3(Bounds(tower).center.x, Bounds(tower).min.y, Bounds(tower).center.z);
                Bm("D_Plaza", Up(terrain, towerBase + new Vector3(-24f, 0, -22f)), towerBase + Vector3.up * 6f);
                Bm("E_KitTown", Up(terrain, kitC + new Vector3(-16f, 0, -22f)), kitC + Vector3.up * 2f);
                Bm("F_Forest", Up(terrain, forest), towerTop);
                var toVillage = new Vector3(plaza.x - hill.x, 0, plaza.z - hill.z).normalized;
                var hillView = hill + toVillage * 18f;                                    // beside the summit tower, not inside it
                Bm("G_Hilltop", Up(terrain, hillView), plaza + Vector3.up * 4f);

                // tour anchors + ProfileTour (Alba: teleport, turn 360, record per anchor)
                WorldCommon.RemoveRoot("ProfileTour");
                var tourGo = new GameObject("ProfileTour");
                var tour = tourGo.AddComponent<ProfileTour>();
                tour.startDelayFrames = AgentJob.Int("tour_start_delay", 60);
                tour.steps = AgentJob.Int("tour_steps", 8);
                tour.framesPerStep = AgentJob.Int("tour_frames_per_step", 12);
                tour.budgetMs = 1000f / AgentJob.Float("target_fps", 60f);
                tour.outputPath = AgentJob.ResolvePath(AgentJob.Str("tour_output", "Library/AgentKit/tour/profile_tour.json"));
                var anchors = new List<(string, Vector3)>
                {
                    ("TourAnchor_1_Beach", Up(terrain, beach)), ("TourAnchor_2_Road", Up(terrain, roadMid)), ("TourAnchor_3_Plaza", Up(terrain, plaza)),
                    ("TourAnchor_4_KitTown", Up(terrain, kitC + new Vector3(-16f, 0, -22f))), ("TourAnchor_5_Forest", Up(terrain, forest)), ("TourAnchor_6_Hilltop", Up(terrain, hillView)),
                };
                foreach (var (n, p) in anchors)
                {
                    var a = new GameObject(n);
                    a.transform.SetParent(tourGo.transform, false);
                    a.transform.position = p;
                    var toTower = towerTop - p; toTower.y = 0;
                    a.transform.rotation = Quaternion.LookRotation(toTower.sqrMagnitude > 1 ? toTower : Vector3.forward);
                    tour.anchors.Add(a.transform);
                }

                // landmark sightlines: raycast from each anchor to every landmark top (ignoring the
                // landmark's own colliders); an anchor passes when it sees at least one landmark
                Physics.SyncTransforms();
                var sight = new List<object>();
                int visible = 0, guided = 0;
                foreach (var (n, p) in anchors)
                {
                    var per = new List<object>();
                    bool any = false;
                    foreach (var (lgo, top) in landmarkTops)
                    {
                        var own = new HashSet<Collider>(lgo.GetComponentsInChildren<Collider>());
                        var dir = top - p; float dist = dir.magnitude;
                        var hits = Physics.RaycastAll(p, dir / dist, dist, ~0, QueryTriggerInteraction.Ignore).Where(h => !own.Contains(h.collider)).OrderBy(h => h.distance).ToList();
                        bool vis = hits.Count == 0;
                        any |= vis;
                        // when blocked: how much taller this landmark must be to clear the obstacle (2 m steps)
                        float needed = 0f;
                        if (!vis)
                            for (float extra = 2f; extra <= 80f; extra += 2f)
                            {
                                var t2 = top + Vector3.up * extra; var d2 = t2 - p;
                                if (!Physics.RaycastAll(p, d2.normalized, d2.magnitude, ~0, QueryTriggerInteraction.Ignore).Any(h => !own.Contains(h.collider))) { needed = extra; break; }
                                needed = -1f;
                            }
                        per.Add(new Dictionary<string, object> { { "landmark", lgo.name }, { "distance_m", Math.Round(dist, 1) }, { "visible", vis },
                            { "blocked_by", vis ? null : hits[0].collider.name }, { "extra_height_needed_m", vis ? 0f : needed } });
                    }
                    if (any) visible++;
                    // a point ON the main path is guided by the path itself (A Short Hike: paths always
                    // lead back to a main area); every other anchor, and the spawn, needs a landmark
                    bool onPath = n.Contains("Road");
                    if (any || onPath) guided++;
                    sight.Add(new Dictionary<string, object> { { "anchor", n }, { "sees_a_landmark", any }, { "on_main_path", onPath }, { "guided", any || onPath }, { "landmarks", per } });
                }

                // spawn: the main camera at the beach end of the road, facing a landmark it can see
                var cam = Camera.main;
                float spawnDot = 0f;
                var spawnTarget = towerTop;
                foreach (var l in (List<object>)((Dictionary<string, object>)sight[0])["landmarks"])
                {
                    var ld = (Dictionary<string, object>)l;
                    if ((bool)ld["visible"]) { spawnTarget = landmarkTops.First(x => x.go.name == (string)ld["landmark"]).top; break; }
                }
                if (cam != null)
                {
                    cam.transform.position = Up(terrain, beach);
                    cam.transform.rotation = Quaternion.LookRotation(spawnTarget - cam.transform.position);
                    cam.farClipPlane = 3000f;
                    var f = cam.transform.forward; f.y = 0; var d = spawnTarget - cam.transform.position; d.y = 0;
                    spawnDot = Vector3.Dot(f.normalized, d.normalized);
                }

                var fog = ApplyAtmosphere(AgentJob.Bool("fog", true), AgentJob.Float("fog_density", 0.0015f));
                WorldCommon.Save(scene);
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "bookmarks", vb }, { "tour_anchors", anchors.Select(a => (object)a.Item1).ToList() },
                    { "tour_output", tour.outputPath }, { "tour_frames", anchors.Count * tour.steps * tour.framesPerStep },
                    { "landmark", tower.name }, { "landmark_top", WorldCommon.V(towerTop) },
                    { "sightlines", sight }, { "landmark_visible_from", visible + "/" + anchors.Count }, { "guided", guided + "/" + anchors.Count },
                    { "spawn_sees_landmark", ((Dictionary<string, object>)sight[0])["sees_a_landmark"] },
                    { "spawn_facing_landmark_dot", Math.Round(spawnDot, 3) }, { "atmosphere", fog },
                };
            });
        }

        public static void SetAtmosphere()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", Island));
                var r = ApplyAtmosphere(AgentJob.Bool("fog", true), AgentJob.Float("fog_density", 0.0015f));
                WorldCommon.Save(scene);
                return r;
            });
        }

        /// <summary>Exponential-squared distance fog (URP Lit reads RenderSettings fog) and a procedural
        /// sky whose ground colour equals the fog colour, so the sea horizon dissolves instead of
        /// ending on a hard grey band (seen in the first aerial capture).</summary>
        static Dictionary<string, object> ApplyAtmosphere(bool on, float density)
        {
            var horizon = new Color(0.70f, 0.78f, 0.86f);
            RenderSettings.fog = on;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = density;
            RenderSettings.fogColor = horizon;
            string skyPath = WorldCommon.EnsureFolder(WorldCommon.Root + "/Sky") + "/M_Sky.mat";
            var sky = AssetDatabase.LoadAssetAtPath<Material>(skyPath);
            var sh = Shader.Find("Skybox/Procedural");
            if (sky == null && sh != null) { sky = new Material(sh); AssetDatabase.CreateAsset(sky, skyPath); }
            if (sky != null)
            {
                sky.SetColor("_GroundColor", on ? horizon : new Color(0.37f, 0.35f, 0.34f));
                sky.SetColor("_SkyTint", new Color(0.5f, 0.55f, 0.62f));
                sky.SetFloat("_AtmosphereThickness", 0.9f);
                sky.SetFloat("_Exposure", 1.2f);
                EditorUtility.SetDirty(sky);
                RenderSettings.skybox = sky;
            }
            // visibility left at 500 m and 1 km: exp(-(d*density)^2)
            double v500 = Math.Exp(-Math.Pow(500 * density, 2)), v1000 = Math.Exp(-Math.Pow(1000 * density, 2));
            return new Dictionary<string, object> { { "fog", on }, { "mode", "ExponentialSquared" }, { "density", density },
                { "visibility_500m", Math.Round(on ? v500 : 1, 3) }, { "visibility_1000m", Math.Round(on ? v1000 : 1, 3) } };
        }

        // ------------------------------------------------------------------ streaming split
        public static void SplitForStreaming()
        {
            AgentJob.Run(() =>
            {
                var src = WorldCommon.OpenScene(AgentJob.Str("scene", Island));
                if (!EditorSceneManager.SaveScene(src, Core, true)) throw new InvalidOperationException("could not copy the island to " + Core);
                var core = EditorSceneManager.OpenScene(Core, OpenSceneMode.Single);
                var moves = new[] { ("Village_Blockout", ChunkVillage), ("KitTown", ChunkKit) };
                var chunks = new List<StreamedChunk>();
                var report = new List<object>();
                foreach (var (rootName, path) in moves)
                {
                    var go = core.GetRootGameObjects().FirstOrDefault(g => g.name == rootName);
                    if (go == null) throw new InvalidOperationException(rootName + " not found in the island scene");
                    var b = Bounds(go);
                    var chunk = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
                    SceneManager.MoveGameObjectToScene(go, chunk);
                    if (!EditorSceneManager.SaveScene(chunk, path)) throw new InvalidOperationException("save failed " + path);
                    int lights = chunk.GetRootGameObjects().Sum(r => r.GetComponentsInChildren<Light>(true).Length);
                    chunks.Add(new StreamedChunk { scenePath = path, centre = b.center, loadRadius = AgentJob.Float("load_radius", 250f), unloadRadius = AgentJob.Float("unload_radius", 320f) });
                    report.Add(new Dictionary<string, object> { { "scene", path }, { "root", rootName }, { "centre", WorldCommon.V(b.center) },
                        { "renderers", go.GetComponentsInChildren<Renderer>(true).Length }, { "lights_in_chunk", lights } });
                    EditorSceneManager.CloseScene(chunk, true);
                }
                SceneManager.SetActiveScene(core);                       // the core owns lighting and fog
                WorldCommon.RemoveRoot("ProfileTour");                   // the tour belongs to the review scene, not the game
                WorldCommon.RemoveRoot("Streamer");
                var streamer = new GameObject("Streamer").AddComponent<WorldStreamer>();
                streamer.chunks = chunks;
                streamer.viewer = Camera.main ? Camera.main.transform : null;
                WorldCommon.Save(core);

                // build list by path: core first; the chunks; the island for captures and the tour
                var list = new List<EditorBuildSettingsScene>();
                foreach (var p in new[] { Core, ChunkVillage, ChunkKit, Island })
                    list.Add(new EditorBuildSettingsScene(p, true));
                foreach (var e in EditorBuildSettings.scenes)
                    if (!list.Any(x => x.path == e.path)) list.Add(e);
                EditorBuildSettings.scenes = list.ToArray();
                var names = list.Select(s => Path.GetFileNameWithoutExtension(s.path)).ToList();
                return new Dictionary<string, object>
                {
                    { "core", Core }, { "chunks", report }, { "active_scene", SceneManager.GetActiveScene().path },
                    { "build_scenes", list.Select(s => (object)s.path).ToList() },
                    { "duplicate_scene_names", names.GroupBy(n => n, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1).Select(g => (object)g.Key).ToList() },
                    { "streamer", new Dictionary<string, object> { { "chunks", chunks.Count }, { "load_radius", chunks[0].loadRadius }, { "unload_radius", chunks[0].unloadRadius } } },
                };
            });
        }

        // ------------------------------------------------------------------ helpers
        static Vector3 Up(Terrain t, Vector3 p) => WorldCommon.Ground(t, p.x, p.z) + Vector3.up * Eye;

        public static Bounds Bounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>(true);
            if (rs.Length == 0) return new Bounds(go.transform.position, Vector3.zero);
            var b = rs[0].bounds;
            foreach (var r in rs) b.Encapsulate(r.bounds);
            return b;
        }

        static GameObject FindByPrefix(string prefix)
        {
            foreach (var t in Object.FindObjectsByType<Transform>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                if (t.name.StartsWith(prefix)) return t.gameObject;
            return null;
        }

        internal static Vector3 DensestTreeSpot(Terrain t)
        {
            var td = t.terrainData;
            var pos = td.treeInstances.Select(i => Vector3.Scale(i.position, td.size) + t.transform.position).ToArray();
            if (pos.Length == 0) return t.transform.position + td.size * 0.5f;
            var cells = new Dictionary<Vector2Int, int>();
            foreach (var p in pos) { var k = new Vector2Int(Mathf.FloorToInt(p.x / 30f), Mathf.FloorToInt(p.z / 30f)); cells[k] = cells.TryGetValue(k, out var c) ? c + 1 : 1; }
            var best = cells.OrderByDescending(kv => kv.Value).First().Key;
            return new Vector3(best.x * 30f + 15f, 0, best.y * 30f + 15f);
        }

        internal static Vector3 HighestPoint(Terrain t)
        {
            var td = t.terrainData; int r = td.heightmapResolution;
            var h = td.GetHeights(0, 0, r, r);
            int bx = 0, bz = 0; float best = -1;
            for (int z = 0; z < r; z += 4) for (int x = 0; x < r; x += 4) if (h[z, x] > best) { best = h[z, x]; bx = x; bz = z; }
            return new Vector3(bx / (float)(r - 1) * td.size.x, 0, bz / (float)(r - 1) * td.size.z) + t.transform.position;
        }
    }
}
