// scenario-unity-world-building v0.1 (2026-09-24). ProBuilder greybox of a village from a plan in metres
// (the scriptable form of "trace a scaled floor plan with snapped modules", YsBniZ5ya7k [00:03:21]).
//
// Job: ut_run.run_method(P, "AgentKit.World.WorldBlockout.BuildVillage", {"scene": ..., "plan": [...], "metrics": {...}})
//  - metrics first, derived from the character (level design e-book): agent radius/height ->
//    door width >= 2r + 2*clearance, door height >= agent height + headroom; storey 3 m; 1 m grid;
//  - every piece is a ProBuilderMesh from ShapeGenerator.GenerateCube(PivotLocation.FirstVertex, size)
//    (6.1.2 names the corner pivot FirstVertex = bounds min; docs and videos say "First Corner"),
//    then ToMesh(), Refresh(), EditorMeshUtility.Optimize(mesh, true) (UV2 + collapse duplicates);
//    never MeshFilter.sharedMesh edits (the ProBuilderMesh is the truth);
//  - names carry purpose and size (BO_Wall_w8_h3_t0.2), vertex colors are the legend
//    (walls grey-red, floors blue, doors orange, roofs brown, landmark yellow): ProBuilder 6's
//    default material is a Shader Graph that shows vertex colors in URP (no support-sample import);
//  - one prefab per building (a metric fix is one prefab edit), MeshCollider, static flags;
//  - greybox exit gate: NavMeshSurface (AI Navigation 2.0.14) baked on a Volume around the
//    village, NavMesh.CalculatePath from the plaza into every building must be PathComplete.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world.py.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEditor.ProBuilder;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.ProBuilder;
using Object = UnityEngine.Object;
using Math = System.Math;   // UnityEngine.ProBuilder also defines Math (CS0104, observed)

namespace AgentKit.World
{
    public static class WorldBlockout
    {
        public static readonly Color WallColor = new Color(0.78f, 0.45f, 0.42f);
        public static readonly Color FloorColor = new Color(0.35f, 0.55f, 0.85f);
        public static readonly Color DoorColor = new Color(0.95f, 0.6f, 0.2f);
        public static readonly Color RoofColor = new Color(0.55f, 0.36f, 0.25f);
        public static readonly Color LandmarkColor = new Color(0.95f, 0.85f, 0.25f);

        public class Metrics
        {
            public float agentRadius = 0.5f, agentHeight = 2f, clearance = 0.2f, headroom = 0.4f;
            public float storey = 3f, wall = 0.2f, slab = 0.2f, grid = 1f;
            public float DoorWidth => 2f * agentRadius + 2f * clearance;          // 1.4 m for the default agent
            public float DoorHeight => agentHeight + headroom;                    // 2.4 m
        }

        public class Building
        {
            public string name; public float x, z, w, d; public int storeys = 1; public string door = "S"; public float doorOffset = -1;
            public bool landmark; public bool roof = true;
        }

        static readonly List<Building> DefaultPlan = new List<Building>
        {
            new Building { name = "House_A", x = -34, z = -14, w = 8, d = 6, storeys = 1, door = "E" },
            new Building { name = "House_B", x = -24, z = 12, w = 10, d = 7, storeys = 2, door = "S" },
            new Building { name = "House_C", x = 4, z = -26, w = 7, d = 7, storeys = 1, door = "N" },
            new Building { name = "Tavern", x = 10, z = 8, w = 12, d = 9, storeys = 2, door = "W" },
            new Building { name = "BellTower", x = -8, z = -6, w = 4, d = 4, storeys = 6, door = "S", landmark = true, roof = true },
        };

        public static void BuildVillage()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var terrain = WorldCommon.FindTerrain();
                var m = ReadMetrics(AgentJob.Dict("metrics"));
                var plan = ReadPlan(AgentJob.List("plan"));
                var origin2 = new Vector2(AgentJob.Float("origin_x", 515f), AgentJob.Float("origin_z", 520f));
                var ground = WorldCommon.Ground(terrain, origin2.x, origin2.y);
                // snap the village origin to the grid (the plateau is flat, so one Y for all)
                // origin Y = highest ground under the plan (slabs never sink into the terrain), 0.1 m steps
                float topY = ground.y;
                foreach (var b in plan)
                    foreach (var c in new[] { new Vector2(b.x, b.z), new Vector2(b.x + b.w, b.z), new Vector2(b.x, b.z + b.d), new Vector2(b.x + b.w, b.z + b.d) })
                        topY = Mathf.Max(topY, WorldCommon.Ground(terrain, origin2.x + c.x, origin2.y + c.y).y);
                var origin = new Vector3(Mathf.Round(ground.x / m.grid) * m.grid, Mathf.Ceil(topY * 10f) / 10f, Mathf.Round(ground.z / m.grid) * m.grid);

