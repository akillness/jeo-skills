---
name: scenario-godot-pipeline-automation
description: "Use when Godot 4.7 work must run without a mouse or at scale: batch import of hundreds of GLB props or an AI image-to-3D art drop, naming rules, import presets and post-import scripts, editor plugins, EditorScript and @tool, EditorImportPlugin, GUT or gdUnit4 tests in CI, a GitHub Actions export workflow, GDExtension basics, or a Godot MCP server; also when --import is slow, textures stay uncompressed, tests pass locally but CI fails, or an export ships test folders."
license: MIT
---

# Godot pipeline automation (tools and build engineer)

Target: Godot 4.7.2.stable, macOS Apple Silicon, gdUnit4 6.2.1.

Expert level here means every step a human would click is a command that CI can run twice with the
same result, and every result is checked by a test that has been seen failing. The tools engineer
owns the path from an art drop or a commit to a tested export: ingest, import, editor tooling,
tests, CI, native extensions and agent channels. If a sibling skill named here is missing from your
available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run` and `gd_env`, the review loop,
4.7 traps). This skill adds [`scripts/gd_pipeline.py`](scripts/gd_pipeline.py) and the AgentKit
module [`scripts/agentkit/pipeline/`](scripts/agentkit/pipeline/); it never starts Godot itself,
every run goes through `gd_run`.

**Status (2026-10-02):** 43 live checks in 9 test files, the round-2 checks (procedures 15) and 8
offline tests, all pass, on a 200-GLB art drop that includes 12 real image-to-3D files
([`references/procedures.md`](references/procedures.md)). Not run: the workflow on GitHub runners,
godot-cpp and Rust builds (no scons or cargo here).

## Stance (the expert delta)

1. **Write the import settings before the first import.** A `.glb.import` sidecar holding only
   `[remap] importer="scene"` and `[params]` is honored by headless `--import`, and Godot adds the
   uid [added, verified M2]. Ingest therefore decides scale, pivot, collision and texture mode per
   file, then imports once. Rewriting `.import` files after the fact doubles the import time and
   dirties the repo.
2. **Pass data to the importer, not code paths.** An `EditorScenePostImportPlugin` declares per-file
   options (`pipeline/fit_height`, `pipeline/unit_scale`, `pipeline/fix_pivot`,
   `pipeline/collision`) that sit in each sidecar, appear in the Import dock, and run under headless
   `--import` once the plugin is listed in `project.godot` [added, verified M6, M10]. One plugin
   serves the whole project; files without `pipeline/prop_id` are untouched.
3. **AI image-to-3D files are not DCC files.** The 12 real files here call themselves "Khronos glTF
   Blender I/O", so a generator check cannot find them; only the manifest can. They arrived at
   arbitrary scale (a toy robot 1.96 m tall) with 2 to 35 materials; 8 of 12 use clearcoat,
   transmission, ior or specular, which 4.7.2 drops without a warning [added, verified M8]. Fit them
   to a manifest height; keep DCC props at authored size after a unit fix.
4. **Parse bytes, not paths.** Dinoleaf's rule for import code: `parse(bytes: PackedByteArray)` with
   the source injected, so the same parser serves `res://`, `user://`, zips and tests with literal
   bytes (sSurjCgebjw [00:04:46]). The GLB probe here works this way, and its tests build GLBs in
   memory.
5. **A test counts only once you have seen it fail.** Butch Wesley, author of GUT: watch red, then
   green; break the function body to retrofit (ImqhHLlPfZg [00:13:40]). Every suite here has a
   planted failure that must exit 100.
6. **Judge an export by its artifact, not its exit code.** Headless `--export-pack` crashed at
   shutdown with signal 11 after "[ DONE ] savezip" in 4 of 5 runs while gdUnit4 was in the pack,
   and the pack was complete [added, observation]. Check the file, its size and its contents;
   exclude dev folders from every preset.
7. **Headless output is the truth for agents** (Fennara, 2vSYP7GyA5U [00:02:51]). Output-panel
   scrapers report errors for lines no longer on disk, and the panel does not list every project
   error [00:06:20]: re-run headless before believing either. MCP servers add scene edits and
   screenshots, never error truth; call only their headless tools on a shared machine [added].
8. **Test behavior through signals, with bounded waits.** Godotneers and Mike Schulze (gdUnit4's
   author) assert on signals and public results, never private state; call `monitor_signals()`
   before the action, since a signal emitted earlier is missed (CreugthdgJ0 [00:36:34]); every wait
   has a timeout. Headless has no input device, so GUI-input tests are skipped in CI (Butch Wesley
   [00:48:33]; gdUnit4 6.2.1 prints the same warning).

