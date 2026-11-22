// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Device tiering at first launch and a
// thermal step-down policy, as pure functions (EditMode-testable), plus the runtime component
// that wires them to QualitySettings, Application.targetFrameRate and Adaptive Performance
// (a core engine feature in Unity 6.3: namespace UnityEngine.AdaptivePerformance, no package).
//
// Expert basis: budget ~65% of the frame for sustained play (Unity mobile e-book); automatic
// performance control plus a targetFrameRate is the recommended Adaptive Performance setup and
// manual CPU/GPU levels do nothing while throttling (6.3 Manual); every scaler needs a bounded
// maximum so visuals never collapse (Unity, d5O4Uw6gPBI [00:06:45]); the doc's LOD sample steps
// lodBias 1 -> 0.75 -> 0.5 on ThrottlingImminent/Throttling; lowering render resolution helps a
// GPU-bound frame a lot and a CPU-bound one little (6.3 Manual, Identify performance bottlenecks),
// so render scale is the first lever only when the bottleneck is the GPU. Test the policy with
// synthetic thermal and bottleneck events instead of heating a phone (Unity, d5O4Uw6gPBI [00:04:21]):
// MobileTierDirector.Feed + simulate. Thresholds and the 0.85 / 0.7 scale steps are [added]
// defaults: tune them from device captures, never from the Editor.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_monetization.py
// (EditMode TierAndThermalTests, PlayMode TierDirectorTests).
using System;
using UnityEngine;
using UnityEngine.AdaptivePerformance;
using UnityEngine.Rendering;
#if AGENTKIT_URP
using UnityEngine.Rendering.Universal;
#endif

namespace AgentKit.Mobile
{
    public enum MobileTier { Low = 0, High = 1 }

    public static class MobileTierPolicy
    {
        /// <summary>First-launch tier. Unknown or small devices default to Low (safe), a player
        /// setting may override. memoryMb = SystemInfo.systemMemorySize, gpu = SystemInfo.graphicsDeviceName.</summary>
        public static MobileTier Choose(int memoryMb, string gpu, int cpuCount, string[] highGpuAllowlist = null,
                                        int highMemoryMb = 6000, int allowlistMinMemoryMb = 4000)
        {
            if (memoryMb <= 0 || string.IsNullOrEmpty(gpu)) return MobileTier.Low;
            // The allowlist comes from the project's own device captures (GPU names that held the
            // High budget in a soak test), never from memory [added].
            if (highGpuAllowlist != null && memoryMb >= allowlistMinMemoryMb)
                foreach (var entry in highGpuAllowlist)
                    if (!string.IsNullOrEmpty(entry) && gpu.IndexOf(entry, StringComparison.OrdinalIgnoreCase) >= 0)
                        return MobileTier.High;
            if (memoryMb >= highMemoryMb && cpuCount >= 8) return MobileTier.High;
            return MobileTier.Low;
        }

        public static int TargetFps(MobileTier t) => t == MobileTier.High ? 60 : 30;

        /// <summary>Sustained frame budget: 65% of 1000/fps (Unity mobile e-book).</summary>
        public static float SustainedBudgetMs(int fps, float headroom = 0.65f) => 1000f / fps * headroom;
    }

    /// <summary>Thermal step-down with hysteresis. Level 0 = full quality ... MaxLevel = floor.
    /// warning: 0 NoWarning, 1 ThrottlingImminent, 2 Throttling (Adaptive Performance WarningLevel order).</summary>
    public sealed class ThermalPolicy
    {
        public readonly int MaxLevel;
        public int Level { get; private set; }
        readonly float m_CoolSeconds;
        float m_CalmFor;

        public ThermalPolicy(int maxLevel = 2, float coolSeconds = 20f)
        {
            MaxLevel = Math.Max(0, maxLevel);
            m_CoolSeconds = coolSeconds;
        }

