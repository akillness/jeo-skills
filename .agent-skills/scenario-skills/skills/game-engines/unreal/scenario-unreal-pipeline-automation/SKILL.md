---
name: scenario-unreal-pipeline-automation
description: "Use when importing FBX, USD, OBJ or glTF from Maya, ZBrush or Blender into Unreal Engine 5.8 in bulk or reimporting changed files, writing Editor Python tools, Interchange pipelines or import presets, enforcing naming conventions, assigning material instances by script, setting Nanite, collision and LODs per asset class, writing data validators or automation tests, fixing redirectors, or cooking and packaging from the command line (BuildCookRun, RunUAT, CI, Perforce). Also when a scripted import ignores its settings or names, a Python validator never runs, or a Mac build will not package."
license: MIT
---

# Unreal pipeline automation (pipeline and tools TD)

Expert pipeline work in Unreal is policy as data plus proof: the import policy is a versioned
pipeline asset, names come from a plan, every rule that matters is a validator that also guards
human edits, and a build counts once it cooked with fatal validation and booted. Bulk work runs
headless; anything visual goes to a screenshot someone actually looks at. If a sibling skill named
here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user
to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** every Unreal call here is **not yet run in Unreal**; the pure layer of
[`scripts/ue_pipeline.py`](scripts/ue_pipeline.py) and both jobs ran offline (unit tests, plus
control flow against a fake `unreal`). First action once 5.8 is installed:
`tests/code/unreal-pipeline-automation/in_engine/run_in_unreal.py`.

## Stance (the expert delta)

- **Import policy is an asset you pass, never dialog memory, and it sticks to the asset.** Scripted
  imports use the pipeline's defaults, not what the dialog last remembered (Interchange PM,
  Oq6KbrqkGnw [00:39:28]; Jamie Dale, 0guOMTiwmhk [01:26:38]): duplicate the generic assets pipeline
  into the project, set every option, pass it in `override_pipelines`. Stack order is execution
  order: a tweak pipeline above the default one sees no factory nodes [00:20:22]. Filter at
  factory-node level, following Factory Dependencies, so orphan materials are never created
  [00:31:33]; a Graph Inspector left in the stack pops up mid-batch [00:40:00]. An asset keeps its
  stack and reimport reuses it (Interchange doc), so a policy change reaches existing assets only
  through a reimport that passes the new preset (`plan_imports(..., policy=)`).
- **Names come from the plan, not the importer.** Interchange ignores
  `AssetImportTask.destination_name` (5.8 API reference). Stage each file under its target name and
  rename only as a fallback: a rename leaves a redirector (naming doc), and the Zen loader ignores
  core redirects. Renaming onto an existing asset fails, which is how re-runs leave duplicates:
  reimport instead (I03). No drag and drop: other tools depend on paths (Bardoux, MjjkWH0eT3U
  [00:09:14]).
- **Nanite by eligibility, not triangle count.** Opaque or masked static meshes on a Nanite target
  get Nanite, low-poly included: non-Nanite geometry is "much more expensive to render into VSMs"
  (VSM doc). Off for translucent materials (Nanite draws the default material), morph targets and
  non-Nanite targets; "not everything can be Nanite" (Oztalay, S2olUc9zcB8 [00:34:33]). Fallback
  settings on every Nanite mesh (DxBKmQ-0kfw [00:37:15]); simple collision still required.
- **Validation is code at the point of creation, and red must mean new.** About 30 to 40 percent of
  bugs trace back to something an asset validator could catch (Fray, KuIWCzujtag [00:35:40]). Keep
  `CanValidateAsset` cheap [00:31:47] and watch each validator's cost in 5.8's per-validator cook
  stats (`DataValidation.ReportCookValidationStats`); allow-list legacy errors [00:38:07]; see each
  check fail on a fixture first [01:46:04]. Python validators register every session,
  `-run=DataValidation` runs C++ rules only, and cook validation without `-ValidationErrorsAreFatal`
  turns errors into warnings.
- **Headless for bulk, the open editor for what it holds, and no trust in exit codes.** The
  commandlet loads no level (Python doc) and the registry may still be scanning:
  `wait_for_completion()` before queries (5.8 batch example). A Python failure only logs an error
  unless `-ScriptErrorsAreFatal` (5.5): the verdict is the job's own result line (`P.job_verdict`).
  The editor keeps a write lock on loaded assets (Jamie Dale [01:17:18]): run inside it through MCP
  or Python remote execution. `set_editor_property` behaves like the Details panel; plain attribute
  writes rebuild nothing [00:21:25]. Under Perforce, 5.8's PythonScript commandlet enables source
  control first; check out what you will save and stop if checkout fails (Bardoux [00:55:27]).
  Imports are not undoable: snapshot first.
