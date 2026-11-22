---
name: scenario-unreal-gameplay
description: 'Use when building or debugging UE5 gameplay: a character with double jump or dash, abilities with cooldowns, enemy AI that patrols, chases and attacks, a health bar or HUD; choosing Blueprint vs C++, GAS or not, StateTree vs Behavior Tree, EQS or Mass; setting up Enhanced Input, Common UI or UMG; replication, RepNotify, save games, World Partition state; "Blueprints are slow", Tick, casts and hard references; "ability won''t activate", "enemy ignores the player"; or writing automated gameplay tests with injected input.'
license: MIT
---

# Unreal Gameplay (framework, Blueprint vs C++, input, GAS, AI, UI)

Expert level means every piece of data lives in the class whose lifetime and network presence match
it, logic is text (C++ or small functions) under data-only Blueprints and data assets that Python
configures, and every mechanic is proven in isolation (injected input, debug commands, traces)
before it is judged in play. The agent does not pretend to author graphs it cannot reach: it states
which surface each piece lands on and escalates only the residue. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** Unreal is not installed. The offline layer passed
(`python3 tests/code/unreal-gameplay/run_all.py --offline`). Every in-editor snippet and generated
C++ file is **not yet run in Unreal** (C++ not yet compiled); `job_00_gameplay_probe.py` answers the
`[verify]` names.

## Stance (the expert delta)

- **Place data by lifetime and network presence.** GameMode is server-only rules; GameState and
  PlayerState replicate to all; PlayerController is owner-only; the Pawn is a respawnable body;
  GameInstance subsystems outlive maps (Forsythe IaU2Hue-ApI [00:13:26]). State goes in replicated
  properties with RepNotify, never multicast; C++ RepNotify does not fire on the server (JOJP0CvpB8w
  [00:10:50], [00:14:48]). Under World Partition BeginPlay can run several times: keep it idempotent
  (Shao KBn62trwkLw [00:07:29]).
- **C++ base, data-only Blueprint child; Blueprint may depend on C++, never the reverse** (Forsythe
  VMZftEVDuCE [00:24:10]). Tuning is `EditDefaultsOnly`, asset choices `TSubclassOf` slots,
  cosmetics `BlueprintImplementableEvent` hooks: logic as diffable text, Blueprints as defaults
  Python sets. Broadcasters fire one-way delegates (`OnDied`) that controllers, spawners and HUD
  bind ([00:19:25]).
- **Blueprint cost is per node; the real cost is hard references.** Tick overhead is noise next to a
  CharacterMovement update; casting to a Blueprint class keeps it loaded with the caster
  (Arnbjörnsson S2olUc9zcB8 [00:06:07], [00:28:01]). Move to C++ only what an Insights trace puts in
  the hot set (Forsythe [00:16:33]).
- **Effects are what, abilities are when.** New features are new reactive assets listening through
  tags; reactions query a GE's asset tags; one damage GE with SetByCaller; Wait Delay, not Delay;
  always End Ability; `PlayMontageAndWait`; Gameplay Cues cosmetic only (Shao 8bi0rnXnRj4
  [00:19:25], [00:47:35], [00:21:43], [00:49:12], [00:13:02]; tranek 9.3). A SetByCaller value
  exists only when code sets it, so console isolation tests use a fixed-magnitude twin [added].
- **Wire the ASC on both sides.** On the pawn unless attributes survive respawn (then PlayerState);
  `InitAbilityActorInfo` on the server in `PossessedBy` and on the owning client in the
  PlayerController's `AcknowledgePossession` (or `OnRep_PlayerState`); Mixed for players, Minimal
  for AI, set early; never predict damage (tranek 4.1, 4.1.2, 7.3, 4.10).
- **Input is data with indirection.** Input Action to input tag to ability, so the pawn holds no
  ability logic (Noland, Lyra Fj1zCsYydD8 [00:34:33]); mapping contexts mutually exclusive per
  gameplay state (framework doc).
- **StateTree selects a leaf before any transition and re-checks enter conditions only when a
  transition asks** (Mononen YEmq4kcblj4 [00:11:22]). Every condition that should end a state needs
  an event or a transition; every state gets explicit success and failure ways out, or it falls back
  to the root ([00:14:13]); data by binding, tuning as tree parameters ([00:16:40]); actions
  delegate to a Gameplay Ability with a timeout (Bruno XKQfMZOXFv0 [00:17:37], [00:19:15]).
