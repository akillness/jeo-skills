// scenario-unity-world-building v0.1 (2026-09-24). Minimal seeded Wave Function Collapse on a 2D grid
// (DV Gen, 20KHNA9jTsE [00:06:32]): modules with weights and an adjacency table, collapse the
// cell with the smallest domain next, propagate to neighbours' neighbours, restart with the next
// seed on a contradiction (restart policy [added]; the video does not cover contradictions).
// Output is module indices; the editor side instantiates prefabs (one module may pick random mesh
// variants, [00:09:49]). Several hundred seeds per rule change under the Test Framework (level
// design e-book, "Automated testing").
// Run in Unity 6000.3.21f1 on 2026-09-24: EditMode test WfcTests (500 seeds).
using System;
using System.Collections.Generic;

namespace AgentKit.World
{
    public sealed class WfcRules
    {
        public readonly string[] modules;
        public readonly float[] weights;
        // allowed[a, b, dir]: module b may sit in direction dir of module a (0 +x, 1 -x, 2 +z, 3 -z)
        public readonly bool[,,] allowed;

        public WfcRules(string[] modules, float[] weights)
        {
            this.modules = modules; this.weights = weights;
            allowed = new bool[modules.Length, modules.Length, 4];
        }

        public int Index(string m) => Array.IndexOf(modules, m);

        /// <summary>Symmetric rule in all four directions.</summary>
        public WfcRules Allow(string a, string b)
        {
            int ia = Index(a), ib = Index(b);
            if (ia < 0 || ib < 0) throw new ArgumentException("unknown module " + a + " or " + b);
            for (int d = 0; d < 4; d++) { allowed[ia, ib, d] = true; allowed[ib, ia, d] = true; }
            return this;
        }

        /// <summary>Directional rule: b may be placed in direction dir of a (and a opposite of b).</summary>
        public WfcRules AllowDir(string a, string b, int dir)
        {
            int ia = Index(a), ib = Index(b);
            allowed[ia, ib, dir] = true;
            allowed[ib, ia, Opposite(dir)] = true;
            return this;
        }

        public static int Opposite(int d) => d ^ 1;
    }

    public struct WfcResult
    {
        public int[,] grid;       // module index per cell, -1 if failed
        public int attempts;      // 1 = no restart
        public bool ok;
        public int seedUsed;
    }

    public static class Wfc
    {
        static readonly int[] DX = { 1, -1, 0, 0 }, DZ = { 0, 0, 1, -1 };

        public static WfcResult Solve(WfcRules rules, int w, int h, int seed, int maxAttempts = 20)
        {
            for (int a = 0; a < maxAttempts; a++)
            {
                var g = TrySolve(rules, w, h, seed + a);
                if (g != null) return new WfcResult { grid = g, attempts = a + 1, ok = true, seedUsed = seed + a };
            }
            return new WfcResult { grid = null, attempts = maxAttempts, ok = false, seedUsed = seed };
        }

        static int[,] TrySolve(WfcRules r, int w, int h, int seed)
        {
            int m = r.modules.Length;
            var rng = new Random(seed);
            var dom = new bool[w, h, m];
            var count = new int[w, h];
            for (int x = 0; x < w; x++) for (int z = 0; z < h; z++) { count[x, z] = m; for (int k = 0; k < m; k++) dom[x, z, k] = true; }
            var queue = new Queue<(int, int)>();
            while (true)
            {
                // smallest domain > 1, random tie-break
                int bx = -1, bz = -1, best = int.MaxValue, ties = 0;
                for (int x = 0; x < w; x++)
                for (int z = 0; z < h; z++)
                {
                    int c = count[x, z];
                    if (c == 0) return null;
                    if (c == 1 || c > best) continue;
                    if (c < best) { best = c; bx = x; bz = z; ties = 1; }
                    else if (rng.Next(++ties) == 0) { bx = x; bz = z; }
                }
                if (bx < 0) break; // all collapsed
                // weighted pick in the domain
                double total = 0; for (int k = 0; k < m; k++) if (dom[bx, bz, k]) total += r.weights[k];
                double pick = rng.NextDouble() * total; int chosen = -1;
                for (int k = 0; k < m; k++) if (dom[bx, bz, k]) { pick -= r.weights[k]; chosen = k; if (pick <= 0) break; }
                for (int k = 0; k < m; k++) dom[bx, bz, k] = k == chosen;
                count[bx, bz] = 1;
                queue.Enqueue((bx, bz));
                // propagate: a neighbour keeps module b only if some module a left here allows it
                while (queue.Count > 0)
                {
                    var (cx, cz) = queue.Dequeue();
                    for (int d = 0; d < 4; d++)
                    {
                        int nx = cx + DX[d], nz = cz + DZ[d];
                        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
                        bool changed = false;
                        for (int b = 0; b < m; b++)
                        {
                            if (!dom[nx, nz, b]) continue;
                            bool ok = false;
                            for (int a = 0; a < m && !ok; a++) ok = dom[cx, cz, a] && r.allowed[a, b, d];
                            if (!ok) { dom[nx, nz, b] = false; count[nx, nz]--; changed = true; }
                        }
                        if (count[nx, nz] == 0) return null;
                        if (changed) queue.Enqueue((nx, nz));
                    }
                }
            }
            var g = new int[w, h];
            for (int x = 0; x < w; x++) for (int z = 0; z < h; z++) for (int k = 0; k < m; k++) if (dom[x, z, k]) g[x, z] = k;
            return g;
        }

        /// <summary>Every neighbour pair in the output is allowed by the table (the test oracle).</summary>
        public static int Violations(WfcRules r, int[,] g)
        {
            int w = g.GetLength(0), h = g.GetLength(1), bad = 0;
            for (int x = 0; x < w; x++)
            for (int z = 0; z < h; z++)
            for (int d = 0; d < 4; d += 2) // +x and +z cover every pair once
            {
                int nx = x + DX[d], nz = z + DZ[d];
                if (nx >= w || nz >= h) continue;
                if (!r.allowed[g[x, z], g[nx, nz], d]) bad++;
            }
            return bad;
        }
    }
}
