extends RefCounted
## scenario-godot-rendering-lighting 0.1 (Godot 4.7.2): bake GI without a mouse.
##
## VoxelGI: VoxelGI.bake() is script API, so a plain job can bake and save it, but it needs a
## RenderingDevice for the distance field: run WINDOWED (headless saves empty data, observed 4.7.2).
## It bakes in place: the scene file is resaved with the VoxelGI and <scene>_voxelgi.res.
##   gd_run.run_script(P, kit("gi_bake.gd:voxelgi"), {"scene": "res://lookdev/voxel.tscn", "subdiv": 1}, headless=False)
##
## LightmapGI: 4.7.2 exposes NO bake method to scripts (ClassDB has no LightmapGI.bake). The editor's
## "Bake Lightmaps" toolbar button is the only entry point, so this job runs inside the editor (-e),
## WINDOWED (the lightmapper needs a RenderingDevice; headless has none), selects the LightmapGI,
## pre-assigns a LightmapGIData saved at <scene>.lmbake (so no file dialog opens), presses the button
## and waits for the bake to write its files.
##   gd_run.run_script(P, kit("gi_bake.gd:lightmap"), {"scene": ..., "quality": 0}, headless=False, editor=True)

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")


## Bake (or rebake) a VoxelGI sized to the scene bounds, save its data next to the scene.
func voxelgi(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "VoxelGI.bake needs a RenderingDevice for its distance field (headless saves empty data): run windowed"}
	var scene_path: String = job.arg("scene", "res://main.tscn")
	var node_name: String = job.arg("node", "VoxelGI")
	var subdiv: int = job.arg("subdiv", 1)          # 0=64, 1=128 (default), 2=256, 3=512 cells on the longest axis
	var margin: float = job.arg("margin", 1.0)
	var interior: bool = job.arg("interior", false)
	var energy: float = job.arg("energy", 1.0)
	var root: Node3D = (load(scene_path) as PackedScene).instantiate()
	job.root.add_child(root)
	await job.wait_frames(1)
	var vg := root.get_node_or_null(node_name) as VoxelGI
	if vg == null:
		vg = VoxelGI.new()
		vg.name = node_name
		root.add_child(vg)
	var aabb := _static_aabb(root)
	vg.global_position = aabb.get_center()
	vg.size = aabb.size + Vector3.ONE * margin * 2.0
	vg.subdiv = subdiv
	var t0 := Time.get_ticks_msec()
	vg.bake(root, false)
	var ms := Time.get_ticks_msec() - t0
	var data := vg.data
	if data == null:
		root.queue_free()
		return {"ok": false, "error": "VoxelGI.bake() produced no data"}
	data.interior = interior
	data.energy = energy
	var data_path := scene_path.get_basename() + "_voxelgi.res"
	var err := ResourceSaver.save(data, data_path)
	data.take_over_path(data_path)
	vg.data = load(data_path) if err == OK else data
	var octree := (data.get_octree_cells() as PackedByteArray).size()
	var sz := vg.size
	job.root.remove_child(root)
	var saved := AgentBuild.save_scene(root, scene_path)
	root.free()
	return {"ok": err == OK and saved.get("ok", false) and octree > 0, "bake_ms": ms, "data_path": data_path,
			"octree_bytes": octree, "size": [sz.x, sz.y, sz.z], "subdiv": subdiv, "saved": saved}


## Prepare a scene for baking (headless): light bake modes by policy, report meshes without UV2.
##   policy "hybrid" (docs' popular setup): DirectionalLight3D Dynamic, omni/spot/area Static
##   policy "static": every light Static; "dynamic": every light Dynamic (indirect baked only)
##   hidden lights get BAKE_DISABLED: hiding a light does NOT keep it out of a lightmap bake (docs).
func prepare(job) -> Dictionary:
	var scene_path: String = job.arg("scene", "res://main.tscn")
	var policy: String = job.arg("policy", "hybrid")
	var root: Node = (load(scene_path) as PackedScene).instantiate()
	var lights := {}
	var no_uv2: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is Light3D:
			var l := n as Light3D
			var mode := Light3D.BAKE_DYNAMIC
			if not l.visible:
				mode = Light3D.BAKE_DISABLED
			elif policy == "static" or (policy == "hybrid" and not (l is DirectionalLight3D)):
				mode = Light3D.BAKE_STATIC
			l.light_bake_mode = mode
			lights[str(root.get_path_to(l))] = ["disabled", "static", "dynamic"][mode]
		elif n is MeshInstance3D and (n as MeshInstance3D).gi_mode == GeometryInstance3D.GI_MODE_STATIC:
			var m := (n as MeshInstance3D).mesh
			if m and not has_uv2(m):
				no_uv2.append(str(root.get_path_to(n)))
	var saved := AgentBuild.save_scene(root, scene_path)
	root.free()
	return {"ok": saved.get("ok", false), "lights": lights, "static_meshes_without_uv2": no_uv2}


static func has_uv2(m: Mesh) -> bool:
	if m is PrimitiveMesh:
		return (m as PrimitiveMesh).add_uv2
	for s in m.get_surface_count():
		if m is ArrayMesh and ((m as ArrayMesh).surface_get_format(s) & Mesh.ARRAY_FORMAT_TEX_UV2) == 0:
			return false
	return m.get_surface_count() > 0


