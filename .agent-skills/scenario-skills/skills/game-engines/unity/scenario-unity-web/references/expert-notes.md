# Expert notes: Unity Web (principles and judgment by source)

Citations: video id plus `[hh:mm:ss]` (`~` = estimated from word position, the Unite 2024 transcript
is one block); `[frame hh:mm:ss]` = slide text read from the contact sheets; Manual pages as
`(6.3 Manual, page)`. Items marked [added] are this skill's own inference or observation, not a
source claim. "Observed" means measured on this Mac on 2026-09-24 (`references/procedures.md`).

## Unity Web platform team: Ben Craven and Anthony Bowker (Unite 2023, `LlE35onVdmQ`; Craven again in Unite 2024, `3bu4WZUCGYc`)

- **Load time is the metric.** No install step means the player downloads the runtime on first
  click: "load time is everything", "smaller is almost always better" [00:02:36], [00:03:10]. On a
  live title a 25 percent load-time drop gave +50 percent active sessions and click-to-play from 35
  to 58 percent [00:08:40].
- **Past broadband, bandwidth stops mattering.** Load time falls from 48 to 86 Mbps and then
  flattens: WASM instantiation and startup CPU dominate, so shrink the binary, not only the assets
  [00:10:53], [00:11:26], [00:16:29]. Measure on a throttled mid-range phone: Ready Set Cook went
  from 12 s to 5.5 s time to interactive on a Pixel 5 at 48 Mbps [00:10:19].
