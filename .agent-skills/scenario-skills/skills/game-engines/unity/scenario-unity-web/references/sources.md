# Sources (scenario-unity-web)

Every source behind the skill, with credentials, URL, what it is best for, and the best timestamps.
Notes and digests: `notes/web/` (`_digest_docs_web.md`, `_digest_videos_web.md`,
`_digest_extra_web.md`). Version facts: `sources/unity-version-deltas.md` § 12 (Web) and § 13 (6.4
to 6.6). Precedence when sources disagree: the installed editor and a live run beat the 6.3 Manual,
which beats package docs for other versions, which beat videos.

## Official documentation (Unity 6.3 Manual, retrieved 2026-09-24; local copies in `sources/docs/`)

| Bundle (local file)                                                                                                                                                                                                      | URL (entry page)                                                                                | Best for                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build, deploy and server configuration: Web build settings, Build folder, Apache, Nginx, Node.js and IIS samples, caching, templates, Web Player settings (`web__build-deploy-server.md` + `.tables.md`)                 | https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-deploying.html                       | the per-file `Content-Encoding` / `Content-Type` table, `.data.gz` as `application/gzip`, COOP/COEP/CORP, `createUnityInstance` config, template variables, Publishing Settings table (Compression Format, Name Files As Hashes, Data Caching, Debug Symbols, Decompression Fallback, Enable Exceptions, WebAssembly 2023, memory) |
| Distribution size and stripping, recommended settings, mobile web, texture compression, profiling and debugging, plus the Unity 6 optimization e-book pages 92 to 96 (`web__optimization-size-mobile.md` + `.tables.md`) | https://docs.unity3d.com/6000.3/Documentation/Manual/web-optimization.html                      | the release recipe with its C# setters, Build Profiles preset matrix, dual DXT/ASTC build, `MethodMap.tsv`, "fallback harmful for battery", `targetFrameRate -1`                                                                                                                                                                   |
| Technical limitations, browser compatibility, memory, .NET API support, WebAssembly 2023, audio, video, input, canvas size, device access, networking (`web__platform-limits-memory.md` + `.tables.md`)                  | https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-technical-overview.html              | the hang/no-run API table, frame-end GC, heap growth, gesture rules, iOS Silent Mode, AAC loop points, sockets                                                                                                                                                                                                                     |
| Interaction with browser scripting: `.jslib`, `.jspre`, JS to C#, C# to JS, callbacks, deprecated calls, Emscripten native plug-ins (`web__browser-scripting-interop.md` + `.tables.md`)                                 | https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-interactingwithbrowserscripting.html | ES5-only rule, marshaling (`UTF8ToString`, `_malloc` + `stringToUTF8`), `makeDynCall` + `[MonoPInvokeCallback]`, `SendMessage` arity, `errorHandler`, `showBanner`                                                                                                                                                                 |
| WebGL 2 and WebGPU pages plus two Unity Discussions threads by the Web Graphics team (Brendan Duncan, dnach) (`web__webgpu.md`)                                                                                          | https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html                                | WebGPU status (experimental in 6.3, supported but opt-in from 6.6), enable-and-fallback, silent fallback, limitations list (readback, storage formats, barriers, 16 textures), WebGL 2 rules (non-directional lightmaps, no system fonts)                                                                                          |
| Unity 6 e-book "Optimize your game performance for mobile, XR, and the web" (Web chapter, inside the optimization bundle; full e-book in `sources/docs/mobile__unity6-mobile-xr-web-optimization-ebook.md`)              | Unity e-book (Unity 6 edition)                                                                  | compression and fallback judgment, WASM 2023 browser floor, frame pacing                                                                                                                                                                                                                                                           |

## Portal developer documentation (retrieved 2026-09-24; `sources/docs/web__portal-guides-crazygames-poki.md`)

| Source                                                                         | Credentials                                           | URL                                                      | Best for                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CrazyGames: Unity optimization tips, technical requirements, first-frame guide | CrazyGames developer relations (50M+ monthly players) | https://docs.crazygames.com/resources/optimization-tips/ | 20 / 50 MB initial download to `gameplayStart`, 250 MB total, 1,500 files, 4 GB Chromebook floor, iOS disabled by default, DPR 1, measured URP (+3.6 MB), post (+1 MB), TMP (+0.7 MB) costs, `index.html` ignored |
| Poki: Unity SDK and build optimization                                         | Poki developer relations                              | https://sdk.poki.com/unity                               | compression Disabled (Poki compresses), `commercialBreak()` before `gameplayStart()`, mute during ads, template include markers                                                                                   |

## Videos and talks (transcripts in `transcripts/`, notes in `notes/web/`)

