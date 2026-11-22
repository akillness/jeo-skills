---
name: scenario-godot-architecture
description: "Use when structuring Godot 4.7 game code: folders, scenes and nodes, signals or an event bus autoload, custom Resources for item data, components (health, hitbox, hurtbox), an inventory, save and load, InputMap and key rebinding for keyboard, mouse and gamepad, GDScript static typing and style, or GDScript vs C#; or when code is spaghetti, a folder scan breaks in the export, a save loads wrong, the gamepad does nothing, or @onready is null."
license: MIT
---

# Godot architecture (gameplay programmer and architect)

Target: Godot 4.7.2.stable, macOS Apple Silicon.

Expert architecture in Godot means scenes that run alone, data in Resources, behavior in small
components, and every boundary (save file, input, export) proven by a test. This skill holds the
expert rules from the sources, corrected where Godot 4.7.2 behaves differently, plus a tested G1
core (inventory, health and damage, save and load, input with rebinding) and the tools that build
and audit it. If a sibling skill named here is missing from your available skills, load it with
`skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run`, the review loop, 4.7 traps).

**Status (2026-10-02, round 2):** everything below ran in Godot 4.7.2 here. 12 live tests: 11 pass,
the C# check was not run. 30 GUT tests and 17 offline lint checks also pass; round-2 probes are P15
to P17 in [`references/procedures.md`](references/procedures.md).

## Stance (the expert delta)

1. **Every scene runs alone; the owner injects.** A scene that reaches up (`get_node("/root/...")`,
   `../`) is coupled to one tree. Use "call down, signal up, event out" (Eric Peterson, yB3Wv-Lr7pg
   [00:05:54]; Godot docs, Scene organization). An event bus autoload holds signals and no state
   (Peterson [00:17:36]). State is owned high in the tree and injected downward, because `_ready`
   runs children first (Mark Wilson, BgrHnJDt2ww [00:12:29]).
   [`arch_audit.gd`](scripts/agentkit/architecture/arch_audit.gd) instantiates each scene alone and
   flags errors, NodePaths that do not resolve and node exports left empty.
2. **Definitions are Resources; per-instance state is not.** Keep item databases in typed custom
   Resources, not Dictionaries: no id typos, and paths follow file moves (Godotneers, 4vAkTHeoORk
   [00:12:57]). A loaded Resource is one shared instance: a change through one reference is seen by
   the next `load()` (verified), so treat definitions as read-only. Stacks, health and cooldowns go
   in RefCounted or Node objects. For a per-instance copy (durability, rolled stats) use
   `duplicate()` when the Resource is flat, and `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` when
   it holds external sub-resources: `duplicate(true)` kept those shared (verified). One Resource
   class per file, and a default for every `_init` parameter (Godot docs, Resources): an inner-class
   Resource reloaded its field as null, and `_init(p_hp)` without a default lost its fields
   (verified).
3. **Never list folders at runtime; build a registry at edit time.** Folder scans work in the editor
   and break in exports (Godotneers [01:13:35]). In an exported `.pck`, `DirAccess.get_files_at`
   returned only `*.tres.remap` (a naive scan loaded 0 of 3), while `list_directory` and the
   `ItemCatalog` from `build_catalog` found all 3 (verified). The pack is case-sensitive: a
   wrong-case path loaded on macOS with only a "Case mismatch" warning and did not exist in the
   pack, so name every file and folder in lowercase snake_case (Godot docs, Project organization;
   lint A11, A12). A `.gdignore` must be empty and takes no patterns (lint A15). It hides a folder
   from the importer, not from `load()`: an `.svg` inside failed with "No loader found", while a
   text `.tres` still loaded (verified [added]).
4. **A save file is data, never code.** Verified 4.7.2 [added]:
   - a `.tres` written to `user://` with an embedded GDScript ran that script on `load()`;
   - `str_to_var` and `ConfigFile.parse` both built a Node from `Object(Node,...)` text.

   Use a JSON envelope (`format`, `version`, `data`) with `JSON.from_native`. It keeps int,
   StringName and Vector3, while plain JSON returns 3 as 3.0. It refuses objects: it logs an error
   and writes null. Write atomically (`.tmp`, `.bak`, rename) and migrate by version. Plan saving
   from the start (Wilson [00:17:03]).

