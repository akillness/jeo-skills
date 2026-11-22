# Expert notes: mobile (principles and judgment by source)

Each line: the claim, then the source and timestamp or section. `[added]` marks this skill's own
inference; `observed` marks something measured in Unity 6000.3.21f1 on this Mac on 2026-09-24
(`tests/code/unity-mobile/`, results in `archive/tests/unity-mobile/live_results.jsonl`). Full
source list with credentials: `sources.md`.

## 1. Unity mobile, XR and web optimization e-book (Unity 6 edition, Unity Accelerate Solutions)

- Budget about 65% of the frame so the SoC can cool between frames: about 22 ms at 30 fps and 11 ms
  at 60 fps; short peaks (cutscenes, loading) are fine, sustained play is not (§ Account for device
  temperature).
- Profile in short bursts and let the device cool 10 to 15 minutes between sessions, or throttling
  masquerades as a regression (§ Account for device temperature).
- Assume Vsync is on for mobile, XR and web even if the Quality setting says otherwise: a missed
  refresh holds the frame, so the rate halves instead of degrading smoothly (§ Vsync). The Quality
  inspector confirms it: "VSync Count 'Every V Blank' is ignored on Android" (Unity tutorial,
  2J0kDtUGlrY [frame 00:10:28]).
- 30 fps is Unity's mobile default; change `Application.targetFrameRate` per context (menus lower)
  (§ Choose the right frame rate).
- CPU vs GPU bound from the Timeline: `Gfx.WaitForCommands` = render thread waits on the main
  thread; frequent `Gfx.WaitForPresent` = main thread waits on the GPU (§ Determine if you are
  GPU-bound or CPU-bound).
- Textures: lower Max Size first (non-destructive), keep Read/Write off (CPU plus GPU copy), no
  mipmaps for constant-size UI and sprites; the same model with uncompressed textures used about 26x
  the memory (§ Import textures correctly, § Compress textures).
- Mesh compression shrinks disk, not runtime memory (§ Adjust mesh import settings).
- Each enabled camera can cost up to 1 ms CPU on low-end mobile; when a full-screen UI covers the
  scene, disable the 3D camera and hidden canvases and drop `targetFrameRate` (§ Limit use of
  cameras, § When using a fullscreen UI).
- Dynamic batching only with meshes under 300 vertices and 900 vertex attributes;
  `Renderer.material` clones and breaks batches; GPU Resident Drawer needs Forward+, a compute API
  that is not GLES, Mesh Renderers, BatchRendererGroup Variants = Keep All (§ Use draw call
  batching, § GPU Resident Drawer).
- Forward is the default recommendation for mobile; Forward+ for many realtime lights; Deferred for
  scenes with many dynamic lights; MSAA only in Forward and Forward+ (§ Graphics and GPU
  optimization, rendering path table).
- UGUI: split canvases by update rate, hide with the Canvas component not the GameObject,
  GraphicRaycaster only on interactive canvases, Raycast Target off elsewhere, no nested Layout
  Groups (§ UGUI performance optimization tips).
- Audio: WAV sources, mono for 3D, at most 22,050 Hz for SFX, Streaming only for large clips (200 KB
  overhead) (§ Audio). Load type by clip size: under 200 KB Decompress On Load or Compressed In
  Memory with ADPCM (fixed 3.5:1); 200 KB and up Compressed In Memory when memory matters,
  Decompress On Load when CPU does; over 350 to 400 KB Streaming; Vorbis for most sounds, ADPCM for
  short frequent ones (§ Choose the proper Load Type). This skill reads "clip size" as the source
  file size [added]. Observed (6000.3.21f1): a 3.4 MB PCM music loop imported at 57 KB as Vorbis
  Streaming, a 258 KB dialog line at 5 KB as Vorbis, a 52 KB stereo SFX at 3.8 KB as mono ADPCM
  22,050 Hz (synthetic sine tones: the direction holds, the ratios do not transfer to real audio);
  `Profiler.GetRuntimeMemorySizeLong(AudioClip)` read about 0.6 KB for every clip in the Editor, so
  the importer's Imported Size (`compSize`) is the usable number.
- Mesh import: Read/Write doubles memory; mesh compression shrinks disk, not runtime memory (§
  Adjust mesh import settings). Observed: a generated OBJ imported with Read/Write off by default in
  6000.3.21f1.
