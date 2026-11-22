---
name: scenario-unity-pipeline-automation
description: "Use when automating a Unity 6.3 content pipeline or build: importing an art drop (FBX, PNG) with AssetPostprocessor rules and naming conventions, generating prefabs or editing scenes from script with correct Undo and SetDirty, Addressables groups, labels and content builds, content-validation tests, batch-mode, command-line or CI builds (Build Profiles, GameCI, GitHub Actions, Accelerator), editor tools; or when textures import wrong or reimport every run, a scripted edit vanishes, bundles duplicate assets, a batch build ignores its defines, or CI cannot activate Unity."
license: MIT
---

# Unity pipeline automation (tools and build engineer)

Expert level here means a pipeline that gives the same result on every machine and every run: rules
applied at import time, edits made through serialization, content packed by when it loads, tests
that gate the build, and a build that CI runs from a clean checkout. The stance: nothing is done by
hand twice, nothing is trusted without a count, a test or a frame, and a second run changes nothing.
If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, job protocol, review loop, 6.3 traps).
Import its toolkit; this skill adds [`scripts/ut_pipeline.py`](scripts/ut_pipeline.py) and
[`scripts/AgentKit/Pipeline/`](scripts/AgentKit/Pipeline/).

**Status (2026-09-24, after the blind-grade refactor):** every procedure ran in Unity 6000.3.21f1 on
this Mac against a 200-FBX Blender drop: `tests/code/unity-pipeline-automation/` (results in
`archive/tests/unity-pipeline-automation/live_results.jsonl`).

## Stance (the expert delta)

1. **Import rules are code that runs at import, and deterministic, and you prove it.** Settings in
   `OnPreprocess*`, `GetVersion()` bumped on every code change, config declared before it is read
   (`context.DependsOnSourceAsset`), no clocks, no dictionary order, no asset writes in callbacks
   (6.3 Manual; Javier Abud Chavez, S2P9n5U9xVw [00:04:35], [00:19:29]). Proof: `-consistencyCheck`
   before trusting a shared cache or CI (Manual). Observed: 12,184 assets checked in 23.5 s; a
   random-pixel probe texture flagged, 0 of the 593 governed files. A bump or a new postprocessor
   reimports every asset of that importer type, packages included (1,513 textures).
2. **An edit counts only if it goes through serialization, on the exact object.** Record Undo on the
   component that changes, before the change (Freya Holmér, pZ45O2hg_30 [03:01:01]). Observed:
   `Undo.RecordObject(go)` then a move is not undone; `RecordObject(go.transform)` is. A direct
   write on a prefab instance reverts at the next prefab update; a ScriptableObject is not saved
   without `SetDirty`.
3. **One AssetDatabase batch per stage, measured.** `StartAssetEditing` / `StopAssetEditing` in
   `try/finally` (Abud Chavez [00:30:21]), and `SaveAndReimport` / `ImportAsset` inside it too.
   Count with the AssetDatabase counters, not the log (Abud Chavez [00:26:44]). Observed: two remap
   passes over 195 FBX, 19.0 s one by one vs 5.1 s batched.
4. **Pack Addressables by loading condition, not by folder, in a stable order.** Assets needed under
   exactly the same conditions share a group; dependencies used by several groups are placed
   explicitly (Olle Axelsson, Valheim, Fzu2Das_1FU [00:23:08]). Unassigned shared dependencies are
   copied into every bundle [00:18:44]; observed, that includes URP's `Lit.shader`. Assign in
   ordinal order (6.3 Manual, Addressables determinism): 2.9.1 sorts groups and entries by GUID when
   it saves, but the label table keeps insertion order.
5. **Released is not unloaded, and references are loads.** Memory returns when the bundle's refcount
   reaches zero (Addressables 2.9 manual); a build scene that references Addressable content loads
   it with the scene and again from the bundle (Code Monkey, C6i_JiRoIfk [00:03:32]; Axelsson
   [00:24:49]). Gate it; measure unloads in the player.
6. **Fix the platform at launch, the same on every stage, and ship the content you built.** Target
   switches inside a batch job do nothing (Manual; Thom Hopper, BlVsi2cSJ88 [00:27:18]); build
   target is an import dependency (Abud Chavez [00:15:49]). Observed: one stage on Android
   reimported 1,717 assets in 52 s; switching back reused cached artifacts (60 imports).
   Addressables' default settings rebuild all content inside every player build.
