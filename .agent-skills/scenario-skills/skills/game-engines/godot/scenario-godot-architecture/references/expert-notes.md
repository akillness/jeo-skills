# scenario-godot-architecture: expert notes

Principles by expert, with source id and timestamp (YouTube ids; docs by page title). "Verified"
means it ran in Godot 4.7.2.stable.official.ed1daf0bf on this Mac on 2026-10-02 (evidence:
`tests/live_evidence/godot-architecture/live_*.json`). [added] marks rules that come from this
skill's own tests or judgment and not from a source. Corrections to a source are labeled
**Correction**.

## 1. Ownership and scene boundaries

- **Decide ownership before coding** (FAT Earth Studios, V4SO7foDoW4 [00:04:56]), or every scene
  talks to every other scene.
  - `MainGame` is a coordinator, not a god object: it gives stable container roots [00:05:28].
  - The level owns geometry, spawn points and enemy placement. MainGame owns the layer structure,
    high-level systems and transitions [00:05:28].
  - The level never owns the player; it exposes spawn markers [00:06:01]. The cost is that levels
    are harder to test alone; he accepts it as better than every level booting the whole game.
- **Layer order with gaps** (FAT Earth [00:07:44]): world, HUD, Pause, Transition, Debug. He gives
  no numbers. This skill uses 10, 20, 30 and 40 [added].
- **Set process modes on purpose** (FAT Earth [00:08:15, 00:08:57]). A transition that pauses the
  tree stalls the camera and the unpause code, so pause and transition nodes need
  `PROCESS_MODE_ALWAYS` or `WHEN_PAUSED`. Verified: after 5 paused frames, a node under World had
  processed 0 frames, while nodes under TransitionLayer and PauseLayer had processed more than 3
  (`test_main.gd`).
- **One level entry point** that can later grow fades or threaded loading, called at idle time (FAT
  Earth [00:10:13, 00:11:15]).
  - Verified: changing level directly from `body_entered` logs "Removing a CollisionObject node
    during a physics callback is not allowed and will cause undesired behavior. Remove with
    call_deferred() instead." `request_level()` (`call_deferred`) is clean.
  - **Correction [added]:** the source casts `instantiate() as BaseLevel` and treats null as the
    type check. Verified: with the old level removed first, a wrong scene left LevelRoot empty, and
    the refused instance was never freed (GUT reported 6 orphans). The fix in `main_game.gd`:
    instantiate into a `Node`, check `is BaseLevel`, call `free()` on refusal, and only then swap
    levels.
- **A scene must work alone; the parent injects** (Godot docs, Scene organization):
  - signals to respond, a Callable, reference or NodePath to start;
  - `_get_configuration_warnings()` in a `@tool` script documents what is missing.
  - Verified: `Hurtbox3D` without `health` shows its warning, and `arch_audit.gd` flags it as "not
    wired".
- **Own state high, inject down** (Mark Wilson, Chickensoft, BgrHnJDt2ww [00:06:44, 00:12:29,
  00:13:01]). Child `_ready` runs before the parent's, so lower nodes cannot rely on state an
  ancestor creates in its own `_ready`. AutoInject solves this in C#. The GDScript equivalent is
  exported node references, or the parent setting fields before `add_child` [added].
- **Transform breaks** (Godot docs, Scene organization): `top_level = true` or a plain `Node`
  between two Node2D stops transform inheritance. Verified: with the parent moved to x=100, both
  such children stayed at x=10 and a normal child went to 110. Useful for projectiles that must not
  follow the gun; a trap when a plain `Node` groups sprites.
- **Spawn under a stable parent** (Godotneers, W8gYHTjDCic [01:05:16, 01:05:49]): freeing the tower
  freed every projectile it had spawned. Set `global_position` after reparenting [01:07:38].
  Verified: a node spawned with `MainGame.spawn()` survived its shooter being freed.

## 2. Communication

