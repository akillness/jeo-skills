// AgentKit.Pipeline v0.2 (scenario-unity-pipeline-automation, 2026-09-24). Addressables 2.9.1: groups and
// labels from the props manifest, content builds for CI, build-layout analysis.
//
//   ut_pipeline.assign_addressables(P, layout)  -> AgentKit.Pipeline.AddressablesJobs.AssignGroups {layout, key_by}
//   ut_pipeline.build_content(P, "macos")       -> AgentKit.Pipeline.AddressablesJobs.BuildContent {clean, layout_report}
//   (read-only)                                 -> AgentKit.Pipeline.AddressablesJobs.ImplicitDuplicates
//
// Layouts (AssignGroups.layout):
//   "condition" (default) Valheim's rule (Olle Axelsson, Unite 2025, Fzu2Das_1FU [00:23:08]): every
//               asset goes with the other assets that are needed under EXACTLY the same loading
//               conditions. A root's condition set = its labels (key_by "label": biome, level) or the
//               root itself (key_by "root": streamed one by one). A dependency's set = the union of
//               the sets of the roots that use it. Dependencies used by roots of more than one group
//               are made explicit in the group of their set, so nothing is copied implicitly into
//               two bundles, and a shared bundle loads only when one of its conditions is loaded.
//               Addressables 2.9.1 ships the same idea as a window (Window > Asset Management >
//               Addressables > Auto Group Generator, internal classes, no scripting API).
//   "category"  one group per art folder, dependencies implicit: the layout most tutorials show,
//               kept here as the baseline that duplicates shared textures and shaders.
//   "isolate"   "category" + Analyze rule CheckBundleDupeDependencies.FixIssues: every duplicate
//               moved into ONE "Duplicate Asset Isolation" group (no copies, but that bundle loads
//               with any group that needs any of its assets).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-pipeline-automation/test_live_pipeline.py.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Build;
using UnityEditor.AddressableAssets.Build.AnalyzeRules;
using UnityEditor.AddressableAssets.Build.DataBuilders;
using UnityEditor.AddressableAssets.Build.Layout;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;
using UnityEditor.Build.Pipeline.Utilities;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.ResourceProviders;

namespace AgentKit.Pipeline
{
    public static class AddressablesJobs
    {
        public const string IsolationGroup = "Duplicate Asset Isolation";

        // ================================================================ AssignGroups
        public static void AssignGroups()
        {
            AgentJob.Run(() => AssignGroupsCore(AgentJob.Str("layout", "condition"), AgentJob.Str("key_by", "label"),
                                                AgentJob.Str("rules", PipelineRules.DefaultPath)));
        }

