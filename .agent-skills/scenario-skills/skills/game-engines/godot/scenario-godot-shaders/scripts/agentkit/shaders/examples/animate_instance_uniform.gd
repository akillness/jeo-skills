extends "res://addons/agentkit/agent_job.gd"
## Drives a per-instance uniform from a Tween and from an AnimationPlayer track, headless, and reads
## the value back. Track paths are relative to root_node (default ".."). Property path: "instance_shader_parameters/<name>" on the GeometryInstance3D.
func run() -> Dictionary:
	var scene := await load_scene("res://scenes/dissolve_lab.tscn")
	var hero: GeometryInstance3D = scene.get_node("Hero")
	var torus: GeometryInstance3D = scene.get_node("Torus")
	hero.set_instance_shader_parameter("dissolve_amount", 0.0)
	var tw := scene.create_tween()
	tw.tween_property(hero, "instance_shader_parameters/dissolve_amount", 1.0, 0.5)
	await wait_seconds(0.25)
	var mid: float = hero.get_instance_shader_parameter("dissolve_amount")
	await tw.finished
	var end: float = hero.get_instance_shader_parameter("dissolve_amount")
	# AnimationPlayer track on the torus
	var ap := AnimationPlayer.new()
	scene.add_child(ap)
	var anim := Animation.new()
	anim.length = 0.4
	var t := anim.add_track(Animation.TYPE_VALUE)
	anim.track_set_path(t, NodePath("Torus:instance_shader_parameters/dissolve_amount"))
	anim.track_insert_key(t, 0.0, 0.0)
	anim.track_insert_key(t, 0.4, 0.8)
	var lib := AnimationLibrary.new()
	lib.add_animation("dissolve", anim)
	ap.add_animation_library("", lib)
	ap.play("dissolve")
	await wait_seconds(0.6)
	var torus_end: float = torus.get_instance_shader_parameter("dissolve_amount")
	var crate_val = scene.get_node("Crate").get_instance_shader_parameter("dissolve_amount")
	# material uniform: property path shader_parameter/<name> on the ShaderMaterial
	var mat: ShaderMaterial = (hero.material_override if hero.material_override else (hero as MeshInstance3D).get_active_material(0))
	# A uniform still at its shader default is not stored on the material: get returns null, and a Tween
	# from null to a float fails ("Type mismatch ... Nil and float") and never emits finished.
	var unset_value = mat.get_shader_parameter("edge_width")
	mat.set_shader_parameter("edge_width", 0.06)
	var tw2 := scene.create_tween()
	tw2.tween_property(mat, "shader_parameter/edge_width", 0.2, 0.2)
	await tw2.finished
	var edge: float = mat.get_shader_parameter("edge_width")
	return {"ok": mid > 0.2 and mid < 0.8 and is_equal_approx(end, 1.0) and absf(torus_end - 0.8) < 0.01 and is_equal_approx(edge, 0.2),
			"tween_mid": mid, "tween_end": end, "anim_end": torus_end, "crate_untouched": crate_val, "material_edge_width": edge, "unset_material_param_is_null": unset_value == null}