| Id          | Title, speaker                                                                                    | Credentials                                                                        | URL                                         | Best for                                                                                                                                                                                            | Best timestamps                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FYsVftoLBP8 | Level up your Web builds (Unite 2025), Josh Loveridge                                             | Founder and Managing Director, Stratton Studios; Unity web games with 50M+ players | https://www.youtube.com/watch?v=FYsVftoLBP8 | 30 MB binary rule, budgets from the market, WebGL vs WebGPU as first decision, asset pipeline, hosting and CDN, CI/CD, 5 percent staged rollout and rollback, "baked lighting in web, don't try it" | [00:03:29], [00:04:35], [00:09:01], [00:10:07], [00:11:15], [00:15:08], [00:21:40], [00:23:16], [00:35:27]; frames 00:03:30, 00:21:59, 00:23:29, 00:24:59 |
| 3bu4WZUCGYc | Better in a browser (Unite 2024), Ben Craven, Brendan Duncan, Josh Loveridge                      | Unity Web product owner; Unity WebGL/WebGPU back-end lead; Stratton founder        | https://www.youtube.com/watch?v=3bu4WZUCGYc | WebGPU with WebGL fallback, compute (7 to 30 fps skinning), VFX Graph needs WebGPU, 400 MB to 29.75 MB payload, cutscene hides streaming                                                            | [~00:10:10], [~00:11:24], [~00:15:13], [~00:22:01], [~00:29:14], [~00:31:41], [~00:32:01]                                                                 |
| LlE35onVdmQ | Instantly get your Unity game to more players on the web (Unite 2023), Ben Craven, Anthony Bowker | Unity Web platform product and engineering managers                                | https://www.youtube.com/watch?v=LlE35onVdmQ | load time as the metric (+50 percent sessions for -25 percent load), bandwidth diminishing returns, release recipe, preload tags, design the wait                                                   | [00:02:36], [00:08:40], [00:10:19], [00:11:26], [00:13:06] to [00:18:10], [00:14:16]                                                                      |
| vBKl9miz4i4 | 3D on the Web 2026: Unity WebGPU (Khronos), Brendan Duncan                                        | Unity Web Graphics engineer                                                        | https://www.youtube.com/watch?v=vBKl9miz4i4 | why WebGPU fails where the Editor works, PSO stalls, fallback ladder, device filtering                                                                                                              | [00:02:57], [00:03:30], [00:05:34], [00:06:08], [00:09:30]                                                                                                |
| bF_eUuxGEcA | Unity 6: Building to WebGPU, Cam Ayres                                                            | Staff Solutions Architect, Unity                                                   | https://www.youtube.com/watch?v=bF_eUuxGEcA | switch platform before editing APIs, API list order, empty scene list, prove the API in the console                                                                                                 | [00:01:33], [00:03:20], [00:04:02], [00:06:17]                                                                                                            |
| u7TQJWmZ_rk | What's new in 6.6, Unity                                                                          | official release overview                                                          | https://www.youtube.com/watch?v=u7TQJWmZ_rk | version fence: WebGPU supported (opt-in), Progressive Asset Loading, WebAssembly64 are 6.6, not 6.3                                                                                                 | [00:19:50], [00:20:34], [00:21:07]                                                                                                                        |
| 3g0N__K7Wlo | Send data from JavaScript to Unity WebGL, Code Monkey (Hugo Cardoso)                              | indie developer (7 Steam games), educator                                          | https://www.youtube.com/watch?v=3g0N__K7Wlo | hook GameObject, SendMessage arity, JSON strings                                                                                                                                                    | [00:01:06], [00:04:30], [00:06:15]                                                                                                                        |
| 8iApGVX--B0 | Unity 6 Web build to itch.io, Max O'Didily                                                        | tutorial creator (unverified)                                                      | https://www.youtube.com/watch?v=8iApGVX--B0 | itch.io upload mechanics, fallback for header-less hosts                                                                                                                                            | [00:01:40], [00:02:17], [00:03:25], [00:05:39]                                                                                                            |
| F-NzcSQLiJs | Unity WebGL on phones with local HTTPS, Makaka Games (Andrei Sirota)                              | Asset Store publisher (self-introduced)                                            | https://www.youtube.com/watch?v=F-NzcSQLiJs | LAN phone testing, HTTPS for sensors, self-signed certificates                                                                                                                                      | [00:01:12], [00:05:47], [00:06:55]                                                                                                                        |
| 7O21c8BzEzM | Reduce your Unity build size, Jason Weimann                                                       | professional Unity developer, Unity3D College                                      | https://www.youtube.com/watch?v=7O21c8BzEzM | measure-rank-fix loop, texture Max Size step-down, audio import cuts                                                                                                                                | [00:01:41], [00:03:25], [00:04:50], [00:05:22]                                                                                                            |

## Live observations (this skill, Unity 6000.3.21f1, Chrome 153 headless, 2026-09-24)

