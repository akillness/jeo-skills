// scenario-unity-world-building v0.2 (2026-09-24). Guidance checks on a heightmap, pure C# (EditMode-testable):
//  - Reachable: walkable flood fill from the spawn with a hard slope limit (the character's
//    slopeLimit), the scripted form of "paths always lead back to a main area" (A Short Hike,
//    ZW8gWgpptI8 [00:18:37]);
//  - Coast: the island's edge as a swimmer meets it (march in from the sea along N bearings):
//    where the player can climb out, whether that shore walks back to the spawn, and how far the
//    nearest point of interest is. Players try the world's edge first: "say yes and put something
//    there" ([00:16:54], [00:17:58]); long empty arcs of coast are the "Boring" backside;
//  - FalsePeaks: local maxima that are not the goal summit, with prominence (height above the
//    highest saddle on the way to the summit). "Up any incline" reaches the goal only if false
//    peaks are rare or carry a reason to be there ([00:19:10], guidance slide [00:18:58]).
// Heights are in metres, indexed [z, x], covering size x size metres from the terrain origin.
// Run in Unity 6000.3.21f1 on 2026-09-24: EditMode test GuideCoastAndPeaks + job AuditGuidance.
using System.Collections.Generic;
using UnityEngine;

namespace AgentKit.World
{
    public struct CoastSector
    {
        public int index;
        public float bearingDeg;
        public bool hasShore;          // the ray from the sea meets land
        public Vector2 shore;          // first land cell met from the sea (world XZ minus terrain origin)
        public bool climbable;         // slope from the shore cell to the next inland cell <= limit
        public bool connected;         // the shore cell walks back to the spawn
        public float nearestPoiM;      // distance to the nearest point of interest
        public int nearestPoi;         // index into the POI list, -1 when none
    }

    public class CoastReport
    {
        public List<CoastSector> sectors = new List<CoastSector>();
        public float coastLengthM, longestEmptyArcM;
        public int shoreSectors, climbableSectors, waterOnlyPockets, emptySectors;
        public List<(int from, int to, float lengthM, Vector2 mid)> emptyArcs = new List<(int, int, float, Vector2)>();
    }

    public struct Peak { public Vector2 pos; public float height, saddle, prominence; public bool isSummit; }

    public static class WorldGuide
    {
        /// <summary>Walkable mask on a cell grid (n x n, cell metres): land above the sea, neighbour steps
        /// whose slope angle is at most maxSlopeDeg, 8-connected, flooded from start.</summary>
        public static bool[] Reachable(float[,] h, float size, float cell, Vector2 start, float seaLevel, float maxSlopeDeg, out int n)
        {
            n = Mathf.Max(8, Mathf.RoundToInt(size / cell));
            int nn = n;
            var mask = new bool[n * n];
            float tanMax = Mathf.Tan(maxSlopeDeg * Mathf.Deg2Rad);
            int sx = Mathf.Clamp(Mathf.RoundToInt(start.x / cell), 0, n - 1), sz = Mathf.Clamp(Mathf.RoundToInt(start.y / cell), 0, n - 1);
            float H(int x, int z) => WorldNoise.SampleWorld(h, size, x * cell, z * cell);
            if (H(sx, sz) < seaLevel) return mask;
            var q = new Queue<int>();
            mask[sz * n + sx] = true; q.Enqueue(sz * n + sx);
            int[] dx = { 1, -1, 0, 0, 1, 1, -1, -1 }, dz = { 0, 0, 1, -1, 1, -1, 1, -1 };
            while (q.Count > 0)
            {
                int c = q.Dequeue(); int cx = c % nn, cz = c / nn; float ch = H(cx, cz);
                for (int k = 0; k < 8; k++)
                {
                    int x = cx + dx[k], z = cz + dz[k];
                    if (x < 0 || z < 0 || x >= nn || z >= nn) continue;
                    int i = z * nn + x;
                    if (mask[i]) continue;
                    float nh = H(x, z);
                    if (nh < seaLevel) continue;
                    float len = cell * (k < 4 ? 1f : 1.41421356f);
                    if (Mathf.Abs(nh - ch) / len > tanMax) continue;
                    mask[i] = true; q.Enqueue(i);
                }
            }
            return mask;
        }

