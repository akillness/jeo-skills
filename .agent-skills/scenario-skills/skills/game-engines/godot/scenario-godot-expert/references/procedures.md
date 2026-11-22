# scenario-godot-expert: toolkit API and procedures

Every procedure here ran in Godot 4.7.2.stable.official.ed1daf0bf (standard build, Metal, Apple M5
Max, macOS 26.5.1) on 2026-10-02. Live tests: `tests/code/godot-expert/test_toolkit_live.py` (L1 to
L23; `--only L4,L10`, `--skip-windowed`); offline tests:
`tests/code/godot-expert/test_toolkit_offline.py` (17 tests). Export builds go to the system temp
folder (`GD_TEST_BUILDS` overrides), never into the repo. Numbers below come from the full run of
2026-10-02 20:39 (evidence `tests/live_evidence/godot-expert/live_20261002-203914.json`) and L18 at
20:43 (`live_20261002-204323.json`); the final full run is recorded at the end.

## 0. Setup in any skill

```python
import sys
sys.path.insert(0, "<path to skills/scenario-godot-expert/scripts>")
import gd_env, gd_run, gd_review, gd_stat, gd_live
P = gd_env.base_project("3d", "<scratch folder>/Work3D")   # an installed skill has no base projects: this runs new_project()
```

Rules for every skill: work only in your own clone; never two Godot processes on one project (the
toolkit enforces it); never open the base projects; outputs go to `<project>/.agent_out/` (has
`.gdignore`) or outside the project.

## 1. Toolkit API

### gd_env (environment and projects)