Recorded in `archive/tests/unity-web/live_results.jsonl` by `tests/code/unity-web/test_live_web.py`
and `test_live_web_v2.py` (the latter also uses Playwright's WebKit build, the Safari engine but not
Safari, for P20); the numbers are in `references/procedures.md` with each procedure. Best for: what
the URP template really ships (Brotli, Shorter Build Time, WASM 2023 off, Minimal stripping, IL2CPP
OptimizeSpeed, splash on), real gzip vs Brotli sizes and build times, the exact loader errors a
misconfigured server produces, which graphics API a WebGPU build runs by origin, what C# threading
does in a real browser.

## Installed editor (read on disk)

- `/Applications/Unity/Hub/Editor/6000.3.21f1/PlaybackEngines/WebGLSupport/BuildTools/`:
  `WebGLTemplates/Base/{Default,Minimal,PWA}`, `UnityLoader/UnityLoader.js` (the loader's own error
  texts for missing `Content-Encoding`, wrong `application/wasm`, double compression),
  `Emscripten/emscripten/emscripten-version.txt` = `3.1.39-git` (the Manual's table says
  3.1.38-unity: rebuild native `.a` plug-ins against the bundled version).
- `Unity.app/Contents/Resources/Scripting/Managed/UnityEditor.xml`: `PlayerSettings.WebGL.*`
  members, `WebGLCompressionFormat`, `WebGLExceptionSupport`, `WebGLTextureSubtarget`;
  `UnityEditor.WebGL.Extensions.dll`: `WasmCodeOptimization` = BuildTimes, RuntimeSpeed,
  RuntimeSpeedLTO, DiskSize, DiskSizeLTO.
- `PlaybackEngines/WebGLSupport/Managed/UnityEngine.WebGLModule.dll`: the only assembly defining
  `WebGLInput` (`captureAllKeyboardInput`, `mobileKeyboardSupport`, `stickyCursorLock`): Web player
  builds only, hence the `UNITY_WEBGL && !UNITY_EDITOR` guard.
- `BuildTools/UnityLoader/UnityLoader.js`: `unityInstance.GetMetricsInfo()` (WASM heap total and
  used, JS heap, fps, moving average, janked frames, load timings) and `ConnectToProfiler`;
  `UnityCache.js`: Data Caching needs both IndexedDB and the Cache API.
- `BuildTools/WebGLTemplates/Base/{Default,Minimal}/index.html`: the Diagnostics Overlay wiring
  (`SHOW_DIAGNOSTICS`) and the dynamic loader-script pattern the AgentWeb template reuses.
- `UnityEditor.xml`: `PlayerSettings.SetTemplateCustomValue` / `GetTemplateCustomValue`,
  `PlayerSettings.WebGL.initialMemorySize`, `linearMemoryGrowthStep`, `geometricMemoryGrowthStep`,
  `memoryGeometricGrowthCap`, `EditorGraphicsSettings.batchRendererGroupShaderStrippingMode`.
- `Library/EditorUserBuildSettings.asset` (test project): `m_SelectedWebGLSubtarget` and the WebGL
  `CodeOptimization` value, i.e. per-checkout state (P13).

## Official competitor skill

Unity's own agent skills (`github.com/Unity-Technologies/skills`) include `optimize-web` (deltas §
4). Not read for this skill; compare before extending it.

## Revision history

- 2026-09-24 v0.1: first version (12 procedures, 13 live tests).
- 2026-09-24 v0.2: refactor after blind grade Y12 (v0.1 kept in
  `skills/_versions/unity-web v1 2026-09-24/`). Taught the points the notes held and v0.1 did not:
  Safari iframe caching (LIM), `captureAllKeyboardInput` (LIM), no system fonts (GPU WebGL2),
  measured stack costs (POR, OPT), stripping vs bundles with a generated link.xml (OPT),
  Library-only Code Optimization and texture subtarget plus EditMode policy tests (OPT), WebAssembly
  2023 browser floor and template gate (LIM), preload tags and design the wait (LlE35onVdmQ
  [00:13:41], [00:14:16]), production error reporting (OPT, INT), heap sizing from `GetMetricsInfo`
  and the profiling path (LIM, OPT), WebGL 2 lighting and CPU skinning audits (GPU, 3bu4WZUCGYc),
  scene-list gate (bF_eUuxGEcA [00:04:02]), CDN regions (FYsVftoLBP8 [00:16:12]), dual DXT/ASTC
  data, DPR cap on phones, full C# bridge code in P3, and the baseline's errors (`targetFrameRate`,
  small growing heap on phones, WebGPU status by version). 12 new procedures (P13 to P24), 13 new
  live tests (all pass; the WebKit half of P20 is inconclusive and recorded as such), 7 new offline
  tests; the 13 v0.1 live tests re-ran on the v0.2 code and passed.
