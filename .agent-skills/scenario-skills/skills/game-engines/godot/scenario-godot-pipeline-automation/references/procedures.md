# Procedures (scenario-godot-pipeline-automation 0.1)

Every procedure ran in Godot 4.7.2.stable.official.ed1daf0bf on macOS arm64 on 2026-10-02, through
the scenario-godot-expert toolkit (`gd_run`, `gd_env`, `gd_review`, `gd_stat`). Tests live in
`tests/code/godot-pipeline-automation/`, evidence in
`tests/live_evidence/godot-pipeline-automation/`. Full code is in `scripts/`; this file quotes the
parts an agent must get right.

Setup used by every procedure:

```python
import sys; sys.path.insert(0, "<skills>/scenario-godot-pipeline-automation/scripts")
import gd_pipeline as gp          # also puts scenario-godot-expert/scripts on sys.path
import gd_env, gd_run, gd_review
P = gd_env.base_project("3d", "<runs>/Props200")   # APFS clone of Base3D: Jolt, forward_plus written explicitly
gp.install_kit(P)                                   # addons/agentkit/pipeline + addons/prop_pipeline, enabled in project.godot
```

Check after any agent-written `project.godot` (verified in P1):
`physics/3d/physics_engine="Jolt Physics"`, `rendering/renderer/rendering_method="forward_plus"`,
and `[editor_plugins] enabled=PackedStringArray("res://addons/prop_pipeline/plugin.cfg")`.

## 1. Import mechanics the pipeline relies on

Test: `test_import_mechanics_live.py` (M1 to M10; there is no M5). Evidence:
`mechanics_20261002-210541.json`, `mechanics_20261002-210734.json`. Run in Godot 4.7.2 on
2026-10-02: pass, 9 of 9.

| Id  | Finding                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Default GLB import extracts textures (`gltf/embedded_image_handling=1`) next to the GLB as `<stem>_<image>.png`, imported lossless (`compress/mode=0`, `detect_3d/compress_to=1`). 9.5 s first import of the project.                                                                                                                                                                                                         |
| M2  | A sidecar with only `[remap] importer="scene"` and `[params]` is honored headless (`root_name`, `light_baking=2`, Basis embed, `import_script/path`); Godot adds the uid; the `EditorScenePostImport` script runs.                                                                                                                                                                                                            |
| M3  | `[importer_defaults] scene={...}` in `project.godot` applies to new GLBs.                                                                                                                                                                                                                                                                                                                                                     |
| M4  | `[importer_defaults] texture={"compress/mode": 2, "detect_3d/compress_to": 0}` applies to textures extracted from glTF (VRAM metadata present). It is project-wide: UI textures get it too.                                                                                                                                                                                                                                   |
| M6  | An `EditorScenePostImportPlugin` added by a plugin listed in `[editor_plugins]` runs under headless `--import`.                                                                                                                                                                                                                                                                                                               |
| M7  | A headless editor run draws 0 frames: `detect_3d` never flips, extracted textures stay lossless.                                                                                                                                                                                                                                                                                                                              |
| M8  | `GLTFDocument.get_supported_gltf_extensions()`: EXT_texture_webp, GODOT_single_root, KHR_animation_pointer, KHR_lights_punctual, KHR_materials_emissive_strength, KHR_materials_pbrSpecularGlossiness, KHR_materials_unlit, KHR_node_visibility, KHR_texture_basisu, KHR_texture_transform, OMI_collider, OMI_physics_body, OMI_physics_shape. Not Draco, meshopt, mesh quantization, clearcoat, transmission, ior, specular. |
| M9  | Three heavy AI props: extract 7.92 s, 28.4 MB imported, 49 texture files; Basis Universal embed 4.21 s, 22.6 MB, 0 texture files.                                                                                                                                                                                                                                                                                             |
| M10 | Per-file options declared by the plugin (`add_import_option`, `add_import_option_advanced`, read with `get_option_value`) and pre-seeded in a sidecar are read under headless `--import`; files without them get the defaults.                                                                                                                                                                                                |

## 2. The 200-GLB art drop (test data)

