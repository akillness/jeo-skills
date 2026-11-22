// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). ObjectPool<Projectile> with the
// traps handled: velocity zeroed on release, collectionCheck on in development (a double release
// throws), prewarm, and a pool that owns instances (they never Destroy themselves).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Pool;

namespace AgentKit.Gameplay
{
    public class ProjectilePool : MonoBehaviour
    {
        public Projectile prefab;
        public int defaultCapacity = 64;
        public int maxSize = 512;
        public bool collectionCheck = true;           // keep ON in development: a double release throws
        ObjectPool<Projectile> m_Pool;
        public int CountActive => m_Pool?.CountActive ?? 0;
        public int CountInactive => m_Pool?.CountInactive ?? 0;
        public int CountAll => m_Pool?.CountAll ?? 0;

        public ObjectPool<Projectile> Pool
        {
            get
            {
                if (m_Pool == null)
                    m_Pool = new ObjectPool<Projectile>(Create, OnGet, OnRelease, OnDestroyItem, collectionCheck, defaultCapacity, maxSize);
                return m_Pool;
            }
        }

        public void Prewarm(int n)
        {
            var tmp = new List<Projectile>(n);
            for (int i = 0; i < n; i++) tmp.Add(Pool.Get());
            foreach (var p in tmp) Pool.Release(p);
        }

        public Projectile Fire(Vector3 pos, Vector3 dir, float speed, CollisionDetectionMode mode)
        {
            var p = Pool.Get();
            p.Launch(pos, dir, speed, mode);
            return p;
        }

        public void Release(Projectile p) { Pool.Release(p); }

        Projectile Create()
        {
            var p = Instantiate(prefab, transform);
            p.pool = this;
            p.gameObject.SetActive(false);
            return p;
        }

        static void OnGet(Projectile p) { p.gameObject.SetActive(true); }

        static void OnRelease(Projectile p)
        {
            p.Body.linearVelocity = Vector3.zero;      // a reused body must not keep its momentum
            p.Body.angularVelocity = Vector3.zero;
            p.gameObject.SetActive(false);
        }

        static void OnDestroyItem(Projectile p) { if (p != null) Destroy(p.gameObject); }
    }
}
