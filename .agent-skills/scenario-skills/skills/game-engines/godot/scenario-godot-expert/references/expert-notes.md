# scenario-godot-expert: expert notes

What the sources say that a strong generalist would not, by expert, with video id and timestamp.
Credentials and URLs are in `sources.md`. Marks: **[observed]** means seen in Godot
4.7.2.stable.official.ed1daf0bf on this Mac on 2026-10-02 while building or testing the toolkit;
**[added]** is the lead's own rule; **[verify]** was not run here. Version facts come from
`sources/godot-version-deltas.md` (cited as "deltas").

## 1. The agent loop and what counts as truth

- **Stale editor output makes agents hallucinate.** MCP servers that scrape the editor's Output
  panel report errors for lines no longer on disk, and the panel does not list every project error.
  Verify with a fresh headless run and a project reload. Fennara, 2vSYP7GyA5U [00:02:51, 00:05:46,
  00:06:20].
- **Judge an MCP by feedback fidelity, not tool count:** diagnostics, class info, runtime errors and
  screenshots matter; Fennara builds one, so his ranking is biased (his own words). 2vSYP7GyA5U
  [00:09:22].
- **No Godot MCP at all can be enough:** Claude Code plus the Godot binary, which the agent runs to
  read the console. PixelLab, THwZYWuOdZI [00:13:45].
- **Prompt hygiene for an agent session:** state the engine version and the concept first, keep a
  `PLAN.md` the agent updates, give the agent the Godot app path, ask for automatic behavior rather
  than manual steps, compact before big tasks; do not queue many generation jobs at once (they cite
  a 10-job limit). PixelLab, THwZYWuOdZI [00:08:02 to 00:14:17, 00:16:49, 00:05:03].
- **After importing AI assets, look:** character facing, animation direction, tile seams and camera
  jitter are the usual failures. PixelLab, THwZYWuOdZI (checklist in the automation digest).
- **The result envelope, not the exit code.** `--check-only` and a script with a parse error both
  exit 0; a runtime error in `_process` logs and the process still exits 0; a runtime error before
  `quit()` leaves the process running. deltas section 17 [observed again with the toolkit, L4].

## 2. Testing (Godotneers, Butch Wesley, Mike Schulze)

- **Test behavior through signals and public results, not internals or engine behavior.**
  Godotneers, CreugthdgJ0 [00:53:29, 01:08:36]; Butch Wesley (GUT author), ImqhHLlPfZg [00:16:59];
  Mike Schulze (GdUnit4 author), x6GdTgIAFiU [00:24:19].
- **Split body and brain** so a test brain can drive the character: the character exposes
  `desired_direction`; a test brain moves it with a NavigationAgent `move_to(pos)` that awaits
  `navigation_finished`, plus `teleport`. Godotneers [00:17:11 to 00:23:12].
- **Levels hold a spawn point, not the player;** tests inject their own player at the
  `player_spawn_point` group node and keep test areas and cameras in the test scene. Godotneers
  [00:56:56 to 01:05:11].
- **Bound every wait:** Godotneers uses 2 s, Schulze 5 s, GUT takes a `max_time`. A flaky run means
  shared state; rerun 3 times. Godotneers [01:10:13].
- **Monitor signals before the action** (GdUnit4 `monitor_signals` first, else a signal fired early
  is silently missed; GUT `watch_signals`). Godotneers [00:36:34 to 00:38:53]; Wesley [00:30:00].
- **A failed assertion does not stop the test;** later steps time out in cascade, which maps where
  it broke: read them top down. Godotneers [01:06:44].
- **Prove the test bites:** watch red then green; to retrofit, replace the function body with
  `pass`, see the failure, restore. Wesley [00:13:40 to 00:16:28].
- **Autoloads leak state between tests** ("tests fail 10% of the time"); free what you create
  (`add_child_autofree`). Wesley [00:12:34, 00:28:39]; Schulze [00:15:42].
- **Orphan counts are a leak detector:** 1 to 80 is a real leak. Wesley [00:57:00 to 00:58:08].
- **Headless has no mouse device:** GUT's `should_skip_script()` skips GUI-input scripts in CI.
  Wesley [00:48:33 to 00:50:14]. That skip is for tests that need a real pointer: synthesized events
  sent with `Viewport.push_input(event, true)` do reach Controls headless, where
  `Input.parse_input_event` does not [observed by scenario-godot-gameplay and scenario-godot-ui,
  4.7.2]. **`pause_before_teardown()` hangs CI:** use the ignore-pause option (the toolkit always
  passes `-gignore_pause`). Wesley [00:32:08 to 00:33:53].
