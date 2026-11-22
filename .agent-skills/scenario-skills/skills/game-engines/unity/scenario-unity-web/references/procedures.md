# Procedures (scenario-unity-web): full code, live test, recorded result

Every procedure ran in Unity 6000.3.21f1 (batch mode, macOS 26.5.1, Apple Silicon) and Google Chrome
153 headless (Playwright 1.58, `channel="chrome"`) on 2026-09-24. Live tests:
`tests/code/unity-web/test_live_web.py` (P1 to P12) and `test_live_web_v2.py` (P13 to P24, refactor
of the same day), offline tests: `tests/code/unity-web/test_offline.py` (19 tests); each result line
is in `archive/tests/unity-web/live_results.jsonl`. Sizes are decimal MB (10^6 bytes) as
`ut_web.size_report` measures them (the lead's AgentBuild reports MiB). Screenshots:
`~/Developer/scratch/playwright-screenshots/unity-web_*.png`, all opened and checked. Final
regression on the shipped code (19:54): the 7 non-build tests (P1, P3 to P5, P9) re-ran against the
existing builds and passed; the build tests' numbers below come from their own runs. The jsonl also
keeps the two failed runs that led to fixes (the LAN gzip load without Allow downloads over HTTP, a
WebGPU check blocked by Brotli on plain HTTP); the first gzip build, broken by a `{{{ }}}` macro in
a `.jslib` comment, stopped before recording (its log:
`tests/projects/unity-web/Library/AgentKit/jobs/20260924-191227-Build-9a20/unity.log`).

Common setup (every procedure):

```python
import sys
sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-web/scripts")
import ut_env, ut_run, ut_stat, ut_web
P = ut_env.base_project("3d", "<root>/tests/projects/<your-project>")     # APFS clone of Base3D_URP + core AgentKit
ut_env.install_agentkit(P, src=ut_web.AGENTKIT_WEB)                         # Assets/Editor/AgentKit/Web/WebJobs.cs
ut_web.install_runtime(P)             # Assets/AgentWeb/{Scripts,Plugins/WebGL}, Assets/WebGLTemplates/AgentWeb
```

Every Web job runs with `build_target="WebGL"` (`-buildTarget WebGL` at launch): the editor reopens
on the last active platform, target switches inside a batch job do nothing, and Cam Ayres switches
the platform before touching Web graphics settings (bF_eUuxGEcA [00:01:33]).

---

## P1. Read and audit the Web settings, scan the code

**Goal:** know what the project really ships before changing anything. **Unity calls:**
`AgentKit.Web.WebJobs.ReadSettings` / `AuditWeb` (reads `PlayerSettings.WebGL.*`,
`UnityEditor.WebGL.UserBuildSettings.codeOptimization` by reflection,
`PlayerSettings.GetIl2CppCodeGeneration/GetManagedStrippingLevel(NamedBuildTarget.WebGL)`,
`PlayerSettings.GetGraphicsAPIs(BuildTarget.WebGL)`,
`TextureImporter.GetPlatformTextureSettings("WebGL")`,
`AudioImporter.GetOverrideSampleSettings("WebGL")`, `AssetDatabase.FindAssets("t:VideoClip")`,
`EditorBuildSettings.scenes`). Static scans run in Python with no Unity.

```python
r = ut_run.run_method(P, "AgentKit.Web.WebJobs.ReadSettings", build_target="WebGL")
print(r["result"]["settings"], r["result"]["notes"])
a = ut_run.run_method(P, "AgentKit.Web.WebJobs.AuditWeb", {"webgpu": True, "max_texture_size": 2048}, build_target="WebGL")
assert a["result"]["counts"]["error"] == 0, a["result"]["findings"]
hang = ut_web.scan_hang_apis(P)      # Task.Run/Delay, Parallel, Thread, ThreadPool, timers, CTS timeouts, HttpClient, sockets, isDone busy-wait
js = ut_web.scan_jslib(P)            # ES6 in .jslib/.jspre, deprecated interop, {{{ }}} macros inside comments
assert not [h for h in hang if h["severity"] == "error"] and not js
```

**Live test:** `test_01_read_defaults`, `test_02_audit`. **Result (pass):** the URP 3D template
(Base3D_URP) ships compression **Brotli** (not the Manual's gzip default), Code Optimization
**BuildTimes** (Shorter Build Time), WebAssembly 2023 **off**, WebAssembly.Table and BigInt off,
IL2CPP code generation **OptimizeSpeed**, managed stripping **Minimal**, Name Files As Hashes off,
Data Caching on, exceptions Explicitly Thrown, max memory 2048 MB, splash and Unity logo on,
graphics Auto (`OpenGLES3` only); Allow downloads over HTTP is Not Allowed (the Manual's default,
confirmed by the LAN failure in P5). The API compatibility level reads back as `NET_Standard_2_0`
although the Inspector shows .NET Standard 2.1. Audit: 0 errors, 2 warnings (Code Optimization,
uncompressed texture), 4 infos (Input System package, hashes, stripping, WASM 2023). The hang scan
found all 6 hazards in the test-only probe (Thread, Timer, CTS timeout, Task.Run twice, Task.Delay)
and nothing in the shipped runtime; the `.jslib` scan found nothing after the macro-in-comment fix
below. Offline: fixtures with 7 marked hazards, guarded code (`#if !UNITY_WEBGL`,
`#if UNITY_EDITOR`) and an Editor folder: exact match (`test_offline.py`).

---

## P2. Apply a host preset and build (gzip or Brotli)

**Goal:** settings chosen by the host, applied and read back in one job, then a build in a fresh
process. **Unity calls:** `WebJobs.ApplySettings` (sets `PlayerSettings.WebGL.compressionFormat`,
`decompressionFallback`, `nameFilesAsHashes`, `dataCaching`, `exceptionSupport`, `wasm2023`,
`webAssemblyTable`, `webAssemblyBigInt`, `debugSymbolMode`, `template`,
`PlayerSettings.SetIl2CppCodeGeneration`, `SetManagedStrippingLevel`, `SetApiCompatibilityLevel`,
`stripEngineCode`, `insecureHttpOption`, `UserBuildSettings.codeOptimization`, then
`AssetDatabase.SaveAssets()`), then `ut_run.build(P, "web")` =
`Unity -batchmode -nographics -quit -projectPath P -buildTarget WebGL -executeMethod AgentKit.AgentBuild.Build`
(`BuildPipeline.BuildPlayer` + `BuildReport`).

```python
def web_build(P, name, preset, **over):
    s = ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings", dict(over, preset=preset), build_target="WebGL")
    assert s["ok"], s["error"]
    b = ut_run.build(P, "web", out="Builds/" + name, timeout=5400)
    assert b["ok"] and b["result"]["result"] == "Succeeded", b.get("error")
    return s["result"]["settings"], b["result"], ut_web.size_report(P + "/Builds/" + name)

# presets: own-https | plain-http | itch | poki | crazygames | dev (WebJobs.Preset); DiskSize while iterating
s, rep_gz_build, gz = web_build(P, "Web-gzip", "plain-http", code_optimization="DiskSize")
s, rep_br_build, br = web_build(P, "Web-br", "own-https", code_optimization="DiskSize")
print(gz["initial_mb"], br["initial_mb"], br["wasm_raw_bytes"])
```

The persistence question (does `UserBuildSettings.codeOptimization` set in one batch process survive
into the build process?) is answered by the build report: AgentBuild's
`result.web.code_optimization` read `DiskSize` in the next process (observed), so settings job then
build job is safe.

**Live test:** `test_03_gzip_build`, `test_04_brotli_build`. **Result (pass), demo scene (URP, one
lit cube, IMGUI text, 1 MB StreamingAssets file):**

| Build        | Settings                                                                            | Initial download                   | wasm (raw)             | data    | Build time                                                           |
| ------------ | ----------------------------------------------------------------------------------- | ---------------------------------- | ---------------------- | ------- | -------------------------------------------------------------------- |
| Web-baseline | template defaults, Brotli, Shorter Build Time (URP SampleScene)                     | 12.71 MB                           | 8.14 MB (46.26 MB raw) | 4.45 MB | 337.7 s (first Web build, platform switch included in the 362 s job) |
| Web-gzip     | plain-http preset + DiskSize: gzip, WASM 2023, OptimizeSize, High stripping, hashes | 12.23 MB                           | 7.66 MB (23.05 MB raw) | 4.46 MB | 74.9 s                                                               |
| Web-br       | own-https preset + DiskSize: same, Brotli                                           | 9.84 MB (19.5 % smaller than gzip) | 5.84 MB                | 3.89 MB | 173.5 s (Brotli compression costs about 100 s more)                  |

Release-oriented code settings halved the raw wasm (46.3 to 23.0 MB) and cut the Brotli download by
2.9 MB against the template defaults. A settings-only change (Allow downloads over HTTP) rebuilt in
8.7 s (15 s job). The first attempt failed on a real trap: a `.jslib` comment containing the macro
text `{{{ makeDynCall }}}` was expanded by Emscripten and broke the link with "SyntaxError: Illegal
return statement" (`scan_jslib` now flags `{{{` inside comments).

---

## P3. JavaScript interop: `.jslib` + C# bridge + page contract (leaderboard)

**Goal:** C# calls a page API that answers asynchronously, and the page calls C#. All text, no
visual editor. The files below are the shipped ones (installed by `ut_web.install_runtime`),
complete except for the probe parts of `WebBridge.cs` (readback, deferred fetch, HUD) that only
serve the tests.

`Assets/AgentWeb/Plugins/WebGL/AgentWebBridge.jslib` (ES5 only; the pointer is read at once; the
reply goes back through a function pointer; never write the triple-brace macro inside a comment):

```js
mergeInto(LibraryManager.library, {
  AgentWeb_SubmitScore: function (namePtr, score, requestId, callback) {
    var name = UTF8ToString(namePtr); // copy now: the pointer dies after this call
    function reply(obj) {
      var json = JSON.stringify(obj);
      var size = lengthBytesUTF8(json) + 1;
      var buf = _malloc(size);
      stringToUTF8(json, buf, size);
      {
        {
          {
            makeDynCall("vii", "callback");
          }
        }
      }
      (requestId, buf);
      _free(buf); // C# copied the string inside the callback
    }
    var api = typeof window !== "undefined" ? window.StudioLeaderboard : null;
    if (!api || typeof api.submit !== "function") {
      setTimeout(function () {
        reply({
          ok: false,
          rank: -1,
          error: "no window.StudioLeaderboard on this page",
        });
      }, 0);
      return;
    }
    var p;
    try {
      p = Promise.resolve(api.submit(name, score));
    } catch (e) {
      setTimeout(function () {
        reply({ ok: false, rank: -1, error: String(e) });
      }, 0);
      return;
    }
    p.then(
      function (res) {
        reply({ ok: true, rank: (res && res.rank) | 0, error: "", name: name });
      },
      function (e) {
        reply({ ok: false, rank: -1, error: String(e), name: name });
      },
    );
  },
  AgentWeb_ReportError: function (kindPtr, messagePtr, stackPtr, endpointPtr) {
    // P16
    var kind = UTF8ToString(kindPtr),
      message = UTF8ToString(messagePtr);
    var stack = UTF8ToString(stackPtr),
      endpoint = UTF8ToString(endpointPtr);
    if (typeof window !== "undefined" && typeof window.AgentWebReportError === "function") {
      window.AgentWebReportError(kind, message, stack);
      return;
    }
    var body = JSON.stringify({
      kind: kind,
      message: message.slice(0, 2000),
      stack: stack.slice(0, 4000),
      url: typeof location !== "undefined" ? location.href : "",
    });
    console.log("AGENTWEB_ERROR " + body);
    if (endpoint && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(endpoint, body);
      } catch (e) {}
    }
  },
  AgentWeb_Signal: function (eventPtr, payloadPtr) {
    // game -> page: forward to a portal SDK
    var ev = UTF8ToString(eventPtr),
      payload = UTF8ToString(payloadPtr);
    if (typeof window === "undefined") return;
    window.__agentWeb = window.__agentWeb || { events: [] };
    window.__agentWeb.events.push({
      name: ev,
      payload: payload,
      t: performance.now(),
    });
    try {
      window.dispatchEvent(new CustomEvent("agentweb:" + ev, { detail: payload }));
    } catch (e) {}
  },
});
```

`Assets/AgentWeb/Scripts/WebLeaderboard.cs` (the C# side, complete: externs guarded, Editor stub,
request ids, static callback):

```csharp
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using AOT;
using UnityEngine;

namespace AgentWeb
{
    [Serializable]
    public class SubmitResult { public bool ok; public int rank; public string error; public string name; }

    public static class WebLeaderboard
    {
        delegate void ResultCallback(int requestId, IntPtr json);
        static readonly Dictionary<int, Action<SubmitResult>> s_Pending = new Dictionary<int, Action<SubmitResult>>();
        static int s_NextId;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void AgentWeb_SubmitScore(string name, int score, int requestId, ResultCallback callback);
        [DllImport("__Internal")] static extern void AgentWeb_Signal(string evt, string payload);
#else
        static void AgentWeb_SubmitScore(string name, int score, int requestId, ResultCallback callback)
        { Deliver(requestId, JsonUtility.ToJson(new SubmitResult { ok = true, rank = 1, error = "editor stub", name = name })); }
        static void AgentWeb_Signal(string evt, string payload) { Debug.Log("AGENTWEB_SIGNAL " + evt + " " + payload); }
#endif

        public static void SubmitScore(string playerName, int score, Action<SubmitResult> done)
        {
            int id = ++s_NextId;
            s_Pending[id] = done;
            AgentWeb_SubmitScore(playerName ?? "", score, id, OnSubmitResult);
        }

        public static void Signal(string evt, string payload = "") => AgentWeb_Signal(evt, payload ?? "");

        [MonoPInvokeCallback(typeof(ResultCallback))]
        static void OnSubmitResult(int requestId, IntPtr json) => Deliver(requestId, Marshal.PtrToStringUTF8(json));  // copy before the .jslib frees it

        static void Deliver(int requestId, string json)
        {
            SubmitResult res;
            try { res = JsonUtility.FromJson<SubmitResult>(json); }
            catch (Exception e) { res = new SubmitResult { ok = false, rank = -1, error = "bad json: " + e.Message }; }
            if (s_Pending.TryGetValue(requestId, out var cb)) { s_Pending.Remove(requestId); cb?.Invoke(res); }
        }
    }
}
```

`Assets/AgentWeb/Scripts/WebBridge.cs`, the page-facing part, condensed (the shipped probe also
tints the cube, updates its HUD and emits `leaderboard`, `page`, `glyphs` and `keyboard` events for
the tests). It sits on a GameObject named exactly `WebBridge` (`SetupDemo` creates it); in a real
game put these methods on your boot object:

```csharp
[Serializable] class PageEvent { public string kind; public string text; public int value; }

IEnumerator Flow()                                   // started from Start()
{
    yield return null;                               // first frame is on screen
    yield return new WaitForEndOfFrame();
    WebLeaderboard.Signal("gameplay_start", SystemInfo.graphicsDeviceType.ToString());   // portals stop counting here
    Submit(playerName, demoScore);
}

void Submit(string name, int score) =>
    WebLeaderboard.SubmitScore(name, score, res => Debug.Log("AGENTWEB " + JsonUtility.ToJson(res)));

// page -> game: unityInstance.SendMessage('WebBridge', 'OnPageEvent', JSON.stringify({kind, text, value}))
public void OnPageEvent(string json)                 // SendMessage carries zero or one string or number
{
    PageEvent e;
    try { e = JsonUtility.FromJson<PageEvent>(json); } catch (Exception) { return; }
    if (e.kind == "submit") Submit(e.text, e.value);
}

// page -> game: let page text fields receive keystrokes (P15)
public void SetKeyboardCapture(string on)
{
#if UNITY_WEBGL && !UNITY_EDITOR
    WebGLInput.captureAllKeyboardInput = on != "0" && on != "false";   // WebGLInput exists only in Web player builds
#endif
}
```

Host page (your site; on itch.io this lives in the uploaded `index.html`; portals ignore or rewrite
it). The `fetch` call is the page's own API and CORS rule [added, not run: the tests inject
`ut_web.MOCK_LEADERBOARD_JS` instead]:

```html
<input id="player-name" placeholder="name" />
<script>
  window.StudioLeaderboard = {
    // contract: submit(name, score) -> value or Promise of {rank}
    submit: function (name, score) {
      return fetch("https://api.example-studio.com/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, score: score }),
      }).then(function (r) {
        return r.json();
      });
    },
  };
  var field = document.getElementById("player-name"); // window.unityInstance is set by the AgentWeb template
  field.addEventListener("focus", function () {
    unityInstance.SendMessage("WebBridge", "SetKeyboardCapture", "0");
  });
  field.addEventListener("blur", function () {
    unityInstance.SendMessage("WebBridge", "SetKeyboardCapture", "1");
  });
  field.addEventListener("change", function () {
    unityInstance.SendMessage(
      "WebBridge",
      "OnPageEvent",
      JSON.stringify({ kind: "submit", text: field.value, value: 0 }),
    );
  });
  window.addEventListener("agentweb:gameplay_start", function () {
    /* portal SDK gameplayStart() here */
  });
</script>
```

The API server must answer CORS for every origin the game runs on (itch.io serves the game from its
own CDN domain inside an iframe) (6.3 Manual, Web networking).

**Live test:** `test_05_serve_and_browser` (v1), `test_17_strip_failure_text_errors` (v2). **Result
(pass):** `submit("agent", 1234)` reached the page (`window.__lbCalls`), the Promise resolved after
50 ms, C# logged rank 3; the page's `SendMessage` produced the page event and turned the cube blue.
v2: `OnPageEvent {kind: "submit", text: "Émile 名前 Ωμέγα"}` went page to C# (SendMessage), C# to
page (`UTF8ToString`: the page received the exact string) and back (`stringToUTF8` +
`Marshal.PtrToStringUTF8`: `name` echoed intact). `makeDynCall('vii')` worked with WebAssembly.Table
off and on. Screenshot `unity-web_Web-br-localhost_*.png` (v1), `unity-web_Web-v2-text_*.png` (v2,
see P15 for the glyphs).

---

## P4. Serve with the right headers, audit them, load in a real browser

**Goal:** prove the build loads the way players will get it. **Calls:** `ut_web.serve` (Python
`ThreadingHTTPServer`, the Manual's header table per suffix: `Content-Encoding` for `.br`/`.gz`,
`application/wasm` for every `.wasm*`, `application/gzip` for `.data.gz`, `no-cache` on HTML),
`ut_web.header_audit` (raw GETs with `Accept-Encoding: gzip, deflate, br`, no client decoding, body
compared with the file on disk), `ut_web.browser_check` (Playwright, installed Chrome, headless;
console `AGENTWEB {json}` lines; network sizes from `request.sizes()`; optional CDP throttling;
canvas screenshot; warm reload).

```python
root = P + "/Builds/Web-br"
srv = ut_web.serve(root)                                   # http://localhost:<port>/
try:
    audit = ut_web.header_audit(srv.url, root)
    assert audit["ok"], audit["verdicts"]
    res = ut_web.browser_check(srv.url + "index.html",
        wait_events=("ready", "gameplay_start", "leaderboard", "awaitable", "deferred", "readback"),
        init_script=ut_web.MOCK_LEADERBOARD_JS,
        send_messages=[("WebBridge", "OnPageEvent", {"kind": "name", "text": "Emmanuel", "value": 7})],
        after_send_events=("page",), reload=True, screenshot=ut_web.screenshot_path("Web-br-localhost"))
finally:
    srv.stop()
assert res["ok"] and res["events"]["ready"]["api"] == "OpenGLES3"
deferred = [n for n in res["network"] if n["url"].endswith("deferred.bin")]
assert deferred[0]["t"] >= res["event_times_s"]["gameplay_start"]            # really deferred
print(res["bytes_before"]["gameplay_start"], res["bytes_total"], res["reload"]["bytes_total"])
```

**Result (pass):** header audit 0 verdicts on both builds. Brotli build: 9,838,404 bytes before
`gameplay_start` (index 3.8 KB, loader 27 KB, framework 70 KB, data 3.89 MB, wasm 5.84 MB),
10,886,980 bytes total, `deferred.bin` (1 MB) requested 2.8 s after navigation, after
`gameplay_start`; time to `gameplay_start` 2.8 to 3.2 s on localhost (gzip build 3.1 to 3.7 s). Warm
reload in the same context: 0 bytes transferred, `.data` not requested at all (Data Caching serves
it from IndexedDB), loader/framework/wasm from the HTTP cache, `gameplay_start` at 2.4 s. Gate
wording: the warm reload must not download the `.data` body again; a 304 revalidation is fine (the
Manual's Node sample notes that the Unity loader caches and revalidates manually). The Safari engine
behaved differently (P20). `AsyncGPUReadback` works on WebGL 2 in Chrome (`supportsAsyncGPUReadback`
true, exact pixel read back). The `Awaitable.WaitForSecondsAsync` + `NextFrameAsync` probe
completed.

---

## P5. Diagnose a server: the failures a Web build really shows

**Goal:** recognize each misconfiguration from the console and fix the server, not the build.

```python
for mode in ("naive", "no-wasm-type"):        # naive = Python's http.server as is (no Content-Encoding)
    srv = ut_web.serve(root, mode=mode)
    try:
        print(mode, ut_web.header_audit(srv.url, root)["verdicts"][:3])
        res = ut_web.browser_check(srv.url + "index.html", timeout=40)
        print(res["ok"], res["banners"][:2], res["errors"][:2])
    finally:
        srv.stop()
ip = ut_web.lan_ip()                                               # plain HTTP at a LAN address
srv = ut_web.serve(root, host="0.0.0.0"); res = ut_web.browser_check(srv.url_for(ip) + "index.html"); srv.stop()
cert, key = ut_web.self_signed_cert(P + "/Library/AgentWeb/cert", hosts=(ip, "localhost", "127.0.0.1"))
srv = ut_web.serve(root, host="0.0.0.0", https=True, cert=cert, key=key)
res = ut_web.browser_check(srv.url_for(ip) + "index.html", ignore_https_errors=True); srv.stop()
```

**Live tests:** `test_06_naive_server_fails`, `test_07_wrong_wasm_type`,
`test_08_lan_http_vs_https`. **Results (pass), exact messages:**

| Server                                                 | Build                                                     | What happens (Chrome 153)                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no `Content-Encoding` (quick local server)             | gzip                                                      | `SyntaxError: Invalid or unexpected token`, then "Unable to parse Build/<hash>.framework.js.gz! This can happen if build compression was enabled but web server hosting the content was misconfigured to not serve the file with HTTP Response Header "Content-Encoding: gzip" present." Black canvas. Header audit: 3 errors |
| no `Content-Encoding`                                  | Brotli                                                    | same `SyntaxError`, then "Unable to parse ...framework.js.br! ... verify that web server is sending .br files with HTTP Response Header "Content-Encoding: br". Brotli compression may not be supported over HTTP connections. Migrate your server to use HTTPS."                                                             |
| right encodings, `.wasm` as `application/octet-stream` | Brotli                                                    | loads, but "wasm streaming compile failed: ... Incorrect response MIME type. Expected 'application/wasm'" and the warning banner "HTTP Response Header "Content-Type" configured incorrectly ... should be "application/wasm". Startup time performance will suffer."                                                         |
| right headers, `http://<LAN IP>`                       | Brotli                                                    | every `.br` fails with `net::ERR_CONTENT_DECODING_FAILED` (Chrome refuses Brotli on an insecure origin), banner "Unable to load file Build/...framework.js.br! Check that the file exists on the remote server." `http://localhost` works: a localhost test proves nothing about a plain-HTTP host                            |
| right headers, `http://<LAN IP>`                       | gzip, Allow downloads over HTTP = NotAllowed (default)    | the game starts, then `UnityWebRequest` to its own StreamingAssets throws "InvalidOperationException: Insecure connection not allowed" (the deferred fetch never completes)                                                                                                                                                   |
| right headers, `http://<LAN IP>`                       | gzip, `insecure_http="AlwaysAllowed"` (plain-http preset) | loads fully, deferred fetch ok                                                                                                                                                                                                                                                                                                |
| right headers, `https://<LAN IP>` (self-signed)        | Brotli                                                    | loads fully (secure context), deferred fetch ok                                                                                                                                                                                                                                                                               |

Screenshots: `unity-web_sheet_failures.png` (red loader banners, black canvas; gzip over LAN HTTP
stuck at "Deferred: loading"). Not run here: Safari's `.data.gz` quirk (bug 247421, served as
`application/gzip` by `ut_web.serve` per the Manual), Nginx/Apache/IIS themselves (configs from the
Manual in `ut_web.nginx_config()`, `ut_web.apache_htaccess()`; no web server installed on this Mac).

---

## P6. itch.io variant: Decompression Fallback and the zip

**Goal:** a build that loads on a host whose headers you cannot set, packaged the way itch.io
expects. **Calls:** `WebJobs.ApplySettings {"preset": "itch"}` (own-https recipe +
`PlayerSettings.WebGL.decompressionFallback = true`), `ut_run.build`,
`ut_web.serve(root, mode="naive")` (no `Content-Encoding`, like a host you do not control),
`ut_web.package_zip(root, out)` (the folder's contents, `index.html` at the zip root, stored not
recompressed).

```python
s, build, rep = web_build(P, "Web-itch", "itch", code_optimization="DiskSize")      # web_build from P2
assert rep["compression"] == "fallback"                                           # Build/*.unityweb
srv = ut_web.serve(P + "/Builds/Web-itch", mode="naive")
try:
    res = ut_web.browser_check(srv.url + "index.html", init_script=ut_web.MOCK_LEADERBOARD_JS,
                               wait_events=("ready", "gameplay_start", "leaderboard"))
finally:
    srv.stop()
z = ut_web.package_zip(P + "/Builds/Web-itch", P + "/Builds/Web-itch.zip")
assert res["ok"] and z["index_at_root"]
```

Then, by hand or a computer-use agent (no API): itch.io > Upload new project > Kind of project
**HTML** > upload the zip > "This file will be played in the browser" > viewport = build
resolution > save Restricted, then Public (Max O'Didily 8iApGVX--B0 [00:02:17] to [00:05:39]). After
upload, run `header_audit` against the itch.io URL: if its CDN serves the right `Content-Encoding`,
rebuild without the fallback [not run: needs an itch.io account].

**Live test:** `test_09_itch_fallback`. **Result (pass):** 97.8 s job; files `.unityweb` (Brotli
inside, detected by `size_report`); loaded fully from the header-less server (leaderboard rank 3,
deferred fetch ok, zero errors); initial download 9.93 MB vs 9.84 MB without fallback; the loader
grew from 27,222 to 118,133 bytes (the bundled JavaScript decompressor); zip 6 entries, `index.html`
at the root, 10.97 MB. One run each, so the time to `gameplay_start` (3.4 s vs 2.8 to 3.2 s) is not
a measured difference; the Manual's costs of the fallback (no WebAssembly streaming compile, mobile
battery) were not measured here.

---

## P7. WebGPU first, WebGL 2 fallback, proven by origin

**Goal:** opt into WebGPU only with its fallback, and prove which API runs where. **Calls:**
`WebJobs.ApplySettings {"graphics_apis": ["WebGPU", "OpenGLES3"]}` =
`PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false)` +
`PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.WebGPU, GraphicsDeviceType.OpenGLES3 })`
(the job warns when WebGL 2 is missing and that WebGPU is experimental in 6.3), launched with
`build_target="WebGL"`; the probe logs `SystemInfo.graphicsDeviceType`, `graphicsDeviceVersion`,
`supportsComputeShaders`, `supportsAsyncGPUReadback`.

```python
s = ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings",
        {"preset": "plain-http", "code_optimization": "DiskSize", "graphics_apis": ["WebGPU", "OpenGLES3"]}, build_target="WebGL")
try:
    b = ut_run.build(P, "web", out="Builds/Web-webgpu")
finally:
    ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings", {"graphics_apis": "auto"}, build_target="WebGL")
ip = ut_web.lan_ip()
srv = ut_web.serve(P + "/Builds/Web-webgpu", host="0.0.0.0")
try:
    secure = ut_web.browser_check(srv.url + "index.html", init_script=ut_web.MOCK_LEADERBOARD_JS)               # http://localhost
    insecure = ut_web.browser_check(srv.url_for(ip) + "index.html", init_script=ut_web.MOCK_LEADERBOARD_JS)    # http://<LAN IP>
finally:
    srv.stop()
assert secure["events"]["ready"]["api"] == "WebGPU" and insecure["events"]["ready"]["api"] == "OpenGLES3"
```

A gzip build with Allow downloads over HTTP is used on purpose: a Brotli build stops earlier at a
plain-HTTP LAN address (P5), which hides the API question (the first run of this test did exactly
that).

**Live test:** `test_10_webgpu_fallback`. **Result (pass):** `SetGraphicsAPIs` accepted `WebGPU` on
6.3 with no `ProjectSettings.asset` edit (the 6.0 unlock in Cam Ayres' video is not needed). Same
build: `http://localhost` ran **WebGPU** (secure context), `http://<LAN IP>` ran **OpenGLES3**, with
no error, no warning and identical frames (`unity-web_sheet_variants.png`): the fallback is silent,
only the probe line tells. `AsyncGPUReadback` returned the exact pixel on both APIs; compute
reported available on WebGPU. Cost of adding WebGPU: 13.34 MB vs 12.23 MB initial download (gzip,
+1.11 MB), 10.70 MB vs 9.84 MB (Brotli, +0.86 MB). Chrome 153 headless on Apple Silicon exposed a
WebGPU adapter (`apple/metal-3`) on localhost; `--disable-features=WebGPU` did not remove
`navigator.gpu`, so the insecure origin is the reliable way to force the fallback in a test. Not
run: WebGPU on Windows or Android browsers, draw-call-heavy scenes (WebGL can win there, Duncan),
PSO warm-up (WebGPU tracing is 6.4).

---

## P8. Release build, size budget, throttled first load, symbols

**Goal:** the shipping build, judged against the budget the way portals count it, plus what
production debugging needs. **Calls:** `WebJobs.ApplySettings {"preset": "own-https"}` (Disk Size
with LTO, Debug Symbols External), `ut_run.build`, `ut_web.size_report`, `ut_web.budget_check`
(PORTALS: `crazygames-mobile` 20 MB, `crazygames` 50 MB / 250 MB / 1,500 files, `stratton` 30 MB,
`unity-play` 1 GB), `ut_web.browser_check(..., throttle_mbps=20, latency_ms=40, cpu_slowdown=4)`
(CDP `Network.emulateNetworkConditions`, `Emulation.setCPUThrottlingRate`),
`ut_web.archive_symbols`.

```python
s, build, rep = web_build(P, "Web-release", "own-https")          # web_build from P2; LTO: minutes
for portal in ("crazygames-mobile", "crazygames", "stratton"):
    print(portal, ut_web.budget_check(rep, portal=portal))
print("transfer at 20 Mbps:", ut_web.download_seconds(rep["initial_bytes"], 20), "s")
srv = ut_web.serve(P + "/Builds/Web-release")
try:
    slow = ut_web.browser_check(srv.url + "index.html", init_script=ut_web.MOCK_LEADERBOARD_JS,
                                throttle_mbps=20, latency_ms=40, cpu_slowdown=4, timeout=180)
finally:
    srv.stop()
print(slow["load_seconds"], slow["bytes_before"]["gameplay_start"])
ut_web.archive_symbols(P, P + "/Builds/Web-release", P + "/Builds/Web-release-symbols")   # .symbols.json.br + MethodMap.tsv
```

**Live test:** `test_11_release_budget`. **Result (pass):** build 400.6 s (LTO; "Postprocess built
player" 395.6 s of it). Initial download **9.47 MB** (wasm 5.47 MB, 20.28 MB raw; data 3.71 MB)
against 9.84 MB with Disk Size and 12.71 MB for the template defaults. Budgets: CrazyGames mobile
homepage pass (10.5 MB headroom), CrazyGames 50 MB pass, Stratton 30 MB pass. Transfer alone at 20
Mbps: 3.8 s; measured time to `gameplay_start` with 20 Mbps, 40 ms latency and CPU x4: **8.1 s**
(4.1 s unthrottled, single runs on a Mac running six other editors). `Build/*.symbols.json.br` (1.39
MB) exists, is not fetched at startup, and was archived with `MethodMap.tsv` from
`Library/Bee/artifacts/WebGL/il2cppOutput/cpp/Symbols/`. Screenshot
`unity-web_Web-release-20mbps_*.png` checked. Not run: a real mid-range phone (Craven's reference is
a Pixel 5 at 48 Mbps, LlE35onVdmQ [00:10:19]).

---

## P9. C# threading on the Web, observed

**Goal:** know what the forbidden APIs really do in a browser, and use the Web-safe replacements.
**Calls:** the test-only `WebHazardProbe` (`tests/code/unity-web/unity/Runtime/WebHazardProbe.cs`,
attached to `WebBridge` at `AfterSceneLoad`; never ship it) triggered by
`unityInstance.SendMessage('WebBridge', 'Hazard', kind)`; page responsiveness checked with a
`requestAnimationFrame` counter and `page.wait_for_function(..., timeout=4000)`. Replacements
shipped in `WebBridge.cs`:

```csharp
async void AwaitableProbe()
{
    await Awaitable.WaitForSecondsAsync(0.25f);   // not Task.Delay
    await Awaitable.NextFrameAsync();
    Debug.Log("AGENTWEB {\"event\":\"awaitable\",\"detail\":\"ok\"}");
}
IEnumerator LoadDeferred()
{
    using (var req = UnityWebRequest.Get(Application.streamingAssetsPath + "/deferred.bin"))
    {
        yield return req.SendWebRequest();        // not HttpClient, never while (!req.isDone) {}
        // ...
    }
}
```

**Live test:** `test_12_threading_hazards` (release build, Chrome 153). **Result (pass):**

| Hazard                                                | Observed after 1.5 s                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `new Thread(...).Start()`                             | no exception, delegate never ran                                                               |
| `new System.Threading.Timer(cb, null, 100, Infinite)` | never fired                                                                                    |
| `new CancellationTokenSource(100)`                    | `IsCancellationRequested` still false                                                          |
| `await Task.Delay(100)`                               | continuation never ran; page stayed responsive                                                 |
| `Task.Run(() => flag = true)`                         | returned to the caller, delegate never ran; page stayed responsive                             |
| `Task.Run(() => 42).Result`                           | page frozen (no animation frames, evaluation timed out): the browser hang the Manual describes |
| `Awaitable.WaitForSecondsAsync` + `NextFrameAsync`    | completed (every build)                                                                        |

So in this build the fire-and-forget calls failed silently (worse to debug than a crash) and
blocking on a task froze the tab; the Manual calls every ThreadPool API an unrecoverable hang, and
`scan_hang_apis` treats them all as errors. `WebHazardProbe` hits: 6 of 6 found by the scan (P1).

---

## P10. Deferred content with Addressables (local LZ4 group)

**Goal:** late content leaves the initial download and arrives after the first playable moment.
Addressables authoring in general (groups, profiles, remote catalogs, CCD, CI) belongs to
scenario-unity-pipeline-automation; this procedure proves the Web rules. **Calls:**
`ut_web.add_package(P, "com.unity.addressables", "2.9.1")` (manifest edit, backup kept; network on
first resolve), `ut_web.install_runtime(P, addressables=True)` (optional loader + editor job),
`AgentKit.Web.WebAddressablesJobs.SetupDeferredGroup`
(`AddressableAssetSettingsDefaultObject.GetSettings(true)`,
`settings.CreateGroup(..., typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema))`,
`schema.Compression = LZ4` (LZMA refused: "Decompressing this format (1) isn't supported" on the
Web), `schema.BuildPath/LoadPath.SetVariableByName(settings, kLocalBuildPath/kLocalLoadPath)`,
`settings.CreateOrMoveEntry(guid, group).address = "DeferredProp"`,
`AddressableAssetSettings.BuildPlayerContent(out result)`), then the player build copies
`Library/com.unity.addressables/aa/WebGL` into `StreamingAssets/aa`. Runtime
(`WebDeferredAddressable.cs`): one frame after `gameplay_start`,
`Addressables.LoadAssetAsync<GameObject>("DeferredProp")`, instantiate, `Addressables.Release` on
destroy (no Caching API on the Web: the bundle stays in memory until released).

```python
ut_web.add_package(P, "com.unity.addressables", "2.9.1")
ut_web.install_runtime(P, addressables=True)
r = ut_run.run_method(P, "AgentKit.Web.WebAddressablesJobs.SetupDeferredGroup", {"texture_size": 1024}, build_target="WebGL", timeout=2400)
assert r["ok"], r["error"]
s, build, rep = web_build(P, "Web-addressables", "own-https", code_optimization="DiskSize")
srv = ut_web.serve(P + "/Builds/Web-addressables")
try:
    res = ut_web.browser_check(srv.url + "index.html", init_script=ut_web.MOCK_LEADERBOARD_JS,
                               wait_events=("ready", "gameplay_start", "leaderboard", "addressable"))
finally:
    srv.stop()
aa = [n for n in res["network"] if "/aa/" in n["url"]]
assert res["events"]["addressable"]["ok"] and all(n["t"] >= res["event_times_s"]["gameplay_start"] for n in aa)
```

**Live test:** `test_13_addressables_deferred`. **Result (pass):** content build 15.5 s (catalog.bin
1.7 KB, settings.json, one LZ4 bundle of 0.84 MB for a 1024 x 1024 noise texture on a cube). In
Chrome: `settings.json`, `catalog.bin` and the bundle were requested 3.36 to 3.40 s after
navigation, all after `gameplay_start` (3.33 s); the prefab loaded in 0.18 s and appears beside the
cube (`unity-web_Web-addressables_*.png`). Bytes before gameplay start 10.11 MB, total 11.99 MB (1
MB StreamingAssets file + 0.84 MB bundle deferred). The Addressables package itself added 0.21 MB of
Brotli wasm (5.84 to 6.05 MB) and 0.27 MB to the initial download; its first player build after the
package install took 292 s. Not run: remote load paths on a CDN (needs CORS on the CDN and a host),
Unity 6.6 Progressive Asset Loading (not in 6.3). Preload tags for the first bundles: P21. Types
used only in bundles: P14.

---

## P11. Phone test over the LAN (HTTPS)

**Goal:** a real phone loads the build with sensors, WebGPU and Brotli available (all need a secure
context). **Calls:** `ut_web.lan_ip()` (`ipconfig getifaddr en0`),
`ut_web.self_signed_cert(dir, hosts=(ip, "localhost"))`
(`openssl req -x509 -newkey rsa:2048 -nodes -addext subjectAltName=IP:<ip>,DNS:localhost`),
`ut_web.serve(root, host="0.0.0.0", https=True, cert=..., key=...)`, or the CLI
`python3 ut_web.py serve <build> --host 0.0.0.0 --https`. Print the URL for the human; stop the
server afterwards (it exposes the folder to the network, as the Manual warns for its Node sample).

**Run here:** the HTTPS server at the LAN address loaded the Brotli build fully in headless Chrome
(P5). **Not run:** a physical iOS or Android device (needs a human holding it: certificate warning,
motion permission prompt, Silent Mode audio, memory limits, real DPR); Makaka Games documents the
flow (F-NzcSQLiJs [00:05:47] to [00:07:29]).

---

## P12. Release pipeline and rollout (plan, outside Unity)

Not run (needs host accounts and a human decision; ask before any paid host). The plan an agent
writes, with the calls it would use:

1. Batch build per variant (P2/P8) on every push; keep every previous build folder (never overwrite
   the live one: rollback is a pointer change). Stratton pushes editor to players in 8 to 9 minutes
   with GitHub Actions and Cloudflare Pages (FYsVftoLBP8 [00:21:40]).
2. Before upload: `header_audit` against a staging URL (`curl -sI` equivalent), `browser_check`
   smoke test (API, zero errors, `gameplay_start`), `budget_check`.
3. Staged rollout when the host supports traffic splitting: 5 percent of the most active players,
   then progressive to 100 percent if no P1 bug, automatic rollback on an error-rate rise [frame
   00:23:29]. Requires CDN-side configuration by a human.
4. itch.io uploads: `butler push <folder> <user>/<game>:html5` (itch.io CLI, needs an account);
   CrazyGames and Poki: their dashboards and SDK inspectors.

---

# Refactor procedures (2026-09-24, after blind grade Y12)

P13 to P24 teach the expert points the first version knew but did not teach. Live tests:
`tests/code/unity-web/test_live_web_v2.py` (`test_14` to `test_26`), same project, same result log.
Builds: `Web-v2` (runtime and template v2, bundle probe, splash off), `Web-v2-fixed` (plus link.xml
and Initial Memory 80 MB), `Web-v2-astc`, `Web-v2-dual`, `Web-v2-nopost`. All with the `own-https`
preset and Disk Size (not LTO), so sizes compare with `Web-br` and `Web-addressables`, not with
`Web-release`.

---

## P13. Settings that do not travel with the repo, and a policy test for CI

**Goal:** a CI runner or a fresh clone ships the settings you tested. **Why:** Code Optimization and
the texture subtarget are stored in `Library/EditorUserBuildSettings.asset`, not in
`ProjectSettings/` (observed below), and the Build Profiles texture setting overrides Player
Settings (6.3 Manual, Texture compression in Web > Precedence). **Calls:** `WebJobs.ApplySettings`
with `code_optimization` and `texture_subtarget` in EVERY build job, `write_policy: true` (writes
`ProjectSettings/AgentWebPolicy.json`, commit it), then `ut_web.install_runtime(P, tests=True)` and
`ut_run.run_tests(P, "EditMode", filter="AgentWeb")`
(`scripts/AgentKitOptional/Tests/WebReleasePolicyTests.cs`, own asmdef, 8 tests: compression,
fallback, not development, release code settings, code optimization, pinned subtarget, WebGL 2 in
the API list, valid scene list).

```python
ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings",
    {"preset": "own-https", "code_optimization": "DiskSizeLTO", "texture_subtarget": "DXT", "write_policy": True},
    build_target="WebGL")
ut_web.install_runtime(P, tests=True)
t = ut_run.run_tests(P, "EditMode", filter="AgentWeb")        # never -quit with -runTests
assert t["ok"], t["failures"]
```

A committed Build Profile asset (GUI only on 6.3: File > Build Profiles > Add Build Profile) is the
other way to carry these values; build it with `ut_run.build(P, "web", profile=path)`.

**Live test:** `test_14_library_only_settings`, `test_15_editmode_policy`. **Result (pass):** after
applying `DiskSize` and `DXT`, the string `DiskSize` appeared in
`Library/EditorUserBuildSettings.asset` and in no `ProjectSettings/*.asset`. With that one file
moved aside (a fresh-clone stand-in), `ReadSettings` read Code Optimization **BuildTimes** (Shorter
Build Time) and subtarget **Generic**, while compression Brotli and WebAssembly 2023
(ProjectSettings) survived; restoring the file restored both. EditMode: 8 of 8 passed; after
`fallback: true` (a drift), exactly `Decompression_fallback_matches_the_host` failed (18 s and 30 s
runs).

---

## P14. AssetBundles and Addressables vs Strip Engine Code

**Goal:** content that lives only in bundles still works with High stripping and Strip Engine Code.
**Why:** the player keeps only the classes it references; a class used only inside a bundle is
stripped and the browser logs `Could not produce class with ID n` (6.3 Manual, Distribution size and
code stripping > Issues with code stripping). Addressables writes its own link.xml for content built
before the player; raw bundles, content built after the player and content updates are not covered
[added: inference from the Addressables build flow, not run]. **Calls:** `WebJobs.BuildBundles`
(probe: a prefab with components the player never references, LZ4 `ChunkBasedCompression` because
LZMA cannot be read on the Web, copied to `StreamingAssets/bundles`), then
`WebJobs.WriteBundleLinkXml` (collects every type the bundles' assets use through
`AssetDatabase.GetAssetPathsFromAssetBundle` + `GetDependencies(recursive)` + `LoadAllAssetsAtPath`,
writes `Assets/AgentWeb/link.xml` grouped by assembly), then rebuild. `args.paths` takes
Addressables entry paths for the same treatment. The other documented fix,
`BuildPlayerOptions.assetBundleManifestPath` (the job returns the manifest path), needs a custom
build call [not run: AgentBuild does not expose it].

```python
ut_run.run_method(P, "AgentKit.Web.WebJobs.BuildBundles", {"components": ["UnityEngine.WindZone"]}, build_target="WebGL")
lx = ut_run.run_method(P, "AgentKit.Web.WebJobs.WriteBundleLinkXml", {}, build_target="WebGL")
print(lx["result"]["types"])          # "UnityEngine.WindModule:UnityEngine.WindZone", ...
b = ut_run.build(P, "web", out="Builds/Web-v2-fixed")
```

The runtime side loads with `UnityWebRequestAssetBundle.GetAssetBundle` in a coroutine and calls
`bundle.Unload(false)` when done (no Caching API on the Web: the bundle stays in memory until
unloaded); test probe `tests/code/unity-web/unity/Runtime/WebBundleProbe.cs`.

**Live test:** `test_16_bundle_probe_and_v2_build`, `test_17_strip_failure_text_errors`,
`test_20_linkxml_and_heap`. **Result (pass):** the bundle (1,899 bytes) listed class ids 1, 4, 182.
In `Web-v2` (no link.xml) Chrome logged "Could not produce class with ID 182. This could be caused
by a class being stripped from the build even though it is needed. Try disabling 'Strip Engine
Code'" and the instantiated prefab had only `Transform`. After `WriteBundleLinkXml` (types: WindZone
in `UnityEngine.WindModule` plus GameObject, Transform, ComputeShader) and a rebuild, the prefab had
`Transform,WindZone`, zero strip errors; wasm size within 1 KB (6,048,822 to 6,047,845 bytes).

---

## P15. Page text: UTF-8 across the bridge, fonts, keyboard focus

**Goal:** names typed on the page reach the game intact, render in the game, and the page's own
fields can be typed into. **Why:** WebGL 2 has no system fonts, ship every font including fallbacks
for other scripts (6.3 Manual, WebGL2); Unity Web processes all keyboard input the page receives by
default (Input in Web > Keyboard input and focus handling). **Calls:**
`SendMessage('WebBridge', 'OnPageEvent', {kind: "submit", text, value})` (P3),
`SendMessage('WebBridge', 'SetKeyboardCapture', '0' | '1')` (`WebGLInput.captureAllKeyboardInput`,
compiled only for the Web player), `browser_check(..., actions=callable)` to type into the page
field (`ut_web.PAGE_INPUT_JS` adds one).

```python
typed = {}
def act(page, frame, out):
    page.click("#page-name"); page.keyboard.type("Ana"); typed["on"] = page.input_value("#page-name")
    frame.evaluate("() => unityInstance.SendMessage('WebBridge', 'SetKeyboardCapture', '0')")
    page.fill("#page-name", ""); page.click("#page-name"); page.keyboard.type("Ana"); typed["off"] = page.input_value("#page-name")
res = ut_web.browser_check(url, init_script=ut_web.MOCK_LEADERBOARD_JS + ut_web.PAGE_INPUT_JS, actions=act)
```

Font decision [added]: ship a font asset per script players can use (TextMesh Pro fallback font
assets; CJK fonts cost megabytes, so subset them), restrict names to a supported set, or draw user
text in HTML over the canvas where the browser's fonts apply. Judge by a screenshot with one line of
each script: the Font API does not tell (below).

**Live test:** `test_17_strip_failure_text_errors`, `test_18_keyboard_capture`. **Result (pass):**
"Émile 名前 Ωμέγα" survived page to C#, C# to page and back byte for byte. The built-in font
(`LegacyRuntime`) drew "Émile" and left "名前 Ωμέγα" blank (`unity-web_Web-v2-text_*.png`), while
`Font.HasCharacter` and `GetCharacterInfo` reported 0 of 12 characters missing: only the screenshot
shows the failure. Keyboard: with the default capture, typing "Ana" into the page field produced ""
(every keystroke swallowed); after `SetKeyboardCapture("0")` the field read "Ana". Wire focus/blur
on page fields to toggle it (P3). Not run: `WebGLInput.mobileKeyboardSupport` on a real phone.

---

## P16. Production error reporting

**Goal:** errors players hit reach you, with readable stacks. **Why:** a release build logs to the
browser console only; the 6.3 Manual (Debug production Web builds > Report browser errors; Customize
error handling) says to hook page errors and forward them; `errorHandler` in the loader config
receives `window.onerror` and returning false keeps Unity's own handling. **Calls:** the AgentWeb
template's `window.AgentWebReportError` (console line `AGENTWEB_ERROR {json}` +
`navigator.sendBeacon` to template variable `AGENTWEB_ERROR_URL`), fed by `errorHandler`, loader
error banners and `WebErrorReporter.cs` (installs at `SubsystemRegistration`, forwards
`LogType.Exception`, `Error`, `Assert` through `AgentWeb_ReportError`, capped at 20 per session;
`WebErrorReporter.endpoint` for portals that drop your page). `ut_web.serve` accepts POSTs on
`ut_web.ERROR_ENDPOINT` and `srv.error_reports()` returns them. Read stacks with Debug Symbols
External and `MethodMap.tsv` (P8).

```csharp
// Assets/AgentWeb/Scripts/WebErrorReporter.cs (shipped, complete apart from comments)
public static class WebErrorReporter
{
    public static string endpoint = "";     // collector URL when the page has no reporter (portals)
    public static int maxReports = 20;
    static int s_Sent;
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void AgentWeb_ReportError(string kind, string message, string stack, string endpoint);
#else
    static void AgentWeb_ReportError(string kind, string message, string stack, string endpoint) { }
#endif
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    static void Install() { s_Sent = 0; Application.logMessageReceived -= OnLog; Application.logMessageReceived += OnLog; }
    static void OnLog(string condition, string stack, LogType type)
    {
        if (type != LogType.Exception && type != LogType.Error && type != LogType.Assert) return;
        if (s_Sent >= maxReports) return;
        s_Sent++;
        string kind = type == LogType.Exception ? "csharp_exception" : (type == LogType.Assert ? "csharp_assert" : "csharp_error");
        AgentWeb_ReportError(kind, condition ?? "", stack ?? "", endpoint ?? "");
    }
}
```

```python
ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings", {"template_values": {"AGENTWEB_ERROR_URL": "/__agentweb_errors"}}, build_target="WebGL")
srv = ut_web.serve(root); res = ut_web.browser_check(srv.url + "index.html", actions=trigger_errors); reports = srv.error_reports(); srv.stop()
```

**Live test:** `test_17_strip_failure_text_errors`. **Result (pass):** the collector received
`csharp_error` (the engine's "Could not produce class with ID 182", twice), `csharp_exception`
("InvalidOperationException: agentweb test exception (éè 名前)", stack
"AgentWebTests.WebHazardProbe.Hazard (System.String kind)": managed names are readable in a release
build with Explicitly Thrown) and `js` (a page `throw` through `errorHandler`, returning false). Not
run: a real collector service and symbol lookup of a native frame.

---

## P17. Heap sizing, memory and frame-rate soak, profiling path

**Goal:** a phone never has to grow the heap mid-game, and memory and frame rate are measured, not
guessed. **Why:** the heap is one contiguous block; growth can crash when the browser finds none;
"for mobile browsers, configure the Initial Memory Size to the typical heap usage" (6.3 Manual,
Memory in Unity Web). Defaults: Initial 32 MB, Geometric growth (0.2, cap 96 MB), Maximum 2048 MB
(Web Player settings table). **Calls:** `browser_check(..., metrics_seconds=N)` samples
`unityInstance.GetMetricsInfo()` every second (`totalWASMHeapSize`, `usedWASMHeapSize`, JS heap,
`fps`, `movingAverageFps`, `numJankedFrames`, load timings; available in release builds without the
Diagnostics Overlay), `ut_web.heap_advice(samples, initial_mb)` (peak total rounded up to 16 MB),
then `ApplySettings {"initial_memory": n}` and a rebuild. Play the heaviest scene during the soak:
the advice is only as good as the session.

```python
res = ut_web.browser_check(url, metrics_seconds=8)
adv = ut_web.heap_advice(res["metrics"], initial_mb=32)       # {"peak_total_mb": 67.8, "grew": True, "initial_memory_mb": 80}
ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings", {"initial_memory": adv["initial_memory_mb"]}, build_target="WebGL")
```

Profiling (not run: needs the Editor Profiler window): a Development Build, then Window > Analysis >
Profiler > Play Mode > Enable Web Profiling, or `arguments: ["--player-connection-ip=<ip:port>"]` in
the template config for startup data; `unityInstance.ConnectToProfiler` exists on the instance
(observed in the object keys); the Frame Debugger does not work on the Web (6.3 Manual, Profile a
Web build). Chrome DevTools Performance and Network cover the release build.

**Live test:** `test_17`, `test_20_linkxml_and_heap`. **Result (pass):** default settings: total
heap 67.8 MB after startup (73.9 MB in the older release build), used 65.2 MB, so the heap grew from
32 MB during load; advice 80 MB. Rebuilt with Initial 80 MB: `totalWASMHeapSize` stayed exactly
83,886,080 bytes for the whole 8 s soak (no growth), used 65.1 MB. Chrome headless on the Mac: 60
fps after the first second, 1 janked frame. Not run: a real phone (Silent Mode, thermal, the iOS
memory killer).

---

## P18. Template v2: loading card, tap to play, DPR cap on phones, WebAssembly 2023 gate

**Goal:** the page itself follows the expert rules. **Calls:**
`Assets/WebGLTemplates/AgentWeb/index.html` (plain ES5 so an old browser can parse it), custom
variables set with `ApplySettings {"template_values": {...}}`
(`PlayerSettings.SetTemplateCustomValue`):

- **Loading card** (design the wait, Craven LlE35onVdmQ [00:14:16]): product name, `AGENTWEB_TIP`
  how-to text, progress bar; `window.__agentWeb.progress` for tests
  (`browser_check(loading_screenshot=path)` captures it mid-load).
- **Tap to play** (`AGENTWEB_TAP_TO_PLAY=true` or `?tap=1`): after load, a button on `pointerdown`
  (full screen and audio need a gesture, and full screen requests only succeed on the next user
  event, 6.3 Manual Input in Web) hides the card and sends `OnPageEvent {kind: "start"}`.
- **DPR cap on phones:** `config.devicePixelRatio = min(devicePixelRatio, AGENTWEB_MOBILE_MAX_DPR)`
  (default 1: CrazyGames forces DPR 1 on iOS and low-memory Android); `?dpr=n` overrides.
- **WebAssembly 2023 gate:** `AGENTWEB_REQUIRE_WASM2023` follows the `wasm2023` setting
  (ApplySettings sets it); the page validates a 43-byte SIMD module and, on failure, shows "needs a
  newer browser (Chrome 91+, Firefox 89+, Safari 16.4+)" and never adds the loader script.
- Also: `errorHandler` and reporter (P16), the ASTC data hook (P19), the preload marker (P21),
  `window.unityInstance`, banners as `AGENTWEB_BANNER` console lines.

**Live test:** `test_19_template_features` (run on `Web-v2`, then again on `Web-v2-fixed` after a
HUD fix). **Result (pass):** iPhone emulation (390x844, device scale 3, mobile user agent): canvas
backing 390x844 (DPR 1 instead of 1170x2532); desktop at device scale 2: 1920x1200 (uncapped). Tap
to play: the card waited with "Click or tap to play", the click delivered `{kind: "start"}`.
Throttled load (20 Mbps, CPU x4): the card with the tip and a 7 percent bar at 0.6 s
(`unity-web_Web-v2-loading-card_*.png`), gameplay start 6.5 s. Forced validation failure: the
upgrade message showed (`unity-web_Web-v2-wasm-gate_*.png`), `unsupported_browser` reported, no
`loader.js` requested. The first phone screenshot showed the probe HUD clipped on a 390 px canvas
(font sized from height); sizing it from the short side fixed it
(`unity-web_Web-v2-iphone-dpr_*.png`). Not run: a real old browser (the gate was forced with an init
script), audio unlock on a device.

---

## P19. Dual texture data: DXT for desktop, ASTC for phones

**Goal:** one deployment serves the right compressed textures to desktop and mobile. **Why:** DXT on
phones without S3TC decompresses in software (more memory, slower); ASTC does not exist on Windows
desktop GPUs; Unity's answer is two builds and a page that picks the `.data` by
`WEBGL_compressed_texture_astc` (6.3 Manual, Texture compression in Web). **Calls:** build twice
from the same code and settings with `texture_subtarget` `DXT` and `ASTC`,
`ut_web.merge_texture_variants(desktop_root, mobile_root)` (refuses when framework or wasm bytes
differ, copies the ASTC `.data` into the desktop `Build/`, rewrites the template's
`AGENTWEB_DATA_VARIANTS` line), serve the desktop folder. Unity's own sample script uses a
Development build; with Brotli and Name Files As Hashes the names are `<hash>.data.br`, which the
merge handles.

```python
for sub, out in (("DXT", "Builds/Web-desk"), ("ASTC", "Builds/Web-mobile")):
    ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings", {"preset": "own-https", "texture_subtarget": sub}, build_target="WebGL")
    ut_run.build(P, "web", out=out)
m = ut_web.merge_texture_variants(P + "/Builds/Web-desk", P + "/Builds/Web-mobile")
assert m["ok"] and m["code_identical"]
```

**Live test:** `test_21_dual_texture_data`. **Result (pass):** framework and wasm byte-identical
between the DXT and ASTC builds; merged. Chrome on Apple Silicon (exposes ASTC) fetched only the
ASTC `.data`; with the extension hidden by an init script it fetched only the DXT `.data`; both
loaded with zero errors. The demo has almost no project textures, so the two `.data` files differ by
1 KB (3,920,312 vs 3,919,261 bytes); the saving scales with the game's textures. Not run: a Windows
desktop and an Android phone.

---

## P20. Portal iframes and Data Caching (Chrome vs the Safari engine)

**Goal:** know what a returning player downloads when the game runs in a portal's iframe. **Why:**
itch.io, CrazyGames and Poki serve the game in an iframe; "Safari has no IndexedDB for content
inside an iframe" (6.3 Manual, Web browser compatibility), so Data Caching may not help Safari and
iOS players there. **Calls:** `ut_web.iframe_host_page(game_url, dir)` served from another origin
(`serve(dir, url_host="127.0.0.1")` while the game is on `localhost`),
`browser_check(host_url, frame_match="localhost:<port>", reload=True, engine="chromium" | "webkit")`;
Playwright's WebKit build is the Safari engine, not Safari (`python3 -m playwright install webkit`).

**Live test:** `test_22_iframe_caching`. **Result (pass for Chrome; WebKit inconclusive):** Chrome,
top level and cross-origin iframe: warm reload transferred 0 bytes, `.data` not requested (IndexedDB
`UnityCache` present in the frame). Playwright WebKit: the build ran top level and in the iframe
(WebGL 2), but the warm reload downloaded the whole build again in BOTH cases (`.data` 200, 3.92
MB), although the loader logged "stored in the browser cache"; in the iframe `indexedDB.databases()`
listed nothing while top level listed `UnityCache`. So this setup could not isolate the iframe rule.
Plan for Safari and iOS players on iframe portals to download the full build on every visit, which
makes the byte budget stricter for them, and verify on a real Safari (Assumed until then).

---

## P21. Preload the first bundles

**Goal:** bundles the first playable moment needs start downloading with the page (Craven,
LlE35onVdmQ [00:13:41]). **Calls:**
`ut_web.add_preload(build_root, ["StreamingAssets/aa/WebGL/<name>.bundle"])` after every content
build (hashed names change), which writes `<link rel="preload" as="fetch" crossorigin="anonymous">`
under the template's `<!-- AGENTWEB_PRELOAD -->` marker. Rule [added from the measurement]: preload
only what is needed at gameplay start; preloaded bytes are counted in the portal window and compete
with the wasm on slow links.

**Live test:** `test_23_preload_bundles` (copy of `Web-addressables`, 20 Mbps, 40 ms). **Result
(pass):** the 0.84 MB bundle request moved from 8.13 s (after gameplay start) to 0.99 s, was
downloaded once (Addressables reused the preloaded response, no "preloaded but not used" warning),
and the prop appeared 0.22 s after gameplay start instead of 1.05 s; the cost: bytes before gameplay
start 10.11 to 10.94 MB, gameplay start 7.08 to 7.37 s. Single runs.

---

## P22. Far regions: latency and CDN coverage

**Goal:** the load-time budget holds for players far from the server. **Why:** Loveridge's game
loaded badly in Australia because the host lacked infrastructure there; pick a CDN with worldwide
nodes (FYsVftoLBP8 [00:15:08] to [00:16:12]). **Calls:**
`browser_check(..., throttle_mbps=20, latency_ms=250, cpu_slowdown=4)` against the 40 ms run; for
the real host, a load from another region (a remote browser or the CDN's own test tools) [not run:
no remote probe here].

**Live test:** `test_24_far_region_latency` (`Web-v2-fixed`, 10.08 MB). **Result (pass):** gameplay
start 5.95 s at 40 ms, 6.78 s at 250 ms (5 requests before start). Emulated latency alone added 0.8
s; a real far region also loses throughput (TCP over long paths, packet loss), which CDP emulation
does not model.

---

## P23. The size loop: build log, package pass, URP post data, splash

**Goal:** find the bytes worth cutting, cut one thing per rebuild, and prove the saving on disk.
Jason Weimann: measure, rank, fix the top files first (7O21c8BzEzM [00:01:41]). **Calls:**
`ut_web.build_log_report(build["log"])` (the "Build Report" block: uncompressed usage by category
and the largest assets, flags for the splash logo and URP post textures), `ut_web.package_report(P)`
(packages with a measured cost: URP about +3.6 MB, URP post about +1 MB, TextMesh Pro resources
about +0.7 MB, CrazyGames tests; Input System "can significantly increase the build size", 6.3
Manual; Addressables +0.27 MB observed), `WebJobs.SetPostProcessing {"enabled": false|true}` (the
renderers' post data under `Assets/`, previous references kept in
`Library/AgentWeb/postprocess_backup.json`), `ApplySettings {"splash": false, "unity_logo": false}`,
and `size_report` before and after every change.

```python
rep = ut_web.build_log_report(b["log"]); print(rep["categories"], rep["top_assets"][:5], rep["flags"])
ut_run.run_method(P, "AgentKit.Web.WebJobs.SetPostProcessing", {"enabled": False}, build_target="WebGL")
```

**Live test:** `test_16_bundle_probe_and_v2_build`, `test_25_postprocessing_cost`. **Result
(pass):** URP post data off (the demo ships no Volume effects): initial download 10.08 to 8.47 MB
(-1.61 MB), `.data` 3.92 to 2.31 MB, wasm unchanged, frame identical
(`unity-web_Web-v2-nopost_*.png`); the report no longer lists the 12 FilmGrain textures and SMAA
AreaTex. Splash and Unity logo off: the report dropped "Splash Screen Unity Logo" (2.7 MB
uncompressed), yet the Brotli `.data` shrank by only about 38 KB against the comparable Addressables
build: the report's uncompressed column ranks candidates, `size_report` decides. Not run: removing
the Input System package (the demo project uses the new input backend setting; switching it needs an
editor restart).

---

## P24. Audit v2: lighting, skinning, graphics stripping, scenes

**Goal:** catch 3D content that the Web punishes before building. **Why:** WebGL 2 supports baked GI
with non-directional lightmaps only (6.3 Manual, WebGL2); lightmaps took a 3D web build to hundreds
of MB (Loveridge [00:35:27]); WebGL 2 skins on the CPU (Duncan [~00:15:13]); draw calls cost more on
WebGL than native (6.3 Manual, Web performance considerations); strip unused variants (Recommended
Graphics settings). **Calls:** `WebJobs.AuditWeb {"scenes": [...], "skinned_threshold": 10}` opens
each build scene (or the given ones): `web.lighting.directional`, `web.lighting.lightmaps` (count,
megapixels), `web.skinning.cpu`, `web.graphics.*` (instancing variants, lightmap and fog modes,
Always Included Standard shader, BRG variants), `web.settings.splash`, `web.urp.postprocessing`,
plus the scene-list, texture, audio, video and package checks of P1. `ut_web.scan_hang_apis` now
also flags `Application.targetFrameRate = n` (warn: leave -1 on the Web).

**Live test:** `test_26_audit_v2` (fixture scene from
`tests/code/unity-web/unity/Editor/WebAuditFixture.cs`: baked GI, directional lightmaps, 12 skinned
mesh renderers). **Result (pass):** findings `web.lighting.directional`, `web.skinning.cpu`,
`web.urp.postprocessing` (post data restored after P23), `web.package.inputsystem`, texture infos; 0
errors. `LightmapsMode.ToString()` printed "Single, Dual" (aliased enum values), so the job now
reports its own names. Offline: the `targetFrameRate = 30` fixture line is reported, `= -1` is not.
