# Procedures (scenario-godot-gameplay, Godot 4.7.2)

Each procedure is runnable code: the reusable part lives in `scripts/agentkit/gameplay/` (installed
into a project's `res://addons/agentkit/gameplay/` by `gd_gameplay.install(P)`), the test job in
`tests/code/godot-gameplay/`. Runner: `tests/code/godot-gameplay/test_gameplay_live.py` (16 tests),
offline: `test_gameplay_offline.py`. Evidence:
`tests/live_evidence/godot-gameplay/results_latest.json` and the dated folder next to it.

**Machine and method.** MacBook Pro M5 Max, macOS, Godot 4.7.2.stable, Jolt, Forward+. Benchmarks
run headless with `--fixed-fps 60` (one physics tick per frame, no sleep, deterministic) and report
wall milliseconds per frame, median of 3 runs. The machine was shared with up to 12 other agents, so
absolute numbers are noisy (run-to-run spread about 15%); compare A/B pairs from the same run.

**Run a job:**

```python
import sys; sys.path.insert(0, "<skills>/scenario-godot-gameplay/scripts")
import gd_gameplay as gg
gg.install(P); gg.copy_jobs(P, "tests/code/godot-gameplay/jobs")
r = gg.run_job(P, "res://jobs/g5_projectiles.gd", {"part": "tunnel"}, fixed_fps=60)
assert r["ok"] and not r["script_errors"], r["error"]
```

Assert on payload keys as well as `ok`. A `run() -> Dictionary` aborted by a script error returns
`{}`, and AgentKit then reports `ok: true` (observed, G6 first run).

---

## P0. Benchmark loop: why `--fixed-fps 60`

A headless run sleeps 6.9 ms per frame (`low_processor_usage_mode_sleep_usec`, 6900, applied when no
window can draw, even though `low_processor_usage_mode` is false). Wall time per frame therefore
measures the sleep, and only 99 physics ticks happen in 240 frames. With `--fixed-fps 60`, frames
take 0.02 ms when empty and each frame is exactly one physics tick. `Performance.TIME_*` monitors
refresh about once per wall second and read 0 under `--fixed-fps`: measure wall time per frame and
compare A/B runs instead. `gg.run_job(..., fixed_fps=60)` adds the flag. Run in Godot 4.7.2 on
2026-10-02 (probe_loop.gd): pass; 6.85 ms per headless frame without the flag, 0.02 ms with it.

## P1. Navmesh from code, and the waits (G1)

Kit: `nav_tools.gd` (`make_navmesh`, `bake`, `iteration_ids`, `wait_applied`, `wait_map_ready`,
`path_hits`), `arena.gd`. Job: `jobs/g1_navmesh.gd`.

```gdscript
const Nav = preload("res://addons/agentkit/gameplay/nav_tools.gd")
var nm := Nav.make_navmesh({"parsed": "colliders", "source": "group", "group": "nav_source",
		"agent_radius": 0.4, "agent_height": 1.8})
Nav.bake(nm, region)                         # parse_source_geometry_data + bake_from_source_geometry_data
var before := Nav.iteration_ids(region)       # read BEFORE assigning
region.navigation_mesh = nm
await Nav.wait_applied(get_tree(), region, before)   # region id moved, then one more map sync
var path := NavigationServer3D.map_get_path(region.get_navigation_map(), a, b, true)
```

Put static level geometry in a group and bake from the group with colliders only. A NavigationMesh's
default is `geometry_parsed_geometry_type` Both and source "root children", which bakes any NPC mesh
or collider under the region as an obstacle. Run in Godot 4.7.2 on 2026-10-02: pass.

- Bake: 5.0 ms for a 60 m arena with 14 obstacles, 180 polygons. Async bake: 5.9 ms over 4 to 16
  frames.
- A path queried in the same frame came back empty (iteration id 0). The first sync took 3 physics
  frames.
- Rebake: the map id changed after 2 frames while the region still served the old polygons (gap 1.27
  m at the old NPC hole). After `wait_applied` the gap was 0.30 m (the navmesh height above the
  floor).
- With an NPC under the region and parsed Both from root, the bake carved a 3.0 m hole. Group plus
  colliders carved none.
- Path: 28 points, 76.6 m against 76.4 m straight, 0 obstacle crossings. The navmesh floats 0.3 m
  above the floor, so steer on XZ.

## P2. 200 agents: avoidance, cost and scaling (G2)

Kit: `crowd_bench.gd` (`run(job)`, modes `body` and `server`), `enemy_body.gd`. Runner:
`gg.crowd_bench(P, n=200, avoidance=True)`. Body mode: CharacterBody3D, a NavigationAgent3D with
`avoidance_enabled`, `velocity_computed` driving `move_and_slide()`, a repath throttle and XZ
steering. Server mode: data arrays plus NavigationServer3D agents, `query_path`, one MultiMesh.

```gdscript
agent.avoidance_enabled = true
agent.velocity_computed.connect(func(safe: Vector3):
	velocity = Vector3(safe.x, velocity.y, safe.z); move_and_slide())
# each physics tick
agent.velocity = desired      # the agent answers through velocity_computed in the same physics frame
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- 200 bodies with avoidance: 1.98 ms per frame (runs 1.88, 1.98, 2.16), 0 overlapping pairs.
- Without avoidance: 1.89 ms and 3108 overlapping pairs: the crowd stacks. Avoidance cost is within
  run noise at 200.
- Server mode with avoidance: 0.26 ms. 1000 server agents: 0.93 ms (earlier dev run).
- Scaling with avoidance: 50 agents 1.07 ms, 200 agents 2.00 ms, 800 agents 7.31 ms. Exponent 0.69
  by `scaling_verdict`, so linear, about 9 µs per agent at 200 and above.
- `velocity_computed` fired inside the physics frame in every call (72,000 calls in the dev run).
- Dev runs made no measurable difference: engine-default avoidance parameters against tuned ones
  (max_neighbors 6, neighbor_distance 4), a repath interval of 0.05, 0.25 or 1.0 s, or one manager
  tick against 200 `_physics_process` calls.
- Capture (windowed, opened): with avoidance, a packed disk of agents round the player. Without it,
  clumps. Server mode looks the same as body mode.

## P3. AI structure: node FSM for the hero, enum brain plus think budget for the crowd (G3)

Kit: `state.gd`, `state_machine.gd`, `states/*.gd`, `hero_enemy.gd`, `brain.gd`, `perception.gd`,
`enemy_manager.gd`. Jobs: `g3_hero_fsm.gd`, `g3b_brain_budget.gd`.

- Node FSM (Shaggy Dev, Bitlytic): states return the next state; `request(from, name)` ignores
  requests from a non-current state; `init(actor)` instead of `get_parent()`.
- Crowd: `brain.decide(state, percept) -> state` is a pure function. Hysteresis pairs: detect 12 m
  and lose 16 m, attack 2.0 m and leave 2.6 m. `enemy_manager.gd` thinks at 5 Hz, at most 40 enemies
  per tick, round robin.
- Perception: squared distance, then the cone, then one ray. Reject a ray hit on the target more
  than 1.5 m from the aim point (the stale broadphase, P4).

Run in Godot 4.7.2 on 2026-10-02: pass.

- Hero history: patrol, chase, attack, chase, search, patrol, with 2 attacks. The wall block was
  seen and the stale request was ignored.
- Think cost for 200 enemies (median ms per frame): no AI 0.33, budgeted manager 0.40, every enemy
  every tick 0.78, node FSM per enemy 0.39 (1200 extra nodes, dispatch only).
- The budget made about 17 thinks and 2.3 rays per tick, against 30 rays per tick for every tick.
  Behavior outcomes were similar.

## P4. Hitbox and hurtbox (G4)

Kit: `hitbox_3d.gd` (mask only, not monitorable), `hurtbox_3d.gd` (layer only, monitoring off,
explicit `receiver`), `hit_log.gd`, `combat_layers.gd` (1 World, 2 Player, 3 Enemy, 5 PlayerHurtbox,
6 EnemyHurtbox, 7 Projectile). Jobs: `g4_hitbox.gd`, `g4b_signal_blocked.gd`.

```gdscript
var log := HitLog.new()                       # one per swing, shared by every shape of that swing
for o in arc:
	var hb := Hitbox.new(self, 10, Layers.Faction.PLAYER, 0.15, sphere, log)
	socket.add_child(hb); hb.position = o
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Three overlapping spheres with a shared HitLog: 1 hit. Without the log: 3 hits.
- An enemy hitbox on an enemy: 0 hits. On the player: 1.
- Areas left on the default layer 1 and mask 1: 1 self-hit.
- The first overlap is reported on physics frame 1.
- `owner` is null for a hurtbox built in code: pass `receiver` explicitly.
- Teleport then ray in the same frame: hit at z 0.5 (the old position). Next frame: z -9.5.
- Setting `monitoring` inside `area_entered` logs "Function blocked during in/out signal. Use
  set_deferred("monitoring", true/false)." `set_deferred` works.

## P5. Projectiles: CCD, the Jolt clamp, bullets as data (G5)

Kit: `bullet_pool.gd` (one ray per bullet per tick from the old to the new position, one MultiMesh,
swap-remove). Job: `g5_projectiles.gd` (`part` tunnel, clamp or cost).

```gdscript
var pool := BulletPool.new(); pool.capacity = 1024
pool.mask = 1 | (1 << 5)          # world + enemy hurtbox (bit = layer - 1)
pool.hit_areas = true
pool.impact.connect(_on_impact)
add_child(pool)
pool.fire(muzzle.global_position, -muzzle.global_basis.z * 90.0)
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Tunnelling, 0.05 m radius sphere against a 0.1 m wall, 8 balls at staggered phases. Without
  `continuous_cd`: 6/8 through at 30 m/s, 6/8 at 60, 7/8 at 150, 8/8 at 400. With it: 0/8 at every
  speed.
- Asking for 800 m/s gives 499.2 m/s: `physics/jolt_physics_3d/limits/max_linear_velocity` is 500.
- 1000 live bullets, median ms per frame:

  | Bullets                            | ms per frame | Wall hits                       |
  | ---------------------------------- | ------------ | ------------------------------- |
  | as data (ray sweep plus MultiMesh) | 0.35         | 10,351                          |
  | RigidBody3D with CCD               | 1.05         | 10,056                          |
  | RigidBody3D without CCD            | 1.00         | 5,592 (about 45% miss the wall) |
  | none                               | 0.003        | 0                               |

- Trap found while measuring: with the bullet bodies on the default layer and mask, the 1000 bodies
  collided with each other. A frame then took 110 to 170 ms. Put bullets on their own layer and mask
  only what they hit.

## P6. Save and load (G6)

Kit: `save_io.gd` (`save_resource_atomic`, `save_text_atomic`, `scan_text`, `load_resource_checked`,
`collect`). Offline: `gd_gameplay.scan_resource_text`. Job: `g6_save.gd`, typed save
`jobs/save/game_save.gd` (VERSION plus `migrate()`).

```gdscript
SaveIO.save_resource_atomic(save, "user://slot1.tres")          # writes slot1.tmp.tres, then renames
var s = SaveIO.load_resource_checked("user://slot1.tres", ["res://save/game_save.gd"])
if s == null: return                                           # embedded or foreign script: refused
s.migrate()                                                    # version 1 -> 2 steps
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- A `.tres` holding a GDScript sub_resource ran its `_init` on `ResourceLoader.load` (a marker file
  was written). The checked load returned null and the code did not run.
- Cache: a second default `load()` after re-saving returned the cached object (hp 73, not 5).
  `CACHE_MODE_IGNORE` read the file.
- v1 fixture: `health = 42` migrated to hp 42. An unknown field in a file is ignored silently.
- JSON: `JSON.parse_string(JSON.stringify({"gold": 120, "pos": Vector3(1, 2, 3)}))` gives gold as a
  float and pos as the String "(1.0, 2.0, 3.0)". Through `JSON.from_native` and `to_native` the
  round trip is equal, with an int and a Vector3.
- `get_var(false)` on data holding an object returns null and logs ERR_UNAUTHORIZED.
- Typed array trap: `save.set("items", ["x"])` on an `Array[String]` export fails silently (size
  stays 0); a direct `save.items = [...]` through an untyped reference raises "Invalid assignment".
  Use `items.assign([...])`.
- Sizes: `.tres` 297 bytes, `.res` 504 bytes for this save. No temporary file was left behind after
  the rename. The `persist` group collected 3 nodes.

## P7. Inventory and quests (G7)

Kit: `inventory/item.gd`, `inventory/item_stack.gd`, `inventory/inventory.gd` (`add` returns the
leftover, `remove`, `count_of`, `emit_changed`), `quest_rules.gd`. Job: `g7_inventory.gd`, fixtures
`jobs/inv/*.tres`. Run in Godot 4.7.2 on 2026-10-02: pass.

- Four slots, potion max stack 5: adding 12 potions leaves 0 over (5, 5, 2). Adding 3 swords leaves
  2 over. 3 `changed` signals.
- Save: stacks become 3 sub_resources, items stay `ext_resource` paths, and items load back as the
  same object.
- Shared load: two `load()` calls of `chest.tres` give one object, so a potion added to chest A
  shows in chest B.
- `duplicate()` shares stacks. `duplicate(true)` copies stacks and shares items in their own files.
  `duplicate_deep()` is the same, and `duplicate_deep(DEEP_DUPLICATE_ALL)` copies the items too.
- Quest order: turn in, then continue, then offer. Results: "wolves active" gives continue wolves,
  "wolves done" offers iron, both done gives idle, and another NPC still offers its own quest.

## P8. Dialogue Manager 4.1.0 headless (G8)

Project: `tests/projects/godot-gameplay/Dialogue`, with addons/dialogue_manager from the v4.1.0 tag.
Settings: `editor_plugins/enabled` holds the plugin.cfg, and
`autoload/DialogueManager="*res://addons/dialogue_manager/dialogue_manager.gd"`. Then
`gd_run.import_project` compiles `.dialogue` files. Files: `tests/code/godot-gameplay/dialogue/`
(smith.dialogue, broken.txt, g8_dialogue.gd).

```gdscript
var dm := get_tree().root.get_node("DialogueManager")
var line = await dm.get_next_dialogue_line(res, "start", [state])
while line != null:
	if line.responses.size() > 0:
		line = await dm.get_next_dialogue_line(res, line.responses[pick].next_id, [state])
	else:
		line = await dm.get_next_dialogue_line(res, line.next_id, [state])
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Cues: start, wolves, buy. `{{player_name}}` was replaced from the state object.
- `do accepted = true` and `set gold -= 10` changed the state object (gold 25 to 15).
- With the `if` block, the responses arrive as their own line with empty text.
- A response whose `[if gold >= 10 /]` fails still comes back, with `is_allowed` false.
- Compiling a file with `=> nowhere` gives "Unknown cue. (107)". The offline lint
  `gg.check_dialogue_text` finds the same line.

## P9. Behavior tree with LimboAI 1.8.1 (G9)

Project: `tests/projects/godot-gameplay/BT`, LimboAI GDExtension zip (4.6 build) unzipped into
addons/. One `--import` registers the extension (the first import crashed with signal 11, the second
passed). Files: `tests/code/godot-gameplay/bt/`.

```gdscript
var sel := BTSelector.new()
var prob := BTProbability.new(); prob.run_chance = 0.3
prob.add_child(idle_action); sel.add_child(prob); sel.add_child(attack_sequence)
var bt := BehaviorTree.new(); bt.root_task = sel
var inst: BTInstance = bt.instantiate(agent, Blackboard.new(), agent, agent)  # 4th arg: scene root for code-built nodes
inst.update(delta)
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Selector starvation: Idle first and always succeeding gives idle 100 and attack 0 out of 100
  ticks.
- Fix 1, the gated attack sequence first: attack 100 when near, idle 100 when far.
- Fix 2, BTProbability 0.3 on Idle: idle 290 and attack 710 out of 1000.
- A BTPlayer in PHYSICS mode ticked 29 times in 30 physics frames.
- `instantiate()` without a scene root fails ("unable to establish scene root").
- `Blackboard.get_var(name, default)` logs an error for a missing key unless the third argument
  `complain` is false.

## P10. Input: synthetic events, GUI blocking, remap (G10)

Job: `g10_input.gd`. Run in Godot 4.7.2 on 2026-10-02: pass, headless and windowed.

- `Input.parse_input_event` plus `flush_buffered_events`: `is_action_pressed` and
  `is_action_just_pressed` are true in the same frame and `just_pressed` is false next frame.
  `_unhandled_input` got the event once.
- A logical-keycode event does not trigger an action bound to a physical key.
- A new InputEventKey has device 16 (`DEVICE_ID_KEYBOARD`). `as_text()` gives "W - Physical", not "
  (Physical)".
- On this Mac (French AZERTY layout), physical W maps to "Z": bind gameplay to physical keys.
- `keyboard_get_keycode_from_physical` errors on the headless display server.
- GUI: `set_anchors_preset(FULL_RECT)` alone left a 0x0 panel. `set_anchors_and_offsets_preset`
  sized it.
- A click sent with `Input.parse_input_event` reached `_unhandled_input` and never the STOP panel,
  headless and windowed. `get_viewport().push_input(event, true)` (local coordinates) reached the
  panel and the panel consumed it.
- Remap: `action_erase_events` plus `action_add_event`, saved to a ConfigFile, restored as "J -
  Physical". `InputMap.load_from_project_settings()` drops actions added at runtime.

## P11. Seeded dungeon with validators (G11)

Kit: `dungeon_gen.gd` (`generate`, `validate`, `layout_hash`, `build_level`). Job: `g11_dungeon.gd`.
FiddleStone's rule: the main path picks among 3 directions per step, never straight back. Boss last,
side branches end in loot. Two rules were added after the validators failed. A new cell may touch
only its predecessor, otherwise the path folds back beside itself, makes a shortcut and the boss
ends 3 rooms from the start (48 of 200 seeds failed before). Branch cells are also checked against
their own branch, otherwise loot rooms get two doors (6 of 200 failed before). Run in Godot 4.7.2 on
2026-10-02: pass.

- 1000 of 1000 seeds valid. Generate plus validate: 88 µs median, 312 µs max. The same seed gives
  the same hash.
- Built level: 56 polygons, bake 1.7 ms. Path from start to boss: 26 points, 61.0 m (grid distance
  78 m).
- `wait_applied` took 10 to 16 frames here; waiting only for "map iteration > 0" returned at once
  with an empty path.
- Capture opened: start green, boss red, 4 loot dead ends, path line from start to boss.

## P12. Gameplay voice pool (G12)

Kit: `voice_pool.gd` (free voice, else steal the oldest of equal or lower priority, else drop;
per-stream throttle). Job: `g12_voice_pool.gd`. The mix itself belongs to scenario-godot-audio. Run
in Godot 4.7.2 on 2026-10-02 (Dummy driver, headless): pass.

- `playing` is true on the Dummy driver, so pool logic can be tested headless.
- With 4 voices: 9 played, 5 stolen, 1 low-priority request dropped, and a repeat of the same stream
  within the throttle window was refused.
- AudioStreamPlayer3D defaults: area_mask 0, max_polyphony 1, unit_size 10, max_distance 0.

## P13. Unit tests with GUT (G13)

Tests: `tests/code/godot-gameplay/gut/test_gameplay_rules.gd`: the brain transition table
(parameterized, 11 rows), inventory overflow plus signal count, quest order, dungeon determinism.
Install with `gd_env.install_gut(P)`, run with `gd_run.run_tests(P)`. Run in Godot 4.7.2 on
2026-10-02: pass. The red variant (one row ignoring the hysteresis band) failed with "1 failed of
4". Green: 4 tests, 17 asserts, 0.47 s.

## P14. Parse check and project settings

`gd_run.check_all(P)` on Work3D, Dialogue and BT: 0 parse errors. t_setup checks
`3d/physics_engine="Jolt Physics"` and Forward+ in each project.godot. Each clone gets its own
`application/config/name`: Base3D clones otherwise share one `user://` folder
(`app_userdata/Base3D`) with every other clone on the machine. Run in Godot 4.7.2 on 2026-10-02:
pass.

## P15. Round 2: the NavigationAgent3D contract, monitors, autoload freeing

Added after blind grading (`tests/grading/G8_grade.md`, "missing from both"). Job:
`tests/code/godot-gameplay/jobs/r2_nav_agent.gd` (Work3D, `gg.run_job(..., fixed_fps=60)`); autoload
fixtures in `tests/code/godot-gameplay/r2_autoload/`, run in a scratch Base3D clone with `GameState`
registered as an autoload. Evidence: `tests/live_evidence/godot-gameplay/round2_20261002/`. Sources:
Godot docs, NavigationAgents page (items 1, 3, 4, 20, 21 of the docs digest), Singletons (Autoload)
page (item 6), Bramwell 2W4JP48oZ8U 00:14:14.

```gdscript
# Avoidance-only agent: it still needs a target, or safe_velocity stays zero.
agent.avoidance_enabled = true
agent.target_position = goal
agent.velocity_computed.connect(func(safe: Vector3): body.velocity = safe; body.move_and_slide())
# Each physics tick: one query, and none once finished.
if agent.is_navigation_finished():
	return
var next := agent.get_next_path_position()
agent.velocity = (next - body.global_position).normalized() * speed
# Benchmark monitors (remove the custom one in teardown).
Performance.add_custom_monitor(&"ai/thinks", func(): return thinks_this_tick)
var orphans := Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)
```

Run in Godot 4.7.2 on 2026-10-02 (60 m arena, 14 obstacles, colliders-only bake, `wait_applied`):
pass.

- The snippet above, verbatim, on a CharacterBody3D with a capsule: reached a goal 12 m away in 134
  ticks, stopped 0.92 m short (inside target_desired_distance), orphan count 0.
- Avoidance with and without a target, both fed `velocity = (3, 0, 0)` for 30 ticks: no target gave
  30 callbacks with `safe_velocity` length 0.0 (and `is_navigation_finished()` true at once); with a
  target, 3.0 m/s.
- Fast agent moved directly along a 28-point path (no physics), feet set to the path point height
  each tick: `path_desired_distance` 0.1 at 25 m/s (0.42 m per tick) reversed direction on 1782 of
  1800 ticks and never arrived; 1.0 and 2.0 arrived in 182 ticks with 0 reversals; at 5 m/s, 0.1
  also arrived (909 ticks). Feet kept at floor height with 0.1: stalled at the first point for all
  1800 ticks (the navmesh floats about 0.3 m above the floor, P1).
- After arrival, `get_next_path_position()` still returned the last path point 0.934 m from the body
  (target_desired_distance 1.0).
- NavigationAgent3D defaults: time_horizon_agents 1.0, time_horizon_obstacles 0.0, max_neighbors 10,
  neighbor_distance 50, path_desired_distance 1.0, target_desired_distance 1.0, path_max_distance
  5.0. Not measured: the docs' warnings on lowering time horizons and max_neighbors.
- `Performance.add_custom_monitor` then `get_custom_monitor` read 40; `OBJECT_ORPHAN_NODE_COUNT`
  went 0 to 5 after 5 `Node.new()`.
- `NavigationServer3D.query_path(params, result, callback)`: the callback had run and the result
  held 28 points before the call returned (0 frames).
- `VisibleOnScreenNotifier3D` 10 m in front of a current Camera3D, headless: `is_on_screen()` false,
  0 frames drawn.
- `Node.reset_physics_interpolation`, `MultiMesh.custom_aabb` exist.
- Autoload: `queue_free()` and `free()` on `GameState` did not crash; the node left the tree. A
  later `GameState.score` from another script logged "Invalid access to property or key 'score' on a
  base object of type 'previously freed'" and returned 0 (the docs say engine crash). Side finding:
  a script that names an autoload and is `preload`ed by a `--script` job fails to compile
  ("Identifier not found: GameState") because the job compiles before autoloads register; `load()`
  it at runtime.
- The first run of the job crashed at exit (signal 11) after its result line, with the custom
  monitor still registered; with `remove_custom_monitor` added the rerun exited 0. The cause was not
  isolated.

## Not yet run

- The LimboAI and Dialogue Manager editors (GUI only; `gui-paths.md`). Their runtime parts are
  tested above.
- Profiling on a GPU or with a visible window at full resolution: everything here is CPU-side
  gameplay cost. Rendering 200 skinned enemies belongs to scenario-godot-performance-export and
  scenario-godot-animation.
- Behavior on device builds (mobile CPU budgets): not run here, no device.
