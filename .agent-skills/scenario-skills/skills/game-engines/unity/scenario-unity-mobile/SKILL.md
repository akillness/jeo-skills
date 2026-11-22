---
name: scenario-unity-mobile
description: "Use when a Unity 6.3 game targets Android or iOS: phone frame budget, overheating after 20 minutes, 'my game stutters on phones', ASTC or ETC2 textures, audio import, URP mobile settings, touch controls, on-screen joystick, UI under the notch or safe area, slow startup, ANRs, 'Android build fails', AAB, keystore signing, target API 36, Google Play upload, iOS Xcode export or archive, privacy manifest, app size, in-app purchases (IAP 5), rewarded ads (LevelPlay), ad consent."
license: MIT
---

# Unity mobile (mobile specialist)

Expert mobile work means a game that holds its frame rate after twenty minutes on a three-year-old
phone, starts fast, installs from the store, and never double-charges or double-grants. The stance:
budget the sustained frame, prove every setting on the data the device gets (imported format, built
bundle, exported Xcode project), and treat stores, SDKs and money code as contracts with ugly event
orders. Target: Unity 6000.3.21f1, URP 17.3, Input System 1.20, macOS with Xcode 26.6. If a sibling
skill named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or
ask the user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed
from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Toolkit:
[`scripts/ut_mobile.py`](scripts/ut_mobile.py) (imports `ut_env`, `ut_run`, `ut_stat`), editor jobs
in [`scripts/AgentKit/Mobile/`](scripts/AgentKit/Mobile/), player code in
[`scripts/Runtime/`](scripts/Runtime/).

## Stance (the expert delta)

1. **Budget the sustained frame, not the peak.** About 65% of 1000/fps (10.8 ms at 60, 21.7 ms at
   30), judged on p95 and max, on the lowest phone, short bursts, 10 to 15 minutes of cooldown;
   assume vsync, so a missed refresh halves the rate (Unity mobile e-book). Under heat, lower render
   scale first only when the GPU is the bottleneck: resolution barely helps a CPU-bound frame (6.3
   Manual). Prove the policy with synthetic thermal events, not a hot phone (d5O4Uw6gPBI
   [00:04:21]). Editor timings are relative; draw and SetPass counts are the stable Editor evidence
   (observed).
2. **Check the effective format, then lock the rule.** A texture the GPU cannot sample is
   decompressed to RGBA32 on the CPU (6.3 Manual); an HDR map without an ASTC HDR override imported
   as ETC2_RGBA8 (observed). ASTC 4x4 UI and faces, 6x6 default, 8x8 big environment maps [added];
   crunch does nothing on ASTC. Audio: WAV sources, mono SFX at 22,050 Hz at most, ADPCM under 200
   KB, Streaming only above about 400 KB (e-book). An `AssetPostprocessor` keeps new assets
   compliant (Unity Enterprise Support, j4YAY36xjwE [00:19:07]).
3. **Mobile URP is not PC URP with a lower slider.** Depth Priming Disabled (unsupported on Android,
   iOS and TBDR), Native RenderPass on, Depth and Opaque textures off unless sampled, HDR off or
   32-bit, soft shadows off, Store Actions Auto or Discard (6.3 Manual). One URP asset per Quality
   tier; a batch editor launched for Android still reported Quality "PC" (observed; same trap in
   2J0kDtUGlrY [frame 00:10:28]).
4. **Release builds are reproducible from the environment.** Unity never stores keystore passwords:
   set them in the build process from env vars; Google refuses the debug keystore (6.3 Manual;
   LlamAcademy, GTaXWgKz0e8 [00:06:24]). Development Build off, symbols in the bundle from the first
   upload: Play never symbolicates crashes received before the symbols (6.3 Manual). Check the built
   bundle, not the settings.
5. **The Android main thread and the splash are shared budgets.** Most game ANRs happen while
   backgrounding: nothing heavy in `OnApplicationPause`, SDK init staggered after milestones,
   symbols shipped; read the signature, the previous exit reason on next launch, and exclude
   low-revenue devices that dominate ANRs (Unity Android team, pezwIhA0e04 [00:27:24], [00:25:12],
   [00:13:13], [00:41:40], [00:29:02]). The Resources index and first-scene `Awake` run under the
   splash (j4YAY36xjwE [00:33:59]); a loader scene reports its real interactive frame with
   `CallReportFullyDrawn` (6.3 Manual).
