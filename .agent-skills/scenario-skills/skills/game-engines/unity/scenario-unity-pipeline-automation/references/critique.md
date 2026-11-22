# Critique rubric: judging a pipeline, a layout, a build, a release

Score each line pass / warn / fail with its evidence (envelope field, NUnit total, layout number,
frame you opened). A pipeline is done when every "must" line passes; a warn needs a written reason.
Thresholds are this skill's defaults unless the brief sets others.

## 1. Import rules

| Check                                                                                            | Must                                        | Evidence                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Rules live in one versioned file read by the postprocessor, the jobs and the tests               | yes                                         | `Assets/Settings/Pipeline/prop_import_rules.json`, `context.DependsOnSourceAsset` in the postprocessor           |
| Importer settings set in `OnPreprocess*`, never in `OnPostprocess*`                              | yes                                         | code review                                                                                                      |
| `GetVersion()` bumped in the same change as any postprocessor code change                        | yes                                         | diff                                                                                                             |
| Editing the rules reimports only the governed assets                                             | yes                                         | `TextureSizes` before and after (P4): governed changed, outside unchanged                                        |
| No asset creation, move or reimport inside import callbacks; no clocks, no unsorted dictionaries | yes                                         | grep for `CreateAsset                                                                                            | MoveAsset | ImportAsset | DateTime | Dictionary` in postprocessors |
| Normal maps are `NormalMap`, data maps are linear, color maps sRGB                               | yes                                         | audit findings `pipeline.normal_type`, `pipeline.srgb` = 0                                                       |
| Source textures above the budget are capped by the importer, not resized by hand                 | yes                                         | audit `clamped` lists source vs imported size                                                                    |
| Model transforms: rotation 0, scale 1 on every node                                              | warn allowed with a named re-export request | audit `pipeline.rotation`, `pipeline.transform_scale`                                                            |
| Importers proven deterministic after any postprocessor or ScriptedImporter change                | yes                                         | `up.consistency_check`: summary line seen, nothing flagged under `Assets/` (package paths in a written baseline) |
| Only import settings in the rules file the postprocessor depends on                              | yes                                         | gate and release settings live in `pipeline_checks.json`; a rules edit reimports every governed asset            |
| Postprocessor changes batched: one `GetVersion()` bump per change set                            | warn                                        | counters of the next launch (a bump reimports every asset of that importer type, packages included)              |

## 2. Naming and the drop

| Check                                                                                  | Must | Evidence                                |
| -------------------------------------------------------------------------------------- | ---- | --------------------------------------- |
| Every reject has a reason; nothing ambiguous is guessed (duplicates reject all copies) | yes  | ImportDrop `rejected`                   |
| Renames are listed (from, to) and reproducible offline                                 | yes  | `renamed`, same result from `scan_drop` |
| Stray files ignored and listed                                                         | yes  | `ignored_files`                         |
| Rejected props already in the project are flagged, never deleted                       | yes  | props manifest `status: rejected`       |

## 3. Scripted edits (editor tools, agent jobs)

