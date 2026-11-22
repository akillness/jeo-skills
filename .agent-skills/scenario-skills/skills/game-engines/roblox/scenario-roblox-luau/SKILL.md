---
name: scenario-roblox-luau
description: "Use when writing, reviewing or debugging Luau in a Roblox experience: task.spawn vs task.defer vs task.wait, replacing wait() or spawn(), Deferred events and SignalBehavior, handlers running in the wrong order or not at all, 'attempt to yield across metamethod/C-call boundary', --!strict and the new type solver, typed classes and metatables, Destroy and cleanup, 'server memory keeps growing' or memory leaks, Parallel Luau with Actors and SharedTable, 'not safe to write in parallel', --!native or 'make this script faster', buffers, coroutines."
license: MIT
---

# Roblox Luau Engineering

Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert toolkit.

Expert Luau here means code that stays correct under Deferred events and the task scheduler,
type-checks on both solvers, releases everything it creates, and earns each optimization with a
number measured on this build. Prove behavior in a playtest data model instead of reasoning from
Immediate-era habits.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **`task.spawn` is not concurrency.** It runs the body up to its first yield before the caller
   continues (Crusherfire). Use `task.defer` for "after this step": a queue that keeps call order.
   `task.wait()` and `task.delay(0)` resume at the next Heartbeat: the same frame from
   PreSimulation, the next frame from Heartbeat (Crusherfire; measured 0.07 ms vs 16.4 ms).
2. **Write Deferred-safe code.** Handlers run at the next resumption point, never inside `:Fire()`
   or a property set (deferred events docs). Nested fires run in queue order, a listener connected
   inside a handler misses fires from the same step, and `Destroying` or `CharacterRemoving`
   handlers see `Parent` nil (Crusherfire; all measured). Read state inside the handler, use
   `:Once()`, and capture what cleanup needs before `Destroy`. Deferred alone cut one game's frame
   time from 6 to 8 ms to 4 to 5 ms (Drew Hamilton, RDC 2026).
3. **Yield only where it is legal and cheap.** Never yield in `__index` or other metamethods,
   `table.sort` comparators or `gsub` callbacks: "attempt to yield across metamethod/C-call
   boundary". Never yield in per-frame handlers: `task.wait(0.25)` in Heartbeat stacked 16 threads
   in 1 s [added, measured]. `pcall` is no fix: a failed `task.wait` under `pcall` left its thread
   registered with the scheduler [added, measured].
4. **Type for both solvers.** New modules start `--!strict`. Define methods as
   `function Class.name(self: Class, ...)`: colon methods let field typos through on both solvers
   [added, tested]. Prefer composition: typed metatable inheritance raises false errors on both.
   Narrow with `IsA` or `FindFirstChildOfClass` instead of `:: any`. Gate on the old and the new
   solver, because strict scripts follow `Workspace.UseNewLuauTypeSolver`, which scripts cannot
   read.
5. **Every object owns its cleanup.** `Destroy` is idempotent and disconnects every connection it
   made (Roblox Learn, OOP). Tables keyed by player are cleared on `PlayerRemoving`. Old characters
   are destroyed: at the Default setting a respawned character was unparented but kept its
   connections (measured). A leak is memory that never comes down; growth alone is not (Roblox
   Learn, memory leaks).
6. **Parallel Luau computes; serial code writes.** One Actor per independent unit, `require` before
   the parallel phase, writes after `task.synchronize()` (docs; Suphi Kaner; Stewiepfing). Each
   Actor is its own Luau VM, so module state is not shared. Read-modify-write on a SharedTable goes
   through `SharedTable.increment` or `update`: a plain `+= 1` from 8 Actors lost 79% of updates
   (measured).
7. **Native code and buffers only after measurement.** `--!native` wins on typed numeric code: 3.3x
   on a number loop, 4.9x on a typed `Vector3` loop, nothing when the `Vector3` parameter is untyped
   (measured; docs say annotate). Native everywhere costs startup and a global memory budget (Roblox
   Learn, native). Buffers pay past about 50 KB/s sustained (Crusherfire), with range checks because
   integer writes wrap silently.
