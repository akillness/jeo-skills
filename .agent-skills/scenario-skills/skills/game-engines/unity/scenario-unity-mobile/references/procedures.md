# Mobile procedures (copyable, each with its live test and recorded result)

All run in Unity 6000.3.21f1 on macOS 26.5.1 (Apple Silicon, Metal, Xcode 26.6) on 2026-09-24,
project `tests/projects/unity-mobile` (APFS clone of Base3D_URP, path with spaces). No phone was
connected: installs on a device, store uploads and signing with a real Apple account did not run.
Results: `archive/tests/unity-mobile/live_results.jsonl`; runner
`tests/code/unity-mobile/run_all.sh [--builds]`. v0.2 (same day, after the blind grade): M11 to M13
added, M2, M6 to M10 extended; the AAB and Xcode export of the first pass were re-read, not rebuilt.
Full C# in `scripts/AgentKit/Mobile/` (editor jobs) and `scripts/Runtime/` (player code); this file
shows the calls and the lines that carry the expertise.

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-mobile/scripts")
import ut_mobile                                   # imports ut_env, ut_run, ut_stat from scenario-unity-expert
from ut_mobile import ut_run, ut_env
P = ut_mobile.install(ut_env.base_project("3d", "<project>/tests/projects/<skill>"))   # AgentKit + Mobile jobs + runtime
```

Every job below is launched with `build_target="Android"` (or `"iOS"`): the platform is fixed at
launch (`-buildTarget`). Target-switching APIs don't take effect inside a batch script, because the
switch needs an assembly reload that can't happen while the script runs (6.3 Manual, Target
switching limitations), and the editor otherwise reopens on the last platform.

## M1. Baseline audit (rendering, player settings, code)

```python
rend = ut_run.run_method(P, "AgentKit.Mobile.MobileTiers.AuditRendering", {}, build_target="Android")
play = ut_run.run_method(P, "AgentKit.Mobile.MobileBuild.AuditPlayerSettings", {"required_target_api": 36}, build_target="Android")
code = ut_mobile.code_scan(P)        # 20 rules: ANR, touch, IAP and ads API, privacy, confirm/FailedOrder, prices, safe-area flip, Gradle hooks
pkgs = ut_mobile.package_check(P)    # IAP 4 / LevelPlay 8 defaults, com.unity.ads legacy, pre-9 LevelPlay folders
for r in (rend["result"], play["result"], code, pkgs): print(r["counts"])
# plus the asset and startup audits of M11 (AuditTextures, AuditAudio, AuditMeshes, AuditStartup)
```

`AuditRendering` reads every Quality level included on Android/iOS through `SerializedObject` (URP
asset `m_RequireDepthTexture`, `m_SupportsHDR`, `m_HDRColorBufferPrecision`, `m_MSAA`,
`m_SoftShadowsSupported`, `m_StoreActionsOptimization`, `m_GPUResidentDrawerMode`...; renderer
`m_RenderingMode`, `m_DepthPrimingMode`, `m_CopyDepthMode`, `m_UseNativeRenderPass`,
`m_IntermediateTextureMode`), and `PlayerSettings.GetGraphicsAPIs(BuildTarget.Android)`. Tests:
`test_live_tiers.py` (`tiers.audit_before`), `test_live_player_audit.py`, `test_offline.py` (scan
rules). Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. `AuditPlayerSettings` on a fresh clone
of the 6000.3.21f1 URP template: Android already IL2CPP + ARM64, min API 25, GameActivity, but
Target API Automatic and APK output (2 warns) and placeholder ids
`com.UnityTechnologies.com.unity.template.urpblank` /
`com.Unity-Technologies.com.unity.template.urp-blank` (2 errors); on the main project after the
release settings: 0 errors, 2 infos (version code 1, accelerometer 60 Hz). On the URP template's
Mobile level: 0 errors, 4 infos (HDR on, Additional Lights per pixel, LOD Cross Fade, Volume Update
Every Frame); the PC level was already excluded from Android/iPhone. The batch editor launched with
`-buildTarget Android` reported Quality level "PC" and `PC_RPAsset` (Echo job): Editor captures and
profiles use the Editor's current level, not the Android default, until `SetEditorQuality`.
`code_scan` on the sample `SaveGameSample.cs`: `mobile.anr.pause_io` (File.WriteAllText +
PlayerPrefs.Save in OnApplicationPause), `mobile.anr.sdk_init_at_boot`,
`mobile.ios.privacy_timestamp`; offline fixtures: 7 of the 12 scan rules checked, with negative
cases. v0.2: `AuditPlayerSettings` adds infos for Render outside safe area off, Auto Graphics API on
and a non-GameActivity entry (fresh template: 2 errors, 2 warns, 5 infos; main project after release
settings: 0 errors, 0 warns, 2 infos); `code_scan` gained 8 rules (`mobile.iap.no_confirm`,
`mobile.iap.failed_order_ignored`, `mobile.iap.hardcoded_price`, `mobile.ads.obsolete_consent`,
`mobile.ads.test_calls_in_release`, `mobile.android.report_fully_drawn`, `mobile.ui.safe_area_flip`,
`mobile.android.post_generate_gradle`), all checked offline with negative cases; `package_check`:
main project neither package, `_pkgcheck` IAP 5.4.3 + LevelPlay 9.5.1, 0 findings.

## M2. Mobile quality tiers (one URP asset per tier)

```python
tiers = {"tiers": [
  {"name": "Mobile_High", "rename_from": "Mobile", "source": "Assets/Settings/Mobile_RPAsset.asset", "asset": "Assets/Settings/Mobile_High_RPAsset.asset",
   "settings": {"hdr": False, "msaa": 2, "render_scale": 0.9, "shadow_distance": 40, "cascades": 1, "soft_shadows": False,
                "depth_texture": False, "opaque_texture": False, "store_actions": "auto", "additional_lights": "per_pixel", "srp_batcher": True},
   "quality": {"vSyncCount": 0, "lodBias": 1.0, "antiAliasing": 0}},
  {"name": "Mobile_Low", "source": "Assets/Settings/Mobile_RPAsset.asset", "asset": "Assets/Settings/Mobile_Low_RPAsset.asset",
   "settings": {"hdr": False, "msaa": 1, "render_scale": 0.75, "shadow_distance": 25, "cascades": 1, "soft_shadows": False,
                "main_shadow_resolution": 512, "additional_lights": "per_vertex", "additional_lights_per_object": 2,
                "lod_cross_fade": False, "probe_blending": False, "box_projection": False, "srp_batcher": True},
   "quality": {"vSyncCount": 0, "lodBias": 0.7, "antiAliasing": 0}}],
 "renderer": {"path": "Assets/Settings/Mobile_Renderer.asset", "settings": {"rendering_path": "forward", "depth_priming": "disabled",
              "native_render_pass": True, "copy_depth": "after_transparents", "intermediate_texture": "auto"}},
 "platforms": ["Android", "iPhone"], "default_tier": "Mobile_Low", "editor_current": "Mobile_High"}
