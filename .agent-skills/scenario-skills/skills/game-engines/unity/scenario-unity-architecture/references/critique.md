# Critique rubric: how the architect judges its own output

Score every item pass, warn or fail, with the evidence next to it (job id, NUnit totals, audit
counts, file excerpt). A fail blocks delivery. Mostly measurable: this domain has few visual gates.

## 1. Data versus state

- [ ] ScriptableObjects hold definitions only. No runtime code assigns fields of an SO asset (lint
      `so.runtime_write_hint`, review), or the type is an explicit runtime-state SO that resets
      itself at SubsystemRegistration and is never used as a save.
- [ ] Saves are files under `Application.persistentDataPath` with a `version` field, ids (never
      asset names or instance ids), atomic write with a backup, and a migration for every older
      version. Evidence: a round trip that crosses a process boundary (A3) and, when persistence
      matters, a player relaunch (A4).
- [ ] In-memory SO guard in the process that plays: `ArchPlayMode` `so_guard` shows
      `so_changed_in_memory == []` for the definition folders, and
      `PrefabIsolationTests.EveryPrefab_LeavesDefinitionsUntouchedInMemory` passes. `SnapshotAssets`
      `changed_on_disk == []` only proves editor tools did not save assets; it cannot see a
      Play-mode write (A4, A11).
- [ ] Runtime modifiers apply to a struct copy of the definition (`config.Stats`), never to the
      asset (Tarodev [00:11:18]).
- [ ] Live registries (saveables, targets, enemies) are runtime sets, not `FindObjectsByType` or
      tags (Hipple [00:40:06]).
- [ ] Item ids are unique (`ItemDatabaseValidator`), and a duplicated asset is caught by a test.

## 2. Lifecycle and Enter Play Mode

- [ ] The Enter Play Mode setting was READ (ProjectFacts) and written into the plan; if domain
      reload is off (or the project will move to 6.6, where "Reload Scene only" is the default for
      new projects), `StaticStateAudit` shows no `arch.static_without_reset` in the project's own
      assemblies.
- [ ] `DoublePlay` in the project's setting: session 2 values equal session 1 values for every
      watched static and subscriber count.
- [ ] Static handlers unregister on `ExitingPlayMode` (Manual best practice; `#if UNITY_EDITOR`
      hook), values reset at SubsystemRegistration; `[ExecuteAlways]` code resets on entry instead.
- [ ] Startup timing is measured with scene reload ON (disabled scene reload makes Editor startup
      unrepresentative); nobody assumes "fast Play" removes the domain reload of a script change
      (Manual).
- [ ] Every `+=`, `Register`, `Enable()` in `OnEnable` has its removal in `OnDisable`; listeners
      that can sit under a destroyed root also remove in `OnDestroy` (idempotent).
- [ ] No reliance on `Update` order between instances of one script; cross-script order through
      `[DefaultExecutionOrder]` only where needed, documented. The composition root carries
      `[DefaultExecutionOrder(-1000)]` (observed: without it a consumer created first found nothing,
      A14).
- [ ] Editor API in runtime files only inside `#if UNITY_EDITOR` (lint
      `editor.setdirty_in_runtime`).

## 3. Async