- **List, confirm, act, one pass per mesh.** Print the resolved targets, then run (Sam Deiter,
  k0tgmrBuIJc [00:52:23]). Set Nanite, LODs and collision in one pass and save once per chunk. A LOD
  group may not build LODs by itself [verify]: count after setting it, build the chain explicitly if
  short, check screen sizes decrease (L02). One bad file never stops the batch.
- **A build is a reproducible command line, proven by booting.** Generate the BuildCookRun line once
  from a Project Launcher profile and diff yours against it (UAT doc; `P.buildcookrun_diff`). Cook
  does not stage, `-skipcook` is not omitting `-cook` (Josh Adams, uxdEt9XXKb8 [00:19:14],
  [00:20:20]); Xcode assembles the `.app` whether or not anyone edits in Xcode [00:03:33] (that
  content-only projects need full Xcode is an inference to verify). Same command locally and on CI
  (Hamilton, 3ftOkc-cA7U [00:25:15]); then boot it (Gauntlet `UE.BootTest`) and stay to watch (Ari,
  102O0FOEzNY [00:39:07]). Performance numbers are trends, not gates (Fray [01:29:38]).

## Establish first

| Input               | Changes                 | Default when the brief is silent                                                                                                                         |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task                | stages                  | new batch: all; changed sources: 2 to 10 with `previous=` (P11); live project adopting rules: 6 with an allow list; build only: 10; artists' button: P12 |
| Source and sidecars | units, normals          | Maya `summary.json` and `<file>.settings.json`, else a scan; normals DirectX unless the sidecar says `opengl`                                            |
| Target platforms    | Nanite, LODs            | PC and console; this Mac (M5 Max) clears the M2 bar for Nanite and VSM                                                                                   |
| Naming              | validator prefixes      | Epic's table (`SM_`, `T_`, `MI_`); Allar only if the project uses it                                                                                     |
| Layout              | destination             | `/Game/<Project>/Art/<Kind>/<Category>/<Base>`, no type folders (Allar 2.6)                                                                              |
| Master material     | instances, vertex color | from scenario-unreal-materials; none: no instances, reported                                                                                             |
| Asset classes       | collision, LODs         | sidecar `asset_class`, else category map, else size (150 cm [added])                                                                                     |
| Editor open?        | channel                 | yes: in-editor; no: headless                                                                                                                             |
| Source control      | checkout                | Perforce: `require_checkout`, `-autocheckout` on resaves                                                                                                 |
| Build               | platform, config        | Mac, Development, archive outside the project                                                                                                            |

## Workflow

1. **Preflight.** `ue_env.preflight()` (chip, Xcode window), `P.project_path_problems`, plugins
   (Python Editor Script, Editor Scripting Utilities, Interchange, Data Validation,
   PythonAutomationTest), editor holding the project, `p4 opened`. GATE: no error line; channel
   chosen (P0).
2. **Plan and stage, offline.** `P.scan_sources`, `P.read_dcc_manifest`,
   `P.plan_imports(..., previous=manifest, policy="PL_Props@3")`, `P.stage_plan`. GATE: items plus
   rejections equal sources; D01 to D07 read; sources byte-identical (P1).
3. **Import policy.** Job `describe`, then `preset` with a route: `post_import` (default: materials
   off, instances built after import with an explicit parameter map) or `interchange_mi` (Material
   Import = Import as Material Instance, Parent Material = master; fills only parameters Interchange
   knows by name). Vertex Color Import Option Ignore unless the master reads vertex color; Generate
   Lightmap UVs off for Lumen. GATE: `failed` empty; `P.pipeline_stack_problems(stack)` clean (P2).
4. **Trial.** `make_fixtures.py` plus 5 to 10 real files. GATE: each broken fixture shows its issue
   id; seconds per file known.
