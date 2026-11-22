# Expert notes: gameplay framework, Blueprint vs C++, GAS, input, AI, UI

Principles and judgment by expert, with source and timestamp. `[added]` marks the skill author's own
inference; `[verify]` marks a name to confirm in the installed 5.8. Full notes live in
`notes/gameplay-framework/`, `notes/blueprints/`, `notes/ai/`, `notes/ui/`, `notes/cpp/`.

## Alex Forsythe: framework, replication, Blueprint vs C++ (2020 to 2021, UE4; model still valid in 5.8)

Game framework from `main()` to BeginPlay (IaU2Hue-ApI)

- Two lifetimes: objects created before `LoadMap` (GameInstance, GameViewportClient, LocalPlayer)
  live as long as the process; objects created by `LoadMap` (GameMode, GameState, PlayerController,
  PlayerState, Pawn) die with the map [00:08:38].
- GameMode, GameSession and GameNetworkManager exist only on the server; GameState and PlayerState
  replicate to everyone [00:13:26], [00:13:59].
- A dead pawn stays as a corpse while the controller survives, so per-player data that must survive
  death lives on the controller or PlayerState [00:16:26], [00:17:31].
- Constructors build the CDO at module load, long before a world exists: no gameplay code in
  constructors [00:04:46].
- Use `AGameModeBase` unless you want the match-state flow of `AGameMode` [00:21:56].
- Untouched CharacterMovement defaults make a game "feel like an Unreal tutorial project"; decide
  the feel first, then tune [00:23:39].
- A plugin should ship a `UGameInstanceSubsystem`, not demand a custom GameInstance; two plugins
  cannot both own it [00:26:05].
- Only guaranteed early hooks: `InitGame`, `InitGameState`, `Pre/PostInitializeComponents`,
  `PostLogin`; BeginPlay order between actors is not guaranteed [00:12:23], [00:18:11].

Network replication (JOJP0CvpB8w)

- Replication is per actor: eligible (`bReplicates`), relevant per connection, prioritized under a
  bandwidth budget [00:04:37], [00:07:44].
- Never carry persistent state in a multicast RPC: clients not relevant at that moment never catch
  up [00:10:50].
- Properties are "eventually" consistent and skip intermediate values; RPCs are immediate and for
  time-critical traffic; CharacterMovement is the RPC exception [00:12:58], [00:13:14], [00:13:45].
- C++ RepNotify does not run on the server; Blueprint's Set node fires it on the server [00:14:48];
  call `OnRep_X()` yourself after the server-side set [00:15:18].
- Four buckets: `HasAuthority()`; not authority; `IsRunningDedicatedServer()` for visuals;
  `IsLocallyControlled()` for local player features. Single player runs the same path [00:20:17].
- Replicate the minimal data needed to rebuild the result and let clients do the rest [00:19:46];
  meshes and material instances run locally [00:18:11].
- A failed `_Validate` disconnects the client: validate only real cheating conditions [00:12:26].

Blueprints vs C++ (VMZftEVDuCE)

- "Which is better" is a false premise; draw the line per system and move it over time [00:00:36],
  [00:07:16].
- Blueprint may depend on C++, never the reverse [00:24:10]; a C++ pawn can only treat a Blueprint
  weapon as `AActor`, so refactor bottom-up [00:25:14], [00:26:51].
