// AgentKit.Vfx v0.1 (scenario-unity-vfx, 2026-09-24). Runtime stress rig for VFX budgets: keeps `count`
// instances of a one-shot effect prefab alive and replays them all together every `period` seconds
// (worst case: simultaneous peaks), and records the peak live particle count. Used with
// AgentKit.AgentProfile.PlayModeTimings (frame times) by AgentKit.Vfx.VfxStress.BuildScene.
// Instances are created once and replayed (Play after Clear), the pooling pattern for rapid fire:
// no Instantiate/Destroy churn during the measurement.
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace AgentKit.Vfx
{
    public class VfxStressSpawner : MonoBehaviour
    {
        public GameObject prefab;
        public int count = 20;
        public float period = 1.2f;
        public float spacing = 2.2f;
        public int columns = 5;
        public float scale = 1f;
        public string reportPath = "";           // JSON written when the component is disabled (end of Play mode)
        public string qualityLevel = "";         // e.g. "Mobile": switch the quality level (and its URP asset) at Awake

        public bool fixedGameStep = true;        // Time.captureDeltaTime = 1f / 60f: every frame advances 1/60 s of game time,
                                                 // so a 600-frame profile covers 10 s of effect life (batch Play mode runs
                                                 // uncapped at hundreds of fps: 300 frames would be 0.3 s of game time)
        string m_Quality = "";

        void Awake()
        {
            if (fixedGameStep) Time.captureDeltaTime = 1f / 60f;
            if (!string.IsNullOrEmpty(qualityLevel))
            {
                int i = System.Array.IndexOf(QualitySettings.names, qualityLevel);
                if (i >= 0) QualitySettings.SetQualityLevel(i, true);
            }
            m_Quality = QualitySettings.names[QualitySettings.GetQualityLevel()] + " / " +
                        (UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline != null ? UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline.name : "Built-in");
        }

        readonly List<ParticleSystem> m_Roots = new List<ParticleSystem>();
        readonly List<ParticleSystem> m_All = new List<ParticleSystem>();   // cached: GetComponentsInChildren per frame allocates
        float m_Next;
        int m_PeakAlive, m_Replays, m_Frames;
        long m_AliveSum;

        void Start()
        {
            if (prefab == null || count <= 0) return;
            for (int i = 0; i < count; i++)
            {
                int cx = i % columns, cy = i / columns;
                var pos = transform.position + new Vector3((cx - (columns - 1) * 0.5f) * spacing, 0f, cy * spacing);
                var go = Instantiate(prefab, pos, Quaternion.identity, transform);
                go.transform.localScale = Vector3.one * scale;
                var ps = go.GetComponent<ParticleSystem>();
                var main = ps.main;
                main.stopAction = ParticleSystemStopAction.None;   // pooled: never destroy
                main.playOnAwake = false;
                ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
                m_Roots.Add(ps);
                m_All.AddRange(ps.GetComponentsInChildren<ParticleSystem>());
            }
            m_Next = Time.time;
        }

        void Update()
        {
            if (m_Roots.Count == 0) return;
            if (Time.time >= m_Next)
            {
                foreach (var ps in m_Roots) { ps.Clear(true); ps.Play(true); }
                m_Replays++;
                m_Next = Time.time + period;
            }
            int alive = 0;
            for (int i = 0; i < m_All.Count; i++) alive += m_All[i].particleCount;
            m_PeakAlive = Mathf.Max(m_PeakAlive, alive);
            m_AliveSum += alive;
            m_Frames++;
        }

        void OnDisable()
        {
            if (string.IsNullOrEmpty(reportPath)) return;
            var json = "{\"count\":" + count + ",\"replays\":" + m_Replays + ",\"frames\":" + m_Frames +
                       ",\"peak_alive\":" + m_PeakAlive + ",\"mean_alive\":" + (m_Frames > 0 ? m_AliveSum / m_Frames : 0) +
                       ",\"period\":" + period.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                       ",\"quality\":\"" + m_Quality + "\",\"capture_dt\":" + Time.captureDeltaTime.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}";
            if (fixedGameStep) Time.captureDeltaTime = 0f;
            try { Directory.CreateDirectory(Path.GetDirectoryName(reportPath)); File.WriteAllText(reportPath, json); }
            catch (System.Exception e) { Debug.LogWarning("VfxStressSpawner report: " + e.Message); }
        }
    }
}
