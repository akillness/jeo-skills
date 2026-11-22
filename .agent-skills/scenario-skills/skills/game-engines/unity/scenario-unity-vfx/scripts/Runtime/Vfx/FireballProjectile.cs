// AgentKit.Vfx v0.2 (scenario-unity-vfx, 2026-09-24). Gameplay glue for the fireball kit (Gabriel Aguiar's
// projectile / muzzle / hit kit, xen, ported to Unity 6 and hardened):
//   - moves by speed * deltaTime and raycasts the distance covered each frame, so a fast projectile
//     never tunnels through thin colliders (Discrete physics steps would miss them);
//   - muzzle forward = shot direction; impact up = surface normal (Quaternion.FromToRotation);
//   - explosion scaled so its visual radius equals the gameplay damage radius (Jason Keyser: the
//     visual boundary must be the damage boundary); authoredRadius is the radius the prefab was built at;
//   - on hit the head is cleared at once but the world-space trail keeps fading, then the object is
//     destroyed after trailFade seconds (never pop; nothing lingers);
//   - every spawned effect gets fresh random seeds (VfxSeed.Reseed): the kit's fixed seeds are for captures,
//     in game they would make every shot identical.
using UnityEngine;

namespace AgentKit.Vfx
{
    public class FireballProjectile : MonoBehaviour
    {
        public float speed = 14f;
        public float maxDistance = 60f;
        public float damageRadius = 1.5f;
        public float authoredRadius = 1f;
        public float surfaceOffset = 0.45f;      // explosion centre pushed off the surface, x damageRadius
        public LayerMask hitMask = ~0;
        public GameObject muzzlePrefab, impactPrefab, explosionPrefab;
        public string[] headSystems = { "Core_Glow", "Core_Flame" };
        public float trailFade = 0.6f;

        public bool HasHit { get; private set; }
        public Vector3 HitPoint { get; private set; }
        public Vector3 HitNormal { get; private set; }
        public GameObject SpawnedImpact { get; private set; }
        public GameObject SpawnedExplosion { get; private set; }
        float m_Travelled;

        public bool reseedEffects = true;

        void Start()
        {
            if (reseedEffects) VfxSeed.Reseed(gameObject);
            if (muzzlePrefab != null)
            {
                var m = Instantiate(muzzlePrefab, transform.position, Quaternion.identity);
                m.transform.forward = transform.forward;
                if (reseedEffects) VfxSeed.Reseed(m);
            }
        }

        void Update()
        {
            if (HasHit) return;
            float step = speed * Time.deltaTime;
            if (Physics.Raycast(transform.position, transform.forward, out var hit, step, hitMask, QueryTriggerInteraction.Ignore))
            {
                Hit(hit.point, hit.normal);
                return;
            }
            transform.position += transform.forward * step;
            m_Travelled += step;
            if (m_Travelled > maxDistance) Destroy(gameObject);
        }

        void Hit(Vector3 point, Vector3 normal)
        {
            HasHit = true;
            HitPoint = point;
            HitNormal = normal;
            transform.position = point;
            if (impactPrefab != null)
                SpawnedImpact = Instantiate(impactPrefab, point, Quaternion.FromToRotation(Vector3.up, normal));
            if (reseedEffects && SpawnedImpact != null) VfxSeed.Reseed(SpawnedImpact);
            if (explosionPrefab != null)
            {
                SpawnedExplosion = Instantiate(explosionPrefab, point + normal * (surfaceOffset * damageRadius), Quaternion.identity);
                SpawnedExplosion.transform.localScale = Vector3.one * (damageRadius / Mathf.Max(0.01f, authoredRadius));
                if (reseedEffects) VfxSeed.Reseed(SpawnedExplosion);
            }
            foreach (var name in headSystems)
            {
                var t = transform.Find(name);
                if (t != null) t.GetComponent<ParticleSystem>().Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);
            }
            var ps = GetComponent<ParticleSystem>();
            if (ps != null) ps.Stop(true, ParticleSystemStopBehavior.StopEmitting);
            Destroy(gameObject, trailFade);
        }
    }
}
