# scenario-godot-architecture: procedures

Every procedure here ran in Godot 4.7.2.stable.official.ed1daf0bf (standard build, headless, macOS,
this Mac) on 2026-10-02.

- Live tests: `tests/code/godot-architecture/test_architecture_live.py`, L1 to L11. Options:
  `--only L6`, and `--skip L9`. L1 is added automatically when a test needs the G1 project.
- GUT tests: `tests/code/godot-architecture/gd/test/*.gd`, run inside the built project by L2.
- Offline: `tests/code/godot-architecture/test_architecture_offline.py`, 17 checks.
- Evidence: `tests/live_evidence/godot-architecture/live_<stamp>.json` and `offline_lint.json`. The
  final full run is named at the end of this file.

The complete code is in the skill folder; each procedure names its files and shows the lines that
matter.

- `scripts/gd_architecture.py`: runner side, system python3.
- `scripts/agentkit/architecture/*.gd`: jobs, copied to `res://addons/agentkit/architecture/`.
- `scripts/templates/core/**`: the G1 core, copied to `res://core/`.

## 0. Setup

```python
import sys
sys.path.insert(0, "<skills>/scenario-godot-architecture/scripts")   # also finds ../scenario-godot-expert/scripts
import gd_architecture as A
from gd_architecture import gd_env, gd_run
P = gd_env.base_project("3d", "<repo>/tests/projects/godot-architecture/<Work>")
A.unique_user_dir(P, "GA_<unique>")       # clones of Base3D all share user:// otherwise (observed)
```

## P1. Project, core, autoload, folders (L1)

```python
A.scaffold_folders(P, layout="layered")    # or "feature"; docs/ and raw/ get an EMPTY .gdignore
A.install_core(P)                          # 15 .gd files into res://core/, never overwrites
A.register_autoload(P, "Events", "res://core/events/events.gd")   # text edit, no ProjectSettings rewrite
gd_run.import_project(P)                   # class_name resolves only after --import
```

`res://core/events/events.gd` holds signals only:

```gdscript
extends Node
signal item_picked_up(item_id: StringName, count: int)
signal actor_damaged(actor: Node, info: DamageInfo, dealt: float)
signal actor_died(actor: Node)
signal game_saved(slot: int)
signal game_loaded(slot: int)
```

**Check by text** (L1):

- `project.godot` has `3d/physics_engine="Jolt Physics"`;
- it has `Events="*res://core/events/events.gd"` and `run/main_scene=...`.

Run in Godot 4.7.2 on 2026-10-02: pass. Import, content job, catalog, validation, main scene and
input all ran in 4.6 to 6.7 s. Jolt was kept, and the autoload and main scene were present.

## P2. Main scene skeleton (L1, L4, `test_main.gd`)

```python
A.build_main_scene(P, path="res://core/main/main.tscn", dim="3d", script="res://core/main/main_game.gd",
                   set_main=True, props={"player_scene": "res://gameplay/player.tscn"})
```

`scaffold.gd:main_scene` builds this tree, sets owners through `AgentBuild.save_scene`, then sets
`application/run/main_scene` with `ProjectSettings.save()`:

```
Main (Node, script main_game.gd, PROCESS_MODE_ALWAYS)
  Systems (Node)
  World (Node3D, %World, PROCESS_MODE_PAUSABLE)
    LevelRoot, EntityRoot, EffectRoot (Node3D, unique names)
  HUD (CanvasLayer 10, pausable)
  PauseLayer (CanvasLayer 20, when_paused)
  TransitionLayer (CanvasLayer 30, always)
  DebugLayer (CanvasLayer 40, always)
```

The level change is the one entry point (`core/main/main_game.gd`). The tested version:

