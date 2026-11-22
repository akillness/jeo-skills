extends CharacterBody3D
## Third-person CharacterBody3D controller (scenario-godot-3d-world 0.1, Godot 4.7.2, Jolt).
## Movement after GDQuest (JlgZtOFMdfc): camera-relative input with Y zeroed before normalising,
## move_toward acceleration, gravity on a separate vertical component, lerp_angle skin turn.
## Stairs after Majikayo (Tb-R3l0SQdc): snap up with PhysicsServer3D.body_test_motion (forward + headroom,
## then down), snap down right after move_and_slide guarded by a floor-below ray, frame-tracked state.
## Body and brain are split (Godotneers): a test or an AI writes move_input / jump_pressed and sets
## use_player_input = false; the same code path runs.
##
## Scene (gd_world.build_player writes it):
##   Player (CharacterBody3D, this script) > Collision (CapsuleShape3D), Skin (Node3D, model front +Z),
##   CameraPivot (Node3D, top_level) > SpringArm3D (SphereShape3D r 0.3, player excluded) > Camera3D

@export var move_speed := 6.0
@export var acceleration := 40.0
@export var air_acceleration := 8.0
@export var jump_velocity := 5.5
@export var max_fall_speed := 30.0
@export var rotation_speed := 12.0
@export var mouse_sensitivity := 0.003
@export var stick_sensitivity := 2.5
@export_range(-89.0, 0.0, 0.1, "degrees") var pitch_min_deg := -60.0
@export_range(0.0, 89.0, 0.1, "degrees") var pitch_max_deg := 35.0
@export var pivot_height := 1.5
@export var step_enabled := true
@export var max_step_height := 0.45
@export var min_step_height := 0.02

## Brain inputs. With use_player_input true they come from the InputMap actions move_left, move_right,
## move_forward, move_back, jump (and look_* for a stick); otherwise whoever drives the body writes them.
var use_player_input := true
var move_input := Vector2.ZERO
var look_input := Vector2.ZERO
var jump_pressed := false

var pivot: Node3D
var spring: SpringArm3D
var camera: Camera3D
var skin: Node3D

var _mouse_delta := Vector2.ZERO
var _last_dir := Vector3.FORWARD
var _snapped_last := false
var _floor_frame := -100
## Telemetry for tests and tuning: steps climbed up and down.
var steps_up := 0
var steps_down := 0


func _ready() -> void:
	pivot = get_node_or_null("CameraPivot")
	spring = get_node_or_null("CameraPivot/SpringArm3D")
	camera = get_node_or_null("CameraPivot/SpringArm3D/Camera3D")
	skin = get_node_or_null("Skin")
	if pivot:
		pivot.top_level = true  # the camera does not turn with the body (Octodemy, ZCb12AHKMfE [00:08:35])
		pivot.global_position = global_position + Vector3(0, pivot_height, 0)
	if spring:
		spring.add_excluded_object(get_rid())  # never collide the arm with the player


func _unhandled_input(event: InputEvent) -> void:
	if not use_player_input:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_mouse_delta += (event as InputEventMouseMotion).screen_relative  # stored here, consumed in physics
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _read_player_input() -> void:
	move_input = Input.get_vector("move_left", "move_right", "move_forward", "move_back") if InputMap.has_action("move_forward") else Vector2.ZERO
	jump_pressed = InputMap.has_action("jump") and Input.is_action_just_pressed("jump")
	if InputMap.has_action("look_left"):
		look_input = Input.get_vector("look_left", "look_right", "look_up", "look_down")


func _physics_process(delta: float) -> void:
	if use_player_input:
		_read_player_input()
	_update_camera(delta)
	if is_on_floor():
		_floor_frame = Engine.get_physics_frames()

	# Horizontal: camera-relative, Y zeroed BEFORE normalising (else looking down slows the walk).
	var dir := Vector3.ZERO
	if camera:
		var fwd := camera.global_basis.z
		var right := camera.global_basis.x
		dir = fwd * move_input.y + right * move_input.x
	else:
		dir = Vector3(move_input.x, 0, move_input.y)
	dir.y = 0.0
	var strength := minf(move_input.length(), 1.0)
	dir = dir.normalized() * strength
	var grounded := is_on_floor() or _snapped_last
	var y_vel := velocity.y
	velocity.y = 0.0
	velocity = velocity.move_toward(dir * move_speed, (acceleration if grounded else air_acceleration) * delta)
	y_vel += get_gravity().y * delta
	if jump_pressed and grounded:
		y_vel = jump_velocity
		_snapped_last = false
	velocity.y = maxf(y_vel, -max_fall_speed)  # cap the fall only (Juli, U5A_JArREUc [00:07:28])
	jump_pressed = false

	if dir.length() > 0.2:
		_last_dir = dir.normalized()
	if skin:
		var target := Vector3.BACK.signed_angle_to(_last_dir, Vector3.UP)  # skin front is +Z (MODEL_FRONT)
		skin.rotation.y = lerp_angle(skin.rotation.y, target, rotation_speed * delta)

	var did_step_up := step_enabled and _snap_up_stairs(delta)
	if not did_step_up:
		move_and_slide()
		if step_enabled:
			_snap_down_stairs()
	if pivot:
		pivot.global_position = global_position + Vector3(0, pivot_height, 0)


