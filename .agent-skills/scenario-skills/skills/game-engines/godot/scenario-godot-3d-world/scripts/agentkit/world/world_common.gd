extends RefCounted
## Shared helpers for the scenario-godot-3d-world jobs (scenario-godot-3d-world 0.1, Godot 4.7.2).
## Static use: const W = preload("res://addons/agentkit/world/world_common.gd")

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")


## Triangles of a mesh without copying vertex data (index count / 3, or vertex count / 3).
static func triangles(mesh: Mesh) -> int:
	if mesh == null:
		return 0
	var t := 0
	if mesh is ArrayMesh:
		var am := mesh as ArrayMesh
		for i in am.get_surface_count():
			var idx := am.surface_get_array_index_len(i)
			t += (idx if idx > 0 else am.surface_get_array_len(i)) / 3
		return t
	return mesh.get_faces().size() / 3


## MeshInstance3D nodes under root with their transform relative to root, built from local transforms,
## so it also works on a scene that is not inside a tree (post-import, freshly instantiated scenes).
static func meshes_in(root: Node) -> Array:
	var out: Array = []
	_collect(root, Transform3D.IDENTITY, out)
	return out


static func _collect(n: Node, xf: Transform3D, out: Array) -> void:
	for c in n.get_children():
		var cxf := xf
		if c is Node3D:
			cxf = xf * (c as Node3D).transform
		if c is MeshInstance3D and (c as MeshInstance3D).mesh != null:
			out.append({"node": c, "xf": cxf})
		_collect(c, cxf, out)


static func merged_aabb(meshes: Array) -> AABB:
	var acc := AABB()
	var first := true
	for m in meshes:
		var box: AABB = m["xf"] * (m["node"] as MeshInstance3D).mesh.get_aabb()
		acc = box if first else acc.merge(box)
		first = false
	return acc


## Triangles of every MeshInstance3D and MultiMeshInstance3D (instances x mesh) under root.
static func scene_triangles(root: Node) -> Dictionary:
	var meshes := 0
	var tris := 0
	var mm_instances := 0
	var mm_tris := 0
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D and (n as MeshInstance3D).mesh:
			meshes += 1
			tris += triangles((n as MeshInstance3D).mesh)
		elif n is MultiMeshInstance3D and (n as MultiMeshInstance3D).multimesh:
			var mm := (n as MultiMeshInstance3D).multimesh
			var count := mm.visible_instance_count if mm.visible_instance_count >= 0 else mm.instance_count
			mm_instances += count
			mm_tris += count * triangles(mm.mesh)
		for c in n.get_children():
			stack.append(c)
	return {"mesh_instances": meshes, "triangles": tris, "multimesh_instances": mm_instances, "multimesh_triangles": mm_tris}


## Make (or reuse) a child by name: idempotent jobs call this instead of add_child.
static func child(parent: Node, cls_name: String, node_name: String) -> Node:
	var n := parent.get_node_or_null(NodePath(node_name))
	if n == null:
		n = ClassDB.instantiate(cls_name)
		n.name = node_name
		parent.add_child(n)
	return n


static func clear_children(n: Node) -> void:
	for c in n.get_children():
		n.remove_child(c)
		c.free()


static func save(root: Node, path: String) -> Dictionary:
	return AgentBuild.save_scene(root, path)


## Flat-colour material for blockouts (grey walkable, red blocking, yellow interactable, blue water).
static func flat_material(color: Color, roughness: float = 0.9) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	return m


## Ray straight down in a World3D. Returns {} on a miss.
static func ray_down(world: World3D, x: float, z: float, top: float = 500.0, bottom: float = -100.0, mask: int = 0xFFFFFFFF) -> Dictionary:
	var q := PhysicsRayQueryParameters3D.create(Vector3(x, top, z), Vector3(x, bottom, z), mask)
	return world.direct_space_state.intersect_ray(q)


## Layer number (1..32) to bit, the 1-based convention of set_collision_layer_value().
static func layer_bit(layer_number: int) -> int:
	return 1 << (layer_number - 1)