- **Call down, signal up, event out** (Eric Peterson, GodotCon 2025, yB3Wv-Lr7pg [00:05:54,
  00:08:31]). Use an event bus when emitters and listeners sit in unrelated subtrees (world and UI)
  or when you do not know who cares. Use local signals inside one scene area.
  - The Events autoload holds no state, so the usual singleton objections mostly do not apply
    [00:17:36, 00:20:03].
  - Signals can be bucketed in inner objects [00:10:31]. When a payload keeps growing, pack it into
    one event object [00:23:18].
  - Sequence-critical flows need explicit lifecycle events, not ephemeral ones [00:26:51].
  - Downsides [00:14:43, 00:22:08]: anyone can emit from anywhere, cascades are hard to debug, and
    changing signal arguments has weak refactoring support.
- **Communication always has a compromise; do not over-engineer** (Godotneers, W8gYHTjDCic
  [01:09:16, 01:11:40]). Autoloads are acceptable for small games; avoid growing many [00:54:16].
  Lint A16 flags more than 6 autoloads [added threshold].
- **Duck typing** (Godotneers [00:19:36, 00:38:12]): `has_method("take_damage")`, with groups as
  classifiers. It shows up as UNSAFE_METHOD_ACCESS under the typing gate. This skill prefers
  `if area is Hurtbox3D:` followed by a typed local (Godot docs, Static typing). `has_method` plus
  `call(&"save_state")` remains in `PersistComponent` on purpose, because any node may opt in. Lint
  A06 reports it as info.
- **Verified (round 2):** `has_method(&"take_damage")` plus `call`,
  `propagate_call(&"on_game_over")` (reached a grandchild once) and
  `get_tree().call_group(&"enemy", ...)` all work headless.
- **A silent collision is a layer or mask problem first** (Godotneers, W8gYHTjDCic [01:03:09]).
  `arch_audit.gd` flags layer 0 with mask 0 and a monitoring Area with mask 0. `unmatched_masks`
  (procedures P15) also flags mask bits that no object in the scene uses as a layer: verified on a
  Hitbox with mask 16 and nothing on layer 5.
- **Editor connections vs code connections** (GDQuest, Qlq8pBB2htg [00:03:24, 00:06:16]). Editor
  connections show in the Node dock, and a deleted target method leaves a broken connection.
  `arch_audit.gd` checks every SceneState connection target for a missing method.
- **Signals respond, calls start; name signals in the past tense** (Godot docs, Scene organization
  and Style guide).

## 3. Data and Resources

- **Use custom Resources, not Dictionary databases** (Godotneers, 4vAkTHeoORk [00:12:57-00:16:26]).
  They avoid id typos, typed PackedScene and Texture2D fields follow file moves, and they can be
  edited in the Inspector. "Everything static in Godot is a Resource."
- **A Resource is the right choice when a node would use none of a node's features** (DevWorm,
  zbAKzM-Odb4 [00:00:22-00:00:53]). Treat stats Resources as immutable at runtime [00:19:04].
- **Loaded resources are shared** (Godot docs, Resources). Verified:
  - `load()` twice gives the same instance, and a mutation is seen by the next `load()`;
  - `CACHE_MODE_IGNORE` re-reads the file;
  - `duplicate()` gives an independent copy;
  - `duplicate(true)` copies internal subresources and keeps external `.tres` shared;
  - `duplicate_deep(DEEP_DUPLICATE_ALL)` copies the external ones too.
- **One Resource class per file** (Godot docs, Resources).
  - **Refinement:** the docs say inner-class properties are not serialized. Verified: the property
    IS written (`secret = 42`), next to an empty built-in GDScript sub-resource, and reloads as
    null. Same outcome, different mechanism.
- **Every `_init` parameter of a Resource needs a default** (Godot docs). Verified: without one,
  loading logs "Error constructing a GDScriptInstance ... Method expected 1 argument(s), but called
  with 0". The resource still loads, with its fields lost.
- **Custom Resource as live global state** (Sam Szuflita, GodotCon 2025, 1qHPKg_Xovs [00:01:47,
  00:06:11]). One node creates the instance, every reader shares it, and dumping and reloading the
  whole state lets you retest a bug. Caveat: built-in classes expect their data on themselves
  [00:06:44].
