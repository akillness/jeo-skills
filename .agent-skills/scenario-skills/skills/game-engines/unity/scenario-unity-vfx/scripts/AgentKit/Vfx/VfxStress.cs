// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// Stress scene for frame-time budgets: N copies of a one-shot effect replayed together every period
// (VfxStressSpawner, runtime), a camera that frames them, and a report of peak live particles.
// Then profile it with the core job (Play mode, offscreen camera target, ProfilerRecorder CSV):
//   ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings", {"scene": <scene>, "frames": 300,
//                     "warmup": 60, "target_fps": 30}, quit=False, graphics=True)
// and compare against the same scene with count 0 (ut_stat.compare_frames) to isolate the VFX cost.
// Job: AgentKit.Vfx.VfxStress.BuildScene args: scene, prefab, count (20), period (1.2), scale (1.5),
//      quality ("" | "Mobile"), report (json path written at the end of Play mode), ground (true)
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Vfx
{
    public static class VfxStress
    {
        public static void BuildScene()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene", "Assets/Scenes/VFX_Stress_20.unity");
                var prefabPath = AgentJob.Str("prefab", "Assets/VFX/Fireball/FX_Fireball_Explosion.prefab");
                int count = AgentJob.Int("count", 20);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
                if (prefab == null && count > 0) throw new FileNotFoundException("prefab not found: " + prefabPath);
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var camGo = new GameObject("Main Camera", typeof(Camera)) { tag = "MainCamera" };
                var cam = camGo.GetComponent<Camera>();
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.05f, 0.06f, 0.08f);
                cam.fieldOfView = 55f;
                camGo.transform.position = new Vector3(0f, 9f, -9f);
                camGo.transform.rotation = Quaternion.LookRotation(new Vector3(0f, 0.8f, 3.3f) - camGo.transform.position);
                cam.GetUniversalAdditionalCameraData().renderPostProcessing = AgentJob.Bool("post", false);
                var light = new GameObject("Key_Light", typeof(Light)).GetComponent<Light>();
                light.type = LightType.Directional;
                light.transform.rotation = Quaternion.Euler(45, -30, 0);
                if (AgentJob.Bool("ground", true))
                {
                    var g = GameObject.CreatePrimitive(PrimitiveType.Plane);
                    g.name = "Ground";
                    g.transform.position = new Vector3(0, 0, 3.3f);
                    g.transform.localScale = new Vector3(2, 1, 2);
                }
                var root = new GameObject("VFX_Stress");
                root.transform.position = new Vector3(0, 1.2f, 0);
                var sp = root.AddComponent<VfxStressSpawner>();
                sp.prefab = prefab;
                sp.count = count;
                sp.period = AgentJob.Float("period", 1.2f);
                sp.scale = AgentJob.Float("scale", 1.5f);
                sp.spacing = AgentJob.Float("spacing", 2.2f);
                sp.qualityLevel = AgentJob.Str("quality", "");
                sp.reportPath = AgentJob.Has("report") ? AgentJob.ResolvePath(AgentJob.Str("report")) : "";
                Directory.CreateDirectory(Path.Combine(AgentJob.ProjectRoot, Path.GetDirectoryName(scenePath)));
                EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(), scenePath);
                return new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "prefab", prefabPath }, { "count", count }, { "period", sp.period }, { "scale", sp.scale },
                    { "quality", sp.qualityLevel }, { "report", sp.reportPath }, { "quality_levels", new List<string>(QualitySettings.names) },
                };
            });
        }

        /// <summary>Edit-mode companion of the profile: open the stress scene, lay out the same N instances as
        /// VfxStressSpawner, simulate them together to each time in `times`, and capture + count overdraw and
        /// particles (the worst case: every copy at its peak on the same frame). args: scene, times, width, height, out_dir,
        /// spacing (override the spawner's, e.g. the real gameplay spacing for a readability capture), cam_back (camera
        /// distance multiplier around the grid centre). v0.2: also writes stress_bg.png (no particles) so ut_vfx can
        /// isolate the effects (crowd_readability, effect_energy).</summary>
        public static void StressOverdraw()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var scenePath = AgentJob.Str("scene", "Assets/Scenes/VFX_Stress_20.unity");
                EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var sp = Object.FindFirstObjectByType<VfxStressSpawner>();
                if (sp == null || sp.prefab == null) throw new System.InvalidOperationException("no VfxStressSpawner with a prefab in " + scenePath);
                int w = AgentJob.Int("width", 960), h = AgentJob.Int("height", 540);
                var cam = Camera.main;
                cam.aspect = (float)w / h;
                float spacing = AgentJob.Float("spacing", sp.spacing);
                int rows = (sp.count + sp.columns - 1) / sp.columns;
                var centre = sp.transform.position + new Vector3(0f, 0f, (rows - 1) * spacing * 0.5f);
                float back = AgentJob.Float("cam_back", 1f);
                if (!Mathf.Approximately(back, 1f))
                {
                    cam.transform.position = centre + (cam.transform.position - centre) * back;
                    cam.transform.rotation = Quaternion.LookRotation(centre - cam.transform.position);
                }
                var roots = new List<ParticleSystem>();
                for (int i = 0; i < sp.count; i++)
                {
                    int cx = i % sp.columns, cy = i / sp.columns;
                    var pos = sp.transform.position + new Vector3((cx - (sp.columns - 1) * 0.5f) * spacing, 0f, cy * spacing);
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(sp.prefab);
                    go.transform.position = pos;
                    go.transform.localScale = Vector3.one * sp.scale;
                    roots.Add(go.GetComponent<ParticleSystem>());
                }
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("stress");
                Directory.CreateDirectory(outDir);
                var bg = Path.Combine(outDir, "stress_bg.png");
                AgentCapture.RenderCamera(cam, w, h, bg);
                var times = AgentJob.Has("times") ? AgentJob.List("times") : new List<object> { 0.05, 0.15, 0.3, 0.6 };
                var frames = new List<object>();
                foreach (var to in times)
                {
                    float t = (float)AgentJson.ToDouble(to);
                    foreach (var ps in roots) ps.Simulate(t, true, true, true);
                    var tag = "t" + Mathf.RoundToInt(t * 1000).ToString("0000");
                    var png = Path.Combine(outDir, "stress_" + tag + ".png");
                    AgentCapture.RenderCamera(cam, w, h, png);
                    var rs = new List<Renderer>();
                    foreach (var ps in roots) rs.AddRange(ps.GetComponentsInChildren<ParticleSystemRenderer>());
                    var od = VfxBudget.Overdraw(cam, rs, w, h, Path.Combine(outDir, "stress_" + tag + "_overdraw.png"));
                    var counts = VfxBudget.Counts(roots.ConvertAll(r => r.gameObject));
                    frames.Add(new Dictionary<string, object> { { "t", t }, { "png", png }, { "overdraw", od }, { "total_alive", counts["total_alive"] } });
                }
                return new Dictionary<string, object> { { "scene", scenePath }, { "count", sp.count }, { "scale", sp.scale }, { "spacing", spacing },
                                                        { "background", bg }, { "frames", frames } };
            });
        }
    }
}
