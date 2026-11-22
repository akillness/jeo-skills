# Procedures: pipeline scripting for Maya 2027

**Status: not yet run in Maya.** Maya 2027 was not installed when this was written (2026-09-24).
Nothing below is "verified on Maya 2027.x" yet. What did run: the pure-Python layer of
`scripts/mx_pipeline.py` (batch runner through a fake mayapy, FBX command lists, FBX log parsing and
lookup, round-trip comparison with normals and axis, Alembic job strings, USD flag sets, weight
capping, matrix and naming checks, time unit and reference health, preflight, diffs) with python3,
in `tests/code/maya-pipeline-scripting/test_offline_pure.py` and `test_offline_batch.py`; the Maya
layer's new checks (E11, E24, E27, `scene_stats`) against a fake Maya in
`test_offline_fake_checks.py`; and a syntax compile of every block in this file
(`test_offline_snippets_compile.py`). Once Maya is installed:
`tests/code/maya-pipeline-scripting/run_all.sh`, then replace each "not yet run" below with the
version it ran on.

Two layers, same as the lead skill:

1. **`scripts/mx_pipeline.py`**: use it whenever a file can be imported (headless through `mx_run`,
   or in the GUI through `mx_bridge`, whose server puts the scenario-maya-expert scripts on
   `sys.path`; add this skill's `scripts/` yourself). Import:
   `import sys; sys.path.insert(0, "<skills>/scenario-maya-pipeline-scripting/scripts"); import mx_pipeline as P`
   (it adds `scenario-maya-expert/scripts` itself).
2. **Raw snippets** for when only inline code is possible. Blocks tagged `# snippet:` are executed
   verbatim, each in a new scene, by `tests/code/maya-pipeline-scripting/test_snippets.py` (it
   injects `OUT`, an output folder whose path contains spaces, and `SKILL_SCRIPTS`).
   `# job-snippet:` blocks run as batch jobs; `# plugin:` is loaded by `test_om2_node_plugin.py`;
   `# gui-snippet:` runs through the bridge in `gui_smoke.py`.

[verify] marks a flag or behavior no saved 2027 page states; [added] marks this skill's own rule.

---

## P1. Batch over many scenes, one mayapy per file

Tests: `test_offline_batch.py` (fake mayapy, passed), `test_batch_builtin.py` (real mayapy).

```python
# parent side: any python3 (or mayapy); nothing here imports maya
import sys
sys.path.insert(0, "/abs/skills/scenario-maya-pipeline-scripting/scripts")
import mx_pipeline as P

scenes = P.find_scenes("/abs/assets/characters")          # *.ma *.mb; skips archive/, versions/, incrementalSave/
s = P.batch(scenes, "/abs/jobs/validate_report_job.py", "/abs/out/validate_2026-09-24",
            plugins=("fbx",), timeout=900, workers=1)      # measure 5 files, then raise workers
print(s["totals"], s["failed"], s["sources_untouched"])
```

Shell:
`python3 mx_pipeline.py batch --files /abs/assets --job /abs/job.py --out /abs/out --timeout 900 -- --my-job-flag 1`.

What the runner guarantees (`test_offline_batch.py` checks each): one child per scene through
`mx_run.run_subprocess` (crash, hang or leak costs one file); statuses
`pass | fixed | warn | fail | error | crash | timeout | maya_init_failed | no_mayapy`;
`reports/<stem>.json`, `logs/<stem>.log`, `summary.json`, `summary.csv`; stems stay unique when two
folders hold the same file name; source sha1 before and after (`source_untouched`, a job that writes
its source is caught); `save_as` never over the source (mx_run refuses); per-child
`MAYA_FBX_LOG_FILENAME` (parallel sessions otherwise collide on the FBX log name, What's New in Maya
2025); every child also gets `MAYA_DISABLE_ADP=1` (analytics off in batch) and
`MAYA_BATCH_STDOUT_LOGGING_LEVEL=none` / `MAYA_BATCH_STDERR_LOGGING_LEVEL=warning` from
`mx_run.child_environment` (devkit What's New 2022; the stderr level is this toolkit's choice), and
`batch(..., maya_log="all")` raises Maya's stderr level when a file fails without a message;
`resume` reuses finished reports and re-runs transient failures, a changed source or changed job
arguments.

Before the first file: `P.preflight(out_dir, scenes)` (or
`python3 mx_pipeline.py preflight --out OUT --files DIR`) checks mayapy, that `localhost` and this
Mac's host name resolve at once (batch renders hang on localhost resolution:
`127.0.0.1 localhost <hostname>` in `/etc/hosts`, Python in Maya 2027, Troubleshoot Maya hangs),
free disk, readable scenes, and lists the FBX log folders that exist.

`isolation="session"` runs `chunk` files per mayapy with `file(new=True, force=True)` between them.
FBX settings, optionVars, loaded plug-ins and the undo queue survive a new scene, which is why
process isolation is the default. A file that crashes a session and the files after it are re-run in
process mode automatically.

### The job contract

```python
# job-snippet: validate_report_job
"""Batch job: read-only validation report for one scene. Runs inside mayapy through
mx_pipeline.batch, which opens the scene (script nodes off) and puts the toolkits on PYTHONPATH."""
import maya.cmds as cmds
import mx_validate
import mx_pipeline as P


def main(argv):
    roots = P.auto_roots()                          # top nodes holding meshes or joints
    v = mx_validate.validate(profile="model", roots=roots or None)
    issues = [{"id": "V:" + c["id"], "severity": "error" if c["status"] == "fail" else "warning",
               "msg": c["message"], "count": c["count"]}
              for c in v["checks"] if c["status"] in ("fail", "warn")]
    if roots:
        issues += P.check_engine_export(roots, "unreal", "static")
    errors = [i for i in issues if i["severity"] == "error"]
    warnings = [i for i in issues if i["severity"] == "warning"]
    return {"status": "fail" if errors else ("warn" if warnings else "pass"), "issues": issues,
            "scene": cmds.file(q=True, sceneName=True), "stats": P.scene_stats(roots) if roots else None}
```

