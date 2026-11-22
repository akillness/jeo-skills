# Procedures and the shared toolkit (scenario-roblox-expert)

Every procedure below names its tests and results. Live tests ran in Roblox Studio 0.743 on macOS on
2026-10-18 through the built-in Studio MCP server (`tests/code/scenario-roblox-expert/run_live.py`,
36 of 36 pass on the final run). Offline tests ran with Rojo 7.7.1, Lune 0.11, luau-lsp 1.70.1 and
Selene 0.32 (`run_offline.py`, 16 tests). Test ids: `O` offline, `L` live, `H` headless.

## 1. Toolkit API

Import from any sibling script:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent / "scenario-roblox-expert" / "scripts"))
```

System `python3`, standard library only. Pillow is optional (contact sheets; ImageMagick `montage`
also works).

### rbx_env.py: places, readiness, concurrency

| Function                                                           | Returns                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `doctor()`                                                         | dict of tool versions and readiness (keys listed below the table)                                                                  |
| `new_place(dir, name=None, template="baseplate", src=None)`        | `Path` of `<dir>/<name>.rbxl`, built by Rojo from `<dir>/default.project.json`                                                     |
| `open_place(path, timeout=180)`                                    | an open `rbx_mcp.Studio` bound to that window; reuses the window when the place is already open, else calls `wait_for_gpu()` first |
| `open_places()`                                                    | list of `{id, name}` that the MCP server sees; changes nothing                                                                     |
| `machine_load()`                                                   | `{gpu_util, gpu_mem, ram}` in percent (macOS `ioreg`, `vm_stat`)                                                                   |
| `wait_for_gpu(limit=85, ram_limit=75, max_places=4, timeout=3600)` | the last `machine_load()` plus `places`, once the machine has headroom (below)                                                     |
| `place_windows()`                                                  | number of place windows open machine-wide (one `RobloxStudio -localPlaceFile` process each)                                        |
| `place_slot(timeout=3600)`                                         | context manager yielding a slot index; at most `RBX_MAX` (default 3) holders machine-wide                                          |
| `close_place(path)`                                                | `bool`; ORCHESTRATOR ONLY: returns False unless `RBX_ALLOW_CLOSE=1`                                                                |

- `doctor()` keys: `studio_app`, `studio_mcp_binary`, `studio_version`, `rojo`, `luau`, `lune`,
  `selene`, `stylua`, `luau-lsp`, `studio_running`, `studios` (list of `{id, name}`), `mcp_tools`
  (int), and `mcp_error` or `hint` when the server sees no place.
- `wait_for_gpu` returns once GPU utilization and GPU memory are at most `limit`, RAM at most
  `ram_limit`, and fewer than `max_places` place windows are open machine-wide. `RBX_GPU_MAX` and
  `RBX_MAX_PLACES` set the defaults.
- `new_place` overwrites `<dir>/default.project.json`: `dir` is the agent's own folder, never the
  user's project.
- Templates: `"baseplate"` (512 x 20 x 512 grass baseplate with its top at y 0, SpawnLocation,
  `Technology` Future so Studio loads `LightingStyle` Realistic with `PrioritizeLightingQuality`
  true, `StreamingEnabled` false) and `"empty"` (services only).
- `src` merges a Rojo tree fragment, for example
  `{"ServerScriptService": {"Main": {"$path": "src/Main.server.luau"}}}`.
- A `"Position": [x, y, z]` in `src` is rewritten as a 12-number `CFrame`: Rojo 7.7.1 drops
  `Position` with exit 0 and leaves the part at the origin (observed).

### rbx_mcp.py: one Studio MCP session

`Studio(studio=None, place=None, timeout=120.0)`, a context manager around one `StudioMCP` stdio
proxy.

| Method                                 | Returns                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `.studios()`                           | list of `{id, name}` from `list_roblox_studios`                                                                                |
| `.bind()`                              | the `studio_id` string; raises `MCPError` when ambiguous or absent; retries about 12 s                                         |
| `.call(tool, args, timeout=None)`      | the raw MCP result dict (`content`, `isError`); fills `studio_id`; retries "No Roblox Studio instances are connected" for 45 s |
| `.raw_call(tool, args, timeout=None)`  | the same without `studio_id` or retry                                                                                          |
| `.tools()`                             | list of tool dicts with `name`, `description`, `inputSchema` (empty until a Studio connects)                                   |
| `.luau(code, dm="Edit", timeout=None)` | the tool's text; raises `MCPError` on `isError`                                                                                |
| `.capture(out, extra=None)`            | `Path` of a PNG; `extra` takes `camera_position` and `look_at_position` as `[x, y, z]`                                         |
| `Studio.text(result)`                  | the text parts of a result joined                                                                                              |

- `place=` binds only a window whose name or file stem equals it, so an agent's `Obby.rbxl` never
  binds the user's "MyObby" window (offline test).
- `studio=`, the `--studio` flag, also accepts a substring of the name.

CLI:
`rbx_mcp.py tools | studios | state | console | play start|stop | capture out.png | call <tool> '<json>' | luau --dm Edit --code '...'`,
with `--studio <id or name>`.

### rbx_run.py: Luau with a result protocol

| Function                                                      | Returns                                                                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `run(studio, code, dm="Edit", timeout=None, kit=())`          | `{ok, result, error, output}`; never raises on Luau errors                                                                       |
| `run_headless(place, code, kit=(), timeout=180)`              | the same plus `exit_code`, `seconds`, `log_path`; refuses (`ok` False, error "refused: ...") while any RobloxStudio process runs |
| `studio_running()`                                            | bool (`pgrep -x RobloxStudio`)                                                                                                   |
| `wrap(code, kit)`                                             | the chunk as sent and the line offset                                                                                            |
| `parse(text, offset)`, `parse_headless(text, source, offset)` | the protocol dict from raw tool or RunScript output                                                                              |

- The chunk runs inside a function: `return` one value. Instances come back as
  `{__type: "Instance", class, path}`, Vector3 and Vector2 as `{__type, x, y, z}`, CFrame as
  `{__type, components}`, Color3 as `{__type, hex}`, UDim2 as `{__type, xs, xo, ys, yo}`, buffer as
  `{__type, len}`, EnumItem as its string, NaN and inf as strings.
- `print` and `warn` called in the chunk land in `output` (`"WARN "` prefix for warn). Prints from
  other scripts go to the Output log only: read them with `get_console_output`.
- Error lines are your chunk's lines (`AssistantCommand:3: attempt to index nil with 'x'`, L7). A
  compile error returns `ok` False with the tool's message (L8).
- `kit=["Audit", "Stats", "Spec"]` inlines AgentKit modules as locals; nothing is written into the
  place.

### rbx_play.py: one playtest

`Playtest(studio, settle=2.0, timeout=90.0, character=True)`, a context manager: start, wait for the
Server and Client data models (and the character), stop on exit even after an exception.

| Method                                                 | Returns                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `.server(code, kit=())`, `.client(code, kit=())`       | `rbx_run` dict; `kit` inlines AgentKit modules as in `run`                                           |
| `.wait_for(code, dm="Server", timeout=30, every=0.5)`  | the first truthy `rbx_run` dict; raises `TimeoutError`                                               |
| `.press(key, hold=0.0)`                                | tool text; `keyPress`, or `keyDown`, `wait` (`wait_time_ms`), `keyUp`                                |
| `.walk_to([x, y, z], speed=None)`                      | tool text (`character_navigation` with `x`, `y`, `z`, `speed_multiplier`)                            |
| `.keys(actions)`, `.mouse(actions)`                    | tool text; raw `user_keyboard_input` and `user_mouse_input` actions, `datamodel_type` "Client" added |
| `.navigate(x=, y=, z=)` or `.navigate(instance_path=)` | tool text                                                                                            |
| `.console()`                                           | the Output log text                                                                                  |
| `.capture(out)`                                        | `Path` of a PNG of the play view                                                                     |
| `.state()`, `.mode()`                                  | `get_studio_state` text; `"Play"`, `"Edit"` or `""`                                                  |

Module functions: `play_args(studio, start)` (from the `start_stop_play` schema:
`{"is_start": true}` on 0.743) and `tool_schema(studio, name)`.

### rbx_check.py: offline gate

`check(paths=None, code=None, sourcemap=None, selene=False, stylua=False, timeout=300, solver="both")`
returns `{ok, errors, warnings, tools}`; each finding is
`{file, line, col, kind, msg, level, solver}`. It runs `luau-lsp analyze --platform=roblox` with the
Roblox definitions (downloaded once to `~/.cache/rbx-skills/`), once with the old type solver and
once with `--flag:LuauSolverV2=true`: luau-lsp 1.70.1 uses the old solver unless told, Studio uses
the new one for nonstrict scripts, and code that passes one can fail the other (observed 2026-10-19:
15 new-solver errors in a template that passed the old solver; a `type function` passes only the new
one). `solver="old"` or `"new"` runs one pass. A path that does not exist is an error. With
`selene=True` and no `selene.toml` in the working directory it uses `std = "roblox"`. CLI exit code
1 on any error.

### rbx_review.py: images

| Function                                                   | Returns                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image_checks(png, sample=256)`                            | `width`, `height`, `mean_luma`, `std_luma`, `clipped`, `crushed`, `center_luma`, `surround_luma`, `center_contrast`, `unique_colors`, `alpha_mean`, `histogram`, `flags`, `ok` |
| `compare(a, b, sample=256)`                                | `mean_abs_luma_diff`, `changed_fraction`, `max_channel_diff`, `identical`                                                                                                      |
| `contact_sheet(pngs, out, cols=4, thumb=400, labels=True)` | the output path                                                                                                                                                                |