`tests/code/godot-pipeline-automation/make_art_drop.py <empty folder>` writes 200 GLBs plus
`manifest.csv` (`file,category,name,height_m,source`; 195 rows) with the standard library only. It
refuses a non-empty folder. Contents: 181 synthetic props in 10 categories with mixed naming styles
(`SM_Barrel_05.glb`, `Barrel05_v2.glb`, `crate-01.glb`, upper-case `.GLB`, a unicode name),
centimeter files, center pivots, Z-up, offsets, 2048 px textures, normal and metallic variants, a
120k-triangle scan; a byte-identical duplicate, an id collision, 5 files missing from the manifest;
5 broken files (empty, truncated, not a GLB, external `.bin`, Draco required); 12 real image-to-3D
GLBs from two generators (side table, toy robot, food truck, scout drone, battle mech, low-poly
tree). Output used: `tests/projects/godot-pipeline-automation/art_drop/2026-10-02/` (93.6 MB).

## 3. Batch import: ingest, import, texture pass, import, audit

Code: `scripts/agentkit/pipeline/{glb_probe,prop_rules,prop_ingest,prop_textures,prop_audit}.gd`,
`scripts/agentkit/prop_pipeline_addon/`, orchestration `gd_pipeline.import_props`.

```python
r = gp.import_props(P, "<art_drop>/2026-10-02", manifest="manifest.csv", texture_mode="extract")   # or "basisu"
# stages: ingest (plain headless job) -> gd_run.import_project -> prop_textures.gd:fix -> import -> prop_audit.gd:audit
```

What ingest writes per accepted file (`prop_ingest.gd`, `_write_prop`), only when a value differs
from the existing sidecar:

```gdscript
var want := {
	"nodes/root_name": id,
	"gltf/embedded_image_handling": 2 if texture_mode == "basisu" else 1,
	"animation/import": false,
	"meshes/generate_lods": true,
	"meshes/light_baking": 1,
	"pipeline/version": PIPELINE_VERSION, "pipeline/prop_id": id, "pipeline/category": cat,
	"pipeline/source_md5": md5,
	"pipeline/unit_scale": float(d.fixes.get("unit_scale", 1.0)),     # 0.01 for centimetre files
	"pipeline/fit_height": float(d.fixes.get("fit_height", 0.0)),     # manifest height for AI files
	"pipeline/fix_pivot": bool(d.fixes.get("fix_pivot", false)),
	"pipeline/collision": collision, "pipeline/texture_limit": int(bud.texture),
}
```

Rules (`prop_rules.gd`, `decide`): invalid bytes, missing bounds, required unsupported extensions:
reject. AI source: fit to `height_m`, reject without it. DCC: a height ratio of 40 to 250 against
the manifest means centimeters (`unit_scale` 0.01). Pivot off the bottom center by more than 2% of
height or 10% of footprint: fix. Triangles over 3x the category budget: reject (decimate in
blender-expert); over budget: warn (LODs are generated, LOD0 is not reduced). Materials over budget,
dropped material extensions, stripped animations: warn. Duplicates by md5 are skipped; colliding ids
get `_b`; names are normalized (`SM_Barrel05_v2 (copy)` to `barrel_05`, `geo_rock_big_LOD0` to
`rock_big`).

The post-import plugin (`prop_post_import.gd`) applies the options on every import: merged bounds of
all mesh nodes (in `_post_process` they are `MeshInstance3D`; only `_pre_process` sees
`ImporterMeshInstance3D`, P15; the kit accepts both), one transform on the root's children
(`Transform3D(Basis.from_scale(Vector3.ONE * s), -offset * s)`, so hierarchies keep their shape), a
`StaticBody3D` named `Collision` with a box (or convex per mesh), and a `pipeline` meta dictionary
(`version, id, category, source_md5, scale, pivot_fixed, height, aabb_position, aabb_size, triangles, materials, mesh_nodes, collision`).

The texture pass (`prop_textures.gd:fix`) sets `compress/mode=2`, `detect_3d/compress_to=0`,
`mipmaps/generate=true`, `compress/normal_map=1` for images whose glTF role is normal,
`process/size_limit` from the category budget.

Test: `test_pipeline_live.py` P1. Evidence: `pipeline_20261002-212509.json`. Run in Godot 4.7.2 on
2026-10-02: pass. 200 files: 169 accepted, 21 warned, 9 rejected (5 broken or Draco, 4 over 3x
budget: the 120k scan rock and three AI files at 69k, 137k and 181k triangles), 1 duplicate; 190
copied with sidecars. 21.8 s total (ingest 0.59, import 17.39, textures 0.43, import 2.66, audit
0.68). Texture pass changed 270 textures (208 albedo, 46 normal, 16 ORM). Audit 190 checked, 0
failed. 0 engine errors in every stage. `.godot/imported` 154.5 MB. A second fresh run
(`pipeline_20261002-214916.json`, final code) gave the same counts in 24.2 s (import 19.7 s), P2 to
P6 also pass. `project.godot` settings checked: Jolt, forward_plus, plugin enabled.