- Outdated in the e-book: "Adaptive Performance only works for Samsung devices" (the 6.3 Manual
  covers Android providers generally) and PVRTC for A7 (the 6.3 Manual gives ETC/ETC2 on A7, ASTC
  from A8; PVRTC is deprecated in 6.1, removed in 6.4).

## 2. Unity 6.3 Manual: texture formats, URP performance, Adaptive Performance

- ASTC is the default for LDR RGB(A) on iOS A8+ and GLES 3.1 / Vulkan Android; ASTC trades quality
  for size per texture from 8 bpp (4x4) to 0.89 bpp (12x12) (§ iOS and tvOS, § Android).
- "For older Android devices that don't support the ASTC format, the texture is decompressed into an
  uncompressed RGBA 32-bit format." Android ASTC floor: Adreno 4xx, Mali T624, Tegra K1, PowerVR
  GX6250 (§ Android).
- Android HDR: only ASTC HDR is compressed (Vulkan or `GL_KHR_texture_compression_astc_hdr`);
  fallback RGB9e5 (no alpha) or RGBA Half (2x memory) (§ Android).
- For Google Play, use texture compression targeting in an AAB instead of per-format builds (§
  Android).
- Observed (6000.3.21f1, Android default format ASTC): LDR textures with no override resolve to
  ASTC_6x6 on Android and iOS, so "no override" is not by itself a problem; an HDR `.hdr` texture
  with no override imported as **ETC2_RGBA8** on Android and ASTC_6x6 (LDR) on iOS: the HDR range is
  lost silently until an ASTC HDR override is set. An RGBA32 override on a 1024 px texture imported
  at 5,462 KB (with mips) vs 612 KB as ASTC 6x6; ASTC 8x8 at 1024 px: 342 KB; ASTC 4x4 at 512 px
  without mips: 257 KB (quality costs memory). A 600x400 Default texture imported at 512x512 (NPOT
  scale To Nearest).
- URP on mobile: Depth Priming Mode **Disabled** (Auto or Forced is for PC and console); Depth and
  Opaque textures off unless sampled; HDR Precision 32 Bit if HDR is needed; Store Actions Auto or
  Discard on low-end; Additional Lights Disabled or Per Vertex (Forward); soft shadows off; LOD
  Cross Fade off on low-end (alpha test); Native RenderPass on for Vulkan, Metal, DX12; Depth
  Texture Mode After Transparents; Intermediate Texture Auto, then confirm in the Frame Debugger (§
  Configure for better performance in URP).
- 6.3 URP asset reference adds: Depth Priming "Auto ... isn't supported on Android, iOS and Apple
  TV" and "isn't supported ... at runtime on mobile devices that use tile-based deferred rendering
  (TBDR)"; soft shadows have "High impact on platforms that use tile-based rendering"; "when run on
  a tiled GPU with no post-processing anti-aliasing or custom render features in use, MSAA is a
  cheaper option than other anti-aliasing types"; Native RenderPass "has no effect on OpenGL ES"
  (`sources/docs/rendering-lighting__manual-6000-3-urp-asset-renderer-gpu-stp-aa.md`).
- Deferred on tile GPUs [added from source]: URP 17.3's `DeferredLights` sets
  `UseFramebufferFetch = useNativeRenderPass` (`Runtime/DeferredLights.cs`, line 294), so the
  G-buffer stays in tile memory only with Native RenderPass; without it every G-buffer target
  round-trips through memory. MSAA does not work with Deferred; Rendering Layers add a G-buffer
  target.
- Adaptive Performance: automatic performance control plus a `targetFrameRate` is the recommended
  setup; automatic and manual modes exist only on Android providers and in the Device Simulator, all
  other providers use system control; manual CPU/GPU levels do nothing while throttling and the OS
  can take control back (§ CPU and GPU performance control). In 6.3 it is a core engine feature
  (`UnityEngine.AdaptivePerformance`; the 6.0.0 package only carries samples: observed in its
  package.json). The runtime wiring in `MobileTierDirector` compiled against it and ran in a
  PlayMode test: `Holder.Instance` reported Adaptive Performance inactive in the Editor without a
  provider (observed).
