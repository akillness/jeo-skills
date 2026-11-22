// scenario-unity-world-building v0.2 (2026-09-24). Guidance beyond one landmark (A Short Hike, ZW8gWgpptI8):
// the island's edge, walking back, and false peaks, measured on the real terrain.
//
// Job: AgentKit.World.WorldGuidance.AuditGuidance  args: scene, sectors (36), slope_limit_deg (45 =
//   CharacterController default slopeLimit; use the game's), poi_radius (150 m), max_empty_arc (300 m),
//   min_prominence (8 m), peak_radius (40 m), sea_level (default: the "Sea" object's Y)
//   - coast sectors: march in from the sea on N bearings; where a swimmer meets land, can they climb
//     out (slope), does that shore walk back to the spawn (flood fill with the slope limit), how far
//     is the nearest point of interest; arcs of coast with nothing within poi_radius are the empty
//     "Boring" backside players swim to first ([00:16:54], frame [00:17:47]);
//   - landmark visible from each shore point at eye height (a swimmer should see where to go);
//   - every point of interest walks back to the spawn ("any path leads back", [00:18:37]);
//   - false peaks: local maxima other than the summit with prominence >= min_prominence ("up any
//     incline" only works when the climb leads to the goal, [00:19:10]).
//   Points of interest: BO_* buildings, Landmarks children, KitTown houses, Road_Main ends, and
//   anything named POI_* or LM_* (TourAnchor_* are review tools, not content).
// Job: AgentKit.World.WorldGuidance.AddCoastContent  args: scene, points [[x, z], ...] (the audit's
//   empty-arc midpoints): places a placeholder blockout POI (a cairn with a vertex-colour legend, named
//   POI_Cove_<n>_w..) at each shore point: the scripted form of "put something there" (a cave, an
//   islet, a dock); art replaces the placeholder later.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world_v2.py.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.ProBuilder;
using Object = UnityEngine.Object;
using Math = System.Math;

namespace AgentKit.World
{
    public static class WorldGuidance
    {
        const float Eye = 1.7f;

        public static void AuditGuidance()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var terrain = WorldCommon.FindTerrain();
                var td = terrain.terrainData;
                var o = terrain.transform.position;
                float size = td.size.x;
                int res = td.heightmapResolution;
                var h01 = td.GetHeights(0, 0, res, res);
                var h = new float[res, res];
                for (int z = 0; z < res; z++) for (int x = 0; x < res; x++) h[z, x] = h01[z, x] * td.size.y + o.y;
                var seaGo = GameObject.Find("Sea");
                float sea = AgentJob.Has("sea_level") ? AgentJob.Float("sea_level") : (seaGo ? seaGo.transform.position.y : 10f);
                int sectors = AgentJob.Int("sectors", 36);
                float slope = AgentJob.Float("slope_limit_deg", 45f), poiR = AgentJob.Float("poi_radius", 150f);
                float maxArc = AgentJob.Float("max_empty_arc", 300f), minProm = AgentJob.Float("min_prominence", 8f);

                var pois = CollectPois(out var poiNames);
                var poi2 = pois.Select(p => new Vector2(p.x - o.x, p.z - o.z)).ToList();
                var cam = Camera.main;
                var spawn = cam ? cam.transform.position : pois.FirstOrDefault();
                var spawn2 = new Vector2(spawn.x - o.x, spawn.z - o.z);
                var centre2 = new Vector2(size * 0.5f, size * 0.5f);
                var rep = WorldGuide.Coast(h, size, sea, slope, spawn2, centre2, sectors, poi2, poiR);
                var mask = WorldGuide.Reachable(h, size, 4f, spawn2, sea, slope, out int n);

