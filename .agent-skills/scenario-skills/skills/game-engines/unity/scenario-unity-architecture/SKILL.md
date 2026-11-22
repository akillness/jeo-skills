---
name: scenario-unity-architecture
description: "Use when structuring Unity 6.3 C# code: ScriptableObject data vs runtime state, events and services, inventory, health, save and load, Input System actions and key rebinding, async with Awaitable, assembly definitions, Enter Play Mode and domain reload, .meta files, Git, Smart Merge and LFS. Also when 'my save works in the Editor but not in the build', statics keep values on the second Play, events fire twice or never, an await runs after its object died, rebinds are lost on relaunch, a renamed class loses its data, a scene merge breaks."
license: MIT
---

# Unity architecture (gameplay programmer / architect)

Expert architecture in Unity is judged by what survives the edges: the second Play session, a
destroyed object mid-await, a relaunch of the built player, a class rename, a merge of two branches,
a prefab dropped into an empty scene. Data lives in assets, state lives in plain C# and files,
systems talk through events they do not own, and every claim is pinned by a test the agent can run
without a mouse. Target: Unity 6000.3.21f1, Input System 1.20.0, Test Framework 1.6.0, macOS. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Toolkit:
`ut_env`, `ut_run`, `ut_live` plus this skill's [`scripts/ut_arch.py`](scripts/ut_arch.py),
[`scripts/AgentKit/Architecture/`](scripts/AgentKit/Architecture/) jobs and
[`scripts/templates/`](scripts/templates/) (a tested Game.Core / Game.Runtime / Game.Editor / tests
layout).

**Status (2026-09-24):** every procedure ran in Unity 6000.3.21f1 on this Mac:
`tests/code/unity-architecture/run_all.sh --live` (results in
`archive/tests/unity-architecture/live_results.jsonl`).

## Stance (the expert delta)

1. **ScriptableObjects are definitions, never saves.** Play-mode writes to an SO persist in the
   Editor and reset on every launch of a build (Code Monkey, 5a-ztc5gcFw [00:04:17]). Observed
   sharper: the write lives only in Editor memory (`IsDirty` false, the `.asset` unchanged even
   after `SaveAssets`), so a file hash never sees it; only an in-memory guard in the process that
   plays does (`so_guard`, the prefab SO test). A macOS player run twice started from the baked
   value while the save FILE carried over. Runtime modifiers apply to a struct copy (`config.Stats`,
   Tarodev, tE1qH8OxO2Y [00:11:18]); live registries are runtime sets, never scene searches (Hipple,
   raQ3iHhE_Kk [00:40:06]). Saves: versioned JSON of ids, atomic write, backup, migrations.
2. **Read Enter Play Mode before trusting any Play test.** With domain reload off (an option in 6.3,
   the default for new 6.6 projects) a static counter read 2 and a static event had 2 subscribers on
   the second Play (observed). Unregister static handlers on `ExitingPlayMode` (the Manual's best
   practice; observed clean on its own) and reset values at `SubsystemRegistration`; `DoublePlay`
   proves both. Scene reload off makes Editor startup unrepresentative, and a script change still
   reloads the domain (6.3 Manual).
3. **Every await has an owner.** Awaits survive Destroy and Play exit (Unity, eXkFPoEp3BA
   [00:13:28]): a token-less loop ticked 13 to 14 more times in the 0.3 s after `Destroy`
   (observed). MonoBehaviours pass `destroyCancellationToken` (`Lifetime.Linked(this)` when IO must
   also stop at exit); plain C# services pass `Application.exitCancellationToken`. Never await an
   Awaitable twice (pooled: `AsTask()`), never block on a Task. Release players skip the main-thread
   check: off the main thread a development player threw on `persistentDataPath`, `Time.time`,
   `transform` and `new GameObject`, the release player threw nothing (observed). Smoke-test
   threading in a development build.
4. **Designers wire, code decides.** Serialized SO references are the injector designers can see
   (Hipple [00:14:39]). Channels decouple sender and receivers, iterate listeners backwards
   ([00:33:23]) and ship a debug plan: counts, a log toggle, `RaiseDebug()` from a job, an inspector
   button ([00:36:07]). UnityEvent is a serialized function call ([00:29:26]): rare designer-wired
   responses only (0 B per invoke measured on 6.3, but targets are hard references resolved by
   method name). One composition root runs first (`[DefaultExecutionOrder(-1000)]`, git-amend,
   PJcBJ60C970 [00:12:01]; without it a consumer found nothing, observed) and fails loudly. Each
   prefab runs alone in an empty scene ([00:16:29]). Statics suit a small solo project only
   (Weimann, hQE8lQk9ikE [00:01:28]; Tarodev [00:03:00]), with resets. Enums only for sets fixed "by
   some law"; categories designers extend become SO assets ([00:46:39]).