ut_run.run_method(P, "AgentKit.Mobile.MobileTiers.ApplyTiers", tiers, build_target="Android")
ut_run.run_method(P, "AgentKit.Mobile.MobileTiers.AuditRendering", {}, build_target="Android")      # expect 0 errors
for t in ("Mobile_High", "Mobile_Low"):                                                              # same view per tier, then LOOK
    ut_run.run_method(P, "AgentKit.Mobile.MobileTiers.SetEditorQuality", {"name": t}, build_target="Android")
    ut_run.run_method(P, "AgentKit.AgentCapture.CaptureViews", {"scene": "Assets/Scenes/MobileBench.unity"}, graphics=True, build_target="Android")
```

Engine calls: `AssetDatabase.CopyAsset` for the URP assets, `SerializedObject` writes on the asset
and renderer, `QualitySettings.asset` edited as a `SerializedObject` (`m_QualitySettings[]`: `name`,
`customRenderPipeline`, `excludedTargetPlatforms`; `m_PerPlatformDefaultQuality` map;
`m_CurrentQuality`), then `AssetDatabase.SaveAssets`. The player picks the tier at runtime with
`MobileTierDirector` (`QualitySettings.SetQualityLevel`, `Application.targetFrameRate` 60 or 30).
The thresholds of each tier are starting values [added]: tune them from device captures. Tests:
`test_live_tiers.py`; `test_live_monetization.py` (`tiers.director_playmode`: PlayMode
`TierDirectorTests`). Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. `MobileTierDirector` in
Play mode: forced Low set `Mobile_Low` and `targetFrameRate` 30, forced High `Mobile_High` and 60
(2/2); `Holder.Instance` gave no active Adaptive Performance in the Editor (no provider), so the
thermal policy runs only where a provider reports (Android), and its logic is proven by the EditMode
`ThermalPolicy` tests. `Mobile_High_RPAsset` and `Mobile_Low_RPAsset` created, Quality levels
`Mobile_High` (renamed from Mobile), `PC`, `Mobile_Low` written to
`ProjectSettings/QualitySettings.asset` (checked in the YAML), Android and iPhone default =
Mobile_Low, PC excluded from both; renderer: forward, depth priming disabled, native render pass on,
copy depth after transparents, intermediate auto. Audit after: 0 errors, 0 warns, 4 infos. Captures
of the 400-cube benchmark at each tier: no flags (mean luma 0.50, saturation 0.32), contact sheet
and a 1:1 crop opened: the far rows lose their shadows on Mobile_Low (25 m shadow distance vs 40 m)
and edges are harder (MSAA off); `ut_review.compare`: 3.2% of pixels changed. Profiled draw calls:
783 (High) vs 563 (Low). One capture job hung at 0% CPU during domain load while the machine's load
average was about 60 (Mono `AssemblyResolve` recursion under `MonoManager::AnalyzeDomain`, seen with
`sample <pid>`); stopped by PID (our own editor) and the rerun passed. If a job's log stops after
`Registered in ... seconds` and the process sits at 0% CPU for minutes, sample it, stop it by PID
and rerun.

Thermal policy without a hot phone (PlayMode
`TierDirectorTests.SyntheticThermalEventsDriveLodBiasAndRenderScale`):
`var d = go.AddComponent<MobileTierDirector>(); d.simulate = true; d.Feed(2, 0.9f, 0.4f, PerformanceBottleneck.GPU);`
then frames. `ThermalPolicy.Step` steps down at once and up only after `thermalCoolSeconds` of calm
cooling; `LodBias` 1 / 0.75 / 0.5 (doc sample); `RenderScale(level, bottleneck, base, floor)` lowers
the URP render scale (x0.85, x0.7, floor 0.7 [added]) only when the bottleneck is GPU or unknown,
since resolution barely helps a CPU-bound frame (6.3 Manual). On device, `Feed` comes from Adaptive
Performance `ThermalEvent` and `PerformanceBottleneckChangeEvent`. Result (v0.2, 2026-09-24): pass,
PlayMode 4/4. Throttling + GPU: lodBias 0.5, Mobile_High scale 0.9 -> 0.7 (floor); cooling: back to
level 0, scale 0.9; Throttling + CPU: lodBias 0.5, scale kept at 0.9; a switch to Mobile_Low while
hot scaled Low from ITS base (0.75 -> 0.7) and gave High its 0.9 back; after destroy both assets
read their own scale (0.9, 0.75) and the files on disk were unchanged. First attempt failed in a
useful way: the director read its base from `GraphicsSettings.currentRenderPipeline` right after
`SetQualityLevel` and got the PREVIOUS level's asset (base 0.75 on High), so it would have written
Low's scale into High on destroy; it now tracks `QualitySettings.renderPipeline` per asset.

## M3. Texture import audit and ASTC fix, proven on the imported data

```python
F = ["Assets/Art/Textures"]
caps = {"default": 1024, "large": 1024, "ui": 512, "normal": 1024, "hdr": 256}
a = ut_run.run_method(P, "AgentKit.Mobile.MobileTextures.AuditTextures", {"folders": F, "caps": caps}, build_target="Android")
ut_run.run_method(P, "AgentKit.Mobile.MobileTextures.FixTextures", {"folders": F, "caps": caps,
    "formats": {"default": "ASTC_6x6", "ui": "ASTC_4x4", "normal": "ASTC_6x6", "large": "ASTC_8x8", "hdr": "ASTC_HDR_6x6"}}, build_target="Android")
