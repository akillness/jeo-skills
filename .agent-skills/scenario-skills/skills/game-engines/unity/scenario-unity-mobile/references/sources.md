# Sources (scenario-unity-mobile)

Distilled notes live in `notes/mobile/` (project root); saved docs in `sources/docs/mobile__*.md`;
version facts in `sources/unity-version-deltas.md` (authoritative for 6.3 and 6.4 to 6.6).
Precedence when sources disagree: the installed editor (6000.3.21f1, observed) beats the 6.3 Manual,
which beats package docs for other versions, which beat videos.

## Official documentation

| Source                                                                                            | Who                                                                                        | URL                                                                                         | Best for                                                                                                                                                                                     | Where                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Optimize your game performance for mobile, XR, and the web (Unity 6 e-book, 2024)                 | Unity Accelerate Solutions                                                                 | https://unity.com/resources/mobile-xr-web-game-performance-optimization-unity-6             | 65% thermal budget, vsync rule, profiling loop, import settings, batching thresholds, UGUI and audio rules                                                                                   | § Account for device temperature; § Vsync; § Import textures correctly; § Use draw call batching; § UGUI |
| Unity 6.3 Manual: texture format by platform, URP performance, Adaptive Performance               | Unity                                                                                      | https://docs.unity3d.com/6000.3/Documentation/Manual/texture-choose-format-by-platform.html | ASTC rules and RGBA32 fallback, URP mobile switches (Depth Priming Disabled), AP control modes                                                                                               | § Android; § Configure for better performance in URP; § CPU and GPU performance control                  |
| Unity 6.3 Manual: URP asset and Universal Renderer reference                                      | Unity                                                                                      | https://docs.unity3d.com/6000.3/Documentation/Manual/urp/universalrp-asset.html             | Depth Priming unsupported on Android/iOS/TBDR, soft shadows on tile GPUs, MSAA on tiled GPUs, Native RenderPass, Depth Texture Mode                                                          | `sources/docs/rendering-lighting__manual-6000-3-urp-asset-renderer-gpu-stp-aa.md`                        |
| Unity 6.3 Manual: Android build and Google Play delivery                                          | Unity                                                                                      | https://docs.unity3d.com/6000.3/Documentation/Manual/android-building-and-delivering.html   | AAB, 200 MB base, texture compression targeting, signing (passwords never stored), symbols, Gradle hooks, reportFullyDrawn, game state hints                                                 | § Application signing; § Google Play delivery requirements; § Android symbols                            |
| Unity 6.3 Manual: iOS build, Xcode project, privacy manifest                                      | Unity                                                                                      | https://docs.unity3d.com/6000.3/Documentation/Manual/ios-building-and-delivering.html       | Replace vs Append, target GUIDs, privacy reasons, size levers, device profiling ports                                                                                                        | § Replace and append mode; § Project targets; § Apple's privacy manifest policy requirements             |
| Input System 1.20 manual + 6.3 Scripting API (Screen.safeArea, Screen.cutouts) + Device Simulator | Unity                                                                                      | https://docs.unity3d.com/Packages/com.unity.inputsystem@1.20/manual/devices-touch.html      | EnhancedTouch, pass-through, on-screen controls, isolated actions, safe-area conventions, simulator limits                                                                                   | § Touch polling; § On-screen controls; § Screen.safeArea                                                 |
| LevelPlay SDK for Unity 9.x and Unity IAP 5.x                                                     | Unity (docs.unity.com)                                                                     | https://docs.unity.com/en-us/grow/levelplay/sdk/unity and https://docs.unity.com/en-us/iap  | init order, reward callback order, readiness and capping, IAP 5 StoreController flow, confirmation, restore limits, StoreKit 2 attribution gap                                               | § Reward the User; § Process purchases; § Restore purchases                                              |
| Unity version deltas (this project)                                                               | compiled from the 6.3 Manual, upgrade guides, package pages, Google and Apple policy pages | `sources/unity-version-deltas.md`                                                           | API 36 rule (2026-08-31), Gradle 9.1/AGP 9.0 in 6000.3.17f1+, Xcode 26 rule (2026-04-28), IAP 4.15.1/LevelPlay 8.10.1 defaults vs 5.4.3/9.5.1, PVRTC removal (6.4), Android min API 26 (6.5) | § 1.3, § 12, § 13, § 14                                                                                  |

