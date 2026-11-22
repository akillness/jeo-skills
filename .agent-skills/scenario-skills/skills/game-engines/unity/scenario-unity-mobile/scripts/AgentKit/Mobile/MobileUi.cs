// scenario-unity-mobile v0.1 (Unity Expert Skills, 2026-09-24). Safe-area captures at several notch layouts
// (no Device Simulator: it is a GUI window) and the touch HUD builder (on-screen controls).
//
// Jobs:
//   CaptureSafeArea  (graphics=True) args: layouts [{name, screen [w,h], safe [x,y,w,h], cutouts [[x,y,w,h]]}],
//                    scale (divide pixels, default 3), out_dir. For each layout renders two PNGs: HUD anchored
//                    to the canvas ("naive") and HUD under a SafeAreaFitter panel ("fitted"), with unsafe
//                    margins in red and cutouts in orange; returns per-element clear/blocked verdicts.
//   BuildTouchHud    args: prefab ("Assets/AgentMobile/TouchHUD.prefab"), stick_path ("<Gamepad>/leftStick"),
//                    button_path ("<Gamepad>/buttonSouth"), movement_range (50, a RADIUS in canvas units in
//                    Input System 1.20 source), physical (true: CanvasScaler Constant Physical Size).
// Expert basis: one safe-area panel parenting the HUD (Chema Damak, PLQ4ywB13eg [00:11:27]);
// thumb controls at Constant Physical Size (Input System team, ptvjumIHxYg [00:20:29]); on-screen
// controls emit a virtual Gamepad so gameplay stays device-agnostic (ptvjumIHxYg [00:22:13]).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_safearea.py, test_live_touch.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.OnScreen;
using UnityEngine.UI;

namespace AgentKit.Mobile
{
    public static class MobileUi
    {
        static Rect R(object o)
        {
            var l = (List<object>)o;
            return new Rect((float)AgentJson.ToDouble(l[0]), (float)AgentJson.ToDouble(l[1]), (float)AgentJson.ToDouble(l[2]), (float)AgentJson.ToDouble(l[3]));
        }

        static RectTransform Box(Transform parent, string name, Color c, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = pivot;
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            go.GetComponent<Image>().color = c;
            go.GetComponent<Image>().raycastTarget = false;
            return rt;
        }

        static RectTransform Stretch(Transform parent, string name, Color? c)
        {
            var go = c.HasValue ? new GameObject(name, typeof(RectTransform), typeof(Image)) : new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = rt.offsetMax = Vector2.zero;
            if (c.HasValue) { go.GetComponent<Image>().color = c.Value; go.GetComponent<Image>().raycastTarget = false; }
            return rt;
        }

        static Rect WorldRect(RectTransform rt)
        {
            var c = new Vector3[4];
            rt.GetWorldCorners(c);
            return Rect.MinMaxRect(c[0].x, c[0].y, c[2].x, c[2].y);
        }

        // ------------------------------------------------------------------ CaptureSafeArea
        public static void CaptureSafeArea()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                int scale = Math.Max(1, AgentJob.Int("scale", 3));
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("safearea");
                Directory.CreateDirectory(outDir);
                var results = new List<object>();
                var images = new List<string>();
                foreach (var lo in AgentJob.List("layouts").Cast<Dictionary<string, object>>())
                {
                    var name = lo["name"].ToString();
                    var sc = (List<object>)lo["screen"];
                    var screen = new Vector2((float)AgentJson.ToDouble(sc[0]), (float)AgentJson.ToDouble(sc[1]));
                    var safe = R(lo["safe"]);
                    var cutouts = lo.TryGetValue("cutouts", out var co) && co is List<object> cl ? cl.Select(R).ToArray() : new Rect[0];
                    foreach (var fitted in new[] { false, true })
                    {
                        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                        var camGo = new GameObject("AgentView_SafeArea");
                        var cam = camGo.AddComponent<Camera>();
                        cam.orthographic = true;
                        cam.orthographicSize = screen.y / 2f;
                        cam.transform.position = new Vector3(screen.x / 2f, screen.y / 2f, -100f);
                        cam.clearFlags = CameraClearFlags.SolidColor;
                        cam.backgroundColor = new Color(0.16f, 0.17f, 0.2f);
                        cam.nearClipPlane = 0.1f; cam.farClipPlane = 1000f;

                        var canvasGo = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas));
                        var canvas = canvasGo.GetComponent<Canvas>();
                        canvas.renderMode = RenderMode.WorldSpace;
                        canvas.worldCamera = cam;
                        var crt = (RectTransform)canvasGo.transform;
                        crt.pivot = Vector2.zero; crt.position = Vector3.zero; crt.sizeDelta = screen; crt.localScale = Vector3.one;

