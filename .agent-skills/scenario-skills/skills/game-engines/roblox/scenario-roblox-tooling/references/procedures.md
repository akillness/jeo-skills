# Procedures: build, test and release pipeline

Each procedure lists its code, its test and the recorded result. Tests live in the skill's test
harness: `run_offline.py` (real CLIs, a local mock for Open Cloud) and `run_live.py` (Studio through
the scenario-roblox-expert toolkit). Python snippets assume the two script folders are importable:

```python
import sys
from pathlib import Path

SKILLS = Path("<skills root>")  # where scenario-roblox-expert and this skill are installed side by side
sys.path.insert(0, str(SKILLS / "scenario-roblox-expert" / "scripts"))
sys.path.insert(0, str(SKILLS / "scenario-roblox-tooling" / "scripts"))
import rbx_env, rbx_tooling as T
from rbx_run import run
from rbx_play import Playtest
```

## P1. Scaffold a team project

Goal: a repository that builds the place from empty, with every tool pinned.

```python
T.scaffold("arena", "arena")  # refuses a non-empty folder unless force=True
```

```sh
cd arena
rokit install # pins in rokit.toml; CI adds --no-trust-check
wally install # Packages/ and wally.lock; commit the lock, ignore Packages/
git init && git add -A && git commit -m "Scaffold"
```

What it writes (template in [scripts/template/](../scripts/template/)):

| File                                                                 | Role                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `rokit.toml`                                                         | Rojo 7.7.1, Wally 0.3.2, Lune 0.11.0, Selene 0.32.0, StyLua 2.6.0, luau-lsp 1.70.1                       |
| `default.project.json`                                               | dev build: code, Packages, `ServerStorage.TestKit`                                                       |
| `ship.project.json`                                                  | release build: no TestKit, no `*.spec.luau`                                                              |
| `selene.toml`, `stylua.toml`, `.luaurc`, `.styluaignore`             | `std = "roblox"`, tabs, strict mode, vendored files skipped                                              |
| `src/shared`, `src/server`, `src/client`                             | ReplicatedStorage.Shared, ServerScriptService.Server, ReplicatedStorage.Client                           |
| `tools/test.luau`, `tools/ship_check.luau`                           | Lune test runner and release gate                                                                        |
| `tools/cloud_luau.luau`, `tools/publish.luau`                        | Open Cloud clients (key from the environment)                                                            |
| `tools/check_key.luau`, `tools/restart_servers.luau`                 | key preflight, server restart after a release                                                            |
| `tools/merge_place.luau`, `tools/place_versions.luau`, `places.json` | builders' base place plus the code build, per place, refusing a stale base (P15); universe and place ids |
| `tools/testkit/`                                                     | EngineTests, TestRunner, ShipCheck, Spec (copied from the toolkit)                                       |
| `.github/workflows/ci.yml`, `publish.yml`                            | pull request gate, engine tests, release                                                                 |

Template choices, each tested:

- `"emitLegacyScripts": false`: `.client.luau` builds a Script with RunContext Client, the Script
  Sync meaning. With the default (true) it builds a LocalScript, which never runs in
  ReplicatedStorage.
- Client entry in `ReplicatedStorage.Client`, per the docs' script-locations guidance. A RunContext
  Client Script in StarterPlayerScripts runs twice (P7).
- `globIgnorePaths` drops `Packages/**/wally.toml` and package tests. Without it a real Wally
  package added a ModuleScript named `wally` and its test modules to the release build.
- `Packages` mapped with `{"optional": "Packages"}`, so `rojo build` works before `wally install`.
- `.gitignore` drops built places and Studio lock files but keeps `assets/*.rbxl`, the builders'
  base places (P15).

Test: `run_offline.py` O1 (scaffold, refusal on a non-empty folder) and O13 (pins). Result: run on
2026-10-19: pass, 30 files written, no `__NAME__` left; `git check-ignore` keeps `assets/start.rbxl`
and ignores `build/start.rbxl` and lock files; installed versions equal the pins (Rojo 7.7.1, Lune
0.11.0, Selene 0.32.0, StyLua 2.6.0, luau-lsp 1.70.1); `wally.lock` pins `sleitnick/signal`.

## P2. Local gate, then prove it can fail

Goal: the same checks as CI, in CI order, and evidence that each check catches its fault.

```python
rep = T.gate("arena")  # wally, sourcemap, luau-lsp twice (old and new solver), selene, stylua, Lune tests, ship build, ShipCheck
assert rep["ok"], [s for s in rep["steps"] if s["exit"]]
```

The type check needs the sourcemap and the Roblox definitions, and runs once per solver:

```sh
rojo sourcemap default.project.json -o sourcemap.json --include-non-scripts
luau-lsp analyze --platform=roblox --definitions:@roblox=globalTypes.d.luau \
  --sourcemap sourcemap.json --ignore "**/Packages/**" src tools/testkit # old solver
luau-lsp analyze --flag:LuauSolverV2=true --platform=roblox --definitions:@roblox=globalTypes.d.luau \
  --sourcemap sourcemap.json --ignore "**/Packages/**" src tools/testkit # new solver
selene src tools                                                         # exit 1 on any warning unless --allow-warnings
stylua --check src tools
lune run tools/test src # prints "tests: N passed, M failed, F files"; exit 1 on a failure or zero tests
```

Why two passes: `luau-lsp analyze` 1.70.1 runs the old solver unless `--flag:LuauSolverV2=true` is
set (tested: a `type function` is a syntax error without the flag and passes with it). Studio's new
solver is the default for `--!nonstrict` and `--!nocheck` scripts since its general release on
2025-11-20, and strict scripts follow `Workspace.UseNewLuauTypeSolver` (DevForum announcements
3155804 and 4084991; Workspace class reference). The scenario-roblox-luau skill gates on both for
the same reason. What each pass alone misses (O22):

| Code                                                          | Old solver | New solver                                          |
| ------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `local y = 5` then `y = "hello"`                              | error      | no error (widens the type)                          |
| `local a: { Vector3 } = table.create(n)`                      | no error   | error (`{unknown}`)                                 |
| `ReplicatedStorage.Shared.Remotez` (typo in an instance path) | no error   | error (`Key 'Remotez' not found`)                   |
| the template with a scripts-only sourcemap                    | no error   | `Key 'Remotes' not found in external type 'Folder'` |

The last row is why the sourcemap step passes `--include-non-scripts`: by default `rojo sourcemap`
lists scripts only, so the new solver does not know the `Remotes` folder built from
`Remotes.model.json`. Unannotated spec callbacks also need `expect: any`: the new solver typed
`expect` from its first call and rejected a second call with another type.

Types flow through Wally's link modules with the sourcemap alone: `s:NotAMethod()` on a
`sleitnick/signal` object failed with `Key 'NotAMethod' not found in table 'Signal<a...>'` (O15). No
`wally-package-types` step is needed with luau-lsp 1.70.1.

Prove it red: copy the project, plant one fault per check, run the gate, and expect exactly that
step to fail.

