// AgentKit.Pipeline v0.2 (scenario-unity-pipeline-automation, 2026-09-24). Checks that turn three expert rules into
// numbers an agent can gate on:
//   - AssetDatabase counters: imports, refreshes and domain reloads per job, read instead of parsing logs or
//     wall time (Javier Abud Chavez, Unite 2019, S2P9n5U9xVw [00:26:44]). On 6000.3.21f1 they are public in
//     UnityEditor.Experimental.AssetDatabaseExperimental.counters (still "Experimental": re-check on upgrade).
//   - Hard references: a scene of the player build that references Addressable content loads it with the
//     scene AND ships it in the bundle, so it loads twice and bypasses the bundles (Olle Axelsson, Unite 2025,
//     Fzu2Das_1FU [00:24:49]; Code Monkey, C6i_JiRoIfk [00:03:32], [00:07:24]).
//   - Release profile: no debug defines in the profile or the Player settings of a release build
//     (docs digest checklist "Build report"; Thom Hopper, BlVsi2cSJ88, agent translation).
//
//   AgentKit.Pipeline.PipelineChecks.Counters        {}                     totals since this editor started, active target
//   AgentKit.Pipeline.PipelineChecks.HardReferences  {scenes?}              build scenes that pull Addressable or governed assets
//   AgentKit.Pipeline.PipelineChecks.ReleaseCheck    {profile?, forbidden?} profile + Player defines against forbidden patterns
// Optional config (NOT in prop_import_rules.json: the postprocessor depends on that whole file, so any key
// added there reimports every governed asset, observed 2026-09-24): Assets/Settings/Pipeline/pipeline_checks.json
//   {"hard_reference_check": true, "release_forbidden_defines": ["^DEBUG$", ...]}
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-pipeline-automation/test_live_checks.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.Build;
using UnityEditor.Build.Profile;
using UnityEditor.Experimental;

namespace AgentKit.Pipeline
{
    public static class PipelineChecks
    {
        public const string ConfigPath = "Assets/Settings/Pipeline/pipeline_checks.json";

        /// <summary>Default forbidden defines for a release build [added: adjust per project in pipeline_checks.json].</summary>
        public static readonly string[] DefaultForbiddenDefines = { "^DEBUG$", "^DEVELOPMENT_BUILD$", "^ENABLE_CHEATS$", "_DEBUG$", "CHEAT" };

        // ================================================================ AssetDatabase counters
        public struct AdbCounters
        {
            public long imported, importedInProcess, importedOutOfProcess, refresh, domainReload;
            public long csConnects, csArtifactsDownloaded, csArtifactsUploaded, csMetadataMatched;
        }

        /// <summary>Totals since this editor process started (the launch refresh and any launch-time platform
        /// switch included). Take one before and one after a step and call Delta.</summary>
        public static AdbCounters Read()
        {
            var c = AssetDatabaseExperimental.counters;
            return new AdbCounters
            {
                imported = c.import.imported.total, importedInProcess = c.import.importedInProcess.total,
                importedOutOfProcess = c.import.importedOutOfProcess.total, refresh = c.import.refresh.total,
                domainReload = c.import.domainReload.total,          // import.fullScan exists but is internal on 6.3
                csConnects = c.cacheServer.connects.total, csArtifactsDownloaded = c.cacheServer.artifactsDownloaded.total,
                csArtifactsUploaded = c.cacheServer.artifactsUploaded.total, csMetadataMatched = c.cacheServer.metadataMatched.total,
            };
        }

        public static Dictionary<string, object> ToDict(AdbCounters c) => new Dictionary<string, object>
        {
            { "imports", c.imported }, { "imports_in_process", c.importedInProcess }, { "imports_out_of_process", c.importedOutOfProcess },
            { "refreshes", c.refresh }, { "domain_reloads", c.domainReload },
            { "cache_server_connects", c.csConnects }, { "cache_artifacts_downloaded", c.csArtifactsDownloaded },
            { "cache_artifacts_uploaded", c.csArtifactsUploaded }, { "cache_metadata_matched", c.csMetadataMatched },
        };

