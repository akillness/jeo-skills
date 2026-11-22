// AgentKit.Architecture (scenario-unity-architecture skill, 2026-09-24): audit of an Input Actions asset.
//   ut_run.run_method(P, "AgentKit.Architecture.ArchInputAudit.Audit",
//                     {"path": null (= project-wide actions), "maps": ["Player"], "groups": ["Keyboard&Mouse", "Gamepad"]})
// Findings: an action with no binding in a required control scheme, the same effective path on two
// actions of one map and scheme (a conflict players will hit), gamepad bindings to brand-specific
// controls instead of positional ones (TiTKAseu17A [00:02:55]), no project-wide asset assigned.
// Compiled only when the Input System is active (ENABLE_INPUT_SYSTEM), so projects without the
// package still compile AgentKit.
// Ran in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A5).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace AgentKit.Architecture
{
    public static class ArchInputAudit
    {
        public static void Audit()
        {
            AgentJob.Run(() =>
            {
#if !ENABLE_INPUT_SYSTEM
                throw new InvalidOperationException("the Input System is not active in this project (Active Input Handling)");
#else
                var f = new AgentAudit.Findings();
                string path = AgentJob.Str("path");
                InputActionAsset asset;
                if (string.IsNullOrEmpty(path))
                {
                    asset = InputSystem.actions;
                    if (asset == null) { f.Add("error", "input.no_project_wide_actions", "ProjectSettings", "no project-wide actions asset assigned", "Edit > Project Settings > Input System Package > Input Actions"); return new Dictionary<string, object> { { "findings", f.items }, { "counts", f.Counts() } }; }
                    path = AssetDatabase.GetAssetPath(asset);
                }
                else asset = AssetDatabase.LoadAssetAtPath<InputActionAsset>(path) ?? throw new ArgumentException("no InputActionAsset at " + path);

                var mapNames = AgentJob.List("maps").Select(o => o as string).Where(s => s != null).ToList();
                var groups = AgentJob.List("groups").Select(o => o as string).Where(s => s != null).ToList();
                if (groups.Count == 0) groups = new List<string> { "Keyboard&Mouse", "Gamepad" };
                var brandPrefixes = new[] { "<DualShockGamepad>", "<DualSenseGamepadHID>", "<XInputController>", "<SwitchProControllerHID>" };
                var summary = new List<object>();

                foreach (var map in asset.actionMaps)
                {
                    if (mapNames.Count > 0 && !mapNames.Contains(map.name)) continue;
                    var byGroupPath = new Dictionary<string, string>();
                    foreach (var action in map.actions)
                    {
                        var perGroup = new Dictionary<string, int>();
                        foreach (var g in groups) perGroup[g] = 0;
                        foreach (var b in action.bindings)
                        {
                            if (b.isComposite) continue;
                            var gs = (b.groups ?? "").Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
                            foreach (var g in gs)
                            {
                                if (perGroup.ContainsKey(g)) perGroup[g]++;
                                string key = g + "|" + b.effectivePath;
                                if (byGroupPath.TryGetValue(key, out var other) && other != action.name)
                                    f.Add("warn", "input.duplicate_binding", path + ":" + map.name + "/" + action.name,
                                        b.effectivePath + " is also bound to " + other + " in scheme " + g, "rebind one of them or move one action to another map");
                                else byGroupPath[key] = action.name;
                            }
                            if (brandPrefixes.Any(p => b.effectivePath.StartsWith(p, StringComparison.Ordinal)))
                                f.Add("info", "input.brand_specific_path", path + ":" + map.name + "/" + action.name, b.effectivePath, "bind <Gamepad>/buttonSouth-style positional controls");
                        }
                        foreach (var kv in perGroup.Where(kv => kv.Value == 0))
                            f.Add("warn", "input.missing_scheme", path + ":" + map.name + "/" + action.name, "no binding in control scheme " + kv.Key, "add a " + kv.Key + " binding");
                        summary.Add(new Dictionary<string, object> { { "action", map.name + "/" + action.name }, { "type", action.type.ToString() }, { "bindings", action.bindings.Count }, { "per_scheme", perGroup } });
                    }
                }
                return new Dictionary<string, object>
                {
                    { "asset", path }, { "project_wide", InputSystem.actions != null && AssetDatabase.GetAssetPath(InputSystem.actions) == path },
                    { "control_schemes", asset.controlSchemes.Select(s => s.name).ToList() },
                    { "actions", summary }, { "findings", f.items }, { "counts", f.Counts() },
                };
#endif
            });
        }
    }
}