Bugs found and fixed while running it: `HashingContext.update()` logs an engine error on a 0-byte
file (empty input now returns the empty md5); the LOD suffix was split into `lod 0` and survived
normalization.

## 4. Idempotent rerun and incremental change

```python
gd_run.run_script(P, "res://addons/agentkit/pipeline/prop_ingest.gd:ingest", {"drop": DROP})
gd_run.import_project(P)
# compare .godot/imported mtimes before and after
```

Test: P2 and P3. Run in Godot 4.7.2 on 2026-10-02: pass. Rerun: copied 0, sidecars 0, ingest 0.7 s,
import 1.38 s, 0 imported files changed. One source changed (one byte in the generator string of
`Barrel05_v2.glb`, in a cloned drop): copied 1, sidecar 1, import 1.58 s, 4 imported files changed
(the scene and its albedo texture, `.scn`, `.s3tc.ctex` and their `.md5`). The texture `.import`
kept its VRAM settings after the GLB reimport.

## 5. Basis Universal instead of extract

`gp.import_props(P2, DROP, texture_mode="basisu")`: no texture pass, no texture files, textures
embedded in the scene as KTX2 Basis.

Test: P5. Run in Godot 4.7.2 on 2026-10-02: pass. 14.4 s total (ingest 0.72, import 11.32, audit
2.36), `.godot/imported` 80.6 MB against 154.5 MB, `props/` 65.3 MB against 122.9 MB, audit 190 / 0.
Trade-off [added]: no per-texture Import dock control (size limit, normal-map flag) and the textures
cannot be shared between props.

## 6. gdUnit4 install and run

```python
gp.install_gdunit4(P, version="6.2.1")   # GitHub tag zip, sha256 pinned, cached in assets/cache/gdunit4
r = gp.run_gdunit4(P, ["res://test/pipeline"])
# godot --headless --path P -s res://addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode \
#       -a res://test/pipeline -rd res://.agent_out/tests/gdunit_<stamp> -c
```

- `-rd` must be a `res://` path. With an absolute OS path gdUnit4 6.2.1 nests the reports under the
  project (`<project>/Users/.../results.xml`).
- `--ignoreHeadlessMode` is still required in 6.2.1 (exit 103 without it, from the runner's
  constants).
- Exit codes (`GdUnitTestSessionRunner.gd`): 0 pass, 100 failures or errors, 101 orphans only, 103
  headless refused, 104 Godot version unsupported, 105 script errors.
- Suites shipped (`scripts/gdunit/`): `test_prop_rules.gd` (parameterized with `test_parameters`,
  rule decisions on literal dictionaries), `test_glb_probe.gd` (GLBs built in memory: triangle
  count, world bounds with a node translation, Draco required, clearcoat dropped, garbage and
  truncated bytes), `test_imported_props.gd` (one case: `prop_audit.check_prop()` over every
  imported prop), `test_scene_runner.gd` with `door.gd` (`scene_runner`, `monitor_signals` before
  the action, `set_time_factor(5)`).

Test: `test_gdunit4_live.py` (G1 to G3) and P4. Evidence: `gdunit4_20261002-*.json`,
`*_results.xml`. Run in Godot 4.7.2 on 2026-10-02: pass. G1: 20 cases, exit 0. G2: planted wrong
expectation, exit 100, JUnit shows 1 failure. G3: the lead's `gd_run.run_tests(framework="gdunit4")`
passes an absolute `-rd`, the tests pass but its JUnit lookup finds nothing (reproduced; see
`tests/OPEN_ISSUES.md`). P4 on the 200-prop project: 20 of 20 in 1.14 s. Time factor: a 1 s timer at
factor 5 emitted after 237 ms.

## 7. Thumbnails and contact sheet

```python
t = gd_run.run_script(P, "res://addons/agentkit/pipeline/prop_thumbs.gd:thumbs", {"size": 150}, headless=False)
gd_review.contact_sheet(t["result"]["images"][:100], "sheet_1.png", cols=10, thumb=150)   # 1500 px wide
```

