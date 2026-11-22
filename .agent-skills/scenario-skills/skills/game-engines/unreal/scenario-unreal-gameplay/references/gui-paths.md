# GUI paths (for a computer-use agent or a human doing the graph residue)

Menus as the saved 5.8 docs and talks describe them; macOS uses Cmd where the docs write Ctrl
`[verify]`. Each block names the procedure it replaces or completes.

## Project and plugins (P2)

- Edit > Plugins: Gameplay Abilities; StateTree and Gameplay StateTree; Python Automation Test
  (Testing filter); Common UI; Unreal MCP, All Toolsets, Editor Toolset (MCP). Restart when asked.
- Edit > Project Settings > Maps and Modes: Default GameMode, Editor Startup Map, Game Default Map.
- Edit > Project Settings > GameplayTags: add tags (writes `Config/DefaultGameplayTags.ini`).
- Edit > Project Settings > Engine > Enhanced Input: default classes, Platform Settings > Input
  Data.
- Edit > Project Settings > Engine > General Settings > Game Viewport Client Class =
  CommonGameViewportClient (Common UI).
- Edit > Project Settings > Game > Common Input Settings: Input Data, Platform Input (controller
  data per platform).
- Edit > Project Settings > Game > Asset Manager > Primary Asset Types to Scan: Map rule Cook Rule
  Always Cook, Is Editor Only off.
- Edit > Editor Preferences > General > Model Context Protocol > Auto Start Server (after the plugin
  restart).
- World Settings > GameMode Override (per level).

## C++ (P3)

- Tools > New C++ Class (turns a Blueprint-only project into a code project); Tools > Refresh Xcode
  Project [verify label].
- Build from Xcode with the `<Project>Editor` scheme, or the command in P3; close the editor for
  header changes.

## Blueprint classes and defaults (P4)

- Content Browser > Add (+) > Blueprint Class > All Classes > pick the C++ parent (HeroCharacter,
  EnemyCharacter, GameModeBase).
- Blueprint editor > Class Defaults: Jump Max Count, input slots, Default Abilities, HUD Widget
  Class; select the Character Movement component: Jump Z Velocity, Air Control, Max Walk Speed,
  Gravity Scale.
- BP_Enemy > Class Defaults > Pawn: AI Controller Class = BP_EnemyController (the Blueprint holding
  the StateTree), Auto Possess AI = Placed in World or Spawned.
- BP_GameMode > Class Defaults: Player Controller Class = GameplayPlayerController (owning-client
  ASC init), HUD Class = HUD.
- Blueprint editor > Class Settings > Parent Class (reparent).
- Blueprint editor > Components panel: add components (the Python route needs SubobjectDataSubsystem
  [verify]).
- Replication: Class Defaults > Replication (Replicates, Net Update Frequency); variable Details >
  Replication (Replicated, RepNotify) and Replication Condition; Custom Event Details > Graph >
  Replicates.
- Debug: Tools > Blueprint Debugger; right-click node > Add Breakpoint; right-click pin > Watch This
  Value.
- Tools > C++ Header Preview (Blueprint Header Preview, 5.1) to start a port [verify menu path].

## Enhanced Input (P5)

- Content Browser > Add (+) > Input > Input Action (Value Type: Digital (bool), Axis1D, Axis2D,
  Axis3D).
- Content Browser > Add (+) > Input > Input Mapping Context: + mapping, pick the action, press the
  key; per key: Modifiers (+ Negate, Swizzle Input Axis Values YXZ, Dead Zone) and Triggers (+
  Pressed, Hold).
- Player Mappable Key Settings on actions and contexts (not Player Mappable Input Config,
  deprecated).

## GAS assets (P6)

- Content Browser > Add (+) > Blueprint Class > All Classes > GameplayEffect.
  - Duration Policy (Instant, Has Duration, Infinite), Duration Magnitude > Scalable Float.
  - Modifiers > + > Attribute = GameplayHealthSet.Damage, Modifier Op Add, Magnitude Calculation
    Type Set By Caller, Data Tag = Data.Damage (the damage template, GE_Template_Damage).
  - Components > + > Target Tags Gameplay Effect Component (Add to Inherited: Cooldown.Ability.Dash)
    for cooldowns; Asset Tags Gameplay Effect Component for type tags; Grant Gameplay Abilities;
    Target Tag Requirements (Removal) [verify display names].
  - Stacking options (renamed in 5.7).
- Console isolation twin: duplicate GE_Damage to GE_Damage_Debug; Modifiers > [0] > Magnitude
  Calculation Type = Scalable Float, value 10 (a SetByCaller magnitude applies 0 from the console).