        public static bool IsReachable(bool[] mask, int n, float cell, Vector2 p)
        {
            int x = Mathf.Clamp(Mathf.RoundToInt(p.x / cell), 0, n - 1), z = Mathf.Clamp(Mathf.RoundToInt(p.y / cell), 0, n - 1);
            // tolerate one cell of snapping error around the point
            for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++)
            {
                int xx = x + dx, zz = z + dz;
                if (xx >= 0 && zz >= 0 && xx < n && zz < n && mask[zz * n + xx]) return true;
            }
            return false;
        }

        /// <summary>March in from the map edge along `sectors` bearings around `centre`; the first land
        /// cell is where a swimmer meets the coast.</summary>
        public static CoastReport Coast(float[,] h, float size, float seaLevel, float maxSlopeDeg, Vector2 start, Vector2 centre,
                                        int sectors, IList<Vector2> pois, float poiRadius, float cell = 4f)
        {
            var rep = new CoastReport();
            var mask = Reachable(h, size, cell, start, seaLevel, maxSlopeDeg, out int n);
            float tanMax = Mathf.Tan(maxSlopeDeg * Mathf.Deg2Rad);
            float maxR = size * 0.75f;
            for (int s = 0; s < sectors; s++)
            {
                float a = 360f * s / sectors;
                var dir = new Vector2(Mathf.Sin(a * Mathf.Deg2Rad), Mathf.Cos(a * Mathf.Deg2Rad));
                var sec = new CoastSector { index = s, bearingDeg = a, nearestPoi = -1, nearestPoiM = float.PositiveInfinity };
                for (float r = maxR; r > 0; r -= cell * 0.5f)
                {
                    var p = centre + dir * r;
                    if (p.x < 0 || p.y < 0 || p.x > size || p.y > size) continue;
                    if (WorldNoise.SampleWorld(h, size, p.x, p.y) < seaLevel) continue;
                    sec.hasShore = true; sec.shore = p;
                    var inland = p - dir * cell;
                    float dh = Mathf.Abs(WorldNoise.SampleWorld(h, size, inland.x, inland.y) - WorldNoise.SampleWorld(h, size, p.x, p.y));
                    sec.climbable = dh / cell <= tanMax;
                    sec.connected = IsReachable(mask, n, cell, p);
                    break;
                }
                if (sec.hasShore && pois != null)
                    for (int i = 0; i < pois.Count; i++)
                    {
                        float d = Vector2.Distance(pois[i], sec.shore);
                        if (d < sec.nearestPoiM) { sec.nearestPoiM = d; sec.nearestPoi = i; }
                    }
                rep.sectors.Add(sec);
            }
            // arcs of consecutive shore sectors with no point of interest within poiRadius
            int m = rep.sectors.Count;
            for (int i = 0; i < m; i++)
            {
                var s0 = rep.sectors[i]; var s1 = rep.sectors[(i + 1) % m];
                if (s0.hasShore) { rep.shoreSectors++; if (s0.climbable) rep.climbableSectors++; if (s0.climbable && !s0.connected) rep.waterOnlyPockets++; }
                if (s0.hasShore && s1.hasShore) rep.coastLengthM += Vector2.Distance(s0.shore, s1.shore);
                if (s0.hasShore && s0.nearestPoiM > poiRadius) rep.emptySectors++;
            }
            CoastSector S(int i) => rep.sectors[(i % m + m) % m];
            bool Empty(int i) { var s = S(i); return s.hasShore && s.nearestPoiM > poiRadius; }
            float Seg(int i, int j) => S(i).hasShore && S(j).hasShore ? Vector2.Distance(S(i).shore, S(j).shore) : 0f;
            if (rep.emptySectors == m)
            {
                rep.emptyArcs.Add((0, m - 1, rep.coastLengthM, rep.sectors[m / 2].shore));
                rep.longestEmptyArcM = rep.coastLengthM;
                return rep;
            }
            int startIdx = 0; while (Empty(startIdx)) startIdx++;          // a sector with content: arcs never wrap past it
            int k = 1;
            while (k < m)
            {
                int i = startIdx + k;
                if (!Empty(i)) { k++; continue; }
                int j = i; float len = 0f;
                while (j + 1 < startIdx + m && Empty(j + 1)) { len += Seg(j, j + 1); j++; }
                len += 0.5f * (Seg(i - 1, i) + Seg(j, j + 1));             // half a sector of coast on each side
                rep.emptyArcs.Add((i % m, j % m, len, S((i + j) / 2).shore));
                rep.longestEmptyArcM = Mathf.Max(rep.longestEmptyArcM, len);
                k += j - i + 1;
            }
            rep.emptyArcs.Sort((a, b) => b.lengthM.CompareTo(a.lengthM));
            return rep;
        }

