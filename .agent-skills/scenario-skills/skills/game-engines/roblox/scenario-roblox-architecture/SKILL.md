---
name: scenario-roblox-architecture
description: "Use when structuring Roblox game code: where scripts go (ServerScriptService, ReplicatedStorage, StarterPlayerScripts), Script vs LocalScript and RunContext, a module loader or framework (Knit or none), services and controllers, how systems talk (signals, BindableEvents, attributes), CollectionService tags, cleanup with Trove or Janitor, Rojo project layout, or a round-based game core. Also when code is spaghetti, a script runs twice, require errors with 'required recursively', a module is nil on the client, a tool stops working after respawn, or memory climbs from leaked connections."
license: MIT
---

# Roblox architecture (gameplay programmer and architect)

Target: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert architecture on Roblox means placement and RunContext decide what runs where, one entry
script per side boots every module in two phases, server modules own the truth that attributes
mirror, and tags bind behavior to instances with an owner for every connection. This skill carries
those rules from the sources, corrected by live tests in Studio 0.743, plus a tested arena core
(round loop, teams, maps, HUD, shop, sword) and the tools that build and audit it. If a sibling
skill named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or
ask the user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed
from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

**Status (2026-10-19):** 14 live tests pass in Studio 0.743; 8 offline checks pass (18 Lune unit
tests, luau-lsp on both type solvers over code, fixtures and snippets, StyLua, selene).

## Stance (the expert delta)

1. **Pin placement and RunContext: one entry Script per side.** Use one Script with RunContext
   Server in ServerScriptService and one with RunContext Client in ReplicatedStorage (Roblox docs,
   Script locations; Ludius, n8IDTRW1EfM [00:01:34]; Leif, F3ASTJuO82A [00:03:18]). Everything else
   is a ModuleScript.
   - A Client Script in StarterPlayerScripts ran twice (live), with a "non-legacy RunContext"
     warning in Output.
   - Rojo 7.7.1 turns `.client.luau` into a LocalScript unless the project sets
     `"emitLegacyScripts": false` (verified). A LocalScript in ReplicatedStorage never runs.
2. **Boot in two phases through one loader.** GetDescendants order is undefined, so no module may
   call another while loading (Suphi Kaner, YsXijBUUmmM [00:04:22]). Init sets up its own state and
   never yields; Start may yield and call others (Leif [00:02:25]; docs, `start()` on every module).
   [`Loader.luau`](scripts/agentkit/architecture/Loader.luau) adds what the sources skip [added]:
   - an explicit order, then the rest sorted by path; duplicate names fail (Suphi [00:01:50]);
   - one pcall per module, so one broken service does not stop the others;
   - an Init that yields is reported as an error;
   - a frozen registry and a boot report written as attributes.
3. **Server modules own the truth; attributes mirror it; UI owns nothing.** A state service never
   requires its GUI; the GUI calls the service and listens (MrAsync [00:25:46 to 00:31:11]). Publish
   shared state as attributes on a Configuration that clients observe (Crusherfire, 6Q_p2ObUXSo
   [00:07:06]). Mirror absolute server times (`EndsAt`) so clients count down without a timer remote
   [added]. A property or attribute change and a remote are not ordered relative to each other
   (docs, Attributes; Server Authority): put the state in the remote payload, or publish it only as
   attributes and re-render on each change.
4. **Bind behavior by tag, filtered by ancestor.** One module drives every tagged instance instead
   of a script per instance (B Ricey, Vi2FckNJv9w [00:02:44]; GnomeCode, UsPYgIW3rv8 [00:01:38];
   docs). Two traps the sources miss [added]:
   - A tagged template in ServerStorage is in GetTagged too: bind only under chosen ancestors.
   - Moving a tagged part from ServerStorage back to Workspace fired no InstanceAdded (live): watch
     AncestryChanged.

   [`Binder.luau`](scripts/agentkit/architecture/Binder.luau) does both, connects the signals before
   GetTagged, and runs the cleanup that setup returns.

