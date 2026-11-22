// scenario-unity-world-building v0.2 (2026-09-24). The gym (zoo) of the level design e-book: "doorways for
// camera height and side clearance, winding paths, multiple inclines for slope granularity,
// unclimbable slopes, triggers, jump distances"; rebuilt whenever the character controller changes
// (doc-level-design-ebook: gym/zoo). An agent cannot playtest by feel, so every lane is measured:
//   - NavMesh built with the character's own metrics (radius, height, slope limit, step height):
//     which doorways, ramps, steps and stairs the character can traverse;
//   - a CharacterController pushed up every ramp and step lane in the editor (slopeLimit and
//     stepOffset as the controller really applies them);
//   - a third-person camera boom (pivot height, shoulder offset, boom length, pitch, sphere radius)
//     swept through every doorway: the fraction of positions where the camera sphere hits the
//     frame (a door the capsule fits can still clip the camera: size doors from the camera too);
//   - gap lanes: jumpable when gap <= jump distance; those get a NavMeshLink (the jump) and pass;
//   - Build Height Mesh measured on the stairs lane: NavMesh height error against the step tops
//     with and without it (multi-storey buildings, 0o-QnNs-stc [00:19:27]).
// Job: AgentKit.World.WorldGym.BuildGym  args: metrics {radius, height, slope, step, jump,
//      cam_pivot, cam_shoulder, cam_boom, cam_pitch, cam_radius}, scene (default World_Gym.unity)
// Job: AgentKit.World.WorldGym.PolyShapeRebuild: the ProBuilder rule "re-entering the shape or
//      PolyShape tool discards every later action" (doc-probuilder-polybrush: components), shown in
//      code (CreateShapeFromPolygon after an Extrude) and the scripted fix (replay a recipe).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world_v2.py.
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
using UnityEngine.ProBuilder.MeshOperations;
using Object = UnityEngine.Object;
using Math = System.Math;

namespace AgentKit.World
{
    public static class WorldGym
    {
        public class GymMetrics
        {
            public float radius = 0.4f, height = 1.8f, slope = 45f, step = 0.3f, jump = 2.5f;
            public float camPivot = 1.6f, camShoulder = 0.5f, camBoom = 3.5f, camPitch = 20f, camRadius = 0.2f;
        }

        class Lane { public string name, kind; public float value, value2; public float x0; public Vector3 start, goal; public float featureZ; }

        const float LaneW = 4f, LaneStep = 5f, L = 18f, WallH = 3.5f;
        static readonly Color Floor = WorldBlockout.FloorColor, Wall = WorldBlockout.WallColor, Door = WorldBlockout.DoorColor, Ramp = new Color(0.45f, 0.75f, 0.45f);

        static string F(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);

