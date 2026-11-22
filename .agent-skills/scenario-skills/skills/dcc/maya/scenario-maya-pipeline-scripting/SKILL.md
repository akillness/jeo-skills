---
name: scenario-maya-pipeline-scripting
description: "Use when writing or fixing Maya pipeline code in Python: mayapy batch jobs over many scenes, validating and auto-fixing scenes, FBX export for Unreal or Unity (static, skeletal, animation clips, Game Exporter), Alembic or GPU caches, USD export, stages and layers, references and namespaces, PySide6 tool windows, OpenMaya 2.0 plug-ins, or slow playback. Also when an FBX lands with wrong scale, normals, tangents or extra takes, a USD export has one frame or smoothed meshes, or one bad file kills a batch."
license: MIT
---

# Maya pipeline scripting (pipeline TD)

Expert pipeline work is contracts plus proof: every file that leaves Maya goes through generated
names, explicit export settings and a re-import check, and no batch trusts one Maya process with two
hundred files. The pipeline TD never types what can be generated, never trusts a default, and
verifies by reading the output back. If a sibling skill named here is missing from your available
skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

**Status (2026-09-24):** every Maya call here is **not yet run in Maya** (not installed).
[`scripts/mx_pipeline.py`](scripts/mx_pipeline.py) ran offline, its Maya layer against fakes. First
action once Maya is installed: `tests/code/maya-pipeline-scripting/run_all.sh`.

## Stance (the expert delta)

- **Never type what can be generated** (Guignolle, Borderlands, lfWkJrkhd2U [00:04:58]): names,
  namespaces, paths and clip ranges come from a manifest; validation sits at the point of action
  (approved-shot warning, scene breakdown, publish diff green, blue, red [00:22:11] to [00:24:57]).
- **Prove it by reading the output back** (dcc-mcp's numbers-over-claims standard; the Maya Help's
  test: the FBX reimports with identical normals, scale, axis and length): re-import in a clean
  scene and compare meshes, triangles, joints, per-mesh bounds, normal directions, units and up
  axis; read takes with `FBXRead`; reopen USD with pxr; hash sources. One mayapy per file: FBX
  settings and optionVars survive `file(new=True)`.
- **Never run blind** (chadrik, maya-mcp-server: without stdout and stderr "the agent is blind"; FBX
  doc: in batch the log is the only feedback on problem files): keep `FBXExportGenerateLog` on and
  read each child's log; children run with `MAYA_DISABLE_ADP=1` and Maya's stderr at `warning`
  (`maya_log="all"` to debug); read `stdout`, `stderr` and `maya_messages` after every bridge call.
- **FBX is global state** (Maya 2027 Help, FBX MEL commands): push, reset, set every option, clear
  the take accumulator, query back and log next to the file, pop. Bake Start and End are never
  stored in presets. Tangents only export on all-triangle meshes; non-orthogonal matrices are
  dropped. Triangulate in Maya with controlled edges (Epic).
- **Export defaults are traps** (maya-usd readme): `frameRange` [1, 1], `defaultMeshScheme`
  catmullClark (no normals), skeletons off, namespaces kept. Pass every flag, then reopen with pxr.
- **At scale, structure beats hardware** (Markowski and Hübschmann, RISE, 8UIW-g1_heg): value clips
  instead of full-range caches [00:37:03]; mute your own layer and every stronger one [00:26:19];
  pin versions, record them in `assetInfo` [00:23:01].
- **Reference edits replay by name and DAG path** (Maya 2027 Help): never rename or restructure a
  published child file; check reference health (unloaded, missing, failed edits) before any fix, and
  after every version swap. Shots reference assets; engines get baked exports.
- **Profile before optimizing, correct before fast** (Roselle, rhtERzmAoUM [00:04:14]; Using
  Parallel Maya 2027): DG, Serial and Parallel must agree first; headless numbers measure
  evaluation, not drawing. Python builds and exports; native nodes evaluate (Fragapane, _0mb4wIZi80
  [00:55:10]).

## Establish first