`ok` is false on `all_black`, `all_white`, `uniform` or `transparent`. The thresholds are [added]
defaults that catch broken captures; they do not judge art.

### AgentKit (Luau, `scripts/agentkit/`)

| Module            | Calls                                                                          | Returns                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `Audit`           | `Audit.all(game)`; `scripts`, `remotes`, `physics`, `lighting`, `ui`, `counts` | `{counts, lighting, findings = {{severity, rule, path, message, area}}, tally = {error, warn, info}}`                |
| `Stats`           | `Stats.snapshot()`, `Stats.frames(seconds)`, `Stats.diff(a, b)`                | memory by tag, instances, physics, network, draw calls; `{samples, fpsMean, p50Ms, p95Ms, worstMs}`; changed numbers |
| `Spec`            | `Spec.new()`, `t:test(name, fn)`, `t:run()`                                    | `{passed, failed, total, results = {{name, ok, error, ms}}}`                                                         |
| `lune_audit.luau` | `lune run <kit>/lune_audit.luau place.rbxl [area]`                             | the Audit JSON, no Studio                                                                                            |

- Audit rules: `never-runs`, `localscript-in-workspace`, `server-code-replicated`, `invoke-client`,
  `remote-unreferenced`, `remote-function`, `unanchored`, `precise-fidelity`, `decor-queryable`,
  `lighting-technology`, `no-atmosphere`, `reset-on-spawn`, `offset-only-size`,
  `textscaled-unbounded`, and `api:<pattern>` for 44 deprecated or risky APIs from the 2026 deltas.
