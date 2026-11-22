// scenario-unity-world-building v0.2 (2026-09-24). NavMesh gate for modular buildings (AI Navigation 2.0.14).
// "PathComplete from the plaza" alone misses what Christina Creates Games hit (0o-QnNs-stc [00:17:12],
// [00:19:27]): door pieces cut the NavMesh, multi-storey houses need Build Height Mesh, and roofs
// and upper floors become islands. This job proves each point on the kit town:
//   1. closed door leaves (PF_Kit_DoorLeaf in every doorway) baked as geometry: rooms unreachable;
//   2. NavMeshModifier (ignoreFromBuild) on the leaves: every ground floor reachable again (the
//      tool AI Navigation offers for this; her workaround was disabling the door container before
//      the bake, fine only for waypoint guards);
//   2b. every ground floor sampled on a 0.5 m grid: the share a path from the street reaches (clutter
//      inflated by the agent radius split two rooms to 25 % and 46 % before WorldKit's scatter kept rooms whole);
//   3. NavMesh islands: connected components of the baked triangulation, each tested for a path
//      from the street; roofs become walkable islands until a NavMeshModifier overrides their area
//      to Not Walkable; upper floors stay islands until stairs or a NavMeshLink connect them;
//   4. a NavMeshLink (stairs stand-in) from a ground floor to its upper floor: PathComplete.
// Job: AgentKit.World.WorldNav.KitNavGate  args: scene, start_offset [x, z] (street point relative to
//      the KitTown root), margin (volume margin, m)
// Build Height Mesh on stairs is measured in the gym (WorldGym.BuildGym), where stairs exist.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world_v2.py.
using System;
using System.Collections.Generic;
using System.Linq;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEngine;
using UnityEngine.AI;
using Object = UnityEngine.Object;
using Math = System.Math;

namespace AgentKit.World
{
    public static class WorldNav
    {
        public static void KitNavGate()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var town = GameObject.Find("KitTown");
                if (town == null) throw new InvalidOperationException("no KitTown: run WorldKit.BuildKitTown first");
                var doorMat = WorldCommon.LitMaterial(WorldKit.KitDir + "/Materials/M_Kit_Door.mat", new Color(0.35f, 0.22f, 0.12f), null, 0.3f);
                var leafPrefab = WorldKit.Piece("PF_Kit_DoorLeaf_1.4x2.4m", doorMat, false, WorldKit.B(0.55f, 0f, 0.075f, 1.4f, 2.4f, 0.05f));

                // 1. a closed door leaf in every doorway (idempotent)
                var leaves = new List<GameObject>();
                foreach (var t in town.GetComponentsInChildren<Transform>(true).ToArray())
                {
                    if (t.name == "DoorLeaf") { Object.DestroyImmediate(t.gameObject); continue; }
                }
                foreach (var t in town.GetComponentsInChildren<Transform>(true))
                {
                    if (!PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject)) continue;
                    var src = PrefabUtility.GetCorrespondingObjectFromOriginalSource(t.gameObject);
                    if (src == null || !src.name.StartsWith("PF_Kit_WallDoor")) continue;
                    var leaf = (GameObject)PrefabUtility.InstantiatePrefab(leafPrefab, t.parent);
                    leaf.name = "DoorLeaf";
                    leaf.transform.localPosition = t.localPosition; leaf.transform.localRotation = t.localRotation;
                    leaves.Add(leaf);
                }
                foreach (var old in town.GetComponentsInChildren<NavMeshModifier>(true)) Object.DestroyImmediate(old);
                foreach (var old in town.GetComponentsInChildren<NavMeshLink>(true)) Object.DestroyImmediate(old.gameObject);

                var tb = WorldScenes.Bounds(town);
                float margin = AgentJob.Float("margin", 8f);
                var navGo = WorldCommon.GetOrCreate("Nav_KitTown", town.transform);
                var surf = navGo.GetComponent<NavMeshSurface>() ?? navGo.AddComponent<NavMeshSurface>();
                navGo.transform.position = tb.center;
                surf.collectObjects = CollectObjects.Volume;
                surf.center = Vector3.zero;
                surf.size = tb.size + new Vector3(margin * 2f, 4f, margin * 2f);
                surf.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
                surf.buildHeightMesh = true;          // multi-storey houses: accurate heights on floors and stairs
                surf.agentTypeID = AgentJob.Int("agent_type", 0);
                var agent = NavMesh.GetSettingsByID(surf.agentTypeID);
                var volume = new Bounds(tb.center, surf.size);
                // other surfaces of the same agent type whose volume overlaps this one keep answering queries
                // with their own (possibly stale) data: disable them for the gate and report the overlap
                var overlapping = new List<object>();
                var disabled = new List<NavMeshSurface>();
                foreach (var other in Object.FindObjectsByType<NavMeshSurface>(FindObjectsSortMode.None))
                {
                    if (other == surf || !other.enabled) continue;
                    var ob = other.collectObjects == CollectObjects.Volume ? new Bounds(other.transform.TransformPoint(other.center), other.size) : new Bounds(Vector3.zero, Vector3.one * 1e6f);
                    if (!ob.Intersects(volume)) continue;
                    overlapping.Add(new Dictionary<string, object> { { "surface", WorldCommon.PathOf(other.transform) }, { "agent_type", other.agentTypeID }, { "has_data", other.navMeshData != null } });
                    other.enabled = false; disabled.Add(other);
                }