        public static Dictionary<string, object> AssignGroupsCore(string layout, string keyBy, string rulesPath)
        {
            var sw = Stopwatch.StartNew();
            var rules = PipelineRules.Load(rulesPath) ?? throw new FileNotFoundException(rulesPath);
            var settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            NormalizeNewSettings(settings);
            var props = PropsManifest.Load().Where(p => p.status == "built" && File.Exists(p.prefab)).OrderBy(p => p.name, StringComparer.Ordinal).ToList();
            if (props.Count == 0) throw new InvalidOperationException("no built props in props_manifest.json: run BuildPrefabs first");
            string prefix = rules.GroupPrefix;

            // target: asset guid -> (group name, address, labels); roots first, then shared dependencies
            var target = new SortedDictionary<string, KeyValuePair<string, string>>(StringComparer.Ordinal);
            var labelsOf = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            var rootKey = new Dictionary<string, SortedSet<string>>(StringComparer.Ordinal);
            foreach (var p in props)
            {
                var guid = AssetDatabase.AssetPathToGUID(p.prefab);
                labelsOf[guid] = p.labels.OrderBy(l => l, StringComparer.Ordinal).ToList();
                SortedSet<string> key;
                if (layout == "condition")
                    key = keyBy == "root" ? new SortedSet<string>(StringComparer.Ordinal) { p.name } : new SortedSet<string>(p.labels, StringComparer.Ordinal);
                else
                    key = new SortedSet<string>(StringComparer.Ordinal) { p.category };
                rootKey[guid] = key;
                target[guid] = new KeyValuePair<string, string>(GroupName(prefix, key, layout), "props/" + p.name.ToLowerInvariant());
            }
            int explicitDeps = 0;
            var depReport = new List<object>();
            if (layout == "condition")
            {
                // dependency -> union of the condition sets of the roots that need it
                var depKeys = new Dictionary<string, SortedSet<string>>(StringComparer.Ordinal);
                var depGroups = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
                foreach (var p in props)
                {
                    var guid = AssetDatabase.AssetPathToGUID(p.prefab);
                    foreach (var dep in AssetDatabase.GetDependencies(p.prefab, true))
                    {
                        if (dep == p.prefab || !Bundleable(dep)) continue;
                        var dg = AssetDatabase.AssetPathToGUID(dep);
                        if (!depKeys.TryGetValue(dg, out var set)) { set = new SortedSet<string>(StringComparer.Ordinal); depKeys[dg] = set; depGroups[dg] = new HashSet<string>(); }
                        set.UnionWith(rootKey[guid]);
                        depGroups[dg].Add(target[guid].Key);
                    }
                }
                foreach (var kv in depKeys.OrderBy(k => k.Key, StringComparer.Ordinal))
                {
                    if (target.ContainsKey(kv.Key)) continue;                       // a root used by another root
                    if (depGroups[kv.Key].Count < 2) continue;                      // one bundle uses it: stays implicit, no copy
                    var g = GroupName(prefix, kv.Value, layout);
                    var path = AssetDatabase.GUIDToAssetPath(kv.Key);
                    target[kv.Key] = new KeyValuePair<string, string>(g, "shared/" + Path.GetFileNameWithoutExtension(path).ToLowerInvariant());
                    explicitDeps++;
                    if (depReport.Count < 40) depReport.Add(new Dictionary<string, object> { { "asset", path }, { "group", g }, { "used_by_groups", depGroups[kv.Key].Count } });
                }
            }

            // apply: create/move entries, labels, drop our stale entries and empty groups
            var owned = new HashSet<string>(settings.groups.Where(g => g != null && (g.Name.StartsWith(prefix + "_", StringComparison.Ordinal) || g.Name == IsolationGroup)).Select(g => g.Name));
            int moved = 0, removed = 0;
            foreach (var group in settings.groups.Where(g => g != null && owned.Contains(g.Name)).ToList())
                foreach (var e in group.entries.ToList())
                    if (!target.ContainsKey(e.guid)) { settings.RemoveAssetEntry(e.guid, false); removed++; }
            // Deterministic order (doc-build-scripting-build-profiles, Addressables determinism): Addressables 2.9.1
            // sorts groups by asset GUID, a group's entries by GUID and an entry's labels when it saves, but the
            // settings' label table keeps INSERTION order (PipelineProbes.LabelOrderProbe: reversed input, reversed
            // table). So labels (and, for the same reason, groups) are created in ordinal order, never in
            // file-system, HashSet or dictionary order.
            var allLabels = new SortedSet<string>(labelsOf.Values.SelectMany(x => x), StringComparer.Ordinal);
            foreach (var l in allLabels) settings.AddLabel(l, false);
            foreach (var gname in target.Values.Select(v => v.Key).Distinct().OrderBy(n => n, StringComparer.Ordinal))
                if (settings.FindGroup(gname) == null) CreateGroup(settings, gname);
            var entries = new List<AddressableAssetEntry>();
            foreach (var kv in target)
            {
                var g = settings.FindGroup(kv.Value.Key) ?? CreateGroup(settings, kv.Value.Key);
                var e = settings.FindAssetEntry(kv.Key);
                if (e == null || e.parentGroup != g) { e = settings.CreateOrMoveEntry(kv.Key, g, false, false); moved++; }
                if (e.address != kv.Value.Value) e.SetAddress(kv.Value.Value, false);
                var want = labelsOf.TryGetValue(kv.Key, out var l) ? l : new List<string>();
                foreach (var old in e.labels.ToList()) if (!want.Contains(old)) e.SetLabel(old, false, false, false);
                foreach (var nl in want) if (!e.labels.Contains(nl)) e.SetLabel(nl, true, false, false);
                entries.Add(e);
            }
            int groupsRemoved = 0;
            foreach (var group in settings.groups.Where(g => g != null && owned.Contains(g.Name) && g.entries.Count == 0).ToList())
            {
                settings.RemoveGroup(group);
                groupsRemoved++;
            }
            List<AnalyzeRule.AnalyzeResult> fixResults = null;
            if (layout == "isolate")
            {
                var rule = new CheckBundleDupeDependencies();
                fixResults = rule.RefreshAnalysis(settings);
                rule.FixIssues(settings);                                  // creates the Duplicate Asset Isolation group
                rule.ClearAnalysis();
            }
            int nulls = settings.groups.RemoveAll(g => g == null);          // stale references reorder on every save otherwise
            settings.SetDirty(AddressableAssetSettings.ModificationEvent.BatchModification, null, true, true);
            AssetDatabase.SaveAssets();

            var dup = ImplicitDuplicatesCore(settings);
            return new Dictionary<string, object>
            {
                { "layout", layout }, { "key_by", keyBy }, { "roots", props.Count }, { "explicit_dependencies", explicitDeps },
                { "entries_moved", moved }, { "entries_removed", removed }, { "groups_removed", groupsRemoved }, { "null_group_refs_removed", nulls },
                { "groups", GroupSummary(settings, prefix) }, { "labels", allLabels.ToList() },
                { "shared", depReport }, { "analyze_fix_results", fixResults?.Count ?? 0 },
                { "implicit_duplicates", dup["count"] }, { "implicit_duplicate_assets", dup["assets"] },
                { "seconds", Math.Round(sw.Elapsed.TotalSeconds, 2) },
            };
        }