`prop_thumbs.gd` renders in a `SubViewport` with its own world: procedural sky (ambient and
reflections from the sky), one directional light, AgX, camera at three-quarter view framed on the
prop bounds merged with a red 1 m post at the front-left corner.

Test: P6. Evidence: `pipeline_20261002-212509_thumbs_1.png`, `_thumbs_2.png` (opened and read). Run
in Godot 4.7.2 on 2026-10-02: pass, 190 images in 8.4 s, 0 blank. First version used a flat
background color: the five metallic props rendered black (nothing to reflect); a sky fixed it. The
post was also hidden behind wide props at the side position; it now stands at the front-left corner.
What the sheets show: all categories recognizable, centimeter props at true size against the post,
AI props at their fitted heights (toy robot 0.45 m, mech 3 m), no floating or sunk prop.

## 8. Export with dev folders excluded

```python
gd_run.ensure_preset(P, "Linux", "Linux")
gp.exclude_from_export(P, "Linux")      # *.agent_out/*, addons/gdUnit4/*, addons/gut/*, test/*, tests/*, test_red/*, addons/agentkit/*, addons/prop_pipeline/*
gd_run.export(P, "Linux", "<out>/props.zip", pack=True)       # zip: list it with zipfile
gd_run.verify_pack("<out>/props.zip", expect=["res://props/showroom.tscn"], load=["res://props/toy/toy_robot_opus/toy_robot_opus.glb"])
gd_run.export(P, "Linux", "<out>/linux/props.x86_64", release=True)
```

Test: `test_export_live.py` (E0 to E2), `export_crash_bisect.py`. Evidence: `export_*.json`,
`export_crash_bisect_20261002.json`. Run in Godot 4.7.2 on 2026-10-02 on the first 200-prop project:
pass (a rerun on the second fresh project stopped when the machine's disk was full). E1 pack 34.9
MB, 931 entries, 190 imported scenes, 271 `.ctex`, no source `.glb`, no dev files, `verify_pack`
loaded two props. E2 Linux release 73.5 MB (`props.x86_64` + `props.pck`) in about 2.5 s. E0 control
with the lead's default filter: 528 dev files in the pack. Observation: with `addons/gdUnit4` in the
pack, headless `--export-pack` crashed at shutdown (signal 11, after "[ DONE ] savezip") in 4 of 5
runs, once leaving a 0-byte file; without it 0 of 6.

## 9. CI workflow

```python
wf = gp.write_workflow(repo_root, "game", godot="4.7.2", presets=("Linux",))   # .github/workflows/godot-ci.yml + tools/ci/godot_ci.sh
GODOT=/opt/homebrew/bin/godot PROJECT_DIR=game PRESETS=Linux OUT_DIR=build bash tools/ci/godot_ci.sh   # inside gd_run.godot_slot
gp.lint_workflow(wf)      # uvx --from actionlint-py actionlint
gp.check_urls([...])      # HEAD on the files the workflow downloads
```

The workflow (`scripts/ci/godot-ci.yml`): `actions/checkout@v7` with LFS, `actions/cache@v6` for the
binary and templates and for `.godot/imported` (keyed on `hashFiles('**/*.import')`), download of
the official Linux binary and templates from
`github.com/godotengine/godot-builds/releases/download/<ver>-stable/` checked against
`SHA512-SUMS.txt` with exact file names, `godot_ci.sh`, `actions/upload-artifact@v7` for the tarred
builds and for logs and reports (`if: always()`). The script imports, runs gdUnit4 (or GUT) when
present, exports each preset, checks the file exists, sets the executable bit and tars it (Voylin,
AbMESM0UEHk [00:20:10]).

Test: `test_ci_live.py` (C1 to C5). Evidence: `ci_20261002-213347.json`, the generated YAML. Run in
Godot 4.7.2 on 2026-10-02: pass. C2 local run exit 0 in 8.9 s, `linux.tar.gz` holds the binary with
mode 755, JUnit present. C3 planted failing test: exit 11. C4 actionlint 1.7.12 clean; a planted
broken copy gives 2 issues. C5 URLs 200 (binary 77.9 MB, templates 1.28 GB, sums 5.7 KB). Also
checked by hand: the sums file lists the mono zip next to the standard one, so a loose
`linux.x86_64.zip` pattern matched both (fixed); `shasum -a 512 -c` passed on the downloaded Linux
binary; the binary zip holds one file `Godot_v4.7.2-stable_linux.x86_64`; the templates archive has
a top folder `templates/`. Not run: the workflow on GitHub's runners (no push from this machine; the
repo is public).