                var houses = new List<(string name, Vector3 ground, Vector3 upper, int storeys)>();
                foreach (Transform h in town.transform)
                {
                    if (!h.name.StartsWith("KitHouse_")) continue;
                    var hb = WorldScenes.Bounds(h.gameObject);
                    int storeys = h.GetComponentsInChildren<Transform>().Count(x => x.name.StartsWith("Level_"));
                    var g = new Vector3(hb.center.x, h.position.y + 0.25f, hb.center.z);
                    houses.Add((h.name, g, g + Vector3.up * WorldKit.Storey, storeys));
                }
                var so = AgentJob.List("start_offset");
                var startOff = so.Count >= 2 ? new Vector3((float)AgentJson.ToDouble(so[0], -5), 0, (float)AgentJson.ToDouble(so[1], 2)) : new Vector3(-5f, 0f, 2f);
                var street = town.transform.position + startOff + Vector3.up * 0.5f;

                Physics.SyncTransforms();
                var steps = new Dictionary<string, object>();
                Dictionary<string, object> Bake(string label)
                {
                    Physics.SyncTransforms();
                    surf.BuildNavMesh();
                    var reach = new List<object>(); int ok = 0;
                    bool startOk = NavMesh.SamplePosition(street, out var sh, 3f, NavMesh.AllAreas);
                    foreach (var (name, ground, _, _) in houses)
                    {
                        // the whole ground floor, not one point: a 0.5 m grid over the interior at floor height; the
                        // share of NavMesh samples a path from the street reaches (clutter can split a room)
                        var hb = WorldScenes.Bounds(town.transform.Find(name).Find("Level_0/Floor").gameObject);
                        int onMesh = 0, reached = 0; var sp = new NavMeshPath(); Vector3 best = ground; string lastStatus = "NoNavMeshInside";
                        for (float x = hb.min.x + 0.45f; x < hb.max.x - 0.4f; x += 0.5f)
                        for (float z = hb.min.z + 0.45f; z < hb.max.z - 0.4f; z += 0.5f)
                        {
                            var q = new Vector3(x, hb.max.y + 0.05f, z);
                            if (!NavMesh.SamplePosition(q, out var qh, 0.25f, NavMesh.AllAreas) || Mathf.Abs(qh.position.y - hb.max.y) > 0.3f) continue;
                            onMesh++;
                            bool done = startOk && NavMesh.CalculatePath(sh.position, qh.position, NavMesh.AllAreas, sp) && sp.status == NavMeshPathStatus.PathComplete;
                            lastStatus = sp.status.ToString();
                            if (done) { reached++; best = qh.position; }
                        }
                        float frac = onMesh > 0 ? (float)reached / onMesh : 0f;
                        bool complete = reached > 0;
                        if (complete) ok++;
                        reach.Add(new Dictionary<string, object> { { "house", name }, { "complete", complete }, { "floor_samples", onMesh }, { "reached", reached },
                            { "reachable_fraction", Math.Round(frac, 3) }, { "status", complete ? "PathComplete" : lastStatus }, { "reached_point", complete ? WorldCommon.V(best) : null } });
                    }
                    // door passage: from 1 m outside to 1 m inside each opening (isolates the doorway from the street route)
                    var doorRows = new List<object>();
                    foreach (var t in town.GetComponentsInChildren<Transform>(true))
                    {
                        if (!PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject)) continue;
                        var src = PrefabUtility.GetCorrespondingObjectFromOriginalSource(t.gameObject);
                        if (src == null || !src.name.StartsWith("PF_Kit_WallDoor")) continue;
                        var c = t.TransformPoint(new Vector3(WorldKit.Grid * 0.5f, 0.3f, WorldKit.Wall * 0.5f));
                        var inward = t.TransformDirection(Vector3.forward);
                        var dp = new NavMeshPath();
                        bool a = NavMesh.SamplePosition(c - inward * 1.0f, out var ah, 0.6f, NavMesh.AllAreas), b = NavMesh.SamplePosition(c + inward * 1.0f, out var bh, 0.6f, NavMesh.AllAreas);
                        bool pass = a && b && NavMesh.CalculatePath(ah.position, bh.position, NavMesh.AllAreas, dp) && dp.status == NavMeshPathStatus.PathComplete;
                        var house = t; while (house.parent != null && house.parent != town.transform) house = house.parent;
                        doorRows.Add(new Dictionary<string, object> { { "house", house.name }, { "outside_on_navmesh", a }, { "inside_on_navmesh", b }, { "passable", pass } });
                    }
                    var isl = Islands(volume, startOk ? sh.position : street);
                    float minFrac = reach.Count == 0 ? 0f : reach.Min(x => Convert.ToSingle(((Dictionary<string, object>)x)["reachable_fraction"]));
                    var r = new Dictionary<string, object> { { "ground_floors_reachable", ok + "/" + houses.Count }, { "min_floor_reachable_fraction", Math.Round(minFrac, 3) }, { "reach", reach }, { "doors", doorRows }, { "islands", isl }, { "street_on_navmesh", startOk ? WorldCommon.V(sh.position) : null } };
                    steps[label] = r;
                    return r;
                }

                // 1. door leaves baked as walls
                var closed = Bake("1_closed_doors_baked");
                // 2. NavMeshModifier: ignore the leaves in the bake (runtime doors open, or carve with a NavMeshObstacle when locked)
                foreach (var leaf in leaves) { var m = leaf.AddComponent<NavMeshModifier>(); m.ignoreFromBuild = true; }
                var withMod = Bake("2_door_modifier");
                // 3. roofs not walkable
                int notWalkable = NavMesh.GetAreaFromName("Not Walkable");
                foreach (var roof in town.GetComponentsInChildren<Transform>(true).Where(x => x.name == "Roof"))
                {
                    var m = roof.gameObject.AddComponent<NavMeshModifier>(); m.overrideArea = true; m.area = notWalkable; m.applyToChildren = true;
                }
                var roofs = Bake("3_roofs_not_walkable");
                // 4. a NavMeshLink per two-storey house (stairs stand-in): ground floor to upper floor
                var links = new List<object>();
                foreach (var (name, ground, upper, storeys) in houses.Where(x => x.storeys > 1))
                {
                    var house = town.transform.Find(name);
                    var lgo = new GameObject("NavLink_Stairs");
                    lgo.transform.SetParent(house, false);
                    lgo.transform.position = ground;
                    var link = lgo.AddComponent<NavMeshLink>();
                    // stairs run from the ground floor near one wall to the upper floor above it
                    link.startPoint = new Vector3(-0.8f, 0f, 0f);
                    link.endPoint = new Vector3(0.8f, WorldKit.Storey - 0.05f, 0f);
                    link.width = 0.8f; link.bidirectional = true;
                    link.UpdateLink();
                    var p = new NavMeshPath();
                    bool sOk = NavMesh.SamplePosition(street, out var sh, 3f, NavMesh.AllAreas);
                    bool uOk = NavMesh.SamplePosition(upper + new Vector3(0.8f, 0f, 0f), out var uh, 1.0f, NavMesh.AllAreas);
                    bool complete = sOk && uOk && NavMesh.CalculatePath(sh.position, uh.position, NavMesh.AllAreas, p) && p.status == NavMeshPathStatus.PathComplete;
                    links.Add(new Dictionary<string, object> { { "house", name }, { "upper_on_navmesh", uOk }, { "status", uOk ? p.status.ToString() : "NoNavMeshUpstairs" }, { "complete", complete } });
                }
                steps["4_stairs_links"] = links;
                if (surf.navMeshData != null)
                {
                    string navPath = WorldCommon.EnsureFolder(WorldCommon.Root + "/Nav") + "/NavMesh_KitTown.asset";
                    if (AssetDatabase.LoadAssetAtPath<NavMeshData>(navPath) != null) AssetDatabase.DeleteAsset(navPath);
                    AssetDatabase.CreateAsset(surf.navMeshData, navPath);
                }
                foreach (var o in disabled) o.enabled = true;          // restored: fix the overlap in the level, not in the gate
                WorldCommon.Save(scene);

                int Unreached(Dictionary<string, object> r) => (int)((Dictionary<string, object>)r["islands"])["unreachable"];
                int RoofIslands(Dictionary<string, object> r) => (int)((Dictionary<string, object>)r["islands"])["unreachable_roof_level"];
                var gate = new Dictionary<string, object>
                {
                    { "closed_doors_cut_navmesh", (string)closed["ground_floors_reachable"] != houses.Count + "/" + houses.Count },
                    { "modifier_restores_doors", (string)withMod["ground_floors_reachable"] == houses.Count + "/" + houses.Count },
                    { "floors_not_split", Convert.ToSingle(withMod["min_floor_reachable_fraction"]) >= AgentJob.Float("min_floor_fraction", 0.9f) },
                    { "roof_islands_removed", RoofIslands(roofs) == 0 && RoofIslands(withMod) > 0 },
                    { "upper_floors_linked", links.Count > 0 && links.All(l => (bool)((Dictionary<string, object>)l)["complete"]) },
                };
                gate["ok"] = gate.Values.All(v => v is bool b && b);
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "houses", houses.Count }, { "door_leaves", leaves.Count }, { "street", WorldCommon.V(street) },
                    { "build_height_mesh", surf.buildHeightMesh }, { "agent", new Dictionary<string, object> { { "type", surf.agentTypeID }, { "radius", agent.agentRadius }, { "height", agent.agentHeight }, { "climb", agent.agentClimb }, { "slope", agent.agentSlope }, { "voxel", Math.Round(agent.voxelSize, 3) } } },
                    { "overlapping_surfaces", overlapping }, { "steps", steps }, { "gate", gate },
                };
            });
        }

        /// <summary>Connected components of the NavMesh triangulation inside `volume` (vertices welded at
        /// 1 cm), each with area, mean height and whether a path from `from` reaches it.</summary>
        public static Dictionary<string, object> Islands(Bounds volume, Vector3 from, float minArea = 1f)
        {
            var tri = NavMesh.CalculateTriangulation();
            var key = new Dictionary<Vector3Int, int>();
            int Weld(Vector3 v) { var k = Vector3Int.RoundToInt(v * 100f); if (!key.TryGetValue(k, out var id)) { id = key.Count; key[k] = id; } return id; }
            var tris = new List<(int a, int b, int c, float area, Vector3 centre)>();
            for (int i = 0; i < tri.indices.Length; i += 3)
            {
                Vector3 a = tri.vertices[tri.indices[i]], b = tri.vertices[tri.indices[i + 1]], c = tri.vertices[tri.indices[i + 2]];
                var ctr = (a + b + c) / 3f;
                if (!volume.Contains(ctr)) continue;
                tris.Add((Weld(a), Weld(b), Weld(c), Vector3.Cross(b - a, c - a).magnitude * 0.5f, ctr));
            }
            var parent = Enumerable.Range(0, key.Count).ToArray();
            int Find(int x) { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
            void Union(int x, int y) { x = Find(x); y = Find(y); if (x != y) parent[x] = y; }
            foreach (var t in tris) { Union(t.a, t.b); Union(t.b, t.c); }
            var comps = tris.GroupBy(t => Find(t.a)).Select(g => (area: g.Sum(t => t.area), y: g.Sum(t => t.centre.y * t.area) / Math.Max(1e-6f, g.Sum(t => t.area)), probe: g.OrderByDescending(t => t.area).First().centre)).Where(c => c.area >= minArea).ToList();
            bool fromOk = NavMesh.SamplePosition(from, out var fh, 3f, NavMesh.AllAreas);
            float baseY = fromOk ? fh.position.y : from.y;
            var rows = new List<object>(); int unreachable = 0, roofLevel = 0, upper = 0;
            foreach (var c in comps.OrderByDescending(c => c.area))
            {
                var p = new NavMeshPath();
                bool reach = fromOk && NavMesh.SamplePosition(c.probe, out var ph, 0.5f, NavMesh.AllAreas) && NavMesh.CalculatePath(fh.position, ph.position, NavMesh.AllAreas, p) && p.status == NavMeshPathStatus.PathComplete;
                float rel = (float)c.y - baseY;
                string level = LevelUnder(c.probe);
                if (!reach) { unreachable++; if (level == "roof") roofLevel++; if (level == "upper_floor") upper++; }
                rows.Add(new Dictionary<string, object> { { "area_m2", Math.Round(c.area, 1) }, { "height_above_street_m", Math.Round(rel, 2) }, { "level", level }, { "reachable", reach }, { "probe", WorldCommon.V(c.probe) } });
            }
            return new Dictionary<string, object> { { "components", comps.Count }, { "unreachable", unreachable }, { "unreachable_roof_level", roofLevel }, { "unreachable_upper_floors", upper }, { "list", rows.Take(24).ToList() } };
        }

        /// <summary>What a NavMesh region stands on: the collider below its probe point, classified by the
        /// kit hierarchy (Roof, Level_n with n > 0 = upper floor, anything else = ground).</summary>
        static string LevelUnder(Vector3 probe)
        {
            if (!Physics.Raycast(probe + Vector3.up * 0.5f, Vector3.down, out var hit, 2f, ~0, QueryTriggerInteraction.Ignore)) return "unknown";
            for (var t = hit.collider.transform; t != null; t = t.parent)
            {
                if (t.name == "Roof") return "roof";
                if (t.name.StartsWith("Level_") && t.name != "Level_0") return "upper_floor";
                if (t.name == "Level_0") return "ground";
            }
            return "ground";
        }
    }
}
