// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). Couples a NavMeshAgent and an
// Animator so feet do not slide, with information flowing ONE way ("Information should always flow
// in one direction", AI Navigation 2.0 manual, NavMesh Agent and Animator). Two recipes:
//  - AgentDrives (Unity, SMWxCpLvrcc [00:03:30]-[00:04:34]): the agent owns the transform, Apply Root
//    Motion is off, and in OnAnimatorMove the agent's speed follows the clip:
//    agent.speed = animator.deltaPosition.magnitude / Time.deltaTime. Best avoidance.
//  - AnimationDrives (AI Navigation manual, Animation Driven Character using Navigation):
//    agent.updatePosition = false, root motion moves the character (y from agent.nextPosition), and
//    when the character and the agent drift apart by more than the agent radius, pull the character
//    (transform.position = agent.nextPosition - 0.9 * worldDelta) or the agent
//    (agent.nextPosition = transform.position + 0.9 * worldDelta), worldDelta = nextPosition -
//    position. Better feet, worse avoidance; which pull is better depends on the case.
// Blend-tree parameters from agent.velocity belong to scenario-unity-animation. ApplyRootMotion is public so a
// test can feed synthetic root motion without an Animator.
using UnityEngine;
using UnityEngine.AI;

namespace AgentKit.Gameplay
{
    public enum LocomotionAuthority { AgentDrives, AnimationDrives }

    [RequireComponent(typeof(NavMeshAgent))]
    public class AgentLocomotionSync : MonoBehaviour
    {
        public LocomotionAuthority authority = LocomotionAuthority.AgentDrives;
        [Tooltip("AnimationDrives: pull the character toward the agent (true) or the agent toward the character (false)")]
        public bool pullCharacter = true;
        [Tooltip("AnimationDrives: correct drift larger than the agent radius (off only for comparisons)")]
        public bool correctDrift = true;
        public float pull = 0.9f;
        public float minSpeed = 0.05f;

        public float MaxDrift { get; private set; }
        public float LastDrift { get; private set; }
        public int Corrections { get; private set; }

        NavMeshAgent m_Agent;
        Animator m_Anim;

        public NavMeshAgent Agent => m_Agent != null ? m_Agent : (m_Agent = GetComponent<NavMeshAgent>());

        void Awake()
        {
            m_Agent = GetComponent<NavMeshAgent>();
            m_Anim = GetComponent<Animator>();
            ApplyAuthority();
        }

        public void ApplyAuthority()
        {
            bool anim = authority == LocomotionAuthority.AnimationDrives;
            Agent.updatePosition = !anim;
            if (m_Anim != null) m_Anim.applyRootMotion = anim;   // AgentDrives: root motion off
            MaxDrift = 0f; Corrections = 0;
        }

        void OnAnimatorMove()
        {
            if (m_Anim != null) ApplyRootMotion(m_Anim.deltaPosition, Time.deltaTime);
        }

        /// <summary>Speed that makes the agent move exactly as far as the clip's root this frame.</summary>
        public static float SpeedFromRootMotion(Vector3 deltaPosition, float dt)
        {
            if (dt <= 1e-5f) return 0f;
            deltaPosition.y = 0f;
            return deltaPosition.magnitude / dt;
        }

        /// <summary>The AI Navigation manual's pull: returns the corrected position of the side being pulled.</summary>
        public static Vector3 Pull(Vector3 character, Vector3 agentNext, float radius, float pull, bool pullCharacter, out bool corrected)
        {
            var worldDelta = agentNext - character;
            worldDelta.y = 0f;
            corrected = worldDelta.magnitude > radius;
            if (!corrected) return pullCharacter ? character : agentNext;
            return pullCharacter ? agentNext - pull * worldDelta : character + pull * worldDelta;
        }

        public void ApplyRootMotion(Vector3 deltaPosition, float dt)
        {
            var a = Agent;
            if (authority == LocomotionAuthority.AgentDrives)
            {
                float s = SpeedFromRootMotion(deltaPosition, dt);
                if (s > minSpeed) a.speed = s;
                return;
            }
            var p = transform.position + deltaPosition;
            p.y = a.nextPosition.y;
            transform.position = p;
            var d = a.nextPosition - transform.position; d.y = 0f;
            LastDrift = d.magnitude;
            MaxDrift = Mathf.Max(MaxDrift, LastDrift);
            if (!correctDrift) return;
            var fixedPos = Pull(transform.position, a.nextPosition, a.radius, pull, pullCharacter, out bool corrected);
            if (!corrected) return;
            Corrections++;
            if (pullCharacter) transform.position = fixedPos; else a.nextPosition = fixedPos;
        }
    }
}