- **Release recipe, in order** [00:13:06] to [00:18:10]: release build optimized for size, Brotli
  precompression plus a configured server, HTTP preload tags for the first bundles, Addressables so
  only the first scene ships up front, compressed audio, Crunch or larger ASTC blocks ("still look
  really good"), shader stripping and quality settings.
- **Design the wait**: replace the bare progress bar with a splash or a how-to-play video
  [00:14:16].
- **Fit content to the platform**: casual games, or a slice (tutorial, first level) as its own Web
  build that funnels to the full game (U23 [00:03:42]; U24 [~00:03:49]). Mobile Web targets high-end
  phones of the last 2 to 3 years [00:06:27].
- **2 GB of heap is fine for most games**; 4 GB for rich desktop 3D [00:20:22]. Native WASM
  exceptions cost very little [00:20:54]; SIMD gives 7 to 20 percent on CPU skinning [00:22:02].
- **The build chain explains the build time**: managed stripping, IL2CPP to C++, Emscripten to
  WebAssembly [~00:01:28]. Observed: "Postprocess built player" was 305 of 338 s in the first build
  and 396 of 401 s in the LTO release build (P2, P8).

## Brendan Duncan, Unity Web Graphics (Unite 2024 `3bu4WZUCGYc`, Khronos 2026 `vBKl9miz4i4`, Unity Discussions staff posts saved in `sources/docs/web__webgpu.md`)

- **WebGPU does not replace WebGL**: ship both, WebGPU first, WebGL 2 as the graceful fallback,
  because WebGL still has the reach [~00:10:10], [~00:10:49]. The fallback is "automatic and
  silent", including on plain HTTP or `file://` (forum, 6.6 announcement). Observed (P7): the same
  WebGPU-first build ran `WebGPU` on `http://localhost` and `OpenGLES3` on `http://<LAN IP>` in
  Chrome 153 (no `navigator.gpu` in an insecure context), with no error and identical frames.
- **Compute is the reason to pick WebGPU**: GPU skinning, VFX Graph, indirect rendering, Forward+
  light handling [~00:11:24] to [~00:17:52]. About 30 skinned characters ran at about 7 fps on WebGL
  and 30 fps on WebGPU with no other change [~00:15:13]. VFX Graph exists on the Web only with
  WebGPU [~00:15:38].
- **Not uniformly faster**: WebGL can keep a CPU advantage with very large draw-call counts (forum,
  6.6 thread #6). Measure the same scene on both APIs before committing.
- **"Works in the Editor, fails on the Web" is by design**: WebGPU is stricter than D3D12, Vulkan
  and Metal for security [00:02:57]. Suspect storage texture formats and read-write access first
  [00:03:30]; Unity rewrites a declared format to match the bound texture but cannot make
  unsupported read-write formats work [00:04:02].
- **Runtime pipeline creation stalls for seconds** (about 10,000 shaders compiled in the browser; on
  Windows WGSL is translated back to HLSL) [00:05:34]. Cache and warm PSOs before play [00:06:08].
  WebGPU PSO tracing is a 6.4 feature (deltas § 13): on 6.3 reduce variants and test.
- **Fallback ladder**: WebGPU core, compatibility mode, WebGL 2; the game must still feature-detect
  (compute) and own a backup plan [00:09:30] to [00:10:02]. Device filters and compatibility mode
  ship in 6.6 only.
- **Version choice** (forum): 6.3 LTS gets most WebGPU fixes backported; 6.4 gets no more fixes; 6.6
  removes the experimental label but WebGPU stays opt-in.
- **Texture formats still split by device class**: ASTC is mobile and Mac only, not Windows desktop;
  use BC on Windows (forum 6.1 #15). Observed: headless Chrome on Apple Silicon exposes ASTC, S3TC
  and ETC together, so a Mac test does not reveal a Windows ASTC problem [added].

## Josh Loveridge, Stratton Studios (Unite 2024 segment `3bu4WZUCGYc`; Unite 2025 `FYsVftoLBP8`). Web games with 50M+ players, 8 titles

- **30 MB binary is "table stakes"** [00:03:29]; above it churn rises and reach shrinks. His 2024
  FPS shipped a 29.75 MB initial payload from a 400 MB first build [~00:29:19], [~00:31:41]; his
  2025 desktop-only FPS broke the rule deliberately at 72 MB [00:18:57]. Portal limits win over his
  rule on portals.
- **Playbook slide** [frame 00:03:30]: Addressables for on-demand loading ("especially for games
  over 30mb"), global CDN, "Compress smartly (Brotli/Gzip, Unity build profiles)", "Streamline
  starter data: get players in before the full game is ready". The phone on the slide shows "PRESS
  ANYWHERE TO START": the gesture screen that also unlocks audio [added reading of the frame].
- **Budgets are hard limits set from the market's devices** (Southeast Asia means a stricter budget)
  and enforced at asset approval: over budget "ain't getting in the game" [00:09:01], [00:09:33].
- **WebGL or WebGPU is the first decision** and forks the project: WebGL for reach (casual, mobile),
  WebGPU for heavy 3D with compute [00:04:35] to [00:07:22]. Hide API specifics behind one
  abstraction so one codebase serves both [00:14:33].
- **Cut what does not earn its cost**: "If it only improves your game's visual fidelity by one or
  two percent... it needs to go" [00:11:15]. Shadow cascades 1 or 2 [00:10:07]. Draw calls hurt more
  on the Web than native [00:08:27].
- **"Textures are your enemy"** [00:11:48]; Stratton moved to KTX2/Basis, Draco meshes (30 to 40
  percent smaller than FBX) and Opus audio through a custom pipeline. These are third-party pipeline
  choices, not 6.3 editor features [added].
- **"Baked lighting in web, don't try it"**: 256 x 256 lightmaps still took a build to a couple
  hundred MB [00:35:27], [00:36:00]. Deciding condition [added]: a small static scene with few
  lightmaps can bake (WebGL 2 supports non-directional lightmaps only); a large world with a
  download budget goes real-time.
- **Hosting is performance**: CDN regional coverage changed Australian load times; month-one
  bandwidth reached a couple of TB; "we tried, we failed" building their own hosting [00:15:08] to
  [00:16:12].
- **Release like a live service** [frame 00:23:29]: stage 1, 5 percent rollout; stage 2, progressive
  rollout if no P1 bug; "Rapid rollback safety: Cloudflare and GitHub Actions allow us to instantly
  revert to a previous stable build". Editor to players in 8 to 9 minutes [00:21:40].
- **Design the wait with content**: a cutscene hides progressive download [~00:32:01].

## Cam Ayres, Staff Solutions Architect, Unity (`bF_eUuxGEcA`, 2024-12, Unity 6.0)

- **Switch the platform to Web before editing the Graphics API list**; otherwise "things get a
  little wonky" [00:01:33]. The list is a priority list: WebGPU on top, WebGL 2 below [00:03:20].
- **Prove the API from the console** [00:06:17]; never trust the list.
- **A stale scene list builds "nothing"** [00:04:02]: gate builds on a valid, non-empty scene list.
- **Resolution drives Web fps**: 60 fps at 1080p, an estimated 10 to 20 at 4K [00:04:49]. Lower
  canvas size or device pixel ratio before blaming the API.
- His "400 MB limit" [00:07:20] is unconfirmed by any saved source; the documented cap is Unity
  Play's 1 GB.
- The `ProjectSettings.asset` WebGPU unlock he shows is 6.0 only; 6.3 lists WebGPU in the Graphics
  API list (observed: `SetGraphicsAPIs` accepted it).

## Unity 6.3 Manual, Web platform (six saved bundles, `sources/docs/web__*.md`)

- **Two settings dictate the server**: Compression Format and Decompression Fallback (Deploy a Web
  application). Precompressed files need the matching `Content-Encoding`; `.wasm*` must be
  `application/wasm` for streaming compilation; fallback means a bigger loader, no streaming
  compile, and on mobile "harmful for battery usage" (e-book). Keep it for hosts whose headers you
  cannot set.
- **Serve `.data.gz` as `application/gzip`** (Safari bug 247421) and never let the host compress
  Unity's precompressed files again (Nginx `gzip off`, IIS `doStaticCompression="false"`).
- **Brotli decodes natively only over HTTPS** in Chrome and Firefox. Observed in Chrome 153:
  `http://localhost` decodes Brotli (a potentially trustworthy origin), `http://<LAN IP>` fails
  every `.br` request with `net::ERR_CONTENT_DECODING_FAILED` although the server sends
  `Content-Encoding: br`, and the same build over `https://<LAN IP>` loads. So a localhost test
  proves nothing about a plain-HTTP host.
- **No managed threads**: "All APIs that schedule work through the ThreadPool cause an unrecoverable
  browser hang"; `Thread.Start`, `ThreadPool.QueueUserWorkItem`, timers and
  `CancellationTokenSource` timeouts silently never run (.NET API support on the Web platform). Use
  `Awaitable`, coroutines, `UnityWebRequest`.
- **GC runs only at the end of a frame**: 100,000 string concatenations in one frame need about 15
  GB of temporaries and crash on the Web while working on native (Memory in Unity Web).
- **Heap growth can crash** when the browser finds no contiguous block; on mobile set Initial Memory
  Size to typical usage; 2048 MB is enough for most apps; bugs above 2048 MB in Chrome and Firefox
  before 119.
- **Exceptions**: None stops the content on any throw; with WebAssembly 2023 on, "the performance
  overhead from any exception support option is minor" (Web performance considerations).
- **Gestures**: audio, full screen and pointer lock need a user gesture; request full screen on
  pointer DOWN (Input in Web). iOS Silent Mode mutes `DecompressOnLoad` clips (WebKit 262781).
- **Interop contract**: `.jslib`/`.jspre` ES5 only; `SendMessage` reaches a named GameObject with
  zero or one string or number; strings cross as heap pointers (`UTF8ToString`, `_malloc` +
  `stringToUTF8`); callbacks through `{{{ makeDynCall }}}` into static `[MonoPInvokeCallback]`
  methods; `Pointer_stringify`, `dynCall`, `unity.Instance`, `gameInstance` are deprecated
  (Interaction with browser scripting).
- **WebGPU limits in 6.3**: no synchronous GPU readback (`GetPixels`, `ComputeBuffer.GetData`,
  `CaptureScreenshot` fail: use `AsyncGPUReadback`), `RWBuffer` unsupported, barriers only in
  uniform control flow, no wave intrinsics, `RGBA8`/`RHalf` not read-write storage, about 16
  textures per shader (terrain layers).
- **Texture compression**: the Build Profiles texture setting overrides Player Settings and lives in
  `Library/` (not version control); unsupported formats decompress in software (more memory); dual
  DXT/ASTC build is Unity's answer.
- **Leave `Application.targetFrameRate` at -1**: Unity cannot query the browser refresh rate and
  assumes 60; Safari is capped at 60.
- **Profiling**: development builds only, no Frame Debugger; Debug Symbols External plus
  `MethodMap.tsv` from `Library/Bee/artifacts/WebGL/il2cppOutput/cpp/Symbols` for production stack
  traces.

## Portal developer relations: CrazyGames and Poki (`sources/docs/web__portal-guides-crazygames-poki.md`)

- **CrazyGames limits**: initial download (bytes until the SDK's first `gameplayStart`) at most 50
  MB, at most 20 MB for the mobile homepage, 250 MB total, 1,500 files, 20 s to gameplay for
  external content; smooth on a 4 GB Chromebook; Unity games disabled on iOS by default (memory
  crashes); DPR forced to 1 on iOS and low-memory Android.
- **Measured costs** (CrazyGames tests): URP about +3.6 MB, URP post-processing about +1 MB,
  TextMeshPro about +0.7 MB, LTO plus size codegen took an empty project from 14.7 to 12.5 MB.
- **Portals own the page**: CrazyGames ignores a Unity game's `index.html` and custom JS; Poki
  rewrites it except inside its include markers. Bridge code belongs in `.jslib` or the portal SDK.
- **Poki**: compression Disabled (its server compresses), `commercialBreak()` before every
  `gameplayStart()`, mute audio and disable input during ads.
- **Exceptions**: keep Explicitly Thrown unless code and libraries are proven exception-free; never
  ship Full With Stacktrace (CrazyGames).

## Tutorial voices

- **Code Monkey (Hugo Cardoso), `3g0N__K7Wlo`**: one dedicated hook GameObject, public methods with
  zero or one string or number, JSON strings for structure, prove the C# side in the Editor before
  building [00:01:38] to [00:08:32]. The 2019 loader he edits is obsolete; the SendMessage contract
  is not.
- **Max O'Didily, `8iApGVX--B0`**: itch.io mechanics: project kind HTML, zip the build's contents
  with `index.html` at the root, viewport equal to the build resolution, save Restricted before
  Public [00:02:17] to [00:05:39]. His "strongly recommend" Decompression Fallback [00:01:40] is
  right for itch.io (no header control) and wrong as a general default.
- **Makaka Games (Andrei Sirota), `F-NzcSQLiJs`**: Build and Run cannot serve a phone; run your own
  server on the LAN [00:01:12]; sensors need HTTPS and fail silently over HTTP on Android
  [00:06:55]; self-signed certificates are fine for tests [00:05:47]. The same secure-context rule
  turns WebGPU off at a LAN HTTP address (observed).
- **Jason Weimann, `7O21c8BzEzM`**: measure, rank, fix: the top three or four files are often most
  of the build [00:01:41]; step texture Max Size down one or two levels and judge at play distance
  [00:03:25]; 2048 to 512 plus Crunch 50 took textures from 35 MB to 650 KB [00:04:50]; default
  audio import (Quality 100, Preserve Sample Rate) is wasteful, and always listen after cutting
  [00:05:22] to [00:06:27].

## Added in the refactor (2026-09-24, after blind grade Y12): points the notes held and v1 did not teach

**Unity 6.3 Manual (saved bundles):**

- **Safari has no IndexedDB for content inside an iframe** (Web browser compatibility). Portals and
  itch.io always iframe the game, so Data Caching may not help Safari and iOS players there.
  Observed (P20): Chrome served `.data` from IndexedDB on a warm reload in a cross-origin iframe;
  Playwright's WebKit re-downloaded the whole build both top level and in the iframe, so the rule
  could not be isolated here [Assumed for real Safari].
- **Keyboard input is page-wide by default** (Input in Web > Keyboard input and focus handling):
  `WebGLInput.captureAllKeyboardInput = false` lets page fields type. Observed (P15): a page field
  received "" with capture on, "Ana" with it off. `WebGLInput.mobileKeyboardSupport` controls the
  soft keyboard for UI input fields.
- **No system fonts on WebGL 2** (WebGL2): ship every font, including fallbacks for international
  scripts and bold or italic faces. Observed (P15): the built-in font drew Latin and left CJK and
  Greek blank, while `Font.HasCharacter` and `GetCharacterInfo` said every glyph was present.
- **Stripping vs bundles** (Distribution size and code stripping; AssetBundles in Web): a class used
  only in bundles is stripped (`Could not produce class with ID`); fix with link.xml or
  `BuildPlayerOptions.assetBundleManifestPath`; read `UnityClassRegistration.cpp` to see which
  modules survived. Observed (P14): class 182 (WindZone) stripped, restored by a generated link.xml.
- **Texture compression precedence** (Texture compression in Web > Precedence): Build Profiles
  overrides Player Settings, per-texture overrides beat both, and the value sits in `Library/`.
  Observed (P13): Code Optimization is stored there too.
- **Heap sizing** (Memory in Unity Web > Unity heap; Web Player settings table): Initial 32 MB,
  Geometric growth recommended (0.2, cap 96 MB), Maximum 2048 MB; "for mobile browsers... configure
  the Initial Memory Size to the typical heap usage". Observed (P17): 32 MB grew to 68 to 74 MB at
  startup; 80 MB set: no growth.
- **Frame pacing** (Web performance considerations > Throttling): leave `targetFrameRate` at -1 so
  the browser's render loop paces frames; Unity assumes 60 Hz because it cannot query the refresh
  rate; Safari caps at 60 (e-book). Background tabs update about once per second and `Time.time`
  then lags wall time.
- **WebAssembly 2023 floor** (Prerequisites for WebAssembly 2023): Chrome/Edge 91+, Firefox 89+,
  Safari 16.4+, against Unity's iOS Safari 15+ baseline.
- **Production errors** (Debug production Web builds > Report browser errors; Customize error
  handling): `errorHandler(err, url, line)` in the loader config is called from `window.onerror`;
  return true to suppress Unity's handler, false to pass the error on. Observed (P16): C# exceptions
  reach a collector only through `Application.logMessageReceived` and a `.jslib`.
- **Profiling** (Profile a Web build): development builds, Enable Web Profiling or
  `--player-connection-ip=<ip:port>` in the loader `arguments`, the Profile button only in the
  Default and PWA templates; no Frame Debugger. The Diagnostics Overlay works in release builds; its
  JS memory needs `performance.memory` (Chrome and Edge only). Observed:
  `unityInstance.GetMetricsInfo()` exposes the same numbers without the overlay.
- **WebGL 2 for 3D**: baked GI with non-directional lightmaps only; draw calls cost more on WebGL
  than native, so instancing and batching matter (Web performance considerations).
- **Audio**: clips import as AAC on the Web (Audio in Web); the encoder may alter the first 1024
  samples of a loop (prepend silence, move the loop start in the WAV `smpl` chunk).
- **Native threads need COOP/COEP/CORP** on HTML and JS (Enable native C/C++ multithreading):
  cross-origin isolation constrains embedding, so portals that iframe the game may not allow it
  [added inference in the docs digest].

**Ben Craven (LlE35onVdmQ):** HTTP preload tags for the first bundles [00:13:41]; design the wait
with a splash or how-to video instead of a bare bar [00:14:16]. Observed (P21): a preloaded 0.84 MB
bundle arrived before gameplay start and was downloaded once, at the cost of 0.84 MB more in the
portal-counted window.

**Josh Loveridge (FYsVftoLBP8, 3bu4WZUCGYc):** CDN regional coverage is part of load time
(Australia) [00:15:08] to [00:16:12]; a cutscene hides progressive download (3bu4WZUCGYc
[~00:32:01]). Observed (P22): 250 ms instead of 40 ms latency added 0.8 s to gameplay start.

**Brendan Duncan (3bu4WZUCGYc):** CPU skinning is the WebGL bottleneck for crowds: 30 characters, 7
fps on WebGL vs 30 fps on WebGPU [~00:14:59] to [~00:15:13].

**Cam Ayres (bF_eUuxGEcA):** gate builds on a valid, non-empty scene list [00:04:02] (`AuditWeb`
errors `web.scenes.empty` / `web.scenes.missing`;
`WebReleasePolicyTests.Build_scene_list_is_valid`).

**CrazyGames (portal guides):** measured stack costs (URP +3.6 MB, post +1 MB, TMP +0.7 MB, empty
project 14.7 to 12.5 MB with LTO and size codegen); DPR forced to 1 on iOS and low-memory Android;
test UI at 900x500. Observed (P23): post data off saved 1.61 MB on the demo, more than the portal's
figure.

**Lessons from the baseline's errors (answer B of Y12):** `targetFrameRate = 30` on mobile web
contradicts the Manual (leave -1); "small initial heap with geometric growth" on phones contradicts
it too (Initial = typical usage); "WebGPU experimental in all 6.x" is wrong from 6.6 (supported,
opt-in), while "production-ready in 6.3" is wrong the other way.

## Numbers (full)

| Value                                 | Relative to                                                                                                                                | Source                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 20 / 50 MB, 1,500 files, 250 MB, 20 s | CrazyGames initial download to first `gameplayStart` (mobile homepage / general), file count, total, time to gameplay for external content | CrazyGames                        |
| 30 MB; 29.75 MB                       | studio binary rule; initial payload of a 3D FPS                                                                                            | Loveridge [00:03:29], [~00:31:41] |
| +3.6 / +1 / +0.7 MB                   | URP, URP post-processing, TextMeshPro resources (0.5 MB trimmed)                                                                           | CrazyGames tests                  |
| 2048 MB; 32 MB; 0.2 and 96 MB         | Maximum Memory; Initial Memory default; geometric growth step and cap                                                                      | 6.3 Manual                        |
| 12.71 MB                              | URP template scene, template Web settings (Brotli, Shorter Build Time), wasm 46.3 MB raw                                                   | observed                          |
| 9.84 vs 12.23 MB                      | demo, Disk Size, Brotli vs gzip; wasm 23.0 MB raw                                                                                          | observed                          |
| 173.5 vs 74.9 s                       | same build, Brotli vs gzip compression time                                                                                                | observed                          |
| 9.47 MB, 400 s, 8.1 s                 | release build (Disk Size with LTO): initial download, build time, time to `gameplay_start` at 20 Mbps, 40 ms, CPU x4                       | observed                          |
| 10.08 MB                              | v2 demo (Addressables package, bundle probe, splash off), Disk Size, Brotli                                                                | observed                          |
| -1.61 MB                              | URP renderers' post data off (10.08 to 8.47 MB; `.data` 3.92 to 2.31 MB)                                                                   | observed                          |
| 2.7 MB vs 38 KB                       | splash logo line in the build report (uncompressed) vs the Brotli `.data` change when it was turned off                                    | observed                          |
| 32 to 68-74 MB; 80 MB                 | heap growth during startup from the default Initial Memory; Initial 80 MB: heap constant                                                   | observed                          |
| 60 fps, 1 janked frame                | headless Chrome on the Mac after the first second (`GetMetricsInfo`)                                                                       | observed                          |
| +0.83 s                               | gameplay start at 250 ms vs 40 ms latency (20 Mbps, CPU x4)                                                                                | observed                          |
| 0.99 vs 8.13 s; +0.84 MB              | preloaded vs lazy bundle request time; extra bytes before gameplay start                                                                   | observed                          |
| +0.86 / +1.11 MB, +0.27 MB            | adding WebGPU (Brotli / gzip); adding Addressables 2.9.1                                                                                   | observed                          |
| 390x844 vs 1170x2532                  | phone canvas backing store with the DPR cap vs native DPR 3                                                                                | observed                          |
| 7 to 30 fps                           | 30 skinned characters, WebGL vs WebGPU                                                                                                     | Duncan [~00:15:13]                |
| 48 / 86 Mbps                          | median mobile / broadband speed where load-time gains flatten                                                                              | Craven [00:10:53], [00:11:26]     |
| Chrome 91, Firefox 89, Safari 16.4    | WebAssembly 2023 floor (Unity's iOS baseline: Safari 15)                                                                                   | 6.3 Manual                        |
| 16 textures                           | per shader on many WebGPU platforms (terrain layers)                                                                                       | 6.3 Manual                        |
| 1 GB                                  | Unity Play upload limit                                                                                                                    | 6.3 Manual                        |

## Disagreements and the deciding condition

| Choice                 | Positions                                                                                                                                  | Decide by                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Compression            | Unity, e-book, CrazyGames: Brotli; Poki: Disabled; Manual: gzip for plain HTTP                                                             | who controls the server and whether it is HTTPS; portal rules win on portals            |
| Decompression Fallback | Max: on (itch.io); Manual and e-book: off                                                                                                  | can you set `Content-Encoding`? No (itch.io): on. Yes: off                              |
| Code Optimization      | Manual release preset: Disk Size with LTO; e-book: Disk Size while developing; CrazyGames: Runtime Speed with LTO when performance matters | download-bound (mobile, portals) vs CPU-bound; LTO only for final builds (slow)         |
| WebGPU                 | 6.3 Manual and Duncan (2024, 2026): experimental; 6.6: supported, opt-in                                                                   | editor version, need for compute, audience browsers; always keep WebGL 2                |
| Baked lighting         | Manual: WebGL 2 supports non-directional baked GI; Loveridge: "don't try it"                                                               | scene size and download budget                                                          |
| Forward+               | Duncan 2024: struggles on WebGL; Loveridge 2025: recommended                                                                               | measure on WebGL; adopt freely on WebGPU                                                |
| Texture format         | Unity: dual DXT/ASTC build; CrazyGames: ASTC; Poki: crunched DXT1; Stratton: KTX2/Basis                                                    | audience split desktop vs mobile; Windows has no ASTC                                   |
| Initial Memory Size    | Manual defaults (32 MB, geometric growth) "work well for all desktop use cases"; Manual for mobile: typical heap usage                     | mobile in the audience: measure and set Initial (P17)                                   |
| Player text rendering  | in Unity with shipped fallback fonts vs in HTML over the canvas [added]                                                                    | how many scripts, font size budget, whether the text must be in the game view           |
| Preload tags           | Craven: preload the first bundles                                                                                                          | only bundles needed at gameplay start: preloaded bytes count in the portal window (P21) |
| Exceptions             | Unity: None or cheap with WASM 2023; CrazyGames: Explicitly Thrown unless proven exception-free                                            | with WASM 2023 on, keep Explicitly Thrown                                               |
