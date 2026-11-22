// scenario-unity-world-building v0.1 (2026-09-24). Pure C# heightfield tools for procedural terrain:
// fractal noise (octaves, persistence, lacunarity, seeded per-octave offsets), island falloff,
// flatten ("leveller") and road corridors, droplet hydraulic erosion, and the metrics the
// skill's gates use (local minima, slope histogram, hash).
//
// Sources: Sebastian Lague, Procedural Landmass E03 (MRNFcywkUSA [00:01:42] octaves, [00:02:16]
// remap to -1..1, [00:07:20] offsets within +-100,000, [00:10:09] clamps); Hydraulic Erosion
// (eaXk97ujbPQ [00:02:12] never erode more than the height difference, [00:02:45] deposit when
// over capacity or uphill); Alba (YOtDVv5-0A4 [00:06:10]) for levellers and road flattening as
// non-destructive inputs. Erosion parameter defaults follow Lague's public repo [added].
// Written from the algorithm descriptions, not copied. Heights are in METRES here; divide by
// TerrainData.size.y before TerrainData.SetHeights (which wants 0..1, indexed [z, x]).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building (EditMode + island job).
using System;
using UnityEngine;

namespace AgentKit.World
{
    [Serializable]
    public struct NoiseSettings
    {
        public int seed;
        public float scale;        // metres per base noise period (larger = broader landforms)
        public int octaves;        // >= 1
        public float persistence;  // 0..1, amplitude multiplier per octave
        public float lacunarity;   // >= 1, frequency multiplier per octave
        public Vector2 offset;     // world offset in metres

        public static NoiseSettings Default => new NoiseSettings
        { seed = 7, scale = 320f, octaves = 6, persistence = 0.5f, lacunarity = 2f, offset = Vector2.zero };

        /// <summary>Lague's OnValidate clamps as a function: invalid values never reach the generator.</summary>
        public NoiseSettings Clamped()
        {
            var s = this;
            s.octaves = Mathf.Clamp(s.octaves, 1, 12);
            s.persistence = Mathf.Clamp01(s.persistence);
            s.lacunarity = Mathf.Max(1f, s.lacunarity);
            s.scale = Mathf.Max(0.0001f, s.scale);
            return s;
        }
    }

    [Serializable]
    public struct ErosionSettings
    {
        public int seed;
        public int droplets;
        public int radius;             // brush radius in cells (2..8)
        public float inertia;          // 0 = follow gradient, 1 = keep direction
        public float capacityFactor;
        public float minCapacity;
        public float erodeSpeed;
        public float depositSpeed;
        public float evaporateSpeed;
        public float gravity;
        public int maxLifetime;

        public static ErosionSettings Default => new ErosionSettings
        {
            seed = 11, droplets = 200000, radius = 3, inertia = 0.05f, capacityFactor = 4f, minCapacity = 0.01f,
            erodeSpeed = 0.3f, depositSpeed = 0.3f, evaporateSpeed = 0.01f, gravity = 4f, maxLifetime = 30,
        };
    }

    public static class WorldNoise
    {
        /// <summary>Fractal (fBm) Perlin noise in -1..1 per octave, summed, NOT normalized per map:
        /// divided by the theoretical amplitude sum so adjacent chunks sampled with the same settings
        /// match at their seams (per-map InverseLerp normalization breaks seams, Lague E03 [added]).
        /// Samples in world metres. Returns values roughly in -1..1.</summary>
        public static float Fbm(float wx, float wz, NoiseSettings s, Vector2[] octaveOffsets)
        {
            float amp = 1f, freq = 1f, sum = 0f, norm = 0f;
            for (int o = 0; o < s.octaves; o++)
            {
                float sx = (wx + s.offset.x) / s.scale * freq + octaveOffsets[o].x;
                float sz = (wz + s.offset.y) / s.scale * freq + octaveOffsets[o].y;
                sum += (Mathf.PerlinNoise(sx, sz) * 2f - 1f) * amp;
                norm += amp;
                amp *= s.persistence;
                freq *= s.lacunarity;
            }
            return sum / Mathf.Max(1e-6f, norm);
        }

