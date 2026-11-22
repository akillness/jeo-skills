// scenario-unity-performance v0.2 (2026-09-24). Static audits that feed a performance pass before any capture:
//   ProjectAuditor : runs Project Auditor 1.0.2 (a package in 6.3, built in from 6.4) headless and
//                    returns issue counts by category and severity plus the Major/Critical list
//   AudioImport    : AudioClip load type, compression, mono and Load In Background against clip size
//   BundleDuplicates : non-bundled dependencies pulled into two or more bundles or groups, and
//                    player scenes that ship a second copy of a bundled asset
//
//   ut_run.run_method(P, "AgentKit.Performance.PerfAudit.ProjectAuditor", {"categories": ["Code", "ProjectSetting"], "out": "/abs/r.projectauditor"})
//   ut_run.run_method(P, "AgentKit.Performance.PerfAudit.AudioImport", {"folder": "Assets"})
//   ut_run.run_method(P, "AgentKit.Performance.PerfAudit.BundleDuplicates", {"groups": {"A": ["Assets/x.prefab"]}, "scenes": [...]})
//
// Why (sources in references/sources.md):
// - Project Auditor is the static baseline: fix Major first, triage the rest by call frequency
//   because severity ignores how often code runs (Code Monkey 2gP-2rQ3o_Q [00:04:34], [00:05:06];
//   profiling e-book p. 78 to 80: no new Major issue per check-in). Called by reflection so this
//   file compiles without the package; install it with "com.unity.project-auditor": "1.0.2".
// - Audio load type by clip size (console/PC e-book p. 104 to 105): under 200 KB Decompress On
//   Load; 200 KB and up Compressed In Memory (memory first) or Decompress On Load (CPU first);
//   over 350 to 400 KB Streaming (about 200 KB overhead per stream); 3D sources mono.
// - Duplication (Borromeo CmD8MVGkDxQ [00:42:21] to [00:46:15]): a non-addressable asset used by
//   two bundles is copied into both; a player scene referencing a bundled asset ships a second
//   copy; anything under Resources ships regardless. Streaming areas then load and hold it twice.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py (step audit).
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Performance
{
    public static class PerfAudit
    {
        // ------------------------------------------------------------------ Project Auditor
        public static void ProjectAuditor()
        {
            AgentJob.Run(() =>
            {
                var paType = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("Unity.ProjectAuditor.Editor.ProjectAuditor", false)).FirstOrDefault(t => t != null);
                if (paType == null)
                    throw new InvalidOperationException("Project Auditor not installed: add \"com.unity.project-auditor\": \"1.0.2\" to Packages/manifest.json (6.3; built in from 6.4)");
                var asm = paType.Assembly;
                var paramsType = asm.GetType("Unity.ProjectAuditor.Editor.AnalysisParams");
                var catType = asm.GetType("Unity.ProjectAuditor.Editor.IssueCategory");
                var auditor = Activator.CreateInstance(paType);
                var ap = Activator.CreateInstance(paramsType, new object[] { true });
                var cats = AgentJob.List("categories").Select(c => Enum.Parse(catType, c.ToString(), true)).ToArray();
                if (cats.Length > 0)
                {
                    var arr = Array.CreateInstance(catType, cats.Length);
                    for (int i = 0; i < cats.Length; i++) arr.SetValue(cats[i], i);
                    paramsType.GetField("Categories").SetValue(ap, arr);
                }
                var t0 = DateTime.UtcNow;
                var audit = paType.GetMethods().First(m => m.Name == "Audit" && m.GetParameters().Length == 2 && m.GetParameters()[0].ParameterType == paramsType);
                var report = audit.Invoke(auditor, new object[] { ap, null });
                var seconds = (DateTime.UtcNow - t0).TotalSeconds;
                var outPath = AgentJob.Has("out") ? AgentJob.ResolvePath(AgentJob.Str("out")) : Path.Combine(AgentJob.OutDir(), "report.projectauditor");
                report.GetType().GetMethod("Save").Invoke(report, new object[] { outPath });
                var issues = (IEnumerable)report.GetType().GetMethod("GetAllIssues").Invoke(report, null);
                var byCat = new Dictionary<string, int>();
                var bySev = new Dictionary<string, int>();
                var major = new List<object>();
                int top = AgentJob.Int("top", 40);
                foreach (var it in issues)
                {
                    var t = it.GetType();
                    bool isIssue = (bool)t.GetMethod("IsIssue").Invoke(it, null);
                    if (!isIssue) continue;
                    var cat = t.GetProperty("Category").GetValue(it).ToString();
                    var sev = t.GetProperty("Severity").GetValue(it).ToString();
                    byCat[cat] = (byCat.TryGetValue(cat, out var a) ? a : 0) + 1;
                    bySev[sev] = (bySev.TryGetValue(sev, out var b) ? b : 0) + 1;
                    if ((bool)t.GetMethod("IsMajorOrCritical").Invoke(it, null) && major.Count < top)
                        major.Add(new Dictionary<string, object>
                        {
                            { "category", cat }, { "severity", sev }, { "id", t.GetProperty("Id").GetValue(it)?.ToString() },
                            { "description", t.GetProperty("Description").GetValue(it) }, { "path", t.GetProperty("RelativePath").GetValue(it) },
                            { "line", t.GetProperty("Line").GetValue(it) },
                        });
                }
                return new Dictionary<string, object>
                {
                    { "package", "com.unity.project-auditor " + (UnityEditor.PackageManager.PackageInfo.FindForAssembly(asm)?.version ?? "?") },
                    { "seconds", Math.Round(seconds, 1) }, { "report", outPath },
                    { "issues_by_category", byCat.ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                    { "issues_by_severity", bySev.ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                    { "major_or_critical", major },
                    { "note", "severity ignores call frequency: ut_perf.triage_auditor marks code issues inside per-frame methods" },
                };
            });
        }

        // ------------------------------------------------------------------ audio import
        public static void AudioImport()
        {
            AgentJob.Run(() => AudioImportCore(AgentJob.Str("folder", "Assets"), AgentJob.Str("platform", "Standalone"),
                AgentJob.List("spatial").Select(o => o.ToString()).ToList()));
        }

        public static Dictionary<string, object> AudioImportCore(string folder, string target, List<string> spatial)
        {
            {
                var rows = new List<object>();
                var f = new AgentAudit.Findings();
                foreach (var guid in AssetDatabase.FindAssets("t:AudioClip", new[] { folder }))
                {
                    var path = AssetDatabase.GUIDToAssetPath(guid);
                    var imp = AssetImporter.GetAtPath(path) as AudioImporter;
                    if (imp == null) continue;
                    var s = imp.ContainsSampleSettingsOverride(target) ? imp.GetOverrideSampleSettings(target) : imp.defaultSampleSettings;
                    long srcBytes = new FileInfo(Path.Combine(AgentJob.ProjectRoot, path)).Length;
                    var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
                    // size band from the imported (compressed) clip where known, else the source file
                    long runtimeBytes = clip != null ? UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(clip) : srcBytes;
                    double kb = srcBytes / 1024.0;
                    string want = kb < 200 ? "DecompressOnLoad" : (kb > 400 ? "Streaming" : "CompressedInMemory");
                    rows.Add(new Dictionary<string, object>
                    {
                        { "path", path }, { "source_kb", Math.Round(kb, 1) }, { "runtime_kb", Math.Round(runtimeBytes / 1024.0, 1) },
                        { "length_s", clip != null ? Math.Round(clip.length, 2) : 0 }, { "channels", clip != null ? clip.channels : 0 },
                        { "load_type", s.loadType.ToString() }, { "format", s.compressionFormat.ToString() },
                        { "sample_rate_override", s.sampleRateSetting.ToString() }, { "force_mono", imp.forceToMono },
                        { "load_in_background", imp.loadInBackground }, { "suggested_load_type", want },
                    });
                    if (kb > 400 && s.loadType != AudioClipLoadType.Streaming)
                        f.Add("warn", "perf.audio_long_not_streamed", path, Math.Round(kb) + " KB clip loaded as " + s.loadType + ": a long clip decompressed or held in memory",
                            "Streaming for music and long ambience (console e-book p. 104 to 105)");
                    else if (kb < 200 && s.loadType == AudioClipLoadType.Streaming)
                        f.Add("warn", "perf.audio_short_streamed", path, Math.Round(kb) + " KB clip set to Streaming: about 200 KB overhead per stream for a short sound",
                            "Decompress On Load (or Compressed In Memory with ADPCM)");
                    if (kb >= 200 && s.loadType == AudioClipLoadType.DecompressOnLoad)
                        f.Add("info", "perf.audio_decompress_large", path, Math.Round(kb) + " KB clip Decompress On Load: fast to play, large in memory",
                            "Compressed In Memory when memory is the constraint");
                    if (!imp.loadInBackground && kb >= 200)
                        f.Add("info", "perf.audio_foreground_load", path, "Load In Background off on a " + Math.Round(kb) + " KB clip: the load blocks the main thread", "AudioImporter.loadInBackground = true");
                    if (clip != null && clip.channels > 1 && !imp.forceToMono && spatial != null && spatial.Contains(path))
                        f.Add("warn", "perf.audio_spatial_stereo", path, "3D source in stereo: double memory plus a CPU downmix", "Force To Mono");
                }
                return new Dictionary<string, object> { { "clips", rows }, { "findings", f.items }, { "counts", f.Counts() } };
            }
        }

        // ------------------------------------------------------------------ duplicated dependencies
        /// <summary>groups: {name: [asset paths]} (Addressables groups from ut_perf.addressables_groups,
        /// or any explicit bundle layout); without it, the project's AssetBundle names are used.
        /// scenes: player scene paths (default: enabled Build Settings scenes).</summary>
        public static void BundleDuplicates()
        {
            AgentJob.Run(() =>
            {
                Dictionary<string, List<string>> groups = null;
                var g = AgentJob.Dict("groups");
                if (g != null && g.Count > 0)
                {
                    groups = new Dictionary<string, List<string>>();
                    foreach (var kv in g) groups[kv.Key] = ((IEnumerable)kv.Value).Cast<object>().Select(o => o.ToString()).ToList();
                }
                return BundleDuplicatesCore(groups, AgentJob.List("scenes").Select(o => o.ToString()).ToList());
            });
        }

        public static Dictionary<string, object> BundleDuplicatesCore(Dictionary<string, List<string>> groupsIn, List<string> scenes)
        {
            {
                var groups = groupsIn ?? new Dictionary<string, List<string>>();
                if (groups.Count == 0)
                    foreach (var b in AssetDatabase.GetAllAssetBundleNames())
                        groups[b] = AssetDatabase.GetAssetPathsFromAssetBundle(b).ToList();
                var explicitAssets = new Dictionary<string, string>();   // asset -> group
                foreach (var kv in groups) foreach (var a in kv.Value) explicitAssets[a] = kv.Key;
                // Walk direct dependencies from each group's explicit assets. An asset explicitly in
                // another group is a reference to that bundle (the walk stops there); anything else
                // reached is copied into this group's bundle: reached from two groups = two copies.
                var pulledBy = new Dictionary<string, HashSet<string>>();
                foreach (var kv in groups)
                {
                    var stack = new Stack<string>(kv.Value);
                    var seen = new HashSet<string>(kv.Value);
                    while (stack.Count > 0)
                    {
                        var a = stack.Pop();
                        foreach (var dep in AssetDatabase.GetDependencies(a, false))
                        {
                            if (dep == a || dep.EndsWith(".cs") || dep.EndsWith(".asmdef") || !seen.Add(dep)) continue;
                            if (explicitAssets.TryGetValue(dep, out var owner))
                            {
                                if (owner == kv.Key) stack.Push(dep);
                                continue;
                            }
                            if (!pulledBy.TryGetValue(dep, out var set)) pulledBy[dep] = set = new HashSet<string>();
                            set.Add(kv.Key);
                            stack.Push(dep);
                        }
                    }
                }
                long Size(string p) { var fi = new FileInfo(Path.Combine(AgentJob.ProjectRoot, p)); return fi.Exists ? fi.Length : 0; }
                var dups = pulledBy.Where(kv => kv.Value.Count > 1).OrderByDescending(kv => Size(kv.Key) * (kv.Value.Count - 1))
                    .Select(kv => (object)new Dictionary<string, object>
                    {
                        { "asset", kv.Key }, { "copies", kv.Value.Count }, { "groups", kv.Value.ToList() },
                        { "source_kb", Math.Round(Size(kv.Key) / 1024.0, 1) },
                    }).ToList();
                if (scenes == null || scenes.Count == 0) scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToList();
                var sceneDeps = scenes.Count > 0 ? AssetDatabase.GetDependencies(scenes.ToArray(), true) : new string[0];
                var playerAndBundle = sceneDeps.Where(d => explicitAssets.ContainsKey(d) || pulledBy.ContainsKey(d))
                    .Where(d => !d.EndsWith(".cs") && !d.EndsWith(".unity")).Take(50).ToList();
                var inResources = explicitAssets.Keys.Where(p => p.Contains("/Resources/")).ToList();
                var f = new AgentAudit.Findings();
                foreach (var d in dups.Take(20).Cast<Dictionary<string, object>>())
                    f.Add("warn", "perf.bundle_duplicate", (string)d["asset"], "pulled into " + d["copies"] + " bundles/groups: one copy each, loaded and held twice",
                        "make it explicit in its own (shared) group or bundle");
                foreach (var p in playerAndBundle.Take(20))
                    f.Add("warn", "perf.player_and_bundle", p, "used by a player scene AND by a bundle: shipped twice", "load it only from the bundle, or keep it out of bundles");
                foreach (var p in inResources)
                    f.Add("warn", "perf.bundled_in_resources", p, "bundled asset under Resources/: Resources ships regardless", "move it out of Resources");
                return new Dictionary<string, object>
                {
                    { "groups", groups.ToDictionary(kv => kv.Key, kv => (object)kv.Value.Count) }, { "duplicates", dups },
                    { "duplicate_kb_extra", Math.Round(pulledBy.Where(kv => kv.Value.Count > 1).Sum(kv => Size(kv.Key) * (kv.Value.Count - 1)) / 1024.0, 1) },
                    { "player_and_bundle", playerAndBundle }, { "bundled_in_resources", inResources },
                    { "findings", f.items }, { "counts", f.Counts() },
                };
            }
        }

        /// <summary>Test and fix helper: build the project's AssetBundles (legacy names) to `out`
        /// and return each bundle's size, so a duplicate fix can be proven in bytes.</summary>
        public static void BuildBundles()
        {
            AgentJob.Run(() => BuildBundlesCore(AgentJob.ResolvePath(AgentJob.Str("out"))));
        }

        public static Dictionary<string, object> BuildBundlesCore(string outDir)
        {
            {
                Directory.CreateDirectory(outDir);
                var target = EditorUserBuildSettings.activeBuildTarget;
                var manifest = BuildPipeline.BuildAssetBundles(outDir, BuildAssetBundleOptions.ChunkBasedCompression | BuildAssetBundleOptions.ForceRebuildAssetBundle, target);
                if (manifest == null) throw new InvalidOperationException("BuildAssetBundles failed");
                var sizes = manifest.GetAllAssetBundles().ToDictionary(b => b, b => (object)Math.Round(new FileInfo(Path.Combine(outDir, b)).Length / 1024.0, 1));
                return new Dictionary<string, object> { { "out", outDir }, { "bundles_kb", sizes }, { "total_kb", sizes.Values.Sum(v => (double)v) } };
            }
        }
    }
}