                WorldCommon.RemoveRoot("Village_Blockout");
                var root = new GameObject("Village_Blockout");
                root.transform.position = origin;
                string prefabDir = WorldCommon.EnsureFolder(WorldCommon.Root + "/Blockout/Prefabs");
                var built = new List<object>();
                var doors = new List<object>();
                var targets = new List<(string, Vector3)>();
                int pieces = 0, assetNullMeshes = 0, instanceNullMeshes = 0;
                foreach (var b in plan)
                {
                    var go = BuildBuilding(b, m, out int n, out Vector3 doorCentre, out Vector2 doorSize);
                    pieces += n;
                    go.transform.SetParent(root.transform, false);
                    go.transform.localPosition = new Vector3(b.x, 0f, b.z);
                    string path = prefabDir + "/PF_" + go.name + ".prefab";
                    // returns the prefab ASSET root; `go` is now the connected scene instance
                    var asset = PrefabUtility.SaveAsPrefabAssetAndConnect(go, path, InteractionMode.AutomatedAction);
                    // ProBuilder meshes are driven properties, never serialized: the asset stores none,
                    // instances rebuild them in Awake (ExecuteInEditMode) when a scene or prefab loads
                    assetNullMeshes += asset.GetComponentsInChildren<MeshFilter>(true).Count(mf => mf.sharedMesh == null);
                    instanceNullMeshes += go.GetComponentsInChildren<MeshFilter>(true).Count(mf => mf.sharedMesh == null);
                    RebuildAll(go);
                    var inst = go;
                    WorldCommon.SetStaticRecursive(inst, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.BatchingStatic);
                    var interior = inst.transform.TransformPoint(new Vector3(b.w * 0.5f, m.slab + 0.05f, b.d * 0.5f));
                    targets.Add((b.name, interior));
                    doors.Add(new Dictionary<string, object> { { "building", b.name }, { "width", doorSize.x }, { "height", doorSize.y },
                        { "fits_agent", doorSize.x >= m.DoorWidth - 1e-3f && doorSize.y >= m.DoorHeight - 1e-3f } });
                    built.Add(new Dictionary<string, object> { { "name", inst.name }, { "prefab", path }, { "footprint", new List<object> { b.w, b.d } },
                        { "storeys", b.storeys }, { "height_m", b.storeys * m.storey } });
                }

                // a second landmark on the summit: landmarks at the highest point read from everywhere
                // (A Short Hike's peak; the sightline gate in SetupViews measures it)
                WorldCommon.RemoveRoot("Landmarks");
                var landmarks = new List<object>();
                if (AgentJob.Bool("summit_tower", true))
                {
                    var lroot = new GameObject("Landmarks");
                    var summit = Summit(terrain);
                    var wt = new Building { name = "Watchtower", w = 4, d = 4, storeys = AgentJob.Int("summit_storeys", 9), door = "S", landmark = true };
                    var go = BuildBuilding(wt, m, out int n, out _, out _);
                    pieces += n;
                    go.transform.SetParent(lroot.transform, false);
                    go.transform.position = new Vector3(Mathf.Round(summit.x) - 2f, summit.y - 0.3f, Mathf.Round(summit.z) - 2f);
                    var asset = PrefabUtility.SaveAsPrefabAssetAndConnect(go, prefabDir + "/PF_" + go.name + ".prefab", InteractionMode.AutomatedAction);
                    RebuildAll(go);
                    WorldCommon.SetStaticRecursive(go, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.BatchingStatic);
                    landmarks.Add(new Dictionary<string, object> { { "name", go.name }, { "position", WorldCommon.V(go.transform.position) }, { "height_m", wt.storeys * m.storey } });
                }

