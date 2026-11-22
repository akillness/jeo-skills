---
name: scenario-godot-gameplay
description: "Use when building gameplay systems in Godot 4.7: enemy AI that patrols, chases and attacks, state machines, behavior trees (LimboAI), NavigationAgent3D pathfinding and avoidance for 100 to 1000 enemies, 'agents stack up' or 'path is empty', hitbox and hurtbox combat, fast bullets going through walls, save and load, inventory, quests, dialogue (Dialogue Manager), input remapping, procedural dungeons, or measuring agent counts and frame time headless."
license: MIT
---

# Godot gameplay systems (gameplay systems programmer)

Target: Godot 4.7.2.stable, Jolt, macOS Apple Silicon.

At expert level, gameplay systems are small contracts that can be tested without a scene: pure
decision functions, Resources for data, groups for discovery. Their cost is measured at the agent
count the game needs before anyone argues about it. The core stance: build the rule as data, run it
headless at `--fixed-fps 60`, then look at one capture. If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run`, the review loop, 4.7 traps).

**Status (2026-10-02):** 16 live tests, the round-2 checks (P15) and the offline suite pass in Godot
4.7.2 ([`references/procedures.md`](references/procedures.md), `tests/code/godot-gameplay/`).
Dialogue Manager 4.1.0, LimboAI 1.8.1 and GUT 9.7.1 were run in their own project copies.

## Stance (the expert delta)

1. **Benchmark with `--fixed-fps 60`, never plain headless.** A headless frame sleeps 6.9 ms
   (`low_processor_usage_mode_sleep_usec`) and runs fewer physics ticks than frames.
   `Performance.TIME_*` monitors refresh about once per second and read 0 under fixed fps. Measure
   wall milliseconds per frame, median of 3, and compare A/B pairs from the same run (observed, P0).
2. **The crowd is not the bottleneck the baseline thinks.** 200 CharacterBody3D enemies with
   NavigationAgent3D avoidance cost about 2 ms per frame on an M5 Max. Cost is linear to 800 agents
   (7.3 ms), and avoidance itself is within noise at 200. Tuning `max_neighbors` or the repath
   interval gave no measurable gain. What avoidance buys is correctness: 0 overlapping pairs against
   3108 without it (P2). Go to server agents plus one MultiMesh (0.26 ms for 200) only when the
   agents need no nodes.
3. **Wait for the mesh you assigned, not for "the map".** The docs say wait one physics frame. Live,
   the first sync took 3. After a rebake the map id moved while the region still served the old
   polygons. Read `region_get_iteration_id` before assigning, wait for it to move, then one more map
   sync (`nav_tools.wait_applied`, P1).
4. **Bake from a group of static colliders.** A new NavigationMesh parses Both (meshes and
   colliders) from the region's children, so an NPC under the region carves a 3 m hole (Bramwell
   2W4JP48oZ8U 00:12:37; measured P1).
5. **Pick the AI tier by the deciding condition.** Use an enum brain for crowds (Shaggy Dev
   oqFbZoA2lnU 00:00:32) and a node FSM for a hero or player character. Use a behavior tree when
   designers author behavior (Chap.C E_FIy2dTkNc), and GOAP only when many generic actions recombine
   (Wahaha Yes cm5Jxo31plw). Budget thinking: 5 Hz with 40 enemies per tick cost 0.07 ms over no AI;
   every enemy every tick cost 0.45 ms (P3).
6. **Hitboxes mask, hurtboxes layer, one HitLog per swing** (Queble cX-vzfmzjnE 00:06:36, 00:12:55).
   New areas start on layer 1 and mask 1 and hit their own owner (P4).
7. **Fast bullets are data, or bodies with CCD.** Without `continuous_cd`, 6 of 8 balls went through
   a 0.1 m wall even at 30 m/s. Jolt clamps at 500 m/s. Ray-swept data bullets drawn by one
   MultiMesh cost 0.35 ms per 1000, against 1.05 ms for pooled RigidBody3D with CCD (P5).
8. **A `.tres` save is code.** A GDScript sub_resource runs on load (Godotneers 43BZsLZheA4
   01:03:14; reproduced P6). Scan before loading, load with `CACHE_MODE_IGNORE`, version and
   migrate, validate values instead of encrypting (01:01:37).

## The NavigationAgent3D contract (P15, measured)

Docs warnings (NavigationAgents page) and Bramwell (2W4JP48oZ8U 00:14:14), measured in 4.7.2 unless
marked:

- **Avoidance needs a `target_position`.** With avoidance on and no target, `safe_velocity` stayed 0
  for 30 ticks; with a target it returned the full 3 m/s.
- **Avoidance never feeds pathfinding.** Agents are circles with no navmesh or physics knowledge, so
  walls still come from the path (docs).
- **One `get_next_path_position()` per physics frame, and none after the end.** Once
  `is_navigation_finished()` is true it still returns the last point (0.93 m away here): stop
  steering there, or the agent creeps.
- **`path_desired_distance` must exceed one tick of travel and the navmesh's float above the floor
  (about 0.3 m).** At 25 m/s (0.42 m per tick) with 0.1, the agent reversed on 1782 of 1800 ticks
  and never arrived; at 1.0 it arrived in 182. With 0.1 and the feet measured at floor height, it
  never left the first path point.
- **Defaults:** `time_horizon_agents` 1.0, `time_horizon_obstacles` 0.0. Lower the horizon if agents
  slow down too early. Too few `max_neighbors` and avoidance is ignored (docs; not measured here).

## Establish first

| Input                     | Why it changes the plan                  | Default                                          |
| ------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Agent count on screen     | nodes vs server agents, think budget     | 200                                              |
| Frame budget for gameplay | the gate for every benchmark             | a quarter of 16.67 ms (4.2 ms) at 60 fps [added] |
| 2D or 3D                  | NavigationAgent2D vs 3D, Area2D vs 3D    | 3D                                               |
| Who authors behavior      | code (FSM, enum) vs designers (LimboAI)  | code                                             |
| Save trust                | own files only vs shared or modded saves | shared: scan or JSON                             |
| Platform                  | input devices, CPU budget                | desktop, keyboard and mouse plus pad             |

## Workflow

1. **Set up the project.**
   - Clone Base3D with `gd_env.base_project("3d", P)` and give it its own `application/config/name`,
     because clones otherwise share `user://`. Run `gg.install(P)`.
   - GATE: project.godot has `3d/physics_engine="Jolt Physics"` and a stated renderer;
     `gd_run.check_all(P)` reports 0 parse errors.
