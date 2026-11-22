---
name: scenario-roblox-tooling
description: "Use when setting up or repairing a Roblox team project outside Studio: Rojo or Script Sync, Wally packages, Rokit pins, luau-lsp type checking, Selene, StyLua, unit tests in Lune or the engine, GitHub Actions CI on pull requests, Open Cloud place publishing, Luau Execution or API key scopes, merging builders' Team Create map with code from files, Studio plugins, or proving a pipeline works. Also when users say \"set up Rojo\", \"CI for my Roblox game\", \"run tests in CI\", \"publish from GitHub\", \"Script Sync stopped syncing\", \"Rojo deleted my parts\", \"wally packages not found\", \"luau-lsp can't find ReplicatedStorage\", \"selene errors on types\", \"the release wiped the map\" or \"my LocalScript doesn't run\"."
license: MIT
---

# Roblox Tooling and Build Pipeline

Target line: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert level here means a repository that rebuilds every place from empty, a gate seen failing
before it is trusted, and one spec format for Lune and the engine. Only an approved release job
publishes.

If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **Build the place from the repository.** Never publish a dev place edited by hand: a deleted
   object would ship silently (CJ_Oyer, Connect 2023, 00:42:51).
2. **The gate exists to fail.** Type and lint errors block the publish; that catches the typo class
   of bugs, "90 percent" in his words, not design bugs, so keep a playtest before big releases
   (CJ_Oyer 00:12:50 to 00:13:55). [added] Plant one fault per check and watch exactly that step
   turn red before trusting green.
3. **Only the pipeline publishes, all places together.** People and agents get repository access
   (CJ_Oyer 00:22:44). An old place reading a newer DataStore shape errors, so every place ships in
   one run (00:26:27). [added] Upload all places as Saved first, then promote all to Published.
4. **One sync tool per folder.** Script Sync suits code-only, Studio-centric teams; Rojo suits
   whole-project builds, Wally and CI (Distracted Games, 2026; Script Sync docs). Rojo can still run
   beside Script Sync as a sourcemap generator only (xlxnmAFmu6c 00:12:57).
5. **Packages are code you ship.** Wally packages can arrive mis-packaged, with no entry module;
   require the real entry (`lib`) or copy the module (xlxnmAFmu6c 00:01:44). ShipCheck
   `package-entry` fails on such a package.
6. **One spec format, two runtimes.** [added] A spec requires its subject by string
   (`require("./Damage")`), so the same file runs under `lune run` and in Studio or Open Cloud. Pure
   logic runs in Lune in milliseconds; engine facts run in the engine.
7. **Verify by code, not by eye.** The official setup video has the agent touch every synced folder,
   read `InstanceFileSyncService:GetStatus` and playtest before any commit (Roblox Learn, 2026,
   02:45 to 03:34). Script Sync can stop silently (SmartyRBX, 00:12:19): poll status.
8. **Typed Luau for agents.** roblox-ts loses Studio editing, Luau line numbers and fast API typings
   (Adam, Last Level Studios, 00:06:01); agents driving Studio through MCP stay on strict Luau.

## Establish first

- **Sync tool in use:** a `*.project.json` (Rojo) or Script Sync links
  (`InstanceFileSyncService:GetAllInstances()` not empty). Never add the second one on the same
  folder.
- **Who owns the map:** Rojo cannot live-sync Terrain, CSG or `MeshPart.MeshId`, so builders' work
  reaches the release as `.rbxmx` files in the project or as a base place merged with the code build
  (P15).
- **Who edits what:** builders in Team Create on a build experience; scripters in the repository,
  one owner per synced script, since two people syncing one script overwrite each other (Script Sync
  docs); only the release job holds the production key (P16).
- **Places of the experience:** universe id, place ids, start place. They go in `places.json`.
- **CI host and keys:** GitHub Actions by default. The user creates every key; an agent never
  creates, prints or stores one. One key per job, only its scopes (table below); for a group
  experience, keys on a dedicated account with a minimal group role; IP restriction off for
  GitHub-hosted runners, whose IPs change (API keys guide; CJ_Oyer 00:38:26).
- **A test universe** separate from production for engine tests [added]: Luau Execution DataStore
  calls hit real data.
- **Defaults when unstated:** the template below, `emitLegacyScripts: false`, client entry as a
  RunContext Client Script in `ReplicatedStorage.Client`, strict mode, tabs.

## Procedure

Full code, tests and results: [procedures.md](references/procedures.md). Runner script:
[rbx_tooling.py](scripts/rbx_tooling.py).

