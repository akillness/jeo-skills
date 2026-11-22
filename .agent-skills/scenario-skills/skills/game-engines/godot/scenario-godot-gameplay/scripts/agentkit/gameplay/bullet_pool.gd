extends Node3D
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): bullets as data. No body per bullet: each tick one ray from
## the previous to the next position (no tunnelling at any speed), one MultiMesh draws them all,
## swap-remove keeps the arrays dense. For fast, straight, short-lived shots; grenades and debris
## that bounce stay RigidBody3D (with continuous_cd) [added; measured in G5].
##
##   var pool = preload("res://addons/agentkit/gameplay/bullet_pool.gd").new()
##   pool.mask = 1 | (1 << 5)      # world + enemy hurtbox layers (bits are layer - 1)
##   pool.hit_areas = true         # hurtboxes are Area3D
##   pool.impact.connect(func(hit, pos, normal): ...)
##   add_child(pool); pool.fire(muzzle.global_position, -muzzle.global_basis.z * 90.0)

signal impact(collider: Object, position: Vector3, normal: Vector3)

@export var capacity := 2048
@export var mask := 1
@export var hit_areas := false
@export var default_lifetime := 2.0
@export var mesh: Mesh

var pos := PackedVector3Array()
var vel := PackedVector3Array()
var life := PackedFloat32Array()
var count := 0
var fired := 0
var hits := 0
var rays := 0
var _query := PhysicsRayQueryParameters3D.new()
var _mm: MultiMesh
var _mmi: MultiMeshInstance3D


func _ready() -> void:
	pos.resize(capacity)
	vel.resize(capacity)
	life.resize(capacity)
	_query.collision_mask = mask
	_query.collide_with_areas = hit_areas
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	if mesh == null:
		var m := BoxMesh.new()
		m.size = Vector3(0.06, 0.06, 0.5)
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.albedo_color = Color(1.0, 0.55, 0.1)
		m.material = mat
		mesh = m
	_mm.mesh = mesh
	_mm.instance_count = capacity
	_mm.visible_instance_count = 0
	_mmi = MultiMeshInstance3D.new()
	_mmi.multimesh = _mm
	# A MultiMesh culls as one box: give it the play area, or it vanishes when its first AABB leaves view.
	_mmi.custom_aabb = AABB(Vector3(-200, -50, -200), Vector3(400, 100, 400))
	add_child(_mmi)


func fire(from: Vector3, velocity: Vector3, lifetime: float = -1.0) -> bool:
	if count >= capacity:
		return false
	pos[count] = from
	vel[count] = velocity
	life[count] = lifetime if lifetime > 0.0 else default_lifetime
	count += 1
	fired += 1
	return true


func _physics_process(delta: float) -> void:
	var space := get_world_3d().direct_space_state
	var i := count - 1
	while i >= 0:
		var a := pos[i]
		var b := a + vel[i] * delta
		_query.from = a
		_query.to = b
		rays += 1
		var hit := space.intersect_ray(_query)
		life[i] -= delta
		if not hit.is_empty():
			hits += 1
			impact.emit(hit.get("collider"), hit.get("position", b), hit.get("normal", Vector3.UP))
			_remove(i)
		elif life[i] <= 0.0:
			_remove(i)
		else:
			pos[i] = b
		i -= 1
	_mm.visible_instance_count = count
	for k in count:
		var v := vel[k]
		var basis := Basis.looking_at(v.normalized(), Vector3.UP) if absf(v.normalized().y) < 0.99 else Basis()
		_mm.set_instance_transform(k, Transform3D(basis, pos[k]))


func _remove(i: int) -> void:
	count -= 1
	pos[i] = pos[count]
	vel[i] = vel[count]
	life[i] = life[count]
