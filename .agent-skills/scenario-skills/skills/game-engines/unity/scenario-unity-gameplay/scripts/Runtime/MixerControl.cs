// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Mixer helpers.
// The SetFloat trap (6000.3.21f1 script reference, and measured in AudioMixerTests): once
// AudioMixer.SetFloat touches an exposed parameter, snapshots stop driving it until ClearFloat.
// So a player volume slider must own a SEPARATE exposed parameter (for example an Attenuation
// placed after the snapshot-driven one, or the parent group's volume), never the parameter the
// mood snapshots move.
// Slider mapping (Sasquatch B Studios, DU7cgVsU2rM [00:14:30]): slider 0.0001..1, dB = 20*log10(v);
// 0.0001 lands on the -80 dB floor, log10(0) is minus infinity.
using UnityEngine;
using UnityEngine.Audio;

namespace AgentKit.Gameplay
{
    public static class MixerControl
    {
        public const float MinLinear = 0.0001f;

        public static float LinearToDb(float v) => 20f * Mathf.Log10(Mathf.Clamp(v, MinLinear, 1f));

        public static float DbToLinear(float db) => Mathf.Pow(10f, db / 20f);

        /// <summary>Player volume (0..1 slider) on a parameter no snapshot uses. Returns false on a
        /// misspelled name (SetFloat returns false, silently otherwise).</summary>
        public static bool SetUserVolume(AudioMixer mixer, string exposedName, float linear01)
        {
            return mixer != null && mixer.SetFloat(exposedName, LinearToDb(linear01));
        }

        /// <summary>Mood change. Transition uses the mixer's update mode: set
        /// mixer.updateMode = AudioMixerUpdateMode.UnscaledTime if the game pauses with timeScale 0.</summary>
        public static bool GoToSnapshot(AudioMixer mixer, string snapshot, float seconds)
        {
            var s = mixer != null ? mixer.FindSnapshot(snapshot) : null;
            if (s == null) return false;
            s.TransitionTo(seconds);
            return true;
        }

        public static float Read(AudioMixer mixer, string exposedName)
        {
            return mixer != null && mixer.GetFloat(exposedName, out var v) ? v : float.NaN;
        }
    }
}