                        // unsafe margins (red) and cutouts (orange), drawn on the canvas
                        var ins = SafeAreaMath.Insets(safe, screen);
                        var red = new Color(0.85f, 0.15f, 0.12f, 1f);
                        if (ins.x > 0) Box(crt, "Unsafe_L", red, new Vector2(0, 0.5f), new Vector2(0, 0.5f), Vector2.zero, new Vector2(ins.x, screen.y));
                        if (ins.y > 0) Box(crt, "Unsafe_R", red, new Vector2(1, 0.5f), new Vector2(1, 0.5f), Vector2.zero, new Vector2(ins.y, screen.y));
                        if (ins.z > 0) Box(crt, "Unsafe_T", red, new Vector2(0.5f, 1), new Vector2(0.5f, 1), Vector2.zero, new Vector2(screen.x, ins.z));
                        if (ins.w > 0) Box(crt, "Unsafe_B", red, new Vector2(0.5f, 0), new Vector2(0.5f, 0), Vector2.zero, new Vector2(screen.x, ins.w));
                        foreach (var c in cutouts)
                            Box(crt, "Cutout", new Color(1f, 0.55f, 0.05f), Vector2.zero, Vector2.zero, c.position, c.size);

                        RectTransform hudRoot = crt;
                        if (fitted)
                        {
                            hudRoot = Stretch(crt, "SafeArea", new Color(0.2f, 0.75f, 0.35f, 0.18f));
                            hudRoot.gameObject.AddComponent<SafeAreaFitter>().Simulate(safe, screen);
                        }
                        float m = 24f, u = Mathf.Min(screen.x, screen.y) / 1080f;
                        var white = new Color(0.95f, 0.95f, 0.95f);
                        var hud = new Dictionary<string, RectTransform>
                        {
                            { "score_top_left", Box(hudRoot, "Score", white, new Vector2(0, 1), new Vector2(0, 1), new Vector2(m, -m), new Vector2(360, 110) * u) },
                            { "pause_top_right", Box(hudRoot, "Pause", new Color(0.3f, 0.6f, 1f), new Vector2(1, 1), new Vector2(1, 1), new Vector2(-m, -m), new Vector2(120, 120) * u) },
                            { "stick_bottom_left", Box(hudRoot, "Stick", new Color(0.3f, 0.6f, 1f), Vector2.zero, Vector2.zero, new Vector2(m, m), new Vector2(300, 300) * u) },
                            { "action_bottom_right", Box(hudRoot, "Action", white, new Vector2(1, 0), new Vector2(1, 0), new Vector2(-m, m), new Vector2(200, 200) * u) },
                        };
                        Canvas.ForceUpdateCanvases();
                        var verdicts = new Dictionary<string, object>();
                        int blocked = 0;
                        foreach (var kv in hud)
                        {
                            var wr = WorldRect(kv.Value);
                            bool clear = SafeAreaMath.IsClear(wr, safe, cutouts);
                            if (!clear) blocked++;
                            verdicts[kv.Key] = new Dictionary<string, object> { { "clear", clear }, { "rect", new[] { wr.x, wr.y, wr.width, wr.height } } };
                        }
                        var png = Path.Combine(outDir, name + (fitted ? "_fitted" : "_naive") + ".png");
                        var method = AgentCapture.RenderCamera(cam, Mathf.RoundToInt(screen.x / scale), Mathf.RoundToInt(screen.y / scale), png);
                        images.Add(png);
                        results.Add(new Dictionary<string, object>
                        {
                            { "layout", name }, { "fitted", fitted }, { "png", png }, { "blocked", blocked }, { "elements", verdicts },
                            { "insets_lrtb", new[] { ins.x, ins.y, ins.z, ins.w } }, { "render", method },
                            { "applied_anchors", fitted ? new[] { hudRoot.anchorMin, hudRoot.anchorMax } : null },
                        });
                    }
                }
                return new Dictionary<string, object> { { "captures", results }, { "images", images } };
            });
        }

        // ------------------------------------------------------------------ BuildTouchHud
        public static void BuildTouchHud()
        {
            AgentJob.Run(() =>
            {
                var prefabPath = AgentJob.Str("prefab", "Assets/AgentMobile/TouchHUD.prefab");
                var stickPath = AgentJob.Str("stick_path", "<Gamepad>/leftStick");
                var buttonPath = AgentJob.Str("button_path", "<Gamepad>/buttonSouth");
                float range = AgentJob.Float("movement_range", 50f);
                Directory.CreateDirectory(Path.GetDirectoryName(prefabPath));

                var root = new GameObject("TouchHUD", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
                var canvas = root.GetComponent<Canvas>();
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                var scaler = root.GetComponent<CanvasScaler>();
                if (AgentJob.Bool("physical", true))
                {
                    scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPhysicalSize;
                    scaler.physicalUnit = CanvasScaler.Unit.Millimeters;
                    scaler.fallbackScreenDPI = 160f;   // used when Screen.dpi is 0 (Editor, some devices)
                    scaler.defaultSpriteDPI = 160f;
                }
                var safe = Stretch(root.transform, "SafeArea", null);
                safe.gameObject.AddComponent<SafeAreaFitter>();
                // sizes in millimetres under Constant Physical Size: a 20 mm stick, 12 mm button [added: tune on a real phone]
                float mm = AgentJob.Bool("physical", true) ? 1f : 8f;
                var stick = Box(safe, "Stick", new Color(1, 1, 1, 0.35f), Vector2.zero, new Vector2(0.5f, 0.5f), new Vector2(18, 18) * mm, new Vector2(20, 20) * mm);
                stick.GetComponent<Image>().raycastTarget = true;
                var os = stick.gameObject.AddComponent<OnScreenStick>();
                os.controlPath = stickPath;
                os.movementRange = range;
                os.behaviour = OnScreenStick.Behaviour.ExactPositionWithDynamicOrigin;
                var btn = Box(safe, "ActionButton", new Color(1, 1, 1, 0.5f), new Vector2(1, 0), new Vector2(0.5f, 0.5f), new Vector2(-16, 16) * mm, new Vector2(12, 12) * mm);
                btn.GetComponent<Image>().raycastTarget = true;
                btn.gameObject.AddComponent<OnScreenButton>().controlPath = buttonPath;

                var prefab = PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
                UnityEngine.Object.DestroyImmediate(root);

                // are the control paths bound by the project-wide actions?
                var bound = new Dictionary<string, object>();
                var actions = InputSystem.actions;
                foreach (var path in new[] { stickPath, buttonPath })
                {
                    var hits = new List<string>();
                    if (actions != null)
                        foreach (var map in actions.actionMaps)
                            foreach (var b in map.bindings)
                                if (!b.isComposite && string.Equals(b.effectivePath, path, StringComparison.OrdinalIgnoreCase))
                                    hits.Add(map.name + "/" + b.action);
                    bound[path] = hits;
                }
                var loaded = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
                var s = loaded.GetComponentInChildren<OnScreenStick>();
                return new Dictionary<string, object>
                {
                    { "prefab", prefabPath }, { "saved", prefab != null }, { "project_wide_actions", actions != null ? AssetDatabase.GetAssetPath(actions) : null },
                    { "bindings", bound }, { "stick", new Dictionary<string, object> { { "control_path", s.controlPath }, { "movement_range", s.movementRange }, { "behaviour", s.behaviour.ToString() } } },
                    { "scaler", loaded.GetComponent<CanvasScaler>().uiScaleMode.ToString() },
                };
            });
        }
    }
}