- Spec matchers: `toBe`, `toEqual`, `toBeNear`, `toBeTruthy`, `toBeFalsy`, `toBeA`, `toBeAtLeast`,
  `toBeAtMost`, `toContain`, `toThrow`.
- Domain modules live in the sibling's own `scripts/agentkit/<domain>/` and must run both inlined
  and, when they need no engine runtime, in Lune.

## 2. Rules for chunks

- One `execute_luau` call costs about 70 ms round trip in Edit (L9: mean 67 ms over 5 calls).
- Code runs on Studio's main thread: Studio freezes until the chunk yields (tool description). Split
  heavy work into batches of about 1,000 items with one `task.wait()` per batch.
- Build each batch under a container outside the DataModel, then parent it once: a `Parent` write
  costs in proportion to the subtree size (tool description).
- Make chunks idempotent: find or create, then set. A retried call must not duplicate instances
  [added].
- Never run a chunk in a place you did not open. `list_roblox_studios` asks you to confirm with the
  user before modifying their game.

## 3. Procedures

### P1. Readiness

```python
import rbx_env
info = rbx_env.doctor()
assert info["studios"], info.get("hint") or info.get("mcp_error")
```

- `studios` empty while `studio_running` is true means the MCP toggle is off: ask the user
  (gui-paths.md). Never script the GUI to turn it on.