8. **The injected chunk is not the game.** An `execute_luau` chunk on the Server has its own module
   cache: it saw `Counter.n = 0` where game Scripts saw 41 [added, measured]. Read game state
   through attributes or a BindableFunction hook.

## Establish first

- **Signal mode:** Workspace > SignalBehavior. Scripts cannot read it; check the Properties panel,
  the Rojo project file, or `rbx_luau.audit(place)`. `Default` means Immediate. A Rojo-built place
  without the property is Default.
- **Server Authority:** `Workspace.AuthorityMode = Server` forces Deferred and fixed-step
  simulation; game logic then belongs to scenario-roblox-gameplay.
- **Type setup:** `Workspace.LuauTypeCheckMode`, `UseNewLuauTypeSolver`, and whether a Rojo project
  gives a sourcemap.
- **Where code runs:** Server, Client, or under an Actor. Native code helps server scripts only.
- **Baseline numbers** before any optimization: ms per frame of the hot path, KB/s on the wire, heap
  slope per cycle.
- **PlayerCharacterDestroyBehavior** (Properties panel; not scriptable).
- Defaults when unknown: Deferred, `--!strict`, both solvers gated, no native, no Actors, no
  buffers.

## Procedure

1. **Audit what exists.** Goal: find scheduler, yield, deferred, parallel, native and leak mistakes
   before a playtest. How: offline `rbx_luau.audit("place.rbxl" or "src/", "warn")` (Lune); in
   Studio `rbx_luau.run(s, chunk, dm="Edit", kit=["LuauAudit"])` with `LuauAudit.tree(game)`; the
   toolkit's `Audit` covers legacy APIs. GATE: 0 error findings; every warn fixed or justified in
   one line.
2. **Fix the idioms.** Goal: current scheduler and event idioms. How: `task.*` only;
   `PreSimulation`, `PostSimulation`, `PreRender` instead of `Stepped` and `RenderStepped`;
   `:Once()`; yields out of frame handlers (busy flag, or one spawned worker loop); metamethods that
   never yield (precompute, or an explicit `get` that may yield). GATE: audit clean; behavior
   unchanged under Deferred (step 5).
3. **Type pass.** Goal: errors caught at edit time on both solvers. How: `--!strict`, a `Fields`
   type plus `typeof(setmetatable({} :: Fields, Class))`, dot-typed `self`, composition,
   `table.create(n, value)`; then
   `rbx_luau.typecheck(paths, sourcemap=rbx_luau.sourcemap(project))`. GATE: 0 errors in `old` and
   `new`.
4. **Ownership and cleanup.** Goal: nothing outlives its owner. How: the
   [class template](scripts/agentkit/luau/templates/Class.luau) (`Destroy` wired to `Destroying`);
   `PlayerRemoving` cleanup; character destruction. Prove it in a Server playtest with
   `Leak.retained(make, release, n)` and `Leak.sample(cycle, 20)` plus `Leak.slope`. GATE: `alive` 0
   after release; heap slope flat over 20 or more cycles; 0 connections left after `Destroy`.
5. **Probe behavior that depends on order.** Goal: facts from this place, not assumptions. How:
   `Probe.scheduler()`, `Probe.delayTiming()`, `Probe.signals()` through
   `rbx_luau.run(..., dm="Server")` and `dm="Client"` in one playtest
   ([procedures](references/procedures.md) P3). GATE: results recorded; no code depends on an order
   the probe shows Deferred changes.
6. **Optimize only with a number.** Goal: keep only measured wins. How:
   `Bench.run({plain=..., native=...}, 7)` in the Server data model (interleaved rounds, warm-up,
   median); `Parallel.workers` with 1 vs N Actors and a work module; `BufferCodec` size vs the table
   payload. GATE: native ratio 1.2 or more [added threshold], parallel speedup 1.5 or more [added
   threshold], buffers past the bandwidth gate; otherwise revert.