| Function                                                                                                                                                                                                                            | Returns, notes                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find_godot()`                                                                                                                                                                                                                      | path: `$GODOT`, PATH `godot`, `/Applications/Godot.app/Contents/MacOS/Godot`                                                                                                                                                                                                                                                            |
| `version(godot=None)`, `version_tag(godot=None)`                                                                                                                                                                                    | `"4.7.2.stable.official.ed1daf0bf"`, `"4.7.2.stable"`                                                                                                                                                                                                                                                                                   |
| `templates_dir(tag=None)`, `templates_ok(tag=None, platforms=None)` (None: the host OS)                                                                                                                                             | `~/Library/Application Support/Godot/export_templates/<tag>/`; True when `version.txt` and each platform's files exist                                                                                                                                                                                                                  |
| `install_templates(tag=None, tpz=None, keep_download=True)`                                                                                                                                                                         | downloads the official `.tpz` from the godot-builds release, checks it against the release `SHA512-SUMS.txt`, unpacks `templates/*` one level up                                                                                                                                                                                        |
| `new_project(path, template="2d", renderer="forward_plus", jolt=True, name=None, stretch_mode="canvas_items", stretch_aspect="expand", pixel_art=False, viewport=(1152, 648), main_scene=True, do_import=True, isolate_user=False)` | writes `project.godot` with the project-manager defaults, `icon.svg`, `.gitignore`, `.gitattributes`, AgentKit, imports, builds `main.tscn`, imports again (3 Godot launches with the defaults). `renderer`: `forward_plus`, `mobile`, `gl_compatibility`. `pixel_art=True` adds integer scaling, nearest filter, 2D transform snapping |
| `base_project(kind, dest=None, isolate_user=True)`                                                                                                                                                                                  | `cp -cR` of `tests/projects/Base2D` or `Base3D` (both Forward+, Jolt, `canvas_items`/`expand`, imported), then a fresh AgentKit and its own `user://`                                                                                                                                                                                   |
| `isolate_user_dir(project, label=None)`                                                                                                                                                                                             | sets `application/config/use_custom_user_dir=true` and `custom_user_dir_name="godot-agentkit/userdata/<label>-<path hash>"`; returns the folder. Ships with an export: for clones and scratch projects only                                                                                                                             |
| `user_data_dir(project)`, `userdata_report()`                                                                                                                                                                                       | where `user://` is (from `project.godot`); agentkit and app_userdata folders with sizes, deletes nothing                                                                                                                                                                                                                                |
| `install_agentkit(project, overwrite=True)`                                                                                                                                                                                         | copies `scripts/agentkit/*.gd` to `addons/agentkit/` plus `VERSION`                                                                                                                                                                                                                                                                     |
| `install_gut(project, version="9.7.1", do_import=True)`                                                                                                                                                                             | from the cache `assets/cache/gut/Gut-9.7.1.zip` (sha256 pinned), downloaded from the GUT GitHub release on first use; enables the plugin                                                                                                                                                                                                |
| `read_project(project)`, `set_project_setting(project, key, value_literal)`                                                                                                                                                         | dict of `section/key` to raw literal; edits one key in place (`value_literal` is Godot text: `'"Jolt Physics"'`, `true`, `0`)                                                                                                                                                                                                           |

Environment: `GODOT` (binary), `GD_ASSET_CACHE`, `GD_BASE_PROJECTS`.

### gd_run (running Godot)

| Function                                                                                                                                                                                 | Returns, notes                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_script(project, script_path_or_method, args=None, timeout=600, headless=True, editor=False, out_dir=None, window=(160, 90), quit_after=None, extra_args=None, env=None)`            | `script_path_or_method`: `"jobs/x.gd"`, `"res://jobs/x.gd"`, or a method `"res://tools/m.gd:build"` / `"agent_audit.gd:scene"` (dispatched by `agent_job.gd`). `args` arrive in the job as JSON. Returns `ok, error, result, exit_code, timed_out, duration_s, parse_errors, script_errors, shader_errors, engine_errors, warnings, leaks, prints, counts, log_path, result_path, cmd, focus_restores, log` |
| `import_project(project, timeout=600)`                                                                                                                                                   | `--import`; adds `class_cache` (global class cache present); retries once after a crash exit (signal 11 after a new GDExtension or addon, seen by three skills) and reports `retried`                                                                                                                                                                                                                       |
| `check_only(script, project=None, timeout=120)`                                                                                                                                          | `--check-only --script`, verdict from the log (Godot exits 0 either way); relative OS paths resolve from the cwd; a script Godot cannot load fails (`load_errors`); `autoload_false_positives`                                                                                                                                                                                                              |
| `check_all(project, root="res://", exclude=("res://addons/",), timeout=600)`                                                                                                             | compiles every `.gd` in one run; `files_checked`, `failed_files`, `errors_by_file`                                                                                                                                                                                                                                                                                                                          |
| `run_tests(project, framework="gut", filter=None, dirs=("res://test",), timeout=900)`                                                                                                    | GUT with `-gexit -gignore_pause -gjunit_xml_file`; `junit` (tests, passed, failures, errors, failed[]), `summary`; gdUnit4 (`addons/gdUnit4`): `--ignoreHeadlessMode -a <dir> -rd res://.agent_out/tests/gdunit_<stamp> -c`, `summary.exit_meaning` (0 pass, 100 failures, 101 orphans only, 103 headless refused, 104 version, 105 script errors)                                                          |
| `ensure_preset(project, name, platform, export_path="", options=None)`                                                                                                                   | adds or updates a preset in `export_presets.cfg` (`macOS`, `Linux`, `Windows Desktop`, `Web`, `Android`, `iOS`)                                                                                                                                                                                                                                                                                             |
| `export(project, preset, out, release=True, pack=False, timeout=1800)`                                                                                                                   | absolute output path, `.gdignore` when inside the project, template check first; `exists, artifact, bytes` (every file written with the output's stem), `main_bytes, files, export`, and `fix` for the ETC2 ASTC error; an iOS `.ipa` path with `export_project_only` passes on the `.xcodeproj`                                                                                                            |
| `verify_pack(pck, expect=(), load=(), timeout=300)`                                                                                                                                      | mounts the pack in a scratch project; `result.files` (count), `sample`, `missing`, `loaded`, `failed_loads`, `has_project_binary`                                                                                                                                                                                                                                                                           |
| `capture_scene(project, scene=None, out="captures/shot.png", size=(1280, 720), camera=None, frames=8, views=None, review=True, timeout=300, args=None, extra_args=None)`                 | windowed; `views` among `front back left right top three_quarter` (3D) plus `camera`; `result.images`, `checks` (image_checks per PNG)                                                                                                                                                                                                                                                                      |
| `capture_sequence(project, scene, out_dir="captures/seq", count=8, every=6, size=(640, 360), camera=None, sheet=True, timeout=300, args=None, extra_args=None)`                          | `result.images`, `contact_sheet`                                                                                                                                                                                                                                                                                                                                                                            |
| `profile_scene(project, scene=None, seconds=5.0, warmup=30, size=None, headless=False, csv="profile/frames.csv", target_ms=16.67, timeout=600, args=None, driver=None, extra_args=None)` | windowed; `size=(1920, 1080)` renders through a SubViewport at that size; CSV per frame; `budget` (frame_ms), `gpu_budget` (when gpu_ms > 0), `result.notes`. `process_ms`/`physics_ms` are TIME_* monitors (refreshed about once per second, 0 under `--fixed-fps`); per-frame script cost is `process_wall_ms` (sentinel nodes at process priority -1e6 and +1e6, previous frame)                         |
| `audit(project, what="project", timeout=300, **kwargs)`                                                                                                                                  | `project`, `scene` (`scene=`), `resources` (`root=`), `scripts` (`root=`, `exclude=`), `imports`, `classdb` (`checks=["Class", "Class.method", "Class:property", "Class!signal", "Class#CONSTANT"]`)                                                                                                                                                                                                        |
| `running_godot()`, `gui_editor_pids(project)`                                                                                                                                            | all Godot processes with args and cwd; PIDs of GUI Godot processes on that project                                                                                                                                                                                                                                                                                                                          |
| `godot_slot(project=None, windowed=False, wait=1800.0)`                                                                                                                                  | context manager holding a machine slot and the project lock; raises `GodotBusy`                                                                                                                                                                                                                                                                                                                             |

Environment: `GD_MAX` (6), `GD_MAX_WINDOWED` (2), `GD_LOCK_DIR`
(`~/Library/Caches/godot-agentkit/locks`; Windows `%LOCALAPPDATA%\godot-agentkit\locks`),
`GD_ALLOW_EDITOR_OPEN=1` (skip the GUI refusal, only when the user says the editor will not save),
`GD_RESTORE_FOCUS=0`.

The command `run_script` builds:
`godot [--headless] [-e] --path P --script res://... [--resolution 160x90 --windowed] [--quit-after N] -- --agent-result <file> --agent-out <dir> --agent-timeout <timeout - 10> --agent-args <json> [--agent-call res://m.gd:method]`,
stdin from `/dev/null`, a wall-clock kill at `timeout` (only of the process it started).

### gd_review, gd_stat, gd_live

| Function                                                                                                                                                                                                                                                                              | Returns, notes                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gd_review.image_checks(path, sample=256)`                                                                                                                                                                                                                                            | `width, height, mean_luma, std_luma, clipped, crushed, centre_luma, surround_luma, centre_contrast, unique_colors, alpha_mean, histogram, flags, ok`; flags `all_black, all_white, uniform, mostly_clipped, mostly_crushed, transparent, low_contrast_centre`; `ok` false on the first four that mean an empty render |
| `gd_review.compare(a, b, sample=256)`                                                                                                                                                                                                                                                 | `mean_abs_luma_diff, changed_fraction, max_channel_diff, identical`                                                                                                                                                                                                                                                   |
| `gd_review.contact_sheet(paths, out, cols=4, thumb=400, labels=True)`                                                                                                                                                                                                                 | PNG grid (Pillow, else ImageMagick `montage`)                                                                                                                                                                                                                                                                         |
| `gd_review.godot3_flags(root, exts=(".gd", ".gdshader", ".shader"), skip=("addons/",))`                                                                                                                                                                                               | `[{file, line, found, fix, text}]` for 24 Godot 3 and early 4.x patterns                                                                                                                                                                                                                                              |
| `gd_stat.parse_godot_log(text)`                                                                                                                                                                                                                                                       | `agent_result, parse_errors, script_errors, shader_errors, engine_errors, warnings, leaks, prints, counts` (entries `kind, message, detail, func, file, line`)                                                                                                                                                        |
| `gd_stat.frame_stats(frames_ms)`, `budget_check(frames_ms, target_ms, percentile=95.0, max_hitch_ratio=0.01)`                                                                                                                                                                         | n, mean, p50, p95, p99, max, hitches (frames above 2x the median [added]); `ok, value_ms, hitch_ratio, stats`                                                                                                                                                                                                         |
| `gd_stat.read_monitor_csv(path)`, `parse_junit(path)`, `parse_gut_output(text)`, `parse_export_log(text)`, `has_errors(parsed)`                                                                                                                                                       | columns as float lists (NaN for blanks); JUnit totals; GUT totals; export errors                                                                                                                                                                                                                                      |
| `gd_live.channels(project=None)`, `screenshot_game(...)`, `open_editor(project, wait=False)`, `mcp_servers()`, `mcp_config(server, project=None, clone=None)`, `write_mcp_config(project, server, clone=None)`, `mcp_probe(server="hybridindie", timeout=120, clone=None, call=None)` | what can run now; windowed capture; GUI editor (only on request); MCP descriptions; project-local `.mcp.json`; stdio probe that stops the server it started                                                                                                                                                           |

### AgentKit (GDScript, `res://addons/agentkit/`)

- `agent_job.gd` (extends SceneTree): `run() -> Dictionary` to override (an empty or null return
  fails with `aborted`, whatever `expect_errors` says); vars `args`, `out_dir`, `expect_errors`,
  `ignore_patterns`, `notes`; helpers `arg(name, default)` (typed by the default: int, float, bool,
  String, Vector2i, Vector2, Vector3 from arrays), `out_path(rel)`,
  `await load_scene(path, frames=1)`, `await wait_frames(n)`, `await wait_physics_frames(n)`,
  `await wait_seconds(s)`, `note(key, value)`, `is_headless()`, `captured_errors()`,
  `captured_error_count()`, `finish(data={}, code=-1)`; statics `to_json_safe(v)`,
  `save_json(path, data)`.
- `agent_build.gd`: static `save_scene(root, path) -> Dictionary` (sets `owner` recursively,
  skipping instanced sub-scene children, packs and saves), static `read_presets()`, static
  `write_preset(name, platform, export_path="", options={})`; job methods `presets`, `add_preset`,
  `verify_pack`, `make_base_scene_2d`, `make_base_scene_3d`.
- `agent_capture.gd`: `capture(job)`, `sequence(job)`,
  `capture_node(job, node, out, size, cam_path, frames, views)`,
  `make_viewport(job, size, transparent) -> SubViewport` (copies the root's AA, scaling and filter
  settings; emulates the project stretch: the SubViewport is the drawn area with the canvas at the
  logical size, or the internal resolution in viewport mode; job arg `emulate_stretch=false` turns
  it off), static `stretch_compute(window, base, mode, aspect, scale_mode, factor)` (logical,
  screen, margin, scale, scale_xy, render), static `grab(vp) -> Image` (the full-size image with
  bars), `scene_aabb(node)`, `view_transform(aabb, view, fov_deg, aspect)`. Capture results carry
  `stretch`.
- `agent_profile.gd`: `profile(job)`,
  `await record(job, csv_rel, seconds, warmup, viewport) -> Dictionary`.
- `agent_audit.gd`: `project`, `scene`, `resources`, `scripts`, `imports`, `classdb` (each
  `func x(job) -> Dictionary`).

## 2. Writing a job (rules for every domain skill)

```gdscript
extends "res://addons/agentkit/agent_job.gd"
## jobs/build_level.gd: idempotent; run with gd_run.run_script(P, "jobs/build_level.gd", {"rooms": 4})

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")

func run() -> Dictionary:
	var rooms: int = arg("rooms", 3)
	var root: Node3D = load("res://main.tscn").instantiate()
	var level := root.get_node_or_null("Level") as Node3D       # get-or-create
	if level == null:
		level = Node3D.new()
		level.name = "Level"
		root.add_child(level)
	for i in rooms:
		if level.has_node("Room%d" % i):
			continue
		var room := CSGBox3D.new()
		room.name = "Room%d" % i
		room.size = Vector3(6, 3, 6)
		room.position = Vector3(i * 8.0, 1.5, 0)
		level.add_child(room)
	var saved := AgentBuild.save_scene(root, "res://main.tscn")   # owner set on every new node
	root.free()
	return {"ok": saved.get("ok", false), "rooms": rooms, "saved": saved}
```

1. Return a Dictionary with `ok`; never call `quit()` yourself (`finish` does it, once). A null or
   empty return (a script error aborts a typed `run()` and returns `{}`) is reported as a failure,
   even with `expect_errors`. `run_script` also fails a job whose log shows a SCRIPT ERROR before
   its result that the job did not count.
2. Tree work happens inside `run()` (AgentKit already awaited one frame); `load_scene(path, frames)`
   adds the scene and waits.
3. Get-or-create, so a rerun changes nothing. Set `owner` (or use `save_scene`) and save explicitly.
4. Any error logged during the job fails it (captured by a `Logger`, not by log scraping). A job
   that provokes errors on purpose sets `expect_errors = true` in `run()`; known noise goes in
   `ignore_patterns`.
5. Arguments come typed from their default: `arg("size", Vector2i(640, 360))` accepts `[640, 360]`
   from Python.
6. Outputs through `out_path("captures/x.png")`, never into a folder the next export would pack.
7. Free what you instantiate and do not keep it (exit-time leak warnings show in `leaks`).
8. Editor work: `run_script(..., editor=True)`, wait 2 frames,
   `EditorInterface.open_scene_from_path` before `get_edited_scene_root()`.
9. Library code that other jobs call is a RefCounted script with `func name(job) -> Dictionary`, run
   as `"res://.../x.gd:name"`.

The short job in SKILL.md (`load_scene`, `note`, `arg("speed", 4.0)`) ran on 2026-10-02 in a Base3D
clone: pass, 0.23 s, `{"speed": 7.0, "children": 5}` for `args={"speed": 7}` (the int became a
float, typed by the default).

**Run 2026-10-02 (L18): pass.** The job above, run twice with `{"rooms": 4}` on a Base3D clone, then
a read-back job: 4 rooms after two runs (idempotent), saved and reloaded through `owner`; first run
0.43 s.

## P1. Environment and templates (L1)

```python
v = gd_env.version()                       # "4.7.2.stable.official.ed1daf0bf"
if not gd_env.templates_ok(platforms=("macos", "linux", "windows", "web", "android", "ios")):
    gd_env.install_templates()             # official tpz, SHA512 checked against the release sums
```

GATE: `templates_ok(...)` True. **Run 2026-10-02: pass.** Download 1.28 GB
(`Godot_v4.7.2-stable_export_templates.tpz`, SHA512 matched `ca4d71c4...`), 1.9 GB installed,
`version.txt` = `4.7.2.stable`, every platform present.

## P2. New project with the 4.7 defaults (L2)

```python
p3 = gd_env.new_project(path3, template="3d")                                       # Forward+, Jolt
p2 = gd_env.new_project(path2, template="2d", renderer="gl_compatibility", pixel_art=True)
s = gd_run.audit(p3, "project")["result"]["settings"]
assert s["physics/3d/physics_engine"] == "Jolt Physics" and s["display/window/stretch/mode"] == "canvas_items"
```

GATE: the audit reports Jolt, `canvas_items`, the renderer asked for, and no flags. **Run
2026-10-02: pass**, 5.8 s for both (two imports each); 2D: `gl_compatibility`, filter 0 (nearest),
scale mode `integer`.

## P3. Base project clone (L3)

```python
P = gd_env.base_project("3d", dest)        # cp -cR (APFS clone), then install_agentkit
```

GATE: `project.godot`, `.godot/` and `addons/agentkit/agent_job.gd` exist. **Run 2026-10-02: pass,
0.01 s.**

## P4. Run a job, catch every failure mode (L4)

```python
ok = gd_run.run_script(P, "jobs/ok.gd", args={"n": 41, "size": [640, 360]})
assert ok["ok"] and ok["result"]["n_plus_one"] == 42
rt = gd_run.run_script(P, "jobs/rt.gd")          # null.get_child_count() inside run()
assert not rt["ok"] and rt["exit_code"] == 1
pe = gd_run.run_script(P, "jobs/parse.gd")       # `var x :=` with no value
assert pe["parse_errors"][0]["line"] == 4
hg = gd_run.run_script(P, "jobs/hang.gd", timeout=20)   # awaits a signal that never fires
assert hg["exit_code"] == 124
```

GATE: `ok` true and the expected keys in `result`. **Run 2026-10-02: pass.** Small job 0.27 s;
runtime error: exit 1, `captured_error_count` 1; parse error at line 4 reported (Godot itself exited
0); hang stopped by the AgentKit watchdog at 10.2 s (timeout 20 s, watchdog at timeout minus 10 s),
exit 124. **Rerun 2026-10-02 22:36: pass**, plus a job that sets `expect_errors` and is aborted by a
null call: `ok` false, `aborted` true (it reported ok true before the fix, as
scenario-godot-gameplay found).

## P5. Audits (L5)

```python
gd_run.audit(P, "project")
gd_run.audit(P, "scene", scene="res://main.tscn")       # nodes by class, lights, meshes, bodies, particles, flags
gd_run.audit(P, "resources"); gd_run.audit(P, "imports")
gd_run.audit(P, "classdb", checks=["CharacterBody2D.move_and_slide", "Camera2D:zoom", "Button!pressed",
                                   "InputEvent#DEVICE_ID_KEYBOARD", "KinematicBody2D", "Tween.interpolate_property"])
```

GATE: flags fixed or listed in the report; `classdb.missing` lists only what you meant to test.
**Run 2026-10-02: pass**, 0.9 s for five audits. Base3D: 8 nodes, flag "meshes with no material
(render default white): Floor/Mesh"; classdb missing exactly `KinematicBody2D` and
`Tween.interpolate_property`.

## P6. Parse checks (L6, L16, L17)

```python
gd_run.check_all(P)                                   # every .gd in one in-process run (autoloads loaded)
gd_run.check_only(P / "jobs" / "ok.gd", project=P)    # one file, --check-only, verdict from the log
gd_review.godot3_flags(P)                             # Godot 3 names the parser lets through
```

GATE: `check_all` `failed_files == []`; `godot3_flags` empty or each hit explained; then run the
code (typed-local member calls are only caught at runtime). **Run 2026-10-02: pass.** `check_all` 4
files, caught `res://jobs/parse.gd:4` (0.5 s). Rerun 22:36: a relative OS path to the broken script
and a missing file both fail now (both came back ok true before); Godot's own exit code on the parse
error is 0. L16: `check_only` on a script reading the autoload `GameState` logs "Compile Error:
Identifier not found: GameState" (moved to `autoload_false_positives`); `check_all` passes the same
2 files. L17: 13 flags on the Godot 3 script and shader; the 4.7.2 parser rejects it ("The "tool"
keyword was removed in Godot 4"); the modern twin parses with no flag; the Godot 3 shader fails to
compile ("Expected valid type hint after ':'") once `get_shader_uniform_list()` forces compilation.

## P7. Headless editor job (L7)

```gdscript
extends "res://addons/agentkit/agent_job.gd"
func run() -> Dictionary:
	await wait_frames(2)                                   # editor singletons are not ready in _init
	EditorInterface.open_scene_from_path("res://main.tscn")
	await wait_frames(2)
	var edited := EditorInterface.get_edited_scene_root()
	var marker := Marker3D.new()
	marker.name = "AgentMarker"
	edited.add_child(marker)
	marker.owner = edited                                  # without owner it is not saved
	EditorInterface.save_scene_as("res://edited/main_edited.tscn")   # returns void
	await wait_frames(1)
	var back: Node = load("res://edited/main_edited.tscn").instantiate()
	var ok := back.has_node("AgentMarker")
	back.free()
	return {"ok": ok, "editor_hint": Engine.is_editor_hint()}
```

`gd_run.run_script(P, "jobs/editor.gd", editor=True, timeout=180)`. GATE: the saved scene reloads
with the change. **Run 2026-10-02: pass, 1.06 s**; `editor_hint` true; 1 benign error
(`Parameter "t" is null`, thumbnail generation in the dummy renderer). Without `editor=True` the job
fails: "Nonexistent function 'get_resource_filesystem' in base 'EditorInterface'".

## P8. GUT tests (L8)

```python
gd_env.install_gut(P)                           # GUT 9.7.1, plugin enabled
# test/test_main_scene.gd extends GutTest: add_child_autofree, await wait_physics_frames(120), watch_signals
gd_run.import_project(P)
r = gd_run.run_tests(P, "gut", dirs=("res://test",))
assert r["ok"] and r["junit"]["failures"] == 0 and r["junit"]["tests"] > 0
```

GATE: JUnit `failures == 0`, `tests > 0`, and each new test seen red once. **Run 2026-10-02: pass.**
3 tests pass in 2.98 s (current camera; a 1 m RigidBody3D box rests with its center at y = 0.5
within 0.05 on Jolt after 120 physics frames; a bounded signal wait); the red suite reports 1
failure and exits 1.

**gdUnit4 (L23), run 2026-10-02 22:36: pass.** gdUnit4 6.2.1 (copied from the
scenario-godot-pipeline-automation cache into a throwaway clone): 2 tests pass, the JUnit file is
found at `.agent_out/tests/gdunit_<stamp>/report_1/results.xml`; the red suite reports 1 failure,
exit 100 ("failures or errors"). With the old absolute `-rd` the report landed under
`<project>/Users/...` and no JUnit was found.

## P9. Export and pack verification (L9)

```python
gd_run.ensure_preset(P, "mac", "macOS"); gd_run.ensure_preset(P, "linux", "Linux"); gd_run.ensure_preset(P, "web", "Web")
r = gd_run.export(P, "mac", builds / "mac" / "Game.zip")
if "fix" in r:                                   # ETC2 ASTC disabled
    gd_env.set_project_setting(P, "rendering/textures/vram_compression/import_etc2_astc", "true")
    gd_run.import_project(P)
    r = gd_run.export(P, "mac", builds / "mac" / "Game.zip")
gd_run.export(P, "linux", builds / "linux" / "Game.x86_64")
gd_run.export(P, "web", builds / "web" / "index.html")
gd_run.export(P, "linux", builds / "pack" / "Game.pck", pack=True)
gd_run.verify_pack(builds / "pack" / "Game.pck", expect=["res://main.tscn", "res://project.binary"], load=["res://main.tscn"])
```

GATE: `ok`, artifact size recorded, `verify_pack` ok. **Run 2026-10-02: pass**, 14.9 s for the whole
sequence. macOS without ETC2 ASTC fails and returns `fix`; then macOS universal zip 60.8 MB, Linux
x86_64 73.5 MB (executable bit set), Web 9 files, pack 1.5 MB with 253 files, `main.tscn` loads from
it. **Rerun 22:36 with the fixed size accounting: pass**: Linux 75.0 MB (binary plus `Game.pck`),
Web 41.4 MB over 9 files (`main_bytes` 5.4 KB for `index.html`, which was all `bytes` used to
count), iOS with `export_project_only` ok on `Game.xcodeproj` (430 MB, mostly the engine
xcframework; it used to report ok false), pack 255 files. Not run: signing, notarization, Android
and iOS builds, store uploads (accounts and devices).

## P10. Windowed capture and review (L10)

```python
r = gd_run.capture_scene(P, "res://main.tscn", out="captures/main.png", size=(960, 540),
                         views=["camera", "front", "top", "three_quarter"])
bad = {p: c["flags"] for p, c in r["checks"].items() if not c["ok"]}
sheet = gd_review.contact_sheet(r["result"]["images"], P / ".agent_out" / "captures" / "sheet.png", cols=2)
# open the sheet (Read tool) and judge it
```

GATE: no image with `ok` false; the sheet opened and judged; `compare` shows the views differ. **Run
2026-10-02: pass**, 0.88 s for 4 views; no flags on the 3D views, `low_contrast_centre` on the 2D
icon scene (small icon on flat gray, expected); camera vs front `changed_fraction` 0.51; 2 focus
restores. Sheet: `tests/live_evidence/godot-expert/capture_sheet_20261002-203914.png` (opened: cube
from camera, front, top and three-quarter views, 2D icon).

## P11. Sequence capture (L11)

```python
gd_run.run_script(P, "jobs/make_fx.gd")          # builds res://fx.tscn: base scene + GPUParticles3D fountain
r = gd_run.capture_sequence(P, "res://fx.tscn", out_dir="captures/fx_seq", count=6, every=8, size=(480, 270))
```

GATE: frames differ (`compare` changed_fraction above 0) and the sheet shows the motion. **Run
2026-10-02: pass**, 6 frames, first vs last changed 0.0043 (particles only move), sheet
`tests/live_evidence/godot-expert/fx_sequence_sheet_20261002-203914.png` (opened: sparks visible
above the cube).

## P12. Profiling (L12)

```python
h = gd_run.profile_scene(P, "res://main.tscn", seconds=2, headless=True)                     # CPU loop only
v = gd_run.profile_scene(P, "res://fx.tscn", seconds=2, size=(1920, 1080), driver="vulkan")  # real GPU time
assert v["gpu_budget"]["ok"]
```

GATE: `budget` / `gpu_budget` ok against the brief, on the target hardware for a final verdict.
**Run 2026-10-02: pass.** Headless 291 frames at 6.9 ms mean (the low-processor sleep, nothing
drawn); Vulkan GPU p95 1.43 to 1.78 ms over four runs (1.47 in the final run), 15 draw calls; Metal
`gpu_ms` 0; windowed `frame_ms` p50 8.32 ms (120 Hz refresh cap). Rerun 22:36: the `process_ms`
monitor took 3 distinct values over 241 rows (one per second), `process_wall_ms` is present on every
row (p50 0.001 ms: the fx scene runs no scripts); an all-zero `physics_ms` column goes through
`frame_stats` without error.

## P13. Concurrency cap (L13)

Four 2-second jobs on four projects with `GD_MAX=2`. GATE: at most 2 at once. **Run 2026-10-02:
pass**, peak 2, 5.3 s total.

## P14. A GUI Godot holds the project (L14)

```python
try:
    gd_run.run_script(P, "jobs/x.gd")
except gd_run.GodotBusy as e:
    ...   # use the editor (MCP) or ask the user to close it; never close it yourself
```

**Run 2026-10-02: pass**: a windowed Godot started by the test on the project was detected by PID
and `GodotBusy` raised; the test's own process then exited by itself.

## P15. MCP into the editor (L15)

```python
gd_live.mcp_probe("hybridindie", call=("godot_get_server_info", {}))   # uvx, stdio, nothing installed globally
gd_live.write_mcp_config(P, "hybridindie")                              # <P>/.mcp.json only
```

Live editor bridge: install the addon zip from the hybridindie release into `addons/godot_mcp`,
enable it, open the GUI editor (only when the user asks: it takes focus), then
`godot_get_server_info` > `godot_list_toolsets` > inspection tools >
`godot_enable_toolset("scene_edit")` > `dry_run` > edit > `save_scene` (automation docs digest).
After any MCP write to settings, `audit(P, "project")` and diff `project.godot`. **Run 2026-10-02:
pass** for the stdio server (initialized in 1.6 s, server 2026.09.30, package 4.0.1, 23 tools,
`godot_get_server_info` answered). Not run: the editor bridge (needs a GUI editor, which takes
focus) and tugcantopaloglu (needs a clone, an npm build and a game autoload).

## P16. Debug overlays in a capture (L19)

```python
r = gd_run.capture_scene(P, "res://collide.tscn", out="captures/collisions.png", size=(640, 360),
                         extra_args=["--debug-collisions"])        # or ["--debug-navigation"]
gd_review.compare(plain_png, r["result"]["images"][0])
```

GATE: the overlay shows the shape where the design expects it (open the image). **Run 2026-10-02:
pass.** An Area3D with a 1 m sphere and no mesh: two plain captures of the same static scene were
pixel-identical (`changed_fraction` 0.0, so `compare` can see small edits), the `--debug-collisions`
capture differed by 0.0052 (thin cyan wireframe of the sphere and the floor box edge, opened in
`tests/live_evidence/godot-expert/debug_collisions_20261002-204536.png`).

## P17. Stretch emulation in captures (L20, L21)

```python
r = gd_run.capture_scene(P, "res://main.tscn", out="captures/keep.png", size=(1280, 480))   # project aspect "keep"
r["result"]["stretch"]   # {"logical": [1152, 648], "screen": [853, 480], "margin": [214, 0], ...}
```

GATE: the capture shows what a window of that size shows, bars included. **Run 2026-10-02 22:36:
pass.** L20: `stretch_compute` against the engine root window (headless, `root.size` set) on 15
cases: keep, keep_width, keep_height, expand and ignore at 1280x480 and 800x1200, integer scale at
1920x1080 and 2000x1000, factor 1.5, viewport mode keep and expand: all match on logical size,
origin and per-axis scale (the first run caught that `ignore` scales each axis differently:
`scale_xy`). L21: a keep project captured at 1280x480 is 1280x480 with black bars at x < 214 and
x >= 1067 and the gray canvas between (opened:
`tests/live_evidence/godot-expert/keep_capture_20261002-223656.png`). Before the fix keep filled the
image and keep_width/keep_height acted like expand (scenario-godot-ui finding).

## P18. One user:// per clone (L22)

```python
P = gd_env.base_project("3d", dest)       # isolate_user=True by default
gd_env.user_data_dir(P)                   # ~/Library/Application Support/godot-agentkit/userdata/<name>-<hash>
gd_env.userdata_report()                  # leftovers with sizes; deletes nothing
```

**Run 2026-10-02 22:36: pass.** Two Base3D clones (both still `config/name="Base3D"`) wrote
`user://probe.txt` into two folders, `.../userdata/UserA-0f085231` and
`.../userdata/UserB-b341e9d6`; `user_data_dir` predicted the path. The report listed 50 folders (102
MB) in Godot's app_userdata, left by earlier runs of all skills.

## Run 2026-10-02 22:36 (after the lead triage)

`python3 tests/code/godot-expert/test_toolkit_live.py`: **23/23 pass**, exit 0, evidence
`tests/live_evidence/godot-expert/live_20261002-223656.json`; `test_toolkit_offline.py` 17/17 pass.
The export builds of that run (601 MB) were moved to
`../delete/6 - Godot/godot-expert-test-builds/`.

## Final run (2026-10-02 20:50)

`python3 tests/code/godot-expert/test_toolkit_live.py`: **19/19 pass** in 70 s of test time, exit 0,
evidence `tests/live_evidence/godot-expert/live_20261002-204955.json`. `test_toolkit_offline.py`:
15/15 pass. All Python byte-compiles; the five AgentKit scripts pass `check_only` with zero errors.
One earlier full run (20:48) failed L19 because L18 had added rooms to the shared clone's
`main.tscn`, hiding the trigger; L19 now uses its own clone (a test-order bug, not a toolkit bug).

Not run here, and why: the hybridindie editor bridge and any GUI-editor step (the GUI editor takes
focus; only the stdio server was probed); tugcantopaloglu (needs a git clone, an npm build and a
game autoload); gdUnit4 (GUT is the one framework installed, per "do not install both"); signing,
notarization, Android and iOS builds, device runs and store uploads (accounts, devices).