- Every open Studio window renders all the time, so `open_place` waits for GPU and RAM headroom
  before it opens a new one (orchestrator; hiding windows did not lower GPU load).
- Tests: O1, O2, L1, L1b. Results: pass; 28 tools; `doctor()` 0.1 to 3.2 s; `machine_load()` read
  GPU 26%, GPU memory 45%, RAM 74.6% while other agents' places were open.

### P2. Own one place for the whole run

```python
import rbx_env
from rbx_run import run
with rbx_env.place_slot() as slot:
    path = rbx_env.new_place("tests/places/my-skill", name="my-skill",
                             src={"Workspace": {"Goal": {"$className": "Part",
                                  "$properties": {"Anchored": True, "Position": [0, 3, -40]}}}})
    with rbx_env.open_place(path) as s:
        ...  # every test of the run uses this one session
```

- Open the place once and keep it open; reruns reuse the window. Never rebuild a `.rbxl` that Studio
  holds open: change it in the session or ask the orchestrator for a fresh window.
- Files and an open place stay in step this way:
  - build the place with every instance the feature adds, scripts as stubs, so the red run fails on
    behavior;
  - push later script edits with scenario-roblox-architecture's `sync_sources`, which updates
    existing scripts only and lists the rest as `missing`;
  - add a new instance with an idempotent Edit chunk that sets the same properties as its file, then
    check the file builds the same with Lune.
- Leaving the `with` block ends your proxy only; the window stays open.
- Tests: O4, O13, L2, L3, L3b. Results: first open 18.3 s (orchestrator: 9.9 s); rebind 0.01 s; slot
  waits held 3 processes to `RBX_MAX` 2 (O13).

### P3. Run Luau and read a structured result

```luau
print("[lead] edit probe")
local base = workspace:FindFirstChild("Baseplate") :: BasePart?
return {
	n = #workspace:GetChildren(),
	base = base,
	size = base and base.Size,
	light = game:GetService("Lighting").LightingStyle,
}
```

- Python side: `r = run(s, code, "Edit")`, then gate on `r["ok"]` and fields of `r["result"]`.
- Tests: O7 (Lune stub), L6 to L9. Results: pass; tagged types round-trip, `light`
  "Enum.LightingStyle.Realistic", error line 3 of 3, 67 ms per call.

### P4. Audit before and after a stage

```luau
local a = Audit.all(game)
return { tally = a.tally, findings = a.findings, lighting = a.lighting, counts = a.counts }
```

- Run it with `kit=["Audit"]` in Edit, or offline with
  `lune run scripts/agentkit/lune_audit.luau place.rbxl`.
- Gate: `tally.error == 0`; every `warn` fixed or justified in the handoff.
- Tests: O5, O6, L10. Results: clean place 0 errors, 0 warnings, 1 info (`no-atmosphere`) in 68 ms
  over 1,762 instances; 13 deprecation rules fire on the deltas place; the kit_audit place gives 16
  findings (2 error, 9 warn, 5 info).