```gdscript
func request_level(path: String, spawn: StringName = &"default") -> void:
	load_level.call_deferred(path, spawn)      # safe from body_entered and other physics callbacks


func load_level(path: String, spawn: StringName = &"default") -> BaseLevel:
	var packed := load(path) as PackedScene
	if packed == null:
		push_error("load_level: %s is not a scene" % path)
		return null
	var node := packed.instantiate()
	if not (node is BaseLevel):                # check BEFORE touching the current level
		node.free()                            # `instantiate() as BaseLevel` would leak it
		push_error("load_level: %s does not have a BaseLevel root" % path)
		return null
	var next: BaseLevel = node
	for old: Node in level_root.get_children():
		level_root.remove_child(old)
		old.queue_free()
	level_root.add_child(next)
	level = next
	if player != null:
		player.global_position = next.spawn_position(spawn)   # Marker3D in group "spawn", by name
	level_loaded.emit(next)
	return next


func spawn(scene: PackedScene, at: Vector3, under_effects: bool = false) -> Node3D:
	var node := scene.instantiate() as Node3D
	(effect_root if under_effects else entity_root).add_child(node)
	node.global_position = at
	return node
```

GUT (`test_main.gd`, 6 tests):

- loading twice leaves 1 child, with the player at (10, 1, -4) under EntityRoot;
- a wrong scene type is refused, the current level is kept, and there are no new orphans;
- a spawned node survives its shooter;
- the direct level change in `body_entered` logs "Removing a CollisionObject node during a physics
  callback is not allowed";
- the deferred `request_level` is clean;
- with the tree paused for 5 frames, World processes 0 frames, while TransitionLayer and PauseLayer
  process more than 3.

Run in Godot 4.7.2 on 2026-10-02: pass (6 of 6). The first version used `as BaseLevel`: GUT reported
6 orphans, and that version was fixed.

## P3. Item definitions, catalog, validation (L1, L9, `test_inventory.gd`)

```gdscript
class_name ItemDefinition
extends Resource
@export var id: StringName
@export var display_name: String = ""
@export var icon: Texture2D
@export_range(1, 999) var max_stack: int = 1
@export var tags: Array[StringName] = []
@export var world_scene: PackedScene
```

```python
A.build_catalog(P, root="res://data/items", out="res://data/item_catalog.tres",
                catalog_script="res://core/data/item_catalog.gd", item_class="ItemDefinition")
A.validate_resources(P, root="res://data/items", cls="ItemDefinition", required=("display_name",))
```

`build_catalog.gd` walks the folder recursively with `ResourceLoader.list_directory`, which skips
`.import` and `.uid` files. It keeps the resources whose script `get_global_name()` is `item_class`,
sorts them by id, fills the typed `items` list and saves. It then reloads with `CACHE_MODE_IGNORE`
and returns `items`, `reloaded`, `ids`, `duplicates` and `ext_resources`. It runs at edit time, as a
job or in CI, never in the game.

`validate_data.gd` reports, for each `.tres`:

- load errors and the class;
- built-in scripts (an inner class or embedded code);
- empty required fields and duplicate ids.

`ItemCatalog.validate()` checks the same at runtime.

Run in Godot 4.7.2 on 2026-10-02: pass. 3 items (ore, potion, sword) and 5 ext_resources, no
duplicates, validation `problems: []`.

## P4. Inventory (`test_inventory.gd`)

`core/inventory/inventory.gd` (RefCounted) has:

- `add(item, amount) -> int`: fills existing stacks, then free slots up to `capacity`, and returns
  the leftover;
- `remove(id, amount) -> bool`: all or nothing;
- `count_of`, and `has_all(needs: Dictionary[StringName, int])`, which never mutates its input;
- `to_save()`, which returns `[{"id", "count"}]`;
- `from_save(data, catalog)`, which reports unknown ids instead of failing.

Definitions are shared; only `ItemStack` (item and count) is per instance.

GUT, 6 tests:

- capacity 2: 7 potions fill both stacks, then adding 4 leaves 1 over, and `changed` fires twice;
- remove 4 of 3 changes nothing and emits nothing;
- `has_all` keeps the recipe dictionary unchanged;
- the save round trip reports an unknown id;
- `load()` returns the same potion instance the catalog holds, and `duplicate()` is independent.

