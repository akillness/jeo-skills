// scenario-unity-world-building v0.2 (2026-09-24). Modular prefab kit on a grid, assembled from a plan,
// with Christina Creates Games' discipline (0o-QnNs-stc) turned into code:
//  - kit numbers: walls 2.5 x 3 m, floors 2.5 x 2.5 m, storeys at Y = 3 n [00:07:35], [00:18:53];
//    pivots at the first corner (bounds min) so pieces snap on the grid; thickness grows inward;
//  - block out with ONE generic wall on every perimeter cell, then bulk replace chosen cells
//    with window and door walls (PrefabUtility.ReplacePrefabAssetOfPrefabInstance: the scripted
//    form of her Ctrl-drag "replace selection") [00:15:14]; the placement is recorded as an override
//    first (RecordPrefabInstancePropertyModifications) or the replace drops it (observed v0.2);
//  - hierarchy by small logical units: House / Level_n / {Floor, Walls, Doorways, Decoration},
//    house root built at zero then moved [00:10:22];
//  - material variants as Prefab Variants (her automator) [00:24:22];
//  - clutter by raycast onto the floor with random yaw and overlap rejection (the 6.3 answer to
//    her floating-clutter question, Polybrush being deprecated) [00:06:10], a clear zone behind each
//    door and a room-connectivity rule (clutter inflated by the agent radius must leave >= 95 % of
//    the free floor reachable from the door: quick exits and "too many colliders" [00:18:20], [00:18:53]);
//  - finished houses saved as compound prefabs, kit pieces nested [00:08:17];
//  - audit: grid snap, 90 degree rotations, prefab links, hovering and overlapping clutter, stacked
//    pieces and perimeter cells without a wall (v0.2: the grid checks alone missed 30 lost placements).
// Kit meshes are built with ProBuilder then exported to plain Mesh assets (ProBuilder "Export >
// Asset"): kit prefabs carry no driven ProBuilder mesh. Run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEditor;
using UnityEditor.ProBuilder;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.ProBuilder;
using Math = System.Math;
using Object = UnityEngine.Object;

namespace AgentKit.World
{
    public static class WorldKit
    {
        public const float Grid = 2.5f, Storey = 3f, Wall = 0.2f;
        public const string KitDir = WorldCommon.Root + "/Kit";

        public class House
        {
            public string name; public int x, z, w, d, storeys = 1; public string door = "S"; public int doorCell = 0; public string variant = "Plaster";
        }

        static readonly List<House> DefaultTown = new List<House>
        {
            new House { name = "KitHouse_A", x = 0, z = 0, w = 3, d = 2, storeys = 2, door = "W", doorCell = 0, variant = "Plaster" },
            new House { name = "KitHouse_B", x = 0, z = 4, w = 4, d = 3, storeys = 1, door = "S", doorCell = 1, variant = "Stone" },
            new House { name = "KitHouse_C", x = 5, z = 1, w = 2, d = 4, storeys = 2, door = "W", doorCell = 2, variant = "Timber" },
        };

