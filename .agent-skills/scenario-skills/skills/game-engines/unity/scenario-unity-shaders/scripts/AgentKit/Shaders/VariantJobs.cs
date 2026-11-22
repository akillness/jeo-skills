// AgentKit.Shaders v0.1 (scenario-unity-shaders skill, 2026-09-24). Shader variant counting and stripping that an
// agent can run headless, without a full player build:
//   - AgentVariantLogger: IPreprocessShaders + IPreprocessComputeShaders with callbackOrder int.MaxValue,
//     so it runs after every stripper and records exactly the variants that ship (shader, pass, stage,
//     keywords). Active only while a job points it at a log file.
//   - AgentStripRules: an IPreprocessShaders stripper (callbackOrder 0) driven by
//     ProjectSettings/AgentShaderStripRules.json: [{"shader": "AgentKit/Lit", "keyword": "_ADDITIONAL_LIGHTS_VERTEX",
//     "skip_development": true}]. Iterates backwards and RemoveAt (Carotenuto, Unity blog 2024).
//   - BuildShaderBundle job: builds an AssetBundle holding the given materials or shaders for a target.
//     IPreprocessShaders runs for AssetBundle builds too, and the job log gets Unity's own
//     "Compiling shader" funnel (Full variant space, After settings filtering, After built-in stripping,
//     After scriptable stripping) that ut_shaders.parse_variant_funnel reads.
//     args: assets[] (Assets/ paths), target (StandaloneOSX), out_dir, bundle ("agent_shaders"),
//           strip_rules[] (optional, written for this build then restored), development (bool)
//   - StrippingSettings job: Strict Shader Variant Matching, Log Shader Compilation, URP and Core stripping
//     settings (Strip Unused Variants, post-processing, screen coord override, export, log level).
//   - KeywordOverrides job (v0.2): Unity 6 Shader Build Settings through the public API
//     (EditorGraphicsSettings.Get/SetShaderBuildSettings): per keyword set a Type Override
//     (Default, AllVariants = multi_compile, MaterialUsageBasedVariants = shader_feature,
//     SingleVariantWithDynamicBranching = dynamic_branch) and keywords excluded from the build.
//     args: overrides[] {keywords: ["_", "_SCREEN_SPACE_OCCLUSION"], mode, exclude: [..]}, clear (bool),
//           shaders[] (names or paths to reimport and report keywordSpace isDynamic).
//     The setter writes the ACTIVE settings (the active build profile's when it overrides Graphics settings).
//   - PostProcessingAudit job (v0.2): every VolumeProfile under Assets/ (what URP 17.3 reads to keep
//     post-processing variants, ShaderBuildPreprocessor.GetSupportedFeaturesFromVolumes: `Has<T>()` on
//     each profile, scenes are not consulted), whether a build scene or the Default Volume Profile uses it,
//     and the post families it keeps. args: create_profile {path, overrides: {Bloom: {highQualityFiltering:
//     true, dirtIntensity: 1, dirtTexture: "Assets/..."}, FilmGrain: {}}} (optional, for tests and fixes).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_variants.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEditor.SceneManagement;
using System.Reflection;
using SBS = UnityEditor.Shaders.ShaderBuildSettings;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Shaders
{
    public class AgentVariantLogger : IPreprocessShaders, IPreprocessComputeShaders
    {
        public static string LogPath;                         // set by BuildShaderBundle; null = inactive
        public int callbackOrder => int.MaxValue;             // after every stripper: what ships

        static void Append(string line)
        {
            if (string.IsNullOrEmpty(LogPath)) return;
            File.AppendAllText(LogPath, line + "\n");
        }

        static string Keywords(ShaderCompilerData d)
        {
            var names = d.shaderKeywordSet.GetShaderKeywords().Select(k => k.name).OrderBy(n => n);
            return string.Join(" ", names);
        }

        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> data)
        {
            if (string.IsNullOrEmpty(LogPath)) return;
            var sb = new StringBuilder();
            foreach (var d in data)
                sb.Append("S\t").Append(shader.name).Append('\t').Append(snippet.passName).Append('\t')
                  .Append(snippet.passType).Append('\t').Append(snippet.shaderType).Append('\t')
                  .Append(d.shaderCompilerPlatform).Append('\t').Append(Keywords(d)).Append('\n');
            if (data.Count == 0)
                sb.Append("S0\t").Append(shader.name).Append('\t').Append(snippet.passName).Append('\t')
                  .Append(snippet.passType).Append('\t').Append(snippet.shaderType).Append("\t\t\n");
            File.AppendAllText(LogPath, sb.ToString());
        }

        public void OnProcessComputeShader(ComputeShader shader, string kernelName, IList<ShaderCompilerData> data)
        {
            if (string.IsNullOrEmpty(LogPath)) return;
            foreach (var d in data)
                Append("C\t" + shader.name + "\t" + kernelName + "\tCompute\tCompute\t" + d.shaderCompilerPlatform + "\t" + Keywords(d));
        }
    }

    [Serializable] class StripRule { public string shader; public string keyword; public bool skip_development; }
    [Serializable] class StripRuleList { public StripRule[] rules; }

    public class AgentStripRules : IPreprocessShaders
    {
        public const string RulesPath = "ProjectSettings/AgentShaderStripRules.json";
        public static int Removed;
        public int callbackOrder => 0;

        static List<StripRule> Load()
        {
            var path = Path.Combine(Directory.GetParent(Application.dataPath).FullName, RulesPath);
            if (!File.Exists(path)) return new List<StripRule>();
            var json = File.ReadAllText(path).Trim();
            if (json.StartsWith("[")) json = "{\"rules\":" + json + "}";
            var list = JsonUtility.FromJson<StripRuleList>(json);
            return list?.rules?.ToList() ?? new List<StripRule>();
        }

        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> data)
        {
            var rules = Load().Where(r => r.shader == shader.name || r.shader == "*").ToList();
            if (rules.Count == 0) return;
            bool dev = EditorUserBuildSettings.development;
            for (int i = data.Count - 1; i >= 0; i--)              // backwards: RemoveAt keeps indices valid
            {
                var kws = data[i].shaderKeywordSet.GetShaderKeywords().Select(k => k.name).ToList();
                foreach (var r in rules)
                {
                    if (r.skip_development && dev) continue;
                    if (kws.Contains(r.keyword)) { data.RemoveAt(i); Removed++; break; }
                }
            }
        }
    }

    public static class VariantJobs
    {
        public static void BuildShaderBundle()
        {
            AgentJob.Run(() =>
            {
                var assets = AgentJob.List("assets").Select(Convert.ToString).ToArray();
                if (assets.Length == 0) throw new ArgumentException("assets is empty");
                foreach (var a in assets)
                    if (AssetDatabase.LoadMainAssetAtPath(a) == null) throw new ArgumentException("asset not found: " + a);
                var target = (BuildTarget)Enum.Parse(typeof(BuildTarget), AgentJob.Str("target", "StandaloneOSX"));
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("bundles");
                Directory.CreateDirectory(outDir);
                var logPath = Path.Combine(AgentJob.OutDir(), "variants.tsv");
                File.WriteAllText(logPath, "");

                // optional strip rules for this build only
                var rulesAbs = Path.Combine(AgentJob.ProjectRoot, AgentStripRules.RulesPath);
                string previousRules = File.Exists(rulesAbs) ? File.ReadAllText(rulesAbs) : null;
                bool wroteRules = false;
                if (AgentJob.Has("strip_rules"))
                {
                    File.WriteAllText(rulesAbs, AgentJson.Serialize(AgentJob.List("strip_rules")));
                    wroteRules = true;
                }
                AgentStripRules.Removed = 0;
                AgentVariantLogger.LogPath = logPath;
                var sw = System.Diagnostics.Stopwatch.StartNew();
                AssetBundleManifest manifest;
                try
                {
                    var build = new AssetBundleBuild { assetBundleName = AgentJob.Str("bundle", "agent_shaders"), assetNames = assets };
                    var opts = BuildAssetBundleOptions.ForceRebuildAssetBundle | BuildAssetBundleOptions.StrictMode;
                    manifest = BuildPipeline.BuildAssetBundles(outDir, new[] { build }, opts, target);
                }
                finally
                {
                    AgentVariantLogger.LogPath = null;
                    if (wroteRules)
                    {
                        if (previousRules == null) File.Move(rulesAbs, rulesAbs + ".used-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"));
                        else File.WriteAllText(rulesAbs, previousRules);
                    }
                }
                sw.Stop();
                if (manifest == null) throw new InvalidOperationException("BuildAssetBundles returned null (see log)");

                // summarise: shader -> pass -> stage -> variant count, plus keyword frequency
                var perShader = new Dictionary<string, Dictionary<string, object>>();
                int total = 0;
                foreach (var line in File.ReadAllLines(logPath))
                {
                    var c = line.Split('\t');
                    if (c.Length < 6) continue;
                    var kind = c[0];
                    var shader = c[1];
                    var key = c[2] + " | " + c[4];            // pass | stage
                    if (!perShader.TryGetValue(shader, out var s))
                        perShader[shader] = s = new Dictionary<string, object> { { "total", 0 }, { "passes", new Dictionary<string, object>() }, { "keyword_frequency", new Dictionary<string, object>() } };
                    var passes = (Dictionary<string, object>)s["passes"];
                    if (!passes.ContainsKey(key)) passes[key] = 0;
                    if (kind == "S0") continue;
                    passes[key] = (int)passes[key] + 1;
                    s["total"] = (int)s["total"] + 1;
                    total++;
                    var freq = (Dictionary<string, object>)s["keyword_frequency"];
                    if (c.Length > 6)
                        foreach (var k in c[6].Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
                            freq[k] = (freq.TryGetValue(k, out var n) ? (int)n : 0) + 1;
                }
                return new Dictionary<string, object>
                {
                    { "target", target.ToString() }, { "bundle_dir", outDir }, { "seconds", Math.Round(sw.Elapsed.TotalSeconds, 1) },
                    { "variants_log", logPath }, { "variants_total", total }, { "stripped_by_rules", AgentStripRules.Removed },
                    { "shaders", perShader.ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                    { "bundles", manifest.GetAllAssetBundles().ToList() },
                };
            });
        }

        public static Dictionary<string, object> Settings()
        {
            var d = new Dictionary<string, object>
            {
                { "strict_shader_variant_matching", PlayerSettings.strictShaderVariantMatching },
                { "log_shader_compilation", GraphicsSettings.logWhenShaderIsCompiled },
            };
            if (GraphicsSettings.TryGetRenderPipelineSettings<ShaderStrippingSetting>(out var core))
            {
                d["export_shader_variants"] = core.exportShaderVariants;
                d["shader_variant_log_level"] = core.shaderVariantLogLevel.ToString();
                d["strip_runtime_debug_shaders"] = core.stripRuntimeDebugShaders;
            }
            if (GraphicsSettings.TryGetRenderPipelineSettings<URPShaderStrippingSetting>(out var urp))
            {
                d["strip_unused_variants"] = urp.stripUnusedVariants;
                d["strip_unused_post_processing_variants"] = urp.stripUnusedPostProcessingVariants;
                d["strip_screen_coord_override_variants"] = urp.stripScreenCoordOverrideVariants;
            }
            return d;
        }

        public static void StrippingSettings()
        {
            AgentJob.Run(() =>
            {
                if (AgentJob.Has("strict_variant_matching")) PlayerSettings.strictShaderVariantMatching = AgentJob.Bool("strict_variant_matching");
                if (AgentJob.Has("log_shader_compilation")) GraphicsSettings.logWhenShaderIsCompiled = AgentJob.Bool("log_shader_compilation");
                AssetDatabase.SaveAssets();
                return Settings();
            });
        }

        // ------------------------------------------------------------------ Shader Build Settings (Unity 6)
        static List<object> DescribeOverrides(SBS s)
        {
            var arr = s.GetKeywordDeclarationOverridesCopy() ?? new SBS.KeywordDeclarationOverride[0];
            return arr.Select(o => (object)new Dictionary<string, object>
            {
                { "keywords", (o.keywords ?? new SBS.KeywordOverrideInfo[0]).Select(k => (object)k.name).ToList() },
                { "excluded", (o.keywords ?? new SBS.KeywordOverrideInfo[0]).Where(k => !k.keepInBuild).Select(k => (object)k.name).ToList() },
                { "mode", o.variantGenerationMode.ToString() },
            }).ToList();
        }

        static Shader FindShader(string nameOrPath)
        {
            var s = nameOrPath.Contains("/") && (nameOrPath.EndsWith(".shader") || nameOrPath.EndsWith(".shadergraph"))
                ? AssetDatabase.LoadAssetAtPath<Shader>(nameOrPath) : Shader.Find(nameOrPath);
            if (s == null) throw new ArgumentException("shader not found: " + nameOrPath);
            return s;
        }

        public static void KeywordOverrides()
        {
            AgentJob.Run(() =>
            {
                var s = EditorGraphicsSettings.GetShaderBuildSettings();
                var before = DescribeOverrides(s);
                bool write = AgentJob.Has("overrides") || AgentJob.Bool("clear");
                if (write)
                {
                    var list = new List<SBS.KeywordDeclarationOverride>();
                    if (!AgentJob.Bool("clear"))
                        foreach (var o in AgentJob.List("overrides"))
                        {
                            var d = (Dictionary<string, object>)o;
                            var kws = ((List<object>)d["keywords"]).Select(Convert.ToString).ToList();
                            var excl = d.ContainsKey("exclude") && d["exclude"] != null
                                ? ((List<object>)d["exclude"]).Select(Convert.ToString).ToList() : new List<string>();
                            var ov = new SBS.KeywordDeclarationOverride();
                            ov.keywords = kws.Select(k => new SBS.KeywordOverrideInfo(k, !excl.Contains(k))).ToArray();
                            ov.variantGenerationMode = (SBS.ShaderVariantGenerationMode)Enum.Parse(typeof(SBS.ShaderVariantGenerationMode),
                                d.ContainsKey("mode") ? Convert.ToString(d["mode"]) : "Default");
                            list.Add(ov);
                        }
                    var arr = list.ToArray();
                    foreach (var ov in arr)
                        if (!ov.IsValid(out var error))
                            throw new ArgumentException("Shader Build Settings rejected an override: " + error);
                    // KeywordDeclarationOverrides is a property; set it through reflection so the job compiles whether
                    // ShaderBuildSettings is a class or a struct in this editor.
                    object boxed = s;
                    var prop = typeof(SBS).GetProperty("KeywordDeclarationOverrides", BindingFlags.Public | BindingFlags.Instance);
                    if (prop != null && prop.CanWrite) prop.SetValue(boxed, arr);
                    else
                    {
                        var field = typeof(SBS).GetFields(BindingFlags.NonPublic | BindingFlags.Instance)
                                               .FirstOrDefault(f => f.FieldType == typeof(SBS.KeywordDeclarationOverride[]));
                        if (field == null) throw new MissingMemberException("no writable KeywordDeclarationOverrides in this editor");
                        field.SetValue(boxed, arr);
                    }
                    EditorGraphicsSettings.SetShaderBuildSettings((SBS)boxed);
                    AssetDatabase.SaveAssets();
                }
                var after = DescribeOverrides(EditorGraphicsSettings.GetShaderBuildSettings());
                var watch = new HashSet<string>(after.Concat(before).SelectMany(o => ((List<object>)((Dictionary<string, object>)o)["keywords"]).Select(Convert.ToString)));
                var shaders = new List<object>();
                foreach (var n in AgentJob.List("shaders").Select(Convert.ToString))
                {
                    var sh = FindShader(n);
                    var path = AssetDatabase.GetAssetPath(sh);
                    if (write && path.StartsWith("Assets")) AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                    sh = FindShader(n);
                    shaders.Add(new Dictionary<string, object>
                    {
                        { "shader", sh.name }, { "path", path },
                        { "keywords", sh.keywordSpace.keywords.Where(k => watch.Contains(k.name))
                                        .Select(k => (object)new Dictionary<string, object> { { "name", k.name }, { "dynamic", k.isDynamic }, { "overridable", k.isOverridable }, { "type", k.type.ToString() } }).ToList() },
                    });
                }
                return new Dictionary<string, object> { { "before", before }, { "after", after }, { "written", write }, { "shaders", shaders } };
            });
        }

        // ------------------------------------------------------------------ post-processing variants
        static readonly (string type, string feature)[] k_PostFeatures =
        {
            ("LensDistortion", "LensDistortion"), ("Tonemapping", "ToneMapping"), ("FilmGrain", "FilmGrain"),
            ("DepthOfField", "DepthOfField"), ("MotionBlur", "CameraMotionBlur"), ("PaniniProjection", "PaniniProjection"),
            ("ChromaticAberration", "ChromaticAberration"),
        };

        // Mirrors URP 17.3 ShaderBuildPreprocessor.GetSupportedFeaturesFromVolumes for one profile.
        static List<string> KeptFeatures(VolumeProfile p)
        {
            var kept = new List<string>();
            foreach (var (typeName, feature) in k_PostFeatures)
                if (p.components.Any(c => c != null && c.GetType().Name == typeName)) kept.Add(feature);
            if (p.TryGet<Bloom>(out var bloom))
            {
                bool dirt = bloom.dirtIntensity.value > 0f && bloom.dirtTexture.value != null;
                kept.Add(bloom.highQualityFiltering.value ? (dirt ? "BloomHQDirt" : "BloomHQ") : (dirt ? "BloomLQDirt" : "BloomLQ"));
            }
            return kept;
        }

        static object ConvertParam(object v, Type t)
        {
            if (t == typeof(bool)) return Convert.ToBoolean(v);
            if (t == typeof(float)) return Convert.ToSingle(v);
            if (t == typeof(int)) return Convert.ToInt32(v);
            if (typeof(UnityEngine.Object).IsAssignableFrom(t)) return AssetDatabase.LoadAssetAtPath(Convert.ToString(v), t);
            if (t.IsEnum) return Enum.Parse(t, Convert.ToString(v));
            return Convert.ChangeType(v, t);
        }

        static string CreateProfile(Dictionary<string, object> spec)
        {
            var path = Convert.ToString(spec["path"]);
            Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, path);
            var types = TypeCache.GetTypesDerivedFrom<VolumeComponent>();
            var overrides = spec.ContainsKey("overrides") ? (Dictionary<string, object>)spec["overrides"] : new Dictionary<string, object>();
            foreach (var kv in overrides)
            {
                var t = types.FirstOrDefault(x => x.Name == kv.Key);
                if (t == null) throw new ArgumentException("no VolumeComponent type named " + kv.Key);
                var comp = profile.Add(t, true);
                comp.name = t.Name;
                AssetDatabase.AddObjectToAsset(comp, profile);
                var fields = kv.Value as Dictionary<string, object> ?? new Dictionary<string, object>();
                foreach (var f in fields)
                {
                    var fi = t.GetField(f.Key, BindingFlags.Public | BindingFlags.Instance);
                    if (fi == null) throw new ArgumentException(kv.Key + " has no parameter " + f.Key);
                    var param = fi.GetValue(comp);
                    var valueType = param.GetType().GetProperty("value").PropertyType;
                    param.GetType().GetMethod("Override", new[] { valueType }).Invoke(param, new[] { ConvertParam(f.Value, valueType) });
                }
            }
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return path;
        }

        public static void PostProcessingAudit()
        {
            AgentJob.Run(() =>
            {
                string created = AgentJob.Has("create_profile") ? CreateProfile(AgentJob.Dict("create_profile")) : null;
                var buildScenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
                var used = new HashSet<string>(buildScenes.Length > 0 ? AssetDatabase.GetDependencies(buildScenes, true) : new string[0]);
                string defaultProfile = null;
                if (GraphicsSettings.TryGetRenderPipelineSettings<URPDefaultVolumeProfileSettings>(out var dvs) && dvs.volumeProfile != null)
                    defaultProfile = AssetDatabase.GetAssetPath(dvs.volumeProfile);
                var profiles = new List<object>();
                var union = new SortedSet<string>();
                foreach (var guid in AssetDatabase.FindAssets("t:VolumeProfile"))
                {
                    var path = AssetDatabase.GUIDToAssetPath(guid);
                    if (!path.StartsWith("Assets")) continue;               // URP reads only Assets/
                    var p = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
                    if (p == null) continue;
                    var kept = KeptFeatures(p);
                    foreach (var k in kept) union.Add(k);
                    profiles.Add(new Dictionary<string, object>
                    {
                        { "path", path }, { "overrides", p.components.Where(c => c != null).Select(c => (object)c.GetType().Name).ToList() },
                        { "is_default_volume_profile", path == defaultProfile }, { "used_by_build_scene", used.Contains(path) },
                        { "keeps", kept.Cast<object>().ToList() },
                    });
                }
                var orphans = profiles.Cast<Dictionary<string, object>>()
                    .Where(d => !(bool)d["used_by_build_scene"] && !(bool)d["is_default_volume_profile"]).Select(d => d["path"]).ToList();
                return new Dictionary<string, object>
                {
                    { "created", created }, { "strip_unused_post_processing_variants", Settings().TryGetValue("strip_unused_post_processing_variants", out var sp) ? sp : null },
                    { "default_volume_profile", defaultProfile }, { "build_scenes", buildScenes.Cast<object>().ToList() },
                    { "profiles", profiles }, { "kept_features", union.Cast<object>().ToList() },
                    { "profiles_outside_build_scenes", orphans },
                };
            });
        }
    }
}