5. **Every connection has an owner with a lifetime.** Wire cleanup to the owner that dies with it,
   for example a per-tycoon Trove instead of the player's (Crusherfire, 0moy04A9vFg [00:16:38]). Add
   to the cleanup object at creation (B Ricey, 2Msrw5w5cTs [00:09:27]). Set
   Workspace.PlayerCharacterDestroyBehavior to Enabled (Crusherfire, YWyJHwynM1M [00:12:34]). Under
   Deferred signals a Destroying handler runs after the destroy (Crusherfire, xz_G2n1Q8-U
   [00:12:45]). Live, the handler had not run before the yield and then read Parent nil: capture
   state before removal; removal handlers only clear tables. A listener connected inside another
   handler misses the fire already queued, and nested fires run breadth-first (Crusherfire [00:03:19
   to 00:08:52]; live): connect every listener in Init.
   - Screens have a lifetime too: each spawn recopies StarterGui into PlayerGui, except direct
     children with ResetOnSpawn false; a Folder cancels false (docs, On-screen UI containers).
     Players die every round, so the HUD and shop use false (GnomeCode, oEWoyT-GBZY [00:14:38]) and
     their run-once controllers keep valid references (live).
6. **Server code and round content never sit in a replicated container.** Exploiters can read
   ReplicatedStorage (Leif [00:01:00]; Crusherfire, 6Q_p2ObUXSo [00:09:13]). Maps stay in
   ServerStorage until needed, which cuts join traffic (docs, Data model). Clone one into Workspace
   per round and destroy it after (GnomeCode [00:11:03 to 00:13:51], who keeps them in
   ReplicatedStorage). Crusherfire relocates server modules from a system folder to
   ServerScriptService at start (6Q_p2ObUXSo [00:09:47]). Require siblings by relative path so a
   system can move (Crusherfire [00:23:46]).
7. **The client asks; remotes are made in code.** Never create remotes by hand in Explorer (Leif,
   F3ASTJuO82A [00:04:28]). The client asks "can I build here?" and the server decides (Leif
   [00:05:39]). Check on the client to save bandwidth and again on the server (MrAsync [00:16:37]).
8. **Pick the framework by team, not taste.** Knit-style frameworks decide for you, and everything
   depends on one service (B Ricey, MyK4o2pIpQw [00:17:58]); the 2025 sources build small loaders
   (Ludius, Leif, Crusherfire). Solo or small team: this loader, Signal and a cleanup module; an
   existing Knit codebase: keep it and add the audit [added]. A class only for several stateful
   instances (B Ricey [00:07:10]); a service is a singleton table (Leif [00:02:00]).

## Establish first

- Session shape: round-based, persistent world or hub; player count; teams.
- New place or existing code: Rojo or Script Sync repository, Studio-only, or an existing framework
  to keep.
- Team size and whether systems are shared across places (Roblox Packages for your own systems,
  Wally for third-party code).
- Server Authority (`AuthorityMode = Server`): it forces Deferred signals and replicates only the
  first 64 attributes per instance.
- StreamingEnabled, on in new places (these tests ran with it off): clients wait for streamed parts.

Defaults: Rojo project with `emitLegacyScripts` false, the arena skeleton below, Deferred signals,
PlayerCharacterDestroyBehavior Enabled, `--!strict`.

## Procedure