        // ------------------------------------------------------------------ kit
        /// <summary>Build (or refresh) the kit prefabs and variants. Returns name -> prefab path.</summary>
        public static Dictionary<string, GameObject> BuildKitPrefabs()
        {
            WorldCommon.EnsureFolder(KitDir + "/Meshes");
            var timber = WorldCommon.LitMaterial(KitDir + "/Materials/M_Kit_Timber.mat", new Color(0.55f, 0.40f, 0.27f), null, 0.2f);
            var plaster = WorldCommon.LitMaterial(KitDir + "/Materials/M_Kit_Plaster.mat", new Color(0.88f, 0.84f, 0.76f), null, 0.15f);
            var stone = WorldCommon.LitMaterial(KitDir + "/Materials/M_Kit_Stone.mat", new Color(0.52f, 0.52f, 0.50f), null, 0.1f);
            var floorM = WorldCommon.LitMaterial(KitDir + "/Materials/M_Kit_Floor.mat", new Color(0.45f, 0.33f, 0.22f), null, 0.25f);
            var roofM = WorldCommon.LitMaterial(KitDir + "/Materials/M_Kit_Roof.mat", new Color(0.62f, 0.30f, 0.22f), null, 0.2f);
            var crateM = WorldCommon.LitMaterial(KitDir + "/Materials/M_Clutter_Wood.mat", new Color(0.6f, 0.45f, 0.25f), null, 0.2f);
            var kit = new Dictionary<string, GameObject>();
            float T = Wall;
            kit["Wall"] = Piece("PF_Kit_Wall_2.5x3m", timber, true, B(0, 0, 0, Grid, Storey, T));
            kit["WallWindow"] = Piece("PF_Kit_WallWindow_2.5x3m", timber, true,
                B(0, 0, 0, Grid, 0.9f, T), B(0, 2.3f, 0, Grid, 0.7f, T), B(0, 0.9f, 0, 0.55f, 1.4f, T), B(1.95f, 0.9f, 0, 0.55f, 1.4f, T));
            kit["WallDoor"] = Piece("PF_Kit_WallDoor_2.5x3m", timber, true,
                B(0, 0, 0, 0.55f, 2.4f, T), B(1.95f, 0, 0, 0.55f, 2.4f, T), B(0, 2.4f, 0, Grid, 0.6f, T));
            kit["Floor"] = Piece("PF_Kit_Floor_2.5x2.5m", floorM, true, B(0, 0, 0, Grid, 0.2f, Grid));
            kit["Roof"] = Piece("PF_Kit_Roof_2.5x2.5m", roofM, true, B(-0.05f, 0, -0.05f, Grid + 0.1f, 0.3f, Grid + 0.1f));
            kit["Pillar"] = Piece("PF_Kit_Pillar_0.3x3m", stone, true, B(-0.05f, 0, -0.05f, 0.3f, Storey, 0.3f));
            kit["Crate"] = Piece("PF_Clutter_Crate_0.8m", crateM, false, B(-0.4f, 0, -0.4f, 0.8f, 0.8f, 0.8f));
            kit["CrateSmall"] = Piece("PF_Clutter_CrateSmall_0.5m", crateM, false, B(-0.25f, 0, -0.25f, 0.5f, 0.5f, 0.5f));
            kit["Bench"] = Piece("PF_Clutter_Bench_1.6m", crateM, false, B(-0.8f, 0, -0.2f, 1.6f, 0.45f, 0.4f));
            // material variants (Prefab Variants of the timber walls)
            foreach (var (key, mat) in new[] { ("Plaster", plaster), ("Stone", stone) })
                foreach (var baseKey in new[] { "Wall", "WallWindow", "WallDoor" })
                    kit[baseKey + "_" + key] = Variant(kit[baseKey], KitDir + "/" + kit[baseKey].name + "_" + key + ".prefab", mat);
            foreach (var baseKey in new[] { "Wall", "WallWindow", "WallDoor" }) kit[baseKey + "_Timber"] = kit[baseKey];
            AssetDatabase.SaveAssets();
            return kit;
        }

        internal struct BoxSpec { public Vector3 min, size; }
        internal static BoxSpec B(float x, float y, float z, float sx, float sy, float sz) => new BoxSpec { min = new Vector3(x, y, z), size = new Vector3(sx, sy, sz) };

        /// <summary>ProBuilder boxes -> one plain Mesh asset (UV2 via Optimize) -> prefab with collider.</summary>
        internal static GameObject Piece(string name, Material mat, bool meshCollider, params BoxSpec[] boxes)
        {
            var combine = new List<CombineInstance>();
            var temps = new List<GameObject>();
            foreach (var b in boxes)
            {
                var pb = ShapeGenerator.GenerateCube(PivotLocation.FirstVertex, b.size);
                pb.ToMesh(); pb.Refresh();
                EditorMeshUtility.Optimize(pb, true);
                temps.Add(pb.gameObject);
                combine.Add(new CombineInstance { mesh = pb.GetComponent<MeshFilter>().sharedMesh, transform = Matrix4x4.Translate(b.min) });
            }
            var m = new Mesh { name = name };
            m.CombineMeshes(combine.ToArray(), true, true, true);
            m.RecalculateBounds();
            foreach (var t in temps) Object.DestroyImmediate(t);
            var mesh = WorldCommon.SaveMesh(m, KitDir + "/Meshes/" + name + ".asset");
            var go = new GameObject(name);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            if (meshCollider) go.AddComponent<MeshCollider>().sharedMesh = mesh;
            else { var bc = go.AddComponent<BoxCollider>(); bc.center = mesh.bounds.center; bc.size = mesh.bounds.size; }
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, KitDir + "/" + name + ".prefab");
            Object.DestroyImmediate(go);
            return prefab;
        }

