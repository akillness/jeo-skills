// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). A projectile with no Rigidbody:
// every fixed step it sweeps its own collider shape along the step's travel (Queries.SweepShape) and
// stops on the first hit. For fast shots at moving targets, where sweep CCD modes still tunnel an
// ordinary dynamic body (measured in PhysicsTests.CcdLadderMeasured), and for fat projectiles, where
// a thin ray misses what the projectile's radius would touch (LlamAcademy fJyi7l2tWKo [00:09:54]).
// Unity: fast bullets carry no Rigidbody (pTz3LMQpvfA [00:07:58]). The collider is a shape description
// only and is disabled on Awake, so the projectile costs no transform sync and no broad phase.
// thinRay = true reproduces the naive version (a ray from the centre) for comparisons.
using UnityEngine;

namespace AgentKit.Gameplay
{
    [RequireComponent(typeof(Collider))]
    public class SweepProjectile : MonoBehaviour
    {
        public Vector3 velocity;
        public float lifetime = 3f;
        public float damage = 10f;
        public LayerMask hitMask = ~0;
        [Tooltip("Naive comparison: a ray from the centre instead of the collider's shape")]
        public bool thinRay;

        public int hits;
        public string lastHitName;
        public Vector3 lastHitPoint;
        public bool Live { get; private set; }

        Collider m_Shape;
        float m_Born;

        void Awake()
        {
            m_Shape = GetComponent<Collider>();
            m_Shape.enabled = false;            // shape description only
        }

        public void Launch(Vector3 position, Vector3 vel)
        {
            transform.position = position;
            velocity = vel;
            hits = 0; lastHitName = null;
            m_Born = Time.time;
            Live = true;
        }

        void FixedUpdate()
        {
            if (!Live) return;
            if (Time.time - m_Born > lifetime) { Live = false; return; }
            var from = transform.position;
            var delta = velocity * Time.fixedDeltaTime;
            RaycastHit hit;
            bool got = thinRay
                ? Physics.Raycast(from, delta.normalized, out hit, delta.magnitude, hitMask, QueryTriggerInteraction.Ignore)
                : Queries.SweepShape(m_Shape, from, delta, out hit, hitMask);
            if (got)
            {
                hits++;
                lastHitName = hit.collider.name;
                lastHitPoint = hit.point;
                var h = hit.collider.GetComponentInParent<Health>();
                if (h != null) h.Damage(damage);
                transform.position = from + delta.normalized * hit.distance;
                Live = false;                    // a pooled version would Release here
                return;
            }
            transform.position = from + delta;
        }
    }
}
