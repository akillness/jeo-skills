# Critique rubric: judging your own mobile work

Score every deliverable against these checks before calling it done. Each line says what to measure
or look at, the pass condition, and the job that produces the evidence. A check you could not run
goes to **Assumed** in the report with the reason (no phone connected here: every device check is
Assumed until a human runs it).

## 1. Frame budget and thermals

| Check                                   | Pass                                                                                                                                                             | Evidence                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Budget written in ms per tier           | Mobile_High 60 fps = 16.67 ms raw, 10.83 ms sustained; Mobile_Low 30 fps = 33.33 / 21.67 ms (65% rule)                                                           | `ut_mobile.budgets(fps)` in the plan                                    |
| Judged on p95 and max, not the mean     | sustained verdict `pass` (p95 under 65% budget); hitches listed                                                                                                  | `ut_mobile.budget_verdict(csv, fps)`                                    |
| Editor numbers labeled as relative      | the report says "Editor Play mode on a Mac" and names the device run still owed                                                                                  | caveat field                                                            |
| Device soak planned                     | 20 to 30 min in the heaviest scene on the lowest phone, capture in short bursts, 10 to 15 min cooldown between runs                                              | Assumed until run                                                       |
| Thermal policy bounded                  | every scaler has a floor (ThermalPolicy.MaxLevel), steps down at once, up only after a calm cooling period                                                       | EditMode `ThermalStepsDownAtOnceAndUpOnlyAfterCooling`                  |
| targetFrameRate set per context         | 60/30 by tier, 30 in menus; vSyncCount 0 on mobile levels                                                                                                        | `MobileTierDirector`, `AuditRendering` (`mobile.quality.vsync_ignored`) |
| Thermal response matches the bottleneck | synthetic events: GPU-bound heat lowers lodBias and render scale, CPU-bound heat keeps the resolution, cooling restores both, assets unchanged after the session | PlayMode `SyntheticThermalEventsDriveLodBiasAndRenderScale`             |
| Device soak judged, not eyeballed       | `soak_verdict` pass over 20 minutes or more; last 5 minutes vs first; highest thermal warning and when                                                           | DeviceSoakLogger CSV from the human's run (Assumed until then)          |

## 2. Rendering tiers

| Check                                                              | Pass                                                                                                                                                                 | Evidence                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Every Quality level shipped on Android/iOS uses a mobile URP asset | 0 `mobile.urp.pc_asset_on_mobile`; PC level excluded from mobile platforms                                                                                           | `MobileTiers.AuditRendering`                          |
| Renderer                                                           | Depth Priming Disabled, Native RenderPass on, Depth Texture Mode After Transparents, Intermediate Texture Auto                                                       | same audit, `renderers` facts                         |
| Asset                                                              | SRP Batcher on; Depth/Opaque texture off unless a named shader samples them; HDR off or 32-bit; soft shadows off; 1 cascade; additional lights per vertex (low tier) | same audit: 0 errors, every warn justified in writing |
| Deferred only with a reason                                        | Native RenderPass on, no MSAA, no Rendering Layers                                                                                                                   | `mobile.urp.deferred_*` absent                        |
| GPU Resident Drawer only where it works                            | Forward+ and no GLES, or off                                                                                                                                         | `mobile.urp.grd_inactive` absent                      |
| Tier visuals compared                                              | same view per tier captured, flags empty, differences (aliasing, shadow range) acceptable to the art lead                                                            | CaptureViews per tier + contact sheet opened          |

## 3. Textures and size