6. **Money code is idempotent.** Validate, grant, then `ConfirmPurchase`; dedupe by transaction id
   in flight and persisted; pending orders from `OnPurchasesFetched` go through the same path; a
   `FailedOrder` on confirm is retried with the kept order, never regranted; buy only fetched
   `Product` objects; never revoke on an empty Google fetch; show the store's localized price; hand
   `jwsRepresentation` to attribution SDKs (IAP 5 docs; Unity, szS2KMxZsl4 [00:07:27], [00:09:28],
   [00:11:38]). Grant rewarded ads in `OnAdRewarded` whatever the callback order.
7. **Touch is events and virtual devices; the HUD lives in one safe-area panel.** EnhancedTouch,
   never `Touchscreen.current` in Update; on-screen controls emit a virtual Gamepad; thumb controls
   at Constant Physical Size (Input System team, ptvjumIHxYg [00:20:29]). `movementRange` is a
   radius (observed). Render outside the safe area on, HUD in a `SafeAreaFitter` panel (Chema Damak,
   PLQ4ywB13eg [00:10:53]); UI Toolkit top = `Screen.height - safeArea.yMax` (proven by test). The
   Device Simulator is one finger, no performance, no `UNITY_IOS`, no native plug-ins (6.3 docs).
8. **SDKs and stores are contracts.** Consent answered before the first ad request, ad SDK init
   after the first milestone, nothing monetized in the first 10 to 15 minutes, offers when the
   player is stuck (Creauctopus, ILv7GzDgteQ [00:01:58], [00:09:00]); SKAdNetworkItems and every
   SDK's privacy manifest on iOS, AD_ID on API 33+ (LevelPlay docs; 6.3 Manual), the ATT text when
   you track [added]; Data safety answered from the SDK vendors' guides; one internal-track upload
   before IAP products can exist (GTaXWgKz0e8 [00:09:06]; UXl_C3ZnRLc [00:02:28]). 6000.3.21f1
   defaults to IAP 4.15.1 and LevelPlay 8.10.1: pin 5.4.3 and 9.5.1 first.

## Establish first

Stores (Play needs an AAB); min-spec device list (GPU family decides ASTC vs ETC2); target fps per
tier; download budget; orientation; ad network, IAP products, consent regimes (GDPR, CCPA,
child-directed) and whether a backend validates receipts; signing material (keystore path and env
var names, Apple team id: the human keeps them); whether a phone is connected (none here: device
steps become a hand-over). Defaults: Mobile_High 60 fps and Mobile_Low 30 fps (Low ships, the
director promotes), ASTC 6x6, min API 25, target API 36, iOS 15, IL2CPP ARM64, Vulkan then
OpenGLES3, Minimal stripping to start.

## Workflow

1. **Baseline.** `MobileTiers.AuditRendering`, `MobileBuild.AuditPlayerSettings`,
   `MobileTextures.AuditTextures`, `MobileAudio.AuditAudio`, `MobileStartup.AuditStartup`,
   `ut_mobile.code_scan(P)`, `ut_mobile.package_check(P)`, all with `build_target="Android"`. GATE:
   findings listed, Editor Quality level recorded.
2. **Tiers and thermals.** `MobileTiers.ApplyTiers`; `MobileTierDirector` with PlayMode synthetic
   `Feed` events. GATE: `AuditRendering` 0 errors; per-tier captures opened; the thermal test lowers
   lodBias and (GPU-bound only) render scale, restores both.
3. **Assets.** `FixTextures`, `FixAudio`, `AuditMeshes`, then `ImportedFormats` and `ImportedAudio`
   per target; `import_rules.json` for `MobileImportRules`. GATE: 0 errors and warns, all ASTC,
   imported sizes down, new assets arrive compliant; captures before and after any Max Size drop.
4. **Input and UI.** `SafeAreaFitter`, `BuildTouchHud`, `FloatingTouchStick`. GATE: `SafeAreaTests`
   and `TouchInputTests` pass; `CaptureSafeArea` fitted HUD clear, naive HUD blocked.
5. **Frame budget.** `AgentProfile.PlayModeTimings` per tier, `budget_verdict(csv, fps)`;
   `DeviceSoakLogger` goes into the development build. GATE: sustained verdict pass; device soak
   listed as Assumed.
6. **Monetization.** Pin packages; logic in `PurchaseLedger`, `RewardGate`, `AdPacing`,
   `AdsInitGate`; adapters `Iap5Store` (validate, price, jws) and `LevelPlayAds` (privacy flags
   before init). GATE: `MonetizationTests` pass, adapters compile against the pinned packages,
   `code_scan` and `package_check` clean.