## 10. Editor tooling: @tool node, EditorScript with undo, plugins

Code: `scripts/examples/tools/spawn_point.gd` (`@tool`, `_get_configuration_warnings`,
`@export_tool_button("Snap to floor", "Callable") var snap_button := snap_to_floor`),
`scripts/examples/tools/add_spawns.gd` (EditorScript: three nodes through `EditorUndoRedoManager`
with `add_do_method(root, "add_child", sp, true)`, `add_do_method(sp, "set_owner", root)`,
`add_do_reference(sp)`, `add_undo_method(root, "remove_child", sp)`), fixture job
`tests/code/godot-pipeline-automation/fixtures/tools_job.gd`.

```gdscript
# in a gd_run.run_script(P, "res://tools_job.gd", {"mode": "editor"}, editor=True) job
EditorInterface.open_scene_from_path("res://levels/arena.tscn")
for i in 5:
	await process_frame
var scene := EditorInterface.get_edited_scene_root()
load("res://tools/add_spawns.gd").new()._run()
var ur := EditorInterface.get_editor_undo_redo()
var hist := ur.get_history_undo_redo(ur.get_object_history_id(scene))
hist.undo(); hist.redo()
EditorInterface.save_scene()
```

Test: `test_tools_live.py` T1 to T3. Evidence: `tools_20261002-214055.json`. Run in Godot 4.7.2 on
2026-10-02: pass. T1 (plain job, `Engine.is_editor_hint()` false): 2 warnings before, 0 after
calling the button Callable. T2: children 1, 4 after `_run()`, 1 after undo, 4 after redo, saved
`.tscn` contains `Spawn2`. T3: in a `--script -e` job `is_plugin_enabled()` reported false for a
plugin listed in `project.godot` while its importer worked (T5), and enable or disable calls logged
"already" or "not loaded" engine errors depending on timing. Use the `[editor_plugins]` line in
`project.godot` (what `install_kit` writes, honored by `--import` in M6) rather than toggling from a
job.

## 11. EditorImportPlugin for a custom text format

Code: `scripts/examples/level_importer/` (`plugin.cfg`, `plugin.gd`, `lvl_import.gd`). `.lvl` lines
`box x y z w h d` become a `PackedScene` with a `MeshInstance3D` and a `StaticBody3D` per box.
Options must carry `name` and `default_value`; `save_path` has no extension; the importer returns
`ERR_PARSE_ERROR` with a `push_error` naming the bad line.

```python
gd_env.set_project_setting(P, "editor_plugins/enabled", 'PackedStringArray("res://addons/level_importer/plugin.cfg")')
gd_run.import_project(P)                     # imports .lvl files headless
# after bumping _get_format_version(), --import does NOT reimport; in an editor=True job:
#   fs = EditorInterface.get_resource_filesystem(); fs.scan(); wait while fs.is_scanning(); fs.reimport_files(paths)
```

Test: T4 and T5. Run in Godot 4.7.2 on 2026-10-02: pass. `yard.lvl` loads with 4 boxes and 4 bodies;
`broken.lvl` fails with the line in the log and `valid=false` in its sidecar, and
`ResourceLoader.exists()` still returns true for it. Format version 1 to 2: two plain `--import`
runs and a 60-frame `-e` job left `importer_version=1`; `reimport_files()` after `scan()` rewrote it
to 2 (without the scan: "Can't find file during file reimport").

## 12. GDExtension smoke test in plain C

Code: `scripts/examples/gdext_c/pipeline_ext.c`, `pipeline_ext.gdextension`, fixture job
`fixtures/gdext_job.gd`.

```bash
godot --headless --dump-gdextension-interface # inside gd_run.godot_slot(None)
clang -std=c11 -O2 -Wall -shared -fPIC -I. pipeline_ext.c -o libpipeline_ext.dylib
# bin/libpipeline_ext.dylib + res://pipeline_ext.gdextension (entry_symbol, compatibility_minimum = "4.7")
godot --headless --path P --import # writes .godot/extension_list.cfg
```