| Check                                            | Pass                                                                                                                                            | Evidence                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Effective format per platform, not the default   | every texture ASTC on Android and iOS (or ETC2 by an explicit min-spec decision); no RGBA32/uncompressed                                        | `AuditTextures` 0 errors; `ImportedFormats` with `build_target`   |
| ASTC block by class                              | UI and faces 4x4 (or 5x5), most 6x6, big environment maps 8x8; HDR as ASTC HDR on Android                                                       | `FixTextures` changes list                                        |
| Memory went down                                 | total imported MB before vs after, per target                                                                                                   | `ImportedFormats.total_memory_mb`                                 |
| Max Size drops looked at                         | capture at gameplay scale before and after; no visible loss on faces, text, UI                                                                  | captures you opened                                               |
| No crunch on ASTC, no mips on UI, Read/Write off | codes absent                                                                                                                                    | `AuditTextures`                                                   |
| Download under budget                            | Android: `bundletool get-size total` MAX under the budget; iOS: App Thinning report (human) under 200 MB OTA with margin                        | `bundletool_sizes`, `app_thinning_report` on the human's export   |
| Over budget handled in order                     | Build Report sorted by size, biggest entry first (textures), then Play Asset Delivery fast-follow or on-demand (install-time packs still count) | `aab_facts.asset_pack_delivery`                                   |
| Audio by size                                    | WAV sources; small clips ADPCM, mono, 22,050 Hz; no Streaming under 200 KB; large clips Streaming                                               | `AuditAudio` 0 warns; `ImportedAudio` total down                  |
| Rules survive new assets                         | `import_rules.json` present; a new texture and clip audit clean with no fix pass                                                                | `MobileImportRules`, M11 test                                     |
| Meshes                                           | Read/Write off unless whitelisted; compression counted as disk only                                                                             | `AuditMeshes`                                                     |
| Startup                                          | Resources folder small; first scene a light loader; `StartupReport.Interactive()` on the real interactive frame when a loader is used           | `AuditStartup`, `code_scan` (`mobile.android.report_fully_drawn`) |

## 4. Input and UI

| Check                                         | Pass                                                                                                                     | Evidence                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Touch read without polling Touchscreen        | EnhancedTouch or actions; `mobile.touch.poll_touchscreen` absent                                                         | `ut_mobile.code_scan`                                              |
| On-screen controls bound to real actions      | stick and button control paths appear in the project-wide actions                                                        | `BuildTouchHud.bindings` non-empty                                 |
| Stick values understood                       | movementRange is a radius; gameplay reads the deadzone-processed value                                                   | PlayMode `OnScreenStickMovementRangeIsARadius`                     |
| HUD hidden only for a real gamepad            | the on-screen controls' virtual Gamepad (usage OnScreen, native false) never hides the HUD; a plugged-in one does        | PlayMode `VirtualGamepadIsNotARealGamepad`                         |
| Thumb controls sized physically               | Canvas Scaler Constant Physical Size (or explicit conversion)                                                            | prefab facts                                                       |
| Render outside safe area on, HUD in the panel | `render_outside_safe_area` true; no `mobile.ui.safe_area_flip`                                                           | `AndroidFacts`, `code_scan`                                        |
| HUD inside the safe area at every layout      | fitted HUD: 0 blocked elements at portrait notch, landscape notch, punch hole; naive HUD blocked (proves the test bites) | `CaptureSafeArea` + contact sheet opened; EditMode `SafeAreaTests` |
| Device Simulator pass (human)                 | devices of the target list, both orientations, safe-area overlay                                                         | Assumed (GUI window)                                               |

## 5. Android release

| Check                                               | Pass                                                                                                        | Evidence                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Store format and settings                           | AAB, IL2CPP, ARM64 only, min API 25+, target API 36, Development off, ASTC first                            | `AuditPlayerSettings` 0 errors; `aab_facts.abis == ["arm64-v8a"]` |
| Signed with the upload key, passwords never on disk | jarsigner CN = your key; args.json has no password; a new process shows passwords empty                     | `signer_of`, `KeystoreState`                                      |
| Base module under 200 MB                            | `aab_facts.base_compressed_mb` < 200                                                                        | `aab_facts`                                                       |
| Symbols shipped                                     | `BUNDLE-METADATA/...debugsymbols...` in the AAB (or zip uploaded)                                           | `aab_facts.embedded_symbols`                                      |
| bundletool validates                                | `validate_ok`                                                                                               | `bundletool_sizes`                                                |
| Version code increases                              | greater than the last uploaded one (release log)                                                            | plan + `AndroidFacts.version_code`                                |
| ANR risks cleared                                   | no `mobile.anr.pause_io`; SDK init staggered                                                                | `code_scan`                                                       |
| Built bundle passes the store gates                 | not debuggable, every `.so` 16 KB aligned, symbols embedded, AD_ID present when ads read the advertising ID | `aab_findings` 0 errors                                           |
| Explicit graphics APIs                              | Auto off, Vulkan then OpenGLES3 only if the min-spec needs it                                               | `AndroidFacts.graphics_apis`                                      |
| Gradle edits safe for incremental builds            | no project `IPostGenerateGradleAndroidProject` editing manifests, or a clean build after each change        | `code_scan` (`mobile.android.post_generate_gradle`)               |

## 6. iOS release