- C++ base class plus Blueprint subclass: `TSubclassOf` + `EditDefaultsOnly` slots [00:27:22],
  `BlueprintImplementableEvent` for cosmetics ("C++ decides that effects play, Blueprint decides
  which") [00:31:06], purely cosmetic components stay out of C++ [00:31:39].
- Blueprint VM overhead is "absolutely insignificant" once per frame in 16 ms; it matters for
  thousands of actors, tight loops and bulk data [00:14:35], [00:15:59]. Profile first; often one
  function in C++ equals a system rewrite [00:16:33], [00:17:06]; or a static
  `UBlueprintFunctionLibrary` for small teams [00:33:48].
- Hard-coded asset references in C++ constructors load at class registration and stay resident for
  the process [00:29:33].
- One-way dependencies with delegates (event dispatchers): the missile fires OnExplode, the weapon
  binds [00:19:25], [00:19:58]. A linker error across modules is a design signal [00:21:38].
- Blueprint merges always need a human; lock graph Blueprints on checkout [00:43:58]. [5.4 added
  Data-Only Blueprint merging, Beta.]
- Agent reading [added]: C++ is the authorable shape for an agent (text, diff, review); Blueprints
  become defaults set from Python.

## Ari Arnbjörnsson (Epic Tech Dev Relations): Myth-Busting Best Practices (S2olUc9zcB8, Unreal Fest 2024, UE 5.4 measurements; EDC article with 5.5 and 5.6 edits)

- Tick overhead per actor (100,000 actors): Blueprint 3.587 us editor, 1.841 us packaged
  Development; C++ 0.638 to 0.696 us; queuing 0.13 to 0.20 us [00:05:00]. Same Lyra frame: CMC 241.1
  us, PlayerController 125 us [00:06:07].
- "Use Tick, don't abuse Tick": fewer ticking actors or less work per tick; Timelines, timers and
  per-frame notifies do not remove the work [00:10:31], [00:12:41]. Fortnite: about 80 ticks per
  frame on client, 700 on server [00:11:03].
- 1,000 ticking bullet actors: aggregate into one manager moving instanced meshes, or Mass
  [00:11:35].
- Empty Ticks cost nothing from 5.6 (article); on 5.8 count live Ticks.
- Blueprint cost is per node: about 0.7 us to enter a C++ UFUNCTION, 0.1 us between nodes packaged
  (0.5 editor); 10 us of work becomes 10.8, 1 us becomes 1.8 [00:18:48], [00:20:27]; math, Set and
  For Each graphs are pure overhead [00:20:59]. "There is no trophy for shipping a game Blueprint
  only" [00:22:36].
- Development Print String cost 88.8 to 272.5 us per call in his traces (slides 00:20:10 to
  00:21:11).
- Cast is cheap (about 0.5 us C++, 3.5 us Blueprint editor); the hard reference is the cost; the
  player that casts to the final boss keeps the boss loaded [00:26:58], [00:28:01]. Flowchart: C++
  parent first; cast freely to always-loaded Blueprints (player, GameMode, GameInstance); else
  declare in C++ and override, or an interface; type checks with IsA (Soft) (5.5) or tags [00:29:06]
  to [00:31:19].
- GetAllActorsOfClass is hash-bucketed and fine for a few dozen results even per frame; WithTag and
  WithInterface scan every actor [00:37:17], [00:38:56].
- ChildActorComponent only for simple visual or VFX attachments, never nested, never replicated
  [00:40:37], [00:41:11].
- Cook rules: Map rule Always Cook, Is Editor Only off [00:44:27]; fix redirectors on a schedule in
  teams [00:48:04].
- Measure in a packaged Development build; editor Blueprint tick overhead is about 2x [00:05:00].

## Epic technical account manager, Singapore (name not captured): Making Better Blueprints (mW0IlgjF-iw, Unreal Fest 2022, UE 5.0)

- Pure nodes re-evaluate for every consumer: cache a pure result before a loop or Timeline
  [00:09:26].
- An unconnected Spawn Actor node still hard-references its class [00:19:24]; big data tables should
  hold soft references [00:20:59].
- `dumpticks` lists every ticking object with tick group and prerequisites [00:16:42]; Initial Life
  Span instead of destroy logic [00:16:09].
- Data tables and composite tables with CSV or JSON round trips move balancing out of graphs
  [00:41:58] to [00:43:32].
- His Tick-alternative and Get All Actors performance claims are superseded by Arnbjörnsson's 2024
  measurements; the decoupling advice stands.

## Epic Blueprint docs (5.8 pages)

- Four communication methods: direct reference, event dispatcher (one to many), interface (same
  call, different response), cast (specialized access). The Casting examples predate hard-reference
  guidance.
- Functions vs macros: macros inline and may hold latent nodes, functions are overridable and
  callable from other Blueprints.
- Synchronous loads spike frame time; soft references plus async loads for optional content.

## Zhi Kang Shao [?] (Epic Tech Dev Relations, gameplay systems): GAS designer examples (8bi0rnXnRj4, Unreal Fest Bali 2025) and Persisting World State (KBn62trwkLw, Unreal Fest Chicago 2026, UE 5.8)

GAS

- "Gameplay effects are what to do to an actor and gameplay abilities are when" [00:19:25].
- Features compose as new assets that listen through tags: freeze and shatter were added without
  touching the chill spell [00:47:35].
- Attributes manage numbers, tags manage state, categories and signals [00:02:28]; tags from GEs
  need a duration, instant cases add a loose tag [00:33:04].
- One reusable `AN_SendGameplayEvent` notify with an instance-editable tag gives frame-accurate
  ability timing; the ability waits on the event [00:10:46], [00:11:56].
- Always End Ability or it can never re-trigger [00:13:02]; Wait Delay (GAS task) instead of Delay
  [00:43:03]; cache values before latent nodes [00:42:32].
- Query a GE's asset tags (what it is), not its target tags (what it grants); Epic and Fortnite set
  the `AbilitySystem.Fix...` cvar [verify name] to 0 [00:21:43], [00:22:17].
- Effect-granted abilities with removal tag requirements give a target a listening ability exactly
  as long as a debuff lasts [00:28:41] to [00:29:45].
- One damage GE, many damages: SetByCaller keyed by a tag, also for random item stats [00:49:12] to
  [00:50:19]. "Never use the old actor Apply Damage function" [00:32:24].
- Test in isolation: GE on self from a debug key, `AbilitySystem.Effect.Apply` [verify], then the
  gameplay debugger (blue granted and active, yellow granted inactive) [00:08:34], [00:21:12],
  [00:24:08], [00:35:38]. Both isolation targets in the talk had fixed magnitudes (the melee GE: 50
  on the meta attribute `AbilityDamage` [00:07:40]; the console test: `GE_Debuff_Cold_Frozen`
  [00:21:12]). [added, engine behavior, verify]: a SetByCaller magnitude exists only when code sets
  it on the spec, so a SetByCaller GE applied from the console applies 0 and logs the missing
  magnitude; test it through its ability and use a fixed twin on the console.

Persistence

- Under World Partition, actors can BeginPlay and EndPlay more than once; a streamed-out level is
  reused if GC has not run, reloaded if it has: BeginPlay must be idempotent [00:06:55] to
  [00:08:01].
- Object path names are stable only within a build; ActorGuid is editor-only [00:09:37].
- SaveGame properties into an archive (generic, metadata overhead) vs custom Serialize (compact,
  manual versioning) vs JSON [00:10:42] to [00:13:30]; store your own version numbers, regions may
  be saved at different versions [00:12:58], [00:13:30].
- Restore before BeginPlay; Blueprint-added components get values after BeginPlay, so use
  PostRestore [00:15:05], [00:22:28]; do not double-restore item-granted effects [00:28:31];
  StateTree `ForceTransition` for restoring AI state [00:26:53].
- Level Streaming Persistence plugin: useful but experimental, "not used in any of Epic's titles"
  [00:17:01].
- Instanced Actors for stationary repeated interactables (about 5x faster streaming of 1000
  instances) [00:36:19]; Mass for movable spawnables at scale [00:30:09].

## Epic GAS docs (5.8) and tranek GASDocumentation (community, UE 5.3 era, with Dave Ratti Q&A)

- ASC on the pawn for AI and non-respawning players; on the PlayerState when attributes survive
  respawn (raise PlayerState NetUpdateFrequency) (tranek 4.1).
- Replication mode: Full (single player), Mixed (player-controlled), Minimal (AI); "the sooner into
  your project you set these, the better" (Ratti via tranek 7.3).
- Init: ASC on pawn: server `PossessedBy`, client `AcknowledgePossession` on the PlayerController;
  ASC on PlayerState: server `PossessedBy`, client `OnRep_PlayerState` (tranek 4.1.2). Missing
  client init: `Can't activate LocalOnly or LocalPredicted ability ... when not local!` (tranek
  9.1). Mixed mode needs the OwnerActor's owner to be the Controller; `PossessedBy` sets it for a
  pawn since 4.24 (tranek 4.1.1).
- Gameplay debugger: tags, effects and abilities on other characters, not attribute current values;
  Abilities category on numpad 3, rebinding needed on a MacBook (tranek 6.2).
  `log LogAbilitySystem VeryVerbose` (tranek 6.3).
- Gameplay Cues are unreliable: cosmetic only; `PlayMontageAndWait`, not `PlayMontage` (Epic,
  Handling Cosmetic Effects; tranek 9.3).
- Not predicted: GE removal, periodic ticks; cooldowns penalize high latency; do not predict damage
  or death (tranek 4.10; Ratti Q&A item 7).
- `showdebug abilitysystem` needs a HUD class; `bUseDebugTargetFromHud=true` (tranek 6.1).
- Thousands of damageable actors each with an ASC cost memory: Fortnite creates ASCs lazily (tranek
  7.5).

## Michael Noland and Simone Lombardo (Epic): Lyra overview (Fj1zCsYydD8, 2022, UE 5.0)

- Framework actors "tarball" into tens of thousands of lines; compose features into them;
  server-only logic in GameState components so code and data travel together [00:03:22].
- Experiences as data-driven game modes; Game Feature Plugins prove removability [00:04:07],
  [00:07:45].
- Input Action -> input tag -> ability: the pawn holds no input and abilities ship later without
  touching it [00:34:01] to [00:35:37]; equipment remaps a tag to another ability [00:39:26].
- New content is a child of a prebuilt parent with changed defaults (`GA_WeaponFire_SMG`)
  [00:50:07]: the practical substitute for graph authoring.
- Bots idle without a NavMeshBoundsVolume [00:31:36].
- PMI shown in the talk is deprecated since 5.4.

## Epic Mass framework engineer (name unverified): Unlearning OOP (UXA8axmAb-U, Unreal Fest 2026, 5.8 era)

- Entities are not actors, fragments are closer to member variables, processors are not ticks
  [00:08:46], [00:17:44]; keep processors small (writing more than one fragment deserves a second
  look) [00:17:25].
- In ECS, iterate and change composition with tags instead of firing events [00:07:59].
- Consider one unified Mass implementation before an actor/Mass LOD split, which breeds hydration
  bugs [00:29:41], [00:30:44].
- The Mass debugger breaks on an entity before a processor writes, which data breakpoints cannot do
  [00:29:11].

## Mikko Mononen (Principal AI Engineer, Epic): State Tree Deep Dive (YEmq4kcblj4, Unreal Fest 2024, 5.4/5.5)

- General-purpose hierarchical state machine, not only AI (Matrix 30,000 NPCs, Fortnite smart
  objects) [00:00:16], [00:01:06].
- Selection finds a leaf before any transition; enter conditions re-evaluate only when a transition
  requests selection [00:11:22].
- "Why did it go to the root": implicit fallbacks when a state has no completion transition or every
  guarded option fails [00:13:39] to [00:14:46]. Explicit success and failure transitions
  everywhere; pathfinding failure is "a big part of the whole behavior" [00:06:04].
- Transitions evaluate leaf to root (parents hold shared transitions); a failing intermediate task
  starts completion handling there [00:06:44], [00:07:18].
- Data by binding, not a Blackboard: context data, parameters, global tasks, state parameters,
  earlier tasks; properties typed Input, Output, Context [00:16:05] to [00:21:31]; property
  references for write-back or large data.
- State Tree parameters are set per asset reference, "like per-character tuning" [00:16:40]; unbound
  Inputs are compile errors [00:18:19].
- The active states and their tasks form a stack; ancestors' tasks run too [00:03:26]. Expecting
  Behavior Tree style continuous condition checks is a mistake: "send an event or add a transition
  that re-selects" [00:11:22].
- Events are the most efficient transitions [00:15:01]; linked assets, parallel trees, linked
  overrides by tag [00:22:25] to [00:26:14].
- Blueprint tasks for iteration, C++ for runtime efficiency [00:28:05]. Debugger with breakpoints
  and forced transitions [00:30:26].
- 5.6 changed completion: before, a state completed when any task finished; Task Control Flow now
  chooses (5.6 notes).

## Bruno (Senior AI Programmer, CI Games): Scalable AI for Lords of the Fallen (XKQfMZOXFv0, Unreal Fest 2025, shipped on 5.3)

- One navmesh for many enemy sizes: agent radius = smallest class, cook-time width flags in poly
  flags, size-aware query filter [00:05:17] to [00:09:44] (C++).
- Corridor-based path offset for big capsules, async 0.2 to 0.5 s, skip straight paths; budget logs
  exposed paths to the world origin [00:11:33] to [00:16:25]; 20 active enemies cap [00:16:25].
- Behavior Tree tasks delegate to Gameplay Abilities with a payload and a per-task timeout
  [00:17:37] to [00:19:48].
- Per-enemy data assets (stats, abilities, tag-to-montage maps, trees to inject) [00:19:48] to
  [00:21:59].
- Replace the master Behavior Tree with a perception StateTree plus reaction StateTrees as data
  (priority, queue of one, cooldown, tick conditions) [00:24:09] to [00:32:25].
- Aggro and roles: 1 dangerous or up to 3 weak attackers, cover and spectators keep moving, nobody
  idles [00:36:26] to [00:39:12].

## Epic AI overview docs (5.8)

- Unreal Behavior Trees are event-driven; conditionals are decorators; Simple Parallel, services and
  observer aborts instead of full parallels.
- EQS: filters run before scoring; custom tests are C++ only.
- Mass: never change composition mid-processing directly; use the command buffer.

## Cody Albert (Senior Software Engineer, Epic Tech Dev Relations): UI Performance and Invalidation (VxX1aah6TZM, Unreal Fest Chicago 2026, 5.8 era)

- Turn on Global Invalidation, then verify: widget Tick is called by Paint, so logic that expected
  Tick every frame freezes; that is why it is off by default [00:08:31], [00:10:09].
- Test in a new-window PIE; `stat slate` paint counts off vs on [00:08:31], [00:09:05].
- Cost ladder: child order > layout > render transform (implemented as layout) > visibility
  (Collapsed changes layout, Hidden only repaints) > paint > volatile; a text change is a layout
  invalidation [00:11:17] to [00:14:30].
- Never property bindings ("don't ever use them"); events or Viewmodels [00:24:09].
- Simplify the hierarchy first; no Canvas or Overlay at every root; double-prepass widgets;
  materials for looping effects; SDF fonts or glyph preload [00:22:28] to [00:28:28].
- Lyra modal push repainted 207 widgets; a zero desired-size container fixed it (25) [00:35:03] to
  [00:38:23].

## Epic UMG and Common UI docs (5.8)

- Author at one resolution and DPI 1.0; Scale Box, not Render Transform, for permanent scaling;
  9-slice art.
- Common UI needs `CommonGameViewportClient`; style assets instead of inline styles; Default Gamepad
  Name must match a controller data asset. 5.8: Common UI Production Ready and unified with Enhanced
  Input.

## Epic reflection docs (5.8)

- `EditDefaultsOnly` for class defaults, `EditInstanceOnly` for per-placement data; `SaveGame`
  specifier for archive saves; metadata is editor-only.
- Python sees `BlueprintReadOnly/ReadWrite` members as attributes and editor-visible properties
  through `get/set_editor_property`; mark tuning `EditDefaultsOnly` so Python can set it [added from
  the Python docs].

## Sam Deiter (Senior Unreal Engine instructor, Epic): Getting Started with MCP in UE 5.8 (k0tgmrBuIJc, 2026)

- Enable Unreal MCP, All Toolsets and Editor Toolset (the docs omit the third) [00:06:00].
- Name the Blueprint asset, not the placed instance: "add a box to the player" landed on the level
  instance [00:24:20] to [00:27:49].
- Blueprints as containers, logic in C++: his sample game keeps event graphs empty [00:40:30].
- LLM habits: timers as about 150 Delay nodes; guard with a build check that errors on Event Tick
  [00:56:45], [00:57:19].

## Disagreements and deciding conditions

| Topic                            | Position A                                                               | Position B                                                                               | Deciding condition                                                                           |
| -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Blueprint or C++ for a system    | Blueprint first, move toward C++ as design settles (Forsythe [00:07:48]) | C++ for fundamental, shared, hot, engine-only or co-edited systems (Forsythe [00:39:06]) | Toolchain, profiler evidence, diff and merge needs; for an agent C++ wins whenever it builds |
| GAS or not                       | GAS for growing ability and status interactions (Shao [00:01:11])        | GAS targets RPG, action, MOBA; C++ foundation mandatory (GAS doc)                        | Ability count, statuses, cooldown UI, multiplayer, C++ available                             |
| ASC placement                    | Pawn (tranek 4.1)                                                        | PlayerState (tranek 4.1)                                                                 | Attributes must survive respawn                                                              |
| Interface or cast                | Interfaces as default (docs; mW0IlgjF-iw [00:48:18])                     | Cast to a C++ base first (Arnbjörnsson [00:30:10])                                       | C++ available and target always loaded vs unrelated hierarchies                              |
| Tick alternatives                | Timers and Timelines (mW0IlgjF-iw [00:14:30])                            | The work is the cost (Arnbjörnsson [00:10:31])                                           | Per-frame need: Tick; occasional: timer; thousands: aggregate or Mass                        |
| Get All Actors                   | "Very rarely" right (mW0IlgjF-iw [00:45:40])                             | OfClass fine for a few dozen per frame (Arnbjörnsson [00:37:17])                         | Decoupling vs performance; WithTag/WithInterface never per frame                             |
| Behavior Tree, StateTree, hybrid | StateTree for new AI (Mononen)                                           | Existing BTs as leaves under a perception StateTree (Bruno [00:26:54])                   | Existing library and team skill                                                              |
| UMG bindings                     | Acceptable on simple screens (UMG doc)                                   | Never (Albert [00:24:09])                                                                | Shipping UI: never                                                                           |
| Collapsed vs Hidden              | Collapse unused widgets (classic)                                        | Hidden only repaints under invalidation (Albert [00:12:53])                              | Frequently toggled: Hidden; rarely shown: Collapsed                                          |
| Actor LOD                        | Actors near, Instanced Actors or Mass far (Shao)                         | One unified Mass implementation (Mass engineer [00:29:41])                               | Near-field richness vs scale and ECS skill                                                   |
| Events vs polling                | Delegates in the actor world (Forsythe [00:19:58])                       | Iterate and tag in Mass (Mass engineer [00:07:59])                                       | Actor world vs Mass world                                                                    |
| Predicting damage                | Possible (tranek 4.10)                                                   | Not done by Epic, not recommended                                                        | Almost always do not predict                                                                 |
| Cooldowns                        | Cooldown GEs                                                             | Custom bookkeeping (Fortnite weapons)                                                    | Competitive high-latency fire rates                                                          |