| Planted fault                                                        | Step that must fail      |
| -------------------------------------------------------------------- | ------------------------ |
| `local n: number = "ten"` in a strict module                         | both luau-lsp steps      |
| `local y = 5` then `y = "hello"`                                     | luau-lsp old solver only |
| `table.create(n)` typed `{ Vector3 }`, or a typo in an instance path | luau-lsp new solver only |
| an unused local                                                      | selene                   |
| `return {a=1}`                                                       | stylua                   |
| a spec expecting 16 instead of 15                                    | Lune tests               |
| `*.spec.luau` removed from the ship globs                            | ShipCheck (`test-code`)  |

Selene fails the gate on any warning: exit 1 unless `--allow-warnings` (selene 0.32.0 `--help`,
tested). Never pass that flag in CI, since it lets every warning through. CJ_Oyer finds Selene
"overzealous" on some rules and relaxes it in the config instead of dropping the linter
(gapG2tH-etI, 00:16:48). [added] The narrowest relaxations, tested with selene 0.32.0 (O27):

```toml
# selene.toml
std = "roblox"

[config]
empty_loop = { comments_count = true }   # a loop body holding only a comment passes; a bare empty loop still warns
```

```luau
local function clamp(x)
	-- selene: allow(shadowing)
	local x = math.clamp(x, 0, 1)
	return x
end
return clamp
```

The inline comment covers the next statement only. Turning a rule off for the whole project
(`[lints]` with `shadowing = "allow"`) also passed, and hides every later hit. Selene 0.32.0
accepted an unknown rule name in `[config]` without an error, and `selene validate-config` did not
flag it either: check that the warning really went away.

Test: O2, O3, O22 and O27. Result: run on 2026-10-19: pass. O27: one `empty_loop` warning gave exit
1, `--allow-warnings` exit 0 with the warning still printed, the relaxed config plus the inline
allow exit 0, and a bare empty loop under the relaxed config exit 1. Gate green in 1.9 s (old solver
1.2 s, new solver 0.7 s, others under 0.05 s each); `tests: 4 passed, 0 failed, 1 files`. Each of
the 8 planted faults failed exactly its own steps and no other. Before the sourcemap flag was added,
the new solver failed the template itself on the row above.

## P3. Lint the Rojo project and Script Sync folders

```python
T.lint_project("arena/default.project.json")               # dev
T.lint_project("arena/ship.project.json", release=True)     # test files must be ignored
T.lint_scriptsync("path/to/synced/folder")                  # one Script Sync root on disk
```

Rules of `lint_project`: `derived-property` (`Position`, `Orientation` or `Rotation` in
`$properties`, `*.meta.json` or `*.model.json`), `missing-path`, `service-path` (a `$path` on a
service without `$ignoreUnknownInstances: true`), `sync-suffix` (`.local.luau` and `.legacy.luau`),
`two-inits`, `bad-meta`, `packages-unmapped`, `dead-localscript` (legacy emit outside Starter
containers), `starter-runcontext`, `test-in-release`, `key-class` (a service or
`StarterPlayerScripts` key outside its home position builds as a Folder, P17), and the infos
`serve-place-ids` and `no-live-sync` (`MeshId` or `HttpEnabled`, P17). Rules of `lint_scriptsync`:
`duplicate-name` (case-insensitive, after removing the Script Sync suffix), `two-inits`, `bad-name`,
`too-many-scripts`, and the info `not-synced`.

Rojo 7.7.1 builds `"Position": [0, 10, 0]` with exit 0 and leaves the part at y 0;
`"Orientation": [0, 90, 0]` is dropped the same way. Write a 12-number CFrame: position, then the
rotation matrix rows.

```json
"Crate": { "$className": "Part", "$properties": { "Anchored": true, "CFrame": [0, 10, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } }
```

Test: O4, O5 and O17. Result: run on 2026-10-18: pass. O17: the Position part built at y 0, the
CFrame part at y 10, the Orientation yaw at 0 degrees instead of 90; `lint_project` flagged both the
project node and the model file. The template has only the `serve-place-ids` info. A bad project
triggered the 7 expected error and warning rules plus the info, and `rojo build` refused it with
exit 1. A bad Script Sync folder triggered `duplicate-name`, `two-inits` and `not-synced`; the
template `src/` is clean.

## P4. Release build and ShipCheck

Goal: a release place with no tests, no dev containers and every required path.

```sh
rojo build ship.project.json -o build/ship.rbxl
lune run tools/ship_check build/ship.rbxl --require ReplicatedStorage.Packages # JSON report, exit 1 on an error
```

The same module runs in Studio on the open place
([ShipCheck.luau](../scripts/agentkit/tooling/ShipCheck.luau)):

```python
r = T.run_kit(studio, "return ShipCheck.run(game, {requirePaths = {'ReplicatedStorage.Packages'}})",
              kit=["ShipCheck"])
```

Rules: `dev-container` (TestKit, DevPackages, TestEZ, Jest), `test-code`, `publish-api-unsupported`
(P10), `package-entry` (below), `sync-suffix`, `package-manifest`, `plugin-script`,
`starter-runcontext`, `asset-require`, `loadstring`, `missing-path`, and the info `empty-script`. On
a DataModel it scans only the services a place file saves, because Studio's CorePackages hold
Roblox's own test modules.

`package-entry`: Distracted Games shows a Wally package (Promise) whose `_Index` folder has no init
module, so `require` through the link module returns nothing; the fix is to require its real entry,
`lib` in his case, or to copy the module (xlxnmAFmu6c, 00:01:44 to 00:02:49). ShipCheck follows
every Wally link module (`_Index["scope_name@x.y.z"]["name"]`, and dependency links inside `_Index`)
and fails when the target is missing or is not a ModuleScript, listing the ModuleScripts it holds:

```
package-entry  ReplicatedStorage.Packages.Broken  resolves to a Folder with no init module, so require fails; require its entry (lib) or copy the module
```

Test: O23 on a planted package `acme/broken` (an `_Index` folder holding only `lib/init.luau`) plus
a dependency link to a package that is not installed. Result: run on 2026-10-19: pass, exit 1 with
exactly those 2 `package-entry` errors and no other rule; the real `sleitnick/signal` 2.0.3 package
gives no finding.

Test: O6 (Lune) and L7 (Studio). Result: run on 2026-10-18: pass. Dev build: `dev-container` and
`test-code`, exit 1; ship build: no findings, exit 0 (15 instances, 3 modules, 2 scripts). Without
the Packages globs: `package-manifest` and `test-code` appear. Run in Studio 0.743 on 2026-10-18:
pass, Studio and Lune gave the same rule counts on the same file (`test-code` 3, `package-manifest`
1, `dev-container` 1); instance counts differ (48 in Studio, 34 in Lune) because Studio adds Camera,
Terrain and runtime children.

## P5. Engine tests in Studio

Goal: run the spec modules in the engine with the exact one-liner CI uses.