        /// <summary>Instance of the base prefab with one override, saved as a Prefab Variant.</summary>
        static GameObject Variant(GameObject basePrefab, string path, Material mat)
        {
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(basePrefab);
            inst.GetComponent<MeshRenderer>().sharedMaterial = mat;
            var v = PrefabUtility.SaveAsPrefabAsset(inst, path);    // saving an instance = a Variant of its source
            Object.DestroyImmediate(inst);
            return v;
        }

        // ------------------------------------------------------------------ town
        public static void BuildKitTown()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var terrain = WorldCommon.FindTerrain();
                var kit = BuildKitPrefabs();
                var town = ReadTown(AgentJob.List("town"));
                var g = WorldCommon.Ground(terrain, AgentJob.Float("origin_x", 560f), AgentJob.Float("origin_z", 505f));
                float topY = g.y;
                foreach (var h in town)
                    foreach (var c in new[] { new Vector2(h.x, h.z), new Vector2(h.x + h.w, h.z), new Vector2(h.x, h.z + h.d), new Vector2(h.x + h.w, h.z + h.d) })
                        topY = Mathf.Max(topY, WorldCommon.Ground(terrain, g.x + c.x * Grid, g.z + c.y * Grid).y);
                var origin = new Vector3(Mathf.Round(g.x / Grid) * Grid, Mathf.Ceil(topY * 10f) / 10f, Mathf.Round(g.z / Grid) * Grid);
                WorldCommon.RemoveRoot("KitTown");
                var root = new GameObject("KitTown");
                root.transform.position = origin;
                int placed = 0, replaced = 0, keptBySettings = 0;
                var houses = new List<object>();
                foreach (var h in town)
                {
                    var hr = new GameObject(h.name);
                    hr.transform.SetParent(root.transform, false);   // built at the house's own zero, then moved
                    float W = h.w * Grid, D = h.d * Grid;
                    for (int s = 0; s < h.storeys; s++)
                    {
                        var lvl = WorldCommon.GetOrCreate("Level_" + s, hr.transform);
                        var floor = WorldCommon.GetOrCreate("Floor", lvl.transform);
                        var walls = WorldCommon.GetOrCreate("Walls", lvl.transform);
                        var doorways = WorldCommon.GetOrCreate("Doorways", lvl.transform);
                        WorldCommon.GetOrCreate("Decoration", lvl.transform);
                        float y = s * Storey;
                        for (int i = 0; i < h.w; i++) for (int j = 0; j < h.d; j++) { Place(kit["Floor"], floor, new Vector3(i * Grid, y, j * Grid), 0); placed++; }
                        // 1. generic walls on every perimeter cell
                        var wallKey = "Wall_" + h.variant;
                        var cells = new List<(string side, int idx, GameObject go)>();
                        for (int i = 0; i < h.w; i++)
                        {
                            cells.Add(("S", i, Place(kit[wallKey], walls, new Vector3(i * Grid, y, 0), 0)));
                            cells.Add(("N", i, Place(kit[wallKey], walls, new Vector3((i + 1) * Grid, y, D), 180)));
                        }
                        for (int j = 0; j < h.d; j++)
                        {
                            cells.Add(("W", j, Place(kit[wallKey], walls, new Vector3(0, y, (j + 1) * Grid), 90)));
                            cells.Add(("E", j, Place(kit[wallKey], walls, new Vector3(W, y, j * Grid), -90)));
                        }
                        placed += cells.Count;
                        foreach (var c in new[] { new Vector3(0, y, 0), new Vector3(W, y, 0), new Vector3(0, y, D), new Vector3(W, y, D) }) { Place(kit["Pillar"], walls, c, 0); placed++; }
                        // 2. bulk replace: the door cell, then windows on alternate cells
                        foreach (var (side, idx, go) in cells)
                        {
                            GameObject target = null;
                            if (s == 0 && side == h.door.ToUpperInvariant() && idx == h.doorCell) target = kit["WallDoor_" + h.variant];
                            else if ((idx + (s % 2)) % 2 == 1) target = kit["WallWindow_" + h.variant];
                            if (target == null) continue;
                            // observed 2026-09-24: the 3-argument overload reset every replaced wall to the prefab's
                            // default transform (all windows and doors stacked at the house origin, audit still clean);
                            // match by hierarchy, keep overrides, and restore the placement explicitly
                            var lp = go.transform.localPosition; var lr = go.transform.localRotation; var par = go.transform.parent;
                            PrefabUtility.ReplacePrefabAssetOfPrefabInstance(go, target, new PrefabReplacingSettings
                            {
                                objectMatchMode = ObjectMatchMode.ByHierarchy, prefabOverridesOptions = PrefabOverridesOptions.KeepAllPossibleOverrides,
                                changeRootNameToAssetName = true, logInfo = false,
                            }, InteractionMode.AutomatedAction);
                            if ((go.transform.localPosition - lp).sqrMagnitude < 1e-6f && Quaternion.Angle(go.transform.localRotation, lr) < 0.01f) keptBySettings++;
                            if (go.transform.parent != par) go.transform.SetParent(par, false);
                            go.transform.localPosition = lp; go.transform.localRotation = lr;
                            if (target.name.Contains("Door")) go.transform.SetParent(doorways.transform, true);
                            replaced++;
                        }
                    }
                    var roof = WorldCommon.GetOrCreate("Roof", hr.transform);
                    for (int i = 0; i < h.w; i++) for (int j = 0; j < h.d; j++) { Place(kit["Roof"], roof, new Vector3(i * Grid, h.storeys * Storey, j * Grid), 0); placed++; }
                    hr.transform.localPosition = new Vector3(h.x * Grid, 0f, h.z * Grid);
                    houses.Add(new Dictionary<string, object> { { "name", h.name }, { "cells", new List<object> { h.w, h.d } }, { "storeys", h.storeys }, { "variant", h.variant } });
                }
                foreach (var t in root.GetComponentsInChildren<Transform>(true))
                    GameObjectUtility.SetStaticEditorFlags(t.gameObject, StaticEditorFlags.ContributeGI | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.BatchingStatic);

