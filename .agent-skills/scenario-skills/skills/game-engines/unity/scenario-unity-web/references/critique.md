# Critique rubric (scenario-unity-web): how the agent judges its own Web build

Run this before calling a Web deliverable done. Each line is pass/fail with the evidence named; a
line that could not be checked goes to **Assumed** in the report, never to **Verified**.

## 1. Brief and budget (before any build)

- [ ] Host named per variant (own HTTPS server or CDN, plain HTTP, itch.io, CrazyGames, Poki, Unity
      Play): it decides compression and fallback. Evidence: the preset passed to
      `WebJobs.ApplySettings` and its readback.
- [ ] Budget in bytes to gameplay start, not "total size": portal limit (CrazyGames 20 MB mobile
      homepage / 50 MB, 1,500 files, 250 MB total), or the studio's own (Loveridge: 30 MB binary),
      plus a time budget with a stated line speed. Evidence: `ut_web.budget_check` verdict with
      headroom.
- [ ] Graphics API decided from need: WebGL 2 by default; WebGPU only for compute (VFX Graph, GPU
      skinning, many lights), and on 6.3 labeled experimental with WebGL 2 kept below it.
- [ ] Engine floor measured once (empty or template scene with the final settings): everything above
      it is content. Observed floor here: 12.71 MB for the URP template scene with template defaults
      (Brotli); see procedures for the release-settings floor.
- [ ] Browser floor stated: WebAssembly 2023 needs Chrome 91+, Firefox 89+, Safari 16.4+ (iOS
      16.4+), while Unity supports iOS Safari 15; the AgentWeb template shows an upgrade message
      below the floor (P18).
- [ ] Stack cost listed before content: `ut_web.package_report` (URP about +3.6 MB, URP post about
      +1 MB, TMP resources about +0.7 MB, Input System "significant"); every costly package
      justified or removed, with before/after `size_report` (P23).
- [ ] Desktop and mobile both in scope: dual DXT/ASTC data decided (P19), DPR cap on phones decided
      (P18).
- [ ] Player text: which scripts players can type, and how they render (fallback fonts, subset, or
      HTML overlay); page text fields listed (keyboard capture, P15).

## 2. Settings (read back, never assumed)

- [ ] `WebJobs.ReadSettings` after every change: compression, fallback, exceptions, WASM 2023, code
      optimization, IL2CPP codegen, stripping, hashes, data caching, template, graphics APIs.
- [ ] Release: no Development Build; Code Optimization Disk Size with LTO (or Runtime Speed with LTO
      for a CPU-bound game); never Shorter Build Time (the template default) in a shipped build.
- [ ] Exceptions: Explicitly Thrown (None only for proven exception-free code: any throw stops the
      game); never Full With Stacktrace in release.
- [ ] Fallback off unless the host cannot set headers; if on, the report says why (itch.io).
- [ ] Memory: Maximum 2048 MB unless a desktop-only need is shown; threads off unless COOP/COEP/CORP
      are deployable on every host (portals iframe the game).
- [ ] 6.3 fence: no 6.6-only features promised (WebGPU "production", Device Filter, Progressive
      Asset Loading, WebAssembly64, `AutoStaticsCleanup`). WebGPU status stated by version:
      experimental 6.1 to 6.5, supported and still opt-in from 6.6.
- [ ] Code Optimization and the texture subtarget set in the build job itself (they live in
      `Library/`; a fresh clone reads Shorter Build Time, P13), or carried by a committed Build
      Profile; `WebReleasePolicyTests` pass (8 EditMode tests).
- [ ] Memory: Initial Memory Size set from a measured session on mobile targets (`heap_advice`), not
      left at 32 MB with growth; `Application.targetFrameRate` left at -1 (no "30 for mobile").

## 3. Code (static, before the build)

- [ ] `ut_web.scan_hang_apis(P)`: zero errors in shipped code (Task.Run, Task.Delay, Parallel,
      threads, timers, CTS timeouts, HttpClient/WebClient, sockets, busy-wait on isDone).
      Third-party DLLs are not scanned: say so.
- [ ] `ut_web.scan_jslib(P)`: zero ES6 in `.jslib`/`.jspre`, zero deprecated calls
      (Pointer_stringify, dynCall, unity.Instance, gameInstance).
- [ ] Every `[DllImport("__Internal")]` behind `#if UNITY_WEBGL && !UNITY_EDITOR` with an Editor
      stub (Play mode and tests run).
- [ ] Per-frame allocations reviewed where temporaries grow inside one frame (GC runs only at frame
      end).
- [ ] WebGPU targets: no synchronous GPU readback (use `AsyncGPUReadback`), no `RWBuffer`, no wave
      intrinsics, barriers in uniform flow.
