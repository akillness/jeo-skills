// AgentKit.Shaders v0.1 (scenario-unity-shaders skill, 2026-09-24). What an agent without a mouse CAN do with
// Shader Graph 17.3: bring in graphs that already exist (package samples, templates, a team's graphs),
// duplicate them, and drive them through their exposed properties and keywords. Wiring nodes needs the
// graph editor (GUI path in references/gui-paths.md); logic that must change goes into an agent-owned
// .hlsl behind a File-mode Custom Function node.
//
// Jobs:
//   ImportPackageSample args: package ("com.unity.shadergraph"), sample folder under Samples~ ("CustomLighting"),
//                       dest ("Assets/Samples/ShaderGraph/CustomLighting"). Copies files WITH their .meta (sub
//                       graph references are GUIDs), refreshes, and reports every graph's shader and errors.
//                       The scripted twin of Package Manager > Samples > Import.
//   DuplicateGraph      args: source (.shadergraph path, Assets/ or Packages/), dest -> AssetDatabase.CopyAsset
//                       (new GUID; sub graph references stay valid).
//   GraphReport         args: paths[] (.shadergraph) -> generated shader name, errors, exposed properties
//                       (reference names for Material.SetX), keywords, passes.
//   GeneratedCode       args: paths[] (.shadergraph) -> writes the generated ShaderLab text (what the Inspector's
//                       "View Generated Shader" shows) to out/generated/<name>.shader and reports per graph:
//                       pass blocks, `#define _ALPHATEST_ON 1` lines, _ALPHATEST_ON keyword pragmas, keywordSpace.
//                       Reads internal ShaderGraphImporter.GetShaderText by reflection (Shader Graph 17.3; the job
//                       throws a clear error if the method moves). Proves Graph Settings effects such as Alpha
//                       Clipping, which a Boolean keyword cannot undo (URP UniversalTarget AddAlphaClipControlToPass).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py (v0.2 adds GeneratedCode).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Shaders
{
    public static class ShaderGraphJobs
    {
        static void CopyDir(string src, string dst, List<string> copied)
        {
            Directory.CreateDirectory(dst);
            foreach (var f in Directory.GetFiles(src))
            {
                var d = Path.Combine(dst, Path.GetFileName(f));
                if (!File.Exists(d)) { File.Copy(f, d); copied.Add(d); }
            }
            foreach (var sub in Directory.GetDirectories(src))
                CopyDir(sub, Path.Combine(dst, Path.GetFileName(sub)), copied);
        }

        public static Dictionary<string, object> Report(string graphPath)
        {
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(graphPath);
            if (shader == null)
                return new Dictionary<string, object> { { "path", graphPath }, { "error", "no Shader generated (import failed?)" } };
            var msgs = ShaderUtil.GetShaderMessages(shader);
            return new Dictionary<string, object>
            {
                { "path", graphPath }, { "shader", shader.name }, { "supported", shader.isSupported },
                { "has_error", ShaderUtil.ShaderHasError(shader) },
                { "errors", msgs.Where(m => m.severity == UnityEditor.Rendering.ShaderCompilerMessageSeverity.Error).Select(m => (object)(m.message + " @" + m.file + ":" + m.line)).Take(10).ToList() },
                { "pass_count", shader.passCount },
                { "properties", ShaderJobs.PropertyList(shader) },
                { "keywords", shader.keywordSpace.keywordNames.ToList() },
            };
        }

        public static void ImportPackageSample()
        {
            AgentJob.Run(() =>
            {
                var package = AgentJob.Str("package", "com.unity.shadergraph");
                var sample = AgentJob.Str("sample", "CustomLighting");
                var dest = AgentJob.Str("dest", "Assets/Samples/ShaderGraph/" + sample);
                var info = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/" + package);
                if (info == null) throw new ArgumentException("package not found in the project: " + package);
                var src = Path.Combine(info.resolvedPath, "Samples~", sample);
                if (!Directory.Exists(src)) throw new DirectoryNotFoundException(src + " (samples: " +
                    string.Join(", ", Directory.GetDirectories(Path.Combine(info.resolvedPath, "Samples~")).Select(Path.GetFileName)) + ")");
                var copied = new List<string>();
                CopyDir(src, AgentJob.ResolvePath(dest), copied);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                var graphs = Directory.GetFiles(AgentJob.ResolvePath(dest), "*.shadergraph", SearchOption.AllDirectories)
                                      .Select(ShaderJobs.ToAssetPath).OrderBy(p => p).ToList();
                return new Dictionary<string, object>
                {
                    { "package", package + "@" + info.version }, { "source", src }, { "dest", dest },
                    { "files_copied", copied.Count }, { "graphs", graphs.Select(g => (object)Report(g)).ToList() },
                };
            });
        }

        public static void DuplicateGraph()
        {
            AgentJob.Run(() =>
            {
                var src = AgentJob.Str("source");
                var dst = AgentJob.Str("dest");
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(dst)));
                if (!File.Exists(AgentJob.ResolvePath(dst)) && !AssetDatabase.CopyAsset(src, dst))
                    throw new InvalidOperationException("CopyAsset failed: " + src + " -> " + dst);
                AssetDatabase.ImportAsset(dst, ImportAssetOptions.ForceSynchronousImport);
                return Report(dst);
            });
        }

        // Generated ShaderLab text of a graph, through Shader Graph's internal importer entry point.
        public static string GeneratedText(string graphPath)
        {
            var t = Type.GetType("UnityEditor.ShaderGraph.ShaderGraphImporter, Unity.ShaderGraph.Editor");
            if (t == null) throw new InvalidOperationException("UnityEditor.ShaderGraph.ShaderGraphImporter not found (Shader Graph package missing?)");
            var mi = t.GetMethods(BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)
                      .FirstOrDefault(m => m.Name == "GetShaderText" && m.GetParameters().Length == 4 && m.GetParameters()[3].ParameterType.IsByRef);
            if (mi == null) throw new MissingMethodException("ShaderGraphImporter.GetShaderText(path, out textures, AssetCollection, out GraphData) moved in this Shader Graph version");
            var assetCollection = Activator.CreateInstance(mi.GetParameters()[2].ParameterType);
            var a = new object[] { graphPath, null, assetCollection, null };
            return (string)mi.Invoke(null, a);
        }

        public static void GeneratedCode()
        {
            AgentJob.Run(() =>
            {
                var list = new List<object>();
                var outDir = AgentJob.OutDir("generated");
                foreach (var p in ShaderJobs.ExpandPaths(AgentJob.List("paths"), ".shadergraph"))
                {
                    AssetDatabase.ImportAsset(p, ImportAssetOptions.ForceSynchronousImport);
                    var text = GeneratedText(p);
                    var file = Path.Combine(outDir, Path.GetFileNameWithoutExtension(p) + ".shader");
                    File.WriteAllText(file, text);
                    var shader = AssetDatabase.LoadAssetAtPath<Shader>(p);
                    list.Add(new Dictionary<string, object>
                    {
                        { "path", p }, { "file", file }, { "chars", text.Length },
                        { "pass_blocks", Regex.Matches(text, @"^\s*Pass\s*$", RegexOptions.Multiline).Count },
                        { "alphatest_defines", Regex.Matches(text, @"#define\s+_ALPHATEST_ON\s+1\b").Count },
                        { "alphatest_keyword_pragmas", Regex.Matches(text, @"#pragma\s+(shader_feature|multi_compile)\w*\s+[^\n]*\b_ALPHATEST_ON\b").Count },
                        { "keywords", shader != null ? shader.keywordSpace.keywordNames.ToList() : new List<string>() },
                    });
                }
                return new Dictionary<string, object> { { "graphs", list } };
            });
        }

        public static void GraphReport()
        {
            AgentJob.Run(() =>
            {
                var list = new List<object>();
                foreach (var p in ShaderJobs.ExpandPaths(AgentJob.List("paths"), ".shadergraph"))
                {
                    AssetDatabase.ImportAsset(p, ImportAssetOptions.ForceSynchronousImport);
                    list.Add(Report(p));
                }
                return new Dictionary<string, object> { { "graphs", list } };
            });
        }
    }
}