## Videos

| Id          | Expert, credential                                                                                    | URL                                         | Best for                                                                                                       | Best timestamps                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| pezwIhA0e04 | Otto Oliveira, Joseph Burchett, Neil Skinner (Unity Android team and partner engineering), Unite 2024 | https://www.youtube.com/watch?v=pezwIhA0e04 | ANR mechanics, signatures, pause handlers, SDK staggering, symbols, Unity 6 features                           | [00:04:18], [00:13:13] to [00:19:19], [00:25:12], [00:27:24], [00:37:45], [00:41:40]     |
| szS2KMxZsl4 | Unity developer advocacy with the IAP team (Gem Hunter UGS), June 2026                                | https://www.youtube.com/watch?v=szS2KMxZsl4 | IAP 5 order of operations, iOS recovered-purchase gap, dedupe, grant then confirm                              | [00:04:04], [00:07:27], [00:09:28], [00:10:32], [00:11:38], [00:13:15]                   |
| ptvjumIHxYg | Håkan Sidenvall and Cristiana Moraru (Input System team), Unite 2024                                  | https://www.youtube.com/watch?v=ptvjumIHxYg | project-wide actions, on-screen controls as a virtual gamepad, Constant Physical Size, tilt steering           | [00:20:29], [00:22:13], [00:26:17], [00:30:46]                                           |
| 2J0kDtUGlrY | Unity tutorial team (companion to the e-book), 6000.0.9f1                                             | https://www.youtube.com/watch?v=2J0kDtUGlrY | a full measured optimization pass with visible Inspector values; PC quality level on Android trap; mean vs max | [frame 00:10:28], [frame 00:14:11], [frame 00:17:57], [frame 00:26:18], [frame 00:39:31] |
| MKnLPA5hnPA | LlamAcademy (Chris Kurhan, indie, Llama Survival)                                                     | https://www.youtube.com/watch?v=MKnLPA5hnPA | floating joystick on EnhancedTouch finger events                                                               | [00:03:38], [00:07:31], [00:08:36], [00:10:52]                                           |
| GTaXWgKz0e8 | LlamAcademy (Chris Kurhan)                                                                            | https://www.youtube.com/watch?v=GTaXWgKz0e8 | first Google Play release: keystore, version code, IL2CPP/ARM64, tracks, declarations                          | [00:06:24], [00:06:50], [00:07:55], [00:09:39], [00:10:53]                               |
| 7ioIHn1tmIM | LlamAcademy (Chris Kurhan)                                                                            | https://www.youtube.com/watch?v=7ioIHn1tmIM | shipped-game phone costs: mesh combining to assets, GPU vertex animation, jobified casts, flat canvases        | [00:05:37], [00:07:22], [00:09:09], [00:11:04], [00:12:36]                               |
| PLQ4ywB13eg | Chema Damak (Unity technical evangelist), Unite Now 2020                                              | https://www.youtube.com/watch?v=PLQ4ywB13eg | anchors and pivots, safe-area panel, simulator scenario extensions                                             | [00:06:42], [00:10:53], [00:11:27], [00:15:40]                                           |
| d5O4Uw6gPBI | Unity (Adaptive Performance with Samsung), 2021                                                       | https://www.youtube.com/watch?v=d5O4Uw6gPBI | indexer and scalers, bounded max level, simulated thermal states                                               | [00:03:20], [00:04:21], [00:06:45]                                                       |
| j4YAY36xjwE | Mark Harkness and Ian Dundore (Unity Enterprise Support), Unite Europe 2016                           | https://www.youtube.com/watch?v=j4YAY36xjwE | import rules in AssetPostprocessor, heap growth, startup costs, string micro-costs                             | [00:19:07], [00:20:18], [00:24:44], [00:33:59]                                           |
| j0DN9P8e7dc | GameDevLuuk (indie, shipped a Switch game)                                                            | https://www.youtube.com/watch?v=j0DN9P8e7dc | build-size loop from the Build Report, Max Size blur test                                                      | [00:01:34], [00:04:58], [00:13:57]                                                       |
| ILv7GzDgteQ | Creauctopus (solo, 8 Android games, about 3M installs)                                                | https://www.youtube.com/watch?v=ILv7GzDgteQ | monetization pacing heuristics                                                                                 | [00:01:58], [00:04:46], [00:09:00]                                                       |
| GvIpY8yE4UY | YT Code Master (small channel, Feb 2026, LevelPlay 9.3.0)                                             | https://www.youtube.com/watch?v=GvIpY8yE4UY | LevelPlay dashboards and Unity-side order; bidding; validation call removal                                    | [00:04:31], [00:08:27], [00:30:42], [00:42:42]                                           |
| 4MOOitENQVg | samyam (Input System educator, sponsored by Unity), 2022                                              | https://www.youtube.com/watch?v=4MOOitENQVg | Touchscreen control tree, Value vs Pass Through, EnhancedTouch alias                                           | [00:06:22], [00:14:07], [00:23:13]                                                       |
| UXl_C3ZnRLc | Coco Code (tutorial channel)                                                                          | https://www.youtube.com/watch?v=UXl_C3ZnRLc | Play Console checklist order, internal testing, promote release                                                | [00:01:21], [00:09:10], [00:13:33]                                                       |