        /// <summary>Settings created in this editor session keep two provider types empty until they are next
        /// loaded (defaults are filled in OnAfterDeserialize), so the job after the creating one rewrote the file
        /// (observed 2026-09-24). Filling them here keeps the very first rerun free of diffs.</summary>
        public static void NormalizeNewSettings(AddressableAssetSettings settings)
        {
            var bundled = settings.BundledAssetProviderType;
            if (bundled.Value == null) { bundled.Value = typeof(BundledAssetProvider); settings.BundledAssetProviderType = bundled; }
            var bundle = settings.AssetBundleProviderType;
            if (bundle.Value == null) { bundle.Value = typeof(AssetBundleProvider); settings.AssetBundleProviderType = bundle; }
        }

        static string GroupName(string prefix, IEnumerable<string> key, string layout)
        {
            var parts = key.Select(k => k.StartsWith("biome_", StringComparison.Ordinal) ? k.Substring(6) : k);
            return prefix + "_" + string.Join("+", parts);
        }

        /// <summary>Assets that end up inside bundles: not scripts, not editor-only, not DLLs.</summary>
        public static bool Bundleable(string path)
        {
            if (!(path.StartsWith("Assets/", StringComparison.Ordinal) || path.StartsWith("Packages/", StringComparison.Ordinal))) return false;
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext == ".cs" || ext == ".dll" || ext == ".asmdef" || ext == ".asmref") return false;
            return !path.Contains("/Editor/");
        }