        public static Dictionary<string, object> Delta(AdbCounters before, AdbCounters after) => new Dictionary<string, object>
        {
            { "imports", after.imported - before.imported }, { "refreshes", after.refresh - before.refresh },
            { "domain_reloads", after.domainReload - before.domainReload },
        };

        public static void Counters()
        {
            AgentJob.Run(() => new Dictionary<string, object>
            {
                { "since_editor_start", ToDict(Read()) },
                { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                { "launched_with_buildTarget", AgentJob.CommandLineValue("-buildTarget") },
                { "cache_server_endpoint", AgentJob.CommandLineValue("-cacheServerEndpoint") },
            });
        }

        // ================================================================ config
        public class Config
        {
            public bool HardReferenceCheck = true;
            public List<string> ReleaseForbiddenDefines = DefaultForbiddenDefines.ToList();
        }

        public static Config LoadConfig(string path = ConfigPath)
        {
            var c = new Config();
            if (!File.Exists(path)) return c;
            var d = AgentJson.ParseObject(File.ReadAllText(path));
            if (d.TryGetValue("hard_reference_check", out var h) && h is bool hb) c.HardReferenceCheck = hb;
            if (d.TryGetValue("release_forbidden_defines", out var f) && f is List<object> fl) c.ReleaseForbiddenDefines = fl.Select(Convert.ToString).ToList();
            return c;
        }

        // ================================================================ hard references from build scenes
        /// <summary>The scenes the next player build will include: the active Build Profile's list when a
        /// profile is active (Hopper [00:24:35]: with a profile active, the scene accessors return its scenes),
        /// else the enabled scenes of EditorBuildSettings.</summary>
        public static List<string> BuildScenes()
        {
            var profile = BuildProfile.GetActiveBuildProfile();
            var scenes = profile != null ? profile.GetScenesForBuild() : EditorBuildSettings.scenes;
            return scenes.Where(s => s != null && s.enabled && !string.IsNullOrEmpty(s.path)).Select(s => s.path).ToList();
        }

        public static void HardReferences()
        {
            AgentJob.Run(() =>
            {
                var scenes = AgentJob.Has("scenes") ? AgentJob.List("scenes").Select(Convert.ToString).ToList() : BuildScenes();
                var rules = PipelineRules.Load();
                return HardReferencesCore(scenes, AddressableAssetSettingsDefaultObject.Settings, rules?.Root);
            });
        }

        /// <summary>For each scene: its recursive dependencies that are Addressable entries (content loaded twice:
        /// once with the scene, once from the bundle) and those under the governed art root (heavy content that
        /// should stream). Shaders that are explicit shared entries (condition packing makes URP Lit.shader one)
        /// are reported apart as a warning: any scene using the shader duplicates it between the player and the
        /// bundles, which costs memory but is not the double-load of content. ok = no Addressable content reference.</summary>
        public static Dictionary<string, object> HardReferencesCore(IList<string> scenes, AddressableAssetSettings settings, string governedRoot)
        {
            var entryGuids = settings == null ? new HashSet<string>()
                : new HashSet<string>(settings.groups.Where(g => g != null).SelectMany(g => g.entries).Select(e => e.guid));
            var rows = new List<object>();
            int contentRefs = 0, shaderRefs = 0, governedRefs = 0;
            foreach (var scene in scenes.Distinct().OrderBy(s => s, StringComparer.Ordinal))
            {
                if (!File.Exists(scene)) { rows.Add(new Dictionary<string, object> { { "scene", scene }, { "error", "missing" } }); continue; }
                var deps = AssetDatabase.GetDependencies(scene, true).Where(d => d != scene).OrderBy(d => d, StringComparer.Ordinal).ToList();
                var addr = deps.Where(d => entryGuids.Contains(AssetDatabase.AssetPathToGUID(d))).ToList();
                var shaders = addr.Where(IsShader).ToList();
                var content = addr.Where(d => !IsShader(d)).ToList();
                var governed = string.IsNullOrEmpty(governedRoot) ? new List<string>() : deps.Where(d => d.StartsWith(governedRoot + "/", StringComparison.Ordinal)).ToList();
                long bytes = deps.Where(File.Exists).Sum(d => new FileInfo(d).Length);
                contentRefs += content.Count;
                shaderRefs += shaders.Count;
                governedRefs += governed.Count;
                rows.Add(new Dictionary<string, object>
                {
                    { "scene", scene }, { "dependencies", deps.Count }, { "source_mb", Math.Round(bytes / 1048576.0, 2) },
                    { "addressable_refs", content.Count }, { "addressable_sample", content.Take(10).ToList() },
                    { "addressable_shader_refs", shaders.Count }, { "shader_sample", shaders.Take(5).ToList() },
                    { "governed_refs", governed.Count }, { "governed_sample", governed.Take(10).ToList() },
                });
            }
            return new Dictionary<string, object>
            {
                { "ok", contentRefs == 0 }, { "scenes", rows }, { "addressable_refs", contentRefs },
                { "addressable_shader_refs", shaderRefs }, { "governed_refs", governedRefs },
            };
        }

        static bool IsShader(string path)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            return ext == ".shader" || ext == ".shadergraph" || ext == ".compute" || ext == ".hlsl" || ext == ".cginc" ||
                   AssetDatabase.GetMainAssetTypeAtPath(path) == typeof(UnityEngine.Shader);
        }