- [ ] Every awaited loop takes `destroyCancellationToken` (objects), `Lifetime.Linked(this)`
      (objects doing IO that must also stop at exit) or `Application.exitCancellationToken` (plain
      C# services); `OperationCanceledException` caught where expected. A PlayMode test destroys the
      owner mid-await and sees no further tick (lint `async.loop_without_token`).
- [ ] No Awaitable awaited twice (AsTask for fan-out; lint `async.double_await`); no `.Result`,
      `.Wait()`, `GetAwaiter().GetResult()` on the main thread; no `Task.Delay` or threads in
      Web-targeted code (lint `async.*`).
- [ ] Unity API only on the main thread (lint `async.unity_api_off_main_thread`); heavy CPU work in
      jobs rather than hand-rolled threads; threading smoke-tested in a DEVELOPMENT player (A12: the
      release player hid four violations).
- [ ] Async tests: a `[UnityTest]` returning the inner `async Awaitable` as its IEnumerator, or an
      `async Task` test (Test Framework 1.6, observed).
- [ ] No per-object `while(true) await NextFrameAsync()` loops on many objects: the Manual warns
      that one on every GameObject of a large project "is likely to cause performance problems"; use
      a central manager and measure with the Profiler (scenario-unity-performance).

## 4. Input

- [ ] Project-wide actions assigned (`ArchInputAudit`: `project_wide: true`), every gameplay action
      has a Keyboard&Mouse and a Gamepad binding, no duplicate path inside a map and scheme, gamepad
      buttons bound by position.
- [ ] Actions resolved once (no `FindAction` in Update), "Map/Action" for duplicated names, maps
      switched for context (pause = UI map).
- [ ] Rebinding: action disabled during the operation and re-enabled on complete and cancel; Escape
      cancels; mouse buttons excluded on keyboard rows; duplicates rejected with the previous
      override restored; operation disposed; overrides saved as JSON to a file, loaded before maps
      are enabled; Reset All removes overrides AND the file. Each point has an `InputTestFixture`
      test.
- [ ] Local multiplayer reads `playerInput.actions`; a test pairs one virtual gamepad per player and
      checks isolation.
- [ ] No legacy `UnityEngine.Input` in an Input-System-only project (lint `input.legacy_input`).
- [ ] Tests and tools resolve the actions asset by the project-wide configuration, never
      `InputSystem.actions` after fixture tests nor "the first `.inputactions` found".
- [ ] Overrides from several sources are layered with `LoadBindingOverridesFromJson(json, false)`;
      no `CallbackContext` stored past its callback (lint).
- [ ] Modifier shortcuts (Shift+B next to B): Complexity-Based Shortcut Resolution decided and set
      (1.20 default off), and the duplicate check follows it (RebindFlow rule 7).
- [ ] A generated C# input class is instantiated ONCE and shared (each `new` is a separate asset,
      A15).
- [ ] When the Rebinding UI sample is used: `ut_arch.rebind_audit` on its scripts shows the four
      gaps patched (Escape cancel, mouse exclusions, effectivePath duplicates, reset clearing
      persistence).

## 5. Structure, dependencies, patterns

- [ ] Assemblies: a Core with `noEngineReferences` (engine_refs 0), a Runtime, an Editor-only
      assembly, EditMode and PlayMode test assemblies; `AssemblyGraph.violations == []` for the
      project's asmdefs (no runtime asmdef references an editor asmdef); zero compile warnings
      (`compile_warning_codes == {}`).
- [ ] Composition over inheritance: no class derives from a concrete MonoBehaviour subclass; no
      `isPlayer`-style flags switching whole code paths; components own one responsibility.
- [ ] The dependency mechanism matches the team: serialized SO references when designers wire
      behavior; a composition root plus interfaces when programmers own it; static singletons only
      for a small, short project, with resets. Missing dependencies fail loudly at startup.
- [ ] Each gameplay prefab runs alone in an empty scene (a PlayMode test instantiates it and asserts
      no error log) [Hipple test].
- [ ] One MonoBehaviour or ScriptableObject per file named like the class; serialized enums have
      explicit values (or SO "enums" when designers extend the set); renamed fields carry
      `[FormerlySerializedAs]`, renamed `[SerializeReference]` classes `[MovedFrom]` (A13: without
      it the entry loads as null), and every `[SerializeReference]` type is `[Serializable]` (lint;
      required from 6.4 per the version notes).
- [ ] Every event channel and service has a debug surface: listener count, raise count, a log
      toggle, `RaiseDebug()` callable from an editor script (`ArchPlayMode` "invoke") and an
      inspector button; listeners iterate backwards (lint `events.forward_listener_iteration`);
      UnityEvents only for rare designer-wired responses (lint `events.unityevent_per_frame`).

## 6. Project and version control

- [ ] Force Text and Visible Meta Files (SetVcsSettings reads them back from ProjectSettings);
      `meta_audit.ok`; no spaces in asset paths; own content under one project folder.
- [ ] `.gitignore` covers Library, Temp, Obj, Logs, UserSettings, Builds,
      `*_BurstDebugInformation_DoNotShip`; `.gitattributes` routes binaries to LFS by extension
      (check-attr shows `.meta` not in LFS) and `.unity`/`.prefab` to the UnityYAMLMerge driver, no
      `*.asset` line.
- [ ] Merges: exit code checked (2 means a conflict even when `-l`/`-r` resolved it); the merged
      file opened in Unity (`InspectAsset`) and compared with both sides; for scenes, a camera
      capture before and after (scenario-unity-expert `AgentCapture`).
- [ ] Parallel agents: one git worktree and one editor per agent; never two Unity processes on one
      folder.

## 7. Report honesty

- [ ] Each claim in the handoff names the Unity call and its evidence (Verified) or is listed under
      Assumed. A test that passed alone but not in the suite is reported as such (the
      `InputSystem.actions` null trap).