| Input            | Changes                                  | Default when the brief is silent                                                                     |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Target           | preset, checks, file layout              | Unreal 5, FBX 2020.2, one file per asset, one clip per file                                          |
| Asset kind       | static, skeletal, anim, cache, USD layer | skeletal for rigged scenes, static otherwise                                                         |
| Scene contract   | units, up axis, naming regex             | cm, Y-up, mx_validate defaults, `_geo` suffix (FlippedNormals) if the studio has none                |
| Frame rate       | E27, clip lengths                        | the engine or project rate from the brief; else reported, never resampled                            |
| Allowed fixes    | what may change unasked                  | `history, smooth_preview, unknown_dead, namespaces`; nothing that moves weights, topology or normals |
| Influence limit  | cap or report                            | Unity 4 (Unity manual); Unreal: report the histogram                                                 |
| Source of truth  | names, versions, ranges                  | a JSON manifest next to the output                                                                   |
| Scale of the run | workers, isolation                       | 5-file trial, then `workers=1` or 2, process isolation                                               |

## Workflow

1. **Preflight, inventory, fixtures.** `P.preflight(out, scenes)`: mayapy, localhost and host name
   resolution (macOS batch renders hang on it), disk, readable scenes. `P.find_scenes(root)`. One
   tiny scene per rule, each breaking one thing (`test_engine_checks.py`); the full chain on 5 real
   files. GATE: preflight ok; every fixture caught; time per file known.
2. **Batch.** `P.batch(scenes, job, out, plugins=("fbx",), timeout=900)`: one `mx_run` child per
   scene, script nodes off, `MX_PIPELINE_OUT/STEM/SOURCE` and a per-child FBX log name in the env.
   Jobs return `status`, `issues`, `fixes`, `exports` (`procedures.md` P1). `isolation="session"`
   only for many small trusted files; crashed ones re-run isolated. GATE: one report per scene,
   `summary["sources_untouched"]` True, every non-pass record explained.
3. **Validate, read-only.** Reference health first: `P.reference_issues(P.references_report())` (R01
   unloaded, R02 missing, R03 failed edits, R04 foster parents). Then
   `mx_validate.validate(profile, roots)` and
   `P.check_engine_export(roots, engine, kind, rules={"fps": 30})` (E01 to E27: units, one root,
   names, namespaces, matrices, triangulation, UV and color sets, locked normals, influences,
   collision, pivot, joints, empty meshes, time unit). GATE: issue list per file; nothing changed
   yet.
4. **Safe fixes, then save a version.** Only the allowed fixes; n-gons, non-manifold, facing,
   symmetry, units and joint orientation are reported, never fixed (FlippedNormals, ToWRH4IXF7A
   [00:11:50]). `unlock_normals` and influence caps are opt-in; caps refuse a weight move above 0.1
   [added]. `P.save_version()` writes `<out>/fixed/<stem>_fixed.ma`. GATE: fix log per node;
   re-validation has no new failure.
5. **Export.** `P.fbx_export(path, roots, "unreal_skeletal")` (presets `unreal_`/`unity_` +
   `static`, `skeletal`, `anim`; `P.fbx_commands(preset)` shows the MEL). Animation: bake range
   explicit, one clip per file for Unreal, joints only. Caches: `P.abc_export`
   (`-uvWrite -writeFaceSets`, from the composed shot). USD:
   `P.usd_export(path, roots, frame_range=...)`. GATE: `<file>.settings.json` shows every option
   queried back; the FBX log was found and read (`rep["fbx_log"]`, X05).
6. **Verify in a clean scene.** `P.fbx_takes(path)` (no import), `P.reimport_stats(path)`,
   `P.compare_stats(before, after)`; `P.abc_verify`; `P.usd_verify`. GATE: meshes, triangles, UV
   sets, joint names, per-mesh bounding boxes, normal directions (at most 2% moved), units and up
   axis match; takes = clips + Take001; USD default prim, time range, scheme `none` with normals,
   SkelRoot, metersPerUnit 0.01.
7. **Report and diff.** `summary.json`/`summary.csv`, `P.export_manifest(summary)`,
   `P.publish_diff(previous, current)`. Look at a sample (sheets of fixed files, the engine import).
   GATE: the report lists what was not verified.