for target in ("Android", "iOS"):     # what the device format really is: Texture2D.format + Profiler.GetRuntimeMemorySizeLong
    ut_run.run_method(P, "AgentKit.Mobile.MobileTextures.ImportedFormats", {"folders": F}, build_target=target)
```

Core of the fix (`MobileTextures.FixTextures`):
`var s = ti.GetPlatformTextureSettings("Android"); s.overridden = true; s.format = TextureImporterFormat.ASTC_6x6; s.maxTextureSize = cap; ti.SetPlatformTextureSettings(s); ti.SaveAndReimport();`
inside `AssetDatabase.StartAssetEditing()`/`StopAssetEditing()`; plus Read/Write off, mipmaps off
for Sprite/UI, crunch off when the format is ASTC. The audit reads the **effective** format
(`s.overridden ? s.format : ti.GetAutomaticFormat(platform)`), because the default tab says nothing
about the device. Test: `test_live_textures.py` (six generated textures with careless settings).
Result: run in Unity 6000.3.21f1 on 2026-09-24: pass. Before: 2 errors (the RGBA32 override on
Android and iPhone), 5 warns (UI mipmaps, Read/Write, 2048 over the 1024 cap, HDR fallback, ETC2),
crunch-on-ASTC info. Imported on Android before: `bg_uncompressed_1024` RGBA32 5,462 KB (with mips),
an HDR sky with no override imported as ETC2_RGBA8 on Android and ASTC_6x6 (LDR) on iOS: the HDR
range is silently lost without an explicit ASTC HDR override; LDR textures without overrides
resolved to ASTC_6x6 (Android default format ASTC). After the fix: 0 findings; Android and iOS
imports all ASTC (bg 612 KB, env 2048 -> ASTC 8x8 at 1024: 342 KB, UI 512 ASTC 4x4 without mips: 257
KB, larger than 6x6 by design, HDR sky ASTC_HDR_6x6 21 KB); total 8.66 MB -> 1.95 MB. The 600x400
Default texture imported at 512x512 (NPOT scale To Nearest). The iOS job took 61 s (platform switch
reimport).

## M4. Safe-area component, tested at several notch layouts

```python
t = ut_run.run_tests(P, "EditMode", filter="SafeAreaTests")                 # math + fitter at 5 layouts
c = ut_run.run_method(P, "AgentKit.Mobile.MobileUi.CaptureSafeArea", {"scale": 3, "layouts": [
      {"name": "portrait_notch", "screen": [1179, 2556], "safe": [0, 102, 1179, 2277]},
      {"name": "landscape_notch", "screen": [2556, 1179], "safe": [177, 63, 2202, 1116]},
      {"name": "android_punch_hole", "screen": [1080, 2400], "safe": [0, 0, 1080, 2280], "cutouts": [[500, 2310, 80, 80]]}]},
    graphics=True, build_target="Android")
# then contact_sheet(c["result"]["images"]) and LOOK: red = unsafe margins, orange = cutout, green = fitted panel
```

Runtime (`scripts/Runtime/SafeAreaFitter.cs`, `SafeAreaMath.cs`): one full-stretch panel under the
HUD canvas; `anchorMin = safe.min / screen`, `anchorMax = safe.max / screen`, offsets zero; reads
`UnityEngine.Device.Screen.safeArea` (Device Simulator aware) and re-applies when the safe area,
resolution or orientation changes; `Simulate(safe, screen)` for tests. UI Toolkit:
`top = Screen.height - safeArea.yMax`. The layouts are synthetic (Dynamic-Island-like insets 177/102
px portrait and 177/177/63 px landscape, a punch hole): the Device Simulator's device definitions
remain the authority for real devices. Test: `test_live_safearea.py`. Result: run in Unity
6000.3.21f1 on 2026-09-24: pass. EditMode 10/10 (anchors, insets, UI Toolkit flip: the doc's
one-liner gives 2454 instead of 177, fitter world rect equals the safe rect within 0.5 px at 5
layouts, ignoreBottom, naive element blocked). Captures (graphics, world-space canvas rendered with
`AgentCapture.RenderCamera`): fitted HUD 0 blocked elements at all 3 layouts; naive HUD 10 blocked
(4 portrait, 4 landscape, 2 punch hole); no image flags; contact sheet opened: red margins and the
orange cutout clear of every fitted element.

## M5. Touch: EnhancedTouch, floating stick, on-screen controls

```python
p = ut_run.run_tests(P, "PlayMode", filter="TouchInputTests")      # InputTestFixture: virtual Touchscreen, no device
h = ut_run.run_method(P, "AgentKit.Mobile.MobileUi.BuildTouchHud", {"prefab": "Assets/UI/TouchHUD.prefab", "movement_range": 50}, build_target="Android")
h["result"]["bindings"]            # which project-wide actions bind <Gamepad>/leftStick and <Gamepad>/buttonSouth
```

PlayMode test pattern (`tests/code/unity-mobile/unity/Tests/PlayMode/TouchInputTests.cs`):
`class T : InputTestFixture`;
`var ts = InputSystem.AddDevice<Touchscreen>(); EnhancedTouchSupport.Enable(); BeginTouch(1, pos, screen: ts); MoveTouch(...); EndTouch(...)`
then assert `Touch.activeTouches`. For an `OnScreenStick`: create it inactive, set `controlPath`,
`movementRange`, `behaviour`, activate (OnEnable creates the virtual Gamepad), call
`OnPointerDown`/`OnDrag` with a `PointerEventData`, `InputSystem.Update()`, read
`Gamepad.current.leftStick`. Test: `test_live_touch.py`. Result: run in Unity 6000.3.21f1 on
2026-09-24: pass. PlayMode 4/4: EnhancedTouch Began/Moved/Ended with `activeTouches`;
FloatingTouchStick (one finger, left zone, 75 px of a 150 px radius = 0.5, clamp at 1, start clamped
to (150,150) at a screen edge, second finger ignored); `OnScreenStick` with movementRange 50: a
25-unit drag sends 0.5 raw (radius, not the doc's edge length) and reads 0.469 through the Gamepad's
default stick deadzone (0.125..0.925); `OnScreenButton` presses `<Gamepad>/buttonSouth`. EditMode
touch math 2/2. `BuildTouchHud`: prefab saved, Constant Physical Size, `<Gamepad>/leftStick` bound
by Player/Move and `<Gamepad>/buttonSouth` by Player/Jump in the template's project-wide actions.
v0.2: hide the touch HUD only when `TouchControlsVisibility.RealGamepadConnected()`: the on-screen
controls' own Gamepad is added from managed code with the usage "OnScreen" (Input System 1.20
`OnScreenControl` source), so a plain "a Gamepad connected" check hides the HUD the moment it
appears. PlayMode `VirtualGamepadIsNotARealGamepad`: on-screen Gamepad native false with usage
OnScreen, not counted; `InputSystem.AddDevice<Gamepad>()` counted. Result: PlayMode 5/5 (run in
Unity 6000.3.21f1 on 2026-09-24). A first version reported a native device through
`InputTestFixture.runtime`, which is internal in Input System 1.20 (CS0103): the test uses a
plugged-in managed Gamepad instead.

## M6. Frame timing against the mobile budget (Editor proxy)

```python
ut_run.run_method(P, "AgentKit.Mobile.MobileTiers.SetEditorQuality", {"name": "Mobile_Low"}, build_target="Android")
r = ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings", {"scene": "Assets/Scenes/MobileBench.unity", "frames": 300,
        "warmup": 60, "target_fps": 30, "width": 1600, "height": 720, "out_csv": "/abs/profile_low.csv"},
        quit=False, graphics=True, build_target="Android", timeout=900)
