# Writing an AgentKit job (for every scenario-unity-* skill)

The contract the 13 domain skills build on. Every example here compiled and ran in Unity 6000.3.21f1
on 2026-09-24 (`tests/code/unity-expert/unity/Editor/ExpertTestJobs.cs` is a complete working file).

## 1. Where code goes

| What                   | Where                                                                                 | Why                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Shared C# (this skill) | `<skills>/scenario-unity-expert/scripts/AgentKit/*.cs`                                | copied by `ut_env.install_agentkit(P)` to `P/Assets/Editor/AgentKit/`                                                              |
| Domain C#              | `skills/unity-<domain>/scripts/AgentKit/<Domain>/*.cs`, namespace `AgentKit.<Domain>` | install with `ut_env.install_agentkit(P, src=<your AgentKit folder>)`: lands in `Assets/Editor/AgentKit/<Domain>/` beside the core |
| Domain Python          | `skills/unity-<domain>/scripts/ut_<domain>.py`                                        | imports `ut_env`, `ut_run`, `ut_live`, `ut_review`, `ut_stat`; never copies them                                                   |
| Test-only C#           | `tests/code/unity-<domain>/unity/...`, copied into your own test project              | keeps shipped code clean                                                                                                           |

No asmdef in `Assets/Editor/AgentKit/`: jobs compile into Assembly-CSharp-Editor, which references
every auto-referenced package (URP, Input System, Cinemachine, VFX Graph...). A test asmdef cannot
reference Assembly-CSharp-Editor: call jobs through `ut_run.run_method`, test gameplay code in its
own asmdef.

## 2. The job skeleton

```csharp
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit.Lighting
{
    public static class LightingJobs
    {
        // ut_run.run_method(P, "AgentKit.Lighting.LightingJobs.SetSun", {"scene": "...", "pitch": 42, "intensity": 2.0})
        public static void SetSun()
        {
            AgentJob.Run(() =>
            {
                var scene = EditorSceneManager.OpenScene(AgentJob.Str("scene"), OpenSceneMode.Single);
                var sun = Object.FindFirstObjectByType<Light>();           // 6.3: not FindObjectOfType
                if (sun == null) throw new System.InvalidOperationException("no Light in " + scene.path);
                Undo.RecordObject(sun.transform, "Agent: sun pitch");       // harmless in batch, correct live
                Undo.RecordObject(sun, "Agent: sun intensity");
                sun.transform.rotation = Quaternion.Euler(AgentJob.Float("pitch", 45f), -35f, 0f);
                sun.intensity = AgentJob.Float("intensity", 1f);
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);                        // explicit save, or nothing persists
                return new Dictionary<string, object>
                {
                    { "light", sun.name }, { "rotation", sun.transform.eulerAngles }, { "intensity", sun.intensity },
                };
            });
        }
    }
}
```

Rules:

1. **Always `AgentJob.Run(() => { ...; return result; })`.** It catches everything and prints
   exactly one `AGENT_RESULT {json}` line. A method that returns without reporting gives ok=false
   ("did not call AgentJob.Run").
2. **Return data, not prose.** A `Dictionary<string, object>` of numbers, paths and names the caller
   can assert on. `AgentJson` serializes dictionaries, lists, primitives, enums, Vector2/3/4,
   Quaternion (Euler), Color, Rect, Bounds, and objects by public fields.
3. **Fail loudly.** Throw, or `AgentJob.Fail("reason", partialResult)`. Missing inputs are errors,
   not silent defaults. `AgentJob.Warn("...")` for things the caller must read.
4. **Arguments:** `AgentJob.Str/Int/Float/Bool(key, default)`; `AgentJob.List(key)`/`Dict(key)`
   never return null (an empty collection when the key is missing), so
   `AgentJob.List("k") ?? defaults` never uses the defaults (scenario-unity-2d, observed): test
   presence with `AgentJob.Has(key)` or `TryList(key, out var l)`, or write
   `AgentJob.ListOrNull("k") ?? defaults` (v0.2; `TryDict`/`DictOrNull` likewise).
   `AgentJob.ResolvePath(p)` resolves project-relative paths; `AgentJob.OutDir("captures")` gives a
   per-job output folder (`Library/AgentKit/jobs/<id>/out/...`).
5. **Idempotent and marked.** Get-or-create by name or path; rerunning a job must not duplicate
   objects. Name what you create so an audit can find it (the capture bookmarks use the `AgentView_`
   prefix).
6. **Persist explicitly.** Scenes: `EditorSceneManager.SaveScene`; assets:
   `EditorUtility.SetDirty` + `AssetDatabase.SaveAssets`; new assets `AssetDatabase.CreateAsset`.
   Many asset edits: `AssetDatabase.StartAssetEditing()` / `StopAssetEditing()` in `try/finally`
   (one refresh; a missing `StopAssetEditing` freezes the AssetDatabase, Javier Abud Chavez,
   S2P9n5U9xVw [00:30:21]).
