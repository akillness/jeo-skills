# Expert notes: principles and judgment by source

Timestamps are `[hh:mm:ss]` in the video. v0.2 (2026-09-24) added the items a blind grade found
missing (consistency check, one target per stage, batched reimports, ordinal assignment, hard
references, counters, LogAssert, Accelerator, release and provenance, asmdef layout). "Observed"
marks what ran on this Mac in Unity 6000.3.21f1 on 2026-09-24
(`archive/tests/unity-pipeline-automation/live_results.jsonl`). [added] marks this skill's own
synthesis. Five transcripts are machine-translated auto captions (Code Monkey C6i_JiRoIfk and
ppFshgFOgXU, Axelsson, both git-amend videos): terms were corrected from context in the notes;
figures marked uncertain there stay uncertain here.

## Olle Axelsson (Piktiv, Valheim ports and optimization), "Asset streaming in Valheim", Unite 2025 (Fzu2Das_1FU)

- Unity is hard-reference by default; only scenes are soft. Anything referenced directly or
  indirectly loads with the scene [00:08:57], [00:31:12].
- Streaming is a packing problem: implicit dependencies, bundle unload granularity and bundle count
  decide real memory [00:15:30]-[00:25:20].
- A dependency not assigned to any bundle is copied into every bundle that uses it, on disk and in
  RAM (Greyling and Greydwarf share a model and textures) [00:17:39]-[00:19:54]. Observed: in a
  one-group-per-folder layout, 5 assets were copied (two shared textures and URP's `Lit.shader` with
  its two fallback shaders).
- No per-asset unload from a bundle; `Resources.UnloadUnusedAssets` walks the hierarchy and spikes;
  a coarse shared bundle pins assets that should have died [00:21:00]-[00:22:05].
- Packing rule: for each asset, the set of streamed roots that need it; identical sets share a
  bundle [00:23:08]-[00:24:15]. Scenes and bundles track dependencies separately: a prefab
  referenced by a Build Settings scene and also built into a bundle is loaded twice; build scenes
  into bundles too [00:24:49]-[00:25:20]. Observed: `PipelineChecks.HardReferences` on a scene
  holding one prop instance listed the prefab and the shared detail texture as Addressable content
  (and URP `Lit.shader`, an explicit shared entry, as a shader-only warning); the pre-build gate now
  refuses such a scene.
- Bundle count has overhead; they saved another 110 MB going from thousands of loaded bundles to a
  few dozen [00:22:36], [00:30:41]. Observed: forest cost 13 KB more with condition packing (3
  bundles instead of 2), while the worst label fell from 12.9 MB to 4.8 MB.
- Stream only what has a predictable need time, is not always needed, and is large and unique; a
  bullet loaded on the fire button is already too late [00:12:13], [00:06:18].
- Decide soft vs hard references at project start; consoles and mobile have no virtual-memory safety
  net [00:31:43], [00:32:14].
