// scenario-unity-world-building v0.2 (2026-09-24). Streaming measured in a built Player, where
// Application.backgroundLoadingPriority actually applies ("This setting has no effect in the Editor;
// it only applies in a built Player", 6.3 Scripting API). The docs' quality gate: per-frame time in
// the "Application.Integrate Assets in Background" marker stays inside the chosen budget (Low 2 ms,
// BelowNormal 4, Normal 10, High 50 per frame), and memory returns near baseline after unload plus
// Resources.UnloadUnusedAssets (doc-multi-scene-streaming, How the expert judges quality).
// Use: first scene of a development build (WorldScenes.MakeStreamProbeScene writes it; ut_world.
// stream_probe builds and runs it). For each priority it loads every chunk additively BY PATH with
// activation not held, records per frame: frame ms, Integrate marker ms (ProfilerRecorder), then
// unloads, sweeps, and records "Total Used Memory", "Texture Memory", "Mesh Memory". Writes JSON to
// the path after -streamProbeOut (default persistentDataPath/stream_probe.json) and quits. With
// -streamProbeSnapshots <dir> it also writes Memory Profiler snapshots at the baseline and after the
// last sweep (open both in Window > Analysis > Memory Profiler > Compare).
// Run in Unity 6000.3.21f1 on 2026-09-24: macOS development player, test_live_world_v2.py.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Unity.Profiling;
using Unity.Profiling.LowLevel.Unsafe;
using Unity.Profiling.Memory;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace AgentKit.World
{
    [Serializable]
    public class MarkerMax { public string marker; public float maxMs, sumMs; }

    [Serializable]
    public class ProbeLoad
    {
        public string scene; public string priority;
        public float loadMs; public int frames;
        public float maxFrameMs, meanFrameMs, maxIntegrateMs, meanIntegrateMs; public int framesOverBudget;
        public float unloadMs;
        public List<MarkerMax> controls = new List<MarkerMax>();   // other loading markers and PlayerLoop, same frames
    }

    [Serializable]
    public class ProbeMemory { public string stage; public float totalUsedMb, textureMb, meshMb, gcUsedMb; }

    [Serializable]
    public class ProbeSnapshot { public string stage, path; public bool ok; public float mb; }

    [Serializable]
    public class ProbeReport
    {
        public string unityVersion, platform, graphics; public bool development, editor;
        public string integrateMarker; public bool integrateRecorderValid; public bool profilerEnabled; public List<string> markersSeen = new List<string>();
        public List<ProbeLoad> loads = new List<ProbeLoad>();
        public List<ProbeMemory> memory = new List<ProbeMemory>();
        public List<ProbeSnapshot> snapshots = new List<ProbeSnapshot>();
        public int targetFrameRate; public string error;
    }

    public class StreamProbe : MonoBehaviour
    {
        public string corePath = "Assets/World/Scenes/World_Core.unity";
        public List<string> chunkPaths = new List<string>();
        public List<string> priorities = new List<string> { "Low", "High" };
        public int settleFrames = 30;
        public int targetFrameRate = 60;
        public const string IntegrateMarker = "Application.Integrate Assets in Background";
        const ProfilerRecorderOptions Opts = ProfilerRecorderOptions.Default | ProfilerRecorderOptions.StartImmediately;
        static readonly string[] ControlMarkers = { "Application.LoadLevelAsync Integrate", "IntegrateAllThreadedObjects", "Loading.AwakeFromLoad", "Gfx.IntegrateTexture", "PlayerLoop" };
        readonly ProbeReport m_Report = new ProbeReport();

        static float BudgetMs(ThreadPriority p) => p == ThreadPriority.Low ? 2f : p == ThreadPriority.BelowNormal ? 4f : p == ThreadPriority.Normal ? 10f : 50f;

        static string Arg(string flag, string def)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == flag) return a[i + 1];
            return def;
        }

        IEnumerator Start()
        {
            DontDestroyOnLoad(gameObject);
            Application.targetFrameRate = targetFrameRate;
            QualitySettings.vSyncCount = 0;
            m_Report.targetFrameRate = targetFrameRate;
            m_Report.unityVersion = Application.unityVersion; m_Report.platform = Application.platform.ToString();
            m_Report.graphics = SystemInfo.graphicsDeviceType.ToString(); m_Report.development = Debug.isDebugBuild; m_Report.editor = Application.isEditor;
            var outPath = Arg("-streamProbeOut", Path.Combine(Application.persistentDataPath, "stream_probe.json"));
            ProfilerRecorder integrate = default;
            var controls = new List<(string name, ProfilerRecorder rec)>();
            // markers only produce samples while the profiler is on (development players): turn it on for the probe
            if (Debug.isDebugBuild && Arg("-streamProbeNoProfiler", null) == null) UnityEngine.Profiling.Profiler.enabled = true;
            m_Report.profilerEnabled = UnityEngine.Profiling.Profiler.enabled;
            var total = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "Total Used Memory");
            var tex = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "Texture Memory");
            var mesh = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "Mesh Memory");
            var gc = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Used Memory");
            try
            {
                var core = SceneManager.LoadSceneAsync(corePath, LoadSceneMode.Single);
                if (core == null) { Finish(outPath, "core not in the build: " + corePath); yield break; }
                while (!core.isDone) yield return null;
                // find the marker by name (its category is not needed that way)
                var handles = new List<ProfilerRecorderHandle>();
                ProfilerRecorderHandle.GetAvailable(handles);
                foreach (var hd in handles)
                {
                    var d = ProfilerRecorderHandle.GetDescription(hd);
                    if (d.Name.IndexOf("Integrate", StringComparison.OrdinalIgnoreCase) >= 0 || d.Name.StartsWith("Loading.")) m_Report.markersSeen.Add(d.Category.Name + "/" + d.Name);
                    // observed: the handle constructor does NOT start recording (ProfilerRecorderOptions.Default lacks
                    // StartImmediately; StartNew starts): the first probe read 0 ms for every marker, PlayerLoop included
                    if (d.Name == IntegrateMarker && !integrate.Valid) integrate = new ProfilerRecorder(hd, 1, Opts);
                    if (Array.IndexOf(ControlMarkers, d.Name) >= 0 && !controls.Any(c => c.name == d.Name)) controls.Add((d.Name, new ProfilerRecorder(hd, 1, Opts)));
                }
                if (!integrate.Valid) integrate = ProfilerRecorder.StartNew(ProfilerCategory.Loading, IntegrateMarker);
                m_Report.integrateMarker = IntegrateMarker; m_Report.integrateRecorderValid = integrate.Valid;
                // the core's own streamer would react to the camera: this probe drives loading itself
                foreach (var st in FindObjectsByType<WorldStreamer>(FindObjectsSortMode.None)) st.enabled = false;
                for (int i = 0; i < settleFrames; i++) yield return null;
                yield return Resources.UnloadUnusedAssets();
                Mem("baseline_core", total, tex, mesh, gc);
                var snapDir = Arg("-streamProbeSnapshots", null);          // Memory Profiler snapshots to compare
                if (snapDir != null) yield return Snap(snapDir, "baseline_core");
                foreach (var pn in priorities)
                {
                    var prio = (ThreadPriority)Enum.Parse(typeof(ThreadPriority), pn);
                    Application.backgroundLoadingPriority = prio;
                    float budget = BudgetMs(prio);
                    var mine = new List<ProbeLoad>();
                    foreach (var path in chunkPaths)
                    {
                        var r = new ProbeLoad { scene = path, priority = pn };
                        var frameMs = new List<float>(); var integMs = new List<float>();
                        var cmax = controls.Select(c => new MarkerMax { marker = c.name }).ToList();
                        double t0 = Time.realtimeSinceStartupAsDouble;
                        var op = SceneManager.LoadSceneAsync(path, LoadSceneMode.Additive);   // by path, activation not held
                        if (op == null) { Finish(outPath, "chunk not in the build: " + path); yield break; }
                        while (!op.isDone)
                        {
                            yield return null;
                            frameMs.Add(Time.unscaledDeltaTime * 1000f);
                            integMs.Add(integrate.Valid ? integrate.LastValue / 1e6f : -1f);
                            for (int ci = 0; ci < controls.Count; ci++)
                            {
                                float v = controls[ci].rec.Valid ? controls[ci].rec.LastValue / 1e6f : -1f;
                                cmax[ci].maxMs = Mathf.Max(cmax[ci].maxMs, v); cmax[ci].sumMs += Mathf.Max(0f, v);
                            }
                        }
                        r.controls = cmax;
                        r.loadMs = (float)((Time.realtimeSinceStartupAsDouble - t0) * 1000.0); r.frames = frameMs.Count;
                        r.maxFrameMs = frameMs.Count > 0 ? frameMs.Max() : 0; r.meanFrameMs = frameMs.Count > 0 ? frameMs.Average() : 0;
                        r.maxIntegrateMs = integMs.Count > 0 ? integMs.Max() : 0; r.meanIntegrateMs = integMs.Count > 0 ? integMs.Average() : 0;
                        r.framesOverBudget = integMs.Count(v => v > budget * 1.1f);
                        mine.Add(r); m_Report.loads.Add(r);
                        for (int i = 0; i < 5; i++) yield return null;
                    }
                    Mem("loaded_" + pn, total, tex, mesh, gc);
                    foreach (var r in mine)
                    {
                        double t0 = Time.realtimeSinceStartupAsDouble;
                        var op = SceneManager.UnloadSceneAsync(r.scene);
                        while (op != null && !op.isDone) yield return null;
                        r.unloadMs = (float)((Time.realtimeSinceStartupAsDouble - t0) * 1000.0);
                    }
                    for (int i = 0; i < 5; i++) yield return null;
                    Mem("unloaded_" + pn, total, tex, mesh, gc);
                    yield return Resources.UnloadUnusedAssets();
                    for (int i = 0; i < 5; i++) yield return null;
                    Mem("swept_" + pn, total, tex, mesh, gc);
                }
                if (snapDir != null) yield return Snap(snapDir, "swept_last");
            }
            finally
            {
                if (integrate.Valid) integrate.Dispose();
                foreach (var c in controls) if (c.rec.Valid) c.rec.Dispose();
            }
            total.Dispose(); tex.Dispose(); mesh.Dispose(); gc.Dispose();
            Finish(outPath, null);
        }

        void Finish(string outPath, string error)
        {
            m_Report.error = error;
            Directory.CreateDirectory(Path.GetDirectoryName(outPath));
            File.WriteAllText(outPath, JsonUtility.ToJson(m_Report, true));
            Debug.Log("STREAM_PROBE_DONE " + outPath + (error != null ? " ERROR " + error : ""));
            if (!Application.isEditor) Application.Quit(error == null ? 0 : 1);
        }

        IEnumerator Snap(string dir, string stage)
        {
            Directory.CreateDirectory(dir);
            var snap = new ProbeSnapshot { stage = stage, path = Path.Combine(dir, stage + ".snap") };
            bool done = false;
            MemoryProfiler.TakeSnapshot(snap.path, (p, ok) => { done = true; snap.ok = ok; },
                CaptureFlags.ManagedObjects | CaptureFlags.NativeObjects | CaptureFlags.NativeAllocations);
            float t0 = Time.realtimeSinceStartup;
            while (!done && Time.realtimeSinceStartup - t0 < 120f) yield return null;
            if (File.Exists(snap.path)) snap.mb = new FileInfo(snap.path).Length / (1024f * 1024f);
            m_Report.snapshots.Add(snap);
        }

        void Mem(string stage, ProfilerRecorder total, ProfilerRecorder tex, ProfilerRecorder mesh, ProfilerRecorder gc)
        {
            const float MB = 1024f * 1024f;
            m_Report.memory.Add(new ProbeMemory { stage = stage, totalUsedMb = total.LastValue / MB, textureMb = tex.LastValue / MB, meshMb = mesh.LastValue / MB, gcUsedMb = gc.LastValue / MB });
        }
    }
}