- Asset-tag cvar: in the PIE console type `AbilitySystem.Fix` and read the autocomplete for the
  exact name; add `<name>=0` under `[ConsoleVariables]` in `Config/DefaultEngine.ini`.
- Content Browser > Blueprint Class > GA_Dash / GA_MeleeAttack (C++ parents): Class Defaults >
  Cooldown Gameplay Effect Class, Dash Speed, Dash Duration; Damage Effect, Damage, Attack Montage.
- Montage editor > Notifies track > right-click > Add Notify > AN_SendGameplayEvent; set Event Tag =
  Event.Attack.Hit on the hit frame (scenario-unreal-animation).
- Runtime: console `showdebug abilitysystem`, `AbilitySystem.Debug.NextCategory`; gameplay debugger
  with the apostrophe key while looking at the enemy (Abilities category: blue active, yellow
  inactive). MacBook: rebind the category keys in Project Settings > Engine > Gameplay Debugger >
  Input [verify path].

## StateTree (P7)

- Content Browser > Add (+) > Artificial Intelligence > State Tree > schema State Tree AI Component.
- State Tree editor: build from `G.statetree_outline(G.U4_ENEMY_TREE)`: + State under Root (Combat >
  Attack, Chase; Patrol > Walk, Wait); per state: + Task (Set Debug State, Find Patrol Point, Move
  To, Delay, Activate Ability By Tag), + Enter Condition (Object Is Valid on TargetActor, Distance
  Compare [verify names]), + Transition (On State Succeeded / Failed / Event with tag
  AI.Event.TargetSeen or AI.Event.TargetLost / On Tick with a condition, for Chase: Distance Compare
  <= AttackRange, target Combat [verify trigger label]).
- Parameters: tree asset > Parameters panel: AttackRange, ChaseAcceptance, PatrolWait, AttackTimeout
  (floats); bind task inputs to them. Per enemy: BP_EnemyController > StateTree component > State
  Tree Reference > Parameters, tick the override and set the value.
- Details > binding dropdown on each task property: Find Patrol Point.PatrolLocation into Move To
  target; TargetActor from the AI controller context.
- 5.6+: state Details > Task Completion (Task Control Flow): Set Debug State and Find Patrol Point
  do not count.
- Window > Debugger (StateTree debugger); Tools > Debug > Rewind Debugger (5.7 track); 5.6 Binding
  Viewer; 5.8 State Centric View behind `StateTree.Editor.Experimental.EnableStateCentricView`.
- Controller Blueprint (BP_EnemyController) > StateTree component > State Tree = ST_Enemy.
- Level: Place Actors > Volumes > Nav Mesh Bounds Volume, scale over the play space; press P (or
  `show Navigation`) to see coverage.
- Behavior Tree route: Artificial Intelligence > Blackboard, Behavior Tree; AI Controller Run
  Behavior Tree on possess; decorators with Observer Aborts; EQS: Artificial Intelligence >
  Environment Query, EQS Testing Pawn.

## UMG (P8)

- Content Browser > Add (+) > User Interface > Widget Blueprint > All Classes > HealthBarWidget (C++
  parent).
- Designer: Palette > Progress Bar named HealthBar, Text named HealthText (names must match
  BindWidget); Screen Size at the target resolution, DPI 1.0; Hierarchy right-click > Wrap With >
  Size Box.
- Widget Details > Performance > Is Volatile [verify location]; no Bind dropdowns on properties (no
  property bindings).
- Enemy: BP_Enemy > OverheadWidget component > Widget Class = WBP_EnemyBar, Space = Screen, Draw at
  Desired Size.
- Tools > Debug > Widget Reflector [verify path]; Plugins > Slate Insights; Unreal Insights > Slate
  Frame View.
- Content Browser > View Options > Columns: widget tick prediction metadata.

## Tests (P9, P10)

- Tools > Test Automation (appears once a test plugin is enabled): Editor > Python > <project> >
  Tests; Start Tests; export CSV.
- Play dropdown > Number of Players, Net Mode (Play As Listen Server), New Editor Window (PIE) for
  invalidation and multiplayer checks.
- Functional tests: Place Actors > Functional Test actor (or a C++ AFunctionalTest child), Run Level
  Test in Test Automation.

## Persistence (P14)

- Edit > Plugins > Level Streaming Persistence (experimental), Project Settings > Level Streaming
  Persistence (class filter, properties).
- Variable Details > Advanced > SaveGame checkbox.