7. **Android release.** `make_keystore`, `MobileBuild.BuildAndroid` with `env=keystore_env(ks)`.
   GATE: Succeeded; `aab_findings` 0 errors (not debuggable, 16 KB pages, symbols, AD_ID if ads);
   `bundletool_sizes` under budget, else Build Report by size then Play Asset Delivery; passwords
   not persisted.
8. **iOS release.** Privacy manifest in `Assets/Plugins`, `BuildIos`, `xcode_facts` +
   `xcode_findings`. GATE: Succeeded, reasons carried, target GUIDs reported; `ios_archive_plan`
   commands (archive, App Store export, thinning report) shown to the human and run only with
   approval.
9. **Device and store hand-over.** Soak CSV judged by `soak_verdict`, native GPU profilers, Android
   vitals with ANR triage and `ExitInfo`, sandbox purchase and restore, LevelPlay test suite then
   removal, Play Console and App Store Connect steps (procedures M13).

## Numbers

| Value                                 | Relative to                                                               | Source                             |
| ------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| 16.67 / 10.83 ms, 33.33 / 21.67 ms    | raw / sustained (65%) budget at 60 and 30 fps                             | e-book                             |
| 10 to 15 min; 20 to 30 min            | cooldown between device captures; soak length                             | e-book; [added]                    |
| up to 1 ms CPU                        | each enabled camera on low-end mobile                                     | e-book                             |
| 8 to 0.89 bpp                         | ASTC 4x4 to 12x12                                                         | 6.3 Manual                         |
| < 200 KB / > 350 to 400 KB; 22,050 Hz | audio load type buckets; mobile SFX sample rate ceiling                   | e-book                             |
| 200 MB / 100 MB                       | AAB base module / APK on Play; also the iOS cellular download limit (200) | 6.3 Manual                         |
| 16 KB (p_align 0x4000)                | every native library's LOAD segments, Android 15+ pages                   | version deltas                     |
| API 25 / 36                           | 6.3 minimum / Play target since 2026-08-31 (6.5 raises the minimum to 26) | version deltas                     |
| iOS 15, A8; Xcode 26 + iOS 26 SDK     | 6.3 minimum; App Store since 2026-04-28                                   | version deltas                     |
| 5 s (10 s on some Samsung); 128 bytes | ANR timeout; exit state summary                                           | pezwIhA0e04 [00:02:01], [00:42:13] |
| 3 days                                | Google refunds an unacknowledged purchase                                 | IAP 5 docs                         |
| 10 to 15 min; every 3 min             | monetization-free start; interstitial interval after a milestone          | ILv7GzDgteQ (heuristics)           |
| 54998 to 55511                        | outbound ports for iOS remote profiling                                   | 6.3 Manual                         |
| 0.125 to 0.925                        | default Gamepad stick deadzone applied to on-screen stick values          | observed                           |

## Quality gates

- **Measurable:** every audit at 0 errors (warns justified); `ImportedFormats` all ASTC; NUnit
  (`SafeAreaTests`, `TouchInputTests`, `MonetizationTests`, `TierDirectorTests`) failed == 0;
  `budget_verdict` sustained pass; `aab_findings` and `xcode_findings` 0 errors; `bundletool_sizes`
  within budget; `code_scan` and `package_check` 0 errors; on device, `soak_verdict` pass over 20
  minutes or more.
- **Visual:** tier and safe-area captures pass `image_checks` and were opened; before/after blur
  check for every Max Size drop.

## Common mistakes