Run in Godot 4.7.2 on 2026-10-02: pass (6 of 6). Bite test (L3): with the guard
`count_of(item_id) < amount` removed, exactly `test_remove_is_all_or_nothing` failed (126 of 129
asserts).

## P5. Health, hurtbox, hitbox (`test_health.gd`)

- `HealthComponent` (Node):
  - signals `health_changed`, `damaged(info, dealt)` and `died`;
  - `resistances: Dictionary[StringName, float]`, plus `invulnerable`;
  - `apply_damage(info) -> float` clamps to the remaining health, and `died` fires once;
  - no heal after death; `save_state` and `load_state`.
- `Hurtbox3D` (`@tool` Area3D):
  - `@export var health: HealthComponent`, whose setter calls `update_configuration_warnings()`;
  - `take_hit(info)` warns and returns 0 when nothing is wired.
- `Hitbox3D`: on `area_entered`, it runs `if not (area is Hurtbox3D): return`, then `take_hit`
  through a typed local.

GUT, 5 tests:

- 40 fire damage at 0.5 resistance deals 20, and 500 deals the remaining 80;
- `died` is emitted once;
- an invulnerable component takes 0;
- an unwired hurtbox gives 1 configuration warning and takes 0;
- a real Jolt overlap: the hitbox is moved from x=5 to x=0, and `wait_for_signal(h.damaged, 2.0)`
  leaves health at 75.

Run in Godot 4.7.2 on 2026-10-02: pass (5 of 5).

## P6. Save and load (`test_save.gd`)

The core of `core/save/save_service.gd`:

```gdscript
static func write(path: String, data: Dictionary) -> Error:
	var envelope := {"format": FORMAT, "version": VERSION,
			"saved_at": Time.get_datetime_string_from_system(true), "data": JSON.from_native(data)}
	var err := DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	if err != OK:
		return err
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	var stored := f.store_string(JSON.stringify(envelope, "\t"))   # bool since 4.4
	f.close()
	if not stored:
		return ERR_FILE_CANT_WRITE
	if FileAccess.file_exists(path):
		DirAccess.copy_absolute(path, path + ".bak")
	return DirAccess.rename_absolute(tmp, path)                    # replaces on macOS (verified)
```

How `read(path)` works:

- `JSON.new().parse` (no log on corrupt text), then a check that the root is an object;
- version 2 and later goes through `JSON.to_native`; version 1 is plain JSON and goes through
  `migrate()`, where `_restore_ints` turns `count`, `level` and `slot` back into ints;
- when the main file is unreadable, it falls back to `.bak` and sets `used_backup`;
- it never calls `load()`, `str_to_var` or `ConfigFile` on save content.