## Editor route for LightmapGI. Run with headless=False, editor=True.
func lightmap(job) -> Dictionary:
	if not Engine.is_editor_hint():
		return {"ok": false, "error": "run with editor=True (and headless=False): LightmapGI has no script bake API"}
	if job.is_headless():
		return {"ok": false, "error": "lightmap baking needs a RenderingDevice: run windowed (headless=False)"}
	var scene_path: String = job.arg("scene", "res://main.tscn")
	# Benign in a 160x90 agent window (observed 4.7.2): the progress dialog has no parent window to show
	# in, and the scene save logs one absolute-path get_node error. The bake itself completes.
	job.ignore_patterns.append_array(["current_window", "progress_dialog.cpp", "absolute paths from outside the active scene tree"])
	await job.wait_frames(2)
	EditorInterface.open_scene_from_path(scene_path)
	await job.wait_frames(3)
	var root := EditorInterface.get_edited_scene_root()
	if root == null or root.scene_file_path != scene_path:
		return {"ok": false, "error": "could not open " + scene_path}
	var lm := root.get_node_or_null(str(job.arg("node", "LightmapGI"))) as LightmapGI
	if lm == null:
		lm = LightmapGI.new()
		lm.name = str(job.arg("node", "LightmapGI"))
		root.add_child(lm)
		lm.owner = root
	lm.quality = job.arg("quality", 0) as LightmapGI.BakeQuality      # 0 low (iterate), 1 medium, 2 high, 3 ultra (final)
	lm.bounces = job.arg("bounces", 3)
	lm.texel_scale = job.arg("texel_scale", 1.0)
	lm.supersampling = job.arg("supersampling", false)
	lm.directional = job.arg("directional", false)
	lm.interior = job.arg("interior", false)
	lm.use_denoiser = job.arg("denoiser", true)
	lm.environment_mode = job.arg("environment_mode", 1) as LightmapGI.EnvironmentMode   # 0 disabled, 1 scene, 2 custom sky, 3 custom color
	lm.environment_custom_color = _color(job.arg("environment_color", [0.2, 0.2, 0.25]))
	lm.environment_custom_energy = job.arg("environment_energy", 1.0)
	lm.shadowmask_mode = job.arg("shadowmask_mode", 0) as LightmapGIData.ShadowmaskMode
	lm.generate_probes_subdiv = job.arg("probes", 2) as LightmapGI.GenerateProbes
	# Pre-assign external data so the bake has a save path (else the editor opens a file dialog).
	var lmbake: String = job.arg("data_path", scene_path.get_basename() + ".lmbake")
	if lm.light_data == null or lm.light_data.resource_path == "":
		var data := LightmapGIData.new()
		var e := ResourceSaver.save(data, lmbake)
		if e != OK:
			return {"ok": false, "error": "cannot save %s: %s" % [lmbake, error_string(e)]}
		lm.light_data = load(lmbake)
	EditorInterface.edit_node(lm)
	await job.wait_frames(3)
	var button := _find_button(EditorInterface.get_base_control(), str(job.arg("button_text", "Bake Lightmaps")))
	if button == null:
		return {"ok": false, "error": "Bake Lightmaps button not found (editor language not English, or LightmapGI not selected)"}
	var t0 := Time.get_ticks_msec()
	button.pressed.emit()          # LightmapGIEditorPlugin::_bake: synchronous, with an EditorProgress dialog
	await job.wait_frames(5)
	var ms := Time.get_ticks_msec() - t0
	EditorInterface.save_scene()
	await job.wait_frames(2)
	var data2 := lm.light_data
	var files: Array = []
	var dir := lmbake.get_base_dir()
	for f in DirAccess.get_files_at(dir):
		if f.begins_with(lmbake.get_file().get_basename()) and (f.ends_with(".exr") or f.ends_with(".lmbake")):
			files.append(dir.path_join(f))
	var tex_count := 0
	if data2 != null:
		tex_count = (data2.lightmap_textures as Array).size()
	return {"ok": tex_count > 0, "bake_ms": ms, "files": files, "lightmap_textures": tex_count,
			"data_path": data2.resource_path if data2 else "", "quality": lm.quality, "error": "" if tex_count > 0 else "bake produced no lightmap texture (see log)"}


func _find_button(n: Node, text: String) -> Button:
	if n is Button and (n as Button).text == text:
		return n as Button
	for c in n.get_children():
		var b := _find_button(c, text)
		if b:
			return b
	return null


func _color(a) -> Color:
	if a is Color:
		return a
	if a is Array and a.size() >= 3:
		return Color(float(a[0]), float(a[1]), float(a[2]), float(a[3]) if a.size() > 3 else 1.0)
	return Color.BLACK


## Union of visible, GI-static geometry bounds (skips huge ground planes when other geometry exists).
static func _static_aabb(root: Node) -> AABB:
	var acc := AABB()
	var first := true
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is GeometryInstance3D and (n as GeometryInstance3D).visible and (n as GeometryInstance3D).gi_mode == GeometryInstance3D.GI_MODE_STATIC:
			var gi := n as GeometryInstance3D
			var b: AABB = gi.global_transform * gi.get_aabb()
			if b.size.x < 30.0 and b.size.z < 30.0:
				acc = b if first else acc.merge(b)
				first = false
		for c in n.get_children():
			stack.append(c)
	return acc if not first else AABB(Vector3(-5, -5, -5), Vector3(10, 10, 10))
