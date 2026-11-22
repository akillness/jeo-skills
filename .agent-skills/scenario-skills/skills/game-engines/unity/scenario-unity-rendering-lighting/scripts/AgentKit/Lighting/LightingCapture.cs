// AgentKit.Lighting v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24). Stage captures for the
// lighting critique loop: the same AgentView_* bookmarks, optionally under a given quality tier,
// plus the pixel rectangle of each named "probe" object (grey cards, a chrome ball) in each shot,
// so ut_lighting.probe_stats can read their exposure and colour from the PNG.
//
// Job (graphics required: ut_run.run_method(..., graphics=True)):
//   AgentKit.Lighting.LightingCapture.CaptureStage   args: scene, stage (label), quality (level
//       name, optional), views (bookmark names; default all AgentView_*), probes (object names),
//       width (1280), height (720), msaa (default: the resolved URP asset's MSAA), out_dir,
//       warmup (0: extra throwaway renders before the kept ones).
//   Returns {stage, quality, render_pipeline, shots [{name, path, ...AgentCapture fields,
//   probes {name: {rect_px [x0, y0, x1, y1] top-left origin, visible, distance}}}],
//   global_keywords {_CLUSTER_LIGHT_LOOP, SHADOWS_SHADOWMASK, LIGHTMAP_SHADOW_MIXING, ...} as URP left
//   them after the last shot: which rendering path and mixed-lighting mode the frame really used}.
//   AgentKit.Lighting.LightingCapture.PassAudit   args: scene, quality, view (bookmark, default the
//       first), width, height. Renders one view, then reads the Render Graph's compiled native render
//       passes: which graph passes merged into one native pass (one load/store on tile-based GPUs)
//       and why each merge broke. The scripted stand-in for the Render Graph Viewer's blue merge
//       line (Unite 2025 K3-wPnhmDi4 [00:30:26]). Reads internal fields by reflection (no public API
//       in 6.3): returns available=false instead of failing if a later version renames them.
// Captures go through AgentCapture.CaptureView (SubmitRenderRequest, warm-up frame included: the
// first frame after a scene load renders materials white, observed 2026-09-24).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Lighting
{
    public static class LightingCapture
    {
        /// <summary>Screen rectangle (PNG pixels, origin top-left) of the central part of a probe
        /// object's bounds as seen from a view, and whether a ray from the camera reaches it.</summary>
        public static Dictionary<string, object> ProbeRect(Vector3 camPos, Quaternion camRot, float fov, int w, int h, GameObject probe, float shrink = 0.5f)
        {
            var r = probe.GetComponent<Renderer>();
            if (r == null) return new Dictionary<string, object> { { "error", "no renderer" } };
            var go = new GameObject("AgentProbeCam") { hideFlags = HideFlags.HideAndDontSave };
            try
            {
                var cam = go.AddComponent<Camera>();
                cam.enabled = false;
                go.transform.SetPositionAndRotation(camPos, camRot);
                cam.fieldOfView = fov;
                cam.aspect = (float)w / h;
                cam.nearClipPlane = 0.05f;
                var b = r.bounds;
                float x0 = 1, y0 = 1, x1 = 0, y1 = 0;
                bool inFront = true;
                for (int i = 0; i < 8; i++)
                {
                    var c = b.center + Vector3.Scale(b.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                    var v = cam.WorldToViewportPoint(c);
                    if (v.z <= 0) inFront = false;
                    x0 = Mathf.Min(x0, v.x); x1 = Mathf.Max(x1, v.x); y0 = Mathf.Min(y0, v.y); y1 = Mathf.Max(y1, v.y);
                }
                var cv = cam.WorldToViewportPoint(b.center);
                float hw = (x1 - x0) * shrink * 0.5f, hh = (y1 - y0) * shrink * 0.5f;
                float cx = cv.x, cy = cv.y;
                int px0 = Mathf.Clamp(Mathf.RoundToInt((cx - hw) * w), 0, w - 1), px1 = Mathf.Clamp(Mathf.RoundToInt((cx + hw) * w), 0, w - 1);
                int py0 = Mathf.Clamp(Mathf.RoundToInt((1 - (cy + hh)) * h), 0, h - 1), py1 = Mathf.Clamp(Mathf.RoundToInt((1 - (cy - hh)) * h), 0, h - 1);
                bool onScreen = inFront && cv.x > 0 && cv.x < 1 && cv.y > 0 && cv.y < 1;
                bool visible = false;
                if (onScreen)
                {
                    Physics.SyncTransforms();
                    var dir = b.center - camPos;
                    visible = !Physics.Raycast(camPos, dir.normalized, out var hit, dir.magnitude + 0.5f) || hit.collider.gameObject == probe;
                }
                return new Dictionary<string, object>
                {
                    { "rect_px", new List<object> { px0, py0, px1, py1 } }, { "on_screen", onScreen }, { "visible", visible },
                    { "pixels", Math.Max(0, px1 - px0) * Math.Max(0, py1 - py0) }, { "distance", Math.Round((b.center - camPos).magnitude, 2) },
                };
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        public static void CaptureStage()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var scenePath = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scenePath)) EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                string quality = AgentJob.Str("quality");
                if (!string.IsNullOrEmpty(quality)) QualitySettings.SetQualityLevel(LightingUtil.QualityIndex(quality), true);
                var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
                int w = AgentJob.Int("width", 1280), h = AgentJob.Int("height", 720);
                int msaa = AgentJob.Has("msaa") ? AgentJob.Int("msaa") : (urp != null ? Mathf.Max(1, urp.msaaSampleCount) : 1);
                var stage = AgentJob.Str("stage", "stage");
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("stage_" + stage);
                Directory.CreateDirectory(outDir);
                var wanted = new HashSet<string>(AgentJob.List("views").Select(o => o.ToString()));
                var probes = AgentJob.List("probes").Select(o => o.ToString()).ToList();
                var template = Camera.main;
                // optional throwaway renders before the kept ones (AgentCapture already renders one warm-up
                // frame). Tried against black metals in Editor captures (baked reflection probes): 3 and 10
                // extra frames did not change them (observed 2026-09-24); verify reflections in a player.
                int warm = AgentJob.Int("warmup", 0);
                var bms = AgentCapture.SceneBookmarks();
                if (bms.Count > 0)
                    for (int i = 0; i < warm; i++)
                        AgentCapture.CaptureView(template, bms[0], 320, 180, Path.Combine(outDir, "_warmup.png"), msaa);
                if (File.Exists(Path.Combine(outDir, "_warmup.png"))) File.Move(Path.Combine(outDir, "_warmup.png"), Path.Combine(AgentJob.OutDir("warmup"), "_warmup_" + stage + ".png"));
                var shots = new List<object>();
                foreach (var bm in AgentCapture.SceneBookmarks())
                {
                    var name = (string)bm["name"];
                    if (wanted.Count > 0 && !wanted.Contains(name)) continue;
                    var file = Path.Combine(outDir, stage + "_" + name + (string.IsNullOrEmpty(quality) ? "" : "_" + quality) + ".png");
                    var shot = AgentCapture.CaptureView(template, bm, w, h, file, msaa);
                    var pos = AgentJson.ToVector3(bm["position"], Vector3.zero);
                    var rot = Quaternion.Euler(AgentJson.ToVector3(bm["rotation"], Vector3.zero));
                    var pr = new Dictionary<string, object>();
                    foreach (var p in probes)
                    {
                        var go = GameObject.Find(p);
                        if (go != null) pr[p] = ProbeRect(pos, rot, (float)AgentJson.ToDouble(bm["fov"], 60), w, h, go);
                    }
                    shot["probes"] = pr;
                    shots.Add(shot);
                }
                if (shots.Count == 0) throw new InvalidOperationException("no AgentView_* bookmarks matched in " + scenePath);
                return new Dictionary<string, object>
                {
                    { "global_keywords", Keywords() },
                    { "stage", stage }, { "scene", EditorSceneManager.GetActiveScene().path },
                    { "quality", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                    { "render_pipeline", urp ? AssetDatabase.GetAssetPath(urp) : "Built-in" }, { "msaa", msaa },
                    { "out_dir", outDir }, { "shots", shots },
                };
            });
        }
        /// <summary>Global keywords URP sets per camera, read after a render: _CLUSTER_LIGHT_LOOP is
        /// Forward+ (and Deferred+), SHADOWS_SHADOWMASK is a Shadowmask mode, LIGHTMAP_SHADOW_MIXING
        /// is Shadowmask (not Distance Shadowmask) or Subtractive.</summary>
        public static readonly string[] PathKeywords =
        {
            "_CLUSTER_LIGHT_LOOP", "SHADOWS_SHADOWMASK", "LIGHTMAP_SHADOW_MIXING", "_MAIN_LIGHT_SHADOWS",
            "_MAIN_LIGHT_SHADOWS_CASCADE", "_ADDITIONAL_LIGHT_SHADOWS", "PROBE_VOLUMES_L1", "PROBE_VOLUMES_L2", "_LIGHT_LAYERS",
        };

        public static Dictionary<string, object> Keywords()
        {
            var d = new Dictionary<string, object>();
            foreach (var k in PathKeywords) d[k] = Shader.IsKeywordEnabled(k);
            return d;
        }

        /// <summary>Native render passes of every registered Render Graph after the last render.</summary>
        public static Dictionary<string, object> DescribeRenderGraphs()
        {
            var res = new Dictionary<string, object>();
            var graphs = new List<object>();
            try
            {
                foreach (var g in UnityEngine.Rendering.RenderGraphModule.RenderGraph.GetRegisteredRenderGraphs())
                {
                    var nc = LightingUtil.GetField(g, "nativeCompiler");
                    var ctx = LightingUtil.GetField(nc, "contextData");
                    var natives = LightingUtil.GetField(ctx, "nativePassData");
                    var passes = LightingUtil.GetField(ctx, "passData");
                    var names = LightingUtil.GetField(ctx, "passNames");
                    string PassName(int id)
                    {
                        var n = LightingUtil.ListItem(names, id);
                        return n == null ? "#" + id : (LightingUtil.GetField(n, "name") as string ?? n.ToString());
                    }
                    int nPasses = LightingUtil.ListLength(passes), culled = 0, inNative = 0;
                    var outside = new List<object>();
                    for (int i = 0; i < nPasses; i++)
                    {
                        var pd = LightingUtil.ListItem(passes, i);
                        if (pd == null) continue;
                        if ((bool)(LightingUtil.GetField(pd, "culled") ?? false)) { culled++; continue; }
                        int nat = System.Convert.ToInt32(LightingUtil.GetField(pd, "nativePassIndex") ?? -1);
                        if (nat >= 0) inNative++;
                        else outside.Add(PassName(System.Convert.ToInt32(LightingUtil.GetField(pd, "passId") ?? i)) + " (" + LightingUtil.GetField(pd, "type") + ")");
                    }
                    var nlist = new List<object>();
                    int nNative = LightingUtil.ListLength(natives), largest = 0;
                    for (int i = 0; i < nNative; i++)
                    {
                        var np = LightingUtil.ListItem(natives, i);
                        int first = System.Convert.ToInt32(LightingUtil.GetField(np, "firstGraphPass") ?? 0);
                        int num = System.Convert.ToInt32(LightingUtil.GetField(np, "numGraphPasses") ?? 0);
                        largest = Math.Max(largest, num);
                        var merged = new List<object>();
                        for (int j = first; j < first + num; j++)
                        {
                            var pd = LightingUtil.ListItem(passes, j);
                            merged.Add(PassName(pd != null ? System.Convert.ToInt32(LightingUtil.GetField(pd, "passId") ?? j) : j));
                        }
                        var audit = LightingUtil.GetField(np, "breakAudit");
                        nlist.Add(new Dictionary<string, object>
                        {
                            { "passes", merged }, { "graph_passes", num },
                            { "break_reason", LightingUtil.GetField(audit, "reason")?.ToString() },
                            { "size", new List<object> { LightingUtil.GetField(np, "width"), LightingUtil.GetField(np, "height") } },
                            { "samples", LightingUtil.GetField(np, "samples") }, { "has_depth", LightingUtil.GetField(np, "hasDepth") },
                            { "attachments", LightingUtil.ListLength(LightingUtil.GetField(np, "attachments")) },
                        });
                    }
                    graphs.Add(new Dictionary<string, object>
                    {
                        { "name", g.name }, { "native_render_passes_enabled", g.nativeRenderPassesEnabled },
                        { "graph_passes", nPasses }, { "culled", culled }, { "in_native_passes", inNative },
                        { "native_pass_count", nNative }, { "largest_merge", largest }, { "native_passes", nlist },
                        { "outside_native_passes", outside },
                    });
                }
                res["available"] = graphs.Count > 0;
                if (graphs.Count == 0) res["error"] = "no registered Render Graph (nothing rendered, or -nographics)";
            }
            catch (Exception e)
            {
                res["available"] = false;
                res["error"] = e.GetType().Name + ": " + e.Message;
            }
            res["graphs"] = graphs;
            return res;
        }

        public static void PassAudit()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var scenePath = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scenePath)) EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                string quality = AgentJob.Str("quality");
                if (!string.IsNullOrEmpty(quality)) QualitySettings.SetQualityLevel(LightingUtil.QualityIndex(quality), true);
                var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
                int w = AgentJob.Int("width", 1280), h = AgentJob.Int("height", 720);
                int msaa = urp != null ? Mathf.Max(1, urp.msaaSampleCount) : 1;
                var bms = AgentCapture.SceneBookmarks();
                if (bms.Count == 0) throw new InvalidOperationException("no AgentView_* bookmark in the scene");
                var view = AgentJob.Str("view");
                var bm = string.IsNullOrEmpty(view) ? bms[0] : bms.FirstOrDefault(b => (string)b["name"] == view) ?? throw new ArgumentException("no bookmark " + view);
                var outDir = AgentJob.OutDir("pass_audit");
                Directory.CreateDirectory(outDir);
                var file = Path.Combine(outDir, "pass_" + bm["name"] + (string.IsNullOrEmpty(quality) ? "" : "_" + quality) + ".png");
                var shot = AgentCapture.CaptureView(Camera.main, bm, w, h, file, msaa);
                var rg = DescribeRenderGraphs();
                var r0 = urp ? LightingUtil.RendererData(urp) : null;
                return new Dictionary<string, object>
                {
                    { "quality", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                    { "render_pipeline", urp ? AssetDatabase.GetAssetPath(urp) : null },
                    { "rendering_path", r0 ? r0.renderingMode.ToString() : null },
                    { "depth_texture", urp && urp.supportsCameraDepthTexture }, { "opaque_texture", urp && urp.supportsCameraOpaqueTexture },
                    { "depth_texture_mode", r0 ? r0.copyDepthMode.ToString() : null }, { "msaa", msaa },
                    { "graphics_device", SystemInfo.graphicsDeviceType.ToString() },
                    { "shot", shot["path"] }, { "render_graph", rg }, { "global_keywords", Keywords() },
                };
            });
        }
    }
}
