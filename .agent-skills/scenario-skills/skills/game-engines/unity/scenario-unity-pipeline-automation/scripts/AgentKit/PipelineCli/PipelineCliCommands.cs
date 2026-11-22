// AgentKit.PipelineCli v0.1 (scenario-unity-pipeline-automation, 2026-09-24). Named agent tools over the Unity CLI
// and com.unity.pipeline: `unity command agentkit_pipeline_status`, `unity command agentkit_pipeline_groups --layout condition`.
//
// Why named tools: a generic run-command or eval drifts; a narrow tool with validated parameters, a Play
// mode refusal, error codes with hints and context on success does the job (git-amend, VPjo-M6mPkE
// [00:03:54], [00:07:27]-[00:08:59]); "A written command turns that workflow into something deterministic
// and repeatable" (Unity CLI intro, DgNrgZeJOxQ [00:07:41]).
//
// Compiles ONLY when com.unity.pipeline is in the project: this folder's asmdef sets AGENTKIT_HAS_PIPELINE
// through versionDefines and requires it in defineConstraints, so removing the package never breaks the
// build (a compile error would abort every batch job). The asmdef cannot reference Assembly-CSharp-Editor,
// so it calls the same pipeline code by reflection.
// Run in Unity 6000.3.21f1 with CLI 1.0.0-beta.11 and com.unity.pipeline 0.7.0-exp.1 on 2026-09-24.
#if AGENTKIT_HAS_PIPELINE
using System;
using System.Collections.Generic;
using System.Reflection;
using Unity.Pipeline.Commands;
using UnityEditor;

namespace AgentKit.PipelineCli
{
    public static class PipelineCliCommands
    {
        static readonly string[] Layouts = { "condition", "category", "isolate" };
        static readonly string[] KeyBys = { "label", "root" };
        const string RulesPath = "Assets/Settings/Pipeline/prop_import_rules.json";

        [CliCommand("agentkit_pipeline_status", "Art pipeline status: props by status, Addressables groups, implicit duplicates (read-only)",
                    Tags = new[] { "agentkit", "agentkit/pipeline" })]
        public static object Status()
        {
            return Call("AgentKit.Pipeline.ArtDropJobs", "StatusCore");
        }

        [CliCommand("agentkit_pipeline_groups", "Assign Addressables groups to the built props. layout: condition | category | isolate; key_by: label | root",
                    Tags = new[] { "agentkit", "agentkit/pipeline" })]
        public static object Groups([CliArg("layout", "condition | category | isolate", Required = true)] string layout,
                                    [CliArg("key_by", "label | root (condition layout only)")] string key_by = "label")
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                return Error("PLAY_MODE", "refused in Play mode: group edits are not saved from Play mode", "exit Play mode (unity command editor_play) and retry");
            if (Array.IndexOf(Layouts, layout) < 0)
                return Error("BAD_LAYOUT", "layout '" + layout + "' is not one of " + string.Join(", ", Layouts), "use --layout condition unless comparing layouts");
            if (Array.IndexOf(KeyBys, key_by) < 0)
                return Error("BAD_KEY_BY", "key_by '" + key_by + "' is not one of " + string.Join(", ", KeyBys), "label: loaded as sets (levels, biomes); root: streamed one by one");
            return Call("AgentKit.Pipeline.AddressablesJobs", "AssignGroupsCore", layout, key_by, RulesPath);
        }

        static object Call(string type, string method, params object[] args)
        {
            var t = Type.GetType(type + ", Assembly-CSharp-Editor");
            var m = t?.GetMethod(method, BindingFlags.Public | BindingFlags.Static);
            if (m == null) return Error("KIT_MISSING", type + "." + method + " not found", "install the AgentKit Pipeline kit (ut_pipeline.install) and let the editor compile");
            try
            {
                return new Dictionary<string, object> { { "success", true }, { "data", m.Invoke(null, args) } };
            }
            catch (TargetInvocationException e)
            {
                var inner = e.InnerException ?? e;
                return Error("JOB_FAILED", inner.GetType().Name + ": " + inner.Message, "run the batch job (ut_run.run_method) for the full log");
            }
        }

        static object Error(string code, string message, string hint)
        {
            return new Dictionary<string, object> { { "success", false }, { "code", code }, { "message", message }, { "hint", hint } };
        }
    }
}
#endif