- Doc sample policy: lodBias 1 at NoWarning, 0.75 at ThrottlingImminent with temperatureLevel > 0.8,
  0.5 at Throttling (§ Track thermal and power states).
- Bottleneck logic uses `Application.targetFrameRate`, `QualitySettings` and `FrameTiming`; lowering
  render resolution helps GPU-bound apps a lot and CPU-bound apps little (§ Identify performance
  bottlenecks). So the thermal policy lowers URP render scale only when the bottleneck is GPU (or
  unknown); the 0.85 and 0.7 steps and the 0.7 floor are [added]. Observed: right after
  `QualitySettings.SetQualityLevel`, `GraphicsSettings.currentRenderPipeline` still returned the
  previous level's asset in that frame, while `QualitySettings.renderPipeline` returned the new one;
  a director that cached its base scale from the former would have written one tier's scale into
  another.

## 3. Unity 6.3 Manual: Android build and Google Play

- Google Play needs an AAB; Unity builds APK by default (§ Publishing format). Base module under 200
  MB; texture compression targeting shrinks the base by moving first-scene textures into the
  install-time `UnityTextureCompressionsAssetPack` (§ Texture compression targeting).
- "Unity doesn't store keystores and key passwords on disk for security reasons. This means that you
  need to re-enter key passwords each time you restart the Unity Editor." (§ Application signing).
  Observed: after a successful signed batch build, a new batch process reports the custom-keystore
  flag, path and alias kept and both passwords empty; a build in that state fails in 18 s with
  "UnityException: Can not sign the application / Unable to sign the application; please provide
  passwords!". Also observed: `BuildReport.summary.totalSize` reported 789.8 MB for a 53.9 MB AAB;
  bundletool's `get-size total` gave 28.9 MB (the per-device download), base module 27.4 MB
  compressed, debug symbols 19.5 MB in `BUNDLE-METADATA`.
- "Make sure Development Build setting is disabled as otherwise the application upload might fail."
  ARM64 requires IL2CPP (§ Android App Bundle, § 64-bit Architecture).
- Symbols are embedded only in AABs; Play never symbolicates crashes received before the symbols
  upload; `DebugSymbolFormat.LegacyExtensions` for stores that need `.so` (§ Android symbols). API:
  `UnityEditor.Android.UserBuildSettings.DebugSymbols.level` / `.format` with the enums in
  `Unity.Android.Types` (compiled under `UNITY_ANDROID`: observed).
- Prefer `AndroidProjectFilesModifier` over `IPostGenerateGradleAndroidProject` (post-generate edits
  break the incremental pipeline) (§ Incremental build pipeline). The modifier edits custom modules
  only (§ The build process, Note). Observed: `AndroidProjectFiles.UnityLibraryManifest` does not
  compile against 6000.3.21f1 (CS1061), so the main manifest is not reachable from a modifier;
  LevelPlay 9.5.1 itself adds `ACCESS_NETWORK_STATE`, the AdMob app id and, when Declare AD_ID
  Permission is on, `AD_ID` from an `IPostGenerateGradleAndroidProject` hook (read in its source):
  after changing those settings, clean-build and check the permissions of the built bundle.
- Play Asset Delivery is Google Play and AAB only; Unity does not support Play Feature Delivery;
  install-time packs count toward the install, fast-follow and on-demand do not block it (§ Play
  Asset Delivery; delivery modes per Google [added]). Observed: both Unity-generated packs
  (`UnityTextureCompressionsAssetPack`, `UnityDataAssetPack`) are install-time; the delivery mode is
  readable as a string in each pack's proto manifest.
- Observed (the 6000.3.21f1 AAB): every native library (`libunity`, `libil2cpp`, `libmain`,
  `libgame`, `lib_burst_generated`, `libc++_shared`) has PT_LOAD alignment 0x4000, so the engine
  side of 16 KB page support is done; third-party `.so` plug-ins are what to check (version deltas §
  12). The release manifest carries no `debuggable` attribute.
- Unity calls `Activity.reportFullyDrawn` before the first scene's Awake; call
  `DiagnosticsReporting.CallReportFullyDrawn` yourself on the truly interactive frame (only the
  first call counts) (§ Optimize application startup times).
- `AndroidGame.SetGameState` disables Unity's automatic game-state hints entirely;
  `AndroidGame.Automatic.SetGameState` only overrides the mode (Android 13+) (§ Game state hinting).
