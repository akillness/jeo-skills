extends RefCounted
## Prop thumbnails (scenario-godot-pipeline-automation 0.1, Godot 4.7.2): one PNG per imported prop, framed on its
## bounds from a three-quarter view next to a 1 m reference post, for a contact sheet you OPEN AND LOOK AT.
## Needs a windowed run (headless draws nothing):
##   gd_run.run_script(P, "res://addons/agentkit/pipeline/prop_thumbs.gd:thumbs", {"size": 160}, headless=False)

const Audit = preload("res://addons/agentkit/pipeline/prop_audit.gd")


func thumbs(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "thumbnails need a windowed run (headless=False)"}
	var size: int = job.arg("size", 160)
	var out_dir: String = job.out_path(job.arg("out_dir", "thumbs"))
	DirAccess.make_dir_recursive_absolute(out_dir)
	var vp := SubViewport.new()
	vp.size = Vector2i(size, size)
	vp.own_world_3d = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.msaa_3d = Viewport.MSAA_4X
	job.root.add_child(vp)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	# A sky, not a flat colour: with BG_COLOR there is nothing to reflect and metallic props render
	# black (seen on the first 200-prop contact sheet, 2026-10-02).
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.42, 0.47, 0.55)
	sky_mat.sky_horizon_color = Color(0.62, 0.64, 0.67)
	sky_mat.ground_horizon_color = Color(0.62, 0.64, 0.67)
	sky_mat.ground_bottom_color = Color(0.25, 0.25, 0.27)
	var sky := Sky.new()
	sky.sky_material = sky_mat
	e.sky = sky
	e.background_mode = Environment.BG_SKY
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	e.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.environment = e
	vp.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45, 35, 0)
	sun.light_energy = 1.2
	vp.add_child(sun)
	var cam := Camera3D.new()
	cam.fov = 35.0
	vp.add_child(cam)
	cam.make_current()
	var ref := MeshInstance3D.new()  # 1 m tall, 5 cm wide reference post, red
	var bm := BoxMesh.new()
	bm.size = Vector3(0.05, 1.0, 0.05)
	ref.mesh = bm
	var rm := StandardMaterial3D.new()
	rm.albedo_color = Color(0.9, 0.15, 0.1)
	ref.material_override = rm
	vp.add_child(ref)
	var entries := Audit.imported_entries(Audit.load_manifest(job.arg("manifest", "res://props/props_manifest.json")))
	entries.sort_custom(func(a, b): return str(a.id) < str(b.id))
	var limit: int = job.arg("limit", 0)
	var images: Array = []
	var missing: Array = []
	for e2 in entries:
		if limit > 0 and images.size() >= limit:
			break
		if not ResourceLoader.exists(str(e2.path)):
			missing.append(e2.id)
			continue
		var inst: Node3D = load(str(e2.path)).instantiate()
		vp.add_child(inst)
		var meta: Dictionary = inst.get_meta("pipeline", {})
		var bb := AABB(Vector3(-0.5, 0, -0.5), Vector3.ONE)
		if not meta.is_empty():
			bb = AABB(meta.aabb_position, meta.aabb_size)
		# post at the front-left corner (camera sits at +x +z, so -x +z is screen left, nearest side)
		var margin := 0.05 + 0.08 * maxf(bb.size.x, bb.size.z)
		ref.position = Vector3(bb.position.x - margin, 0.5, bb.end.z + margin)
		var framed := bb.merge(AABB(ref.position - Vector3(0.03, 0.5, 0.03), Vector3(0.06, 1.0, 0.06)))
		var r := maxf(framed.size.length() * 0.5, 0.6)
		var c := framed.get_center()
		var dir := Vector3(1.0, 0.7, 1.2).normalized()
		cam.position = c + dir * (r / sin(deg_to_rad(cam.fov * 0.5))) * 1.05
		cam.look_at(c, Vector3.UP)
		for i in 3:
			await RenderingServer.frame_post_draw
		var img := vp.get_texture().get_image()
		var p := out_dir.path_join("%s.png" % e2.id)
		img.save_png(p)
		images.append(p)
		inst.queue_free()
		await job.process_frame
	vp.queue_free()
	return {"ok": missing.is_empty() and not images.is_empty(), "images": images, "count": images.size(), "missing": missing,
			"out_dir": out_dir}