5. **Stable roots, one level entry point, spawns under a stable parent.** `MainGame` coordinates
   fixed containers, and the level exposes spawn markers and never owns the player (FAT Earth
   Studios, V4SO7foDoW4 [00:04:56]). Projectiles go under `EntityRoot` or `EffectRoot`, because
   freeing a tower freed its children (Godotneers, W8gYHTjDCic [01:05:16]). Change levels at idle
   time (FAT Earth [00:10:13]). Changing level inside `body_entered` logs "Removing a
   CollisionObject node during a physics callback"; `request_level()` defers and is clean. Fix to
   the source's `instantiate() as BaseLevel` [added]: a wrong type gave null and leaked the instance
   after the old level was gone, so check `is BaseLevel` first and free it on refusal (verified).
6. **Input is one table, written by a tool.** `InputActions.defaults()` feeds `setup_input`, which
   writes `[input]` into `project.godot`. Every event uses `device = -1`. Verified: a joypad event
   built in code defaults to device 0 and does not match pad 1. Keyboard reports device 16 and mouse
   32 in 4.7 (version deltas). Bind keys by `physical_keycode` [added]. Store runtime rebinds as
   plain JSON in `user://`, never as InputEvent resources.
7. **Static typing is a gate, not a style.** Typing warnings are off by default (Godot docs, Static
   typing). At warn level (1) nothing prints headless, so `typing_gate` sets them to error (2) on an
   APFS clone. Typed code is faster by less than Boon's 116% (mNa0m2fvGOc [00:01:39]; see Numbers).
   Cast policy (docs, Static typing): `x as T` returns null silently, while a typed assignment
   `var l: Label = node` fails loudly ("Trying to assign value of type 'Button' to a variable of
   type 'Label'") and aborts the function. Use `is` and a typed local, or the typed assignment where
   a wrong type is a bug; keep `as` for a null you handle. `var n := get_node("X")` infers plain
   `Node`, and the gate rejects `n.position` ("not present on the inferred type Node"): write
   `var n: Node2D = $X`. Nested typed collections do not compile ("Nested typed collections are not
   supported"); `Array[Array]` and `Dictionary[StringName, Array]` do. Use typed math: `clampf` ran
   1.70x to 1.74x faster than `clamp` over 1M calls, and `clamp()` on Colors is a parse error, so
   use `Color.clamp()` (verified).
8. **Flip the sprite, not the body.** FAT Earth's rule (zLdTvkLsmgA [00:04:30]) holds, but the cause
   differs. Verified in 2D: shapes followed the mirror, but `move_and_slide` rewrote scale (-1, 1)
   as rotation 180 and scale.y -1, so per-frame `scale.x = -1` flipped the body every frame. Use
   `flip_h` and mirror the marker positions.
9. **`preload` is a strong reference held by the script** (FAT Earth, zLdTvkLsmgA [00:05:34]).
   Verified: a preloaded `.tres` was cached as soon as its holder script loaded, with no instance,
   and stayed cached after the probe dropped the script; a `load()` in `_ready` was released when
   its node was freed. A permanent node preloading menu > cutscene > level keeps the chain alive:
   preload small pieces next to their user, load levels and menus on demand (lint A09).

## Also from the sources (short rules)

| Rule                                                                                                                                                                        | Source                                           | Checked here                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Open sets talk by duck typing: `has_method(&"take_damage")`, groups as classifiers, `propagate_call(&"on_game_over")`, `call_group`. Your own components use `is Hurtbox3D` | Godotneers, W8gYHTjDCic [00:19:36, 00:38:12]     | `propagate_call` reached a grandchild                                                                        |
| A silent collision is a layer or mask bug first                                                                                                                             | W8gYHTjDCic [01:03:09]                           | `arch_audit` flags layer 0 with mask 0; `unmatched_masks` (P16) flags mask bits no object uses as a layer    |
| A state Resource as source of truth lets you dump and reload the whole game to retest a bug. Dev builds only: never load a player-supplied `.tres` (stance 4)               | Szuflita, 1qHPKg_Xovs [00:06:11]                 | dump to `user://debug/`, reload with `CACHE_MODE_IGNORE`: values intact                                      |
| `top_level = true`, or a plain `Node` between two Node2D, cuts transform inheritance                                                                                        | Godot docs, Scene organization                   | parent moved to x=100: both children stayed at x=10, a normal child went to 110                              |
| `ItemList.select()` emits no `item_selected`: call the handler. The list requests 0x0: set `custom_minimum_size` (250 px in the source)                                     | 4vAkTHeoORk [00:53:45, 00:47:32]                 | 0 signals, minimum size (0, 0)                                                                               |
| Craft checks copy the recipe before erasing from it                                                                                                                         | 4vAkTHeoORk [01:07:14]                           | `Inventory.has_all` test                                                                                     |
| A dialog in a captured-mouse 3D game sets `MOUSE_MODE_VISIBLE` and restores the previous mode on close                                                                      | 4vAkTHeoORk [00:37:01]                           | headless reads mode 0 whatever you set: test windowed or by hand                                             |
| Build a debug god mode early (no gravity, no hurtbox, faster)                                                                                                               | zLdTvkLsmgA [00:02:34]                           | concept, not run                                                                                             |
| Git: ignore `.godot/`, commit `.uid` sidecars, LFS patterns in `.gitattributes`, commit cleanly before an add-on or a Godot upgrade                                         | BatteryAcidDev, c3Jf-av_5NE [00:02:40, 00:22:20] | `git check-attr` routes png to lfs; scripts get `.gd.uid`, text `.tres` files do not (git-lfs not installed) |

## Establish first

- 2D or 3D, genre, single or local multiplayer (local multiplayer needs one action set per device,
  not `device = -1`).
- Target platforms (exports are case-sensitive; C# cannot export to the web).
- Language: GDScript by default; C# needs the .NET build plus the SDK (check for a `.csproj`; note
  in [`references/expert-notes.md`](references/expert-notes.md)).
- Save needs (slots, autosave, versioning, cloud), devices (pads, rebinding), and whether a GUI
  editor has the project open (then use scenario-godot-expert's MCP channel).

Defaults when nobody says otherwise: typed GDScript, the layered layout, a signals-only `Events`
autoload, Resources for definitions, JSON saves at version 2, input built from the table, and GUT
tests.

## Workflow

Setup: `import gd_architecture as A`. `P` is your own clone from `gd_env.base_project("3d", ...)`.

1. **Project.** Run `A.unique_user_dir(P, "<unique name>")` (all Base3D clones share one `user://`
   otherwise, observed), then `A.scaffold_folders(P)`, `A.install_core(P)` and
   `A.register_autoload(P, "Events", "res://core/events/events.gd")`, followed by
   `gd_run.import_project(P)`. **GATE:** `project.godot` contains `3d/physics_engine="Jolt Physics"`
   and the stretch lines, with at most a handful of autoloads.
2. **Main scene.** Run `A.build_main_scene(P, props={"player_scene": ...})`. It builds Main
   (always) > Systems; World (pausable) > LevelRoot, EntityRoot, EffectRoot; CanvasLayers HUD 10,
   PauseLayer 20 (when paused), TransitionLayer 30 and DebugLayer 40 (always), with gaps for later
   layers (FAT Earth). **GATE:** `A.audit_scenes(P)` has no flags; the pause test shows World still
   and TransitionLayer running.
3. **Data.** Write `ItemDefinition` `.tres` files (id, max_stack, tags, icon, world_scene). Run
   `A.build_catalog(P)`, then
   `A.validate_resources(P, root=..., cls="ItemDefinition", required=(...))`. **GATE:** 0 problems,
   unique ids, and the reloaded count equals the file count.
4. **Components.** `HealthComponent` (Node: signals, resistances, `died` exactly once), `Hurtbox3D`
   and `Hitbox3D` (Areas; the hurtbox has an exported `health` and a configuration warning),
   `Inventory` (RefCounted: stacks, leftover, all-or-nothing remove), and a thin Player script as
   glue. Keep components dumb (Firebelley, rCu8vQrdDDI [00:03:42]). **GATE:** the GUT tests,
   including a real physics overlap that deals 25 damage.
5. **Save and load.** Add a `PersistComponent` (save_id, properties, the target's `save_state()`) to
   each saved entity. `SaveService.collect`, `write`, `read` and `apply` do the rest. **GATE:**
   tests for the type round trip, the `.bak` fallback after corruption, the v1 to v2 migration (int
   restored), and the whole game (inventory, health, position).
6. **Input.** Edit the `InputActions` table, run `A.setup_input(P)`, and use `InputRemap` at
   runtime. **GATE:** 13 actions, every event `device -1`; tests for `parse_input_event`, a pad 1
   match, conflict moves, and the bindings round trip.
7. **Gates.** Run `A.typing_gate(P)`, `A.lint(P)`, the bite test (break one guard and watch exactly
   one test fail), and `A.pack_smoke(P, out, args)`. **GATE:** all green. See Quality gates.

## Numbers

| Value                                     | Measured here (4.7.2 editor binary, this Mac)            | Relative to                    |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------ |
| Typed vs untyped bubble sort, n=2000      | 82.5 vs 124.1 ms (1.50x; 1.46x to 1.50x over 3 runs)     | Boon 4.1: 116% faster          |
| `Array.sort`, n=200,000                   | 23.5 vs 23.5 ms (1.00)                                   | typing does not help built-ins |
| GUT suite, G1                             | 30 tests, 129 asserts, 0.8 s                             | bite test: 126 of 129          |
| Exported `.pck`, G1                       | 1.59 MB, smoke run 0.3 s                                 | no export templates needed     |
| Strict gate hits (`unsafe_call_argument`) | 33 hits across 8 files                                   | default gate: 0 over 22 files  |
| `clamp` vs `clampf`, 1M calls             | 29.5 to 30.9 vs 17.1 to 17.9 ms (1.70x to 1.74x, 4 runs) | typed math helpers             |

## Quality gates

- **Measurable:**
  - `typing_gate` returns 0 warnings as errors;
  - `lint` returns no error findings (A03 folder scan, A04 user:// `.tres`, A05 `str_to_var`, A07
    inner Resource, A08 `_init` without defaults, A11 path case);
  - `audit_scenes` returns no flags;
  - `validate_resources` returns no problems;
  - GUT is green and the bite test goes red;
  - `pack_smoke` shows `list_directory` and the catalog loading inside the pack;
  - `project.godot` is checked by text for Jolt, the main scene and the autoloads.
- **Visual:** headless renders nothing. For any inventory or debug UI on this core, capture windowed
  with
  `gd_run.capture_scene(P, "res://ui/inventory_debug.tscn", out="captures/inv.png", size=(1280, 720))`,
  run `image_checks` and open the image (P17: 11 frames, 0.17 s). Layout and feel belong to
  scenario-godot-ui and scenario-godot-gameplay. In the GUI editor, Scene dock warning icons appear
  only where intended.

## Common mistakes

| Mistake                             | What it looks like                                 | Fix                                                                                 |
| ----------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Plain `JSON.parse_string` save      | `count` becomes 3.0, Vector3 becomes a string      | `from_native` and `to_native`, or `_restore_ints` for v1                            |
| `ProjectSettings.save()` from a job | header comment and default keys dropped (observed) | expected; re-check Jolt and stretch afterwards                                      |
| `load(path).instantiate()`          | unsafe method access in the gate                   | `var ps: PackedScene = load(path)` or `preload`                                     |
| `@onready` read before `add_child`  | null                                               | set fields in the constructor; read nodes after `add_child` (Godotneers [00:33:06]) |
| GUT 9.7.1 `assert_engine_error(1)`  | test fails, "Use assert_engine_error_count"        | `assert_push_error("text")` or `assert_engine_error_count(n)`                       |

## Handoffs

- **Receives from:** scenario-godot-expert (the brief, channels, toolkit); scenario-* skills (icons
  and models referenced by `ItemDefinition.icon` and `world_scene`).
- **Delivers to:** scenario-godot-gameplay (state machines, combat feel on these components);
  scenario-godot-ui (HUD on `Events` and `Inventory.changed`, rebinding via `InputRemap.rebind`);
  scenario-godot-2d and scenario-godot-3d-world (`BaseLevel` scenes with spawn markers);
  scenario-godot-multiplayer (authority over health and inventory);
  scenario-godot-pipeline-automation (CI for the gates); scenario-godot-performance-export (real
  exports).
- **Form:** the `core/` folder, `project.godot` entries, the tests, and the evidence JSON.

## Godot 4.7 notes

- Typed Dictionaries (4.4) are used in the core. `.uid` sidecars (4.4) must move with their scripts
  (lint A14). `ResourceLoader.list_directory` (4.4) and `duplicate_deep` (4.5) exist.
- `FileAccess.store_*` returns bool (4.4): check it before the rename.
- `class_name` resolves only after `--import`. A script that preloads its own scene fails to parse
  until the `.tscn` exists (verified).
- Agent-written `project.godot` defaults to GodotPhysics3D. Write Jolt explicitly, and re-read the
  file after any `ProjectSettings.save()`.

## References

- [`references/expert-notes.md`](references/expert-notes.md) (principles by expert, timestamps, live
  corrections), `procedures.md` (every tool, test and recorded result),
  [`critique.md`](references/critique.md) (self-review rubric),
  [`gui-paths.md`](references/gui-paths.md) (editor GUI steps),
  [`sources.md`](references/sources.md) (URLs).
- [`scripts/gd_architecture.py`](scripts/gd_architecture.py),
  [`scripts/agentkit/architecture/*.gd`](scripts/agentkit/architecture/),
  [`scripts/templates/core/`](scripts/templates/core/): the tools and the tested G1 core.