The extension registers `PipelineExt` (extends Object) with `add(a, b) -> int` through
`classdb_register_extension_class4` and `classdb_register_extension_class_method`, using
deprecated-but-present 4.5-era entry points; it supplies a `get_virtual_func` returning NULL.

Test: `test_gdextension_live.py` (X1 to X3). Evidence: `gdext_*.json`. Run in Godot 4.7.2 on
2026-10-02: pass. Build clean (header 142 KB, dylib 34 KB). Before `--import`: class absent, no
`extension_list.cfg`. After: `class_exists` true, `add(2, 40)` = 42, parent Object,
`GDExtensionManager.get_loaded_extensions()` lists it. Observation: the first `--import` of a fresh
project with the new extension crashed at shutdown in 2 of 3 runs (after importing; the extension
then loaded fine); later imports 0 of 9. Not yet run: godot-cpp with scons, and Rust gdext (scons
and cargo are not installed; no global installs were made).

## 13. A community MCP server, project-local

Server: Coding-Solo/godot-mcp (MIT), commit `1209744f`, cloned to
`tests/projects/godot-pipeline-automation/_mcp/godot-mcp`, `npm ci --ignore-scripts`, built with its
own `tsc` and `node scripts/build.js`. No MCP client configuration was touched.

```python
r = gp.mcp_stdio(["node", "<_mcp>/godot-mcp/build/index.js"],
                 [("get_godot_version", {}), ("get_project_info", {"projectPath": str(P)}),
                  ("create_scene", {"projectPath": str(P), "scenePath": "scenes/mcp_room.tscn", "rootNodeType": "Node3D"}),
                  ("add_node", {"projectPath": str(P), "scenePath": "scenes/mcp_room.tscn", "parentNodePath": "root",
                                "nodeType": "MeshInstance3D", "nodeName": "Crate"}),
                  ("save_scene", {"projectPath": str(P), "scenePath": "scenes/mcp_room.tscn"})],
                 env={"GODOT_PATH": gd_env.find_godot()}, timeout=120, hold_project=P)
```

`mcp_stdio` reads stdout and stderr on threads (a blocking `readline()` ignored the timeout), holds
the project lock and a `GD_MAX` slot, and stops only the process it started.

Test: `test_mcp_live.py`. Evidence: `mcp_20261002-214045.json`. Run in Godot 4.7.2 on 2026-10-02:
pass. 14 tools listed; version `4.7.2.stable.official.ed1daf0bf`; project info; the created scene
loaded in Godot with a `MeshInstance3D` child named Crate; 1.1 s for the whole session. Not called:
`launch_editor`, `run_project`, `get_debug_output`, `stop_project` (they open the editor or a game
window). The tugcantopaloglu fork and hybridindie/godot-mcp were not run.

## 14. Parse check of everything shipped

Test: `test_parse_check.py`. Run in Godot 4.7.2 on 2026-10-02: pass, 0 errors in 15 files (6 kit, 2
addon, 3 suites, 2 importer, 2 tools); `test_scene_runner.gd` and `door.gd` compiled and ran in the
gdUnit4 runs. `agent_audit.gd` skips `res://addons/agentkit/` by design, so the kit is compiled from
a copy. Offline: `test_offline.py`, 8 tests (GLB probe on the drop, workflow placeholders, preset
filter edit, `bash -n` on the CI script, art drop refusal), pass; `python3 -m py_compile` on all
Python, pass.

## 15. Round 2: post-import node classes, collision suffixes, `.gdignore`, exit noise, GUT traps, merged scenes, templates

Added after blind grading (`tests/grading/G9_grade.md`). Project:
`tests/projects/godot-pipeline-automation/Round2` (Base3D clone, Jolt, GUT 9.7.1, probe plugin in
`[editor_plugins]`). Files: `tests/code/godot-pipeline-automation/round2/`. Evidence:
`tests/live_evidence/godot-pipeline-automation/round2_20261002/`. Sources: Godot docs (import hints,
Importing 3D scenes), Butch Wesley ImqhHLlPfZg [00:32:08, 00:48:33, 00:57:00], Lilith Duncan
CAJ_iIedx_I [00:01:36], Voylin AbMESM0UEHk [00:11:34], Fennara 2vSYP7GyA5U [00:06:20], CLI
reference.

