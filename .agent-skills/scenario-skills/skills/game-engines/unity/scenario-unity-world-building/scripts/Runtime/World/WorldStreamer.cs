// scenario-unity-world-building v0.2 (2026-09-24). Additive scene streaming for a persistent core scene
// plus chunk scenes, written to the 6.3 Manual's rules:
//  - load by full scene PATH (names are case-insensitive and the first build-list match wins);
//  - never hold allowSceneActivation = false during gameplay: it freezes progress at 0.9 AND
//    stalls the whole AsyncOperation queue, later unloads included (live-tested: see
//    tests/code/unity-world-building/unity/Tests/PlayMode/StreamingTests.cs);
//  - UnloadSceneAsync frees GameObjects, not assets: Resources.UnloadUnusedAssets on a cadence;
//  - the core scene stays ACTIVE (it owns RenderSettings, lightmaps, fog; Instantiate lands there);
//  - Application.backgroundLoadingPriority: Low (2 ms/frame integration) while playing, High
//    (50 ms) behind a loading screen. It does nothing in the Editor: measure in a Player.
//  - scan scenes already open in Start (a chunk opened in the Editor must not load twice,
//    zObWVOv1GlE [00:11:21]; the PlayMode test ScanOnStartPreventsDoubleLoad shows the second
//    copy when the scan is off); distance with hysteresis for open ground, triggers for interiors;
//  - an optional proxy per chunk (a merged, one-object stand-in living in the core scene) is shown
//    while the chunk is unloaded, so a village seen across open ground never pops in or out
//    (videos digest visual checklist: "chunk and scene pop-in hidden by fog or LOD").
// Run in Unity 6000.3.21f1 on 2026-09-24 (PlayMode tests WorldStreamerLoadsAndUnloadsByDistance,
// ScanOnStartPreventsDoubleLoad, ProxyStandsInWhileChunkIsUnloaded).
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace AgentKit.World
{
    [Serializable]
    public class StreamedChunk
    {
        public string scenePath;          // "Assets/World/Scenes/World_Chunk_Village.unity"
        public Vector3 centre;            // world-space anchor (bounds centre of the chunk content)
        public float loadRadius = 250f;   // load inside this distance
        public float unloadRadius = 320f; // unload beyond this (hysteresis > load radius avoids thrash)
        public GameObject proxy;          // optional stand-in in the core scene, active while unloaded
        [NonSerialized] public bool loaded, busy;
        [NonSerialized] public float lastLoadMs, lastUnloadMs;
    }

    public class WorldStreamer : MonoBehaviour
    {
        public Transform viewer;                       // usually the player or Camera.main
        public List<StreamedChunk> chunks = new List<StreamedChunk>();
        public float checkInterval = 0.25f;            // seconds between distance checks
        public int unloadsBeforeAssetSweep = 2;        // Resources.UnloadUnusedAssets cadence
        public ThreadPriority gameplayPriority = ThreadPriority.Low;
        public bool scanLoadedScenesOnStart = true;    // off only to demonstrate the double load

        public event Action<StreamedChunk, bool> ChunkChanged; // (chunk, loaded)
        public readonly List<string> log = new List<string>();

        int m_UnloadsSinceSweep;
        float m_NextCheck;

        void Start()
        {
            Application.backgroundLoadingPriority = gameplayPriority;
            // chunks opened additively in the Editor (or by a previous session) count as loaded
            if (scanLoadedScenesOnStart)
                for (int i = 0; i < SceneManager.sceneCount; i++)
                {
                    var s = SceneManager.GetSceneAt(i);
                    foreach (var c in chunks)
                        if (s.isLoaded && string.Equals(s.path, c.scenePath, StringComparison.OrdinalIgnoreCase)) c.loaded = true;
                }
            foreach (var c in chunks) if (c.proxy) c.proxy.SetActive(!c.loaded);
            if (viewer == null && Camera.main != null) viewer = Camera.main.transform;
        }

        void Update()
        {
            if (viewer == null || Time.unscaledTime < m_NextCheck) return;
            m_NextCheck = Time.unscaledTime + checkInterval;
            var p = viewer.position;
            foreach (var c in chunks)
            {
                if (c.busy) continue;
                float d = Vector3.Distance(new Vector3(p.x, 0, p.z), new Vector3(c.centre.x, 0, c.centre.z));
                if (!c.loaded && d <= c.loadRadius) StartCoroutine(Load(c));
                else if (c.loaded && d > c.unloadRadius) StartCoroutine(Unload(c));
            }
        }

        public IEnumerator Load(StreamedChunk c)
        {
            if (c.loaded || c.busy) yield break;
            c.busy = true;
            var t0 = Time.realtimeSinceStartupAsDouble;
            var op = SceneManager.LoadSceneAsync(c.scenePath, LoadSceneMode.Additive); // by path, never bare name
            if (op == null) { c.busy = false; log.Add("load refused (not in build list?): " + c.scenePath); yield break; }
            while (!op.isDone) yield return null;                                       // activation NOT held
            c.lastLoadMs = (float)((Time.realtimeSinceStartupAsDouble - t0) * 1000.0);
            c.loaded = true; c.busy = false;
            if (c.proxy) c.proxy.SetActive(false);                                      // the real chunk is in
            log.Add($"loaded {c.scenePath} in {c.lastLoadMs:0.0} ms");
            ChunkChanged?.Invoke(c, true);
        }

        public IEnumerator Unload(StreamedChunk c)
        {
            if (!c.loaded || c.busy) yield break;
            c.busy = true;
            if (c.proxy) c.proxy.SetActive(true);                                       // stand-in first: no gap
            var t0 = Time.realtimeSinceStartupAsDouble;
            var op = SceneManager.UnloadSceneAsync(c.scenePath);
            if (op != null) while (!op.isDone) yield return null;
            c.lastUnloadMs = (float)((Time.realtimeSinceStartupAsDouble - t0) * 1000.0);
            c.loaded = false; c.busy = false;
            log.Add($"unloaded {c.scenePath} in {c.lastUnloadMs:0.0} ms");
            if (++m_UnloadsSinceSweep >= unloadsBeforeAssetSweep)
            {
                m_UnloadsSinceSweep = 0;
                var sweep = Resources.UnloadUnusedAssets();                              // unload frees no assets by itself
                while (!sweep.isDone) yield return null;
                log.Add("Resources.UnloadUnusedAssets done");
            }
            ChunkChanged?.Invoke(c, false);
        }

        /// <summary>Loading-screen path only: everything else queued waits while activation is held.</summary>
        public static IEnumerator LoadBehindLoadingScreen(string path, Action<float> progress)
        {
            var prev = Application.backgroundLoadingPriority;
            Application.backgroundLoadingPriority = ThreadPriority.High;
            var op = SceneManager.LoadSceneAsync(path, LoadSceneMode.Additive);
            op.allowSceneActivation = false;                  // set in a coroutine, never in Awake
            while (op.progress < 0.9f) { progress?.Invoke(op.progress / 0.9f); yield return null; }
            progress?.Invoke(1f);
            op.allowSceneActivation = true;                   // keep this gate short
            while (!op.isDone) yield return null;
            Application.backgroundLoadingPriority = prev;
        }
    }
}