Return keys the runner reads: `status`, `issues` (`severity` error, warning or info), `fixes`,
`exports` (`path`, `kind`, `sha1`). Anything else is kept in the report. Env vars `MX_PIPELINE_OUT`,
`MX_PIPELINE_STEM`, `MX_PIPELINE_SOURCE` say where to write. A job that fixes something saves with
`P.save_version()` (writes `<out>/fixed/<stem>_fixed.ma`, refuses the source path).

## P2. The builtin validate, fix, export, verify job (scenario M8)

Test: `test_batch_builtin.py`.

```python
s = P.batch(scenes, P.BUILTIN_EXPORT, "/abs/out/unreal_2026-09-24", plugins=("fbx",), timeout=900,
            job_args=["--preset", "unreal_skeletal", "--profile", "rig",
                      "--rules", '{"name_patterns": {"mesh": ".+_geo$", "joint": ".+_jnt$"}}'])
```

Shell:
`python3 mx_pipeline.py export --files /abs/assets --out /abs/out --preset unreal_skeletal -- --profile rig`.

Order inside each child (`export_job` in the module): 0. Reference health (`references_report`,
`reference_issues`): an unloaded or missing reference, or failed edits, stop the job before any fix
(R01 to R03; `--export-on-fail` overrides).

1. Stats of the source (`scene_stats`: counts, per-mesh bounds, normal signatures, locked normals,
   units, up axis, time unit).