- **TDD strictness depends on the stage:** Wesley skips tests for proofs of concept [00:08:16,
  00:13:40]; Godotneers writes them after exploring, before forgetting [01:07:32]. Deciding
  condition: design unknown, test the systems underneath; stable system or bug repro, test first.
- **Framework choice:** GUT for GDScript-only and doubles-heavy work; GdUnit4 for C# projects or
  rich CI reports. Do not install both (automation digest). The toolkit ships GUT 9.7.1 (the release
  for Godot 4.7.x) [observed: 3 pass, red suite exits 1].

## 3. CI and export

- **`--import` before export or tests in a fresh checkout,** or export complains about missing
  imports. Voylin, AbMESM0UEHk [00:16:29, 00:17:42].
- **Template layout:** templates live under `<version>.stable` in the Godot data folder and unzip
  nested in `templates/`: move the contents up. Voylin [00:11:34 to 00:13:50].
  `gd_env.install_templates()` does this and checks the release SHA512 [observed: 1.28 GB download,
  1.9 GB installed].
- **Linux exports lose the executable bit in CI artifacts:** tar the folder before upload. Voylin
  [00:20:10 to 00:23:06]. Locally the bit is set [observed, L9].
- **Export output path is relative to the project, not the cwd;** the directory must exist. Godot
  docs, Command line tutorial. The toolkit always passes an absolute path.
- **Build output inside the project is imported and packed next time.** deltas section 18
  [observed]. The toolkit writes `.gdignore` into such folders.
- **macOS universal or arm64 export needs `import_etc2_astc=true`** (Artium Nihamkin, _n9l15CANag
  [00:09:27]; deltas) **and a valid bundle identifier** [observed: "Invalid bundle identifier" until
  `application/bundle_identifier` was set].
- **Signing and notarization:** Developer ID Application certificate, `xcrun notarytool` with a
  keychain profile, staple, `spctl -a -vvv`; keep the app-specific password out of the preset;
  duplicate certificates with the same common name break signing. Artium Nihamkin, _n9l15CANag
  [00:04:05, 00:25:38, 00:29:16, 00:32:37 to 00:36:59]. Not run here (needs an Apple developer
  account).
- **`flush_stdout_on_print`** (`application/run/flush_stdout_on_print`) lets journald or CI see
  prints live from a server. Godot docs, Exporting for dedicated servers.
- **Dedicated server:** "Export as dedicated server" adds the `dedicated_server` tag; Strip Visuals
  first, Remove last. Godot docs, Exporting for dedicated servers. Owner:
  scenario-godot-multiplayer.

## 4. Editor tools and scripts

- **Every script the editor runs must be `@tool`,** and tool mode is not inherited; a non-tool
  script "acts like an empty file". Godot docs, Running code in the editor; Firebelley Games,
  VyTys5oCdN8 [00:06:58].
- **`Node.owner` decides persistence:** `add_child` alone is invisible in the Scene dock and not
  saved; set `owner` to the edited root and skip children of instanced sub-scenes. Godot docs,
  Running code in the editor. `agent_build.gd: save_scene` does this [observed, L7 and L11].
- **Static variables read from non-tool scripts return null** (static methods and constants work).
  Godot docs, Running code in the editor.
- **Script edits bypass Undo/Redo** unless routed through `EditorUndoRedoManager`. Queble,
  nW7YtSSJzbQ [00:04:41]. **Scene edits from script do not mark the scene dirty:**
  `EditorInterface.mark_scene_as_unsaved()`. Godot docs.
- **`_validate_property` needs `notify_property_list_changed()`** in the toggle's setter;
  `@export_tool_button` (4.4+) needs `@tool`. Queble [00:03:38, 00:05:12 to 00:08:19].
- **A `Window` popup cannot close unless `close_requested` is handled.** Firebelley Games [00:03:37,
  00:04:10] [verify on 4.7]. For an agent, pass arguments on the command line instead of building a
  popup.
- **Editor script as project preset:** one `_run()` sets viewport size, stretch `canvas_items`,
  nearest filter, then `ProjectSettings.save()`. HeartBeast, MX2I3376ubE [00:03:19 to 00:03:51].
  `gd_env.new_project(pixel_art=True)` writes the same keys.
- **Editor singletons in `_init` of an `-e --headless -s` run crashed** with signal 11;
  `get_resource_filesystem()` was null. Wait 2 frames and open a scene first. Automation docs digest
  (verified there); AgentKit jobs wait before `run()` [observed, L7].
- **`--recovery-mode`** starts the editor with tool scripts, plugins and GDExtensions disabled: the
  first thing to try when a plugin breaks startup. Godot docs, Command line tutorial.

