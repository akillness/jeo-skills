# scenario-godot-architecture: GUI paths (Godot 4.7.2 editor)

These are the same steps as `procedures.md`, done by hand or by a computer-use agent. Close the
editor before a headless job writes `project.godot` or `.tscn` files: an open editor keeps its own
copy and can overwrite them on its next save (scenario-godot-expert).

## Project settings and autoloads

- **Jolt:** Project > Project Settings > General > Physics > 3D > Physics Engine = Jolt Physics.
- **Stretch:** Project Settings > General > Display > Window > Stretch > Mode `canvas_items`, Aspect
  `expand`.
- **Main scene:** Project Settings > General > Application > Run > Main Scene. You can also
  right-click a scene in the FileSystem dock > Set as Main Scene.
- **Autoload (Events):** Project Settings > Globals > Autoload. Pick `res://core/events/events.gd`,
  Node Name `Events`, keep Enable checked, then Add.
- **Typing warnings:** Project Settings, turn on Advanced Settings (top right) > General > Debug >
  GDScript.
  - Set `Untyped Declaration`, `Unsafe Property Access`, `Unsafe Method Access` and `Unsafe Cast` to
    Error for a gate, or Warn while working.
  - `Exclude Addons` is on by default.
  - In the script editor, safe lines show green line numbers.

## Folders

- FileSystem dock: right-click > Create New > Folder. Use lowercase snake_case names.
- `.gdignore`: create an empty file named `.gdignore` from Finder or a terminal. The FileSystem dock
  hides dot files.

## Main scene skeleton

- Scene > New Scene > Other Node > `Node`, renamed `Main`.
- Add children with Ctrl+A: `Node` Systems; `Node3D` World with LevelRoot, EntityRoot and
  EffectRoot; then 4 `CanvasLayer` nodes.
- **Unique names:** right-click a node > Access as Unique Name, which shows a `%` badge.
- **Process mode:** select the node, then Inspector > Node > Process > Mode (Inherit, Pausable, When
  Paused, Always, Disabled).
- **CanvasLayer number:** Inspector > Layer.
- **Script:** drag `main_game.gd` onto Main. Assign `player_scene` by dragging `player.tscn` into
  the Inspector slot.

## Resources (item definitions and catalog)

- **New item:** FileSystem dock, right-click `data/items/` > Create New > Resource > search
  `ItemDefinition` > Create, then name it `sword.tres`. Fill id, display_name, max_stack and tags in
  the Inspector.
- **Catalog:** create an `ItemCatalog` resource. In the Inspector `items` array, Add Element, then
  drag each `.tres` in.
  - This is the manual version of `build_catalog`. Re-run the tool, or re-drag, whenever an item is
    added.
  - Optional: the community plugin "Edit Resources as Table" gives a spreadsheet view.
- **Make unique (per-instance copy):** in the Inspector, click the resource's dropdown > Make
  Unique. This is the GUI equivalent of `duplicate()`.

## Components and signals

- **Player:** add children `HealthComponent` (Add Child Node, search the class_name), `Hurtbox3D`
  with a `CollisionShape3D`, and `PersistComponent`.
- **Wiring:** select Hurtbox3D and drag the Health node into its `health` slot. The Scene dock
  warning icon disappears once it is wired.
- **Signals:** Node dock > Signals tab > double-click `damaged` > pick the receiver > Connect. Code
  connections (`health.died.connect(...)`) do not appear here.
  - A broken connection, where the method was deleted, shows in the Node dock (GDQuest, Qlq8pBB2htg
    [00:06:16]).
- **Groups:** Node dock > Groups tab. `PersistComponent` adds itself to `persist` in code; spawn
  markers use the group `spawn`.

## Input Map and rebinding

- **Actions:** Project > Project Settings > Input Map > Add New Action (`move_left`, ...). Use the
  `+` next to an action to listen for a key, mouse button, joypad button or axis.
  - **Device:** the event dialog has a Device dropdown. Keep "All Devices", which writes
    `device -1`.
  - **Physical keys:** pick the "Physical Keycode" option in the key dialog.
  - **Deadzone:** the number next to each action.
- Runtime rebinding UI is game code: a button that waits for the next `_input` event and calls
  `InputRemap.rebind` (scenario-godot-ui owns the screen).

## Tests

- **GUT:** AssetLib > search "Gut" > Download > Install, then Project Settings > Plugins > enable
  Gut. The GUT panel sits in the bottom dock: set the test directory `res://test`, then Run All.
- **Exported build check:** Project > Export > Add... > Linux > Export PCK/ZIP... saves `game.pck`.
  Running it with `--main-pack` is a terminal step (`gd_architecture.pack_smoke`).

## C# (not run here)

- Requires the Godot .NET build (a separate download) and the .NET 8 SDK.
- Project > Tools > C# > Create C# solution.
- Scripts are attached with Language "C#". Build with the hammer button (top right) or
  `dotnet build`.
