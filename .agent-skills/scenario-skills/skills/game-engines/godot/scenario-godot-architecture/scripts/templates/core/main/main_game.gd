class_name MainGame
extends Node
## Coordinator of the main scene: stable roots, one level-loading entry point, the player.
##
## Layout (FAT Earth Studios, V4SO7foDoW4 [00:04:56 to 00:12:16]): MainGame owns the roots, the
## UI layers and transitions; a level owns its geometry and spawn markers and never the player, so
## freeing a level never frees the player, and spawned things live under EntityRoot or EffectRoot,
## never under the node that fired them.

signal level_loaded(level: BaseLevel)

@export var player_scene: PackedScene

var player: Node3D
var level: BaseLevel

@onready var world: Node3D = %World
@onready var level_root: Node3D = %LevelRoot
@onready var entity_root: Node3D = %EntityRoot
@onready var effect_root: Node3D = %EffectRoot


func _ready() -> void:
	if player_scene != null and player == null:
		player = player_scene.instantiate() as Node3D
		entity_root.add_child(player)


## Entry point for gameplay code (doors, triggers, menus): defers to idle time, because freeing a
## level from inside a physics callback such as body_entered is refused by the engine.
func request_level(path: String, spawn: StringName = &"default") -> void:
	load_level.call_deferred(path, spawn)


## The only way levels change. Callers never touch LevelRoot themselves, so fades or threaded
## loading can be added here later without changing them. Call it at idle time (tests, menus).
func load_level(path: String, spawn: StringName = &"default") -> BaseLevel:
	var packed := load(path) as PackedScene
	if packed == null:
		push_error("load_level: %s is not a scene" % path)
		return null
	# Check the type before touching the current level, and free a refused instance:
	# `instantiate() as BaseLevel` would drop the only reference and leak the whole tree.
	var node := packed.instantiate()
	if not (node is BaseLevel):
		node.free()
		push_error("load_level: %s does not have a BaseLevel root" % path)
		return null
	var next: BaseLevel = node
	for old: Node in level_root.get_children():
		level_root.remove_child(old)
		old.queue_free()
	level_root.add_child(next)
	level = next
	if player != null:
		player.global_position = next.spawn_position(spawn)
	level_loaded.emit(next)
	return next


## Spawn a projectile, pickup or effect under a stable root: freeing the shooter must not free it.
func spawn(scene: PackedScene, at: Vector3, under_effects: bool = false) -> Node3D:
	var node := scene.instantiate() as Node3D
	(effect_root if under_effects else entity_root).add_child(node)
	node.global_position = at
	return node
