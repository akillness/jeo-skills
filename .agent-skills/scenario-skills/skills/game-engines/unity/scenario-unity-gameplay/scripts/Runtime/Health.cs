// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Minimal damage receiver used by
// the enemy brain and the projectile tests.
using UnityEngine;

namespace AgentKit.Gameplay
{
    public class Health : MonoBehaviour
    {
        public float max = 100f;
        public float current = 100f;
        public int hits;
        public float lastHitTime = -1f;

        public bool Dead => current <= 0f;

        public void Damage(float amount)
        {
            if (Dead) return;
            current = Mathf.Max(0f, current - amount);
            hits++;
            lastHitTime = Time.time;
        }
    }
}