`make_glb.gd` writes `suffix_test.glb` with GLTFDocument (`append_from_scene`,
`write_to_filesystem`) from nodes `crate-col`, `wall-colonly`, `rock-convcol`, `junk-noimp`, `plain`
and a nested mesh under a rotated `group`, into `res://props/suffix/` and into `res://drop_raw/`
beside an empty `.gdignore`. The probe plugin (`probe.gd`, an `EditorScenePostImportPlugin`) writes
the class of every node it sees in `_pre_process` and `_post_process`. `inspect.gd` loads the
import, builds a MeshLibrary, and loads every `.tscn` in `res://merge/` (one clean, one with git
conflict markers).

```gdscript
# GridMap: one MeshLibrary item per imported mesh
var lib := MeshLibrary.new()
var id := 0
for mi in scene.find_children("*", "MeshInstance3D", true, false):
	lib.create_item(id)
	lib.set_item_name(id, mi.name)
	lib.set_item_mesh(id, mi.mesh)
	id += 1
ResourceSaver.save(lib, "res://props/suffix/suffix_lib.res")
# after a merge: every scene must load
var bad := []
for f in DirAccess.get_files_at("res://merge"):
	if f.ends_with(".tscn") and ResourceLoader.load("res://merge/" + f, "", ResourceLoader.CACHE_MODE_IGNORE) == null:
		bad.append(f)
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Node classes: `_pre_process` saw `ImporterMeshInstance3D` for crate, rock, plain, nested;
  `_post_process` saw `MeshInstance3D` for the same nodes. Suffixes were already applied and
  stripped in both hooks.
- Suffixes after import: `crate` MeshInstance3D with `StaticBody3D/CollisionShape3D`
  ConcavePolygonShape3D; `wall` a StaticBody3D with a ConcavePolygonShape3D and no mesh; `rock`
  MeshInstance3D with a ConvexPolygonShape3D body; `junk` absent; `plain` mesh only; `group/nested`
  kept its parent.
- `res://drop_raw/` (with `.gdignore`): 0 `.import` files after `--import`; `props/suffix/` got its
  sidecar.
- MeshLibrary: save OK, 4 items on reload.
- Merge check: 2 scenes checked, `conflict.tscn` failed with "Parse Error: Parse error. [Resource
  file res://merge/conflict.tscn:7]" and `load` returned null, while `ResourceLoader.exists()`
  returned true.
- Exit noise seen across this repo's 4.7.2 logs (headless jobs and imports):
  `ERROR: N resources still in use at exit` (23 logs),
  `WARNING: N ObjectDB instances were leaked at exit` (28),
  `WARNING: N RIDs of type "..." were leaked` (3 lines). The first is an `ERROR:` line, so an
  `^ERROR:` gate must filter it. The strings "RID allocations ... leaked at exit" and "Pages in use
  exist at exit" were not seen.
- GUT 9.7.1: a script whose `should_skip_script()` returns `"headless: no mouse or keyboard device"`
  when `DisplayServer.get_name() == "headless"` was reported "[Risky] Script was skipped",
  Risky/Pending 1, exit 0. A test leaking 3 `Node.new()` printed "3 orphans" and "Orphans 3" in the
  summary, still exit 0, so read the count. `pause_before_teardown()`: headless runs exited 0 in 0.9
  s with and without `-gignore_pause`; a windowed run (160x90) without it hung and was killed at 25
  s, with it exited 0 in 1.1 s.
- Templates: `Godot_v4.7.2-stable_export_templates.tpz` lists 35 entries, all under `templates/`,
  and `templates/version.txt` reads `4.7.2.stable`, the name of the folder under `export_templates/`
  (`~/Library/Application Support/Godot/export_templates/4.7.2.stable/` on this Mac).
- `godot --help` (4.7.2 standard build) lists `--build-solutions`: "Build the scripting solutions
  (e.g. for C# projects). Implies --editor". Not run: no C# project here.
- gdUnit4 6.2.1 exit codes re-read from `GdUnitTestSessionRunner.gd` constants: RETURN_SUCCESS 0,
  RETURN_ERROR 100, RETURN_WARNING 101, RETURN_ERROR_HEADLESS_NOT_SUPPORTED 103,
  RETURN_ERROR_GODOT_VERSION_NOT_SUPPORTED 104, RETURN_ERROR_SCRIPT_ERRORS_DETECTED 105.