7. **Tests are the gate.** Content rules as parametric Edit Mode tests, one case per asset (Warnecke
   and Fine, wTiF2D0_vKA [00:24:28]), run synchronously in a pre-build callback that logs the pass
   [00:31:43]. Any logged error fails a test unless `LogAssert.Expect`ed (Manual); observed, that
   includes an import error logged by a reimport inside the test. Never `-quit` with `-runTests`.
8. **Release builds come from a clean tree, without debug defines, with provenance kept** (docs
   digest checklist; Hopper, profile defines). Narrow named tools over generic execution (git-amend,
   VPjo-M6mPkE [00:03:54]; Unity, DgNrgZeJOxQ [00:07:41]).

## Establish first

- **Drop contract:** DCC and export settings, folder per category, suffixes, units. Default: Blender
  "FBX All" + "Apply Transform", `_BaseColor`/`_Normal`, a `manifest.csv` for extra labels.
- **Loading conditions:** loaded as a set (level, biome) or one by one? Default: labels,
  `key_by="label"`; streaming uses `key_by="root"`.
- **Targets and budgets:** platforms (one `-buildTarget` per pipeline run), texture cap per
  platform, vertex budget, bundle budget per label. Defaults: 1024 px desktop, 512 mobile, 5,000
  vertices.
- **Content updates:** remote content after release? Archive `addressables_content_state.bin` per
  platform per release.
- **Channel and CI:** is the user's editor open on the project (`ut_live.channel(P)`)? Git repo?
  Accelerator? License: Personal (Hub sign-in only) or paid seat.

## Workflow

1. **Preflight.** `ut_env.preflight(P)`; `ut_pipeline.install(P)`. Editor open: the same jobs
   through `ut_live.call` or the `[CliCommand]` tools. Pipeline code a team's tests must call: its
   own Editor asmdef plus a test asmdef (`install_asmdef_template`). GATE: `Echo` ok, zero compile
   errors (one aborts every batch job).
2. **Scan the drop offline.** `up.scan_drop(drop)`, same rules JSON. GATE: every reject has a
   reason; duplicates reject every copy.
3. **Import.** `up.import_drop(P, drop, target=T)`: changed files into `<root>/<Category>/<Name>/`,
   one batch, audit. GATE: accepted = found - rejected; audit errors explained; after a
   postprocessor change, `up.consistency_check(P, target=T)` flags nothing under `Assets/`.
4. **Materials and prefabs.** `up.build_prefabs(P, target=T)`: URP Lit per prop, keywords by
   `ShaderGUI.ValidateMaterial`, FBX remaps with `SaveAndReimport` inside the batch, Prefab Variants
   built in a preview scene, saved only when a value changed. GATE: prefabs = accepted - size
   errors; a rerun rewrites 0 files (`git status` clean).
5. **Look at it.** `EditorEditJobs.BuildLineup` then `AgentCapture.CaptureViews` with
   `graphics=True`, `ut_review.review_capture`, open the sheet. GATE: no magenta, black or blank
   flags; props upright, grounded, in scale.
6. **Addressables groups.** `up.assign_addressables(P, "condition", target=T)`. GATE:
   `implicit_duplicates == 0`; `up.hard_references(P)` ok.
7. **Content build.** `up.build_content(P, T)`: builder index `>= 0`, `ClearCachedData` +
   `BuildCache.PurgeCache(false)`, `DoNotBuildWithPlayer`, layout read back, state archived. GATE:
   duplicated assets 0, bytes per label within budget.
8. **Tests.**
   `ut_run.run_tests(P, "EditMode", categories="PipelinePreBuild", extra_args=["-buildTarget", up.cli_target(T)])`.
   GATE: failed 0, total equals the expected asset count.
9. **Player build.** Profile copied from a committed template (`PipelineBuild.CreateBuildProfile`
   with `template`), `ut_run.build(P, T, profile=...)`, or raw
   `-activeBuildProfile ... -executeMethod AgentKit.Pipeline.PipelineBuild.BuildFromCommandLine`.
   Release: `-agentRelease` (gate refuses debug defines), clean tree, `up.release_ready(repo, app)`.
   GATE: `AGENT_GATE` ok with `hard_references` 0, BuildReport `Succeeded`.
10. **Smoke the player.** `up.player_smoke(app, label)`. GATE: loaded assets equal the manifest
    count; bundles unload after release.