        /// <summary>Seeded per-octave offsets. Kept within +-10,000: Mathf.PerlinNoise returns a
        /// constant for very large inputs (Lague keeps +-100,000; smaller keeps float precision).</summary>
        public static Vector2[] OctaveOffsets(NoiseSettings s)
        {
            var prng = new System.Random(s.seed);
            var offs = new Vector2[Mathf.Max(1, s.octaves)];
            for (int i = 0; i < offs.Length; i++)
                offs[i] = new Vector2(prng.Next(-10000, 10000) + 0.37f, prng.Next(-10000, 10000) + 0.61f);
            return offs;
        }

        /// <summary>Island heightfield in metres, res x res samples over size x size metres.
        /// Inland factor (1 at the centre, 0 at a noise-perturbed coastline) shapes fBm hills; past
        /// the coast the ground falls to the seabed over a shelf. Hills rise toward the interior, so
        /// the coast reads as beach and the centre as high ground.</summary>
        public static float[,] Island(int res, float size, NoiseSettings s, float seaLevel, float peak,
                                      float coastRadius, float seabed, float shelf = 90f)
        {
            s = s.Clamped();
            var offs = OctaveOffsets(s);
            var coastNoise = s; coastNoise.seed = s.seed + 101; coastNoise.octaves = 3; coastNoise.scale = s.scale * 0.9f;
            var coastOffs = OctaveOffsets(coastNoise);
            var h = new float[res, res];
            float c = size * 0.5f, step = size / (res - 1);
            for (int z = 0; z < res; z++)
            for (int x = 0; x < res; x++)
            {
                float wx = x * step, wz = z * step;
                float dx = wx - c, dz = wz - c;
                float r = Mathf.Sqrt(dx * dx + dz * dz);
                float coast = coastRadius * (1f + 0.25f * Fbm(wx, wz, coastNoise, coastOffs));
                float inland = Mathf.Clamp01((coast - r) / coast);                    // 0 at the coast, 1 at the centre
                float n = Fbm(wx, wz, s, offs) * 0.5f + 0.5f;                          // 0..1
                float hills = Mathf.Pow(n, 1.3f) * (peak - seaLevel) * Mathf.Pow(inland, 0.7f) * 1.4f;
                float land = seaLevel + 1.5f + Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(inland * 12f)) * 1.5f + hills;
                if (r <= coast) h[z, x] = land;
                else h[z, x] = Mathf.Lerp(seaLevel + 1.5f, seabed, Mathf.SmoothStep(0f, 1f, Mathf.Clamp01((r - coast) / shelf)));
            }
            return h;
        }

        /// <summary>Median of the heights inside an ellipse: a plateau target that sits in the land
        /// instead of carving a crater or a mesa.</summary>
        public static float MedianInEllipse(float[,] h, float size, Vector2 centre, Vector2 radii)
        {
            int res = h.GetLength(0);
            float step = size / (res - 1);
            var vals = new System.Collections.Generic.List<float>();
            for (int z = 0; z < res; z += 2)
            for (int x = 0; x < res; x += 2)
            {
                float dx = (x * step - centre.x) / radii.x, dz = (z * step - centre.y) / radii.y;
                if (dx * dx + dz * dz <= 1f) vals.Add(h[z, x]);
            }
            if (vals.Count == 0) return 0f;
            vals.Sort();
            return vals[vals.Count / 2];
        }

