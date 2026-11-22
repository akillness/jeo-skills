# Expert notes (scenario-godot-gameplay)

Principles and judgment by expert, with the source and timestamp. "Live" marks what this skill
re-ran in Godot 4.7.2 (procedure number in brackets). [added] marks the skill's own additions.

## State machines and AI structure

**The Shaggy Dev** (oqFbZoA2lnU, 4.1)

- Three tiers: an enum plus `match` for a few simple states, nodes for character controllers
  [00:00:32]. Nodes win in the editor: per-state exports, visual inspection, drag-in reuse
  [00:02:22].
- States return the next state instead of emitting it; the machine gets its parent through
  `init(parent)` instead of `get_parent()`; gravity comes from project settings [00:04:34, 00:06:12,
  00:08:00].
- Live [P3]: the enum brain is a pure function, so GUT checks the whole transition table with no
  scene (11 rows, P13).

**Bitlytic** (ow_Lum-Agbs, 4.0/4.1)

- Signal-driven transitions, names lowered before lookup, transitions from a non-current state
  ignored [00:03:00 to 00:03:32].
- Live [P3]: the stale-request guard caught a late request in the hero run.
- Deciding condition between the two styles: a return value cannot double-fire and is easy to test;
  a signal decouples more (digest).

**Chap.C Games** (E_FIy2dTkNc, LimboAI on 4.3)

- A Selector stops at the first success, so an always-succeeding branch starves its siblings. Fix
  with Probability or Always Fail decorators [00:17:27, 00:23:39]. He adds that the cleaner design
  is a high-priority condition branch inside the tree.
- A BTAction returns RUNNING until its goal, then SUCCESS at a threshold, or the tree stalls
  [00:28:07, 00:34:15].
- Restarting the tree does not reset the blackboard; PlayAnimation succeeds at once, so use
  AwaitAnimation, and a looping animation cannot be awaited [00:21:26, 00:42:08].
- Live [P9], LimboAI 1.8.1: starvation reproduced (attack 0 of 100). Both fixes measured: the
  priority branch first, or Probability 0.3 (attack 710 of 1000).

**Wahaha Yes** (cm5Jxo31plw)

- GOAP plans backwards and executes forwards. Boolean-only world state is the limiting factor
  [00:05:15]. Plans clone objects, and duplicated Nodes leak unless freed [00:10:54].
- Merge always-adjacent actions (go to plus interact) into one spatial action to keep the search
  small [00:12:52].
- Not run here: the addon is unreleased. The [added] choice rule: GOAP only when many generic
  actions recombine. For a 4-state enemy it is overhead.

## Navigation and crowds

**Godot docs, Using NavigationAgents** (note slug `avoidance`)

- Call `get_next_path_position()` once per physics frame and not after the path ends: extra calls
  jitter.
- A path queried before the first map sync is empty: check the map iteration id.
- Avoidance needs a `target_position` even when used for avoidance only, or `safe_velocity` stays
  zero. Avoidance never feeds back into pathfinding: agents are circles or spheres with no navmesh
  knowledge.
- Perfectly head-on RVO tests fail by design. Fast agents overshoot `path_desired_distance`.
- Live [P1]: the first sync took 3 physics frames, not 1. After a rebake, waiting on the map id is
  not enough: wait on the region's iteration id, then one more map sync.
- Live [P15]: no target gave `safe_velocity` 0.0 for 30 ticks, a target gave 3.0 m/s. After arrival
  `get_next_path_position()` still returned the last point 0.93 m away. `path_desired_distance` 0.1
  at 25 m/s reversed on 1782 of 1800 ticks; 1.0 arrived in 182. Defaults: time_horizon_agents 1.0,
  obstacles 0.0. Lower horizons when agents slow too early; too few max_neighbors and avoidance is
  ignored (docs, not measured).

**Bramwell** (2W4JP48oZ8U, 4.2.1)

- The bake includes any mesh child of the region, so keep NPCs outside it or bake from a group
  [00:12:37]. `path_desired_distance` tunes corner clipping [00:14:14].
- Live [P1]: an NPC under the region carved a 3.0 m hole with the default parsed type (Both from
  root). Group plus colliders: no hole.
- [added] Live [P2]: 200 CharacterBody3D agents with avoidance cost about 2 ms per frame on an M5
  Max, linear up to 800 agents. Server mode plus MultiMesh cost 0.26 ms. Tuned avoidance parameters
  gave no measurable gain over the defaults.

**Godot docs, Singletons (Autoload)**

- Never `free()` or `queue_free()` an autoload at runtime: engine crash.
- Live [P15]: 4.7.2 did not crash; the node left the tree and every later `GameState.x` was a
  "previously freed" script error returning 0. The advice stands; the symptom is silent data loss,
  not a crash.

## Combat

**Queble** (cX-vzfmzjnE, 4.5)

- A hitbox has a mask only and a hurtbox a layer only. Clear the default layer 1 and mask 1 on new
  areas first [00:00:48, 00:06:36].
- Multi-shape attacks share a `HitLog` (RefCounted) per swing, so overlapping shapes deal damage
  once [00:12:55 to 00:17:23].