2. **Level navigation.**
   - Static geometry goes in group `nav_source`. Build the mesh with
     `make_navmesh(parsed colliders, source group)`, then `bake`, then `wait_applied`.
   - GATE: `map_get_path` between sample points is non-empty with 0 obstacle crossings; the polygon
     count is above 0; no hole at NPC spawns (P1).
3. **Movement and the crowd.**
   - Enable avoidance; `velocity_computed` drives `move_and_slide`; repath is throttled; steering is
     XZ only.
   - Run `gg.crowd_bench(P, n)` at 50, 200 and 800, then `gg.scaling_verdict`. In your own benchmark
     scene, log `Performance.add_custom_monitor(&"ai/thinks", callable)` and
     `OBJECT_ORPHAN_NODE_COUNT` beside wall time (it read 5 after 5 stray `Node.new()`, P15).
   - GATE: 0 overlapping pairs; exponent under 1.3; the median at the target count fits the gameplay
     budget (`gg.budget_share`); the orphan count is flat. Then a windowed capture of the crowd,
     opened.
4. **AI.**
   - Write the brain as `decide(state, percept)` with hysteresis. Perception is cheap first
     (distance, cone, one ray, stale-hit check). The manager thinks at about 5 Hz with a per-tick
     cap. Far enemies think less: key the tiers on squared distance, because
     `VisibleOnScreenNotifier3D.is_on_screen()` stays false headless and a benchmark would put
     everyone in the far tier (P15). The node FSM is for the hero; LimboAI if designers author.
   - GATE: the GUT transition table is green; the hero scenario history matches the expected
     sequence (patrol, chase, attack, chase, search, patrol); the think-cost A/B is measured (P3,
     P9, P13).
5. **Combat.**
   - Name the layers (World 1, Player 2, Enemy 3, PlayerHurtbox 5, EnemyHurtbox 6, Projectile 7).
     Hitbox and hurtbox come from the kit. Bullets go through `bullet_pool`; bouncing objects are
     RigidBody3D with CCD.
   - GATE: a shared-log swing scores 1 hit; same faction 0; the tunnelling test reads 0 of 8 at the
     top speed; bullets on their own layer (P4, P5).
