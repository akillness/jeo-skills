extends CharacterBody3D
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): a navigation-driven enemy body for crowds.
##
## Movement only (the brain sets `target_node` or `goal`): NavigationAgent3D path following with
## optional RVO avoidance, throttled re-pathing, XZ steering, gravity. Pattern from the official
## NavigationAgents tutorial (doc-avoidance) with the crowd rules of scenario-godot-gameplay:
##   - read get_next_path_position() once per physics frame, never after is_navigation_finished();
##   - with avoidance on, hand the desired velocity to the agent and move in velocity_computed;
##   - re-path only when the target moved more than repath_distance, at most every repath_interval,
##     with a per-agent phase so 200 agents do not all query on the same frame [added].
##
## Built in code by crowd_bench.gd; in a game, put the same script on the enemy scene root.

signal arrived

@export var speed := 4.0
@export var repath_interval := 0.25
@export var repath_distance := 1.0
@export var stop_distance := 1.5
## When false, _physics_process does nothing and a manager calls tick(delta) instead.
@export var self_tick := true

var agent: NavigationAgent3D
var target_node: Node3D
var goal := Vector3.INF
var ticks_in_physics := 0
var ticks_outside_physics := 0
var _repath_left := 0.0
var _last_goal := Vector3.INF
var _gravity := float(ProjectSettings.get_setting("physics/3d/default_gravity", 9.8))
var _desired := Vector3.ZERO


func setup(nav_agent: NavigationAgent3D, phase: float) -> void:
	agent = nav_agent
	_repath_left = phase * repath_interval
	if agent.avoidance_enabled:
		agent.velocity_computed.connect(_on_velocity_computed)


func _physics_process(delta: float) -> void:
	if self_tick:
		tick(delta)


func tick(delta: float) -> void:
	if agent == null:
		return
	var g := target_node.global_position if target_node != null else goal
	if g == Vector3.INF:
		return
	_repath_left -= delta
	if _repath_left <= 0.0 and g.distance_squared_to(_last_goal) > repath_distance * repath_distance:
		agent.target_position = g
		_last_goal = g
		_repath_left = repath_interval
	var desired := Vector3.ZERO
	var flat_to_goal := Vector2(g.x - global_position.x, g.z - global_position.z).length()
	if flat_to_goal > stop_distance and not agent.is_navigation_finished():
		var next := agent.get_next_path_position()
		var dir := next - global_position
		dir.y = 0.0                      # the navmesh floats ~0.3 m above the floor (observed): steer on XZ
		if dir.length_squared() > 0.0001:
			desired = dir.normalized() * speed
	elif flat_to_goal <= stop_distance:
		arrived.emit()
	_desired = desired
	if agent.avoidance_enabled:
		agent.velocity = desired          # result arrives in velocity_computed
	else:
		_move(desired, delta)


func _on_velocity_computed(safe_velocity: Vector3) -> void:
	if Engine.is_in_physics_frame():
		ticks_in_physics += 1
	else:
		ticks_outside_physics += 1
	_move(safe_velocity, get_physics_process_delta_time())


func _move(v: Vector3, delta: float) -> void:
	velocity.x = v.x
	velocity.z = v.z
	if is_on_floor():
		velocity.y = 0.0
	else:
		velocity.y -= _gravity * delta
	move_and_slide()