## 5. Import, data and version control

- **Parsers take bytes, not paths:** `parse(bytes: PackedByteArray)` with the source injected; the
  same parser serves `res://`, `user://`, zip, HTTP and tests. Write the runtime loader first, wrap
  it for the editor later. Dinoleaf, sSurjCgebjw [00:02:19, 00:04:46 to 00:12:45].
- **Import plugin gotchas:** `save_path` has no extension; `_get_import_options` returns `[]` with
  no presets; `name` and `default_value` are mandatory. Godot docs, Import plugins. Owner:
  scenario-godot-pipeline-automation.
- **Merged `.tscn` files can fail to parse;** keep art and its colliders in one instanced sub-scene
  so related data merges together. Lilith Duncan, CAJ_iIedx_I [00:01:36 to 00:03:14, 00:10:32]. Rule
  here: one writer per scene, and `ResourceLoader.load` every `.tscn` after a merge
  (`audit(P, "resources")`) [added].

## 6. Native code

- **GDExtension classes should mimic engine classes:** `_notification(NOTIFICATION_READY)` for
  engine-style classes, `GDREGISTER_RUNTIME_CLASS` for gameplay classes, `memnew` not `new`; hot
  reload for gameplay code only. David Snopek, 4R0uoBJ5XSk [00:30:01, 00:46:08, 01:02:37, 01:14:10
  to 01:25:30].
- **Reach for C++ or Rust only when profiling shows a hotspot or a native library is needed.**
  Snopek [00:03:16]; FinePointCGI, z14cfTc40uQ (Rust works, debugging is painful; 2023 syntax is
  obsolete). The Godot installed here is the standard build: no C#.

## 7. Debugging

- **Edit autoload values live to confirm a hypothesis before editing code;** "Always Switch to
  Remote Scene Tree". Bacon and Games, P7AQLUU3xKk [00:03:16, 00:05:36]. Agent equivalent: a job
  that reads the value, or an MCP into the running game.
- **Visible collision shapes and navigation:** Debug menu (Bacon and Games [00:15:06]); headless
  agents pass `--debug-collisions` or `--debug-navigation` to a windowed capture run (both listed in
  `godot --help` 4.7.2 [observed]).
- **`-d` waits on stdin at the first runtime error:** never in unattended runs. deltas section 17.

## 8. MCP servers (READMEs, 2026-10)

- **hybridindie/godot-mcp:** Python server (PyPI `godot-editor-mcp`) plus an addon that dials out to
  the server over WebSocket; 193 tools in toolsets, only core and inspection exposed by default
  "because a large exposed surface degrades tool selection"; mutating tools take `dry_run`,
  destructive ones `confirm`; one editor per bridge ("Replaced by another editor"); screenshots need
  a non-headless editor. README. [observed: `uvx --from godot-editor-mcp godot-editor-mcp` over
  stdio initialized in 0.9 s, server 2026.09.30 (package 4.0.1), 23 tools, `godot_get_server_info`
  answered; the editor bridge itself was not run because it needs a GUI editor].
- **tugcantopaloglu/godot-mcp:** Node server, 157 tools all exposed, headless scene operations and
  `game_*` runtime tools through a TCP autoload on port 9090; `validate_script` moved off
  `--check-only` to a SceneTree load because autoload references gave false errors; an earlier
  `manage_input_map` wrote duplicate keys into `project.godot`. README. Lessons: diff
  `project.godot` after any MCP settings write [added]; its port 9090 collides with hybridindie's
  HTTP default. Not run here (needs a clone, `npm run build` and a game autoload).
- **The autoload false positive is real:** `--check-only` on a script that reads an autoload logs
  "Compile Error: Identifier not found: GameState" [observed, L16]; an in-process load (`check_all`)
  passes.

## 9. Cross-cluster rules the lead enforces

- **Measure before optimizing.** Dan Does Dev, s2C2RO_WMh0 [00:07:12]; the performance digest
  consensus. The usual Godot CPU cost is node count and per-object work (Firebelley Games,
  1PnG3r1rKcs [00:00:36 to 00:04:45]: 100 card scenes took 115 ms to instantiate, direct
  RenderingServer canvas items about 8 ms).
- **Profile on the real device; watch thermals.** Ian Bolton (Arm), WrjaUNAXYqk [00:09:35]; Export
  With Debug does not slow the game [00:05:20].
- **Clean builds:** a stale build cache plus an API rename cost weeks of chasing a phantom
  performance bug. Claire Blackshaw, grdqHJOL5F4 [00:16:15 to 00:17:20].
