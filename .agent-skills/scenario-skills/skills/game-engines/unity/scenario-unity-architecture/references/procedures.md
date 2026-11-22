# Architecture procedures (copyable, each with its live test and result)

All ran in Unity 6000.3.21f1 on macOS 26.5.1 (Apple Silicon) on 2026-09-24, project
`tests/projects/unity-architecture` (APFS clone of Base3D_URP; the path has spaces). Tests:
`tests/code/unity-architecture/test_live_arch.py` (live) and `test_offline.py`; results appended to
`archive/tests/unity-architecture/live_results.jsonl`. Header for every snippet:

```python
import sys
sys.path[:0] = ["<skills>/scenario-unity-expert/scripts", "<skills>/scenario-unity-architecture/scripts"]
import ut_env, ut_run, ut_arch
P = ut_env.base_project("3d", "<project>/tests/projects/<skill>")
```

Where the C# is long it lives in `scripts/templates/` (runtime, editor and test code copied by
`ut_arch.scaffold`) or `scripts/AgentKit/Architecture/` (batch jobs); the snippets below name the
file and quote the lines that carry the expert rule.

## A1. Scaffold the architecture and prove the assemblies

```python
ut_arch.install(P)            # AgentKit core + AgentKit/Architecture -> Assets/Editor/AgentKit/
ut_arch.scaffold(P)           # Assets/Game/Scripts/{Core,Runtime,Editor}, Assets/Game/Tests/{EditMode,PlayMode}
f = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.ProjectFacts")
assert f["ok"] and not f["compile_errors"] and not f["compile_warning_codes"]
g = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.AssemblyGraph", {"prefix": ""})
rows = {a["name"]: a for a in g["result"]["assemblies"]}
assert rows["Game.Core"]["engine_refs"] == 0 and g["result"]["violations"] == []
```

Layout (asmdef JSON in `scripts/templates/*/*.asmdef`):

| Assembly            | References                                                                                                    | Flags                                                                            | Why                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Game.Core           | none                                                                                                          | `noEngineReferences: true`                                                       | rules (inventory, damage, save DTOs, migrations) in pure C#: EditMode tests in milliseconds                                            |
| Game.Runtime        | Game.Core, Unity.InputSystem                                                                                  | auto-referenced                                                                  | MonoBehaviours, SO definitions, services, input, save files                                                                            |
| Game.Editor         | Game.Core, Game.Runtime                                                                                       | `includePlatforms: ["Editor"]`                                                   | validators, menu items; namespace `Game.EditorTools` [added: a namespace segment named `Editor` shadows `UnityEditor.Editor`; not run] |
| Game.Tests.EditMode | Core, Runtime, Editor, Unity.InputSystem, Unity.InputSystem.TestFramework, UnityEngine/UnityEditor.TestRunner | `overrideReferences` + `nunit.framework.dll`, `UNITY_INCLUDE_TESTS`, Editor only | one reference style (lead trap O4)                                                                                                     |
| Game.Tests.PlayMode | Core, Runtime, Unity.InputSystem, Unity.InputSystem.TestFramework, UnityEngine.TestRunner                     | same, all platforms                                                              |                                                                                                                                        |

`ProjectFacts` reads: Enter Play Mode
(`EditorSettings.enterPlayModeOptionsEnabled`/`enterPlayModeOptions`), serialization mode,
`VersionControlSettings.mode`, `activeInputHandler`, the project-wide actions path, player
assemblies.
`SetEnterPlayMode {"mode": "reload_all"|"reload_scene_only"|"reload_domain_only"|"no_reload"}`
writes it (`m_EnterPlayModeOptions` in `ProjectSettings/EditorSettings.asset`).

Test: `test_01`, `test_02`. Result: pass. Zero compile errors and zero warnings; facts: reload_all,
ForceText, Visible Meta Files, InputSystemPackage, `Assets/InputSystem_Actions.inputactions`;
SetEnterPlayMode reload_scene_only wrote `m_EnterPlayModeOptions: 1`, then restored. Game.Core
engine_refs 0. Negative control: `ArchTests.BadRef` (a runtime asmdef referencing Game.Editor)
COMPILED in the Editor and was flagged; the macOS player build with it present failed (A4). The
Editor compilation also lists auto-referenced editor assemblies (UnityEditor.UI) on runtime
assemblies, so the check reads explicit asmdef references only. Unity.InputSystem.TestFramework
resolved without a `testables` entry; adding `"testables": ["com.unity.inputsystem"]` adds the
package's IntegrationTests (2) to PlayMode results.

## A2. ScriptableObject definitions from data, core rules with EditMode tests

```python
specs = ut_arch.item_specs()   # 3 ItemDefinition assets (stable string ids), ItemDatabase, HealthConfig, 2 channels
a = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.CreateAssets", {"specs": specs})
b = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.CreateAssets", {"specs": specs})   # idempotent
assert len(b["result"]["unchanged"]) == len(specs)
snap = "/abs/so_before.json"
ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.SnapshotAssets", {"folders": ["Assets/Game/Data"], "out": snap})
e = ut_run.run_tests(P, "EditMode", assemblies="Game.Tests.EditMode")
s2 = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.SnapshotAssets", {"folders": ["Assets/Game/Data"], "compare_to": snap})
assert e["ok"] and s2["result"]["changed_on_disk"] == []
```