- Leave thread affinity and priority at defaults unless targeting specific devices (§ Android thread
  configuration).
- Version facts (`sources/unity-version-deltas.md` § 12): 6.3 supports API 25+ and can target 35 and
  36; Google Play requires target API 36 for new apps and updates since 2026-08-31; 6000.3.17f1 to
  25f1 use Gradle 9.1.0 / AGP 9.0.0 (old custom templates need a namespace and
  `proguard-android-optimize.txt`); 6.5 raises the minimum to API 26; GameActivity is the default
  entry point (observed: `entry` = GameActivity). Observed on a fresh clone of the bundled URP
  template: Android already on IL2CPP + ARM64 with min API 25, but Target API Automatic, APK output
  (Build App Bundle off) and a placeholder package id; `MobileBuild.AuditPlayerSettings` flags all
  three.

## 4. Unity 6.3 Manual: iOS build, Xcode project, privacy manifest

- Unity generates an Xcode project; Xcode compiles IL2CPP C++ and signs; only macOS does the second
  step (§ How Unity builds iOS applications).
- Append deletes the Xcode root, `Data` and `Libraries` and keeps only `Classes`, and only for
  projects from the same Unity iOS version; Replace wipes everything (§ Replace and append mode).
  Never edit `Data`/`Libraries`; use `Assets/Plugins/iOS` or a `PBXProject` post-process.
- `GetUnityMainTargetGuid()` for app settings (Unity-iPhone), `GetUnityFrameworkTargetGuid()` for
  runtime and plug-in links; On-Demand Resources need `Data` in the app target (§ Project targets, §
  Data folder).
- Command-line build settings need target suffixes (`PRODUCT_NAME_APP`, `OTHER_LDFLAGS_FRAMEWORK`)
  or they hit every target (§ Specify build settings for specific targets).
- Privacy: C# `File`/`Directory` `GetCreationTime`/`GetLastAccessTime`/`GetLastWriteTime` (and
  `FileInfo`/`DirectoryInfo` properties, `Utc` variants) need a declared File timestamp reason in
  your own `Assets/Plugins/PrivacyInfo.xcprivacy`; Unity declares its engine reasons (0A2A.1,
  C617.1, CA92.1 for PlayerPrefs, 35F9.1, E174.1) automatically; every third-party SDK must ship its
  own manifest (§ Apple's privacy manifest policy requirements).
- Observed (6000.3.21f1, three exports): Unity's template
  (`PlaybackEngines/iOSSupport/Tools/XCode/PrivacyInfo.xcprivacy`) declares FileTimestamp
  `0A2A.1, C617.1`; a project manifest declaring FileTimestamp `C617.1` alone made the consolidated
  `UnityFramework/PrivacyInfo.xcprivacy` read `C617.1` only. A category you declare replaces Unity's
  reasons for it, so declare the union (point de vigilance for any SDK manifest merged the same way
  [added]).
- Size levers: texture compression, Strip Engine Code, Script Call Optimization "Fast but no
  exceptions", API Compatibility .NET Standard, higher managed stripping (with testing) (§ Reduce
  the build size). OTA download limit 200 MB, keep a margin; App Store encryption makes the binary
  less compressible (§ Release build).
- Remote profiling needs outbound ports 54998 to 55511 (§ Collecting performance data).
- Version facts (deltas § 12, § 14 item 20): the 6.3 Manual says Xcode 16 or later, but App Store
  Connect requires Xcode 26 with the iOS 26 SDK since 2026-04-28 (this Mac: Xcode 26.6); 6.4 moves
  runtime libraries into `UnityRuntime.framework` (breaks post-process scripts that touch
  `Libraries/`).

## 5. Input System 1.20 docs: touch, on-screen controls, safe area, Device Simulator

- "Don't use `Touchscreen` for polling. If you read out touch state from `Touchscreen` directly
  inside of the `Update` or `FixedUpdate` methods, your application misses changes in touch state."
  Use `EnhancedTouch.Touch.activeTouches` after `EnhancedTouchSupport.Enable()` (§ Touch polling).
- One action on `<Touchscreen>/touch*/press` needs the Pass-Through type to get a callback per touch
  (§ Get input from multiple touches).
