// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). A pooled physics projectile
// (ProjectilePool.cs holds the pool; one MonoBehaviour per file, file named after the class).
// Settings the experts insist on (6.3 Manual physics pages; references/expert-notes.md):
//  - its own layer, with Projectile x Projectile unticked in the Layer Collision Matrix;
//  - start Discrete, move to Continuous Speculative on observed tunneling ("often the best
//    choice for CCD"), Continuous and Continuous Dynamic only as a last resort;
//  - interpolation None unless a camera follows the projectile;
//  - Unity 6 names: linearVelocity, angularVelocity, linearDamping.
// ObjectPool traps handled here: a released object must reset its velocity (a reused body keeps its
// old momentum), a second Release of the same instance throws with collectionCheck on (guarded by
// m_Live), and a pooled object must not Destroy itself.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Pool;

namespace AgentKit.Gameplay
{
    [RequireComponent(typeof(Rigidbody))]
    public class Projectile : MonoBehaviour
    {
        public float lifetime = 3f;
        public float damage = 10f;
        [System.NonSerialized] public ProjectilePool pool;
        public Rigidbody Body { get; private set; }
        public int hits;
        public string lastHitName;
        public Vector3 lastHitPoint;
        public float launchTime;
        bool m_Live;

        void Awake() { Body = GetComponent<Rigidbody>(); }

        public void Launch(Vector3 position, Vector3 direction, float speed, CollisionDetectionMode mode)
        {
            m_Live = true;
            hits = 0; lastHitName = null;
            launchTime = Time.time;
            Body.collisionDetectionMode = mode;
            Body.interpolation = RigidbodyInterpolation.None;
            Body.position = position;                  // teleport through the body, not the transform
            transform.position = position;
            Body.linearVelocity = direction.normalized * speed;
            Body.angularVelocity = Vector3.zero;
        }

        void FixedUpdate()
        {
            if (m_Live && Time.time - launchTime > lifetime) Despawn();
        }

        void OnCollisionEnter(Collision c)            // with Reuse Collision Callbacks ON, never store `c`
        {
            if (!m_Live) return;
            hits++;
            lastHitName = c.collider.name;
            lastHitPoint = c.GetContact(0).point;
            var h = c.collider.GetComponentInParent<Health>();
            if (h != null) h.Damage(damage);
            Despawn();
        }

        public void Despawn()
        {
            if (!m_Live) return;                       // guards the double release
            m_Live = false;
            if (pool != null) pool.Release(this); else gameObject.SetActive(false);
        }
    }
}
