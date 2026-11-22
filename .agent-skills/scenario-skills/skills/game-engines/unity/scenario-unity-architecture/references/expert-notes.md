# Expert notes: principles and judgment by source

Citations: video id `[hh:mm:ss]`, or the saved doc page and section. `observed` = run on this Mac in
Unity 6000.3.21f1 on 2026-09-24 (procedures.md). `[added]` = this skill's own inference. Where
experts disagree, the deciding condition is given.

## 1. Ryan Hipple (Schell Games), "Game Architecture with Scriptable Objects", Unite 2017 (raQ3iHhE_Kk)

- Three pillars for every structural choice: modular, editable, debuggable [00:02:39]. Scenes are
  clean slates, prefabs work alone in an empty scene [00:03:12], [00:04:19].
- Singletons create rigid connections, kill polymorphism and block isolated tests [00:09:15],
  [00:11:58]. His team "pretty much completely rebuilt our game inside of our debug scene" chasing
  manager dependencies [00:16:29]. Test: drop each prefab into an empty scene and press Play.
- The Inspector is already a dependency injector: serialized references to assets instead of
  fetching managers [00:14:39]; DI frameworks hide wiring from designers [00:58:17].
- SO variables (`FloatVariable` + `FloatReference` with a use-constant toggle and a property drawer)
  let a health bar, a heartbeat sound and AI read one asset without knowing each other [00:19:11],
  [00:23:29]. Reset runtime state at startup; the studio keeps an index of variables to reset
  because Play-mode writes persist in the Editor [00:24:36], [01:03:47].
- SO game events: listener list, `Raise()` iterates backwards so a response can unregister itself
  [00:33:23]; listener component registers in `OnEnable`, unregisters in `OnDisable` [00:34:29]; a
  Raise button on the asset is the debug plan [00:36:07], with invocation logs and listener lists in
  the studio's debugger [00:55:31]. Fix late wiring bugs with data (one listener component) instead
  of code [00:37:14]. Shipped: `EventChannelBase` counts and `logRaises`, `RaiseDebug()`,
  `EventChannelEditor`, and `ArchPlayMode` "invoke" to fire a channel from a job (procedures.md
  A11).
- UnityEvent is "a serialized function call", not an event: the sender hard-references receivers
  [00:29:26]; the Inspector edits one argument of a primitive, string or Object type [00:31:41]; it
  resolves targets by string and allocates, so never per frame [00:32:15]. Observed on 6000.3.21f1:
  after one warm-up call, 10,000 persistent-UnityEvent invokes grew the managed heap by 0 B (as did
  a channel Raise), so the 2017 allocation claim did not reproduce in steady state; the design
  reasons stand (hard references, targets resolved by method name, silent after a rename), and so
  does "not per frame" for traceability. Channel listeners are C# delegates; a `VoidEventListener`
  turns a raise into a designer-wired UnityEvent response.