```luau
return require(game:GetService("ServerStorage").TestKit.EngineTests)()
```

A spec file works in Lune and in the engine because it requires its subject by string:

```luau
--!strict
local Damage = require("./Damage")

return function(t: any)
	t:test("armor reduces damage", function(expect: any)
		expect(Damage.compute({ base = 20, multiplier = 1, armor = 5 })).toBe(15)
	end)
end
```

```python
with rbx_env.place_slot():
    studio = rbx_env.open_place("tests/places/arena/arena.rbxl")  # once; it stays open
    r = run(studio, 'return require(game:GetService("ServerStorage").TestKit.EngineTests)()')
    assert r["ok"] and r["result"]["failed"] == 0 and r["result"]["total"] > 0
    with Playtest(studio) as pt:                     # same tests on the Server data model
        s = pt.server('return require(game:GetService("ServerStorage").TestKit.EngineTests)()')
```

Name engine-only specs `X.studio.spec.luau`: Lune skips them. A spec that fails to load counts as a
failure ([TestRunner.luau](../scripts/agentkit/tooling/TestRunner.luau)), so a syntax error can
never pass.

Test: L5, L6, L11. Result: run in Studio 0.743 on 2026-10-18: pass. Edit: 5 passed, 0 failed, 2
files in 0.07 s. A planted wrong expectation and a planted syntax error gave 2 failures (one test,
one load error), and 0 again after removal. Server during a playtest: 5 passed, 0 failed.

## P6. Script Sync health

Goal: know from code that sync runs, instead of looking for the red dot on a service.

```python
r = T.run_kit(studio, "return SyncCheck.run(game)", kit=["SyncCheck"])
```

```luau
local svc = game:GetService("InstanceFileSyncService")
local main = game:GetService("ServerScriptService"):FindFirstChild("Main")
return {
	roots = #svc:GetAllInstances(),
	status = if main then svc:GetStatus(main).Name else "missing",
}
```

[SyncCheck.luau](../scripts/agentkit/tooling/SyncCheck.luau) reports `sync-stopped` (status Errored
or AncestorErrored), `too-many-roots` (128), `too-many-scripts` (10,000 per root), `script-metadata`
(attributes or tags on a script), `package-link`, `studio-only` (non-script instances in a synced
folder), `bad-name` and `duplicate-name`. Pass `{roots = {...}}` to run only the tree rules, which
also work in Lune.

Test: O7 (Lune, synthetic tree) and L8 (Studio). Result: run in Studio 0.743 on 2026-10-18: pass.
`InstanceFileSyncService` is readable from `execute_luau`; with nothing linked, `GetAllInstances`
returned 0 roots and `GetStatus` returned NotSynced; `GetSyncedInstance` on an unknown path returned
nil without an error. A probe folder triggered `script-metadata`, `duplicate-name` and
`studio-only`. Linking a folder is a GUI step, so a synced root was not tested.

## P7. Client entry placement check

Goal: confirm which client scripts actually run, in a playtest, before trusting a layout.

```luau
-- Edit data model: probes that count their own runs on the local player
local SPS = game:GetService("StarterPlayer"):FindFirstChildOfClass("StarterPlayerScripts")
local probe = Instance.new("Script")
probe.Name = "ProbeRC"
probe.RunContext = Enum.RunContext.Client
probe.Source = 'local p = game:GetService("Players").LocalPlayer p:SetAttribute("runs", (p:GetAttribute("runs") or 0) + 1)'
probe.Parent = SPS
return probe:GetFullName()
```

Then start a playtest, read `LocalPlayer:GetAttributes()` on the Client data model, stop, and
destroy the probes.

Test: L10 to L12. Result: run in Studio 0.743 on 2026-10-18: pass. The live run indexed
`StarterPlayer.StarterPlayerScripts` directly; the new solver rejects that path when the sourcemap
does not list it, so the snippet now uses `FindFirstChildOfClass` (checked offline on both solvers
in O16, not rerun live).

| Script                                    | Location             | Runs per player           |
| ----------------------------------------- | -------------------- | ------------------------- |
| LocalScript (Rojo default `.client.luau`) | ReplicatedStorage    | 0                         |
| Script, RunContext Client                 | ReplicatedStorage    | 1                         |
| LocalScript                               | StarterPlayerScripts | 1                         |
| Script, RunContext Client                 | StarterPlayerScripts | 2, with an engine warning |

The template's client entry, as a RunContext Client Script, fired the remote and the server logged
one validated hit.

## P8. CI workflows

```python
for wf in ("ci.yml", "publish.yml"):
    r = T.check_workflow(f"arena/.github/workflows/{wf}")
    assert r["ok"], r["findings"]
```

`check_workflow` parses the YAML (PyYAML, or Ruby when PyYAML is missing), runs actionlint when it
is on PATH or in `RBX_ACTIONLINT`, and flags `secret-in-run`, `unpinned-action`, `branch-action`,
`unguarded-publish` (a Published upload outside a protected environment), `fork-secrets`,
`pr-target` and missing `permissions`.

[ci.yml](../scripts/template/.github/workflows/ci.yml) has two jobs. `static` runs on every pull
request with no secrets: toolchain, Wally, sourcemap, type check on both solvers, lint, format, Lune
tests, ship build, ShipCheck and the merge of P15 (exit 2 tolerated there, so a pull request shows
which place needs a Studio release). `engine` runs on pushes and same-repository pull requests in
the `test-universe` environment: dev build uploaded as a Saved version of a test place, then P9.
Both jobs that hold a key run the preflight of P13 first, each with its own `--require-scope` list
(scope table in P13). [publish.yml](../scripts/template/.github/workflows/publish.yml) runs on a
`v*` tag or by hand in the `production` environment; a manual run can set `restart_servers` to run
P14 after the publish.

Test: O8 and O22. Result: run on 2026-10-19: pass. Both workflows parse, have no findings, and
actionlint 1.7.12 exits 0; ci.yml holds the two type steps. A bad workflow triggered 6 rules. Broken
YAML fails. A real GitHub run is not yet run (needs a repository with secrets).

## P9. Engine tests in CI through Open Cloud Luau Execution

```sh
lune run tools/cloud_luau --universe "$U" --place "$P" --version "$V" --expect-tests \
  --script 'return require(game:GetService("ServerStorage").TestKit.EngineTests)()'
```

[cloud_luau.luau](../scripts/template/tools/cloud_luau.luau) posts the task, polls every 2 s, prints
the logs (`view=FLAT`), and exits 1 on FAILED or failing tests, 3 on its own timeout. The key comes
from `ROBLOX_API_KEY` and is never printed. The engine job's key (`ROBLOX_TEST_API_KEY`, test
experience only) holds two scopes: `universe-places:write` for the Saved upload of the dev build
that comes before this step, and `universe.place.luau-execution-session:write` for the task. Reading
the task and its logs accepts `:read` or `:write` (Open Cloud reference), so no third scope is
needed. With the Luau Execution scope alone, the job stops at the upload.