## Establish first

| Input                                                                     | Changes                                                                   | Default                                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Art drop: count, formats, manifest (`file,category,name,height_m,source`) | ingest rules, AI fit                                                      | GLB only, manifest required for AI files                                                                                              |
| Category budgets (triangles, materials, texture side)                     | warn and reject lines                                                     | [`prop_rules.gd`](scripts/agentkit/pipeline/prop_rules.gd) defaults, set from the frame budget with scenario-godot-performance-export |
| Texture path: extract plus VRAM pass, or Basis Universal embed            | import time, disk, Import dock control                                    | extract                                                                                                                               |
| Target platforms                                                          | VRAM formats (`import_etc2_astc` for mobile and macOS universal), presets | Linux and macOS desktop                                                                                                               |
| Test framework                                                            | runner, CI command                                                        | gdUnit4 for JUnit reports, GUT if the project already has it; not both                                                                |
| CI host                                                                   | workflow file, caches                                                     | GitHub Actions, official binaries checked by SHA-512                                                                                  |

## Workflow

**1. Probe and decide (no import).** `prop_ingest.gd:ingest` reads every file as bytes, probes it
([`glb_probe.gd`](scripts/agentkit/pipeline/glb_probe.gd): header, chunks, triangles, materials,
images with their glTF role, extensions, world bounds), applies `prop_rules.gd`, copies accepted
files to `res://props/<category>/<id>/<id>.glb` with a sidecar, and writes `props_manifest.json`.
Writes happen only when content changes. Put an empty `.gdignore` in a raw drop inside the project,
or the editor imports it too (verified, procedures 15). Collision naming uses Godot's node suffixes,
stripped on import (verified, procedures 15): `-col` keeps the mesh and adds a StaticBody3D with a
trimesh shape, `-convcol` a convex one, `-colonly` keeps only the body, `-noimp` drops the node.
GATE: counts add up (accepted + warned + rejected + duplicates = files), every reject has a reason,
zero engine errors.

**2. Import.** `gd_run.import_project(P)`. GATE: no `ERROR:` lines except the exit noise 4.7.2
prints after the work is done (`ERROR: N resources still in use at exit`,
`WARNING: N ObjectDB instances were leaked at exit`, `WARNING: N RIDs of type ... were leaked`;
filter these three, procedures 15); every accepted prop has a `.scn` in `.godot/imported`.

**3. Texture pass (extract mode).** `prop_textures.gd:fix` sets VRAM compression, mipmaps, the
normal-map flag by glTF role and the size limit by category in each extracted texture's `.import`,
then import again. Headless never draws a frame, so `detect_3d` never flips and extracted textures
stay lossless without this pass [added, verified M7]. GATE: every extracted texture lands as
`.s3tc.ctex` (plus ETC2/ASTC when mobile is a target).

**4. Audit and test.** `prop_audit.gd:audit` loads every prop and checks meta version, root name,
pivot, fitted height, height range, triangles against three times the budget, the `Collision` body,
no `AnimationPlayer`, VRAM textures. The same `check_prop()` runs inside one gdUnit4 case over all
props. GATE: 0 failures, JUnit parsed, the planted failure exits 100.

**5. Look.** `prop_thumbs.gd:thumbs` (windowed, 160x90 main window, SubViewport renders) frames each
prop at three-quarter view next to a red 1 m post; `gd_review.contact_sheet` builds sheets of 100 at
1500 px. Open them. GATE: no black or missing prop, sizes plausible against the post, nothing
floating or sunk.

**6. Rerun and change one file.** Run ingest and import again: 0 copies, 0 sidecars, nothing
reimported. Change one source: only that prop and its textures reimport. GATE: both.

**7. Export.** Templates: the `.tpz` holds everything under `templates/` (35 files) plus
`version.txt` reading `4.7.2.stable`, the folder name; move the contents into
`export_templates/4.7.2.stable/` under the data dir (`~/.local/share/godot` on Linux; Voylin
AbMESM0UEHk [00:11:34]). C# projects run `--build-solutions` first (listed in the 4.7.2 `--help`,
implies `--editor`). Then `gd_run.ensure_preset`, `gp.exclude_from_export(P, preset)` (test
frameworks, tests, agent tooling, editor-only plugins), `gd_run.export`. GATE: artifact exists and
non-empty, no dev files in the pack listing, `verify_pack` loads a prop.

**8. CI.** `gp.write_workflow(root, "game", presets=(...))` writes `.github/workflows/godot-ci.yml`
and `tools/ci/godot_ci.sh`. Run the script locally first, plant a failing test, lint with
`gp.lint_workflow`, HEAD-check the URLs with `gp.check_urls`. GATE: local run exit 0, planted
failure exit 11, actionlint clean, URLs 200.

