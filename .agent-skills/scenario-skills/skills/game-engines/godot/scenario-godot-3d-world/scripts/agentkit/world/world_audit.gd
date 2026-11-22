extends RefCounted
## Level audit (scenario-godot-3d-world 0.1, Godot 4.7.2): world_audit.gd:level scans saved level scenes for the
## mistakes that the live tests of this skill tripped on or the experts warn about.

const W = preload("res://addons/agentkit/world/world_common.gd")


func level(job) -> Dictionary:
	var scenes: Array = job.arg("scenes", [])
	var report := {}
	var total_flags := 0
	for p in scenes:
		var text := FileAccess.get_file_as_string(p) if p.ends_with(".tscn") else ""
		var ps: PackedScene = load(p)
		if ps == null:
			report[p] = {"flags": ["not loadable"]}
			total_flags += 1
			continue
		var root: Node = ps.instantiate()
		var flags: Array = []
		var counts := {"csg": 0, "csg_moving_risk": 0, "scaled_shapes": 0, "double_sided": 0, "multimesh_empty": 0,
				"multimesh_no_range": 0, "bodies": 0, "unnamed_layers_used": 0}
		var used_layers := 0
		var stack: Array = [root]
		while not stack.is_empty():
			var n: Node = stack.pop_back()
			for c in n.get_children():
				stack.append(c)
			if n is CSGShape3D:
				counts["csg"] += 1
				if n.get_parent() is AnimatableBody3D or n is CSGShape3D and (n as CSGShape3D).get_script() != null:
					counts["csg_moving_risk"] += 1
			if n is CollisionShape3D and not (n as CollisionShape3D).scale.is_equal_approx(Vector3.ONE):
				counts["scaled_shapes"] += 1
			if n is CollisionObject3D:
				counts["bodies"] += 1
				used_layers |= (n as CollisionObject3D).collision_layer
			if n is MeshInstance3D and (n as MeshInstance3D).mesh:
				var mi := n as MeshInstance3D
				for s in mi.mesh.get_surface_count():
					var m := mi.get_active_material(s)
					if m is BaseMaterial3D and (m as BaseMaterial3D).cull_mode == BaseMaterial3D.CULL_DISABLED:
						counts["double_sided"] += 1
			if n is MultiMeshInstance3D:
				var mmi := n as MultiMeshInstance3D
				if mmi.multimesh and mmi.multimesh.instance_count > 0 and text != "" and not text.contains("buffer = PackedFloat32Array"):
					counts["multimesh_empty"] += 1
				if mmi.visibility_range_end <= 0.0:
					counts["multimesh_no_range"] += 1
		for i in range(1, 33):
			if used_layers & (1 << (i - 1)) and str(ProjectSettings.get_setting("layer_names/3d_physics/layer_%d" % i, "")) == "":
				counts["unnamed_layers_used"] += 1
		if counts["csg"] > 0:
			flags.append("%d CSG nodes: bake them for shipping (bake_static_mesh + bake_collision_shape)" % counts["csg"])
		if counts["scaled_shapes"] > 0:
			flags.append("%d scaled CollisionShape3D: resize the shape resource instead (HeightMapShape3D spacing is the exception)" % counts["scaled_shapes"])
		if counts["double_sided"] > 0:
			flags.append("%d double-sided surfaces: AI GLBs import doubleSided; set cull back on closed meshes" % counts["double_sided"])
		if counts["multimesh_empty"] > 0:
			flags.append("MultiMesh saved without a buffer: it was written by a headless run, every instance is lost")
		if counts["multimesh_no_range"] > 0:
			flags.append("%d MultiMeshInstance3D without visibility_range_end" % counts["multimesh_no_range"])
		if counts["unnamed_layers_used"] > 0:
			flags.append("%d collision layers in use have no name in Project Settings" % counts["unnamed_layers_used"])
		report[p] = {"counts": counts, "triangles": W.scene_triangles(root), "flags": flags}
		total_flags += flags.size()
		root.free()
	return {"ok": true, "scenes": report, "flags": total_flags}