Setup: `import rbx_architecture as A` (it puts the lead's scripts on `sys.path`). Full code and
recorded results are in [`references/procedures.md`](references/procedures.md).

1. **Scaffold.** `A.scaffold(dest, name, fixtures=False)` copies the arena skeleton plus Loader and
   Binder, writes the Rojo project and builds the place through `rbx_env.new_place`. **GATE:**
   `A.place_facts(place)` shows Server and Client RunContexts, SignalBehavior Deferred and
   PlayerCharacterDestroyBehavior Enabled; `A.check(dest)` returns 0 errors on both type solvers.
2. **Map the modules.** Write the module map before code. Dependencies point from services to shared
   modules, never from a service to UI or from replicated code to the server.

   | Module                          | Side   | Owns                                                         |
   | ------------------------------- | ------ | ------------------------------------------------------------ |
   | PlayerService                   | server | per-player and per-character tables, cleared on leave        |
   | TeamService                     | server | team assignment and alive teams                              |
   | RoundService                    | server | the RoundMachine state, `StateChanged`, the GameState mirror |
   | WeaponService                   | server | swords by tag: give, take, re-give on respawn                |
   | MapService                      | server | one map clone per round, rotation, pads, hazards by tag      |
   | DamageService, ShopService      | server | handed to scenario-roblox-gameplay and scenario-roblox-data  |
   | RoundMachine, Config, Signal    | shared | pure logic, constants, signals (run in Lune)                 |
   | RoundController, ShopController | client | HUD and shop, wired once, ResetOnSpawn false                 |

   **GATE:** `A.audit_file(place)` reports 0 errors and 0 warnings, no require cycle and 0
   unresolved requires.

3. **Boot.** Each entry script calls
   `Loader.boot(Loader.ordered(folder, order), {publish = script})`. **GATE:** in a playtest,
   `A.boot_report(pt)` shows BootOk true, BootErrors 0 and BootCount 1 on both sides, with every
   `init:` before every `start:`. The console has no "required recursively" and no `[Loader]` line.
4. **State and mirrors.** RoundService writes `EndsAt`, `Winner`, then `RoundState`; controllers
   re-render on every attribute change. `Test_*` attributes on GameState shorten the loop in Studio
   only. **GATE:** server state, client mirror and HUD text agree; capture the HUD, run
   `image_checks` and open the image.
5. **Tags and lifetimes.** Bind tagged instances with `Binder.bind(tag, setup, {ancestors = ...})`.
   Clear player tables on PlayerRemoving and character tables on CharacterRemoving. Re-give round
   items on CharacterAdded, because a respawn empties the Backpack. MapService clones the map at
   Intermission and destroys it on the way to Lobby. **GATE:** five respawns mid-round leave one
   tracked character and one bound sword on the map. After a respawn, the HUD and shop are the same
   instances. In Lobby, Workspace holds 0 maps and 0 bound hazards, the instance count is back
   within 10, and frames meet the gate across a map load.
6. **Observe and iterate live.** Open the place once with `rbx_env.open_place` inside
   `rbx_env.place_slot()`. After each edit, push sources with `A.sync_sources(studio, dest)` instead
   of reopening. **GATE:** `A.run(s, "return ArchAudit.all(game)", kit=["ArchAudit"])` matches the
   offline tally, and `tests/code/scenario-roblox-architecture/run_live.py` exits 0.

## Numbers

| Value                                        | Number                                                                                            | Relative to                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Player latency                               | 100 to 300 ms                                                                                     | docs, Client-server runtime                             |
| Studio playtest latency                      | 0 ms; simulate 50 to 150 ms each way                                                              | docs; Studio Settings, Network, or `settings().Network` |
| Module size smell                            | 500+ lines                                                                                        | MrAsync [00:20:54]; ArchAudit `module-size`             |
| Replicated attributes under Server Authority | first 64 per instance; names and strings up to 50 characters                                      | docs, Server Authority                                  |
| Boot, measured                               | server 5 services 1.56 to 2.52 ms; client 2 controllers 0.40 to 1.08 ms                           | live, Studio 0.743                                      |
| Client order, measured                       | ReplicatedFirst ran 35 to 36 ms before client Main; `IsLoaded` false, then true; no character yet | live                                                    |
| Five respawns mid-round                      | instances +3 or -3 (about 46,150); 1 character, 1 bound sword                                     | live, 6 runs                                            |
| Arena defaults                               | 2 players, 15 s intermission, 120 s round, 5 s ending, 0.25 s tick                                | [added]                                                 |
| Frame gate                                   | p95 at most 20 ms, worst at most 33.3 ms at 60 fps (1.2 x and 2 x the budget)                     | scenario-roblox-expert                                  |
| Map cycle, measured                          | Server p95 17.3 ms, worst 17.5 to 20.0 ms across a clone; Lobby instance delta 0                  | live, 3 runs                                            |

## Quality gates

- **Measurable:**
  - ArchAudit: 0 errors and 0 warnings outside fixtures; AgentKit `Audit.all(game)` has 0 errors.
  - Boot report on both sides: BootOk, BootErrors 0, BootCount 1.
  - Console: no "required recursively", "not a valid member", `[Loader]` or "non-legacy RunContext"
    lines.
  - Lifetimes: `Characters` equals the player count after respawns; in Lobby, 0 maps and 0 bound
    hazards, and the instance count is back within 10; Server and Client frames meet the gate.
  - `run_live.py` exits 0; the Lune unit tests pass; luau-lsp has 0 errors on both solvers
    (`A.check`); StyLua and selene are clean.
- **Visual:** a capture during a round shows the HUD with the mirrored state; `image_checks` raises
  no flag and you open the image. A human reviewer gets an Explorer capture.

## Common mistakes

| Mistake                                                                | Symptom                                      | Fix                                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Client Script in StarterPlayerScripts                                  | runs twice; Studio warns in Output           | move the entry Script to ReplicatedStorage, or use a LocalScript in StarterPlayerScripts |
| Rojo default `emitLegacyScripts`                                       | client entry in ReplicatedStorage never runs | set `"emitLegacyScripts": false`                                                         |
| `require` of a live service from `execute_luau`                        | fresh copy: fields nil, state empty          | read the module's Studio-only attributes                                                 |
| Tagged template in ServerStorage                                       | template gets behavior                       | `ancestors` filter                                                                       |
| Reparent within the DataModel                                          | behavior missing after moving back           | AncestryChanged watch (Binder)                                                           |
| Round items given once                                                 | sword gone after respawn                     | re-give on CharacterAdded during the round                                               |
| Reading Parent in Destroying or CharacterRemoving                      | nil under Deferred                           | capture state before destroy                                                             |
| Listener connected inside a handler                                    | misses the fire already queued               | connect in Init, before anything fires                                                   |
| `SetAttribute`, then `FireAllClients`; the handler reads the attribute | can read the old value on live servers       | send the state in the payload                                                            |
| Maps in ReplicatedStorage or Workspace                                 | every client downloads every map at join     | ServerStorage, one clone per round (`maps-replicated`)                                   |
| Run-once controller holding a ScreenGui with ResetOnSpawn true         | HUD gone after the first death               | ResetOnSpawn false                                                                       |
| ResetOnSpawn false on a ScreenGui inside a Folder                      | rebuilt at every respawn anyway              | direct child of StarterGui (`reset-ignored-nested`)                                      |
| `_G` registry, duplicate module names                                  | silent overwrite                             | Loader registry; `ordered` errors on duplicates                                          |
| Package with AutoUpdate off                                            | copies never update                          | AutoUpdate on (Roblox Learn, AzKZy2BqIh8 [00:09:55])                                     |

## Handoffs

- **Receives from:** scenario-roblox-expert (brief, toolkit, place slot); scenario-3d and
  scenario-game-assets (models that arrive as tagged templates in ServerStorage).
- **Delivers to:** scenario-roblox-networking (service layout, remote module slot),
  scenario-roblox-data (DataService boot slot, PlayerRemoving hooks), scenario-roblox-gameplay (hits
  and damage inside Binder setups), scenario-roblox-ui (controllers on GameState, the shop screen),
  scenario-roblox-luau (types, Signal, deferred events), scenario-roblox-tooling (Rojo project, CI),
  scenario-roblox-performance (leaks, streaming), scenario-roblox-animation (character scripts).
- **Form:** the Rojo `src/` tree, the module map, the ArchAudit report and `results.json`.

## Current Roblox notes

- Rojo 7.7.1 drops `"Position"` on a Part with exit 0 and leaves it at the origin: write a 12-number
  `"CFrame"` (verified).
- Rojo 7.7.1 builds Script Sync's `.local.luau` and `.legacy.luau` as ModuleScripts named `X.local`
  and `X.legacy` (verified): do not mix the two suffix schemes.
- require-by-string: `./`, `../`, `@self` and `@game`; special handling of `Init` modules is gone
  (version deltas row 23).
- SignalBehavior: new templates and Server Authority use Deferred; `Default` still maps to Immediate
  in older places. `workspace.SignalBehavior` failed with "not a valid member" from `execute_luau`
  (live): read it in Properties or from the file with Lune.
- PlayerCharacterDestroyBehavior is NotScriptable: set it in Properties or in the Rojo project.
- `CollectionService:CreateCollection` is documented, but in Studio 0.743 it errored "Collections
  are not enabled" (live). Use tags and Binder.
- Next Gen Studio UI is the default: menu paths in
  [`references/gui-paths.md`](references/gui-paths.md).
- Creator Store assets cannot `require(assetId)`: vendor the code.

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps,
  and live corrections.
- [`references/procedures.md`](references/procedures.md): every procedure with full code, its test
  and the recorded result.
- [`references/critique.md`](references/critique.md): the self-review rubric.
- [`references/project-setup.md`](references/project-setup.md): client start, StreamingEnabled,
  Packages and team tools, two-client tests.
- [`references/gui-paths.md`](references/gui-paths.md): Studio menus and panels for the same steps.
- [`references/sources.md`](references/sources.md): every source with URL and best timestamps.
- [`scripts/rbx_architecture.py`](scripts/rbx_architecture.py): scaffold, audit, place facts, sync,
  boot report.
- [`scripts/agentkit/architecture/`](scripts/agentkit/architecture/): Loader, Binder, ArchAudit and
  the Lune runners.
- [`scripts/templates/arena/`](scripts/templates/arena/): the tested arena core and its audit
  fixtures.