        /// <summary>Local maxima on a coarse grid (higher than every cell within `radius`), with
        /// prominence against the global summit: saddle = the highest possible minimum height on a
        /// path to the summit (widest-path Dijkstra), prominence = height - saddle.</summary>
        public static List<Peak> Peaks(float[,] h, float size, float cell, float radius, float seaLevel)
        {
            int n = Mathf.Max(8, Mathf.RoundToInt(size / cell));
            var g = new float[n * n];
            int best = 0;
            for (int z = 0; z < n; z++) for (int x = 0; x < n; x++)
            {
                g[z * n + x] = WorldNoise.SampleWorld(h, size, x * cell, z * cell);
                if (g[z * n + x] > g[best]) best = z * n + x;
            }
            // widest path from the summit: best[i] = max over paths of the min height along the path
            var wide = new float[n * n];
            for (int i = 0; i < wide.Length; i++) wide[i] = float.NegativeInfinity;
            var done = new bool[n * n];
            var heap = new SortedSet<(float, int)>(Comparer<(float, int)>.Create((a, b) => a.Item1 != b.Item1 ? b.Item1.CompareTo(a.Item1) : a.Item2.CompareTo(b.Item2)));
            wide[best] = g[best]; heap.Add((g[best], best));
            int[] dx = { 1, -1, 0, 0, 1, 1, -1, -1 }, dz = { 0, 0, 1, -1, 1, -1, 1, -1 };
            while (heap.Count > 0)
            {
                var top = heap.Min; heap.Remove(top);
                int c = top.Item2;
                if (done[c]) continue;
                done[c] = true;
                int cx = c % n, cz = c / n;
                for (int k = 0; k < 8; k++)
                {
                    int x = cx + dx[k], z = cz + dz[k];
                    if (x < 0 || z < 0 || x >= n || z >= n) continue;
                    int i = z * n + x;
                    if (done[i]) continue;
                    float cand = Mathf.Min(wide[c], g[i]);
                    if (cand > wide[i]) { if (!float.IsNegativeInfinity(wide[i])) heap.Remove((wide[i], i)); wide[i] = cand; heap.Add((cand, i)); }
                }
            }
            int rc = Mathf.Max(1, Mathf.RoundToInt(radius / cell));
            var peaks = new List<Peak>();
            for (int z = 0; z < n; z++) for (int x = 0; x < n; x++)
            {
                float v = g[z * n + x];
                if (v < seaLevel + 1f) continue;
                bool isMax = true;
                for (int oz = -rc; oz <= rc && isMax; oz++) for (int ox = -rc; ox <= rc; ox++)
                {
                    if (ox == 0 && oz == 0) continue;
                    int xx = x + ox, zz = z + oz;
                    if (xx < 0 || zz < 0 || xx >= n || zz >= n) continue;
                    float w = g[zz * n + xx];
                    if (w > v || (w == v && zz * n + xx < z * n + x)) { isMax = false; break; }
                }
                if (!isMax) continue;
                int idx = z * n + x;
                peaks.Add(new Peak { pos = new Vector2(x * cell, z * cell), height = v, saddle = wide[idx], prominence = v - wide[idx], isSummit = idx == best });
            }
            peaks.Sort((a, b) => b.height.CompareTo(a.height));
            return peaks;
        }
    }
}
