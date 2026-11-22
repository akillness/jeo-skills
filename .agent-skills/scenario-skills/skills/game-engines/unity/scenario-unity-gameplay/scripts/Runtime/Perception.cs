// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Perception in three stages,
// cheapest first: squared distance, then the FOV dot product, then one line-of-sight ray on an
// occluder-only mask with triggers ignored explicitly (Queries Hit Triggers is ON by default in
// 6000.3.21f1, observed). Pure functions so Edit Mode tests can drive them without a scene.
using UnityEngine;

namespace AgentKit.Gameplay
{
    public static class Perception
    {
        /// <summary>Stage 1 + 2: range and field of view, no physics query.</summary>
        public static bool InRangeAndFov(Vector3 eye, Vector3 forward, Vector3 target, float range, float fovDeg)
        {
            var to = target - eye;
            float sq = to.sqrMagnitude;
            if (sq > range * range) return false;
            if (sq < 1e-6f) return true;
            forward.y = 0f; to.y = 0f;                       // horizontal cone: height differences do not blind the agent
            if (forward.sqrMagnitude < 1e-6f || to.sqrMagnitude < 1e-6f) return true;
            float cosHalf = Mathf.Cos(0.5f * fovDeg * Mathf.Deg2Rad);
            return Vector3.Dot(forward.normalized, to.normalized) >= cosHalf;
        }

        /// <summary>Stage 3: line of sight. occluderMask must NOT contain the target's own layer
        /// or the agents' layer; triggers are ignored explicitly.</summary>
        public static bool HasLineOfSight(Vector3 eye, Vector3 target, int occluderMask)
        {
            var d = target - eye;
            float dist = d.magnitude;
            if (dist < 1e-4f) return true;
            return !Physics.Raycast(eye, d / dist, dist, occluderMask, QueryTriggerInteraction.Ignore);
        }

        public static bool CanSee(Vector3 eye, Vector3 forward, Vector3 target, float range, float fovDeg, int occluderMask)
        {
            return InRangeAndFov(eye, forward, target, range, fovDeg) && HasLineOfSight(eye, target, occluderMask);
        }
    }
}
