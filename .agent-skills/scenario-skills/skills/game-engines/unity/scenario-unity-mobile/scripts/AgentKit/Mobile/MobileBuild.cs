// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Store-ready Android and iOS settings,
// command-line builds, and the player-settings audit.
//
// Jobs (ALWAYS launch with the platform fixed at start: ut_run.run_method(..., build_target="Android"|"iOS");
// target-switching APIs don't take effect inside a batch script, because the switch needs an
// assembly reload that can't happen while the script runs (6.3 Manual, Target switching limitations)):
//   ApplyAndroidRelease  args: app_id, version, version_code, min_api (25), target_api (36), stripping ("Minimal"),
//                        texture_formats ["ASTC","ETC2"], symbols ("symbol_table"|"full"|"none"), minify, aab,
//                        graphics_apis (["Vulkan","OpenGLES3"]: explicit list, Auto off), frame_timing_stats
//   BuildAndroid         args: out ("Builds/Android/<product>.aab"), apply (dict for ApplyAndroidRelease), development
//                        env:  AGENT_KEYSTORE, AGENT_KEYSTORE_PASS, AGENT_KEY_ALIAS, AGENT_KEY_PASS (never in args.json)
//   KeystoreState        reports what persisted: custom keystore flag, path, alias, and whether passwords are empty
//   ApplyIosRelease      args: bundle_id, version, build_number, target_os ("15.0"), stripping, team_id (optional)
//   BuildIos             args: out ("Builds/iOS"), append (false = Replace), apply (dict)
//   AuditPlayerSettings  Android + iOS store checklist, findings in the AgentAudit format
// Expert basis: Play needs an AAB, IL2CPP + ARM64, target API 36 since 2026-08-31, Development
// Build off, symbols (6.3 Manual; Google Play policy); "Unity doesn't store keystores and key
// passwords on disk" so every batch build sets them in the same process (6.3 Manual); Google
// refuses Unity's debug keystore for release (LlamAcademy, GTaXWgKz0e8 [00:06:24]); iOS Replace vs
// Append, target GUIDs, privacy manifest (6.3 Manual); App Store needs Xcode 26 + iOS 26 SDK.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_android_build.py, test_live_ios_build.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace AgentKit.Mobile
{
    public static class MobileBuild
    {
        public const string EnvKeystore = "AGENT_KEYSTORE", EnvStorePass = "AGENT_KEYSTORE_PASS", EnvAlias = "AGENT_KEY_ALIAS", EnvAliasPass = "AGENT_KEY_PASS";

        static T Arg<T>(Dictionary<string, object> d, string k, T def)
        {
            if (d == null || !d.TryGetValue(k, out var v) || v == null) return def;
            if (typeof(T) == typeof(int)) return (T)(object)(int)AgentJson.ToDouble(v);
            if (typeof(T) == typeof(bool)) return (T)(object)(v is bool b ? b : AgentJson.ToDouble(v) != 0);
            if (typeof(T) == typeof(string)) return (T)(object)v.ToString();
            return (T)v;
        }

        // ------------------------------------------------------------------ Android settings
        public static Dictionary<string, object> ApplyAndroid(Dictionary<string, object> a)
        {
            var nt = NamedBuildTarget.Android;
            var appId = Arg(a, "app_id", (string)null);
            if (appId != null) PlayerSettings.SetApplicationIdentifier(nt, appId);
            var version = Arg(a, "version", (string)null);
            if (version != null) PlayerSettings.bundleVersion = version;
            if (a != null && a.ContainsKey("version_code")) PlayerSettings.Android.bundleVersionCode = Arg(a, "version_code", 1);
            PlayerSettings.SetScriptingBackend(nt, ScriptingImplementation.IL2CPP);          // ARM64 needs IL2CPP
            PlayerSettings.SetIl2CppCompilerConfiguration(nt, Il2CppCompilerConfiguration.Release);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)Arg(a, "min_api", 25);
            PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)Arg(a, "target_api", 36);
            var strip = Arg(a, "stripping", "Minimal");
            PlayerSettings.SetManagedStrippingLevel(nt, (ManagedStrippingLevel)Enum.Parse(typeof(ManagedStrippingLevel), strip, true));
            PlayerSettings.stripEngineCode = Arg(a, "strip_engine_code", true);
            if (a != null && a.ContainsKey("texture_formats"))
                PlayerSettings.Android.textureCompressionFormats = ((List<object>)a["texture_formats"])
                    .Select(x => (TextureCompressionFormat)Enum.Parse(typeof(TextureCompressionFormat), x.ToString(), true)).ToArray();
            PlayerSettings.Android.minifyRelease = Arg(a, "minify", true);
            PlayerSettings.Android.renderOutsideSafeArea = Arg(a, "render_outside_safe_area", true);   // world under the notch, UI in the safe-area panel
            var apis = a != null && a.TryGetValue("graphics_apis", out var ga) && ga is List<object> gl
                ? gl.Select(x => (UnityEngine.Rendering.GraphicsDeviceType)Enum.Parse(typeof(UnityEngine.Rendering.GraphicsDeviceType), x.ToString(), true)).ToArray()
                : new[] { UnityEngine.Rendering.GraphicsDeviceType.Vulkan, UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 };
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);       // explicit list: fewer shader variants, known fallback
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, apis);
            if (a != null && a.ContainsKey("frame_timing_stats")) PlayerSettings.enableFrameTimingStats = Arg(a, "frame_timing_stats", false);
            EditorUserBuildSettings.buildAppBundle = Arg(a, "aab", true);
            EditorUserBuildSettings.exportAsGoogleAndroidProject = false;
            EditorUserBuildSettings.development = false;
            var symbols = SetSymbols(Arg(a, "symbols", "symbol_table"));
            AssetDatabase.SaveAssets();
            return AndroidFacts(symbols);
        }

        static string SetSymbols(string level)
        {
#if UNITY_ANDROID
            var lv = level == "full" ? Unity.Android.Types.DebugSymbolLevel.Full
                   : level == "none" ? Unity.Android.Types.DebugSymbolLevel.None : Unity.Android.Types.DebugSymbolLevel.SymbolTable;
            UnityEditor.Android.UserBuildSettings.DebugSymbols.level = lv;
            UnityEditor.Android.UserBuildSettings.DebugSymbols.format = Unity.Android.Types.DebugSymbolFormat.IncludeInBundle | Unity.Android.Types.DebugSymbolFormat.Zip;
            return UnityEditor.Android.UserBuildSettings.DebugSymbols.level + " / " + UnityEditor.Android.UserBuildSettings.DebugSymbols.format;
#else
            return "not applied (editor not started with -buildTarget Android)";
#endif
        }

        public static Dictionary<string, object> AndroidFacts(string symbols = null)
        {
            var nt = NamedBuildTarget.Android;
            return new Dictionary<string, object>
            {
                { "app_id", PlayerSettings.GetApplicationIdentifier(nt) }, { "version", PlayerSettings.bundleVersion },
                { "version_code", PlayerSettings.Android.bundleVersionCode },
                { "backend", PlayerSettings.GetScriptingBackend(nt).ToString() },
                { "architectures", PlayerSettings.Android.targetArchitectures.ToString() },
                { "min_api", PlayerSettings.Android.minSdkVersion.ToString() }, { "target_api", PlayerSettings.Android.targetSdkVersion.ToString() },
                { "stripping", PlayerSettings.GetManagedStrippingLevel(nt).ToString() }, { "strip_engine_code", PlayerSettings.stripEngineCode },
                { "texture_formats", PlayerSettings.Android.textureCompressionFormats.Select(x => x.ToString()).ToList() },
                { "minify_release", PlayerSettings.Android.minifyRelease }, { "aab", EditorUserBuildSettings.buildAppBundle },
                { "development", EditorUserBuildSettings.development }, { "entry", PlayerSettings.Android.applicationEntry.ToString() },
                { "render_outside_safe_area", PlayerSettings.Android.renderOutsideSafeArea },
                { "graphics_apis", PlayerSettings.GetGraphicsAPIs(BuildTarget.Android).Select(x => x.ToString()).ToList() },
                { "auto_graphics_api", PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.Android) },
                { "symbols", symbols ?? CurrentSymbols() },
                { "custom_keystore", PlayerSettings.Android.useCustomKeystore },
                { "frame_timing_stats", PlayerSettings.enableFrameTimingStats },
            };
        }

        static string CurrentSymbols()
        {
#if UNITY_ANDROID
            return UnityEditor.Android.UserBuildSettings.DebugSymbols.level + " / " + UnityEditor.Android.UserBuildSettings.DebugSymbols.format;
#else
            return "n/a (not Android target)";
#endif
        }

        public static void ApplyAndroidRelease()
        {
            AgentJob.Run(() => ApplyAndroid(AgentJob.Args));
        }

        // ------------------------------------------------------------------ keystore
        public static void KeystoreState()
        {
            AgentJob.Run(() => new Dictionary<string, object>
            {
                { "custom_keystore", PlayerSettings.Android.useCustomKeystore },
                { "keystore_path", PlayerSettings.Android.keystoreName },
                { "alias", PlayerSettings.Android.keyaliasName },
                { "keystore_pass_empty", string.IsNullOrEmpty(PlayerSettings.Android.keystorePass) },
                { "alias_pass_empty", string.IsNullOrEmpty(PlayerSettings.Android.keyaliasPass) },
            });
        }

        static Dictionary<string, object> ConfigureSigning(bool requireCustom)
        {
            string ks = Environment.GetEnvironmentVariable(EnvKeystore), sp = Environment.GetEnvironmentVariable(EnvStorePass);
            string al = Environment.GetEnvironmentVariable(EnvAlias), ap = Environment.GetEnvironmentVariable(EnvAliasPass);
            if (string.IsNullOrEmpty(ks))
            {
                if (requireCustom) throw new InvalidOperationException("release build without " + EnvKeystore + ": Google Play refuses Unity's debug keystore; pass the keystore through the environment");
                PlayerSettings.Android.useCustomKeystore = false;
                return new Dictionary<string, object> { { "signing", "debug keystore (device tests only, not uploadable)" } };
            }
            if (!File.Exists(ks)) throw new FileNotFoundException("keystore not found", ks);
            if (string.IsNullOrEmpty(sp) || string.IsNullOrEmpty(al) || string.IsNullOrEmpty(ap))
                throw new InvalidOperationException("keystore set but a password or alias is missing: Unity never stores keystore passwords, so every batch build must pass " +
                                                    EnvStorePass + ", " + EnvAlias + ", " + EnvAliasPass);
            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = ks;
            PlayerSettings.Android.keystorePass = sp;
            PlayerSettings.Android.keyaliasName = al;
            PlayerSettings.Android.keyaliasPass = ap;
            return new Dictionary<string, object> { { "signing", "custom keystore" }, { "keystore", ks }, { "alias", al } };
        }

        // ------------------------------------------------------------------ BuildAndroid
        public static void BuildAndroid()
        {
            AgentJob.Run(() =>
            {
                if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                    throw new InvalidOperationException("active target is " + EditorUserBuildSettings.activeBuildTarget + ": launch with build_target=\"Android\"");
                var facts = ApplyAndroid(AgentJob.Dict("apply") ?? new Dictionary<string, object>());
                bool dev = AgentJob.Bool("development");
                if (dev) { EditorUserBuildSettings.development = true; PlayerSettings.enableFrameTimingStats = true; }   // DeviceSoakLogger reads FrameTimingManager
                var signing = ConfigureSigning(AgentJob.Bool("require_custom_keystore", !dev));
                var outRel = AgentJob.Str("out") ?? AgentBuild.DefaultOut(BuildTarget.Android);
                var outPath = AgentJob.ResolvePath(outRel);
                Directory.CreateDirectory(Path.GetDirectoryName(outPath));
                var scenes = Scenes();
                var opts = dev ? BuildOptions.Development : BuildOptions.None;
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = scenes, locationPathName = outPath, target = BuildTarget.Android, targetGroup = BuildTargetGroup.Android, options = opts,
                });
                var summary = AgentBuild.Summarize(report, outPath, scenes, BuildTarget.Android);
                summary["android"] = facts;
                summary["signing"] = signing;
                if (report.summary.result != BuildResult.Succeeded) { AgentJob.Fail("android build " + report.summary.result, summary); return null; }
                return summary;
            });
        }

        // ------------------------------------------------------------------ iOS
        public static Dictionary<string, object> ApplyIos(Dictionary<string, object> a)
        {
            var nt = NamedBuildTarget.iOS;
            var id = Arg(a, "bundle_id", (string)null);
            if (id != null) PlayerSettings.SetApplicationIdentifier(nt, id);
            var version = Arg(a, "version", (string)null);
            if (version != null) PlayerSettings.bundleVersion = version;
            var bn = Arg(a, "build_number", (string)null);
            if (bn != null) PlayerSettings.iOS.buildNumber = bn;
            PlayerSettings.iOS.sdkVersion = iOSSdkVersion.DeviceSDK;
            PlayerSettings.iOS.targetOSVersionString = Arg(a, "target_os", "15.0");
            PlayerSettings.stripEngineCode = Arg(a, "strip_engine_code", true);
            PlayerSettings.SetManagedStrippingLevel(nt, (ManagedStrippingLevel)Enum.Parse(typeof(ManagedStrippingLevel), Arg(a, "stripping", "Minimal"), true));
            PlayerSettings.iOS.scriptCallOptimization = ScriptCallOptimizationLevel.FastButNoExceptions;
            PlayerSettings.SetApiCompatibilityLevel(nt, ApiCompatibilityLevel.NET_Standard);
            var team = Arg(a, "team_id", (string)null);
            if (team != null) PlayerSettings.iOS.appleDeveloperTeamID = team;
            PlayerSettings.iOS.appleEnableAutomaticSigning = Arg(a, "automatic_signing", false);
            EditorUserBuildSettings.development = false;
            AssetDatabase.SaveAssets();
            return IosFacts();
        }

        public static Dictionary<string, object> IosFacts()
        {
            var nt = NamedBuildTarget.iOS;
            return new Dictionary<string, object>
            {
                { "bundle_id", PlayerSettings.GetApplicationIdentifier(nt) }, { "version", PlayerSettings.bundleVersion },
                { "build_number", PlayerSettings.iOS.buildNumber }, { "sdk", PlayerSettings.iOS.sdkVersion.ToString() },
                { "target_os", PlayerSettings.iOS.targetOSVersionString }, { "strip_engine_code", PlayerSettings.stripEngineCode },
                { "stripping", PlayerSettings.GetManagedStrippingLevel(nt).ToString() },
                { "script_call_optimization", PlayerSettings.iOS.scriptCallOptimization.ToString() },
                { "api_compatibility", PlayerSettings.GetApiCompatibilityLevel(nt).ToString() },
                { "automatic_signing", PlayerSettings.iOS.appleEnableAutomaticSigning },
                { "team_id_set", !string.IsNullOrEmpty(PlayerSettings.iOS.appleDeveloperTeamID) },
                { "backend", PlayerSettings.GetScriptingBackend(nt).ToString() },
            };
        }

        public static void ApplyIosRelease() => AgentJob.Run(() => ApplyIos(AgentJob.Args));

        public static void BuildIos()
        {
            AgentJob.Run(() =>
            {
                if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.iOS)
                    throw new InvalidOperationException("active target is " + EditorUserBuildSettings.activeBuildTarget + ": launch with build_target=\"iOS\"");
                var facts = ApplyIos(AgentJob.Dict("apply") ?? new Dictionary<string, object>());
                var outPath = AgentJob.ResolvePath(AgentJob.Str("out") ?? "Builds/iOS");
                var opts = AgentJob.Bool("append") ? BuildOptions.AcceptExternalModificationsToPlayer : BuildOptions.None;
                if (AgentJob.Bool("development")) { opts |= BuildOptions.Development; PlayerSettings.enableFrameTimingStats = true; }
                var scenes = Scenes();
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = scenes, locationPathName = outPath, target = BuildTarget.iOS, targetGroup = BuildTargetGroup.iOS, options = opts,
                });
                var summary = AgentBuild.Summarize(report, outPath, scenes, BuildTarget.iOS);
                summary["ios"] = facts;
                summary["mode"] = AgentJob.Bool("append") ? "append" : "replace";
                if (report.summary.result != BuildResult.Succeeded) { AgentJob.Fail("ios build " + report.summary.result, summary); return null; }
                return summary;
            });
        }

        static string[] Scenes()
        {
            var s = AgentJob.List("scenes").Select(x => x.ToString()).ToArray();
            if (s.Length == 0) s = EditorBuildSettings.scenes.Where(x => x.enabled).Select(x => x.path).ToArray();
            if (s.Length == 0) throw new InvalidOperationException("no scenes: pass args.scenes or enable scenes in the build list");
            return s;
        }

        // ------------------------------------------------------------------ AuditPlayerSettings
        // Android applicationId: 2+ segments, each starting with a letter, [A-Za-z0-9_]; iOS bundle id: [A-Za-z0-9-] segments.
        static readonly Regex AndroidIdRx = new Regex(@"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$");
        static readonly Regex IosIdRx = new Regex(@"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$");
        static bool IsPlaceholderId(string id) => id == null || id.Contains("DefaultCompany") || id.Contains("UnityTechnologies") ||
                                                  id.Contains("Unity-Technologies") || id.Contains("unity.template");

        public static void AuditPlayerSettings()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                int requiredApi = AgentJob.Int("required_target_api", 36);   // Google Play, since 2026-08-31
                var a = NamedBuildTarget.Android;
                var aid = PlayerSettings.GetApplicationIdentifier(a);
                const string A = "ProjectSettings:Android", I = "ProjectSettings:iOS";
                if (!AndroidIdRx.IsMatch(aid ?? "")) f.Add("error", "mobile.android.app_id", A, "application id '" + aid + "' is not a valid package name", "com.company.game");
                else if (aid != aid.ToLowerInvariant()) f.Add("info", "mobile.android.app_id_case", A, "application id '" + aid + "' has capitals (valid, unusual)", "lowercase by convention; it can never change after the first upload");
                if (IsPlaceholderId(aid)) f.Add("error", "mobile.android.default_app_id", A, "template placeholder id '" + aid + "'", "set your own id before the first upload (it can never change on Play)");
                if (PlayerSettings.GetScriptingBackend(a) != ScriptingImplementation.IL2CPP) f.Add("error", "mobile.android.mono", A, "Mono backend: not releasable on Play (no ARM64)", "IL2CPP, then ARM64");
                if ((PlayerSettings.Android.targetArchitectures & AndroidArchitecture.ARM64) == 0) f.Add("error", "mobile.android.no_arm64", A, "ARM64 not enabled", "IL2CPP + ARM64");
                var tgt = (int)PlayerSettings.Android.targetSdkVersion;
                if (tgt == 0) f.Add("warn", "mobile.android.target_api_auto", A, "Target API = Automatic (highest installed SDK platform; Play refuses below " + requiredApi + ")", "set AndroidApiLevel" + requiredApi + " explicitly");
                else if (tgt < requiredApi) f.Add("error", "mobile.android.target_api", A, "target API " + tgt + " < " + requiredApi, "AndroidApiLevel" + requiredApi);
                if ((int)PlayerSettings.Android.minSdkVersion < 25) f.Add("error", "mobile.android.min_api", A, "min API below Unity 6.3's floor (25)", "25 (6.5 raises it to 26)");
                if (!EditorUserBuildSettings.buildAppBundle) f.Add("warn", "mobile.android.apk", A, "Build App Bundle off: Play needs an AAB", "EditorUserBuildSettings.buildAppBundle = true for store builds");
                if (EditorUserBuildSettings.development) f.Add("warn", "mobile.android.development", A, "Development Build on", "off for store uploads (upload may fail)");
                if (!PlayerSettings.Android.useCustomKeystore) f.Add("info", "mobile.android.debug_keystore", A, "debug signing: fine for devices, refused by Play", "custom keystore passed at build time (env vars)");
                if (PlayerSettings.Android.bundleVersionCode <= 1) f.Add("info", "mobile.android.version_code", A, "bundleVersionCode " + PlayerSettings.Android.bundleVersionCode, "increment on every upload; Play rejects a reused code only after the upload");
                if (PlayerSettings.accelerometerFrequency > 0) f.Add("info", "mobile.player.accelerometer", "ProjectSettings", "Accelerometer Frequency " + PlayerSettings.accelerometerFrequency + " Hz", "0 if the game never reads it");
                if (!PlayerSettings.gcIncremental) f.Add("info", "mobile.player.gc_incremental", "ProjectSettings", "incremental GC off", "on, unless you collect manually at loading points");
                var fmts = PlayerSettings.Android.textureCompressionFormats;
                if (fmts.Length == 0 || fmts[0] != TextureCompressionFormat.ASTC) f.Add("warn", "mobile.android.default_texture_format", A, "default Android texture format " + (fmts.Length > 0 ? fmts[0].ToString() : "none"), "ASTC first (AAB texture compression targeting can add ETC2)");
                if (EditorUserBuildSettings.overrideTextureCompression.ToString().Contains("Uncompressed")) f.Add("error", "mobile.build.force_uncompressed", A, "Asset Import Overrides force uncompressed textures", "No Override for store builds");
                if (!PlayerSettings.Android.renderOutsideSafeArea) f.Add("info", "mobile.android.safe_area_letterbox", A, "Render outside safe area off: Unity shrinks the Player window to the safe area (bars under the notch)", "usually on, with the HUD in a SafeAreaFitter panel (PLQ4ywB13eg [00:10:53])");
                if (PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.Android)) f.Add("info", "mobile.android.auto_graphics_api", A, "Auto Graphics API on", "explicit list (Vulkan, then OpenGLES3 only if the min-spec needs it)");
                if (PlayerSettings.Android.applicationEntry.ToString().IndexOf("GameActivity", StringComparison.Ordinal) < 0) f.Add("info", "mobile.android.entry_activity", A, "entry point " + PlayerSettings.Android.applicationEntry, "GameActivity (6.3 default: lifecycle and input on its own thread; Google reported large ANR reductions for native apps, pezwIhA0e04 [00:39:27])");

                var i = NamedBuildTarget.iOS;
                var iid = PlayerSettings.GetApplicationIdentifier(i);
                if (!IosIdRx.IsMatch(iid ?? "")) f.Add("error", "mobile.ios.bundle_id_invalid", I, "bundle id '" + iid + "' is not valid", "letters, digits, hyphens and dots");
                if (IsPlaceholderId(iid)) f.Add("error", "mobile.ios.bundle_id", I, "template placeholder bundle id '" + iid + "'", "set the App Store Connect bundle id");
                if (PlayerSettings.iOS.sdkVersion != iOSSdkVersion.DeviceSDK) f.Add("warn", "mobile.ios.simulator_sdk", I, "Simulator SDK selected", "Device SDK for store builds");
                if (!PlayerSettings.stripEngineCode) f.Add("warn", "mobile.player.strip_engine_code", "ProjectSettings", "Strip Engine Code off", "on for size");
                if (PlayerSettings.iOS.scriptCallOptimization != ScriptCallOptimizationLevel.FastButNoExceptions) f.Add("info", "mobile.ios.script_call", I, "Script Call Optimization " + PlayerSettings.iOS.scriptCallOptimization, "Fast but no exceptions for release size");
                if (Version.TryParse(PlayerSettings.iOS.targetOSVersionString, out var v) && v.Major < 15) f.Add("error", "mobile.ios.target_os", I, "target iOS " + v, "15.0 or later (6.3 minimum)");
                var privacy = AssetDatabase.FindAssets("PrivacyInfo").Select(AssetDatabase.GUIDToAssetPath).Where(p => p.EndsWith(".xcprivacy")).ToList();
                return new Dictionary<string, object>
                {
                    { "android", AndroidFacts() }, { "ios", IosFacts() }, { "privacy_manifests", privacy },
                    { "findings", f.items }, { "counts", f.Counts() }, { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                };
            });
        }
    }
}