Spec format:
`{"type": "Game.Runtime.ItemDefinition", "path": "Assets/Game/Data/Items/Item_arrow.asset", "fields": {"id": "arrow", "displayName": "Arrow", "maxStack": 99}, "refs": {...}, "ref_lists": {"items": [paths]}}`.
The job edits through `SerializedObject` and calls `EditorUtility.SetDirty` only when
`ApplyModifiedPropertiesWithoutUndo()` reports a change (no spurious VCS diffs, 6.3 Manual
Versioncontrolintegration).

Key template rules: `ItemDefinition` stores `[SerializeField] string id` (never the asset name,
never an instance id), generated once in `OnValidate` under `#if UNITY_EDITOR`; `ItemDatabase` is a
serialized list with a lazily rebuilt dictionary (no `Resources.LoadAll`); `Inventory` (Game.Core)
knows ids and an `IItemCatalog`, returns leftovers, removes all-or-nothing, throws on unknown ids,
drops ids the catalog no longer knows on restore; `HealthModel` applies invulnerability, a
resistance multiplier, clamps and raises `Died` exactly once; `DamageKind` has explicit enum values
(Hipple [00:46:39]).

Test: `test_03`, `test_04` (`CoreTests.cs`, `SaveAndDataTests.cs`, `InputBindingTests.cs`,
`EventChannelTests.cs`, `DataRulesTests.cs`, `ServicesTests.cs`). Result: pass. 7 assets created,
second run 7 unchanged (the new `effects` list stays empty in the specs); EditMode 33/33 in 11.3 s
(final run, 2026-09-24 20:44); SO snapshot of 7 assets unchanged on disk after the suite (a disk
check only: runtime writes need A11).

## A3. Save and load through a file, across processes

```python
d = "/abs/save_dir"
a = ut_run.run_method(P, "ArchTests.TestJobs.CrossProcessSave", {"dir": d, "mode": "save"})
b = ut_run.run_method(P, "ArchTests.TestJobs.CrossProcessSave", {"dir": d, "mode": "load"})   # a new editor process
assert a["result"]["pid"] != b["result"]["pid"] and a["result"]["count1"] == b["result"]["count1"]
```

`SaveService` (`templates/Runtime/Save/SaveService.cs`):

```csharp
public void Save(SaveData data, string slot) { data.version = SaveData.CurrentVersion; WriteAtomic(PathFor(slot), JsonUtility.ToJson(data, true)); }
static void WriteAtomic(string path, string contents) {
    Directory.CreateDirectory(Path.GetDirectoryName(path));
    string tmp = path + ".tmp";
    File.WriteAllText(tmp, contents);
    if (File.Exists(path)) File.Replace(tmp, path, path + ".bak"); else File.Move(tmp, path);
}
// TryLoad: main file, else .bak; reads {"version"} first; v1 -> SaveMigrations.FromV1; unknown version refused
public async Awaitable SaveAsync(SaveData data, string slot, CancellationToken token) {
    string json = JsonUtility.ToJson(data, true);          // main thread
    await Awaitable.BackgroundThreadAsync();              // IO off the main thread (not on Web: no threads)
    WriteAtomic(PathFor(slot), json);
    await Awaitable.MainThreadAsync();
}
```

DTOs (`templates/Core/SaveData.cs`) are `[Serializable]` classes with public fields and lists of
`{itemId, count}`: JsonUtility serializes fields only, no Dictionary. The job `CrossProcessSave`
(test-only, `tests/code/unity-architecture/unity/Editor/ArchTestJobs.cs`) builds an inventory and a
health model from the SO definitions, saves, and the second process restores into fresh objects.

Test: `test_04` (EditMode: round trip with fresh objects and SO definitions untouched, corrupt main
file falls back to `.bak`, v1 migrated and clamped, unknown version refused, missing slot),
`test_05` (`SaveAsync` resumes on the main thread id), `test_06`. Result: pass. Two editor processes
(different PIDs): potion 4, arrow 42, HP 62.5 of 100 after 25 fire damage at multiplier 1.5,
identical after reload; the file holds `"version": 2` and no `fileID`. `File.Replace` works on macOS
(Mono).

## A4. Prove "SO writes vs save file" outside the Editor (and the editor-only reference trap)

Editor half, the double-Play job with an asset watch (see A8 for the job):

```python
r = ut_run.run_method(P, "AgentKit.Architecture.ArchPlayMode.DoublePlay",
        {"scene": "Assets/ArchTests/Scenes/ArchProbe_DoublePlay.unity", "mode": "reload_all", "sessions": 2,
         "play_seconds": 1.0, "assets": [{"path": "Assets/ArchTests/Data/ProbeCounter.asset", "field": "value"}],
         "save_assets_at_end": True}, quit=False, timeout=600)
# records[i]["in_play"]["<path>:value"] == {"memory": i + 1, "disk": "0", "dirty": False}; after_save_assets disk "0"
```