`collect(tree)` walks the "persist" group (`PersistComponent`: `save_id`, `properties`, and the
target's `save_state()`) and returns `{nodes, duplicate_ids}`. `apply(tree, data)` returns the ids
it could not find.

GUT, 6 tests:

- Vector3, int and StringName survive the round trip, while plain JSON turns 3 into a float;
- a corrupted main file falls back to `.bak`, which holds the previous save;
- a v1 file migrates, with `count` back to int;
- a missing file and a JSON array root fail cleanly;
- whole game: 4 potions, 30 damage and position (3, 1, 7), saved, cleared, then restored exactly.

Run in Godot 4.7.2 on 2026-10-02: pass (6 of 6).

## P7. Input map and rebinding (L1, `test_input.gd`)

`core/input/input_actions.gd` is the single table: 13 actions, keys by `physical_keycode`, and every
event built with `device = -1`.

```gdscript
static func defaults() -> Dictionary:
	return {
		MOVE_LEFT: [key(KEY_A), joy_axis(JOY_AXIS_LEFT_X, -1.0)],
		ATTACK: [mouse(MOUSE_BUTTON_LEFT), joy_button(JOY_BUTTON_RIGHT_SHOULDER)],
		DODGE: [key(KEY_SPACE), joy_button(JOY_BUTTON_B)],
		# ... 13 actions in total
	}

static func joy_button(button: JoyButton) -> InputEventJoypadButton:
	var e := InputEventJoypadButton.new()
	e.button_index = button
	e.device = -1          # default 0 answers only the first pad (verified)
	return e
```

```python
r = A.setup_input(P)      # setup_input.gd:apply, then gd_run.audit(P, "project") in r["audit"]
```

`setup_input.gd` calls
`ProjectSettings.set_setting("input/<action>", {"deadzone": DEADZONE, "events": [...]})` for each
action, then `ProjectSettings.save()` and `InputMap.load_from_project_settings()`. Close the GUI
editor first. Afterwards, re-read `project.godot`: the save drops the header and every
default-valued key.

At runtime, `core/input/input_remap.gd` provides:

- `rebind(action, event)`: removes the event from other non-`ui_` actions, returns them, and
  replaces the same family (`kbm` or `pad`) on the target;
- `save_bindings` and `load_bindings`: plain JSON in `user://input_bindings.json`;
- `reset_to_defaults()`, which calls `InputMap.load_from_project_settings()`;
- `is_bindable()`, which ignores stick motion under 0.5.

GUT, 7 tests:

- every event of every action has device -1;
- a keyboard event reports device 16 and matches;
- pad 1 matches `interact`;
- rebinding E to dodge takes it from interact and keeps the pad B binding;
- bindings survive reset and reload, and the file has no `Object(`;
- `parse_input_event` plus `flush_buffered_events` presses and releases `dodge` headless;
- a stick at 0.3 is not bindable, and at -0.8 it is.

Run in Godot 4.7.2 on 2026-10-02: pass. L1 found 13 actions with only device -1 in `project.godot`,
and GUT ran 7 of 7.

## P8. Scene audit (L4)

```python
A.audit_scenes(P, root="res://", exclude=("res://addons/", "res://test/"))
```

`arch_audit.gd` instantiates every `.tscn` alone and flags:

- errors logged while it enters the tree;
- a negative local scale (determinant) on a node that carries physics nodes;
- `collision_layer` 0 together with `collision_mask` 0, and an Area that monitors with mask 0;
- exported NodePaths that do not resolve, and node-typed exports left empty;
- configuration warnings;
- `[connection]` targets with a missing method.

It also lists the CanvasLayer layers with their process modes.

Run in Godot 4.7.2 on 2026-10-02: pass.

- G1: 5 scenes, 0 flags, 4 layers (10 pausable, 20 when_paused, 30 always, 40 always).
- Bad fixture (`gd/fixture/jobs/make_bad_scene.gd`): all 4 traps flagged: negative scale on Flipped,
  DeafArea monitoring with mask 0, Hurtbox.health not wired, and its configuration warning.

## P9. Typing gate (L5, L7)

```python
A.typing_gate(P)                                   # DEFAULT_WARNINGS at level 2 on an APFS clone
A.typing_gate(P, warnings=A.STRICT_WARNINGS)       # + unsafe_call_argument
```

The gate clones the project (`cp -cR`) and sets `debug/gdscript/warnings/<name>=2` in the clone. It
then runs `gd_run.check_all` and sorts the "(Warning treated as error.)" lines by rule. Level 1
(warn) prints nothing headless, so it would always pass. The original `project.godot` is never
touched.

Run in Godot 4.7.2 on 2026-10-02: pass.

- Default gate: 0 over 22 files. It first found 4 hits in the GUT tests (`load(...).instantiate()`,
  a Variant cast, `.size()` on a Variant), which were fixed.
- Strict gate: 33 `unsafe_call_argument` hits in 8 files.
- Untyped fixture: flagged (16 untyped_declaration, 8 unsafe_method_access).

## P10. Trap probes (L6)

The fixture lives in `gd/fixture/` (jobs `probe1` to `probe9`, `res_probe/*.gd`, `warn/untyped.gd`).
It runs in a fresh Base3D clone with its own `user://`, and the payload file is moved out of
`user://` afterwards. Asserted on `AGENT_RESULT`:

| Check                                                | Result                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `JSON.from_native` then `to_native` types            | Vector3, int, StringName, Vector2i kept                                |
| plain JSON `{"n": 3}`                                | float                                                                  |
| `str_to_var('Object(Node,"name":"Injected")')`       | `Node:Injected`                                                        |
| `ConfigFile.parse` of the same value                 | `Node`                                                                 |
| `.tres` in `user://` with embedded GDScript          | `_init` ran on load (env var set to "1")                               |
| default `device` of new events                       | key 16, joypad 0, mouse 32                                             |
| joypad action at device 0 vs pad 1                   | no match; device -1 matches                                            |
| key action at device 0 vs keyboard (16)              | match                                                                  |
| wrong-case `load` on macOS                           | loads, WARNING "Case mismatch"                                         |
| `load()` twice, then mutate                          | same instance, mutation visible; `CACHE_MODE_IGNORE` reads 50          |
| `duplicate(true)` vs `duplicate_deep(ALL)`           | external shared vs copied                                              |
| inner-class Resource                                 | file has `secret = 42` and an empty built-in GDScript; reloads as null |
| `_init(p_hp)` without default                        | "Method expected 1 argument(s), but called with 0", fields lost        |
| scene constructor, self-preload                      | ready_health 90, `@onready` null before `add_child`                    |
| `node as Label` on a Button                          | null, silently                                                         |
| `JSON.new().parse` of corrupt text                   | error, nothing logged                                                  |
| `rename_absolute` over an existing file              | OK, content replaced                                                   |
| `ProjectSettings.save()`                             | `rendering_method` line dropped, Jolt kept, input reloads              |
| plain Node2D scale (-1, 1)                           | reads (-1, 1), rotation 0                                              |
| area and ray under a flipped parent                  | overlap on the mirrored side, ray hit x=-35, normal (1, 0)             |
| CharacterBody2D scale (-1, 1) after `move_and_slide` | reads (1, -1), rotation -180                                           |
| `scale.x = -1` every frame while moving              | alternates (1, -1) r-180 and (1, 1) r0 every frame                     |

Run in Godot 4.7.2 on 2026-10-02: pass (all 31 checks).

## P11. Typed vs untyped benchmark (L8)

```python
A.bench_typing(P, n=2000, reps=5, sort_n=200000)
```

Run in Godot 4.7.2 on 2026-10-02: pass.

- Bubble sort: in the final run, untyped 124.1 ms and typed 82.5 ms (1.50x). Earlier runs gave 1.46x
  and 1.48x.
- `Array.sort`: 23.5 and 23.5 ms (ratio 1.00).
- This was the debug editor binary; release templates were not measured.

## P12. Exported pack smoke test (L9)

```python
A.pack_smoke(P, out_dir, {"root": "res://data/items", "catalog": "res://data/item_catalog.tres",
             "list_property": "items", "load": [...], "wrong_case": "res://Data/Items/Sword.tres"})
```

The test:

- adds a Linux preset;
- exports a `.pck` (no templates needed);
- runs
  `godot --headless --main-pack game.pck --script res://addons/agentkit/agent_job.gd -- ... --agent-call .../pack_probe.gd:listing`
  under `godot_slot`.

Run in Godot 4.7.2 on 2026-10-02: pass.

- The pack is 1.59 MB, and the run took 0.3 s.
- `dir_files` gives only `*.tres.remap`, and the naive scan loads 0.
- `list_directory` gives `ore.tres`, `potion.tres` and `sword.tres`.
- The catalog has 3 items, and all 3 test loads work, including the main scene.
- The wrong case does not exist in the pack.
- `OS.has_feature("template")` is false, because the editor binary runs the pack.

## P13. Offline lint (offline test, L10)

```python
findings = A.lint(P)     # list of {rule, severity, file, line, text, fix}
```

Rules:

- A01 negative-scale flip; A02 reach-up paths;
- A03 runtime folder scan (error); A04 `load("user://*.tres")` (error); A05 `str_to_var` (error);
- A06 `has_method` (info); A07 inner Resource class (error); A08 Resource `_init` without defaults
  (error);
- A09 autoload preloading a scene; A10 stateful event bus;
- A11 `res://` path case mismatch (error); A12 not snake_case;
- A13 missing `.uid` (after import); A14 orphan `.uid`; A15 non-empty `.gdignore`;
- A16 more than 6 autoloads.

Run on 2026-10-02: pass.

- Offline: 15 of 15 rules fire on the bad fixture, the good fixture gives 0 findings, and A13 stays
  silent before import.
- On G1: 0 error findings, and 2 A06 infos in `persist_component.gd`, which are intended.

## P14. C# vs GDScript live check (L11)

Not yet run. No .NET SDK and no Godot .NET build are installed. The standard 4.7.2 build cannot load
C# scripts, and the data volume had 3.0 GiB free on 2026-10-02, too little to fetch both (the .NET
build zip alone is 200 MB) next to the other jobs.