5. **Import.** Headless: job `import` through `ue_run.run_python`; editor open: `P.run_import_plan`
   through MCP or `ue_remote.PythonRemote`; engine calls in P3b. Chunks of 25,
   `unreal.collect_garbage()`. GATE: every file accounted for, `P.job_verdict` exit 0 (P3, P4).

   | Step                                                           | Headless                              | Needs a rendering editor             |
   | -------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
   | import, instances, Nanite, collision, LODs, validators, report | yes (write lock: use the open editor) | no                                   |
   | screenshots, collision and Nanite views                        | no                                    | yes (`mode="latent"`)                |
   | master graph, Blueprint pipelines, Graph Inspector             | no                                    | scenario-unreal-materials or a human |

6. **Validate.** Report carries our issues, `engine_validate` and `ue_audit`; `-run=DataValidation`
   for C++ rules; `P.new_issues(records, allow)` decides CI. GATE: zero new errors; validator cost
   known (P5).
7. **Look.** `ue_contact_sheet_job.py` (latent screenshot loop shown raw in P7), then
   `ue_review.review_images`; open the sheet; collision view on a sample. GATE: no blank frame; a
   note per flagged asset.
8. **Redirectors and check-in.** `redirectors_found` (from the registry) above 0:
   `P.resave_command(uproject, autocheckout=...)`, editor closed. GATE: zero (P8).
9. **Tests.** Python tests (`test_*.py`) via `P.automation_command`, read with
   `P.parse_automation_report`; tiers push, build, weekend (Fray [01:31:46]). GATE: all pass; each
   new test seen failing once (P6).
10. **Cook, package, boot.** Iterate content with `P.cook_command` (cook only) or
    `package_command(..., incremental=True)` (`-cookincremental`, Beta, Zen); release:
    `P.zen_ci_patch`, `P.package_command`, `P.buildcookrun_problems`, `P.buildcookrun_diff` against
    the launcher line, `ue_run.run_uat`, `P.parse_uat_log`, `P.gauntlet_command`. GATE: exit 0,
    `.app` archived, BootTest passes (P9).

## Numbers

| Value                                    | Relative to                    | Source                                 |
| ---------------------------------------- | ------------------------------ | -------------------------------------- |
| 1 uu = 1 cm, FBX 2020.2                  | DCC export                     | Epic; scenario-maya-pipeline-scripting |
| `UCX_` `UBX_` `UCP_` `USP_` + mesh name  | DCC collision                  | Interchange doc                        |
| max 8192, power of two except UI         | textures                       | Allar 7.1, 7.3                         |
| under 1 s each                           | Epic's Smoke flag              | automation doc                         |
| 0.5 to 1 s settle                        | smoke check                    | KuIWCzujtag [01:03:07]                 |
| expected 3 s, limit 4 s                  | functional test time limit     | 3ftOkc-cA7U [00:26:46]                 |
| 20 to 30 min; about 60 min               | staying after a push           | Ari [00:39:07]; Fray [01:56:41]        |
| 26.0 min, 26.1.1 rec., 26.4 incompatible | Xcode for 5.8                  | macOS doc (26.6 here: unlisted)        |
| 25 files per chunk; 150 cm small prop    | save and GC; class split       | [added]                                |
| 3 or 4 LODs by class; halving chain      | LOD minimum; explicit fallback | [added] project defaults               |

## Quality gates

**Measurable:** items plus rejections equal sources; `summary["ok"]`; zero new errors; validators
registered and `engine_validation.ok`; ue_audit `pass`; `redirectors_found` empty; DataValidation
clean; automation `failed` 0; cook with `-ValidationErrorsAreFatal`; `P.job_verdict` exit 0 per job;
launcher diff reviewed; UAT exit 0; `.app` exists; BootTest passes. Rubric:
[`references/critique.md`](references/critique.md).

**Visual:** the contact sheet (scale next to a mannequin, pivot, normal green channel, texture slot,
LOD pops with `r.ForceLOD`), collision view on a sample, Nanite visualization, lookdev under
scenario-unreal-lighting-rendering's rig.

## Common mistakes