2. `mx_validate.validate(profile, roots, rules, fix=...)` with the safe fixes
   `history, smooth_preview, unknown_dead, namespaces` in one call: mx_validate holds the roots by
   UUID across fixes and returns `roots_after`, and the skinCluster's bind pose is not history
   (toolkit fixes of 2026-09-24; the job's own workarounds were removed). `unlock_normals` is
   available but not in the default list.
3. Optional `--cap-influences N`: only if no weight moves by more than `--cap-max-delta` (0.1)
   [added]; else reported for scenario-maya-deformation.
4. If anything was fixed: `save_version()` writes `<out>/fixed/<stem>_fixed.ma`. The source is never
   written.
5. Export-time only (never saved): `--triangulate` triangulates unskinned quad meshes.
6. `check_engine_export` (with `--fps` for E27). Errors stop the export unless `--export-on-fail`;
   `--downgrade V:file_paths,E12` turns chosen errors into warnings.
7. `fbx_export` into `<out>/fbx/<stem>.fbx`, settings sidecar next to it; the exporter's log is
   found and parsed (`fbx_log`, X05: error lines are warnings unless `--fbx-log-strict`, a missing
   log is a warning); `reports/<stem>.partial.json` is written before verification so a crash there
   keeps the export record.
8. `fbx_takes` (FBXRead, no import), `reimport_stats` in a new scene, `compare_stats`: meshes,
   triangles, faces, UV set count, joint names, overall and per-mesh bounding boxes, normal
   directions (`--normals-tol`, default 2%), linear unit and up axis must match (X02); vertex count
   differences, a changed range and normals that came back locked are notes (X06) [verify how FBX
   re-import splits vertices and whether the new scene's range follows the take].
9. Status: `fail` if any error, else `fixed` if fixes, else `warn` if warnings, else `pass`.

Do not combine the builtin job with `save_as` (it re-imports into a new scene; `batch` refuses).

## P3. FBX for Unreal: static mesh, raw MEL

Tests: `test_snippets.py` (this block), `test_fbx_export.py` (the module version).

```python
# snippet: fbx_static_raw
import os
import maya.cmds as cmds
import maya.mel as mel

if not cmds.pluginInfo("fbxmaya", q=True, loaded=True):
    cmds.loadPlugin("fbxmaya")
crate = cmds.polyCube(name="crate_geo", width=60, height=40, depth=40)[0]   # demo asset, base at the origin
cmds.move(0, 20, 0, crate)
cmds.makeIdentity(crate, apply=True, translate=True)
cmds.xform(crate, pivots=(0, 0, 0), worldSpace=True)
cmds.polyTriangulate(crate)                       # tangents only export on all-triangle meshes
cmds.delete(crate, constructionHistory=True)

path = os.path.join(OUT, "crate static.fbx").replace("\\", "/")
opts = ["FBXResetExport",
        "FBXExportFileVersion -v FBX202000",      # Unreal's pipeline uses FBX 2020.2 [verify token]
        "FBXExportUpAxis y", "FBXExportConvertUnitString cm", "FBXExportScaleFactor 1.0",
        "FBXExportSmoothingGroups -v true", "FBXExportHardEdges -v false", "FBXExportSmoothMesh -v false",
        "FBXExportTriangulate -v false", "FBXExportTangents -v true",
        "FBXExportSkins -v false", "FBXExportShapes -v false", "FBXExportConstraints -v false",
        "FBXExportCameras -v false", "FBXExportLights -v false", "FBXExportInputConnections -v false",
        "FBXExportEmbeddedTextures -v false", "FBXExportBakeComplexAnimation -v false",
        "FBXExportGenerateLog -v true", "FBXExportSplitAnimationIntoTakes -c"]
sel = cmds.ls(sl=True, long=True) or []
mel.eval("FBXPushSettings")                       # the user's settings come back in finally
try:
    for o in opts:
        mel.eval(o)
    effective = {}
    for o in opts[1:-1]:
        name = o.split()[0]
        try:
            effective[name] = mel.eval(name + " -q")
        except RuntimeError as exc:               # FileVersion and ConvertUnitString document no -q
            effective[name] = "no -q: %s" % exc
    cmds.select(crate, replace=True)              # FBXExport -s exports the selection
    mel.eval('FBXExport -f "%s" -s' % path)
finally:
    mel.eval("FBXPopSettings")
    if sel:
        cmds.select(sel, replace=True)
    else:
        cmds.select(clear=True)
assert os.path.isfile(path), path
result = {"fbx": path, "settings": effective}
```

Before any static export (Epic, FBX Static Mesh Pipeline): the exported origin is the Unreal pivot,
so model at the origin (often a corner or the base center for grid snapping); triangulate in Maya
with controlled edges; collision meshes `UCX_`, `UBX_`, `USP_`, `UCP_` plus the exact render mesh
name plus `_00`, `_01`, in the same file (only the first mesh's custom collision is imported per
file); sockets `SOCKET_<mesh>_##` only in single-mesh files; LODs share pivot and space; only Color
and Normal maps auto-connect on import. `P.check_engine_export(roots, "unreal", "static")` measures
the ones code can measure (E05, E07, E12, E17, E18).

Module version: `P.fbx_export(path, roots, "unreal_static")` does the same plus engine checks first,
the query log in `<path>.settings.json`, and selection restore. `P.fbx_commands("unreal_static")`
prints the MEL it will run.

## P4. Skeletal mesh and animation clips for Unreal and Unity

Tests: `test_fbx_export.py`, `test_snippets.py` (block below).

```python
# snippet: fbx_anim_per_clip
import os
import sys
import maya.cmds as cmds
sys.path.insert(0, SKILL_SCRIPTS)                 # <skills>/scenario-maya-pipeline-scripting/scripts
import mx_pipeline as P

cmds.select(clear=True)
root = cmds.joint(name="root_jnt", position=(0, 0, 0))       # demo skeleton
hip = cmds.joint(name="hip_jnt", position=(0, 90, 0))
cmds.select(clear=True)
for t, v in ((1, 0), (12, 20), (24, 0), (25, 0), (48, 90)):
    cmds.setKeyframe(hip, attribute="rotateY", time=t, value=v)
clips = [("idle", 1, 24), ("turn", 25, 48)]       # Unreal: one animation per file (Epic)
files = []
for name, s, e in clips:
    r = P.fbx_export(os.path.join(OUT, "anim_%s.fbx" % name), [root], "unreal_anim", bake=(s, e))
    assert r["exported"], r
    files.append(r["path"])
result = {"files": files, "takes": [P.fbx_takes(f) for f in files]}
```

Rules behind the presets (sources in `expert-notes.md`):

- Skeletal: one root joint, which is the pivot (Epic); triangulate before binding so the bake and
  the engine share one triangulation (Polycount; Epic); Unity: at most 4 influences by default,
  humanoids need at least 15 bones in T-pose with body-part names (Unity manual); joint rotations
  zero at bind, orientation in `jointOrient` (AdvancedSkeleton); export the deformation skeleton and
  meshes only, never the control rig (Epic: "At export time, only the skeleton is required").
- Animation: bake onto the joints (constraint animation does not transfer),
  `FBXExportInputConnections` off so the rig stays out, Bake Start and End set by command every time
  (never stored in presets), one clip per file for Unreal, animation-only import needs an existing
  skeleton in Unreal. The Game Exporter's Save Clips to Single File writes takes; test whether the
  target Unreal version imports all takes before relying on it [verify].
- An up-axis change converts root elements only, and animated roots get their curves resampled; put
  a static dummy root above them, or keep `FBXExportUpAxis y` and let the engine convert (Game
  Exporter; FBX Export options) [verify each engine's import].
- The take accumulator persists until `FBXExportSplitAnimationIntoTakes -c` (the doc also spells
  `-clear`); `Take001` always exists. `fbx_takes()` reads the takes without importing and releases
  the file with `FBXClose`.

Unity variants: `unity_static`, `unity_skeletal`, `unity_anim`; same options,
`ENGINE_RULES["unity"]["max_influences"] = 4`. The doc says to export centimeters so the Unity
import scale factor is 1 (its wording mixes meters and centimeters) [verify in Unity].

Over the influence limit: `P.cap_influences(skin, shape, 4, max_delta=0.1, apply=True)` (headless
only: an OpenMaya write is not undoable in a GUI; it refuses while Skin Tools layers exist). Bigger
changes belong to scenario-maya-deformation, or Skin > Bake Deformers to Skin Weights.

## P5. Verify an FBX in a clean scene

Test: `test_fbx_export.py`.

```python
before = P.scene_stats(roots)                     # just before export (after fixes and triangulation)
rep = P.fbx_export(path, roots, "unreal_skeletal")
log = rep["fbx_log"]                              # {"path", "name", "parsed": {errors, warnings, counts}}
issues = P.fbx_log_issues(log["parsed"], log["path"])     # X05; a missing log is itself a finding
takes = P.fbx_takes(path)                         # FBXRead / FBXGetTakeCount / FBXGetTakeName / FBXClose
after = P.reimport_stats(path, allow_discard=True)    # new scene, FBXResetImport, FBXImportMode add, FBXImport
check = P.compare_stats(before, after, check_verts=False)  # counts, per-mesh bounds, normals, units, up axis
assert check["ok"], check["diffs"]
```

What the comparison catches that counts miss (Maya 2027 Help: the expert's test is that the FBX
reimports with identical normals, scale, axis and animation length): smoothing groups lost or
doubled (normal directions move bins), a flipped face, an axis conversion (normals and bounds
rotate, `up` differs), a unit conversion (bounds scale). `normal_signature` is order-independent
because the importer may split and reorder vertices [added]. The log: `FBXExportGenerateLog -v true`
is in every preset; the batch names it per child (`MAYA_FBX_LOG_FILENAME=mx_fbx_<stem>`,
`MAYA_FBX_LOG_DATETIME_ISO=1`); `P.find_fbx_log` looks in `$MX_FBX_LOG_DIRS`,
`$MAYA_APP_DIR/FBX/Logs` and the macOS and Documents folders [verify where the 2027 plug-in writes
on macOS, then set `MX_FBX_LOG_DIRS`]. The doc warns the log appends to one file per name: per-child
names keep runs apart. `reimport_stats` refuses to discard an unsaved scene unless told to. In a
batch it runs in the child after the fixed version was saved. Import-side traps (Maya 2027 Help, FBX
Troubleshooting): non-deformed geometry imports with locked normals
(`FBXImportUnlockNormals -v true` or Mesh Display > Unlock Normals before rigging); namespaces on
import need `FBXImportMode -v add`; locked channels block incoming animation in batch unless
`FBXImportSetLockedAttribute -v false`; clusters import with wrong pivots unless
`FBXImportConvertDeformingNullsToJoint -v false`.

## P6. Alembic caches

Tests: `test_abc_gpu.py`, `test_snippets.py`.

```python
# snippet: alembic_raw
import os
import shutil
import tempfile
import maya.cmds as cmds

for p in ("AbcExport", "AbcImport"):
    if not cmds.pluginInfo(p, q=True, loaded=True):
        cmds.loadPlugin(p)
ball = cmds.polySphere(name="ball_geo")[0]        # demo: radius 1, moves up 50 cm
cmds.setKeyframe(ball, attribute="translateY", time=1, value=0)
cmds.setKeyframe(ball, attribute="translateY", time=24, value=50)
root = cmds.ls(ball, long=True)[0]
final = os.path.join(OUT, "ball cache.abc")
tmp_dir = tempfile.mkdtemp(prefix="abc_")
tmp = os.path.join(tmp_dir, "ball.abc")           # the -j string is split on spaces [verify]: no spaces in it
job = "-frameRange 1 24 -uvWrite -writeFaceSets -worldSpace -dataFormat ogawa -root %s -file %s" % (root, tmp)
cmds.AbcExport(j=job)
shutil.move(tmp, final)
os.rmdir(tmp_dir)
cmds.file(new=True, force=True)
cmds.AbcImport(final, mode="import")
cmds.currentTime(24, update=True)
y = cmds.exactWorldBoundingBox("ball_geo")[1]
assert abs(y - 49.0) < 1e-3, y                    # bottom of the sphere at frame 24
result = {"abc": final, "bottom_y_at_24": y}
```

Module: `r = P.abc_export(path, roots, 1, 120)` (samples the source at start, middle and end,
handles paths with spaces), then `P.abc_verify(path, r["samples"])` in a clean scene: vertex counts
constant per frame and bounding boxes equal.

Rules: Ogawa only since 2022 (HDF5 dropped). Alembic carries no shading: `-uvWrite` and
`-writeFaceSets` let the cache pick the shading network back up. Only `-frameRange`, `-root` and
`-file` appear in the saved 2027 pages; check the rest with `AbcExport -h` [verify]. The groom doc's
sample passes `data_format='otawa'`: a typo, write `ogawa`. Export from the composed shot state,
never from pre-layout sources: RISE's comp read an Alembic camera while a USD layout layer had moved
the real one (8UIW-g1_heg [00:51:46]). Import options (merge onto existing geometry) are not
available through File > Open. 2027.2 fixed a UV set order bug on deforming exports (release notes).

## P7. GPU cache

Tests: `test_abc_gpu.py`, `test_snippets.py`.

```python
# snippet: gpu_cache_raw
import os
import maya.cmds as cmds

if not cmds.pluginInfo("gpuCache", q=True, loaded=True):
    cmds.loadPlugin("gpuCache")
rock = cmds.polyCube(name="rock_geo")[0]          # demo
d = os.path.join(OUT, "gpu caches")
os.makedirs(d, exist_ok=True)
written = cmds.gpuCache(rock, directory=d, fileName="rock", saveMultipleFiles=False)
path = os.path.join(d, "rock.abc")
node = cmds.createNode("gpuCache", name="rockCacheShape")   # there is no import command: make the node
cmds.setAttr(node + ".cacheFileName", path, type="string")
cmds.setAttr(node + ".cacheGeomPath", "|", type="string")     # "|" = the cache root
assert os.path.isfile(path), (written, os.listdir(d))
result = {"written": written, "node": node}
```

One file per object instead: `filePrefix="ddd_", clashOption="nodeName"` (Maya 2027 Help). Time
range flags [verify]. Module: `P.gpu_cache_export(roots, dir, name, start, end)`,
`P.gpu_cache_load(path)`.

## P8. USD export with every default trap set

Tests: `test_usd.py`, `test_snippets.py`.

```python
# snippet: usd_export_raw
import os
import maya.cmds as cmds

if not cmds.pluginInfo("mayaUsdPlugin", q=True, loaded=True):
    cmds.loadPlugin("mayaUsdPlugin")
from pxr import Usd, UsdGeom

cube = cmds.polyCube(name="crate_geo")[0]         # demo: a rotating crate
grp = cmds.group(cube, name="crate_GRP")
cmds.setKeyframe(grp, attribute="rotateY", time=1, value=0)
cmds.setKeyframe(grp, attribute="rotateY", time=24, value=90)
path = os.path.join(OUT, "crate anim.usda")
cmds.mayaUSDExport(file=path, exportRoots=[cmds.ls(grp, long=True)[0]],
                   frameRange=(1, 24),             # default [1, 1]: a single frame
                   defaultMeshScheme="none",       # default catmullClark: smoothed, and no normals
                   exportSkels="auto", exportSkin="auto", exportBlendShapes=True,   # defaults none/none/false
                   stripNamespaces=True,           # default: ns_name prims
                   eulerFilter=True, staticSingleSample=True,
                   upAxis="y", unit="cm", defaultPrim="crate_GRP",
                   shadingMode="useRegistry", convertMaterialsTo=["UsdPreviewSurface"],
                   materialsScopeName="mtl")       # the readme says both Looks and mtl
stage = Usd.Stage.Open(path)
mesh = UsdGeom.Mesh(stage.GetPrimAtPath("/crate_GRP/crate_geo"))
assert stage.GetDefaultPrim().GetName() == "crate_GRP"
assert (stage.GetStartTimeCode(), stage.GetEndTimeCode()) == (1.0, 24.0)
assert mesh.GetSubdivisionSchemeAttr().Get() == "none"
result = {"usd": path, "meters_per_unit": UsdGeom.GetStageMetersPerUnit(stage),
          "up_axis": UsdGeom.GetStageUpAxis(stage)}
```

Module: `r = P.usd_export(path, roots, frame_range=(1, 120))` then `r["verify"]` from `P.usd_verify`
(default prim, time range, scheme and normals per mesh, primvar names, SkelRoot, up axis and meters
per unit, unresolved and absolute asset paths). A static export writes one explicit sample at the
current frame (`staticSingleSample`), because `frameRange` defaults to frame 1 whatever the current
frame.

Rules (maya-usd command readme; USD for Maya 2027 help):

- `map1` is renamed `st` (others `st1`, `st2`) unless `preserveUVSetNames`; decide per consumer.
- `exportSkels`/`exportSkin` `auto` promotes the rootmost prim holding a skinned mesh to SkelRoot; a
  skinCluster on a root prim errors: parent the mesh under a group.
- Assembly root prims must not contain gprims; tag `USD_kind` yourself for predictable kinds.
- `-unit` is the favored unit control; `-metersPerUnit` is "evolving" and converts only meshes and
  transforms.
- Material export target: MaterialX on new installs since 0.34 while the readme table says
  UsdPreviewSurface: always pass `convertMaterialsTo`. Translation is lossy: Lambert diffuse 0.8
  exports as 1.0, transparency is dropped, Stingray PBS does not translate, Standard Surface loses
  roughness color, coat color and sheen, node inputs are dropped; UsdPreviewSurface round-trips.
- Import: `mayaUSDImport(file=..., readAnimData=True)` or no animation comes in; point caches need
  `useAsAnimationCache=True`.
- Flags differ between the dev-branch readme and the 0.35 to 0.37 build:
  `cmds.help("mayaUSDExport")` in the installed Maya [verify]; `-parentScope` is deprecated for
  `-rootPrim`; long flags only (`-epv` is duplicated in the readme).
- Heavy shots: per-frame files stitched as value clips, and point data stripped from non-deforming
  meshes (RISE, 8UIW-g1_heg [00:36:29] to [00:38:10]): `mayaUSDExport(frameRange=(f, f))` per frame,
  then `pxr.UsdUtils.StitchClips(...)` [added, verify signature].

## P9. USD shot layers, edit targets, muting, audits

Tests: `test_usd.py`, `test_snippets.py`.

```python
# snippet: usd_shot_layers_raw
import os
from pxr import Sdf, Usd

shot_dir = os.path.join(OUT, "sh020")
os.makedirs(shot_dir, exist_ok=True)
seq = Sdf.Layer.CreateNew(os.path.join(OUT, "seq.usda"))      # demo sequence layer
Sdf.CreatePrimInLayer(seq, "/district").specifier = Sdf.SpecifierDef
seq.Save()
subs = []
for dept in ("lighting", "anim", "layout"):       # index 0 is the strongest
    lay = Sdf.Layer.CreateNew(os.path.join(shot_dir, "sh020_%s.usda" % dept))
    lay.Save()
    subs.append("./sh020_%s.usda" % dept)
root = Sdf.Layer.CreateNew(os.path.join(shot_dir, "sh020.usda"))
for s in subs + ["../seq.usda"]:                  # the shot sublayers the sequence, never the reverse
    root.subLayerPaths.append(s)
root.Save()
stage = Usd.Stage.Open(root.realPath)
layout = Sdf.Layer.FindOrOpen(os.path.join(shot_dir, "sh020_layout.usda"))
stage.SetEditTarget(Usd.EditTarget(layout))        # target one layer on purpose
stage.OverridePrim("/district").CreateAttribute("shotOffset", Sdf.ValueTypeNames.Float).Set(2.0)
layout.Save()
assert layout.GetPrimAtPath("/district").specifier == Sdf.SpecifierOver   # an over: the sequence is untouched
assert not seq.GetPrimAtPath("/district").attributes
result = {"root": root.realPath, "sublayers": list(root.subLayerPaths)}
```

Module:
`P.usd_shot_layers(shot_dir, "sh010", departments=("lighting", "fx", "anim", "layout"), sequence_layer=...)`;
`P.mute_own_and_stronger(stage, own_layer)` (RISE: mute your own layer and every stronger one by
default); `P.layer_specs(layer)` lists `over` vs `def` specs with their properties (Ep.5: overs are
the shot's changes); `P.usd_stage(path)` creates a `mayaUsdProxyShape` on a file and
`P.get_stage(shape)` returns the pxr stage [verify both].

Layer editor commands for the GUI session (maya-usd readme) [verify argument placement]:

```text
cmds.mayaUsdEditTarget(proxyShape, edit=True, editTarget=layerId)
cmds.mayaUsdLayerEditor(layerId, edit=True, lockLayer=(2, 0, proxyShape))   # 0 unlocked, 1 locked, 2 system lock; 0 = this layer only
cmds.mayaUsdLayerEditor(layerId, edit=True, muteLayer=(True, proxyShape))
cmds.mayaUsdLayerEditor(rootLayerId, edit=True, insertSubPath=(0, path))
MEL: mayaUsdEditAsMaya "|stage|stageShape,/district/cam1";   mayaUsdMergeToUsd "<pulled dag path>";
```

Merge Maya Edits to USD writes an `over` on a stronger target and a `def` on a weaker one, clears
the session layer, drops construction history, and reuses the last session's merge options: set the
target and the options (Animation Data, frame range) every time. Save each dirty `Sdf.Layer` and
then the Maya file; never save USD edits into the Maya file for real work (layers over 2 GB are
dropped). Relative root-layer paths only take effect once the Maya scene is saved. Resolver config
for reproducible batch runs: `ADSK_AR_SEARCH_PATH` or `ADSK_AR_MAPPING_FILE` in the environment
before mayapy starts (0.34 listed the resolver as Windows and Linux only; 2027 macOS status
[verify]).

## P10. References and namespaces from a manifest

Tests: `test_references.py`, `test_snippets.py`.

```python
# snippet: reference_raw
import os
import maya.cmds as cmds

asset = os.path.join(OUT, "lamp v001.ma")         # demo child file
g = cmds.group(empty=True, name="lamp_GRP")
cmds.parent(cmds.polyCylinder(name="lamp_geo")[0], g)
cmds.file(rename=asset)
cmds.file(save=True, type="mayaAscii")
cmds.file(new=True, force=True)
ns = "lamp01"                                     # generated from the manifest, never typed
assert not cmds.namespace(exists=":" + ns)        # a clash would silently become lamp011
nodes = cmds.file(asset, reference=True, namespace=ns, returnNewNodes=True)
ref = cmds.referenceQuery(nodes[0], referenceNode=True)
cmds.setAttr(ns + ":lamp_GRP.translateX", 10)     # stored as a reference edit in the parent
info = {"file": cmds.referenceQuery(ref, filename=True, withoutCopyNumber=True),
        "loaded": cmds.referenceQuery(ref, isLoaded=True),
        "namespace": cmds.referenceQuery(ref, namespace=True),
        "edits": cmds.referenceQuery(ref, editStrings=True),
        "failed": cmds.referenceQuery(ref, editStrings=True, failedEdits=True, successfulEdits=False) or []}
assert info["loaded"] and not info["failed"]
result = info
```

Module: `P.reference(path, ns)` (refuses a clashing namespace), `P.references_report()` (file, copy
number, loaded, exists, namespace, parent, edits, failed edits, foster parents),
`P.swap_reference(ref, new_path)` (`file(new_path, loadReference=ref)`, then failed edits),
`P.remove_failed_edits(ref)` (unload, `referenceEdit(removeEdits=True)`, reload [verify]),
`P.breakdown(manifest)` (missing, extra, stale, unloaded, failed edits: the Borderlands scene
breakdown).

Rules (Maya 2027 Help, reference edits; Best practices): edits are replayed by name and DAG path, so
never rename or restructure a child file in use (version it, then check `failed_edits` after the
swap); create character sets in the rig file; give a child mesh history in the child file if the
parent must add polygon history; grouped references can double-transform skinned characters (Inherit
Transforms off, or no group); others see your saved child only after they reload; to push parent
edits back, import the reference, then export the edited nodes as a new version. Build shots by
reference; deliver to engines by baked export. Unloaded references plus parenting create foster
parents; exporting with Preserve References off bakes them in.

## P11. Publish diff

Pure Python, ran offline (`test_offline_pure.py`).

```python
d = P.publish_diff(previous_summary_or_manifest, current_summary_or_manifest)
# {"added": [...] green, "modified": [...] blue, "removed": [...] red, "unchanged": [...]}
```

Borderlands published one FBX per character or prop per camera cut (2 characters, 4 props, 14 cuts =
84 files), so any camera range change re-exported everything: the diff tells the engine side what to
add, update and remove (lfWkJrkhd2U [00:06:04] [00:24:23]). Keep `summary.json` of each publish as
the manifest.

## P12. OpenMaya 2.0 DG node plug-in

Test: `test_om2_node_plugin.py` (loads this block from this file). The undoable `MPxCommand`
pattern, the reload helper (`flushUndo` before `unloadPlugin`) and the OM2 read idioms are in the
lead skill (scenario-maya-expert, `references/cmds-reliability.md` P5, P9, P10).

```python
# plugin: mx_remap_node.py
"""mxRemap: normalize inValue between inMin and inMax into 0..1 (API 2.0 DG node)."""
import maya.api.OpenMaya as om


def maya_useNewAPI():
    pass                                           # presence marks the plug-in as API 2.0


class MxRemap(om.MPxNode):
    kName = "mxRemap"
    kId = om.MTypeId(0x0007F001)                   # 0x00000 to 0x7ffff: internal plug-ins only
    aIn = aMin = aMax = aOut = None

    @staticmethod
    def creator():
        return MxRemap()                           # API 2.0: the instance, no asMPxPtr

    @staticmethod
    def initialize():
        n = om.MFnNumericAttribute()
        MxRemap.aIn = n.create("inValue", "iv", om.MFnNumericData.kDouble, 0.0)
        n.keyable = True
        MxRemap.aMin = n.create("inMin", "imn", om.MFnNumericData.kDouble, 0.0)
        n.keyable = True
        MxRemap.aMax = n.create("inMax", "imx", om.MFnNumericData.kDouble, 1.0)
        n.keyable = True
        MxRemap.aOut = n.create("outValue", "ov", om.MFnNumericData.kDouble, 0.0)
        n.writable = False
        n.storable = False
        for a in (MxRemap.aIn, MxRemap.aMin, MxRemap.aMax, MxRemap.aOut):
            om.MPxNode.addAttribute(a)
        for a in (MxRemap.aIn, MxRemap.aMin, MxRemap.aMax):
            om.MPxNode.attributeAffects(a, MxRemap.aOut)   # every input that feeds the output

    def compute(self, plug, data):
        if plug != MxRemap.aOut:
            return None                            # unhandled plug [verify: kUnknownParameter in C++]
        v = data.inputValue(MxRemap.aIn).asDouble()
        lo = data.inputValue(MxRemap.aMin).asDouble()
        hi = data.inputValue(MxRemap.aMax).asDouble()
        t = 0.0 if hi == lo else min(1.0, max(0.0, (v - lo) / (hi - lo)))
        h = data.outputValue(MxRemap.aOut)
        h.setDouble(t)
        h.setClean()


def initializePlugin(obj):
    om.MFnPlugin(obj, "mx", "1.0").registerNode(MxRemap.kName, MxRemap.kId, MxRemap.creator,
                                                 MxRemap.initialize, om.MPxNode.kDependNode, "utility/general")


def uninitializePlugin(obj):
    om.MFnPlugin(obj).deregisterNode(MxRemap.kId)
```

Checklist (API 2.0 help): `maya_useNewAPI` present; `MTypeId` inside `0x00000` to `0x7ffff` and
unique in one studio registry [added]; `attributeAffects` for every input to output; never swallow a
registration error (the doc's command sample does; re-raise so `loadPlugin` fails visibly); an
unregistered ID at load time loses the node's behavior, test by reopening the scene without the
plug-in. Python plug-in nodes are Globally Serial by default (Using Parallel Maya 2027): prototype
in Python, ship native nodes or C++ for anything a rig evaluates every frame (Fragapane, _0mb4wIZi80
[00:55:10]).

## P13. Tool UI: PySide6 dockable panel, installed as a module

GUI only. Test: `gui_smoke.py` (through `mx_bridge`).

```python
# gui-snippet: pyside6_panel
import maya.cmds as cmds
from PySide6 import QtWidgets                      # PySide6 only: a PySide2 fallback crashed 2027.0
from maya.app.general.mayaMixin import MayaQWidgetDockableMixin


class AgentExportPanel(MayaQWidgetDockableMixin, QtWidgets.QWidget):
    OBJECT_NAME = "mxAgentExportPanel"

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName(self.OBJECT_NAME)        # unique, or Maya cannot find or restore it
        self.setWindowTitle("Agent Export")
        lay = QtWidgets.QVBoxLayout(self)
        self.status = QtWidgets.QLabel("idle")
        btn = QtWidgets.QPushButton("Count selection")
        btn.clicked.connect(self.on_count)           # a callable, never a string
        lay.addWidget(self.status)
        lay.addWidget(btn)

    def on_count(self, *args):                       # Qt and Maya pass arguments: accept them
        self.status.setText("%d selected" % len(cmds.ls(sl=True) or []))


def show_panel():
    ctrl = AgentExportPanel.OBJECT_NAME + "WorkspaceControl"     # mixin naming [verify]
    if cmds.workspaceControl(ctrl, q=True, exists=True):
        cmds.deleteUI(ctrl)                          # no duplicate controls on rerun
    w = AgentExportPanel()
    w.show(dockable=True)                            # uiScript=... to restore at startup [verify kwarg]
    return w


panel = show_panel()
result = {"control": AgentExportPanel.OBJECT_NAME + "WorkspaceControl",
          "exists": cmds.workspaceControl(AgentExportPanel.OBJECT_NAME + "WorkspaceControl", q=True, exists=True)}
```

Rules (Maya 2027 Developer Help, PySide and workspace controls): parent every widget under a Maya
widget or garbage collection destroys it; `dockControl` is gone; a restorable control's `uiScript`
may only call code importable at the next startup, so ship the tool as a module and declare
`requiredPlugin`/`requiredControl`; `QAction`, `QActionGroup`, `QShortcut`, `QFileSystemModel` live
in `QtGui`; `QRegExp` is `QRegularExpression`; enums are real Python enums (no int arithmetic); high
DPI is always on; `wrapInstance(int(ptr), ...)` from `shiboken6`; guard UI code with
`cmds.about(batch=True)`; keep the logic in functions the batch runner can test headless. Maya UI
callbacks: callables with `*args`, `functools.partial` in loops (Theodore). The 2027.0
docking-offset bug (MAYA-142238) had a `userSetup.py` workaround and was fixed in 2027.1.

Module file for macOS (Maya 2027 Developer Help, module description files) [verify the `mac`
platform token]:

```text
+ MAYAVERSION:2027 PLATFORM:mac agentTools 1.0 ../agentTools
PYTHONPATH+:=python
```

Folder `agentTools/{scripts,plug-ins,icons,presets,python}`; the `.mod` goes in a folder on
`MAYA_MODULE_PATH`; check with `cmds.moduleInfo(listModules=True)` [verify] and
`cmds.pluginInfo(q=True, listPlugins=True)`. Modules add search paths only; they run no startup code
unless a `userSetup.py` sits in the module's `scripts` (Theodore). Packages without admin rights:
`mayapy -m pip install <pkg> --target ~/Library/Preferences/Autodesk/maya/2027/scripts/site-packages`.

## P14. Scene performance: census, timing, correctness

Tests: `test_perf.py`, `test_snippets.py`.

```python
# snippet: perf_raw
import time
import maya.cmds as cmds

mode = cmds.evaluationManager(q=True, mode=True)            # "parallel" by default since 2016
enabled = cmds.evaluator(q=True, enable=True)               # session only, never saved
gpu_types = sorted(cmds.deformerEvaluator(q=True, deformers=True) or [])
probe = cmds.polySphere(name="probe_geo", subdivisionsX=64, subdivisionsY=64)[0]   # demo deformed mesh
bend, handle = cmds.nonLinear(probe, type="bend")
cmds.setKeyframe(bend, attribute="curvature", time=1, value=0)
cmds.setKeyframe(bend, attribute="curvature", time=48, value=90)
t0 = time.perf_counter()
for f in range(1, 49):
    cmds.currentTime(f, update=True)
    cmds.xform(probe + ".vtx[0]", q=True, ws=True, translation=True)   # force the deformation to evaluate
eval_fps = 48 / (time.perf_counter() - t0)
result = {"mode": mode, "evaluators": enabled, "gpu_deformers": gpu_types, "eval_fps_headless": round(eval_fps, 1)}
```

Module: `P.perf_census()` (evaluation mode, evaluators, expressions with
`getAttr`/`setAttr`/`ls`/`eval`, Python plug-in node counts, driven `frozen`/`nodeState`, per-frame
heavy nodes, legacy dynamics, deformed meshes against the GPU vertex threshold);
`P.eval_timing(1, 120, ["body_geo"])` times each evaluation mode and compares the probe meshes'
world points across modes.

Order (Using Parallel Maya 2027; Roselle): make it right, then fast: DG, Serial and Parallel must
give the same points before any timing matters (Serial is a debugging mode and may be slower than
DG); then profile and fix the widest bars; then GPU Override (supported deformers only, meshes above
500 vertices on AMD or 2000 on NVIDIA, `MAYA_OPENCL_DEFORMER_MIN_VERTS` changes it; Apple GPU
behavior undocumented [verify]); then Cached Playback, choosing the mode by memory (evaluation cache
anywhere, software in system RAM, hardware in VRAM). Headless timings measure evaluation only: say
so, and take draw-bound questions (huge sets, viewport fps, the Profiler thread view) to a GUI
session through the bridge. Profiler from script: `cmds.profiler(bufferSize=200)`, `sampling=True`,
play the range, `sampling=False`, `output=path` [verify flags; the doc gives `profiler -b` and a 20
MB default buffer].

Fixes that experts apply first: move attribute-only hosts out of limb hierarchies (Campos: about 20
to 17 ms per frame, NfYAaK3wtQs [00:12:51]); replace impure expressions and Python nodes with node
networks; never drive `frozen` or visibility from an animatable switch (the evaluation graph
rebuilds during playback); remove per-frame topology or UV transfers from rigs (Roselle's rig at 1
to 1.5 fps, rhtERzmAoUM [00:04:46]); key or tag controller attributes so the graph is ready for
manipulation (curve manager: `cmds.evaluator(name="curveManager", enable=True)` and
`configuration="forceAnimatedCurves=keyed"`, session only). The rig-level fixes belong to
scenario-maya-rigging; this skill measures and reports.

## P15. The GUI parts of a pipeline job

Test: `gui_smoke.py`.

Headless first: contact sheets and turntables come from `mx_review.review` (Arnold, no viewport).
The GUI session is for what needs Viewport 2.0: playblasts, viewport captures, GPU Override and
viewport fps, tool UIs. Through the lead's bridge:

```python
import sys
sys.path.insert(0, "/abs/skills/scenario-maya-expert/scripts")
import mx_bridge
b = mx_bridge.Bridge()                            # the user started mx_bridge_server in Maya
state = b.ping()["result"]                        # version, scene, modified
if state["modified"]:
    raise SystemExit("the user's scene has unsaved changes: ask before replacing it")
r = b.run('''
cmds.file(r"/abs/out/fixed/hero_fixed.ma", open=True, force=True, executeScriptNodes=False)
import mx_review
result = mx_review.playblast("/abs/out/review/hero_rom", start=1, end=48)
''', allow_scene_replace=True, timeout=600)
print(mx_bridge.format_record(r))                 # result, stdout, stderr, Maya's warnings, traceback
if not r["ok"] or r["maya_messages"]:
    raise SystemExit("the GUI step reported problems: read them before going on")
```

Every record carries `stdout`, `stderr` and `maya_messages` (warnings and errors Maya printed
through its command output, captured with `MCommandMessage` [verify in the GUI]), also on a refusal
or a timeout (then `stdout` is what the job printed so far). A warning with `ok=True` is still a
finding: an agent that does not read the output is blind (chadrik). One call is one undo chunk; the
client refuses modal UI and unguarded scene replacement. For many files, a dedicated agent GUI
session beats replacing the user's scene. Close the port when done (`mx_bridge_server.stop()`).

## P16. Blind spots of a batch: preflight, logs, locked normals, empty meshes, time unit, reference health

Tests: `test_offline_pure.py` and `test_offline_fake_checks.py` (offline, passed),
`test_engine_checks.py` and `test_snippets.py` (this block), `test_fbx_export.py`.

The M8 blind grade (2026-09-24) listed what neither answer checked on a 200-character batch. Each
has a check in the module and a line in the report:

| Blind spot                                                     | Check                                                                               | Where it comes from                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Batch renders that hang, no mayapy, full disk                  | `P.preflight(out, scenes)`                                                          | Python in Maya 2027, Troubleshoot Maya hangs (`/etc/hosts`)       |
| Analytics and noisy output in children                         | `mx_run.child_environment()`: `MAYA_DISABLE_ADP=1`, stdout `none`, stderr `warning` | devkit What's New 2022                                            |
| The FBX exporter's own feedback                                | `rep["fbx_log"]`, X05                                                               | Maya 2027 Help, FBX Export options (Generate log data)            |
| Locked normals that ignore skinning                            | E11; mx_validate `locked_normals`, fix `unlock_normals`                             | Maya 2027 Help, FBX Troubleshooting                               |
| Round trip with equal counts but lost smoothing, axis or scale | `compare_stats` normals, per-mesh bbox, units, up axis                              | Maya 2027 Help (how the expert judges an FBX)                     |
| One empty leftover mesh crashing a file                        | `mx_audit.mfn_mesh`, E24                                                            | devkit What's New 2022.1                                          |
| Scene rate against the engine rate                             | E27 (`--fps`)                                                                       | Live Link and ShotGrid to Unreal (Kw3PzotnLrE), pre-stream checks |
| Unloaded or broken references exported as if complete          | R01 to R05 before any fix                                                           | pipeline digest scene checklist                                   |
| Skin Tools layers                                              | E26 routes to scenario-maya-deformation (Delete Skin Layers keeps the weights)      | Maya 2027 Help, Skin Tools                                        |

Raw version of the locked normals and time unit checks, for when only inline code is possible:

```python
# snippet: locked_normals_raw
import maya.cmds as cmds

geo = cmds.polyCube(name="imported_geo", width=20, height=20, depth=20)[0]    # demo: an "imported" mesh
cmds.delete(geo, constructionHistory=True)
cmds.polyNormalPerVertex(geo + ".vtx[*]", freezeNormal=True)                 # what an FBX import leaves
shape = cmds.listRelatives(geo, shapes=True, fullPath=True)[0]
count = cmds.polyEvaluate(shape, vertex=True)
if not isinstance(count, int) or count == 0:                                 # a message string means nothing counted
    raise RuntimeError("empty mesh: never wrap it in MFnMesh")
locked = cmds.polyNormalPerVertex(shape + ".vtx[*]", q=True, freezeNormal=True) or []   # [verify] per vertex or per vertex-face
cmds.polyNormalPerVertex(shape, unFreezeNormal=True)                         # Mesh Display > Unlock Normals [verify flag]
after = cmds.polyNormalPerVertex(shape + ".vtx[*]", q=True, freezeNormal=True) or []
fps = {"film": 24.0, "ntsc": 30.0, "game": 15.0, "pal": 25.0, "ntscf": 60.0}.get(cmds.currentUnit(q=True, time=True))
assert any(locked) and not any(after), (locked[:4], after[:4])
result = {"locked_before": sum(1 for x in locked if x), "locked_after": sum(1 for x in after if x),
          "time_unit": cmds.currentUnit(q=True, time=True), "fps": fps}
```

After unlocking, shading follows the edges' hard and soft flags: compare an `mx_review` normals
sheet before and after, and re-harden by angle (`polySoftEdge`) only if the look changed. On import,
`FBXImportUnlockNormals -v true` avoids the lock in the first place (FBX Import MEL commands). Keep
deliberate custom normals (weighted normals on a static prop): E11 is only info on static exports.