- Observed (Input System 1.20 source and PlayMode test): the on-screen controls' virtual Gamepad is
  added from managed code (`InputDevice.native` false) with the usage "OnScreen", so "hide the touch
  HUD when a gamepad connects" must exclude the "OnScreen" usage (`TouchControlsVisibility`) or it
  fires on the HUD itself (a trap the Y11 grade noted in a generalist answer).
- On-screen controls create one virtual device per referenced device type; `PlayerInput`
  auto-switching between touch and the virtual gamepad jitters the stick: Use Isolated Input Actions
  (§ On-screen controls, § Isolate stick controls).
- The doc says Movement Range "50 means 25 px in each direction". Observed contradiction: Input
  System 1.20's `OnScreenStick` clamps with `Vector2.ClampMagnitude(delta, movementRange)` and sends
  `delta / movementRange`, so movementRange is a **radius**: a 25-unit drag with range 50 sends 0.5
  raw, and gameplay reads 0.46875 after the Gamepad's default stick deadzone (0.125 to 0.925)
  (PlayMode test `OnScreenStickMovementRangeIsARadius`).
- `Screen.safeArea` is in pixels, bottom-left origin, relative to the Player window; with
  `renderOutsideSafeArea` off, Unity shrinks the window and safeArea equals the full rect (§
  Screen.safeArea). The doc's UI Toolkit flip `Screen.height - Screen.safeArea.y` lands on the
  bottom edge; the top is `Screen.height - safeArea.yMax` (EditMode test `UiToolkitFlipUsesYMax`).
- Device Simulator: single finger, Play mode only, no performance, no rendering capability, no
  native plug-ins, no platform defines; focusing a Game view disables it (§ Device Simulator
  introduction). `UnityEngine.Device.Screen` returns the simulator's values in the Editor (compiled
  and used by `SafeAreaFitter`: observed).

## 6. LevelPlay 9 and IAP 5 docs (docs.unity.com)

- LevelPlay: register `OnInitSuccess`/`OnInitFailed` before `LevelPlay.Init`, create ad objects only
  after success, check `IsAdReady()` and static `IsPlacementCapped` before `ShowAd`; `OnAdRewarded`
  may arrive after `OnAdClosed`: grant there anyway (§ Step 2, § Check Ad is Ready, § Reward the
  User).
- Resolve Android dependencies after every Network Manager change, or enable Custom Main Gradle
  Template with "Patch mainTemplate.gradle"; `AD_ID` permission for API 33+; `SKAdNetworkItems`
  automatic on fresh 9.1.0+ installs (§ Step 3, § Step 4).
- IAP 5: `OnPurchasePending` can fire any time and again after a crash: de-duplicate; always
  `ConfirmPurchase` (Google refunds unacknowledged purchases after three days); a `FailedOrder` from
  `OnPurchaseConfirmed` means retry with the kept `PendingOrder`, never grant again; consumables
  must be persisted server side (§ Process purchases, § Handle a failed confirmation).
- Google Play restore can silently omit purchases offline with an expired product cache (5.4.1 known
  limitation, console warning only): never revoke on an empty fetch without checking
  `OnProductsFetchFailed` and `OnStoreDisconnected` (§ Restore purchases).
- Read from the installed IAP 5.4.3 source (observed): `StoreController` events `OnStoreConnected`,
  `OnStoreDisconnected`, `OnProductsFetched`, `OnProductsFetchFailed`, `OnPurchasesFetched`,
  `OnPurchasesFetchFailed`, `OnPurchasePending`, `OnPurchaseConfirmed(Order)`,
  `OnPurchaseFailed(FailedOrder)`, `OnPurchaseDeferred`; `ConfirmPurchase` fails fast with a
  `FailedOrder` when the pending order's `TransactionID` is empty or the store is disconnected; the
  `ConfirmedOrder` raised right after confirming carries the pending order's `Info`
  (`ConfirmOrderUseCase`), but `IOrderInfo` documents that confirmed consumables fetched later have
  an empty `TransactionID`: dedupe on the pending order's id. The 5.4.3 changelog: confirming an
  order Google already acknowledged now returns `FailedOrder(DuplicateTransaction)` (treat as done,
  not as a retry), and `FetchPurchases`/`RestoreTransactions` now return purchases of never-fetched
  products as unknown products instead of dropping them.