5. **Rebinding is a state machine with six traps.** The action must be disabled (the package throws
   otherwise); Escape does not cancel a Button rebind by default; a composite head cannot be
   rebound; duplicates are judged on `effectivePath`, composite parts only against earlier parts,
   modifier combos per `shortcutKeysConsumeInput` (off by default: Shift+B also fires B); Reset All
   deletes the persisted overrides; `LoadBindingOverridesFromJson` wipes existing overrides unless
   passed `false` (samyam, csqVa2Vimao [00:12:51], [00:27:44], [00:33:22]; 1.20 manual; all tested).
   For the UI, start from the Rebinding UI sample: in 1.20 it already disables and disposes but
   lacks four fixes (`ut_arch.rebind_audit`). Each `new` of a generated input class is a separate
   asset: share one.
6. **Assemblies are a contract.** A Core with `noEngineReferences` holds rules testable in
   milliseconds; runtime asmdefs never reference editor ones (the Editor compiles it, the player
   build fails, observed). Test asmdefs reference `Unity.InputSystem.TestFramework`; `testables` was
   not needed on 6000.3.21f1 (observed).
7. **Serialized data survives refactors and merges only on purpose.** `[FormerlySerializedAs]` for
   fields, `[MovedFrom]` for renamed `[SerializeReference]` classes (without it the entry loaded as
   null, observed), `[Serializable]` on every `[SerializeReference]` type (6.3 tolerated its
   absence; 6.4 requires it per the version notes). UnityYAMLMerge exits 2 on any conflicted field
   even with `-l`/`-r`, and without them writes the BASE value (observed): check the exit code, then
   open the result in Unity.

## Establish first

Team shape (who wires behavior: designers or programmers), project lifetime, target platforms (Web
has no managed threads), Enter Play Mode setting, input devices (keyboard-mouse, gamepad, touch,
local multiplayer) and modifier shortcuts, save needs (slots, cloud, migrations), VCS (Git + LFS by
default). Defaults: project-wide actions, Game.Core/Runtime/Editor/Tests asmdefs, SO definitions +
plain C# state, event channels between systems, runtime sets for registries, one `GameRoot`, JSON
saves under `persistentDataPath`, Git with the UnityYAMLMerge driver. Run `ArchJobs.ProjectFacts`
and write its answers into the plan.

## Workflow

1. **Scaffold and compile.** Goal: rules in pure C#. How: `ut_arch.install(P)`,
   `ut_arch.scaffold(P)` (A1), then `ArchJobs.ProjectFacts`
   (`Unity -batchmode -nographics -quit -executeMethod AgentKit.Architecture.ArchJobs.ProjectFacts`).
   GATE: zero compile errors and warnings; `ArchJobs.AssemblyGraph`: Game.Core `engine_refs == 0`,
   `violations == []`.
2. **Data as assets.** Goal: definitions designers edit. How: `ArchJobs.CreateAssets` with
   `ut_arch.item_specs()` (`SerializedObject` edits, `managed_refs` for `[SerializeReference]`
   lists, SetDirty only on change) (A2, A13). GATE: second run all `unchanged`;
   `ItemDatabaseValidator` clean.
3. **Core systems with tests.** Goal: inventory, health, events, sets. How: templates;
   `ut_run.run_tests(P, "EditMode", assemblies="Game.Tests.EditMode")`. GATE: all pass;
   `ut_arch.code_lint` no warn or error in runtime code (A10).
4. **Save and load.** Goal: state that survives relaunch. How: `SaveService` (A3). GATE: EditMode
   round trip, corrupt-file fallback, v1 migration; `CrossProcessSave` across two editor processes;
   a player run twice for persistence claims (A4); a development player when saves touch threads
   (A12).
5. **Input.** Goal: every device, rebinding that persists and resets. How: project-wide actions,
   `InputContext`, `RebindFlow`, `BindingStore`, `.inputactions` edited as JSON;
   `ArchInputAudit.Audit` (A5, A15). GATE: `InputTestFixture` tests per trap; audit without
   `missing_scheme` or `duplicate_binding`; `rebind_audit` missing nothing.
