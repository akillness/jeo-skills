// AgentKit.Animation runtime v0.1 (Unity Expert Skills, 2026-09-24). Second-order motion filter (t3ssel8r,
// KPoeNZZ6H4s): designer parameters f (Hz, speed), zeta (damping: 0 rings forever, 1 = SmoothDamp, >1 sluggish),
// r (initial response: <0 anticipates, >1 overshoots, 2 mechanical). Semi-implicit Euler, stable for any frame
// time thanks to the k2 clamp (T_crit = sqrt(4 k2 + k1^2) - k1 [00:12:29]; at zeta 1 about 0.132 / f seconds, so
// 5 Hz is unstable at 30 fps without it). Use for procedural IK targets, head and turret aim, camera targets, UI.
// Formulas are the widely reproduced code of the video [added where the audio does not state them].
// Run in Unity 6000.3.21f1 on 2026-09-24 through AnimProcedural.SecondOrderCheck (test_live_animation.py::test_09).
using System;
using UnityEngine;

namespace AgentKit.Animation.Runtime
{
    [Serializable]
    public class SecondOrderDynamics
    {
        public float f = 2f, zeta = 0.5f, r = 0f;
        Vector3 xp, y, yd;
        float k1, k2, k3;

        public SecondOrderDynamics(float f, float zeta, float r, Vector3 x0)
        {
            this.f = f; this.zeta = zeta; this.r = r;
            Recompute();
            xp = x0; y = x0; yd = Vector3.zero;
        }

        public void Recompute()   // call after changing f, zeta or r (OnValidate in a MonoBehaviour)
        {
            k1 = zeta / (Mathf.PI * f);
            k2 = 1f / ((2f * Mathf.PI * f) * (2f * Mathf.PI * f));
            k3 = r * zeta / (2f * Mathf.PI * f);
        }

        public float CriticalTimestep => Mathf.Sqrt(4f * k2 + k1 * k1) - k1;
        public Vector3 Value => y;

        public Vector3 Update(float T, Vector3 x, Vector3? xd = null)
        {
            if (T <= 0f) return y;
            var vel = xd ?? (x - xp) / T;   // estimate the input velocity when the caller has none
            xp = x;
            float k2Stable = Mathf.Max(k2, T * T / 2f + T * k1 / 2f, T * k1);   // clamp: never diverges on a hitch
            y += T * yd;
            yd += T * (x + k3 * vel - y - k1 * yd) / k2Stable;
            return y;
        }
    }
}