        static AddressableAssetGroup CreateGroup(AddressableAssetSettings s, string name)
        {
            var g = s.CreateGroup(name, false, false, false, null, typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
            var b = g.GetSchema<BundledAssetGroupSchema>();
            b.BundleMode = BundledAssetGroupSchema.BundlePackingMode.PackTogether;
            b.Compression = BundledAssetGroupSchema.BundleCompressionMode.LZ4;
            b.BuildPath.SetVariableByName(s, AddressableAssetSettings.kLocalBuildPath);
            b.LoadPath.SetVariableByName(s, AddressableAssetSettings.kLocalLoadPath);
            return g;
        }

        static List<object> GroupSummary(AddressableAssetSettings s, string prefix)
        {
            return s.groups.Where(g => g != null && (g.Name.StartsWith(prefix + "_", StringComparison.Ordinal) || g.Name == IsolationGroup))
                .OrderBy(g => g.Name, StringComparer.Ordinal)
                .Select(g => (object)new Dictionary<string, object> { { "name", g.Name }, { "entries", g.entries.Count } }).ToList();
        }

        // ================================================================ ImplicitDuplicates (before building)
        public static void ImplicitDuplicates()
        {
            AgentJob.Run(() => ImplicitDuplicatesCore(AddressableAssetSettingsDefaultObject.GetSettings(false) ?? throw new InvalidOperationException("no Addressables settings")));
        }

        /// <summary>Non-addressable dependencies pulled into more than one group (each group = one bundle
        /// with Pack Together): the copies an Addressables build would make. Pure AssetDatabase walk.</summary>
        public static Dictionary<string, object> ImplicitDuplicatesCore(AddressableAssetSettings settings)
        {
            var explicitGuids = new HashSet<string>(settings.groups.Where(g => g != null).SelectMany(g => g.entries).Select(e => e.guid));
            var usedBy = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            foreach (var g in settings.groups.Where(g => g != null && g.HasSchema<BundledAssetGroupSchema>()))
                foreach (var e in g.entries)
                    foreach (var dep in AssetDatabase.GetDependencies(e.AssetPath, true))
                    {
                        if (!Bundleable(dep)) continue;
                        var dg = AssetDatabase.AssetPathToGUID(dep);
                        if (explicitGuids.Contains(dg)) continue;
                        if (!usedBy.TryGetValue(dep, out var set)) { set = new HashSet<string>(); usedBy[dep] = set; }
                        set.Add(g.Name);
                    }
            var dups = usedBy.Where(kv => kv.Value.Count > 1).OrderBy(kv => kv.Key, StringComparer.Ordinal).ToList();
            return new Dictionary<string, object>
            {
                { "count", dups.Count },
                { "assets", dups.Take(30).Select(kv => (object)new Dictionary<string, object> { { "asset", kv.Key }, { "groups", kv.Value.Count } }).ToList() },
            };
        }

        // ================================================================ BuildContent
        public static void BuildContent()
        {
            AgentJob.Run(() => BuildContentCore(AgentJob.Bool("clean", true), AgentJob.Bool("layout_report", true),
                                                AgentJob.Str("profile", "Default"), AgentJob.Str("state_dir", "Builds/ContentState"),
                                                AgentJob.Bool("with_player", false)));
        }

        /// <param name="withPlayer">false (CI default): Build Addressables on Player Build = DoNotBuildWithPlayer, so the
        /// player ships THIS content build (the one whose content state was archived). The settings Addressables
        /// creates use PreferencesValue, whose preference defaults to true: every player build then rebuilds all
        /// content in BuildPlayerProcessor.PrepareForBuild (observed 2026-09-24).</param>
        public static Dictionary<string, object> BuildContentCore(bool clean, bool layoutReport, string profileName, string stateDir, bool withPlayer = false)
        {
            var sw = Stopwatch.StartNew();
            var settings = AddressableAssetSettingsDefaultObject.GetSettings(false) ?? throw new InvalidOperationException("no Addressables settings: run AssignGroups first");
            var target = EditorUserBuildSettings.activeBuildTarget;
            if (Application.isBatchMode && AgentJob.CommandLineValue("-buildTarget") == null)
                AgentJob.Warn("launched without -buildTarget: content builds for the LAST active platform (" + target + ")");
            var pid = settings.profileSettings.GetProfileId(profileName);
            if (string.IsNullOrEmpty(pid)) throw new ArgumentException("Addressables profile '" + profileName + "' not found");
            settings.activeProfileId = pid;
            int idx = settings.DataBuilders.FindIndex(b => b is BuildScriptPackedMode);
            if (idx < 0) throw new InvalidOperationException("BuildScriptPackedMode missing from DataBuilders");
            settings.ActivePlayerDataBuilderIndex = idx;                    // >= 0 (the doc sample's '> 0' rejects index 0)
            ProjectConfigData.GenerateBuildLayout = layoutReport;
            var playerOption = withPlayer ? AddressableAssetSettings.PlayerBuildOption.BuildWithPlayer : AddressableAssetSettings.PlayerBuildOption.DoNotBuildWithPlayer;
            if (settings.BuildAddressablesWithPlayerBuild != playerOption)
            {
                settings.BuildAddressablesWithPlayerBuild = playerOption;
                settings.SetDirty(AddressableAssetSettings.ModificationEvent.BatchModification, null, true, true);
                AssetDatabase.SaveAssets();
            }
            if (clean)
            {
                settings.ActivePlayerDataBuilder.ClearCachedData();         // catalogs, bundles, link.xml of the packed builder
                BuildCache.PurgeCache(false);                               // Library/BuildCache (SBP), no dialog
            }
            AddressableAssetSettings.BuildPlayerContent(out AddressablesPlayerBuildResult result);
            if (!string.IsNullOrEmpty(result.Error)) throw new Exception("Addressables content build failed: " + result.Error);

            var res = new Dictionary<string, object>
            {
                { "target", target.ToString() }, { "clean", clean }, { "duration_s", Math.Round(result.Duration, 2) },
                { "output", Addressables.BuildPath }, { "bundles_built", result.AssetBundleBuildResults?.Count ?? 0 },
                { "build_with_player", settings.BuildAddressablesWithPlayerBuild.ToString() },
            };
            // archive the content state: required for content-only updates of THIS release, per platform
            var state = ContentUpdateScript.GetContentStateDataPath(false, settings);
            if (!string.IsNullOrEmpty(state) && File.Exists(state))
            {
                var dst = Path.Combine(AgentJob.ResolvePath(stateDir), target.ToString(), "addressables_content_state.bin");
                Directory.CreateDirectory(Path.GetDirectoryName(dst));
                File.Copy(state, dst, true);
                res["content_state"] = state;
                res["content_state_archived"] = dst;
            }
            else AgentJob.Warn("no addressables_content_state.bin at " + state);
            if (layoutReport)
            {
                var layoutPath = Addressables.LibraryPath + "buildlayout.json";
                res["layout"] = File.Exists(layoutPath) ? AnalyzeLayout(layoutPath) : null;
                if (!File.Exists(layoutPath)) AgentJob.Warn("build layout not written: " + layoutPath);
            }
            res["seconds"] = Math.Round(sw.Elapsed.TotalSeconds, 2);
            return res;
        }

        /// <summary>Bundles, sizes, duplicated assets, and the bytes each label pulls in (its bundles plus
        /// their expanded bundle dependencies): the number that shows a coarse shared bundle.</summary>
        public static Dictionary<string, object> AnalyzeLayout(string layoutPath)
        {
            var layout = BuildLayout.Open(layoutPath, true, true);
            var bundles = layout.Groups.SelectMany(g => g.Bundles).ToList();
            ulong total = 0;
            var perBundle = new List<object>();
            var labelBundles = new Dictionary<string, HashSet<BuildLayout.Bundle>>(StringComparer.Ordinal);
            int implicitAssets = 0;
            foreach (var b in bundles.OrderBy(b => b.Name, StringComparer.Ordinal))
            {
                total += b.FileSize;
                var explicitAssets = b.Files.SelectMany(f => f.Assets).ToList();
                var other = b.Files.SelectMany(f => f.OtherAssets).ToList();
                implicitAssets += other.Count;
                perBundle.Add(new Dictionary<string, object>
                {
                    { "name", b.Name }, { "group", b.Group != null ? b.Group.Name : null }, { "size_kb", Math.Round(b.FileSize / 1024.0, 1) },
                    { "explicit", explicitAssets.Count }, { "implicit", other.Count },
                    { "implicit_sample", other.Select(o => o.AssetPath).OrderBy(x => x, StringComparer.Ordinal).Take(4).ToList() },
                    { "depends_on", (b.Dependencies?.Count ?? 0) + (b.ExpandedDependencies?.Count ?? 0) },
                });
                foreach (var a in explicitAssets)
                    foreach (var l in a.Labels ?? Array.Empty<string>())
                    {
                        if (!labelBundles.TryGetValue(l, out var set)) { set = new HashSet<BuildLayout.Bundle>(); labelBundles[l] = set; }
                        set.Add(b);
                    }
            }
            var perLabel = new Dictionary<string, object>();
            foreach (var kv in labelBundles.OrderBy(k => k.Key, StringComparer.Ordinal))
            {
                var closure = new HashSet<BuildLayout.Bundle>(kv.Value);
                foreach (var b in kv.Value)
                {
                    if (b.Dependencies != null) closure.UnionWith(b.Dependencies);                   // direct
                    if (b.ExpandedDependencies != null) closure.UnionWith(b.ExpandedDependencies);   // second order and up
                }
                ulong bytes = 0;
                foreach (var b in closure) bytes += b.FileSize;
                perLabel[kv.Key] = new Dictionary<string, object> { { "bundles", closure.Count }, { "kb", Math.Round(bytes / 1024.0, 1) } };
            }
            var dupAssets = layout.DuplicatedAssets.Select(d => new Dictionary<string, object>
            {
                { "asset", AssetDatabase.GUIDToAssetPath(d.AssetGuid) },
                { "bundles", d.DuplicatedObjects.SelectMany(o => o.IncludedInBundleFiles).Select(f => f.Bundle != null ? f.Bundle.Name : f.Name).Distinct().Count() },
            }).OrderBy(d => (string)d["asset"], StringComparer.Ordinal).ToList();
            return new Dictionary<string, object>
            {
                { "path", layoutPath }, { "bundles", bundles.Count }, { "total_kb", Math.Round(total / 1024.0, 1) },
                { "implicit_assets", implicitAssets }, { "duplicated_assets", dupAssets.Count },
                { "duplicated", dupAssets.Take(30).Cast<object>().ToList() }, { "per_label", perLabel },
                { "per_bundle", perBundle.Take(40).ToList() }, { "builtin_bundles", layout.BuiltInBundles.Count },
            };
        }
    }
}