- **UI updates by events, never property bindings; turn Global Invalidation on, then hunt frozen
  widgets** (Albert VxX1aah6TZM [00:24:09]). Widget Tick runs from Paint, a text change is a layout
  invalidation, Hidden only repaints where Collapsed relayouts ([00:10:09], [00:13:56], [00:12:53]).

## Establish first

| Input                                             | Why it changes the plan                                                                                | Default when silent                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Single player or multiplayer, listen or dedicated | ASC placement, replication mode, prediction, test matrix                                               | single player, authority checks from day one (networking doc)                                             |
| C++ toolchain                                     | Xcode 26.6 is installed; Epic lists 26.0 minimum, 26.1.1 recommended, 26.4 incompatible, 26.6 unlisted | probe build (P3) before promising C++; else Blueprint-plus-data fallback                                  |
| Scale                                             | tens of actors vs hundreds of stationary interactables vs thousands of movers                          | actors; Instanced Actors, then Mass (KBn62trwkLw [00:01:06])                                              |
| Feel targets                                      | jump height, dash distance, cooldown, walk and chase speeds                                            | ask; untouched CharacterMovement defaults "feel like an Unreal tutorial project" (IaU2Hue-ApI [00:23:39]) |
| Frame budget, platform                            | tick and AI caps                                                                                       | 60 fps; numbers to scenario-unreal-performance                                                            |
| Character and level inputs                        | skeleton, montages, notifies; nav bounds, player starts, streaming                                     | from scenario-unreal-animation and scenario-unreal-world-building                                         |

## Authoring surfaces

Scriptable: C++ classes, Blueprint children and their CDO defaults, data assets and tables, Enhanced
Input assets, Gameplay Effect shells, StateTree assets and parameters, widget trees
(`EditorUtilityLibrary.add_source_widget`). Graph content (event graphs, GE modifiers Python cannot
instance, StateTree states and transitions, Behavior Tree nodes) goes through a template duplicated
per variant, Epic's MCP toolsets, 5.8 `BlueprintGraphEditor` after `help()`, or one precise GUI
pass. Full table: procedures P15.

## Workflow

1. **Probe once per engine.** `job_00_gameplay_probe.py` (headless) lists the classes, properties
   and cvars the skill marks [verify], including the `AbilitySystem.Fix...` asset-tag cvar, plus a
   `dumpticks` sample. GATE: `probe.json` written.
2. **Decide.** `ue_gameplay.decide(spec)`: data placement, Blueprint vs C++, GAS or not, AI system,
   ASC placement, init and replication, communication, UI, each with its deciding condition. GATE:
   every datum has owner, replication and survival (respawn, map change, streaming).
3. **Scaffold project and config.** `ue_env.enable_plugins`; `ini_set` for `bUseDebugTargetFromHud`,
   the asset-tag cvar at 0, tags; a GameMode HUD class for `showdebug`. GATE: `config_verdict`
   clean.
4. **C++ layer.** `cpp_scaffold()` (character base, player controller, dash and melee abilities, AI
   controller, StateTree tasks, health widget, native tags), `patch_build_cs()`, `build_command()`,
   editor closed for new reflected members. GATE: build exit 0; `cpp_lint` without errors (it
   includes `ASC_CLIENT_INIT_MISSING`).
5. **Data layer from Python.** Blueprint children and CDO defaults: movement, `JumpMaxCount = 2`,
   `player_controller_class` on the GameMode, and on every AI pawn `ai_controller_class` = the
   controller Blueprint that holds the tree plus `auto_possess_ai` placed or spawned. Input assets
   from `input_plan()`, GE assets from plans checked by `ge_plan_verdict`, StateTree asset, widget
   tree. GATE: `ge_plan_verdict` and `audit_gameplay()` clean.
6. **Graph residue.** Write each tree as a spec, check it with `statetree_spec_verdict`, wire it
   from `statetree_outline` through an MCP toolset or one GUI pass
   ([`references/gui-paths.md`](references/gui-paths.md)), set tree parameters per enemy. GATE: spec
   verdict clean; the tree compiles with no unbound Inputs; `ai_setup_verdict` clean.
7. **Test in isolation, then the chain.** Fixed-magnitude debug GE from the console,
   `showdebug abilitysystem` (3 pages), the gameplay debugger on each AI,
   `log LogAbilitySystem VeryVerbose` read by `gas_log_triage`; then `pie_scenario` or a
   PythonAutomationTest with `Input.+key` injection, judged by analyzers whose thresholds derive
   from the parameters (`analyze_jump`, `dash_expected_cm`, `analyze_cooldown`,
   `state_sequence_verdict`, `health_bar_verdict`). GATE: every scenario passes, no stuck ability,
   no unplanned root entry.