                // greybox exit gate: NavMesh over the village volume, then reachability
                var navGo = new GameObject("Nav_Village");
                navGo.transform.SetParent(root.transform, false);
                var surf = navGo.AddComponent<NavMeshSurface>();
                surf.collectObjects = CollectObjects.Volume;
                surf.center = new Vector3(0f, 5f, 0f);
                surf.size = new Vector3(AgentJob.Float("nav_size", 120f), 30f, AgentJob.Float("nav_size", 120f));
                surf.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
                Physics.SyncTransforms();
                var volCentre = navGo.transform.TransformPoint(surf.center);
                int overlap = Physics.OverlapBox(volCentre, surf.size * 0.5f).Length;
                var srcs = new List<NavMeshBuildSource>();
                NavMeshBuilder.CollectSources(new Bounds(volCentre, surf.size), ~0, NavMeshCollectGeometry.PhysicsColliders, 0, new List<NavMeshBuildMarkup>(), srcs);
                var srcTypes = srcs.GroupBy(x => x.shape.ToString()).ToDictionary(g => g.Key, g => (object)g.Count());
                var t0 = DateTime.UtcNow;
                surf.BuildNavMesh();
                double bakeS = (DateTime.UtcNow - t0).TotalSeconds;
                if (surf.navMeshData != null)
                {
                    string navPath = WorldCommon.EnsureFolder(WorldCommon.Root + "/Nav") + "/NavMesh_Village.asset";
                    if (AssetDatabase.LoadAssetAtPath<NavMeshData>(navPath) != null) AssetDatabase.DeleteAsset(navPath);
                    AssetDatabase.CreateAsset(surf.navMeshData, navPath);
                }
                var plaza = origin + new Vector3(AgentJob.Float("plaza_x", -14f), 0f, AgentJob.Float("plaza_z", -2f));
                var reach = new List<object>();
                bool allReach = true;
                NavMesh.SamplePosition(plaza, out var start, 3f, NavMesh.AllAreas);
                foreach (var (name, target) in targets)
                {
                    var p = new NavMeshPath();
                    bool sampled = NavMesh.SamplePosition(target, out var end, 1.5f, NavMesh.AllAreas);
                    bool ok = start.hit && sampled && NavMesh.CalculatePath(start.position, end.position, NavMesh.AllAreas, p) && p.status == NavMeshPathStatus.PathComplete;
                    float len = 0f; for (int i = 1; i < p.corners.Length; i++) len += Vector3.Distance(p.corners[i - 1], p.corners[i]);
                    allReach &= ok;
                    NavMesh.SamplePosition(target, out var near, 50f, NavMesh.AllAreas);
                    reach.Add(new Dictionary<string, object> { { "building", name }, { "target", WorldCommon.V(target) }, { "sampled", sampled }, { "nearest", WorldCommon.V(near.position) }, { "nearest_d", Math.Round(near.distance, 2) }, { "status", p.status.ToString() }, { "complete", ok }, { "path_m", Math.Round(len, 1) }, { "corners", p.corners.Length } });
                }
                var tri = NavMesh.CalculateTriangulation();
                var tb = new Bounds(tri.vertices.Length > 0 ? tri.vertices[0] : Vector3.zero, Vector3.zero);
                foreach (var v in tri.vertices) tb.Encapsulate(v);