To run it later:

1. Install the .NET 8 SDK and `Godot_v4.7.2-stable_mono_macos.universal.zip`.
2. Create a `.csproj` with `--build-solutions`.
3. Port `HealthComponent` to a `public partial class`.
4. Check `new Basis()` against `Basis.Identity`.
5. Run the same GUT-equivalent test with GoDotTest or gdUnit4.

## P15. Round-2 probes (L12, `gd/fixture/jobs/probe10.gd`, `gd/fixture/r2/`)

Added after the blind grading of G1 (`tests/grading/refactor_godot-architecture.md`). The fixture is
copied to `res://r2/`, the job to `res://jobs/`, and `icon.svg` into `res://r2/ignored/` (which
holds an empty `.gdignore`). The job compiles two scripts from strings on purpose, so it logs 2
parse errors and returns `ok` false; L12 asserts on the result dictionary instead.

```python
r = gd_run.run_script(P, "res://jobs/probe10.gd")
pr = r["result"]["probe"]
```

| Check                                                                                      | Result                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `load()` of an `.svg` in a `.gdignore` folder                                              | null, "No loader found for resource"                                                       |
| `load()` of a text `.tres` in the same folder                                              | loads; `ResourceLoader.exists` true                                                        |
| `button as Label`                                                                          | null, nothing logged                                                                       |
| `var l: Label = button`                                                                    | "Trying to assign value of type 'Button' to a variable of type 'Label'.", function aborted |
| `var a: Array[Array[int]]`                                                                 | Parse error "Nested typed collections are not supported."                                  |
| `Array[Array]`, `Dictionary[StringName, Array]`                                            | compile (OK)                                                                               |
| `clamp(Color, Color, Color)`                                                               | Parse error "argument 2 should be "Color" but is "Color""                                  |
| `Color(2, 2, 2).clamp()`                                                                   | compiles                                                                                   |
| `clamp(5, 0, 3)`                                                                           | returns int (Variant path)                                                                 |
| `clamp` vs `clampf`, 1M calls                                                              | 29.8 vs 17.5, 30.9 vs 17.9, 29.5 vs 17.4, 29.9 vs 17.1 ms (1.70x, 1.73x, 1.70x, 1.74x)     |
| preloaded `.tres` after its holder script loads, no instance                               | cached                                                                                     |
| same, after the probe drops its script reference                                           | still cached                                                                               |
| `.tres` loaded in `_ready`                                                                 | cached while the node lives, released after `free()` and 2 frames                          |
| `has_method`, `propagate_call`, `call_group`                                               | 10 + 5 damage reached the grandchild; `propagate_call` once; a plain Node has no method    |
| state Resource dumped to `user://debug/state_dump.tres`, reloaded with `CACHE_MODE_IGNORE` | health 37, gold 120, (3, 1, 7), `{boss_door: true}`                                        |
| `unmatched_masks` on 4 Areas                                                               | Ghost "layer 0 and mask 0", Hitbox "mask bits 16 match no layer"                           |
| parent Node2D moved to x=100                                                               | child under a plain Node stays at 10, `top_level` child at 10, normal child 110            |
| `ItemList.select(1)`                                                                       | 0 `item_selected` signals, selection [1]; `add_item` returns 0; minimum size (0, 0)        |
| `Input.mouse_mode = CAPTURED` headless                                                     | reads 0 (VISIBLE): the headless display server ignores it                                  |
| `.uid` after `--import`                                                                    | `damageable.gd.uid` exists; `big.tres.uid` does not                                        |