11. **CI.** `up.write_ci(repo)`: `ci/pipeline.sh` (one process per stage, the same `-buildTarget` on
    each; `ACCELERATOR=`, `CONSISTENCY=1`, `RELEASE=1`) and GitHub Actions files. GATE: passes from
    a checkout without `Library/`; license returned `if: always()`; with Accelerator, the log's
    `cache server=` count above 0.

## Numbers

| Value                            | Relative to                                                                                                      | Source                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 5.6 to 6.7 s                     | 593 files copied and imported in one batch                                                                       | observed                               |
| 19.0 s vs 5.1 s                  | two remap passes over 195 FBX (`SaveAndReimport`), one by one vs in one batch                                    | observed                               |
| 11 to 12 s                       | 197 materials, 197 FBX remaps, 196 Prefab Variants, in-editor time                                               | observed                               |
| 1,717 imports, 52 s / 60 imports | first launch on another platform / switching back (cached artifacts)                                             | observed                               |
| 1,513 textures, 17 s             | reimported by one `GetVersion()` bump of a do-nothing texture postprocessor                                      | observed                               |
| 12,184 checked, 23.5 s           | `-consistencyCheck` of this project (7,390 skipped; 2 URP shaders flagged: baseline packages)                    | observed                               |
| 0 files                          | changed by a second full run (import, prefabs, groups)                                                           | observed                               |
| 791 tests, 10 to 16 s            | content tests for 196 prefabs, 396 textures, 197 models                                                          | observed                               |
| 13.5 / 12.9 / 4.8 MB             | worst label load, category / isolate / condition layouts (3 biomes)                                              | observed                               |
| 5                                | duplicated assets in the category layout (2 textures, `Lit.shader`, 2 fallbacks)                                 | observed                               |
| 0 to 63 ms                       | bundles still loaded after the last `Release` (7 player runs)                                                    | observed                               |
| 60 to 158 s / 5 to 23 s          | first macOS Mono player build / incremental rebuilds (shared machine); 127.4 MB player                           | observed                               |
| 0.4 to 1.2 s vs 10 to 17 s       | the same job through a resident editor's bridge vs a batch job with editor start                                 | observed                               |
| 4 GB                             | ceiling per bundle for cross-platform compatibility                                                              | Addressables 2.9 manual                |
| 30,000 vertices                  | example FBX budget warning                                                                                       | Unity tutorial, qZ5NmyoxKRk [00:03:55] |
| 38%, about 110 MB                | Valheim memory cut from streaming, then from fewer loaded bundles                                                | Axelsson [00:03:02], [00:30:41]        |
| 179 s / 486 s                    | generated `ci/pipeline.sh` from a checkout without `Library/` (v0.2, quiet machine / v0.1, 6 to 8 other editors) | observed                               |
| 0 / 8 / 6                        | `unity test` exit codes: pass / tests failed (never retry) / no verdict (retry)                                  | unity-cli skill                        |

## Quality gates

- **Measurable:** envelope `ok`, no compile errors, `active_target` equal on every stage; ImportDrop
  counts; consistency check clean under `Assets/`; prefab count; rerun: copied 0, `git status`
  clean; `implicit_duplicates` 0 and `duplicated_assets` 0; per-label KB; no build scene
  hard-referencing Addressable content; NUnit failed 0 with the expected total; `AGENT_GATE` ok;
  BuildReport `Succeeded`; player smoke counts; release: clean tree, provenance `source.dirty`
  false, no forbidden defines; CI script exit 0 from a clean checkout.
- **Visual:** lineup sheet opened: not magenta, normal maps shading, props upright, pivots on the
  ground, sizes plausible next to the 1.8 m capsule.

## Common mistakes

