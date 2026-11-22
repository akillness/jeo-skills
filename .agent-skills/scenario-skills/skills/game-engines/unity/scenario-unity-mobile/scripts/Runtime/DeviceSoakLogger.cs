// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). On-device soak logger for the development
// build a human runs on the lowest target phone: every `interval` seconds one CSV row with the frame
// times of that window (FrameTimingManager: CPU and GPU, p95 and max), the Adaptive Performance
// thermal state and bottleneck when a provider is active, the battery level and (Android) battery
// temperature, the Quality level, lodBias and render scale the thermal policy applied.
// Pull the CSV (Application.persistentDataPath/soak_*.csv: adb pull on Android, the app container
// from Xcode > Devices on iOS) and judge it with ut_mobile.soak_verdict(csv, fps): the sustained
// budget is 65% of the frame over a 20 to 30 minute session, the last minutes against the first,
// 10 to 15 minutes of cooldown between runs (Unity mobile e-book, Account for device temperature).
// FrameTimingManager needs Player Settings > Frame Timing Stats (PlayerSettings.enableFrameTimingStats,
// set by MobileBuild for development builds); without it the CPU column falls back to
// Time.unscaledDeltaTime and gpu_* stay empty. Battery temperature reads the sticky
// ACTION_BATTERY_CHANGED intent [added, Android API; not run on a device].
// Run in Unity 6000.3.21f1 on 2026-09-24 (Editor Play mode, PlayMode SoakLoggerTests): pass, CSV
// columns and rows checked; the device run is a hand-over (no phone connected).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.AdaptivePerformance;

namespace AgentKit.Mobile
{
    public sealed class DeviceSoakLogger : MonoBehaviour
    {
        public float interval = 10f;
        public string fileName = "";           // default soak_<yyyyMMdd_HHmmss>.csv in persistentDataPath
        public MobileTierDirector director;     // optional: logs the policy's render scale and level
        public string CsvPath { get; private set; }
        public int Rows { get; private set; }

        public const string Header = "t_s,frames,fps,cpu_p95_ms,cpu_max_ms,gpu_p95_ms,gpu_max_ms,thermal_warning,temp_level,temp_trend,bottleneck,battery_level,battery_temp_c,quality,lod_bias,render_scale,frame_timing";

        readonly List<double> m_Cpu = new List<double>(), m_Gpu = new List<double>();
        readonly UnityEngine.FrameTiming[] m_Timing = new UnityEngine.FrameTiming[1];
        float m_Start, m_Next;
        bool m_Ftm;
        StreamWriter m_Out;

        void Start()
        {
            m_Ftm = FrameTimingManager.IsFeatureEnabled();
            var name = string.IsNullOrEmpty(fileName) ? "soak_" + DateTime.Now.ToString("yyyyMMdd_HHmmss", CultureInfo.InvariantCulture) + ".csv" : fileName;
            CsvPath = Path.Combine(Application.persistentDataPath, name);
            m_Out = new StreamWriter(CsvPath, false, new UTF8Encoding(false));
            m_Out.WriteLine(Header);
            m_Out.Flush();
            m_Start = Time.realtimeSinceStartup;
            m_Next = m_Start + interval;
        }

        void Update()
        {
            double cpu = -1, gpu = -1;
            if (m_Ftm)
            {
                FrameTimingManager.CaptureFrameTimings();
                if (FrameTimingManager.GetLatestTimings(1, m_Timing) > 0) { cpu = m_Timing[0].cpuFrameTime; gpu = m_Timing[0].gpuFrameTime; }
            }
            if (cpu <= 0) cpu = Time.unscaledDeltaTime * 1000.0;
            m_Cpu.Add(cpu);
            if (gpu > 0) m_Gpu.Add(gpu);
            if (Time.realtimeSinceStartup >= m_Next) WriteRow();
        }

        void WriteRow()
        {
            float now = Time.realtimeSinceStartup;
            float span = Mathf.Max(0.001f, now - (m_Next - interval));
            m_Next = now + interval;
            var ap = Holder.Instance;
            bool apOn = ap != null && ap.Active;
            var th = apOn ? ap.ThermalStatus.ThermalMetrics : default;
            var bn = apOn ? ap.PerformanceStatus.PerformanceMetrics.PerformanceBottleneck.ToString() : (director != null ? director.Bottleneck.ToString() : "");
            var inv = CultureInfo.InvariantCulture;
            var row = string.Join(",", new[]
            {
                (now - m_Start).ToString("0.0", inv), m_Cpu.Count.ToString(inv), (m_Cpu.Count / span).ToString("0.0", inv),
                P95(m_Cpu).ToString("0.00", inv), Max(m_Cpu).ToString("0.00", inv),
                m_Gpu.Count > 0 ? P95(m_Gpu).ToString("0.00", inv) : "", m_Gpu.Count > 0 ? Max(m_Gpu).ToString("0.00", inv) : "",
                apOn ? ((int)th.WarningLevel).ToString(inv) : "", apOn ? th.TemperatureLevel.ToString("0.00", inv) : "", apOn ? th.TemperatureTrend.ToString("0.00", inv) : "",
                bn, SystemInfo.batteryLevel.ToString("0.00", inv), BatteryTempC().ToString("0.0", inv),
                QualitySettings.names[QualitySettings.GetQualityLevel()], QualitySettings.lodBias.ToString("0.00", inv),
                director != null ? director.CurrentRenderScale.ToString("0.00", inv) : "", m_Ftm ? "on" : "off",
            });
            m_Out.WriteLine(row);
            m_Out.Flush();
            Rows++;
            m_Cpu.Clear(); m_Gpu.Clear();
        }

        void OnDestroy()
        {
            if (m_Out == null) return;
            if (m_Cpu.Count > 0) WriteRow();
            m_Out.Dispose();
            m_Out = null;
        }

        static double P95(List<double> v)
        {
            if (v.Count == 0) return 0;
            var a = v.ToArray();
            Array.Sort(a);
            return a[Math.Min(a.Length - 1, (int)Math.Ceiling(0.95 * a.Length) - 1)];
        }

        static double Max(List<double> v)
        {
            double m = 0;
            foreach (var x in v) if (x > m) m = x;
            return m;
        }

        /// <summary>Battery temperature in degrees C on Android (sticky ACTION_BATTERY_CHANGED intent,
        /// EXTRA_TEMPERATURE in tenths of a degree); -1 elsewhere [added].</summary>
        public static float BatteryTempC()
        {
#if UNITY_ANDROID
            if (Application.isEditor) return -1f;
            try
            {
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                using (var filter = new AndroidJavaObject("android.content.IntentFilter", "android.intent.action.BATTERY_CHANGED"))
                using (var intent = activity.Call<AndroidJavaObject>("registerReceiver", null, filter))
                    return intent == null ? -1f : intent.Call<int>("getIntExtra", "temperature", -10) / 10f;
            }
            catch (Exception) { return -1f; }
#else
            return -1f;
#endif
        }
    }
}
