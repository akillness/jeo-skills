// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Spatial combat audio on pooled
// emitters, after git-amend (BgpqoRFCNOs) with the double-release bug fixed:
//  - play from pooled emitters at a position, never from the projectile (it dies with it) and
//    never with AudioSource.PlayClipAtPoint (a GameObject per call, and its hidden source cannot
//    be routed to a mixer group, so volume sliders never reach it: DU7cgVsU2rM [00:03:00]);
//  - every source routes to a mixer group (Output None, the default, bypasses the mixer);
//  - frequent sounds are capped per definition by stealing the OLDEST instance; 10 to 15 is enough
//    by ear (BgpqoRFCNOs [00:17:56]) and keeps real voices (32 by default) for music and UI;
//  - the steal queue stores (emitter, play id) handles: a pooled emitter that finished and was
//    reused for a newer sound is a stale handle, and stopping it would cut the wrong sound or
//    release it twice (with collectionCheck on, a double release throws). Pooled references need
//    a generation counter.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.Pool;

namespace AgentKit.Gameplay
{
    [System.Serializable]
    public class SoundDef
    {
        public string name = "sound";
        public AudioClip clip;
        public AudioMixerGroup group;
        public bool frequent = true;
        public int maxInstances = 12;
        [Range(0f, 1f)] public float spatialBlend = 1f;
        public float minDistance = 2f;
        public float maxDistance = 50f;
        public AudioRolloffMode rolloff = AudioRolloffMode.Logarithmic;
        [Range(0, 256)] public int priority = 160;     // 0 most important, 128 default; music uses 0
        public float pitchJitter = 0.05f;
        public float volume = 1f;
    }

    public class CombatAudio : MonoBehaviour
    {
        public int defaultCapacity = 32;
        public int maxPool = 64;
        public bool collectionCheck = true;
        ObjectPool<SoundEmitter> m_Pool;
        struct Handle { public SoundEmitter e; public int id; public bool Valid => e != null && e.m_Live && e.PlayId == id; }
        readonly Dictionary<SoundDef, Queue<Handle>> m_Frequent = new Dictionary<SoundDef, Queue<Handle>>();
        public int stolen;
        public int played;
        public int peakActive;

        public int CountActive => Pool.CountActive;
        public int CountAll => Pool.CountAll;

        ObjectPool<SoundEmitter> Pool => m_Pool ??= new ObjectPool<SoundEmitter>(Create,
            e => e.gameObject.SetActive(true),
            e => { e.Source.Stop(); e.gameObject.SetActive(false); },
            e => { if (e != null) Destroy(e.gameObject); },
            collectionCheck, defaultCapacity, maxPool);

        SoundEmitter Create()
        {
            var go = new GameObject("SoundEmitter");
            go.transform.SetParent(transform, false);
            go.AddComponent<AudioSource>();
            var e = go.AddComponent<SoundEmitter>();
            e.owner = this;
            go.SetActive(false);
            return e;
        }

        public SoundEmitter Play(SoundDef def, Vector3 pos)
        {
            if (def == null || def.clip == null) return null;
            if (def.frequent)
            {
                if (!m_Frequent.TryGetValue(def, out var q)) m_Frequent[def] = q = new Queue<Handle>();
                if (q.Count >= def.maxInstances)                              // compact: drop stale handles
                {
                    int n = q.Count;
                    for (int i = 0; i < n; i++) { var h = q.Dequeue(); if (h.Valid) q.Enqueue(h); }
                }
                if (q.Count >= def.maxInstances)
                {
                    var oldest = q.Dequeue();                                 // steal the oldest live instance
                    stolen++;
                    Return(oldest.e);
                }
                var e = Pool.Get();
                e.Play(def, pos);
                q.Enqueue(new Handle { e = e, id = e.PlayId });
                played++;
                peakActive = Mathf.Max(peakActive, Pool.CountActive);
                return e;
            }
            var one = Pool.Get();
            one.Play(def, pos);
            played++;
            peakActive = Mathf.Max(peakActive, Pool.CountActive);
            return one;
        }

        public int LiveInstances(SoundDef def)
        {
            if (!m_Frequent.TryGetValue(def, out var q)) return 0;
            int n = 0;
            foreach (var h in q) if (h.Valid) n++;
            return n;
        }

        public void Return(SoundEmitter e)
        {
            if (e == null || !e.m_Live) return;       // already back in the pool
            e.m_Live = false;
            Pool.Release(e);
        }
    }
}