- [ ] Bundles and stripping: every type used only inside AssetBundles or late Addressables content
      preserved (`WriteBundleLinkXml`), and the browser console free of
      `Could not produce class with ID` (P14).
- [ ] `AuditWeb` scene checks read: build scene list valid and non-empty, no directional lightmaps
      for WebGL 2, lightmap megapixels weighed, skinned crowds budgeted (CPU skinning on WebGL 2)
      (P24).

## 4. Build (measured)

- [ ] `AgentBuild` result Succeeded, 0 errors; `result.web` shows the intended compression,
      fallback, code optimization.
- [ ] File set matches the settings: `.br` or `.gz` without fallback, `.unityweb` with it, hashed
      names when hashes are on, `.symbols.json` only when intended.
- [ ] `ut_web.size_report`: initial bytes, wasm raw bytes (engine + code), data bytes, deferred
      bytes, file count; before/after table when a change was made; largest files named.
      `build_log_report` read for ranking, but savings judged by `size_report` (the splash logo was
      2.7 MB in the report and 38 KB on disk, P23).
- [ ] Content deferred past gameplay start is really deferred: requested after the `gameplay_start`
      event in the browser network log.

## 5. Server (measured)

- [ ] `ut_web.header_audit` against the real host (or the local `unity` mode server): zero errors;
      `application/wasm` on every `.wasm*`; `.data.gz` as `application/gzip`; bytes sent equal bytes
      on disk (no double compression).
- [ ] HTTPS in production: Chrome refused Brotli at a plain-HTTP LAN address
      (`ERR_CONTENT_DECODING_FAILED`, observed) and WebGPU, sensors, webcam need a secure context. A
      plain-HTTP host needs gzip AND Allow downloads over HTTP (else StreamingAssets and
      Addressables loads throw "Insecure connection not allowed"). A localhost test proves none of
      this: test at the LAN address or the real host.
- [ ] Cache: `index.html` revalidated (no-cache); hashed build files may be `immutable`; AssetBundle
      URLs keep `must-revalidate` if `cacheControl` is overridden.

## 6. Browser (measured and looked at)

- [ ] `ut_web.browser_check` ok: `ready`, `gameplay_start`, and the feature events (leaderboard
      round trip, page SendMessage) arrive; zero error banners; zero `pageerror`.
- [ ] The graphics API that RAN (`ready.api`) equals the intended one on each tested origin; a
      WebGPU build also shows its WebGL 2 fallback working.
- [ ] Load time to `gameplay_start` under a stated throttle (line speed, latency, CPU slowdown)
      against the time budget, plus a far-region run (250 ms: +0.8 s here, P22); warm reload shows
      `.data` revalidated (304) or served from IndexedDB, not re-downloaded. Safari and iOS on
      iframe portals: assume a full download per visit until a real Safari shows otherwise (P20).
- [ ] Soak: `browser_check(metrics_seconds=...)` heap flat (no growth on the mobile settings), fps
      steady, janked frames counted (P17).
- [ ] Interop with real text: a non-ASCII name round trip (page to C# to page), one screenshot line
      per script players can type (the Font API reported glyphs that drew blank, P15), a page text
      field accepts typing while the game runs.
- [ ] Error path proven: a C# exception and a page error reach the collector (`AGENTWEB_ERROR_URL`
      or `WebErrorReporter.endpoint`) (P16).
- [ ] Preloaded bundles are only those needed at gameplay start (they count in the portal window,
      P21).
- [ ] Screenshot of the canvas opened and judged: scene rendered (not black, not the background
      color only), UI text legible at the canvas size (test 900x500 and DPR 1 for portals), state
      change visible after interop.
- [ ] Mobile: what was tested on a real device, and what was only emulated (Silent Mode audio,
      memory, DPR, sensors cannot be proven headless).

## 7. Release

- [ ] Previous build kept for rollback (never overwrite the live folder in place); staged rollout
      plan when the host supports it (Loveridge: 5 percent, then progressive, automatic rollback).
- [ ] itch.io zip has `index.html` at the root; portal SDK events wired at the right moments
      (`gameplayStart`, ad breaks) and checked in the portal's inspector by a human.
- [ ] Production error capture: Debug Symbols External + `MethodMap.tsv` archived with the build; an
      `errorHandler` in the template that reports and returns false; `WebErrorReporter` forwarding
      C# errors (capped per session).

## Scoring

A Web deliverable is done when sections 2 to 6 pass with evidence. Anything open goes in the
report's **Assumed** list with the reason (no device, no host access, no portal account). Numbers
quoted from sources and not re-measured are labeled as quotes.