        public static void BuildGym()
        {
            AgentJob.Run(() =>
            {
                var m = ReadMetrics(AgentJob.Dict("metrics"));
                string path = AgentJob.Str("scene", WorldCommon.Root + "/Scenes/World_Gym.unity");
                WorldCommon.EnsureFolder(System.IO.Path.GetDirectoryName(path));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var sun = new GameObject("Sun", typeof(Light)).GetComponent<Light>();
                sun.type = LightType.Directional; sun.transform.rotation = Quaternion.Euler(45f, -30f, 0f); sun.shadows = LightShadows.Soft;
                var root = new GameObject("Gym");
                var lanes = new List<Lane>();
                float x = 0f;
                void AddLane(string kind, float v, float v2 = 0f)
                {
                    string nm = kind switch
                    {
                        "door" => $"Gym_Door_w{F(v)}_h{F(v2)}", "ramp" => $"Gym_Ramp_{F(v)}deg", "step" => $"Gym_Step_h{F(v)}",
                        "stairs" => $"Gym_Stairs_rise{F(v)}_tread{F(v2)}", "gap" => $"Gym_Gap_{F(v)}m", _ => "Gym_" + kind,
                    };
                    lanes.Add(new Lane { name = nm, kind = kind, value = v, value2 = v2, x0 = x }); x += LaneStep;
                }
                foreach (var w in new[] { 0.8f, 1.0f, 1.2f, 1.4f, 1.6f, 2.0f }) AddLane("door", w, 2.4f);
                foreach (var hh in new[] { 2.1f, 2.7f, 3.0f }) AddLane("door", 1.4f, hh);
                AddLane("door", 2.0f, 3.0f);
                for (int a = 10; a <= 60; a += 5) AddLane("ramp", a);
                foreach (var s in new[] { 0.1f, 0.2f, 0.3f, 0.4f, 0.5f, 0.6f }) AddLane("step", s);
                AddLane("stairs", 0.2f, 0.3f);
                foreach (var g in new[] { 1f, 1.5f, 2f, 2.5f, 3f, 3.5f }) AddLane("gap", g);

                // common start strip across all lanes
                WorldBlockout.Box(root, $"BO_GymStart_w{F(x)}_d6", new Vector3(-1f, -0.2f, -4f), new Vector3(x + 1f, 0.2f, 6f), Floor);
                foreach (var ln in lanes) BuildLane(root, ln);
                Physics.SyncTransforms();

                // NavMesh with the character's metrics
                var bounds = new Bounds(new Vector3(x * 0.5f, 2f, L * 0.5f - 2f), new Vector3(x + 4f, 12f, L + 8f));
                var navNoHm = Bake(bounds, m, false);
                var rows = new List<object>();
                foreach (var ln in lanes.Where(l => l.kind == "gap" && l.value <= m.jump))
                {
                    // the jump as a NavMeshLink across the gap (only where the character can make it)
                    var lg = new GameObject("NavLink_Jump_" + F(ln.value));
                    lg.transform.SetParent(root.transform, false);
                    lg.transform.position = new Vector3(ln.x0 + LaneW * 0.5f, 0f, ln.featureZ);
                    var link = lg.AddComponent<NavMeshLink>();
                    link.startPoint = new Vector3(0f, 0f, -0.8f); link.endPoint = new Vector3(0f, 0f, ln.value + 0.8f);   // both ends on the NavMesh (inset by the radius)
                    link.width = 1f; link.bidirectional = true; link.UpdateLink();
                }
                bool ccWorks = true;
                foreach (var ln in lanes)
                {
                    var p = new NavMeshPath();
                    bool s = NavMesh.SamplePosition(ln.start, out var sh, 1.0f, NavMesh.AllAreas);
                    bool g = NavMesh.SamplePosition(ln.goal, out var gh, 1.0f, NavMesh.AllAreas);
                    bool nav = s && g && NavMesh.CalculatePath(sh.position, gh.position, NavMesh.AllAreas, p) && p.status == NavMeshPathStatus.PathComplete;
                    var row = new Dictionary<string, object> { { "lane", ln.name }, { "kind", ln.kind }, { "value", ln.value }, { "navmesh_pass", nav } };
                    if (ln.kind == "door") { row["height"] = ln.value2; row["camera_clip_fraction"] = CameraClip(ln, m, out var worst); row["camera_worst"] = worst; }
                    if (ln.kind == "ramp" || ln.kind == "step" || ln.kind == "stairs")
                    {
                        var cc = PushController(ln, m, out float reachedZ);
                        if (cc == null) ccWorks = false; else row["controller_pass"] = cc.Value;
                        row["controller_reached_z"] = Math.Round(reachedZ, 2);
                    }
                    if (ln.kind == "gap") row["jumpable"] = ln.value <= m.jump;
                    rows.Add(row);
                }
                // Build Height Mesh on the stairs lane
                var stairs = lanes.First(l => l.kind == "stairs");
                var errNo = HeightError(stairs);
                NavMesh.RemoveAllNavMeshData();
                var navHm = Bake(bounds, m, true);
                var errHm = HeightError(stairs);
                NavMesh.RemoveAllNavMeshData();
                foreach (var lk in root.GetComponentsInChildren<NavMeshLink>()) lk.enabled = false;

                var cam = new GameObject("Main Camera", typeof(Camera)); cam.tag = "MainCamera";
                cam.transform.position = new Vector3(x * 0.5f, 40f, -30f); cam.transform.rotation = Quaternion.Euler(45f, 0f, 0f);
                cam.AddComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
                AgentCapture.SaveBookmark("Gym_Overview", new Vector3(x * 0.5f, 45f, -35f), new Vector3(x * 0.5f, 0f, L * 0.5f), 50f);
                AgentCapture.SaveBookmark("Gym_Doors", new Vector3(lanes[0].x0 + 12f, 5f, -8f), new Vector3(lanes[0].x0 + 22f, 1f, 7f), 60f);
                if (!EditorSceneManager.SaveScene(scene, path)) throw new InvalidOperationException("save failed " + path);

                float MinPass(string kind, Func<Dictionary<string, object>, bool> ok, bool max = false)
                {
                    var v = rows.Cast<Dictionary<string, object>>().Where(r => (string)r["kind"] == kind && ok(r)).Select(r => Convert.ToSingle(r["value"])).ToList();
                    return v.Count == 0 ? -1f : (max ? v.Max() : v.Min());
                }
                bool NavOk(Dictionary<string, object> r) => (bool)r["navmesh_pass"];
                var doorRows = rows.Cast<Dictionary<string, object>>().Where(r => (string)r["kind"] == "door").ToList();
                var camClear = doorRows.Where(r => (bool)r["navmesh_pass"] && Convert.ToSingle(r["camera_clip_fraction"]) == 0f).Select(r => new List<object> { r["value"], r["height"] }).ToList();
                var summary = new Dictionary<string, object>
                {
                    { "min_door_width_agent", MinPass("door", r => NavOk(r) && Convert.ToSingle(r["height"]) == 2.4f) },
                    { "doors_camera_clear", camClear },
                    { "max_ramp_navmesh_deg", MinPass("ramp", NavOk, true) },
                    { "max_ramp_controller_deg", MinPass("ramp", r => r.TryGetValue("controller_pass", out var c) && (bool)c, true) },
                    { "max_step_navmesh_m", MinPass("step", NavOk, true) },
                    { "max_step_controller_m", MinPass("step", r => r.TryGetValue("controller_pass", out var c) && (bool)c, true) },
                    { "max_gap_with_jump_link_m", MinPass("gap", NavOk, true) },
                    { "controller_sim_in_editor", ccWorks },
                    { "stairs_height_error_m", new Dictionary<string, object> { { "without_height_mesh", errNo }, { "with_height_mesh", errHm } } },
                };
                return new Dictionary<string, object>
                {
                    { "scene", path }, { "lanes", lanes.Count },
                    { "metrics", new Dictionary<string, object> { { "radius", m.radius }, { "height", m.height }, { "slope", m.slope }, { "step", m.step }, { "jump", m.jump },
                        { "cam_pivot", m.camPivot }, { "cam_shoulder", m.camShoulder }, { "cam_boom", m.camBoom }, { "cam_pitch", m.camPitch }, { "cam_radius", m.camRadius } } },
                    { "navmesh", navNoHm }, { "navmesh_height_mesh", navHm }, { "summary", summary }, { "rows", rows },
                };
            });
        }