| Mistake                                                                        | What it looks like                         | Fix                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| Scripted import without an explicit pipeline                                   | differs from the dialog run                | preset in `override_pipelines`                                |
| Preset changed, assets not reimported                                          | old settings on old assets                 | `policy=` in the plan: reimport with the preset               |
| Importing again instead of reimporting                                         | duplicate beside the planned asset         | `previous=` manifest; I03 stops it                            |
| `destination_name` under Interchange                                           | assets named after the file                | stage under the target name                                   |
| Tweak pipeline above the default one                                           | changes silently lost                      | place it after                                                |
| Deleting unwanted meshes after import                                          | orphan materials                           | disable factory nodes and dependencies                        |
| Nanite by triangle count, or on translucency                                   | costly shadows; default material           | `P.nanite_decision`                                           |
| Python validator never runs                                                    | CI green, editor silent                    | `add_validator` in `init_unreal.py` and each job; `k2_` names |
| Validator path without passes or fails                                         | "not checked"                              | `asset_passes` when clean                                     |
| Trusting a commandlet's exit code                                              | green run, job crashed                     | result line, `-ScriptErrorsAreFatal`, `P.job_verdict`         |
| Registry query at headless start                                               | assets missing from lists                  | `wait_for_completion()` first                                 |
| `EditorAssetLibrary`, `EditorStaticMeshLibrary`, `ScriptingCollisionShapeType` | deprecation warnings, type errors          | subsystems, `ScriptCollisionShapeType`                        |
| LOD group set, LODs never counted                                              | one LOD in the report                      | count, then `set_lods`                                        |
| Saving against an open editor                                                  | locked files                               | in-editor channel                                             |
| One loop over hundreds of files                                                | memory climbs                              | chunks plus `collect_garbage`; batch processor for thousands  |
| `Automation RunTests`; `-nullrhi` for screenshots                              | zero tests run; black images               | `Automation RunTest`; rendering editor                        |
| Hand-typed BuildCookRun; first build Shipping                                  | no `-stage` or `-package`, no app; no logs | launcher line, `P.buildcookrun_problems`; Development first   |

## Handoffs

**Receives:** from scenario-maya-pipeline-scripting, FBX per asset in cm, `UCX_<mesh>_NN`,
`<file>.settings.json`, `summary.json` with sha1; from scenario-zbrush-retopology-export, OBJ in cm,
feet at 0, maps; from Blender, FBX or glTF with DirectX normals or an `opengl` flag
(scenario-blender-uv-baking); from scenario-unreal-materials, master paths, parameter map, whether
the master reads vertex color; from scenario-unreal-lighting-rendering, a lookdev level.

**Delivers:** assets plus `report.json`, `report.csv`, `manifest.json` (sha1 and policy per source)
and the not-verified list. Skeletal items to scenario-unreal-animation, M04 gaps to
scenario-unreal-materials, props to scenario-unreal-world-building. Issues go back by id (D01, D02,
S01 to scenario-maya-pipeline-scripting; T01 to the texturer). Builds go to QA and
scenario-unreal-performance as archive path, UAT verdict, BootTest result and changelist.

## UE 5.8 notes

- Interchange handles FBX (production since 5.5); 5.8 renamed dialog options, added uFBX
  (Experimental), made USD asset import production ready. `InterchangeManager.import_asset` and
  `reimport_asset` return the objects or None (5.8 API).
- `AssetImportTask.result` is deprecated (`get_objects()`); validator overrides are
  `k2_can_validate_asset` and `k2_validate_loaded_asset`; `create_asset` gained
  `overwrite_existing`.
- Batch processor: `BatchProcessLibrary.run_batch`; guard scripts imported from `init_unreal.py`
  with `__main__` (fork bomb).
- Zen cooked output store on by default: `LimitProcessLifetime=false` for CI; cooking inside the
  editor is removed in 5.9.
- Remote Control blocks remote UFUNCTION calls by default: trigger imports through Python remote
  execution or MCP.
- Action utilities with empty SupportedClasses fail validation. The Interchange page still shows
  "Experimental" FBX cvars: read them on install (job `flags`).
- Python 3.11.8.

## References

- [`references/procedures.md`](references/procedures.md): P0 to P14 plus P3b (the raw engine calls),
  each with test path and status.
- [`references/expert-notes.md`](references/expert-notes.md): judgment by source, disagreements and
  deciding conditions.
- `references/critique.md`: rubric for a run, a validator, a test and a build.
- [`references/gui-paths.md`](references/gui-paths.md): menus for the same procedures.
- [`references/sources.md`](references/sources.md): sources, credentials, timestamps, revision
  history.
- `scripts/ue_pipeline.py`, [`scripts/ue_pipeline_job.py`](scripts/ue_pipeline_job.py),
  [`scripts/ue_contact_sheet_job.py`](scripts/ue_contact_sheet_job.py).