The collision matrix check, for any scene walk:

```gdscript
static func unmatched_masks(objects: Array) -> Dictionary:
	var all_layers := 0
	for o: CollisionObject3D in objects:
		all_layers |= o.collision_layer
	var out := {}
	for o: CollisionObject3D in objects:
		var dead := o.collision_mask & ~all_layers
		if o.collision_mask == 0 and o.collision_layer == 0:
			out[str(o.name)] = "layer 0 and mask 0"
		elif dead != 0:
			out[str(o.name)] = "mask bits %d match no layer" % dead
	return out
```

The typing gate on `r2/warn_infer/infer.gd` flagged line 7, `n.position` after
`var n := get_node("Child")`: "The property "position" is not present on the inferred type "Node"
(but may be present on a subtype)". The typed form `var n: Node2D = get_node("Child")` passed.
`return clamp(a, 0.0, 1.0)` in a `-> float` function was not flagged by the default or the strict
gate, so the case for `clampf` is speed and Color safety, not the gate.

Run in Godot 4.7.2 on 2026-10-02: pass (21 of 21 checks in L12).

## P16. Git hygiene (L12)

```bash
printf '.godot/\n' >.gitignore
printf '*.png filter=lfs diff=lfs merge=lfs -text\n*.glb filter=lfs diff=lfs merge=lfs -text\n' >.gitattributes
git check-attr filter -- art/hero.png player.gd.uid # png: lfs; uid: unspecified
git check-ignore .godot/x.cfg player.gd.uid         # only .godot/x.cfg is ignored
```