| Mistake                                                  | What it looks like                                                     | Fix                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| profiling against 16.7 ms in the Editor                  | fine on the Mac, throttles after 10 minutes on a phone                 | 65% budget, device soak, p95/max                                |
| PC Quality level on the mobile target                    | captures use `PC_RPAsset`, or a PC level ships                         | `ApplyTiers` (exclude PC), `SetEditorQuality`                   |
| thermal response by resolution on a CPU-bound game       | blurrier, barely faster                                                | render scale only when GPU-bound; lodBias, shadows              |
| RGBA32 override; HDR map without ASTC HDR                | 5.3 MB for 1024 px; HDR imported as ETC2_RGBA8                         | `FixTextures`, check `ImportedFormats`                          |
| streaming small clips; music Decompress On Load          | 200 KB overhead per stream; whole PCM in memory                        | `FixAudio` (buckets by size)                                    |
| keystore set once in the GUI                             | next batch build fails, or ships debug-signed                          | env vars read by `BuildAndroid`                                 |
| Development Build uploaded; symbols uploaded late        | upload fails; early crashes never symbolicated                         | `aab_findings`; symbols in the first bundle                     |
| Gradle edits in `IPostGenerateGradleAndroidProject`      | stale outputs from incremental builds                                  | `AndroidProjectFilesModifier` (custom modules) or a clean build |
| saves in `OnApplicationPause`; SDKs in the first `Awake` | ANRs on pause; slow start under the splash                             | checkpoints; stagger SDK init; `AuditStartup`                   |
| IAP 4 code on IAP 5; LevelPlay 8 folders left            | compile errors; pre-9 SDK files beside the 9.x package                 | pin packages, `package_check`                                   |
| `OnPurchaseConfirmed` read as success                    | a `FailedOrder` silently lost                                          | retry with the kept `PendingOrder`                              |
| attribution SDK blind after IAP 5                        | iOS revenue missing, no error                                          | `OnAppleJws`, then a device purchase                            |
| reward granted in `OnAdClosed`; test suite left in       | missing rewards; validation calls in release                           | `RewardGate`; `code_scan`                                       |
| HUD anchored to the canvas; Simulator taken as proof     | buttons under the notch; multitouch untested                           | `SafeAreaFitter`; device check                                  |
| hiding the HUD when any Gamepad connects                 | the HUD hides itself: its own on-screen controls add a virtual Gamepad | `TouchControlsVisibility` (skips the OnScreen usage)            |
| a declared privacy category                              | Unity's reasons for it dropped (0A2A.1, observed)                      | `write_privacy_manifest` keeps the union                        |
| `BuildReport.summary.totalSize` as Android size          | 789.8 MB for a 53.9 MB AAB (observed)                                  | `aab_facts`, `bundletool get-size total`                        |

## Handoffs

- **Receives:** scenes, prefabs and budgets from scenario-unity-expert; UI layouts from
  scenario-unity-ui (applies the safe-area panel and touch HUD); shaders from scenario-unity-shaders
  (variants, depth/opaque texture use); content from scenario-unity-world-building and
  scenario-textures (import policy).
- **Delivers:** tier assets and URP findings to scenario-unity-rendering-lighting; profiling CSVs
  and device capture requests to scenario-unity-performance; build jobs, keystore and env
  conventions to scenario-unity-pipeline-automation (CI); input bindings to
  scenario-unity-architecture; web size or browser work to scenario-unity-web. Packet: audits JSON,
  contact sheets, `aab_facts` and gates, `xcode_facts` and gates, NUnit totals, Verified and Assumed
  lists, the device and store checklist.

## Unity 6.3 notes

- Target API 36 for Play since 2026-08-31; min API 25 (26 in 6.5); Gradle 9.1.0 / AGP 9.0.0 in
  6000.3.17f1+; GameActivity is the default entry point. The 6000.3.21f1 URP template ships Target
  API Automatic, APK output and a placeholder package id (observed): set all three. Engine libraries
  are 16 KB aligned (observed).
- `AndroidProjectFilesModifier` edits custom modules only:
  `AndroidProjectFiles.UnityLibraryManifest` does not compile in 6000.3.21f1 (observed). LevelPlay
  9.5.1 adds AD_ID through its own post-generate hook (read in the source): clean-build after
  changing that setting.
- After `QualitySettings.SetQualityLevel`, `GraphicsSettings.currentRenderPipeline` still returned
  the previous asset that frame (observed): read `QualitySettings.renderPipeline`.
- App Store needs Xcode 26 and the iOS 26 SDK; 6.4 moves runtime libraries into
  `UnityRuntime.framework` (re-check post-process scripts). PVRTC removed in 6.4.
- Adaptive Performance is a core feature (`UnityEngine.AdaptivePerformance`); automatic control only
  with Android providers.
- `LevelPlay.SetConsent` is obsolete in 9.5.1 (`LevelPlayPrivacySettings`); `com.unity.ads` is
  legacy for monetization since 2026-01-31.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by source with timestamps,
  observations, and where sources disagree.
- [`references/procedures.md`](references/procedures.md): M1 to M13 as copyable calls, each with its
  live test and recorded result.
- [`references/critique.md`](references/critique.md): the rubric to judge budgets, tiers, assets,
  UI, builds, money code and hand-overs.
- [`references/gui-paths.md`](references/gui-paths.md): the same tasks through Unity, Xcode and
  store consoles.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs, best
  timestamps, and the revision history.
