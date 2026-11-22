extends CharacterBody3D
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): a single "hero" enemy driven by the node FSM.
##
## Body and brain split (Godotneers, CreugthdgJ0 [00:18:14]): this script senses and moves; the
## states in ./states/ decide. Sensing runs every physics frame here because there is one enemy;
## crowds go through enemy_manager.gd with a think budget instead.

const Perception = preload("res://addons/agentkit/gameplay/perception.gd")
const Brain = preload("res://addons/agentkit/gameplay/brain.gd")

@export var walk_speed := 2.5
@export var run_speed := 4.5
@export var sight_mask := 1 | 2          # world and player layers

var agent: NavigationAgent3D
var machine: Node
var target: CollisionObject3D
var patrol_points := PackedVector3Array()
var patrol_index := 0
var percept: Dictionary = {}
var aware := false
var last_known := Vector3.ZERO
var lost_s := 0.0
var attacks := 0
var health := 1.0
var reasons: Array[String] = []
var _gravity := float(ProjectSettings.get_setting("physics/3d/default_gravity", 9.8))
var _last_goal := Vector3.INF


func setup(nav_agent: NavigationAgent3D, state_machine: Node, player: CollisionObject3D) -> void:
	agent = nav_agent
	machine = state_machine
	target = player
	machine.init(self)


func _physics_process(delta: float) -> void:
	if machine == null:
		return
	sense(delta)
	machine.physics_update(delta)


func sense(delta: float) -> void:
	var eye := global_position + Vector3(0, 1.6, 0)
	var aim := target.global_position + Vector3(0, 1.0, 0)
	var ex: Array[RID] = [get_rid()]
	var p := Perception.sees(get_world_3d().direct_space_state, eye, -global_basis.z, aim, aware, sight_mask,
			ex, target.get_rid(), Brain.DETECT_RANGE, Brain.LOSE_RANGE, Brain.FOV_DEG)
	if p["sees"]:
		aware = true
		last_known = target.global_position
		lost_s = 0.0
	else:
		lost_s += delta
	p["lost_s"] = lost_s
	percept = p
	var why: String = p["reason"]
	if reasons.is_empty() or reasons[reasons.size() - 1] != why:
		reasons.append(why)


## Walk toward `goal` on the navmesh; true when arrived (XZ distance under `stop`).
func move_to(goal: Vector3, speed: float, delta: float, stop: float = 0.6) -> bool:
	if goal.distance_squared_to(_last_goal) > 0.25:
		agent.target_position = goal
		_last_goal = goal
	var flat := Vector2(goal.x - global_position.x, goal.z - global_position.z)
	if flat.length() <= stop or agent.is_navigation_finished():
		halt(delta)
		return flat.length() <= stop + 0.5
	var nxt := agent.get_next_path_position()
	var dir := nxt - global_position
	dir.y = 0.0
	if dir.length_squared() < 0.0001:
		halt(delta)
		return false
	dir = dir.normalized()
	face(global_position + dir, delta)
	velocity.x = dir.x * speed
	velocity.z = dir.z * speed
	_fall(delta)
	move_and_slide()
	return false


func halt(delta: float) -> void:
	velocity.x = 0.0
	velocity.z = 0.0
	_fall(delta)
	move_and_slide()


func face(point: Vector3, delta: float, rate: float = 10.0) -> void:
	var to := point - global_position
	if Vector2(to.x, to.z).length() < 0.01:
		return
	var yaw := atan2(-to.x, -to.z)          # forward is -Z
	rotation.y = lerp_angle(rotation.y, yaw, clampf(rate * delta, 0.0, 1.0))


func _fall(delta: float) -> void:
	if is_on_floor():
		velocity.y = 0.0
	else:
		velocity.y -= _gravity * delta