- StoreKit 2 cuts iOS purchase data to SDKs that read the StoreKit 1 receipt: pass
  `Order.Info.Apple.jwsRepresentation` and verify with a device purchase (§ Check third-party
  analytics and attribution SDKs).
- Apple requires a Restore Purchases button (§ Apple platforms). IAP 5.3+ ships an
  `in-app-purchases` skill installable to Claude Code from Project Settings > Services > In-App
  Purchasing (§ AI skill).
- Validation (§ Validation methods; Unity, szS2KMxZsl4 [00:08:00], [00:08:31]): Apple receipts
  arrive validated by StoreKit 2; Google receipts need `CrossPlatformValidator` with the obfuscated
  license key, or a server (recommended for everything, essential for server-granted currency). Read
  from the 5.4.3 source: `CrossPlatformValidator(byte[] googlePublicKey, string googleBundleId)` in
  `UnityEngine.Purchasing.Security`, `Validate(string unityIAPReceipt)` on `order.Info.Receipt`;
  `ProductMetadata.localizedPriceString` is the store's price text (szS2KMxZsl4 [00:06:04]: prices
  come localized from the store).
- LevelPlay 9.5.1 privacy, read from its source: `LevelPlayPrivacySettings.SetGDPRConsent(bool)`,
  `SetGDPRConsents(Dictionary<string,bool>)`, `SetCCPA(bool)`, `SetCOPPA(bool)`;
  `LevelPlay.SetConsent(bool)` is `[Obsolete]`. The docs ask for "the regulation (privacy) methods"
  on iOS (§ Step 4) and IAP 5.4 processes Developer Data under the `UnityConsent` module. Setting
  the flags before `LevelPlay.Init` so the first request carries them is [added].
- Version conflict (deltas § 1.3, § 12): 6000.3.21f1's manifest defaults are IAP 4.15.1 and
  LevelPlay 8.10.1 while the docs and the live Manual are IAP 5.4.3 and LevelPlay 9.5.1: add
  explicit versions before writing code.

## 7. Videos

### Unity Android team and partner engineering: Reducing ANRs (Unite 2024, pezwIhA0e04)

- An ANR is the Android main thread blocked, not Unity's; Unity keeps rendering while input stops
  [00:03:11], [00:04:18].
- "The majority of ANRs that I see are when the app is in the background": `OnApplicationPause` work
  (saves, analytics) runs in the Android onPause window; do it earlier [00:14:19], [00:27:24].
- Initialize SDKs asynchronously and staggered by milestone, not all at boot [00:25:12], [00:26:18].
- Read signatures: `nativePollOnce` means look below it; pause frames = your handlers; Unity
  SendMessage = a JNI SDK; Binder = a native plug-in; WebView = heavy ad content, not the SDK itself
  [00:13:13] to [00:19:19].
- Housekeeping (latest LTS patch, updated SDKs, fewer logs, breadcrumbs) took a live game from about
  3.5% to 0.4% ANR rate; ship symbols or nothing is attributable [00:10:26], [00:38:53].
- The onPause timing fix (2021.3.34, 2022.3.16, Unity 6) gave customers 20 to 40% fewer ANRs;
  ApplicationExitInfo from C# reports the previous exit reason with a 128-byte state summary
  [00:37:45], [00:42:13].
- Exclude low-end devices in Play Console when they bring many ANRs and little revenue [00:29:02].
  ANR timeout 5 s typical, 10 s on some Samsung devices [00:02:01].

### Unity (developer advocacy with the IAP team): Update to IAP 5 (szS2KMxZsl4, June 2026)

- Subscribe to every StoreController event before `Connect()` [00:04:04].
- On a few minor iOS versions recovered purchases do not fire `OnPurchasePending`: process pending
  orders from `OnPurchasesFetched` too [00:07:27].
- Two dedupe layers: an in-session transaction ID set plus a server check [00:10:32], [00:11:05];
  the video adds the ID only on confirm, so this skill adds an in-flight set checked before the
  grant [added].
- "Grant first, and then confirm after" [00:11:38]; reset the in-progress flag on failure and on
  deferral (Ask to Buy, SCA), which may be the last event [00:12:43], [00:13:15].