7. **Hand off with evidence.** Goal: a reviewer can trust the result without rerunning it. How:
   attach typecheck output, audit JSON, probe and bench results with build, data model and date; a
   playtest capture through `rbx_review` when the change is visible. GATE: every claim in the
   handoff has a number or a test name.

## Numbers

| Value                                | Measured or stated                                                 | Relative to                                      |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------ |
| `task.delay(0)` resume               | 0.07 ms from PreSimulation, 16.42 ms from Heartbeat                | Studio 0.743 Server, 60 Hz                       |
| Yielding Heartbeat handler           | 16 concurrent threads in 1 s                                       | `task.wait(0.25)` per call                       |
| Deferred frame-time gain             | 6 to 8 ms down to 4 to 5 ms                                        | one shipped game (RDC 2026)                      |
| Native speedup, numeric loop         | 3.3x                                                               | plain Luau, Server, n = 200,000                  |
| Native speedup, typed `Vector3` loop | 4.9x; untyped 0.96x                                                | same kernel without `--!native`                  |
| Native size limits                   | 64K instructions per block, 32K blocks per function, 1M per script | docs; plus a global cap                          |
| Parallel speedup                     | 7.6x (144.5 ms to 19.0 ms)                                         | 1 vs 8 Actors, 32 pure-compute jobs, 18-core Mac |
| SharedTable plain `+= 1`             | 127,107 of 160,000 updates lost                                    | `SharedTable.increment` lost 0                   |
| Buffer gate                          | about 50 KB/s sustained inbound                                    | Crusherfire                                      |
| Number over a remote                 | 9 bytes; Color3 13 vs 5 packed                                     | Crusherfire                                      |
| SharedTable keys                     | strings or integers 0 to 2^32 - 1                                  | SharedTable reference                            |
| Memory budget                        | about 6.25 GB server; about 2 GB phone with 700 MB used by the OS  | Roblox Learn, memory leaks                       |
| Re-entrancy limit                    | 10 (docs); a self-refiring handler reached 50 without error        | Deferred, BindableEvent                          |

## Quality gates

Measurable:

- `rbx_luau.typecheck`: 0 errors on both solvers, with the project sourcemap.
- `rbx_luau.audit`: 0 errors; warns resolved.
- Toolkit `Audit`: no legacy scheduler or deprecated API findings.
- `Leak.retained` alive 0 and a flat `Leak.slope` after every cleanup fix.
- Probe results for the place's signal mode recorded on Server and Client.
- Bench and Parallel ratios recorded before keeping native code or Actors.
- `BufferCodec` round trip exact (or within f32 precision) and refusals tested.

Visual (when behavior is visible): a playtest capture through `rbx_review` showing the object
moving, cleaned up, or the state you claim; for profiling claims, a MicroProfiler or Script Profiler
capture taken by hand ([GUI paths](references/gui-paths.md)).

## Common mistakes

| Mistake                                            | Symptom                                              | Fix                                        |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `wait()`, `spawn()`, `delay()`                     | Throttled, late resumes                              | `task.wait`, `task.spawn`, `task.delay`    |
| Logic after `:Fire()` that expects the handler ran | Stale state under Deferred                           | Act inside the handler, or `task.defer`    |
| `Destroying` handler reads `Parent`                | nil errors                                           | Capture before `Destroy`                   |
| `task.wait` in a Heartbeat handler                 | Thread pile-up, doubled work                         | Busy flag, or one worker loop              |
| Yield in `__index` or a sort comparator            | "attempt to yield across metamethod/C-call boundary" | Precompute; explicit getter                |
| `function C:m()` in strict code                    | Field typos pass                                     | `function C.m(self: C)`                    |
| `(x :: any).Child`                                 | Typos pass the checker                               | Narrow with `IsA`, `FindFirstChildOfClass` |
| Typed inheritance chain                            | "does not have key" on valid calls                   | Composition                                |
| `players[player] = ...` without `PlayerRemoving`   | Server memory climbs per join                        | Clear on `PlayerRemoving`                  |
| `ConnectParallel` outside an Actor                 | Error; handler never runs                            | Parent the script under an Actor           |
| `require` or Instance writes after `desynchronize` | "not safe to write in parallel"                      | Require first; write after `synchronize`   |
| `task.synchronize()` inside `pcall`                | Place crash in one run (cause not isolated)          | Keep phase switches out of `pcall`         |
| `--!native` on untyped `Vector3` code              | No speedup                                           | Annotate parameters                        |
| `buffer.writeu8(b, 0, 300)`                        | Stores 44                                            | Range-check, or `BufferCodec`              |
| `collectgarbage("collect")`                        | Error in Roblox                                      | `gcinfo()`                                 |

