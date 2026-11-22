// AgentKit.Web (scenario-unity-web skill, 2026-09-24). Web platform jobs for Unity 6.3 (6000.3.21f1).
// Install: ut_env.install_agentkit(P, src="<skills>/scenario-unity-web/scripts/AgentKit") (lands in
// Assets/Editor/AgentKit/Web/). Runtime pieces (WebBridge, .jslib, AgentWeb template) come from
// ut_web.install_runtime(P); this file finds them by reflection so it compiles without them.
//
// Jobs (run through ut_run.run_method with build_target="WebGL": switch the platform at launch,
// then touch Web settings, Cam Ayres bF_eUuxGEcA [00:01:33]; target switches inside a job do nothing):
//   AgentKit.Web.WebJobs.ApplySettings  args: preset + overrides (see Presets below) -> readback
//   AgentKit.Web.WebJobs.ReadSettings   readback only (the settings audit)
//   AgentKit.Web.WebJobs.SetupDemo      demo scene with the WebBridge probe + deferred StreamingAssets file
//   AgentKit.Web.WebJobs.AuditWeb       findings: settings, scene list, lighting, skinning, graphics stripping,
//                                       splash, URP post data, textures, audio, video clips, packages
//   AgentKit.Web.WebJobs.BuildBundles   raw AssetBundle probe (LZ4) copied into StreamingAssets/bundles
//   AgentKit.Web.WebJobs.WriteBundleLinkXml   link.xml that keeps every type bundles use (Strip Engine Code)
//   AgentKit.Web.WebJobs.SetPostProcessing    URP renderer post-processing data off/on (size measurement)
// Builds use the shared AgentKit.AgentBuild through ut_run.build(P, "web", out=...).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py and test_live_web_v2.py (v2 jobs).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace AgentKit.Web
{
    public static class WebJobs
    {
        static readonly NamedBuildTarget Web = NamedBuildTarget.WebGL;

        // ------------------------------------------------------------------ presets
        // Host decides compression (6.3 Manual, Deploy a Web application; notes/web digests):
        //   own-https   your server or CDN over HTTPS: Brotli, fallback off, headers set per file
        //   plain-http  a host without HTTPS: gzip (Chrome and Firefox decode Brotli only on HTTPS or localhost)
        //   itch        itch.io (no header control): Brotli + Decompression Fallback (Max O'Didily 8iApGVX--B0 [00:01:40])
        //   poki        Poki compresses on its side: compression Disabled (Poki Unity SDK page)
        //   crazygames  Brotli, hashes, data caching (CrazyGames optimization tips)
        //   dev         iteration: Shorter Build Time (development builds are never compressed)
        // Common release part: Explicitly Thrown exceptions (None stops the content on ANY throw,
        // even inside try/catch), WebAssembly 2023, IL2CPP "Optimize for code size", High stripping,
        // Name Files As Hashes, Data Caching, Disk Size with LTO (slow: final builds; "DiskSize" while iterating),
        // Debug Symbols External (a separate .symbols.json fetched only on errors; the Publishing Settings
        // table calls it the recommended release option; keep MethodMap.tsv with ut_web.archive_symbols).
        static Dictionary<string, object> Preset(string name)
        {
            var release = new Dictionary<string, object>
            {
                { "compression", "Brotli" }, { "fallback", false }, { "hashes", true }, { "data_caching", true },
                { "exceptions", "ExplicitlyThrownExceptionsOnly" }, { "wasm2023", true }, { "wasm_table", true }, { "bigint", true },
                { "code_optimization", "DiskSizeLTO" }, { "il2cpp_codegen", "OptimizeSize" }, { "stripping", "High" },
                { "strip_engine", true }, { "debug_symbols", "External" }, { "api_compat", "NET_Standard" },
            };
            switch ((name ?? "none").ToLowerInvariant())
            {
                case "none": return new Dictionary<string, object>();
                case "own-https": return release;
                case "crazygames": return release;
                case "plain-http":
                    // observed: on an http:// origin other than localhost, UnityWebRequest to the build's own
                    // StreamingAssets threw "InvalidOperationException: Insecure connection not allowed"
                    // until "Allow downloads over HTTP" is set
                    release["compression"] = "Gzip"; release["insecure_http"] = "AlwaysAllowed"; return release;
                case "itch": release["fallback"] = true; return release;
                case "poki": release["compression"] = "Disabled"; return release;
                case "dev":
                    return new Dictionary<string, object>
                    {
                        { "code_optimization", "BuildTimes" }, { "exceptions", "ExplicitlyThrownExceptionsOnly" }, { "data_caching", false },
                    };
                default: throw new ArgumentException("unknown preset '" + name + "' (none, own-https, plain-http, itch, poki, crazygames, dev)");
            }
        }

        static T ParseEnum<T>(object v) where T : struct
        {
            if (Enum.TryParse(Convert.ToString(v), true, out T r)) return r;
            throw new ArgumentException("'" + v + "' is not a " + typeof(T).Name + " (" + string.Join(", ", Enum.GetNames(typeof(T))) + ")");
        }

        static bool ToBool(object v) => v is bool b ? b : new[] { "1", "true", "yes" }.Contains(Convert.ToString(v).ToLowerInvariant());

        // ------------------------------------------------------------------ jobs
        /// <summary>args: preset (none|own-https|plain-http|itch|poki|crazygames|dev) and any override key:
        /// compression (Brotli|Gzip|Disabled), fallback, hashes, data_caching, exceptions (WebGLExceptionSupport),
        /// wasm2023, wasm_table, bigint, code_optimization (BuildTimes|RuntimeSpeed|RuntimeSpeedLTO|DiskSize|DiskSizeLTO),
        /// il2cpp_codegen (OptimizeSize|OptimizeSpeed), stripping (Minimal|Low|Medium|High), strip_engine,
        /// debug_symbols (Off|External|Embedded), api_compat, template ("PROJECT:AgentWeb"), width, height,
        /// splash, unity_logo, initial_memory, max_memory, memory_growth, graphics_apis (["WebGPU","OpenGLES3"] or "auto"),
        /// texture_subtarget (Generic|DXT|ETC2|ASTC), run_in_background, diagnostics, threads, power (Default|LowPower|HighPerformance),
        /// insecure_http (NotAllowed|DevelopmentOnly|AlwaysAllowed: UnityWebRequest to http:// URLs other than localhost),
        /// linear_growth_mb, geometric_growth_step, geometric_growth_cap, template_values ({"AGENTWEB_TIP": "..."}:
        /// PlayerSettings.SetTemplateCustomValue). With the AgentWeb template, AGENTWEB_REQUIRE_WASM2023 follows wasm2023.</summary>
        public static void ApplySettings()
        {
            AgentJob.Run(() =>
            {
                if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.WebGL)
                    AgentJob.Warn("active target is " + EditorUserBuildSettings.activeBuildTarget + ": launch with build_target=\"WebGL\" before editing Web settings");
                var s = Preset(AgentJob.Str("preset", "none"));
                foreach (var kv in AgentJob.Args)
                    if (kv.Key != "preset" && kv.Key != "write_policy" && kv.Value != null) s[kv.Key] = kv.Value;
                var changed = new List<object>();
                foreach (var kv in s)
                {
                    Apply(kv.Key, kv.Value);
                    changed.Add(kv.Key);
                }
                // the AgentWeb template refuses to download a WebAssembly 2023 build on browsers that cannot run it
                if (PlayerSettings.WebGL.template == "PROJECT:AgentWeb" && !(AgentJob.Dict("template_values")?.ContainsKey("AGENTWEB_REQUIRE_WASM2023") ?? false))
                    PlayerSettings.SetTemplateCustomValue("AGENTWEB_REQUIRE_WASM2023", PlayerSettings.WebGL.wasm2023 ? "true" : "false");
                AssetDatabase.SaveAssets();                    // writes ProjectSettings.asset now
                var read = Read();
                string policy = null;
                if (AgentJob.Bool("write_policy")) policy = WritePolicy(read);
                return new Dictionary<string, object>
                {
                    { "preset", AgentJob.Str("preset", "none") }, { "applied", changed }, { "settings", read },
                    { "notes", Notes(read) }, { "policy", policy },
                };
            });
        }

        // ProjectSettings/AgentWebPolicy.json: the values WebReleasePolicyTests (EditMode) enforce in CI
        static string WritePolicy(Dictionary<string, object> r)
        {
            var apis = (List<object>)r["graphics_apis"];
            var pol = new Dictionary<string, object>
            {
                { "compression", r["compression"] }, { "fallback", r["fallback"] }, { "hashes", r["hashes"] },
                { "data_caching", r["data_caching"] }, { "exceptions", r["exceptions"] }, { "wasm2023", r["wasm2023"] },
                { "code_optimization", r["code_optimization"] }, { "stripping", r["stripping"] }, { "strip_engine", r["strip_engine"] },
                { "texture_subtarget", AgentJob.Has("texture_subtarget") ? r["texture_subtarget"] : "" },
                { "graphics_must_include", new List<object> { "OpenGLES3" } },
            };
            var path = Path.Combine(AgentJob.ProjectRoot, "ProjectSettings", "AgentWebPolicy.json");
            File.WriteAllText(path, AgentJson.Serialize(pol, true));
            return path;
        }

        public static void ReadSettings()
        {
            AgentJob.Run(() =>
            {
                var read = Read();
                return new Dictionary<string, object> { { "settings", read }, { "notes", Notes(read) } };
            });
        }

        static void Apply(string key, object v)
        {
            switch (key)
            {
                case "compression": PlayerSettings.WebGL.compressionFormat = ParseEnum<WebGLCompressionFormat>(v); break;
                case "fallback": PlayerSettings.WebGL.decompressionFallback = ToBool(v); break;
                case "hashes": PlayerSettings.WebGL.nameFilesAsHashes = ToBool(v); break;
                case "data_caching": PlayerSettings.WebGL.dataCaching = ToBool(v); break;
                case "exceptions": PlayerSettings.WebGL.exceptionSupport = ParseEnum<WebGLExceptionSupport>(v); break;
                case "wasm2023": PlayerSettings.WebGL.wasm2023 = ToBool(v); break;
                case "wasm_table": PlayerSettings.WebGL.webAssemblyTable = ToBool(v); break;
                case "bigint": PlayerSettings.WebGL.webAssemblyBigInt = ToBool(v); break;
                case "debug_symbols": PlayerSettings.WebGL.debugSymbolMode = ParseEnum<WebGLDebugSymbolMode>(v); break;
                case "template": PlayerSettings.WebGL.template = Convert.ToString(v); break;
                case "diagnostics": PlayerSettings.WebGL.showDiagnostics = ToBool(v); break;
                case "threads": PlayerSettings.WebGL.threadsSupport = ToBool(v); break;
                case "power": PlayerSettings.WebGL.powerPreference = ParseEnum<WebGLPowerPreference>(v); break;
                case "initial_memory": PlayerSettings.WebGL.initialMemorySize = (int)AgentJson.ToDouble(v, 32); break;
                case "max_memory": PlayerSettings.WebGL.maximumMemorySize = (int)AgentJson.ToDouble(v, 2048); break;
                case "memory_growth": PlayerSettings.WebGL.memoryGrowthMode = ParseEnum<WebGLMemoryGrowthMode>(v); break;
                case "linear_growth_mb": PlayerSettings.WebGL.linearMemoryGrowthStep = (int)AgentJson.ToDouble(v, 16); break;
                case "geometric_growth_step": PlayerSettings.WebGL.geometricMemoryGrowthStep = (float)AgentJson.ToDouble(v, 0.2); break;
                case "geometric_growth_cap": PlayerSettings.WebGL.memoryGeometricGrowthCap = (int)AgentJson.ToDouble(v, 96); break;
                case "template_values":
                    foreach (var tv in (v as Dictionary<string, object>) ?? new Dictionary<string, object>())
                        PlayerSettings.SetTemplateCustomValue(tv.Key, Convert.ToString(tv.Value));
                    break;
                case "code_optimization": SetCodeOptimization(Convert.ToString(v)); break;
                case "il2cpp_codegen": PlayerSettings.SetIl2CppCodeGeneration(Web, ParseEnum<Il2CppCodeGeneration>(v)); break;
                case "stripping": PlayerSettings.SetManagedStrippingLevel(Web, ParseEnum<ManagedStrippingLevel>(v)); break;
                case "strip_engine": PlayerSettings.stripEngineCode = ToBool(v); break;
                case "api_compat": PlayerSettings.SetApiCompatibilityLevel(Web, ParseEnum<ApiCompatibilityLevel>(v)); break;
                case "width": PlayerSettings.defaultWebScreenWidth = (int)AgentJson.ToDouble(v, 960); break;
                case "height": PlayerSettings.defaultWebScreenHeight = (int)AgentJson.ToDouble(v, 600); break;
                case "run_in_background": PlayerSettings.runInBackground = ToBool(v); break;
                case "splash": PlayerSettings.SplashScreen.show = ToBool(v); break;
                case "unity_logo": PlayerSettings.SplashScreen.showUnityLogo = ToBool(v); break;
                case "texture_subtarget": EditorUserBuildSettings.webGLBuildSubtarget = ParseEnum<WebGLTextureSubtarget>(v); break;
                case "insecure_http": PlayerSettings.insecureHttpOption = ParseEnum<InsecureHttpOption>(v); break;
                case "graphics_apis": SetGraphicsApis(v); break;
                default: throw new ArgumentException("unknown setting '" + key + "'");
            }
        }

        static void SetGraphicsApis(object v)
        {
            if (v is string str && str.ToLowerInvariant() == "auto")
            {
                PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, true);
                return;
            }
            var list = (v as List<object> ?? new List<object>()).Select(x => ParseEnum<GraphicsDeviceType>(x)).ToArray();
            if (list.Length == 0) throw new ArgumentException("graphics_apis: give a list such as [\"WebGPU\", \"OpenGLES3\"] or \"auto\"");
            if (!list.Contains(GraphicsDeviceType.OpenGLES3))
                AgentJob.Warn("no OpenGLES3 (WebGL 2) in the list: browsers without WebGPU (or pages not served over HTTPS/localhost) get nothing");
            if (list.Contains(GraphicsDeviceType.WebGPU))
                AgentJob.Warn("WebGPU is experimental in 6.3 (\"not recommended for production\"); production-supported, still opt-in, from 6.6");
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, list);
        }

        // UnityEditor.WebGL.UserBuildSettings lives in UnityEditor.WebGL.Extensions (loaded only with the
        // Web module): reflection keeps this file compiling when the module is missing.
        static Type UserBuildSettingsType => Type.GetType("UnityEditor.WebGL.UserBuildSettings, UnityEditor.WebGL.Extensions");

        static void SetCodeOptimization(string value)
        {
            var t = UserBuildSettingsType;
            var p = t?.GetProperty("codeOptimization");
            if (p == null) throw new InvalidOperationException("UnityEditor.WebGL.UserBuildSettings.codeOptimization not found (Web Build Support module installed?)");
            p.SetValue(null, Enum.Parse(p.PropertyType, value, true));
        }

        static string GetCodeOptimization()
        {
            try { return UserBuildSettingsType?.GetProperty("codeOptimization")?.GetValue(null)?.ToString() ?? "n/a"; }
            catch (Exception) { return "n/a"; }
        }

        public static Dictionary<string, object> Read()
        {
            return new Dictionary<string, object>
            {
                { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                { "compression", PlayerSettings.WebGL.compressionFormat.ToString() },
                { "fallback", PlayerSettings.WebGL.decompressionFallback },
                { "hashes", PlayerSettings.WebGL.nameFilesAsHashes },
                { "data_caching", PlayerSettings.WebGL.dataCaching },
                { "exceptions", PlayerSettings.WebGL.exceptionSupport.ToString() },
                { "wasm2023", PlayerSettings.WebGL.wasm2023 },
                { "wasm_table", PlayerSettings.WebGL.webAssemblyTable },
                { "bigint", PlayerSettings.WebGL.webAssemblyBigInt },
                { "debug_symbols", PlayerSettings.WebGL.debugSymbolMode.ToString() },
                { "template", PlayerSettings.WebGL.template },
                { "diagnostics", PlayerSettings.WebGL.showDiagnostics },
                { "threads", PlayerSettings.WebGL.threadsSupport },
                { "power", PlayerSettings.WebGL.powerPreference.ToString() },
                { "initial_memory", PlayerSettings.WebGL.initialMemorySize },
                { "max_memory", PlayerSettings.WebGL.maximumMemorySize },
                { "memory_growth", PlayerSettings.WebGL.memoryGrowthMode.ToString() },
                { "linear_growth_mb", PlayerSettings.WebGL.linearMemoryGrowthStep },
                { "geometric_growth_step", (double)PlayerSettings.WebGL.geometricMemoryGrowthStep },
                { "geometric_growth_cap", PlayerSettings.WebGL.memoryGeometricGrowthCap },
                { "template_values", TemplateValues() },
                { "code_optimization", GetCodeOptimization() },
                { "il2cpp_codegen", PlayerSettings.GetIl2CppCodeGeneration(Web).ToString() },
                { "stripping", PlayerSettings.GetManagedStrippingLevel(Web).ToString() },
                { "strip_engine", PlayerSettings.stripEngineCode },
                { "api_compat", PlayerSettings.GetApiCompatibilityLevel(Web).ToString() },
                { "scripting_backend", PlayerSettings.GetScriptingBackend(Web).ToString() },
                { "width", PlayerSettings.defaultWebScreenWidth },
                { "height", PlayerSettings.defaultWebScreenHeight },
                { "run_in_background", PlayerSettings.runInBackground },
                { "splash", PlayerSettings.SplashScreen.show },
                { "unity_logo", PlayerSettings.SplashScreen.showUnityLogo },
                { "texture_subtarget", EditorUserBuildSettings.webGLBuildSubtarget.ToString() },
                { "insecure_http", PlayerSettings.insecureHttpOption.ToString() },
                { "graphics_auto", PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.WebGL) },
                { "graphics_apis", PlayerSettings.GetGraphicsAPIs(BuildTarget.WebGL).Select(g => (object)g.ToString()).ToList() },
                { "color_space", PlayerSettings.colorSpace.ToString() },
                { "development", EditorUserBuildSettings.development },
            };
        }

        static readonly string[] AgentWebTemplateVars = { "AGENTWEB_TIP", "AGENTWEB_ERROR_URL", "AGENTWEB_MOBILE_MAX_DPR", "AGENTWEB_REQUIRE_WASM2023", "AGENTWEB_TAP_TO_PLAY" };

        static Dictionary<string, object> TemplateValues()
        {
            var d = new Dictionary<string, object>();
            foreach (var k in AgentWebTemplateVars)
            {
                string v;
                try { v = PlayerSettings.GetTemplateCustomValue(k); } catch (Exception) { v = null; }
                d[k] = v ?? "";
            }
            return d;
        }

        static List<object> Notes(Dictionary<string, object> s)
        {
            var n = new List<object>();
            // observed 2026-09-24: both values sit in Library/EditorUserBuildSettings.asset, not in ProjectSettings/
            n.Add("Code Optimization and the texture subtarget live in Library/EditorUserBuildSettings.asset: a fresh clone or CI runner builds with the defaults (Shorter Build Time, Player Settings texture format) unless the build job sets them every time or a committed Build Profile asset carries them");
            if ((int)s["initial_memory"] <= 32 && (string)s["memory_growth"] != "None") n.Add("Initial Memory Size " + s["initial_memory"] + " MB: the heap grows during startup (observed 32 to 74 MB for the demo scene); on mobile set it to the measured typical heap (browser_check(metrics_seconds=...) + ut_web.heap_advice), since growth can fail without a contiguous block");
            string comp = (string)s["compression"];
            if ((bool)s["fallback"]) n.Add("Decompression Fallback on: .unityweb files, bigger loader, no WebAssembly streaming compile; right only when the host cannot set Content-Encoding (itch.io)");
            else if (comp == "Brotli") n.Add("Brotli without fallback: serve .br with Content-Encoding: br over HTTPS (or localhost); plain HTTP hosts need gzip");
            else if (comp == "Gzip") n.Add("gzip without fallback: serve .gz with Content-Encoding: gzip, and .data.gz as application/gzip (Safari bug 247421)");
            else n.Add("compression Disabled: right when the host compresses (Poki); otherwise the download is 3 to 4 times larger");
            if ((string)s["exceptions"] == "None") n.Add("exceptions None: any throw stops the content, even inside try/catch");
            if ((string)s["exceptions"] == "FullWithStacktrace") n.Add("Full With Stacktrace: debug only (size and speed cost); never ship it");
            if ((string)s["code_optimization"] == "BuildTimes") n.Add("Code Optimization is Shorter Build Time (the template default): use DiskSize while iterating, DiskSizeLTO (or RuntimeSpeedLTO when CPU-bound) for release");
            if (!(bool)s["wasm2023"]) n.Add("WebAssembly 2023 off (6.3 default): turning it on makes exception support nearly free and adds SIMD; needs Chrome/Edge 91+, Firefox 89+, Safari 16.4+");
            if ((int)s["max_memory"] > 2048) n.Add("Maximum Memory above 2048 MB: Chrome and Firefox before 119 have bugs above 2 GB; mobile browsers crash on heap growth");
            if ((bool)s["threads"]) n.Add("Native C/C++ multithreading (experimental): needs COOP/COEP/CORP headers on HTML and JS; C# threads still do not exist");
            var apis = (List<object>)s["graphics_apis"];
            if (!(bool)s["graphics_auto"] && apis.Contains("WebGPU")) n.Add("WebGPU in the list: experimental in 6.3; it falls back silently (log SystemInfo.graphicsDeviceType) and needs a secure context");
            if (!(bool)s["hashes"]) n.Add("Name Files As Hashes off: returning players can keep stale cached files after an update");
            if ((string)s["insecure_http"] == "NotAllowed") n.Add("Allow downloads over HTTP is NotAllowed (default): on a plain-HTTP host, UnityWebRequest (StreamingAssets, Addressables) throws \"Insecure connection not allowed\"; localhost is exempt, so a local test does not show it");
            return n;
        }

        // ------------------------------------------------------------------ demo scene
        /// <summary>args: scene (default Assets/Scenes/WebDemo.unity), deferred_kb (default 1024, 0 = none),
        /// score (default 1234). Needs ut_web.install_runtime(P) (AgentWeb.WebBridge in Assembly-CSharp).
        /// Creates camera, light, ground, an indicator cube, and a GameObject named "WebBridge" with the
        /// probe; writes Assets/StreamingAssets/deferred.bin (incompressible bytes, loaded after gameplay
        /// start); makes the scene the only build scene; selects the AgentWeb template when present.</summary>
        public static void SetupDemo()
        {
            AgentJob.Run(() =>
            {
                var bridgeType = Type.GetType("AgentWeb.WebBridge, Assembly-CSharp");
                if (bridgeType == null) throw new InvalidOperationException("AgentWeb.WebBridge not compiled: run ut_web.install_runtime(P) first");
                var path = AgentJob.Str("scene", "Assets/Scenes/WebDemo.unity");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                var cam = Camera.main;
                if (cam != null)
                {
                    cam.transform.position = new Vector3(0f, 1.6f, -4.2f);
                    cam.transform.rotation = Quaternion.Euler(12f, 0f, 0f);
                    cam.clearFlags = CameraClearFlags.SolidColor;
                    cam.backgroundColor = new Color(0.13f, 0.15f, 0.2f);
                }
                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
                ground.name = "Ground";
                ground.transform.localScale = new Vector3(2f, 1f, 2f);
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = "Indicator";
                cube.transform.position = new Vector3(0f, 0.75f, 0f);
                cube.transform.rotation = Quaternion.Euler(0f, 35f, 0f);
                var go = new GameObject("WebBridge");       // SendMessage finds it by this exact name
                var comp = go.AddComponent(bridgeType);
                var so = new SerializedObject(comp);
                so.FindProperty("indicator").objectReferenceValue = cube.GetComponent<Renderer>();
                so.FindProperty("demoScore").intValue = AgentJob.Int("score", 1234);
                so.FindProperty("playerName").stringValue = AgentJob.Str("player_name", "agent");
                int kb = AgentJob.Int("deferred_kb", 1024);
                so.FindProperty("deferredFile").stringValue = kb > 0 ? "deferred.bin" : "";
                so.ApplyModifiedPropertiesWithoutUndo();
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
                EditorSceneManager.SaveScene(scene, path);

                long deferredBytes = 0;
                if (kb > 0)
                {
                    var sa = Path.Combine(Application.dataPath, "StreamingAssets");
                    Directory.CreateDirectory(sa);
                    var bytes = new byte[kb * 1024];
                    new System.Random(7).NextBytes(bytes);    // incompressible: stands in for textures or audio
                    File.WriteAllBytes(Path.Combine(sa, "deferred.bin"), bytes);
                    deferredBytes = bytes.Length;
                    AssetDatabase.Refresh();
                }
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(path, true) };
                bool template = Directory.Exists(Path.Combine(Application.dataPath, "WebGLTemplates/AgentWeb"));
                if (template) PlayerSettings.WebGL.template = "PROJECT:AgentWeb";
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "scene", path }, { "bridge", go.name }, { "deferred_bytes", deferredBytes },
                    { "build_scenes", EditorBuildSettings.scenes.Select(x => (object)x.path).ToList() },
                    { "template", PlayerSettings.WebGL.template },
                };
            });
        }

        // ------------------------------------------------------------------ audit
        /// <summary>args: folders (default ["Assets"]), max_texture_size (default 2048), music_seconds (default 10),
        /// webgpu (bool, adds WebGPU checks), release (default true), scenes (override the build scene list),
        /// skinned_threshold (default 10). Findings in the core format
        /// {severity, code, path, message, fix}; code prefix "web.". C# sources are scanned by ut_web.scan_hang_apis.</summary>
        public static void AuditWeb()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var folders = AgentJob.List("folders").Select(x => x.ToString()).ToArray();
                if (folders.Length == 0) folders = new[] { "Assets" };
                int maxTex = AgentJob.Int("max_texture_size", 2048);
                float musicSeconds = AgentJob.Float("music_seconds", 10f);
                bool release = AgentJob.Bool("release", true);
                var s = Read();

                // settings
                if (release && (bool)s["development"]) f.Add("error", "web.build.development", "EditorUserBuildSettings", "Development Build is on", "release builds only: development builds are neither compressed nor minified");
                if (release && (string)s["code_optimization"] == "BuildTimes") f.Add("warn", "web.settings.code_optimization", "Build Profile > Code Optimization", "Shorter Build Time", "DiskSizeLTO for release (RuntimeSpeedLTO if CPU-bound); DiskSize while iterating");
                if ((string)s["exceptions"] == "FullWithStacktrace") f.Add(release ? "error" : "info", "web.settings.exceptions", "Publishing Settings > Enable Exceptions", "Full With Stacktrace", "debug only; ship Explicitly Thrown (or None only for exception-free code)");
                if ((bool)s["fallback"]) f.Add("warn", "web.settings.fallback", "Publishing Settings > Decompression Fallback", "on", "only for hosts without header control (itch.io); otherwise serve Content-Encoding and keep it off");
                if (!(bool)s["data_caching"]) f.Add("info", "web.settings.data_caching", "Publishing Settings > Data Caching", "off", "on for release: .data cached in IndexedDB");
                if (!(bool)s["hashes"]) f.Add("info", "web.settings.hashes", "Publishing Settings > Name Files As Hashes", "off", "on for release: cache busting and incremental uploads");
                if (!(bool)s["wasm2023"]) f.Add("info", "web.settings.wasm2023", "Publishing Settings > Enable WebAssembly 2023", "off", "on unless the audience has browsers older than Chrome 91 / Firefox 89 / Safari 16.4");
                if ((int)s["max_memory"] > 2048) f.Add("warn", "web.settings.max_memory", "Publishing Settings > Maximum Memory Size", s["max_memory"] + " MB", "2048 MB is enough for most games; mobile browsers crash on large heaps");
                if ((bool)s["threads"]) f.Add("warn", "web.settings.threads", "Publishing Settings > Native C/C++ Multithreading", "on (experimental)", "needs COOP/COEP/CORP headers; iframe portals may not allow it");
                var apis = (List<object>)s["graphics_apis"];
                if (!(bool)s["graphics_auto"] && apis.Contains("WebGPU") && !apis.Contains("OpenGLES3")) f.Add("error", "web.graphics.no_fallback", "Player > Other Settings > Graphics APIs", "WebGPU without WebGL 2", "keep OpenGLES3 below WebGPU for public links");
                if (!(bool)s["graphics_auto"] && apis.Contains("WebGPU")) f.Add("warn", "web.graphics.webgpu_experimental", "Player > Other Settings > Graphics APIs", "WebGPU is experimental in 6.3", "production-supported from 6.6 (still opt-in); log SystemInfo.graphicsDeviceType at startup");
                if ((string)s["insecure_http"] == "NotAllowed") f.Add("info", "web.settings.insecure_http", "Player > Other Settings > Allow downloads over HTTP", "NotAllowed", "a plain-HTTP host (not localhost) makes UnityWebRequest throw \"Insecure connection not allowed\" for StreamingAssets and Addressables: serve over HTTPS, or AlwaysAllowed");
                if ((string)s["stripping"] == "Minimal" || (string)s["stripping"] == "Disabled") f.Add("info", "web.settings.stripping", "Player > Other Settings > Managed Stripping Level", (string)s["stripping"], "raise to Medium or High and test (link.xml for reflection)");

                if (PlayerSettings.SplashScreen.show || PlayerSettings.SplashScreen.showUnityLogo) f.Add("info", "web.settings.splash", "Player > Splash Image", "splash " + PlayerSettings.SplashScreen.show + ", Unity logo " + PlayerSettings.SplashScreen.showUnityLogo, "turn off both (Unity 6): the logo alone is 2.7 MB uncompressed in the build report (observed); the logo stays if only the splash is off (CrazyGames)");

                // URP post-processing data: about +1 MB Brotli (CrazyGames); the build report then lists FilmGrain and SMAA textures
                foreach (var g in AssetDatabase.FindAssets("t:UniversalRendererData", new[] { "Assets" }))
                {
                    var p = AssetDatabase.GUIDToAssetPath(g);
                    var rd = AssetDatabase.LoadAssetAtPath<ScriptableObject>(p);
                    var prop = rd != null ? new SerializedObject(rd).FindProperty("postProcessData") : null;
                    if (prop != null && prop.objectReferenceValue != null) f.Add("info", "web.urp.postprocessing", p, "post-processing data on", "if no Volume effects ship, turn it off (renderer > Post-processing, or WebJobs.SetPostProcessing enabled=false): about +1 MB Brotli (CrazyGames)");
                }

                // graphics stripping (6.3 Manual, Recommended Graphics settings)
                var gsObj = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset").FirstOrDefault();
                if (gsObj != null)
                {
                    var gs = new SerializedObject(gsObj);
                    var inst = gs.FindProperty("m_InstancingStripping");
                    if (inst != null && inst.intValue == 2) f.Add("info", "web.graphics.instancing_variants", "Project Settings > Graphics > Instancing Variants", "Keep All", "Strip Unused");
                    var lm = gs.FindProperty("m_LightmapStripping");
                    if (lm != null && lm.intValue != 0) f.Add("info", "web.graphics.lightmap_modes", "Project Settings > Graphics > Lightmap Modes", "Custom", "Automatic (only the modes the build scenes use)");
                    var fog = gs.FindProperty("m_FogStripping");
                    if (fog != null && fog.intValue != 0) f.Add("info", "web.graphics.fog_modes", "Project Settings > Graphics > Fog Modes", "Custom", "Automatic");
                    var inc = gs.FindProperty("m_AlwaysIncludedShaders");
                    if (inc != null)
                        for (int i = 0; i < inc.arraySize; i++)
                        {
                            var sh = inc.GetArrayElementAtIndex(i).objectReferenceValue as Shader;
                            if (sh != null && (sh.name == "Standard" || sh.name == "Standard (Specular setup)")) f.Add("warn", "web.graphics.always_included", "Project Settings > Graphics > Always Included Shaders", sh.name, "remove many-variant shaders from Always Included (6.3 Manual, WebGL2)");
                        }
                }
                if (EditorGraphicsSettings.batchRendererGroupShaderStrippingMode == BatchRendererGroupStrippingMode.KeepAll) f.Add("info", "web.graphics.brg_variants", "Project Settings > Graphics > BatchRendererGroup Variants", "Keep All", "Strip all unless GPU Resident Drawer is used (a WebGPU-only feature on the Web)");

                // scene list (a stale list "builds nothing", Cam Ayres bF_eUuxGEcA [00:04:02])
                var scenes = EditorBuildSettings.scenes.Where(x => x.enabled).ToArray();
                var scenePaths = AgentJob.List("scenes").Select(x => x.ToString()).ToList();
                if (scenePaths.Count == 0) scenePaths = scenes.Select(x => x.path).ToList();
                if (scenes.Length == 0) f.Add("error", "web.scenes.empty", "Build Profiles > Scene List", "no enabled scene", "add the boot scene");
                foreach (var sc in scenes)
                    if (AssetDatabase.LoadAssetAtPath<SceneAsset>(sc.path) == null) f.Add("error", "web.scenes.missing", sc.path, "scene in the build list does not exist", "remove it from the list");

                // per scene: lighting (WebGL 2: baked GI with non-directional lightmaps only, 6.3 Manual WebGL2;
                // Loveridge FYsVftoLBP8 [00:35:27]: lightmaps blew a web build to hundreds of MB) and CPU skinning
                // (WebGL 2 skins on the CPU: 30 characters 7 fps vs 30 fps on WebGPU, Duncan 3bu4WZUCGYc [~00:15:13])
                int skinThreshold = AgentJob.Int("skinned_threshold", 10);
                var sceneInfo = new List<object>();
                foreach (var sp in scenePaths)
                {
                    if (AssetDatabase.LoadAssetAtPath<SceneAsset>(sp) == null) continue;
                    EditorSceneManager.OpenScene(sp, OpenSceneMode.Single);
                    string mode = "none";
                    bool baked = false;
                    if (Lightmapping.TryGetLightingSettings(out var ls) && ls != null)
                    {
                        baked = ls.bakedGI;
                        mode = ls.directionalityMode == LightmapsMode.NonDirectional ? "NonDirectional" : "CombinedDirectional";   // ToString() prints "Single, Dual" (aliased values)
                        if (baked && ls.directionalityMode == LightmapsMode.CombinedDirectional)
                            f.Add("warn", "web.lighting.directional", sp, "directional lightmaps", "WebGL 2 supports non-directional lightmaps only: Lighting Settings > Directional Mode = Non-Directional");
                    }
                    long lmPixels = 0;
                    foreach (var ld in LightmapSettings.lightmaps)
                        if (ld != null && ld.lightmapColor != null) lmPixels += (long)ld.lightmapColor.width * ld.lightmapColor.height;
                    if (LightmapSettings.lightmaps.Length > 0) f.Add("info", "web.lighting.lightmaps", sp, LightmapSettings.lightmaps.Length + " lightmaps, " + (lmPixels / 1048576.0).ToString("0.0") + " Mpx", "weigh them in the size report: Loveridge's 3D web builds went real-time (\"baked lighting in web, don't try it\")");
                    int skinned = UnityEngine.Object.FindObjectsByType<SkinnedMeshRenderer>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length;
                    if (skinned > skinThreshold) f.Add("info", "web.skinning.cpu", sp, skinned + " skinned mesh renderers", "WebGL 2 skins on the CPU: budget characters, fewer bones and LODs, or WebGPU with GPU skinning when compute is the reason");
                    sceneInfo.Add(new Dictionary<string, object> { { "scene", sp }, { "baked_gi", baked }, { "directionality", mode }, { "lightmaps", LightmapSettings.lightmaps.Length }, { "skinned", skinned } });
                }

                // textures
                int texCount = 0;
                foreach (var g in AssetDatabase.FindAssets("t:Texture2D", folders))
                {
                    var p = AssetDatabase.GUIDToAssetPath(g);
                    if (!(AssetImporter.GetAtPath(p) is TextureImporter ti)) continue;
                    texCount++;
                    var ws = ti.GetPlatformTextureSettings("WebGL");
                    int size = ws.overridden ? ws.maxTextureSize : ti.maxTextureSize;
                    var comp = ws.overridden ? ws.textureCompression : ti.textureCompression;
                    bool crunch = ws.overridden ? ws.crunchedCompression : ti.crunchedCompression;
                    if (size > maxTex) f.Add("warn", "web.texture.max_size", p, "max size " + size + " > " + maxTex, "step Max Size down one or two levels and judge at play distance (Jason Weimann 7O21c8BzEzM [00:03:25])");
                    if (comp == TextureImporterCompression.Uncompressed) f.Add("warn", "web.texture.uncompressed", p, "uncompressed", "compress (Crunch for download size; ASTC/DXT per audience)");
                    else if (!crunch && ti.textureType != TextureImporterType.NormalMap) f.Add("info", "web.texture.no_crunch", p, "crunch off", "try Crunch (quality 50) for download size; it costs CPU transcode at load");
                    if (ti.textureType == TextureImporterType.Sprite && ti.mipmapEnabled) f.Add("info", "web.texture.sprite_mips", p, "sprite with mipmaps", "disable mipmaps on sprites (portal guidance)");
                }

                // audio
                int audioCount = 0;
                foreach (var g in AssetDatabase.FindAssets("t:AudioClip", folders))
                {
                    var p = AssetDatabase.GUIDToAssetPath(g);
                    if (!(AssetImporter.GetAtPath(p) is AudioImporter ai)) continue;
                    audioCount++;
                    var ss = ai.ContainsSampleSettingsOverride("WebGL") ? ai.GetOverrideSampleSettings("WebGL") : ai.defaultSampleSettings;
                    var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(p);
                    float len = clip != null ? clip.length : 0f;
                    if (len >= musicSeconds && ss.loadType == AudioClipLoadType.DecompressOnLoad) f.Add("warn", "web.audio.music_decompress", p, len.ToString("0") + " s clip decompressed on load", "CompressedInMemory for music (less memory; also plays in iOS Silent Mode)");
                    if (len < musicSeconds && ss.loadType == AudioClipLoadType.DecompressOnLoad) f.Add("info", "web.audio.ios_silent", p, "DecompressOnLoad is inaudible on iOS in Silent Mode (WebKit 262781)", "CompressedInMemory if it must play with the silent switch on");
                    if (!ai.forceToMono && len < musicSeconds) f.Add("info", "web.audio.stereo_sfx", p, "short clip not forced to mono", "force mono for SFX (portal guidance)");
                    if (ss.sampleRateSetting == AudioSampleRateSetting.PreserveSampleRate && ss.quality >= 0.99f) f.Add("info", "web.audio.quality", p, "quality 100 + preserve sample rate", "Optimize Sample Rate and lower quality, then listen (Jason Weimann 7O21c8BzEzM [00:05:22])");
                }

                // video clips are not supported by the Web player
                foreach (var g in AssetDatabase.FindAssets("t:VideoClip", folders))
                    f.Add("error", "web.video.clip", AssetDatabase.GUIDToAssetPath(g), "VideoClip asset: \"Embedded video clips are not supported by the Web player\"", "VideoPlayer with a URL into StreamingAssets");

                // packages with a measured size cost
                var manifest = File.ReadAllText(Path.Combine(AgentJob.ProjectRoot, "Packages/manifest.json"));
                if (manifest.Contains("\"com.unity.inputsystem\"")) f.Add("info", "web.package.inputsystem", "Packages/manifest.json", "Input System package present", "keep if used; remove if not (\"can significantly increase the build size\", 6.3 Manual)");
                if (AgentJob.Bool("webgpu"))
                {
                    foreach (var g in AssetDatabase.FindAssets("t:ComputeShader", folders))
                    {
                        var p = AssetDatabase.GUIDToAssetPath(g);
                        var src = File.ReadAllText(Path.Combine(AgentJob.ProjectRoot, p));
                        if (src.Contains("RWBuffer<")) f.Add("error", "web.webgpu.rwbuffer", p, "RWBuffer is not supported on WebGPU", "RWStructuredBuffer");
                        if (src.Contains("Wave")) f.Add("warn", "web.webgpu.wave", p, "wave intrinsics are not supported on WebGPU", "remove or guard");
                    }
                }
                return new Dictionary<string, object>
                {
                    { "counts", f.Counts() }, { "findings", f.items }, { "textures", texCount }, { "audio", audioCount },
                    { "settings", s }, { "scenes", sceneInfo },
                };
            });
        }

        // ------------------------------------------------------------------ bundles and stripping
        static Type FindType(string name)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = asm.GetType(name, false);
                if (t != null) return t;
            }
            throw new ArgumentException("type not found: " + name);
        }

        /// <summary>A raw AssetBundle probe. args: bundle (default "stripprobe"), components (type names added to
        /// the prefab, default ["UnityEngine.WindZone"]: a class the demo player never references), out
        /// (default Assets/StreamingAssets/bundles). Builds LZ4 (ChunkBasedCompression: LZMA cannot be read on
        /// the Web) into Library/AgentWeb/bundles/WebGL and copies only the bundle into StreamingAssets.
        /// Returns the bundle size, the manifest path (for BuildPlayerOptions.assetBundleManifestPath) and the
        /// ClassTypes ids the bundle needs.</summary>
        public static void BuildBundles()
        {
            AgentJob.Run(() =>
            {
                var bundle = AgentJob.Str("bundle", "stripprobe");
                var comps = AgentJob.List("components").Select(x => x.ToString()).ToList();
                if (comps.Count == 0) comps.Add("UnityEngine.WindZone");
                const string dir = "Assets/AgentWebBundles";
                Directory.CreateDirectory(AgentJob.ResolvePath(dir));
                var prefabPath = dir + "/" + bundle + ".prefab";
                var go = new GameObject(bundle);
                foreach (var c in comps) go.AddComponent(FindType(c));
                PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
                UnityEngine.Object.DestroyImmediate(go);
                AssetImporter.GetAtPath(prefabPath).assetBundleName = bundle;
                var lib = Path.Combine(AgentJob.ProjectRoot, "Library/AgentWeb/bundles/WebGL");
                Directory.CreateDirectory(lib);
                var manifest = BuildPipeline.BuildAssetBundles(lib, BuildAssetBundleOptions.ChunkBasedCompression, BuildTarget.WebGL);
                if (manifest == null) throw new InvalidOperationException("BuildAssetBundles returned null");
                var outDir = AgentJob.ResolvePath(AgentJob.Str("out", "Assets/StreamingAssets/bundles"));
                Directory.CreateDirectory(outDir);
                File.Copy(Path.Combine(lib, bundle), Path.Combine(outDir, bundle), true);
                var classIds = new List<object>();
                foreach (var line in File.ReadAllLines(Path.Combine(lib, bundle + ".manifest")))
                {
                    var t = line.Trim();
                    if (t.StartsWith("- Class: ")) classIds.Add(int.Parse(t.Substring(9).Trim()));
                }
                AssetDatabase.Refresh();
                return new Dictionary<string, object>
                {
                    { "bundle", bundle }, { "prefab", prefabPath }, { "components", comps.Cast<object>().ToList() },
                    { "bytes", new FileInfo(Path.Combine(outDir, bundle)).Length }, { "class_ids", classIds },
                    { "manifest", Path.Combine(lib, "WebGL.manifest") }, { "copied_to", outDir },
                };
            });
        }

        /// <summary>Strip Engine Code and High managed stripping keep only what the PLAYER references: a class used
        /// only inside AssetBundles is stripped and the browser logs "Could not produce class with ID n"
        /// (6.3 Manual, Distribution size and code stripping). This writes a link.xml that preserves every type
        /// the bundles' assets use (engine components, ScriptableObjects, MonoBehaviours).
        /// args: bundles (names; default all AssetBundle names), paths (extra asset paths, for example
        /// Addressables entries), out (default Assets/AgentWeb/link.xml). Rebuild the player afterwards.</summary>
        public static void WriteBundleLinkXml()
        {
            AgentJob.Run(() =>
            {
                var names = AgentJob.List("bundles").Select(x => x.ToString()).ToList();
                if (names.Count == 0) names = AssetDatabase.GetAllAssetBundleNames().ToList();
                var roots = new List<string>();
                foreach (var b in names) roots.AddRange(AssetDatabase.GetAssetPathsFromAssetBundle(b));
                roots.AddRange(AgentJob.List("paths").Select(x => x.ToString()));
                var byAsm = new SortedDictionary<string, SortedSet<string>>();
                foreach (var dep in AssetDatabase.GetDependencies(roots.ToArray(), true))
                {
                    if (dep.EndsWith(".cs") || dep.EndsWith(".shader") || dep.EndsWith(".hlsl")) continue;
                    foreach (var o in AssetDatabase.LoadAllAssetsAtPath(dep))
                    {
                        if (o == null) continue;
                        var t = o.GetType();
                        if (t.Namespace != null && t.Namespace.StartsWith("UnityEditor")) continue;
                        var asm = t.Assembly.GetName().Name;
                        if (asm.StartsWith("UnityEditor")) continue;
                        if (!byAsm.TryGetValue(asm, out var set)) byAsm[asm] = set = new SortedSet<string>();
                        set.Add(t.FullName);
                    }
                }
                var sb = new System.Text.StringBuilder();
                sb.AppendLine("<!-- written by AgentKit.Web.WebJobs.WriteBundleLinkXml: types used only inside AssetBundles -->");
                sb.AppendLine("<linker>");
                foreach (var kv in byAsm)
                {
                    sb.AppendLine("  <assembly fullname=\"" + kv.Key + "\">");
                    foreach (var tn in kv.Value) sb.AppendLine("    <type fullname=\"" + tn + "\" preserve=\"all\"/>");
                    sb.AppendLine("  </assembly>");
                }
                sb.AppendLine("</linker>");
                var outPath = AgentJob.Str("out", "Assets/AgentWeb/link.xml");
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(outPath)));
                File.WriteAllText(AgentJob.ResolvePath(outPath), sb.ToString());
                AssetDatabase.Refresh();
                return new Dictionary<string, object>
                {
                    { "out", outPath }, { "bundles", names.Cast<object>().ToList() }, { "roots", roots.Cast<object>().ToList() },
                    { "types", byAsm.SelectMany(kv => kv.Value.Select(tn => (object)(kv.Key + ":" + tn))).ToList() },
                };
            });
        }

        /// <summary>URP post-processing data on every UniversalRendererData (the renderer's Post-processing
        /// toggle). args: enabled (bool). enabled=false stores the previous references in
        /// Library/AgentWeb/postprocess_backup.json; enabled=true restores them. For size measurements and for
        /// games that ship no Volume effects (CrazyGames: about 1 MB Brotli).</summary>
        public static void SetPostProcessing()
        {
            AgentJob.Run(() =>
            {
                bool enabled = AgentJob.Bool("enabled", true);
                var backupPath = Path.Combine(AgentJob.ProjectRoot, "Library/AgentWeb/postprocess_backup.json");
                var backup = File.Exists(backupPath) ? AgentJson.ParseObject(File.ReadAllText(backupPath)) : new Dictionary<string, object>();
                var changed = new List<object>();
                foreach (var g in AssetDatabase.FindAssets("t:UniversalRendererData", new[] { "Assets" }))   // never edit package assets
                {
                    var p = AssetDatabase.GUIDToAssetPath(g);
                    var rd = AssetDatabase.LoadAssetAtPath<ScriptableObject>(p);
                    var so = new SerializedObject(rd);
                    var prop = so.FindProperty("postProcessData");
                    if (prop == null) continue;
                    if (!enabled && prop.objectReferenceValue != null)
                    {
                        backup[p] = AssetDatabase.GetAssetPath(prop.objectReferenceValue);
                        prop.objectReferenceValue = null;
                        changed.Add(p);
                    }
                    else if (enabled && prop.objectReferenceValue == null && backup.TryGetValue(p, out var prev))
                    {
                        prop.objectReferenceValue = AssetDatabase.LoadAssetAtPath<ScriptableObject>(Convert.ToString(prev));
                        changed.Add(p);
                    }
                    so.ApplyModifiedPropertiesWithoutUndo();
                    EditorUtility.SetDirty(rd);
                }
                AssetDatabase.SaveAssets();
                Directory.CreateDirectory(Path.GetDirectoryName(backupPath));
                File.WriteAllText(backupPath, AgentJson.Serialize(backup, true));
                return new Dictionary<string, object> { { "enabled", enabled }, { "changed", changed }, { "backup", backupPath } };
            });
        }
    }
}