Player half: a Boot scene with `PersistenceProbe` (DontDestroyOnLoad, references `Kept.asset`) and a
`SoHolder` referencing `Unreferenced.asset`; the probe loads its save with `SaveService`, writes +10
into both SOs, saves, loads an empty scene then a reader scene, writes a JSON report and quits:

```python
s = ut_run.run_method(P, "ArchTests.TestJobs.BuildPlayerProbeScenes")
b = ut_run.build(P, "macos", out="Builds/macOS/ArchProbe.app", scenes=s["result"]["scenes"])
for i in (1, 2):
    ut_arch.run_player(P + "/Builds/macOS/ArchProbe.app", ["-probeOut", out_dir])   # -batchmode -nographics
    # out_dir/probe_report_run<i>.json
```

Test: `test_07` (Editor half), `test_11` (player). Result: see the RESULT line below.

Result: pass (runs 2026-09-24 19:40 and 20:10, identical reports). Editor: the SO field read 1 then
2 in memory across two Play sessions in both reload modes, `IsDirty` false, the `.asset` on disk
`value: 0` even after `AssetDatabase.SaveAssets()`. Player (macOS, Mono, 114.6 MB; build 121 s the
first time under load, 10.8 s incremental; headless `-batchmode -nographics`, 3.7 s and 2.8 s per
run): run 1 found no save, wrote +10 into both SOs and saved; run 2 loaded the save file
(`loaded_from: Main`, run counter 2) but read `Kept.asset` back at 0: the Play-time SO write did not
survive the relaunch. Inside one run, the SO referenced by the DontDestroyOnLoad object kept 10
across two single-mode scene loads, while the SO referenced only by scene objects came back as 0
with the same instance id: it was unloaded and reloaded from its baked data (the limit of Hipple's
"SO state persists between scenes": keep it referenced). Negative control: with `ArchTests.BadRef`
(runtime asmdef referencing Game.Editor) present, the Editor compiled but the player build failed
with `CS0234: The type or namespace name 'EditorTools' does not exist in the namespace 'Game'`;
after parking the fixture the build succeeded.

## A5. Input: project-wide actions, rebinding that persists and resets, several devices

```python
# audit the project-wide asset (and author input as JSON when needed)
good = ut_run.run_method(P, "AgentKit.Architecture.ArchInputAudit.Audit", {"maps": ["Player"]})
assert good["result"]["project_wide"] and good["result"]["counts"]["warn"] == 0
data = json.load(open(P + "/Assets/InputSystem_Actions.inputactions"))   # maps, actions, bindings: plain JSON
# ... edit bindings (path, groups, interactions "hold(duration=0.4)", processors) and write it back; Unity reimports
e = ut_run.run_tests(P, "EditMode", filter="Game.Tests.InputBindingTests", assemblies="Game.Tests.EditMode")
```

`RebindFlow` (`templates/Runtime/Input/RebindFlow.cs`), the lines that carry the rules:

```csharp
action.Disable();                                              // WithAction throws on an enabled action
var op = action.PerformInteractiveRebinding(bindingIndex)     // throws on a composite head: target its parts
    .WithCancelingThrough("<Keyboard>/escape")                 // not added by default for Button actions
    .OnMatchWaitForAnother(options.waitForAnother);            // package default 0.05 s
if (options.excludeMouseButtons) op.WithControlsExcluding("<Mouse>/leftButton").WithControlsExcluding("<Mouse>/rightButton")
    .WithControlsExcluding("<Mouse>/middleButton").WithControlsExcluding("<Mouse>/press").WithControlsExcluding("<Pointer>/position");
if (!string.IsNullOrEmpty(options.requiredDevicePath)) op.WithControlsHavingToMatchPath(options.requiredDevicePath);
op.OnComplete(_ => flow.Complete()).OnCancel(_ => flow.Finish(Canceled)).Start();
// Complete(): TryFindDuplicate on effectivePath within the map, groups overlapping, same-composite parts
// compared only with EARLIER parts; a duplicate restores the PREVIOUS override. Finish(): op.Dispose(), re-enable.
```

`BindingStore`: `Save` writes `asset.SaveBindingOverridesAsJson()` to a file (atomic), `Load` calls
`LoadBindingOverridesFromJson` before maps are enabled (it removes existing overrides first),
`ResetAll` runs `RemoveAllBindingOverrides` on every map AND deletes the file. Tests drive virtual
devices:

```csharp
// excerpt of InputBindingTests.InteractiveRebind_Persists_SurvivesRelaunch_AndResets (templates/Tests/EditMode)
public class InputBindingTests : InputTestFixture
{
    [Test]
    public void InteractiveRebind_Persists_SurvivesRelaunch_AndResets()
    {
        var asset = Copy();                                  // InputActionAsset.FromJson of the project's .inputactions
        var jump = asset.FindAction("Player/Jump");
        int kb = RebindFlow.BindingIndexForGroup(jump, "Keyboard&Mouse");
        RebindFlow.Result? result = null;
        RebindFlow.Start(jump, kb, RebindFlow.Options.Keyboard, r => result = r);
        Press(m_Kb.kKey); currentTime += 0.2; InputSystem.Update();      // past OnMatchWaitForAnother
        Assert.AreEqual("<Keyboard>/k", jump.bindings[kb].effectivePath);
        BindingStore.Save(asset, m_Path);
        var relaunched = Copy();                                          // nothing survives but the file
        Assert.IsTrue(BindingStore.Load(relaunched, m_Path));
        BindingStore.ResetAll(relaunched, m_Path);                        // overrides removed AND file deleted
        Assert.IsFalse(File.Exists(m_Path));
    }
}
```

Local multiplayer (`LocalMultiplayerTests.cs`):
`PlayerInput.Instantiate(prefab, controlScheme: "Gamepad", pairWithDevice: pad1)` twice; the second
player gets its own actions copy; pressing pad 2 fires only player 2.

Test: `test_04` (EditMode input tests; layering, shortcut and combo tests in A15), `test_05`
(PlayMode multiplayer), `test_09` (audit). Result: pass. Rebinding an enabled action throws "Cannot
rebind action ... while it is enabled"; a composite head throws; K rebinds Jump, Space no longer
fires, K does; overrides saved, loaded into a fresh asset, reset to `<Keyboard>/space` with the file
deleted and a third fresh asset clean; Escape cancels the flow while the raw package rebind binds
`<Keyboard>/escape`; a mouse click is ignored on a keyboard row; Space for Interact rejected
(conflict "Jump"), previous override F restored; W for "down" rejected (earlier "up" part), S for
"up" accepted (later "down" part); a gamepad row ignores the keyboard and binds
`<Gamepad>/rightShoulder`; one action fired from both devices; map switch Player to UI; two players
isolated. The audit of the template's Player map: 0 warnings; a JSON-edited copy (Jump without
gamepad, Interact on Space) gave `input.missing_scheme` for Jump and `input.duplicate_binding` for
`<Keyboard>/space` on Jump and Interact (reported on the later action in map order); offline
`ut_arch.input_lint` agreed. Traps found: (1) after any `InputTestFixture` test,
`InputSystem.actions` was null for later tests in the run (the project-wide test passed alone,
failed in the suite); (2) a test helper that loaded "the first `.inputactions` found" silently
switched to the JSON-edited copy once it existed, and the multiplayer test failed with zero resolved
controls. Both fixed by reading the configured asset:
`EditorBuildSettings.TryGetConfigObject("com.unity.input.settings.actions", out InputActionAsset a)`.
The multiplayer test queues input (`Press(..., queueEventOnly: true)`, then `yield return null`),
checks `IsPressed()`, and destroys the players in `TearDown` before the fixture restores the input
system (a player left alive by a failed run threw `ArgumentOutOfRangeException` from
`PlayerInput.OnDisable` at Play exit).

## A6. Events, listeners and lifecycle facts

```csharp
// EventChannel<T> (templates/Runtime/Events/EventChannel.cs)
public void Raise(T value) { for (int i = m_Listeners.Count - 1; i >= 0; i--) { if (i >= m_Listeners.Count) continue; m_Listeners[i](value); } }
[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
static void ResetAllChannels() { foreach (var c in s_Loaded) if (c != null) c.ClearListeners(); }
// VoidEventListener: Register in OnEnable, Unregister in OnDisable AND OnDestroy (idempotent)
```

Concrete channels (`VoidEventChannel`, `FloatEventChannel`, `StringEventChannel`) each sit in a file
named like the class. Prefab isolation (`PrefabIsolationTests.cs`): every prefab under
`Assets/Game/Prefabs` is instantiated alone in a new scene, five frames,
`LogAssert.NoUnexpectedReceived()`.

```python
p = ut_run.run_tests(P, "PlayMode", assemblies="Game.Tests.PlayMode")
```

Test: `test_05` (`LifecycleTests.cs`, `PrefabIsolationTests.cs`), `test_12`. Result: pass (PlayMode
17/17 in 15.6 s, final run 2026-09-24 20:45; the Destroy order below was logged again in that run).
`Object.Destroy` of a four-level hierarchy logged `OnDisable:D0, D1, D3, D2` then
`OnDestroy:D0..D3`: OnDisable reached every level on 6000.3.21f1 (the 6.4 upgrade guide says pre-6.4
editors stopped at direct children, so `OnDestroy` unregistration stays); `SetActive(false)` reached
all descendants; a grandchild listener with OnDisable-only unregistration and one with OnDisable +
OnDestroy both left 0 entries; a listener unregistering itself mid-`Raise` did not skip the others.
Prefab isolation: `Player.prefab` (Health wired to HealthConfig and both channels through
`SerializedObject`, Regeneration, a nested `VoidEventListener`) ran alone with no log; with
`Bad_NeedsManager.prefab` (a `FindAnyObjectByType` "manager" lookup) the test failed with "Unhandled
log message: '[Exception] NullReferenceException'", and passed again once the prefab was moved out
with `AssetDatabase.MoveAsset`.

## A7. Awaitable with cancellation