The builtin job does stages 3 to 6 per file:
`P.batch(scenes, P.BUILTIN_EXPORT, out, plugins=("fbx",), job_args=["--preset", "unreal_skeletal", "--profile", "rig", "--fps", "30"])`
(`procedures.md` P2).

**Other jobs, same discipline** (`procedures.md`): USD shot layers, one edit target, own and
stronger layers muted (P9); references from the manifest, a clashing namespace raises (P10); OM2
reads through `mx_audit.mfn_mesh`, plug-ins and PySide6 panels (P12, P13); `P.perf_census` then
`P.eval_timing` (P14); GUI parts through `mx_bridge` after checking `modified` (P15).

## Numbers

| Value                                                                             | Relative to                                               | Source                |
| --------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| FBX 2020.2 (`FBX202000` [verify token])                                           | Unreal import                                             | Epic                  |
| cm, scale factor 1.0; 1 Unreal unit = 1 cm                                        | Maya working units                                        | Maya 2027 Help, scale |
| 4 influences per vertex                                                           | Unity default                                             | Unity manual          |
| at least 15 bones, T-pose                                                         | Unity humanoid                                            | Unity manual          |
| `UCX_`/`UBX_`/`USP_`/`UCP_` + mesh name + `_00`                                   | Unreal custom collision                                   | Epic                  |
| `SOCKET_<mesh>_##`, one mesh per file                                             | Unreal sockets                                            | Epic                  |
| Take001 always exists                                                             | FBX take count                                            | Maya 2027 Help        |
| `frameRange` default [1, 1]                                                       | mayaUSDExport                                             | maya-usd readme       |
| 2 GB per layer lost                                                               | USD saved into the Maya file                              | USD for Maya 2027     |
| stdout `none`, stderr `all` (defaults); mx_run: stderr `warning`                  | `MAYA_BATCH_*_LOGGING_LEVEL`                              | devkit 2022; [added]  |
| 0.1 max weight change; 1e-3 of the bbox diagonal; 2% of normals (8 bins per axis) | auto influence cap; round-trip bounds; round-trip normals | [added]               |

## Quality gates

**In code:** preflight ok; batch totals account for every file, sources untouched, no crash stopped
the batch; reference health clean before fixes; validation before fixes and a fix log after; engine
check errors zero (E27 against the target rate); settings sidecar and FBX log per export; round trip
ok per export, normals and axis included; `fbx_takes` count as intended; `usd_verify` ok; breakdown
empty; `eval_timing(...)["consistent"]` before any speed claim; the lint in
`test_offline_snippets_compile.py` clean on generated code. Rubric:
[`references/critique.md`](references/critique.md).

**By eye:** `mx_review` sheets of a sample of fixed files (normals mode after any `unlock_normals`);
a playblast of each cache against its rig; the engine view of a sample import (pivot, collision, LOD
switch, material slots); USD original vs reimport renders when materials travel; a screenshot of any
tool UI.

## Common mistakes

| Mistake                                       | What it looks like                                             | Fix                                                                            |
| --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| One mayapy loop over all files                | file 57 segfaults, 143 never run                               | `P.batch` (one child per file)                                                 |
| FBX options set once, never reset             | second export carries the first one's takes or settings        | `fbx_export`: push, reset, set, clear takes, pop                               |
| FBX log off or never read                     | batch "succeeds", no clue which files had problems (Maya Help) | log on, per-child `MAYA_FBX_LOG_FILENAME`, X05 in the report                   |
| Tangents on quads, exporter triangulation     | tangents wrong; "completely random smoothing" (Epic)           | `polyTriangulate` in Maya with controlled edges, before binding                |
| Shear or non-uniform parent scale             | parts jump or skew after import                                | E05; freeze or rebuild the hierarchy                                           |
| Counts-only round trip                        | smoothing, axis or scale lost with equal counts                | `compare_stats`: per-mesh bounds, normals, units, up axis                      |
| Locked normals after an FBX or OBJ import     | shading frozen while the rig deforms                           | E11 / `locked_normals`; unlock before rigging (`FBXImportUnlockNormals`)       |
| No bake range on animation                    | constrained bones static, wrong length                         | `bake=(s, e)` every time; one clip per file for Unreal                         |
| Scene at 30 fps, sequence at 24               | animation out of step with the engine sequence                 | E27 with `--fps`; fix the source rate                                          |
| mayaUSDExport with defaults                   | one frame, smoothed meshes, no skeleton                        | `P.usd_export` or every flag explicit                                          |
| Unloaded or failed-edit reference             | parts missing, keys lost                                       | R01 to R03 stop the job; `swap_reference`, never rename a child                |
| `MFnMesh` on every shape                      | one empty leftover mesh crashes the file                       | `mx_audit.mfn_mesh`; E24                                                       |
| Auto-fixing n-gons or weights                 | changed silhouette or deformation                              | report them; opt-in cap with a max delta                                       |
| Blind bridge call; batch render hang on macOS | a warning scrolls past; Render never starts                    | read `stdout`, `stderr`, `maya_messages`; preflight, localhost in `/etc/hosts` |