| Mistake                                                                              | What it looks like                                 | Fix                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| importer settings in `OnPostprocessTexture`; code changed, `GetVersion()` not bumped | old settings used; machines disagree               | `OnPreprocess*`; bump the version; `-consistencyCheck`       |
| non-import keys added to the rules JSON                                              | every governed asset reimports                     | separate file (`pipeline_checks.json`)                       |
| `Undo.RecordObject(gameObject)` before moving it                                     | move not undoable                                  | record the Transform                                         |
| direct write on a prefab instance or a ScriptableObject                              | reverts at the next prefab update / file unchanged | `RecordPrefabInstancePropertyModifications` / `SetDirty`     |
| `StartAssetEditing` without `finally`; `SaveAndReimport` per FBX outside a batch     | frozen database; 4x slower remaps                  | `try/finally`; reimport inside the batch                     |
| stages without the same `-buildTarget`                                               | each stage reimports textures and shaders          | the same target on every stage, tests included               |
| one group per folder with shared textures                                            | the same texture and shader in every bundle        | condition packing; build layout check                        |
| labels added in file or HashSet order                                                | the settings file differs between machines         | ordinal order                                                |
| a build scene references an Addressable prefab                                       | loaded twice, bundles bypassed                     | `HardReferences` in the gate                                 |
| content built, then a default player build                                           | content rebuilt, archived state stale              | `DoNotBuildWithPlayer` + gate                                |
| `SetActiveBuildProfile` in a batch job; profile from the internal API                | old target or defines; breaks on upgrade           | `-activeBuildProfile`; copy a committed template             |
| a test reimports an asset whose importer logs an error                               | "Unhandled log message", test fails                | `LogAssert.Expect`                                           |
| tests in a test asmdef calling code in Assembly-CSharp-Editor                        | CS0103, every batch job aborts                     | pipeline code in its own Editor asmdef                       |
| `-quit` with Accelerator, no wait flag; server unreachable                           | uploads lost; job passes silently                  | `-cacheServerWaitForUploadCompletion`; check `cache server=` |
| release from a dirty tree                                                            | provenance `dirty: true`, the CLI still builds     | clean tree, `RELEASE=1`, gitignore Addressables' `link.xml`  |
| Blender default FBX export                                                           | root rotated 90 degrees, scale 100                 | FBX All + Apply Transform (scenario-blender-export)          |
| duplicate name resolved by order                                                     | the wrong asset silently wins                      | reject every copy, ask                                       |
| Addressables settings created inside a job                                           | the next run rewrites the settings file once       | set the two provider types after `GetSettings(true)`         |
| `-quit` with `-runTests`; relative `--output-path`                                   | no XML; build outside the project                  | omit `-quit`; absolute path                                  |

## Handoffs

- **Receives:** FBX and textures with export settings from scenario-blender-export,
  scenario-maya-expert, scenario-3d, scenario-textures; code layout and asmdefs from
  scenario-unity-architecture; which props load together from scenario-unity-world-building.
- **Delivers:** to scenario-unity-performance the build report, bundle sizes, per-label loads; to
  scenario-unity-mobile texture formats (this skill sets size caps only) and signed builds; to
  scenario-unity-web Web builds (no `WaitForCompletion` on WebGL); to
  scenario-unity-rendering-lighting lightmap UV needs; to the lead: rules JSON, props manifest,
  envelopes, NUnit totals, layout JSON, BuildReport, provenance, contact sheet.

## Unity 6.3 notes

- Addressables 2.9.1 is this editor's default (folder keys and `await handle` are 4.0); its
  postprocessor adopts any imported group asset into the default settings. Content Directories
  replace AssetBundle builds in 6.6.
- `IPreprocessBuildWithContext` also fires for AssetBundle builds: filter with
  `BuildPipeline.isBuildingPlayer`.
- No public profile-creation API before 6.5; AssetDatabase counters are public in
  `UnityEditor.Experimental.AssetDatabaseExperimental.counters`.
- The Unity CLI is beta; `unity build` writes its provenance manifest inside the `.app` on macOS.
  Personal licenses activate only through Hub sign-in.

## References

- [`references/procedures.md`](references/procedures.md): the pipeline as copyable calls, each with
  its live test and result.
- [`references/expert-notes.md`](references/expert-notes.md): principles and judgment by expert,
  with source and timestamp.
- [`references/critique.md`](references/critique.md): the rubric to judge a pipeline, a layout, a
  build, a release.
- [`references/gui-paths.md`](references/gui-paths.md): windows and menus for the same tasks.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs, timestamps,
  revision history.
- `scripts/ut_pipeline.py`, `scripts/AgentKit/Pipeline/*.cs` (jobs, postprocessor, checks, gate,
  content tests), [`scripts/AgentKit/PipelineCli/`](scripts/AgentKit/PipelineCli/),
  [`scripts/Runtime/`](scripts/Runtime/),
  [`scripts/templates/PipelineAsmdef/`](scripts/templates/PipelineAsmdef/): the code.
