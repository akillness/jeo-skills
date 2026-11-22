// WebDeferredAddressable.cs (scenario-unity-web skill, 2026-09-24). Optional: needs com.unity.addressables.
// Loads one Addressables prefab AFTER gameplay start, so its bundle is not part of the initial
// download portals count (CrazyGames: bytes until the first gameplayStart). On the Web a local
// group's bundles sit in StreamingAssets/aa/WebGL and download through UnityWebRequest only when
// asked; the whole bundle then lives in memory until released (no Caching API on the Web).
// Logs "AGENTWEB {"event":"addressable",...}" for the headless browser test.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py test_13.
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

namespace AgentWeb
{
    public class WebDeferredAddressable : MonoBehaviour
    {
        [Serializable] class Ev { public string @event = "addressable"; public bool ok; public string name; public float seconds; public string error; }

        public string address = "DeferredProp";
        public Vector3 position = new Vector3(1.7f, 0.6f, 0.6f);
        AsyncOperationHandle<GameObject> _handle;

        IEnumerator Start()
        {
            yield return null;                      // WebBridge signals gameplay_start at the end of frame 1
            yield return new WaitForEndOfFrame();
            yield return null;
            float t0 = Time.realtimeSinceStartup;
            _handle = Addressables.LoadAssetAsync<GameObject>(address);   // first call also loads the catalog
            yield return _handle;
            bool ok = _handle.Status == AsyncOperationStatus.Succeeded;
            if (ok) Instantiate(_handle.Result, position, Quaternion.Euler(0f, -25f, 0f));
            Debug.Log("AGENTWEB " + JsonUtility.ToJson(new Ev
            {
                ok = ok, name = ok ? _handle.Result.name : "", seconds = Time.realtimeSinceStartup - t0,
                error = ok ? "" : (_handle.OperationException != null ? _handle.OperationException.Message : _handle.Status.ToString()),
            }));
        }

        void OnDestroy()
        {
            if (_handle.IsValid()) Addressables.Release(_handle);   // bundles stay in memory until released
        }
    }
}