```csharp
// Regeneration (templates/Runtime/Async/Regeneration.cs)
async Awaitable Start() {
    var token = destroyCancellationToken;
    try { while (true) { await Awaitable.WaitForSecondsAsync(interval, token); Ticks++; health?.Heal(amountPerTick); } }
    catch (OperationCanceledException) { Canceled = true; }
}
// AwaitableExtensions: public static async Task AsTask(this Awaitable a) { await a; }   (one Task allocation)
// Tests: [UnityTest] public IEnumerator T() { async Awaitable Impl() { ... } return Impl(); }
```

Test: `test_05` (`AsyncTests.cs`). Result: pass. Regeneration healed, stopped at Destroy (no tick in
the next 0.3 s, `Canceled` true); the token-less control loop ticked 13 to 14 more times after
Destroy (three runs); `AsTask` gave 57 twice and `Task.WhenAll` [1, 2]; `WaitUntil` threw
`OperationCanceledException` on cancel; `SaveAsync` returned on the main thread id; an `async Task`
test method ran under Test Framework 1.6.

## A8. Enter Play Mode hardening: static audit and double Play

```python
s = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.StaticStateAudit", {"assemblies": ["Game.", "Assembly-CSharp"]})
bad = [f for f in s["result"]["findings"] if f["code"] == "arch.static_without_reset"]
r = ut_run.run_method(P, "AgentKit.Architecture.ArchPlayMode.DoublePlay", {
        "scene": "Assets/X.unity", "mode": "reload_scene_only", "sessions": 2, "frames": 10, "play_seconds": 1.0,
        "settle_seconds": 1.5, "watch": ["My.Type.StaticField", "My.Type.StaticEventCountProperty"]}, quit=False, timeout=600)
for rec in r["result"]["records"]: print(rec["session"], rec["in_play"])   # session 2 must equal session 1
```

`StaticStateAudit` reflects over the named assemblies: static fields, static auto-properties, static
events and static readonly collections (arrays excepted), and looks for a
`[RuntimeInitializeOnLoadMethod]` (SubsystemRegistration recommended) or
`[InitializeOnEnterPlayMode]` method on the type. `DoublePlay` keeps its state in `SessionState`
with an `[InitializeOnLoad]` driver (survives the domain reload of "reload_all"), reads watched
statics by reflection (delegates report their subscriber count) and SO fields (memory through
`SerializedObject`, disk by reading the `.asset`), and restores the original setting. Batch
`-nographics` Play mode runs uncapped (37,000 to 61,000 frames per second observed): use
`play_seconds`.

Test: `test_07`, `test_08`. Result: pass. Reload Scene only: `StaticCounterProbe.Starts` 1 then 2
and its static event 1 then 2 subscribers; `ResetCounterProbe` (SubsystemRegistration reset) 1 and
1; Reload Domain and Scene: 1 and 1. At Play exit both `destroyCancellationToken` and
`Application.exitCancellationToken` fired. A token-less `Awaitable.WaitForSecondsAsync` loop stopped
ticking at exit; a token-less `Task.Delay` loop kept ticking in Edit mode (+14 in 1.5 s) and, with
domain reload off, ran alongside the new one in session 2. The audit flagged the probe statics (8
warnings) and passed `Services.s_Map` and `EventChannelBase.s_Loaded` (reset at
SubsystemRegistration).

## A9. Version control: settings, files, meta audit, headless merge

```python
ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.SetVcsSettings")        # Force Text + Visible Meta Files, read back
ut_arch.meta_audit(P)                        # missing / orphan .meta, duplicate GUIDs, spaces
ut_arch.write_vcs_files(repo)                # .gitignore + .gitattributes (LFS by extension, YAML merge driver, no *.asset)
ut_arch.git_setup_unity_merge(repo)          # merge.unityyamlmerge.driver = '<UnityYAMLMerge>' merge -h --force
                                             #   --fallback none -o '%P.conflicts.txt' %O %B %A %A ; mergetool entry
m = ut_arch.yaml_merge(base, theirs, mine, out)            # exit 0 clean, 2 conflict; m["conflict_fields"]
m = ut_arch.yaml_merge(base, theirs, mine, out, resolve="mine")   # -r: still exit 2, conflicted field = mine
ins = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.InspectAsset", {"path": "Assets/X_merged.prefab"})
```

UnityYAMLMerge on this Mac:
`/Applications/Unity/Hub/Editor/6000.3.21f1/Unity.app/Contents/Helpers/UnityYAMLMerge` (tool 1.0.1);
rules in `Contents/Resources/UnityYAMLMerge/mergerules.txt`. Fixtures are genuine Unity YAML:
`MakeMergeFixtures` saves one prefab, then edits it through
`PrefabUtility.LoadPrefabContents`/`SaveAsPrefabAsset` from the same base.

