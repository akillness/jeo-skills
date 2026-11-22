# GUI paths

The same procedures as `procedures.md`, done by hand in Studio (October 2026 build, macOS). Use them
for a human, a computer-use agent, or for the settings scripts cannot touch. Menu names follow the
current ribbon UI; on Windows read Ctrl for Cmd.

## Settings scripts cannot change

| Setting                                | Path                                                                       | Notes                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Deferred events                        | Explorer > Workspace > Properties > Behavior > SignalBehavior = Deferred   | NotScriptable: `execute_luau` reads "not a valid member". Rojo: `"Workspace": {"$properties": {"SignalBehavior": "Deferred"}}` |
| Character cleanup on respawn and leave | Workspace > Properties > PlayerCharacterDestroyBehavior = Enabled          | NotScriptable. Code fallback: `CharacterRemoving` plus `task.defer(character.Destroy, character)`                              |
| Project type-check mode                | Workspace > Properties > LuauTypeCheckMode                                 | Scripts with a `--!strict` or `--!nonstrict` line ignore it                                                                    |
| Type solver                            | Workspace > Properties > UseNewLuauTypeSolver (Default, Enabled, Disabled) | NotScriptable RolloutState. Default follows the engine rollout                                                                 |
| Script analysis                        | View > Script Analysis                                                     | Lists type errors and lint warnings per script; the agent substitute is `rbx_luau.typecheck`                                   |

## Profiling and evidence

| Task                            | Path                                                                                                                                                   | Agent substitute                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Frame timing of tagged code     | View > MicroProfiler (Cmd+F6 in play), Cmd+P to pause, find your `debug.profilebegin` label                                                            | `os.clock()` A/B with AgentKit `Bench`; `Stats` snapshot                         |
| Which functions are native      | View > Script Profiler, record, then look for `<native>` next to function names                                                                        | `Bench.ratio` before and after `--!native`                                       |
| Native size budget              | Switch the Command Bar to the Server view during a playtest, run `debug.dumpcodesize()`                                                                | None: the function exists only in the Command Bar (see critique)                 |
| Parallel work on worker threads | MicroProfiler, pause a frame, look for your labels on RBX Worker rows                                                                                  | `Parallel.run` elapsed time with 1 vs 8 Actors                                   |
| Leak hunt                       | Play, F9 (Developer Console) > Luau Heap > Server > Create snapshot; repeat the same cycle; Compare; trust only entries that rise across several diffs | AgentKit `Leak.retained` and `Leak.sample` (heap KB and InstanceCount per cycle) |
| Memory by script                | Developer Console > Memory > PlaceScriptMemory, or Luau Heap > Memory Categories (`debug.setmemorycategory` names)                                     | `gcinfo()` sampled by `Leak.sample`                                              |

## Running the probes by hand

1. Open the place, then Test > Play (or Run for a server without a character).
2. In the Command Bar, pick Server (top right of the bar during a playtest).
3. Paste the chunk from `procedures.md` with the AgentKit module source above it, or require a
   ModuleScript copy of the module from ReplicatedStorage.
4. Read the printed table in the Output window.

## Type checking by hand

1. Add `--!strict` as the first line of the module.
2. Hover a variable to see its inferred type; red underlines are type errors.
3. View > Script Analysis lists every error in the place.
4. Studio may run the old solver for strict scripts unless UseNewLuauTypeSolver is Enabled: check
   both solvers offline before trusting a clean editor.
