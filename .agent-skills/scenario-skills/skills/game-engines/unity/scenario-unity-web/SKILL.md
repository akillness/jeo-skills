---
name: scenario-unity-web
description: "Use when a Unity 6.3 game must run in a browser: 'export to WebGL', Web build settings or Build Profiles, gzip or Brotli, Decompression Fallback, server headers, 'Unable to parse .framework.js.br', build too big or slow to load, itch.io, CrazyGames or Poki limits, Addressables or AssetBundles on the Web, 'Could not produce class with ID', Task.Run freezing the browser, WebGL 2 vs WebGPU, .jslib and SendMessage interop, a page text field that gets no keystrokes, mobile browsers crashing, HTTPS for sensors, hosting and rollout."
license: MIT
---

# Unity Web (web specialist)

Expert level on the Web means the build is judged where players get it: bytes until gameplay starts,
served by the real host with the right headers, loaded in a real browser that reports which graphics
API ran, how big the heap grew, and that the page and the game talk. The stance: the host picks the
compression, the budget is measured to the first playable moment, and nothing counts until a served
build loads headless with zero errors and a screenshot you looked at. Target: Unity 6000.3.21f1, URP
17.3, Chrome headless on macOS. If a sibling skill named here is missing from your available skills,
load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Toolkit:
`ut_env`, `ut_run` (incl. `build(P, "web")`, `run_tests`), `ut_review`, plus this skill's
[`scripts/ut_web.py`](scripts/ut_web.py),
[`scripts/AgentKit/Web/WebJobs.cs`](scripts/AgentKit/Web/WebJobs.cs) and
[`scripts/WebRuntime/`](scripts/WebRuntime/) (bridge, `.jslib`, error reporter, template).

## Stance (the expert delta)

