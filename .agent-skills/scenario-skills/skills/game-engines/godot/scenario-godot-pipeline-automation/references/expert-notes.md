# Expert notes (scenario-godot-pipeline-automation 0.1)

Judgment from the sources, grouped by expert, with timestamps. "Checked" means a live test in this
skill confirmed it on Godot 4.7.2 (2026-10-02); "[added]" marks this skill's own conclusions. Source
details are in `sources.md`.

## Testing

**Butch Wesley, author of GUT (GodotCon 2025, ImqhHLlPfZg)**

- Red then green is the only way to test the test; retrofit by replacing a function body with
  `pass`, watching the failure, restoring [00:13:40 to 00:16:28]. A test that still passes with the
  body removed inherits behavior or tests nothing [00:15:55]. Applied: every suite here has a
  planted failure (G2, C3).
- Skip tests for proofs of concept and design exploration [00:08:16].
- Unit test the method; scene tests are slow, keep a few spot checks [00:39:38, 00:44:47].
- Autoloads leak state between tests, so tests fail 10% of the time [00:12:34]; free nodes with
  `add_child_autofree` [00:28:39]; an orphan count jumping from 1 to 80 is a real leak [00:57:00].
- The Input singleton has no mouse device in `--headless`: skip GUI-input scripts in CI with
  `should_skip_script()` [00:48:33 to 00:50:14]. gdUnit4 6.2.1 prints the same limit at start
  (checked).
- `pause_before_teardown()` hangs CI; use the ignore-pause option [00:32:08 to 00:33:53].
  `GutInputSender`: `release_all()` and `clear()` in `after_each` [00:36:16].
- Live [15]: GUT 9.7.1 headless did not pause (exit 0 in 0.9 s); a windowed run hung until killed at
  25 s, and `-gignore_pause` fixed it. A string from `should_skip_script()` is reported "[Risky]
  Script was skipped" with exit 0. Three leaked nodes printed "3 orphans" with exit 0: the count has
  to be read, it fails nothing.
- Keep native `assert()` in code: it is stripped from exports, and tests do not replace it
  [00:51:22].

**Godotneers (CreugthdgJ0, gdUnit4, 2025)**

- Test integration and behavior through signals and public results, not internals [01:08:36,
  00:53:29].
- Body/brain split: the character exposes `desired_direction`, a test brain drives it with
  navigation `move_to` and `teleport` [00:17:11 to 00:23:12]. Levels hold a spawn point, not the
  player [00:56:56].
- `monitor_signals(obj)` before the action, then `await assert_signal(obj).is_emitted("x")`; a
  signal fired before monitoring is missed [00:36:34 to 00:38:53]. API names checked in gdUnit4
  6.2.1 (`scene_runner`, `monitor_signals`, `assert_signal`, `wait_until`).
- `runner.set_time_factor(5)` cut an 8 s test to about 2 s [00:55:25]. Checked: a 1 s timer emitted
  after 237 ms at factor 5.
- A failed assertion does not stop the test; the later timeouts map where it broke [01:06:44]. Plain
  runs show "line n/a": rerun in debug for the line [00:07:18].
- Write tests after exploring a feature, before you forget it [01:07:32].

**Mike Schulze, author of gdUnit4 (GodotFest 2025, x6GdTgIAFiU)**

- Signals for UI tests; screenshot diffs need a human-approved baseline [00:24:19].
- `auto_free` against orphans [00:15:42]; failure at the 5 s default timeout names the assertion
  [00:20:16].
- JUnit XML and HTML reports, a GitHub Action that posts results on pull requests [00:28:09].
  Checked: 6.2.1 writes `results.xml` and `index.html` under `-rd` (which must be `res://`).

**Deciding condition, GUT vs gdUnit4** (both sources): GDScript-only and doubles-heavy: GUT. C# or
CI reports: gdUnit4. Do not install both [digest].

## Import code and editor tools

**Dinoleaf (sSurjCgebjw)**

- The parser takes `PackedByteArray`, the source is injected as a bound Callable, so one parser
  serves `res://`, `user://`, zips, HTTP and tests with literal bytes [00:04:46 to 00:12:45]. Write
  the runtime loader first, wrap it for the editor later [00:02:19]. Applied: `glb_probe.gd` and
  `test_glb_probe.gd`.

**Queble (nW7YtSSJzbQ)**

- Tool-script mutation bypasses undo unless routed through `EditorUndoRedoManager` [00:04:41].
  Checked: undo and redo through `get_history_undo_redo()` in a headless `-e` job.
- `@export_tool_button` (4.4+) needs `@tool` [00:03:38]; `_validate_property` visibility needs
  `notify_property_list_changed()` in the toggle's setter [00:05:12 to 00:08:19].

**Firebelley (VyTys5oCdN8)**

- Every script a tool talks to must be `@tool` [00:06:58]; a `Window` popup needs `close_requested`
  handled [00:03:37]. For an agent, skip the popup and pass arguments to the job.