        // ================================================================ release profile
        public static void ReleaseCheck()
        {
            AgentJob.Run(() =>
            {
                var forbidden = AgentJob.Has("forbidden") ? AgentJob.List("forbidden").Select(Convert.ToString).ToList() : LoadConfig().ReleaseForbiddenDefines;
                return ReleaseCheckCore(AgentJob.Str("profile"), forbidden);
            });
        }

        /// <summary>Defines of the profile (additive over Player Settings, Hopper [00:11:45]) and of the Player
        /// settings of the active target, matched against forbidden regexes; plus the scene list and the
        /// Development flag. ok = nothing forbidden and at least one scene.</summary>
        public static Dictionary<string, object> ReleaseCheckCore(string profilePath, IList<string> forbidden)
        {
            var profile = !string.IsNullOrEmpty(profilePath) ? AssetDatabase.LoadAssetAtPath<BuildProfile>(profilePath) : BuildProfile.GetActiveBuildProfile();
            if (!string.IsNullOrEmpty(profilePath) && profile == null) throw new FileNotFoundException("Build Profile not found: " + profilePath);
            var target = EditorUserBuildSettings.activeBuildTarget;
            var named = NamedBuildTarget.FromBuildTargetGroup(BuildPipeline.GetBuildTargetGroup(target));
            var playerDefines = PlayerSettings.GetScriptingDefineSymbols(named).Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).ToList();
            var profileDefines = profile != null ? (profile.scriptingDefines ?? new string[0]).ToList() : new List<string>();
            var rx = forbidden.Select(p => new Regex(p)).ToList();
            var hits = profileDefines.Select(d => "profile:" + d).Concat(playerDefines.Select(d => "player:" + d))
                .Where(d => rx.Any(r => r.IsMatch(d.Substring(d.IndexOf(':') + 1)))).ToList();
            var scenes = profile != null ? profile.GetScenesForBuild().Where(s => s.enabled).Select(s => s.path).ToList() : BuildScenes();
            var problems = new List<string>();
            if (hits.Count > 0) problems.Add("forbidden defines in a release build: " + string.Join(", ", hits));
            if (scenes.Count == 0) problems.Add("no scene in the build list");
            if (EditorUserBuildSettings.development) problems.Add("Development Build is on");
            return new Dictionary<string, object>
            {
                { "ok", problems.Count == 0 }, { "problems", problems },
                { "profile", profile != null ? AssetDatabase.GetAssetPath(profile) : null }, { "target", target.ToString() },
                { "profile_defines", profileDefines }, { "player_defines", playerDefines }, { "forbidden", forbidden.ToList() },
                { "scenes", scenes }, { "development", EditorUserBuildSettings.development },
            };
        }
    }
}
