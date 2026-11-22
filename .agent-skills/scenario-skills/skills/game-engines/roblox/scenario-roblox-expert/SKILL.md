---
name: scenario-roblox-expert
description: "Use when an agent builds, fixes or tests anything in Roblox Studio: \"make a Roblox game\", \"Roblox Studio\", a Luau script, \"my Roblox game lags\", agent control of Studio, the Studio MCP server (execute_luau, start_stop_play, screen_capture), Rojo or Script Sync projects, offline Luau checks, playtests driven by code; when the MCP server lists no Studio, a playtest hangs, or 2019 to 2023 Roblox code breaks; or when a Roblox brief (UI, data, networking, combat, monetization, assets, performance) must go to the right scenario-roblox-* specialist."
license: MIT
---

# Roblox expert (technical director and agent protocol)

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert Roblox work is a loop run against evidence: set the budget, build one stage, measure it, look
at it, fix it, advance. An agent without a mouse gets there through Studio's built-in MCP server,
offline checks and text files, passing only on a parsed result and never on one signal alone. This
skill is that protocol, the shared toolkit every scenario-roblox-* skill calls
([`scripts/`](scripts/)), and the map of the team. If a sibling skill named here is missing from
your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**Status (2026-10-18):** the toolkit ran live in Studio 0.743, 36 live tests and 16 offline tests,
all pass ([`references/procedures.md`](references/procedures.md)). `run_headless` is live run
pending: it needs a machine with no interactive Studio.

## Stance (the expert delta)

1. **Pass on a parsed result, never on tool text.** `execute_luau` returns only the first return
   value, and prints go to the Output log (observed). [`rbx_run.run`](scripts/rbx_run.py) returns
   `ok`, `result`, `error`, `output` with your chunk's line numbers. "Audit the results" of anything
   an agent made over the MCP (Roblox IAS Q&A, KnFJl6z5UN0 [00:21:23]).
2. **One place per agent, opened once, never closed by an agent.** Never run code in a window you
   did not open; the server asks you to confirm with the user before modifying their game. A SIGTERM
   to a place hung its window and hid every Studio from the server (observed). Closing places
   belongs to the orchestrator, with the user's agreement.
3. **Frame time against a budget, on the target.** Consistent frame time beats average FPS (Andrew,
   XLCZfGEm9tU [00:02:12]). Triage: works, real device, frame rate, Stats, then MicroProfiler
   (McNeill, rwLEnBtXr30 [00:29:19]). Studio memory "is incorrect" (McNeill, cWDNVvOh4o0
   [00:28:25]): it read 3,800 MB in a small playtest here.
4. **Look AND check.** Every visual change gets captures from fixed cameras,
   [`image_checks`](scripts/rbx_review.py), a before and after `compare`, and a contact sheet you
   open. Feel cannot be automated (RDC 2026, vumAuOqSmNA [00:29:36]); AI "doesn't automatically have
   taste" (SmartyRBX, da-wHJpNhBo [00:07:35]).
5. **Small steps, red before green.** One feature per prompt (SmartyRBX, 0ENeVVC9QT0 [00:10:26]).
   Follow a working answer with a security review, and test death and respawn (SimTek, -0H6JRtrA2Y
   [00:03:53, 00:06:42]). Write the `Spec` test first and watch it fail.
6. **Text files, Git, and a gate before Studio.** A CI gate on type and lint errors catches "90
   percent of what breaks a game" (CJ_Oyer, gapG2tH-etI [00:12:50]); Git is the safety net (Roblox
   Learn, v8r1d80DxOY [00:00:45]). Gate with [`rbx_check`](scripts/rbx_check.py) (luau-lsp with
   Roblox definitions), not bare `luau-analyze`.
7. **Know what persists.** An Edit change lives in the open session until someone saves, and no MCP
   tool saves; Server writes vanish when play stops (L24, L25). A Rojo reconnect deletes Studio-only
   instances without `$ignoreUnknownInstances` (Distracted Games, Zhl_NAPMztY [00:44:28]).
8. **Be honest about GUI-only tools.** The Animation Editor, terrain brushes, Avatar Setup, the
   Accessory Fitting Tool, Creator Hub dashboards and publishing are GUI steps. Give the substitute
   (`Terrain:WriteVoxels`, `KeyframeSequenceProvider:RegisterKeyframeSequence`,
   `AvatarCreationService:ValidateUGCAccessoryAsync`) or the GUI path
   ([`references/gui-paths.md`](references/gui-paths.md)). Never publish, upload or spend Robux
   without the user's go.