1. **Scaffold.** `python3 scripts/rbx_tooling.py scaffold <repo> --name <game>`, then
   `rokit install` and `wally install`. It copies the [template](scripts/template/) and the
   [TestRunner](scripts/agentkit/tooling/TestRunner.luau) and
   [ShipCheck](scripts/agentkit/tooling/ShipCheck.luau) modules into `tools/testkit/`. GATE:
   `rbx_tooling.py lint <repo>/default.project.json` reports no error (it also catches properties
   Rojo drops silently).
2. **Local gate.** `rbx_tooling.py gate <repo>` runs the CI steps in order: Wally,
   `rojo sourcemap --include-non-scripts`, luau-lsp twice, Selene, StyLua, Lune tests, ship build,
   ShipCheck. luau-lsp 1.70.1 runs the old solver unless given `--flag:LuauSolverV2=true`, while
   Studio uses the new one for nonstrict scripts, so the gate runs both (P2). GATE: every step exits
   0, then each planted fault (type, solver-only, lint, format, failing spec, test in release) fails
   exactly its steps. The gate needs this skill's scaffold (`tools/`, `ship.project.json`); in
   another repository, gate with the lead's `rbx_check` and `lint_project`.
3. **Engine tests in Studio.** Build a dev place and open it once with `rbx_env.open_place` inside
   `rbx_env.place_slot()` (binding: the lead's procedures). Then `rbx_tooling.check_target(s)`
   checks through `list_roblox_studios` that one window is bound and holds a test place (P18);
   allowlist the Studio MCP tools first, or each call stalls on a prompt (coding harness tutorial).
   Run the CI one-liner through `rbx_run.run` in Edit, then on the Server in a `Playtest`:
   ```luau
   return require(game:GetService("ServerStorage").TestKit.EngineTests)()
   ```
   GATE: `failed == 0` and `total > 0`. A spec that fails to load counts as a failure.
4. **Client placement probe.** Before trusting a layout, count client script runs in a playtest
   (P7). GATE: each entry runs once per player.
5. **Sync health** (Script Sync teams).
   `rbx_tooling.run_kit(studio, "return SyncCheck.run(game)", kit=["SyncCheck"])` with
   [SyncCheck](scripts/agentkit/tooling/SyncCheck.luau), and `rbx_tooling.lint_scriptsync(folder)`
   on disk. GATE: no error findings; every root reads SyncedAsRoot.
6. **CI.** Commit [ci.yml](scripts/template/.github/workflows/ci.yml): a `static` job with no
   secrets on every pull request, and an `engine` job for pushes and same-repository pull requests.
   The engine job checks its key and scopes (`tools/check_key.luau --require-scope ...`), uploads
   the dev build as a Saved version of a test place, and runs the one-liner through Open Cloud Luau
   Execution (`tools/cloud_luau.luau --expect-tests`).
   - A place accepts 10 unfinished tasks, then HTTP 429 (Open Cloud reference): engine jobs share
     one concurrency group and `cloud_luau` retries 429 with backoff. GATE:
     `rbx_tooling.check_workflow` ok and actionlint 0; the first pull request is green, and a
     planted fault turns it red.
7. **Release.** [publish.yml](scripts/template/.github/workflows/publish.yml) runs on a tag or by
   hand in the protected `production` environment: key check, `tools/place_versions.luau` (newest
   Version History number of each builders' place), ship build,
   `tools/merge_place.luau --manifest places.json --live-versions ...` (each base place plus the
   code, then ShipCheck), then `tools/publish.luau --manifest places.json --published`. P10 quotes
   the whole job.
   - Builders hand over with **File** > **Save to File** into `assets/<place>.rbxl` and record that
     save's Version History number as `baseVersion` (P15). An outdated copy silently ships the old
     map, so the merge refuses a `baseVersion` older than the newest version.
   - The place publishing API does not update PartOperation (CSG), SurfaceAppearance, EditableImage,
     EditableMesh or BaseWrap content (place publishing guide): `merge_place` exits 2 on them and
     keeps the merged file for a person to publish from Studio.
   - Restarting outdated servers (`tools/restart_servers.luau`, Open Cloud `:restartServers`) runs
     only when a manual run sets `restart_servers`. GATE: merge exit 0 with `freshness` checked and
     `dropped` and `baseScripts` reviewed; Saved versions exist for every place before any Published
     upload. Agents run phase 1 or `--dry-run` only, and never restart servers.
8. **Studio command line on a CI Mac.** Use the lead's wrapper `rbx_run.run_headless(place, code)`:
   it refuses while any Studio runs and parses a result marker (no live run yet).
   `RobloxStudio --task RunScript` itself (4 runs here, 6.0 s each) exits 0 even on a runtime error
   and, on macOS, took over the open Studio and closed its window (P12). GATE: the parsed marker,
   never RunScript's exit code.

API keys, one per job; scope strings from the Open Cloud reference; each job's
`check_key --require-scope` list matches its row (P13):

| Job                              | Scopes                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ci.yml `static`                  | no key                                                                                                                              |
| ci.yml `engine`, test experience | `universe-places:write` (Saved upload of the test place) and `universe.place.luau-execution-session:write` (Luau Execution)         |
| publish.yml, production          | `universe-places:write`; `universe:write` to restart servers; `universe.place:read` (builders' experience) for the stale base check |
| `check_key` (introspect)         | none extra                                                                                                                          |

Where each check runs. The Studio column needs Studio's MCP server on: toggle in the lead's
[gui-paths.md](../scenario-roblox-expert/references/gui-paths.md).

| Check                                | Lune or CLI (CI)         | Studio through MCP        | Open Cloud                                |
| ------------------------------------ | ------------------------ | ------------------------- | ----------------------------------------- |
| Types, lint, format                  | yes                      | no                        | no                                        |
| Pure specs                           | yes, milliseconds        | yes                       | yes                                       |
| Engine specs                         | no                       | Edit, Server, Client      | yes, no physics, place scripts do not run |
| Release tree audit, base place merge | ShipCheck, `merge_place` | ShipCheck on `game`       | no                                        |
| Playtest, input, captures            | no                       | yes                       | no                                        |
| Sync status                          | disk lint only           | `InstanceFileSyncService` | no                                        |

## Numbers

Every pinned tool is installed on the macOS test machine; the offline suite checks each `--version`.

| Value                                                                                                              | Relative to                                      | Source                           |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------- |
| Rojo 7.7.1, Wally 0.3.2, Rokit 1.2.0, Lune 0.11.0, Selene 0.32.0, StyLua 2.6.0, luau-lsp 1.70.1, actionlint 1.7.12 | pins in `rokit.toml` (actionlint unpinned)       | installed, versions checked, run |
| Gate 1.9 s: old solver 1.2 s, new solver 0.7 s                                                                     | template project, this Mac                       | tested                           |
| EngineTests 0.07 s in Edit; first `open_place` 19.7 s                                                              | 5 tests, 2 files                                 | Studio 0.743                     |
| 10,000 scripts per root, 128 roots                                                                                 | Script Sync limits                               | docs                             |
| 5 creates, 200 gets, 45 log reads per minute                                                                       | Luau Execution, per key owner                    | OpenAPI                          |
| 10 unfinished tasks per place (11th create: HTTP 429), 5 min default timeout                                       | Luau Execution                                   | OpenAPI                          |
| 4 MB script, 4 MB results, 450 KB logs, 24 h retention                                                             | Luau Execution                                   | OpenAPI                          |
| 60 days unused                                                                                                     | API key auto-expiry, even without an expiry date | API keys guide                   |

## Quality gates

Measurable:

- Gate report ok, plus the red proofs (P2).
- Lune: `tests: N passed, 0 failed` with N above 0; engine: the same counts from EngineTests.
- ShipCheck on the ship build: no findings; dev build: `dev-container` and `test-code` only.
- `check_workflow` ok on both workflows; no `secrets.` inside a `run:` line.
- SyncCheck ok; P7 probe counts 1 per entry.

Visual: none for the pipeline. Script Sync conflict dialogs and the Rojo Connect prompt are GUI
modals `screen_capture` misses: ask the user ([gui-paths.md](references/gui-paths.md)). Score with
[critique.md](references/critique.md).

## Common mistakes

| Mistake                                                            | Symptom                                                              | Fix                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Selene without `std = "roblox"`                                    | parse errors on types, panic on string interpolation                 | add it to `selene.toml`                                                                       |
| One Selene warning                                                 | exit 1                                                               | relax that rule's option in `selene.toml` or allow one line; no `--allow-warnings` in CI (P2) |
| luau-lsp without a sourcemap                                       | `Key 'Shared' not found in external type 'ReplicatedStorage'`        | `rojo sourcemap` then `--sourcemap`                                                           |
| Scripts-only sourcemap, new solver                                 | `Key 'Remotes' not found in external type 'Folder'`                  | `rojo sourcemap --include-non-scripts`                                                        |
| Type check on the old solver only                                  | instance-path typos pass CI                                          | second pass with `--flag:LuauSolverV2=true`                                                   |
| Rojo build uploaded alone                                          | the live game loses its map                                          | merge the base place or map `.rbxmx` files (P15)                                              |
| `$path` on a service                                               | live sync deletes Studio-made RemoteEvents and parts                 | map a child folder, or `$ignoreUnknownInstances: true`                                        |
| `"Position"` or `"Orientation"` in `$properties` or `*.model.json` | `rojo build` exits 0, the part sits at the origin with no rotation   | 12-number `"CFrame": [x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1]`                                    |
| `.local.luau` in a Rojo project                                    | a ModuleScript named `X.local`, no error                             | Rojo suffixes only: `.server`, `.client`, `.plugin`                                           |
| Rojo default `emitLegacyScripts`                                   | `.client.luau` in ReplicatedStorage is a LocalScript that never runs | `"emitLegacyScripts": false`                                                                  |
| RunContext Client Script in StarterPlayerScripts                   | runs twice per player, engine warning                                | LocalScript there, or move it to ReplicatedStorage                                            |
| Two init files in one folder                                       | one wins silently                                                    | one init per folder                                                                           |
| `MeshId` or `HttpEnabled` changed under `rojo serve`               | Studio keeps the old value                                           | rebuild and reopen (P17)                                                                      |
| `StarterPlayerScripts` key outside StarterPlayer                   | builds as a Folder                                                   | lint `key-class` (P17)                                                                        |
| Empty `init.meta.json`                                             | `rojo build` exit 1, "File contains no JSON value"                   | write valid JSON                                                                              |
| No Packages globs                                                  | a `wally` ModuleScript and package tests ship                        | `globIgnorePaths` from the template                                                           |
| Secret inline in `run:`                                            | key in logs, shell injection                                         | pass it through `env:`                                                                        |
| Engine job on fork pull requests                                   | red job, no secrets                                                  | guard with `head.repo.full_name`                                                              |
| Key unused for 60 days                                             | 401 mid-release                                                      | `tools/check_key.luau` first; re-enable or edit the key                                       |
| Engine key with the Luau Execution scope only                      | the job fails at the Saved upload, before any test                   | add `universe-places:write` (P13)                                                             |
| Base place saved before builders' last edits                       | the release ships the old map, no error                              | `baseVersion` plus `--live-versions` (P15)                                                    |
| Script Sync stopped after reopening                                | disk edits never reach Studio                                        | poll `GetStatus`, then Resume sync                                                            |

## Handoffs

- **scenario-roblox-expert:** channels, `rbx_run.run_headless`, places and slots. Tooling never
  reimplements them.
- **scenario-roblox-architecture:** folder layout and RunContext choices; tooling maps them into
  project files and probes them (P7).
- **scenario-roblox-luau:** fixes the findings of both solvers; strict mode is set in `.luaurc`.
- **scenario-roblox-networking:** exploit and validation specs run as engine tests in CI.
- **scenario-roblox-data:** DataStore specs, on a test universe only.
- **scenario-roblox-assets:** content the publish API cannot update (step 7) sends that release
  through Studio.
- **scenario-roblox-performance:** receives the ShipCheck report and Saved version numbers, and owns
  publishing, updates and shutdowns.

## Current Roblox notes

- Studio has a built-in MCP server and Open Cloud has Luau Execution: the 2023 claim "no Roblox
  runtime in CI" is outdated.
- Rokit replaces Aftman and Foreman; TestEZ and run-in-roblox are 2023 tools.
- IP restriction on keys is optional now; the `0.0.0.0` and runner-IP workarounds in older videos
  are obsolete.

## References

- [expert-notes.md](references/expert-notes.md): principles by expert, with timestamps.
- [procedures.md](references/procedures.md): P1 to P18 with full code, test names and results.
- [critique.md](references/critique.md): rubric and report format.
- [gui-paths.md](references/gui-paths.md): Team Create, Script Sync, Rojo, API keys, plugins,
  version history.
- [sources.md](references/sources.md): videos, docs and tool pages.
- [scripts/rbx_tooling.py](scripts/rbx_tooling.py): scaffold, lint, gate, ship check, workflow
  check, `run_kit`.
- [scripts/agentkit/tooling/](scripts/agentkit/tooling/): TestRunner, ShipCheck, SyncCheck.
- [scripts/template/](scripts/template/): the team project, including
  [tools/test.luau](scripts/template/tools/test.luau),
  [tools/cloud_luau.luau](scripts/template/tools/cloud_luau.luau),
  [tools/publish.luau](scripts/template/tools/publish.luau),
  [tools/merge_place.luau](scripts/template/tools/merge_place.luau),
  [tools/check_key.luau](scripts/template/tools/check_key.luau),
  [tools/place_versions.luau](scripts/template/tools/place_versions.luau),
  [tools/restart_servers.luau](scripts/template/tools/restart_servers.luau) and
  [tools/testkit/EngineTests.luau](scripts/template/tools/testkit/EngineTests.luau).