v = ut_mobile.budget_verdict("/abs/profile_low.csv", fps=30)      # raw 33.33 ms and sustained 21.67 ms (65%)
v["sustained"]["verdict"], v["sustained"]["p95"], v["gc"]
```

The device verdict needs a development player on the lowest phone
(`BuildOptions.Development | BuildOptions.ConnectWithProfiler`, Autoconnect Profiler, iOS ports
54998 to 55511), a 20 to 30 minute soak [added length], 10 to 15 minute cooldown between captures:
not runnable here (no device). What the agent prepares for that run:

```python
# scene: one GameObject with MobileTierDirector and DeviceSoakLogger (director assigned; interval 10 s)
ut_run.run_method(P, "AgentKit.Mobile.MobileBuild.BuildAndroid", {"out": "Builds/Android/Soak.aab", "development": True, "apply": {...}},
                  build_target="Android", env=ut_mobile.keystore_env(ks))   # development also sets Frame Timing Stats
# human: install, play the heaviest scene 20 to 30 min, then  adb pull /sdcard/Android/data/<id>/files/soak_<stamp>.csv
v = ut_mobile.soak_verdict("soak.csv", fps=30)     # last 5 min vs first 5 min, rows over 21.67 ms, max thermal warning, battery temp
```

`DeviceSoakLogger` writes one row per interval: fps, CPU and GPU p95 and max from
`FrameTimingManager`, Adaptive Performance warning, temperature level and trend, bottleneck, battery
level and temperature (Android, [added]), Quality level, lodBias, render scale. `soak_verdict`: pass
(last window p95 under 65%, no Throttling), warn (over the sustained budget or ThrottlingImminent),
fail (Throttling or over the raw frame time), too_short under 20 minutes. Result (v0.2): PlayMode
`SoakLoggerWritesRows` pass (header and one row per 0.25 s); that Editor CSV parsed as too_short
with 7 rows; batch `-nographics` Play mode runs uncapped (about 35,000 fps, CPU p95 0.03 ms), so it
proves the format only. Offline: a synthetic 30-minute heating session (14 -> 26 ms,
ThrottlingImminent at 900 s) gave warn with the first warning at 900 s. Not run on a device. Test:
`test_live_profile.py`. Result: run in Unity 6000.3.21f1 on 2026-09-24: pass (Editor proxy).
Mobile_Low at 30 fps: CPU frame p50 1.21 ms, p95 4.12 ms, max 85.7 ms (1 hitch in 300 frames),
sustained verdict pass against 21.67 ms; 563 draw calls, 4 SetPass (SRP Batcher), 8.8k triangles.
Mobile_High at 60 fps: p50 1.22, p95 1.90, max 44.1 ms (1 hitch), pass against 10.83 ms; 783 draw
calls, 5 SetPass. GC 168 B per frame (Editor baseline). GPU frame time 0 and Render Thread missing
in the Editor (lead trap O8). Three runs of the same content on this shared Mac (other agents'
editors running, load average 60 to 120): Mobile_High p95 1.90, 2.59 and 11.72 ms, max 44.1, 9.1 and
71.5 ms; the sustained verdict flipped from pass to warn with nothing changed, while draw calls (783
/ 563) and SetPass (5 / 4) stayed identical. Counters are the stable Editor evidence; timings on a
loaded Mac are noise, and none of it says anything about a phone: the device soak is Assumed.

## M7. Android App Bundle from the command line, signed with a keystore made here

```python
import secrets
pw = secrets.token_urlsafe(18)                                   # keep in memory: never in args.json, never in git
ks = ut_mobile.make_keystore(P + "/Keystores/upload.keystore", "upload", pw)    # Unity's OpenJDK keytool -genkeypair
b = ut_run.run_method(P, "AgentKit.Mobile.MobileBuild.BuildAndroid",
        {"out": "Builds/Android/Game.aab", "apply": {"app_id": "com.company.game", "version": "1.0.0", "version_code": 1,
         "min_api": 25, "target_api": 36, "texture_formats": ["ASTC", "ETC2"], "symbols": "symbol_table"}},
        build_target="Android", env=ut_mobile.keystore_env(ks), timeout=5400)
