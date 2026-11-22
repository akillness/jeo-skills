---
name: scenario-godot-expert
description: "Use when an agent drives Godot 4.7 on macOS or Windows for any task: headless --script jobs, --import, --check-only, command-line exports, GUT tests, windowed screenshots, the headless editor (-e) or an MCP server into a running editor; when a run hangs or fails silently, a capture is black, Godot 3 code breaks in 4.x, 'Identifier not found', export templates are missing; or when a Godot brief (2D, 3D, shaders, VFX, UI, multiplayer, export) must go to the right scenario-godot-* specialist."
license: MIT
---

# Godot expert (technical director and agent protocol)

Target: Godot 4.7.2.stable (standard build, no C#), macOS Apple Silicon with Metal by default, or
Windows with D3D12.

Expert Godot work is a loop run against evidence: set the budget, build one stage, measure it, look
at it, fix it, advance. An agent without a mouse gets there by picking the right channel, passing
only on a machine-readable result, and never trusting one signal alone. This skill is that protocol,
the shared toolkit every scenario-godot-* skill calls ([`scripts/`](scripts/)), and the map of the
team. If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**Status (2026-10-02):** every toolkit function below ran in Godot 4.7.2 here (23 live tests, 17
offline, all pass; [`references/procedures.md`](references/procedures.md)).

## Stance (the expert delta)

1. **Headless output is the truth; the editor's Output panel is not.** MCP servers that scrape it
   "report errors for lines no longer on disk", and it does not list every project error (Fennara,
   2vSYP7GyA5U [00:02:51, 00:06:20]). PixelLab's agent runs the Godot binary itself and reads the
   console (THwZYWuOdZI [00:13:45]). Pass on the `AGENT_RESULT` envelope plus a log scan, never on
   "it exited": a script with a parse error exits 0, with or without `--check-only`, and so does a
   script path Godot cannot find (version deltas, verified; L6).
2. **One writer per project.** A GUI editor holding a project keeps its own copy of the open scenes,
   so its next save can overwrite a headless edit [added]; merged `.tscn` files can fail to parse
   (Lilith Duncan, CAJ_iIedx_I [00:01:36]). The toolkit refuses a project a GUI Godot has open; work
   through that editor (MCP) or ask the user to close it. Never close a Godot or Blender process you
   did not start [added].
3. **Milliseconds against a budget, on the target.** Measure before optimizing (Dan Does Dev,
   s2C2RO_WMh0 [00:07:12]); profile on the real device class, thermals included (Ian Bolton,
   WrjaUNAXYqk [00:09:35]). Headless frame time is loop time, not game cost; windowed frame time on
   this Mac is pinned to the display refresh; judge `gpu_ms` and `cpu_ms` (observed).
4. **Look AND check.** Every frame goes through [`gd_review.image_checks`](scripts/gd_review.py) and
   a contact sheet you open. Headless draws nothing, so captures need a windowed run (observed).
   After AI asset import, check facing, animation direction, tile seams and camera jitter by eye
   (PixelLab, THwZYWuOdZI).
5. **Tests are the contract.** Assert on signals and public results, not internals (Godotneers,
   CreugthdgJ0 [01:08:36]; Butch Wesley, ImqhHLlPfZg [00:16:59]; Mike Schulze, x6GdTgIAFiU
   [00:24:19]); bound every await (2 s Godotneers, 5 s Schulze); prove the test bites by emptying
   the function and watching it go red (Wesley [00:13:40]).
6. **Design for a mouseless driver.** Split body and brain so a test brain can steer a character
   (Godotneers [00:18:14]). Headless has no mouse device (Wesley [00:48:33]), yet GUI input still
   tests headless: `get_viewport().push_input(event, true)` reaches Controls, while
   `Input.parse_input_event` never reaches a MOUSE_FILTER_STOP Control (scenario-godot-gameplay,
   scenario-godot-ui, observed); pass `true` so positions are logical, not window pixels. Levels
   hold a spawn point, not the player (Godotneers [00:56:56]).
7. **Edits persist only with `owner` and a save.** `add_child` alone is invisible in the Scene dock
   and lost on save (Godot docs, Running code in the editor); script edits bypass Undo unless routed
   through `EditorUndoRedoManager` (Queble, nW7YtSSJzbQ [00:04:41]).
8. **Be honest about visual editors.** VisualShader, AnimationTree, the TileSet and theme editors,
   and the particle inspector are visual; the agent writes `.gdshader`, `.tres`/`.tscn` text, or
   builds the resource in code, and names the GUI path for a human. Pick an MCP by feedback
   fidelity, not tool count (Fennara [00:09:22]).

## Execution channels

| Channel                                                               | Use for                                                       | Cost (measured here)                                                                      | Rules                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Headless job** [`gd_run.run_script`](scripts/gd_run.py)             | logic, data, audits, scene building, imports, tests, exports  | 0.2 s for a small job; `--import` about 2 s                                               | default channel; watchdog ends a hung job (exit 124)                                                                      |
| **Windowed job** `capture_scene`, `capture_sequence`, `profile_scene` | anything that must render: screenshots, sequences, GPU time   | about 1 s for 4 views warm; first capture in a fresh project 10.8 s, a 5 s profile 29.6 s | 160x90 window, SubViewport at the requested size, focus handed back (2 restores per run observed); `GD_MAX_WINDOWED` 2    |
| **Headless editor** `run_script(editor=True)`                         | EditorInterface: open, edit and save scenes; EditorFileSystem | 1.1 s                                                                                     | wait 2 frames before editor calls; without `-e` EditorInterface calls fail (observed)                                     |
| **GUI editor + MCP** (hybridindie `godot-editor-mcp`)                 | the user's open editor: live tree, selection, undoable edits  | stdio probe 0.9 s, 23 tools exposed by default                                            | only when the user has the editor open; project-local `.mcp.json` only ([`gd_live.write_mcp_config`](scripts/gd_live.py)) |
| **Running game + MCP** (tugcantopaloglu)                              | drive a running game (input, eval)                            | not run here                                                                              | clone, `npm run build`, a game autoload on port 9090                                                                      |

`gd_live.channels(P)` reports what is possible now. Prefer the headless channels; add an MCP for
live scene inspection.

## Establish first

Ask once, then run: target platforms and lowest device; frame budget (default 60 fps desktop, 30 fps
mobile); 2D or 3D; renderer (Forward+ desktop 3D, Mobile for demanding phones, Compatibility for web
and widest reach, after Ray Hayes, KWhVVMpihsc [00:06:03]); art style and pixel art or not; whether
the user's editor has the project open; the deliverable. Then `gd_live.channels(P)` and
`gd_run.audit(P, "project")`, and write the renderer, physics engine (Jolt for 3D), stretch mode,
main scene and autoloads into the plan.

## Workflow (the expert loop)

1. **Brief in numbers.** Budgets per platform, resolution, scale, style. GATE: every later check has
   a number to compare with.
2. **Project.** `gd_env.base_project("3d"|"2d", dest)` (APFS clone, 0.01 s, its own `user://`
   folder) or `new_project(...)`, which writes the project-manager defaults a hand-written
   `project.godot` lacks. GATE: `audit(P, "project")` has no flags.
3. **Baseline.** `check_all(P)`, `audit(P, "scene", scene=...)`, captures from fixed views, a
   profile if performance matters. GATE: zero parse and script errors; flags fixed or listed; sheet
   opened.
4. **Build one stage** with small idempotent jobs (get-or-create, `owner` set, explicit save). Route
   domain work to its owner (below).
5. **Measure.** Audit, tests (`run_tests`), `profile_scene` plus
   [`gd_stat.budget_check`](scripts/gd_stat.py), or the export result. GATE: numbers against the
   brief.
6. **Look AND check.** Same views, `image_checks`, contact sheet opened, judged with the domain
   skill's critique. GATE: no flag that sets `ok` false, the change visible (`compare`
   changed_fraction above 0).
