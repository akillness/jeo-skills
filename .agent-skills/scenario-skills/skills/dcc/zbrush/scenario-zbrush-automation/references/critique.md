# scenario-zbrush-automation critique rubric

What a pipeline TD checks before calling a batch, a script or a round trip done. Score each line
pass, fix or fail; any fail blocks delivery. Sources are in expert-notes.md; `[added]` lines are
this skill's own standards.

## A. Design of the job

| Check         | Pass when                                                                  | Why                                                                      |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Isolation     | each file is its own tool, each step its own call with a timeout           | one stuck plugin must not take the batch (marcus_civis; ijacobs; cgside) |
| Order         | checkpoint ZTL before destructive stages; the riskiest plugin last         | ProjectAll "might crash" (cgside [00:02:19]); no undo control (SDK stub) |
| Dialog budget | every step's modal risk listed and avoided or handed to a human            | popups are the automation killer (TVeyes; danvas; m_adam)                |
| Names         | inputs staged under unique sanitized names; `check_names` clean before GoZ | GoZ and plugin caches key on names (GoZ docs; DM and UV Master docs)     |
| Paths         | every item path confirmed by `exists` or the Activity log; none guessed    | `set()` on a wrong path is silent (v03)                                  |
| Ownership     | the job never restarts or quits a ZBrush it did not start                  | the user's unsaved work [added]                                          |
| Install       | nothing written into the install; absolute paths only                      | read-only since 2026.1; cwd is the app folder                            |
| Dry run       | `plan()` reviewed before the first file                                    | cheap, catches wrong paths and params [added]                            |

## B. Evidence per file

| Check        | Pass when                                                                                                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import       | points and faces equal the file's; the tool carries the staged name                                                                                                                                                                                               |
| Remesh       | DynaMesh changed the mesh; ZRemesher within 0.5 to 1.5 of target [added]; each `gate` has no problem (volume ratio in band on a closed mesh, still watertight)                                                                                                    |
| Low topology | with several pieces, Auto Groups then Keep Groups: one group per piece, the low does not bridge pieces (cgside)                                                                                                                                                   |
| UVs          | UV bbox inside 0..1; the low OBJ has `vt` lines                                                                                                                                                                                                                   |
| Projection   | each Divide x4; top level at least the source's faces (else detail is lost); a `_preproject_vNNN.ztl` saved before the first Project All; morph target on every pass, a layer on the last; Dist 0.1; gate: points kept, nothing outside the visible bbox (spikes) |
| Maps         | file at the asked size; not uniform; tangent-like (blue >= 128 on 90 %) [added]; flips stated                                                                                                                                                                     |
| Preview      | faces near the target; triangles; silhouette kept on the sheet                                                                                                                                                                                                    |
| Scale        | low bbox equals the input bbox within 2 % [added]; Export Scale recorded                                                                                                                                                                                          |
| Files        | every output exists, is non-empty and is newer than the job start                                                                                                                                                                                                 |

## C. The batch

| Check    | Pass when                                                                                     |
| -------- | --------------------------------------------------------------------------------------------- |
| Report   | `report.json` written after every file; every non-ok file has a step, an outcome and an error |
| Recovery | hangs have evidence (screenshot or diagnose); blocked capabilities listed; fallbacks named    |
| Resume   | a rerun skips finished files (sha1 and recipe hash) and redoes only failed ones               |
| Look     | `sheet.png` opened and judged: no melted parts, no spikes, nothing missing                    |
| Honesty  | the delivery says which steps are unverified in ZBrush and which checks are only numeric      |

## D. Round trips

| Check           | Pass when                                                                               |
| --------------- | --------------------------------------------------------------------------------------- |
| Identity        | the right SubTool updated (names unique across loaded tools)                            |
| Level           | the level sent is the one intended (GoZ sends the lowest)                               |
| Axes and scale  | an asymmetric feature lands on the same side in both apps; size in real units matches   |
| Maps            | orientation checked in the target app with side light; green channel matches the engine |
| Topology change | handled by import as a new SubTool plus Project All, not by a blind reprojection prompt |

## E. Scripts and macros handed to others

| Check              | Pass when                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared interpreter | no module left on `sys.path` or in `sys.modules`; no change to `sys`, `math`, `random`, no `os.chdir` (SDK Style Guide); `zb_launch.hygiene()` returns empty lists after the batch |
| Long sequences     | deterministic runs grouped under `freeze` and `show_actions(0)` (`zb_ops.sequence`); no plugin press or canvas export inside                                                       |
| User state         | material, brush, Draw values, active SubTool restored (shipped macro house style)                                                                                                  |
| Blocking calls     | no `message_*`, `ask_*`, `show_note(duration 0)`, no `time.sleep` inside ZBrush                                                                                                    |
| Macro install      | subfolder, 8+ character name, restart noted, user consent recorded                                                                                                                 |
| Docs               | every function states its evidence tag and its live test                                                                                                                           |

## Red flags that fail a delivery at once

- A report that says "done" without a looked-at sheet or without per-file numbers.
- A batch that pressed FBX ExportImport or USD Format unattended.
- A normal map exported in world space for an engine.
- Outputs written over earlier outputs without a `.bak` or a new version.
- A "verified" label on code that did not run in ZBrush.
- A Project All without a checkpoint ZTL saved just before it, or projection spikes smoothed instead
  of morphed back.