- **Renderer by reach:** Compatibility for solo 2D, simple 3D and the web; Forward+ for high-end
  desktop; Mobile for demanding mobile. Ray Hayes, KWhVVMpihsc [00:06:03] (opinion, no benchmarks).

## 10. Observed while building the toolkit (Godot 4.7.2, 2026-10-02)

| Fact                                                                                                                                     | Evidence                                                                                     | Consequence                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Windowed Godot takes focus on launch; `open -g` and `--embedded` do not prevent it; `--embedded` crashed (signal 11)                     | manual runs, then L10 (2 restores)                                                           | `_FocusGuard` returns focus to the previous app; tiny 160x90 window; `GD_MAX_WINDOWED` 2                |
| Headless draws 0 frames; `--write-movie` crashes headless                                                                                | `job.frames_drawn` 0; deltas                                                                 | captures and GPU timing need a windowed run                                                             |
| Metal reports `gpu_ms` 0; Vulkan reports 1.4 to 1.8 ms p95 (four runs) on the fx scene at 1080p                                          | L12                                                                                          | `profile_scene(driver="vulkan")`                                                                        |
| Windowed `frame_ms` sits at 8.33 ms (120 Hz) even with `--disable-vsync`                                                                 | L12                                                                                          | judge `cpu_ms` and `gpu_ms`                                                                             |
| A runtime error in a coroutine returns null to the awaiting caller; a typed `run() -> Dictionary` aborted by a script error returns `{}` | L4; scenario-godot-gameplay G6                                                               | null and `{}` are failures (`aborted: true`), even with `expect_errors`                                 |
| `--check-only` exits 0 on a parse error and on a path it cannot find (a relative OS path became a missing `res://` path)                 | L6                                                                                           | `check_only` resolves relative paths from the cwd and fails on load errors                              |
| gdUnit4 6.2.1 nests an absolute `-rd` path under the project                                                                             | scenario-godot-pipeline-automation; L23                                                      | `run_tests(framework="gdunit4")` passes `-rd res://...`                                                 |
| Every Base3D clone shared `app_userdata/Base3D` (same `config/name`)                                                                     | scenario-godot-architecture, scenario-godot-gameplay, scenario-godot-performance-export; L22 | `base_project` sets a custom user dir per clone                                                         |
| The capture emulation treated keep_width and keep_height like expand and filled keep without bars                                        | scenario-godot-ui; L20 (15 cases match the engine), L21                                      | `stretch_compute` plus `grab()` composite the bars                                                      |
| `Performance.TIME_PROCESS` holds one value for about a second (3 distinct values in 241 rows)                                            | scenario-godot-performance-export; L12                                                       | `process_wall_ms` column from sentinel nodes                                                            |
| `frame_stats` divided by zero on an all-zero column                                                                                      | scenario-godot-performance-export; offline test                                              | guarded (`inf` fps)                                                                                     |
| A web export's `bytes` counted `index.html` only (5.4 KB of 41.4 MB); iOS `export_project_only` reported ok false                        | scenario-godot-performance-export; L9                                                        | `bytes` sums every file written, `artifact` is the `.xcodeproj`                                         |
| `Logger` (4.5+) captures errors in-process; error types 0 error, 1 warning, 2 script, 3 shader                                           | L4                                                                                           | job fails on logged errors without log scraping                                                         |
| Reloading a running script with `CACHE_MODE_IGNORE` crashed the VM ("Internal script error! Opcode: 0")                                  | first `check_all` run                                                                        | `check_all` never reloads `addons/agentkit/`                                                            |
| A headless editor save logs `Parameter "t" is null` from `servers/rendering/dummy/` (thumbnails)                                         | L7                                                                                           | filed as `benign_errors`, never fails a job                                                             |
| `EditorInterface.save_scene_as()` returns void                                                                                           | parse error on `var err := ...`                                                              | do not assign it                                                                                        |
| `--check-only` misses autoloads                                                                                                          | L16                                                                                          | `check_all`, or `autoload_false_positives`                                                              |
| An empty `[preset.N.options]` section breaks ConfigFile                                                                                  | deltas, observed again                                                                       | `write_preset` always writes options                                                                    |
| `max()` returns Variant: assigning it to a typed int fails                                                                               | agent_build.gd                                                                               | `maxi()` / `maxf()`                                                                                     |
| A project written by hand gets GodotPhysics3D and stretch disabled                                                                       | deltas; L2                                                                                   | `new_project` writes the project-manager keys (Jolt, `canvas_items`/`expand`, `driver.windows="d3d12"`) |