        /// <summary>Alba-style leveller: blend heights toward a target inside an ellipse with a
        /// smooth border (flat plateau for a village). Non-destructive in the sense that it is an
        /// input re-applied on every regeneration.</summary>
        public static void Flatten(float[,] h, float size, Vector2 centre, Vector2 radii, float target, float border)
        {
            int res = h.GetLength(0);
            float step = size / (res - 1);
            for (int z = 0; z < res; z++)
            for (int x = 0; x < res; x++)
            {
                float dx = (x * step - centre.x) / radii.x, dz = (z * step - centre.y) / radii.y;
                float d = Mathf.Sqrt(dx * dx + dz * dz);           // 1 at the ellipse edge
                float w = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(1f, 1f + border, d));
                if (w > 0f) h[z, x] = Mathf.Lerp(h[z, x], target, w);
            }
        }

        /// <summary>Road corridor: flatten across a polyline (sampled from a spline) so the road
        /// lies on the terrain, with a shoulder blend. Returns the corridor mask (0..1) at heightmap
        /// resolution, reused to paint the road layer and to exclude trees and details.</summary>
        public static float[,] FlattenCorridor(float[,] h, float size, Vector3[] path, float halfWidth, float shoulder)
        {
            int res = h.GetLength(0);
            float step = size / (res - 1);
            var mask = new float[res, res];
            var target = new float[res, res];
            int reach = Mathf.CeilToInt((halfWidth + shoulder) / step) + 1;
            for (int i = 0; i < path.Length - 1; i++)
            {
                Vector3 a = path[i], b = path[i + 1];
                int x0 = Mathf.Clamp(Mathf.FloorToInt(Mathf.Min(a.x, b.x) / step) - reach, 0, res - 1);
                int x1 = Mathf.Clamp(Mathf.CeilToInt(Mathf.Max(a.x, b.x) / step) + reach, 0, res - 1);
                int z0 = Mathf.Clamp(Mathf.FloorToInt(Mathf.Min(a.z, b.z) / step) - reach, 0, res - 1);
                int z1 = Mathf.Clamp(Mathf.CeilToInt(Mathf.Max(a.z, b.z) / step) + reach, 0, res - 1);
                Vector2 A = new Vector2(a.x, a.z), B = new Vector2(b.x, b.z), AB = B - A;
                float len2 = Mathf.Max(1e-6f, AB.sqrMagnitude);
                for (int z = z0; z <= z1; z++)
                for (int x = x0; x <= x1; x++)
                {
                    var P = new Vector2(x * step, z * step);
                    float t = Mathf.Clamp01(Vector2.Dot(P - A, AB) / len2);
                    float d = Vector2.Distance(P, A + AB * t);
                    float w = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(halfWidth, halfWidth + shoulder, d));
                    if (w > mask[z, x]) { mask[z, x] = w; target[z, x] = Mathf.Lerp(a.y, b.y, t); }
                }
            }
            for (int z = 0; z < res; z++)
            for (int x = 0; x < res; x++)
                if (mask[z, x] > 0f) h[z, x] = Mathf.Lerp(h[z, x], target[z, x], mask[z, x]);
            return mask;
        }

        /// <summary>Road route on a coarse grid with A*: cost = step length x (1 + slopeWeight x grade^2),
        /// grades above maxGrade cost 50x, water (below minHeight) is forbidden except at the ends.
        /// Alba routes its roads with a slope-aware A* so they never get overly steep (YOtDVv5-0A4
        /// [00:07:45]); straight knots cut canyons through hills instead (observed 2026-09-24).
        /// Returns world XZ waypoints (metres) from start to goal, simplified to every `keepEvery` cell.</summary>
        public static System.Collections.Generic.List<Vector2> RouteAStar(float[,] h, float size, Vector2 start, Vector2 goal,
            float cell = 4f, float slopeWeight = 60f, float maxGrade = 0.12f, float minHeight = float.MinValue, int keepEvery = 6)
        {
            int n = Mathf.Max(8, Mathf.RoundToInt(size / cell));
            float H(int x, int z) => SampleWorld(h, size, x * cell, z * cell);
            int Idx(int x, int z) => z * n + x;
            int sx = Mathf.Clamp(Mathf.RoundToInt(start.x / cell), 0, n - 1), sz = Mathf.Clamp(Mathf.RoundToInt(start.y / cell), 0, n - 1);
            int gx = Mathf.Clamp(Mathf.RoundToInt(goal.x / cell), 0, n - 1), gz = Mathf.Clamp(Mathf.RoundToInt(goal.y / cell), 0, n - 1);
            var g = new float[n * n]; var from = new int[n * n]; var closed = new bool[n * n];
            for (int i = 0; i < g.Length; i++) { g[i] = float.MaxValue; from[i] = -1; }
            var heap = new MinHeap(n * 4);
            g[Idx(sx, sz)] = 0; heap.Push(Idx(sx, sz), 0);
            int[] dx = { 1, -1, 0, 0, 1, 1, -1, -1 }, dz = { 0, 0, 1, -1, 1, -1, 1, -1 };
            while (heap.Count > 0)
            {
                int cur = heap.Pop();
                if (closed[cur]) continue;
                closed[cur] = true;
                int cx = cur % n, cz = cur / n;
                if (cx == gx && cz == gz) break;
                float ch = H(cx, cz);
                for (int k = 0; k < 8; k++)
                {
                    int nx = cx + dx[k], nz = cz + dz[k];
                    if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
                    int ni = Idx(nx, nz);
                    if (closed[ni]) continue;
                    float nh = H(nx, nz);
                    bool end = (nx == gx && nz == gz) || (nx == sx && nz == sz);
                    if (nh < minHeight && !end) continue;
                    float len = cell * (k < 4 ? 1f : 1.41421356f);
                    float grade = Mathf.Abs(nh - ch) / len;
                    float cost = len * (1f + slopeWeight * grade * grade) * (grade > maxGrade ? 50f : 1f);
                    float ng = g[cur] + cost;
                    if (ng < g[ni])
                    {
                        g[ni] = ng; from[ni] = cur;
                        float hx = (gx - nx) * cell, hz = (gz - nz) * cell;
                        heap.Push(ni, ng + Mathf.Sqrt(hx * hx + hz * hz));      // admissible: cost >= length
                    }
                }
            }
            var cells = new System.Collections.Generic.List<Vector2>();
            for (int c = Idx(gx, gz); c >= 0; c = from[c]) cells.Add(new Vector2((c % n) * cell, (c / n) * cell));
            cells.Reverse();
            if (cells.Count < 2 || cells[0] != new Vector2(sx * cell, sz * cell)) return new System.Collections.Generic.List<Vector2> { start, goal };
            var outp = new System.Collections.Generic.List<Vector2> { start };
            for (int i = keepEvery; i < cells.Count - 1; i += keepEvery) outp.Add(cells[i]);
            outp.Add(goal);
            return outp;
        }

        public static float SampleWorld(float[,] h, float size, float wx, float wz)
        {
            int res = h.GetLength(0);
            float fx = Mathf.Clamp(wx / size * (res - 1), 0, res - 1.001f), fz = Mathf.Clamp(wz / size * (res - 1), 0, res - 1.001f);
            int x = (int)fx, z = (int)fz;
            float tx = fx - x, tz = fz - z;
            return Mathf.Lerp(Mathf.Lerp(h[z, x], h[z, x + 1], tx), Mathf.Lerp(h[z + 1, x], h[z + 1, x + 1], tx), tz);
        }

        sealed class MinHeap
        {
            int[] m_Items; float[] m_Keys; int m_Count;
            public MinHeap(int cap) { m_Items = new int[cap]; m_Keys = new float[cap]; }
            public int Count => m_Count;
            public void Push(int item, float key)
            {
                if (m_Count == m_Items.Length) { System.Array.Resize(ref m_Items, m_Count * 2); System.Array.Resize(ref m_Keys, m_Count * 2); }
                int i = m_Count++;
                while (i > 0) { int p = (i - 1) / 2; if (m_Keys[p] <= key) break; m_Items[i] = m_Items[p]; m_Keys[i] = m_Keys[p]; i = p; }
                m_Items[i] = item; m_Keys[i] = key;
            }
            public int Pop()
            {
                int top = m_Items[0];
                int last = m_Items[--m_Count]; float lk = m_Keys[m_Count];
                int i = 0;
                while (true)
                {
                    int l = i * 2 + 1; if (l >= m_Count) break;
                    int r = l + 1, c = (r < m_Count && m_Keys[r] < m_Keys[l]) ? r : l;
                    if (m_Keys[c] >= lk) break;
                    m_Items[i] = m_Items[c]; m_Keys[i] = m_Keys[c]; i = c;
                }
                m_Items[i] = last; m_Keys[i] = lk;
                return top;
            }
        }

        /// <summary>Droplet hydraulic erosion on a heightfield in metres. The simulation runs on
        /// heights divided by heightScale (pass TerrainData.size.y: the 0..1 heights Terrain stores,
        /// the scale Lague's parameters are tuned for; in metres per cell the same parameters erode
        /// about 10x too hard and pits explode, observed 2026-09-24). The two guards from the paper
        /// Lague follows: erosion per step never exceeds the height drop to the next position, and a
        /// droplet moving uphill (inertia) deposits at most the height difference.</summary>
        public static ErosionReport Erode(float[,] h, float heightScale, ErosionSettings e)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            int res = h.GetLength(0);
            var map = new float[res * res];
            float step = heightScale;
            for (int z = 0; z < res; z++) for (int x = 0; x < res; x++) map[z * res + x] = h[z, x] / step; // normalized heights
            var before = (float[])map.Clone();

            // brush offsets and weights (max(0, r - d)), renormalized at borders per step
            int r = Mathf.Clamp(e.radius, 1, 8);
            var bo = new System.Collections.Generic.List<Vector2Int>();
            var bw = new System.Collections.Generic.List<float>();
            for (int oz = -r; oz <= r; oz++)
            for (int ox = -r; ox <= r; ox++)
            {
                float d = Mathf.Sqrt(ox * ox + oz * oz);
                if (d < r) { bo.Add(new Vector2Int(ox, oz)); bw.Add(r - d); }
            }

            var prng = new System.Random(e.seed);
            for (int n = 0; n < e.droplets; n++)
            {
                float px = (float)prng.NextDouble() * (res - 2), pz = (float)prng.NextDouble() * (res - 2);
                float dirX = 0, dirZ = 0, speed = 1, water = 1, sediment = 0;
                for (int life = 0; life < e.maxLifetime; life++)
                {
                    int cx = (int)px, cz = (int)pz;
                    float fx = px - cx, fz = pz - cz;
                    HeightAndGradient(map, res, px, pz, out float hOld, out float gx, out float gz);
                    dirX = dirX * e.inertia - gx * (1 - e.inertia);
                    dirZ = dirZ * e.inertia - gz * (1 - e.inertia);
                    float len = Mathf.Sqrt(dirX * dirX + dirZ * dirZ);
                    if (len < 1e-6f) break;
                    dirX /= len; dirZ /= len;
                    px += dirX; pz += dirZ;
                    if (px < 0 || px >= res - 1 || pz < 0 || pz >= res - 1) break;
                    HeightAndGradient(map, res, px, pz, out float hNew, out _, out _);
                    float dh = hNew - hOld;
                    float capacity = Mathf.Max(-dh * speed * water * e.capacityFactor, e.minCapacity);
                    int ci = cz * res + cx;
                    if (sediment > capacity || dh > 0)
                    {
                        // deposit: uphill, fill at most the step; else a fraction of the surplus
                        float dep = dh > 0 ? Mathf.Min(dh, sediment) : (sediment - capacity) * e.depositSpeed;
                        sediment -= dep;
                        map[ci] += dep * (1 - fx) * (1 - fz);
                        map[ci + 1] += dep * fx * (1 - fz);
                        map[ci + res] += dep * (1 - fx) * fz;
                        map[ci + res + 1] += dep * fx * fz;
                    }
                    else
                    {
                        // erode: never more than the height drop (the guard against spikes and pits)
                        float ero = Mathf.Min((capacity - sediment) * e.erodeSpeed, -dh);
                        float wsum = 0f;
                        for (int k = 0; k < bo.Count; k++)
                        {
                            int bx = cx + bo[k].x, bz = cz + bo[k].y;
                            if (bx >= 0 && bx < res && bz >= 0 && bz < res) wsum += bw[k];
                        }
                        for (int k = 0; k < bo.Count; k++)
                        {
                            int bx = cx + bo[k].x, bz = cz + bo[k].y;
                            if (bx < 0 || bx >= res || bz < 0 || bz >= res) continue;
                            int bi = bz * res + bx;
                            float take = ero * bw[k] / wsum;
                            float d = map[bi] < take ? map[bi] : take;
                            map[bi] -= d;
                            sediment += d;
                        }
                    }
                    // downhill (dh < 0) speeds the droplet up: v^2 - g*dh [added: the repo's sign is a known issue]
                    speed = Mathf.Sqrt(Mathf.Max(0f, speed * speed - dh * e.gravity));
                    water *= (1 - e.evaporateSpeed);
                }
            }
            float maxChange = 0f;
            for (int i = 0; i < map.Length; i++)
            {
                float d = Mathf.Abs(map[i] - before[i]) * step;
                if (d > maxChange) maxChange = d;
                if (float.IsNaN(map[i])) throw new InvalidOperationException("erosion produced NaN at " + i);
            }
            for (int z = 0; z < res; z++) for (int x = 0; x < res; x++) h[z, x] = map[z * res + x] * step;
            return new ErosionReport { droplets = e.droplets, maxChangeMetres = maxChange, seconds = (float)sw.Elapsed.TotalSeconds };
        }

        static void HeightAndGradient(float[] map, int res, float px, float pz, out float height, out float gx, out float gz)
        {
            int cx = (int)px, cz = (int)pz;
            float x = px - cx, z = pz - cz;
            int i = cz * res + cx;
            float nw = map[i], ne = map[i + 1], sw = map[i + res], se = map[i + res + 1];
            gx = (ne - nw) * (1 - z) + (se - sw) * z;
            gz = (sw - nw) * (1 - x) + (se - ne) * x;
            height = nw * (1 - x) * (1 - z) + ne * x * (1 - z) + sw * (1 - x) * z + se * x * z;
        }

        /// <summary>Strict local minima (pits) above a floor height and deeper than minDepth metres
        /// below their lowest neighbour: erosion must not make them explode (the naive-subtraction
        /// failure Lague shows). minDepth ignores millimetre ripples from the brush.</summary>
        public static int CountPits(float[,] h, float above, float minDepth = 0f)
        {
            int res = h.GetLength(0), pits = 0;
            for (int z = 1; z < res - 1; z++)
            for (int x = 1; x < res - 1; x++)
            {
                float v = h[z, x];
                if (v <= above) continue;
                float lo = Mathf.Min(Mathf.Min(Mathf.Min(h[z, x - 1], h[z, x + 1]), Mathf.Min(h[z - 1, x], h[z + 1, x])),
                                     Mathf.Min(Mathf.Min(h[z - 1, x - 1], h[z - 1, x + 1]), Mathf.Min(h[z + 1, x - 1], h[z + 1, x + 1])));
                if (lo - v > minDepth) pits++;
            }
            return pits;
        }

        /// <summary>Slope in degrees at a sample from central differences (cell size = step metres).</summary>
        public static float SlopeDeg(float[,] h, int x, int z, float step)
        {
            int res = h.GetLength(0);
            int x0 = Mathf.Max(0, x - 1), x1 = Mathf.Min(res - 1, x + 1), z0 = Mathf.Max(0, z - 1), z1 = Mathf.Min(res - 1, z + 1);
            float dx = (h[z, x1] - h[z, x0]) / ((x1 - x0) * step), dz = (h[z1, x] - h[z0, x]) / ((z1 - z0) * step);
            return Mathf.Atan(Mathf.Sqrt(dx * dx + dz * dz)) * Mathf.Rad2Deg;
        }

        /// <summary>Order-independent content hash for determinism tests (same seed, same world).</summary>
        public static string Hash(float[,] h)
        {
            unchecked
            {
                ulong acc = 1469598103934665603UL;
                foreach (var v in h)
                {
                    int q = Mathf.RoundToInt(v * 1000f); // millimetre quantization
                    acc = (acc ^ (uint)q) * 1099511628211UL;
                }
                return acc.ToString("x16");
            }
        }
    }

    public struct ErosionReport
    {
        public int droplets;
        public float maxChangeMetres;
        public float seconds;
    }
}
