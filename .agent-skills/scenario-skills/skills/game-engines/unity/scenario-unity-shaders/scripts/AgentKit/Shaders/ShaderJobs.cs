// AgentKit.Shaders v0.1 (scenario-unity-shaders skill, 2026-09-24). Shader validation, materials and URP
// settings as batch jobs. Copied into Assets/Editor/AgentKit/Shaders/ by ut_shaders.install().
//
// Jobs (ut_run.run_method(P, "AgentKit.Shaders.ShaderJobs.<Job>", args)):
//   ValidateShaders  args: paths[] (.shader/.compute or folders), platform ("Metal"), compile (bool, default true)
//                    -> per shader: import errors and warnings (ShaderUtil.GetShaderMessages), passes with
//                       LightMode, per-pass keywords, a forced compile of the default variant of every pass
//                       (ShaderData.Pass.CompileVariant) for the target platform, SRP Batcher code, Inspector
//                       variant counts. ok=false when any shader has an error.
//   SetupMaterials   args: materials[{path, shader, floats{}, colors{}, vectors{}, textures{}, keywords_on[],
//                       keywords_off[], render_queue}] -> creates or updates material assets.
//   ConfigureUrp     args: asset ("active" or path), depth_texture, opaque_texture, renderer (path), rendering_mode
//                       (Forward|ForwardPlus|Deferred|DeferredPlus), depth_priming (Disabled|Auto|Forced),
//                       features_active{name: bool}, strict_variant_matching, log_shader_compilation.
//   ShaderProperties args: shader (name or asset path, including a .shadergraph) -> exposed properties with
//                       reference names, types, flags and defaults (what Material.SetX must use).
//   ImportTextures   args: textures[{path, type, srgb, wrap, filter, aniso, mips, max_size}] (TextureImporter).
//   ApiProbe         args: names[] -> where each member lives in THIS editor (a compile error aborts every job).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Shaders
{
    public static class ShaderJobs
    {
        // ------------------------------------------------------------------ helpers
        public static IEnumerable<string> ExpandPaths(IEnumerable<object> items, params string[] exts)
        {
            foreach (var o in items)
            {
                var p = Convert.ToString(o);
                if (string.IsNullOrEmpty(p)) continue;
                var abs = AgentJob.ResolvePath(p);
                if (Directory.Exists(abs))
                {
                    foreach (var f in Directory.GetFiles(abs, "*.*", SearchOption.AllDirectories))
                        if (exts.Any(e => f.EndsWith(e, StringComparison.OrdinalIgnoreCase)))
                            yield return ToAssetPath(f);
                }
                else yield return p.Replace('\\', '/');
            }
        }

        public static string ToAssetPath(string abs)
        {
            var root = AgentJob.ProjectRoot.Replace('\\', '/').TrimEnd('/') + "/";
            abs = abs.Replace('\\', '/');
            return abs.StartsWith(root) ? abs.Substring(root.Length) : abs;
        }

        public static Shader LoadShader(string nameOrPath)
        {
            if (string.IsNullOrEmpty(nameOrPath)) return null;
            if (nameOrPath.StartsWith("Assets/") || nameOrPath.StartsWith("Packages/"))
            {
                var s = AssetDatabase.LoadAssetAtPath<Shader>(nameOrPath);
                if (s != null) return s;
            }
            return Shader.Find(nameOrPath);
        }

        static object CallInternal(Type t, string method, params object[] args)
        {
            var mi = t.GetMethods(BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)
                      .FirstOrDefault(m => m.Name == method && m.GetParameters().Length == args.Length);
            if (mi == null) return null;
            try { return mi.Invoke(null, args); } catch { return null; }
        }

        /// <summary>The numbers the shader Inspector shows ("Compile and show code" variants): internal
        /// ShaderUtil.GetVariantCount through reflection; null if the member moved.</summary>
        public static Dictionary<string, object> InspectorVariantCounts(Shader s)
        {
            var sceneOnly = CallInternal(typeof(ShaderUtil), "GetVariantCount", s, true);
            var all = CallInternal(typeof(ShaderUtil), "GetVariantCount", s, false);
            return new Dictionary<string, object>
            {
                { "used_by_open_scenes", sceneOnly == null ? null : (object)Convert.ToInt64(sceneOnly) },
                { "all_keywords", all == null ? null : (object)Convert.ToInt64(all) },
            };
        }

        public static Dictionary<string, object> SrpBatcher(Shader s, int subshader)
        {
            var code = CallInternal(typeof(ShaderUtil), "GetSRPBatcherCompatibilityCode", s, subshader);
            if (code == null) return new Dictionary<string, object> { { "known", false } };
            int c = Convert.ToInt32(code);
            var reason = c == 0 ? "" : Convert.ToString(CallInternal(typeof(ShaderUtil), "GetSRPBatcherCompatibilityIssueReason", s, subshader, c));
            return new Dictionary<string, object> { { "known", true }, { "compatible", c == 0 }, { "code", c }, { "reason", reason } };
        }

        static List<object> Messages(IEnumerable<ShaderMessage> msgs)
        {
            var l = new List<object>();
            foreach (var m in msgs)
                l.Add(new Dictionary<string, object>
                {
                    { "severity", m.severity.ToString() }, { "message", m.message }, { "file", m.file },
                    { "line", m.line }, { "platform", m.platform.ToString() },
                    { "details", string.IsNullOrEmpty(m.messageDetails) ? null : m.messageDetails.Substring(0, Math.Min(400, m.messageDetails.Length)) },
                });
            return l;
        }

        // ------------------------------------------------------------------ ValidateShaders
        public static Dictionary<string, object> ValidateShader(Shader s, string path, ShaderCompilerPlatform platform, BuildTarget target, bool compile)
        {
            var msgs = ShaderUtil.GetShaderMessages(s);
            int errors = msgs.Count(m => m.severity == ShaderCompilerMessageSeverity.Error);
            int warnings = msgs.Count(m => m.severity == ShaderCompilerMessageSeverity.Warning);
            var data = ShaderUtil.GetShaderData(s);
            var subs = new List<object>();
            int compileErrors = 0;
            // A FallBack adds its subshaders to ShaderData: the active one is the first the GPU supports.
            var activeObj = CallInternal(typeof(ShaderUtil), "GetShaderActiveSubshaderIndex", s);
            int active = activeObj == null ? 0 : Convert.ToInt32(activeObj);
            for (int si = 0; si < data.SubshaderCount; si++)
            {
                var sub = data.GetSubshader(si);
                var passes = new List<object>();
                for (int pi = 0; pi < sub.PassCount; pi++)
                {
                    var pass = sub.GetPass(pi);
                    var pid = new PassIdentifier((uint)si, (uint)pi);
                    var kws = ShaderUtil.GetPassKeywords(s, pid).Select(k => k.name).OrderBy(n => n).ToList();
                    var passDict = new Dictionary<string, object>
                    {
                        { "index", pi }, { "name", pass.Name },
                        { "light_mode", si < s.subshaderCount ? s.FindPassTagValue(si, pi, new ShaderTagId("LightMode")).name : "(fallback)" },
                        { "keywords", kws }, { "keyword_count", kws.Count },
                    };
                    if (compile)
                    {
                        var stages = new List<object>();
                        foreach (var st in new[] { UnityEditor.Rendering.ShaderType.Vertex, UnityEditor.Rendering.ShaderType.Fragment })
                        {
                            var info = pass.CompileVariant(st, new string[0], platform, target);
                            var errs = info.Messages.Where(m => m.severity == ShaderCompilerMessageSeverity.Error).ToList();
                            compileErrors += errs.Count;
                            stages.Add(new Dictionary<string, object>
                            {
                                { "stage", st.ToString() }, { "success", info.Success },
                                { "bytes", info.ShaderData == null ? 0 : info.ShaderData.Length },
                                { "messages", Messages(info.Messages) },
                            });
                        }
                        passDict["default_variant_compile"] = stages;
                    }
                    passes.Add(passDict);
                }
                subs.Add(new Dictionary<string, object>
                {
                    // with -nographics the active subshader is the FallBack's (no GPU): judge subshader 0, compiled for the platform arg
                    { "index", si }, { "active", si == active }, { "own", si < s.subshaderCount }, { "passes", passes },
                    // "Not initialized" until the shader has rendered once with the pipeline: read it after a capture
                    // (ShaderLab.Shots reports it for every shader in the scene).
                    { "srp_batcher", SrpBatcher(s, si) },
                });
            }
            return new Dictionary<string, object>
            {
                { "path", path }, { "name", s.name }, { "supported", s.isSupported },
                { "has_error", ShaderUtil.ShaderHasError(s) || errors > 0 || compileErrors > 0 },
                { "import_errors", errors }, { "import_warnings", warnings }, { "compile_errors", compileErrors },
                { "messages", Messages(msgs) }, { "subshaders", subs },
                { "keyword_space", s.keywordSpace.keywordNames.OrderBy(n => n).ToList() },
                { "inspector_variant_counts", InspectorVariantCounts(s) },
                { "render_queue", s.renderQueue },
            };
        }

        public static void ValidateShaders()
        {
            AgentJob.Run(() =>
            {
                var platform = (ShaderCompilerPlatform)Enum.Parse(typeof(ShaderCompilerPlatform), AgentJob.Str("platform", "Metal"));
                var target = (BuildTarget)Enum.Parse(typeof(BuildTarget), AgentJob.Str("build_target", "StandaloneOSX"));
                bool compile = AgentJob.Bool("compile", true);
                var paths = ExpandPaths(AgentJob.List("paths"), ".shader", ".compute", ".shadergraph").Distinct().ToList();
                if (paths.Count == 0) throw new ArgumentException("paths is empty");
                var shaders = new List<object>();
                var computes = new List<object>();
                int bad = 0;
                foreach (var p in paths)
                {
                    AssetDatabase.ImportAsset(p, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                    if (p.EndsWith(".compute", StringComparison.OrdinalIgnoreCase))
                    {
                        var cs = AssetDatabase.LoadAssetAtPath<ComputeShader>(p);
                        if (cs == null) { bad++; computes.Add(new Dictionary<string, object> { { "path", p }, { "error", "not a ComputeShader" } }); continue; }
                        var msgs = ShaderUtil.GetComputeShaderMessages(cs);
                        int errs = msgs.Count(m => m.severity == ShaderCompilerMessageSeverity.Error);
                        if (errs > 0) bad++;
                        computes.Add(new Dictionary<string, object>
                        {
                            { "path", p }, { "errors", errs }, { "messages", Messages(msgs) },
                            { "keyword_space", cs.keywordSpace.keywordNames.ToList() },
                        });
                        continue;
                    }
                    var s = AssetDatabase.LoadAssetAtPath<Shader>(p);
                    if (s == null) { bad++; shaders.Add(new Dictionary<string, object> { { "path", p }, { "error", "no Shader at path (a .shadergraph that failed to import?)" } }); continue; }
                    var r = ValidateShader(s, p, platform, target, compile);
                    if ((bool)r["has_error"]) bad++;
                    shaders.Add(r);
                }
                var result = new Dictionary<string, object>
                {
                    { "platform", platform.ToString() }, { "shaders", shaders }, { "computes", computes }, { "bad", bad },
                };
                if (bad > 0) AgentJob.Fail(bad + " shader(s) with errors", result);
                return result;
            });
        }

        // ------------------------------------------------------------------ materials
        public static Material CreateOrUpdateMaterial(Dictionary<string, object> spec)
        {
            var path = Convert.ToString(spec["path"]);
            var shaderName = spec.TryGetValue("shader", out var sn) ? Convert.ToString(sn) : null;
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            var shader = LoadShader(shaderName);
            if (mat == null)
            {
                if (shader == null) throw new ArgumentException("shader not found: " + shaderName);
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
                mat = new Material(shader) { name = Path.GetFileNameWithoutExtension(path) };
                AssetDatabase.CreateAsset(mat, path);
            }
            else if (shader != null && mat.shader != shader) mat.shader = shader;

            if (spec.TryGetValue("floats", out var f) && f is Dictionary<string, object> fd)
                foreach (var kv in fd) mat.SetFloat(kv.Key, (float)AgentJson.ToDouble(kv.Value));
            if (spec.TryGetValue("colors", out var c) && c is Dictionary<string, object> cd)
                foreach (var kv in cd) mat.SetColor(kv.Key, AgentJson.ToColor(kv.Value, Color.white));
            if (spec.TryGetValue("vectors", out var v) && v is Dictionary<string, object> vd)
                foreach (var kv in vd) { var col = AgentJson.ToColor(kv.Value, Color.clear); mat.SetVector(kv.Key, new Vector4(col.r, col.g, col.b, col.a)); }
            if (spec.TryGetValue("textures", out var t) && t is Dictionary<string, object> td)
                foreach (var kv in td) mat.SetTexture(kv.Key, kv.Value == null ? null : AssetDatabase.LoadAssetAtPath<Texture>(Convert.ToString(kv.Value)));
            if (spec.TryGetValue("keywords_on", out var on) && on is List<object> onl)
                foreach (var k in onl) mat.EnableKeyword(Convert.ToString(k));
            if (spec.TryGetValue("keywords_off", out var off) && off is List<object> offl)
                foreach (var k in offl) mat.DisableKeyword(Convert.ToString(k));
            if (spec.TryGetValue("render_queue", out var rq) && rq != null) mat.renderQueue = (int)AgentJson.ToDouble(rq, -1);
            EditorUtility.SetDirty(mat);
            return mat;
        }

        public static void SetupMaterials()
        {
            AgentJob.Run(() =>
            {
                var done = new List<object>();
                AssetDatabase.StartAssetEditing();
                try
                {
                    foreach (var o in AgentJob.List("materials"))
                    {
                        var spec = o as Dictionary<string, object>;
                        if (spec == null) continue;
                        var m = CreateOrUpdateMaterial(spec);
                        done.Add(new Dictionary<string, object>
                        {
                            { "path", AssetDatabase.GetAssetPath(m) }, { "shader", m.shader.name },
                            { "keywords", m.shaderKeywords.ToList() }, { "render_queue", m.renderQueue },
                            { "shader_supported", m.shader.isSupported },
                        });
                    }
                }
                finally { AssetDatabase.StopAssetEditing(); }   // a missing Stop freezes the AssetDatabase
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "materials", done } };
            });
        }

        // ------------------------------------------------------------------ textures
        /// <summary>ImportTextures args: textures[{path, type (Default|NormalMap|SingleChannel), srgb, wrap (Repeat|Clamp),
        /// filter (Point|Bilinear|Trilinear), aniso, mips, max_size}]. Data textures (masks, noise, flow) want srgb false.</summary>
        public static void ImportTextures()
        {
            AgentJob.Run(() =>
            {
                var done = new List<object>();
                foreach (var o in AgentJob.List("textures").OfType<Dictionary<string, object>>())
                {
                    var path = Convert.ToString(o["path"]);
                    AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                    var ti = AssetImporter.GetAtPath(path) as TextureImporter;
                    if (ti == null) throw new ArgumentException("no TextureImporter at " + path);
                    if (o.TryGetValue("type", out var t)) ti.textureType = (TextureImporterType)Enum.Parse(typeof(TextureImporterType), Convert.ToString(t));
                    if (o.TryGetValue("srgb", out var s)) ti.sRGBTexture = s is bool b ? b : AgentJson.ToDouble(s) > 0;
                    if (o.TryGetValue("wrap", out var w)) ti.wrapMode = (TextureWrapMode)Enum.Parse(typeof(TextureWrapMode), Convert.ToString(w));
                    if (o.TryGetValue("filter", out var f)) ti.filterMode = (FilterMode)Enum.Parse(typeof(FilterMode), Convert.ToString(f));
                    if (o.TryGetValue("aniso", out var a)) ti.anisoLevel = (int)AgentJson.ToDouble(a);
                    if (o.TryGetValue("mips", out var mp)) ti.mipmapEnabled = mp is bool mb ? mb : AgentJson.ToDouble(mp) > 0;
                    if (o.TryGetValue("max_size", out var ms)) ti.maxTextureSize = (int)AgentJson.ToDouble(ms);
                    ti.SaveAndReimport();
                    done.Add(new Dictionary<string, object>
                    {
                        { "path", path }, { "type", ti.textureType.ToString() }, { "srgb", ti.sRGBTexture },
                        { "wrap", ti.wrapMode.ToString() }, { "mips", ti.mipmapEnabled }, { "aniso", ti.anisoLevel },
                    });
                }
                return new Dictionary<string, object> { { "textures", done } };
            });
        }

        // ------------------------------------------------------------------ URP settings
        public static UniversalRenderPipelineAsset ActiveUrpAsset(string pathOrActive)
        {
            if (string.IsNullOrEmpty(pathOrActive) || pathOrActive == "active")
                return (QualitySettings.renderPipeline ?? GraphicsSettings.defaultRenderPipeline) as UniversalRenderPipelineAsset;
            return AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(pathOrActive);
        }

        public static UniversalRendererData RendererData(string path, UniversalRenderPipelineAsset asset)
        {
            if (!string.IsNullOrEmpty(path)) return AssetDatabase.LoadAssetAtPath<UniversalRendererData>(path);
            if (asset == null) return null;
            var list = asset.rendererDataList;
            return list.Length > 0 ? list[0] as UniversalRendererData : null;
        }

        public static void ConfigureUrp()
        {
            AgentJob.Run(() =>
            {
                var asset = ActiveUrpAsset(AgentJob.Str("asset", "active"));
                if (asset == null) throw new InvalidOperationException("no URP asset (Built-in pipeline project?)");
                var changes = new List<string>();
                if (AgentJob.Has("depth_texture")) { asset.supportsCameraDepthTexture = AgentJob.Bool("depth_texture"); changes.Add("depth_texture"); }
                if (AgentJob.Has("opaque_texture")) { asset.supportsCameraOpaqueTexture = AgentJob.Bool("opaque_texture"); changes.Add("opaque_texture"); }
                EditorUtility.SetDirty(asset);
                var rd = RendererData(AgentJob.Str("renderer"), asset);
                if (rd != null)
                {
                    if (AgentJob.Has("rendering_mode")) { rd.renderingMode = (RenderingMode)Enum.Parse(typeof(RenderingMode), AgentJob.Str("rendering_mode")); changes.Add("rendering_mode"); }
                    if (AgentJob.Has("depth_priming")) { rd.depthPrimingMode = (DepthPrimingMode)Enum.Parse(typeof(DepthPrimingMode), AgentJob.Str("depth_priming")); changes.Add("depth_priming"); }
                    foreach (var kv in AgentJob.Dict("features_active"))
                    {
                        var feat = rd.rendererFeatures.FirstOrDefault(x => x != null && x.name == kv.Key);
                        if (feat == null) { AgentJob.Warn("renderer feature not found: " + kv.Key); continue; }
                        feat.SetActive(AgentJson.ToDouble(kv.Value) > 0 || (kv.Value is bool b && b));
                        EditorUtility.SetDirty(feat);
                        changes.Add("feature:" + kv.Key);
                    }
                    rd.SetDirty();
                    EditorUtility.SetDirty(rd);
                }
                if (AgentJob.Has("strict_variant_matching")) { PlayerSettings.strictShaderVariantMatching = AgentJob.Bool("strict_variant_matching"); changes.Add("strict_variant_matching"); }
                if (AgentJob.Has("log_shader_compilation")) { GraphicsSettings.logWhenShaderIsCompiled = AgentJob.Bool("log_shader_compilation"); changes.Add("log_shader_compilation"); }
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "asset", AssetDatabase.GetAssetPath(asset) }, { "changes", changes },
                    { "depth_texture", asset.supportsCameraDepthTexture }, { "opaque_texture", asset.supportsCameraOpaqueTexture },
                    { "renderer", rd == null ? null : AssetDatabase.GetAssetPath(rd) },
                    { "rendering_mode", rd == null ? null : rd.renderingMode.ToString() },
                    { "depth_priming", rd == null ? null : rd.depthPrimingMode.ToString() },
                    { "features", rd == null ? null : rd.rendererFeatures.Where(x => x != null).Select(x => (object)new Dictionary<string, object> { { "name", x.name }, { "type", x.GetType().Name }, { "active", x.isActive } }).ToList() },
                    { "strict_variant_matching", PlayerSettings.strictShaderVariantMatching },
                    { "log_shader_compilation", GraphicsSettings.logWhenShaderIsCompiled },
                };
            });
        }

        // ------------------------------------------------------------------ API probe
        /// <summary>Does this API exist in THIS editor? args: names[] (member names, e.g. "SetShaderUserValue").
        /// Lists every public or internal member with that name in UnityEngine/UnityEditor/Unity.* assemblies,
        /// with its declaring type and signature. Cheaper than a compile error, which aborts every batch job.</summary>
        public static void ApiProbe()
        {
            AgentJob.Run(() =>
            {
                var names = new HashSet<string>(AgentJob.List("names").Select(Convert.ToString));
                var found = new Dictionary<string, object>();
                foreach (var n in names) found[n] = new List<object>();
                const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    var an = asm.GetName().Name;
                    if (!(an.StartsWith("UnityEngine") || an.StartsWith("UnityEditor") || an.StartsWith("Unity."))) continue;
                    Type[] types;
                    try { types = asm.GetTypes(); } catch (ReflectionTypeLoadException e) { types = e.Types.Where(t => t != null).ToArray(); }
                    foreach (var t in types)
                        foreach (var m in t.GetMembers(all))
                            if (names.Contains(m.Name))
                                ((List<object>)found[m.Name]).Add(t.FullName + " :: " + m.ToString() +
                                    (m is MethodBase mb ? (mb.IsPublic ? " [public]" : " [non-public]") : ""));
                }
                return found;
            });
        }

        // ------------------------------------------------------------------ properties (Shader Graph too)
        public static List<object> PropertyList(Shader s)
        {
            var props = new List<object>();
            for (int i = 0; i < s.GetPropertyCount(); i++)
            {
                var type = s.GetPropertyType(i);
                var d = new Dictionary<string, object>
                {
                    { "reference", s.GetPropertyName(i) }, { "display", s.GetPropertyDescription(i) },
                    { "type", type.ToString() }, { "flags", s.GetPropertyFlags(i).ToString() },
                    { "attributes", s.GetPropertyAttributes(i).ToList() },
                };
                if (type == ShaderPropertyType.Float || type == ShaderPropertyType.Range) d["default"] = s.GetPropertyDefaultFloatValue(i);
                if (type == ShaderPropertyType.Range) d["range"] = s.GetPropertyRangeLimits(i);
                if (type == ShaderPropertyType.Color || type == ShaderPropertyType.Vector) d["default"] = s.GetPropertyDefaultVectorValue(i);
                if (type == ShaderPropertyType.Texture) d["default"] = s.GetPropertyTextureDefaultName(i);
                props.Add(d);
            }
            return props;
        }

        public static void ShaderProperties()
        {
            AgentJob.Run(() =>
            {
                var key = AgentJob.Str("shader");
                if (key != null && key.EndsWith(".shadergraph")) AssetDatabase.ImportAsset(key, ImportAssetOptions.ForceSynchronousImport);
                var s = LoadShader(key);
                if (s == null) throw new ArgumentException("shader not found: " + key);
                return new Dictionary<string, object>
                {
                    { "name", s.name }, { "path", AssetDatabase.GetAssetPath(s) }, { "properties", PropertyList(s) },
                    { "keywords", s.keywordSpace.keywordNames.ToList() }, { "pass_count", s.passCount },
                };
            });
        }
    }
}