| Check                                                         | Pass                                                                                                                                                                 | Evidence                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Xcode project exported with Device SDK, iOS 15+, stripping on | `BuildIos` Succeeded; `ios` facts                                                                                                                                    | job result                                    |
| Privacy manifest                                              | every C# timestamp use declared (C617.1 for app-container files); Unity's own reasons for that category kept (0A2A.1 + C617.1 in the export); each SDK ships its own | `code_scan` + `xcode_facts.privacy_manifests` |
| Edits through PBXProject/PlistDocument only                   | both target GUIDs reported; changes listed                                                                                                                           | `agent_xcode_postprocess.json`                |
| Compiles with Xcode 26 (unsigned)                             | BUILD SUCCEEDED (optional, minutes of CPU)                                                                                                                           | `xcode_compile_unsigned`                      |
| Ads-ready Info.plist                                          | SKAdNetworkItems, NSAllowsArbitraryLoads per LevelPlay, each SDK's own privacy manifest, ATT text when tracking                                                      | `xcode_findings`                              |
| Signing, archive, TestFlight                                  | commands prepared (`ios_archive_plan`), run by or with the human's Apple account                                                                                     | Assumed                                       |

## 7. Monetization

| Check                                            | Pass                                                                                                                                                                 | Evidence                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Package versions explicit                        | IAP 5.x and LevelPlay 9.x in the manifest (not the 4.15.1 / 8.10.1 defaults)                                                                                         | `Packages/manifest.json`                                                         |
| No IAP 4 or old ads API                          | `mobile.iap.v4_api`, `mobile.ads.legacy_api` absent                                                                                                                  | `code_scan`                                                                      |
| Idempotent purchases                             | grant then confirm; duplicates, recovered orders, crash between grant and confirm, failed confirmation: one grant each                                               | EditMode `MonetizationTests`                                                     |
| Flag reset on every terminal event               | deferred and failed reset the in-progress flag                                                                                                                       | same tests                                                                       |
| Reward once per show in any order                | `RewardOncePerShowWhateverTheOrder`                                                                                                                                  | same                                                                             |
| Restore safe                                     | no revoke on an empty fetch with failures, disconnect or the product-details warning; Restore button on iOS                                                          | `SafeToRevokeOnMissing`, UI review                                               |
| Receipts checked before the grant                | invalid receipt: no grant, no confirm, UI told                                                                                                                       | EditMode `InvalidReceiptIsNeitherGrantedNorConfirmed`                            |
| Every confirm result handled                     | `ConfirmPurchase` called; `FailedOrder` retried with the kept order                                                                                                  | `code_scan` (`mobile.iap.no_confirm`, `mobile.iap.failed_order_ignored`)         |
| Prices from the store                            | no hardcoded price strings; `PriceString(id)`                                                                                                                        | `code_scan` (`mobile.iap.hardcoded_price`)                                       |
| Attribution sees iOS purchases                   | `OnAppleJws` wired to the attribution SDK; a device purchase reported                                                                                                | adapter code; Assumed on device                                                  |
| Consent and pacing                               | ad SDK init only after the consent answer and a milestone; privacy flags before `LevelPlay.Init`; no store, ads or offers in the first 10 to 15 minutes unless stuck | EditMode `AdsWaitForConsentAndMilestone`, `MonetizationFreeWindowAndStuckOffers` |
| No test calls in release                         | no reachable `ValidateIntegration`, `LaunchTestSuite`, `is_test_suite`                                                                                               | `code_scan` (`mobile.ads.test_calls_in_release`)                                 |
| Packages clean                                   | IAP 5.x, LevelPlay 9.x, no pre-9 SDK code in Assets                                                                                                                  | `package_check` 0 findings                                                       |
| Device sandbox purchase and LevelPlay test suite | done on a phone                                                                                                                                                      | Assumed                                                                          |

## 8. Hand-over complete

- The M13 checklist is in the report with every step the human owns: soak and `soak_verdict`, native
  profilers, Android vitals and ANR triage, sandbox purchases, test suite removal, Play Console
  (internal track first, Play App Signing, ads, advertising ID and Data safety declarations), App
  Store Connect (archive plan, thinning report, TestFlight).

## 9. Report honesty

- Every step names its Unity call; **Verified** lists job ids and numbers; **Assumed** lists every
  device, store and account step.
- No number quoted from a video as if measured here; observed numbers carry "observed" and the date.
- Nothing claims "ships" without the device checks.
