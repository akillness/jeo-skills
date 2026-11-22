// AgentKit runtime smoke test (scenario-unity-pipeline-automation, 2026-09-24). Put it on a GameObject in the
// boot scene (PipelineBuild.EnsureSmokeScene does). It does nothing unless the player is launched
// with `-agentSmoke <label>`; then it initializes Addressables, loads every GameObject with that
// label, instantiates them, counts loaded AssetBundles, releases everything, counts again, prints
// one `AGENT_SMOKE {json}` line and quits with 0 (ok) or 1:
//   <Game>.app/Contents/MacOS/<exe> -batchmode -nographics -logFile smoke.log -agentSmoke biome_forest
// Proves the content build and its catalog shipped inside the player (ut_pipeline.player_smoke).
// Runtime assembly (Assembly-CSharp); Addressables is auto-referenced. Run in a macOS Mono player built
// by Unity 6000.3.21f1 on 2026-09-24.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class AgentAddressablesSmoke : MonoBehaviour
{
    IEnumerator Start()
    {
        var label = Arg("-agentSmoke");
        if (string.IsNullOrEmpty(label)) yield break;
        float t0 = Time.realtimeSinceStartup;
        int bundlesBefore = AssetBundle.GetAllLoadedAssetBundles().Count();
        var init = Addressables.InitializeAsync(false);
        yield return init;
        bool initOk = init.Status == AsyncOperationStatus.Succeeded;
        Addressables.Release(init);
        var handle = Addressables.LoadAssetsAsync<GameObject>(label, null);
        yield return handle;
        bool ok = initOk && handle.Status == AsyncOperationStatus.Succeeded && handle.Result != null && handle.Result.Count > 0;
        // read everything from the handle BEFORE releasing it: a released handle throws on access
        var err = handle.OperationException != null ? handle.OperationException.Message.Replace("\"", "'").Replace("\n", " ") : "";
        int count = ok ? handle.Result.Count : 0;
        var names = ok ? handle.Result.Select(g => g.name).OrderBy(n => n, StringComparer.Ordinal).Take(5).ToList() : new List<string>();
        int bundlesLoaded = AssetBundle.GetAllLoadedAssetBundles().Count();
        int instances = 0;
        var spawned = new List<GameObject>();
        if (ok) foreach (var g in handle.Result) { spawned.Add(Instantiate(g)); instances++; }
        float loadMs = (Time.realtimeSinceStartup - t0) * 1000f;
        foreach (var s in spawned) Destroy(s);
        if (handle.IsValid()) Addressables.Release(handle);
        yield return null;
        int bundlesNextFrame = AssetBundle.GetAllLoadedAssetBundles().Count();
        // released is not unloaded: wait (max 5 s) until the bundles are really gone
        float tRel = Time.realtimeSinceStartup;
        while (AssetBundle.GetAllLoadedAssetBundles().Count() > bundlesBefore && Time.realtimeSinceStartup - tRel < 5f) yield return null;
        int bundlesAfterRelease = AssetBundle.GetAllLoadedAssetBundles().Count();
        float unloadMs = (Time.realtimeSinceStartup - tRel) * 1000f;
        Debug.Log("AGENT_SMOKE {\"ok\":" + (ok ? "true" : "false") + ",\"label\":\"" + label + "\",\"assets\":" + count +
                  ",\"instances\":" + instances + ",\"bundles_before\":" + bundlesBefore + ",\"bundles_loaded\":" + bundlesLoaded +
                  ",\"bundles_next_frame\":" + bundlesNextFrame + ",\"bundles_after_release\":" + bundlesAfterRelease +
                  ",\"unload_wait_ms\":" + unloadMs.ToString("F1", System.Globalization.CultureInfo.InvariantCulture) + ",\"load_ms\":" + loadMs.ToString("F1", System.Globalization.CultureInfo.InvariantCulture) +
                  ",\"sample\":[" + string.Join(",", names.Select(n => "\"" + n + "\"")) + "],\"unity\":\"" + Application.unityVersion +
                  "\",\"platform\":\"" + Application.platform + "\",\"error\":\"" + err + "\"}");
        Application.Quit(ok ? 0 : 1);
    }

    static string Arg(string flag)
    {
        var a = Environment.GetCommandLineArgs();
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == flag) return a[i + 1];
        return null;
    }
}