### P5. Red, then green, with Spec

```luau
local t = Spec.new()
t:test("baseplate exists", function(expect)
	expect(workspace:FindFirstChild("Baseplate")).toBeA("BasePart")
end)
t:test("marker is red", function(expect)
	local marker = workspace:FindFirstChild("Marker") :: BasePart
	expect(marker.Color.R).toBeAtLeast(0.8)
end)
return t:run()
```

- Write the test first and watch it fail, then build. A test that never failed proves nothing.
- Tests: O8, L11. Result: a deliberate `expect(1).toBe(2)` reports 2 passed, 1 failed.

### P6. Measure numbers against the budget

```luau
return { snap = Stats.snapshot(), frames = Stats.frames(2) }
```

- Run it with `kit=["Stats"]` on the Server and on the Client during a playtest;
  `Stats.diff(before, after)` for leaks.
- Gate on `frames.p95Ms` and `worstMs`, not on `fpsMean`: p95 at most 1.2 x the frame budget and
  worst at most 2 x (20 ms and 33.3 ms at 60 fps). Heartbeat steps jitter around the vsync interval,
  so p95 sits just above 16.67 ms on a healthy place; one dropped frame reads about 33 ms. A single
  frame over 2 x with a p95 in range can be a one-off (one 39.5 ms frame in 24 sampled client
  windows on a healthy place, architecture L11): sample 3 s more and gate on the second window; a
  spike in both windows fails.
- Tests: O9, L11b, L16, L17. Results: Server and Client 60 fps, p95 17.2 to 17.4 ms, worst 17.6 to
  17.8 ms on the test place; Client 12 draw calls and 7,870 triangles.
- A reply can be lost under load: one Client run came back `ok` false with "no answer in 120s".
  Retry read-only chunks once; never blindly retry a chunk that writes.
- `frameMs` (Stats.FrameTime) read 66 ms on the Client while Heartbeat ran at 60 fps: do not gate on
  it. `totalMemoryMb` read 3,800 MB for Studio itself: not a game number. In Edit, `context` reads
  "Server".

### P7. Read, find and edit scripts and instances

| Tool               | Arguments that worked (L12, L12e)                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_game_tree` | `{"datamodel_type": "Edit", "path": "Workspace", "max_depth": 2}`; filters `instance_type`, `keywords`, `head_limit`                                     |
| `inspect_instance` | `{"path": "Workspace.Marker"}` or `game.Workspace.Marker`                                                                                                |
| `script_read`      | `{"target_file": "game.ServerScriptService.Main"}`; lines come back as `1→code`                                                                          |
| `script_grep`      | `{"query": "%[lead%] server boot"}`; a Lua pattern, case-insensitive                                                                                     |
| `multi_edit`       | `{"file_path": "game.ServerStorage.X", "className": "ModuleScript", "datamodel_type": "Edit", "edits": [{"old_string": "", "new_string": "return {}"}]}` |

- `script_grep` with raw `[lead]` found nothing, and a backslash escape did not help; `%[lead%]`
  matched (L12).
- `multi_edit` creates the script when it is missing and replaces exact strings otherwise (L12e:
  "Created ... with 1 edits applied", then "Modified").
- Script Sync or Rojo projects: edit the files on disk instead, then check the sync (tooling
  sibling).

### P8. Look and check

```python
from rbx_review import image_checks, compare, contact_sheet
a = s.capture("evidence/before.png", {"camera_position": [0, 14, 22], "look_at_position": [0, 5, -24]})
# ... change ...
b = s.capture("evidence/after.png", {"camera_position": [0, 14, 22], "look_at_position": [0, 5, -24]})
assert image_checks(b)["ok"] and compare(a, b)["changed_fraction"] > 0
contact_sheet([a, b], "evidence/sheet.png", cols=2, thumb=780)  # open it and look
```

- `screen_capture` returns the 3D viewport with the game's ScreenGuis, at 1242 x 1080 here. Studio
  panels and dialogs are not in it.
- Tests: O11, O12, L12c, L12d, L22, L27. Results: Edit and Play captures pass `image_checks`; a 12 x
  12 blue part changed 4.6% of the sample grid; contact sheet 1560 x 936.

### P9. Playtest with input

```python
from rbx_play import Playtest
with Playtest(s) as pt:
    pt.client(LISTENER)              # Luau below: records a jump on the character
    pt.press("Space")
    pt.wait_for('return game.Players.LocalPlayer.Character:GetAttribute("AgentJumped")', "Client", 6)
    pt.walk_to([14, 3, -14])
    pt.capture("evidence/play.png")
    log = pt.console()