func _update_camera(delta: float) -> void:
	if pivot == null:
		return
	var yaw := -_mouse_delta.x * mouse_sensitivity - look_input.x * stick_sensitivity * delta
	var pitch := -_mouse_delta.y * mouse_sensitivity - look_input.y * stick_sensitivity * delta
	_mouse_delta = Vector2.ZERO  # consumed: otherwise the camera keeps turning
	pivot.rotation.y = wrapf(pivot.rotation.y + yaw, -PI, PI)
	pivot.rotation.x = clampf(pivot.rotation.x + pitch, deg_to_rad(pitch_min_deg), deg_to_rad(pitch_max_deg))


func _too_steep(normal: Vector3) -> bool:
	return normal.angle_to(Vector3.UP) > floor_max_angle


func _test_motion(from: Transform3D, motion: Vector3, result: PhysicsTestMotionResult3D) -> bool:
	var p := PhysicsTestMotionParameters3D.new()
	p.from = from
	p.motion = motion
	p.margin = safe_margin
	return PhysicsServer3D.body_test_motion(get_rid(), p, result)


func _is_static_like(o: Object) -> bool:
	return o != null and not (o is RigidBody3D or o is CharacterBody3D)


func _snap_up_stairs(delta: float) -> bool:
	if not (is_on_floor() or _snapped_last) or velocity.y > 0.0:
		return false
	var horiz := Vector3(velocity.x, 0, velocity.z) * delta
	if horiz.length() < 0.0005:
		return false
	var from := global_transform.translated(horiz + Vector3(0, max_step_height * 2.0, 0))
	var res := PhysicsTestMotionResult3D.new()
	if not _test_motion(from, Vector3(0, -max_step_height * 2.0, 0), res):
		return false
	if not _is_static_like(res.get_collider()):
		return false
	# A capsule rests on the step's leading edge with its round bottom, so neither the travel nor the
	# contact normal gives the tread: cast a ray down just past the contact and measure the tread itself.
	var probe := res.get_collision_point() + horiz.normalized() * 0.05
	var q := PhysicsRayQueryParameters3D.create(probe + Vector3(0, max_step_height, 0), probe + Vector3(0, -max_step_height, 0))
	q.exclude = [get_rid()]
	q.collision_mask = collision_mask
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if hit.is_empty() or _too_steep(hit["normal"]):
		return false
	var step: float = hit["position"].y - global_position.y
	if step <= min_step_height or step > max_step_height:
		return false
	var target := from.origin + res.get_travel()
	target.y = maxf(target.y, hit["position"].y)
	global_position = target
	apply_floor_snap()
	_snapped_last = true
	steps_up += 1
	return true


func _snap_down_stairs() -> void:
	var did := false
	var was_floor := Engine.get_physics_frames() - _floor_frame <= 1
	if not is_on_floor() and velocity.y <= 0.0 and (was_floor or _snapped_last):
		# Guard: only snap when there is floor within 1.5 steps below; walking off a higher ledge must fall.
		var q := PhysicsRayQueryParameters3D.create(global_position, global_position + Vector3(0, -max_step_height * 1.5, 0))  # 1.5x as Majikayo (0.75 for 0.5)
		q.exclude = [get_rid()]
		var hit := get_world_3d().direct_space_state.intersect_ray(q)
		if not hit.is_empty() and not _too_steep(hit["normal"]):
			var res := PhysicsTestMotionResult3D.new()
			if _test_motion(global_transform, Vector3(0, -max_step_height, 0), res):
				global_position.y += res.get_travel().y
				apply_floor_snap()
				did = true
				steps_down += 1
	_snapped_last = did
