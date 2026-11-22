# Critique rubric

Score your own Luau before you hand it over. Each line is pass or fail; any fail in the first two
sections blocks delivery.

## Blocking: correctness

| Check                                                                       | How to verify                                                                                                                | Pass                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Both type solvers clean                                                     | `rbx_luau.typecheck(paths, sourcemap)`                                                                                       | 0 errors in `old` and in `new`                            |
| No legacy scheduler                                                         | `Audit` from the toolkit (`wait`, `spawn`, `delay` rules)                                                                    | 0 findings                                                |
| No yield in a frame handler, metamethod, sort comparator or `gsub` callback | `rbx_luau.audit(place_or_src, "warn")`                                                                                       | 0 `yield-in-*` findings                                   |
| No removal handler reads `Parent` or `GetFullName`                          | same audit, `removal-handler-reads-parent`                                                                                   | 0 findings                                                |
| Parallel code is legal                                                      | same audit: `require-in-parallel`, `parallel-unsafe-write`, `parallel-without-actor`                                         | 0 errors; each warn reviewed                              |
| Every class releases what it creates                                        | Read `Destroy`: each `:Connect(` result is stored and disconnected, each created Instance destroyed; `Destroy` is idempotent | Destroy test leaves 0 connections                         |
| Player-keyed state is cleared                                               | `player-table-no-cleanup` finding absent; `PlayerRemoving` clears every table keyed by player                                | 0 findings                                                |
| Behavior holds under Deferred                                               | Tests ran in a place with `SignalBehavior = Deferred`                                                                        | handlers read state at run time, never "right after Fire" |

## Blocking: evidence

| Check                                                                  | Pass                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Every claim about timing, speed or memory has a number from this build | number, data model (Server or Client) and date recorded                                     |
| Native kept only on a measured win                                     | `Bench.ratio(plain, native)` above 1.2 on the real workload [added threshold]               |
| Parallel kept only on a measured win                                   | 1-Actor vs N-Actor elapsed time recorded; speedup above 1.5 [added threshold]               |
| Buffers kept only past the bandwidth gate                              | measured sustained inbound above about 50 KB/s (Crusherfire) or a payload size win recorded |
| Leak fixes proven                                                      | `Leak.retained` alive count 0 after the fix, or a flat `Leak.slope` over 20+ cycles         |

## Quality: idioms an expert expects

- `task.spawn` only when the caller must not wait; `task.defer` when the work belongs after the
  current step; `task.delay` instead of `task.spawn` plus `task.wait`.
- `RunService.PreSimulation`, `PostSimulation`, `PreRender` instead of `Stepped`, `RenderStepped`.
- `:Once()` for one-shot listeners instead of connect-then-disconnect.
- Methods defined as `function Class.name(self: Class, ...)`; callers still use `obj:name()`.
- Composition (an object holds another) instead of typed metatable inheritance chains.
- No `:: any` casts outside a single, commented boundary (dynamic `require`, JSON decode).
- `table.create(n, value)` or a literal for arrays; generalized iteration `for k, v in t`.
- Integer fields range-checked before `buffer.write*`: the library wraps and truncates silently.
- SharedTable read-modify-write through `SharedTable.increment` or `SharedTable.update`.

## Red flags in a review

- "Works in Studio" with no Deferred test, no second player, no respawn.
- A benchmark with one round, no warm-up, or run in the Edit data model.
- `pcall` around a yield to "make it safe" inside a metamethod or comparator.
- `collectgarbage("collect")` in Roblox code (only `"count"` is allowed; use `gcinfo()`).
- Module state read through the Command Bar or `execute_luau` to judge what game scripts see.
