// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Hit stop ("sleep"): freeze the game for a few
// tens of milliseconds on hits and kills. Nijman (Vlambeer, AJdEqssNZ-U [00:18:22]) pauses about
// 20 ms per hit; Celeste freezes four frames (about 67 ms) on dash (GMTK yorTG9at90g [00:08:40]).
// Unity translation [added]: Time.timeScale = 0 with an UNSCALED end time (Update still runs at
// timeScale 0); overlapping requests EXTEND one end time instead of stacking; the previous scale
// is restored (not 1), so a hit during slow motion returns to slow motion. Never Thread.Sleep.
// Run in Unity 6000.3.21f1 on 2026-09-24: JuiceTests.HitStopRestoresAndExtends.
using UnityEngine;

namespace AgentKit.TwoD
{
    [DefaultExecutionOrder(-1000)]
    public class HitStop : MonoBehaviour
    {
        static HitStop s_Instance;
        float m_EndRealtime;
        float m_RestoreScale = 1f;
        bool m_Active;

        public static bool Active => s_Instance != null && s_Instance.m_Active;
        public static int Requests { get; private set; }
        /// <summary>Global multiplier (accessibility option, as for shake): 0 disables hit stop.</summary>
        public static float Multiplier = 1f;

        /// <summary>Freeze for `seconds` of real time (0.02 to 0.07 s is the range in the sources).</summary>
        public static void Request(float seconds)
        {
            if (seconds * Multiplier <= 0f) return;
            if (s_Instance == null)
            {
                var go = new GameObject("[HitStop]") { hideFlags = HideFlags.DontSave };
                s_Instance = go.AddComponent<HitStop>();
            }
            s_Instance.Begin(seconds * Multiplier);
        }

        void Begin(float seconds)
        {
            if (!m_Active)
            {
                m_RestoreScale = Time.timeScale;
                m_Active = true;
                Time.timeScale = 0f;
            }
            m_EndRealtime = Mathf.Max(m_EndRealtime, Time.unscaledTime + seconds);
            Requests++;
        }

        void Update()
        {
            if (m_Active && Time.unscaledTime >= m_EndRealtime)
            {
                Time.timeScale = m_RestoreScale;
                m_Active = false;
            }
        }

        void OnDestroy()
        {
            if (m_Active) Time.timeScale = m_RestoreScale;
            if (s_Instance == this) s_Instance = null;
        }

        /// <summary>Tests: drop the service and restore time.</summary>
        public static void ResetForTests()
        {
            if (s_Instance != null) Destroy(s_Instance.gameObject);
            s_Instance = null;
            Requests = 0;
            Multiplier = 1f;
        }
    }
}