        static void BuildLane(GameObject root, Lane ln)
        {
            var go = new GameObject(ln.name); go.transform.SetParent(root.transform, false);
            float x0 = ln.x0, cx = x0 + LaneW * 0.5f;
            // side walls separate the lanes so a path can only use its own lane
            WorldBlockout.Box(go, "BO_GymWallL_h3.5", new Vector3(x0 - 0.2f, 0f, 2f), new Vector3(0.2f, WallH, L - 2f), Wall);
            WorldBlockout.Box(go, "BO_GymWallR_h3.5", new Vector3(x0 + LaneW, 0f, 2f), new Vector3(0.2f, WallH, L - 2f), Wall);
            ln.start = new Vector3(cx, 0f, 0f);
            switch (ln.kind)
            {
                case "door":
                {
                    WorldBlockout.Box(go, $"BO_GymFloor_d{F(L - 2f)}", new Vector3(x0, -0.2f, 2f), new Vector3(LaneW, 0.2f, L - 2f), Floor);
                    float w = ln.value, h = ln.value2, z = 7f; ln.featureZ = z;
                    WorldBlockout.Box(go, "BO_GymDoorL", new Vector3(x0, 0f, z), new Vector3(LaneW * 0.5f - w * 0.5f, WallH, 0.2f), Door);
                    WorldBlockout.Box(go, "BO_GymDoorR", new Vector3(cx + w * 0.5f, 0f, z), new Vector3(LaneW * 0.5f - w * 0.5f, WallH, 0.2f), Door);
                    if (h < WallH) WorldBlockout.Box(go, "BO_GymLintel", new Vector3(cx - w * 0.5f, h, z), new Vector3(w, WallH - h, 0.2f), Door);
                    ln.goal = new Vector3(cx, 0f, L - 2f);
                    break;
                }
                case "ramp":
                {
                    float a = ln.value, H = 2f, run = H / Mathf.Tan(a * Mathf.Deg2Rad), z = 5f; ln.featureZ = z;
                    WorldBlockout.Box(go, "BO_GymFloor_d3", new Vector3(x0, -0.2f, 2f), new Vector3(LaneW, 0.2f, 3f), Floor);
                    float len = Mathf.Sqrt(run * run + H * H), t = 0.3f;
                    var pb = ShapeGenerator.GenerateCube(PivotLocation.Center, new Vector3(LaneW, t, len));
                    var n = new Vector3(0f, Mathf.Cos(a * Mathf.Deg2Rad), -Mathf.Sin(a * Mathf.Deg2Rad));
                    var surfaceMid = new Vector3(cx, H * 0.5f, z + run * 0.5f);
                    WorldBlockout.Finish(pb, go, $"BO_GymRamp_{F(a)}deg_l{F(len)}", surfaceMid - n * (t * 0.5f), Ramp);
                    pb.transform.rotation = Quaternion.Euler(-a, 0f, 0f);
                    WorldBlockout.Box(go, "BO_GymTop_h2", new Vector3(x0, 0f, z + run), new Vector3(LaneW, H, 5f), Floor);
                    ln.goal = new Vector3(cx, H, z + run + 3f);
                    break;
                }
                case "step":
                {
                    float s = ln.value, z = 6f; ln.featureZ = z;
                    WorldBlockout.Box(go, "BO_GymFloor_d4", new Vector3(x0, -0.2f, 2f), new Vector3(LaneW, 0.2f, 4f), Floor);
                    WorldBlockout.Box(go, $"BO_GymStep_h{F(s)}", new Vector3(x0, 0f, z), new Vector3(LaneW, s, L - z), Ramp);
                    ln.goal = new Vector3(cx, s, L - 2f);
                    break;
                }
                case "stairs":
                {
                    float rise = ln.value, tread = ln.value2, z = 5f; int nSteps = 12; ln.featureZ = z;
                    WorldBlockout.Box(go, "BO_GymFloor_d3", new Vector3(x0, -0.2f, 2f), new Vector3(LaneW, 0.2f, 3f), Floor);
                    for (int i = 0; i < nSteps; i++)
                        WorldBlockout.Box(go, $"BO_GymStair{i}_h{F((i + 1) * rise)}", new Vector3(x0, 0f, z + i * tread), new Vector3(LaneW, (i + 1) * rise, tread), Ramp);
                    float top = nSteps * rise, zt = z + nSteps * tread;
                    WorldBlockout.Box(go, $"BO_GymTop_h{F(top)}", new Vector3(x0, 0f, zt), new Vector3(LaneW, top, L - zt), Floor);
                    ln.goal = new Vector3(cx, top, L - 2f);
                    break;
                }
                case "gap":
                {
                    float g = ln.value, z = 8f; ln.featureZ = z;
                    WorldBlockout.Box(go, "BO_GymFloorA_d6", new Vector3(x0, -0.2f, 2f), new Vector3(LaneW, 0.2f, z - 2f), Floor);
                    WorldBlockout.Box(go, $"BO_GymPit_{F(g)}m", new Vector3(x0, -3.2f, z), new Vector3(LaneW, 0.2f, g), Wall);
                    WorldBlockout.Box(go, "BO_GymFloorB", new Vector3(x0, -0.2f, z + g), new Vector3(LaneW, 0.2f, L - z - g), Floor);
                    ln.goal = new Vector3(cx, 0f, L - 2f);
                    break;
                }
            }
        }