Run on 2026-10-02 in a scratch repo: pass. `git-lfs` is not installed on this Mac, so only the
attribute routing was checked, not an LFS push.

## P17. Windowed capture of a debug UI (`gd/fixture/jobs/build_inv_ui.gd`)

```python
gd_run.run_script(P, "res://jobs/build_inv_ui.gd")        # Control > CenterContainer > ItemList 250x160
c = gd_run.capture_scene(P, "res://r2/ui/inventory_debug.tscn", out="captures/inventory_debug.png", size=(1280, 720))
gd_review.image_checks(c["result"]["images"][0])
```

Run in Godot 4.7.2 on 2026-10-02 (`tests/projects/godot-architecture/round2/R2`): pass. 11 frames
drawn in 0.17 s; stretch canvas_items, scale 1.11. `image_checks` ok true, with the info flag
`low_contrast_centre` (dark list on a dark panel). The image was opened: three rows (Potion x4, Iron
ore x12, Sword) in a centered list. Not part of the headless live suite.

## Final full run

`python3 tests/code/godot-architecture/test_architecture_live.py`, 2026-10-02 22:40, took about 19
s.

- L1 to L10 and L12 pass; L11 (C#) was not run.
- GUT: 30 of 30 tests, 129 asserts. Bite: 126 of 129.
- Offline: 17 of 17 (rerun 22:41).
- Evidence: `tests/live_evidence/godot-architecture/live_20261002-224039.json`, logs in
  `logs_20261002-224039/`. The previous full run (21:39, L1 to L11) is `live_20261002-213959.json`.
