// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// Procedural VFX textures for prototypes and tests, written as PNG and imported with VFX import
// settings. Expert rules applied (sources in references/expert-notes.md):
//   - white or grayscale shapes, colour comes from the particle system or a ramp (Sirhaian 5Mw6
//     [00:04:11], Nordeus YZWK [00:14:18]);
//   - pixels never touch the texture border (Sirhaian 5Mw6 [00:14:14]);
//   - Clamp wrap on one-shot sprites and gradients (Gabriel qh3 [00:10:35]);
//   - mobile import sizes 256 typical, 512 max (Nordeus YZWK [00:46:03]); author big, import small
//     (Truempler KaN [00:18:38]): maxTextureSize is the import cap, the PNG can be larger.
// These are the "simple mathematical shapes" that are faster to generate than to source
// (Truempler's flowchart); painted or simulated media (real smoke, explosions) should be borrowed
// or generated with an image model and imported through ImportVfxTexture.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Vfx
{
    public static class VfxTextures
    {
        public const string DefaultFolder = "Assets/VFX/Textures";

        // ------------------------------------------------------------------ noise
        static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                int h = x * 374761393 + y * 668265263 + seed * 1442695041;
                h = (h ^ (h >> 13)) * 1274126177;
                return ((h ^ (h >> 16)) & 0x7fffffff) / (float)int.MaxValue;
            }
        }

        static float ValueNoise(float x, float y, int seed)
        {
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y);
            float xf = x - xi, yf = y - yi;
            float u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            float a = Hash(xi, yi, seed), b = Hash(xi + 1, yi, seed);
            float c = Hash(xi, yi + 1, seed), d = Hash(xi + 1, yi + 1, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, u), Mathf.Lerp(c, d, u), v);
        }

        public static float Fbm(float x, float y, int seed, int octaves = 4)
        {
            float sum = 0, amp = 0.5f, freq = 1, norm = 0;
            for (int i = 0; i < octaves; i++)
            {
                sum += amp * ValueNoise(x * freq, y * freq, seed + i * 17);
                norm += amp;
                amp *= 0.5f;
                freq *= 2.03f;
            }
            return sum / norm;
        }

        static float Smooth(float e0, float e1, float x)
        {
            float t = Mathf.Clamp01((x - e0) / (e1 - e0));
            return t * t * (3 - 2 * t);
        }

        // ------------------------------------------------------------------ generators (white RGB, shape in alpha)
        /// <summary>Soft radial glow: bright core, long falloff, zero at the border.</summary>
        public static Color[] Glow(int size, float core = 0.15f, float power = 2.2f)
        {
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2 - 1, dy = (y + 0.5f) / size * 2 - 1;
                    float r = Mathf.Sqrt(dx * dx + dy * dy);
                    float a = Mathf.Pow(Mathf.Clamp01(1 - r / 0.96f), power);
                    a = Mathf.Max(a, core > 0 ? Smooth(core, 0, r) : 0);
                    px[y * size + x] = new Color(1, 1, 1, Mathf.Clamp01(a));
                }
            return px;
        }

        /// <summary>Spark: small bright core (about 10 px on 64, Sirhaian) plus a very subtle halo.</summary>
        public static Color[] Spark(int size)
        {
            var px = new Color[size * size];
            float coreR = 5f / 64f * 2f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2 - 1, dy = (y + 0.5f) / size * 2 - 1;
                    float r = Mathf.Sqrt(dx * dx + dy * dy);
                    float core = Smooth(coreR * 1.4f, coreR * 0.4f, r);
                    float halo = 0.25f * Mathf.Pow(Mathf.Clamp01(1 - r / 0.9f), 3f);
                    px[y * size + x] = new Color(1, 1, 1, Mathf.Clamp01(core + halo));
                }
            return px;
        }

        /// <summary>Grid of variants (cols x rows): flame tongues (kind "flame") or smoke puffs (kind "smoke").
        /// One emitter picks a random cell per particle, which reads as several emitters (Sirhaian, Nordeus).</summary>
        public static Color[] Variants(int size, int cols, int rows, string kind, int seed)
        {
            var px = new Color[size * size];
            int cw = size / cols, ch = size / rows;
            for (int cy = 0; cy < rows; cy++)
                for (int cx = 0; cx < cols; cx++)
                {
                    int s = seed + (cy * cols + cx) * 101;
                    for (int y = 0; y < ch; y++)
                        for (int x = 0; x < cw; x++)
                        {
                            float u = (x + 0.5f) / cw * 2 - 1, v = (y + 0.5f) / ch * 2 - 1; // -1..1, v up
                            float a = kind == "flame" ? FlameShape(u, v, s) : PuffShape(u, v, s, 0f);
                            px[(cy * ch + y) * size + cx * cw + x] = new Color(1, 1, 1, a);
                        }
                }
            return px;
        }

        static float FlameShape(float u, float v, int seed)
        {
            // flame tongue: round base low in the cell, tapering tip; value range from a bright core to soft
            // edges ("clear shape, good range of values, well-defined point of origin", Nordeus YZWK [00:09:22])
            float n = Fbm(u * 2.6f + seed * 0.13f, v * 1.8f - seed * 0.07f, seed);
            float lean = (Fbm(v * 1.3f, seed * 0.3f, seed + 9) - 0.5f) * 0.5f * (v + 1) * 0.5f;
            float uu = u - lean;
            float height = Mathf.Clamp01((v + 0.8f) / 1.5f);   // 0 at base, 1 at tip
            float width = Mathf.Lerp(0.72f, 0.08f, Mathf.Pow(height, 1.15f));
            float baseRound = v < -0.35f ? Mathf.Sqrt(Mathf.Max(0, 1 - Mathf.Pow((v + 0.35f) / 0.45f, 2))) : 1f;
            width *= Mathf.Max(0.05f, baseRound);
            float d = Mathf.Abs(uu) / Mathf.Max(width, 1e-3f);
            float edge = 1 - d + (n - 0.5f) * 0.8f;
            float shape = Smooth(0.0f, 0.55f, edge);
            float core = 0.45f + 0.55f * Smooth(1f, 0.1f, d) * (1f - 0.55f * height);
            float detail = 0.7f + 0.3f * Fbm(u * 6f, v * 4f - seed, seed + 5);
            float a = shape * core * detail * (1f - 0.5f * height * height);
            a *= Smooth(-0.95f, -0.82f, v) * Smooth(0.95f, 0.75f, v);
            return Mathf.Clamp01(a);
        }

        static float PuffShape(float u, float v, int seed, float erosion)
        {
            // soft billow with an internal value range (not a flat silhouette); erosion is a levels-style
            // black point on the density, so shapes break up instead of fading uniformly (Nordeus, Truempler)
            float r = Mathf.Sqrt(u * u + v * v);
            float edgeNoise = Fbm(u * 2.2f + seed * 0.11f, v * 2.2f + seed * 0.05f, seed) + 0.5f * Fbm(u * 6f, v * 6f, seed + 11) - 0.75f;
            float body = Smooth(0.95f, 0.35f, r + edgeNoise * 0.55f);
            float inner = Fbm(u * 3.5f + seed * 0.2f, v * 3.5f - seed * 0.1f, seed + 3, 5);
            float density = body * (0.3f + 0.7f * Mathf.Pow(inner, 1.3f)) * 1.25f;
            float a = Mathf.Clamp01((density - erosion) / Mathf.Max(0.05f, 1f - erosion));
            return a * Smooth(0.98f, 0.82f, r);
        }

        /// <summary>A real animated flipbook (cols x rows frames): a billow that grows and erodes away,
        /// for Texture Sheet Animation with frame blending and a decelerating frame curve (Truempler).</summary>
        public static Color[] BillowFlipbook(int size, int cols, int rows, int seed)
        {
            var px = new Color[size * size];
            int cw = size / cols, ch = size / rows, frames = cols * rows;
            for (int f = 0; f < frames; f++)
            {
                int cx = f % cols, cyTop = f / cols;
                int cy = rows - 1 - cyTop;                      // Unity sheets play from the top-left cell
                float t = frames > 1 ? f / (float)(frames - 1) : 0;
                float scale = Mathf.Lerp(0.6f, 0.95f, Mathf.Sqrt(t));
                float erosion = Mathf.Lerp(0.0f, 0.8f, Mathf.Pow(t, 1.6f));
                for (int y = 0; y < ch; y++)
                    for (int x = 0; x < cw; x++)
                    {
                        float u = ((x + 0.5f) / cw * 2 - 1) / scale, v = ((y + 0.5f) / ch * 2 - 1) / scale;
                        // the same noise field scrolls upward with t, so frames stay coherent
                        float a = PuffShape(u, v - t * 0.35f, seed, erosion);
                        px[(cy * ch + y) * size + cx * cw + x] = new Color(1, 1, 1, a);
                    }
            }
            return px;
        }

        /// <summary>Horizontal streak for ribbons and trails: bright head on the left (u = 0), gray gradients with a
        /// few white spots, faded to zero at the tail and at the top and bottom edges (Gabriel wvK [00:08:37]).</summary>
        public static Color[] Streak(int w, int h, int seed)
        {
            var px = new Color[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float u = (x + 0.5f) / w, v = (y + 0.5f) / h * 2 - 1;
                    float n = Fbm(u * 6f, v * 1.5f + seed, seed, 3);   // stretched along u = motion-blur look
                    float across = Smooth(1f, 0.15f, Mathf.Abs(v));
                    float along = Smooth(0f, 0.08f, u) * Smooth(1f, 0.92f, u);   // uniform along the ribbon; taper comes from widthOverTrail
                    float spots = Smooth(0.62f, 0.8f, n) * 0.6f;
                    px[y * w + x] = new Color(1, 1, 1, Mathf.Clamp01((0.55f + 0.45f * n + spots) * across * along));
                }
            return px;
        }

        /// <summary>1D colour ramp (LUT) from a gradient, w x 1 (Nordeus: LUTs per class, uncompressed).</summary>
        public static Color[] Ramp(Gradient g, int w)
        {
            var px = new Color[w];
            for (int x = 0; x < w; x++) px[x] = g.Evaluate(x / (float)(w - 1));
            return px;
        }

        // ------------------------------------------------------------------ v0.2: tileable and packed textures (uber shader), marks, normals
        static float PeriodicNoise(float x, float y, int period, int seed)
        {
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y);
            float xf = x - xi, yf = y - yi;
            float u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            int x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
            int x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
            return Mathf.Lerp(Mathf.Lerp(Hash(x0, y0, seed), Hash(x1, y0, seed), u), Mathf.Lerp(Hash(x0, y1, seed), Hash(x1, y1, seed), u), v);
        }

        /// <summary>Tileable fbm in 0..1 (wraps at the texture edge): the scrolling noise of mesh effects.</summary>
        public static float TileFbm(float u, float v, int period, int seed, int octaves = 4)
        {
            float sum = 0, amp = 0.5f, norm = 0;
            int p = period;
            for (int i = 0; i < octaves; i++)
            {
                sum += amp * PeriodicNoise(u * p, v * p, p, seed + i * 31);
                norm += amp;
                amp *= 0.5f;
                p *= 2;
            }
            return sum / norm;
        }

        /// <summary>Channel-packed tileable texture for the uber shader (Nordeus: channels are options of the same
        /// texture): R = soft fbm (main gray and alpha), G = ridged high-contrast noise (emission mask), B = a second
        /// soft fbm (alpha override). A = 1. Import with Repeat wrap.</summary>
        public static Color[] Packed(int size, int seed, int period = 4)
        {
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float u = x / (float)size, v = y / (float)size;
                    float r = TileFbm(u, v, period, seed);
                    float ridge = 1f - Mathf.Abs(2f * TileFbm(u, v, period, seed + 7) - 1f);
                    float g = Mathf.Pow(Mathf.Clamp01(ridge), 4f);
                    float b = TileFbm(u, v, period * 2, seed + 13);
                    r = Mathf.Clamp01((r - 0.25f) / 0.55f);     // widen the value range (Nordeus: a good range of values)
                    px[y * size + x] = new Color(r, g, b, 1f);
                }
            return px;
        }

        /// <summary>Scorch mark for an alpha-blended layer (white RGB, color from the particle): irregular radial
        /// alpha, darkest in the centre, edge broken by noise, zero at the border.</summary>
        public static Color[] Scorch(int size, int seed)
        {
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2 - 1, dy = (y + 0.5f) / size * 2 - 1;
                    float r = Mathf.Sqrt(dx * dx + dy * dy);
                    float n = Fbm(dx * 3f + seed, dy * 3f - seed, seed, 4);
                    float body = Smooth(0.92f, 0.35f, r + (n - 0.5f) * 0.45f);
                    px[y * size + x] = new Color(1, 1, 1, Mathf.Clamp01(body * (0.55f + 0.45f * n)) * Smooth(0.98f, 0.88f, r));
                }
            return px;
        }

        /// <summary>Tangent-space ripple normal map (for URP particle distortion tests), packed 0.5 + 0.5 n.</summary>
        public static Color[] RippleNormal(int size, float rings = 5f)
        {
            var px = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2 - 1, dy = (y + 0.5f) / size * 2 - 1;
                    float r = Mathf.Sqrt(dx * dx + dy * dy) + 1e-4f;
                    float slope = Mathf.Cos(r * rings * Mathf.PI * 2f) * Smooth(1f, 0.6f, r) * 0.8f;
                    var n = new Vector3(-dx / r * slope, -dy / r * slope, 1f).normalized;
                    px[y * size + x] = new Color(n.x * 0.5f + 0.5f, n.y * 0.5f + 0.5f, n.z * 0.5f + 0.5f, 1f);
                }
            return px;
        }

        /// <summary>Fraction of border pixels whose alpha exceeds a threshold (should be 0: Sirhaian's rule).</summary>
        public static float BorderLeak(Color[] px, int w, int h, float threshold = 0.02f)
        {
            int n = 0, bad = 0;
            for (int x = 0; x < w; x++) { n += 2; if (px[x].a > threshold) bad++; if (px[(h - 1) * w + x].a > threshold) bad++; }
            for (int y = 0; y < h; y++) { n += 2; if (px[y * w].a > threshold) bad++; if (px[y * w + w - 1].a > threshold) bad++; }
            return n > 0 ? bad / (float)n : 0;
        }

        // ------------------------------------------------------------------ write and import
        public class ImportSpec
        {
            public int maxSize = 256;
            public bool mipmaps = true;
            public bool sRGB = true;
            public TextureWrapMode wrap = TextureWrapMode.Clamp;
            public bool alphaIsTransparency = true;
            public TextureImporterCompression compression = TextureImporterCompression.Compressed;
            public TextureImporterType type = TextureImporterType.Default;
        }

        /// <summary>Write pixels as PNG under Assets, import with VFX settings, return the Texture2D.</summary>
        public static Texture2D WritePng(string assetPath, Color[] px, int w, int h, ImportSpec spec)
        {
            var dir = Path.GetDirectoryName(assetPath);
            Directory.CreateDirectory(Path.Combine(AgentJob.ProjectRoot, dir));
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false, !spec.sRGB);
            tex.SetPixels(px);
            tex.Apply();
            File.WriteAllBytes(Path.Combine(AgentJob.ProjectRoot, assetPath), tex.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(tex);
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport);
            ImportVfxTexture(assetPath, spec);
            return AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
        }

        /// <summary>Apply VFX import settings to any texture (generated, borrowed or from an image model).</summary>
        public static TextureImporter ImportVfxTexture(string assetPath, ImportSpec spec)
        {
            var ti = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (ti == null) throw new InvalidOperationException("not a texture: " + assetPath);
            ti.textureType = spec.type;
            ti.alphaSource = TextureImporterAlphaSource.FromInput;
            ti.alphaIsTransparency = spec.type == TextureImporterType.Default && spec.alphaIsTransparency;
            ti.sRGBTexture = spec.sRGB;
            ti.mipmapEnabled = spec.mipmaps;
            ti.wrapMode = spec.wrap;
            ti.maxTextureSize = spec.maxSize;
            ti.textureCompression = spec.compression;
            ti.npotScale = TextureImporterNPOTScale.ToNearest;
            ti.SaveAndReimport();
            return ti;
        }

        /// <summary>Generate the standard VFX texture set used by the fireball kit. Returns name -> asset path.</summary>
        public static Dictionary<string, string> MakeStandardSet(string folder = DefaultFolder, int seed = 7)
        {
            var res = new Dictionary<string, string>();
            var small = new ImportSpec { maxSize = 64 };
            var sheet = new ImportSpec { maxSize = 256 };
            var flip = new ImportSpec { maxSize = 512 };
            var ramp = new ImportSpec { maxSize = 256, mipmaps = false, compression = TextureImporterCompression.Uncompressed, alphaIsTransparency = false };
            WritePng(folder + "/T_Glow.png", Glow(64), 64, 64, small); res["glow"] = folder + "/T_Glow.png";
            WritePng(folder + "/T_Spark.png", Spark(64), 64, 64, small); res["spark"] = folder + "/T_Spark.png";
            WritePng(folder + "/T_Flame_2x2.png", Variants(256, 2, 2, "flame", seed), 256, 256, sheet); res["flame"] = folder + "/T_Flame_2x2.png";
            WritePng(folder + "/T_Smoke_2x2.png", Variants(256, 2, 2, "smoke", seed + 50), 256, 256, sheet); res["smoke"] = folder + "/T_Smoke_2x2.png";
            WritePng(folder + "/T_Billow_4x4.png", BillowFlipbook(512, 4, 4, seed + 80), 512, 512, flip); res["billow"] = folder + "/T_Billow_4x4.png";
            WritePng(folder + "/T_Streak.png", Streak(128, 32, seed), 128, 32, new ImportSpec { maxSize = 128 }); res["streak"] = folder + "/T_Streak.png";
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(new Color(0.05f, 0.02f, 0.02f), 0), new GradientColorKey(new Color(0.9f, 0.25f, 0.05f), 0.45f),
                              new GradientColorKey(new Color(1f, 0.75f, 0.2f), 0.8f), new GradientColorKey(Color.white, 1) },
                      new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(1, 1) });
            WritePng(folder + "/T_Ramp_Fire.png", Ramp(g, 256), 256, 1, ramp); res["ramp"] = folder + "/T_Ramp_Fire.png";
            WritePng(folder + "/T_Scorch.png", Scorch(128, seed), 128, 128, new ImportSpec { maxSize = 128 }); res["scorch"] = folder + "/T_Scorch.png";
            return res;
        }
    }
}