        static Dictionary<string, object> Bake(Bounds bounds, GymMetrics m, bool heightMesh)
        {
            var settings = NavMesh.GetSettingsByID(0);
            settings.agentRadius = m.radius; settings.agentHeight = m.height; settings.agentSlope = m.slope; settings.agentClimb = m.step;
            settings.buildHeightMesh = heightMesh;
            var sources = new List<NavMeshBuildSource>();
            NavMeshBuilder.CollectSources(bounds, ~0, NavMeshCollectGeometry.PhysicsColliders, 0, new List<NavMeshBuildMarkup>(), sources);
            var data = NavMeshBuilder.BuildNavMeshData(settings, sources, bounds, Vector3.zero, Quaternion.identity);
            NavMesh.AddNavMeshData(data);
            var tri = NavMesh.CalculateTriangulation();
            return new Dictionary<string, object> { { "sources", sources.Count }, { "triangles", tri.indices.Length / 3 }, { "height_mesh", heightMesh },
                { "agent", new List<object> { settings.agentRadius, settings.agentHeight, settings.agentSlope, settings.agentClimb } } };
        }

        /// <summary>Mean and max |NavMesh height - step top| along the stairs centre line.</summary>
        static Dictionary<string, object> HeightError(Lane stairs)
        {
            float cx = stairs.x0 + LaneW * 0.5f, sum = 0f, max = 0f; int n = 0, missed = 0;
            for (float z = stairs.featureZ + 0.05f; z < stairs.featureZ + 12 * stairs.value2 - 0.05f; z += 0.05f)
            {
                if (!Physics.Raycast(new Vector3(cx, 10f, z), Vector3.down, out var hit, 20f)) continue;
                if (!NavMesh.SamplePosition(hit.point, out var nh, 1.0f, NavMesh.AllAreas)) { missed++; continue; }
                float e = Mathf.Abs(nh.position.y - hit.point.y);
                sum += e; max = Mathf.Max(max, e); n++;
            }
            return new Dictionary<string, object> { { "samples", n }, { "missed", missed }, { "mean_m", n > 0 ? Math.Round(sum / n, 3) : -1 }, { "max_m", Math.Round(max, 3) } };
        }

