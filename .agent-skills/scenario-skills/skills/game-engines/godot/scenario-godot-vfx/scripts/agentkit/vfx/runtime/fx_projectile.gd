extends Node3D
## scenario-godot-vfx 0.1: a projectile that flies along its -Z axis, sweeps a ray every physics tick (a fast shot
## cannot tunnel through a thin wall), spawns `impact_scene` at the hit with +Y on the surface normal,
## hides its head, stops its emitters and frees itself only after its world-space trail has died
## (freeing at once deletes every particle still in the air) [added].

signal hit(position: Vector3, normal: Vector3, collider: Object)

@export var speed := 14.0
@export var max_distance := 40.0
@export var impact_scene: PackedScene
@export_flags_3d_physics var collision_mask := 1
## Nodes hidden on impact (head mesh, core, light).
@export var hide_on_hit: Array[NodePath] = [^"Head", ^"Core", ^"Light"]

var travelled := 0.0
var dead := false


func _physics_process(delta: float) -> void:
	if dead:
		return
	var from := global_position
	var step := -global_basis.z * speed * delta
	var q := PhysicsRayQueryParameters3D.create(from, from + step, collision_mask)
	var h: Dictionary = get_world_3d().direct_space_state.intersect_ray(q)
	if not h.is_empty():
		var p: Vector3 = h["position"]
		var n: Vector3 = h["normal"]
		global_position = p
		explode(p, n, h["collider"])
		return
	global_position = from + step
	travelled += step.length()
	if travelled >= max_distance:
		explode(global_position, global_basis.z, null)


func explode(pos: Vector3, normal: Vector3, collider: Object) -> void:
	if dead:
		return
	dead = true
	hit.emit(pos, normal, collider)
	if impact_scene != null and get_parent() != null:
		var fx := impact_scene.instantiate() as Node3D
		get_parent().add_child(fx)
		fx.global_transform = Transform3D(basis_from_up(normal), pos)
	for path in hide_on_hit:
		var n3 := get_node_or_null(path) as Node3D
		if n3:
			n3.visible = false
	var linger := 0.0
	for e in _emitters(self):
		e.emitting = false
		var l: float = float(e.get_meta("fx_linger", e.lifetime / maxf(e.speed_scale, 0.001)))
		linger = maxf(linger, l)
	await get_tree().create_timer(linger, false).timeout
	queue_free()


## Basis whose +Y is `up` (impacts and decals face away from the surface).
static func basis_from_up(up: Vector3) -> Basis:
	var y := up.normalized()
	var ref := Vector3.FORWARD if absf(y.dot(Vector3.FORWARD)) < 0.95 else Vector3.RIGHT
	var x := ref.cross(y).normalized()
	var z := x.cross(y)
	return Basis(x, y, z)


static func _emitters(root: Node) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		if x is GPUParticles3D or x is CPUParticles3D:
			out.append(x)
		for c in x.get_children():
			stack.append(c)
	return out