                WorldCommon.Save(scene);
                var audit = AuditBlockout(root, m);
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "origin", WorldCommon.V(origin) }, { "buildings", built }, { "pieces", pieces }, { "landmarks", landmarks },
                    { "metrics", new Dictionary<string, object> { { "agent_radius", m.agentRadius }, { "agent_height", m.agentHeight }, { "door_width", m.DoorWidth }, { "door_height", m.DoorHeight }, { "storey", m.storey }, { "grid", m.grid } } },
                    { "doors", doors }, { "navmesh", new Dictionary<string, object> { { "bake_s", Math.Round(bakeS, 2) }, { "colliders_in_volume", overlap }, { "sources", srcTypes }, { "volume_centre", WorldCommon.V(volCentre) }, { "triangles", tri.indices.Length / 3 }, { "nav_bounds_min", WorldCommon.V(tb.min) }, { "nav_bounds_max", WorldCommon.V(tb.max) }, { "start", WorldCommon.V(start.position) }, { "plaza_on_navmesh", start.hit }, { "all_reachable", allReach } } },
                    { "reachability", reach }, { "audit", audit },
                    { "material_shader", MaterialShader(root) }, { "prefab_asset_null_meshes", assetNullMeshes }, { "instance_null_meshes", instanceNullMeshes },
                };
            });
        }

        // ------------------------------------------------------------------ building
        public static GameObject BuildBuilding(Building b, Metrics m, out int pieces, out Vector3 doorCentre, out Vector2 doorSize)
        {
            string label = $"BO_{b.name}_w{F(b.w)}_d{F(b.d)}_s{b.storeys}";
            var go = new GameObject(label);
            var floors = new GameObject("Floors"); floors.transform.SetParent(go.transform, false);
            var walls = new GameObject("Walls"); walls.transform.SetParent(go.transform, false);
            var doorsGo = new GameObject("Doors"); doorsGo.transform.SetParent(go.transform, false);
            var roofGo = new GameObject("Roof"); roofGo.transform.SetParent(go.transform, false);
            pieces = 0;
            float t = m.wall, h = m.storey, dw = m.DoorWidth, dh = m.DoorHeight;
            float totalH = b.storeys * h;
            Color wallC = b.landmark ? LandmarkColor : WallColor;
            // floors: ground slab plus one per upper storey (a tower keeps only ground and top)
            for (int s = 0; s <= b.storeys; s++)
            {
                if (b.landmark && s > 0 && s < b.storeys) continue;
                if (s == b.storeys && b.roof && !b.landmark) continue;
                Box(floors, $"BO_Floor_w{F(b.w)}_d{F(b.d)}_t{F(m.slab)}", new Vector3(0, s * h, 0), new Vector3(b.w, m.slab, b.d), FloorColor); pieces++;
            }
            doorCentre = Vector3.zero; doorSize = new Vector2(dw, dh);
            for (int s = 0; s < b.storeys; s++)
            {
                float y = s * h + (s == 0 ? m.slab : 0f), wh = h - (s == 0 ? m.slab : 0f);
                string side = s == 0 ? b.door.ToUpperInvariant() : "";
                // S: z=0 along x; N: z=d-t along x; W: x=0 along z; E: x=w-t along z
                pieces += Wall(walls, doorsGo, "S", side == "S", new Vector3(0, y, 0), b.w, true, t, wh, dw, dh, b, wallC, ref doorCentre);
                pieces += Wall(walls, doorsGo, "N", side == "N", new Vector3(0, y, b.d - t), b.w, true, t, wh, dw, dh, b, wallC, ref doorCentre);
                pieces += Wall(walls, doorsGo, "W", side == "W", new Vector3(0, y, t), b.d - 2 * t, false, t, wh, dw, dh, b, wallC, ref doorCentre);
                pieces += Wall(walls, doorsGo, "E", side == "E", new Vector3(b.w - t, y, t), b.d - 2 * t, false, t, wh, dw, dh, b, wallC, ref doorCentre);
            }
            if (b.roof)
            {
                var roof = ShapeGenerator.GeneratePrism(PivotLocation.FirstVertex, new Vector3(b.w + 0.6f, b.landmark ? 3f : 2.2f, b.d + 0.6f));
                Finish(roof, roofGo, $"BO_Roof_w{F(b.w + 0.6f)}_d{F(b.d + 0.6f)}", new Vector3(-0.3f, totalH, -0.3f), RoofColor);
                pieces++;
            }
            return go;
        }

        /// <summary>One wall run; with a door, split into left jamb, right jamb and lintel so the
        /// opening is real geometry (no boolean ops: experimental in ProBuilder, unstable in pipelines).</summary>
        static int Wall(GameObject walls, GameObject doors, string side, bool door, Vector3 min, float len, bool alongX,
                        float t, float h, float dw, float dh, Building b, Color c, ref Vector3 doorCentre)
        {
            Vector3 Size(float l, float hh) => alongX ? new Vector3(l, hh, t) : new Vector3(t, hh, l);
            Vector3 Off(float a) => alongX ? new Vector3(a, 0, 0) : new Vector3(0, 0, a);
            string nm = $"BO_Wall{side}_w{F(len)}_h{F(h)}_t{F(t)}";
            if (!door) { Box(walls, nm, min, Size(len, h), c); return 1; }
            float o = b.doorOffset >= 0 ? b.doorOffset : Mathf.Round((len - dw) * 0.5f * 10f) / 10f;
            Box(walls, nm + "_L", min, Size(o, h), c);
            Box(walls, nm + "_R", min + Off(o + dw), Size(len - o - dw, h), c);
            Box(doors, $"BO_DoorLintel{side}_w{F(dw)}_h{F(h - dh)}", min + Off(o) + Vector3.up * dh, Size(dw, h - dh), DoorColor);
            doorCentre = min + Off(o + dw * 0.5f);
            return 3;
        }

        public static ProBuilderMesh Box(GameObject parent, string name, Vector3 min, Vector3 size, Color color)
        {
            var pb = ShapeGenerator.GenerateCube(PivotLocation.FirstVertex, size);
            Finish(pb, parent, name, min, color);
            return pb;
        }

        internal static void Finish(ProBuilderMesh pb, GameObject parent, string name, Vector3 localPos, Color color)
        {
            pb.gameObject.name = name;
            pb.transform.SetParent(parent.transform, false);
            pb.transform.localPosition = localPos;
            // ShapeGenerator assigns no material from script (the editor menu does): without this the
            // renderer has no material. BuiltinMaterials.defaultMaterial = ProBuilder6/Standard Vertex Color.
            pb.GetComponent<MeshRenderer>().sharedMaterial = BuiltinMaterials.defaultMaterial;
            foreach (var f in pb.faces) pb.SetFaceColor(f, color);   // vertex-color legend
            pb.ToMesh();
            pb.Refresh();
            EditorMeshUtility.Optimize(pb, true);                      // UV2 for lightmaps, collapse shared vertices
            var mc = pb.gameObject.AddComponent<MeshCollider>();
            mc.sharedMesh = pb.GetComponent<MeshFilter>().sharedMesh;
        }

        /// <summary>Rebuild every ProBuilderMesh under a root (ToMesh + Refresh) and re-point its
        /// MeshCollider: needed after PrefabUtility calls in the same editor session.</summary>
        public static void RebuildAll(GameObject root)
        {
            foreach (var pb in root.GetComponentsInChildren<ProBuilderMesh>(true))
            {
                pb.ToMesh();
                pb.Refresh();
                EditorMeshUtility.Optimize(pb, true);   // ToMesh drops UV2: regenerate it every rebuild
                var mc = pb.GetComponent<MeshCollider>();
                if (mc) { mc.sharedMesh = null; mc.sharedMesh = pb.GetComponent<MeshFilter>().sharedMesh; }
            }
        }

        static string MaterialShader(GameObject root)
        {
            var r = root.GetComponentInChildren<MeshRenderer>();
            if (r == null) return "no renderer";
            var m = r.sharedMaterial;
            return m == null ? "NO MATERIAL" : m.name + " / " + (m.shader != null ? m.shader.name : "no shader");
        }

        static Vector3 Summit(Terrain t)
        {
            var td = t.terrainData; int r = td.heightmapResolution;
            var h = td.GetHeights(0, 0, r, r);
            int bx = 0, bz = 0; float best = -1;
            for (int z = 0; z < r; z += 2) for (int x = 0; x < r; x += 2) if (h[z, x] > best) { best = h[z, x]; bx = x; bz = z; }
            var p = new Vector3(bx / (float)(r - 1) * td.size.x, 0, bz / (float)(r - 1) * td.size.z) + t.transform.position;
            return WorldCommon.Ground(t, p.x, p.z);
        }

        static string F(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);

        // ------------------------------------------------------------------ audit
        /// <summary>Blockout checks in the core findings format: grid snap (allowing the wall
        /// thickness offset), 90 degree rotations, names with sizes, UV2 present, ProBuilderMesh
        /// as the source of every mesh, prefab connection per building.</summary>
        public static Dictionary<string, object> AuditBlockout(GameObject root, Metrics m)
        {
            var f = new AgentAudit.Findings();
            int meshes = 0, uv2 = 0;
            foreach (var pb in root.GetComponentsInChildren<ProBuilderMesh>(true))
            {
                meshes++;
                var path = WorldCommon.PathOf(pb.transform);
                var mesh = pb.GetComponent<MeshFilter>().sharedMesh;
                if (mesh != null && mesh.HasVertexAttribute(UnityEngine.Rendering.VertexAttribute.TexCoord1)) uv2++;
                else f.Add("warn", "world.blockout_uv2", path, "no UV2: spotty lightmaps", "EditorMeshUtility.Optimize(pb, true) or the Lightmap UVs action");
                if (!System.Text.RegularExpressions.Regex.IsMatch(pb.name, @"^BO_[A-Za-z]+.*_w[\d.]+"))
                    f.Add("warn", "world.blockout_name", path, "name without purpose and size", "BO_<Part>_w<m>_h<m>_t<m>");
                var lp = pb.transform.localPosition;
                // door jambs and lintels sit on a 0.1 m sub-grid (centred openings); walls on the grid
                bool doorPiece = pb.name.Contains("DoorLintel") || pb.name.EndsWith("_R") || pb.name.EndsWith("_L");
                var sub = doorPiece ? new Metrics { grid = 0.1f, wall = m.wall, slab = m.slab, storey = m.storey } : m;
                if (!OnGrid(lp.x, sub) || !OnGrid(lp.z, sub) || !OnGridY(lp.y, m))
                    f.Add("warn", "world.blockout_grid", path, "local position " + lp + " off the " + m.grid + " m grid", "snap to the grid (wall thickness offset allowed)");
                var e = pb.transform.localEulerAngles;
                if (Mathf.Abs(Mathf.DeltaAngle(e.y, Mathf.Round(e.y / 90f) * 90f)) > 0.01f)
                    f.Add("warn", "world.blockout_rotation", path, "rotation " + e.y + " not a multiple of 90", "architecture uses 90 and 45 degree angles");
            }
            foreach (Transform b in root.transform)
                if (b.name.StartsWith("BO_") && !PrefabUtility.IsPartOfPrefabInstance(b.gameObject))
                    f.Add("warn", "world.blockout_prefab", WorldCommon.PathOf(b), "building not prefab-backed", "PrefabUtility.SaveAsPrefabAssetAndConnect");
            return new Dictionary<string, object> { { "probuilder_meshes", meshes }, { "with_uv2", uv2 }, { "counts", f.Counts() }, { "findings", f.items } };
        }

        static bool OnGrid(float v, Metrics m)
        {
            foreach (var off in new[] { 0f, m.wall, -m.wall, -0.3f })
            {
                float q = (v - off) / m.grid;
                if (Mathf.Abs(q - Mathf.Round(q)) < 1e-3f) return true;
            }
            return false;
        }

        static bool OnGridY(float v, Metrics m)
        {
            foreach (var off in new[] { 0f, m.slab })
            {
                float q = (v - off) / m.storey;
                if (Mathf.Abs(q - Mathf.Round(q)) < 1e-3f) return true;
                q = (v - off) / m.grid;                           // lintels sit at door height on the grid of 0.1
                if (Mathf.Abs(q * 10f - Mathf.Round(q * 10f)) < 1e-3f) return true;
            }
            return false;
        }

        // ------------------------------------------------------------------ args
        static Metrics ReadMetrics(Dictionary<string, object> d)
        {
            var m = new Metrics();
            if (d == null) return m;
            float Get(string k, float def) => d.TryGetValue(k, out var v) && v != null ? (float)AgentJson.ToDouble(v, def) : def;
            m.agentRadius = Get("agent_radius", m.agentRadius); m.agentHeight = Get("agent_height", m.agentHeight);
            m.clearance = Get("clearance", m.clearance); m.headroom = Get("headroom", m.headroom);
            m.storey = Get("storey", m.storey); m.wall = Get("wall", m.wall); m.slab = Get("slab", m.slab); m.grid = Get("grid", m.grid);
            return m;
        }

        static List<Building> ReadPlan(List<object> list)
        {
            if (list == null || list.Count == 0) return DefaultPlan;
            var plan = new List<Building>();
            foreach (var o in list)
            {
                if (!(o is Dictionary<string, object> d)) continue;
                float G(string k, float def) => d.TryGetValue(k, out var v) && v != null ? (float)AgentJson.ToDouble(v, def) : def;
                plan.Add(new Building
                {
                    name = d.TryGetValue("name", out var n) ? n.ToString() : "B" + plan.Count,
                    x = G("x", 0), z = G("z", 0), w = G("w", 8), d = G("d", 6), storeys = (int)G("storeys", 1),
                    door = d.TryGetValue("door", out var dr) ? dr.ToString() : "S", doorOffset = G("door_offset", -1),
                    landmark = d.TryGetValue("landmark", out var lm) && lm is bool lb && lb,
                });
            }
            return plan;
        }
    }
}
