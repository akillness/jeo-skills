// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Screen shake and camera kick for a 2D camera
// without Cinemachine. Nijman (AJdEqssNZ-U): shake on impacts [00:16:45], a kick OPPOSITE to each
// shot [00:25:47], and an option to turn shake off because juice desensitises its maker and makes
// others sick [00:32:14] -> static Multiplier (0 = off). Pixel art [added]: the Pixel Perfect Camera
// snaps the camera to the art-pixel grid, so sub-pixel shake vanishes; offsets are rounded to whole
// art pixels (1 / pixelsPerUnit) and amplitudes should be at least 1 px. Uses unscaled time so shake
// keeps decaying during a hit stop. With Cinemachine 3, use CinemachineImpulseSource +
// CinemachineImpulseListener instead (this component would fight the Brain for the transform).
// Put it on the camera; it adds an offset to the position it had before shaking.
// Run in Unity 6000.3.21f1 on 2026-09-24: JuiceTests.ShakeMultiplierZeroAndKickDirection.
using UnityEngine;

namespace AgentKit.TwoD
{
    [DefaultExecutionOrder(1000)]
    public class CameraShake2D : MonoBehaviour
    {
        /// <summary>Settings-menu multiplier: 0 disables all shake and kick (accessibility).</summary>
        public static float Multiplier = 1f;
        [Tooltip("Round offsets to whole art pixels (0 = no rounding)")]
        public int pixelsPerUnit = 16;
        [Tooltip("Shake frequency (Hz)")]
        public float frequency = 25f;

        float m_Amplitude, m_Duration, m_Elapsed;
        Vector2 m_Kick;
        float m_KickDecay = 12f;
        Vector3 m_Base;
        Vector3 m_LastOffset;
        float m_Seed;

        public Vector3 CurrentOffset => m_LastOffset;

        void Awake() { m_Seed = Random.value * 100f; }

        /// <summary>Shake with `amplitude` units for `duration` seconds (decays linearly).</summary>
        public void Shake(float amplitude, float duration)
        {
            m_Amplitude = Mathf.Max(m_Amplitude * (1f - Progress()), amplitude);
            m_Duration = Mathf.Max(0.0001f, duration);
            m_Elapsed = 0f;
        }

        /// <summary>Kick the camera `distance` units opposite to `fireDirection` (recoil read).</summary>
        public void Kick(Vector2 fireDirection, float distance)
        {
            if (fireDirection.sqrMagnitude > 0f) m_Kick += -fireDirection.normalized * distance;
        }

        float Progress() => m_Duration > 0f ? Mathf.Clamp01(m_Elapsed / m_Duration) : 1f;

        void LateUpdate()
        {
            // remove last frame's offset so other scripts (followers) can move the camera
            m_Base = transform.localPosition - m_LastOffset;
            float dt = Time.unscaledDeltaTime;
            m_Elapsed += dt;
            float amp = m_Amplitude * (1f - Progress());
            float t = Time.unscaledTime * frequency;
            Vector2 shake = amp > 0f
                ? new Vector2(Mathf.PerlinNoise(m_Seed, t) * 2f - 1f, Mathf.PerlinNoise(m_Seed + 17f, t) * 2f - 1f) * amp
                : Vector2.zero;
            m_Kick = Vector2.Lerp(m_Kick, Vector2.zero, 1f - Mathf.Exp(-m_KickDecay * dt));
            Vector2 off = (shake + m_Kick) * Multiplier;
            if (pixelsPerUnit > 0)
            {
                float u = 1f / pixelsPerUnit;
                off = new Vector2(Mathf.Round(off.x / u) * u, Mathf.Round(off.y / u) * u);
            }
            m_LastOffset = new Vector3(off.x, off.y, 0f);
            transform.localPosition = m_Base + m_LastOffset;
            if (Progress() >= 1f) m_Amplitude = 0f;
        }
    }
}
