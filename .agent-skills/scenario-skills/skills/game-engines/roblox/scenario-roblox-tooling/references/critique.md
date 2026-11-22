# Critique: judge your own pipeline before you report it

Score each line 0 (missing), 1 (claimed, not shown), 2 (shown with a command result). Report the
commands and numbers, never "should work". A pipeline with any 0 in the blocking rows is not done.

## Blocking

| Check                                           | Evidence that earns a 2                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Place builds from the repository                | `rojo build` of the dev and ship projects exits 0 on a fresh clone after `rokit install` and `wally install`                                                                                                                                                              |
| Tools pinned                                    | `rokit.toml` pins every CLI the workflows call; `wally.lock` committed; Packages ignored                                                                                                                                                                                  |
| Gate green                                      | `rbx_tooling.py gate` ok, with the step list and seconds                                                                                                                                                                                                                  |
| Gate proven red                                 | each planted fault (type, solver-only, lint, format, spec, test in release) failed exactly its steps                                                                                                                                                                      |
| Type check sees the data model, on both solvers | luau-lsp ran twice (old, then `--flag:LuauSolverV2=true`) with a `--include-non-scripts` sourcemap and the Roblox definitions                                                                                                                                             |
| Selene configured                               | `std = "roblox"` in `selene.toml`; no `--allow-warnings` in CI; an overly strict rule relaxed by its option or one inline allow, not turned off (P2)                                                                                                                      |
| Right place                                     | `check_target` ok before engine tests: one bound window, place id 0 or the test place (P18)                                                                                                                                                                               |
| Packages resolve                                | ShipCheck has no `package-entry` finding                                                                                                                                                                                                                                  |
| Tests run in both places                        | `lune run tools/test` count, plus EngineTests in the engine (Studio, Luau Execution or RunScript) with failed 0 and total above 0                                                                                                                                         |
| Release excludes dev code                       | ShipCheck on the ship build: no findings, required paths present                                                                                                                                                                                                          |
| Release keeps the map                           | the place that ships comes from `merge_place` (base place plus code) or maps the builders' `.rbxmx` files; its report shows the map and the code paths, and `freshness` reads "checked" for every base place (P15)                                                        |
| Secrets                                         | no key in the repository or in `run:` lines; secrets reach steps through `env:`; fork pull requests skip secret jobs                                                                                                                                                      |
| Key preflight and scopes                        | every job holding a key runs `tools/check_key` first with its own `--require-scope` list; the engine key holds `universe-places:write` and `universe.place.luau-execution-session:write`, the publish key `universe-places:write` plus only the extras the run uses (P13) |
| Task slots                                      | engine jobs share one concurrency group; `cloud_luau` retries 429 with backoff                                                                                                                                                                                            |
| Publish guarded                                 | only a protected environment publishes; Saved before Published; agents never run phase 2                                                                                                                                                                                  |

## Quality

| Check                               | Evidence that earns a 2                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client entry runs once              | playtest probe or console shows one run per player (P7)                                                                                                        |
| Live sync cannot delete Studio work | no `$path` on a service without `$ignoreUnknownInstances: true`, or Studio-only instances live in files                                                        |
| Script Sync healthy (if used)       | SyncCheck ok; every root SyncedAsRoot; no scripts with attributes or tags                                                                                      |
| Multi-place parity                  | every place in `places.json`; one run uploads all of them                                                                                                      |
| Content the publish API skips       | `merge_place` exit 2 handled: the merged file published from Studio by a person                                                                                |
| Merge report read                   | `dropped` and `baseScripts` empty, or each entry moved into the repository                                                                                     |
| Team roles                          | builders edit a build experience; one owner per synced script; only the release job holds the production key (P16)                                             |
| Least-privilege keys                | one key per job, no scope its steps do not use, restricted by experience; group keys created on a dedicated automation account with a minimal group role (P13) |
| Server restart                      | outdated-only restart with bleed-off, run by the release job or a person, never by an agent                                                                    |
| Failure output readable             | a failing test prints its name and error in the CI log, not only an exit code                                                                                  |
| Fast feedback                       | static job time recorded; engine job only after static passes                                                                                                  |

## Red flags (score the whole pipeline 0 until fixed)

- A gate that was never seen failing.
- A test runner that passes when zero tests ran, or when a spec file fails to load.
- Exit code 0 trusted from the Studio command line (it is 0 even when the script errors).
- `--published` reachable from a pull request job.
- A release that uploads the Rojo code build alone over a place whose map lives in Studio.
- A base place merged without comparing its `baseVersion` to the build place's newest version.
- An agent that opened, closed or launched Studio outside the toolkit, or ran RunScript itself
  instead of the lead's wrapper.
- Engine tests run in a window that `check_target` did not confirm.
- Tests that touch DataStores through Luau Execution against a production universe.

## Report format

```
Gate: ok in <s> s (old solver <s>, new solver <s>, selene, stylua, lune <passed>/<total>, ship check ok)
Red proofs: type, old-only, new-only, lint, format, spec, release (each failed only its steps)
Engine tests: <where> <passed> passed, <failed> failed, <files> files
Keys: engine <scopes>, publish <scopes>; check_key <ok | not run>
Release: merge <exit> (replaced, added, dropped, baseScripts, freshness); ShipCheck <findings>; places <n>; publish <not run | Saved only>
Not run: <item> because <reason>
```