        /// <summary>Feed one observation; returns the level to apply.</summary>
        public int Step(int warning, float temperatureLevel, float temperatureTrend, float dt)
        {
            int wanted = warning >= 2 ? 2 : (warning == 1 || temperatureLevel > 0.8f) ? 1 : 0;
            wanted = Math.Min(wanted, MaxLevel);
            if (wanted > Level)
            {
                Level = wanted;          // step down at once when heat rises
                m_CalmFor = 0f;
            }
            else if (wanted < Level && temperatureTrend <= 0f)
            {
                m_CalmFor += dt;         // step back up only after a calm, cooling period
                if (m_CalmFor >= m_CoolSeconds) { Level--; m_CalmFor = 0f; }
            }
            else m_CalmFor = 0f;
            return Level;
        }

        /// <summary>lodBias per level, from the 6.3 Adaptive Performance doc sample (1, 0.75, 0.5).</summary>
        public static float LodBias(int level) => level <= 0 ? 1f : level == 1 ? 0.75f : 0.5f;

        /// <summary>Render scale per level: lowered only when the GPU (or an unknown bottleneck) limits
        /// the frame, since resolution barely helps a CPU-bound frame (6.3 Manual). Steps 0.85 and 0.7 of
        /// the tier's own scale with a floor are [added] defaults. bottleneck: PerformanceBottleneck.</summary>
        public static float RenderScale(int level, PerformanceBottleneck bottleneck, float baseScale, float floor = 0.7f)
        {
            if (level <= 0 || bottleneck == PerformanceBottleneck.CPU || bottleneck == PerformanceBottleneck.TargetFrameRate) return baseScale;
            float s = baseScale * (level == 1 ? 0.85f : 0.7f);
            return Mathf.Max(Mathf.Min(floor, baseScale), s);
        }
    }

    /// <summary>Runtime wiring: picks the tier once, sets Application.targetFrameRate, enables
    /// Adaptive Performance automatic control when a provider is active (Android), and applies the
    /// thermal policy to lodBias and, when the GPU is the bottleneck, to the URP render scale.
    /// iOS gets system control only (6.3 Manual). simulate + Feed drive the same policy from
    /// synthetic events (tests, or a debug menu) without a provider. The render scale is tracked per
    /// URP asset of the CURRENT Quality level (QualitySettings.renderPipeline): observed in 6000.3.21f1,
    /// GraphicsSettings.currentRenderPipeline still returned the previous level's asset in the same
    /// frame as SetQualityLevel, so a base read from it belonged to another tier. When the level
    /// changes, the previous asset gets its own scale back; on destroy too, so an Editor Play session
    /// never leaves a URP asset modified.</summary>
    public sealed class MobileTierDirector : MonoBehaviour
    {
        public string lowQualityName = "Mobile_Low";
        public string highQualityName = "Mobile_High";
        public int forcedTier = -1; // player override from settings; -1 = auto
        public string[] highGpuAllowlist = new string[0];
        public bool simulate;                 // run the policy on Feed() values without Adaptive Performance
        public float thermalCoolSeconds = 20f;
        public int thermalMaxLevel = 2;       // the floor: visuals never drop below this level (d5O4Uw6gPBI [00:06:45])
        public float renderScaleFloor = 0.7f;
        public MobileTier Tier { get; private set; }
        public ThermalPolicy Thermal { get; private set; }
        public bool AdaptivePerformanceActive { get; private set; }
        public PerformanceBottleneck Bottleneck { get; private set; } = PerformanceBottleneck.Unknown;

        IAdaptivePerformance m_Ap;
        int m_Warning;
        float m_TempLevel, m_TempTrend;
#if AGENTKIT_URP
        UniversalRenderPipelineAsset m_Asset;
#endif
        float m_AssetBase = -1f;

