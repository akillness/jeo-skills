# GUI paths (scenario-godot-gameplay, Godot 4.7.2 editor)

For a computer-use agent doing the same procedures by hand. Every GUI step here has a code path in
`procedures.md`; prefer the code path, then use the editor to look.

## Navigation (P1, P2)

- Add a region: Scene dock > + > NavigationRegion3D. Inspector > Navigation Mesh > New
  NavigationMesh.
- Bake settings: click the NavigationMesh resource > Geometry > Parsed Geometry Type (default Both:
  switch to Static Colliders for gameplay levels), Source Geometry Mode (Group With Children keeps
  NPCs out), Source Group Name. Agents > Radius, Height, Max Climb.
- Bake: select the region, toolbar button "Bake NavigationMesh" (top of the 3D viewport). "Clear
  NavigationMesh" next to it.
- See it: Debug menu > Visible Navigation (in a running game); in the editor the baked mesh draws in
  the viewport.
- Agent: child NavigationAgent3D of the CharacterBody3D. Inspector > Avoidance > Avoidance Enabled,
  Radius, Neighbor Distance, Max Neighbors, Time Horizon Agents, Max Speed. Path > Path Desired
  Distance, Target Desired Distance.
- Debug avoidance: NavigationAgent3D > Debug > Enabled; Debug menu > Visible Avoidance in a run.
- Project settings: Project > Project Settings > Navigation > World / Pathfinding / Avoidance
  (toggle Advanced Settings to see the async iteration and thread options).

## Physics layers (P4, P5)

- Name layers: Project > Project Settings > Layer Names > 3D Physics: 1 World, 2 Player, 3 Enemy, 5
  PlayerHurtbox, 6 EnemyHurtbox, 7 Projectile (the kit's `combat_layers.gd`).
- Area3D: Inspector > Collision > Layer and Mask grids (hover shows names). New areas start on layer
  1 and mask 1: clear both first.
- Jolt: Project Settings > Physics > 3D > Physics Engine = Jolt Physics. Limits: Physics > Jolt
  Physics 3D > Limits > Max Linear Velocity (500).
- RigidBody3D: Inspector > Solver > Continuous CD.
- Debug shapes: Debug menu > Visible Collision Shapes.

## State machines and AI (P3, P9)

- Node FSM: add a Node "StateMachine" under the enemy, one child Node per state with its script;
  Inspector exports for initial state and per-state values.
- LimboAI: AssetLib or unzip into addons/limboai, restart the editor (GDExtension). Create a
  BehaviorTree: FileSystem > right click > New Resource > BehaviorTree. Double-click opens the
  LimboAI editor: task palette on the left (Composites, Decorators, Actions, Conditions), drag to
  the tree. Blackboard plan in the inspector. BTPlayer node on the agent, Behavior Tree property.
  Live view: Debugger panel > LimboAI tab (run the game from the editor).

## Save and load (P6)

- Open user:// : Project > Open User Data Folder.
- Inspect a saved .tres: drag it into the FileSystem dock is not possible for user://; open it in a
  text editor. Look for `[sub_resource type="GDScript"` before trusting it.

## Inventory and quests (P7)

- New item: FileSystem > right click > New Resource > pick the item script (class_name makes it
  searchable). Inspector edits fields.
- Make an inventory unique per instance: Inspector > the resource > dropdown > Make Unique
  (Recursive) (the `duplicate(true)` equivalent).

## Dialogue (P8)

- Install Dialogue Manager: AssetLib or unzip addons/dialogue_manager, Project > Project Settings >
  Plugins > Dialogue Manager > Enabled (this adds the DialogueManager autoload).
- Editor: the "Dialogue" main screen tab. New file, write cues (`~ start`), errors show inline; Test
  Dialogue button runs it.
- Settings: Project Settings > Dialogue Manager (balloon path, states).

## Input (P10)

- Project > Project Settings > Input Map: add an action, + to add events, "Physical Keycode" vs
  "Keycode" is chosen in the key dialog (Physical is the default for new keys in the dialog). Remaps
  at runtime are not saved there.

## Dungeon (P11)

- No GUI equivalent for generation; inspect the result: run the windowed capture, or open the
  generated level in a scene and use the top orthogonal view (Numpad 7 in the 3D viewport, then
  Perspective menu > Orthogonal).

## Tests (P13)

- GUT: Project Settings > Plugins > Gut > Enabled; GUT panel at the bottom. Run All. Headless is the
  code path in procedures.
