// scenario-unity-ui AgentKit (Unity Expert Skills v0.1, 2026-09-24). The agent's eyes for UI: captures at any
// device size plus a LAYOUT ASSERTION on the same frame (inside the screen, no clipped or
// overflowing text, no overlapping controls, touch targets), headless (graphics=True, no -nographics).
//
// Why a special path: a Screen Space - Overlay canvas is drawn after all cameras, straight to the
// screen, so a camera rendered into a RenderTexture never contains it (Christina Creates Games,
// 1OwQflHq5kg [00:09:21]; observed 2026-09-24: 0 UI pixels). Batch Play mode has no Game view either.
//   uGUI  -> CaptureUGUI (sync, edit mode): every root Overlay canvas is switched, for the capture only
//            and without saving the scene, to Screen Space - Camera on a hidden orthographic camera
//            whose targetTexture has the device size. The Canvas Scaler then scales for that size
//            (Canvas.renderingDisplaySize = camera pixel size), exactly as it would for a screen of
//            that size; the job records the scale factor and the one the CanvasScaler formula predicts.
//   UI Toolkit -> CaptureUITK (async, edit mode): the UIDocument's PanelSettings is CLONED (never the
//            asset: changes to a PanelSettings asset in Play mode persist) and given targetTexture =
//            RenderTexture(device size); the panel renders into it after a few editor updates.
// Args CaptureUGUI: scene, shots [{name, width, height, screen, handheld, min_target_px}], out_dir,
//   background ("#2f3640"), probes ["Background", ...] (pixel colour at an element's centre)
// Args CaptureUITK: scene, shots [{name, width, height}], out_dir, background, ticks (8),
//   model {health, max_health, ammo, reserve} (a HudModel set as the root data source; binding proof),
//   backdrop_scene (a level opened additively; its main camera is rendered at the shot size and the
//   HUD composited over it, to judge readability over real gameplay pixels)
// Observed 2026-09-24: PanelSettings.colorClearValue is read as a LINEAR colour in a Linear project
// (#4b5563 came out as #939ba7): convert with Color.linear.
// Result: shots[{name, png, width, height, scale_factor, expected_scale, reference_size, checked,
//   out_of_bounds[], text_overflow[], overlaps[], small_targets[], word_breaks[], clipped_by_scroll, ok}],
//   all_ok. word_breaks = a TMP line that ends inside a word (seen by eye on the 1170 x 2532 capture,
//   "Resolutio/n", before this check existed).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using AgentUI;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;
using Image = UnityEngine.UI.Image;

namespace AgentKit.UI
{
    public static class UICapture
    {
        const float Tol = 2f;