6. **Async and lifecycle.** Goal: no orphan work. How: `async Awaitable Start()` with a token,
   `AsTask`, PlayMode suite; async tests as a `[UnityTest]` returning the inner Awaitable, or
   `async Task` (A6, A7, A14). GATE: no tick after Destroy; prefab isolation and prefab SO guard
   pass.
7. **Play-mode hardening.** Goal: session 2 equals session 1, events reach responses. How:
   `ArchJobs.StaticStateAudit`, then `ArchPlayMode.DoublePlay` with `so_guard` and `invoke`
   (`RaiseDebug` on each channel) in the project's mode (A8, A11). GATE: no
   `arch.static_without_reset` in own assemblies; watched values equal across sessions;
   `so_changed_in_memory == []`; every invoke `ok` with its response counted.
8. **Version control.** Goal: merges and moves never break references. How:
   `ArchJobs.SetVcsSettings`, `ut_arch.write_vcs_files`, `git_setup_unity_merge`, `meta_audit`,
   `yaml_merge`, then `ArchJobs.InspectAsset` (A9). GATE: `meta_audit.ok`; `.meta` not in LFS; clean
   merges exit 0 and deserialize; conflicts stay unmerged with a report.
9. **Hand off with evidence** (scenario-unity-expert report format): Unity call per step, Verified,
   Assumed.

## Numbers

| Value                           | Relative to                                                                               | Source                        |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| 11 to 13 s                      | one batch job on this project (editor boot included)                                      | observed                      |
| about 11 s / 16 s               | EditMode suite (33 tests) / PlayMode suite (17 tests), final run                          | observed                      |
| 13 to 14 ticks                  | token-less 0.02 s Awaitable loop in the 0.3 s after `Destroy`                             | observed                      |
| 2 / 2                           | static counter / static event subscribers in Play session 2, domain reload off            | observed                      |
| 4 of 6 / 0 of 6                 | Unity calls that threw off the main thread in a development / release macOS player        | observed                      |
| 0 B                             | heap growth over 10,000 channel raises or persistent UnityEvent invokes after warm-up     | observed                      |
| about 37,000 to 61,000 fps      | batch `-nographics` Play mode (uncapped): wait on time, not frames                        | observed                      |
| 0.05 s; false                   | `PerformInteractiveRebinding` `OnMatchWaitForAnother`; `shortcutKeysConsumeInput` default | package source 1.20; observed |
| next `Update` (33 ms at 30 fps) | Task continuation started on the main thread                                              | 6.3 Manual                    |
| about 500 KB                    | binary size above which Git LFS pays                                                      | Pettersen 2016                |
| exit 0 / 2                      | UnityYAMLMerge clean / any conflicted field (also with `-l`, `-r`)                        | observed                      |
| 114.7 MB / 311.2 MB             | macOS Mono release / development player of a probe scene                                  | observed                      |

## Quality gates

- **Measurable:** zero compile errors and warnings; `AssemblyGraph.violations == []`; EditMode and
  PlayMode `failed == 0` in the full suite, not only single tests; `code_lint` no warn or error in
  runtime code; `so_guard` and the prefab SO test clean (`SnapshotAssets` `changed_on_disk == []`
  only proves editor tools saved nothing); `StaticStateAudit` clean; `DoublePlay` sessions equal;
  `ArchInputAudit` warn 0; `rebind_audit` complete; `meta_audit.ok`; merge exit codes checked;
  player relaunch report (A4) and development-player report (A12) when persistence or threads are
  claimed.
- **Visual (few):** after a scene merge, a camera capture before and after (scenario-unity-expert
  `AgentCapture`); a rebinding screen shows the new binding text (scenario-unity-ui).

## Common mistakes