Limits from the Open Cloud reference (LuauExecutionSessionTask), and what the template does about
each:

| Limit                                                                                                       | Template answer                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| At most 10 incomplete tasks per place; creating more returns HTTP 429                                       | `engine` jobs share the concurrency group `engine-tests` (queued, never canceled); `--retries 8` with `--backoff 5` (5, 10, 15 s... capped at 60) |
| Create: 5 per minute per key owner (get 200, logs 45)                                                       | same retry; one key per pipeline                                                                                                                  |
| Results: 4 MB of JSON after serialization, or the task fails                                                | return the TestRunner report (names and errors), not data dumps                                                                                   |
| Logs: last 450 KB kept                                                                                      | failures travel in the report, not only in prints                                                                                                 |
| Default timeout 5 minutes; task info kept 24 hours                                                          | `--timeout 300s`, `--max-wait 420`                                                                                                                |
| No physics; place Scripts and LocalScripts do not run; changes never persist; DataStore calls hit real data | engine specs require their modules; DataStore specs only on a test universe                                                                       |

When every retry gets 429, the script exits 1 with:
`POST still 429 after N tries: 10 tasks of this place are unfinished or the key owner hit 5 creates per minute; queue engine jobs in one concurrency group`.

Test: O9 against a local mock with the response shapes of the public OpenAPI file. Result: run on
2026-10-18: pass. Passing run: exit 0 after one 429 retry, 6 requests, 11 s; failing tests: exit 1;
FAILED task: exit 1; no key: exit 1 with no request. Busy place (3 answers of 429, the 10-task
limit): exit 0 after 3 retries. Place that stays busy: exit 1 after 4 creates with the message
above. Against the real API: not yet run, because it needs an Open Cloud API key and an uploaded
place.

## P10. Two-phase publish of every place

```sh
lune run tools/publish --manifest places.json # phase 1 only: Saved versions
ROBLOX_PUBLISH_LIVE=1 lune run tools/publish --manifest places.json --published
```

Phase 1 uploads every place as Saved. Phase 2 promotes them to Published only after every upload
succeeded, and only with `--published` plus `ROBLOX_PUBLISH_LIVE=1`, which only the approved release
job sets. Content type follows the extension (`.rbxl` binary, `.rbxlx` XML). `--dry-run` prints the
requests.

What the API leaves out: the place publishing guide says the API "doesn't update" EditableImage,
EditableMesh, PartOperation, SurfaceAppearance or BaseWrap instances, and to "publish from Studio
after modifying them". For a release built from Rojo files this means:

- ShipCheck warns `publish-api-unsupported` for each such instance in the build (PartOperation
  covers UnionOperation, NegateOperation and IntersectOperation; BaseWrap covers WrapLayer,
  WrapTarget and WrapDeformer).
- `merge_place` (P15) stops with exit 2 when the place that ships holds any of them [added]: a place
  file cannot show whether they changed since the last Studio publish. The guide's wording suggests
  unchanged ones are safe; that was not tested.
- The whole run then stops before any upload, because all places ship together. A person opens the
  merged files (the `merged-places` artifact) in Studio and publishes them. Record it in the release
  notes.
- Rojo cannot live-sync CSG either (Rojo sync details), so such content usually lives in a base
  place edited in Studio.

### The release job, whole

This is [publish.yml](../scripts/template/.github/workflows/publish.yml) as the template ships it.
Nothing is left out: the ids come from `places.json`, the key from the `production` environment, and
every tool from `rokit.toml`.

```yaml
name: publish

# Release job: builds the code, merges it into each place's base place (places.json), checks, then
# uploads every place as Saved and promotes all of them to Published. Only this job publishes.
# Needs: secret ROBLOX_PUBLISH_API_KEY in the protected "production" environment, with the scopes
# universe-places:write (uploads, production experience), universe:write (restart_servers only) and
# universe.place:read (stale base check, builders' experience, only when places.json has "buildPlace").
# Ids live in places.json, base places in assets/.

on:
  workflow_dispatch:
    inputs:
      restart_servers:
        description: "Restart outdated servers after publishing (10-minute bleed-off)"
        type: boolean
        default: false
  push:
    tags: ["v*"]

permissions:
  contents: read

concurrency:
  group: publish
  cancel-in-progress: false

env:
  ROKIT_URL: https://github.com/rojo-rbx/rokit/releases/download/v1.2.0/rokit-1.2.0-linux-x86_64.zip

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - name: Install the toolchain pinned in rokit.toml
        run: |
          curl -sSfL -o "$RUNNER_TEMP/rokit.zip" "$ROKIT_URL"
          unzip -q "$RUNNER_TEMP/rokit.zip" -d "$RUNNER_TEMP/rokit"
          "$RUNNER_TEMP/rokit/rokit" install --no-trust-check
          echo "$HOME/.rokit/bin" >> "$GITHUB_PATH"
      - name: Check the API key and the scopes this run uses (auto-expires after 60 days unused)
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_PUBLISH_API_KEY }}
          RESTART: ${{ github.event_name == 'workflow_dispatch' && inputs.restart_servers }}
        run: |
          args=(--require-scope universe-places:write)
          if [ "$RESTART" = "true" ]; then args+=(--require-scope universe:write); fi
          if jq -e 'any(.places[]; .buildPlace)' places.json > /dev/null; then
            args+=(--require-scope universe.place:read)
          fi
          lune run tools/check_key "${args[@]}"
      - run: wally install
      - name: Build the code, refuse stale base places, merge, ShipCheck
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_PUBLISH_API_KEY }}
        run: |
          mkdir -p build
          lune run tools/place_versions --manifest places.json --out build/live_versions.json
          rojo build ship.project.json -o build/ship.rbxl
          lune run tools/merge_place --manifest places.json --live-versions build/live_versions.json
      - name: Hand the merged places to a person (exit 2 = publish that place from Studio)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: merged-places
          path: build/*.rbxl
      - name: Saved versions of every place, then Published
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_PUBLISH_API_KEY }}
          ROBLOX_PUBLISH_LIVE: "1"
        run: lune run tools/publish --manifest places.json --published
      - name: Restart outdated servers
        if: github.event_name == 'workflow_dispatch' && inputs.restart_servers
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_PUBLISH_API_KEY }}
          ROBLOX_RESTART_LIVE: "1"
        run:
          lune run tools/restart_servers --universe "$(jq -r '.universe' places.json)"
          --bleed-off-minutes 10
```

What it needs before the first run:

- Secret `ROBLOX_PUBLISH_API_KEY` in a GitHub environment named `production` with required
  reviewers. Its scopes (P13): `universe-places:write` on the production experience;
  `universe:write` when the restart input is used; `universe.place:read` on the builders' experience
  when `places.json` names a `buildPlace`. The key check step requires exactly the scopes the run
  uses.
- `places.json` with real ids and, per place, the builders' base place (P15). A two-place game:

```json
{
  "universe": 1234567890,
  "places": [
    {
      "name": "start",
      "place": 111111111,
      "base": "assets/start.rbxl",
      "code": "build/ship.rbxl",
      "file": "build/start.rbxl",
      "buildPlace": 333333333,
      "baseVersion": 57
    },
    {
      "name": "arena",
      "place": 222222222,
      "base": "assets/arena.rbxl",
      "code": "build/ship.rbxl",
      "file": "build/arena.rbxl",
      "buildPlace": 444444444,
      "baseVersion": 12
    }
  ]
}
```

- Base places committed under `assets/` (Git LFS when they are large [added]; the checkout step has
  `lfs: true`). A place without `base` ships the code build alone.
- Both places here share one code build. A place with its own project file gets its own
  `rojo build <project> -o <code>` line in the build step and its own `"project"` and `"code"`
  fields.

Order of a run: key check, the newest Version History number of each builders' place
(`place_versions`), build, stale base check plus merge plus ShipCheck for every place
(`merge_place --manifest --live-versions`), Saved upload of every place, Published promotion of
every place, optional restart. Any failure before the uploads stops the run with nothing uploaded.
When the merge exits 2, the merged files are attached to the run as the `merged-places` artifact for
a person to publish from Studio.

Test: O10 and O20. Result: run on 2026-10-18: pass. O20: a Lune tree with a UnionOperation, a
SurfaceAppearance and a WrapLayer gave 3 `publish-api-unsupported` warnings, none for a plain Part.
O10: Two places: Saved, Saved; with the flag: Saved, Saved, Published, Published in that order;
`--published` without `ROBLOX_PUBLISH_LIVE` sent 0 requests; a failed second upload stopped before
any Published request. Against the real API: not yet run, because agents never publish.

## P11. Undo-safe edits from a plugin or an agent

```luau
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local id = ChangeHistoryService:TryBeginRecording("Rename parts")
for _, part in workspace:GetDescendants() do
	if part:IsA("BasePart") and part.Name == "Part" then
		part.Name = "Block"
	end
end
if id then
	ChangeHistoryService:FinishRecording(id, Enum.FinishRecordingOperation.Commit)
end
```

`TryBeginRecording` returns nil when another recording is open: always guard `FinishRecording`.

Test: L9. Result: run in Studio 0.743 on 2026-10-18: pass. Through `execute_luau`,
`TryBeginRecording` returned nil, yet `Undo` in the same chunk removed the new part and `Redo`
restored it. This is consistent with the plugins guide, which says the command bar wraps its
commands in recordings. Through the Studio command line it returned an id (P12 runs). Plugin
packaging (Save as Local Plugin) is a GUI step: see [gui-paths.md](gui-paths.md).

## P12. Studio command line on a CI Mac (RunScript)

Two subjects with different properties. Name the subject in every claim:

