// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). URP 2D lights by script.
//
// Expert rules applied: a tinted, low-intensity Global light so no area is pitch black (Happy
// Harvest GDC 2023 uses 0.25); one Global light per blend style per sorting layer (2D e-book p. 98);
// Normal Maps must be enabled ON THE LIGHT or assigned normal maps do nothing (GDC [00:12:31]);
// few shadow-casting lights (fill rate, e-book p. 131); light sprites need the art PPU and Point
// filter (2qeNu2QApAM [00:07:06]).
// Agent traps observed in URP 17.3 source and runs: Light2D.normalMapQuality and normalMapDistance
// are READ-ONLY properties (set m_NormalMapQuality / m_NormalMapDistance through SerializedObject);
// a Light2D added by AddComponent starts with Shadows ON and Normal Maps OFF; the enum says Point
// where the Inspector says "Spot Light 2D"; Parametric is deprecated.
//
// Job: AgentKit.TwoD.LightJobs.LightRig  args: scene, global {intensity, color}, points [{name, parent,
//      position, color, intensity, inner, outer, normal ("Disabled"|"Fast"|"Accurate"), distance, shadows,
//      layers[]}], sprite_lights [{name, position, sprite, color, intensity, layers[]}], disable_normals (bool)
// Job: AgentKit.TwoD.LightJobs.MoveLight  args: scene, name, position (for the two-position capture)
// Job: AgentKit.TwoD.LightJobs.LightCost  args: scene, width, height, ortho (default: camera), center [x,y] (when the
//      scene has no camera yet), tier
//      ("desktop"|"mobile"|"low"), max_shadow_lights (2), large_light_fraction (0.5 [added]), engine_check (bool,
//      needs graphics: renders once and asks URP's own LayerUtility.CalculateBatches)
//   The 2D light cost model, from the e-book (p. 131 to 132: fill rate, "one large light can have worse
//   performance than several small lights", few sorting layers and blend styles, few shadow lights, Normal
//   Map Quality Fast) and the URP 17.3 source [obs]: consecutive sorting layers share one LIGHT BATCH only
//   if every visible light lights both or neither and every shadow caster shadows both or neither
//   (LayerUtility.CanBatchLightsInLayer); the Render Graph then runs the normal, shadow and light passes
//   ONCE PER BATCH (Renderer2DRendergraph), so a light that skips one layer (a player fill light that
//   excludes Characters, Sasquatch 1h-hSlffawM [00:01:35]) splits batches and every other light that
//   spans them is drawn again. light_fill_screens = sum over batches of the screen fraction of each
//   non-Global light drawn in that batch: a fill-rate proxy to compare setups; the GUI view of the same
//   data is Window > 2D > Light Batching Debugger. Timings: PlayMode LightFillBench (Editor, iteration only).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P5, P5c).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace AgentKit.TwoD
{
    public static class LightJobs
    {
        public static void LightRig()
        {
            AgentJob.Run(() =>
            {
                var scene = EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var root = TwoDUtil.GetOrCreate("Lights2D");
                var created = new List<object>();
                var defaults = new List<object>();

                // remove any other Global light (the template scene ships one): one per blend style per layer
                foreach (var l in UnityEngine.Object.FindObjectsByType<Light2D>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                    if (l.lightType == Light2D.LightType.Global && l.gameObject.name != "Global Light 2D (Agent)")
                        UnityEngine.Object.DestroyImmediate(l.gameObject);

                var gspec = AgentJob.Dict("global");
                var gl = TwoDUtil.GetOrAdd<Light2D>(TwoDUtil.GetOrCreate("Global Light 2D (Agent)", root.transform));
                gl.lightType = Light2D.LightType.Global;
                gl.intensity = (float)AgentJson.ToDouble(gspec.TryGetValue("intensity", out var gi) ? gi : null, 0.3);
                gl.color = TwoDUtil.ToColor(gspec.TryGetValue("color", out var gc) ? gc : null, new Color(0.55f, 0.6f, 0.85f));
                gl.targetSortingLayers = SortingLayer.layers.Select(s => s.id).ToArray();
                gl.blendStyleIndex = 0;
                created.Add(Describe(gl));

                foreach (Dictionary<string, object> p in AgentJob.List("points"))
                {
                    var name = (string)p["name"];
                    Transform parent = root.transform;
                    if (p.TryGetValue("parent", out var par) && par is string ps)
                    {
                        var pgo = GameObject.Find(ps);
                        if (pgo != null) parent = pgo.transform;
                    }
                    var go = TwoDUtil.GetOrCreate(name, parent);
                    bool isNew = go.GetComponent<Light2D>() == null;
                    var l = TwoDUtil.GetOrAdd<Light2D>(go);
                    if (isNew) defaults.Add(new Dictionary<string, object> { { "light", name }, { "shadows_default", l.shadowsEnabled }, { "normal_default", l.normalMapQuality.ToString() }, { "type_default", l.lightType.ToString() } });
                    l.lightType = Light2D.LightType.Point;          // labelled "Spot Light 2D" in the editor
                    if (p.TryGetValue("position", out var pos)) go.transform.position = AgentJson.ToVector3(pos, go.transform.position);
                    else go.transform.localPosition = new Vector3(0, 0.3f, 0);
                    l.color = TwoDUtil.ToColor(p.TryGetValue("color", out var c) ? c : null, new Color(1f, 0.75f, 0.45f));
                    l.intensity = (float)AgentJson.ToDouble(p.TryGetValue("intensity", out var i) ? i : null, 1.2);
                    l.pointLightInnerRadius = (float)AgentJson.ToDouble(p.TryGetValue("inner", out var ir) ? ir : null, 0.5);
                    l.pointLightOuterRadius = (float)AgentJson.ToDouble(p.TryGetValue("outer", out var orr) ? orr : null, 5);
                    l.falloffIntensity = 0.6f;
                    l.shadowsEnabled = p.TryGetValue("shadows", out var sh) && sh is bool b && b;
                    l.shadowIntensity = 0.8f;
                    l.targetSortingLayers = Layers(p);
                    SetNormalMaps(l, (string)(p.TryGetValue("normal", out var n) ? n : "Accurate"), (float)AgentJson.ToDouble(p.TryGetValue("distance", out var d) ? d : null, 3));
                    created.Add(Describe(l));
                }

                foreach (Dictionary<string, object> p in AgentJob.List("sprite_lights"))
                {
                    var go = TwoDUtil.GetOrCreate((string)p["name"], root.transform);
                    var l = TwoDUtil.GetOrAdd<Light2D>(go);
                    l.lightType = Light2D.LightType.Sprite;
                    l.lightCookieSprite = TwoDUtil.Sprite((string)p["sprite"]);
                    go.transform.position = AgentJson.ToVector3(p.TryGetValue("position", out var pos) ? pos : null, Vector3.zero);
                    go.transform.localScale = Vector3.one * (float)AgentJson.ToDouble(p.TryGetValue("scale", out var sc) ? sc : null, 1);
                    l.color = TwoDUtil.ToColor(p.TryGetValue("color", out var c) ? c : null, new Color(1f, 0.95f, 0.8f));
                    l.intensity = (float)AgentJson.ToDouble(p.TryGetValue("intensity", out var i) ? i : null, 0.6);
                    l.shadowsEnabled = false;
                    l.targetSortingLayers = Layers(p);
                    created.Add(Describe(l));
                }

                if (AgentJob.Bool("disable_normals", false))
                    foreach (var l in UnityEngine.Object.FindObjectsByType<Light2D>(FindObjectsSortMode.None))
                        if (l.lightType != Light2D.LightType.Global) SetNormalMaps(l, "Disabled", l.normalMapDistance);

                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                var all = UnityEngine.Object.FindObjectsByType<Light2D>(FindObjectsSortMode.None);
                return new Dictionary<string, object>
                {
                    { "lights", created }, { "defaults_on_add", defaults },
                    { "count", all.Length }, { "shadow_lights", all.Count(x => x.shadowsEnabled && x.lightType != Light2D.LightType.Global) },
                    { "global_lights", all.Count(x => x.lightType == Light2D.LightType.Global) },
                    { "shadow_casters", UnityEngine.Object.FindObjectsByType<ShadowCaster2D>(FindObjectsSortMode.None).Length },
                };
            });
        }

        public static void MoveLight()
        {
            AgentJob.Run(() =>
            {
                var scene = EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var go = GameObject.Find(AgentJob.Str("name")) ?? throw new InvalidOperationException("light not found: " + AgentJob.Str("name"));
                go.transform.position = AgentJson.ToVector3(AgentJob.Args["position"], go.transform.position);
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                return new Dictionary<string, object> { { "light", go.name }, { "position", go.transform.position } };
            });
        }

        public static void LightCost()
        {
            AgentJob.Run(() =>
            {
                EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var cam = CameraJobs.MainCamera(false);
                if (cam == null && !AgentJob.Has("center"))
                    throw new InvalidOperationException("no camera: run CameraJobs.SetupPixelPerfect first, or pass center [x, y] and ortho");
                int W = AgentJob.Int("width", 1920), H = AgentJob.Int("height", 1080);
                float oh = AgentJob.Float("ortho", cam != null ? cam.orthographicSize : 5.625f), ow = oh * W / H;
                var cp = AgentJob.Has("center") ? (Vector3)TwoDUtil.ToVector2(AgentJob.Args["center"], Vector2.zero) : cam.transform.position;
                var view = new Rect(cp.x - ow, cp.y - oh, 2 * ow, 2 * oh);
                string tier = AgentJob.Str("tier", "desktop");
                int maxShadow = AgentJob.Int("max_shadow_lights", 2);
                float large = AgentJob.Float("large_light_fraction", 0.5f);
                var data = Renderer2D();
                float scale = 0.5f;
                if (data != null) scale = new SerializedObject(data).FindProperty("m_LightRenderTextureScale").floatValue;
                var f = new AgentAudit.Findings();

                var lights = UnityEngine.Object.FindObjectsByType<Light2D>(FindObjectsSortMode.None).Where(l => l.isActiveAndEnabled).ToList();
                var cover = new Dictionary<Light2D, float>();
                foreach (var l in lights) cover[l] = l.lightType == Light2D.LightType.Global ? 1f : Coverage(l, view);
                var visible = lights.Where(l => cover[l] > 0f).ToList();
                var casters = UnityEngine.Object.FindObjectsByType<ShadowCaster2D>(FindObjectsSortMode.None)
                    .Where(c => c.isActiveAndEnabled && InView(c, view)).ToList();
                var shadowed = typeof(ShadowCaster2D).GetMethod("IsShadowedLayer", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
                var layers = SortingLayer.layers.OrderBy(x => x.value).ToArray();
                bool Lit(Light2D l, int id) => l.targetSortingLayers.Contains(id);
                bool Shadows(ShadowCaster2D c, int id) => shadowed != null && (bool)shadowed.Invoke(c, new object[] { id });

                // replica of URP 17.3 LayerUtility.CalculateBatches / CanBatchLightsInLayer
                var batches = new List<object>();
                var breaks = new List<object>();
                double fill = 0, shadowFill = 0;
                for (int i = 0; i < layers.Length;)
                {
                    int j = i;
                    string reason = null;
                    for (int k = i + 1; k < layers.Length; k++)
                    {
                        var lb = visible.FirstOrDefault(l => Lit(l, layers[i].id) != Lit(l, layers[k].id));
                        var sb = lb == null ? casters.FirstOrDefault(c => Shadows(c, layers[i].id) != Shadows(c, layers[k].id)) : null;
                        if (lb != null || sb != null) { reason = (lb != null ? "light " + lb.name : "shadow caster " + sb.name) + " treats " + layers[i].name + " and " + layers[k].name + " differently"; break; }
                        j = k;
                    }
                    var ids = Enumerable.Range(i, j - i + 1).Select(x => layers[x].id).ToList();
                    var inBatch = visible.Where(l => l.lightType != Light2D.LightType.Global && ids.Any(id => Lit(l, id))).ToList();
                    double bf = inBatch.Sum(l => cover[l]);
                    double sf = inBatch.Where(l => l.shadowsEnabled).Sum(l => cover[l]);
                    fill += bf; shadowFill += sf;
                    batches.Add(new Dictionary<string, object> { { "layers", Enumerable.Range(i, j - i + 1).Select(x => layers[x].name).ToList() },
                        { "lights", inBatch.Select(l => l.name).ToList() }, { "fill_screens", Math.Round(bf, 3) }, { "shadow_fill_screens", Math.Round(sf, 3) } });
                    if (reason != null) { breaks.Add(reason); f.Add("info", "2d.light_batch_break", layers[j].name + "|" + layers[Math.Min(j + 1, layers.Length - 1)].name, reason, "few sorting layers; give lights the same Target Sorting Layers where the look allows it (e-book p. 131)"); }
                    i = j + 1;
                }

                var perLight = new List<object>();
                foreach (var l in visible)
                {
                    perLight.Add(new Dictionary<string, object> { { "name", l.name }, { "type", l.lightType.ToString() }, { "coverage", Math.Round(cover[l], 4) },
                        { "blend_style", l.blendStyleIndex }, { "shadows", l.shadowsEnabled && l.lightType != Light2D.LightType.Global }, { "normal_maps", l.normalMapQuality.ToString() },
                        { "target_layers", l.targetSortingLayers.Select(SortingLayer.IDToName).ToList() } });
                    if (l.lightType != Light2D.LightType.Global && cover[l] > large)
                        f.Add("warn", "2d.light_large", l.name, "covers " + (cover[l] * 100).ToString("0") + "% of the view: fill rate (one large light can cost more than several small ones, e-book p. 131)", "smaller radius, or a Global/Sprite light for broad fill");
                    if (tier != "desktop" && l.normalMapQuality == Light2D.NormalMapQuality.Accurate)
                        f.Add("warn", "2d.light_normal_quality", l.name, "Normal Map Quality Accurate on a " + tier + " tier", "Fast on low tiers (e-book p. 131; Sasquatch 1h-hSlffawM [00:04:16])");
                }
                int shadowLights = visible.Count(l => l.shadowsEnabled && l.lightType != Light2D.LightType.Global);
                if (shadowLights > maxShadow) f.Add("warn", "2d.shadow_lights", "scene", shadowLights + " shadow-casting lights in view (budget " + maxShadow + ")", "shadows only where they read");
                var styles = visible.Select(l => l.blendStyleIndex).Distinct().OrderBy(x => x).ToList();

                int engine = -1;
                string engineNote = null;
                if (AgentJob.Bool("engine_check", false) && cam == null) engineNote = "no camera: engine check skipped";
                else if (AgentJob.Bool("engine_check", false))
                {
                    AgentCapture.RequireGraphics();
                    CameraJobs.WarmLights2D();
                    var tmp = System.IO.Path.Combine(AgentJob.OutDir("light_cost"), "engine_check.png");
                    AgentCapture.RenderCamera(cam, W, H, tmp);
                    engine = EngineLightBatches(data, out engineNote);
                }
                double lightPx = W * scale * H * scale;
                return new Dictionary<string, object>
                {
                    { "view", new[] { view.xMin, view.yMin, view.width, view.height } }, { "light_render_scale", scale },
                    { "sorting_layers", layers.Select(x => x.name).ToList() }, { "light_batches", batches.Count }, { "batches", batches }, { "batch_breaks", breaks },
                    { "engine_light_batches", engine }, { "engine_note", engineNote },
                    { "light_fill_screens", Math.Round(fill, 3) }, { "shadow_fill_screens", Math.Round(shadowFill, 3) },
                    { "light_pixels_per_frame", (long)(fill * lightPx) }, { "blend_styles", styles }, { "visible_lights", visible.Count },
                    { "shadow_lights", shadowLights }, { "shadow_casters_in_view", casters.Count }, { "lights", perLight },
                    { "tier", tier }, { "counts", f.Counts() }, { "findings", f.items },
                };
            });
        }

        /// <summary>URP's own batch count for the last rendered camera (internal LayerUtility.CalculateBatches,
        /// the same call the Light Batching Debugger window makes). -1 when the internals moved.</summary>
        public static int EngineLightBatches(Renderer2DData data, out string note)
        {
            note = null;
            if (data == null) { note = "no Renderer2DData"; return -1; }
            var t = typeof(Light2D).Assembly.GetType("UnityEngine.Rendering.Universal.LayerUtility");
            var m = t?.GetMethod("CalculateBatches", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
            if (m == null) { note = "LayerUtility.CalculateBatches not found"; return -1; }
            var args = new object[] { data, 0 };
            try { m.Invoke(null, args); }
            catch (Exception e) { note = "CalculateBatches threw: " + (e.InnerException ?? e).Message; return -1; }
            return (int)args[1];
        }

        public static Renderer2DData Renderer2D()
        {
            var rp = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (rp == null) return null;
            var list = rp.rendererDataList;
            for (int i = 0; i < list.Length; i++)
                if (list[i] is Renderer2DData d) return d;
            return null;
        }

        /// <summary>Fraction of the view rect the light's shape covers (sampled on a 96 x 54 grid).</summary>
        public static float Coverage(Light2D l, Rect view)
        {
            Func<Vector2, bool> inside;
            var p = (Vector2)l.transform.position;
            switch (l.lightType)
            {
                case Light2D.LightType.Point:
                    float r = l.pointLightOuterRadius;
                    inside = q => (q - p).sqrMagnitude <= r * r;
                    break;
                case Light2D.LightType.Sprite:
                    if (l.lightCookieSprite == null) return 0f;
                    var sb = l.lightCookieSprite.bounds;
                    var ls = l.transform.lossyScale;
                    var rect = new Rect(p.x + sb.min.x * ls.x, p.y + sb.min.y * ls.y, sb.size.x * ls.x, sb.size.y * ls.y);
                    inside = q => rect.Contains(q);
                    break;
                default:
                    var path = l.shapePath;
                    if (path == null || path.Length < 3) return 0f;
                    var poly = path.Select(v => (Vector2)l.transform.TransformPoint(v)).ToArray();
                    inside = q => InPolygon(poly, q);
                    break;
            }
            int n = 0, nx = 96, ny = 54;
            for (int y = 0; y < ny; y++)
                for (int x = 0; x < nx; x++)
                    if (inside(new Vector2(view.xMin + (x + 0.5f) * view.width / nx, view.yMin + (y + 0.5f) * view.height / ny))) n++;
            return n / (float)(nx * ny);
        }

        static bool InPolygon(Vector2[] poly, Vector2 q)
        {
            bool c = false;
            for (int i = 0, j = poly.Length - 1; i < poly.Length; j = i++)
                if ((poly[i].y > q.y) != (poly[j].y > q.y) && q.x < (poly[j].x - poly[i].x) * (q.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
            return c;
        }

        static bool InView(Component c, Rect view)
        {
            var r = c.GetComponent<Renderer>();
            var b = r != null ? r.bounds : new Bounds(c.transform.position, Vector3.one);
            return view.Overlaps(new Rect(b.min.x, b.min.y, b.size.x, b.size.y));
        }

        static int[] Layers(Dictionary<string, object> p)
        {
            if (p.TryGetValue("layers", out var ls) && ls is List<object> list && list.Count > 0)
                return list.Select(x => SortingLayer.NameToID(x.ToString())).Where(SortingLayer.IsValid).ToArray();
            return SortingLayer.layers.Select(s => s.id).ToArray();
        }

        /// <summary>normalMapQuality / normalMapDistance have no setters in URP 17.3: write the serialized fields.</summary>
        public static void SetNormalMaps(Light2D l, string quality, float distance)
        {
            var so = new SerializedObject(l);
            var q = quality == "Fast" ? Light2D.NormalMapQuality.Fast : quality == "Accurate" ? Light2D.NormalMapQuality.Accurate : Light2D.NormalMapQuality.Disabled;
            so.FindProperty("m_NormalMapQuality").intValue = (int)q;
            so.FindProperty("m_NormalMapDistance").floatValue = distance;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        public static Dictionary<string, object> Describe(Light2D l)
        {
            return new Dictionary<string, object>
            {
                { "name", l.gameObject.name }, { "type", l.lightType.ToString() }, { "intensity", l.intensity }, { "color", l.color },
                { "blend_style", l.blendStyleIndex }, { "shadows", l.shadowsEnabled }, { "normal_maps", l.normalMapQuality.ToString() },
                { "normal_distance", l.normalMapDistance }, { "outer_radius", l.lightType == Light2D.LightType.Point ? (object)l.pointLightOuterRadius : null },
                { "target_layers", l.targetSortingLayers.Select(SortingLayer.IDToName).ToList() },
                { "position", l.transform.position },
            };
        }
    }
}
