// AgentKit v0.2 (Unity Expert Skills, 2026-09-24). The agent's eyes: render cameras and
// bookmark views to PNG, headless or in a live editor. Every PNG must then go through
// ut_review.image_checks and be LOOKED at before a result is called done.
//
// Needs a graphics device: launch with ut_run.run_method(..., graphics=True) (no -nographics).
// With -nographics SystemInfo.graphicsDeviceType is Null and these jobs fail with that reason.
//
// Render path (URP and HDRP): RenderPipeline.SubmitRenderRequest(camera, StandardRequest) into
// an sRGB RenderTexture (the 6.3 URP e-book's documented offscreen capture); fallback
// Camera.Render() (Built-in, or when the pipeline refuses the request). ReadPixels + EncodeToPNG.
// Screen Space - Overlay canvases are not drawn into a camera target: switch them to
// Screen Space - Camera for captures, or capture in a player.
// Warm-up (v0.2): before the first capture after a scene load, one discarded frame (materials
// render flat white otherwise); before EVERY capture, URP 2D lights rebuild their mesh and
// culling sphere (their LateUpdate never ran in a batch job, so Spot, Freeform and Sprite lights
// are culled and only the Global light shows: reported by scenario-unity-2d). Found by reflection, so the
// kit still compiles without URP. Not fixed here: Animator culling (sample with Always Animate),
// metal reflections that Editor captures render black on some URP paths (check in a player).
//
// Jobs (executeMethod targets):
//   AgentKit.AgentCapture.CaptureViews   args: scene, views[{name, position, rotation|look_at, fov,
//                                         ortho_size}], camera, width, height, out_dir,
//                                         scene_bookmarks (bool), all_cameras (bool), msaa,
//                                         warm_2d_lights (bool, default true)
//   AgentKit.AgentCapture.CaptureBlack   deliberately black frame (tests the image checks)
// Helpers for domain code: RenderCamera(cam, w, h, path), CaptureView(template, view, w, h, path),
//   SceneBookmarks(), CaptureSceneView(path, w, h) (live GUI editor only).
// Run in Unity 6000.3.21f1 on 2026-09-24 (URP 17.3, Metal): tests/code/unity-expert/test_live_toolkit.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace AgentKit
{
    public static class AgentCapture
    {
        /// <summary>Name prefix of scene cameras used as saved camera bookmarks (disabled Camera
        /// components on GameObjects named "AgentView_..."), so iterations compare the same views.</summary>
        public const string BookmarkPrefix = "AgentView_";

        static bool s_Warm;
        static string s_WarmScenes;

        /// <summary>Observed 2026-09-24 (6000.3.21f1, URP 17.3, Metal, batch mode): the FIRST frame
        /// rendered in the same editor update as the scene load shows every material flat white (no
        /// base colour); the second frame is correct and identical to the third. RenderCamera renders
        /// one discarded warm-up frame before the first capture of each set of loaded scenes (v0.1 did
        /// it once per domain).</summary>
        public static bool WarmUpDone => s_Warm;

        /// <summary>Warm URP 2D lights before every capture (default true). Set false only to reproduce
        /// the culled-lights symptom.</summary>
        public static bool Warm2DLights = true;

        /// <summary>Number of 2D lights warmed before the last capture (0 without URP 2D lights).</summary>
        public static int LastLights2DWarmed { get; private set; }

        static bool s_L2DLookedUp;
        static Type s_L2DType;
        static MethodInfo s_L2DUpdateMesh, s_L2DUpdateSphere;
        static PropertyInfo s_L2DLightType;

        /// <summary>Observed by scenario-unity-2d (2026-09-24, URP 17.3, batch capture right after OpenScene):
        /// Spot, Freeform and Sprite 2D lights draw nothing and only the Global light shows, because
        /// Light2D rebuilds its mesh and culling sphere in its own LateUpdate, which never ran. Calls
        /// the internal Light2D.UpdateMesh and UpdateBoundingSphere on every enabled non-Global light
        /// (reflection: no compile-time URP dependency). Returns how many lights were warmed; -1 when
        /// Light2D exists but its methods were not found (a warning is added to the job).</summary>
        public static int WarmLights2D()
        {
            if (!s_L2DLookedUp)
            {
                s_L2DLookedUp = true;
                // URP 17 (Unity 6) ships Light2D in Unity.RenderPipelines.Universal.2D.Runtime; older
                // URP in Unity.RenderPipelines.Universal.Runtime: search the loaded assemblies by name.
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    if (!asm.GetName().Name.StartsWith("Unity.RenderPipelines.Universal")) continue;
                    s_L2DType = asm.GetType("UnityEngine.Rendering.Universal.Light2D", false);
                    if (s_L2DType != null) break;
                }
                if (s_L2DType != null)
                {
                    const BindingFlags bf = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
                    foreach (var m in s_L2DType.GetMethods(bf))
                    {
                        var ps = m.GetParameters();
                        if (m.Name == "UpdateMesh" && (ps.Length == 0 || (ps.Length == 1 && ps[0].ParameterType == typeof(bool)))) s_L2DUpdateMesh = m;
                        if (m.Name == "UpdateBoundingSphere" && ps.Length == 0) s_L2DUpdateSphere = m;
                    }
                    s_L2DLightType = s_L2DType.GetProperty("lightType", BindingFlags.Instance | BindingFlags.Public);
                }
            }
            if (s_L2DType == null) return 0;
            var lights = UnityEngine.Object.FindObjectsByType(s_L2DType, FindObjectsSortMode.None);
            if (lights.Length == 0) return 0;
            if (s_L2DUpdateMesh == null || s_L2DUpdateSphere == null)
            {
                AgentJob.Warn("Light2D.UpdateMesh/UpdateBoundingSphere not found: 2D lights may be culled in this capture");
                return -1;
            }
            int n = 0;
            foreach (var o in lights)
            {
                var b = o as Behaviour;
                if (b == null || !b.isActiveAndEnabled) continue;
                if (s_L2DLightType != null && Convert.ToString(s_L2DLightType.GetValue(o)) == "Global") continue;
                s_L2DUpdateMesh.Invoke(o, s_L2DUpdateMesh.GetParameters().Length == 1 ? new object[] { true } : null);
                s_L2DUpdateSphere.Invoke(o, null);
                n++;
            }
            return n;
        }

        static string LoadedScenesKey()
        {
            var key = "";
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var sc = SceneManager.GetSceneAt(i);
                if (sc.isLoaded) key += sc.handle + ",";
            }
            return key;
        }

        public static void RequireGraphics()
        {
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null)
                throw new InvalidOperationException("no graphics device (editor started with -nographics): " +
                                                    "run the job with ut_run.run_method(..., graphics=True)");
        }

        /// <summary>Render one camera to a PNG. Returns the render path used.</summary>
        public static string RenderCamera(Camera cam, int width, int height, string path, int msaa = 1)
        {
            RequireGraphics();
            if (cam == null) throw new ArgumentNullException(nameof(cam));
            LastLights2DWarmed = Warm2DLights ? WarmLights2D() : 0;
            var scenes = LoadedScenesKey();
            if (!s_Warm || scenes != s_WarmScenes)
            {
                s_Warm = true;
                s_WarmScenes = scenes;
                RenderOnce(cam, width, height, msaa, null);
            }
            return RenderOnce(cam, width, height, msaa, path);
        }

        static string RenderOnce(Camera cam, int width, int height, int msaa, string path)
        {
            var desc = new RenderTextureDescriptor(width, height, RenderTextureFormat.ARGB32, 24)
            {
                sRGB = true,
                msaaSamples = Mathf.Max(1, msaa),
            };
            var rt = new RenderTexture(desc) { name = "AgentCaptureRT" };
            rt.Create();
            string method;
            var prevTarget = cam.targetTexture;
            var prevEnabled = cam.enabled;
            try
            {
                var req = new RenderPipeline.StandardRequest { destination = rt };
                if (GraphicsSettings.currentRenderPipeline != null && RenderPipeline.SupportsRenderRequest(cam, req))
                {
                    RenderPipeline.SubmitRenderRequest(cam, req);
                    method = "RenderPipeline.SubmitRenderRequest";
                }
                else
                {
                    cam.targetTexture = rt;
                    cam.Render();
                    method = "Camera.Render";
                }
                var prevActive = RenderTexture.active;
                RenderTexture.active = rt;
                var tex = new Texture2D(width, height, TextureFormat.RGBA32, false, false);
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply();
                RenderTexture.active = prevActive;
                // Opaque output: camera clears can leave alpha 0, which viewers show as transparent.
                var px = tex.GetPixels32();
                for (int i = 0; i < px.Length; i++) px[i].a = 255;
                tex.SetPixels32(px);
                if (path != null)
                {
                    var dir = Path.GetDirectoryName(path);
                    if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                    File.WriteAllBytes(path, tex.EncodeToPNG());
                }
                UnityEngine.Object.DestroyImmediate(tex);
            }
            finally
            {
                cam.targetTexture = prevTarget;
                cam.enabled = prevEnabled;
                rt.Release();
                UnityEngine.Object.DestroyImmediate(rt);
            }
            return method;
        }

        /// <summary>Render a view from a temporary copy of the template camera (keeps its URP data,
        /// post-processing flag, clear flags and culling mask). view keys: position [x,y,z],
        /// rotation [x,y,z] Euler degrees or look_at [x,y,z], fov, ortho_size, near, far.</summary>
        public static Dictionary<string, object> CaptureView(Camera template, Dictionary<string, object> view,
                                                             int width, int height, string path, int msaa = 1)
        {
            RequireGraphics();
            GameObject go;
            if (template != null)
            {
                go = UnityEngine.Object.Instantiate(template.gameObject);
                // keep only what renders: the copy must not run gameplay scripts or audio
                foreach (var mb in go.GetComponents<MonoBehaviour>())
                {
                    var tn = mb.GetType().FullName ?? "";
                    if (!tn.StartsWith("UnityEngine.Rendering")) UnityEngine.Object.DestroyImmediate(mb);
                }
                var al = go.GetComponent<AudioListener>();
                if (al) UnityEngine.Object.DestroyImmediate(al);
            }
            else
            {
                go = new GameObject("AgentCaptureCamera", typeof(Camera));
            }
            go.hideFlags = HideFlags.HideAndDontSave;
            var cam = go.GetComponent<Camera>();
            try
            {
                var t = go.transform;
                if (view.TryGetValue("position", out var p)) t.position = AgentJson.ToVector3(p, t.position);
                if (view.TryGetValue("look_at", out var la) && la != null)
                    t.rotation = Quaternion.LookRotation(AgentJson.ToVector3(la, Vector3.zero) - t.position, Vector3.up);
                else if (view.TryGetValue("rotation", out var r))
                    t.rotation = Quaternion.Euler(AgentJson.ToVector3(r, t.eulerAngles));
                if (view.TryGetValue("fov", out var fov) && fov != null) cam.fieldOfView = (float)AgentJson.ToDouble(fov, 60);
                if (view.TryGetValue("ortho_size", out var os) && os != null) { cam.orthographic = true; cam.orthographicSize = (float)AgentJson.ToDouble(os, 5); }
                if (view.TryGetValue("near", out var n) && n != null) cam.nearClipPlane = (float)AgentJson.ToDouble(n, 0.3);
                if (view.TryGetValue("far", out var f) && f != null) cam.farClipPlane = (float)AgentJson.ToDouble(f, 1000);
                cam.aspect = (float)width / height;
                var method = RenderCamera(cam, width, height, path, msaa);
                return new Dictionary<string, object>
                {
                    { "name", view.TryGetValue("name", out var nm) ? nm : Path.GetFileNameWithoutExtension(path) },
                    { "path", path }, { "width", width }, { "height", height }, { "method", method },
                    { "position", t.position }, { "rotation", t.eulerAngles }, { "fov", cam.fieldOfView },
                    { "orthographic", cam.orthographic },
                };
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        /// <summary>Saved camera bookmarks in the open scenes: Cameras on GameObjects named AgentView_*.</summary>
        public static List<Dictionary<string, object>> SceneBookmarks()
        {
            var res = new List<Dictionary<string, object>>();
            foreach (var cam in Resources.FindObjectsOfTypeAll<Camera>())
            {
                if (EditorUtility.IsPersistent(cam) || !cam.gameObject.scene.IsValid()) continue;
                if (!cam.gameObject.name.StartsWith(BookmarkPrefix)) continue;
                var t = cam.transform;
                res.Add(new Dictionary<string, object>
                {
                    { "name", cam.gameObject.name.Substring(BookmarkPrefix.Length) },
                    { "position", new List<object> { (double)t.position.x, (double)t.position.y, (double)t.position.z } },
                    { "rotation", new List<object> { (double)t.eulerAngles.x, (double)t.eulerAngles.y, (double)t.eulerAngles.z } },
                    { "fov", (double)cam.fieldOfView },
                });
            }
            res.Sort((a, b) => string.CompareOrdinal((string)a["name"], (string)b["name"]));
            return res;
        }

        /// <summary>Create or move a bookmark camera (disabled Camera, so it never renders in game).</summary>
        public static Camera SaveBookmark(string name, Vector3 position, Vector3 lookAt, float fov = 60f)
        {
            var goName = BookmarkPrefix + name;
            var go = GameObject.Find(goName);                   // explicit null check, never ?? on UnityEngine.Object
            if (go == null) go = new GameObject(goName, typeof(Camera));
            var cam = go.GetComponent<Camera>();
            cam.enabled = false;
            cam.fieldOfView = fov;
            go.transform.position = position;
            go.transform.rotation = Quaternion.LookRotation(lookAt - position, Vector3.up);
            EditorSceneManager.MarkSceneDirty(go.scene);
            return cam;
        }

        static Camera FindTemplate(string name)
        {
            if (!string.IsNullOrEmpty(name))
            {
                var go = GameObject.Find(name);
                if (go && go.GetComponent<Camera>()) return go.GetComponent<Camera>();
                throw new ArgumentException("camera GameObject '" + name + "' not found in the open scene");
            }
            if (Camera.main) return Camera.main;
            foreach (var c in UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
                if (c.enabled && !c.gameObject.name.StartsWith(BookmarkPrefix)) return c;
            return null;
        }

        static void OpenSceneArg()
        {
            var scene = AgentJob.Str("scene");
            if (!string.IsNullOrEmpty(scene))
            {
                if (!File.Exists(AgentJob.ResolvePath(scene))) throw new FileNotFoundException("scene not found: " + scene);
                EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
            }
        }

        // ------------------------------------------------------------------ jobs
        public static void CaptureViews()
        {
            AgentJob.Run(() =>
            {
                RequireGraphics();
                OpenSceneArg();
                var prevWarm2D = Warm2DLights;
                Warm2DLights = AgentJob.Bool("warm_2d_lights", true);
                try
                {
                    int w = AgentJob.Int("width", 1280), h = AgentJob.Int("height", 720), msaa = AgentJob.Int("msaa", 4);
                    var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("captures");
                    Directory.CreateDirectory(outDir);
                    var template = FindTemplate(AgentJob.Str("camera"));
                    var views = new List<Dictionary<string, object>>();
                    foreach (var v in AgentJob.List("views"))
                        if (v is Dictionary<string, object> d) views.Add(d);
                    if (AgentJob.Bool("scene_bookmarks", views.Count == 0)) views.AddRange(SceneBookmarks());
                    var shots = new List<object>();
                    int i = 0;
                    foreach (var v in views)
                    {
                        var name = v.TryGetValue("name", out var nm) && nm != null ? nm.ToString() : "view" + i;
                        shots.Add(CaptureView(template, v, w, h, Path.Combine(outDir, Sanitize(name) + ".png"), msaa));
                        i++;
                    }
                    if (AgentJob.Bool("all_cameras") || views.Count == 0)
                    {
                        foreach (var c in UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
                        {
                            if (!c.enabled || c.gameObject.name.StartsWith(BookmarkPrefix)) continue;
                            var path = Path.Combine(outDir, "camera_" + Sanitize(c.gameObject.name) + ".png");
                            shots.Add(new Dictionary<string, object>
                            {
                                { "name", "camera:" + c.gameObject.name }, { "path", path }, { "width", w }, { "height", h },
                                { "method", RenderCamera(c, w, h, path, msaa) },
                            });
                        }
                    }
                    return new Dictionary<string, object>
                    {
                        { "scene", EditorSceneManager.GetActiveScene().path },
                        { "template_camera", template ? template.name : null },
                        { "render_pipeline", GraphicsSettings.currentRenderPipeline ? GraphicsSettings.currentRenderPipeline.name : "Built-in" },
                        { "graphics", SystemInfo.graphicsDeviceType.ToString() },
                        { "out_dir", outDir },
                        { "shots", shots },
                        { "warm_2d_lights", Warm2DLights },
                        { "lights2d_warmed", LastLights2DWarmed },
                    };
                }
                finally { Warm2DLights = prevWarm2D; }
            });
        }

        /// <summary>A deliberately black frame: a camera that culls nothing and clears to black.
        /// ut_review.image_checks must flag it all_black (the negative control of the capture loop).</summary>
        public static void CaptureBlack()
        {
            AgentJob.Run(() =>
            {
                RequireGraphics();
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("captures");
                var go = new GameObject("AgentBlackCamera", typeof(Camera)) { hideFlags = HideFlags.HideAndDontSave };
                try
                {
                    var cam = go.GetComponent<Camera>();
                    cam.clearFlags = CameraClearFlags.SolidColor;
                    cam.backgroundColor = Color.black;
                    cam.cullingMask = 0;
                    go.transform.position = new Vector3(0, -1000, 0);
                    var path = Path.Combine(outDir, AgentJob.Str("name", "black") + ".png");
                    var method = RenderCamera(cam, AgentJob.Int("width", 640), AgentJob.Int("height", 360), path);
                    return new Dictionary<string, object> { { "path", path }, { "method", method } };
                }
                finally
                {
                    UnityEngine.Object.DestroyImmediate(go);
                }
            });
        }

        /// <summary>Live GUI editor only: render the last active Scene view camera.</summary>
        public static string CaptureSceneView(string path, int width = 1280, int height = 720)
        {
            var sv = SceneView.lastActiveSceneView;
            if (sv == null || sv.camera == null)
                throw new InvalidOperationException("no Scene view (batch mode has no editor windows): use CaptureView with a bookmark");
            return RenderCamera(sv.camera, width, height, path);
        }

        public static void CaptureSceneViewJob()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Has("path") ? AgentJob.ResolvePath(AgentJob.Str("path")) : Path.Combine(AgentJob.OutDir("captures"), "sceneview.png");
                return new Dictionary<string, object> { { "path", path }, { "method", CaptureSceneView(path, AgentJob.Int("width", 1280), AgentJob.Int("height", 720)) } };
            });
        }

        static string Sanitize(string s)
        {
            foreach (var c in Path.GetInvalidFileNameChars()) s = s.Replace(c, '_');
            return s.Replace(' ', '_').Replace(':', '_');
        }
    }
}
