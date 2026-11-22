// AgentKit runtime helper v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24): PSO tracing and
// progressive warm-up with GraphicsStateCollection (Unite 2025 K3-wPnhmDi4 [00:17:11] to
// [00:19:48]: trace in a development build, save, then warm up a few PSOs per frame behind a
// progress bar so shader compilation does not hitch in gameplay).
// VERIFICATION and development builds; the warm-up part is what a shipping loading screen runs.
// Player arguments (the helper does nothing without them):
//   -agentPSOTrace <file.graphicsstate> [-agentFrames 120]   trace while the main camera renders, save, quit
//   -agentPSOWarm  <file.graphicsstate> [-agentPerFrame 3]   load, WarmUpProgressively(K) each frame, quit
// Log line: AGENT_PSO mode=... device=... dev=... variants=... states=... warmed=... frames=... ms=...
// Tracing records only in development builds; trace one collection per graphics API and platform
// on the target devices (Metal here; Vulkan and the GLES warm-up path on Android phones).
// Run in Unity 6000.3.21f1 macOS development players on 2026-09-24: tests/code/unity-rendering-lighting/test_17_pso_player.py.
using System.Collections;
using System.IO;
using Unity.Jobs;
using UnityEngine;
using UnityEngine.Experimental.Rendering;

public class AgentPSOWarmup : MonoBehaviour
{
    string m_Trace, m_Warm;
    int m_Frames = 120, m_PerFrame = 3;
    RenderTexture m_RT;

    static string Arg(string name)
    {
        var a = System.Environment.GetCommandLineArgs();
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
        return null;
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot()
    {
        string trace = Arg("-agentPSOTrace"), warm = Arg("-agentPSOWarm");
        if (trace == null && warm == null) return;
        var go = new GameObject("AgentPSOWarmup");
        DontDestroyOnLoad(go);
        var c = go.AddComponent<AgentPSOWarmup>();
        c.m_Trace = trace;
        c.m_Warm = warm;
        if (!int.TryParse(Arg("-agentFrames") ?? "120", out c.m_Frames)) c.m_Frames = 120;
        if (!int.TryParse(Arg("-agentPerFrame") ?? "3", out c.m_PerFrame)) c.m_PerFrame = 3;
    }

    // a -batchmode player presents nothing: render the main camera into a texture so the scene's
    // shaders and pipeline states are really used while tracing
    void RenderMain()
    {
        var cam = Camera.main;
        if (cam == null) return;
        if (m_RT == null) m_RT = new RenderTexture(1280, 720, 24);
        var prev = cam.targetTexture;
        cam.targetTexture = m_RT;
        cam.Render();
        cam.targetTexture = prev;
    }

    IEnumerator Start()
    {
        var col = new GraphicsStateCollection();
        float t0 = Time.realtimeSinceStartup;
        int frames = 0;
        string mode;
        if (m_Trace != null)
        {
            mode = "trace";
            col.BeginTrace();
            for (; frames < m_Frames; frames++) { RenderMain(); yield return null; }
            col.EndTrace();
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(m_Trace)));
            col.SaveToFile(m_Trace);
        }
        else
        {
            mode = "warm";
            col.LoadFromFile(m_Warm);
            while (!col.isWarmedUp && frames < 100000)
            {
                var h = col.WarmUpProgressively(m_PerFrame, default(JobHandle));
                frames++;
                yield return null;
                h.Complete();
            }
        }
        Debug.Log("AGENT_PSO mode=" + mode + " device=" + SystemInfo.graphicsDeviceType + " dev=" + Debug.isDebugBuild +
                  " variants=" + col.variantCount + " states=" + col.totalGraphicsStateCount + " warmed=" + col.completedWarmupCount +
                  " frames=" + frames + " ms=" + Mathf.RoundToInt((Time.realtimeSinceStartup - t0) * 1000) +
                  " file_exists=" + File.Exists(m_Trace ?? m_Warm));
        Application.Quit();
    }
}