Test: `test_10`, `test_offline.py::test_vcs_files_and_attributes`, `test_meta_audit`. Result: pass.
6.3 defaults already Force Text and Visible Meta Files; meta audit of 128 entries clean. Clean merge
(theirs renamed the child and added a Rigidbody, mine moved the root to (1, 2, 3) and set the
collider to (2, 2, 2)): exit 0, all four changes present after Unity reopened it (the prefab root
takes the file name). Conflict (both moved the child): exit 2, report names
`Transform.m_LocalPosition`, the output silently holds the BASE x 0; with `-r` the output holds 9
and the exit is still 2. Through Git: the driver merged the clean branch inside `git merge` (exit 0)
and left the conflicting one unmerged (`git diff --diff-filter=U` = Crate.prefab) with
`Crate.prefab.conflicts.txt`. `git check-attr`: `.png` filter lfs, `.png.meta` unspecified,
`.prefab` merge unityyamlmerge, `.asset` unspecified. Git LFS itself is not installed on this Mac:
attributes were checked, no LFS push ran.

## A10. Offline lint (cheap first pass before a Unity run)

```python
findings = ut_arch.code_lint([P + "/Assets/Game/Scripts"])      # async, events, input, statics, serialization, 6.3 APIs
findings += ut_arch.input_lint(P + "/Assets/InputSystem_Actions.inputactions", [P + "/Assets/Game/Scripts"])
audit = ut_arch.rebind_audit([P + "/Assets/Game/Scripts/Runtime/Input"])   # A15: which rebinding rules the code implements
```

Codes (severity): `async.token_none` (warn), `async.blocking_wait` (error), `async.async_void`
(warn), `async.task_delay` (warn), `async.double_await` (error: the same Awaitable local awaited
twice), `async.loop_without_token` (warn: an awaiting `while` loop that names no token),
`async.unity_api_off_main_thread` (error: a Unity API between `BackgroundThreadAsync()` and
`MainThreadAsync()`, list calibrated on the development player of A12),
`events.forward_listener_iteration` (warn), `events.unityevent_per_frame` (warn),
`input.findaction_per_frame`, `input.legacy_input`, `input.playerinput_with_global_actions`,
`input.rebind_without_dispose`, `input.stored_callback_context` (warn), `input.load_overrides_wipes`
(info), `serialization.serializereference_without_serializable` (warn, walks derived classes across
the scanned files), `serialization.enum_implicit_values` (info), `api.find_object_of_type`,
`api.serializefield_on_property`, `editor.setdirty_in_runtime`, `statics.static_event`,
`so.runtime_write_hint`.

Test: `test_offline.py` (9 tests). Result: pass (final run 2026-09-24 20:43). Two crafted bad files
trigger every code above; a matching good file (backward Raise, token loop, `AsTask()` before two
awaits, only `File.WriteAllText` off the main thread, `[Serializable]` on every
`[SerializeReference]` type, explicit enum values) triggers none of the new codes; the runtime
templates have no warn or error (two info `enum_implicit_values` on non-serialized enums); an
unknown `FindAction("Jumpp")` is caught.

## A11. Play-mode probes: the in-memory SO guard and the event-channel debug plan

A Play-mode write to a ScriptableObject stays in Editor memory with `IsDirty` false and never
reaches the `.asset` (A4), so `SnapshotAssets` in a later process, or a file hash, cannot see it.
The guard must compare `EditorJsonUtility.ToJson` of the loaded assets in the process that plays
(Code Monkey, 5a-ztc5gcFw, Agent translation). Two places run it: `ArchPlayMode` for scenes,
`PrefabIsolationTests.EveryPrefab_LeavesDefinitionsUntouchedInMemory` for prefabs.

```python
r = ut_run.run_method(P, "AgentKit.Architecture.ArchPlayMode.DoublePlay", {      # PlayProbe = the same job, 1 session
    "scene": "Assets/Scenes/Level.unity", "mode": "reload_scene_only", "sessions": 2, "frames": 10, "play_seconds": 0.5,
    "so_guard": {"folders": ["Assets/Game/Data"], "allow": []},          # -> in_play / after_exit "so_changed_in_memory"
    "invoke": [{"path": "Assets/Game/Data/Events/EVT_PlayerDied.asset", "method": "RaiseDebug"}],   # fire the event by hand
    "invoke_frames": 3,                                                   # frames between the invoke and the reading
    "assets": [{"path": "Assets/Game/Data/Events/EVT_PlayerDied.asset", "member": "ListenerCount"}],
    "watch": ["My.Probe.StaticCounter"]}, quit=False, timeout=600)
for rec in r["result"]["records"]:
    assert rec["in_play"]["so_changed_in_memory"] == [] and all(i["ok"] for i in rec["invoked"])
```

The debug plan of a channel (Hipple, raQ3iHhE_Kk [00:06:00], [00:36:07], [00:55:31]) ships in the
templates: `EventChannelBase.ListenerCount`, `RaiseCount`, `LastRaiseFrame`, a serialized
`logRaises` toggle (a `Debug.Log` line per raise, with its stack trace in the Editor log),
`RaiseDebug()` sending the serialized `debugValue`, and `Game.EditorTools.EventChannelEditor`
(listener count, raise count, a "Raise (debug value)" button in Play mode). A persistent UnityEvent
response is wired without the Inspector by
`UnityEventTools.AddVoidPersistentListener(listener.Response, target.Method)`; in Edit mode such a
call is silent until `SetPersistentListenerState(i, UnityEventCallState.EditorAndRuntime)` (default
`RuntimeOnly`, observed in `EventChannelTests`).