                // 3. clutter: raycast scatter with overlap rejection (after architecture is static)
                Physics.SyncTransforms();
                var scatter = Scatter(root, kit, town, AgentJob.Int("clutter_per_house", 6), AgentJob.Int("seed", 5));
                // 4. compound prefabs: each finished house saved as a prefab whose kit pieces stay nested prefabs
                //    (prebuilt compounds snap and repeat like single pieces, 0o-QnNs-stc [00:08:17], [00:20:09])
                var housePrefabs = new List<object>();
                if (AgentJob.Bool("house_prefabs", true))
                {
                    string hdir = WorldCommon.EnsureFolder(KitDir + "/Houses");
                    foreach (Transform hr in root.transform.Cast<Transform>().ToList())
                    {
                        string hp = hdir + "/PF_" + hr.name + ".prefab";
                        var asset = PrefabUtility.SaveAsPrefabAssetAndConnect(hr.gameObject, hp, InteractionMode.AutomatedAction);
                        int nested = asset.GetComponentsInChildren<Transform>(true).Count(t => t != asset.transform && PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject));
                        housePrefabs.Add(new Dictionary<string, object> { { "prefab", hp }, { "nested_kit_instances", nested } });
                    }
                }
                WorldCommon.Save(scene);
                var audit = AuditKit(root);
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "origin", WorldCommon.V(origin) }, { "grid", Grid }, { "storey", Storey },
                    { "houses", houses }, { "pieces_placed", placed }, { "replaced", replaced }, { "replace_kept_transform_with_settings", keptBySettings },
                    { "kit_prefabs", kit.Values.Distinct().Select(p => AssetDatabase.GetAssetPath(p)).OrderBy(x => x).ToList() },
                    { "variants", kit.Values.Distinct().Count(p => PrefabUtility.GetPrefabAssetType(p) == PrefabAssetType.Variant) },
                    { "clutter", scatter }, { "house_prefabs", housePrefabs }, { "audit", audit },
                };
            });
        }

        static GameObject Place(GameObject prefab, GameObject parent, Vector3 localPos, float yaw)
        {
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent.transform);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.Euler(0, yaw, 0);
            if (AgentJob.Bool("record_overrides", true)) PrefabUtility.RecordPrefabInstancePropertyModifications(go.transform);
            return go;
        }

        static Dictionary<string, object> Scatter(GameObject root, Dictionary<string, GameObject> kit, List<House> town, int perHouse, int seed)
        {
            var rng = new System.Random(seed);
            var items = new[] { kit["Crate"], kit["CrateSmall"], kit["Bench"] };
            int placed = 0, rejectedOverlap = 0, rejectedNoHit = 0, rejectedDoor = 0, rejectedSplit = 0;
            float clear = AgentJob.Float("door_clearance", DoorClearance);
            float agentR = AgentJob.Float("agent_radius", 0.5f);            // NavMesh agent type 0 (Humanoid) radius
            var doors = DoorCentres(root);
            var doorTs = DoorTransforms(root);
            var fractions = new Dictionary<string, object>();
            foreach (var h in town)
            {
                var hr = root.transform.Find(h.name);
                var deco = hr.Find("Level_0/Decoration");
                float W = h.w * Grid, D = h.d * Grid;
                int want = perHouse, tries = 0;
                var placedBoxes = new List<(Vector3 c, Vector3 ext, float yaw)>();
                var door = doorTs.FirstOrDefault(d => d.IsChildOf(hr) && d.parent != null && d.parent.parent != null && d.parent.parent.name == "Level_0");
                Vector3? inside = door ? door.TransformPoint(new Vector3(Grid * 0.5f, 0f, Wall + agentR + 0.15f)) : (Vector3?)null;
                float lastFrac = 1f;
                while (want > 0 && tries++ < perHouse * 20)
                {
                    var local = new Vector3(0.6f + (float)rng.NextDouble() * (W - 1.2f), 2.5f, 0.6f + (float)rng.NextDouble() * (D - 1.2f));
                    var world = hr.TransformPoint(local);
                    if (!Physics.Raycast(world, Vector3.down, out var hit, 4f)) { rejectedNoHit++; continue; }
                    var prefab = items[rng.Next(items.Length)];
                    var yaw = (float)rng.NextDouble() * 360f;                          // never all at 90 degrees
                    var ext = prefab.GetComponent<BoxCollider>().size * 0.5f;
                    var centre = hit.point + Vector3.up * (ext.y + 0.02f);
                    // overlap test against everything except the surface we stand on
                    // keep a clear zone behind every doorway: quick exits (0o-QnNs-stc [00:18:20]) and an agent path;
                    // observed v0.2: a 0.5 m crate 1 m inside a door made that house unreachable in the NavMesh gate
                    float reach = Mathf.Max(ext.x, ext.z);
                    if (doors.Any(d => Vector2.Distance(new Vector2(d.x, d.z), new Vector2(centre.x, centre.z)) < clear + reach)) { rejectedDoor++; continue; }
                    var hits = Physics.OverlapBox(centre, ext * 0.98f, Quaternion.Euler(0, yaw, 0));
                    if (hits.Any(c => c != hit.collider)) { rejectedOverlap++; continue; }
                    // keep the room one piece for an agent of radius agentR: clutter inflated by the radius must not cut
                    // off part of the floor from the door (observed v0.2: 6 items left 25 % of a 2 x 3 cell room reachable)
                    if (inside.HasValue)
                    {
                        var trial = new List<(Vector3, Vector3, float)>(placedBoxes) { (hit.point, ext, yaw) };
                        float frac = FloorConnected(hr, W, D, trial, inside.Value, agentR);
                        if (frac < 0.95f) { rejectedSplit++; continue; }
                        lastFrac = frac;
                    }
                    placedBoxes.Add((hit.point, ext, yaw));
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, deco);
                    go.transform.position = hit.point;                                  // pivot on the surface
                    go.transform.rotation = Quaternion.Euler(0, yaw, 0);
                    Physics.SyncTransforms();
                    placed++; want--;
                }
                fractions[h.name] = Math.Round(lastFrac, 3);
            }
            return new Dictionary<string, object> { { "placed", placed }, { "rejected_overlap", rejectedOverlap }, { "rejected_no_hit", rejectedNoHit }, { "rejected_door_zone", rejectedDoor }, { "rejected_splits_room", rejectedSplit },
                { "door_clearance_m", clear }, { "agent_radius", agentR }, { "floor_connected_fraction", fractions } };
        }

        /// <summary>Clear radius kept around each doorway centre: the agent's diameter (0.4 x 2) plus a
        /// step of margin either side [added default; derive it from the gym metrics].</summary>
        public const float DoorClearance = 1.2f;

        /// <summary>Share of the free ground floor (interior minus walls and clutter, each inflated by the agent
        /// radius) that a flood fill from the door reaches, on a 0.1 m grid in the house's local space.</summary>
        public static float FloorConnected(Transform house, float W, float D, List<(Vector3 c, Vector3 ext, float yaw)> boxes, Vector3 insideWorld, float r)
        {
            const float cell = 0.1f;
            int nx = Mathf.CeilToInt(W / cell), nz = Mathf.CeilToInt(D / cell);
            var free = new bool[nx * nz];
            var local = boxes.Select(b => (c: house.InverseTransformPoint(b.c), b.ext, rot: Quaternion.Inverse(Quaternion.Euler(0, b.yaw, 0)) * house.rotation)).ToList();
            int freeCount = 0;
            for (int z = 0; z < nz; z++)
            for (int x = 0; x < nx; x++)
            {
                float px = (x + 0.5f) * cell, pz = (z + 0.5f) * cell;
                if (px < Wall + r || pz < Wall + r || px > W - Wall - r || pz > D - Wall - r) continue;
                bool blocked = false;
                foreach (var b in local)
                {
                    var q = b.rot * new Vector3(px - b.c.x, 0f, pz - b.c.z);
                    if (Mathf.Abs(q.x) < b.ext.x + r && Mathf.Abs(q.z) < b.ext.z + r) { blocked = true; break; }
                }
                if (blocked) continue;
                free[z * nx + x] = true; freeCount++;
            }
            if (freeCount == 0) return 0f;
            var s = house.InverseTransformPoint(insideWorld);
            int sx = Mathf.Clamp((int)(s.x / cell), 0, nx - 1), sz = Mathf.Clamp((int)(s.z / cell), 0, nz - 1);
            // start from the free cell nearest the door's inside point
            int start = -1; float bestD = float.MaxValue;
            for (int z = Mathf.Max(0, sz - 8); z < Mathf.Min(nz, sz + 9); z++)
            for (int x = Mathf.Max(0, sx - 8); x < Mathf.Min(nx, sx + 9); x++)
                if (free[z * nx + x]) { float d = (x - sx) * (x - sx) + (z - sz) * (z - sz); if (d < bestD) { bestD = d; start = z * nx + x; } }
            if (start < 0) return 0f;
            var seen = new bool[nx * nz]; var qq = new Queue<int>(); seen[start] = true; qq.Enqueue(start); int reached = 0;
            while (qq.Count > 0)
            {
                int c = qq.Dequeue(); reached++; int cx = c % nx, cz = c / nx;
                if (cx > 0 && free[c - 1] && !seen[c - 1]) { seen[c - 1] = true; qq.Enqueue(c - 1); }
                if (cx < nx - 1 && free[c + 1] && !seen[c + 1]) { seen[c + 1] = true; qq.Enqueue(c + 1); }
                if (cz > 0 && free[c - nx] && !seen[c - nx]) { seen[c - nx] = true; qq.Enqueue(c - nx); }
                if (cz < nz - 1 && free[c + nx] && !seen[c + nx]) { seen[c + nx] = true; qq.Enqueue(c + nx); }
            }
            return (float)reached / freeCount;
        }

        public static List<Transform> DoorTransforms(GameObject root)
        {
            var res = new List<Transform>();
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
            {
                if (!PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject)) continue;
                var src = PrefabUtility.GetCorrespondingObjectFromOriginalSource(t.gameObject);
                if (src != null && src.name.StartsWith("PF_Kit_WallDoor")) res.Add(t);
            }
            return res;
        }

        /// <summary>World centres of every door opening (the opening of PF_Kit_WallDoor sits at local x 1.25).</summary>
        public static List<Vector3> DoorCentres(GameObject root)
        {
            var res = new List<Vector3>();
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
            {
                if (!PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject)) continue;
                var src = PrefabUtility.GetCorrespondingObjectFromOriginalSource(t.gameObject);
                if (src != null && src.name.StartsWith("PF_Kit_WallDoor")) res.Add(t.TransformPoint(new Vector3(Grid * 0.5f, 0f, Wall * 0.5f)));
            }
            return res;
        }

        // ------------------------------------------------------------------ audit
        /// <summary>Job: audit a kit town already in a scene (built by BuildKitTown or by hand).
        /// args: scene, root (default "KitTown").</summary>
        public static void AuditKitTown()
        {
            AgentJob.Run(() =>
            {
                var scene = WorldCommon.OpenScene(AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Island.unity"));
                var root = GameObject.Find(AgentJob.Str("root", "KitTown"));
                if (root == null) throw new InvalidOperationException("no kit root in " + scene.path);
                return AuditKit(root);
            });
        }

        public static Dictionary<string, object> AuditKit(GameObject root)
        {
            var f = new AgentAudit.Findings();
            int arch = 0, clutter = 0, hovering = 0, overlapping = 0, unlinked = 0, stacked = 0, missingWalls = 0, blockingDoor = 0;
            Physics.SyncTransforms();
            var doorCentres = DoorCentres(root);
            // placement integrity: no two pieces on the same slot, and every perimeter cell of every storey
            // carries exactly one wall piece (a replace that loses its transform stacks pieces at the origin
            // and leaves holes, while grid, storey and yaw checks all still pass)
            foreach (Transform house in root.transform)
            {
                var slots = new Dictionary<string, string>();
                foreach (var t in house.GetComponentsInChildren<Transform>(true))
                {
                    if (!PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject)) continue;
                    var src = PrefabUtility.GetCorrespondingObjectFromOriginalSource(t.gameObject);
                    if (src == null || !src.name.StartsWith("PF_Kit_")) continue;
                    var lp = house.InverseTransformPoint(t.position);
                    string key = src.name.Split('_')[2] + "@" + Mathf.RoundToInt(lp.x * 10) + "," + Mathf.RoundToInt(lp.y * 10) + "," + Mathf.RoundToInt(lp.z * 10) + "," + Mathf.RoundToInt(t.eulerAngles.y);
                    if (slots.ContainsKey(key)) { stacked++; f.Add("error", "world.kit_stacked", WorldCommon.PathOf(t), "same slot as " + slots[key], "restore the placement after a prefab replace"); }
                    else slots[key] = t.name;
                }
                foreach (Transform lvl in house)
                {
                    if (!lvl.name.StartsWith("Level_")) continue;
                    var floor = lvl.Find("Floor");
                    if (floor == null || floor.childCount == 0) continue;
                    var fb = WorldScenes.Bounds(floor.gameObject);
                    int cw = Mathf.RoundToInt(fb.size.x / Grid), cd = Mathf.RoundToInt(fb.size.z / Grid);
                    int expected = 2 * (cw + cd);
                    var wallSlots = new HashSet<string>();
                    foreach (var t in lvl.GetComponentsInChildren<Transform>(true))
                    {
                        if (!PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject)) continue;
                        var src = PrefabUtility.GetCorrespondingObjectFromOriginalSource(t.gameObject);
                        if (src == null || !(src.name.StartsWith("PF_Kit_Wall"))) continue;
                        var lp = house.InverseTransformPoint(t.position);
                        wallSlots.Add(Mathf.RoundToInt(lp.x * 10) + "," + Mathf.RoundToInt(lp.z * 10) + "," + Mathf.RoundToInt(t.eulerAngles.y));
                    }
                    if (wallSlots.Count < expected)
                    {
                        missingWalls += expected - wallSlots.Count;
                        f.Add("error", "world.kit_missing_wall", WorldCommon.PathOf(lvl), wallSlots.Count + " distinct wall slots for " + expected + " perimeter cells", "every perimeter cell needs one wall, window or door piece");
                    }
                }
            }
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
            {
                var go = t.gameObject;
                if (!PrefabUtility.IsAnyPrefabInstanceRoot(go)) continue;
                var src = PrefabUtility.GetCorrespondingObjectFromOriginalSource(go);
                var name = src ? src.name : go.name;
                var path = WorldCommon.PathOf(t);
                if (name.StartsWith("PF_Kit_"))
                {
                    arch++;
                    var house = t.parent; while (house != null && house.parent != root.transform) house = house.parent;
                    var lp = house != null ? house.InverseTransformPoint(t.position) : t.localPosition;
                    bool pillarOrRoof = name.Contains("Pillar") || name.Contains("Roof");
                    if (!OnGrid(lp.x) || !OnGrid(lp.z))
                        f.Add("warn", "world.kit_grid", path, "position " + lp + " off the " + Grid + " m kit grid", "snap to multiples of " + Grid);
                    if (!pillarOrRoof && Mathf.Abs(lp.y / Storey - Mathf.Round(lp.y / Storey)) > 1e-3f)
                        f.Add("warn", "world.kit_storey", path, "Y " + lp.y + " not a multiple of the storey height " + Storey, "storeys at Y = 3 n");
                    float yaw = t.eulerAngles.y;
                    if (Mathf.Abs(Mathf.DeltaAngle(yaw, Mathf.Round(yaw / 90f) * 90f)) > 0.01f)
                        f.Add("warn", "world.kit_rotation", path, "yaw " + yaw + " not a multiple of 90", "modular pieces rotate in 90 degree steps");
                }
                else if (name.StartsWith("PF_Clutter_"))
                {
                    clutter++;
                    var col = go.GetComponent<Collider>();
                    var b = col.bounds;
                    // hovering: gap between the bottom and the surface below
                    if (Physics.Raycast(new Vector3(b.center.x, b.min.y + 0.05f, b.center.z), Vector3.down, out var hit, 2f, ~0, QueryTriggerInteraction.Ignore))
                    {
                        float gap = b.min.y - hit.point.y;
                        if (gap > 0.02f) { hovering++; f.Add("error", "world.clutter_hover", path, "floats " + gap.ToString("0.000", CultureInfo.InvariantCulture) + " m above the surface", "raycast placement, pivot on the hit point"); }
                    }
                    var others = Physics.OverlapBox(b.center + Vector3.up * 0.03f, b.extents * 0.9f, t.rotation).Where(c => c != col && c.GetComponentInParent<Transform>() && c.name.StartsWith("PF_Clutter_")).ToList();
                    if (others.Count > 0) { overlapping++; f.Add("warn", "world.clutter_overlap", path, "overlaps " + others[0].name, "overlap rejection at placement"); }
                    float r = Mathf.Max(b.extents.x, b.extents.z);
                    var near = doorCentres.Where(d => Vector2.Distance(new Vector2(d.x, d.z), new Vector2(b.center.x, b.center.z)) < DoorClearance + r).ToList();
                    if (near.Count > 0) { blockingDoor++; f.Add("warn", "world.clutter_blocks_door", path, "inside the " + DoorClearance + " m clear zone of a doorway", "move it: keep exits and agent paths clear"); }
                }
                if (!PrefabUtility.IsPartOfPrefabInstance(go)) unlinked++;
            }
            return new Dictionary<string, object>
            {
                { "architecture_instances", arch }, { "clutter", clutter }, { "hovering", hovering }, { "overlapping", overlapping },
                { "unlinked", unlinked }, { "stacked", stacked }, { "missing_walls", missingWalls }, { "clutter_blocking_doors", blockingDoor }, { "counts", f.Counts() }, { "findings", f.items.Take(20).ToList() },
            };
        }

        static bool OnGrid(float v)
        {
            foreach (var off in new[] { 0f })
            {
                float q = (v - off) / Grid;
                if (Mathf.Abs(q - Mathf.Round(q)) < 1e-3f) return true;
            }
            return false;
        }

        static List<House> ReadTown(List<object> list)
        {
            if (list == null || list.Count == 0) return DefaultTown;
            var town = new List<House>();
            foreach (var o in list)
            {
                if (!(o is Dictionary<string, object> d)) continue;
                int I(string k, int def) => d.TryGetValue(k, out var v) && v != null ? (int)AgentJson.ToDouble(v, def) : def;
                town.Add(new House
                {
                    name = d.TryGetValue("name", out var n) ? n.ToString() : "KitHouse_" + town.Count,
                    x = I("x", 0), z = I("z", 0), w = I("w", 2), d = I("d", 2), storeys = I("storeys", 1),
                    door = d.TryGetValue("door", out var dr) ? dr.ToString() : "S", doorCell = I("door_cell", 0),
                    variant = d.TryGetValue("variant", out var va) ? va.ToString() : "Plaster",
                });
            }
            return town;
        }
    }
}
