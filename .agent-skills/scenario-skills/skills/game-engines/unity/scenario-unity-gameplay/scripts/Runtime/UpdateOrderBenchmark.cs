// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). Does update order matter here?
// The same UpdateRegistry ticks N objects of four types registered in a shuffled order (what engine
// Update order looks like), once sorted by type and once in registration order. Same objects, same
// work, only the order changes (the Survival Kids experiment, ZkvK0mX-id4 [00:22:55]). Reports mean,
// median and worst tick. Editor numbers compare orders on this machine only; the talk's 12% and
// 2.18 -> 1.43 ms worst frame came from a Windows development build of a Switch 2 game.
using System.Collections.Generic;
using System.Linq;

namespace AgentKit.Gameplay
{
    public static class UpdateOrderBenchmark
    {
        public struct Result
        {
            public int objects, types, ticks;
            public double sortedMean, sortedMedian, sortedMax, shuffledMean, shuffledMedian, shuffledMax;
            public double checksum;
        }

        // Four kinds of gameplay objects with different code and their own shared (static) data.
        abstract class Obj : IManualUpdate
        {
            public float state; public int idx;
            public abstract void ManualUpdate(float dt);
        }
        sealed class Turret : Obj
        {
            static readonly float[] s_Table = MakeTable(4096, 1);
            public override void ManualUpdate(float dt) { for (int k = 0; k < 8; k++) state = state * 0.97f + s_Table[(idx + k * 31) & 4095] * dt; idx += 7; }
        }
        sealed class Pickup : Obj
        {
            static readonly float[] s_Table = MakeTable(4096, 2);
            public override void ManualUpdate(float dt) { for (int k = 0; k < 8; k++) { float t = s_Table[(idx * 13 + k) & 4095]; state += t * t * dt - state * 0.01f; } idx += 3; }
        }
        sealed class Door : Obj
        {
            static readonly float[] s_Table = MakeTable(4096, 3);
            public override void ManualUpdate(float dt) { for (int k = 0; k < 8; k++) state = System.Math.Abs(state - s_Table[(idx ^ (k * 97)) & 4095]) * 0.5f + dt; idx += 11; }
        }
        sealed class Critter : Obj
        {
            static readonly float[] s_Table = MakeTable(4096, 4);
            public override void ManualUpdate(float dt) { for (int k = 0; k < 8; k++) state = (state + s_Table[(idx + k) & 4095]) * 0.5f; state *= 1f - dt; idx += 5; }
        }

        static float[] MakeTable(int n, int seed)
        {
            var r = new System.Random(seed); var t = new float[n];
            for (int i = 0; i < n; i++) t[i] = (float)r.NextDouble();
            return t;
        }

        public static Result Run(int objects, int ticks, int seed = 42)
        {
            var rng = new System.Random(seed);
            var list = new List<Obj>(objects);
            for (int i = 0; i < objects; i++)
            {
                Obj o;
                switch (i % 4) { case 0: o = new Turret(); break; case 1: o = new Pickup(); break; case 2: o = new Door(); break; default: o = new Critter(); break; }
                o.idx = rng.Next(4096); o.state = (float)rng.NextDouble();
                list.Add(o);
            }
            // shuffled registration order, like engine Update order
            for (int i = list.Count - 1; i > 0; i--) { int j = rng.Next(i + 1); var t = list[i]; list[i] = list[j]; list[j] = t; }

            var sorted = new UpdateRegistry(objects) { sortByType = true };
            var shuffled = new UpdateRegistry(objects) { sortByType = false };
            foreach (var o in list) { sorted.Register(o); shuffled.Register(o); }
            var a = new List<double>(ticks); var b = new List<double>(ticks);
            for (int w = 0; w < 20; w++) { sorted.Tick(0.016f); shuffled.Tick(0.016f); }   // warm-up (JIT, first sort)
            for (int i = 0; i < ticks; i++)
            {
                // interleave so machine noise hits both orders alike
                if ((i & 1) == 0) { sorted.Tick(0.016f); a.Add(sorted.LastTickMs); shuffled.Tick(0.016f); b.Add(shuffled.LastTickMs); }
                else { shuffled.Tick(0.016f); b.Add(shuffled.LastTickMs); sorted.Tick(0.016f); a.Add(sorted.LastTickMs); }
            }
            double sum = 0; foreach (var o in list) sum += o.state;
            a.Sort(); b.Sort();
            return new Result
            {
                objects = objects, types = 4, ticks = ticks,
                sortedMean = a.Average(), sortedMedian = a[a.Count / 2], sortedMax = a[a.Count - 1],
                shuffledMean = b.Average(), shuffledMedian = b[b.Count / 2], shuffledMax = b[b.Count - 1],
                checksum = sum,
            };
        }
    }
}