        // ================================================================== uGUI
        public static void CaptureUGUI()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var scenePath = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scenePath)) EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("ui_captures");
                Directory.CreateDirectory(outDir);
                var bg = UiTheme.Hex(AgentJob.Str("background", "#2f3640"));
                var probes = (AgentJob.List("probes") ?? new List<object>()).Select(o => o.ToString()).ToList();

                var camGo = new GameObject("AgentUICaptureCam") { hideFlags = HideFlags.HideAndDontSave };
                var cam = camGo.AddComponent<Camera>();
                cam.orthographic = true; cam.nearClipPlane = 0.1f; cam.farClipPlane = 100f;
                cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = bg;
                cam.cullingMask = ~0;
                cam.enabled = false;

                var roots = UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsInactive.Exclude, FindObjectsSortMode.None)
                    .Where(c => c.isRootCanvas && c.renderMode != RenderMode.WorldSpace).ToList();
                if (roots.Count == 0) throw new InvalidOperationException("no screen-space root canvas in the scene");
                var modes = new List<string>();
                foreach (var c in roots)
                {
                    modes.Add(c.name + ":" + c.renderMode);
                    c.renderMode = RenderMode.ScreenSpaceCamera; // capture only; the scene is never saved
                    c.worldCamera = cam;
                    c.planeDistance = 1f;
                }

                var shots = new List<object>();
                bool allOk = true;
                foreach (var o in AgentJob.List("shots"))
                {
                    var s = (Dictionary<string, object>)o;
                    var shot = ShotUGUI(cam, roots, s, outDir, probes);
                    allOk &= (bool)shot["ok"];
                    shots.Add(shot);
                }
                UnityEngine.Object.DestroyImmediate(camGo);
                return new Dictionary<string, object>
                {
                    { "all_ok", allOk }, { "shots", shots }, { "original_modes", modes },
                    { "capture_path", "Overlay -> Screen Space Camera on a hidden camera with targetTexture (scene not saved)" },
                };
            });
        }

        static Dictionary<string, object> ShotUGUI(Camera cam, List<Canvas> roots, Dictionary<string, object> s, string outDir, List<string> probes)
        {
            string name = s.TryGetValue("name", out var n) ? n.ToString() : "shot";
            int w = (int)AgentJson.ToDouble(s["width"]), h = (int)AgentJson.ToDouble(s["height"]);
            bool handheld = s.TryGetValue("handheld", out var hh) && hh is bool hb && hb;
            float minTarget = s.TryGetValue("min_target_px", out var mt) ? (float)AgentJson.ToDouble(mt) : 0f;
            string screen = s.TryGetValue("screen", out var sc) ? sc as string : null;

            foreach (var d in UnityEngine.Object.FindObjectsByType<CanvasDeviceScale>(FindObjectsSortMode.None)) d.ForceHandheld = handheld;
            if (!string.IsNullOrEmpty(screen))
                foreach (var m in UnityEngine.Object.FindObjectsByType<MenuScreen>(FindObjectsSortMode.None))
                    m.Show(m.name == screen || m.name == "Screen - " + screen);

            var rt = new RenderTexture(new RenderTextureDescriptor(w, h, RenderTextureFormat.ARGB32, 24) { sRGB = true });
            rt.Create();
            cam.targetTexture = rt;
            // settle: render (runs Canvas.preWillRenderCanvases -> CanvasScaler.Handle for the new size),
            // then layout, then the on-demand ClampedWidth, then layout again. The first render also
            // absorbs the white first frame (scenario-unity-expert trap O1).
            for (int i = 0; i < 3; i++)
            {
                cam.Render();
                Canvas.ForceUpdateCanvases();
                foreach (var cw in UnityEngine.Object.FindObjectsByType<ClampedWidth>(FindObjectsSortMode.None)) cw.Apply();
                foreach (var c in roots) LayoutRebuilder.ForceRebuildLayoutImmediate((RectTransform)c.transform);
                Canvas.ForceUpdateCanvases();
            }
            cam.Render();
            var png = Path.Combine(outDir, name + ".png");
            var tex = ReadBack(rt);
            File.WriteAllBytes(png, tex.EncodeToPNG());

            var report = LayoutUGUI(cam, roots, w, h, minTarget);
            report["name"] = name; report["png"] = png; report["width"] = w; report["height"] = h;
            report["handheld"] = handheld; report["screen"] = screen;
            var root0 = roots[0];
            var scaler = root0.GetComponent<CanvasScaler>();
            report["scale_factor"] = Math.Round(root0.scaleFactor, 4);
            report["reference_size"] = ((RectTransform)root0.transform).rect.size;
            if (scaler != null && scaler.uiScaleMode == CanvasScaler.ScaleMode.ScaleWithScreenSize)
            {
                report["reference_resolution"] = scaler.referenceResolution;
                report["match"] = scaler.matchWidthOrHeight;
                report["expected_scale"] = Math.Round(ExpectedScale(w, h, scaler.referenceResolution, scaler.matchWidthOrHeight), 4);
            }
            var probeOut = new Dictionary<string, object>();
            foreach (var p in probes)
            {
                // "Name" samples the centre of the element's rect, "Name@u,v" a normalized point (0,0 = top-left)
                string nm = p; float u = 0.5f, v = 0.5f;
                int at = p.IndexOf('@');
                if (at > 0)
                {
                    nm = p.Substring(0, at);
                    var uv = p.Substring(at + 1).Split(',');
                    u = float.Parse(uv[0], System.Globalization.CultureInfo.InvariantCulture);
                    v = float.Parse(uv[1], System.Globalization.CultureInfo.InvariantCulture);
                }
                var go = GameObject.Find(nm);
                if (go == null || !(go.transform is RectTransform prt)) { probeOut[p] = null; continue; }
                var r = ScreenRect(cam, prt, h);
                int px = Mathf.Clamp((int)(r.xMin + u * r.width), 0, w - 1), py = Mathf.Clamp(h - 1 - (int)(r.yMin + v * r.height), 0, h - 1);
                probeOut[p] = "#" + ColorUtility.ToHtmlStringRGB(tex.GetPixel(px, py));
            }
            report["probes"] = probeOut;
            UnityEngine.Object.DestroyImmediate(tex);
            cam.targetTexture = null;
            rt.Release();
            UnityEngine.Object.DestroyImmediate(rt);
            return report;
        }

        /// <summary>CanvasScaler Scale With Screen Size, Match Width Or Height: the blend is done in log
        /// space (CanvasScaler.HandleScaleWithScreenSize, uGUI 2.0 source), so Match 0.5 gives exactly 1.0
        /// for a reference whose aspect is swapped.</summary>
        public static double ExpectedScale(int w, int h, Vector2 reference, float match)
        {
            double lw = Math.Log(w / reference.x, 2), lh = Math.Log(h / reference.y, 2);
            return Math.Pow(2, lw + (lh - lw) * match);
        }

        public static Rect ScreenRect(Camera cam, RectTransform rt, int screenH)
        {
            var c = new Vector3[4];
            rt.GetWorldCorners(c);
            float x0 = float.MaxValue, y0 = float.MaxValue, x1 = float.MinValue, y1 = float.MinValue;
            for (int i = 0; i < 4; i++)
            {
                var p = cam.WorldToScreenPoint(c[i]);
                x0 = Mathf.Min(x0, p.x); x1 = Mathf.Max(x1, p.x); y0 = Mathf.Min(y0, p.y); y1 = Mathf.Max(y1, p.y);
            }
            // top-left origin, like the PNG
            return Rect.MinMaxRect(x0, screenH - y1, x1, screenH - y0);
        }

        static bool Visible(Transform t)
        {
            if (!t.gameObject.activeInHierarchy) return false;
            for (var p = t; p != null; p = p.parent)
            {
                var c = p.GetComponent<Canvas>();
                if (c != null && !c.enabled) return false;
                var g = p.GetComponent<CanvasGroup>();
                if (g != null && g.alpha <= 0.001f) return false;
            }
            return true;
        }

        static RectTransform ClipParent(Transform t)
        {
            for (var p = t.parent; p != null; p = p.parent)
                if (p.GetComponent<RectMask2D>() != null || p.GetComponent<Mask>() != null) return (RectTransform)p;
            return null;
        }

        static string PathOf(Transform t)
        {
            var parts = new List<string>();
            for (var p = t; p != null; p = p.parent) parts.Insert(0, p.name);
            return string.Join("/", parts);
        }

        public static Dictionary<string, object> LayoutUGUI(Camera cam, List<Canvas> roots, int w, int h, float minTarget)
        {
            var screenRect = new Rect(0, 0, w, h);
            var oob = new List<object>(); var overflow = new List<object>(); var overlaps = new List<object>(); var small = new List<object>();
            var wordBreaks = new List<object>();
            int checkedN = 0, clipped = 0;
            var interactive = new List<(string, Rect)>();
            var texts = new List<(Transform, Rect)>();
            foreach (var root in roots)
            {
                foreach (var rt in root.GetComponentsInChildren<RectTransform>(false))
                {
                    var graphic = rt.GetComponent<Graphic>();
                    var sel = rt.GetComponent<Selectable>();
                    if ((graphic == null || !graphic.enabled) && sel == null) continue;
                    if (!Visible(rt)) continue;
                    checkedN++;
                    var r = ScreenRect(cam, rt, h);
                    var clip = ClipParent(rt);
                    if (clip != null)
                    {
                        var cr = ScreenRect(cam, clip, h);
                        if (r.yMax < cr.yMin || r.yMin > cr.yMax) { clipped++; continue; } // scrolled out of view: fine
                        if (r.xMin < cr.xMin - Tol || r.xMax > cr.xMax + Tol)
                            oob.Add(new Dictionary<string, object> { { "path", PathOf(rt) }, { "rect", r }, { "clip", cr }, { "why", "wider than its scroll viewport" } });
                        if (r.yMin < cr.yMin - Tol || r.yMax > cr.yMax + Tol) clipped++;
                    }
                    else if (r.xMin < -Tol || r.yMin < -Tol || r.xMax > w + Tol || r.yMax > h + Tol)
                    {
                        oob.Add(new Dictionary<string, object> { { "path", PathOf(rt) }, { "rect", r }, { "why", "outside the screen" } });
                    }
                    if (graphic is TMP_Text tmp && !string.IsNullOrEmpty(tmp.text))
                    {
                        tmp.ForceMeshUpdate();
                        var b = tmp.textBounds; var lr = rt.rect;
                        bool over = b.size.x > 0 && (b.min.x < lr.xMin - 1 || b.max.x > lr.xMax + 1 || b.min.y < lr.yMin - 1 || b.max.y > lr.yMax + 1);
                        // a line that ends inside a word ("Resolutio" / "n"): wrapping kept the text inside its
                        // rect, so bounds checks pass, but the column is narrower than the longest word
                        var ti = tmp.textInfo;
                        for (int li = 0; li < ti.lineCount - 1; li++)
                        {
                            int ia = ti.lineInfo[li].lastCharacterIndex, ib = ti.lineInfo[li + 1].firstCharacterIndex;
                            if (ia < 0 || ib <= ia || ib >= ti.characterCount) continue;
                            var ca = ti.characterInfo[ia]; var cb = ti.characterInfo[ib];
                            if (char.IsLetterOrDigit(ca.character) && char.IsLetterOrDigit(cb.character) && cb.index == ca.index + 1)
                            {
                                wordBreaks.Add(new Dictionary<string, object> { { "path", PathOf(rt) }, { "text", tmp.text }, { "line_end", ca.character.ToString() }, { "width", Math.Round(lr.width, 1) } });
                                break;
                            }
                        }
                        if (over || tmp.isTextTruncated)
                            overflow.Add(new Dictionary<string, object>
                            {
                                { "path", PathOf(rt) }, { "text", tmp.text }, { "rect", lr.size }, { "text_bounds", b.size },
                                { "truncated", tmp.isTextTruncated },
                            });
                        if (clip == null || (r.yMin >= ScreenRect(cam, clip, h).yMin && r.yMax <= ScreenRect(cam, clip, h).yMax)) texts.Add((rt, r));
                    }
                    if (sel != null && sel.IsInteractable())
                    {
                        // only the visible part of a scrolled control can collide with other controls
                        var vis = r;
                        if (clip != null) { var cr2 = ScreenRect(cam, clip, h); vis = Rect.MinMaxRect(Mathf.Max(r.xMin, cr2.xMin), Mathf.Max(r.yMin, cr2.yMin), Mathf.Min(r.xMax, cr2.xMax), Mathf.Min(r.yMax, cr2.yMax)); }
                        interactive.Add((PathOf(rt), vis));
                        if (minTarget > 0 && (r.height < minTarget - 0.5f))
                            small.Add(new Dictionary<string, object> { { "path", PathOf(rt) }, { "height_px", Math.Round(r.height, 1) }, { "min_px", minTarget } });
                    }
                }
            }
            for (int i = 0; i < interactive.Count; i++)
                for (int j = i + 1; j < interactive.Count; j++)
                {
                    var a = interactive[i].Item2; var b = interactive[j].Item2;
                    float ix = Mathf.Min(a.xMax, b.xMax) - Mathf.Max(a.xMin, b.xMin), iy = Mathf.Min(a.yMax, b.yMax) - Mathf.Max(a.yMin, b.yMin);
                    if (ix > 1 && iy > 1)
                        overlaps.Add(new Dictionary<string, object> { { "a", interactive[i].Item1 }, { "b", interactive[j].Item1 }, { "area_px", Math.Round(ix * iy) } });
                }
            for (int i = 0; i < texts.Count; i++)
                for (int j = i + 1; j < texts.Count; j++)
                {
                    if (texts[i].Item1.IsChildOf(texts[j].Item1) || texts[j].Item1.IsChildOf(texts[i].Item1)) continue;
                    var ta = (TMP_Text)texts[i].Item1.GetComponent<Graphic>(); var tb = (TMP_Text)texts[j].Item1.GetComponent<Graphic>();
                    var a = TextScreenRect(cam, ta, h); var b = TextScreenRect(cam, tb, h);
                    float ix = Mathf.Min(a.xMax, b.xMax) - Mathf.Max(a.xMin, b.xMin), iy = Mathf.Min(a.yMax, b.yMax) - Mathf.Max(a.yMin, b.yMin);
                    if (ix > 1 && iy > 1)
                        overlaps.Add(new Dictionary<string, object> { { "a", PathOf(texts[i].Item1) }, { "b", PathOf(texts[j].Item1) }, { "area_px", Math.Round(ix * iy) }, { "kind", "text" } });
                }
            bool ok = oob.Count == 0 && overflow.Count == 0 && overlaps.Count == 0 && small.Count == 0 && wordBreaks.Count == 0;
            return new Dictionary<string, object>
            {
                { "checked", checkedN }, { "out_of_bounds", oob }, { "text_overflow", overflow }, { "overlaps", overlaps },
                { "small_targets", small }, { "word_breaks", wordBreaks }, { "clipped_by_scroll", clipped }, { "ok", ok },
            };
        }

        static Rect TextScreenRect(Camera cam, TMP_Text t, int h)
        {
            var b = t.textBounds;
            var tr = t.rectTransform;
            var p0 = cam.WorldToScreenPoint(tr.TransformPoint(b.min));
            var p1 = cam.WorldToScreenPoint(tr.TransformPoint(b.max));
            return Rect.MinMaxRect(Mathf.Min(p0.x, p1.x), h - Mathf.Max(p0.y, p1.y), Mathf.Max(p0.x, p1.x), h - Mathf.Min(p0.y, p1.y));
        }

        static Texture2D RenderBackdrop(Camera cam, int w, int h)
        {
            var rt = new RenderTexture(new RenderTextureDescriptor(w, h, RenderTextureFormat.ARGB32, 24) { sRGB = true });
            rt.Create();
            var prev = cam.targetTexture;
            cam.targetTexture = rt;
            cam.Render(); cam.Render(); // first frame after a scene load renders materials white (trap O1)
            cam.targetTexture = prev;
            var tex = ReadBack(rt);
            rt.Release(); UnityEngine.Object.DestroyImmediate(rt);
            return tex;
        }

        /// <summary>Panel pixels over the backdrop. UI Toolkit writes premultiplied colour into a cleared
        /// transparent target, so out = panel + back * (1 - a).</summary>
        static void Composite(Texture2D panel, Texture2D back)
        {
            var p = panel.GetPixels32(); var b = back.GetPixels32();
            for (int i = 0; i < b.Length; i++)
            {
                float a = p[i].a / 255f;
                b[i] = new Color32((byte)Mathf.Min(255, p[i].r + b[i].r * (1 - a)), (byte)Mathf.Min(255, p[i].g + b[i].g * (1 - a)),
                                   (byte)Mathf.Min(255, p[i].b + b[i].b * (1 - a)), 255);
            }
            back.SetPixels32(b); back.Apply();
        }

        public static Texture2D ReadBack(RenderTexture rt, bool keepAlpha = false)
        {
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGBA32, false, false);
            tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            tex.Apply();
            RenderTexture.active = prev;
            if (keepAlpha) return tex;
            var px = tex.GetPixels32();
            for (int i = 0; i < px.Length; i++) px[i].a = 255;
            tex.SetPixels32(px);
            tex.Apply();
            return tex;
        }

        // ================================================================== UI Toolkit
        const string UitkKey = "AgentKit.UI.CaptureUITK";
        static Dictionary<string, object> s_State;
        static List<(UIDocument doc, PanelSettings clone)> s_Docs;
        static RenderTexture s_RT;
        static Camera s_BackCam;
        static int s_Tick, s_Shot;
        static List<object> s_Results;

        public static void CaptureUITK()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                AgentJob.BeginAsync();
                var scenePath = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scenePath)) EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("uitk_captures");
                Directory.CreateDirectory(outDir);
                s_State = new Dictionary<string, object>
                {
                    { "out_dir", outDir }, { "shots", AgentJob.List("shots") }, { "ticks", AgentJob.Int("ticks", 8) },
                    { "background", AgentJob.Str("background", "#4b5563") },
                };
                s_BackCam = null;
                var backdrop = AgentJob.Str("backdrop_scene", null);
                if (!string.IsNullOrEmpty(backdrop))
                {
                    var bs = EditorSceneManager.OpenScene(backdrop, OpenSceneMode.Additive);
                    foreach (var go in bs.GetRootGameObjects())
                        foreach (var c in go.GetComponentsInChildren<Camera>())
                            if (c.CompareTag("MainCamera") || s_BackCam == null) s_BackCam = c;
                    if (s_BackCam == null) throw new InvalidOperationException("no camera in backdrop scene " + backdrop);
                }
                s_Docs = new List<(UIDocument, PanelSettings)>();
                HudModel model = null;
                if (AgentJob.Has("model"))
                {
                    var m = AgentJob.Dict("model");
                    model = new HudModel();
                    if (m.ContainsKey("max_health")) model.MaxHealth = (int)AgentJson.ToDouble(m["max_health"]);
                    if (m.ContainsKey("health")) model.Health = (int)AgentJson.ToDouble(m["health"]);
                    if (m.ContainsKey("ammo")) model.Ammo = (int)AgentJson.ToDouble(m["ammo"]);
                    if (m.ContainsKey("reserve")) model.Reserve = (int)AgentJson.ToDouble(m["reserve"]);
                    s_State["model"] = new Dictionary<string, object> { { "HealthText", model.HealthText }, { "Health01", model.Health01 }, { "AmmoText", model.AmmoText }, { "ReserveText", model.ReserveText } };
                }
                foreach (var doc in UnityEngine.Object.FindObjectsByType<UIDocument>(FindObjectsSortMode.None))
                {
                    if (doc.panelSettings == null) continue;
                    var clone = UnityEngine.Object.Instantiate(doc.panelSettings); // never edit the asset
                    clone.name = doc.panelSettings.name + " (capture)";
                    clone.clearColor = true;
                    var clear = UiTheme.Hex((string)s_State["background"]);
                    if (QualitySettings.activeColorSpace == ColorSpace.Linear) clear = clear.linear; // colorClearValue is linear
                    clone.colorClearValue = s_BackCam != null ? new Color(0, 0, 0, 0) : clear;
                    doc.panelSettings = clone;
                    if (model != null && doc.rootVisualElement != null) doc.rootVisualElement.dataSource = model;
                    s_Docs.Add((doc, clone));
                }
                if (s_Docs.Count == 0) throw new InvalidOperationException("no UIDocument with PanelSettings in the scene");
                s_Results = new List<object>();
                s_Shot = -1; s_Tick = 0;
                EditorApplication.update += TickUITK;
                return null;
            });
        }

        static void TickUITK()
        {
            try
            {
                EditorApplication.QueuePlayerLoopUpdate();
                var shots = (List<object>)s_State["shots"];
                if (s_Shot < 0 || s_Tick >= (int)s_State["ticks"])
                {
                    if (s_Shot >= 0) s_Results.Add(FinishShotUITK((Dictionary<string, object>)shots[s_Shot]));
                    s_Shot++;
                    s_Tick = 0;
                    if (s_Shot >= shots.Count)
                    {
                        EditorApplication.update -= TickUITK;
                        foreach (var d in s_Docs) d.clone.targetTexture = null;
                        bool all = s_Results.All(r => (bool)((Dictionary<string, object>)r)["ok"]);
                        AgentJob.Succeed(new Dictionary<string, object>
                        {
                            { "all_ok", all }, { "shots", s_Results },
                            { "capture_path", "UIDocument PanelSettings cloned, targetTexture = RenderTexture(device size), editor updates" },
                        });
                        return;
                    }
                    var s = (Dictionary<string, object>)shots[s_Shot];
                    int w = (int)AgentJson.ToDouble(s["width"]), h = (int)AgentJson.ToDouble(s["height"]);
                    if (s_RT != null) { s_RT.Release(); UnityEngine.Object.DestroyImmediate(s_RT); }
                    s_RT = new RenderTexture(new RenderTextureDescriptor(w, h, RenderTextureFormat.ARGB32, 24) { sRGB = true });
                    s_RT.Create();
                    foreach (var d in s_Docs) d.clone.targetTexture = s_RT;
                }
                s_Tick++;
            }
            catch (Exception e)
            {
                EditorApplication.update -= TickUITK;
                AgentJob.Fail("CaptureUITK: " + e.Message, null, e);
            }
        }

        static Dictionary<string, object> FinishShotUITK(Dictionary<string, object> s)
        {
            string name = s.TryGetValue("name", out var n) ? n.ToString() : "shot";
            int w = s_RT.width, h = s_RT.height;
            var png = Path.Combine((string)s_State["out_dir"], name + ".png");
            if (s_BackCam != null)
            {
                var panelTex = ReadBack(s_RT, keepAlpha: true);
                var back = RenderBackdrop(s_BackCam, w, h);
                Composite(panelTex, back);
                File.WriteAllBytes(png, back.EncodeToPNG());
                UnityEngine.Object.DestroyImmediate(panelTex);
                UnityEngine.Object.DestroyImmediate(back);
            }
            else
            {
                var tex = ReadBack(s_RT);
                File.WriteAllBytes(png, tex.EncodeToPNG());
                UnityEngine.Object.DestroyImmediate(tex);
            }
            var rep = LayoutUITK(s_Docs[0].doc.rootVisualElement);
            rep["name"] = name; rep["png"] = png; rep["width"] = w; rep["height"] = h;
            var root = s_Docs[0].doc.rootVisualElement;
            var ps = s_Docs[0].clone;
            rep["panel_size"] = new[] { Math.Round(root.layout.width, 2), Math.Round(root.layout.height, 2) };
            rep["scale_factor"] = root.layout.width > 0 ? Math.Round(w / root.layout.width, 4) : 0;
            rep["uitk_linear_match_prediction"] = Math.Round(Mathf.Lerp(w / (float)ps.referenceResolution.x, h / (float)ps.referenceResolution.y, ps.match), 4);
            rep["ugui_log_match_prediction"] = Math.Round(ExpectedScale(w, h, ps.referenceResolution, ps.match), 4);
            if (s_State.TryGetValue("model", out var model))
            {
                var bound = new Dictionary<string, object>();
                var ht = root.Q<Label>("health-text"); var at = root.Q<Label>("ammo-text"); var bar = root.Q<HudBar>("health-bar");
                bound["health_text"] = ht?.text; bound["ammo_text"] = at?.text; bound["bar_value"] = bar != null ? (object)Math.Round(bar.value, 3) : null;
                var m = (Dictionary<string, object>)model;
                bool okBind = ht != null && ht.text == (string)m["HealthText"] && at != null && at.text == (string)m["AmmoText"]
                              && bar != null && Mathf.Abs(bar.value - Convert.ToSingle(m["Health01"])) < 0.001f;
                bound["matches_model"] = okBind;
                rep["binding"] = bound;
                rep["ok"] = (bool)rep["ok"] && okBind;
            }
            return rep;
        }

        public static Dictionary<string, object> LayoutUITK(VisualElement root)
        {
            var panel = root.worldBound;
            var oob = new List<object>(); var overflow = new List<object>(); var overlaps = new List<object>();
            var blocks = new List<VisualElement>();
            int checkedN = 0;
            root.Query<VisualElement>().ForEach(e =>
            {
                if (e == root) return;
                if (e.resolvedStyle.display == DisplayStyle.None || e.resolvedStyle.visibility == Visibility.Hidden || e.resolvedStyle.opacity <= 0.001f) return;
                for (var p = e.parent; p != null; p = p.parent) if (p.resolvedStyle.display == DisplayStyle.None) return;
                var r = e.worldBound;
                if (float.IsNaN(r.width) || r.width <= 0 || r.height <= 0) return;
                checkedN++;
                if (r.xMin < panel.xMin - Tol || r.yMin < panel.yMin - Tol || r.xMax > panel.xMax + Tol || r.yMax > panel.yMax + Tol)
                    oob.Add(new Dictionary<string, object> { { "name", Name(e) }, { "rect", r } });
                if (e is Label l && !string.IsNullOrEmpty(l.text))
                {
                    var natural = l.MeasureTextSize(l.text, 0, VisualElement.MeasureMode.Undefined, 0, VisualElement.MeasureMode.Undefined);
                    var cr = l.contentRect;
                    bool noWrap = l.resolvedStyle.whiteSpace == WhiteSpace.NoWrap;
                    bool over = noWrap ? natural.x > cr.width + 1 : false;
                    if (!noWrap)
                    {
                        var wrapped = l.MeasureTextSize(l.text, cr.width, VisualElement.MeasureMode.Exactly, 0, VisualElement.MeasureMode.Undefined);
                        over = wrapped.y > cr.height + 1;
                    }
                    // text wider than its parent block also counts (a label may size itself past its container)
                    var parentBound = l.parent != null ? l.parent.worldBound : panel;
                    if (r.xMax > parentBound.xMax + Tol || r.xMin < parentBound.xMin - Tol) over = true;
                    if (over) overflow.Add(new Dictionary<string, object> { { "name", Name(l) }, { "text", l.text }, { "natural", natural }, { "content", cr.size } });
                }
                if (e.ClassListContains("hud-block")) blocks.Add(e);
            });
            for (int i = 0; i < blocks.Count; i++)
                for (int j = i + 1; j < blocks.Count; j++)
                    if (blocks[i].worldBound.Overlaps(blocks[j].worldBound))
                        overlaps.Add(new Dictionary<string, object> { { "a", Name(blocks[i]) }, { "b", Name(blocks[j]) } });
            return new Dictionary<string, object>
            {
                { "checked", checkedN }, { "out_of_bounds", oob }, { "text_overflow", overflow }, { "overlaps", overlaps },
                { "blocks", blocks.Select(b => (object)new Dictionary<string, object> { { "name", Name(b) }, { "rect", b.worldBound } }).ToList() },
                { "ok", oob.Count == 0 && overflow.Count == 0 && overlaps.Count == 0 && checkedN > 0 },
            };
        }

        static string Name(VisualElement e) => string.IsNullOrEmpty(e.name) ? e.GetType().Name + "." + string.Join(".", e.GetClasses()) : e.name;
    }
}