        /// <summary>Sweep a third-person camera boom through the doorway: character crossing at lateral
        /// offsets and distances past the door plane; sphere cast from the pivot to the camera.</summary>
        static float CameraClip(Lane ln, GymMetrics m, out string worst)
        {
            float cx = ln.x0 + LaneW * 0.5f, halfFree = Mathf.Max(0f, ln.value * 0.5f - m.radius);
            int hits = 0, total = 0; worst = null;
            float pitch = m.camPitch * Mathf.Deg2Rad;
            foreach (var lat in new[] { -1f, -0.5f, 0f, 0.5f, 1f })
                foreach (var past in new[] { 0.5f, 1f, 1.5f, 2f, 2.5f, 3f })
                {
                    var pivot = new Vector3(cx + lat * halfFree + m.camShoulder, m.camPivot, ln.featureZ + 0.2f + past);
                    var camPos = pivot + new Vector3(0f, Mathf.Sin(pitch), -Mathf.Cos(pitch)) * m.camBoom;
                    var d = camPos - pivot; total++;
                    if (Physics.SphereCast(pivot, m.camRadius, d.normalized, out var hit, d.magnitude, ~0, QueryTriggerInteraction.Ignore))
                    {
                        hits++;
                        worst ??= $"lateral {lat * halfFree:0.00} m, {past:0.0} m past: hits {hit.collider.name} at {hit.distance:0.00} of {d.magnitude:0.00} m";
                    }
                }
            return (float)Math.Round((double)hits / total, 3);
        }

        /// <summary>Push a CharacterController up the lane (forward plus gravity steps). Null when the
        /// controller does not move in the editor (no physics query support).</summary>
        static bool? PushController(Lane ln, GymMetrics m, out float reachedZ)
        {
            var go = new GameObject("GymController");
            var cc = go.AddComponent<CharacterController>();
            cc.radius = m.radius; cc.height = m.height; cc.slopeLimit = m.slope; cc.stepOffset = Mathf.Min(m.step, m.height - 2f * m.radius);
            cc.center = new Vector3(0f, m.height * 0.5f, 0f); cc.skinWidth = 0.02f;
            go.transform.position = new Vector3(ln.x0 + LaneW * 0.5f, 0.05f, 3f);
            Physics.SyncTransforms();
            var p0 = go.transform.position;
            for (int i = 0; i < 1500 && go.transform.position.z < ln.goal.z; i++) cc.Move(new Vector3(0f, -0.15f, 0.05f));
            reachedZ = go.transform.position.z;
            bool moved = (go.transform.position - p0).sqrMagnitude > 0.01f;
            bool pass = go.transform.position.z >= ln.goal.z - 0.1f && go.transform.position.y > ln.goal.y - 0.3f;
            Object.DestroyImmediate(go);
            return moved ? pass : (bool?)null;
        }