7. **Edits through serialization.** `SerializedObject` + `ApplyModifiedProperties`, or
   `Undo.RecordObject` on the exact component before the change, plus
   `PrefabUtility.RecordPrefabInstancePropertyModifications` for prefab instances. Direct field
   writes may look right and vanish on reload (Freya Holmér, pZ45O2hg_30 [02:59:23]).
8. **Never touch the user's open scene without saying so.** In a live GUI editor, a job that opens
   another scene replaces the user's scene: check `EditorSceneManager.GetActiveScene().isDirty` and
   refuse, or work in a new scene. Save only what you changed.
9. **Rendering needs graphics.** Call `AgentCapture.RequireGraphics()` in jobs that render or bake,
   and run them with `graphics=True`.
10. **6.3 APIs only.** `FindObjectsByType<T>(FindObjectsSortMode.None)`, `Rigidbody.linearVelocity`,
    `Lightmapping.TryGetLightingSettings`, Render Graph passes. Build with zero warnings: `ut_run`
    reports `compile_warning_codes` (CS0618 = obsolete API).
11. **No `??`, `?.` or `is null` on a `UnityEngine.Object`.** Unity overloads `==` only: a destroyed
    object or an Editor "missing component" compares equal to null but is not C# null (measured,
    `unity-6.3-traps.md` O23). Write
    `var rb = go.GetComponent<Rigidbody>(); if (rb == null) rb = go.AddComponent<Rigidbody>();` or
    `TryGetComponent`.
12. **Capture honestly.** `AgentCapture` warms materials and URP 2D lights; it does not change an
    Animator's culling mode (sample with Always Animate) or draw Overlay canvases (use Screen Space
    Camera). Anything wrong only in an Editor capture is re-checked in a player (traps section 2).

## 3. Async jobs (Play mode, editor ticks, domain reloads)

```csharp
public static void WaitTicks()
{
    AgentJob.Run(() =>
    {
        AgentJob.BeginAsync();                     // throws if launched with -quit
        int n = 0;
        EditorApplication.CallbackFunction tick = null;
        tick = () => { if (++n < 30) return; EditorApplication.update -= tick; AgentJob.Succeed(new { ticks = n }); };
        EditorApplication.update += tick;
        return null;
    });
}
```

Launch with `ut_run.run_method(P, "...WaitTicks", quit=False)`. `Succeed`/`Fail` then exit the
editor (batch) or just write the result (bridge). Entering Play mode reloads the domain in template
projects: keep state in `SessionState` and resume from an `[InitializeOnLoad]` static constructor,
as `AgentProfile` does. Always give the runner a `timeout`. Nothing may run after the envelope: from
v0.2 `ut_run` ends an editor that stays silent 10 s after its result and a shutdown line, or 120 s
after the result alone (`grace`, `result_grace`; 0 disables).

## 4. Python side of a domain skill

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-expert/scripts")
import ut_env, ut_run, ut_review, ut_stat

P = ut_env.base_project("3d", "<project>/tests/projects/unity-lighting")      # APFS clone, AgentKit installed
ut_env.install_agentkit(P, src="<skills>/scenario-unity-rendering-lighting/scripts/AgentKit")
r = ut_run.run_method(P, "AgentKit.Lighting.LightingJobs.SetSun", {"scene": "Assets/Scenes/Demo.unity", "pitch": 30})
assert r["ok"], (r["error"], r["compile_errors"][:3])
cap = ut_run.run_method(P, "AgentKit.AgentCapture.CaptureViews", {"scene": "Assets/Scenes/Demo.unity"}, graphics=True)
rev = ut_review.review_capture(cap)            # then open rev["sheet"] and LOOK at it
```

If an editor holds the project (`ut_env.ProjectLockedError`), the same job runs live:
`ut_live.call(P, "AgentKit.Lighting.LightingJobs.SetSun", {...})`.

## 5. Findings format (audits)

Domain audits add findings in the core format so the lead can merge reports:
`{"severity": "error"|"warn"|"info", "code": "<domain>.<rule>", "path": "<asset or scene:hierarchy path>", "message": "...", "fix": "..."}`.
Reuse `AgentAudit.Findings` (`f.Add(severity, code, path, message, fix)`) and the fact collectors
(`AuditTexture`, `AuditModel`, `AuditMaterial`, `AuditPrefab`, `AuditOpenScenes`).

## 6. Live test for each procedure

Each procedure in `references/procedures.md` gets a test under `tests/code/unity-<domain>/` that
runs it through `ut_run` (or `ut_live`), asserts on the envelope, runs `ut_review` on any PNG, and
records "run in Unity 6000.3.21f1 on <date>: pass, <key numbers>". Model:
`tests/code/unity-expert/test_live_toolkit.py` and `common.record`.