1. **The host decides compression.** Own HTTPS server or CDN: Brotli, fallback off,
   `Content-Encoding` per file, `application/wasm` on every `.wasm*` (6.3 Manual). Plain HTTP: gzip
   (Chrome refused Brotli at a LAN address, `ERR_CONTENT_DECODING_FAILED`, observed; `localhost` is
   exempt). itch.io: Decompression Fallback on (Max O'Didily 8iApGVX--B0 [00:01:40]). Poki:
   Disabled.
2. **Budget bytes to gameplay start.** CrazyGames counts the initial download until the first
   `gameplayStart`: 20 MB for the mobile homepage, 50 MB otherwise, 1,500 files. Deferred content
   must be requested after that moment (network log proves it). Preload tags only for bundles the
   first playable moment needs: they move bytes into the counted window (observed +0.84 MB before
   start).
3. **Load time is the metric; past broadband the binary and CPU dominate.** -25 percent load time
   gave +50 percent sessions (Craven, LlE35onVdmQ [00:08:40]); gains flatten above 86 Mbps
   [00:11:26]. Measure with CPU throttling and latency; hosting coverage is load time (Loveridge,
   FYsVftoLBP8 [00:16:12]). Design the wait: a loading card with how-to text, not a bare bar (Craven
   [00:14:16]), then a tap to play that also unlocks audio.
4. **One thread, one heap, the browser's clock.** Every ThreadPool API is an unrecoverable hang: use
   `Awaitable`, coroutines, `UnityWebRequest` (observed: `Task.Run(...).Result` froze the tab). The
   heap grows from Initial Memory Size and growth can crash on phones: size Initial from a measured
   session (observed 32 MB grew to 68 to 74 MB; set to 80, no growth). Leave `targetFrameRate` at
   -1: Unity cannot query the refresh rate (6.3 Manual).
5. **WebGL 2 ships; WebGPU is for compute and falls back silently.** Experimental in 6.3 to 6.5,
   supported but opt-in from 6.6. Keep WebGL 2 below it and log `SystemInfo.graphicsDeviceType` (a
   plain-HTTP page got WebGL 2 with no error, observed). WebGL 2 skins on the CPU (30 characters: 7
   fps vs 30 on WebGPU, Duncan 3bu4WZUCGYc [~00:15:13]) and takes non-directional lightmaps only.
6. **The page and the game share a narrow contract.** `.jslib` in ES5, strings as heap pointers,
   replies through `makeDynCall` into a static `[MonoPInvokeCallback]`, `SendMessage` with one JSON
   string to an exactly named object. Unity takes page-wide keyboard input by default: a page name
   field received nothing until `WebGLInput.captureAllKeyboardInput = false` (observed). No system
   fonts: CJK and Greek names drew blank while `Font.HasCharacter` said present (observed). Portals
   ignore or rewrite `index.html`, so the bridge lives in `.jslib`.
7. **What ships is not what you set.** Strip Engine Code removes classes only bundles use
   (`Could not produce class with ID 182`, observed; fix: link.xml). Code Optimization and the
   texture subtarget live in `Library/`: a fresh clone reads Shorter Build Time (observed). Safari
   has no IndexedDB in iframes (6.3 Manual): on itch.io, Safari players may reload everything.
8. **Ship like a live service and cut what does not earn its bytes.** Hashed names, previous build
   kept, 5 percent staged rollout (Loveridge [frame 00:23:29]), symbols and an error collector per
   release. "If it only improves your game's visual fidelity by one or two percent... it needs to
   go" [00:11:15]: URP post data cost 1.61 MB here.

## Establish first

Ask once: every host or portal (compression, fallback, page ownership, iframe); audience and browser
floor (WebAssembly 2023 needs Safari 16.4+, Chrome 91+, Firefox 89+, while Unity supports iOS Safari
15; CrazyGames disables Unity on iOS by default); budget in bytes to gameplay start and seconds at a
stated line speed and region; 2D or 3D, URP, lightmaps, skinned crowds; compute need (WebGPU); the
page API and any page text fields; scripts player text can use (fonts); desktop and mobile (dual
DXT/ASTC data); audio (first tap); Unity version. Defaults: WebGL 2 only; own HTTPS + Brotli; 20 MB
portal mobile, 30 MB otherwise (Loveridge [00:03:29]); Explicitly Thrown; WebAssembly 2023 on; Disk
Size while iterating, Disk Size with LTO for release; Maximum Memory 2048 MB, Initial from
measurement; DPR 1 on phones; `targetFrameRate` -1.

## Workflow

1. **Preflight and audit.** `ReadSettings`, `AuditWeb` (scenes, lighting, skinning, stripping,
   splash, post data, imports), `ut_web.scan_hang_apis` (hangs, `targetFrameRate`), `scan_jslib`,
   `package_report`. GATE: zero audit errors; non-empty valid scene list (Cam Ayres bF_eUuxGEcA
   [00:04:02]); every costly package justified.
2. **Settings per host.** `WebJobs.ApplySettings` with a preset (`own-https`, `plain-http`, `itch`,
   `poki`, `crazygames`, `dev`), always passing `code_optimization` and `texture_subtarget`; launch
   with `build_target="WebGL"`. `write_policy` plus `WebReleasePolicyTests` (EditMode) guard CI.
   GATE: readback and 8 policy tests pass.
3. **Interop.** `ut_web.install_runtime(P)`; wire `WebBridge`, `WebLeaderboard`, `WebErrorReporter`
   (full code in procedures P3). GATE: 0 compile errors, scans clean, bridge object named as the
   page calls it.
4. **Build.** `ut_run.build(P, "web", out=...)`. Bundles: `WriteBundleLinkXml` first. GATE:
   Succeeded, file set matches settings, `size_report` recorded, `build_log_report` read (rank
   there, judge by bytes on disk).
5. **Serve and audit headers.** `serve`, `header_audit` locally, then on the real host. GATE: zero
   errors; bytes sent equal bytes on disk.
6. **Load in Chrome.** `browser_check(..., metrics_seconds=8, reload=True)` with the page mock.
   GATE: `ready`, `gameplay_start`, feature events; zero banners, zero unexpected console errors;
   intended `ready.api`; deferred requests after start; heap did not grow on mobile settings; fps
   steady; warm reload fetches no `.data` body (304 allowed); screenshot opened.
7. **Budget and load time.** `budget_check`; throttled load (20 Mbps, 40 ms, CPU x4) and a 250 ms
   run for far regions. GATE: pass with headroom.
8. **Variants.** itch (fallback, zip, iframe host), portal SDK, WebGPU on secure and insecure
   origins, dual DXT/ASTC (`merge_texture_variants`), phone emulation (DPR cap). GATE per variant as
   in 5 to 7.
9. **Release.** Disk Size with LTO, symbols archived, `AGENTWEB_ERROR_URL` or
   `WebErrorReporter.endpoint` set, previous build kept, rollout plan (P12). Handoff packet with
   Verified and Assumed.

## Numbers

| Value                   | Relative to                                                                                    | Source               |
| ----------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| 20 / 50 MB, 1,500 files | CrazyGames initial download to first `gameplayStart` (mobile homepage / general)               | CrazyGames           |
| 30 MB                   | studio binary rule ("table stakes")                                                            | Loveridge [00:03:29] |
| +3.6 / +1 / +0.7 MB     | URP, URP post-processing, TextMeshPro resources                                                | CrazyGames tests     |
| 9.47 MB, 8.1 s          | release demo build (LTO): initial download; time to `gameplay_start` at 20 Mbps, 40 ms, CPU x4 | observed             |
| +0.83 s                 | same load at 250 ms instead of 40 ms latency                                                   | observed             |
| -1.61 MB                | URP renderer post data off (10.08 to 8.47 MB)                                                  | observed             |
| 32 to 68-74 MB          | heap growth from the default Initial Memory Size during startup; 80 MB set: no growth          | observed             |
| 2048 MB                 | Maximum Memory Size; bugs above it before Chrome/Firefox 119                                   | 6.3 Manual           |
| 7 to 30 fps             | 30 skinned characters, WebGL (CPU skinning) vs WebGPU                                          | Duncan [~00:15:13]   |
| 48 / 86 Mbps            | median mobile / broadband speed where gains flatten                                            | Craven [00:10:53]    |

More measured values: [`references/expert-notes.md`](references/expert-notes.md) (Numbers, full).

## Quality gates

- **Measurable:** readback and policy tests pass; audit and scans clean; `BuildReport` Succeeded;
  `header_audit` 0 errors on the real host; `browser_check` ok with the intended API; deferred after
  start; heap flat; errors reach the collector; `budget_check` pass; throttled load under budget.
- **Visual:** canvas screenshot opened: scene rendered, UI legible at 900x500, DPR 1 and a 390 px
  portrait canvas, a line of every script players can type, loading card and banners readable.

## Common mistakes

| Mistake                                        | What it looks like                                                    | Fix                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Quick local server for a compressed build      | `SyntaxError`, "Unable to parse ...framework.js.br"                   | `ut_web.serve` or per-suffix `Content-Encoding`                     |
| Brotli on plain HTTP                           | `ERR_CONTENT_DECODING_FAILED`                                         | HTTPS, or gzip + Allow downloads over HTTP                          |
| `Task.Run`, `HttpClient`, threads, timers      | work never runs; `.Result` freezes the tab                            | `Awaitable`, coroutines, `UnityWebRequest`                          |
| `targetFrameRate = 30` "for mobile"            | Unity times its own loop against an assumed 60 Hz                     | leave -1; throttle only on purpose                                  |
| Small Initial Memory with growth on phones     | heap 32 to 74 MB at startup; crashes when no contiguous block         | Initial = measured peak (`heap_advice`)                             |
| High stripping + bundles                       | `Could not produce class with ID`, component missing                  | `WriteBundleLinkXml`, rebuild                                       |
| Release settings trusted on CI                 | a fresh clone reads Shorter Build Time and the default texture format | set both in every job, or commit a Build Profile                    |
| Page field beside the canvas                   | keystrokes swallowed                                                  | `WebGLInput.captureAllKeyboardInput = false` (`SetKeyboardCapture`) |
| Player names in any script, built-in font      | blank glyphs; `Font.HasCharacter` still true                          | ship fallback fonts or draw names in HTML; screenshot each script   |
| Trusting the Graphics API list or version lore | WebGPU build running WebGL 2; "WebGPU is production-ready in 6.3"     | log the API per origin; 6.3 to 6.5 experimental, 6.6 opt-in         |
| `{{{ }}}` or ES6 in a `.jslib`                 | build fails                                                           | ES5, no macros in comments (`scan_jslib`)                           |
| Page logic in `index.html` for a portal        | missing on CrazyGames, rewritten on Poki                              | `.jslib` or the portal SDK                                          |
| Template defaults shipped                      | Shorter Build Time, Minimal stripping, WASM 2023 off: 46 MB raw wasm  | release preset                                                      |

## Handoffs

- **Receives** from scenario-unity-architecture: code free of hang APIs (scan findings go back);
  scenario-unity-pipeline-automation: Addressables layout, CI, Build Profiles (this skill supplies
  the policy tests, LZ4, deferred loading, link.xml); scenario-unity-mobile: ASTC vs DXT, touch,
  safe areas; scenario-unity-ui: canvas legible at 900x500, DPR 1 and portrait, fallback fonts for
  player text; scenario-unity-rendering-lighting: a Web URP tier (1 to 2 cascades, lean or no post,
  non-directional lightmaps or real-time); scenario-unity-shaders and scenario-unity-vfx:
  WebGPU-safe compute and a WebGL 2 fallback; scenario-unity-performance: frame and memory budgets.
- **Delivers** to scenario-unity-expert and the user: build folders per host, header table or server
  config, `size_report`, `budget_check`, `browser_check` evidence (API, events, bytes before start,
  heap, fps, screenshots), policy file, zip, symbols, Verified and Assumed lists.

## Unity 6.3 notes

- Menus say "Web", code keeps `BuildTarget.WebGL`, `PlayerSettings.WebGL`, `UNITY_WEBGL`,
  `Assets/WebGLTemplates`; no public API creates a Build Profile before 6.5. `WebGLInput` lives in
  `UnityEngine.WebGLModule`, present only in Web player builds: guard it with
  `UNITY_WEBGL && !UNITY_EDITOR`.
- URP template ships Brotli, Shorter Build Time, WebAssembly 2023 off, Minimal stripping (observed);
  WebAssembly 2023 becomes the default in 6.5 (Emscripten 4.0.19; 6.3 reports `3.1.39-git`).
- WebGPU: experimental and URP-only in 6.3; PSO tracing and Microphone arrive in 6.4; supported,
  opt-in, Device Filter and compatibility mode in 6.6.
- The Build Profile's texture compression overrides Player Settings (per-texture overrides beat
  both) and, like Code Optimization, is stored outside ProjectSettings.
- `unityInstance.GetMetricsInfo()` (heap, fps, janked frames) works in release builds without the
  Diagnostics Overlay (whose JS memory reads N/A on Safari and iOS); 6.3 profiles a running Web
  build over IP; the Frame Debugger does not work on the Web.

## References

- [`references/procedures.md`](references/procedures.md): 24 procedures with full code (bridge
  included), live test and recorded result.
- `references/expert-notes.md`: judgment by expert with timestamps, full numbers, disagreement
  table.
- [`references/critique.md`](references/critique.md): the self-review rubric.
- [`references/gui-paths.md`](references/gui-paths.md): the same work through windows and menus.
- [`references/sources.md`](references/sources.md): every source, credentials, timestamps, revision
  history.
- `scripts/ut_web.py`, `scripts/AgentKit/Web/WebJobs.cs`,
  [`scripts/AgentKitOptional/`](scripts/AgentKitOptional/) (Addressables job, EditMode policy
  tests), `scripts/WebRuntime/` (bridge, error reporter, `.jslib`, AgentWeb template).