        static GymMetrics ReadMetrics(Dictionary<string, object> d)
        {
            var m = new GymMetrics();
            if (d == null) return m;
            float G(string k, float def) => d.TryGetValue(k, out var v) && v != null ? (float)AgentJson.ToDouble(v, def) : def;
            m.radius = G("radius", m.radius); m.height = G("height", m.height); m.slope = G("slope", m.slope); m.step = G("step", m.step); m.jump = G("jump", m.jump);
            m.camPivot = G("cam_pivot", m.camPivot); m.camShoulder = G("cam_shoulder", m.camShoulder); m.camBoom = G("cam_boom", m.camBoom);
            m.camPitch = G("cam_pitch", m.camPitch); m.camRadius = G("cam_radius", m.camRadius);
            return m;
        }

        // ------------------------------------------------------------------ PolyShape trap
        public static void PolyShapeRebuild()
        {
            AgentJob.Run(() =>
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var go = new GameObject("BO_PolyFootprint_w8_d8");
                var pb = go.AddComponent<ProBuilderMesh>();
                var poly = go.AddComponent<PolyShape>();
                var pts = new List<Vector3> { new Vector3(0, 0, 0), new Vector3(8, 0, 0), new Vector3(8, 0, 5), new Vector3(4, 0, 8), new Vector3(0, 0, 5) };
                poly.SetControlPoints(pts); poly.extrude = 3f; poly.flipNormals = false;
                var r0 = poly.CreateShapeFromPolygon();
                int baseFaces = pb.faceCount; float baseTop = Top(pb);
                // a later edit: extrude the roof face 2 m (a tower on the footprint)
                void Tower(ProBuilderMesh mesh)
                {
                    var roof = mesh.faces.OrderByDescending(f => f.distinctIndexes.Average(i => mesh.positions[i].y)).First();
                    mesh.Extrude(new[] { roof }, ExtrudeMethod.FaceNormal, 2f);
                    mesh.ToMesh(); mesh.Refresh(); EditorMeshUtility.Optimize(mesh, true);
                }
                Tower(pb);
                int editedFaces = pb.faceCount; float editedTop = Top(pb);
                // "re-entering" the PolyShape: move one point, rebuild from the footprint
                pts[3] = new Vector3(4, 0, 9); poly.SetControlPoints(pts);
                poly.CreateShapeFromPolygon(); pb.ToMesh(); pb.Refresh();
                int rebuiltFaces = pb.faceCount; float rebuiltTop = Top(pb);
                // the scripted fix: keep the recipe (footprint + ordered operations) and replay it
                Tower(pb);
                int replayFaces = pb.faceCount; float replayTop = Top(pb);
                bool lost = rebuiltFaces == baseFaces && editedFaces > baseFaces && Mathf.Abs(rebuiltTop - baseTop) < 1e-3f;
                return new Dictionary<string, object>
                {
                    { "create_status", r0.status.ToString() },
                    { "faces", new Dictionary<string, object> { { "footprint", baseFaces }, { "after_extrude", editedFaces }, { "after_rebuild", rebuiltFaces }, { "after_replay", replayFaces } } },
                    { "top_m", new Dictionary<string, object> { { "footprint", Math.Round(baseTop, 2) }, { "after_extrude", Math.Round(editedTop, 2) }, { "after_rebuild", Math.Round(rebuiltTop, 2) }, { "after_replay", Math.Round(replayTop, 2) } } },
                    { "extrusion_lost_on_rebuild", lost }, { "replay_restores", replayFaces == editedFaces && Mathf.Abs(replayTop - editedTop) < 1e-3f },
                };
            });
        }

        static float Top(ProBuilderMesh pb) => pb.positions.Max(p => p.y);
    }
}