ut_mobile.aab_facts(P + "/Builds/Android/Game.aab")      # base module vs 200 MB, ABIs, embedded symbols, signed
ut_mobile.signer_of(P + "/Builds/Android/Game.aab")      # jarsigner: which certificate signed it
ut_mobile.bundletool_sizes(P + "/Builds/Android/Game.aab", "/abs/out")   # Play download MIN/MAX + bundletool validate
```

Signing lines in the same process as the build (`MobileBuild.ConfigureSigning`):
`PlayerSettings.Android.useCustomKeystore = true; keystoreName = env AGENT_KEYSTORE; keystorePass = env AGENT_KEYSTORE_PASS; keyaliasName = env AGENT_KEY_ALIAS; keyaliasPass = env AGENT_KEY_PASS;`
then
`BuildPipeline.BuildPlayer(new BuildPlayerOptions { target = BuildTarget.Android, locationPathName = ".../Game.aab" })`
with `EditorUserBuildSettings.buildAppBundle = true`, IL2CPP, `AndroidArchitecture.ARM64`,
`AndroidSdkVersions.AndroidApiLevel36`,
`UnityEditor.Android.UserBuildSettings.DebugSymbols.level = DebugSymbolLevel.SymbolTable` and
`.format = IncludeInBundle | Zip` (`Unity.Android.Types`, compiled under `UNITY_ANDROID`). A release
build without the passwords refuses before building. Test: `test_live_android_build.py`. Result: run
in Unity 6000.3.21f1 on 2026-09-24: pass. Keystore made with Unity's OpenJDK keytool (PKCS12, RSA
2048, random password held in memory). Guard: the same job with the keystore but no passwords in the
environment refused in 12 s with the reason, before building. Build: Succeeded in 418 s (435 s job,
first IL2CPP build; 111 s and 90 s incremental in later full runs; the longest steps were
Postprocess built player 183 s and Building Gradle project 112 s), IL2CPP, ARM64, API 25 to 36,
GameActivity, Vulkan + OpenGLES3, symbols SymbolTable in bundle + zip. AAB 53.85 MB: base module
27.37 MB compressed (93.0 MB uncompressed, under 200 MB), `BUNDLE-METADATA` debug symbols 19.48 MB
(libil2cpp, libunity, libmain, libgame, burst: not downloaded by players), install-time
`UnityTextureCompressionsAssetPack` 6.61 MB (ASTC + ETC2 targeting) and `UnityDataAssetPack` 0.23
MB; ABIs `arm64-v8a` only; `jarsigner -verify` ok, signer CN = Agent Test (the generated key).
bundletool 1.17.2: `get-size total` 28.88 MB (MIN and MAX), `validate` ok. The BuildReport's
`totalSize` said 789.8 MB for this 53.9 MB bundle: never use it as the Android size. A new batch
process afterwards: `useCustomKeystore` true, path and alias kept, both passwords empty (the 6.3
Manual's rule, observed). Then the lead's generic `ut_run.build(P, "android")` (no passwords) on
that project failed in 18 s with Unity's own message:
`UnityException: Can not sign the application / Unable to sign the application; please provide passwords!`

Store gates on the built bundle (v0.2):
`g = ut_mobile.aab_findings(ut_mobile.aab_facts(aab), ads=True, download_budget_mb=150, download_mb=sizes["download_max_mb"])`
checks Development Build (`debuggable` in the proto manifest), 16 KB pages (every `.so` PT_LOAD
`p_align` >= 0x4000), symbols, ABIs, base size, the download budget, and AD_ID when an ads SDK reads
the advertising ID; `aab_facts` also lists permissions, GameActivity and each asset pack's delivery
mode (install-time packs still count toward the install; move content over budget to fast-follow or
on-demand Play Asset Delivery packs). `ApplyAndroidRelease` now sets an explicit graphics API list
(default Vulkan, OpenGLES3; Auto off) and Render outside safe area on. Result (v0.2, re-read of the
same AAB, no rebuild): pass, 0 gate findings; all six libraries (`libunity`, `libil2cpp`, `libmain`,
`libgame`, `lib_burst_generated`, `libc++_shared`) aligned 0x4000; not debuggable; GameActivity;
permissions INTERNET, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC; both Unity packs
install-time; download 28.9 MB against a 150 MB budget; with `ads=True` the gate adds
`mobile.aab.no_ad_id`. `ApplyAndroidRelease` live: graphics APIs [Vulkan, OpenGLES3], Auto false,
Render outside safe area true. Tried and dropped: an `AndroidProjectFilesModifier` adding AD_ID
through `projectFiles.UnityLibraryManifest.Manifest.AddUsesPermission` does not compile in
6000.3.21f1 (CS1061: `AndroidProjectFiles` has no public `UnityLibraryManifest`), which matches the
6.3 Manual note that the modifier edits custom modules only; permissions come from the SDK's own
setting (LevelPlay Developer Settings > Declare AD_ID Permission, applied by its
`IPostGenerateGradleAndroidProject` hook, read in the 9.5.1 source: clean-build after changing it)
or a plug-in manifest, and are verified in the built bundle.

## M8. iOS Xcode project export (no signing, no upload)

```python
ut_mobile.write_privacy_manifest(P + "/Assets/Plugins/PrivacyInfo.xcprivacy",        # keeps Unity's reasons for the category
                                 {"NSPrivacyAccessedAPICategoryFileTimestamp": ["C617.1"]})  # -> 0A2A.1 + C617.1
b = ut_run.run_method(P, "AgentKit.Mobile.MobileBuild.BuildIos", {"out": "Builds/iOS", "apply": {"bundle_id": "com.company.game",
        "version": "1.0.0", "build_number": "1", "target_os": "15.0"}}, build_target="iOS", timeout=5400)
