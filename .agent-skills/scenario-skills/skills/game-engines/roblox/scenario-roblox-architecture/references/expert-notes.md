# Expert notes: Roblox code architecture

Principles and judgment by source, with timestamps. URLs are in [sources.md](sources.md). Items
marked [added] are this skill's own additions. "Live" means run in Roblox Studio 0.743 on 2026-10-18
(see [procedures.md](procedures.md)).

## Corrections and findings from live tests

| Claim in the sources or notes                                                                              | Live result                                                                                                                                                                                                                          | Use instead                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| A Client Script in StarterPlayerScripts runs twice (docs)                                                  | confirmed: 2 runs, original and PlayerScripts copy; Output warns "non-legacy RunContext ... will cause it to run multiple times"                                                                                                     | client entry in ReplicatedStorage                                                  |
| Rojo `.client.luau` is a client Script (common assumption)                                                 | Rojo 7.7.1 emits a LocalScript unless `"emitLegacyScripts": false`                                                                                                                                                                   | set the flag; the default puts a dead LocalScript in ReplicatedStorage             |
| Script Sync suffixes `.local.luau` and `.legacy.luau`                                                      | Rojo 7.7.1 builds them as ModuleScripts named `X.local` and `X.legacy`                                                                                                                                                               | do not mix the two suffix schemes in one tree                                      |
| Code run by an agent can reach live services by `require` (agent assumption)                               | `execute_luau` got a fresh module copy (`StateChanged` nil), in every run                                                                                                                                                            | Studio-only attributes published by each module                                    |
| Tags: GetTagged plus InstanceAdded covers every case (B Ricey, GnomeCode)                                  | a tagged part moved from ServerStorage back to Workspace fired no InstanceAdded                                                                                                                                                      | watch AncestryChanged per tagged instance (Binder)                                 |
| GetTagged returns only live instances (implicit in the samples)                                            | a tagged template in ServerStorage is returned too                                                                                                                                                                                   | bind under chosen ancestors only                                                   |
| Destroying handlers run "before" removal (beginner assumption, Crusherfire)                                | under Deferred the handler had not run before the yield and read Parent nil                                                                                                                                                          | capture state before `Destroy`; handlers only clear                                |
| Set `workspace.SignalBehavior` from `execute_luau` for an A/B test (luau note, to verify)                  | reading it failed: "SignalBehavior is not a valid member of Workspace"                                                                                                                                                               | set it in Properties or the Rojo project; check behavior with the Destroying probe |
| `CollectionService:CreateCollection` (API reference)                                                       | method exists; the call errors "Collections are not enabled"                                                                                                                                                                         | tags and Binder                                                                    |
| ReplicatedFirst runs before the game loads (docs)                                                          | confirmed: `IsLoaded` false in ReplicatedFirst, true in client Main 35 to 36 ms later; no character yet                                                                                                                              | never assume the character in client Main                                          |
| Round items given once stay with the player (agent assumption)                                             | five respawns mid-round: the re-give on CharacterAdded kept 1 sword and Bound 1                                                                                                                                                      | re-give round items on CharacterAdded                                              |
| Maps in ReplicatedStorage, cloned per round (GnomeCode, oEWoyT-GBZY [00:11:03])                            | docs: ServerStorage until needed, to cut join traffic. Live with maps in ServerStorage: clone at Intermission, destroy at Lobby, Lobby instance count delta 0, hazards 0, frames within the gate                                     | ServerStorage plus MapService; ArchAudit `maps-replicated`                         |
| ResetOnSpawn false keeps a ScreenGui (common reading)                                                      | live: false plus direct child kept the same instance; false inside a Folder and true were rebuilt; a ScreenGui made in code with the default true was destroyed and never came back                                                  | HUD and shop false, direct children or built in code; `reset-ignored-nested`       |
| A handler connected inside another handler catches the next fire (Immediate habit; Crusherfire [00:03:19]) | live under Deferred: 0 catches; nested fires ran A, B, C                                                                                                                                                                             | connect in Init, before anything fires                                             |
| CharacterRemoving sees the character in place (Immediate habit; Crusherfire [00:08:54])                    | live: Parent nil inside the handler, but HumanoidRootPart was still a child                                                                                                                                                          | capture what you need before the respawn; read nothing through Parent              |
| Set an attribute then fire a remote: the client sees the new value (agent assumption)                      | at 0 ms latency the handler saw the current value in 20 of 20, and also when the remote fired first: Studio cannot show the trap                                                                                                     | the docs rule: state in the payload, or attributes only                            |
| `execute_luau` code ends when the call returns (agent assumption)                                          | a Client connection made in one call kept firing for later server fires                                                                                                                                                              | probes can listen in one call and read in the next                                 |
| `luau-lsp analyze` clean means the code type-checks (agent assumption)                                     | luau-lsp 1.70.1 runs the old solver by default; with `--flag:LuauSolverV2=true` the template and snippets had 15 errors (xpcall with `debug.traceback`, refined `function` calls, untyped sort comparators, a module-level optional) | check both solvers (procedures P15)                                                |