|                          | `RobloxStudio --task RunScript` itself                                                                                                                              | the lead's wrapper `rbx_run.run_headless`                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Live runs                | 4, in Studio 0.743 on 2026-10-18, before the coordinator stopped them                                                                                               | none yet; live run pending on a dedicated CI Mac. Its output parser is tested on a recorded file (O12) |
| A Studio is already open | RunScript does not check. On macOS the launch hands off to the open Studio, opens the place there and closes that window at quit (it closed the user's window once) | the wrapper refuses to start while any RobloxStudio process runs                                       |
| Exit code                | 0 even on a runtime error                                                                                                                                           | the wrapper ignores it and parses a result marker                                                      |
| Time                     | 6.0 s per run with `--quitAfterExecution`                                                                                                                           | not measured (no live run)                                                                             |

Use the wrapper, never a hand-written launch:

```python
from rbx_run import run_headless
r = run_headless("build/dev.rbxl", 'return require(game:GetService("ServerStorage").TestKit.EngineTests)()')
```

The wrapper runs
`RobloxStudio --task RunScript --localPlaceFile <place> --runScriptFile <chunk> --outputFile <log> --quitAfterExecution`,
then parses the marker.

Test: O12 (the wrapper's parser on the recorded output). Result of the 4 manual RunScript runs on
2026-10-18: 6.0 s per run, exit code 0 even on a runtime error, output file starts with the echoed
script; `task.wait` honored; `RunService:Run()` ran physics (a part fell from y 50 to 10.6 in 2 s).
Without `--quitAfterExecution` the output file stayed empty. RunScript runs since then: none, by
rule.

## P13. API keys: scopes per job, team setup, preflight

One key per job, each with only the scopes its calls need. The API keys guide recommends separate
keys per application and the minimum permissions, limited to the experiences needed. Scope names
below are the exact strings of the Open Cloud reference (`openapi.json`, `x-roblox-scopes` of each
endpoint); a scope string is the scope name, a colon, and the operation.

| Job (secret)                                 | Calls                                                                                                | Scopes                                                                                               | Restrict to               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------- |
| ci.yml `static`                              | none                                                                                                 | no key                                                                                               |                           |
| ci.yml `engine` (`ROBLOX_TEST_API_KEY`)      | Saved upload of the dev build: `POST /universes/v1/{universeId}/places/{placeId}/versions` (beta)    | `universe-places:write`                                                                              | the test experience       |
| same key                                     | Luau Execution: create the task (`POST .../luau-execution-session-tasks`), then read it and its logs | `universe.place.luau-execution-session:write` (the reads accept `:read` or `:write`)                 | the test experience       |
| publish.yml (`ROBLOX_PUBLISH_API_KEY`)       | Saved, then Published uploads of every place                                                         | `universe-places:write`                                                                              | the production experience |
| same key, restart input set                  | `POST /cloud/v2/universes/{universe_id}:restartServers` (P14)                                        | `universe:write`                                                                                     | the production experience |
| same key, `places.json` names a `buildPlace` | `GET /place-version-history-api/v1/{placeId}/history` (experimental, P15)                            | `universe.place:read`                                                                                | the builders' experience  |
| `check_key`, in every job with a key         | `POST /api-keys/v1/introspect`                                                                       | none extra: the API keys guide documents it with no scope, and the endpoint is not in `openapi.json` |                           |

The template's preflight calls require exactly these:

```sh
# ci.yml, engine job
lune run tools/check_key --require-scope universe-places:write \
  --require-scope universe.place.luau-execution-session:write
# publish.yml: universe-places:write, plus universe:write when restarting,
# plus universe.place:read when places.json names a buildPlace
lune run tools/check_key --require-scope universe-places:write --require-scope universe:write --require-scope universe.place:read
```

In the dashboard, the guide's steps are: **Create API Key**, then in **Access Permissions** pick an
API from **Select API System**, the experience, and the operations ([gui-paths.md](gui-paths.md)).
The guide's own example name for a publishing key is `PLACE_PUBLISHING_KEY`.

### Team key setup (group-owned experience)

From the API keys guide, section "Create API keys for managing group-owned resources":

1. A key can reach everything its owner can, including that person's own games. So the guide
   "strongly recommend[s]" a dedicated alternate account for group automation.
2. Create that account, invite it to the group, and give it a group role with only the permissions
   its task needs.
3. Log in as that account and create the keys there (test key and publish key, one per job).
   Restrict each scope to its experience wherever the scope offers it (the guide: some scopes can be
   restricted to specific games, not all).
4. IP: if you have no fixed IP, the guide says to leave **Restrict IP addresses** unchecked.
   GitHub-hosted runner IPs change: CJ_Oyer's CI publish failed on an IP-restricted key, and his
   workaround patched the runner IP into the key before each publish (gapG2tH-etI, 00:38:26 to
   00:38:58). The optional toggle makes that workaround unnecessary. [added] Keep the IP restriction
   only for a self-hosted runner with a fixed address.
5. Store each key as a GitHub environment secret: `test-universe` for the test key, `production`
   with required reviewers for the publish key.

Status changes the preflight reports (API keys guide, "API key status"): Disabled, Expired,
Auto-Expired after 60 days without use or update, and Revoked, which happens to group keys when the
generating account loses permission to manage the group's keys (fix: **Regenerate Key**). Removing
the automation account from its group role therefore stops the pipeline.

### Preflight

Run first in every job that holds a key:

```sh
ROBLOX_API_KEY=... lune run tools/check_key [--require-scope [--warn-days 7] <name >: <operation >...]
```

[check_key.luau](../scripts/template/tools/check_key.luau) posts `{"apiKey": ...}` to
`https://apis.roblox.com/api-keys/v1/introspect` (API keys guide) and reads `enabled`, `expired`,
`expirationTimeUtc` and `scopes`. The guide's example answer gives each scope as a `name` plus a
list of `operations` (`{"name": "asset", "operations": ["write"]}`); the script joins them into
`asset:write`, so `--require-scope universe-places:write` matches a scope named `universe-places`
with the `write` operation, and a bare name matches any operation. It fails with the fix:

| Answer                      | Message and fix                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `expired: true`             | keys unused for 60 days auto-expire even without an expiry date: turn Enable Key off and on, or edit the key, or set a new expiry |
| `enabled: false`            | Creator Dashboard > API Keys > turn on Enable Key                                                                                 |
| non-200                     | `introspect returned <status>`: wrong or revoked secret                                                                           |
| a required scope missing    | `lacks the scope universe-places:write`: edit the key's Access Permissions                                                        |
| expiry within `--warn-days` | warning, exit 0                                                                                                                   |

The guide also says introspection checks whether the key may be used from the caller's IP address
and whether it is moderated. The key is never printed.

Test: O18 against the mock, whose introspect answer has the guide's shape. Result: run on
2026-10-19: pass. ok: exit 0; expired, disabled and rejected keys: exit 1 with the messages above;
no key: exit 1 with no request; a key expiring in 2 days: warning, exit 0. Scopes: an engine key
holding only `universe.place.luau-execution-session:write` failed the engine job's check with
`lacks the scope universe-places:write`, and passed once `universe-places:write` was added;
`universe-places` with only `read` failed `universe-places:write`; the publish key passed
`universe-places:write` plus `universe:write`, and a bare `universe-places`. Against the real
endpoint: not yet run (no key on this machine), so the joined names rest on the guide's example
answer.

## P14. Restart servers after a release

```sh
ROBLOX_RESTART_LIVE=1 lune run tools/restart_servers --universe "$U" [--places P1,P2] [--all-versions] [--bleed-off-minutes 10]
```

[restart_servers.luau](../scripts/template/tools/restart_servers.luau) calls
`POST https://apis.roblox.com/cloud/v2/universes/{universe_id}:restartServers` (Open Cloud
reference, stable, scope `universe:write`, 30 calls per minute). Body fields:

| Field                     | Template default  | Meaning                                                   |
| ------------------------- | ----------------- | --------------------------------------------------------- |
| `placeIds`                | all active places | places to restart                                         |
| `closeAllVersions`        | false             | false: only servers on an outdated version                |
| `bleedOffServers`         | true              | matchmaking stops, servers stay up for the bleed-off time |
| `bleedOffDurationMinutes` | 10                | 1 to 60                                                   |

The "Update games" guide recommends restarting only outdated servers; players are then teleported to
the new version, all players of one old server to the same new server. Servers get
`DataModel.ServerRestartScheduled` when the restart is delayed. The same action exists in the
dashboard (see [gui-paths.md](gui-paths.md)). In the template, publish.yml restarts only on a manual
run with `restart_servers` set; the key check of that run then also requires `universe:write` (P13).

Test: O19 against the mock. Result: run on 2026-10-18: pass. `--dry-run` body
`{"closeAllVersions": false, "bleedOffServers": true, "bleedOffDurationMinutes": 10}` with no
request; without `ROBLOX_RESTART_LIVE` exit 1 with no request; with it,
`--places 301,302 --bleed-off-minutes 0` posted
`{"closeAllVersions": false, "bleedOffServers": false, "placeIds": [301, 302]}` to
`/cloud/v2/universes/111:restartServers`. Against the real API: not yet run (agents never restart
live servers).

## P15. Put the builders' map into the release

Goal: the place that ships holds the builders' map and the repository's code. A Rojo build of
`ship.project.json` holds only the code, so uploading it alone would replace the map with an empty
Workspace.

Rojo cannot live-sync Terrain, CSG or `MeshPart.MeshId`, and points to `.rbxm` and `.rbxmx` model
files for binary content (Rojo sync details). Distracted Games keeps non-script instances in Studio
only (Zhl_NAPMztY, 00:26:43); MonzterDEV saves them as `.rbxmx` into the synced folder (18-cGOjfrKw,
00:21:30 to 00:23:07). CJ_Oyer builds every place from the repository (00:42:51) and pre-bakes maps
per place (00:30:19 to 00:35:18). Two ways follow from that:

|                    | Option A: the map as model files                                                                                                                        | Option B: merge a base place                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Builders hand over | `Map.rbxmx` (right-click > Save to File), committed by pull request                                                                                     | the whole build place: **File** > **Save to File** to `assets/<place>.rbxl` |
| Project            | `"Workspace": {"Map": {"$path": "assets/Map.rbxmx"}, "Terrain": {"$path": "assets/Terrain.rbxm"}}` (the Terrain line is the Rojo project docs' example) | unchanged; the merge reads it                                               |
| Release file       | `rojo build` alone                                                                                                                                      | `rojo build`, then `tools/merge_place`                                      |
| Fits [added]       | maps that change rarely or are generated by script                                                                                                      | builders who edit daily in Team Create                                      |

How to export Terrain to a `.rbxm` from Studio is not in the sources; option B carries Terrain
inside the place file.

Option B, one place or every place of `places.json`:

```sh
rojo build ship.project.json -o build/ship.rbxl
lune run tools/merge_place --base assets/start.rbxl --code build/ship.rbxl --out build/start.rbxl
lune run tools/merge_place --manifest places.json # what publish.yml runs
python3 scripts/rbx_tooling.py merge places.json <repo >--manifest
```

A repository this skill did not scaffold has no `tools/merge_place.luau`. There,
`T.merge_place(repo, base=..., code=..., out=..., project="default.project.json")` runs the
template's script with its ShipCheck from a temporary folder; every path still resolves against
`repo`. Result (Lune 0.11.0, Rojo 7.7.1, a repository with no `tools/`): exit 0, the base place's
map and the repository's script both in the merged place.

[merge_place.luau](../scripts/template/tools/merge_place.luau) reads the project file to know what
the repository owns:

| Project node                                                                            | In the release place                                |
| --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| child of a service with `$path` or `$className` (`ReplicatedStorage.Shared`)            | the build's instance; the base copy is dropped      |
| service with `$path`                                                                    | the build's children replace all of the base's      |
| service without `$path`                                                                 | the base's, plus any `$properties` the project sets |
| anything the project does not name (Workspace, Terrain, Lighting, ServerStorage assets) | the base's, unchanged                               |

Its JSON report lists `replaced`, `added`, `removed`, `dropped` (non-script instances lost with a
replaced base copy, so builders' work never disappears silently), `baseScripts` (scripts outside
project nodes: they ship unreviewed, so move them into the repository) and `unsupported`. Then it
runs ShipCheck on the merged place, with every owned path required.

Exit codes: 0 merged and ShipCheck ok; 1 bad input or a ShipCheck error; 2 the place holds
EditableImage, EditableMesh, PartOperation, SurfaceAppearance or BaseWrap instances. On 2 the file
is still written, with the message
`... publish it from Studio (open it, File > Publish to Roblox); the pipeline does not upload it`.
The same check runs on a code-only place, so option A model files with a union stop the same way.

Also in the sources, not tested here (needs a real key): the Asset Delivery API
(`GET /asset-delivery-api/v1/assetId/{assetId}`, scope `legacy-asset:manage`, "All asset types are
supported") could fetch the latest place instead of a committed file. Whether it returns the latest
Team Create save is not documented.

Test: O21, on a base place built in Lune: a Map model with 3 rotated platforms and a SpawnLocation,
Terrain with a 4,096-byte synthetic voxel blob (not Studio terrain), Lighting ClockTime 6.5, a stale
`Shared.Damage`, a builder's RemoteEvent in `Shared`, a door Script in the map and a ServerStorage
asset folder. Result: run on 2026-10-19: pass.

- Merge: exit 0; replaced `ReplicatedStorage.Shared` and `ServerScriptService.Server`, added
  `Client` and `Packages`. The map kept 4 parts at the same positions and yaw (30, 60, 90 degrees),
  the Terrain blob (same length and checksum), ClockTime 6.5 and the asset folder. `Damage` equals
  the repository file; `dropped` named the RemoteEvent and `baseScripts` the door script; ShipCheck
  had no findings.
- A UnionOperation in the base: exit 2 with the Studio message, file written. Missing base: exit 1
  naming File > Save to File.
- Manifest with two places: merged 10,636 bytes and code-only 7,310 bytes, and the mock received
  exactly those Saved uploads. A third place with a union: exit 2 for the run.
- Option A: `Map.rbxmx` and `Terrain.rbxm` built by Rojo 7.7.1 kept the same 4 parts, yaw and blob
  checksum; with a union inside `Map.rbxmx`, exit 2.

### Refuse a stale base place

A base copy saved before the builders' last edits ships the old map: the merge keeps whatever the
file holds, so work saved in Team Create after the copy disappears from the release without any
error. During a collaborative session Studio auto-saves to the cloud every four minutes
(collaboration docs), so the build place moves on as long as anyone edits.

Handing the place over [added, built on the docs' GUI paths]:

1. Ask everyone to leave the session, or check nobody else is editing.
2. **File** > **Save to Roblox with Notes**, name it, for example `release base v1.4` (Version
   History docs).
3. **Window** > **Version History**: note the number of that save, the newest row.
4. **File** > **Save to File**, into the repository as `assets/<place>.rbxl` (coding harness
   tutorial).
5. In `places.json`, set that place's `"buildPlace"` (the Team Create place id) and `"baseVersion"`
   (the number from step 3), and open a pull request with both files.

At release, publish.yml runs [place_versions.luau](../scripts/template/tools/place_versions.luau),
which reads the newest version number of every `buildPlace` through
`GET /place-version-history-api/v1/{placeId}/history` (Open Cloud reference: scope
`universe.place:read`, marked experimental, 120 calls per minute per key owner). The reference does
not say how pages are sorted, so the script reads every page and keeps the highest number. Then
`merge_place --live-versions build/live_versions.json` refuses, with exit 1 and no file written:

- a base whose `baseVersion` is older than the newest version:
  `start: assets/start.rbxl was saved at version 41 but build place 901 is at version 44. Builders saved work after this copy; merging it would ship the old map. Save the place again (File > Save to File) and set "baseVersion" to 44`;
- a base place with a `buildPlace` but no `baseVersion`;
- a `baseVersion` newer than the newest version (a typo).

Each report carries a `freshness` line: `checked: base at version 44, build place at 44`,
`not checked: ...` (no `buildPlace`, or no `--live-versions`, as in the `static` job, which holds no
key), or `n/a: code-only place`. Without a key, a person makes the same check by eye: the newest row
in **Window** > **Version History** of the build place, or Creator Dashboard > the experience >
**Configurations** > **Places** > the place > **Version History** (Version History docs), must equal
`baseVersion`.

Two cautions:

- Restoring a version creates a new version and does not publish it (Version History docs).
  Reverting while others edit is unsafe; see P16.
- When the build place and the production place are one place, a pipeline publish while builders
  still edit may race with their auto-saves. The docs say so for reverts only, so for an Open Cloud
  upload this is an untested inference [added]. Close the session before a release; a Studio publish
  over a place others still have open fails (P16).

Test: O26 against the mock, with history pages of 2 versions served out of order (39, 44, 41, 40,
42). Result: run on 2026-10-19: pass. `place_versions` read 3 pages and wrote `{"start": 44}`; a
base at version 41: exit 1 with the message above and no merged file; no `baseVersion`: exit 1;
`baseVersion` 44: exit 0, `freshness` "checked", and the code-only lobby place "n/a"; no
`--live-versions`: exit 0, "not checked"; a key without access (403): `place_versions` exit 1.
Against the real endpoint: not yet run (no key), so its paging fields rest on the reference schema.

## P16. Team process: builders, scripters, pipeline

Goal: people edit in parallel without overwriting each other, and only reviewed code and a checked
map reach players.

| Role      | Works in                                            | Never                                       |
| --------- | --------------------------------------------------- | ------------------------------------------- |
| Builders  | Studio, Team Create, on a build experience          | publish the production experience           |
| Scripters | the repository (Rojo or Script Sync), pull requests | edit the same synced script as someone else |
| Pipeline  | publish.yml with the production key                 | run without a passing gate                  |

Sourced rules:

- Script Sync works with Team Create, "which third-party tools often do not" (Script Sync docs).
  Rojo live sync deletes instances under a `$path` node that are not on disk when it reconnects
  (Zhl_NAPMztY, 00:44:28): [added] serve Rojo into a solo place or a local file, not into the shared
  session.
- One owner per synced script: the docs say to avoid several people syncing the same script and
  editing the files at once, because "collaborators can overwrite each other's changes". Studio
  marks instances a collaborator is syncing with an icon and adds a numeric suffix to new duplicate
  names.
- Only the pipeline publishes: developers get repository access, builders cannot publish by accident
  (CJ_Oyer, 00:22:44); skip this only when working alone (00:46:42). Edit permission can be given
  per experience in **Manage Collaborators** (collaboration docs). [added] Give builders Edit on the
  build experience only and keep the publish key on production only.
- Reverting a version while others edit is unsafe: their auto-save (every 4 minutes) may overwrite
  it; disable Team Create first (collaboration docs). Publishing over a place that collaborators
  still have open fails in Studio (Roblox Learn, sU9nTX0JFyY, 00:00:48).
- Shared code comes from Wally, so nobody edits a copy of a package in one game (CJ_Oyer, 00:24:57).
  Shared builder models can be Roblox Packages (sU9nTX0JFyY, 00:01:12).
- Agents: check the Team Create state before bulk MCP edits, since edits reach every collaborator
  live [added]. An Open Cloud endpoint lists the members of a place's active Team Create session
  (`GET /legacy-develop/v1/places/{placeId}/teamcreate/active_session/members`, scope
  `legacy-team-collaboration:manage`, marked experimental); not tested here.

Release rhythm [added]: a builder saves the build place to `assets/<place>.rbxl`, records its
Version History number as `baseVersion` (P15, "Refuse a stale base place") and opens a pull request.
The `static` job merges it, so ShipCheck findings, `baseScripts` and Studio-only content show up
before the release. Then a tag runs publish.yml.

The official harness tutorial ignores place files in Git (its `.gitignore` excludes `.rbxlx`). A
committed base place is a deliberate exception for option B: keep it in Git LFS and out of review
diffs.

Test: none for the human process itself. The merge on pull requests is O21 plus the `static` job in
O8.

## P17. `rojo serve` in a team

Goal: live sync from files never loses Studio work or leaves Studio on stale values. Scripters serve
into their own place or local file, not into the shared Team Create session (P16).

| Trap                                                                                             | Source                                                | Fix                                                                                                                                                                                    | Checked by                                                                |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Editing the project file while `rojo serve` runs                                                 | Distracted Games (Zhl_NAPMztY, 00:37:52)              | stop `rojo serve` and disconnect the plugin first, then restart both                                                                                                                   | GUI only ([gui-paths.md](gui-paths.md))                                   |
| Reconnecting deletes instances under a `$path` node that are not on disk                         | Zhl_NAPMztY 00:44:28; MonzterDEV 18-cGOjfrKw 00:19:52 | `$ignoreUnknownInstances: true`, a child folder, or `.rbxmx` files                                                                                                                     | `service-path` lint                                                       |
| A blank `init.meta.json`                                                                         | MonzterDEV 00:20:24                                   | write valid JSON                                                                                                                                                                       | `bad-meta` lint; `rojo build` exit 1, "File contains no JSON value" (O24) |
| The key name sets the class only in its home position                                            | tested                                                | a service name directly under DataModel, `StarterPlayerScripts` or `StarterCharacterScripts` under StarterPlayer, `Terrain` under Workspace; the same names elsewhere build as Folders | `key-class` lint (O24)                                                    |
| `MeshPart.MeshId` and `HttpService.HttpEnabled` do not live-sync, nor Terrain or CSG binary data | Rojo sync details, Limitations                        | build the place file and reopen it after changing them                                                                                                                                 | `no-live-sync` info (O24)                                                 |

What a build does carry (O24, Rojo 7.7.1): `"HttpEnabled": true` on HttpService arrives in the
place; `"MeshId": "rbxassetid://123"` in a `.model.json` arrives as the `MeshContent` property. That
live sync skips them is from the Rojo docs; it was not reproduced here, since `rojo serve` needs
Studio.

Test: O24. Result: run on 2026-10-19: pass. `StarterPlayerScripts` under StarterPlayer built as
StarterPlayerScripts; `StarterPlayerScripts` and `Lighting` under ReplicatedStorage built as
Folders; lint flagged exactly those two keys and the two `no-live-sync` properties; a blank
`init.meta.json` gave `bad-meta` and Rojo exit 1.

## P18. Attach the agent to the right place before engine tests

Goal: engine tests run in the dev place this run opened, never in another window such as the user's
game.

Every Studio MCP call carries a `studio_id`; `list_roblox_studios` lists the open windows with name,
studio id and place id, and two windows with the same name are told apart by place id (Studio MCP
docs). The lead's `Studio(place=...)` binds by place name and fills `studio_id` on every call: see
the lead's [procedures](../../scenario-roblox-expert/references/procedures.md), "Own one place for
the whole run" and `rbx_mcp.py`. On top of that binding, check the target:

```python
with rbx_env.place_slot():
    s = rbx_env.open_place("build/dev.rbxl")       # the lead's binding; keep the window open
    t = T.check_target(s, allowed_place_ids=(0,))   # 0: a local file never published
    assert t["ok"], t["reason"]
```

[rbx_tooling.check_target](../scripts/rbx_tooling.py) lists windows (`list_roblox_studios`), binds,
stops when two windows carry the wanted name, then reads `game.PlaceId` in Edit. It passes only for
an allowed id: 0 for a local file, or the test place id. The production place id never goes in the
list.

Permission prompts: Claude Code asks once per Studio tool, with an option "Yes, allow
mcp__Roblox_Studio__<tool> for this project" (Roblox Learn, v8r1d80DxOY, 00:02:37 to 00:03:15). The
coding harness tutorial says to approve or allowlist the tools once, otherwise the agent stalls on
each call. To set it ahead of an unattended run [added], commit the list to the project's
`.claude/settings.json` (Claude Code permissions format; the prefix follows the server name in the
agent's MCP config):

```json
{
  "permissions": {
    "allow": [
      "mcp__Roblox_Studio__list_roblox_studios",
      "mcp__Roblox_Studio__execute_luau",
      "mcp__Roblox_Studio__start_stop_play",
      "mcp__Roblox_Studio__search_game_tree",
      "mcp__Roblox_Studio__inspect_instance"
    ]
  }
}
```

Allow only the tools the run uses; `execute_luau` edits whatever place it is bound to, so the check
above comes first.

Test: O25 with a fake session (no Studio). Result: run on 2026-10-19: pass. A dev window next to
`base_AutoRecovery_0.rbxl` bound to the dev window with place 0: ok. Place 987654321 not in the
list: stop, "not a test place"; with it in the list: ok. Two windows named `arena-dev.rbxl`: stop
before any Luau ran. No Studio: stop, "bind failed". Live: not run in this round (offline only).