7. **Fix before advancing**, one change at a time; `compare` proves parity or gain.
8. **Deliver with evidence.** Each step with its toolkit call, then **Verified** (what ran, result
   file, number or frame) and **Assumed** (not run, defaults). Never call a scene, shader, level or
   build done without numbers and a frame you looked at.

## Shared toolkit ([`scripts/`](scripts/), the contract for every scenario-godot-* skill)

`import sys; sys.path.insert(0, "<scenario-godot-expert>/scripts")`. System python3, standard
library (Pillow optional).

Every `gd_env`, `gd_run`, `gd_review`, `gd_stat` and `gd_live` call, with defaults and return
values: [`references/procedures.md`](references/procedures.md) section 1. Most used:
`gd_env.new_project`, `gd_run.run_script`, `gd_run.capture_scene`, `gd_run.profile_scene`,
`gd_run.export`, `gd_review.image_checks`.

Every `gd_run` run returns `ok`, `error`, `result` (the job's dictionary), `exit_code`, `timed_out`,
`parse_errors`, `script_errors`, `shader_errors`, `engine_errors`, `warnings`, `leaks`, `log_path`,
`result_path`. Output lands in `<project>/.agent_out/` (carries `.gdignore`). Concurrency: `GD_MAX`
(6) Godot processes, `GD_MAX_WINDOWED` (2), one per project, all through `gd_run.godot_slot`;
`GodotBusy` when a GUI editor holds the project.

A domain job is a GDScript file in the project (AgentKit, [`scripts/agentkit/`](scripts/agentkit/),
is copied to `res://addons/agentkit/`):

```gdscript
extends "res://addons/agentkit/agent_job.gd"
func run() -> Dictionary:
	var scene := await load_scene("res://main.tscn", 2)   # in the tree, 2 frames waited
	note("children", scene.get_child_count())
	return {"ok": true, "speed": arg("speed", 4.0)}       # arg() typed by its default
```

Or a method on any RefCounted script, `run_script(P, "res://tools/x.gd:build", args)` (it receives
the job). Errors logged during the job flip `ok` to false unless `expect_errors` is set. A script
error aborts a typed `run() -> Dictionary`, which then returns `{}`: an empty result always fails
(`aborted: true`), even with `expect_errors`, so return at least `{"ok": true}`. `export` reports
`bytes` for every file it wrote (`main_bytes` for the named one) and treats an iOS
`export_project_only` Xcode project as the `artifact`. Captures emulate the project stretch (keep,
keep_width, keep_height, expand, ignore, integer scale, scale factor, viewport mode) with black
bars, matching the engine on 15 cases (L20); in your own job read a `make_viewport` SubViewport with
`agent_capture.grab(vp)`. Helpers: `arg`, `out_path`, `load_scene`, `wait_frames`,
`wait_physics_frames`, `wait_seconds`, `note`, `is_headless`, `captured_errors`; libraries
[`agent_build.gd`](scripts/agentkit/agent_build.gd) (`save_scene`, presets),
[`agent_profile.gd`](scripts/agentkit/agent_profile.gd) (`record`). Domain code goes in
`scripts/gd_<domain>.py` and `scripts/agentkit/<domain>/`.

## Numbers

| Value                 | Relative to                                                                                                                                                       | Source                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 16.67 / 33.33 ms      | frame budget at 60 / 30 fps                                                                                                                                       | arithmetic                                           |
| 8.33 ms               | windowed `frame_ms` floor on this 120 Hz display, even with `--disable-vsync`                                                                                     | observed                                             |
| 6.9 ms                | headless frame pacing: the low-processor sleep (`low_processor_usage_mode_sleep_usec` 6900), whatever the work; benchmark with `--fixed-fps 60` and time the work | observed; scenario-godot-gameplay, scenario-godot-ui |
| 1.4 to 1.8 ms / 0     | GPU p95 of the fx test scene at 1080p on Vulkan (four runs) / on Metal                                                                                            | observed                                             |
| 0.2 s, 10.2 s         | small job; a hung job stopped by the watchdog (timeout 20 s)                                                                                                      | observed                                             |
| 60.8 / 75.0 / 41.4 MB | macOS universal zip / Linux x86_64 (binary plus .pck) / Web (9 files) export of Base3D                                                                            | observed, L9                                         |
| 430 MB                | iOS Xcode project (`export_project_only`), mostly the engine xcframework                                                                                          | observed, L9                                         |

## Quality gates

- **Measurable:** `ok` true with zero parse, script and shader errors; `check_all`
  `failed_files == []`; JUnit `failures == 0` and `tests > 0`; audit flags fixed or justified;
  `budget_check` ok (p95 under target, hitch ratio at most 1%); export exit 0, artifact size
  recorded, `verify_pack` lists the expected files.
- **Visual:** every capture passes `image_checks` (`ok` false on all_black, all_white, uniform,
  transparent) and was opened in a contact sheet; before and after from the same views.

## Common mistakes

| Mistake                                | What it looks like                                                                                    | Fix                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| trusting exit codes                    | parse error, exit 0                                                                                   | `run_script`/`check_all` read the log                                                                            |
| `--check-only` on code using autoloads | "Identifier not found: GameState"                                                                     | `check_all` (in-process load); `check_only` files it under `autoload_false_positives`                            |
| hand-written `project.godot`           | GodotPhysics3D, stretch disabled, UI does not scale                                                   | `new_project`, or set the keys                                                                                   |
| `class_name` in a fresh project        | "Identifier not found"                                                                                | `import_project` first                                                                                           |
| autoload named like its `class_name`   | 'Class "GameState" hides an autoload singleton.' (GDScript analyzer)                                  | name the autoload differently (`Game`) or drop `class_name`                                                      |
| capture or `--write-movie` headless    | 0 frames drawn; `--write-movie` crashes                                                               | windowed `capture_scene`                                                                                         |
| GPU timing on Metal                    | `gpu_ms` 0                                                                                            | `profile_scene(driver="vulkan")`                                                                                 |
| export output inside the project       | build imported and packed next time                                                                   | outside, or `.gdignore` (auto)                                                                                   |
| macOS export                           | "ETC2 ASTC" or "Invalid bundle identifier"                                                            | `import_etc2_astc=true`; `ensure_preset` sets a bundle id                                                        |
| clones sharing `user://`               | saves, input maps and the shader cache of other agents' clones show up (every clone was named Base3D) | `base_project` isolates by default; [`gd_env.isolate_user_dir(P)`](scripts/gd_env.py) for other scratch projects |
| per-frame `TIME_PROCESS`               | the same value on every CSV row (the monitor refreshes about once per second; 0 under `--fixed-fps`)  | `process_wall_ms` column of `profile_scene`, or sentinel nodes                                                   |

## Team routing and handoffs

| Skill                              | Route here when the brief mentions                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| scenario-godot-architecture        | project structure, scenes vs nodes, signals, Resources, autoloads, composition, typing, save data         |
| scenario-godot-2d                  | sprites, TileMapLayer, TileSet, platformer or top-down feel, Camera2D, pixel-perfect, 2D lights, parallax |
| scenario-godot-3d-world            | CharacterBody3D, blockout, CSG, GridMap, terrain, GLB import, Jolt, procedural meshes                     |
| scenario-godot-rendering-lighting  | renderer choice, SDFGI, VoxelGI, LightmapGI, environment, fog, shadows, post, Compositor                  |
| scenario-godot-shaders             | `.gdshader`, VisualShader substitutes, global uniforms, screen reading, compute, stencil                  |
| scenario-godot-vfx                 | GPUParticles, trails, sub-emitters, particle collision, impacts, juice                                    |
| scenario-godot-animation           | AnimationPlayer, AnimationTree, tweens, skeletons, IK, retargeting, root motion, cutscenes                |
| scenario-godot-ui                  | Control layout, containers, themes, menus, HUD, focus and gamepad, localization, scaling on phones        |
| scenario-godot-gameplay            | state machines, inventory, dialogue, save and load, navigation, AI, procedural generation, input          |
| scenario-godot-audio               | buses, effects, spatial audio, adaptive music, SFX variation                                              |
| scenario-godot-multiplayer         | high-level multiplayer, RPCs, authority, spawner and synchronizer, lobbies, dedicated servers             |
| scenario-godot-pipeline-automation | CLI and CI, editor plugins, GUT and gdUnit4, import plugins, GDExtension, MCP workflows                   |
| scenario-godot-performance-export  | profiler, monitors, stutter, mobile, web, desktop and Steam export, signing                               |

A cross-cutting item has one owner: shader stutter and web threading go to
scenario-godot-performance-export, naming the second skill in the brief. Every handoff packet
carries: project path and channel, the brief in numbers, what was done with its toolkit calls,
evidence (result JSON path, contact sheet and flags, CSV with `budget_check`, JUnit totals, export
sizes), Verified, Assumed, open issues, and a fence (what the receiver may touch). The receiver
reproduces one piece of evidence before building on it. Sister teams: blender-expert (asset fixes
before GLB export), unreal-expert, unity-expert, maya-expert, zbrush-expert.

## Scenario assets into Godot

| Asset                                      | Generated with                                      | Lands in                                                          |
| ------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| sprites, props, icons, tilesets, UI pieces | scenario-game-assets                                | scenario-godot-2d, scenario-godot-ui                              |
| animation frames, sprite sheets, VFX loops | scenario-sprite-animation, scenario-sprite-pipeline | scenario-godot-2d (SpriteFrames), scenario-godot-vfx (flipbooks)  |
| parallax planes                            | scenario-parallax-stage                             | scenario-godot-2d (Parallax2D)                                    |
| GLB meshes                                 | scenario-3d                                         | scenario-godot-3d-world (import), scenario-godot-animation (rigs) |
| PBR textures, tileable materials           | scenario-textures                                   | scenario-godot-rendering-lighting, scenario-godot-shaders         |
| skyboxes, 360 panoramas                    | scenario-skyboxes                                   | scenario-godot-rendering-lighting (sky)                           |
| music, SFX, ambience, voice                | scenario-audio, scenario-elevenlabs                 | scenario-godot-audio                                              |

Check the asset before import (scenario-quality-gate) and again after it, in a capture from the game
camera judged by the receiving skill, which also audits GLB scale, pivot and triangle count.

## Godot 4.7 traps and platform notes

Read [`references/traps.md`](references/traps.md) before the first job: Godot 3 names that pass
`--check-only`, `--script` hangs, unknown flags ignored, `-d` waiting on stdin, what headless cannot
do (MultiMesh writes, GPUParticles), `ProjectSettings.save()` rewriting `project.godot`, import
crashes, deprecated APIs; then the macOS binary, template and `user://` paths, window focus, and
Metal profiling; then the Windows paths and the `PYTHONUTF8=1` rule.

## References

- [`references/expert-notes.md`](references/expert-notes.md): expert claims by source with
  timestamps, and traps observed while building the toolkit.
- [`references/procedures.md`](references/procedures.md): the toolkit API in full, job-writing
  rules, and each procedure with its live test and result.
- [`references/critique.md`](references/critique.md): the rubric for judging an agent's Godot output
  and a handoff.
- [`references/gui-paths.md`](references/gui-paths.md): editor menus and settings for the same
  tasks.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs and best
  timestamps.