## Handoffs

- **From scenario-roblox-architecture:** module layout, cleanup library choice (Trove, Janitor,
  Maid), signal modules. This skill reviews the Luau inside them.
- **To scenario-roblox-networking:** `BufferCodec` schemas and measured payload sizes; remotes, rate
  limits and wire formats stay there.
- **To scenario-roblox-performance:** Bench and Parallel results, native candidates, leak slopes;
  frame budgets and profiling sessions stay there.
- **From and to scenario-roblox-gameplay:** fixed-step and Server Authority code; this skill
  supplies scheduler and Deferred rules.
- **From scenario-roblox-data:** session state keyed by player; this skill checks `PlayerRemoving`
  cleanup.
- **To scenario-roblox-tooling:** the type gate and `lune_luau_audit.luau` for CI.

## Current Roblox notes

- Deferred is the template default; `Default` still maps to Immediate; Server Authority forces
  Deferred. `SignalBehavior` is NotScriptable.
- New type solver: general release 2025-11-20 for nonstrict and nocheck; strict follows
  `UseNewLuauTypeSolver` (NotScriptable). The old solver stays through 2026.
- `wait`, `spawn`, `delay` are deprecated globals; `Stepped` and `RenderStepped` are superseded.
- Native code generation runs in server scripts; `debug.dumpcodesize()` works only from the Command
  Bar (Server view).
- `vector.create` returns a `Vector3` in Roblox; buffers serialize to JSON as
  `{"m":null,"t":"buffer","base64":...}`.
- `collectgarbage` accepts only `"count"` in Roblox scripts.

## References

- [references/expert-notes.md](references/expert-notes.md): principles by topic with sources,
  timestamps and live results.
- [references/procedures.md](references/procedures.md): P1 to P10 with full code, test paths and
  results.
- [references/critique.md](references/critique.md): self-review rubric.
- [references/gui-paths.md](references/gui-paths.md): Properties, profilers and Command Bar paths
  for the same work.
- [references/sources.md](references/sources.md): experts, docs and tools with URLs.
- [scripts/rbx_luau.py](scripts/rbx_luau.py): `typecheck` (both solvers), `sourcemap`, `audit`
  (Lune), `run` with kits.
- [scripts/agentkit/luau/LuauAudit.luau](scripts/agentkit/luau/LuauAudit.luau): static rules;
  [lune_luau_audit.luau](scripts/agentkit/luau/lune_luau_audit.luau) runs them offline.
- [scripts/agentkit/luau/Probe.luau](scripts/agentkit/luau/Probe.luau): scheduler, signal, yield and
  pile-up probes.
- [scripts/agentkit/luau/Leak.luau](scripts/agentkit/luau/Leak.luau): retention and heap-slope
  checks.
- [scripts/agentkit/luau/Bench.luau](scripts/agentkit/luau/Bench.luau): interleaved A/B timing.
- [scripts/agentkit/luau/Parallel.luau](scripts/agentkit/luau/Parallel.luau) with
  [templates/ParallelWorker.server.luau](scripts/agentkit/luau/templates/ParallelWorker.server.luau):
  Actor workers.
- [scripts/agentkit/luau/BufferCodec.luau](scripts/agentkit/luau/BufferCodec.luau): range-checked
  buffer schemas.
- [scripts/agentkit/luau/templates/Class.luau](scripts/agentkit/luau/templates/Class.luau): typed
  class with idempotent `Destroy`.
