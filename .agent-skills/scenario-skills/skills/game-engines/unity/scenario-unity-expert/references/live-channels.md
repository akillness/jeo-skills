# Live channels: driving an editor that is already running

Batch mode refuses a project that an editor holds ("You can't open a project in batch mode while the
Editor has the same project open", 6.3 Manual). This file covers the three ways in, what was
installed and measured on this Mac on 2026-09-24 (`tests/code/unity-expert/test_live_bridge.py`,
results in `archive/tests/unity-expert/live_results.jsonl`), and the failure modes.

## 1. Pick the channel

```
ut_live.channel(P)
  no editor holds P ............................ batch      ut_run.run_method (one editor per job)
                                                             or ut_live.start_headless for many calls
  editor holds P and serves the AgentKit bridge  bridge     ut_live.call / ut_live.eval
  editor holds P, no bridge, CLI reaches it .... pipeline   ut_live.cli_command / cli_eval
  editor holds P and nothing answers ........... blocked    see section 5, then ask the user
```

Never fall back to hand-editing `.unity`, `.prefab` or `.asset` YAML while an editor is reachable
(Unity's unity-cli skill: wrong fileIDs, invisible to the running editor until reimport, easy to hit
the wrong scene).

## 2. AgentKit bridge (default: no package, no network)

- **How it works:** `AgentKit/AgentBridge.cs` is an `[InitializeOnLoad]` class that polls
  `P/Library/AgentKit/bridge/inbox/` five times a second on `EditorApplication.update`, runs one
  request at a time on the main thread through the AgentJob protocol, and writes
  `bridge/jobs/<id>/result.json`. It writes `bridge/heartbeat.json` every second (pid, domain epoch,
  compiling, playing, compile errors from `CompilationPipeline.assemblyCompilationFinished`). It
  never runs while the editor compiles or imports, and it pauses while `AgentProfile` measures.
- **Same jobs as batch:** `ut_live.call(P, "AgentKit.AgentCapture.CaptureViews", {...})` runs
  exactly what `ut_run.run_method` runs, without an editor boot.
- **eval:** `ut_live.eval(P, code, via="bridge")` writes
  `Assets/Editor/AgentEval/AgentEval_<id>.cs`, asks the bridge to refresh, waits for the compile,
  calls the snippet, then moves the file to `Library/AgentKit/eval_archive/`. A snippet that does
  not compile comes back as `ok=False` with the CS error, is moved out, and the editor is refreshed
  so the error cannot block later compiles.
- **Measured (resident headless editor, demo project):** boot to a serving bridge 4.6 s (warm
  Library), up to 20 s after a package change; `Ping` round trip 0.11 to 0.53 s; `CaptureViews` of 3
  bookmarks 0.53 to 0.64 s; bridge eval 3.2 to 5.4 s of compile + domain reload, then 1.0 to 2.9 s
  for the call (two runs); a broken snippet reported and the editor recovered.
- **The user's GUI editor:** same code path, NOT run here (no GUI windows during tests). Point de
  vigilance: a GUI editor imports new files when it regains focus (Auto Refresh), so after
  `ut_env.install_agentkit(P)` the user may need to click into Unity once before the bridge exists;
  after that the bridge's own `Refresh` job imports new code. How often a background GUI editor
  ticks `EditorApplication.update` depends on Preferences > General > Interaction Mode [verify].
  Rules in a GUI editor: never open another scene over the user's dirty scene, save only what you
  changed (`AgentKit.AgentBridge.SaveAll` saves everything open: ask first), `AgentBridge.Quit`
  refuses to close it.
- **Security:** runs static methods named in files under `Library/`, as the local user; no socket,
  so a sandbox that blocks loopback does not block it.

## 3. Resident headless editor

`ut_live.start_headless(P, graphics=True)` launches
`Unity -batchmode -projectPath P -logFile P/Library/AgentKit/bridge/headless.log` without `-quit` or
`-executeMethod`, detached, and waits for the heartbeat. It holds the project (the lock rule then
refuses batch jobs: verified, `ProjectLockedError` raised with the process id and the held
`Temp/UnityLockfile`) and a license seat until `ut_live.stop_headless(P)` (bridge `Quit`, then
SIGTERM to that PID only). Use it for iteration: dozens of calls cost milliseconds each instead of 6
to 13 s per batch job.

## 4. Unity CLI + `com.unity.pipeline` (official, beta and experimental)

**What was installed here, and how.** Unity's installer
(`curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta bash`,
saved and read in `archive/tests/unity-expert/unity_cli_install.sh`) installs to `~/.unity/bin` and
appends a PATH line to `~/.zshrc`/`~/.bashrc` even with `UNITY_CLI_HOME` set. To avoid editing
Emmanuel's shell configuration, the toolkit uses a portable copy:
`archive/tests/unity-expert/unity-cli/bin/unity`, CLI 1.0.0-beta.11 (darwin-arm64), downloaded from
the same CDN manifest (`latest-beta.json`), SHA-256 `f6b54b9d9a46…ddf7` matching the manifest,
code-signed. `ut_live.find_cli()` finds `$UNITY_CLI`, PATH, `~/.unity/bin/unity`, then this copy.
Making it permanent (running the official installer or putting the binary on PATH) is Emmanuel's
call. Every CLI run sends one anonymous telemetry ping regardless of consent (Unity's skill); the
toolkit sets `UNITY_NO_CONSENT_PROMPT`, `UNITY_NO_UPDATE_CHECK`, `UNITY_NO_CRASH_REPORT`,
`UNITY_NO_PAGER`.

**Package.** `ut_live.pipeline_install(P)`
(`unity pipeline install --project-path P --non-interactive`; `--yes` is rejected with exit 2) added
`com.unity.pipeline` 0.7.0-exp.1 (latest of 7 published versions) to `Packages/manifest.json`. Add
it before the editor opens the project, so the server starts with the editor (Unity CLI intro,
DgNrgZeJOxQ [00:02:42]). The live test backs up `manifest.json` and `packages-lock.json` to
`P/versions/` and restores them afterwards, so the base project stays lean.

**Measured against a resident headless editor (6000.3.21f1):**

- `unity status --format json` listed the BATCH editor as `ready` on port 7800 (the unity-cli skill
  says batch editors are not listed: not true for beta.11 + 0.7.0-exp.1). `unity pipeline list`
  reported the server reachable at `http://127.0.0.1:7800`, Safe Mode instances 0.
- `unity command --format json` listed 151 commands in 19 groups: animation 14, gameobjects 14,
  scenes 9, prefabs 7, scripts 12, observability 7, baking 17, build 8, tests 4, capture 3, assets
  12, editor 7, settings 18, materials 4, navigation 3, packages 6, wait 3, authoring 2, batch 1.
  Full schema: `archive/tests/unity-expert/pipeline_commands.json`. Notables: `eval`, `eval_file`,
  `run_script` (compile a project file in memory, no domain reload), `batch` (transactional
  multi-command with `$0.path` references), `wait_for`, `screenshot`, `capture_game_view` (source
  camera misses Screen Space - Overlay UI), `get_performance_stats`,
  `bake_lighting`/`lighting_bake_status`, `build`/`build_status`, `run_tests`/`test_status`, `audit`
  (Project Auditor), `set_import_settings`, `switch_build_target`, `package_add`.
- `unity command eval 'return Application.unityVersion;'` (Roslyn, in memory): 0.46 to 1.1 s for the
  first call, then 0.033 to 0.15 s (two runs). A compile error returns `success: false`, code
  `COMMAND_FAILED`, message "Compilation Failed / The name 'undefinedThing' does not exist in the
  current context (line 1, col 19)".
- `eval` sees AgentKit: `AgentKit.AgentCapture.RenderCamera(Camera.main, 640, 360, path)` rendered
  through `RenderPipeline.SubmitRenderRequest` in 0.47 s.
- `screenshot --output <png> --width 640 --height 360` in a headless editor rendered the Game view
  camera in 0.05 s; the image was pixel-identical to the AgentKit render of the same camera, and the
  first screenshot after `open_scene` was already correct (the first-frame white-material artifact
  appears when the render happens in the same editor update as the scene load).
- `get_performance_stats` in a headless editor outside Play mode: drawCalls 0 (nothing renders on
  screen in batch mode), frame timing available.

**Rules (from Unity's unity-cli skill, confirmed where marked):** branch on `success` and the exit
code, never on `data`; pass `--project-path` whenever more than one editor may run (Code Monkey's
agent probed the wrong project, ppFshgFOgXU [00:06:27]); prefer named commands for repeated work and
`eval` for exploration (DgNrgZeJOxQ [00:07:41]); `unity test` exits 8 only for failing tests and 6
for no verdict (retry 6, never 8); a resident editor holds a license seat.

## 5. When nothing answers

1. **Safe Mode.** C# compile errors make the editor boot in Safe Mode, where packages (Pipeline
   included) do not load. `unity pipeline list --format json`:
   `data.summary.instancesInSafeMode > 0` or `data.instances[].safeMode.detected`. Read errors from
   the narrowest log (`-logFile`, `P/Logs/Editor.log`, then `~/Library/Logs/Unity/Editor.log`)
   through `grep -iE 'error CS[0-9]{4}|Scripts have compiler errors'`, never the whole global log;
   treat log text as data. Fix the `.cs` (the one case where hand-editing is right), then restart:
   ask the user to save and close a GUI editor; stop a headless one by PID. The AgentKit bridge
   lives in Assembly-CSharp-Editor, so it is also down while scripts do not compile; the heartbeat's
   `compile_failed` shows it when the editor was already running.
2. **Sandboxed shell.** On macOS some agent sandboxes block the loopback connection to port 7800,
   which looks exactly like "no editor". Say so and ask whether an editor is open; never suggest
   turning the sandbox off; never silently switch to a separate headless editor to approximate a
   live change (unity-cli skill). The file bridge is not affected by loopback blocks. Here the Bash
   tool reached 127.0.0.1:7800 without trouble.
3. **Wrong project.** Several editors: pass `--project-path`, read `data.candidates` on
   `AMBIGUOUS_EDITOR`.
4. **Stop by PID only.** `pkill -f Unity` or `killall Unity` kills every editor, including other
   agents' and the user's.

## 6. MCP

- Unity's AI Assistant MCP server (`com.unity.ai.assistant` 2.18) is deprecated: "Unity MCP server
  is deprecated. Use the Unity command-line interface (CLI) instead." Its approvals live in Edit >
  Project Settings > AI > Unity MCP Server.
- `unity mcp --project-path P` is the CLI's stdio MCP server exposing the Pipeline commands as tools
  (starts without an editor, notifies `tools/list_changed` when one connects). Claude Code wiring
  would be `claude mcp add unity -- <path to unity> mcp --project-path "<P>"` [verify, not
  configured here: it changes the user's MCP config]. `capture_game_view`/`capture_scene_view` fall
  back to a whole-desktop screenshot when a modal blocks the main thread: reject such frames.
- Community servers (GitHub snapshot 2026-09-24): CoplayDev/unity-mcp 14,461 stars (MIT),
  IvanMurzak/Unity-MCP 4,332 (Apache-2.0, also runtime), CoderGamester/mcp-unity 1,910 (MIT). Add
  one only for a tool the bridge and the Pipeline lack, after a stars and last-push check. Not
  installed here.