x = ut_mobile.xcode_facts(P + "/Builds/iOS")              # size per part, targets, Info.plist, every PrivacyInfo.xcprivacy + reasons
c = ut_mobile.xcode_compile_unsigned(P + "/Builds/iOS")   # optional: xcodebuild ... CODE_SIGNING_ALLOWED=NO build
```

Post-process (`MobileXcodePostprocess`, `IPostprocessBuildWithReport`, `#if UNITY_IOS`):
`PBXProject.GetPBXProjectPath(out)`, `GetUnityMainTargetGuid()` for app settings,
`GetUnityFrameworkTargetGuid()` for `AddFrameworkToProject`, `PlistDocument` for Info.plist keys
listed explicitly in `Assets/AgentMobile/ios_postprocess.json`. Signing (team, provisioning),
`xcodebuild archive`, `-exportArchive` and the upload need the user's Apple account: the agent stops
and hands over. Test: `test_live_ios_build.py`. Result: run in Unity 6000.3.21f1 on 2026-09-24: pass
for the export. Before the manifest, `code_scan` flagged `File.GetLastWriteTimeUtc` in the sample
(`mobile.ios.privacy_timestamp`); after writing `Assets/Plugins/PrivacyInfo.xcprivacy` it cleared.
Export: Succeeded in 166 s (182 s job, Replace; 19 s and 15 s incremental in later full runs),
Device SDK, iOS 15.0, Strip Engine Code, Minimal stripping, Fast but no exceptions, .NET Standard
2.0. Project on disk 966 MB: `Il2CppOutputProject` 729 MB, `Libraries` 220 MB, `Data` 16 MB,
`Classes` 0.6 MB; targets Unity-iPhone, UnityFramework, GameAssembly, Unity-iPhone Tests; deployment
target 15.0; `UIRequiresFullScreen` true. Post-process report: main target GUID
`1D6058900D05DD3D006BFB54`, framework target GUID `9D25AB9C213FB47800354C27`, StoreKit.framework
added to UnityFramework, `NSUserTrackingUsageDescription` added. Consolidated
`UnityFramework/PrivacyInfo.xcprivacy`: SystemBootTime 35F9.1, DiskSpace E174.1, UserDefaults
CA92.1, FileTimestamp C617.1. Merge rule (`test_live_privacy_merge.py`, three incremental exports of
30 to 36 s): without a project manifest the consolidated FileTimestamp reasons are Unity's
`0A2A.1, C617.1`; with a project manifest declaring FileTimestamp `C617.1` only they become `C617.1`
(Unity's `0A2A.1` dropped: a category you declare replaces Unity's entry); with
`write_privacy_manifest(..., keep_unity_reasons=True)` (the default) both survive. Not run:
`xcodebuild` of the exported project refused with "Found no destinations for the scheme
'Unity-iPhone'" because the iOS 26.5 platform component is not installed in Xcode 26.6 (Xcode >
Settings > Components; the SDK alone is listed), so whether 6000.3.21f1's project compiles on Xcode
26.6 is still unverified; signing, archive and upload need the user's Apple account.

Store gates and the archive plan (v0.2): `ut_mobile.xcode_findings(x, ads=True, tracking=True)`
(consolidated privacy manifest, SKAdNetworkItems, NSAllowsArbitraryLoads for ad networks,
third-party SDK manifests, ATT usage text); `plan = ut_mobile.ios_archive_plan(folder, team_id)`
writes two ExportOptions.plist files and returns the commands to show the human:

```bash
xcodebuild -project Builds/iOS/Unity-iPhone.xcodeproj -scheme Unity-iPhone -configuration Release -destination generic/platform=iOS \
  -archivePath out/Unity-iPhone.xcarchive -allowProvisioningUpdates DEVELOPMENT_TEAM= <team >archive
xcodebuild -exportArchive -archivePath out/Unity-iPhone.xcarchive -exportPath out/appstore -exportOptionsPlist out/ExportOptions-appstore.plist -allowProvisioningUpdates
xcodebuild -exportArchive -archivePath out/Unity-iPhone.xcarchive -exportPath out/thinning -exportOptionsPlist out/ExportOptions-thinning.plist -allowProvisioningUpdates
```

The App Store export uses method `app-store-connect`; the size export uses `release-testing` with
`thinning` = `<thin-for-all-variants>`, which writes `App Thinning Size Report.txt` (per-device
download and install sizes; `ut_mobile.app_thinning_report(path)` reads the largest download against
200 MB). Method names and the thinning key were checked with `xcodebuild -help` on Xcode 26.6
(app-store, ad-hoc and development are the deprecated aliases). Result (v0.2, re-read of the same
export): pass, 0 gate errors with tracking (ATT text present from the post-process); with
`ads=True`: `mobile.ios.no_skadnetwork` (warn), `mobile.ios.ats` and `mobile.ios.sdk_privacy`
(infos), expected since no ad SDK is installed; plan written, not run (needs the user's Apple team
and certificates); the thinning parser is tested on a synthetic report only [added layout].

## M9. Purchases and rewarded ads that cannot double-grant

```python
ut_run.run_tests(P, "EditMode", filter="MonetizationTests|TierAndThermalTests")
```

Core (`scripts/Runtime/Monetization.cs`, `PurchaseLedger.HandlePending`):

```csharp
if (m_Confirmed.Contains(tx)) return PendingOutcome.AlreadyConfirmed;
if (!m_InFlight.Add(tx)) return PendingOutcome.DuplicateIgnored;          // two callbacks for one order
if (m_Store.IsGranted(tx)) { confirm(); return PendingOutcome.ConfirmedWithoutRegrant; }   // crash between grant and confirm
if (!grant(productId)) { m_InFlight.Remove(tx); PurchaseInProgress = false; return PendingOutcome.GrantFailed; }  // no confirm: redelivered
m_Store.MarkGranted(tx, productId); confirm(); return PendingOutcome.Granted;               // grant first, then confirm
```