## Roblox Creator Docs

**Script locations** (`scripting/locations`)

- Placement plus `Script.RunContext` decide behavior. Default RunContext is Legacy.
- Recommended architecture: one Script with RunContext Client in ReplicatedStorage, one with
  RunContext Server in ServerScriptService, everything else ModuleScripts with a `start()` called
  after all modules load.
- Client code in ReplicatedStorage gives Output links to a stable path instead of the per-player
  PlayerScripts copy.
- A Server RunContext Script in ReplicatedStorage runs but replicates its source to clients.
- Avoid scripts parented to Workspace instances: tag them and drive them from one module. Creator
  Store models are the exception, with an explicit RunContext on each script.

**ModuleScripts** (`scripting/module`)

- `require` runs a module once per side and returns the same reference after that; client and server
  get separate references.

**Attributes and replication order** (`scripting/attributes`)

- Client order: ReplicatedFirst, then `Loaded`, then PlayerScripts and ReplicatedStorage client
  Scripts, then the character, then StarterCharacterScripts.
- The engine does not guarantee replication order between a property change and a remote. Same-type
  changes, such as two attribute changes, generally arrive in order.
- ReplicatedFirst code must not require modules from other services.

**Data model** (`projects/data-model`)

- Keep maps in ServerStorage until needed and move them into Workspace only when required, to cut
  client traffic at join ("ServerStorage"). Scripts in ServerStorage do not run.

**On-screen UI containers** (`ui/on-screen-containers`) and the StarterGui and LayerCollector
reference

- On every spawn PlayerGui is emptied and StarterGui is copied in again. A ScreenGui survives only
  when `ResetOnSpawn` is false and it is a direct child of StarterGui; inside a Folder it resets
  even when false ("Reset on spawn" table).

**Remote events** (`scripting/events/remote`, "Delivery guarantees")

- RemoteEvents are reliable and ordered per connection and direction, across different RemoteEvent
  instances. RemoteFunctions are not ordered with them. Ordering is when a handler starts: a
  yielding handler lets the next one start.
- An event with no handler connected is queued and delivered once one connects (limited queue).

**Server Authority overview** (`projects/server-authority`)

- RemoteEvents are not consistently ordered with property and attribute updates (networking-security
  note).

**Client-server runtime** (`projects/client-server`)

- Players see 100 to 300 ms latency; Studio playtests have none. Simulate 50 to 150 ms in each
  direction (Studio Settings, Network, or `NetworkSettings.InboundNetworkMinDelayMs` and
  `OutboundNetworkMinDelayMs` from a plugin-level script).

**Team Create** (`projects/collaboration`)

- Reverting a place version while collaborators edit can be overwritten by their auto-save: turn
  collaboration off first.
- Drafts mode: drafts stay on the local machine until committed; Team Test runs the committed
  version; enabling it needs every collaborator to leave the session ("Drafts mode").

**Script Sync** (`scripting/sync`)

- Works with Team Create. New instances under a synced tree get a numeric name suffix; two people
  syncing the same scripts overwrite each other ("Team Create").

**Packages** (`projects/assets/packages`)

- Auto Update pulls a new version when a place is opened in Studio; a modified copy ignores it;
  package scripts are read-only until unlocked, which marks the package modified.

**Loading screens** (`players/loading-screens`)

- ReplicatedFirst script: show your ScreenGui, `RemoveDefaultLoadingScreen()`, wait for
  `game.Loaded` when `IsLoaded()` is false, then destroy the screen.

**Instance streaming** (`workspace/streaming`, `workspace/streaming/techniques`)

- StreamingEnabled is on in new places and not scriptable; only Workspace descendants stream.
- Client lookups, raycasts and bounds see only streamed parts; tag signals fire on stream-in and
  stream-out; a loading screen that waits on a Workspace part can hang (no character, no replication
  focus).
- ModelStreamingMode: Atomic for models scripts need whole (wait on the model only), Persistent
  rarely (`PersistentLoaded` fires after `Loaded`), PersistentPerPlayer for plots. Set it in
  Properties or a server Script, never a LocalScript (Model reference).

## MrAsync (Super Social), Connect 2022 workshop, KSCN__Nd17Y

- Singleton service: class boilerplate, `return Class.new()` at the bottom; a two-line switch
  between class and singleton [00:08:11 to 00:12:01].
