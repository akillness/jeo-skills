// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// Budgets an agent can measure without a Profiler window or a device:
//   Overdraw(cam, renderers)  exact transparent layer count per pixel: every ParticleSystemRenderer
//                             (and its trails) is baked for the camera (BakeMesh/BakeTrailsMesh) and
//                             drawn with Hidden/AgentKit/VfxOverdraw into a half-float target through a
//                             CommandBuffer. Reports full-screen equivalents (FSE = fragments / screen
//                             pixels, resolution independent), max and p95 layers, coverage, and a heatmap.
//   Counts(roots)             live particles per effect and per system, versus maxParticles.
//   VisualRadius(systems)     how far the primary layers reach from the effect origin (hitbox check).
//   ScreenTexel(cam, roots)   largest on-screen size of each layer's particles in pixels versus the texels its
//                             texture puts across them: import size follows the closest screen coverage
//                             (Simon Truempler KaN [00:18:38] [00:20:04]: author big, import at what the particle needs).
//   FlipbookCells(ps, cam)    which sheet cell every live particle shows (baked UVs): proves a random FIXED frame
//                             per particle (Sirhaian 5Mw6 [00:05:58]; Nordeus YZWK [00:37:12]) versus animation.
// Why overdraw first: "draw calls and overdraw, the second one being a much bigger pain than the
// first one" (Nikola Damjanov, Spellsouls, YZWK [00:24:35]). Overdraw is per rasterized fragment, so
// transparent texels with alpha 0 still cost: tight meshes and octagons cut it (Orson Favrel uNz).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace AgentKit.Vfx
{
    public static class VfxBudget
    {
        public const string OverdrawShader = "Hidden/AgentKit/VfxOverdraw";
        static Material s_Mat;

        static Material Mat()
        {
            if (s_Mat != null) return s_Mat;
            var sh = Shader.Find(OverdrawShader);
            if (sh == null) throw new InvalidOperationException(OverdrawShader + " not found: install scripts/Shaders/VfxOverdraw.shader (ut_vfx.install)");
            s_Mat = new Material(sh) { hideFlags = HideFlags.HideAndDontSave };
            return s_Mat;
        }

        static readonly (float v, Color c)[] Ramp =
        {
            (0f, Color.black), (1f, new Color(0.1f, 0.2f, 0.9f)), (2f, new Color(0.1f, 0.8f, 0.3f)),
            (4f, new Color(1f, 0.9f, 0.1f)), (8f, new Color(1f, 0.2f, 0.05f)), (16f, Color.white),
        };

        static Color Heat(float v)
        {
            if (v <= 0) return Color.black;
            for (int i = 1; i < Ramp.Length; i++)
                if (v <= Ramp[i].v) return Color.Lerp(Ramp[i - 1].c, Ramp[i].c, (v - Ramp[i - 1].v) / (Ramp[i].v - Ramp[i - 1].v));
            return Color.white;
        }

        /// <summary>Overdraw of the given renderers seen from cam at w x h. heatmapPath optional (PNG:
        /// black 0, blue 1, green 2, yellow 4, red 8, white 16+ layers).</summary>
        public static Dictionary<string, object> Overdraw(Camera cam, IEnumerable<Renderer> renderers, int w, int h, string heatmapPath = null)
        {
            AgentCapture.RequireGraphics();
            var mat = Mat();
            var rt = new RenderTexture(w, h, 0, RenderTextureFormat.ARGBHalf, RenderTextureReadWrite.Linear) { name = "VfxOverdrawRT" };
            rt.Create();
            var meshes = new List<Mesh>();
            var cmd = new CommandBuffer { name = "VfxOverdraw" };
            int drawn = 0, triangles = 0;
            try
            {
                // aspect must match w/h: set Camera.aspect before calling (VfxSequence does); not restored here
                // because assigning aspect (even the old value) freezes it and disables auto-aspect.
                cmd.SetRenderTarget(rt);
                cmd.ClearRenderTarget(true, true, Color.clear);
                cmd.SetViewProjectionMatrices(cam.worldToCameraMatrix, cam.projectionMatrix);
                var opts = ParticleSystemBakeMeshOptions.BakePosition | ParticleSystemBakeMeshOptions.BakeRotationAndScale;
                foreach (var r in renderers)
                {
                    if (r == null || !r.enabled || !r.gameObject.activeInHierarchy) continue;
                    if (r is ParticleSystemRenderer pr)
                    {
                        var ps = pr.GetComponent<ParticleSystem>();
                        if (pr.renderMode != ParticleSystemRenderMode.None && pr.sharedMaterial != null && ps.particleCount > 0)
                        {
                            var m = new Mesh { name = pr.name + "_bake" };
                            pr.BakeMesh(m, cam, opts);
                            meshes.Add(m);
                        }
                        if (ps.trails.enabled && pr.trailMaterial != null && ps.particleCount > 0)
                        {
                            var m = new Mesh { name = pr.name + "_trail" };
                            pr.BakeTrailsMesh(m, cam, opts);
                            meshes.Add(m);
                        }
                    }
                    else if (r is TrailRenderer tr)
                    {
                        var m = new Mesh { name = tr.name + "_trail" };
                        tr.BakeMesh(m, cam, true);
                        meshes.Add(m);
                    }
                }
                foreach (var m in meshes)
                {
                    if (m.vertexCount == 0) continue;
                    for (int s = 0; s < m.subMeshCount; s++)
                    {
                        cmd.DrawMesh(m, Matrix4x4.identity, mat, s, 0);
                        triangles += (int)m.GetIndexCount(s) / 3;
                    }
                    drawn++;
                }
                Graphics.ExecuteCommandBuffer(cmd);

                var prev = RenderTexture.active;
                RenderTexture.active = rt;
                var tex = new Texture2D(w, h, TextureFormat.RGBAHalf, false, true);
                tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                tex.Apply();
                RenderTexture.active = prev;
                var px = tex.GetPixels();
                UnityEngine.Object.DestroyImmediate(tex);

                int n = w * h, covered = 0, over2 = 0, over4 = 0, over8 = 0;
                double sum = 0;
                float max = 0;
                var hist = new int[33];
                for (int i = 0; i < n; i++)
                {
                    float v = Mathf.Round(px[i].r);
                    if (v <= 0) continue;
                    covered++;
                    sum += v;
                    if (v > max) max = v;
                    if (v > 2) over2++;
                    if (v > 4) over4++;
                    if (v > 8) over8++;
                    hist[Mathf.Min(32, (int)v)]++;
                }
                float p95 = 0;
                if (covered > 0)
                {
                    int target = (int)(covered * 0.95f), acc = 0;
                    for (int k = 1; k < hist.Length; k++) { acc += hist[k]; if (acc >= target) { p95 = k; break; } }
                }
                if (!string.IsNullOrEmpty(heatmapPath))
                {
                    var outTex = new Texture2D(w, h, TextureFormat.RGBA32, false, false);
                    var cols = new Color32[n];
                    for (int i = 0; i < n; i++) cols[i] = Heat(Mathf.Round(px[i].r));
                    outTex.SetPixels32(cols);
                    outTex.Apply();
                    Directory.CreateDirectory(Path.GetDirectoryName(heatmapPath));
                    File.WriteAllBytes(heatmapPath, outTex.EncodeToPNG());
                    UnityEngine.Object.DestroyImmediate(outTex);
                }
                return new Dictionary<string, object>
                {
                    { "width", w }, { "height", h }, { "meshes_drawn", drawn }, { "triangles", triangles },
                    { "fse", Math.Round(sum / n, 4) },                                   // full-screen equivalents of fill
                    { "coverage", Math.Round(covered / (double)n, 4) },                  // share of the screen touched
                    { "mean_layers_covered", covered > 0 ? Math.Round(sum / covered, 3) : 0 },
                    { "max_layers", max }, { "p95_layers", p95 },
                    { "share_over2", covered > 0 ? Math.Round(over2 / (double)covered, 4) : 0 },
                    { "share_over4", covered > 0 ? Math.Round(over4 / (double)covered, 4) : 0 },
                    { "share_over8", covered > 0 ? Math.Round(over8 / (double)covered, 4) : 0 },
                    { "heatmap", heatmapPath },
                };
            }
            finally
            {
                cmd.Release();
                foreach (var m in meshes) UnityEngine.Object.DestroyImmediate(m);
                rt.Release();
                UnityEngine.Object.DestroyImmediate(rt);
            }
        }

        /// <summary>Live particles of each root effect (sum over its systems) and the per-system detail.</summary>
        public static Dictionary<string, object> Counts(IEnumerable<GameObject> roots)
        {
            int total = 0, maxSum = 0;
            var perRoot = new Dictionary<string, object>();
            var saturated = new List<string>();
            foreach (var root in roots)
            {
                if (root == null) continue;
                int alive = 0;
                var systems = new Dictionary<string, object>();
                foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
                {
                    var r = ps.GetComponent<ParticleSystemRenderer>();
                    if (r == null || !r.enabled) continue;
                    int c = ps.particleCount;
                    alive += c;
                    maxSum += ps.main.maxParticles;
                    systems[ps.name] = c;
                    // a capped rate-driven emitter silently stops emitting (holes, pops); burst-only systems sized
                    // exactly to their burst are fine, so only rate emitters are flagged
                    bool rateDriven = ps.emission.rateOverTime.constantMax > 0 || ps.emission.rateOverDistance.constantMax > 0;
                    if (rateDriven && c >= ps.main.maxParticles && ps.main.maxParticles > 1) saturated.Add(root.name + "/" + ps.name);
                }
                total += alive;
                perRoot[root.name] = new Dictionary<string, object> { { "alive", alive }, { "systems", systems } };
            }
            return new Dictionary<string, object> { { "total_alive", total }, { "max_particles_sum", maxSum }, { "per_effect", perRoot }, { "saturated", saturated } };
        }

        /// <summary>Largest distance from origin reached by the particles of the named systems (position +
        /// half size): the visual boundary to compare with the gameplay radius (Keyser BOE8 [00:11:21]).</summary>
        public static float VisualRadius(GameObject root, Vector3 origin, params string[] systemNames)
        {
            float best = 0;
            var buf = new ParticleSystem.Particle[256];
            foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
            {
                if (systemNames.Length > 0 && !systemNames.Contains(ps.name)) continue;
                int n = ps.GetParticles(buf);
                bool world = ps.main.simulationSpace == ParticleSystemSimulationSpace.World;
                float scale = ps.transform.lossyScale.x;
                // a mesh particle reaches size x the mesh's extent (a 1 m ring at size 1 spans 2 m), a billboard size / 2
                float extent = 1f;
                var pr = ps.GetComponent<ParticleSystemRenderer>();
                if (pr != null && pr.renderMode == ParticleSystemRenderMode.Mesh && pr.mesh != null)
                {
                    var bs = pr.mesh.bounds.size;
                    extent = Mathf.Max(bs.x, Mathf.Max(bs.y, bs.z));
                }
                for (int i = 0; i < n; i++)
                {
                    var p = world ? buf[i].position : ps.transform.TransformPoint(buf[i].position);
                    float half = 0.5f * extent * buf[i].GetCurrentSize(ps) * (world ? 1f : scale);
                    best = Mathf.Max(best, Vector3.Distance(p, origin) + half);
                }
            }
            return best;
        }

        /// <summary>Per visible layer: the largest projected particle size in pixels at this frame (size x hierarchy
        /// scale x mesh extent, perspective camera), the texels the material's main texture spans across a particle
        /// (texture width / sheet columns x material tiling) and their ratio. ratio &lt; 1: the texture is magnified
        /// (soft or blurry up close); ratio well above 1: memory spent on texels the screen never shows.</summary>
        public static List<Dictionary<string, object>> ScreenTexel(Camera cam, IEnumerable<GameObject> roots, int screenH)
        {
            var list = new List<Dictionary<string, object>>();
            float k = screenH / (2f * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad));
            var buf = new ParticleSystem.Particle[512];
            foreach (var root in roots)
            {
                if (root == null) continue;
                foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
                {
                    var r = ps.GetComponent<ParticleSystemRenderer>();
                    if (r == null || !r.enabled || r.renderMode == ParticleSystemRenderMode.None || r.sharedMaterial == null) continue;
                    int n = ps.GetParticles(buf);
                    if (n == 0) continue;
                    bool world = ps.main.simulationSpace == ParticleSystemSimulationSpace.World;
                    float scale = world ? 1f : ps.transform.lossyScale.x;
                    float extent = 1f;
                    if (r.renderMode == ParticleSystemRenderMode.Mesh && r.mesh != null)
                    {
                        var b = r.mesh.bounds.size;
                        extent = Mathf.Max(b.x, Mathf.Max(b.y, b.z));
                    }
                    float best = 0f;
                    for (int i = 0; i < n; i++)
                    {
                        var p = world ? buf[i].position : ps.transform.TransformPoint(buf[i].position);
                        float d = Vector3.Dot(p - cam.transform.position, cam.transform.forward);
                        if (d <= cam.nearClipPlane) continue;
                        var s3 = buf[i].GetCurrentSize3D(ps);
                        float size = Mathf.Max(s3.x, Mathf.Max(s3.y, s3.z)) * scale * extent;
                        best = Mathf.Max(best, size * k / d);
                    }
                    var mat = r.sharedMaterial;
                    var tex = mat.HasProperty("_BaseMap") ? mat.GetTexture("_BaseMap") : mat.mainTexture;
                    float texels = 0f;
                    string texPath = null;
                    int importMax = 0;
                    float detail = -1f;
                    if (tex != null)
                    {
                        var tsa = ps.textureSheetAnimation;
                        int cols = tsa.enabled ? Mathf.Max(1, tsa.numTilesX) : 1;
                        float tiling = mat.HasProperty("_BaseMap") ? Mathf.Abs(mat.GetTextureScale("_BaseMap").x) : 1f;
                        texels = tex.width / (float)cols * Mathf.Max(tiling, 1e-3f);
                        texPath = AssetDatabase.GetAssetPath(tex);
                        var ti = AssetImporter.GetAtPath(texPath) as TextureImporter;
                        importMax = ti != null ? ti.maxTextureSize : 0;
                        detail = TextureDetail(tex);
                    }
                    list.Add(new Dictionary<string, object>
                    {
                        { "effect", root.name }, { "system", ps.name }, { "mode", r.renderMode.ToString() },
                        { "max_screen_px", Math.Round(best, 1) }, { "texels_across", Math.Round(texels, 1) },
                        { "ratio", best > 0 ? Math.Round(texels / best, 3) : 0 }, { "texture", texPath }, { "import_max", importMax },
                        { "detail", Math.Round(detail, 4) },
                    });
                }
            }
            return list;
        }

        static readonly Dictionary<string, float> s_Detail = new Dictionary<string, float>();

        /// <summary>How much fine detail a texture carries: mean absolute error (0..1) between the texture and a copy
        /// reduced 4x (box) then enlarged back (bilinear), on alpha (luminance when alpha is constant). A soft radial glow
        /// barely changes (0.003 here): magnifying it on screen loses nothing. Noisy flame and smoke sheets change more
        /// (0.007 to 0.012 here): magnified, they turn soft. Read from the PNG/JPG file; -1 otherwise.</summary>
        public static float TextureDetail(Texture tex)
        {
            var path = AssetDatabase.GetAssetPath(tex);
            if (string.IsNullOrEmpty(path)) return -1f;
            if (s_Detail.TryGetValue(path, out float v)) return v;
            var ext = Path.GetExtension(path).ToLowerInvariant();
            v = -1f;
            if (ext == ".png" || ext == ".jpg" || ext == ".jpeg")
            {
                var t = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                try
                {
                    const int k = 4;
                    if (t.LoadImage(File.ReadAllBytes(Path.Combine(AgentJob.ProjectRoot, path))) && t.width >= 2 * k && t.height >= 2 * k)
                    {
                        var px = t.GetPixels32();
                        int w = t.width, h = t.height;
                        bool alpha = false;
                        foreach (var c in px) if (c.a < 250) { alpha = true; break; }
                        var a = new float[w * h];
                        for (int i = 0; i < a.Length; i++)
                            a[i] = alpha ? px[i].a / 255f : (0.2126f * px[i].r + 0.7152f * px[i].g + 0.0722f * px[i].b) / 255f;
                        int dw = w / k, dh = h / k;
                        var d = new float[dw * dh];
                        for (int y = 0; y < dh; y++)
                            for (int x = 0; x < dw; x++)
                            {
                                float sum = 0f;
                                for (int j = 0; j < k; j++) for (int i = 0; i < k; i++) sum += a[(y * k + j) * w + x * k + i];
                                d[y * dw + x] = sum / (k * k);
                            }
                        double err = 0;
                        for (int y = 0; y < h; y++)
                            for (int x = 0; x < w; x++)
                            {
                                float u = Mathf.Clamp((x + 0.5f) / k - 0.5f, 0, dw - 1), vv = Mathf.Clamp((y + 0.5f) / k - 0.5f, 0, dh - 1);
                                int x0 = (int)u, y0 = (int)vv, x1 = Mathf.Min(x0 + 1, dw - 1), y1 = Mathf.Min(y0 + 1, dh - 1);
                                float fx = u - x0, fy = vv - y0;
                                float r = Mathf.Lerp(Mathf.Lerp(d[y0 * dw + x0], d[y0 * dw + x1], fx), Mathf.Lerp(d[y1 * dw + x0], d[y1 * dw + x1], fx), fy);
                                err += Mathf.Abs(a[y * w + x] - r);
                            }
                        v = (float)(err / (w * h));
                    }
                }
                finally { UnityEngine.Object.DestroyImmediate(t); }
            }
            s_Detail[path] = v;
            return v;
        }

        /// <summary>Sheet cell index shown by every live particle of a billboard system with Texture Sheet Animation
        /// (Grid): the particle's quad is baked for the camera and the cell is read from its smallest UV. Two calls
        /// at different times on a burst system list the same particles in the same order: equal lists = fixed frame.</summary>
        public static List<int> FlipbookCells(ParticleSystem ps, Camera cam)
        {
            var cells = new List<int>();
            var r = ps.GetComponent<ParticleSystemRenderer>();
            var tsa = ps.textureSheetAnimation;
            if (r == null || !tsa.enabled) return cells;
            int tx = Mathf.Max(1, tsa.numTilesX), ty = Mathf.Max(1, tsa.numTilesY);
            var m = new Mesh();
            try
            {
                r.BakeMesh(m, cam, ParticleSystemBakeMeshOptions.BakePosition | ParticleSystemBakeMeshOptions.BakeRotationAndScale);
                var uv = m.uv;
                for (int q = 0; q + 3 < uv.Length; q += 4)
                {
                    float u0 = Mathf.Min(Mathf.Min(uv[q].x, uv[q + 1].x), Mathf.Min(uv[q + 2].x, uv[q + 3].x));
                    float v0 = Mathf.Min(Mathf.Min(uv[q].y, uv[q + 1].y), Mathf.Min(uv[q + 2].y, uv[q + 3].y));
                    int col = Mathf.Clamp(Mathf.FloorToInt(u0 * tx + 1e-3f), 0, tx - 1);
                    int row = Mathf.Clamp(Mathf.FloorToInt(v0 * ty + 1e-3f), 0, ty - 1);
                    cells.Add(row * tx + col);
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(m); }
            return cells;
        }
    }
}