Adapters: `scripts/Runtime/Iap5/Iap5Store.cs` (IAP 5: `UnityIAPServices.StoreController()`, every
event subscribed before `await Connect()`, `FetchProducts` then `FetchPurchases`, pending orders
from `OnPurchasesFetched` through the same path, `ConfirmPurchase(pendingOrder)`, `FailedOrder`
retry with the kept order, `DuplicateTransaction` treated as confirmed, `RestoreTransactions` for
the iOS button) and `scripts/Runtime/LevelPlay9/LevelPlayAds.cs` (listeners before `LevelPlay.Init`,
ad objects in `OnInitSuccess`, `IsAdReady()` + `IsPlacementCapped`, `RewardGate` in `OnAdRewarded`,
reload on close). Each lives in its own asmdef gated by `versionDefines` (IAP >= 5.0.0, LevelPlay >=
9.0.0), so a project on the 4.15.1 / 8.10.1 defaults skips them instead of failing every batch job.
IAP 5 order (`Iap5Store.InitializeAsync`, from the docs and szS2KMxZsl4):
`await UnityServices.InitializeAsync()`; `var sc = UnityIAPServices.StoreController()`; subscribe
`OnStoreConnected`, `OnStoreDisconnected`, `OnProductsFetched` (then `sc.FetchPurchases()`),
`OnProductsFetchFailed`, `OnPurchasesFetched` (confirmed orders = entitlements, pending orders into
the same `Process`), `OnPurchasesFetchFailed`, `OnPurchasePending` (`Process`),
`OnPurchaseConfirmed` (`ConfirmedOrder` done; `FailedOrder` keep the `PendingOrder` for
`RetryConfirmations`, except `DuplicateTransaction`), `OnPurchaseFailed`, `OnPurchaseDeferred`;
`await sc.Connect()`; `sc.FetchProducts(defs)`; buy with
`sc.PurchaseProduct(sc.GetProductById(id))`. v0.2: `validate(PendingOrder)` runs before the grant
(Google:
`new CrossPlatformValidator(GooglePlayTangle.Data(), Application.identifier).Validate(order.Info.Receipt)`;
Apple receipts arrive validated by StoreKit 2; server validation for server-granted currency); an
invalid receipt is neither granted nor confirmed and raises `InvalidReceipt`; `PriceString(id)`
returns `metadata.localizedPriceString`; `OnAppleJws(productId, order.Info.Apple.jwsRepresentation)`
feeds attribution SDKs after the grant. `LevelPlayAds.Init(gdprConsent, ccpaOptOut, coppaChild)`
sets `LevelPlayPrivacySettings.SetGDPRConsent / SetCCPA / SetCOPPA` before `LevelPlay.Init`
(`LevelPlay.SetConsent` is `[Obsolete]` in 9.5.1, read in the source); call it only when
`AdsInitGate.CanInitAds(consent, required, milestone)`; `AdPacing` keeps the store, interstitials
and rewarded offers out of the first `MonetizationFreeSeconds` (600) unless the player is stuck
(`StuckFailures` 5). Tests: `test_live_monetization.py`, `test_live_packages.py` (isolated clone
`_pkgcheck` with IAP 5.4.3 and LevelPlay 9.5.1). Result: run in Unity 6000.3.21f1 on 2026-09-24:
pass. EditMode 14/14 (grant-then-confirm order, duplicate pending, fetched + pending paths, crash
between grant and confirm, failed confirmation retried without regrant, grant failure not confirmed,
deferred and failed reset the flag, no revoke on an untrustworthy fetch, one reward per show in any
order, interstitial pacing, tier and thermal policy). `Iap5Store` and `LevelPlayAds` compiled with 0
errors and 0 warnings against IAP 5.4.3 and LevelPlay 9.5.1 resolved from the registry in the
isolated clone; in the main project (no packages) their assemblies were skipped and nothing broke.
Read from the IAP 5.4.3 source: `ConfirmPurchase` fails fast on an empty TransactionID or a
disconnected store; confirmed orders fetched later may carry an empty TransactionID for consumables;
an order Google already acknowledged comes back as `FailedOrder(DuplicateTransaction)`. Not run
against a store (no device, no store products). v0.2 result: EditMode 20/20 (adds invalid receipt,
monetization-free window and stuck offers, consent and milestone gate, render scale by bottleneck,
exit state codec, startup report); both adapters recompiled with 0 errors and 0 warnings against IAP
5.4.3 and LevelPlay 9.5.1 (`InvalidReceipt`, `OnAppleJws`, `localizedPriceString`, `SetGDPRConsent`,
`SetCCPA`, `SetCOPPA` present in the built assemblies).

## M10. Offline helpers

`ut_mobile.code_scan`, `aab_facts`, `xcode_facts`, `budget_verdict`, `write_png`, `write_hdr`,
`write_privacy_manifest` on synthetic inputs, plus byte-compilation of every script. Test:
`test_offline.py`. Result: run with system python3 on 2026-09-24 (no Unity): pass, 42 checks (7 of
the 12 `code_scan` rules on fixtures plus negative cases: clean handlers, a nested project,
reload-only lambdas; AAB and Xcode parsers, writers, budget verdict, byte-compilation of every
script). v0.2: pass, 72 checks: 15 of the 20 `code_scan` rules on fixtures with negative cases (a
guarded test-suite call, the `yMax` form), ELF 16 KB alignment on synthetic 16 KB and 4 KB
libraries, proto-manifest permissions, debuggable and pack delivery, `aab_findings` and
`xcode_findings`, the archive plan and ExportOptions, the thinning report parser, `package_check`
(IAP 4, LevelPlay 8, legacy ads; LevelPlay 9 settings and adapter XMLs not flagged; pre-9 code
flagged), `soak_verdict`, `write_wav`, plus the store gates re-run on the real AAB and Xcode export
when present.

## M11. Audio, meshes, import rules and startup (v0.2)

```python
A = ["Assets/Audio"]
ut_run.run_method(P, "AgentKit.Mobile.MobileAudio.AuditAudio", {"folders": A}, build_target="Android")
ut_run.run_method(P, "AgentKit.Mobile.MobileAudio.FixAudio", {"folders": A, "stereo_ok": ["Assets/Audio/ui_sting.wav"]}, build_target="Android")
ut_run.run_method(P, "AgentKit.Mobile.MobileAudio.ImportedAudio", {"folders": A}, build_target="Android")   # imported size per clip
ut_run.run_method(P, "AgentKit.Mobile.MobileAudio.AuditMeshes", {}, build_target="Android")                 # Read/Write, mesh compression
# lock the rules for assets added later (first import only; nothing changes without this file):
json.dump({"folders": ["Assets/Art", "Assets/Audio"], "ui_folders": ["Assets/Art/UI"], "large_min": 2048,
           "formats": {...}, "caps": {...}, "audio": True, "sfx_rate": 22050, "meshes_read_write_off": True},
          open(P + "/Assets/AgentMobile/import_rules.json", "w"))
ut_run.run_method(P, "AgentKit.Mobile.MobileStartup.AuditStartup", {}, build_target="Android")             # Resources index, first-scene callbacks
```