**Heartbeast (MX2I3376ubE)**

- One EditorScript `_run()` as a project preset (viewport size, stretch mode, nearest filter,
  `ProjectSettings.save()`) [00:03:19 to 00:03:51]. `get_editor_interface()` is deprecated: use the
  `EditorInterface` singleton (version deltas).

**Godot docs (Running code in the editor; Making plugins; Import plugins)**

- New nodes need `owner` set to the edited scene root or they are not saved; configuration warnings
  refresh only through `update_configuration_warnings()`; script edits to a scene do not mark it
  dirty (use `EditorUndoRedoManager` or `mark_scene_as_unsaved`).
- Import plugins: `save_path` has no extension; options need `name` and `default_value`. Checked
  with `lvl_import.gd`.
- [added] A format-version bump does not reimport under `--import`;
  `EditorFileSystem.reimport_files()` after `scan()` does (T5).

## CI and export

**Voylin (AbMESM0UEHk)**

- Run `--import` before exporting in a fresh checkout (4.3+) [00:16:29, 00:17:42].
- Templates unzip into a nested `templates/` folder under `<ver>.stable` [00:11:34 to 00:13:50].
  Checked: the 4.7.2 `.tpz` has a top folder `templates/`.
- Linux exports lose the executable bit in artifact zips: tar first [00:20:10 to 00:23:06]. Checked:
  the tar keeps mode 755.

**godot-ci README (abarichello/godot-ci)**

- Docker image tags `<ver>` and `mono-<ver>`; Mono paths need the `.stable.mono` suffix; signing
  secrets only in CI variables. Tags 4.7.2 and mono-4.7.2 exist (checked on Docker Hub, 2026-10-02).
  [added] The workflow here downloads the official binary instead and checks SHA-512, so it does not
  depend on a third-party image.

**Godot docs (Command line)**

- The export path is relative to the project, not the working directory; the output folder must
  exist; preset names are exact.

**Lilith Duncan (CAJ_iIedx_I, Backstitch)**

- A merged `.tscn` can fail to parse; keep art and colliders in one instanced sub-scene so a merge
  cannot split them [00:01:36 to 00:03:14, 00:10:32].
- Live [15]: a scene with conflict markers returned null from `load` with a Parse Error while
  `ResourceLoader.exists()` said true: after a merge, load every scene.

## Native code

**David Snopek, Godot GDExtension team (GodotCon 2024, 4R0uoBJ5XSk)**

- C++ for third-party libraries and native performance [00:03:16]; hot reload for gameplay code, not
  engine-style classes [01:02:37, 01:25:30].
- Rename `entry_symbol` per extension in the `.gdextension` and `register_types.cpp` [00:13:22 to
  00:16:08]; use `memnew`, `GDREGISTER_RUNTIME_CLASS` for gameplay classes [00:30:01, 01:14:10].
- [added] The loading chain can be smoke-tested in plain C with the dumped `gdextension_interface.h`
  and clang; the class appears only after `--import` writes `extension_list.cfg` (X2, X3).

**FinePointCGI (z14cfTc40uQ, 2023)**

- Rust gdext needs `crate-type = ["cdylib"]` [00:05:05]; its 2023 syntax is outdated (digest). Not
  run here.

## Agents and MCP

**Fennara (2vSYP7GyA5U, builds one of the servers he ranks)**

- Judge an MCP server by feedback fidelity (diagnostics, class info, runtime errors, screenshots),
  not tool count [00:02:51, 00:09:22]. Servers scraping the editor Output panel report errors for
  lines no longer on disk [00:06:20].

**PixelLab (THwZYWuOdZI, promotional)**

- No Godot MCP at all: the agent runs the Godot binary and reads the console [00:13:45]; give it the
  app path, a `PLAN.md` it keeps current, ask for automatic behavior [00:08:02 to 00:14:17].

**hybridindie/godot-mcp and tugcantopaloglu/godot-mcp READMEs**

- hybridindie gates 193 tools into toolsets because a large exposed surface degrades tool selection;
  tugcantopaloglu exposes 157 with no safety classes; both split headless subprocess tools from live
  editor or game tools.
- [added] Coding-Solo/godot-mcp (the upstream of tugcantopaloglu's fork) worked project-locally: 14
  tools, headless scene edits verified by loading the result in Godot. Its `launch_editor` and
  `run_project` open windows.

## Image-to-3D files [added]

From the 12 real files in the art drop (two generators, 2026-09-29): generator string "Khronos glTF
Blender I/O v4.5.51"; world heights from 0.56 m to 8.1 m with no relation to the object (a toy robot
at 1.96 m); 2 to 35 materials; 917 to 181k triangles, 3 of 12 over three times their category
budget; clearcoat, transmission, ior or specular extensions in 8 of 12, which 4.7.2 ignores; one
file with an animation. A sample of 12 from two generators: treat these as signs to check, not
rates.
