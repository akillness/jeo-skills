// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Scripted player stand-in for
// crowd profiles and AI tests: circles the arena at a fixed speed, or holds still. Kinematic
// Rigidbody + collider so projectiles and triggers see it (a moving collider should carry a
// kinematic Rigidbody, 6.3 Manual "Move static colliders").
using UnityEngine;

namespace AgentKit.Gameplay
{
    public class TargetMover : MonoBehaviour
    {
        public Vector3 center = Vector3.zero;
        public float radius = 12f;
        public float speed = 3f;
        public bool moving = true;
        float m_Angle;

        void Update()
        {
            if (!moving || radius <= 0f) return;
            m_Angle += speed / radius * Time.deltaTime;
            transform.position = center + new Vector3(Mathf.Cos(m_Angle) * radius, 0f, Mathf.Sin(m_Angle) * radius);
        }
    }
}