Rules (Unity mobile e-book, Audio): WAV sources; the clip's source size picks the bucket [added
reading of "clip size"]: under 200 KB Compressed In Memory + ADPCM with a 22,050 Hz override and
Force To Mono (unless listed in `stereo_ok`), 200 to 400 KB Compressed In Memory + Vorbis, over 400
KB Streaming + Vorbis (Streaming costs about 200 KB per stream). `MobileImportRules` (an
`AssetPostprocessor`, j4YAY36xjwE [00:19:07]) applies the same texture categories as `FixTextures`
and the same audio buckets in `OnPreprocessTexture` / `OnPreprocessAudio` / `OnPreprocessModel`,
only when `assetImporter.importSettingsMissing`, so later deliberate edits stand. `AuditStartup`
counts files under every `Resources` folder (info from 300, warn from 1,000 [added thresholds]; each
is indexed at launch, j4YAY36xjwE [00:33:59]) and lists project components with Awake, OnEnable or
Start in the first scene. Test: `test_live_assets.py`. Result: run in Unity 6000.3.21f1 on
2026-09-24: pass. Audio before: 5 warns (Streaming a 52 KB SFX, Decompress On Load on a 3.4 MB music
loop, PCM, 44.1 kHz SFX) and 1 info (stereo SFX); after `FixAudio`: 0 findings; imported size 3.62
MB -> 0.06 MB (music 3,445 KB PCM -> 57 KB Vorbis Streaming; dialog 258 KB -> 5 KB; SFX mono 22,050
Hz ADPCM 3.8 KB; synthetic sine tones compress far better than real audio, so read the direction,
not the ratio). Imported size comes from the importer's internal `compSize` (the inspector's
Imported Size); `Profiler.GetRuntimeMemorySizeLong(AudioClip)` reported about 0.6 KB for every clip
in the Editor whatever the settings (observed), so it is not used. Import rules: a new 2048 px
texture, a new UI PNG and a new stereo WAV dropped after `import_rules.json` arrived as ASTC 8x8 at
1024, Sprite ASTC 4x4 at 512 without mips, and mono ADPCM at 22,050 Hz, with 0 audit findings and no
fix pass (`GetSourceTextureWidthAndHeight` works inside `OnPreprocessTexture`). Meshes: a generated
OBJ imported with Read/Write off by default (observed); forced on with Medium compression it gave
`mobile.mesh.readable` and `mobile.mesh.compression`. Startup: 320 files under a Resources folder
gave the info finding; a boot scene with `SaveGameSample` listed its Awake.

## M12. Android startup and exit diagnostics, ANR triage (v0.2)

```csharp
// first interactive frame of a loader-based game (Unity reported "fully drawn" before the first Awake):
StartupReport.Interactive();                              // DiagnosticsReporting.CallReportFullyDrawn, first call only
// on state changes (not per frame): what the game was doing if Android kills it
ExitInfo.SetState(GameStateFlags.InGameplay | GameStateFlags.AdShowing, "level_03");   // <= 128 bytes
// next launch: why did the last process die?
var prev = ExitInfo.Previous();   // reason "ANR" / "Crash" / "LowMemory" ..., flags and label decoded
```

Engine calls (Unity 6 `UnityEngine.Android`, names read from the 6000.3.21f1 API documentation):
`ApplicationExitInfoProvider.GetHistoricalProcessExitInfo(Application.identifier, 0, 1)`,
`SetProcessStateSummary(sbyte[])`,
`IApplicationExitInfo.reason / timestamp / description / processStateSummary`. Compiled under
`UNITY_ANDROID`, guarded with `Application.isEditor`. ANR triage (Unity Android team, pezwIhA0e04
[00:13:13] to [00:19:19], [00:29:02], [00:41:40]): `nativePollOnce` means read the frames below it;
a pause frame means your `OnApplicationPause` code; Unity SendMessage means a Java or Kotlin SDK
over JNI; Binder means a native plug-in; WebView means heavy ad content, not the SDK. Then: diff the
release where the rate jumped; exclude low-end devices that bring many ANRs and little revenue in
Play Console; use the exit reason and the state summary when a stack is vague. Keep the ANR rate
under the Android vitals thresholds, overall and per device. Test: `test_live_monetization.py`
(EditMode `ExitStateTests`) and the Android-target compile of every job. Result: run in Unity
6000.3.21f1 on 2026-09-24: pass; state summary round-trips flags and label and truncates at 128
bytes; `StartupReport` counts only the first call; `ExitInfo.Previous()` returns "none" in the
Editor; the Android calls compiled with 0 errors (`ApplicationExitInfoProvider`,
`CallReportFullyDrawn` present in the runtime assembly). Not run on a device.

## M13. Device and store hand-over (the checklist the agent writes for the human)

1. **Soak:** development build with `DeviceSoakLogger` and `MobileTierDirector` (M6), heaviest
   scene, 20 to 30 minutes per tier on the lowest phone, 10 to 15 minutes of cooldown between runs;
   `soak_verdict` on the pulled CSV. Also `adb shell dumpsys thermalservice` for the OS thermal
   status [added].
2. **Native tools where the Unity Profiler is blind:** Xcode Instruments (Time Profiler for startup
   under the splash and the PlayerLoop, Metal frame capture), Snapdragon Profiler, RenderDoc or
   Xcode for GPU passes (j4YAY36xjwE [00:02:29], [00:04:26]; 6.3 Manual, URP performance). Classify
   the bound with `Gfx.WaitForPresent` vs `Gfx.WaitForCommands`.
3. **Android vitals:** ANR and crash rates per version and device, symbolicated stacks (symbols in
   the first bundle), triage with M12.
4. **Money:** sandbox purchase, kill the app between purchase and confirm, relaunch (one grant),
   restore after reinstall, Ask to Buy or pending payment; LevelPlay test suite
   (`SetMetaData("is_test_suite","enable")` before init, `LaunchTestSuite()` after), register test
   devices, then remove the test-suite and `ValidateIntegration` calls (GvIpY8yE4UY [00:44:32]); a
   device purchase shows up in the attribution SDK (jws).
5. **Google Play Console:** create the app (free cannot become paid later); upload the AAB to the
   internal track first, because IAP products can be created only after a bundle exists (GTaXWgKz0e8
   [00:09:06], [00:10:53]); enroll the upload key in Play App Signing; answer the ads declaration,
   the advertising ID declaration (API 33+) and Data safety from what the SDKs collect, using the
   vendors' guides (UXl_C3ZnRLc [00:02:28]); content rating, target age, privacy policy; version
   code above the last upload; promote the tested internal release (UXl_C3ZnRLc [00:13:33]).
6. **App Store Connect:** archive and export with the M8 plan, App Thinning Size Report under 200 MB
   with margin, TestFlight, privacy nutrition labels matching the SDK manifests, Restore Purchases
   button reachable.
7. **Screens:** Device Simulator in both orientations for layout only (one finger, no performance,
   no platform defines, no native plug-ins), then notch and punch-hole screenshots from real
   devices.