Test: `test_13` (scene built by `ArchTests.TestJobs.BuildDebugProbeScene`), `test_12`, `test_04`
(`EventChannelTests`). Result: pass (final run 2026-09-24, 20:43 to 20:57). Two Play sessions in
"Reload Scene only": each session `invoked` RaiseDebug ok, the persistent UnityEvent response ran
once (`Responses` 1, listeners 1, raises 1 per session: the SubsystemRegistration reset cleared them
between sessions), the Editor log held `[EVT_Probe] raised to 1 listener(s)`, and
`so_changed_in_memory` named exactly `ProbeCounter.asset` (the probe's deliberate write, memory 1
then 2, disk `0`) and nothing under `Assets/Game/Data`. Prefab guard: with
`Bad_WritesDefinition.prefab` (its Start adds 1 to `HealthConfig.maxHealth`) the test failed with
"Bad_WritesDefinition wrote Assets/Game/Data/HealthConfig_Player.asset"; `Player.prefab` alone
passed. Allocation (`EventChannelTests`, 10,000 calls after one warm-up call, managed heap growth):
channel Raise 0 B, persistent UnityEvent Invoke 0 B, runtime UnityEvent listener 0 B.
`GC.GetAllocatedBytesForCurrentThread` returned 0 for every block on this Mono editor, so the test
reads `GC.GetTotalMemory`, which moves in blocks (calibration: 100 KB allocated read as 57,344 B); a
few bytes per call would still show over 10,000 calls. Hipple's 2017 "allocates on every invoke" did
not reproduce in steady state on 6000.3.21f1; the first call still resolves the target by
reflection. For scene-level GC per frame use scenario-unity-expert `AgentProfile` (not run in this
skill).

## A12. Development-build threading smoke test

Non-development builds skip the main-thread check (6.3 Manual, async-awaitable-continuations). Build
the same scene twice and compare:

```python
b = ut_run.build(P, "macos", out="Builds/macOS/Game_dev.app", scenes=scenes, development=True)
ut_arch.run_player(P + "/Builds/macOS/Game_dev.app", ["-probeOut", out_dir], log=out_dir + "/player_dev.log")
# then grep the player log for "can only be called from the main thread"
```

Probe: `tests/code/unity-architecture/unity/Probes/ThreadProbe.cs` (`async Awaitable Start()`,
`BackgroundThreadAsync`, one try/catch per API, the report rewritten after each call so a crash
leaves the last "attempting" line).

Test: `test_14`. Result: pass (final run 2026-09-24; an earlier run gave the same outcomes).
Development player (311.2 MB, 73.7 s build): `Application.persistentDataPath`, `Time.time`,
`transform.position` and `new GameObject` threw
`UnityException: <api> can only be called from the main thread`; `JsonUtility.ToJson` and
`Debug.Log` worked off the main thread. Release player (114.7 MB, 41.1 s): all six calls returned
without an exception, including creating a GameObject off the main thread, so the bug ships
silently. Both exited 0 in about 3.5 s. Consequences carried into the code: `SaveService.SaveAsync`
serializes and resolves the path on the main thread and only writes the file in the background; lint
`async.unity_api_off_main_thread` uses this list.

## A13. Refactor safety for serialized data

```python
common.write_ref_effects("v1");           ut_run.run_method(P, "ArchTests.TestJobs.MakeRefAsset")   # RefHeal(amount 7), RefNoAttr(n 3)
common.write_ref_effects("v2_renamed");   ut_run.run_method(P, "ArchTests.TestJobs.ReadRefAsset")   # class renamed, no [MovedFrom]
common.write_ref_effects("v3_movedfrom"); ut_run.run_method(P, "ArchTests.TestJobs.ReadRefAsset")   # [MovedFrom(false, null, null, "RefHeal")]
```

`ReadRefAsset` reports entry types, the field value and
`SerializationUtility.HasManagedReferencesWithMissingTypes` /
`GetManagedReferencesWithMissingTypes`. Agents author `[SerializeReference]` lists with
`ArchJobs.CreateAssets`
`"managed_refs": {"effects": [{"type": "Game.Runtime.HealEffect", "fields": {"amount": 25}}]}` (an
element of the right type keeps its reference id: idempotent).

Test: `test_15`, `test_04` (`DataRulesTests`). Result: pass (final run 2026-09-24). Renamed without
`[MovedFrom]`: the entry loaded as null and Unity reported the missing type `ArchProbes.RefHeal`;
the YAML still held the data because nothing saved the asset (restoring the old name brought back
amount 7; saving while the type is missing was not tested). With `[MovedFrom]`: `RefHealRenamed`,
amount 7, no missing types. A class WITHOUT `[Serializable]` (`RefNoAttr`) serialized and reloaded
inside the `[SerializeReference]` list on 6000.3.21f1: mark such types `[Serializable]` anyway for
6.4 (version notes, unverified there). `ItemDefinition.effects` (`HealEffect`, `GrantItemEffect`)
survived an `EditorJsonUtility` round trip with concrete types. `JsonUtility.ToJson` of a plain save
class with a `[SerializeReference]` list wrote a `"references": {"version": 2, "RefIds": [...]}`
block with class, namespace and assembly names and `FromJson` restored the concrete types:
polymorphic saves work, but they store type names, so a class rename then touches old save files
[added: not tested].