**9. Editor tooling.** An EditorScript's `_run()` is a plain method: a
`gd_run.run_script(..., editor=True)` job opens the scene (`EditorInterface.open_scene_from_path`),
waits a few frames, calls `_run()`, saves with `EditorInterface.save_scene()`. Route changes through
`EditorInterface.get_editor_undo_redo()` so Ctrl+Z works later (Queble, nW7YtSSJzbQ [00:04:41]); set
`owner` on new nodes or they vanish on save (docs). Call an `@export_tool_button` Callable and
`_get_configuration_warnings()` directly. GATE: undo and redo restore the child count, the saved
`.tscn` contains the new nodes, warnings match good and bad inputs.

**GridMap.** A GridMap level wants a `MeshLibrary`: `create_item(id)`, `set_item_mesh(id, mi.mesh)`
per imported mesh, saved as `.res` (verified, procedures 15).

**10. Custom formats.** An `EditorImportPlugin` registered by an enabled plugin runs under headless
`--import`; a parse error returns `ERR_PARSE_ERROR`, leaves `valid=false` in the sidecar and logs
the bad line. GATE: good files load as their resource type, bad files fail with a readable message,
a format-version bump reimports through `reimport_files()`.

**11. Native code.** Only for a profiled hotspot or a native library (Snopek, 4R0uoBJ5XSk
[00:03:16]). Smoke-test the chain: dump `gdextension_interface.h`, build, write the `.gdextension`,
`--import`, then `ClassDB.class_exists` and one bound call. Production uses godot-cpp with a renamed
`entry_symbol` (Snopek [00:13:22]); not yet run (no scons here). GATE: class registered, method
answers, no load errors.

**12. Agent channels.** For live scene inspection, clone and build one MCP server in the project's
tooling folder, pass `GODOT_PATH` in its environment only, and call it through
`gp.mcp_stdio(..., hold_project=P)` (shares the `GD_MAX` lock). Never call tools that launch the
editor or game on a shared machine. GATE: tools listed, one headless edit verified by loading the
result through `gd_run`.

## Numbers

Measured here (Godot 4.7.2, 2026-10-02), 200-file drop, two fresh runs: relative to that drop.
Thumbnail, pack, CI and time-factor numbers are in procedures.md.

| Measure                                                    | Value                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full pipeline, 200 files (190 imported)                    | 21.8 to 24.2 s: ingest 0.6 to 1.4, import 17.4 to 19.7, texture pass 0.4 to 0.5, import 1.9 to 2.7, audit 0.6 to 0.7                                    |
| Rerun, nothing changed                                     | ingest 0.6 to 0.7 s, import 1.4 s, 0 files reimported                                                                                                   |
| One file changed                                           | import 1.4 to 1.6 s, 4 imported files touched (scene + texture)                                                                                         |
| Basis Universal embed instead                              | 13.8 to 14.4 s total; `.godot/imported` 80.6 MB vs 154.5 MB                                                                                             |
| Reject line                                                | more than 3x the category triangle budget (3 of 12 AI files, 69k to 181k triangles)                                                                     |
| gdUnit4 6.2.1 exit codes                                   | 0 pass, 100 failures or errors, 101 orphans only, 103 headless refused, 104 Godot version unsupported, 105 script errors (`GdUnitTestSessionRunner.gd`) |
| [`godot_ci.sh`](scripts/ci/godot_ci.sh) exit codes [added] | 10 import, 11 tests, 12 export produced no file                                                                                                         |

## Quality gates

- Measurable: counts reconcile; 0 engine errors per stage; audit 0 failures; gdUnit4 exit 0 and the
  planted test exit 100; rerun reimports 0 files; pack listing has no `addons/gdUnit4`, `test/`,
  `addons/agentkit`, `addons/prop_pipeline`; `project.godot` checked for
  `physics/3d/physics_engine="Jolt Physics"`, the renderer and the plugin line; actionlint clean.
- Visual: contact sheets opened and read for black or untextured props, scale against the 1 m post,
  pivots, missing parts.

## Common mistakes