| Check                                                                                                                               | Must                | Evidence                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| Edits through SerializedObject, or `Undo.RecordObject` on the exact component before the change                                     | yes                 | code review; UndoProof                                                                          |
| Structure changes through `Undo.RegisterCreatedObjectUndo`, `AddComponent`, `SetTransformParent`, `DestroyObjectImmediate`          | yes (user's editor) | code review                                                                                     |
| One named undo group per user-visible action                                                                                        | yes (user's editor) | `Undo.GetCurrentGroupName()` in the envelope                                                    |
| Prefab instance direct edits followed by `RecordPrefabInstancePropertyModifications`                                                | yes                 | `PrefabUtility.GetPropertyModifications` shows the property                                     |
| ScriptableObject and material edits followed by `SetDirty`                                                                          | yes                 | file on disk changes                                                                            |
| Prefab assets edited with LoadPrefabContents / SaveAsPrefabAsset / UnloadPrefabContents, not by instantiating into the user's scene | yes                 | code review                                                                                     |
| No `.material` / `.mesh` accessors in editor code; temporary objects `HideAndDontSave`                                              | yes                 | grep                                                                                            |
| The user's open scene is never replaced; a dirty scene is never discarded                                                           | yes                 | job refuses, or uses a preview or additive scene                                                |
| Second run changes nothing                                                                                                          | yes                 | `diff_hashes(before, after)["count"] == 0`, and `git status --porcelain` empty in a repo        |
| `SaveAndReimport` / `ImportAsset` of many assets inside `StartAssetEditing` / `StopAssetEditing`                                    | yes                 | code review; `remap_assetdb` imports equal the FBX count, seconds a quarter of one-by-one       |
| Cost of a job reported from the AssetDatabase counters                                                                              | yes                 | `import_assetdb`, `remap_assetdb`, `up.counters` (imports, domain reloads), not wall time alone |
| Pipeline code that tests must call is in an Editor asmdef, its tests in a test asmdef                                               | yes (project code)  | asmdef JSON; no test asmdef naming Assembly-CSharp or Assembly-CSharp-Editor types              |

## 4. Addressables layout

| Check                                                                             | Must | Evidence                                                                                               |
| --------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| Groups follow loading conditions (labels or roots), not folders                   | yes  | `AssignGroups` groups list                                                                             |
| No implicit dependency in two groups before the build                             | yes  | `implicit_duplicates == 0`                                                                             |
| No duplicated asset in the built layout (textures AND shaders)                    | yes  | `layout.duplicated_assets == 0`                                                                        |
| Bytes loaded per label within the brief's budget; worst label reported            | yes  | `layout.per_label`                                                                                     |
| No "one shared bundle for everything" unless every label needs most of it         | warn | isolate vs condition numbers                                                                           |
| Tiny condition groups merged when their overhead matters                          | warn | bundle count, per-label deltas                                                                         |
| Typed `AssetReference` or labels in runtime code, no string literals              | yes  | grep `LoadAssetAsync<...>("`                                                                           |
| Every load has a release path; nothing `WaitForCompletion` on WebGL or in `Awake` | yes  | code review; player smoke unload                                                                       |
| No bundle near 4 GB                                                               | yes  | `per_bundle[].size_kb`                                                                                 |
| Labels and groups created in ordinal order by the assignment script               | yes  | code review (the label table keeps insertion order; entries and groups are sorted by GUID on save)     |
| No group asset created or copied under `Assets/` outside the settings' folder     | yes  | Addressables adopts any imported group into the default settings                                       |
| No build scene references Addressable content                                     | yes  | `up.hard_references` ok; `AGENT_GATE.hard_references == 0`; shader-only references listed as a warning |

Other layout pitfalls to call out: a few props shared across biomes left in their folder group
(loading one biome loads another biome's whole bundle): label them and pack by condition.

## 5. Content build and CI

| Check                                                                                                            | Must                               | Evidence                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform fixed at launch (`-buildTarget` / `-activeBuildProfile`), one process per target                        | yes                                | command line in the envelope `cmd`                                                                                                                |
| The SAME platform on every stage of one run, tests included                                                      | yes                                | every envelope's `active_target` equal (`run_pipeline`, the CI script's check); counters of each launch near 0 imports                            |
| With Accelerator: `-cacheServerWaitForUploadCompletion` on `-quit` jobs, and proof the cache was used            | yes                                | command line; `Imports: total=... cache server=N` log line or `cache_artifacts_downloaded` above 0                                                |
| Clean content build in CI (`ClearCachedData`, `PurgeCache(false)`), builder index checked `>= 0`                 | yes                                | BuildContent result                                                                                                                               |
| The player ships the content that was built and archived (`DoNotBuildWithPlayer` + gate), or rebuilds on purpose | yes                                | `build_with_player`, `AGENT_GATE.content_present`                                                                                                 |
| `addressables_content_state.bin` archived per platform per release when remote updates exist                     | yes                                | `content_state_archived`                                                                                                                          |
| Tests before the build, `-runTests` without `-quit`, failures named                                              | yes                                | NUnit XML, exit code 0 or 2                                                                                                                       |
| Pre-build gate logs its pass and fails with `BuildFailedException`                                               | yes                                | `AGENT_GATE` line in the build log                                                                                                                |
| BuildReport `Succeeded`, size and time recorded, largest files listed                                            | yes                                | `agent_build_report.json`                                                                                                                         |
| Player smoke: labels load in the built player with the expected counts                                           | yes                                | `AGENT_SMOKE`                                                                                                                                     |
| CI script passes from a checkout without `Library/`; license seat returned `if: always()`                        | yes                                | CI run log; workflow review                                                                                                                       |
| Workflow inputs reach Unity through `customParameters` / arguments, not env vars (GameCI)                        | yes                                | workflow review                                                                                                                                   |
| Release: clean tree, no forbidden defines, provenance kept                                                       | yes                                | `up.release_ready` ok; `-agentRelease` gate line; `unity-build.provenance.json` `source.dirty == false` (copied out of the `.app` before signing) |
| Build Profiles created from a committed template, not the internal API                                           | warn allowed for the first profile | `CreateBuildProfile` result `route`                                                                                                               |
| Tests that reimport or load assets expect the errors they provoke                                                | yes                                | `LogAssert.Expect` in the test; no "Unhandled log message" failures                                                                               |

## 6. Visual

| Check                                                                         | Must | Evidence                                     |
| ----------------------------------------------------------------------------- | ---- | -------------------------------------------- |
| Lineup frames pass `image_checks` (no all-white, all-black, uniform, magenta) | yes  | `ut_review.review_capture`                   |
| You opened the contact sheet and say what you saw                             | yes  | the report names the sheet path and findings |
| Props upright, on the ground, plausible size next to the 1.8 m capsule        | yes  | lineup                                       |
| Normal maps shade (no flat or inverted lighting)                              | yes  | lineup at a grazing light                    |

## 7. Report

- Each step names its Unity call (toolkit call plus the API or command line behind it), then
  **Verified** (what ran, job id, numbers, frame) and **Assumed** (not run, `[verify]`, defaults,
  numbers quoted from a source).
- Numbers are relative to something: "4.8 MB for the dungeon label (was 12.9 MB with the isolation
  group)", never "smaller bundles".
