// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Pixel Perfect Camera in URP and captures that
// prove it.
//
// Rules (6.3 Manual, URP Pixel Perfect Camera; Unity 2qeNu2QApAM): use the URP component
// (UnityEngine.Rendering.Universal.PixelPerfectCamera, ships with URP 17.3); NEVER install the
// com.unity.2d.pixel-perfect package in URP (Built-in only). Assets PPU = sprite PPU; Reference
// Resolution = the art resolution (320 x 180 scales by integers to 720p, 1080p, 1440p, 4K).
// Grid Snapping: Pixel Snapping aligns SPRITE positions only (lights, bloom, particles stay at
// screen resolution, rotation stays smooth); Upscale Render Texture renders the whole frame at the
// reference resolution and point-upscales it (upright square pixels, pixelated lights and particles).
// URP 17.3 source [obs]: the final blit uses Point; Filter Mode (Retro AA vs Point) only matters for
// the Stretch Fill upscale pass; the camera reads Screen size, or its targetTexture size when set.
//
// Jobs:
//   AgentKit.TwoD.CameraJobs.SetupPixelPerfect  args: scene, ppu (16), ref [320,180], grid_snapping
//        ("UpscaleRenderTexture"|"PixelSnapping"|"None"), crop ("None"...), filter ("Point"|"RetroAA"),
//        position [x,y], background [r,g,b]
//   AgentKit.TwoD.CameraJobs.CapturePixelPerfect args: scene, shots [{name, width, height, grid_snapping,
//        crop, filter, position, ppc (false = component disabled), ortho (with ppc false)}], out_dir
//        (renders the scene's Main Camera; settings restored, scene not saved). A camera PAN is a list of
//        shots whose positions step by a sub-pixel amount (ut_2d.pan_shots); ut_2d.shimmer_check scores it.
// Motion [obs, URP 17.3 PixelPerfectCamera.PixelSnap]: with the component on, the camera position is rounded
// to its units-per-pixel before every render, so a pan moves the frame by whole pixels; Retro AA vs Point
// only changes the non-integer Stretch Fill upscale (Manual: Retro AA "prevents sprites shimmering when they
// move, but can make pixels look blurry"): the shimmer test measures that trade-off.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P6).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace AgentKit.TwoD
{
    public static class CameraJobs
    {
        public static void SetupPixelPerfect()
        {
            AgentJob.Run(() =>
            {
                var manifest = File.ReadAllText(Path.Combine(AgentJob.ProjectRoot, "Packages", "manifest.json"));
                if (manifest.Contains("\"com.unity.2d.pixel-perfect\""))
                    throw new InvalidOperationException("com.unity.2d.pixel-perfect is in the manifest: it is the Built-in RP component; remove it and use URP's PixelPerfectCamera");
                var scene = EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var cam = MainCamera(true);
                cam.orthographic = true;                                   // the component needs an orthographic camera
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = TwoDUtil.ToColor(AgentJob.Has("background") ? AgentJob.Args["background"] : null, new Color(0.08f, 0.07f, 0.12f));
                var pos = TwoDUtil.ToVector2(AgentJob.Has("position") ? AgentJob.Args["position"] : null, (Vector2)cam.transform.position);
                cam.transform.position = new Vector3(pos.x, pos.y, -10f);
                var ppc = TwoDUtil.GetOrAdd<PixelPerfectCamera>(cam.gameObject);
                ppc.assetsPPU = AgentJob.Int("ppu", 16);
                var rr = TwoDUtil.ToVector2(AgentJob.Has("ref") ? AgentJob.Args["ref"] : null, new Vector2(320, 180));
                ppc.refResolutionX = (int)rr.x;
                ppc.refResolutionY = (int)rr.y;
                Apply(ppc, AgentJob.Str("grid_snapping", "UpscaleRenderTexture"), AgentJob.Str("crop", "None"), AgentJob.Str("filter", "Point"));
                cam.orthographicSize = rr.y / (2f * ppc.assetsPPU);        // what the component will compute at an exact multiple
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                return new Dictionary<string, object>
                {
                    { "camera", cam.name }, { "component", typeof(PixelPerfectCamera).FullName }, { "assets_ppu", ppc.assetsPPU },
                    { "ref", new[] { ppc.refResolutionX, ppc.refResolutionY } }, { "grid_snapping", ppc.gridSnapping.ToString() },
                    { "crop", ppc.cropFrame.ToString() }, { "filter", Filter(ppc) }, { "ortho_size", cam.orthographicSize },
                    { "view_units", new[] { rr.x / ppc.assetsPPU, rr.y / ppc.assetsPPU } },
                    { "builtin_package_in_manifest", false }, { "position", cam.transform.position },
                };
            });
        }

        public static void CapturePixelPerfect()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var cam = MainCamera(false) ?? throw new InvalidOperationException("no Main Camera");
                var ppc = cam.GetComponent<PixelPerfectCamera>() ?? throw new InvalidOperationException("no PixelPerfectCamera on " + cam.name);
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("pixel_perfect");
                Directory.CreateDirectory(outDir);
                int warmed = WarmLights2D();
                var keep = (ppc.gridSnapping, ppc.cropFrame, Filter(ppc), cam.transform.position);
                float keepOrtho = cam.orthographicSize;
                var shots = new List<object>();
                try
                {
                    foreach (Dictionary<string, object> s in AgentJob.List("shots"))
                    {
                        int w = (int)AgentJson.ToDouble(s["width"]), h = (int)AgentJson.ToDouble(s["height"]);
                        Apply(ppc, s.TryGetValue("grid_snapping", out var gs) ? (string)gs : keep.Item1.ToString(),
                            s.TryGetValue("crop", out var cr) ? (string)cr : keep.Item2.ToString(),
                            s.TryGetValue("filter", out var fm) ? (string)fm : keep.Item3);
                        bool ppcOn = !s.TryGetValue("ppc", out var pe) || !(pe is bool pb) || pb;
                        ppc.enabled = ppcOn;
                        if (!ppcOn) cam.orthographicSize = s.TryGetValue("ortho", out var ov) ? (float)AgentJson.ToDouble(ov) : keepOrtho;
                        if (s.TryGetValue("position", out var pv))
                        {
                            var p2 = TwoDUtil.ToVector2(pv, (Vector2)cam.transform.position);
                            cam.transform.position = new Vector3(p2.x, p2.y, cam.transform.position.z);
                        }
                        var name = s.TryGetValue("name", out var n) ? (string)n : w + "x" + h;
                        var path = Path.Combine(outDir, name + ".png");
                        var method = AgentCapture.RenderCamera(cam, w, h, path);
                        shots.Add(new Dictionary<string, object>
                        {
                            { "name", name }, { "path", path }, { "width", w }, { "height", h }, { "method", method },
                            { "grid_snapping", ppc.gridSnapping.ToString() }, { "crop", ppc.cropFrame.ToString() }, { "filter", Filter(ppc) },
                            { "pixel_ratio", ppcOn ? ppc.pixelRatio : 0 }, { "ppc", ppcOn }, { "ortho_size", cam.orthographicSize }, { "requires_upscale_pass", ppcOn && ppc.requiresUpscalePass },
                            { "camera_position", cam.transform.position },
                        });
                        cam.transform.position = keep.Item4;
                    }
                }
                finally
                {
                    ppc.enabled = true;
                    Apply(ppc, keep.Item1.ToString(), keep.Item2.ToString(), keep.Item3);
                    cam.transform.position = keep.Item4;
                    cam.orthographicSize = keepOrtho;
                }
                return new Dictionary<string, object> { { "shots", shots }, { "out_dir", outDir }, { "lights_warmed", warmed } };
            });
        }

        /// <summary>Observed 2026-09-24 (URP 17.3, batch capture right after OpenScene): Spot, Freeform and
        /// Sprite 2D lights draw NOTHING, only the Global light shows. Light2D rebuilds its mesh and its
        /// culling sphere in its own LateUpdate, which never ran, so the light is culled. Warm every light
        /// before rendering (the methods are internal: reflection). Play mode needs no warm-up.</summary>
        public static int WarmLights2D()
        {
            int n = 0;
            var t = typeof(Light2D);
            var upd = t.GetMethod("UpdateMesh", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
            var sph = t.GetMethod("UpdateBoundingSphere", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
            foreach (var l in UnityEngine.Object.FindObjectsByType<Light2D>(FindObjectsSortMode.None))
            {
                if (l.lightType == Light2D.LightType.Global) continue;
                upd?.Invoke(l, new object[] { true });
                sph?.Invoke(l, null);
                n++;
            }
            if (upd == null || sph == null) AgentJob.Warn("Light2D.UpdateMesh/UpdateBoundingSphere not found: 2D lights may be culled in this capture");
            return n;
        }

        public static Camera MainCamera(bool create)
        {
            var cam = Camera.main;
            if (cam == null) cam = UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsSortMode.None).FirstOrDefault(c => !c.name.StartsWith(AgentCapture.BookmarkPrefix));
            if (cam == null && create)
            {
                var go = new GameObject("Main Camera") { tag = "MainCamera" };
                cam = go.AddComponent<Camera>();
                go.AddComponent<UniversalAdditionalCameraData>();
            }
            return cam;
        }

        static void Apply(PixelPerfectCamera ppc, string grid, string crop, string filter)
        {
            ppc.gridSnapping = (PixelPerfectCamera.GridSnapping)Enum.Parse(typeof(PixelPerfectCamera.GridSnapping), grid);
            ppc.cropFrame = (PixelPerfectCamera.CropFrame)Enum.Parse(typeof(PixelPerfectCamera.CropFrame), crop);
            var so = new SerializedObject(ppc);          // filter mode has no public setter in URP 17.3
            so.FindProperty("m_FilterMode").intValue = filter == "RetroAA" ? 0 : 1;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static string Filter(PixelPerfectCamera ppc)
        {
            var so = new SerializedObject(ppc);
            return so.FindProperty("m_FilterMode").intValue == 0 ? "RetroAA" : "Point";
        }
    }
}