        void Start()
        {
            Thermal = new ThermalPolicy(thermalMaxLevel, thermalCoolSeconds);
            Tier = forcedTier >= 0 ? (MobileTier)forcedTier
                : MobileTierPolicy.Choose(SystemInfo.systemMemorySize, SystemInfo.graphicsDeviceName, SystemInfo.processorCount, highGpuAllowlist);
            var names = QualitySettings.names;
            var want = Tier == MobileTier.High ? highQualityName : lowQualityName;
            var idx = Array.IndexOf(names, want);
            if (idx >= 0) QualitySettings.SetQualityLevel(idx, true);
            Application.targetFrameRate = MobileTierPolicy.TargetFps(Tier);
            TrackAsset();

            m_Ap = Holder.Instance;
            AdaptivePerformanceActive = m_Ap != null && m_Ap.Active;
            if (AdaptivePerformanceActive)
            {
                m_Ap.DevicePerformanceControl.AutomaticPerformanceControl = true;
                m_Ap.ThermalStatus.ThermalEvent += OnThermal;
                m_Ap.PerformanceStatus.PerformanceBottleneckChangeEvent += OnBottleneck;
            }
        }

        void OnDestroy()
        {
            if (m_Ap != null && AdaptivePerformanceActive)
            {
                m_Ap.ThermalStatus.ThermalEvent -= OnThermal;
                m_Ap.PerformanceStatus.PerformanceBottleneckChangeEvent -= OnBottleneck;
            }
            ReleaseAsset();
        }

        void OnThermal(ThermalMetrics m) => Feed((int)m.WarningLevel, m.TemperatureLevel, m.TemperatureTrend, Bottleneck);
        void OnBottleneck(PerformanceBottleneckChangeEventArgs e) => Bottleneck = e.PerformanceBottleneck;

        /// <summary>One thermal observation (Adaptive Performance event, or synthetic in tests).
        /// warning: 0 NoWarning, 1 ThrottlingImminent, 2 Throttling.</summary>
        public void Feed(int warning, float temperatureLevel, float temperatureTrend, PerformanceBottleneck bottleneck)
        {
            m_Warning = warning; m_TempLevel = temperatureLevel; m_TempTrend = temperatureTrend; Bottleneck = bottleneck;
        }

        void Update()
        {
            if (!AdaptivePerformanceActive && !simulate) return;
            TrackAsset();
            int level = Thermal.Step(m_Warning, m_TempLevel, m_TempTrend, Time.unscaledDeltaTime);
            QualitySettings.lodBias = ThermalPolicy.LodBias(level);
            if (m_AssetBase > 0f) CurrentRenderScale = ThermalPolicy.RenderScale(level, Bottleneck, m_AssetBase, renderScaleFloor);
        }

        /// <summary>The render scale the current tier's URP asset had before the policy touched it (-1 without URP).</summary>
        public float BaseRenderScale => m_AssetBase;

        void TrackAsset()
        {
#if AGENTKIT_URP
            var cur = (QualitySettings.renderPipeline ?? GraphicsSettings.defaultRenderPipeline) as UniversalRenderPipelineAsset;
            if (cur == m_Asset) return;
            ReleaseAsset();
            m_Asset = cur;
            m_AssetBase = cur != null ? cur.renderScale : -1f;
#endif
        }

        void ReleaseAsset()
        {
#if AGENTKIT_URP
            if (m_Asset != null && m_AssetBase > 0f) m_Asset.renderScale = m_AssetBase;
            m_Asset = null;
            m_AssetBase = -1f;
#endif
        }

        /// <summary>URP render scale of the current Quality level's asset (-1 without URP).</summary>
        public float CurrentRenderScale
        {
            get
            {
#if AGENTKIT_URP
                if ((QualitySettings.renderPipeline ?? GraphicsSettings.defaultRenderPipeline) is UniversalRenderPipelineAsset u) return u.renderScale;
#endif
                return -1f;
            }
            set
            {
#if AGENTKIT_URP
                if (m_Asset != null && value > 0f) m_Asset.renderScale = value;
#endif
            }
        }

        /// <summary>Menus and full-screen UI: drop the target (e-book: lower targetFrameRate when a
        /// full-screen UI covers the scene, and disable the 3D camera).</summary>
        public static void SetMenuMode(bool menu, MobileTier tier)
        {
            Application.targetFrameRate = menu ? 30 : MobileTierPolicy.TargetFps(tier);
        }
    }
}