## Observed on this Mac (Unity 6000.3.21f1, macOS 26.5.1, Xcode 26.6), 2026-09-24

`tests/code/unity-mobile/` runs every procedure; results appended to
`archive/tests/unity-mobile/live_results.jsonl`. Engine facts read from the installed packages: URP
17.3 `DeferredLights.cs` (framebuffer fetch only with Native RenderPass), Input System 1.20
`OnScreenStick.cs` (movementRange is a radius), Adaptive Performance 6.0.0 `package.json` (core
feature since 6.3, package = samples), Android module tools (OpenJDK keytool and jarsigner,
`bundletool-all-1.17.2.jar`, SDK platforms 34 to 36, build-tools 36.0.0).

Added in v0.2 (same day): IAP 5.4.3 and LevelPlay 9.5.1 sources in the isolated clone
`tests/projects/unity-mobile/_pkgcheck/Library/PackageCache/` (`CrossPlatformValidator`
constructors, `IOrderInfo.Apple.jwsRepresentation`, `ProductMetadata.localizedPriceString`,
`LevelPlayPrivacySettings`, `[Obsolete] LevelPlay.SetConsent`,
`LevelPlayAndroidManifestProcessor : IPostGenerateGradleAndroidProject` adding AD_ID, settings under
`Assets/LevelPlay/Resources`, menu
`Ads Mediation > Developer Settings > LevelPlay Mediation Settings`); the editor's
`UnityEngine.AndroidJNIModule.xml` and `UnityEngine.AdaptivePerformanceModule.xml` API documentation
(`ApplicationExitInfoProvider`, `DiagnosticsReporting.CallReportFullyDrawn`,
`PerformanceBottleneck`, `FrameTimingManager`); the Android module's
`UnityEditor.Android.Extensions.dll` read with the bundled `monodis`
(`AndroidProjectFilesModifierContext.SetData`, `AndroidProjectFiles.GetData`); `xcodebuild -help` on
Xcode 26.6 (ExportOptions `method` names, `thinning`);
`sources/docs/automation-pipeline__command-line-batchmode-ci.md` § Target switching limitations in
batch mode (6.3 Manual).

## Revision history

- 2026-09-24, v0.1: first version, live tests M1 to M10.
- 2026-09-24, v0.2 (refactor after the Y11 blind grade, previous state in
  `skills/_versions/unity-mobile v1 2026-09-24/`): added audio, mesh and startup audits, import
  rules (`MobileImportRules`), bottleneck-aware thermal policy with synthetic-event PlayMode test
  and per-asset render scale tracking, `DeviceSoakLogger` + `soak_verdict`, Android exit and startup
  diagnostics, receipt validation, localized price, StoreKit 2 jws hook, consent and pacing gates,
  LevelPlay privacy flags, AAB and Xcode store gates (debuggable, 16 KB pages, AD_ID,
  SKAdNetworkItems, ATS, SDK manifests), `package_check`, the iOS archive and App Thinning plan, 8
  new `code_scan` rules, procedures M11 to M13 (assets, Android diagnostics and ANR triage, device
  and store hand-over); corrected the batch-mode claim ("a switch does nothing" became
  "target-switching APIs don't take effect inside a batch script", 6.3 Manual).
