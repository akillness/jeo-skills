// AgentKit.Vfx v0.2 (scenario-unity-vfx, 2026-09-24). Gameplay metadata on an effect root, so budgets can be audited by
// importance, not only by frame time (Jason Keyser, ex-Riot, BOE8osaPzOY [00:12:03] to [00:15:34]):
// brightness, size and duration are a budget spent by gameplay importance. Idle effects are always on and
// barely visible, basic attacks subdued, game changers and ultimates get the brightness and "need their space to
// breathe", and effects end when the gameplay state ends (lingering reads as still dangerous).
// Read by AgentKit.Vfx.VfxSequence.CaptureEffect (reported with every capture) and by ut_vfx.importance_ladder.
using UnityEngine;

namespace AgentKit.Vfx
{
    public enum VfxImportance { Idle = 0, Basic = 1, Defensive = 2, Damaging = 3, GameChanger = 4, Ultimate = 5 }

    public class VfxTier : MonoBehaviour
    {
        public VfxImportance importance = VfxImportance.Basic;
        [Tooltip("Gameplay radius in metres at scale 1 (0 = no area). The primary shape must match it (Keyser).")]
        public float gameplayRadius;
        [Tooltip("Seconds the gameplay state lasts (0 = one-shot). The effect must be gone within its fade after that.")]
        public float gameplayDuration;
        [Tooltip("Fire frequency hint: frequent effects must stay subdued (Keyser: brightness budget).")]
        public bool frequent;
    }

    /// <summary>Fresh random seeds for a spawned effect. Kit builders fix seeds so captures and tests repeat; in game
    /// that makes every instance identical (same sparks, same frames, same Custom Data random offset). Call on spawn
    /// so consecutive shots differ ("randomize everything", Nordeus YZWK [00:36:06]; Hovl's random offset per slash,
    /// 5Sos [00:09:47]). Pass a seed to reproduce one instance.</summary>
    public static class VfxSeed
    {
        public static uint Reseed(GameObject go, uint seed = 0)
        {
            if (go == null) return 0;
            var systems = go.GetComponentsInChildren<ParticleSystem>(true);
            if (systems.Length == 0) return 0;
            var root = go.GetComponent<ParticleSystem>();
            if (root == null) root = systems[0];                // never '??' on UnityEngine.Object (editor fake null)
            bool play = root.isPlaying || root.main.playOnAwake;
            foreach (var ps in systems) ps.Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);   // seeds only change while stopped
            uint s = seed != 0 ? seed : (uint)Random.Range(1, int.MaxValue);
            for (int i = 0; i < systems.Length; i++)
            {
                systems[i].useAutoRandomSeed = false;
                systems[i].randomSeed = s + (uint)i * 7919u;
            }
            if (play) root.Play(true);
            return s;
        }
    }
}