- **Folder scans break in exports** (Godotneers, 4vAkTHeoORk [01:13:35-01:18:00]); always test an
  exported build [01:15:17].
  - Verified in a `.pck`: `DirAccess.get_files_at("res://data/items")` returned `ore.tres.remap`,
    `potion.tres.remap` and `sword.tres.remap`, and a naive `load()` of the `.tres` names found 0
    items.
  - `ResourceLoader.list_directory` returned the clean names (resolving the digest's [verify]).
  - The skill still prefers a registry (`ItemCatalog`) built at edit time: one typed list,
    validated, with no scan at runtime [added].
- **Case:** macOS hides case mistakes and the pack is case-sensitive (Godot docs, Project
  organization). Verified: `load("res://Data/Items/Sword.tres")` worked on macOS with the warning
  "Case mismatch ... will not open when exported to other case-sensitive platforms".
  `ResourceLoader.exists` returned false inside the pack.
- **`.gdignore` must be empty and supports no patterns** (Godot docs, Project organization). Lint
  A15 flags a non-empty one.
  - **Refinement (round 2, verified):** the docs say the folder becomes unloadable. In 4.7.2 an
    `.svg` inside failed with "No loader found for resource", but a text `.tres` still loaded and
    `ResourceLoader.exists` returned true. `.gdignore` switches off import and the FileSystem dock,
    not access.
- **`preload` is a strong reference** (FAT Earth, zLdTvkLsmgA [00:05:34, 00:06:08]). A never-freed
  node that preloads menu, cutscene and level 1 keeps the chain in memory. Verified: a preloaded
  `.tres` was cached as soon as its holder script loaded (no instance needed) and stayed cached
  after the probe dropped the script, while a `load()` in `_ready` was released when the node was
  freed. Preload small pieces near their user; `load()` levels and menus on demand.

## 4. Composition

- **Composition over inheritance; the root script is glue** (Firebelley Games, rCu8vQrdDDI
  [00:00:14, 00:02:11, 00:07:24]). Components reference each other through exported node slots
  [00:06:55]. A component is useful alone but incomplete, like a CharacterBody2D without a shape
  [00:05:17].
- **Stop before you need 100 components** (Firebelley [00:08:28, 00:09:00]). State machines share a
  base class, but their state logic stays per entity.
- **Components know little and export their parameters** (Godotneers, W8gYHTjDCic [00:06:05]).
- **Inheritance with suffix naming** is acceptable for stable data hierarchies such as items
  (DevDuck, 4az0VX9ApcA [00:05:41, 00:06:15]).
- **Scene constructors** (Queble, u9aMR50yjCE [00:01:03-00:03:29]): `static func create(...)` on the
  scene's script, with required arguments, so a missing value fails in the editor. Verified:
  - fields set by the constructor are visible in `_ready`, and `@onready` vars are null until
    `add_child`;
  - a script that preloads its own scene fails to parse while the `.tscn` does not exist yet;
  - after import, loading the script, the class_name, the scene, and a lazy `load()` variant were
    all clean;
  - re-packing and saving that scene from a job, while the script was loaded, logged "[ext_resource]
    referenced non-existent resource" on a fresh project. The note's cyclic-reference caution
    applies to that tool case only.
- **`@onready` is not set until the node enters the tree** (Godotneers, 4vAkTHeoORk [00:33:06]): add
  first, then call `display()`.
- **Pass a copy of the recipe dictionary in a `has_all` check** (Godotneers [01:07:14-01:10:43]).
  `Inventory.has_all` reads without mutating; the test checks this.
- **`ItemList.select()` emits no signal** (Godotneers [00:53:45-00:55:27]): call the handler
  yourself; `add_item` returns the index for `set_item_metadata`. Verified: 0 `item_selected`
  emissions, index 0. ItemList requests no minimum size, so set `custom_minimum_size` (250 px in the
  source, [00:47:32]); verified (0, 0), and the P17 capture shows a 250x160 list.
- **Mouse mode around dialogs** (Godotneers [00:37:01]): a captured mouse blocks button clicks, so a
  dialog sets `MOUSE_MODE_VISIBLE` and restores the previous mode on close. The headless display
  server reads 0 whatever is set (verified), so check it windowed or by hand.
- **Debug god mode early** (FAT Earth, zLdTvkLsmgA [00:02:34]): faster move, no gravity, hurtbox
  off; under 20 minutes of work and it fed gameplay ideas. Not run here.

## 5. Save data [mostly added]

- **Plan save and load early; version it** (Wilson, BgrHnJDt2ww [00:17:03-00:18:41]). Chickensoft
  generates JSON converters in C#; `SaveService` is the GDScript equivalent.
- **Security** (verified):
  - a `.tres` in `user://` with an embedded GDScript sub-resource ran its `_init` on
    `ResourceLoader.load` (an environment variable was set by the payload);
  - `str_to_var('Object(Node,"name":"Injected")')` returned a Node, and so did `ConfigFile.parse` of
    the same value.

  Players share save files, so a save is never a Resource and never parsed with `str_to_var`.

- **Types** (verified):
  - `JSON.from_native` writes `"i:3"`, `"sn:sword"` and `{"type":"Vector3","args":[...]}`, and
    `to_native` restores int, StringName, Vector3 and Vector2i;
  - plain `JSON.parse_string` returns ints as floats (version deltas);
  - `from_native` given an Object logs `!p_full_objects` and writes null;
  - `to_native` given plain JSON logs an error and returns null, so read the envelope version first.
- **Atomic writes** (verified): `FileAccess.store_string` returns true (4.4+), and
  `DirAccess.rename_absolute` replaces an existing file on macOS. `JSON.new().parse()` of corrupt
  text returns an error without logging one, so the `.bak` fallback runs quietly.

## 6. Input [added, from version deltas and tests]

- 4.7 device ids: keyboard 16, mouse 32, emulation -1 (version deltas).
- Verified device matching:
  - a key action event left at device 0 still matched a keyboard press;
  - a joypad action event at device 0 matched only pad 0, and at device -1 it matched pad 1;
  - `Input.parse_input_event` followed by `flush_buffered_events` drives `is_action_pressed`
    headless.
- `ProjectSettings.save()` from a headless job writes `[input]` as `Object(InputEventKey,...)`
  literals that load on the next run (verified). It also drops the header comment and every key
  equal to the engine default, such as `rendering_method="forward_plus"` and the 1152x648 viewport,
  while keeping Jolt and the stretch settings (observed).

## 7. Typing and style

- **Typing warnings are off by default** (Godot docs, Static typing). Turn on `UNTYPED_DECLARATION`
  and `UNSAFE_*`. Verified: at warn level they print nothing headless; at error level they appear as
  "(Warning treated as error.)" parse errors, and addons are excluded by default.
- **`unsafe_call_argument`** fires on every `int(dict.get(...))`: 33 hits in G1. 15 are in the
  tests, 12 in `save_service.gd` and `input_remap.gd`, and the rest are spread over 4 files. This
  skill's default gate leaves it out; the strict gate adds it [added].
- **Typed idioms the gate forced in this skill's own tests:**
  - `load(p).instantiate()` is unsafe method access (load returns Resource): type the PackedScene or
    `preload` it;
  - `(v as Dictionary)` on a Variant is an unsafe cast: assign to a typed local;
  - `.size()` on a Dictionary value is unsafe: bind it to `var a: Array` first.
- **`as` returns null silently** (Godot docs): verified with a Button cast as Label. A typed
  assignment fails loudly; `is` plus a typed local is the safe form.
  - **Verified (round 2):** `var l: Label = button` logged "Trying to assign value of type 'Button'
    to a variable of type 'Label'." and aborted the function. The docs' point holds: the "unsafe"
    typed line is the more reliable one when a type drift must fail.
- **`get_node()` cannot infer** (Godot docs, Style guide): `var n := get_node("Child")` is a `Node`,
  and the default gate rejected `n.position` with "not present on the inferred type "Node" (but may
  be present on a subtype)". `var n: Node2D = get_node("Child")` passed.
