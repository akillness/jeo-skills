// scenario-unity-ui AgentKit (Unity Expert Skills v0.2, 2026-09-24). UI cost measurements an agent can run
// headless: mesh regenerations per toggle (edit mode) and UI profiler markers per frame (Play mode).
//
// Jobs:
//   AgentKit.UI.UIPerf.HideCost   sync, args: probes (200)
//     A canvas of RebuildProbe graphics; counts OnPopulateMesh calls for: first build, Canvas.enabled
//     off/on, CanvasGroup.alpha 0/1, SetActive off/on, one colour change, moving the parent, resizing
//     the parent. Expert claim under test: disabling the Canvas component keeps the meshes and
//     re-enabling rebuilds nothing, while SetActive regenerates everything (uGUI optimization tips).
//   AgentKit.UI.UIPerf.TextEffectCost   sync, args: text. Vertices of legacy Text + Shadow + Outline
//     versus TMP with outline and underlay in the material.
//   AgentKit.UI.UIPerf.BuildPerfScenes   sync, args: folder ("Assets/AgentUI/Scenes/Perf"), static (600)
//     Perf_Single.unity: one Screen Space Camera canvas with `static` Images + one TMP counter changed
//     every frame. Perf_Split.unity: the same, the counter on its own sub-canvas.
//     Perf_UitkTextures.unity: UIDocument + UitkTextureGrid (4, 8, 9, 16, 17 distinct 512 px textures);
//     Perf_UitkAtlas.unity: the same with 32 px textures (dynamic atlas candidates).
//     Perf_UitkVertex_B<budget>.unity for each of vertex_budgets ([0, 20000]): UitkVertexGrid (250 to
//     12000 one-quad elements) on a PanelSettings with that Vertex Budget.
//     Perf_UitkHide.unity: UitkHideDriver (a 120-row bound screen hidden and shown by each method).
//   AgentKit.UI.UIPerf.PlayModeCounters   async (quit=False, graphics=True), args: scene, frames (120),
//     warmup (30), counters ["UI Render/Canvas.BuildBatch", ...], width/height (1920x1080 offscreen)
//     Enters Play mode (domain reload: state in SessionState, resumed by [InitializeOnLoad]), gives every
//     camera an offscreen target and every UIDocument a cloned PanelSettings with a targetTexture (batch
//     Play mode renders nothing on screen: scenario-unity-expert trap O7), samples the counters per frame with
//     UiCounterSampler, returns per-tag stats {counter: {mean, p50, max}} and the raw CSV path, the facts
//     drivers publish (UiCounterSampler.Extra) and, with list_markers ["Binding", ...], the exact
//     "Category/Name" of every recorder available after the run whose name contains one of them.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
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
    public static class UIPerf
    {
        // ------------------------------------------------------------------ hide cost (edit mode)
        public static void HideCost()
        {
            AgentJob.Run(() =>
            {
                int n = AgentJob.Int("probes", 200);
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var root = UIBuild.NewUI("Canvas", null, typeof(Canvas), typeof(CanvasScaler), typeof(CanvasGroup));
                var canvas = root.GetComponent<Canvas>();
                // Screen Space Camera on an offscreen camera: the rebuild runs when the canvas renders
                // (Canvas.willRenderCanvases); in batch mode an Overlay canvas never renders (no screen)
                var cam = new GameObject("Cam").AddComponent<Camera>();
                cam.orthographic = true; cam.nearClipPlane = 0.1f; cam.farClipPlane = 10f;
                var target = new RenderTexture(1280, 720, 24); target.Create();
                cam.targetTexture = target;
                canvas.renderMode = RenderMode.ScreenSpaceCamera; canvas.worldCamera = cam; canvas.planeDistance = 1f;
                bool viaRender = AgentJob.Str("trigger", "render") == "render";
                var container = UIBuild.NewUI("Container", root.transform);
                UIBuild.Stretch((RectTransform)container.transform);
                var probes = new List<RebuildProbe>();
                for (int i = 0; i < n; i++)
                {
                    var go = UIBuild.NewUI("Probe" + i, container.transform, typeof(RebuildProbe));
                    var rt = (RectTransform)go.transform;
                    rt.anchorMin = rt.anchorMax = new Vector2(0, 1);
                    rt.anchoredPosition = new Vector2(10 + (i % 20) * 30, -10 - (i / 20) * 30);
                    rt.sizeDelta = new Vector2(24, 24);
                    probes.Add(go.GetComponent<RebuildProbe>());
                }
                var group = root.GetComponent<CanvasGroup>();
                var r = new Dictionary<string, object> { { "probes", n } };
                void Frame() { if (viaRender) cam.Render(); else Canvas.ForceUpdateCanvases(); }
                int Measure(Action a)
                {
                    Frame();
                    RebuildProbe.ResetCount();
                    a();
                    Frame();
                    return RebuildProbe.Populations;
                }
                RebuildProbe.ResetCount();
                Frame();
                r["first_build"] = RebuildProbe.Populations;
                r["trigger"] = viaRender ? "Camera.Render (Screen Space Camera canvas)" : "Canvas.ForceUpdateCanvases";
                r["canvas_enabled_off_on"] = Measure(() => { canvas.enabled = false; Frame(); canvas.enabled = true; });
                r["canvasgroup_alpha_0_1"] = Measure(() => { group.alpha = 0; Frame(); group.alpha = 1; });
                r["setactive_off_on"] = Measure(() => { container.SetActive(false); Frame(); container.SetActive(true); });
                r["one_color_change"] = Measure(() => { probes[0].color = Color.red; });
                r["move_parent"] = Measure(() => { ((RectTransform)container.transform).anchoredPosition += new Vector2(15, 0); });
                r["resize_parent"] = Measure(() => { ((RectTransform)container.transform).offsetMax += new Vector2(-40, 0); });
                r["resize_parent_note"] = "children with fixed size and corner anchors keep their rect: no regeneration";
                r["stretch_children_resize"] = Measure(() =>
                {
                    foreach (var p in probes) { var rt = p.rectTransform; rt.anchorMin = new Vector2(0, 0); rt.anchorMax = new Vector2(1, 1); }
                    Frame();
                    RebuildProbe.ResetCount();
                    ((RectTransform)container.transform).offsetMax += new Vector2(-40, 0);
                });
                cam.targetTexture = null; target.Release();
                return r;
            });
        }

        // ------------------------------------------------------------------ text effects
        /// <summary>Vertices of one label: legacy Text with Shadow + Outline (mesh effects copy the glyph quads)
        /// versus TextMeshProUGUI with outline and underlay in its material (shader side). Andy Touch measured
        /// 4.1k vs 1.8k tris for a header (eH-PdFKgctE [00:42:36]).</summary>
        public static void TextEffectCost()
        {
            AgentJob.Run(() =>
            {
                string text = AgentJob.Str("text", "HEADER TEXT 1234");
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var root = UIBuild.NewUI("Canvas", null, typeof(Canvas));
                root.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
                // legacy Text: count the quads its generator makes, then run the mesh effects on them
                var lgo = UIBuild.NewUI("Legacy", root.transform, typeof(Text));
                var lt = lgo.GetComponent<Text>();
                lt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                lt.fontSize = 48; lt.text = text; lt.horizontalOverflow = HorizontalWrapMode.Overflow;
                ((RectTransform)lgo.transform).sizeDelta = new Vector2(900, 100);
                var shadow = lgo.AddComponent<Shadow>();
                var outline = lgo.AddComponent<Outline>();
                var gen = lt.cachedTextGeneratorForLayout;
                gen.Populate(text, lt.GetGenerationSettings(((RectTransform)lgo.transform).rect.size));
                int baseVerts = gen.vertexCount;
                var vh = new VertexHelper();
                var verts = gen.verts;
                for (int i = 0; i + 3 < verts.Count; i += 4)
                    vh.AddUIVertexQuad(new[] { verts[i], verts[i + 1], verts[i + 2], verts[i + 3] });
                int beforeFx = vh.currentIndexCount / 3;       // triangles
                shadow.ModifyMesh(vh);                           // mesh effects rebuild the triangle list with copies
                int afterShadow = vh.currentIndexCount / 3;
                outline.ModifyMesh(vh);
                int afterOutline = vh.currentIndexCount / 3;
                vh.Dispose();
                // TMP: outline + underlay live in the material; the mesh stays one quad per visible glyph
                var tgo = UIBuild.NewUI("TMP", root.transform, typeof(TextMeshProUGUI));
                var tmp = tgo.GetComponent<TextMeshProUGUI>();
                tmp.fontSize = 48; tmp.text = text;
                ((RectTransform)tgo.transform).sizeDelta = new Vector2(900, 100);
                var mat = new Material(tmp.fontSharedMaterial);
                mat.EnableKeyword("OUTLINE_ON"); mat.SetFloat("_OutlineWidth", 0.2f);
                mat.EnableKeyword("UNDERLAY_ON"); mat.SetFloat("_UnderlayOffsetX", 1f); mat.SetFloat("_UnderlayOffsetY", -1f);
                tmp.fontSharedMaterial = mat;
                tmp.ForceMeshUpdate();
                int tmpTris = tmp.mesh != null ? tmp.mesh.triangles.Length / 3 : -1;
                int visible = 0;
                for (int i = 0; i < tmp.textInfo.characterCount; i++) if (tmp.textInfo.characterInfo[i].isVisible) visible++;
                return new Dictionary<string, object>
                {
                    { "text", text }, { "legacy_triangles", beforeFx }, { "legacy_generator_vertices", baseVerts },
                    { "legacy_triangles_after_shadow", afterShadow }, { "legacy_triangles_after_shadow_outline", afterOutline },
                    { "legacy_multiplier", beforeFx > 0 ? Math.Round(afterOutline / (double)beforeFx, 2) : 0 },
                    { "tmp_triangles_with_outline_underlay", tmpTris }, { "tmp_visible_glyphs", visible },
                };
            });
        }

        // ------------------------------------------------------------------ perf scenes
        public static void BuildPerfScenes()
        {
            AgentJob.Run(() =>
            {
                string folder = AgentJob.Str("folder", "Assets/AgentUI/Scenes/Perf");
                int count = AgentJob.Int("static", 600);
                Directory.CreateDirectory(AgentJob.ResolvePath(folder));
                var made = new List<string>();
                foreach (bool split in new[] { false, true })
                {
                    var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    var cam = new GameObject("Main Camera").AddComponent<Camera>();
                    cam.tag = "MainCamera"; cam.orthographic = true; cam.clearFlags = CameraClearFlags.SolidColor;
                    cam.backgroundColor = UiTheme.Background; cam.nearClipPlane = 0.1f; cam.farClipPlane = 100f;
                    var root = UIBuild.NewUI("Canvas", null, typeof(Canvas), typeof(CanvasScaler));
                    var c = root.GetComponent<Canvas>();
                    c.renderMode = RenderMode.ScreenSpaceCamera; c.worldCamera = cam; c.planeDistance = 1f;
                    var sc = root.GetComponent<CanvasScaler>();
                    sc.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; sc.referenceResolution = new Vector2(1920, 1080); sc.matchWidthOrHeight = 0.5f;
                    for (int i = 0; i < count; i++)
                    {
                        var img = UIBuild.Panel(root.transform, "Static" + i, Color.HSVToRGB((i * 0.017f) % 1f, 0.4f, 0.6f));
                        var rt = img.rectTransform;
                        rt.anchorMin = rt.anchorMax = new Vector2(0, 1); rt.pivot = new Vector2(0, 1);
                        rt.anchoredPosition = new Vector2(20 + (i % 40) * 46, -140 - (i / 40) * 46);
                        rt.sizeDelta = new Vector2(40, 40);
                    }
                    Transform parent = root.transform;
                    if (split)
                    {
                        var sub = UIBuild.NewUI("Dynamic Canvas", root.transform, typeof(Canvas));
                        UIBuild.Stretch((RectTransform)sub.transform);
                        parent = sub.transform;
                    }
                    var t = UIBuild.Label(parent, "Counter", "0", 72, UiTheme.Text, TextAlignmentOptions.TopLeft, FontStyles.Bold);
                    UIBuild.Place(t.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -20), new Vector2(400, 100));
                    var drv = new GameObject("Driver").AddComponent<UiPerfDriver>();
                    drv.dynamicText = t;
                    var path = folder + (split ? "/Perf_Split.unity" : "/Perf_Single.unity");
                    EditorSceneManager.SaveScene(scene, path);
                    made.Add(path);
                }
                {
                    var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    var ps = ScriptableObject.CreateInstance<PanelSettings>();
                    var psPath = folder + "/PerfPanelSettings.asset";
                    AssetDatabase.CreateAsset(ps, psPath);
                    var theme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>("Assets/AgentUI/HUD/AgentRuntimeTheme.tss");
                    UIToolkitBuild.ConfigurePanel(ps, theme, null, 0.5f, 0, 0);
                    EditorUtility.SetDirty(ps); AssetDatabase.SaveAssets();
                    var go = new GameObject("TextureGrid");
                    var doc = go.AddComponent<UIDocument>();
                    doc.panelSettings = ps;
                    go.AddComponent<UitkTextureGrid>();
                    var path = folder + "/Perf_UitkTextures.unity";
                    EditorSceneManager.SaveScene(scene, path);
                    made.Add(path);
                    // control: the same grid with 32 px textures, small enough for the dynamic atlas
                    go.GetComponent<UitkTextureGrid>().textureSize = 32;
                    var path2 = folder + "/Perf_UitkAtlas.unity";
                    EditorSceneManager.SaveScene(scene, path2);
                    made.Add(path2);
                }
                var theme2 = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>("Assets/AgentUI/HUD/AgentRuntimeTheme.tss");
                var budgets = AgentJob.Has("vertex_budgets") ? AgentJob.List("vertex_budgets").Select(o => (int)AgentJson.ToDouble(o)).ToList() : new List<int> { 0, 20000 };
                foreach (var b in budgets)
                {
                    var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    var ps = ScriptableObject.CreateInstance<PanelSettings>();
                    var psPath = folder + "/PerfVertexPanel_B" + b + ".asset";
                    AssetDatabase.DeleteAsset(psPath);
                    AssetDatabase.CreateAsset(ps, psPath);
                    UIToolkitBuild.ConfigurePanel(ps, theme2, null, 0.5f, b, 0);
                    EditorUtility.SetDirty(ps); AssetDatabase.SaveAssets();
                    var go = new GameObject("VertexGrid");
                    go.AddComponent<UIDocument>().panelSettings = ps;
                    go.AddComponent<UitkVertexGrid>();
                    var path = folder + "/Perf_UitkVertex_B" + b + ".unity";
                    EditorSceneManager.SaveScene(scene, path);
                    made.Add(path);
                }
                {
                    var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                    var ps = AssetDatabase.LoadAssetAtPath<PanelSettings>(folder + "/PerfPanelSettings.asset");
                    var go = new GameObject("HideDriver");
                    go.AddComponent<UIDocument>().panelSettings = ps;
                    go.AddComponent<UitkHideDriver>();
                    var path = folder + "/Perf_UitkHide.unity";
                    EditorSceneManager.SaveScene(scene, path);
                    made.Add(path);
                }
                return new Dictionary<string, object> { { "scenes", made }, { "static_graphics", count } };
            });
        }

        // ------------------------------------------------------------------ Play mode counters
        public const string StateKey = "AgentKit.UI.PlayModeCounters";

        public static readonly string[] DefaultCounters =
        {
            "UI Render/Canvas.BuildBatch", "PlayerLoop/UIEvents.WillRenderCanvases", "UI Layout/Layout",
            "PlayerLoop/PreLateUpdate.UIElementsUpdatePanels", "Render/UIR.DrawChain",
            "Render/Batches Count", "Render/Draw Calls Count", "Render/SetPass Calls Count",
        };

        public static void PlayModeCounters()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                AgentJob.BeginAsync();
                var scene = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var counters = AgentJob.Has("counters") ? AgentJob.List("counters").Select(o => (object)o.ToString()).ToList() : DefaultCounters.Select(c => (object)c).ToList();
                var st = new Dictionary<string, object>
                {
                    { "phase", "entering" }, { "frames", AgentJob.Int("frames", 120) }, { "warmup", AgentJob.Int("warmup", 30) },
                    { "counters", counters }, { "width", AgentJob.Int("width", 1920) }, { "height", AgentJob.Int("height", 1080) },
                    { "csv", Path.Combine(AgentJob.OutDir(), "ui_counters.csv") }, { "scene", EditorSceneManager.GetActiveScene().path },
                    { "list_markers", AgentJob.List("list_markers") ?? new List<object>() },
                };
                SessionState.SetString(StateKey, AgentJson.Serialize(st));
                UIPerfDriver.Hook();
                EditorApplication.EnterPlaymode();
                return null;
            });
        }
    }

    [InitializeOnLoad]
    static class UIPerfDriver
    {
        static bool s_Hooked;
        static Dictionary<string, object> s_State;
        static readonly List<RenderTexture> s_Targets = new List<RenderTexture>();
        static UiCounterSampler s_Sampler;
        static int s_Guard;

        static UIPerfDriver()
        {
            if (!string.IsNullOrEmpty(SessionState.GetString(UIPerf.StateKey, ""))) Hook();
        }

        public static void Hook()
        {
            if (s_Hooked) return;
            s_Hooked = true;
            EditorApplication.update += Tick;
        }

        static void Save() => SessionState.SetString(UIPerf.StateKey, AgentJson.Serialize(s_State));

        static void End()
        {
            SessionState.EraseString(UIPerf.StateKey);
            EditorApplication.update -= Tick;
            s_Hooked = false;
            s_State = null;
            foreach (var t in s_Targets) if (t != null) { t.Release(); UnityEngine.Object.DestroyImmediate(t); }
            s_Targets.Clear();
        }

        static void Tick()
        {
            if (s_State == null)
            {
                var raw = SessionState.GetString(UIPerf.StateKey, "");
                if (string.IsNullOrEmpty(raw)) { EditorApplication.update -= Tick; s_Hooked = false; return; }
                s_State = AgentJson.ParseObject(raw);
            }
            try
            {
                var phase = (string)s_State["phase"];
                if (phase == "entering" && EditorApplication.isPlaying)
                {
                    int w = (int)AgentJson.ToDouble(s_State["width"]), h = (int)AgentJson.ToDouble(s_State["height"]);
                    foreach (var cam in UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
                    {
                        var rt = new RenderTexture(w, h, 24); rt.Create(); s_Targets.Add(rt);
                        cam.targetTexture = rt;
                    }
                    foreach (var doc in UnityEngine.Object.FindObjectsByType<UIDocument>(FindObjectsSortMode.None))
                    {
                        if (doc.panelSettings == null) continue;
                        var clone = UnityEngine.Object.Instantiate(doc.panelSettings);
                        var rt = new RenderTexture(w, h, 24); rt.Create(); s_Targets.Add(rt);
                        clone.targetTexture = rt;
                        doc.panelSettings = clone;
                    }
                    var names = ((List<object>)s_State["counters"]).Select(o => o.ToString()).ToList();
                    s_Sampler = UiCounterSampler.Begin(names, (int)AgentJson.ToDouble(s_State["frames"]), (int)AgentJson.ToDouble(s_State["warmup"]));
                    s_Guard = 0;
                    s_State["phase"] = "recording";
                    Save();
                }
                else if (phase == "recording")
                {
                    if (!EditorApplication.isPlaying) throw new InvalidOperationException("left Play mode while recording");
                    if (s_Sampler == null) throw new InvalidOperationException("sampler lost (domain reload while recording?)");
                    if (!s_Sampler.Done && ++s_Guard < 20000) return;
                    var summary0 = Summarize(s_Sampler, (string)s_State["csv"]);
                    summary0["extra"] = UiCounterSampler.Extra.ToDictionary(kv => kv.Key, kv => (object)kv.Value);
                    var subs = s_State.TryGetValue("list_markers", out var lm) && lm is List<object> l ? l.Select(o => o.ToString()).ToList() : new List<string>();
                    if (subs.Count > 0) summary0["markers_matching"] = MarkersMatching(subs);
                    s_State["summary"] = summary0;
                    UnityEngine.Object.Destroy(s_Sampler.gameObject);
                    s_Sampler = null;
                    s_State["phase"] = "exiting";
                    Save();
                    EditorApplication.ExitPlaymode();
                }
                else if (phase == "exiting" && !EditorApplication.isPlaying && !EditorApplication.isPlayingOrWillChangePlaymode)
                {
                    var summary = s_State["summary"];
                    End();
                    AgentJob.Succeed(summary);
                }
            }
            catch (Exception e)
            {
                End();
                if (EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
                AgentJob.Fail("PlayModeCounters: " + e.Message, null, e);
            }
        }


        static List<object> MarkersMatching(List<string> subs)
        {
            var handles = new List<Unity.Profiling.LowLevel.Unsafe.ProfilerRecorderHandle>();
            Unity.Profiling.LowLevel.Unsafe.ProfilerRecorderHandle.GetAvailable(handles);
            var found = new List<object>();
            foreach (var h in handles)
            {
                var d = Unity.Profiling.LowLevel.Unsafe.ProfilerRecorderHandle.GetDescription(h);
                if (subs.Any(x => d.Name.IndexOf(x, StringComparison.OrdinalIgnoreCase) >= 0)) found.Add(d.Category.Name + "/" + d.Name);
            }
            return found.Distinct().OrderBy(x => (string)x).ToList();
        }

        static Dictionary<string, object> Summarize(UiCounterSampler s, string csv)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(csv));
            var sb = new StringBuilder("frame,tag," + string.Join(",", s.Names.Select(n => n.Replace(',', ' '))) + "\n");
            for (int f = 0; f < s.Rows.Count; f++)
                sb.Append(f).Append(',').Append(s.Tags[f]).Append(',').Append(string.Join(",", s.Rows[f].Select(v => v.ToString(CultureInfo.InvariantCulture)))).Append('\n');
            File.WriteAllText(csv, sb.ToString());
            var byTag = new Dictionary<string, object>();
            foreach (var tag in s.Tags.Distinct().OrderBy(t => t))
            {
                var idx = Enumerable.Range(0, s.Rows.Count).Where(i => s.Tags[i] == tag).ToList();
                var per = new Dictionary<string, object> { { "frames", idx.Count } };
                for (int c = 0; c < s.Names.Count; c++)
                {
                    var vals = idx.Select(i => (double)s.Rows[i][c]).Where(v => v >= 0).OrderBy(v => v).ToList();
                    if (vals.Count == 0) continue;
                    string unit = c < s.Units.Count ? s.Units[c] : "Undefined";
                    bool time = unit == "TimeNanoseconds";
                    double k = time ? 1e-6 : 1.0; // ns -> ms for markers; bytes and counts stay raw
                    per[s.Names[c]] = new Dictionary<string, object>
                    {
                        { "mean", Math.Round(vals.Average() * k, 4) }, { "p50", Math.Round(vals[vals.Count / 2] * k, 4) },
                        { "max", Math.Round(vals[vals.Count - 1] * k, 4) }, { "unit", time ? "ms" : unit == "Bytes" ? "bytes" : "count" },
                        { "frames_nonzero", vals.Count(v => v > 0) },
                    };
                }
                byTag[tag.ToString()] = per;
            }
            return new Dictionary<string, object>
            {
                { "csv", csv }, { "frames", s.Rows.Count }, { "missing", new List<string>(s.Missing) }, { "by_tag", byTag },
                { "editor_play_mode", true }, { "graphics", SystemInfo.graphicsDeviceType.ToString() },
            };
        }
    }
}
