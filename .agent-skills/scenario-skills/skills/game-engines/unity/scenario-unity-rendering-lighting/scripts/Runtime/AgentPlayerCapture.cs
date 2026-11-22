// AgentKit runtime helper (scenario-unity-rendering-lighting v0.1, 2026-09-24). For verification builds
// only, never in a shipping build: install with ut_lighting.install_player_capture(P) (it lands
// outside Assets/Editor so the player includes it). In a player started with
//   -agentOut /abs/file.png [-agentQuality Mobile] [-agentView D_Ball]
// switch the quality level, move the main camera to the AgentView_<view> bookmark, render it
// into a RenderTexture after a few frames, save a PNG and quit. Lets the lighting tests check in a
// real player what the Editor captures show.
using System.Collections;
using System.IO;
using UnityEngine;

public class AgentPlayerCapture : MonoBehaviour
{
    static string Arg(string flag)
    {
        var a = System.Environment.GetCommandLineArgs();
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == flag) return a[i + 1];
        return null;
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot()
    {
        if (Arg("-agentOut") == null) return;
        new GameObject("AgentPlayerCapture").AddComponent<AgentPlayerCapture>();
    }

    IEnumerator Start()
    {
        var q = Arg("-agentQuality");
        if (q != null)
            for (int i = 0; i < QualitySettings.names.Length; i++)
                if (QualitySettings.names[i] == q) QualitySettings.SetQualityLevel(i, true);
        var view = Arg("-agentView") ?? "D_Ball";
        var cam = Camera.main;
        foreach (var c in Resources.FindObjectsOfTypeAll<Camera>())
            if (c.gameObject.name == "AgentView_" + view) { cam.transform.SetPositionAndRotation(c.transform.position, c.transform.rotation); cam.fieldOfView = c.fieldOfView; }
        for (int i = 0; i < 10; i++) yield return null;
        var rt = new RenderTexture(1280, 720, 24);
        cam.targetTexture = rt;
        cam.Render();
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(1280, 720, TextureFormat.RGBA32, false);
        tex.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
        tex.Apply();
        File.WriteAllBytes(Arg("-agentOut"), tex.EncodeToPNG());
        bool clustered = Shader.IsKeywordEnabled("_CLUSTER_LIGHT_LOOP");   // Forward+ light loop keyword (6.1+)
        Debug.Log("AGENT_PLAYER_CAPTURE " + Arg("-agentOut") + " quality=" + QualitySettings.names[QualitySettings.GetQualityLevel()] +
                  " levels=" + string.Join("|", QualitySettings.names) + " cluster_light_loop=" + clustered);
        Application.Quit(0);
    }
}