- Purchase only fetched `Product` objects: the string overload buys an unfetched product as an
  unknown type [00:09:28].
- `FetchProducts` returns localized titles, descriptions and prices [00:06:04]; if `FetchPurchases`
  fails, pending orders are retried on the next launch [00:08:00].

### Input System team: Prototype mobile games faster (Unite 2024, ptvjumIHxYg)

- Bind gameplay to gamepad actions; on-screen controls then need zero gameplay code [00:22:13],
  [00:33:47].
- "Our thumbs are not going to grow extra long": Canvas Scaler Constant Physical Size for thumb
  controls [00:20:29].
- OnScreenStick with Exact Position With Dynamic Origin, Movement Range 25 [00:22:13] (radius
  semantics, see § 5).
- Sensors are off by default; tilt = `Quaternion.Inverse(reference) * current` applied to
  `Vector3.up`, reference captured from the first valid sample [00:26:17], [00:30:46].

### LlamAcademy (Chris Kurhan, shipped Llama Survival): floating joystick (MKnLPA5hnPA), releasing on Google Play (GTaXWgKz0e8), top 5 optimizations (7ioIHn1tmIM)

- Track one movement finger, left-half activation, clamp the start so the ring stays on screen,
  normalize to -1..1 [00:07:31] to [00:10:52]; his math needs Constant Pixel Size [00:03:38] (this
  skill converts to canvas space instead [added]).
- Google refuses Unity's debug keystore; Unity forgets keystore passwords per Editor session; a
  duplicate version code fails only after the upload; free can never become paid; an internal-track
  upload unblocks IAP product setup (GTaXWgKz0e8 [00:06:24], [00:06:50], [00:09:39], [00:10:53]).
- Managed stripping Minimal to start, raise it only in a size pass with device tests (GTaXWgKz0e8
  [00:08:28]).
- Profile first; draw calls, CPU skinning and UI rebuilds were his phone costs; an Animator on a
  13-level UI ran a static menu at 10 fps; one texture per canvas cut 30 to 40 draw calls to 1
  (7ioIHn1tmIM [00:11:04], [00:12:36]).

### Unity Unite Now 2020: adaptive UI with the Device Simulator (Chema Damak, PLQ4ywB13eg)

- Anchors and pivots from the artist's intent; one safe-area panel parenting the HUD, re-applied on
  resolution and orientation change [00:06:42] to [00:13:06].
- Game full screen with the UI in a safe-area panel is the usual choice; "Render outside safe area"
  off is the alternative [00:10:53].
- Simulator settings do not change Player Settings [00:03:59]; test UI states from editor tooling,
  not by playing [00:14:14].

### Unity: Adaptive Performance thermal scaling (d5O4Uw6gPBI, 2021)

- React before the OS throttles: lower LOD bias, shadow distance or texture mips over a long session
  [00:00:34]; every scaler needs a max level so visuals never collapse [00:06:45]; simulate thermal
  states instead of heating devices [00:04:21]. Samsung framing superseded in 6.3.

### Unity Enterprise Support: Optimizing mobile applications (Unite Europe 2016, Mark Harkness and Ian Dundore, j4YAY36xjwE)

- Enforce import rules in an `AssetPostprocessor`; Read/Write doubles texture memory [00:19:07],
  [00:20:18].
- The managed heap only grows; 1 KB per frame is 3.6 MB per minute of churn [00:24:44], [00:25:18].
- Resources folder index and first-scene `Awake` run under the splash screen [00:04:59], [00:33:59];
  thousands of Resources files cost hundreds of ms on slow devices [00:33:59]. Native tools where
  the Unity Profiler is blind: Xcode Instruments (best), Snapdragon Profiler [00:02:29], [00:03:02].
  Tool specifics are 2016-era.

### GameDevLuuk: texture build size 230 MB to 3.7 MB (j0DN9P8e7dc, 2020)

- Measure from the Build Report, fix the biggest entry, repeat; lower Max Size until the asset blurs
  at gameplay scale [00:01:34], [00:04:58]. Crunch saves download and disk, not GPU memory, and does
  not apply to ASTC [added; the Unity tutorial's ASTC texture kept its 0.6 MB with crunch ticked,
  2J0kDtUGlrY [frame 00:26:18]].