- **No nested typed collections** (Godot docs): `Array[Array[int]]` is "Nested typed collections are
  not supported."; `Array[Array]` and `Dictionary[StringName, Array]` compile (verified).
- **Typed math** (Godot docs): `clampf` was 1.70x to 1.74x faster than `clamp` over 1M calls (4
  runs), and `clamp()` on Colors is a parse error ("argument 2 should be "Color" but is "Color"");
  `Color.clamp()` compiles. The typing gate did not flag `return clamp(...)` in a `-> float`
  function, so this is about speed and types, not the gate.
- **Typing speed** (Boon Makes Games, mNa0m2fvGOc [00:01:39]):
  - typed bubble sort was "116% faster" in 4.1;
  - **Re-measured:** 1.46x to 1.50x over 3 runs (n=2000, median of 5 each, 4.7.2 editor binary), so
    the gap has narrowed;
  - built-in `Array.sort` unchanged by typing (1.00), as he found.
- **Style** (Godot docs, Style guide; Jacob Foxe, 8VC_QGpZEXk [00:04:10, 00:09:23]):
  - snake_case files, PascalCase classes, CONSTANT_CASE constants;
  - code order: signals, enums, constants, static vars, `@export`, vars, `@onready`, `_init`,
    `_ready`, methods, inner classes;
  - trailing commas in multi-line literals; `and`, `or`, `not` over symbols.

  Foxe prefers more parentheses than the guide; it is a readability preference only [00:17:01].

