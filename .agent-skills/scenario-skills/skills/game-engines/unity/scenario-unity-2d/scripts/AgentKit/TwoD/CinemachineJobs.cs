// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Cinemachine 3 camera for a 2D level, and the capture
// that proves the confiner hides what lies outside the level at 21:9.
// Needs com.unity.cinemachine 3.1.7 (pin it: the 6000.3.21f1 editor defaults to 2.10.7) and the
// runtime assembly AgentKit.TwoD.Cinemachine (Runtime/TwoDCinemachine, compiled only with CM3).
// Called by reflection, so this file compiles in projects without Cinemachine.
//
// Jobs:
//   AgentKit.TwoD.CinemachineJobs.Setup    args: scene, follow ("Player"), bounds [xmin, ymin, xmax, ymax],
//        ortho (5.625), target_offset [x,y,z], damping [x,y,z]
//   AgentKit.TwoD.CinemachineJobs.Capture  args: scene, shots [{name, width, height, confine}], out_dir
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P13).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit.TwoD
{
    public static class CinemachineJobs
    {
        static Type Rig()
        {
            var t = Type.GetType("AgentKit.TwoD.Cinemachine2DRig, AgentKit.TwoD.Cinemachine");
            if (t == null)
                throw new InvalidOperationException("AgentKit.TwoD.Cinemachine is not compiled: add \"com.unity.cinemachine\": \"3.1.7\" to Packages/manifest.json (6000.3.21f1 defaults to 2.10.7) and ut_2d.install the runtime");
            return t;
        }

        static object Call(string method, params object[] args) => Rig().GetMethod(method, BindingFlags.Public | BindingFlags.Static).Invoke(null, args);

        public static void Setup()
        {
            AgentJob.Run(() =>
            {
                var scene = EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var cam = CameraJobs.MainCamera(false) ?? throw new InvalidOperationException("no camera");
                var follow = GameObject.Find(AgentJob.Str("follow", "Player")) ?? throw new InvalidOperationException("follow target not found");
                var b = TwoDUtil.ListOr("bounds", 0, 0, 40, 14).Select(x => (float)AgentJson.ToDouble(x)).ToArray();
                // bounds: box(es) merged into a TRIGGER CompositeCollider2D with Polygons geometry, Static body
                var boundsGo = GameObject.Find("CameraBounds") ?? new GameObject("CameraBounds");
                var rb = TwoDUtil.GetOrAdd<Rigidbody2D>(boundsGo);
                rb.bodyType = RigidbodyType2D.Static;
                var box = TwoDUtil.GetOrAdd<BoxCollider2D>(boundsGo);
                box.size = new Vector2(b[2] - b[0], b[3] - b[1]);
                box.offset = new Vector2((b[0] + b[2]) / 2f, (b[1] + b[3]) / 2f);
                box.compositeOperation = Collider2D.CompositeOperation.Merge;   // Unity 6 name of "Used by Composite"
                var comp = TwoDUtil.GetOrAdd<CompositeCollider2D>(boundsGo);
                comp.geometryType = CompositeCollider2D.GeometryType.Polygons;
                comp.isTrigger = true;
                comp.GenerateGeometry();
                boundsGo.layer = 2;                                                // Ignore Raycast: no gameplay hits
                var r = (Dictionary<string, object>)Call("Build", cam, follow.transform, (Collider2D)comp,
                    AgentJob.Float("ortho", 5.625f),
                    AgentJob.Has("target_offset") ? AgentJson.ToVector3(AgentJob.Args["target_offset"], Vector3.zero) : Vector3.zero,
                    AgentJob.Has("damping") ? AgentJson.ToVector3(AgentJob.Args["damping"], Vector3.one) : new Vector3(0.3f, 0.5f, 0f), true);
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                r["composite_paths"] = comp.pathCount;
                r["cinemachine_version"] = PackageVersion("com.unity.cinemachine");
                return r;
            });
        }

        public static void Capture()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var cam = CameraJobs.MainCamera(false) ?? throw new InvalidOperationException("no camera");
                int warmed = CameraJobs.WarmLights2D();
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("cinemachine");
                Directory.CreateDirectory(outDir);
                var vcamGo = GameObject.Find("CM Room Camera") ?? throw new InvalidOperationException("run CinemachineJobs.Setup first");
                var confiner = vcamGo.GetComponents<Behaviour>().FirstOrDefault(c => c.GetType().Name == "CinemachineConfiner2D");
                var shots = new List<object>();
                foreach (Dictionary<string, object> s in AgentJob.List("shots"))
                {
                    int w = (int)AgentJson.ToDouble(s["width"]), h = (int)AgentJson.ToDouble(s["height"]);
                    bool confine = !s.TryGetValue("confine", out var cf) || (cf is bool cb && cb);
                    if (confiner != null) confiner.enabled = confine;
                    var name = s.TryGetValue("name", out var n) ? (string)n : w + "x" + h;
                    var path = Path.Combine(outDir, name + ".png");
                    var rt = new RenderTexture(w, h, 24);
                    cam.targetTexture = rt;                               // the Brain reads the output aspect from it
                    // Observed: PixelPerfectCamera computes zoom and ortho size only while rendering, so the
                    // Cinemachine Pixel Perfect extension first sees the previous (Screen-sized) values
                    // (ortho 7.5 instead of 5.625). Render once at the target size, then tick the Brain.
                    AgentCapture.RenderCamera(cam, w, h, Path.Combine(outDir, name + "_warmup.png"));
                    var settle = (Dictionary<string, object>)Call("Settle", cam, 240, 0.02f);
                    AgentCapture.RenderCamera(cam, w, h, path);
                    cam.targetTexture = null;
                    rt.Release();
                    settle["name"] = name; settle["path"] = path; settle["confine"] = confine; settle["width"] = w; settle["height"] = h;
                    shots.Add(settle);
                }
                return new Dictionary<string, object> { { "shots", shots }, { "out_dir", outDir }, { "lights_warmed", warmed } };
            });
        }

        static string PackageVersion(string name)
        {
            var lockPath = Path.Combine(AgentJob.ProjectRoot, "Packages", "packages-lock.json");
            if (!File.Exists(lockPath)) return null;
            var lk = AgentJson.ParseObject(File.ReadAllText(lockPath));
            if (lk.TryGetValue("dependencies", out var d) && d is Dictionary<string, object> deps && deps.TryGetValue(name, out var e) && e is Dictionary<string, object> ed)
                return ed.TryGetValue("version", out var v) ? v?.ToString() : null;
            return null;
        }
    }
}