6. **Persistence.**
   - Typed save Resource with VERSION and `migrate()`, `save_io.save_resource_atomic`,
     `load_resource_checked`; inventories duplicated per holder.
   - GATE: round trip equal; every old fixture loads; the evil fixture is refused; the cache test
     passes (P6, P7).
7. **Dialogue and quests.**
   - Dialogue Manager 4.x `.dialogue` files; quest order is turn in, then continue, then offer.
   - GATE: the import compiles every file with 0 errors; `gg.check_dialogue_text` finds no missing
     cue; a headless walk reaches each branch and mutates state (P8).
8. **Input.**
   - Physical-key actions; gameplay in `_unhandled_input`; remaps go to a ConfigFile.
   - GATE: synthetic press and just-pressed tests pass; the STOP panel consumes a pushed click; the
     remap survives a reload (P10).
9. **Procedural content.**
   - Seeded data first (`dungeon_gen`), validators, then geometry, bake and path.
   - GATE: 1000 seeds with 0 validator failures; the same seed gives the same hash; a path from
     start to boss exists; the top capture is opened (P11).
10. **Wrap up.**
    - Run `test_gameplay_live.py` and copy the evidence. Score yourself against
      [`references/critique.md`](references/critique.md).

## Numbers

| Value                            | Measured                                                                        | Relative to                                          |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 200 bodies with avoidance        | 1.98 ms per frame, 0 overlaps                                                   | M5 Max, fixed fps 60, 60 m arena with 14 obstacles   |
| Scaling with avoidance           | 50 agents: 1.07 ms, 200: 2.00, 800: 7.31 (about 9 µs per agent)                 | same                                                 |
| 200 server agents plus MultiMesh | 0.26 ms                                                                         | same                                                 |
| Think cost, 200 enemies          | budget 0.40 ms, every tick 0.78, none 0.33                                      | 5 Hz, 40 per tick                                    |
| First navmesh sync               | 3 physics frames; rebake applied after 2 to 16                                  | async iterations on (default)                        |
| Bake                             | 5 ms, 180 polygons                                                              | 60 m arena, cell 0.25                                |
| 1000 bullets                     | data 0.35 ms; RigidBody3D with CCD 1.05; without CCD 1.00 (45% miss walls)      | 60 m/s, 2 s life                                     |
| Jolt speed clamp                 | 500 m/s                                                                         | `physics/jolt_physics_3d/limits/max_linear_velocity` |
| Dungeon generate plus validate   | 88 µs median, 1000 of 1000 valid                                                | 14-room main path, 4 branches                        |
| NavigationAgent3D defaults       | radius 0.5, max_neighbors 10, neighbor_distance 50, max_speed 10, avoidance off | 4.7.2 ClassDB                                        |

## Quality gates

- Measurable: crowd metrics (overlapping pairs, min pair distance, stuck, fell through the floor);
  `scaling_verdict`; `budget_share`; GUT (`gd_run.run_tests`) green after one deliberate red;
  `check_all` with 0 parse errors; validators on 1000 seeds; save fixtures; the dialogue compile.
- Visual: windowed captures in a SubViewport (160x90 window), with `gd_review.image_checks` and a
  contact sheet of 1600 px or less, opened and looked at. Look for crowd spacing round the player,
  no agents inside obstacles, and the dungeon path from start to boss.

## Common mistakes