| Mistake                                               | What it looks like                                                          | Fix                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Flag AI assets by `asset.generator`                   | AI files pass as DCC and keep arbitrary scale (a toy robot 1.96 m tall)     | manifest `source` column                                                                                        |
| Scale every prop to the manifest height               | authored size variation is lost (every lamp becomes 2.2 m)                  | unit fix for DCC, fit only AI                                                                                   |
| Trust headless to compress extracted textures         | lossless `.ctex`, big packs                                                 | texture pass or `[importer_defaults] texture` (project-wide, also hits UI)                                      |
| `-rd /abs/path` for gdUnit4                           | reports land under `<project>/Users/...`, CI finds no JUnit                 | `-rd res://...`                                                                                                 |
| `ResourceLoader.exists()` as an import check          | a failed import "exists"                                                    | read `valid=false` in the `.import`                                                                             |
| Bump `_get_format_version()` and run `--import`       | nothing reimports                                                           | `-e` job: `scan()`, wait, `reimport_files()`                                                                    |
| Ship with default export filter                       | gdUnit4, tests, agent tools in the pack                                     | `exclude_from_export`                                                                                           |
| `upload-artifact` the Linux binary                    | executable bit lost                                                         | tar first (Voylin, AbMESM0UEHk [00:20:10])                                                                      |
| Loose checksum grep                                   | matches the mono build line too                                             | exact names, expect 2 lines                                                                                     |
| Toggle plugins from a `--script -e` job               | contradictory `is_plugin_enabled`, engine errors                            | edit `[editor_plugins]` in `project.godot`                                                                      |
| `pause_before_teardown()` left in a GUT test          | a windowed run hangs (killed at 25 s); headless GUT 9.7.1 does not pause    | `-gignore_pause` (Butch Wesley [00:32:08], procedures 15)                                                       |
| GUI-input test in CI                                  | fails: headless has no input device                                         | `should_skip_script()` returns a reason; GUT counts it Risky, exit 0 (Butch Wesley [00:48:33], procedures 15)   |
| Ignoring GUT's orphan count                           | a leak ships (3 leaked nodes print "3 orphans")                             | a jump from 1 to 80 is a real leak (Butch Wesley [00:57:00])                                                    |
| Trusting a merged `.tscn`                             | conflict markers break the scene; `ResourceLoader.exists()` still says true | load every `.tscn` after a merge (null plus a Parse Error, procedures 15; Lilith Duncan CAJ_iIedx_I [00:01:36]) |
| Trust the first `--import` after adding a GDExtension | shutdown crash (2 of 3 fresh projects), exit code bad                       | check `extension_list.cfg`, run the smoke job                                                                   |

## Handoffs

- Receives GLB, textures and audio with a manifest (scenario-blender-export, `scenario-*`), budgets
  (scenario-godot-performance-export), scene conventions (scenario-godot-architecture,
  scenario-godot-3d-world, which owns how a prop looks and plays).
- Delivers audited props, a showroom and contact sheets to scenario-godot-3d-world; suites and CI to
  everyone; presets to scenario-godot-performance-export (signing, stores). Sends decimation to
  scenario-blender-expert, material fixes to scenario-godot-rendering-lighting.

## Godot 4.7 notes

- In an `EditorScenePostImportPlugin`, `_pre_process` sees `ImporterMeshInstance3D` nodes and
  `_post_process` sees `MeshInstance3D` (verified, procedures 15); collision suffixes are already
  applied in both.
- `EditorScript.get_scene()` is deprecated: use `EditorInterface.get_edited_scene_root()` (verified:
  the job logs the deprecation).
- `EditorPlugin.add_dock(EditorDock)` replaces `add_control_to_dock` (4.6, still present).
- Supported glTF extensions in 4.7.2 (M8): basisu, webp, texture_transform, emissive_strength,
  unlit, pbrSpecularGlossiness, lights_punctual, node_visibility, animation_pointer, OMI physics. No
  Draco, meshopt, mesh quantization, clearcoat, transmission, ior, specular.
- GDExtension: `classdb_register_extension_class4` and `classdb_construct_object2` still load in
  4.7.2 but are deprecated; godot-cpp is the production path. A project loads an extension only
  after `--import` writes `.godot/extension_list.cfg`.
- 4.4+ `.uid` sidecars move with their scripts; 4.6 `.tscn` files carry `unique_id`.

## References

- [`references/procedures.md`](references/procedures.md) (every procedure with code, live test and
  result; round 2 is section 15), [`expert-notes.md`](references/expert-notes.md) (judgment by
  source, timestamps), [`critique.md`](references/critique.md) (rubric),
  [`gui-paths.md`](references/gui-paths.md) (editor GUI), [`sources.md`](references/sources.md).
- Code: [`scripts/agentkit/prop_pipeline_addon/`](scripts/agentkit/prop_pipeline_addon/) (the
  `addons/prop_pipeline` plugin), [`scripts/ci/`](scripts/ci/) (workflow and CI script),
  [`scripts/gdunit/`](scripts/gdunit/) (gdUnit4 tests), [`scripts/examples/`](scripts/examples/)
  (EditorScript tools, a level importer, a C GDExtension).
