// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Measures the milliseconds spent
// in AI code per frame (brain ticks, director, perception jobs) with Stopwatch timestamps, so a
// crowd profile can separate "our AI" from navigation, physics and rendering. AgentProfile gives
// the whole frame; this gives our slice. Written to JSON when the meter is disabled (leaving Play
// mode), path: <project>/Library/AgentKit/gameplay/ai_budget.json unless overridden.
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace AgentKit.Gameplay
{
    public static class AIBudget
    {
        static long s_FrameTicks;
        public static readonly List<float> FrameMs = new List<float>(4096);
        public static int Ticks;              // brain ticks this session
        public static string Label = "";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()            // survives "Enter Play Mode without domain reload"
        {
            s_FrameTicks = 0; FrameMs.Clear(); Ticks = 0; Label = "";
        }

        public static long Begin() => Stopwatch.GetTimestamp();

        public static void End(long t0)
        {
            s_FrameTicks += Stopwatch.GetTimestamp() - t0;
            Ticks++;
        }

        public static void Add(long ticks) => s_FrameTicks += ticks;

        public static void CloseFrame()
        {
            FrameMs.Add((float)(s_FrameTicks * 1000.0 / Stopwatch.Frequency));
            s_FrameTicks = 0;
        }

        public static string ToJson(int skip)
        {
            var v = FrameMs.Skip(skip).OrderBy(x => x).ToList();
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            string F(double d) => d.ToString("0.#####", inv);
            var sb = new StringBuilder("{");
            sb.Append("\"label\":\"").Append(Label).Append("\",");
            sb.Append("\"frames\":").Append(v.Count).Append(',');
            sb.Append("\"ticks\":").Append(Ticks).Append(',');
            if (v.Count > 0)
            {
                sb.Append("\"mean_ms\":").Append(F(v.Average())).Append(',');
                sb.Append("\"p50_ms\":").Append(F(v[v.Count / 2])).Append(',');
                sb.Append("\"p95_ms\":").Append(F(v[System.Math.Min(v.Count - 1, (int)(v.Count * 0.95))])).Append(',');
                sb.Append("\"max_ms\":").Append(F(v[v.Count - 1])).Append(',');
            }
            sb.Append("\"skip\":").Append(skip).Append('}');
            return sb.ToString();
        }
    }
}