8. **Evidence and review.** Screenshots of the debug pages, `showdebug enhancedinput`, health bar
   before and after damage, enemy per state, navmesh coverage; `ue_review.image_checks` before
   looking. GATE: no blank frame; UI in sync.
9. **Measure.** Development build or new-window PIE: `stat game`, `stat unit`, `dumpticks`
   (`tick_verdict`), `stat slate` with Global Invalidation off and on, and an Insights trace of the
   scenario before any rewrite (`rewrite_gate`). GATE: tick census justified; rewrites only for
   hot-set functions; trace handed to scenario-unreal-performance.

## Numbers

| Value                                                                                                  | Relative to                                                                | Source                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| Tick overhead per actor: BP 3.59 us editor, 1.84 us packaged; C++ about 0.64 to 0.70 us                | 100,000 actors, UE 5.4                                                     | Arnbjörnsson [00:05:00]                  |
| CMC 241 us, PlayerController 125 us per frame                                                          | same Lyra frame                                                            | Arnbjörnsson [00:06:07]                  |
| BP node 0.1 us packaged (0.5 editor); C++ call 0.7 us (0.8 editor)                                     | per call                                                                   | Arnbjörnsson [00:18:48]                  |
| Print String 88.8 to 272.5 us per call                                                                 | Development build                                                          | Arnbjörnsson slides 00:20:10             |
| Fortnite: about 80 ticks per frame client, 700 server                                                  | ticking functions                                                          | Arnbjörnsson [00:11:03]                  |
| GetAllActorsOfClass fine for a few dozen results per frame; WithTag and WithInterface scan every actor | world size                                                                 | Arnbjörnsson [00:37:17], [00:38:56]      |
| Empty Tick: free from 5.6                                                                              | compiler disables it                                                       | myth article                             |
| 20 active enemies cap; async path offset 0.2 to 0.5 s; attackers 1 dangerous or up to 3 weak           | Lords of the Fallen, console, per player                                   | Bruno [00:16:25], [00:15:20], [00:38:40] |
| Lyra modal push repainted 207 widgets; 25 after the fix                                                | paint count                                                                | Albert [00:35:03]                        |
| Jump apex h = v^2 / 2g; a second jump resets Velocity.Z, adding h to the rise at the press             | JumpZVelocity, gravity 980 cm/s^2 x GravityScale                           | physics [added]                          |
| Ground dash = speed x duration + exit coast (about 24 cm from 600 cm/s)                                | GroundFriction 8, BrakingFrictionFactor 2, BrakingDecelerationWalking 2048 | engine model [added, verify]             |

## Quality gates

- **Measurable:** `cpp_lint` (asset paths and dependency direction, multicast state, Reliable RPC in
  Tick, OnRep on the server, client ASC init, widget Tick, Collapsed toggles, repeated BeginPlay);
  `ge_plan_verdict`; `statetree_spec_verdict`; `ai_setup_verdict`; `audit_gameplay` (tick census,
  hard-reference closure, cooldown tags, widget bindings); scenario verdicts with derived
  thresholds; `gas_log_triage` empty; `showdebug abilitysystem` shows no stuck ability; StateTree
  trace without unplanned root entry; `rewrite_gate` behind every rewrite.
- **Visual:** jump arc and dash from a fixed camera; enemy facing and spacing; health bar and
  cooldown UI in sync; no frozen widget with Global Invalidation on; two-client screenshots agree in
  multiplayer.

## Common mistakes

