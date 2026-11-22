// WebBridge.cs (scenario-unity-web skill, 2026-09-24). Self-reporting probe for a Unity 6.3 Web build.
// Put it on a GameObject named "WebBridge" (the page reaches it by name with SendMessage).
// It logs one machine-readable line per event, "AGENTWEB {json}", that a headless browser test
// asserts on: ready (graphics API actually running, since WebGPU falls back silently),
// gameplay_start (the moment portals stop counting the initial download), leaderboard (the
// .jslib round trip), page (a SendMessage from the page), deferred (content fetched after start),
// readback (AsyncGPUReadback, the only GPU readback that works on WebGPU), glyphs (characters of
// page text the shipped font cannot draw: WebGL 2 has no system fonts), keyboard (capture state).
// Page -> game calls: OnPageEvent(json) with kind "name" (display), "submit" (send text/value to the
// page leaderboard), "start" (tap-to-play overlay); SetKeyboardCapture("0"|"1").
// No legacy Input, no System.Threading: Awaitable and coroutines only (no C# threads on the Web).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py and test_live_web_v2.py.
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Rendering;

namespace AgentWeb
{
    public class WebBridge : MonoBehaviour
    {
        [Serializable] class Ready { public string @event = "ready"; public string api; public string version; public bool compute; public bool asyncReadback; public int width; public int height; public string unity; public string platform; }
        [Serializable] class Leader { public string @event = "leaderboard"; public bool ok; public int rank; public string error; public string sent; public string name; }
        [Serializable] class Glyphs { public string @event = "glyphs"; public string text; public int chars; public int missingHasCharacter; public int missingCharacterInfo; public string font; }
        [Serializable] class Keyboard { public string @event = "keyboard"; public bool captureAll; public bool supported; }
        [Serializable] class Page { public string @event = "page"; public string kind; public string text; public int value; }
        [Serializable] class Deferred { public string @event = "deferred"; public bool ok; public long bytes; public string error; public float seconds; }
        [Serializable] class Readback { public string @event = "readback"; public bool ok; public string error; public float r; public float g; public float b; }
        [Serializable] class Simple { public string @event; public string detail; }
        [Serializable] class PageEvent { public string kind; public string text; public int value; }

        [Tooltip("Score sent to the page leaderboard once gameplay starts")] public int demoScore = 1234;
        public string playerName = "agent";
        [Tooltip("File under StreamingAssets fetched after gameplay_start (empty: skip)")] public string deferredFile = "deferred.bin";
        public Renderer indicator;

        string _api = "?", _leader = "waiting", _page = "none", _deferred = "not started", _readback = "not started";
        string _glyphText;                          // page text waiting for a glyph check (GUI.skin only inside OnGUI)
        GUIStyle _style;

        static void Emit(object payload) => Debug.Log("AGENTWEB " + JsonUtility.ToJson(payload));

        void Start()
        {
            _api = SystemInfo.graphicsDeviceType.ToString();
            Emit(new Ready
            {
                api = _api, version = SystemInfo.graphicsDeviceVersion, compute = SystemInfo.supportsComputeShaders,
                asyncReadback = SystemInfo.supportsAsyncGPUReadback, width = Screen.width, height = Screen.height,
                unity = Application.unityVersion, platform = Application.platform.ToString(),
            });
            Tint(new Color(0.55f, 0.55f, 0.55f));
            StartCoroutine(Flow());
            AwaitableProbe();
        }

        IEnumerator Flow()
        {
            yield return null;                       // first frame is on screen
            yield return new WaitForEndOfFrame();
            WebLeaderboard.Signal("gameplay_start", _api);
            Emit(new Simple { @event = "gameplay_start", detail = _api });
            Submit(playerName, demoScore);
            if (!string.IsNullOrEmpty(deferredFile)) StartCoroutine(LoadDeferred());
            StartCoroutine(ReadbackProbe());
        }

        void Submit(string name, int score)
        {
            WebLeaderboard.SubmitScore(name, score, res =>
            {
                _leader = res.ok ? "rank " + res.rank + " (" + res.name + ")" : "failed: " + res.error;
                if (res.ok) Tint(new Color(0.2f, 0.75f, 0.3f));
                Emit(new Leader { ok = res.ok, rank = res.rank, error = res.error, sent = name, name = res.name });
            });
        }

        async void AwaitableProbe()
        {
            // Awaitable runs on the main thread's player loop: the Web-safe replacement for Task.Delay
            await Awaitable.WaitForSecondsAsync(0.25f);
            await Awaitable.NextFrameAsync();
            Emit(new Simple { @event = "awaitable", detail = "ok" });
        }

        IEnumerator LoadDeferred()
        {
            _deferred = "loading";
            float t0 = Time.realtimeSinceStartup;
            var url = Application.streamingAssetsPath + "/" + deferredFile;
            using (var req = UnityWebRequest.Get(url))
            {
                yield return req.SendWebRequest();       // never busy-wait on isDone: one thread only
                bool ok = req.result == UnityWebRequest.Result.Success;
                long n = ok ? (long)req.downloadHandler.data.Length : 0;
                _deferred = ok ? (n / 1024) + " KB" : "failed " + req.error;
                Emit(new Deferred { ok = ok, bytes = n, error = ok ? "" : req.error, seconds = Time.realtimeSinceStartup - t0 });
            }
        }