### Unity tutorial team: Web, XR and mobile optimization walkthrough (2J0kDtUGlrY, 6000.0.9f1)

- A PC Quality level and URP asset can be active on an Android target: switch first [frame
  00:10:28]. Observed here too: a batch editor launched with `-buildTarget Android` reported Quality
  level "PC" and `PC_RPAsset`.
- Judge p95 and max, not the mean: the video declared success at a mean of 8.89 ms with a max of
  17.40 ms against 11.1 ms [frame 00:39:31].
- Texture Max Size halving quarters memory: 4096 ASTC 9.5 MB, 2048 2.4 MB, 1024 0.6 MB [frame
  00:14:11].

### Creauctopus (8 Android games, about 3M installs): monetization design (ILv7GzDgteQ, 2025)

- Nothing monetized in the first 10 to 15 minutes; interstitials every 3 minutes, the first after a
  milestone; offers when the player is stuck; rewarded video is the best ad [00:01:58], [00:04:46],
  [00:09:00]. Heuristics from one developer, not measured data.

### YT Code Master: LevelPlay mediation end to end (GvIpY8yE4UY, Feb 2026) and Coco Code: publish on Google Play (UXl_C3ZnRLc)

- Prefer bidding; Force Resolve after every adapter change; register test devices; remove the
  integration validation call before release (GvIpY8yE4UY [00:01:06], [00:42:42], [00:44:32]). Its
  minimum API 23 is below 6.3's floor (25).
- Play Console checklist order and "promote the tested internal release" (UXl_C3ZnRLc [00:01:21],
  [00:13:33]); its "Create symbols: Public" is the pre-6.x setting.

## 8. Where sources disagree (deciding condition)

| Question                         | Option A                                                             | Option B                                                   | Decide by                                                                                |
| -------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Frame budget                     | full 1000/fps (2J0kDtUGlrY declared success at 8.89 ms mean of 11.1) | 65% sustained (e-book)                                     | phones and standalone XR throttle: 65%, judged on p95 and max in a device build          |
| Where to profile                 | Editor Play mode (walkthrough video)                                 | development player on the lowest device (e-book, ANR talk) | Editor for relative A/B during iteration; verdicts only from devices                     |
| Canvas Scaler for thumb controls | Constant Physical Size (Input System team)                           | Constant Pixel Size (LlamAcademy's math)                   | physical size wins; convert finger positions to canvas space                             |
| Stick                            | `OnScreenStick` (zero code, gamepad parity)                          | custom EnhancedTouch stick                                 | custom activation zones, clamping or per-finger logic                                    |
| Safe area                        | Render outside safe area off                                         | full screen game + safe-area panel                         | whether the world should run under the notch (usually the panel)                         |
| Texture format                   | ASTC only                                                            | ETC2 fallback or AAB targeting                             | min-spec GPU list; Play: AAB texture compression targeting                               |
| POT                              | "most important step" (GameDevLuuk)                                  | not needed for ASTC (6.3 Manual)                           | the format: DXT/BC multiples of 4, ETC1/PVRTC POT, ASTC none                             |
| Mipmaps on 3D                    | off to save a third (Unite 2016)                                     | keep for 3D (e-book)                                       | memory-bound vs GPU (bandwidth) bound                                                    |
| Adaptive Performance scope       | Samsung only (e-book, 2021 video)                                    | Android providers, system control elsewhere (6.3 Manual)   | Unity version: trust the 6.3 Manual                                                      |
| Purchase granting                | server grant, authoritative economy                                  | client grant                                               | a backend exists and the currency has value; client-only needs the in-flight set         |
| Low-end devices                  | exclude in Play Console                                              | keep with thermal scalers                                  | revenue per device segment vs its ANR share                                              |
| Thermal lever                    | render scale                                                         | lodBias, shadow distance, texture mips                     | the bottleneck: resolution for GPU-bound, LOD and CPU work for CPU-bound (6.3 Manual)    |
| Small audio clips                | Decompress On Load (CPU cheapest at runtime)                         | Compressed In Memory + ADPCM (3.5:1)                       | memory vs CPU priority of the project (e-book)                                           |
| Import rules                     | Presets (Preset Manager, GUI)                                        | `AssetPostprocessor` in code                               | agent-maintained projects: code, reviewable and testable; artist-owned projects: presets |
