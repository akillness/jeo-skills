# Godot 4.7 traps and platform notes

## Godot 4.7 traps (full list: version deltas section 21; observed ones in [`references/expert-notes.md`](expert-notes.md))

- Godot 3 names parse silently on typed locals: `ps.instance()`, `tween.interpolate_property()` pass
  `--check-only`; run the code. `godot3_flags` scans for 24 old names;
  `audit(P, "classdb", checks=[...])` confirms an API exists.
- `--script` needs a SceneTree script ending in `quit()`; nodes are not in the tree during
  `_initialize` (await a frame); a runtime error before `quit()` hangs the process.
- `--upwards` does not exist and unknown flags are ignored silently: check `godot --help`.
- `-d` waits on stdin at the first error: never unattended.
- Editor singletons in `_init` of an `-e` run crashed (signal 11): wait 2 frames, open a scene
  first.
- 4.7 changes: typed-return overrides without `return` are parse errors; keyboard and mouse device
  IDs are 16 and 32; packed-array element writes skip setters; `AudioStreamPlayer2D/3D.area_mask`
  defaults to 0, so area bus overrides stop applying.
- Headless is not a renderer: MultiMesh `set_instance_*` writes are dropped (assign
  `MultiMesh.buffer` or build windowed), GPUParticles do not simulate (`finished` never fires),
  `create_local_rendering_device()` is null. Headless DOES lay out at any `root.size` with the
  project stretch, and the Dummy audio driver still mixes (scenario-godot-performance-export,
  scenario-godot-3d-world, scenario-godot-vfx, scenario-godot-shaders, scenario-godot-ui,
  scenario-godot-audio).
- `ProjectSettings.save()` from a job rewrites `project.godot`: the header comment and every key
  equal to its default go (`rendering_method="forward_plus"`, the viewport size). Prefer
  `gd_env.set_project_setting` and re-read the file (scenario-godot-architecture,
  scenario-godot-shaders).
- Warn-level GDScript warnings are not printed in headless runs: a headless typing gate needs the
  warning at error level (scenario-godot-architecture).
- The first `--import` after adding a GDExtension or a big addon can crash at shutdown (signal 11);
  `import_project` retries once and reports `retried`. A `.import` edited in the same second as the
  last import can be skipped: push its mtime forward (scenario-godot-2d, scenario-godot-audio,
  scenario-godot-pipeline-automation).
- Loading the running script with `CACHE_MODE_IGNORE` corrupts the VM ("Internal script error!
  Opcode", "Bad address index"): parse checks skip the running files (scenario-godot-vfx,
  scenario-godot-multiplayer; `check_all` skips `addons/agentkit/`).
- Deprecated but present, which hides the problem: TileMap, ParallaxBackground, SkeletonIK3D,
  `add_control_to_dock`. Do not copy 4.8-dev APIs.

## macOS notes

- Binary `/opt/homebrew/bin/godot` (link to `/Applications/Godot.app`); templates in
  `~/Library/Application Support/Godot/export_templates/4.7.2.stable/`; logs in
  `user://logs/godot.log`.
- `user://` is `~/Library/Application Support/Godot/app_userdata/<config/name>/` by default;
  isolated clones use `~/Library/Application Support/godot-agentkit/userdata/<name>-<hash>/`. Both
  are left behind after runs (logs, shader caches, about 100 MB in app_userdata on 2026-10-02):
  `gd_env.userdata_report()` lists them with sizes for a cleanup the user approves; app_userdata
  also holds real projects' data, never touch those.
- Windowed Godot activates itself; `open -g` and `--embedded` did not stop it (`--embedded`
  crashed). The toolkit hands focus back to the previous app (`GD_RESTORE_FOCUS=0` turns that off).
- Metal reports no GPU time: profile on Vulkan. Signing and notarization stay a human step (Artium
  Nihamkin, _n9l15CANag [00:04:05]). Quote every path.

## Windows notes

- `winget install GodotEngine.GodotEngine` puts `godot` and `godot_console` on PATH; the toolkit
  runs `godot`, whose output reaches the pipe. Templates in
  `%APPDATA%\Godot\export_templates\4.7.2.stable\`; `user://` in
  `%APPDATA%\Godot\app_userdata\<config/name>\`, isolated clones in
  `%APPDATA%\godot-agentkit\userdata\`; locks in `%LOCALAPPDATA%\godot-agentkit\locks`. Call Python
  as `py -3` or `python`: a python.org install has no `python3`.
- Python before 3.15 reads and writes text in the ANSI code page, while Godot's files are UTF-8: set
  `PYTHONUTF8=1` (3.15 makes UTF-8 the default). Without it, `new_project` in a folder with a
  Cyrillic name failed with `UnicodeEncodeError` (Python 3.12).
- The GUI-open check reads the process table through PowerShell (`Win32_Process`), which has no
  working directory: an editor whose command line does not name the project is not detected.
- No focus guard (`GD_RESTORE_FOCUS` is macOS only). Windowed runs render through D3D12, which
  `new_project` sets.
- Android export works: scenario-godot-performance-export's `find_android` finds `adb.exe`,
  `apksigner.bat` and `keytool.exe`, `private_home` links the templates with a junction, and Godot
  reads that home through `APPDATA` (pass `gd_perf.home_env(home)`, not `HOME`). A debug APK
  exported and passed `verify_apk` on a GitHub-hosted Windows runner (2026-10-14).
- Observed on a GitHub-hosted Windows runner with Godot 4.7.2 (2026-10-13), in a folder with a
  Cyrillic name, under Python 3.12 with `PYTHONUTF8=1` and under 3.15: locks, `new_project`, jobs,
  `check_all`, the GUI-open refusal, project copies and a windowed capture. The live suites behind
  the other notes ran on macOS only.