## Channels

| Channel                                         | Use for                                                     | Cost (measured)                   | Rules                                                   |
| ----------------------------------------------- | ----------------------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| **Studio MCP, Edit** (`rbx_run.run`)            | build, audit, inspect, edit scripts                         | 67 ms per call; first open 18.3 s | your own place; chunks yield every 1,000 items          |
| **Playtest** (`rbx_play.Playtest`)              | Server and Client code, keys, walking, mouse, play captures | ready in 4.2 s                    | one server, one client; stops even after an exception   |
| **Offline** (`rbx_check`, Lune, `lune_audit`)   | gate before Studio, CI, pure-logic tests                    | seconds                           | Lune has no physics, no network                         |
| **Files** (Rojo, Script Sync)                   | durable code in Git                                         | `rojo build` 0.04 s               | never rebuild a `.rbxl` that Studio holds open          |
| **Headless RunScript** (`rbx_run.run_headless`) | CI with no interactive Studio                               | about 6 s per run                 | refuses while any Studio runs                           |
| **Open Cloud Luau Execution**                   | CI assertions on a published place                          | 5 tasks per minute                | API key and the user's go; no physics, nothing persists |

Concurrency: at most `RBX_MAX` (default 3) agents hold a place through
[`rbx_env.place_slot()`](scripts/rbx_env.py). Each place is its own Studio process of about 2.9 GB,
and every window renders all the time. `open_place` waits while `RBX_MAX_PLACES` (default 4) place
windows are open machine-wide, GPU use or GPU memory is above 85%, or RAM is above 75%. Close a
place as soon as its run ends. Several `StudioMCP` proxies share one port, so `Studio.call` retries
for 45 s while the host proxy changes.

## Establish first

Ask once, then run:

- target devices and the lowest one (default: phone, 60 fps, 16.67 ms);
- players per server and genre;
- Rojo, Script Sync or Studio-only;
- whether Server Authority or streaming is wanted (`StreamingEnabled` is on in new places);
- which place is the agent's own, and the deliverable.

Then `rbx_env.doctor()` and an `Audit.all(game)` of the starting place. Write the budget, sync tool,
data model plan and owners into the plan.

## The expert loop

1. **Brief in numbers.** Budgets per device, players, memory, art style. GATE: every later check has
   a number.
2. **Place.** `new_place` then `open_place` inside `place_slot`, once. GATE: `open_places()` lists
   it; `Audit` tally has no error.
   - `new_place` overwrites `<dir>/default.project.json`: `dir` is a new folder of your own, never
     the user's project.
   - Existing game: ask the user to save first, since edits in their open window are not on disk.
     Merge a copy of the saved place with the code build (scenario-roblox-tooling P15,
     `merge_place`, any repository) and open the merge, never the user's file.
   - Edit a worktree or copy of their sources: their `rojo serve` syncs `src/` into their window.
3. **Baseline.** `Audit`, `Spec` tests that fail first, captures from fixed cameras, `Stats.frames`
   in a playtest. GATE: numbers recorded, sheet opened.
4. **Build one stage** with idempotent chunks or files; route domain work to its owner (below).
   Adding instances to the open place: procedures.md P2.
5. **Measure.** `rbx_check` 0 errors, `Spec` all green, `Audit` clean, `Stats.frames` on Server and
   Client within the frame gate: p95 at most 1.2 x the frame budget (20 ms at 60 fps) and worst at
   most 2 x (33.3 ms). Heartbeat steps jitter around the vsync interval, so a healthy 60 fps place
   reads p95 17.2 to 17.4 ms and a bare 16.67 ms gate fails it; a dropped frame reads about 33 ms.
6. **Look AND check.** Same cameras, `image_checks` ok, `compare` changed where it should, contact
   sheet opened, judged with the owner's critique.
7. **Fix before advancing,** one change at a time.
8. **Deliver with evidence:** Verified (what ran, result file, numbers, frames) and Assumed (not
   run). List what a human must still play for feel.