## A14. Runtime sets, the composition root first, await owners, struct copies

```csharp
// runtime set (templates/Runtime/Sets): members add themselves, systems read the set
[CreateAssetMenu] public sealed class SaveableSet : RuntimeSet<SaveableEntity> { }       // RuntimeSet<T>: [NonSerialized] items,
void OnEnable() { set.Add(this); } void OnDisable() { set.Remove(this); } void OnDestroy() { set.Remove(this); }   // cleared at SubsystemRegistration
// composition root (templates/Runtime/Composition/GameRoot.cs)
[DefaultExecutionOrder(-1000)] public sealed class GameRoot : MonoBehaviour { void Awake() { Services.Register(new SaveService(...)); } void OnDestroy() => Services.Unregister(m_Save); }
// await owners (templates/Runtime/Async/Lifetime.cs)
using var cts = Lifetime.Linked(this);        // destroyCancellationToken + Application.exitCancellationToken
await svc.SaveAsync(data, "slot", Lifetime.App);   // plain C# service: Application.exitCancellationToken
// struct copy (templates/Core/HealthStats.cs)
var stats = config.Stats.Scaled(2f); var model = config.CreateModel(stats);   // the asset keeps maxHealth
```

Test: `test_05` (`RuntimeSetTests`, `CompositionRootTests`, `LifetimeTests`), `test_04`
(`DataRulesTests`), `test_13`. Result: pass (final run 2026-09-24). Set: members a, b (three levels
under a root), c registered; disabling c removed it and re-enabling restored it; destroying the root
removed b. Root: a consumer created BEFORE the root under an inactive parent found `SaveService` in
its Awake on activation; the control without the attribute, same creation order, found nothing; a
second root threw "a second GameRoot woke up"; destroying the root unregistered the service; in a
loaded scene with the consumer first in the hierarchy, `FoundInAwake` was true in both Play sessions
(test_13). Lifetime: the linked loop stopped at Destroy with no further tick;
`Application.exitCancellationToken` was live during Play; `SaveAsync` with a canceled token threw
before writing. Across Play sessions (A8 data): the exit token fired at each exit and was live again
in the next session. Struct: `Scaled(2)` gave a 200 HP model while the asset kept 100.

## A15. Input: layering, shortcut combos, generated class instances, the Rebinding UI sample

```python
e = ut_run.run_tests(P, "EditMode", filter="Game.Tests.InputBindingTests", assemblies="Game.Tests.EditMode")
audit = ut_arch.rebind_audit([ut_arch.rebinding_sample_dir(P) + "/RebindActionUI.cs", ut_arch.rebinding_sample_dir(P) + "/RebindSaveLoad.cs"])
imp = ut_run.run_method(P, "AgentKit.Architecture.ArchJobs.ImportSample", {"package": "com.unity.inputsystem", "sample": "Rebinding UI"})
```

`BindingStore.Load(asset, path, removeExisting: false)` layers a file over overrides applied
earlier. `RebindFlow.TryFindDuplicate(action, index, shortcutsConsumeInput)` compares modifier
composites (OneModifier, TwoModifiers, ButtonWith...) as whole combos when
`InputSettings.shortcutKeysConsumeInput` is on, part by part when it is off.

Test: `test_04` (`InputBindingTests`), `test_16`, `test_17`, `test_offline.py::test_rebind_audit`.
Result: pass (final run 2026-09-24). Layering: a file with Jump on K loaded with the default wiped
an earlier Interact override (back to E); with `removeExisting: false` Interact kept F. Shortcuts:
`shortcutKeysConsumeInput` defaults to false in Input System 1.20; with it on, Shift+B fired ShiftB
only; with it off, Shift+B fired both ShiftB and B. Duplicates: Interact rebound to B next to
DropAll = Shift+B was accepted with the setting on and rejected (conflict DropAll) with it off; I
was rejected (Inventory) in both; a second Shift+B combo was rejected. Generated class: two
`new ArchControls()` and the project-wide asset were three different `InputActionAsset` instances; a
K override on one left the other two on Space, so the whole game must share one instance. Sample:
the 1.20 "Rebinding UI" sample imported headlessly to
`Assets/Samples/Input System/1.20.0/Rebinding UI` and compiled with zero errors and warnings (then
parked in `archive/`); its code already disables the action MAP, re-enables it and disposes the
operation (samyam's 2021 fix one is in), but it has no Escape cancel (a timeout and a cancel button
instead), no mouse exclusions, no duplicate check (a `SwapBinding` helper only) and no Reset All
clearing its PlayerPrefs key: import it for the UI, route its rebind through `RebindFlow` rules or
patch those four.