- Every sanity check twice: on the client to save bandwidth from honest spam, on the server because
  exploiters call `FireServer` directly [00:16:37].
- A state service never requires its GUI. The GUI calls `Set` and listens to `OnChange`, so a
  renamed button breaks only the GUI [00:21:27 to 00:31:11].
- Coupling smells: a module of 500+ lines, a currency service editing inventory, two modules that
  cannot work alone, long stack traces [00:20:54].
- Build one loader and framework yourself to learn initialization order and injection [00:38:12]. A
  name-mapped loader (Nevermore's) with init and start phases [00:37:39]. `_G` "if it gets the job
  done", not his choice [00:42:07].
- Document the API in a comment block at the top of each module; Moonwave only for big teams
  [00:48:04].
- Judgment: can you return in two months and know where a change belongs [00:31:43].

## Suphi Kaner, YsXijBUUmmM

- One entry Script per side requires every module [00:00:25].
- GetDescendants order is undefined: a module must not use another at load. Initialize sets up own
  state; Initiate may call others [00:04:22 to 00:07:06].
- Module names are registry keys: duplicates overwrite each other [00:01:50].
- The client mirror waits for the game to load and owns the loading screen in ReplicatedFirst
  [00:14:15 to 00:15:21].
- Keep the two phases, drop `_G` and `wait`-era code [added]; Loader uses a frozen registry.

## Leif, F3ASTJuO82A and IJDg6tRJmHo

- Services split by feature, with a server half in a non-replicated container and a client half in
  Shared [00:00:29 to 00:01:52].
- Services are singleton tables; Init is for non-yielding setup only [00:02:00 to 00:02:25].
- Remotes are never made by hand in Explorer; create them in code through a wrapper (the frames show
  the `Networker` package) [00:04:28].
- The client asks ("can I build here?"), the server validates, with simple rules first (a 5 s
  cooldown in the demo) [00:05:39].
- Helper modules by category (core, game, math, platform); UI as a `UI` module tree with one
  initializer [00:07:24 to 00:09:18].
- Packages he uses everywhere: Signal, Charm, Sift, a data service, Janitor [00:09:32].
- His typed-`self` workaround targets the old type solver [00:03:03]; re-test under the new solver.
- Rojo and Wally setup, `wally-package-types` after install (IJDg6tRJmHo [00:09:06 to 00:10:52]);
  handed to scenario-roblox-tooling.

## Crusherfire

**Script organization, 28z_064N-lc**

- Each script has one purpose expressed by its name [00:03:51].
- Never server scripts in StarterPlayer, never LocalScripts in ServerScriptService [00:12:40].
- ReplicatedFirst only for what must reach the client first, the loading screen [00:05:06].
- Services find instances by tag, then a class sets up each one [00:10:52].

**Reusable systems, 6Q_p2ObUXSo**

- Split each system into an agnostic core package and a game-specific implementation folder
  [00:11:02, 00:25:23].
- Configuration instances with attributes as the replicated state bus [00:07:06, 00:15:27].
- Author server modules inside the system folder, relocate them to ServerScriptService at server
  start, and leave a stub so requires hold [00:09:47].
- Require siblings by relative path so systems move [00:23:46]. Return `table.freeze(module)`
  [00:21:30].
- Luau type check mode can be set to Strict on Workspace instead of `--!strict` per file [00:22:37].

**Deferred events, xz_G2n1Q8-U**

- A handler connected inside another handler misses a fire that was already queued: A's handler
  connects to B, the code fires A then B, and B's new handler never runs [00:03:19 to 00:05:51].
- Deferred handlers run at the next resumption point; nested fires run breadth-first [00:06:06 to
  00:08:52].
- Removing and Destroying handlers run after the instance is gone; capture what you need before
  destroying [00:08:54 to 00:13:17].

**Memory leaks, 0moy04A9vFg; lag fixes, YWyJHwynM1M**

- Leaks are forgotten cleanup: observers outside the cleanup object, caches keyed by instances, a
  cleanup object with the wrong lifetime (0moy04A9vFg [00:16:38]).
- Workspace.PlayerCharacterDestroyBehavior Enabled so old characters and Player objects are
  destroyed (YWyJHwynM1M [00:12:34]; 0moy04A9vFg [00:21:02]).

## B Ricey

**Tags and CollectionService, Vi2FckNJv9w**

- One script in ServerScriptService for every tagged instance instead of a script per instance
  [00:02:44].
- Startup loop over GetTagged, plus added and removed signals, with a per-instance connection table
  [00:05:11 to 00:09:50].
- Tags are composable flags any script can add or remove [00:10:05].
- Gaps [added]: connect the signals before GetTagged; no ancestor filter; no reparent handling.

**Organize and style, MyK4o2pIpQw**

- YAGNI: write what you need, then refactor [00:03:26 to 00:06:09].
- Functions first; a class when state, cooldowns or several instances appear [00:07:10 to 00:08:50].
- Frameworks (Knit) and ECS (Matter) decide for you; Knit's downside is that everything depends on
  one service or controller [00:17:58 to 00:19:05].

**Cleanup modules, 2Msrw5w5cTs**

- A cleanup object (Trove, Maid, Janitor) puts cleanup next to creation; `Destroy` becomes one line
  [00:06:16].
- Add to it at the moment of creation [00:09:27].
- Functions are valid cleanups, for example an `UnbindFromRenderStep` call [00:12:50].

## GnomeCode, UsPYgIW3rv8 and oEWoyT-GBZY

- One script, many tagged models; a tag plugin is optional (UsPYgIW3rv8 [00:01:38 to 00:02:10]).
- Round loop: clone one random map per round into Workspace, destroy it at the end so damage never
  carries over (oEWoyT-GBZY [00:11:03 to 00:13:51]). He keeps the maps in ReplicatedStorage; the
  docs put them in ServerStorage, which never replicates. This skill follows the docs and rotates in
  name order [added].
- A part named `Spawn` in each map makes new maps work without code changes [00:08:15]. The HUD
  reads Workspace attributes, `ResetOnSpawn` false, and renders once at start or the first state
  never shows [00:14:05 to 00:19:38].

## Ludius, n8IDTRW1EfM and xjxDqodtxlU

- Do nearly everything in ModuleScripts with one loader per side [00:01:34]. Modules call each
  other, so BindableEvents become unnecessary [00:02:27].
- His client loader sits in ReplicatedFirst; the docs reserve it for loading screens.
- `table.clone` is shallow: template objects need a deep copy or a metatable (xjxDqodtxlU
  [00:09:24]).

## Stewiepfing, ud1ITriP5Rs

- Four smells: `wait()`, needless per-frame work, uncleaned connections, remote spam [00:00:32 to
  00:11:08].
- Update UI on value change, not by polling [00:05:37].

## BrawlDev, dRgvhjr2Dx0

- Prove where code ran with the Current Client and Server view toggle and Output colors [00:09:14].
  Agents use the Client and Server data models of `execute_luau` instead.

## Roblox Learn

**Packages introduction, AzKZy2BqIh8** (Roblox packages team)

- Package a Model, not loose parts [00:07:11].
- Set ownership to the group in a team [00:08:16].
- Turn Auto Update on right after creating the package; it is off by default [00:09:55].
- Keep one asset-storage place with one placement of each package; edit there and publish
  [00:12:43].

**Version control, sU9nTX0JFyY**

- Three built-in layers: place versions, package versions, script history [00:00:00].
- Roll a package back with Compare Versions and the version number [00:02:49]. Deleting the
  PackageLink freezes a plain copy [00:03:23].

**Memory leaks, x1JgsC8c8VQ**

- Players and characters are not necessarily destroyed on leave: enable
  PlayerCharacterDestroyBehavior or clean up by hand [00:06:58].

**Performance, VDO_amtWfDw and Wwj8EkMWFhI**

- Persistent streaming only for gameplay-critical models, such as a flag carrier; overuse brings the
  memory problem back (VDO_amtWfDw [00:05:34]).
- Persistent only when a client script needs the model at all times (Wwj8EkMWFhI [00:04:27]).

## RDC23 Advanced Development panel, sSVh-bcvYSI

- Stephen Leitnick under streaming: CollectionService tags, waiting only for the descendants a
  binding needs, and server-set attributes so streamed parts arrive with state [00:16:37].
- Long sightlines, such as sniping across a map, are where streaming breaks [00:19:20].

## This skill's additions [added]

- `Loader.boot`: pcall per module, yielding Init reported, frozen registry, boot report attributes;
  BootCount 2 reveals an entry that ran twice.
- Studio-only debug attributes as the test surface, because `execute_luau` does not share the module
  cache.
- `Binder.bind` with ancestors and AncestryChanged watching.
- `ArchAudit`: static require graph (instance paths, GetService aliases, string requires), cycles,
  client-to-server requires, placement and lifetime rules.
- Mirror absolute server times (`EndsAt`) instead of firing a timer remote every second.
- `Test_*` attributes honored in Studio only, so an agent runs a full round loop in 25 s.
- MapService: maps rotate in name order; per-map behavior bound by tag, so `Destroy` is the whole
  cleanup; a respawn during a round goes back to a map pad.
- ShopController closes the shop on CharacterAdded on purpose, instead of letting ResetOnSpawn
  rebuild the screen.
- Holding the round loop in Lobby by raising `Test_MinPlayers` above the player count, so a test can
  read the state between rounds.