## Toolkit ([`scripts/`](scripts/), the contract for every scenario-roblox-* skill)

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent / "scenario-roblox-expert" / "scripts"))
```

| Module                            | Main calls                                                                                                                                                                  | Returns                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `rbx_env`                         | `doctor()`, `new_place(dir, name, template, src)`, `open_place(path)`, `open_places()`, `place_slot()`, `machine_load()`, `wait_for_gpu()`                                  | dict; `Path`; bound `Studio`; `[{id, name}]`; slot index; percents |
| [`rbx_mcp`](scripts/rbx_mcp.py)   | `Studio(place=...)`: `.call(tool, args)`, `.luau(code, dm)`, `.capture(png, extra)`, `.studios()`, `.tools()`                                                               | MCP result dict; text; `Path`                                      |
| `rbx_run`                         | `run(studio, code, dm="Edit", kit=[...])`, `run_headless(place, code, kit)`                                                                                                 | `{ok, result, error, output}`                                      |
| [`rbx_play`](scripts/rbx_play.py) | `Playtest(studio)`: `.server(code, kit)`, `.client(code, kit)`, `.wait_for`, `.press(key, hold)`, `.walk_to([x, y, z])`, `.keys`, `.mouse`, `.console`, `.capture`, `.mode` | `rbx_run` dicts; tool text                                         |
| `rbx_check`                       | `check(paths, code, sourcemap, selene, stylua, solver="both")`                                                                                                              | `{ok, errors, warnings, tools}`, findings tagged old or new solver |
| `rbx_review`                      | `image_checks(png)`, `compare(a, b)`, `contact_sheet(pngs, out)`                                                                                                            | flags and `ok`; `changed_fraction`; path                           |
| [AgentKit](scripts/agentkit/)     | `Audit.all(game)`, `Stats.snapshot()`, `Stats.frames(s)`, `Stats.diff`, `Spec.new()`                                                                                        | findings and tally; numbers; `{passed, failed, total}`             |

Full signatures, return shapes and tool arguments:
[`references/procedures.md`](references/procedures.md) section 1. Domain code goes in each sibling's
`scripts/rbx_<domain>.py` and `scripts/agentkit/<domain>/`. `rbx_env.close_place` is
orchestrator-only and refuses by default.

## Numbers

| Value                    | Relative to                                           | Source                |
| ------------------------ | ----------------------------------------------------- | --------------------- |
| 16.67 / 33.33 ms         | frame at 60 / 30 fps                                  | Andrew [00:02:12]     |
| 67 ms                    | one `execute_luau` round trip, Edit                   | observed, L9          |
| 4.2 s / 18.3 s           | playtest ready / first `open_place`                   | observed, L13, L3     |
| 60 fps, p95 17.5 ms      | empty test place, Server and Client in Studio         | observed, L16, L17    |
| p95 20 ms, worst 33.3 ms | frame gate at 60 fps (1.2 x and 2 x the budget)       | derived from L16, L17 |
| 1.3 GB                   | client memory target on a 2 GB phone                  | McNeill [00:27:53]    |
| about 1,000              | items per chunk before a `task.wait()`                | tool description      |
| 20,000 / 4,000           | triangles per MeshPart / per accessory                | specifications pages  |
| 4096 px                  | max texture side in places (accessories 2048)         | devforum 4316229      |
| 500 per s, 1,000 bytes   | client remote requests; UnreliableRemoteEvent payload | RemoteEvent reference |

## Quality gates

- **Measurable:** `rbx_check` 0 errors; `Spec` `failed == 0` and `total > 0`, after one red run;
  `Audit` `tally.error == 0` and deprecated APIs gone; `Stats.frames` p95 and worst within budget;
  console free of errors after a playtest; `get_studio_state` back in Edit.
- **Visual:** every capture passes `image_checks`; before and after from the same cameras; a contact
  sheet of at most 1,600 px opened and judged.

## Common mistakes

| Mistake                             | Symptom                                      | Fix                                         |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------- |
| no `studio_id`, or the wrong window | edits land in the user's game                | `Studio(place=...)` binds by exact name     |
| trusting tool text or exit codes    | prints missing; RunScript exits 0 on errors  | `rbx_run` payload                           |
| playtest never stopped              | Edit data model "not available in Play mode" | `with Playtest(s)`; check `mode()`          |
| `"Position"` in a Rojo project      | part at the origin, build exit 0             | `CFrame` (12 numbers); `new_place` converts |
| `script_grep` with `[` or `(`       | "No matches found"                           | escape with `%`                             |
| long chunk without yields           | Studio frozen, MCP drops                     | batches of 1,000 with `task.wait()`         |
| gating on Studio memory or FPS      | numbers do not match devices                 | `Stats.frames` p95; device tests            |
| claiming multi-client tests         | one MCP playtest is one client               | `StudioTestService` (not yet run here)      |
| GUI scripting or SIGTERM to Studio  | hung windows, server lists nothing           | ask the user; never signal                  |

## Routing and handoffs

| Skill                        | Route here when the brief mentions                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| scenario-roblox-architecture | project layout, client and server split, RunContext, services, ModuleScripts, frameworks, Attributes and tags |
| scenario-roblox-luau         | task library, deferred events, types, OOP, buffers, native code, Parallel Luau, memory leaks in code          |
| scenario-roblox-networking   | remotes, "exploiters", "remote spam", validation, rate limits, network ownership, Server Authority            |
| scenario-roblox-data         | "data not saving", DataStores, ProfileStore, migration, MemoryStore, MessagingService, teleports              |
| scenario-roblox-environment  | building, terrain, materials, MaterialVariant, lighting, Atmosphere, sky, graybox, per-model streaming        |
| scenario-roblox-vfx-audio    | particles, beams, trails, flipbooks, hit effects, Audio API, sounds, music                                    |
| scenario-roblox-ui           | HUD, menus, "UI scales wrong on phone", gamepad, Input Action System, localization                            |
| scenario-roblox-animation    | Animator, tracks, rigs, Blender animation import, IK, faces, character controllers                            |
| scenario-roblox-gameplay     | combat, hitboxes, raycasts, projectiles, "NPC pathfinding stuck", game loops, vehicles                        |
| scenario-roblox-monetization | passes, Developer Products, ProcessReceipt, subscriptions, ads, analytics, live ops                           |
| scenario-roblox-assets       | "import from Blender", meshes, textures, SurfaceAppearance, "mesh fails validation", UGC                      |
| scenario-roblox-tooling      | Rojo, Wally, Rokit, Selene, StyLua, Lune, CI, Open Cloud, plugins, Script Sync                                |
| scenario-roblox-performance  | "my game lags", MicroProfiler, memory, streaming settings, mobile, publishing                                 |

Split items have one owner, which names the second skill in its packet:

- streaming: settings to performance, per-model modes to environment;
- hit validation: the rule to networking, the casts to gameplay;
- ProcessReceipt: the contract to monetization, persistence to data;
- AI meshes: intake to assets, placement to environment, reuse budgets to performance;
- Server Authority: enabling to networking, `BindToSimulation` logic to gameplay;
- memory leaks: diagnosis to performance, cleanup code to luau.

Every handoff packet carries: place path and window, channel, the brief in numbers, toolkit calls,
evidence paths (results JSON, Audit tally, Spec totals, Stats, contact sheet), Verified, Assumed,
open issues, and a fence. The receiver reproduces one piece of evidence before building on it.

## Scenario assets into Roblox

| Asset                              | Generated with            | Lands in                                                                                  |
| ---------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| meshes, props, characters          | scenario-3d               | scenario-roblox-assets (import, 20,000 triangles), then environment                       |
| PBR maps, tileable materials       | scenario-textures         | scenario-roblox-assets (SurfaceAppearance), scenario-roblox-environment (MaterialVariant) |
| skyboxes                           | scenario-skyboxes         | scenario-roblox-environment (Sky, six faces)                                              |
| music, SFX, ambience, voice        | scenario-audio            | scenario-roblox-vfx-audio (under 20 MB, 7 minutes, 48 kHz)                                |
| icons, item art, UI pieces, decals | scenario-game-assets      | scenario-roblox-ui, scenario-roblox-environment                                           |
| flipbook frames                    | scenario-sprite-animation | scenario-roblox-vfx-audio (2x2, 4x4 or 8x8 grids)                                         |

Check each asset before import (scenario-quality-gate) and after, in a capture judged by the
receiver. Getting any file into a shipped game uploads it to Roblox, so it needs the user's go.

## Traps

Read [`references/traps.md`](references/traps.md) before the first job: the 2026 API renames and
replacements, the Studio MCP tool facts (`is_start`, `capture_id`, `datamodel_type` "Client", lost
replies), process hazards, Rojo and Script Sync traps, and live corrections to the version deltas.

## References

- [`references/procedures.md`](references/procedures.md): the toolkit API in full, chunk rules, and
  each procedure with its tests and results.
- [`references/traps.md`](references/traps.md): current-Roblox traps, MCP and file pipeline traps,
  live corrections.
- [`references/expert-notes.md`](references/expert-notes.md): expert claims by source with
  timestamps.
- [`references/critique.md`](references/critique.md): the rubric for judging an agent's Roblox work
  and a handoff.
- [`references/gui-paths.md`](references/gui-paths.md): Studio menus for the same tasks, and the
  GUI-only steps.
- [`references/sources.md`](references/sources.md): every source with credentials, URLs and best
  timestamps.