```

```luau
local character = game:GetService("Players").LocalPlayer.Character :: Model
local humanoid = character:FindFirstChildOfClass("Humanoid") :: Humanoid
character:SetAttribute("AgentJumped", false)
humanoid.StateChanged:Connect(function(_, new)
	if new == Enum.HumanoidStateType.Jumping or new == Enum.HumanoidStateType.Freefall then
		character:SetAttribute("AgentJumped", true)
	end
end)
return true
```

- One MCP playtest is one server and one client. Multi-client needs
  `StudioTestService:ExecuteMultiplayerTestAsync(numPlayers, args)` (PluginSecurity, up to 8
  clients): not yet run here, because it opens one Studio window per client on a Mac shared by
  several agents.
- Tests: O14 (fake schemas, including a lost start reply), L13 to L23. Results: play ready in 4.2 s;
  Space jump detected in 0.28 s; walk_to 14 studs arrived within 1.6 studs in 1.4 s; hold 0.5 s
  jump; mouse move "Success"; play capture passes; both boot prints in the console.
- Once, `start_stop_play` gave no answer in 120 s while play had started, which left the place in
  Play mode. `Playtest` now reads `get_studio_state` when a reply is lost and always stops on
  failure.

### P10. Know what persists

- During play, writes in the Server data model vanish at stop (L24: `PlayOnlyProbe` absent in Edit;
  the Server data model answers "not available in Edit mode").
- An Edit change lives in the open session only: the `.rbxl` on disk does not have it until someone
  saves (L25, read with Lune). No MCP tool saves a place.
- Deliver durable work as files (Rojo project, scripts) or ask the user to save.

### P11. Offline gate before Studio

```python
from rbx_check import check
r = check(["src"], sourcemap="sourcemap.json", selene=True, stylua=True)
assert r["ok"], r["errors"][:5]
```

- Make the sourcemap with
  `rojo sourcemap default.project.json -o sourcemap.json --include-non-scripts` so `script.Parent`
  paths and paths through Folders and remotes resolve.
- Tests: O10. Results: a bad snippet gives at least 3 errors; every Luau snippet in this skill
  passes with 0 errors (`tests/live_evidence/scenario-roblox-expert/snippet_checks.json`).

### P12. Headless RunScript (CI only)

- `run_headless(place, code, kit)` drives
  `RobloxStudio --task RunScript --localPlaceFile ... --quitAfterExecution` and parses the payload,
  because the exit code is 0 even on errors (scenario-roblox-tooling evidence).
- On macOS a launch hands off to a running Studio and closed the user's window (2026-10-18). The
  function refuses while any Studio process runs.
- Tests: O16 (refusal, no launch; parsing); H1 to H3 live run pending (needs a machine with no
  interactive Studio).

### P13. Handoff packet

Write it as JSON or Markdown next to the evidence:

- place path and studio window name; channel used;
- the brief in numbers (platforms, frame budget, players, memory);
- what changed, with toolkit calls;
- evidence: `results.json`, Audit tally, Spec totals, Stats numbers, contact sheet path and flags;
- Verified (ran, with numbers) and Assumed (not run, defaults);
- open issues and the fence: what the receiver may touch.

The receiver reproduces one piece of evidence (one Audit or one capture) before building on it.