- Addressables did not scale for them by hand; they built SoftRef, automatic packing at build time
  [00:25:51]-[00:29:04]. Deciding condition [added]: Addressables with condition packing (this
  skill's `AssignGroups`, or the Auto Group Generator window in Addressables 2.9.1) for most
  projects; a custom layer only for a single-scene open world with thousands of assets, frequent
  content updates and engineers to own it.

## Code Monkey (Hugo Cardoso, indie developer, 9 Steam games, 606k subscribers)

"How to use Addressables" (C6i_JiRoIfk, 2022):

- A prefab referenced by any MonoBehaviour field in a loaded scene is loaded with the scene,
  instantiated or not [00:03:32]. Measured: 680 MB resident with the hard reference vs 137 MB with
  Addressables; launch time "about 20 s" vs "about 2 s" (captions garbled: order of magnitude only)
  [00:04:03], [00:11:33].
- Avoid string addresses (case sensitive, break silently): `AssetReference`, typed
  `AssetReferenceGameObject`, your own `AssetReferenceT<T>`, `AssetLabelReference`
  [00:13:06]-[00:18:32].
- Folders inside groups are organization only: label them to load them together [00:20:55] (folder
  keys arrive in Addressables 4.0, not on 6.3).
- Load implies release (`Release`, `ReleaseInstance`); single-mode scene loads release
  automatically, additive ones do not [00:23:30], [00:25:03].
- After moving a prefab to Addressables, delete the old direct reference, or the scene still builds
  and loads it [00:07:24]. [added] Make that a gate, not a habit: no build scene may depend on
  Addressable content (`HardReferences`, P22).

"Build awesome tools with custom editors" (bMuTsAma4tk, 2020):

- Inspector edits go through `serializedObject.Update()`, `PropertyField`,
  `ApplyModifiedProperties()` [00:09:37]; handle edits through `EditorGUI.BeginChangeCheck` +
  `Undo.RecordObject` before assigning [00:17:25]-[00:19:06].
- "Before you start manually creating tons of content ask yourself if you can spend just one day
  building a tool" [00:23:06].

"How to setup Unity with AI agents and CLI" (ppFshgFOgXU, 2026):

- Agents target the wrong editor when several projects exist: name the project (`--project-path`)
  [00:06:27]; put a coding-style guide in AGENTS.md [00:06:57].
- Search the project before writing a system: the agent found and reused an existing health system
  [00:07:59].
- Agent-built layouts are about 90% done: grid-perfect clutter, a shelf in front of a door, a
  floating window [00:10:21]-[00:10:52].

## Unity tutorial, "Scalable art assets: 6 tips" (qZ5NmyoxKRk, 2024)

- Conventions work only if everyone follows them: one name, one place, no duplicates [00:00:08].
  Suffixes `_A`, `_N`; modular pieces carry dimensions in the name [00:01:12].
- Three mechanisms: Preset Manager defaults with name filters (static values, partial presets with
  Include/Exclude), AssetPostprocessor rules and checks, ScriptedImporter for unsupported formats
  [00:01:50]-[00:06:17].
- Budget check example: warn when an FBX exceeds 30,000 vertices, naming the model and its count
  [00:03:55]-[00:04:29]. The video sets `textureType` in `OnPostprocessTexture`, which is too late
  for the current import: settings belong in `OnPreprocessTexture` (6.3 Manual) [added].
- Prefab and material variants protect level-design edits from art updates [00:06:44]-[00:07:18].

## Javier Abud Chavez (Unity asset pipeline team), "AssetDatabase.Refresh() refresher", Unite 2019 (S2P9n5U9xVw)

- Determinism is the foundation: same inputs, same output, or caching and team sync break
  [00:01:47], [00:04:35]. Idempotent helpers: a move that works once and fails the second time is a
  bug [00:05:12].
- Import dependencies: static (name, importer id and version, build target) and dynamic (nested
  prefabs, color space, graphics API, scripting runtime, texture compression); the content hash of
  all of them names the artifact, so re-switching to an imported target is fast
  [00:13:44]-[00:16:55], [00:20:45]-[00:24:31].
- `StartAssetEditing` / `StopAssetEditing` for one refresh and one postprocess pass; "please please
  please put it inside the finally block" [00:29:14]-[00:30:21].
- Asset-modifying calls inside `OnPostprocessAllAssets` restart the refresh, possibly forever
  [00:19:29].
- A trailing `~` on a folder hides it from the importer; `ImportAsset(path)` reimports one file
  [00:31:08], [00:44:58]. Do not commit `Library`; share imports through the cache server (now Unity
  Accelerator) [00:42:31].
- Measure instead of parsing logs: the AssetDatabase counters expose imports, refreshes and domain
  reloads, as deltas and totals, plus cache-server uploads and downloads [00:26:44]-[00:28:15].
  Observed on 6.3: still `UnityEditor.Experimental.AssetDatabaseExperimental.counters` (public;
  `import.fullScan` is internal); the `refresh` counter counts `AssetDatabase.Refresh` passes, not
  `SaveAndReimport` or launch refreshes, so judge a batch by imports and seconds. Two remap passes
  over 195 FBX: 370 + 195 imports and 19.0 s one by one, 195 + 195 imports and 5.1 s inside
  `StartAssetEditing`.
- Build target is a static import dependency [00:13:44]-[00:14:40], and content-hash artifacts make
  a re-switch to an imported target fast [00:20:45]-[00:24:31]. Observed: the first launch of this
  project on Android reimported 1,717 assets in 51.7 s; switching back and forth afterwards cost 60
  imports each. [added] So every stage of one pipeline run launches on the same platform.
- Compile errors block importing on purpose [00:38:46]. Observed: while `PipelineChecks.cs` had a
  CS0122 error, the new texture postprocessor installed with it triggered no reimport; the 1,511
  texture reimports came with the fixed compile.

## Thom Hopper (Unity staff technical product manager, platforms), "Build Profiles in Unity 6", Unite 2024 (BlVsi2cSJ88)

- Build settings used to live in local files, some in `Library`; a Build Profile is a versionable
  asset consumed identically by people and the build machine [00:02:26]-[00:05:43], [00:10:03],
  [00:18:22].
- Profile defines are additive over Player Settings [00:11:45]; a profile can carry its own scene
  list and Player Settings override [00:11:12]-[00:13:22].
- Switch costs: different base platform = reimport; same base platform = none; custom defines =
  recompile and domain reload; restart-requiring Player Settings can flip [00:25:41]-[00:27:18].
- With a profile active, `PlayerSettings` reads and writes its override [00:24:35]. "Switching
  platform isn't supported in batch mode, similarly set active build profile isn't available in
  batch mode either": pass `-activeBuildProfile` [00:27:18].
- Team path: personal profiles, then shared known-good profiles in version control, then the build
  machine [00:16:43]-[00:18:22]. Observed on 6.3: no public creation API; the internal
  `BuildProfile.CreateInstance(BuildTarget, StandaloneBuildSubtarget)` works, and
  `-activeBuildProfile` built from the created asset. [added] Use the internal route once, commit
  that asset, and create every later profile by copying it with the public `AssetDatabase.CopyAsset`
  (observed: `route: template`, scenes and defines edited through public properties).
- Release profiles carry no debug defines (agent translation of the note:
  `profile.scriptingDefines`, docs digest checklist). Observed: `ReleaseCheck` and a real
  `-agentRelease` player build refused the demo profile's `AGENT_PROPS_DEMO` once `_DEMO$` was
  listed as forbidden; the release profile copied from it with no defines built.

## git-amend (Adam Myhre, Unity educator)

"DevOps for game devs: new Unity CLI + GitHub Actions" (4FbE0G8kcxk, 2026):

- Start with the smallest pipeline (Edit Mode tests on every push), then add builds [00:12:03]; keep
  results machine-readable (XML) for later systems [00:05:23].
- Pro seats are limited: activation failed until an old machine was removed at id.unity.com
  [00:06:23]; always return the seat or the next runner fails [00:10:00]. [added] Make the return
  step `if: always()`.
- His Personal-license suggestion conflicts with the 6.3 Manual (Personal activates only by Hub
  sign-in): do not promise serial activation for Personal in CI.

"Build custom Unity MCP tools for coding agents" (VPjo-M6mPkE, 2026):

- A generic run-command tool is a universal fallback but "riskier and less predictable for AI"; it
  drifted into unrelated edits [00:03:54], [00:06:29].
- A good tool: constrained parameters (allowed values), refuses Play mode, returns error codes plus
  hints on failure and context on success [00:07:27]-[00:08:59]. On 6.3 build such tools as
  `[CliCommand]` (Unity CLI + `com.unity.pipeline`), not `[McpTool]` (AI Assistant MCP server,
  deprecated).

## DebugDevin, "Automate Unity with GitHub Actions" (gUZ9YXrJOAo, 2024)

- Manual multi-platform builds block the editor and reimport on every switch; CI moves that
  elsewhere [00:00:00]-[00:01:32].
- `fail-fast: false` for platform matrices so every platform reports [00:11:26]; secret names must
  match the workflow exactly [00:13:46].
- His Personal `.ulf` recipe is dated for 6.x (named-user license is XML; Personal must go online
  every 30 days) (deltas §1.5).

## Freya Holmér (tool and shader developer, Shapes, Shader Forge), "Intro to tool dev in Unity" part 1 (pZ45O2hg_30, 2020)

- Tool users are the team; make invalid values impossible (`[Range]`) [00:01:25]-[00:07:32].
- Know at every line whether you touch an asset or instance data: `.material` / `.mesh` duplicate
  silently (extra draw call at runtime, leaks in edit mode, multi-gigabyte scenes);
  `.sharedMaterial` edits the asset for everyone; temporary editor objects need
  `HideFlags.HideAndDontSave` [00:32:40]-[00:44:05].
- Non-serialized editor state is null after every recompile; `Awake` is not called on reload,
  `OnEnable` is: lazy properties [00:58:32]-[01:03:14].
- The serializer drops subclass data in `List<Base>` and splits shared plain-class references
  (`[SerializeReference]` today) [01:39:28]-[01:42:24].
- Direct field writes in an inspector: not dirty, not undoable, lost; manual fix `Undo.RecordObject`
  before assigning; right way `SerializedProperty` (undo, dirty, multi-edit, drawers for free)
  [02:26:56]-[02:46:30]; `ApplyModifiedProperties()` returns true when something changed [02:47:52].
- The naive snap tool: positions change on screen, scene not dirty, gone after reopening; record the
  Transform itself: recording the GameObject covers name, tag, layer, static flags and the component
  list [02:59:23]-[03:02:41]. Observed live, see P6.
- Undo recording is slow on thousands of objects: record only what changes [03:02:41].

## Charles Amat (Infallible Code), "Unit tests in Unity" (PDYB32qAsLU, 2020)

- Test the small value objects first; structure code so input, behavior and data are separable
  [00:01:45], [00:04:02].
- Edit Mode for plain code, Play Mode for code that needs a running scene [00:05:00]; project
  scripts must be in an asmdef the test assembly references [00:05:47]. Observed: tests in an Editor
  folder without asmdef (Assembly-CSharp-Editor) are discovered too, which suits editor-tool tests,
  but a test asmdef cannot call that code (CS0103 "The name 'AgentKit' does not exist in the current
  context", and the error aborted the next batch job). Deciding condition [added]: rules a team's
  tests call go in an Editor asmdef with a test asmdef beside it
  (`scripts/templates/PipelineAsmdef/`, 396 of 396 cases passed); the kit's own tests stay next to
  the kit.

## Christian Warnecke and Richard Fine (Unity Test Framework developers), "QA your code", Unite 2019 (wTiF2D0_vKA)

- Turn "validate stuff" menu items into test suites with per-check results [00:09:40]-[00:10:47].
- Parametric `[TestFixtureSource]` over the prefabs of a folder or the scenes of the build is a
  content-validation suite [00:24:28]-[00:26:43].
- Pre-build gate: a small Edit Mode category run with `runSynchronously = true` from a build
  callback, `BuildFailedException` on failure, a log line on success too: "silence is not
  necessarily something you want to trust" [00:13:30]-[00:17:05], [00:31:43]. Observed on 6.3: 791
  tests ran synchronously inside `IPreprocessBuildWithContext`.
- Build-time tests must be read-only or they leave objects in the built scene [00:34:39]; test
  scenes enter test players through `ITestPlayerBuildModifier`, never by editing the global list
  [00:19:33]; split build and run for device farms [00:05:27]-[00:09:15].
- Keep `TestRunnerApi` callbacks in a `HideAndDontSave` ScriptableObject so they survive
  test-triggered domain reloads [00:10:47].

## Unity Technologies, "Unity command-line interface (CLI)", Unite Seoul 2026 (DgNrgZeJOxQ)

- The Pipeline package turns the editor into a local command server [00:00:00]; add it BEFORE
  opening the project [00:02:42].
- `eval` for one-offs, named commands for anything repeated: "A written command turns that workflow
  into something deterministic and repeatable" [00:07:41].
- Tests are the agent contract: balance rules as tests, "It can only touch the card data"
  [00:05:31]. Runtime commands in builds are remote code execution: development builds only [added].

## Official documentation (Unity 6.3 Manual and Scripting API, Addressables 2.9, Unity's unity-cli skill, GameCI v4)

- Editor scripting: SerializedObject edits are dirtied, undoable and prefab-correct; direct edits
  need `Undo.RecordObject` first plus `PrefabUtility.RecordPrefabInstancePropertyModifications`;
  ScriptableObjects need `SetDirty`; `ApplyModifiedProperties` bypasses property setters (validate
  in `OnValidate`) [doc-editor-scripting-asset-pipeline].
- Asset pipeline: `[InitializeOnLoad]` runs before non-script assets import (use
  `OnPostprocessAllAssets(..., didDomainReload)`); bump `GetVersion()`; declare dependencies
  (`DependsOnArtifact`, `DependsOnSourceAsset`); branch on `context.selectedBuildTarget`;
  `-consistencyCheck` verifies determinism [doc-editor-scripting-asset-pipeline §ScriptedImporters;
  doc-command-line-batchmode-ci §Configuration arguments, "Determinism check"]. Observed:
  `ConsistencyChecker - total checked: 12184, found inconsistencies: 3, skipped: 7390` in 23.5 s;
  the three were a deliberately random probe texture and two URP 17.3 package shaders (`-nographics`
  run), none of the 593 governed files. With Accelerator, `-consistencyCheckSourceMode cacheserver`
  compares against the server and never uploads inconsistent results (not run: no server).
- Existing assets after a rule change: fix with `SaveAndReimport()` inside
  `StartAssetEditing`/`StopAssetEditing` [doc-editor-scripting-asset-pipeline, agent translation;
  docs digest procedure 8]. Observed: 4x faster than one by one (numbers under Abud Chavez).
- A dependency is on the whole file: any byte changed in a declared config reimports everything that
  declared it [added from the dependency model; observed with the rules JSON]. Keep non-import
  settings in another file (`pipeline_checks.json`).
- A `GetVersion()` bump invalidates every asset of the postprocessor's importer type, whatever paths
  the code checks [added]. Observed: a do-nothing texture postprocessor bumped from 1 to 2: 1,513
  textures reimported (the project's 397 plus package textures) in a 17 s launch.
- Addressables: released is not unloaded until the bundle's refcount is zero; dependencies load per
  bundle; restart Unity per platform in CI, `ClearCachedData`, `BuildCache.PurgeCache(false)`;
  archive `addressables_content_state.bin` per release per platform; the doc sample's `index > 0`
  rejects builder index 0; `WaitForCompletion` never on WebGL, in `Awake`, on downloads.
- Command line: exceptions exit 1; `-quit` breaks `-runTests`; target switches in batch mode do
  nothing; `-accept-apiupdate` for the API Updater; `-nographics` cannot bake GI; a project never
  imported starts on the default platform, so force it with `-buildTarget`
  [doc-command-line-batchmode-ci §-batchmode, "First import picks the default platform"].
- Accelerator from CI:
  `-EnableCacheServer -cacheServerEndpoint host:10080 -cacheServerNamespacePrefix ...`, and with
  `-quit` add `-cacheServerWaitForUploadCompletion` or uploads are lost at exit
  [doc-command-line-batchmode-ci §-quit, §Accelerator; docs digest delta #28]. Observed with no
  server listening: the job still exited 0; the log said
  `Waiting for cacheserver connection timed out` and
  `Imports: total=0 (actual=0, local cache=0, cache server=0)`. An unreachable server fails nothing:
  check the `cache server=` count.
- Build scripting: defines apply at the next domain reload; `BuildPlayerWithProfileOptions`;
  `IPreprocessBuildWithContext` also fires for AssetBundle builds; never start a build inside
  `OnPreprocessBuild`; the report inside `OnPostprocessBuild` is not final; no timestamps in bundle
  names.
- Addressables determinism: editor scripts that assign assets to groups must do so in a
  deterministic order, and every build machine needs identical Addressable Asset Settings
  [doc-build-scripting-build-profiles §build-deterministic-assetbundles-addressables]. Observed in
  the 2.9.1 source and a probe: saving sorts groups by asset GUID, a group's entries by GUID and an
  entry's labels ordinally, but the label table keeps insertion order (reversed input, reversed
  table): add labels in ordinal order.
- Test Framework 1.6: any logged error fails a test unless `LogAssert.Expect`ed [doc-test-framework
  §asserting-logs; docs digest delta #12]; `TestRunnerApi` callbacks vanish on domain reload; the
  test mode comes from the first `Filter`; `Assert.ThrowsAsync` freezes the editor; test assemblies
  cannot reference `Assembly-CSharp` [§edit-mode-vs-play-mode-tests; delta #25]. Observed: an
  unexpected error or a logged exception failed; an expected error (regex), a warning, and an import
  warning from a reimport passed; `ignoreFailingMessages` passed one test and reset for the next; an
  import error logged by `context.LogImportError` during a reimport inside the test FAILED it
  ("Unhandled log message").
- Unity CLI skill: live editor first; "can't connect" may be Safe Mode or a sandbox; `unity test`
  exits 0 / 8 (tests failed, never retry) / 6 (no verdict); stop Unity by PID only; every build
  writes a provenance manifest (editor version and changeset, packages, target, profile, execute
  method, git revision and dirty flag, outcome); the uncommitted-changes guard
  (`--allow-dirty-build`) is described with the versioning options [doc-unity-cli-agent-tooling
  §build-run-test]. Release builds: a clean tree and no debug defines [docs digest checklist, "Build
  report" and "Provenance"]. Observed (CLI 1.0.0-beta.11): the manifest is
  `unity-build.provenance.json` INSIDE the `.app` on macOS, with
  `"source": {"vcs": "git", "revision", "dirty"}`; with no `--versioning-strategy` a dirty tree
  still built (exit 0, `dirty: true`).
- GameCI: workflow env vars are invisible inside Unity (use `customParameters`); IL2CPP needs a host
  OS matching the target; Library cache "more than 50%" faster; coverage broke Unity 6 PlayMode
  runs.

## Observed on this Mac (additions to the sources)

- Blender 5.2 FBX exports: default settings give a root rotated 90 degrees on X and scaled x100 in
  Unity; FBX All scaling fixes the scale but not the rotation; `bakeAxisConversion` changes 270 to
  89.98 degrees and does not remove it; only Blender's Apply Transform gives rotation 0 and scale 1
  (4 exports x 2 importer settings).
- The settings Addressables creates rebuild all content inside every player build
  (`PreferencesValue`, preference default true, `AddressablesPlayerBuildProcessor.PrepareForBuild`;
  the gate logged `addressables_built_with_player: true`): a separate content stage is redone and
  the archived content state may not match what ships.
- `Addressables.BuildPath` already contains the platform folder (`aa/OSX` on macOS).
- Settings created by `AddressableAssetSettingsDefaultObject.GetSettings(true)` inside a job are
  saved with empty `BundledAssetProviderType` / `AssetBundleProviderType` (defaults are filled in
  `OnAfterDeserialize`): the next job rewrites the file once. Set both after creation.
- A first macOS Mono player build of this project took 60 to 158 s across three fresh starts (the
  machine was shared with other editors), whatever the content setting; incremental builds 5 to 23
  s.
- An Addressables package test (`TestStub.RequiredTest`) joins every Edit Mode run: count your own
  tests by category or name.
- Addressables 2.9.1 ships an Auto Group Generator (Window > Asset Management > Addressables > Auto
  Group Generator): dependency-graph grouping by source set, the Valheim idea, with internal classes
  only.
- Addressables' own postprocessor (`AddressableAssetSettings.OnPostprocessAllAssets`) adds ANY
  imported `AddressableAssetGroup` asset whose name the default settings lack to their group list:
  two throwaway settings created under `Assets/_OrderProbe` for a test put 3 groups into the main
  settings, which then showed up as a git diff once the probe folder moved out.
- Every player build copies Addressables' `link.xml` into `Assets/AddressableAssetsData/`
  (`AddressablesPlayerBuildProcessor.PrepareForBuild`) and removes it only at the next editor start
  (`[InitializeOnLoadMethod] CleanTemporaryPlayerBuildData`): between a CLI build and the next
  launch, `git status` shows it untracked. Gitignore it.
- An empty `Assets/Editor/UnityCliTemp-<id>` folder and its `.meta` from an earlier Unity CLI run
  stayed in the project (seen once, not reproduced by later `unity build` runs): check for it before
  committing.
