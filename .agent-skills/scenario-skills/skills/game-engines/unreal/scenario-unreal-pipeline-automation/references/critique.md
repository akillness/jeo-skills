# Critique rubric: judging pipeline work like a pipeline TD

Use after every stage and before any delivery. Each row: what the expert looks at, the measurable
proxy (`ue_pipeline` as `P`, the lead's `ue_run`, `ue_audit`, `ue_review`), the pass line, the
severity. **block** = fix before anything leaves; **fix** = fix before delivery; **note** = report,
accept if the brief allows. A run can pass with notes; do not turn a note into a block, and do not
hide a block in a note. All in-editor proxies are not yet run in Unreal.

## A. Intake and plan

| Look at                       | Proxy                                                                     | Pass                                  | Severity                   |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------- | -------------------------- |
| Every source accounted for    | `len(plan["items"]) + len(plan["rejected"]) == len(P.scan_sources(root))` | equal                                 | block                      |
| Rejections explained          | each `rejected[i]["reason"]`                                              | a reason a human can act on           | fix                        |
| Sources never written         | sha1 before and after `P.stage_plan`                                      | identical                             | block                      |
| DCC units and scale           | D01, D02 from `P.sidecar_issues` (Maya settings sidecar)                  | none                                  | block (units), fix (scale) |
| FBX version and exporter log  | D03, D04, D05                                                             | 2020.2, no exporter errors, log found | fix                        |
| Upstream batch failures       | D07 (Maya `summary.json` status)                                          | none imported silently                | block                      |
| Skeletal and animation routed | `action == "handoff"` for skeletal presets                                | listed for scenario-unreal-animation  | fix                        |
| Names from the plan           | `mesh_name`, texture and MI names match the convention                    | `P.check_name` clean                  | block                      |

## B. Import policy

| Look at                                              | Proxy                                                                                       | Pass                                                                  | Severity |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Preset passed explicitly (Interchange PM [00:39:28]) | `plan["meta"]["pipeline"]` set; fake/real import log shows `override_pipelines`             | yes                                                                   | block    |
| Preset properties really set                         | `ensure_pipeline_preset(...)["failed"]`                                                     | empty, or each name fixed from `describe`                             | block    |
| Stack order and no Graph Inspector                   | `P.pipeline_stack_problems(stack)`                                                          | no P02, P03                                                           | block    |
| FBX importer known                                   | job `flags`: `Interchange.FeatureFlags.Import.FBX`                                          | recorded in the report                                                | note     |
| Material route decided                               | `route` in the preset job: `post_import`, or `interchange_mi` with Parent Material = master | chosen for a reason (parameter names match or not)                    | fix      |
| Vertex color                                         | Vertex Color Import Option row in `set`                                                     | Ignore, unless the master reads vertex color                          | fix      |
| Policy versioned                                     | `plan["meta"]["policy"]`; manifest carries `policy` per source                              | set; bumped when the preset changed, and the plan shows the reimports | fix      |
| Materials from DCC not imported                      | no `lambert`/`phong` assets under the destination                                           | none                                                                  | fix      |

## C. Per-asset results

| Look at                                            | Proxy                                                                 | Pass                                                                                                | Severity                         |
| -------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| One mesh per file                                  | I01                                                                   | none                                                                                                | block                            |
| Planned names kept                                 | I02 count; `redirectors_found` (asset registry, not our rename count) | 0 after P8                                                                                          | fix                              |
| No duplicates from re-runs                         | I03                                                                   | none (an I03 item should have been a reimport)                                                      | block                            |
| Nanite by eligibility (VSM doc; Oztalay)           | `decision["nanite"]` reasons; X01, X02                                | no X01; X02 only with a written project opt-out                                                     | block (X01), fix (X02)           |
| Fallback on Nanite meshes (DxBKmQ-0kfw [00:37:15]) | `set_fallback` true for Nanite meshes; fallback settings recorded     | yes                                                                                                 | note                             |
| Collision                                          | C01; `applied["simple_collision_count"]`                              | > 0 except exempt classes                                                                           | block                            |
| DCC collision wins                                 | `decision["collision"]["action"] == "keep"` when UCX came in          | yes                                                                                                 | fix                              |
| LODs on non-Nanite meshes                          | L01, L02; `applied["lod_fallback"]` when the LOD group built too few  | class minimum met, screen sizes decreasing; the LOD count was measured after the group, not assumed | fix                              |
| Instances only, approved parents                   | M01, M02, M03                                                         | no M01, M02                                                                                         | block                            |
| Master has the parameters                          | M04                                                                   | none (else back to scenario-unreal-materials)                                                       | fix                              |
| Textures                                           | T01 to T04                                                            | none                                                                                                | block (T03, T04), fix (T01, T02) |
| Plausible size                                     | S01                                                                   | none, or explained (a real vista)                                                                   | fix                              |
| One file failing alone                             | E01 records vs total                                                  | the rest finished                                                                                   | block if a file stopped the run  |

## D. Validators

| Look at                               | Proxy                                                                                      | Pass                                                      | Severity |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------- |
| Registered this session               | `register_validators()` returns both names; `init_unreal.py` present                       | yes                                                       | block    |
| Contract kept (data validation doc)   | fake and real: exactly one `asset_passes` or at least one `asset_fails` per call           | always                                                    | block    |
| Cheap filter (Fray [00:31:47])        | `k2_can_validate_asset` does a class test only                                             | yes                                                       | fix      |
| Proven on a fixture (Fray [01:46:04]) | each rule has a fixture that fails for the right id                                        | yes                                                       | fix      |
| Red means new                         | `P.new_issues(records, allow)` against a committed allow list                              | 0 new                                                     | block    |
| C++ rules too                         | `-run=DataValidation` summary                                                              | no errors                                                 | block    |
| Cook-time validation                  | `-ValidationErrorsAreFatal` in the cook argv                                               | present                                                   | block    |
| Validator cost                        | 5.8 cook stats (`DataValidation.ReportCookValidationStats`); `validate_paths(...)["cost"]` | ours not dominating; `k2_can_validate_asset` a class test | fix      |

## E. Tests

| Look at                               | Proxy                                                      | Pass          | Severity |
| ------------------------------------- | ---------------------------------------------------------- | ------------- | -------- |
| All tests pass                        | `P.parse_automation_report(dir)`                           | `failed == 0` | block    |
| Tests can fail                        | each new test seen failing once, message says what and how | yes           | fix      |
| Right runner                          | screenshot tests in a rendering editor, not `-nullrhi`     | yes           | fix      |
| Isolation (automation doc guidelines) | no reliance on editor state; files cleaned                 | yes           | fix      |
| Cadence                               | push, build, weekend tiers written in CI                   | yes           | note     |

## F. Visual review

| Look at                                                       | Proxy                                       | Pass                          | Severity |
| ------------------------------------------------------------- | ------------------------------------------- | ----------------------------- | -------- |
| Frames exist and are not blank                                | `ue_review.review_images(paths)` errors     | 0 (no all-white or all-black) | block    |
| Someone looked                                                | a note per flagged asset in the report      | present                       | fix      |
| Scale, pivot, normals, texture slots, LOD pops, collision fit | contact sheet, collision view, `r.ForceLOD` | no visible defect             | fix      |

## F2. Jobs and source control

| Look at                    | Proxy                                                                      | Pass    | Severity |
| -------------------------- | -------------------------------------------------------------------------- | ------- | -------- |
| Job verdict, not exit code | `P.job_verdict(envelope)` (result line present, ok, no Python error lines) | exit 0  | block    |
| Registry ready headless    | `wait_for_completion()` before queries (the job and `ue_run`'s boot)       | yes     | fix      |
| Checkout under Perforce    | `rules["require_checkout"]`; `stopped` None; resave with `-autocheckout`   | no SC01 | block    |

## G. Build

| Look at                     | Proxy                                                           | Pass                                                      | Severity             |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| Argv sane                   | `P.buildcookrun_problems(cmd)`                                  | no `error:`; no "-archive without -package"               | block                |
| Matches the launcher        | `P.buildcookrun_diff(cmd, launcher_line)`                       | every missing or differing flag decided, with a reason    | fix                  |
| Build succeeded             | `P.parse_uat_log(text)["ok"]`, exit code 0                      | yes                                                       | block                |
| App exists                  | `.app` under the archive directory                              | yes                                                       | block                |
| Boots                       | Gauntlet `UE.BootTest`                                          | pass                                                      | block                |
| Development before Shipping | `-clientconfig`                                                 | Development or Test for test builds                       | fix                  |
| CI Zen setting              | `[Zen.AutoLaunch] LimitProcessLifetime=false` on build machines | set                                                       | note                 |
| Xcode window                | `ue_env.preflight()`                                            | not `incompatible` or `too_old`; `unlisted` verified once | block (incompatible) |

## H. The report

| Look at                   | Proxy                                                       | Pass                 | Severity |
| ------------------------- | ----------------------------------------------------------- | -------------------- | -------- |
| Matches reality           | counts in `summary` equal records; failures listed with ids | yes                  | block    |
| Not-verified list         | `report["not_verified"]`                                    | present and specific | fix      |
| Manifest for the next run | `manifest.json` with sha1 per source                        | present              | fix      |
| Handoffs by id            | D, S, I, T, M04 issues routed to their owner                | listed               | note     |