- Live [P4], ported to 3D: shared log 1 hit, no log 3 hits, default layers self-hit. `owner` is null
  for code-built areas: pass the receiver explicitly. Changing `monitoring` inside `area_entered` is
  blocked: use `set_deferred`.
- [added] Live [P5]: Jolt clamps at 500 m/s. Without CCD a 0.1 m wall stops at most 2 of 8 balls
  even at 30 m/s. Bullets as data (ray sweep plus MultiMesh) cost a third of pooled RigidBody3D
  bullets.

## Save and load

**Godotneers** (43BZsLZheA4, 4.2)

- Formats: JSON is readable but loses Godot types; `store_var` keeps types but is unreadable; a
  custom Resource is typed and readable and handles nested graphs [00:10:03 to 00:26:00].
- Two-phase protocol through a group. Save: `call_group("game_events", "on_save_game", saved)`.
  Before load, dynamic nodes remove themselves. Nodes decide what they save, so dead entities write
  nothing [00:34:30 to 00:47:31].
- `remove_child()` before `queue_free()` when clearing a stage [00:30:28]. Typed `SavedData`
  subclasses with `is` guards keep old saves loadable; keep old saves as fixtures [00:57:44].
- Validate loaded values (clamp health) instead of encrypting [01:01:37].
- `.tres` saves can embed scripts that run on load, with no built-in guard [01:03:14 to 01:06:34].
- Live [P6]: the embedded `_init` ran on `ResourceLoader.load`, and the scan plus checked loader
  stopped it. v1 fixture migration works. The cache returns the old object unless you pass
  `CACHE_MODE_IGNORE`.

**Mostly Mad Productions** (xG2GGniUa5o, 4.4)

- Two methods: a Dictionary through `store_var`, which he calls "JSON", for small games, and a
  custom Resource, which carries the script-injection risk [00:00:00]. Encryption with
  `open_encrypted_with_pass` will not stop a determined person [00:02:32].
- Live [P6]: real JSON turns ints into floats and Vector3 into strings; `JSON.from_native` and
  `to_native` round-trip exactly.

**Godot docs, Saving games and Resources**

- Persist nodes need `scene_file_path` and a `save()` method. Nested Persist nodes break NodePaths.
  Resources load once and are shared. Inner-class Resources do not serialize.
- Live [P7]: two `load()` calls return one object, and `duplicate(true)` copies internal stacks but
  not items stored in their own `.tres`.

## Inventory, quests, dialogue

**DevWorm** (X3J0fSodKgs, 4.1)

- An `Inventory` Resource with a fixed slot array, shared by the player, NPCs and chests. The UI
  reads it [00:03:36].
- [added] Live [P7]: emit `changed` from the resource and have the UI listen, instead of polling
  `_process`.

**Pixel Architect** (3OAcDH6l2qA): a Unity project ("Scriptable Object" at 00:05:04). Design only:

- Data-driven stage types (talk, collect, visit, kill, wait).
- Continue an active quest before offering a new one [00:05:04 to 00:13:10].
- Live [P7]: the quest rule order (turn in, continue, offer) is tested.

**Nathan Hoad** (Ydzj1bT_pC8 on DM3; UhPFk8FSbd8 on DM2)

- Dialogue Manager is stateless and runs headless. State lookup order: `extra_game_states`, then the
  current scene, then autoloads [00:00:21, 00:08:14].
- Jump traps: `=><` returns after jumping and `=> END!` ignores pending returns. `do!` skips
  awaiting. Expression jumps are not validated, and files with errors will not run [00:04:35 to
  00:12:07]. Prefer Godot's POT generation for localization [00:14:25].
- The Actionable pattern: an Area on its own layer carries the dialogue and the start cue, and the
  player's finder has a mask only [UhPFk8FSbd8 00:02:51].
- Live [P8] on DM 4.1.0 (current): titles are now "cues" (`~ start`), and response conditions use
  `[if x /]`. A failing response condition still returns the response with `is_allowed` false. An
  unknown cue is compile error 107.

## Procedural generation

**FiddleStone Games** (XXtEMR1hV7g)

- A fixed grid. The main path picks among 3 directions per step with no backtracking. The boss is
  last, and side branches end in loot. No spawn-to-test [00:03:29 to 00:05:20].
- Live [P11]: the rule alone let 48 of 200 seeds fold back into a shortcut (boss 3 rooms away). The
  validators caught it, and the touch-only-predecessor rule fixed it: 1000 of 1000 seeds valid, 88
  µs each.

## Input

**DashNothing** (ZDPM45cHHlI, 4.1)

- Whitelist remappable actions in a dictionary. Strip " (Physical)" from `as_text()`. Call
  `accept_event()` after binding. Reset `double_click` on mouse events. Restore with
  `InputMap.load_from_project_settings()` [00:06:30 to 00:10:55].
- Live [P10]: 4.7.2 prints "W - Physical", so the suffix to strip is " - Physical".
  `load_from_project_settings()` also drops actions added at runtime.

**Godot docs, InputEvent**

- Gameplay goes in `_unhandled_input`. GUI keyboard events do not bubble; GUI mouse events bubble
  through ancestors subject to `mouse_filter`. InputMap changes are not saved.
- Live [P10]: to test GUI blocking headless, push events with
  `get_viewport().push_input(event, true)`; `Input.parse_input_event` clicks did not reach Controls.