## 8. Folders and version control

- **There is no universal structure; you should know where a file goes without thinking** (FAT
  Earth, V4SO7foDoW4 [00:03:00]). FAT Earth separates raw assets from source, then splits by role
  (`layered`). DevDuck groups by feature first and file type last (4az0VX9ApcA [00:00:56]), and
  keeps a `common/` folder with zero game references [00:03:56]. `scaffold_folders(layout=...)`
  writes either.
- **Git** (BatteryAcidDev, c3Jf-av_5NE [00:00:27, 00:10:23, 00:22:52]): commit a bare runnable
  project first, keep `main` for releases, `dev` plus topic branches, commit before upgrading Godot
  or adding add-ons, and list LFS patterns in `.gitattributes`. Commit `.uid` sidecars with their
  scripts (4.4+, version deltas; lint A13 and A14).
  - **Verified (round 2):** after `--import`, a `.gd` gets a `.gd.uid` sidecar and a text `.tres`
    gets none. In a scratch repo, `git check-attr` routed `*.png` to the lfs filter from
    `.gitattributes`, and `.gitignore` with `.godot/` ignored the cache but not `.uid` files.
    `git-lfs` itself is not installed here, so no LFS push was run. LFS free tier on GitHub is about
    2 GB (BatteryAcidDev [00:03:13]).

## 9. GDScript vs C#

- **Language matters less than people argue; mix them** (GDQuest, 1VUDMFBpdZQ [00:01:03, 00:06:06]).
  GDScript is the default.
- **When C# pays** (GDQuest [00:04:04, 00:04:36]): algorithm speed, .NET libraries, Rider, or a team
  that already knows it. Code that mostly calls the engine is slightly slower in C#, and every
  change needs a compile.
- **Benchmarks** (Boon, hZvCCvo3AHc [00:00:26, 00:00:46, 00:01:30]): C# was much faster on bubble
  sort and A*, slightly faster on engine access (4.0/4.1). His advice: "Mix them and use them where
  they suit the best."
- **Chickensoft** (Wilson, BgrHnJDt2ww [00:08:57-00:18:41]):
  - the stack: GoDotTest, AutoInject, LogicBlocks statecharts, versioned save converters;
  - it is C# only, built on source generators, with no GDScript equivalent [00:21:26].
- **API differences** (Godot docs, C# differences):
  - `new Basis()`, `new Transform3D()` and `new Quaternion()` are all zeros: use `.Identity`;
  - `new Color()` is transparent black;
  - signals need the `EventHandler` suffix;
  - no `preload`, `@onready` or `bind`;
  - `System.IO.Path` fails on `res://` and `user://`.
- **Platforms** (version deltas): C# needs the .NET build plus .NET 8 (Android needs .NET 9), and
  cannot export to the web.
- **Not run here:** no .NET SDK and no Godot .NET build are installed, and the data volume had 3.0
  GiB free on 2026-10-02, too little to fetch both safely while other jobs were running. The C#
  claims above are from the sources only.
