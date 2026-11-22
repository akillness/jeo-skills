// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). One pooled AudioSource emitter
// used by CombatAudio (own file: one MonoBehaviour per file, named after the class).
using UnityEngine;

namespace AgentKit.Gameplay
{
    public class SoundEmitter : MonoBehaviour
    {
        public AudioSource Source { get; private set; }
        public SoundDef Def { get; private set; }
        public float StartTime { get; private set; }
        public int PlayId { get; private set; }
        [System.NonSerialized] public CombatAudio owner;
        internal bool m_Live;

        void Awake()
        {
            Source = GetComponent<AudioSource>();
            if (Source == null) Source = gameObject.AddComponent<AudioSource>();
            Source.playOnAwake = false;
        }

        public void Play(SoundDef def, Vector3 pos)
        {
            Def = def;
            m_Live = true;
            PlayId++;
            transform.position = pos;
            var s = Source;
            s.clip = def.clip;
            s.outputAudioMixerGroup = def.group;
            s.spatialBlend = def.spatialBlend;
            s.rolloffMode = def.rolloff;
            s.minDistance = def.minDistance;
            s.maxDistance = def.maxDistance;
            s.priority = def.priority;
            s.dopplerLevel = 0f;
            s.volume = def.volume;
            s.pitch = 1f + Random.Range(-def.pitchJitter, def.pitchJitter);
            s.loop = false;
            StartTime = Time.unscaledTime;
            s.Play();
        }

        void Update()
        {
            // clip finished (grace frame: isPlaying can read false right after Play on some drivers)
            if (m_Live && !Source.isPlaying && Time.unscaledTime - StartTime > 0.05f) owner.Return(this);
        }
    }
}