        IEnumerator ReadbackProbe()
        {
            if (!SystemInfo.supportsAsyncGPUReadback)
            {
                _readback = "unsupported";
                Emit(new Readback { ok = false, error = "supportsAsyncGPUReadback false" });
                yield break;
            }
            var rt = new RenderTexture(8, 8, 0, RenderTextureFormat.ARGB32);
            var tex = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            tex.SetPixel(0, 0, new Color(1f, 0.5f, 0.25f, 1f));
            tex.Apply();
            Graphics.Blit(tex, rt);
            var req = AsyncGPUReadback.Request(rt);   // Texture2D.ReadPixels/GetPixels on GPU data fail on WebGPU
            while (!req.done) yield return null;
            if (req.hasError) { _readback = "error"; Emit(new Readback { ok = false, error = "hasError" }); }
            else
            {
                var px = req.GetData<Color32>();
                var c = px.Length > 0 ? px[0] : default;
                _readback = "ok " + c;
                Emit(new Readback { ok = true, r = c.r / 255f, g = c.g / 255f, b = c.b / 255f });
            }
            rt.Release();
            Destroy(rt);
            Destroy(tex);
        }

        // Page -> game: unityInstance.SendMessage('WebBridge', 'OnPageEvent', JSON.stringify({...}))
        // SendMessage carries zero or one string or number: structured data travels as one JSON string.
        public void OnPageEvent(string json)
        {
            PageEvent e;
            try { e = JsonUtility.FromJson<PageEvent>(json); }
            catch (Exception ex) { Emit(new Simple { @event = "page_error", detail = ex.Message }); return; }
            _page = e.kind + " '" + e.text + "' " + e.value;
            Tint(new Color(0.2f, 0.45f, 0.95f));
            Emit(new Page { kind = e.kind, text = e.text, value = e.value });
            if (!string.IsNullOrEmpty(e.text)) _glyphText = e.text;
            if (e.kind == "submit") Submit(e.text, e.value);
        }

        // Page -> game: SetKeyboardCapture("0") lets page text fields (a name box beside the canvas) get
        // keystrokes. By default Unity Web processes all keyboard input the page receives, canvas focused
        // or not (6.3 Manual, Input in Web > Keyboard input and focus handling). WebGLInput lives in
        // UnityEngine.WebGLModule, which only exists in Web player builds.
        public void SetKeyboardCapture(string on)
        {
            bool capture = on != "0" && on != "false";
#if UNITY_WEBGL && !UNITY_EDITOR
            WebGLInput.captureAllKeyboardInput = capture;
            Emit(new Keyboard { captureAll = WebGLInput.captureAllKeyboardInput, supported = true });
#else
            Emit(new Keyboard { captureAll = capture, supported = false });
#endif
        }

        // WebGL 2 has no system fonts (6.3 Manual, WebGL2): a glyph the shipped font lacks draws as
        // nothing or a box, where a desktop build would fall back to an OS font. Counted in OnGUI because
        // GUI.skin is only valid there.
        void CheckGlyphs(Font f, string text)
        {
            int chars = 0, missHas = 0, missInfo = 0;
            if (f != null) f.RequestCharactersInTexture(text, _style.fontSize);
            foreach (char c in text)
            {
                if (char.IsWhiteSpace(c) || char.IsSurrogate(c)) continue;
                chars++;
                if (f == null || !f.HasCharacter(c)) missHas++;
                if (f == null || !f.GetCharacterInfo(c, out _, _style.fontSize)) missInfo++;
            }
            Emit(new Glyphs { text = text, chars = chars, missingHasCharacter = missHas, missingCharacterInfo = missInfo, font = f != null ? f.name : "none" });
        }

        void Tint(Color c)
        {
            if (indicator == null) return;
            var mpb = new MaterialPropertyBlock();
            indicator.GetPropertyBlock(mpb);
            mpb.SetColor("_BaseColor", c);           // URP Lit
            mpb.SetColor("_Color", c);
            indicator.SetPropertyBlock(mpb);
        }

        void OnGUI()
        {
            // font from the SHORT side: a 390 px portrait phone canvas clipped every line at height/28 (observed)
            if (_style == null) _style = new GUIStyle(GUI.skin.label) { fontSize = Mathf.Max(14, Mathf.Min(Screen.height / 28, Screen.width / 26)) };
            if (_glyphText != null && Event.current.type == EventType.Repaint)
            {
                var t = _glyphText;
                _glyphText = null;
                CheckGlyphs(_style.font != null ? _style.font : GUI.skin.font, t);
            }
            float h = _style.fontSize * 1.5f;
            string[] lines = { "Graphics API: " + _api, "Leaderboard: " + _leader, "Page event: " + _page, "Deferred: " + _deferred, "Readback: " + _readback };
            for (int i = 0; i < lines.Length; i++) GUI.Label(new Rect(16, 12 + i * h, Screen.width - 32, h), lines[i], _style);
        }
    }
}
