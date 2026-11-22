// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). A code FSM enemy on a
// NavMeshAgent: Patrol -> Chase -> Attack -> Search -> Patrol, plus Dead.
// Expert rules built in (sources in references/expert-notes.md):
//  - the agent owns the transform; a Rigidbody on the same object must be kinematic (AI Navigation
//    2.0 manual: agent + non-kinematic Rigidbody is a race condition);
//  - on death the agent is disabled BEFORE the obstacle is enabled (agent + obstacle together make
//    the agent avoid itself);
//  - Auto Braking off while patrolling so waypoints flow; distance checks wait for pathPending
//    (git-amend, lusROFJ3_t8 [00:05:56]);
//  - SetDestination only when the target moved more than repathDistance or repathInterval elapsed,
//    never every frame;
//  - perception cheapest first (Perception.cs); ticking can be done by an EnemyDirector at a fixed
//    rate instead of Update (selfTick = false).
// Every state change is recorded (time, from, to, distance) so tests assert on measured transitions.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace AgentKit.Gameplay
{
    public enum EnemyState { Patrol, Chase, Attack, Search, Dead }

    [RequireComponent(typeof(NavMeshAgent))]
    public class EnemyBrain : MonoBehaviour
    {
        public struct Transition
        {
            public float time;
            public EnemyState from, to;
            public float distance;
        }

        [Header("References")]
        public Transform target;
        public Health targetHealth;
        public Vector3[] waypoints = new Vector3[0];

        [Header("Senses")]
        public float sightRange = 15f;
        public float fovDeg = 110f;
        public float eyeHeight = 1.5f;
        public float targetAimHeight = 1f;
        public LayerMask occluders;

        [Header("Combat")]
        public float attackRange = 2f;
        public float attackCooldown = 0.8f;
        public float damage = 10f;

        [Header("Memory")]
        public float loseSightTime = 1.0f;
        public float searchTime = 2.5f;

        [Header("Locomotion")]
        public float patrolSpeed = 2f;
        public float chaseSpeed = 4.5f;
        public float repathDistance = 1f;
        public float repathInterval = 0.25f;
        public float arriveTolerance = 0.3f;

        [Header("Ticking")]
        [Tooltip("true: Update ticks the brain every frame. false: an EnemyDirector ticks it.")]
        public bool selfTick = true;
        public bool recordTransitions = true;

        public EnemyState State { get; private set; } = EnemyState.Patrol;
        public readonly List<Transition> transitions = new List<Transition>();
        public int waypointArrivals;
        public int attacksLanded;
        public bool SeesTarget { get; private set; }
        public float LastSeenTime => m_LastSeen;

        /// <summary>Set by EnemyDirector in Burst mode: stage 1+2 already computed in a job this frame.</summary>
        [System.NonSerialized] public int prefilter = -1;   // -1 unknown, 0 rejected, 1 candidate

        NavMeshAgent m_Agent;
        NavMeshObstacle m_Obstacle;
        int m_Wp;
        float m_LastSeen = -999f, m_StateEnter, m_LastAttack = -999f, m_LastRepath = -999f;
        Vector3 m_LastKnown, m_LastRepathTarget;

        public NavMeshAgent Agent => m_Agent != null ? m_Agent : (m_Agent = GetComponent<NavMeshAgent>());

        void Awake()
        {
            m_Agent = GetComponent<NavMeshAgent>();
            m_Obstacle = GetComponent<NavMeshObstacle>();
            if (m_Obstacle != null) m_Obstacle.enabled = false;
            if (target != null && targetHealth == null) targetHealth = target.GetComponent<Health>();
        }

        void Start()
        {
            Enter(EnemyState.Patrol, Time.time, true);
        }

        void Update()
        {
            if (!selfTick) return;
            long t0 = AIBudget.Begin();
            Tick(Time.time);
            AIBudget.End(t0);
        }

        public float DistanceToTarget()
        {
            if (target == null) return float.PositiveInfinity;
            var d = target.position - transform.position; d.y = 0f;
            return d.magnitude;
        }

        public void Tick(float now)
        {
            if (State == EnemyState.Dead || target == null || !Agent.isOnNavMesh) return;
            var eye = transform.position + Vector3.up * eyeHeight;
            var aim = target.position + Vector3.up * targetAimHeight;
            bool candidate = prefilter >= 0 ? prefilter == 1 : Perception.InRangeAndFov(eye, transform.forward, aim, sightRange, fovDeg);
            // Once engaged, the cone widens to 360 degrees at attack range (the agent turns to face).
            if (!candidate && State != EnemyState.Patrol && DistanceToTarget() <= attackRange * 1.5f) candidate = true;
            SeesTarget = candidate && Perception.HasLineOfSight(eye, aim, occluders);
            if (SeesTarget) { m_LastSeen = now; m_LastKnown = target.position; }
            float dist = DistanceToTarget();

            switch (State)
            {
                case EnemyState.Patrol:
                    if (SeesTarget) { Enter(EnemyState.Chase, now); break; }
                    PatrolStep();
                    break;
                case EnemyState.Chase:
                    if (SeesTarget && dist <= attackRange) { Enter(EnemyState.Attack, now); break; }
                    if (!SeesTarget && now - m_LastSeen > loseSightTime) { Enter(EnemyState.Search, now); break; }
                    Repath(now, SeesTarget ? target.position : m_LastKnown);
                    break;
                case EnemyState.Attack:
                    if (!SeesTarget || dist > attackRange * 1.25f) { Enter(EnemyState.Chase, now); break; }
                    Face(target.position);
                    if (now - m_LastAttack >= attackCooldown)
                    {
                        m_LastAttack = now;
                        attacksLanded++;
                        if (targetHealth != null) targetHealth.Damage(damage);
                    }
                    break;
                case EnemyState.Search:
                    if (SeesTarget) { Enter(EnemyState.Chase, now); break; }
                    if (now - m_StateEnter > searchTime) { Enter(EnemyState.Patrol, now); break; }
                    break;
            }
        }

        void Enter(EnemyState s, float now, bool initial = false)
        {
            var from = State;
            State = s;
            m_StateEnter = now;
            if (recordTransitions && !initial)
                transitions.Add(new Transition { time = now, from = from, to = s, distance = DistanceToTarget() });
            var a = Agent;
            if (!a.enabled || !a.isOnNavMesh) return;   // SetDestination throws off the NavMesh
            switch (s)
            {
                case EnemyState.Patrol:
                    a.isStopped = false; a.speed = patrolSpeed; a.autoBraking = false; a.stoppingDistance = 0f;
                    m_Wp = NearestWaypoint();
                    if (waypoints.Length > 0) a.SetDestination(waypoints[m_Wp]);
                    break;
                case EnemyState.Chase:
                    a.isStopped = false; a.speed = chaseSpeed; a.autoBraking = true; a.stoppingDistance = attackRange * 0.8f;
                    m_LastRepath = -999f;
                    Repath(now, target.position);
                    break;
                case EnemyState.Attack:
                    a.isStopped = true;
                    a.velocity = Vector3.zero;
                    break;
                case EnemyState.Search:
                    a.isStopped = false; a.speed = patrolSpeed; a.autoBraking = true; a.stoppingDistance = 0.2f;
                    a.SetDestination(m_LastKnown);
                    break;
            }
        }

        void PatrolStep()
        {
            if (waypoints.Length == 0) return;
            var a = Agent;
            if (a.pathPending) return;                                    // no distance check on a stale path
            if (a.remainingDistance <= a.stoppingDistance + arriveTolerance)
            {
                waypointArrivals++;
                m_Wp = (m_Wp + 1) % waypoints.Length;
                a.SetDestination(waypoints[m_Wp]);
            }
        }

        void Repath(float now, Vector3 dest)
        {
            if (now - m_LastRepath < repathInterval && (dest - m_LastRepathTarget).sqrMagnitude < repathDistance * repathDistance) return;
            m_LastRepath = now;
            m_LastRepathTarget = dest;
            Agent.SetDestination(dest);
        }

        void Face(Vector3 p)
        {
            var d = p - transform.position; d.y = 0f;
            if (d.sqrMagnitude > 1e-4f) transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(d), 720f * Time.deltaTime);
        }

        int NearestWaypoint()
        {
            int best = 0; float bd = float.MaxValue;
            for (int i = 0; i < waypoints.Length; i++)
            {
                float d = (waypoints[i] - transform.position).sqrMagnitude;
                if (d < bd) { bd = d; best = i; }
            }
            return best;
        }

        /// <summary>Death: agent off FIRST, then the carving obstacle on, so others route around the body.
        /// The carve reaches NavMesh queries one frame later (manual note; measured in
        /// NavExtrasTests): neighbours repath next frame, not in this one.</summary>
        public void Kill()
        {
            if (State == EnemyState.Dead) return;
            var from = State;
            State = EnemyState.Dead;
            if (recordTransitions) transitions.Add(new Transition { time = Time.time, from = from, to = EnemyState.Dead, distance = DistanceToTarget() });
            if (Agent.enabled) { Agent.isStopped = true; Agent.enabled = false; }
            if (m_Obstacle == null) m_Obstacle = gameObject.AddComponent<NavMeshObstacle>();
            m_Obstacle.carving = true;
            m_Obstacle.carveOnlyStationary = true;
            m_Obstacle.enabled = true;
        }
    }
}