| Mistake                                            | What it looks like                                    | Fix                                                                  |
| -------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| save stored in an SO                               | works in the Editor, lost after relaunch of the build | `SaveService` file; SO read-only (A3, A4)                            |
| SO guard by file hash                              | passes while Play writes an SO                        | `so_guard` / prefab SO test in the playing process (A11)             |
| session state in an unreferenced SO                | value back to baked after a scene load, in the build  | keep it referenced or hold it in C#                                  |
| statics with domain reload off                     | second Play starts at 2, handler runs twice           | ExitingPlayMode unregister + SubsystemRegistration reset             |
| await without token                                | logic runs after the object died or Play ended        | `destroyCancellationToken`, `Lifetime.App` for services              |
| awaiting an Awaitable twice                        | exception or hang                                     | `AsTask()` once                                                      |
| threads checked in a release build only            | fine now, undefined later                             | development player smoke test (A12)                                  |
| listeners iterated forward                         | a self-removing response skips the next               | iterate backwards                                                    |
| composition root without execution order           | a consumer's Awake finds no service                   | `[DefaultExecutionOrder(-1000)]`                                     |
| rebinding an enabled action                        | `InvalidOperationException`                           | `RebindFlow` disables, re-enables on complete and cancel             |
| Button rebind without `WithCancelingThrough`       | Escape becomes the binding                            | `.WithCancelingThrough("<Keyboard>/escape")`                         |
| Reset All keeps the file; loads not layered        | old rebinds return; earlier overrides vanish          | `BindingStore.ResetAll`; `Load(..., removeExisting: false)`          |
| `InputSystem.actions` in tests or with PlayerInput | null after fixture tests; pairing breaks              | `EditorBuildSettings.TryGetConfigObject(...)`; `playerInput.actions` |
| a generated input class per consumer               | a rebind shows on one screen only                     | one shared instance                                                  |
| runtime asmdef references editor asmdef            | Editor fine, player build fails                       | `AssemblyGraph` explicit-reference check                             |
| class renamed behind `[SerializeReference]`        | entries load as null                                  | `[MovedFrom]` in the same change                                     |
| trusting a merge output                            | conflicted field silently back to base                | check exit 2, resolve, `InspectAsset`                                |

## Handoffs

- **Receives from** scenario-unity-expert: brief, channel, project facts. From
  scenario-unity-gameplay: which systems need health, damage, state machines (the FSM pattern lives
  there).
- **Delivers to** scenario-unity-ui: `RebindFlow`, `BindingStore`, `InputContext`, channels (with
  `RaiseDebug`) for HUD and settings screens, with tests. To scenario-unity-gameplay: `IDamageable`,
  `Health`, `Services`, `GameRoot`, runtime sets. To scenario-unity-pipeline-automation: asmdef
  layout, `run_tests(..., assemblies=...)`, development builds, `.gitignore`/`.gitattributes`, merge
  driver. To scenario-unity-performance: GC per frame (scenario-unity-expert `AgentProfile`),
  per-object Awaitable loops. To scenario-unity-web: no managed threads (SaveAsync stays
  synchronous, no `Task.Delay`). To scenario-unity-mobile: touch schemes, `persistentDataPath`.
  Packet: files written, tests with totals, audits with counts, Verified and Assumed.

## Unity 6.3 notes

- Enter Play Mode is a dropdown ("When entering Play Mode"); 6.6 new projects default to "Reload
  Scene only"; 6.5 adds code lifecycle attributes and `AutoStaticsCleanup`.
- `FindObjectsByType<T>(FindObjectsSortMode.None)` (the sort mode is obsolete from 6.4);
  `[SerializeField]` only on fields; `GetInstanceID` becomes a compile error in 6.5 (`EntityId`);
  `[SerializeReference]` types must be `[Serializable]` from 6.4 (version notes, unverified there).
- Templates run the Input System only (legacy `Input.*` throws); Input System 1.20 bundled;
  `OnMouseDown` works with it only from 6.4.
- `Object.Destroy`: verified live on 6000.3.21f1 (`LifecycleTests`, 2026-09-24) that `OnDisable`
  reaches every descendant (four levels); the 6.4 upgrade guide and the version notes describe
  pre-6.4 editors as "only direct children", so keep the idempotent `OnDestroy` unregistration for
  older editors.
- Force Text and Visible Meta Files are the 6.3 defaults (observed); 6.6 turns YAML word wrap off
  and removes "Reduce Version Control Noise".

## References

- [`references/procedures.md`](references/procedures.md): A1 to A15 with full code, live test and
  recorded result.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  decision tables, every observation.
- [`references/critique.md`](references/critique.md): the self-review rubric.
- [`references/gui-paths.md`](references/gui-paths.md): menus and windows for the same tasks.
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, best timestamps,
  revision history.
- `scripts/ut_arch.py`, `scripts/AgentKit/Architecture/*.cs`, `scripts/templates/`: the tested code.