                // landmark visibility from each shore point (eye height)
                var landmarks = new List<(string name, Vector3 top, HashSet<Collider> own)>();
                foreach (var t in Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
                    if (t.name.StartsWith("BO_BellTower") || t.name.StartsWith("BO_Watchtower") || t.name.StartsWith("LM_"))
                    {
                        var b = WorldScenes.Bounds(t.gameObject);
                        landmarks.Add((t.name, b.center + Vector3.up * b.extents.y * 0.8f, new HashSet<Collider>(t.GetComponentsInChildren<Collider>())));
                    }
                Physics.SyncTransforms();
                var rows = new List<object>();
                int seen = 0, shores = 0;
                foreach (var s in rep.sectors)
                {
                    if (!s.hasShore) { rows.Add(new Dictionary<string, object> { { "bearing", s.bearingDeg }, { "shore", false } }); continue; }
                    shores++;
                    var p = WorldCommon.Ground(terrain, s.shore.x + o.x, s.shore.y + o.z) + Vector3.up * Eye;
                    string sees = null;
                    foreach (var (name, top, own) in landmarks)
                    {
                        var d = top - p; float dist = d.magnitude;
                        if (!Physics.RaycastAll(p, d / dist, dist, ~0, QueryTriggerInteraction.Ignore).Any(hh => !own.Contains(hh.collider))) { sees = name; break; }
                    }
                    if (sees != null) seen++;
                    rows.Add(new Dictionary<string, object> { { "bearing", s.bearingDeg }, { "shore", WorldCommon.V(p) }, { "climbable", s.climbable }, { "walks_back", s.connected },
                        { "nearest_poi", s.nearestPoi >= 0 ? poiNames[s.nearestPoi] : null }, { "nearest_poi_m", Math.Round(s.nearestPoiM, 1) }, { "sees_landmark", sees } });
                }
                var poiBack = new List<object>(); int poiOk = 0;
                for (int i = 0; i < poi2.Count; i++)
                {
                    bool ok = WorldGuide.IsReachable(mask, n, 4f, poi2[i]);
                    if (ok) poiOk++;
                    poiBack.Add(new Dictionary<string, object> { { "poi", poiNames[i] }, { "walks_back", ok } });
                }
                var peaks = WorldGuide.Peaks(h, size, 8f, AgentJob.Float("peak_radius", 40f), sea);
                var summit = peaks.FirstOrDefault(pk => pk.isSummit);
                var falsePeaks = peaks.Where(pk => !pk.isSummit && pk.prominence >= minProm).ToList();
                var arcs = rep.emptyArcs.Select(a => (object)new Dictionary<string, object> { { "from_bearing", rep.sectors[a.from].bearingDeg }, { "to_bearing", rep.sectors[a.to].bearingDeg },
                    { "length_m", Math.Round(a.lengthM, 1) }, { "midpoint", new List<object> { Math.Round(a.mid.x + o.x, 1), Math.Round(a.mid.y + o.z, 1) } } }).ToList();
                var gate = new Dictionary<string, object>
                {
                    { "every_poi_walks_back", poiOk == poi2.Count },
                    { "longest_empty_arc_ok", rep.longestEmptyArcM <= maxArc },
                };
                gate["ok"] = gate.Values.All(v => v is bool b && b);
                // judgment calls reported as warnings (thresholds are this skill's [added] defaults)
                var warnings = new List<object>();
                if (rep.waterOnlyPockets > 0) warnings.Add(rep.waterOnlyPockets + " shore sectors can be climbed onto but do not walk back to the spawn (fine only if swimming back is possible)");
                if (shores > 0 && seen * 2 < shores) warnings.Add("a landmark is visible from only " + seen + "/" + shores + " coast points: raise it, add one, or open view corridors");
                if (falsePeaks.Count > 0) warnings.Add(falsePeaks.Count + " false peaks (prominence >= " + minProm + " m): give each a reason to climb it or a view to the goal");
                gate["warnings"] = warnings;
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "sea_level", sea }, { "slope_limit_deg", slope }, { "poi_radius_m", poiR }, { "pois", poiNames },
                    { "coast_length_m", Math.Round(rep.coastLengthM, 1) }, { "shore_sectors", rep.shoreSectors }, { "climbable_sectors", rep.climbableSectors },
                    { "cliff_sectors", rep.shoreSectors - rep.climbableSectors }, { "water_only_pockets", rep.waterOnlyPockets },
                    { "empty_sectors", rep.emptySectors }, { "longest_empty_arc_m", Math.Round(rep.longestEmptyArcM, 1) }, { "empty_arcs", arcs },
                    { "landmark_visible_from_coast", seen + "/" + shores },
                    { "pois_walk_back", poiOk + "/" + poi2.Count }, { "poi_walk_back", poiBack },
                    { "summit", new Dictionary<string, object> { { "x", summit.pos.x + o.x }, { "z", summit.pos.y + o.z }, { "height", Math.Round(summit.height, 1) } } },
                    { "false_peaks", falsePeaks.Select(pk => (object)new Dictionary<string, object> { { "x", Math.Round(pk.pos.x + o.x, 1) }, { "z", Math.Round(pk.pos.y + o.z, 1) },
                        { "height", Math.Round(pk.height, 1) }, { "prominence_m", Math.Round(pk.prominence, 1) } }).ToList() },
                    { "local_maxima", peaks.Count }, { "sectors", rows }, { "gate", gate },
                };
            });
        }

        /// <summary>Points of interest in the open scene, by naming convention.</summary>
        public static List<Vector3> CollectPois(out List<string> names)
        {
            var pts = new List<Vector3>(); var nm2 = new List<string>();
            void Add(string n, Vector3 p) { nm2.Add(n); pts.Add(p); }
            foreach (var t in Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
            {
                var nm = t.name;
                bool building = nm.StartsWith("BO_") && t.parent != null && (t.parent.name == "Village_Blockout" || t.parent.name == "Landmarks");
                bool kitHouse = t.parent != null && t.parent.name == "KitTown";
                if (building || kitHouse || nm.StartsWith("POI_") || nm.StartsWith("LM_"))
                    Add(nm.Split(new[] { "_w" }, StringSplitOptions.None)[0], WorldScenes.Bounds(t.gameObject).center);
            }
            var road = GameObject.Find("Road_Main");
            var mf = road ? road.GetComponent<MeshFilter>() : null;
            if (mf && mf.sharedMesh && mf.sharedMesh.vertexCount > 1)
            {
                var v = mf.sharedMesh.vertices;
                Add("Road_Main_start", road.transform.TransformPoint(v[0]));
                Add("Road_Main_end", road.transform.TransformPoint(v[v.Length - 1]));
            }
            names = nm2;
            return pts;
        }

        public static void AddCoastContent()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var terrain = WorldCommon.FindTerrain();
                var root = WorldCommon.GetOrCreate("CoastContent");
                var placed = new List<object>();
                int i = root.transform.childCount;
                foreach (var o in AgentJob.List("points"))
                {
                    if (!(o is List<object> xz) || xz.Count < 2) continue;
                    float x = (float)AgentJson.ToDouble(xz[0], 0), z = (float)AgentJson.ToDouble(xz[1], 0);
                    // step 12 m inland toward the island centre so the marker stands on land, not in the surf
                    var c = terrain.transform.position + terrain.terrainData.size * 0.5f;
                    var dir = new Vector3(c.x - x, 0, c.z - z).normalized;
                    var p = WorldCommon.Ground(terrain, x + dir.x * 12f, z + dir.z * 12f);
                    var go = new GameObject($"POI_Cove_{i}_w3_h6");
                    go.transform.SetParent(root.transform, false);
                    go.transform.position = p;
                    // a cairn: base 3 x 3 x 1.2, stacked stones, a 6 m marker pole (yellow = landmark legend)
                    WorldBlockout.Box(go, "BO_CairnBase_w3_h1.2", new Vector3(-1.5f, 0, -1.5f), new Vector3(3f, 1.2f, 3f), WorldBlockout.WallColor);
                    WorldBlockout.Box(go, "BO_CairnTop_w1.8_h1", new Vector3(-0.9f, 1.2f, -0.9f), new Vector3(1.8f, 1f, 1.8f), WorldBlockout.WallColor);
                    WorldBlockout.Box(go, "BO_CairnPole_w0.3_h6", new Vector3(-0.15f, 2.2f, -0.15f), new Vector3(0.3f, 4f, 0.3f), WorldBlockout.LandmarkColor);
                    WorldCommon.SetStaticRecursive(go, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.BatchingStatic);
                    placed.Add(new Dictionary<string, object> { { "name", go.name }, { "position", WorldCommon.V(p) } });
                    i++;
                }
                WorldCommon.Save(scene);
                return new Dictionary<string, object> { { "scene", scene.path }, { "placed", placed }, { "total", root.transform.childCount } };
            });
        }
    }
}