## Handoffs

**Receives from every persona:** a saved version, the `mx_validate` report for the receiving
profile, `mx_audit` numbers, the sheet or playblast the sender looked at, the not-verified list.
scenario-maya-modeling and scenario-maya-retopology-uv: static meshes at the origin, triangulation
stated, UVs, hard edges on seams, normals unlocked unless deliberate; scenario-maya-rigging and
scenario-maya-deformation: a referenceable rig, one deformation skeleton, Skin Tools layers deleted,
influences within the target; scenario-maya-animation: clip names, ranges and the rate;
scenario-maya-fx and scenario-maya-groom: versioned caches with frame ranges; scenario-maya-lookdev:
materials meant to travel (UsdPreviewSurface or MaterialX).

**Delivers:** engine-ready files (`<out>/fbx/`, caches, USD layers) with a settings sidecar and FBX
log each, fixed versions in `<out>/fixed/`, per-file reports, `summary.json`/`.csv`, the manifest
and publish diff, and the not-verified list. Issues go back to the owner by id: E07 and E11 to
scenario-maya-modeling, E14 and E26 to scenario-maya-deformation (Delete Skin Layers keeps the
weights), E02, E13 and E27 to scenario-maya-rigging or scenario-maya-animation.

## Maya 2027 notes

- The FBX options page still calls FBX 2019.2 the default: set the version; 2027 FBX import can read
  user normals (What's New 2027). `MAYA_FBX_LOG_FILENAME` and `MAYA_FBX_LOG_DATETIME_ISO` (2025)
  keep parallel FBX logs apart; the macOS log folder is [verify].
- Batch output: `MAYA_DISABLE_ADP=1` and `MAYA_BATCH_STDOUT/STDERR_LOGGING_LEVEL` (devkit 2022), set
  by mx_run.
- USD for Maya 0.35 to 0.37 across 2027.0 to 2027.2: MaterialX is the default material target on new
  installs (0.34) while the readme says UsdPreviewSurface; `-parentScope` is deprecated for
  `-rootPrim`.
- Alembic is Ogawa only; 2027.2 fixed a UV set order bug on deforming exports.
- `MFnMesh` raises on an empty mesh (2022.1); removed flags and PySide rules: scenario-maya-expert.
- References: 2027.1 fixed an `ls(modified=True)` crash after unloading an ikRPsolver reference;
  2027.2 can crash removing a reference with the Node Editor open.

## References

- [`references/procedures.md`](references/procedures.md): full code for batch jobs, the builtin
  export job, preflight, FBX (static, skeletal, clips, log, verification with normals and axis),
  locked normals, Alembic, GPU cache, USD export and layers, references and their health, publish
  diff, a DG node plug-in, a PySide6 panel, performance, GUI parts. Load before writing any pipeline
  code.
- [`references/expert-notes.md`](references/expert-notes.md): the judgment by source, with
  timestamps, and the disagreements with deciding conditions. Load when a choice depends on the
  brief.
- `references/critique.md`: the rubric per output, and where each H01 to H34 handoff rule is
  measured. Load before reporting a run as done.
- [`references/gui-paths.md`](references/gui-paths.md): menus and options for the same tasks.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs and best
  timestamps.
- `scripts/mx_pipeline.py`: the tested-offline module (docstring lists every function).
