// AgentKit.Pipeline v0.1 (scenario-unity-pipeline-automation, 2026-09-24). Import rules shared by the
// AssetPostprocessor, the jobs and the content tests: one JSON file under Assets/, read with
// File IO (safe in import worker processes), declared as an import dependency by the
// postprocessor (context.DependsOnSourceAsset) so editing it reimports what it governs.
// Naming normalization mirrors ut_pipeline.normalize_name (checked against it in the live test).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-pipeline-automation/.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace AgentKit.Pipeline
{
    public class PipelineRules
    {
        public const string DefaultPath = "Assets/Settings/Pipeline/prop_import_rules.json";
        public const string ManifestPath = "Assets/Settings/Pipeline/props_manifest.json";

        public string Path;
        public string Root = "Assets/Art/Props";
        public string SharedFolder = "_Shared";
        public Regex NamePattern = new Regex("^[A-Z][A-Za-z0-9]*(_[A-Z][A-Za-z0-9]*)*_[0-9]{2}$");
        public List<KeyValuePair<string, string>> SuffixRoles = new List<KeyValuePair<string, string>>();
        public HashSet<string> RequiredRoles = new HashSet<string> { "BaseColor" };
        public HashSet<string> LinearRoles = new HashSet<string> { "Normal", "Mask" };
        public int TextureMaxSize = 1024;
        public int TextureMaxSizeMobile = 512;
        public int VertexBudget = 5000;
        public float MinSizeM = 0.05f;
        public float MaxSizeM = 20f;
        public string CategoryLabelPrefix = "biome_";
        public string GroupPrefix = "Props";
        public bool PrebuildGate = true;
        public string PrebuildTestCategory = "PipelinePreBuild";
        public Dictionary<string, object> Raw = new Dictionary<string, object>();

        static readonly Dictionary<string, KeyValuePair<DateTime, PipelineRules>> s_Cache =
            new Dictionary<string, KeyValuePair<DateTime, PipelineRules>>();

        /// <summary>Loads (and caches by file time) the rules JSON. Null when the file is absent.</summary>
        public static PipelineRules Load(string path = null)
        {
            path = string.IsNullOrEmpty(path) ? DefaultPath : path;
            if (!File.Exists(path)) return null;
            var stamp = File.GetLastWriteTimeUtc(path);
            if (s_Cache.TryGetValue(path, out var hit) && hit.Key == stamp) return hit.Value;
            var d = AgentJson.ParseObject(File.ReadAllText(path));
            var r = new PipelineRules { Path = path, Raw = d };
            r.Root = Str(d, "root", r.Root).TrimEnd('/');
            r.SharedFolder = Str(d, "shared_folder", r.SharedFolder);
            r.NamePattern = new Regex(Str(d, "name_pattern", r.NamePattern.ToString()));
            if (d.TryGetValue("suffix_roles", out var sr) && sr is Dictionary<string, object> srd)
                r.SuffixRoles = srd.Select(kv => new KeyValuePair<string, string>(kv.Key, Convert.ToString(kv.Value)))
                    .OrderByDescending(kv => kv.Key.Length).ThenBy(kv => kv.Key, StringComparer.Ordinal).ToList();
            else
                r.SuffixRoles = new List<KeyValuePair<string, string>>
                {
                    new KeyValuePair<string, string>("_BaseColor", "BaseColor"), new KeyValuePair<string, string>("_Normal", "Normal"),
                };
            r.RequiredRoles = StrSet(d, "required_roles", r.RequiredRoles);
            r.LinearRoles = StrSet(d, "linear_roles", r.LinearRoles);
            r.TextureMaxSize = (int)Num(d, "texture_max_size", r.TextureMaxSize);
            r.TextureMaxSizeMobile = (int)Num(d, "texture_max_size_mobile", r.TextureMaxSizeMobile);
            r.VertexBudget = (int)Num(d, "vertex_budget", r.VertexBudget);
            r.MinSizeM = (float)Num(d, "min_size_m", r.MinSizeM);
            r.MaxSizeM = (float)Num(d, "max_size_m", r.MaxSizeM);
            r.CategoryLabelPrefix = Str(d, "category_label_prefix", r.CategoryLabelPrefix);
            r.GroupPrefix = Str(d, "group_prefix", r.GroupPrefix);
            r.PrebuildGate = !d.TryGetValue("prebuild_gate", out var pg) || !(pg is bool b) || b;
            r.PrebuildTestCategory = Str(d, "prebuild_test_category", r.PrebuildTestCategory);
            s_Cache[path] = new KeyValuePair<DateTime, PipelineRules>(stamp, r);
            return r;
        }

        static string Str(Dictionary<string, object> d, string k, string def) => d.TryGetValue(k, out var v) && v != null ? Convert.ToString(v) : def;
        static double Num(Dictionary<string, object> d, string k, double def) => d.TryGetValue(k, out var v) && v != null ? AgentJson.ToDouble(v, def) : def;

        static HashSet<string> StrSet(Dictionary<string, object> d, string k, HashSet<string> def)
        {
            return d.TryGetValue(k, out var v) && v is List<object> l ? new HashSet<string>(l.Select(Convert.ToString)) : def;
        }

        /// <summary>True when this asset path is under the governed root (and not a shared-folder meta).</summary>
        public bool Governs(string assetPath) => assetPath != null && assetPath.StartsWith(Root + "/", StringComparison.Ordinal);

        /// <summary>'barrel wood 7' -> 'Barrel_Wood_07'; 'Pot-Clay' -> 'Pot_Clay_01'.</summary>
        public static string Normalize(string raw)
        {
            var tokens = Regex.Split((raw ?? "").Trim(), @"[\s\-_\.]+").Where(t => t.Length > 0).ToList();
            if (tokens.Count == 0) return "";
            for (int i = 0; i < tokens.Count; i++)
                if (!char.IsDigit(tokens[i][0])) tokens[i] = char.ToUpperInvariant(tokens[i][0]) + tokens[i].Substring(1);
            var last = tokens[tokens.Count - 1];
            if (last.All(char.IsDigit)) tokens[tokens.Count - 1] = last.PadLeft(2, '0');
            else tokens.Add("01");
            return string.Join("_", tokens);
        }

        /// <summary>Role from the longest matching suffix (case-insensitive); "Unknown" otherwise.</summary>
        public string RoleOf(string stem, out string baseName)
        {
            foreach (var kv in SuffixRoles)
            {
                if (stem.EndsWith(kv.Key, StringComparison.OrdinalIgnoreCase))
                {
                    baseName = stem.Substring(0, stem.Length - kv.Key.Length);
                    return kv.Value;
                }
            }
            baseName = stem;
            return "Unknown";
        }

        /// <summary>Role of an asset already renamed by the pipeline: T_&lt;Name&gt;_&lt;Role&gt;.</summary>
        public string RoleOfImported(string assetPath)
        {
            var stem = System.IO.Path.GetFileNameWithoutExtension(assetPath);
            var i = stem.LastIndexOf('_');
            if (stem.StartsWith("T_", StringComparison.Ordinal) && i > 2)
            {
                var role = stem.Substring(i + 1);
                if (SuffixRoles.Any(kv => kv.Value == role)) return role;
            }
            return RoleOf(stem, out _);
        }

        public string PropFolder(string category, string name) => Root + "/" + category + "/" + name;
        public string SharedPath => Root + "/" + SharedFolder;
    }
}
