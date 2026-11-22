# Critique rubric (scenario-godot-pipeline-automation 0.1)

Score each line 0 (missing), 1 (partly), 2 (done and evidenced). Ship at 2 on every line marked
**must**; otherwise report the gap in plain words.

## Batch import

| Check                                                          | Evidence that earns a 2                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **must** Counts reconcile                                      | accepted + warned + rejected + duplicates = files in the drop, from the ingest result            |
| **must** Every reject and warn has a reason a human can act on | `props_manifest.json` reasons, grouped counts in the report                                      |
| **must** AI files found by manifest, not by generator          | `source` column used; no `asset.generator` test                                                  |
| **must** Scale policy per source                               | DCC: authored size after unit fix; AI: fitted to `height_m`; both visible in the `pipeline` meta |
| **must** Zero engine errors in each stage                      | `engine_errors` 0 for ingest, both imports, texture pass, audit                                  |
| Settings decided before the first import                       | sidecars written by ingest; only one texture pass                                                |
| Textures VRAM-compressed for the targets                       | `.s3tc.ctex` (and ETC2/ASTC when mobile or macOS universal) in `.godot/imported`                 |
| Idempotent                                                     | a rerun copies 0, writes 0 sidecars, reimports 0 files                                           |
| Incremental                                                    | one changed source reimports only its own files                                                  |
| `project.godot` checked                                        | Jolt, renderer, plugin line read back from the file                                              |

## Tests

| Check                                                              | Evidence                                       |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| **must** Suite exit code and JUnit both read                       | exit 0 and parsed `results.xml` with tests > 0 |
| **must** A planted failure makes the run fail                      | exit 100 (gdUnit4) or the CI script exit 11    |
| Tests assert behavior (signals, public results), not private state | review of the suite                            |
| Every wait bounded                                                 | `wait_until(ms)` or a timeout on each await    |
| Pure rules tested without files                                    | literal dictionaries and in-memory GLBs        |
| One audit function shared by the job and the suite                 | `check_prop()` called from both                |

## Visual

| Check                                                          | Evidence                                           |
| -------------------------------------------------------------- | -------------------------------------------------- |
| **must** Contact sheets opened and read                        | sheet paths named in the report with what was seen |
| Scale reference visible in every thumbnail                     | red 1 m post in frame                              |
| No black, missing or untextured prop that should have textures | sheet review; metallic props need a sky to reflect |

## Export and CI

| Check                                            | Evidence                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| **must** Artifact judged by file, not exit code  | file exists, size > 0, listing or `verify_pack`                      |
| **must** No dev folders in the pack              | listing has no gdUnit4, GUT, tests, agent tools, editor-only plugins |
| Linux executable bit preserved                   | mode read back from the tar                                          |
| CI script run locally before the YAML is trusted | local exit 0 and planted failure exit 11                             |
| Workflow linted and URLs checked                 | actionlint clean; HEAD 200 on each download                          |
| Downloads verified                               | SHA-512 against the release sums file, exact names, 2 lines matched  |
| Not-run parts named                              | "workflow not run on GitHub runners" stated when true                |

## Editor tooling, extensions, agents

| Check                                         | Evidence                                                   |
| --------------------------------------------- | ---------------------------------------------------------- |
| Editor edits undoable                         | undo and redo restore the scene in a test                  |
| New nodes saved                               | `owner` set; saved `.tscn` contains them                   |
| Custom importer fails cleanly on bad input    | readable error line, `valid=false` in the sidecar          |
| Format version bump reimports                 | `importer_version` read back after `reimport_files()`      |
| Extension smoke test                          | `ClassDB.class_exists` and one bound call after `--import` |
| MCP server project-local, headless tools only | no client config edited; GUI tools listed as not called    |
| Godot runs hold the shared lock               | every run through `gd_run` or inside `godot_slot`          |

## Report

- Numbers carry what they are relative to (this drop, this Mac, this version).
- Observations from small samples are called observations, with the count ("4 of 5 runs").
- Anything not run says why.