- Runtime sets replace tags, `Find` calls and manager registration races, because the SO exists as
  soon as it is referenced [00:40:06], [00:40:40]; objects add themselves in `OnEnable`, remove in
  `OnDisable` [00:43:27]. Shipped: `RuntimeSet<T>`, `SaveableSet`, `SaveableEntity` (A14). SO
  "enums" (an Element asset that knows what it beats) replace enums unless the set is fixed "by some
  law"; serialized enums break when entries are deleted or reordered [00:46:05], [00:46:39].
  Deciding condition for damage kinds: a fixed list the code switches on, enum with explicit values
  (the template's `DamageKind`); a list designers extend with data per entry (resistances, effects),
  SO assets [added from [00:47:50]].
- One SO asset per item keeps diffs small [00:52:45]; whole systems (an Inventory SO) can be assets
  referenced by the player, the UI and NPCs [00:51:40]. Honest cost: "you cannot trace it all
  through code" [01:00:30].

## 2. Code Monkey (Hugo Cardoso), "Be CAREFUL with Scriptable Objects!" (5a-ztc5gcFw)

- SOs are read-only data at runtime [00:00:00]. Play-mode writes persist in the Editor after
  stopping; in a build they live in memory and the next launch starts from the baked values
  [00:04:17], [00:05:22]. "Not a bug, the exact intended behavior" [00:04:51]. Real saves: a plain
  class serialized to a file with JsonUtility [00:06:26].
- Observed, sharper than the video: in the Editor the SO field kept the Play-mode value across two
  Play sessions in both "Reload Scene only" and "Reload Domain and Scene", `EditorUtility.IsDirty`
  stayed false and the `.asset` on disk never changed, even after `AssetDatabase.SaveAssets()`. The
  change lives in Editor memory only, so it also disappears when the editor restarts, unless
  something dirties and saves that asset (an Inspector edit, `SetDirty`).
- Observed in a macOS player run twice: the save file carried the run counter over, the SO came back
  at its baked value. Inside one run, an SO referenced only by scene objects lost its in-memory
  value across a single-mode scene load (unloaded and reloaded from disk, same instance id), while
  an SO referenced by a DontDestroyOnLoad object kept it. So Hipple's session-state SOs hold only
  while something keeps them referenced.
- Editor tools that write SOs must `EditorUtility.SetDirty` (and `AssetDatabase.SaveAssets` in batch
  mode) [00:06:26].

## 3. Unity Technologies, 6.3 Manual (script lifecycle, Enter Play Mode, domain and scene reload)

- With domain reload disabled, static fields and static event subscribers survive Play sessions;
  reset them at `RuntimeInitializeLoadType.SubsystemRegistration`, and unregister static handlers on
  `ExitingPlayMode`, which the Manual calls best practice because waiting for the next entry "can
  cause object reference issues that lead to unregistering the wrong handler"; reset on entry is the
  fallback for code that also runs in Edit mode (domain-reloading, "Resetting state"). Observed: a
  static counter read 2 and a static event had 2 subscribers in the second session; the same class
  with a SubsystemRegistration reset read 1 and 1; a static event cleared only by an
  `#if UNITY_EDITOR [InitializeOnLoadMethod]` hook on `PlayModeStateChange.ExitingPlayMode` also had
  1 subscriber in session 2 (A11). `StaticStateAudit` reports such hooks as
  `arch.static_reset_exit_hook` (reflection cannot read the body: prove it with DoublePlay).
- Disabled scene reload makes Editor startup unrepresentative; re-enable before profiling startup
  (scene-reloading). Domain reload still happens on script changes (domain-reloading, Note).
- `sceneLoaded` fires after `OnEnable` and before `Start`; instances of one script have no
  guaranteed order, parent or child included (execution-order).
- `[ExecuteAlways]` scripts get no `Awake`/`OnDestroy` with scene reload off and no extra
  `OnEnable`/`OnDisable` with domain reload off: initialize in `OnEnable` guarded by
  `EditorApplication.isPlaying` (scene-reloading).
- Private fields reset through the Editor's hot reload even with both reloads off; null private
  arrays and Lists become empty after a domain reload (scene-reloading).
- The Manual's own samples use legacy `Input.anyKeyDown` and one calls `EditorApplication` outside
  `#if UNITY_EDITOR` [added from the doc note]: never paste them into an Input-System-only project
  unchanged.

## 4. Unity Technologies, 6.3 Manual (Awaitable) and "Getting Started with Awaitables" (eXkFPoEp3BA)

- Awaitables are pooled: never await one instance twice; `AsTask()` for multi-await or `WhenAll`
  (introduction; video [00:17:50]). Observed: `AsTask` allowed two awaits and `Task.WhenAll`.
- `async` never creates a thread; only `BackgroundThreadAsync` switches; Unity API on the main
  thread [00:09:35], [00:12:54]. Observed: `SaveAsync` hopped to a background thread for the write
  and resumed on the main thread id.
- Awaits are not canceled on Destroy nor on Play exit [00:13:28]: use `destroyCancellationToken`
  (and `Application.exitCancellationToken` for code not tied to an object), catch
  `OperationCanceledException` [00:15:05]. Observed: a token-less loop ticked 13 to 14 more times in
  0.3 s after `Destroy` (three runs); the same loop with `destroyCancellationToken` stopped at once.
  At Play exit both tokens fired.
- Observed nuance on exit (batch editor): a token-less `Awaitable.WaitForSecondsAsync` loop stopped
  ticking once Play mode ended and did not resume in the next session, while a token-less
  `Task.Delay` loop kept ticking in Edit mode (+14 ticks in 1.5 s) and, with domain reload off, ran
  twice in the next session. The Manual's warning ("Unity doesn't automatically stop code running in
  the background") applies to Task and thread work; tokens are still required for Destroy.
- Non-development builds skip the main-thread check: smoke-test threading in development builds
  (continuations). Observed (A12): off the main thread, a development player threw
  `UnityException ... can only be called from the main thread` for `Application.persistentDataPath`,
  `Time.time`, `transform.position` and `new GameObject`, and let `JsonUtility.ToJson` and
  `Debug.Log` through; the release player threw nothing, even while creating a GameObject off the
  main thread. Task continuations started on the main thread wait for the next `Update` (33 ms at 30
  fps) (continuations).
- Plain C# code with no GameObject (a save service) has no `destroyCancellationToken`: pass
  `Application.exitCancellationToken`; a MonoBehaviour doing IO links both (video [00:15:05];
  `Lifetime.Linked`, A14). Observed: the exit token fires at each Play exit and is live again in the
  next session (A8 data).
- A `while (true) await NextFrameAsync()` loop on every GameObject "is likely to cause performance
  problems": use a central manager at scale (introduction).
- Test Framework methods cannot return `Awaitable`; return the inner Awaitable from a
  `[UnityTest] IEnumerator` ("Asynchronous tests"). Observed: `async Task` test methods also run in
  Test Framework 1.6.

## 5. Tarodev, "Async Await vs Coroutines" (WY-mk-ZGAq8) and "Architecture for Noobs" (tE1qH8OxO2Y)

- Returning values and `WhenAll` barriers are the async wins over coroutines [00:11:01], [00:06:33].
  His `GetAwaiter().GetResult()` from sync code [00:14:21] can deadlock the main thread, because the
  continuation needs the next `Update` [added from the Manual]. Task-based async fails on WebGL
  [00:15:10]: no managed threads on Web (6.3 Web limits).
- Small-game skeleton: five hierarchy roots, one persistent Systems root (the only
  DontDestroyOnLoad) [00:01:57]; SO unit data with a Stats STRUCT copied before runtime modifiers so
  definitions stay untouched [00:06:43], [00:11:18] (shipped: `HealthStats`, `HealthConfig.Stats`,
  A14); enum game manager for "90%" of small games [00:05:02]. `Resources.LoadAll` registries are
  prototype-grade [added].
- Deciding condition vs Hipple: solo or small team and short project, static instances are
  acceptable (also Weimann, hQE8lQk9ikE [00:01:28]); multi-programmer, designer-driven, long-lived:
  SO references or injection. Either way statics need resets when domain reload is off.

## 6. Jason Weimann, "Composition or Inheritance?" (8TIkManpEu4) and "Six Design Patterns" (hQE8lQk9ikE)

- God classes with `isPlayer` flags are the default failure [00:02:44]. Inheriting from a
  non-abstract class is a smell [00:07:54]. Movement owns the act of moving, never the decision
  [00:10:21]; `[RequireComponent]` [00:10:54]; Health raises `OnDied` instead of destroying itself
  [00:12:02].
- Observer: `+=` in `OnEnable`, `-=` in `OnDisable`, `?.Invoke()` [00:07:05], [00:08:45]. Command
  queue for RTS orders and undo [00:12:04]. State is the most important pattern [00:21:16].
  Recognize patterns, do not force them [00:22:36].
- His flyweight fix (`MaterialPropertyBlock`) contradicts the 6.3 URP guidance (avoid MPB with the
  SRP Batcher and GPU Resident Drawer): route to scenario-unity-performance.

## 7. git-amend (Adam Myhre): Smart Merge and worktrees (F0Qk-Cyw6PA), DI (PJcBJ60C970), FSM (NnH6ZK5jt7o)

- UnityYAMLMerge resolves renames, component adds and removes and per-field edits; only same-field
  conflicts fall through [00:09:37]; verify by reloading the scene [00:10:43]. Omit `*.asset` from
  `.gitattributes` (description correction). Prefer the command line to Git GUIs [00:08:32].
- Observed, headless on this Mac: clean merge exit 0 (rename + added Rigidbody on one side, root
  position and collider size on the other, all kept); a same-field conflict exits 2 even with
  `-l`/`-r`, and without them the output file silently keeps the BASE value for that field. A Git
  merge driver with `-h --fallback none -o '%P.conflicts.txt'` merged the clean case inside
  `git merge` and left the conflicting case unmerged with a report.
- Worktrees: one per parallel branch, each with its own `Library/` (full first import) [00:11:42],
  [00:12:46]; `git worktree remove` fails while a tool holds the folder [00:13:51]. For agents: one
  worktree per agent, never two editors on one folder [added].
- DI: interfaces, fail loudly on missing dependencies, injector first with
  `[DefaultExecutionOrder(-n)]` [00:05:01], [00:12:01]. Observed (A14): `GameRoot` with
  `[DefaultExecutionOrder(-1000)]` registered its service before the Awake of a consumer created
  earlier, on activation and on scene load; the same pattern without the attribute left the consumer
  empty. Reflection injection needs stripping protection under IL2CPP [added].
- FSM: transitions evaluated before the state's update, any-transitions first, a self-transition
  guard, one combined condition instead of overlapping transitions [00:08:08], [00:18:42]; the
  Animator becomes a crossfade player. The FSM belongs to scenario-unity-gameplay.

## 8. samyam, "Persistent Control Rebinding" (csqVa2Vimao) and the Input System 1.20 manual

- Start from the Rebinding UI sample but patch it: disable the action first [00:12:51], exclude
  mouse buttons and pointer position [00:20:53], cancel through Escape [00:21:58], reject duplicates
  on `effectivePath` [00:28:53], compare composite parts only with earlier parts [00:27:44], Reset
  All must delete the persisted key [00:33:22]. Observed in the 1.20 sample (package source,
  imported headlessly with `ArchJobs.ImportSample`, A15): it now disables the action map, re-enables
  it and disposes the operation; the other four gaps remain (`ut_arch.rebind_audit`).
- Observed in the package source and live: `WithAction` throws "Cannot rebind action ... while it is
  enabled"; `PerformInteractiveRebinding` on a composite head throws; Escape is added as a cancel
  control only for non-Button actions, so a Button row without `WithCancelingThrough` binds Escape
  (reproduced); `OnMatchWaitForAnother` defaults to 0.05 s.
- Her duplicate check skips by action name, so clashes inside one action are missed; skip by binding
  id and restore the previous override on reject [added, tested].
- Manual: project-wide actions are the default workflow, `FindAction` once not per frame,
  `CallbackContext` valid only in the callback (lint `input.stored_callback_context`),
  `RebindingOperation.Dispose()`, `LoadBindingOverridesFromJson` removes existing overrides unless
  passed `false` (observed: an earlier override wiped by the default, kept with `false`),
  `playerInput.actions` not `InputSystem.actions` with PlayerInput. Observed: the second PlayerInput
  got its own actions copy and only reacted to its gamepad.
- Manual, binding-conflicts: B versus Shift+B is resolved by Complexity-Based Shortcut Resolution
  (`shortcutKeysConsumeInput`). Observed: false by default in 1.20; off, Shift+B fired both actions;
  on, only Shift+B. A rebind duplicate check must follow the setting (RebindFlow rule 7, A15).
- Generated C# class (samyam [00:03:12] avoided it for rebinding): each `new` wraps its own
  `InputActionAsset`, separate from the project-wide asset (observed: an override on one never
  reached the other two), so the game shares ONE instance or uses project-wide actions.
- Unity's Input System series (TiTKAseu17A, Cd2Erk_bsRY): one action name for every device
  [00:02:55]; bind gamepad buttons by position [00:02:55]; enable maps in `OnEnable`, switch maps
  for pause [00:02:16], [00:06:10]; duplicate names need "Map/Action" [00:05:38]; Value vs
  Pass-Through [00:04:00].

## 9. Unity Technologies: version control, project organization, prefabs (6.3 Manual, e-book, Pettersen 2016)

- A lost `.meta` re-GUIDs the asset: materials lose textures, objects lose scripts; move in the
  Editor or move the `.meta` too (AssetMetadata). Force Text + Visible Meta Files (both the 6.3
  defaults, observed). `EditorUtility.SetDirty` without a change check creates spurious diffs
  (Versioncontrolintegration).
- LFS by extension, never by folder (a folder rule drags `.meta` into LFS); binaries over about 500
  KB (Pettersen). Observed with `git check-attr`: `.png` to LFS, `.png.meta` not.
- No spaces in asset paths for command-line tools; own content in a project-named root; `.keep` in
  empty folders; split scenes and push work into prefabs (e-book). Instance overrides always win
  over the asset; recurring overrides become variants (PrefabInstanceOverrides).
- Game Dev Guide (mCKeSNdO_S0): `[SerializeReference]` keeps derived fields in a base-typed list
  [00:07:34]; `[FormerlySerializedAs]` for field renames, `[MovedFrom]` for class renames behind
  `[SerializeReference]` [00:11:38]; Play-mode backups in `Temp/` after a crash [00:03:31]; modal
  editor windows block automation. Observed (A13): a renamed class without `[MovedFrom]` loaded as
  null with a missing-type report; with it, the value came back; a type without `[Serializable]`
  still serialized on 6.3 (mark it anyway for 6.4); `JsonUtility` round-tripped a
  `[SerializeReference]` list in a plain class with type names in a `references` block.

## 10. Observed on this Mac (no expert source, 6000.3.21f1)

- `Object.Destroy` called `OnDisable` on all four levels of a hierarchy (root, child, grandchild,
  great-grandchild), then `OnDestroy` on all. The Upgrade to Unity 6.4 guide says "Previously,
  OnDisable was only invoked for components on the GameObject itself and its direct children"; this
  6.3 patch already behaves like 6.4. Keep unregistering in `OnDestroy` too (idempotent) for older
  editors.
- After any `InputTestFixture` test, `InputSystem.actions` returned null for later tests in the same
  run (Input System 1.20.0): a project-wide-actions test passed alone and failed in the suite. Read
  the configured asset with
  `EditorBuildSettings.TryGetConfigObject("com.unity.input.settings.actions", out InputActionAsset a)`.
  Same fix for helpers that take "the first `.inputactions` found": a second asset in the project
  silently changed what a multiplayer test exercised (zero resolved controls).
- `InputTestFixture` compiled and ran without `"testables": ["com.unity.inputsystem"]`; adding it
  makes the package's own IntegrationTests run in your PlayMode results.
- The Editor compiles a runtime asmdef that references an Editor-only asmdef (the player build is
  the one that fails: procedures.md A4), and lists auto-referenced editor assemblies
  (UnityEditor.UI) on runtime assemblies in the Editor compilation: judge explicit asmdef
  references.
- A MonoBehaviour or ScriptableObject saved in a scene or asset must live in a file named like its
  class [added: Unity requirement applied when splitting the channel and probe classes].
- Batch `-nographics` Play mode runs uncapped at roughly 37,000 to 61,000 frames per second: wait on
  time, not frame counts, in Play-mode jobs.
- `Object.Destroy` verified again in the final PlayMode run on 6000.3.21f1: `OnDisable` on every
  level (D0, D1, D3, D2), then `OnDestroy` on all; listeners unregistering only in `OnDisable` left
  0 entries.
- `GC.GetAllocatedBytesForCurrentThread` returned 0 for every measurement in this Mono editor;
  `GC.GetTotalMemory` works but moves in blocks (100 KB allocated read as 57,344 B): measure over
  thousands of calls (A11).
- A persistent UnityEvent listener added by `UnityEventTools` defaults to `RuntimeOnly`: silent in
  Edit mode until `SetPersistentListenerState(i, UnityEventCallState.EditorAndRuntime)`.
- A development macOS player of the probe scene was 311.2 MB against 114.7 MB for the release player
  (A12, final run).

## 11. Decision tables (deciding conditions when the experts disagree)

| Choice                               | Option A                                                   | Option B                                                                          | Deciding condition                                                                                                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared managers                      | static singleton / `StaticInstance<T>` (Tarodev, Weimann)  | SO references, event channels, composition root (Hipple, git-amend)               | solo or small team, short project: A with SubsystemRegistration resets; several programmers, designers wiring, long life, isolated prefab tests, local co-op: B                                                                                         |
| How dependencies arrive              | serialized SO references (Inspector as injector)           | interfaces + injector or composition root                                         | who edits the wiring: designers or artists: A; programmers only, heavy unit testing, plain C# services: B. Hipple's cost: SO wiring cannot be traced in code [01:00:30]                                                                                 |
| Mutable SO state                     | runtime SO variables reset at startup (Hipple)             | SOs read-only, state in C# and files (Code Monkey)                                | within one session and kept referenced: A is workable; anything that must survive relaunch: file, always                                                                                                                                                |
| Component granularity                | tiny single-purpose components (Hipple, Weimann)           | shallow base-class hierarchy per unit type (Tarodev)                              | designer recombination and runtime swapping: A; fixed roster in a small game: B, stopping at abstract base, faction base, concrete                                                                                                                      |
| Game flow                            | enum + switch game manager (Tarodev, "90%" of small games) | state classes with predicate transitions (git-amend FSM, scenario-unity-gameplay) | a handful of linear states: A; many states, any-transitions, designer tuning: B                                                                                                                                                                         |
| Async type                           | `Awaitable`                                                | `Task` / `ValueTask` / jobs / coroutines                                          | single consumer, Unity-loop aware: Awaitable; several awaiters or WhenAll: Task via AsTask; mostly synchronous hot path: ValueTask; short parallel compute: jobs; Web: Awaitable or coroutines, no threads (6.3 Manual)                                 |
| Events                               | C# `event` inside a system                                 | SO event channel between systems; UnityEvent for designer-wired, rare responses   | sender and receiver in one assembly and owned by programmers: C# events; cross-system or designer-facing: channels; UnityEvent only for rare designer-wired responses (0 B per invoke measured on 6.3, but hard-referenced and resolved by method name) |
| Categories (damage kinds, elements)  | enum with explicit values                                  | ScriptableObject "enum" assets                                                    | fixed "by some law" and switched on in code: enum; designers add entries or attach data per entry: SO assets (Hipple [00:46:39], [00:47:50])                                                                                                            |
| Live registries (saveables, targets) | runtime set asset                                          | `FindObjectsByType`, tags, manager `Register`                                     | always the set: no search cost, no init race, designers add sets; searches only in editor tools (Hipple [00:40:06])                                                                                                                                     |
| Input workflow                       | project-wide actions + cached `FindAction`                 | PlayerInput (+ PlayerInputManager) / generated C# class                           | local multiplayer and device assignment: PlayerInput and `playerInput.actions`; type-safe callbacks: generated class, one shared instance; everything else: project-wide                                                                                |
| Rebind storage                       | file under `persistentDataPath` (this skill)               | PlayerPrefs key "rebinds" (Rebinding UI sample)                                   | testable, per-slot, never shared with the Editor: file; minimal sample-based UI: PlayerPrefs, and delete the key on reset                                                                                                                               |
| Merge tool                           | Git merge driver (automatic, headless)                     | `git mergetool` with a GUI fallback (git-amend)                                   | agents: driver with `-h --fallback none -o`; humans resolving by eye: mergetool with P4Merge                                                                                                                                                            |
| VCS                                  | Git + LFS                                                  | Perforce / Unity Version Control                                                  | Git: no Editor locking, LFS by extension; Perforce: Editor check-out, lock, resolve; UVCS tracks empty folders and moves (6.3 Manual)                                                                                                                   |