| Mistake                                     | What it looks like                                              | Fix                                                      |
| ------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Transient client data on the GameMode       | clients see nothing                                             | GameState or PlayerState                                 |
| Multicast for a door state                  | late joiners see it closed                                      | replicated property + RepNotify                          |
| Cast from the player to optional Blueprints | long loads, memory resident                                     | C++ base, interface, IsA (Soft)                          |
| "Don't use Tick", Timeline every frame      | same cost, harder code                                          | fewer ticking actors, aggregate, interval                |
| ASC initialized only in `PossessedBy`       | "Can't activate LocalOnly or LocalPredicted ability" on clients | `AcknowledgePossession` or `OnRep_PlayerState`           |
| Ability never ends; Delay inside it         | cannot re-trigger; wait survives cancel                         | End Ability on every path; Wait Delay                    |
| PlayMontage in an ability                   | montage missing on other machines                               | `PlayMontageAndWait`                                     |
| SetByCaller GE applied from the console     | zero damage, missing-magnitude log                              | fixed-magnitude twin (`GE_Damage_Debug`)                 |
| Querying GE granted tags                    | reactions fire on wrong effects                                 | asset tags; asset-tag cvar at 0                          |
| Enter conditions trusted to be polled       | enemy keeps chasing inside attack range                         | event or On Tick transition on the running state         |
| State without a failure transition          | "why did it go to the root"                                     | explicit success and failure transitions                 |
| Delay beside MoveTo in one state            | waits while walking                                             | separate Wait state; 5.6 Task Control Flow               |
| C++ controller class on the enemy CDO       | enemy stands still                                              | controller Blueprint holding the tree; placed or spawned |
| UMG property binding, widget Tick           | per-frame cost; frozen under invalidation                       | events from the attribute delegate                       |
| Collapsed for an often-toggled bar          | layout invalidation per toggle                                  | Hidden                                                   |
| Invalidation tested in the viewport PIE     | no gain seen                                                    | new-window PIE                                           |
| Sync save during play                       | hitch, certification risk                                       | `AsyncSaveGameToSlot`                                    |
| Rewrite from a stat hunch                   | effort, no gain                                                 | Insights trace, `rewrite_gate`                           |
| Hand-picked test threshold                  | a correct build fails                                           | derive it from the parameters                            |
| Agent Blueprint timers as Delay chains      | 150 Delay nodes (Deiter [00:56:45])                             | Timeline, C++ timer, or GAS task                         |

## Handoffs

- **Receives** from scenario-unreal-animation: the character Blueprint child, AnimBP with its
  variable contract, montages with root motion and warp targets, the reusable `AN_SendGameplayEvent`
  notify on hit frames; from scenario-unreal-world-building: levels with nav bounds, player starts,
  streaming ranges, Data Layers, gameplay data as Asset User Data.
- **Delivers** to scenario-unreal-vfx: an event contract (`vfx_event_contract`: tag, trigger,
  payload, radius from gameplay data, window, max rate, spawn path; cues cosmetic only); to
  scenario-unreal-performance: a Development build, the worst-case scenario as an automation test,
  its Insights trace, tick census, AI and ASC counts (`perf_handoff`); to scenario-unreal-animation:
  the tuned movement model before motion matching data (DeVoe FLDXtAV7qsw [00:07:01]); to
  scenario-unreal-pipeline-automation: the automation tests for CI.

## UE 5.8 notes

- Replicated properties auto-register (5.6); Iris Production Ready for licensees, generic
  replication still default; Mover still Experimental.
- Enhanced Input unified with Common UI (Production Ready); Combo trigger deprecated;
  `UPlayerMappableInputConfig` deprecated (5.4).
- GAS: NonInstanced abilities deprecated (5.5); cooldown GE validation (5.7); `GetAssetTags` and
  `GetGrantedTags` in Blueprint (5.7); debug commands under `AbilitySystem.Ability` and
  `AbilitySystem.Effect` (5.4).
- StateTree: Task Control Flow and scheduled ticks (5.6); Rewind Debugger track (5.7); start state
  by tag, reversible bindings, `UE::StateTree::EComparisonOperator` (5.8).
- Blueprint: nativization removed (5.4); IsA (Soft) (5.5); empty Tick free (5.6);
  `BlueprintGraphEditor`, no local variables shadowing members, `bp.MaxAsyncActionCount` (5.8).

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, with timestamps
  and disagreements.
- [`references/procedures.md`](references/procedures.md): full code, test path and status per
  procedure; authoring surfaces (P15).
- [`references/critique.md`](references/critique.md): the rubric the agent uses on its own output.
- `references/gui-paths.md`: editors, menus and settings for the same work.
- [`references/sources.md`](references/sources.md): every source, credential, URL, best timestamps.
- [`scripts/ue_gameplay.py`](scripts/ue_gameplay.py): decisions, scaffolds, lint, GE and StateTree
  spec checks, trace analysis, handoffs; in-editor helpers (not yet run).
- [`scripts/ue_gameplay_cpp.py`](scripts/ue_gameplay_cpp.py): C++ source templates (logic in a C++
  base class, data-only Blueprint children); not yet compiled.
