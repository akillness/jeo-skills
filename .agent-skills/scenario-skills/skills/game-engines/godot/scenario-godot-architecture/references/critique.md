# scenario-godot-architecture: self-review rubric

Score each line pass or fail with evidence: a tool result, a test name or a file and line. A "fail"
on any line marked **(blocker)** means the work is not done. The rest are judgment calls to explain
in the hand-off.

## A. Structure

1. **(blocker)** Every scene instantiates alone with no errors: `audit_scenes` returns `ok` with no
   flags, or each flag is explained.
2. **(blocker)** No reach-up paths (`/root/...`, `../`, `get_parent().get_parent()`) outside
   documented tool code (lint A02).
3. Dependencies come in through `@export` node slots, constructor arguments or the owner setting
   fields before `add_child`. A node does not fish for its siblings.
4. The level never creates or owns the player. Spawned projectiles and effects live under a stable
   root, not under the spawner.
5. One level-change entry point. It is deferred out of physics callbacks and checks the scene type
   before freeing the old level.
6. Process modes are deliberate: a test pauses the tree and proves that the pause UI and transitions
   still run.
7. Autoloads: few, each with one job. The event bus holds signals only (lint A10, A16). 7a.
   Collision layers and masks: no object with layer 0 and mask 0, and no mask bit that no object
   uses as a layer (`audit_scenes`, `unmatched_masks` in procedures P15). 7b. No `preload` chain of
   scenes from an autoload or the main script (lint A09); levels and menus are `load()`ed on demand.

## B. Data

8. **(blocker)** No runtime folder scans of `res://` (lint A03). A registry Resource is built at
   edit time and proven in an exported pack (`pack_smoke`).
9. **(blocker)** One Resource class per file, and every `_init` parameter has a default (lint A07,
   A08). `validate_resources` reports no problems.
10. Definitions are never mutated at runtime. Per-instance state lives in RefCounted or Node
    objects; `duplicate()` is used where a copy is meant.
11. Ids are unique, required fields are set, and ranges are sane (`ItemCatalog.validate()`,
    `validate_resources`).
12. **(blocker)** Every `res://` literal matches the case on disk (lint A11), and files and folders
    are lowercase snake_case (A12). 12a. `.gdignore` files are empty (A15) and sit only on folders
    the game never loads at runtime (it blocks imported assets, not text `.tres`).

## C. Save

13. **(blocker)** Save files are never loaded with `load()`, `ResourceLoader`, `str_to_var` or
    `ConfigFile` (lint A04, A05).
14. The envelope has `format` and `version`, and every version below the current one has a migration
    step with a test.
15. Writes are atomic (`.tmp`, `.bak`, rename) and the `store_*` result is checked. Corrupt files
    fall back to the backup.
16. A whole-game test saves, clears and restores the real entities, and proves types such as int,
    Vector3 and StringName survive.

## D. Input

17. **(blocker)** Every InputMap event that should answer any device has `device = -1`, and a test
    matches pad 1.
18. Keys bind by `physical_keycode`. Rebinding resolves conflicts and keeps the other device family.
    Bindings are stored as JSON, reset works, and nothing `Object(`-shaped is written to `user://`.
19. `project.godot` was re-read after any `ProjectSettings.save()`: Jolt, stretch and the main scene
    are still there.

## E. Code quality

20. **(blocker)** `typing_gate` with the default warnings returns 0. Strict-gate hits are either
    fixed or listed as known (`unsafe_call_argument` on dictionary reads).
21. Style-guide code order, snake_case files, PascalCase classes, past-tense signals, no `&&`, `||`
    or `!`.
22. No `x as T` where a wrong type must fail loudly: use `is` plus a typed local, or a typed
    assignment. 22a. No `var n := get_node(...)` or `$X` inferred as `Node` when a subtype is used;
    no nested typed collections; typed math (`clampf`, `lerpf`, `roundi`) in hot code.
23. Components stay small. No component exists only to wrap one line, and nothing needs 100 of them
    (Firebelley).

## F. Tests and evidence

24. **(blocker)** GUT is green, and the bite test turns exactly the expected test red.
25. Tests assert on signals and public results, and every await is bounded
    (`wait_for_signal(..., 2.0)`). 25a. Any UI built on the core (inventory, debug panel) has a
    windowed capture that was opened (`capture_scene`, P17); headless renders nothing. 25b.
    Repository: `.godot/` ignored, `.uid` sidecars committed, LFS patterns for binaries in
    `.gitattributes`.
26. Evidence JSON is saved, and each claim in the hand-off cites a test or a probe. Anything not run
    says "not yet run" and why (for example C# without a .NET build).

## G. Honesty checks before hand-off

- Every number given to the user was measured here, or is attributed to its source with the version
  it came from (for example Boon's 116% was measured on 4.1).
- Expert rules that live tests contradicted are stated as corrections, not repeated as written.
  Examples: negative scale, `instantiate() as T`, the inner-class mechanism.
- Visual editors are named honestly. The Inspector, the Node dock and the Input Map editor are GUI
  only; the agent wrote the equivalent `.tres`, `.tscn` or `project.godot` text.