| Mistake                                        | What it looks like                                                                             | Fix                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Benchmarking plain headless                    | about 7 ms per "frame" whatever the load                                                       | `--fixed-fps 60`                                               |
| Path queried right after assigning the mesh    | empty path, agents idle at spawn                                                               | `wait_applied`                                                 |
| Default bake (Both from root) with NPCs inside | holes round spawn points                                                                       | group plus static colliders                                    |
| Avoidance off "for speed"                      | 3108 overlapping pairs, enemies merge                                                          | avoidance on: it costs little at 200                           |
| Vision as one Area3D per enemy                 | broadphase churn                                                                               | distance, cone, one ray [added]                                |
| Trusting a ray hit on a teleported body        | enemy "sees" through a wall                                                                    | stale-hit distance check                                       |
| Hit areas on layer 1 and mask 1                | self-hits, triple damage                                                                       | mask or layer only; HitLog                                     |
| `monitoring = false` in `area_entered`         | "Function blocked during in/out signal"                                                        | `set_deferred`                                                 |
| Bullet bodies on the default layer             | 1000 bodies collide: 110 to 170 ms per frame                                                   | own layer, mask world and targets                              |
| No CCD on fast bodies                          | bullets pass walls at 30 m/s                                                                   | `continuous_cd` or ray-swept data                              |
| Loading a downloaded `.tres`                   | its script runs                                                                                | `load_resource_checked` or JSON with `from_native`             |
| Default `load()` after re-saving               | old values come back                                                                           | `CACHE_MODE_IGNORE`                                            |
| `save.items = [...]` on `Array[String]`        | runtime error or a silent no-op through `set()`                                                | `items.assign([...])`                                          |
| Preloaded inventory `.tres` on every chest     | one chest's loot shows in all                                                                  | `duplicate(true)` per holder                                   |
| Always-succeeding first child in a Selector    | the attack branch never runs (Chap.C E_FIy2dTkNc 00:17:27)                                     | gate first, BTProbability or AlwaysFail                        |
| Logical keycodes in actions                    | WASD breaks on AZERTY                                                                          | physical keycodes                                              |
| Teleport with physics interpolation on         | the body is drawn sliding across the jump [added, not measured]                                | `reset_physics_interpolation()` after the move (method exists) |
| `queue_free()` on an autoload                  | no crash in 4.7.2; every later access is a "previously freed" error reading 0 (docs say crash) | never free one; reset its state instead                        |

## Handoffs

- **Receives:** project layout, autoload policy and save model (scenario-godot-architecture); levels
  with static colliders in `nav_source` and the controller (scenario-godot-3d-world); TileMapLayer
  navigation (scenario-godot-2d); art from scenario-* skills through those two.
- **Delivers:** `state_changed` to scenario-godot-animation; play events and priorities to
  scenario-godot-audio (mix, buses, attenuation and the listener stay there); inventory signals,
  dialogue balloon and remap menu to scenario-godot-ui; hit position and normal to
  scenario-godot-vfx; Resources and pure `decide()` to scenario-godot-multiplayer; benchmark JSON to
  scenario-godot-performance-export.

## Godot 4.7 notes

- Navigation classes are experimental in 4.7.2. Region and map iterations are async by default, so
  syncs take several frames. `region_bake_navigation_mesh` is deprecated: use
  `parse_source_geometry_data` plus `bake_from_source_geometry_data` (or the async variant).
  `region_get_iteration_id` exists. `query_path(params, result, callback)` ran its callback before
  returning (P15): it does not move work off the frame.
- A MultiMesh culls as one box: set `custom_aabb` (exists) and split big crowds by area.
- The NavigationMesh default `geometry_parsed_geometry_type` is Both (2). Default cell size and
  height are 0.25.
- Jolt is the 3D default for new projects from 4.6, but an agent-written project.godot gets
  GodotPhysics3D unless it sets Jolt (lead's delta).
- `duplicate(true)` copies only file-internal subresources (4.5 and later).
  `duplicate_deep(DEEP_DUPLICATE_ALL)` copies external ones too.
- `JSON.from_native` and `to_native` exist; plain JSON numbers come back as floats.
- `InputEventKey.as_text()` prints "W - Physical". A new InputEventKey has device 16
  (`DEVICE_ID_KEYBOARD`).
- Addons: Dialogue Manager is at 4.1.0, where titles are cues; DM3 videos are a version behind.
  LimboAI 1.8.1 ships a "4.6" GDExtension build that runs on 4.7.2.

## References

- [`references/procedures.md`](references/procedures.md) (P0 to P15 with code and live results),
  [`expert-notes.md`](references/expert-notes.md) (judgment by expert, timestamps), `critique.md`
  (rubric), [`gui-paths.md`](references/gui-paths.md) (editor menus),
  [`sources.md`](references/sources.md) (videos, docs, addon hashes).
- [`scripts/gd_gameplay.py`](scripts/gd_gameplay.py): install, `run_job`, `crowd_bench`,
  `scaling_verdict`, `budget_share`, dialogue lint, save scan.
- [`scripts/agentkit/gameplay/`](scripts/agentkit/gameplay/): nav_tools, arena, crowd_bench,
  enemy_body, state machine and states, brain, perception, enemy_manager, hitbox, hurtbox, hit_log,
  combat_layers, bullet_pool, save_io, inventory, quest_rules, dungeon_gen, voice_pool.
