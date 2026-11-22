extends RefCounted
## scenario-godot-shaders AgentKit module (0.1, Godot 4.7.2). Installed to res://addons/agentkit/shaders/ by
## gd_shaders.install(project). Job methods take the AgentKit job and return a Dictionary:
##   compile(job)        compile .gdshader / VisualShader files, per-file errors and uniforms
##                       (headless = language checks for the --rendering-method given;
##                        windowed with draw=true = also the backend: stencil queue, fog on OpenGL)
##   sweep(job)          render one scene under several parameter sets (material, instance, global)
##   visual_shader(job)  generated code, errors and node count of a VisualShader resource
##   compute_probe(job)  local RenderingDevice: availability, a GLSL kernel, CPU parity, RIDs freed
## Static helpers: dissolve_bounds(), noise_texture_2d(), noise_texture_3d(), wait_texture().

const Capture := preload("res://addons/agentkit/agent_capture.gd")


# ------------------------------------------------------------------ compile

func compile(job) -> Dictionary:
	job.expect_errors = true
	var files: Array = job.arg("files", [])
	if files.is_empty():
		files = find_shader_files(str(job.arg("root", "res://")), bool(job.arg("include_addons", false)))
	var draw: bool = job.arg("draw", false) and not job.is_headless()
	var probe := {}
	if draw:
		probe = _make_probe(job)
	var report := {}
	var failed: Array = []
	for f in files:
		var before: int = job.captured_error_count()
		var entry := {}
		var res = load(f) if ResourceLoader.exists(f) else null
		if res == null or not (res is Shader):
			entry = {"loaded": false}
		else:
			var sh: Shader = res
			var ul := sh.get_shader_uniform_list()
			entry["mode"] = ["spatial", "canvas_item", "particles", "sky", "fog"][clampi(sh.get_mode(), 0, 4)]
			entry["uniforms"] = _uniforms(ul)
			if draw:
				await _draw_with(job, probe, sh)
		var errs: Array = job.captured_errors().slice(before)
		var msgs: Array = []
		for e in errs:
			var m := str(e.get("message", ""))
			if m == "Shader compilation failed.":
				continue
			msgs.append({"type": e.get("type"), "message": m.substr(0, 300), "line": e.get("line")})
		entry["errors"] = msgs
		report[f] = entry
		if not msgs.is_empty() or not entry.get("loaded", true):
			failed.append(f)
	if draw:
		probe["vp"].queue_free()
		await job.process_frame
	return {"ok": failed.is_empty(), "checked": files.size(), "failed": failed, "files": report,
			"renderer": RenderingServer.get_current_rendering_method(), "drawn": draw,
			"error": "" if failed.is_empty() else "shader errors in %d file(s): %s" % [failed.size(), ", ".join(failed)]}


static func find_shader_files(root: String, include_addons := false) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var dir: String = stack.pop_back()
		var da := DirAccess.open(dir)
		if da == null:
			continue
		for d in da.get_directories():
			if d.begins_with(".") or (d == "addons" and not include_addons):
				continue
			if FileAccess.file_exists(dir.path_join(d).path_join(".gdignore")):
				continue
			stack.append(dir.path_join(d))
		for f in da.get_files():
			if f.ends_with(".gdshader"):
				out.append(dir.path_join(f))
			elif f.ends_with(".tres") and _is_visual_shader_file(dir.path_join(f)):
				out.append(dir.path_join(f))
	out.sort()
	return out


static func _is_visual_shader_file(path: String) -> bool:
	var fa := FileAccess.open(path, FileAccess.READ)
	if fa == null:
		return false
	var head := fa.get_line()
	return head.contains("type=\"VisualShader\"")


static func _uniforms(ul: Array) -> Array:
	var out: Array = []
	for u in ul:
		out.append({"name": u.get("name"), "type": type_string(int(u.get("type", 0))), "hint": int(u.get("hint", 0)),
				"hint_string": str(u.get("hint_string", ""))})
	return out


func _make_probe(job) -> Dictionary:
	var vp := SubViewport.new()
	vp.size = Vector2i(64, 64)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	job.root.add_child(vp)
	var cam := Camera3D.new()
	cam.position = Vector3(0, 0, 3)
	vp.add_child(cam)
	cam.current = true
	var mi := MeshInstance3D.new()
	mi.mesh = BoxMesh.new()
	vp.add_child(mi)
	var ci := ColorRect.new()
	ci.size = Vector2(32, 32)
	vp.add_child(ci)
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = Sky.new()
	env.volumetric_fog_enabled = RenderingServer.get_current_rendering_method() == "forward_plus"
	var we := WorldEnvironment.new()
	we.environment = env
	vp.add_child(we)
	var gp := GPUParticles3D.new()
	gp.amount = 4
	gp.draw_pass_1 = QuadMesh.new()
	vp.add_child(gp)
	var fv := FogVolume.new()
	vp.add_child(fv)
	return {"vp": vp, "mesh": mi, "canvas": ci, "env": env, "particles": gp, "fog": fv}


func _draw_with(job, probe: Dictionary, sh: Shader) -> void:
	var m := ShaderMaterial.new()
	m.shader = sh
	match sh.get_mode():
		Shader.MODE_SPATIAL:
			probe["mesh"].material_override = m
		Shader.MODE_CANVAS_ITEM:
			probe["canvas"].material = m
		Shader.MODE_PARTICLES:
			probe["particles"].process_material = m
		Shader.MODE_SKY:
			probe["env"].sky.sky_material = m
		Shader.MODE_FOG:
			probe["fog"].material = m
	await job.wait_frames(3)
	await RenderingServer.frame_post_draw
	probe["mesh"].material_override = null
	probe["canvas"].material = null
	probe["particles"].process_material = null
	probe["env"].sky.sky_material = null
	probe["fog"].material = null


# ------------------------------------------------------------------ sweep

## args: scene, size [w, h], frames (per shot, default 6), camera (NodePath, optional),
##   shots: [{"label": "a0", "set": [[node_path, kind, name, value], ...]}, ...]
##     kind: "shader" (the node's material_override, else material, else surface 0 override),
##           "instance" (set_instance_shader_parameter), "global" (node_path ignored),
##           "prop" (node.set, or set_indexed for "environment:glow_enabled" style paths)
##   or the short form: node, param, values, kind (default "shader").
##   time_scale: Engine.time_scale during the sweep (0 freezes TIME-driven animation; default 1).
func sweep(job) -> Dictionary:
	if job.is_headless():
		return {"ok": false, "error": "sweep renders: run windowed (gd_shaders.param_sweep does)"}
	var scene_path: String = job.arg("scene", "")
	if not ResourceLoader.exists(scene_path):
		return {"ok": false, "error": "scene not found: " + scene_path}
	var size: Vector2i = job.arg("size", Vector2i(640, 360))
	var frames: int = job.arg("frames", 6)
	var shots: Array = job.arg("shots", [])
	if shots.is_empty():
		var node_s: String = job.arg("node", "")
		var param: String = job.arg("param", "")
		var kind: String = job.arg("kind", "shader")
		for v in job.arg("values", []):
			shots.append({"label": "%s_%s" % [param, str(v)], "set": [[node_s, kind, param, v]]})
	var cap = Capture.new()
	var vp: SubViewport = cap.make_viewport(job, size, false)
	var inst: Node = (load(scene_path) as PackedScene).instantiate()
	vp.add_child(inst)
	var cam_path: String = job.arg("camera", "")
	if cam_path != "":
		var c = inst.get_node_or_null(cam_path)
		if c is Camera3D:
			(c as Camera3D).current = true
		elif c is Camera2D:
			(c as Camera2D).make_current()
	Engine.time_scale = float(job.arg("time_scale", 1.0))
	await job.wait_frames(2)
	var images: Array = []
	var applied: Array = []
	var out_prefix: String = job.arg("out", "captures/sweep/shot")
	for i in range(shots.size()):
		var shot: Dictionary = shots[i]
		var log_set: Array = []
		for s in shot.get("set", []):
			log_set.append(_apply_setting(inst, s))
		await job.wait_frames(frames)
		await RenderingServer.frame_post_draw
		var label := str(shot.get("label", str(i))).validate_filename()
		var p: String = job.out_path("%s_%02d_%s.png" % [out_prefix, i, label])
		var err: String = cap._save(vp, p)
		if err != "":
			Engine.time_scale = 1.0
			return {"ok": false, "error": err}
		images.append(p)
		applied.append({"label": label, "set": log_set})
	Engine.time_scale = 1.0
	vp.queue_free()
	await job.process_frame
	return {"ok": true, "images": images, "shots": applied, "size": size, "scene": scene_path,
			"renderer": RenderingServer.get_current_rendering_method()}


static func _to_variant(v: Variant) -> Variant:
	if v is Array:
		match (v as Array).size():
			2:
				return Vector2(v[0], v[1])
			3:
				return Vector3(v[0], v[1], v[2])
			4:
				return Color(v[0], v[1], v[2], v[3])
	return v


func _apply_setting(root: Node, s: Array) -> String:
	var path: String = str(s[0])
	var kind: String = str(s[1])
	var name: String = str(s[2])
	var value: Variant = _to_variant(s[3])
	if kind == "global":
		RenderingServer.global_shader_parameter_set(name, value)
		return "global %s = %s" % [name, str(value)]
	var node: Node = root if path in ["", "."] else root.get_node_or_null(path)
	if node == null:
		push_error("sweep: node not found: " + path)
		return "missing " + path
	match kind:
		"instance":
			if node is GeometryInstance3D:
				(node as GeometryInstance3D).set_instance_shader_parameter(name, value)
			else:
				(node as CanvasItem).set_instance_shader_parameter(name, value)
		"prop":
			if name.contains(":"):
				node.set_indexed(NodePath(name), value)
			else:
				node.set(name, value)
		_:
			var m := material_of(node)
			if m == null:
				push_error("sweep: no ShaderMaterial on " + path)
				return "no material " + path
			m.set_shader_parameter(name, value)
	return "%s %s.%s = %s" % [kind, path, name, str(value)]


## The ShaderMaterial that draws a node: material_override, then CanvasItem.material, then the
## surface 0 override, then the mesh's own surface 0 material.
static func material_of(node: Node) -> ShaderMaterial:
	if node is GeometryInstance3D and (node as GeometryInstance3D).material_override is ShaderMaterial:
		return (node as GeometryInstance3D).material_override
	if node is CanvasItem and (node as CanvasItem).material is ShaderMaterial:
		return (node as CanvasItem).material
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		if mi.get_surface_override_material_count() > 0 and mi.get_surface_override_material(0) is ShaderMaterial:
			return mi.get_surface_override_material(0)
		if mi.mesh and mi.mesh.get_surface_count() > 0 and mi.mesh.surface_get_material(0) is ShaderMaterial:
			return mi.mesh.surface_get_material(0)
	return null


# ------------------------------------------------------------------ VisualShader

func visual_shader(job) -> Dictionary:
	job.expect_errors = true
	var path: String = job.arg("path", "")
	var vs = load(path) if ResourceLoader.exists(path) else null
	if not (vs is VisualShader):
		return {"ok": false, "error": "not a VisualShader: " + path}
	var before: int = job.captured_error_count()
	var code: String = (vs as Shader).code
	var ul := (vs as Shader).get_shader_uniform_list()
	var errs: Array = job.captured_errors().slice(before)
	var counts := {}
	for t in ["vertex", "fragment", "light"]:
		var ty: int = {"vertex": VisualShader.TYPE_VERTEX, "fragment": VisualShader.TYPE_FRAGMENT, "light": VisualShader.TYPE_LIGHT}[t]
		counts[t] = (vs as VisualShader).get_node_list(ty).size()
	var out_code: String = job.arg("save_code", "")
	if out_code != "":
		var fa := FileAccess.open(out_code, FileAccess.WRITE)
		fa.store_string(code)
		fa.close()
	return {"ok": errs.is_empty() and code.length() > 0, "code_lines": code.split("\n").size(), "nodes": counts,
			"uniforms": _uniforms(ul), "errors": errs.slice(0, 10), "code_head": code.substr(0, 1200)}


# ------------------------------------------------------------------ compute

const _DOUBLE_GLSL := """#version 450
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;
layout(set = 0, binding = 0, std430) restrict buffer Data { float v[]; } data;
layout(push_constant, std430) uniform Params { uint count; uint pad0; uint pad1; uint pad2; } params;
void main() {
	uint i = gl_GlobalInvocationID.x;
	if (i >= params.count) { return; }
	data.v[i] = data.v[i] * 2.0 + 1.0;
}
"""


## Local RenderingDevice probe: n floats through v * 2 + 1 on the GPU, compared with the CPU.
func compute_probe(job) -> Dictionary:
	var n: int = job.arg("n", 1 << 20)
	var rd := RenderingServer.create_local_rendering_device()
	if rd == null:
		return {"ok": false, "rd": false, "error": "create_local_rendering_device() returned null (renderer %s, display %s): compute needs Forward+ or Mobile on a real GPU" % [RenderingServer.get_current_rendering_method(), DisplayServer.get_name()]}
	var src := RDShaderSource.new()
	src.language = RenderingDevice.SHADER_LANGUAGE_GLSL
	src.source_compute = _DOUBLE_GLSL
	var spirv := rd.shader_compile_spirv_from_source(src)
	if spirv.compile_error_compute != "":
		rd.free()
		return {"ok": false, "error": "GLSL: " + spirv.compile_error_compute}
	var shader := rd.shader_create_from_spirv(spirv)
	var input := PackedFloat32Array()
	input.resize(n)
	for i in n:
		input[i] = float(i % 1000) * 0.5
	var bytes := input.to_byte_array()
	var buf := rd.storage_buffer_create(bytes.size(), bytes)
	var u := RDUniform.new()
	u.uniform_type = RenderingDevice.UNIFORM_TYPE_STORAGE_BUFFER
	u.binding = 0
	u.add_id(buf)
	var uset := rd.uniform_set_create([u], shader, 0)
	var pipe := rd.compute_pipeline_create(shader)
	var pc := PackedInt32Array([n, 0, 0, 0]).to_byte_array()
	var t0 := Time.get_ticks_usec()
	var cl := rd.compute_list_begin()
	rd.compute_list_bind_compute_pipeline(cl, pipe)
	rd.compute_list_bind_uniform_set(cl, uset, 0)
	rd.compute_list_set_push_constant(cl, pc, pc.size())
	rd.compute_list_dispatch(cl, int(ceil(n / 64.0)), 1, 1)
	rd.compute_list_end()
	rd.submit()
	rd.sync()
	var gpu_us := Time.get_ticks_usec() - t0
	var out := rd.buffer_get_data(buf).to_float32_array()
	var t1 := Time.get_ticks_usec()
	var mismatches := 0
	for i in n:
		if absf(out[i] - (input[i] * 2.0 + 1.0)) > 0.0001:
			mismatches += 1
	var cpu_us := Time.get_ticks_usec() - t1
	for rid in [pipe, uset, buf, shader]:
		rd.free_rid(rid)
	rd.free()
	return {"ok": mismatches == 0, "rd": true, "n": n, "mismatches": mismatches, "gpu_submit_sync_ms": gpu_us / 1000.0,
			"cpu_check_ms": cpu_us / 1000.0, "sample": [out[0], out[1], out[n - 1]],
			"renderer": RenderingServer.get_current_rendering_method(), "driver": RenderingServer.get_current_rendering_driver_name()}


# ------------------------------------------------------------------ static helpers

## Extent of a mesh along an object-space direction, for dissolve.gdshader's `bounds` uniform.
static func dissolve_bounds(mesh: Mesh, dir: Vector3 = Vector3.UP, pad: float = 0.02) -> Vector2:
	var a := mesh.get_aabb()
	var d := dir.normalized()
	var lo := INF
	var hi := -INF
	for i in 8:
		var p := a.get_endpoint(i).dot(d)
		lo = minf(lo, p)
		hi = maxf(hi, p)
	return Vector2(lo - pad, hi + pad)


## Seamless cellular noise (Bramwell's water recipe): Euclidean squared, jitter 1, no fractal.
static func noise_texture_2d(size: int = 256, frequency: float = 0.02, seed_v: int = 0) -> NoiseTexture2D:
	var fn := FastNoiseLite.new()
	fn.noise_type = FastNoiseLite.TYPE_CELLULAR
	fn.fractal_type = FastNoiseLite.FRACTAL_NONE
	fn.cellular_distance_function = FastNoiseLite.DISTANCE_EUCLIDEAN_SQUARED
	fn.cellular_jitter = 1.0
	fn.cellular_return_type = FastNoiseLite.RETURN_DISTANCE
	fn.frequency = frequency
	fn.seed = seed_v
	var t := NoiseTexture2D.new()
	t.width = size
	t.height = size
	t.seamless = true
	t.noise = fn
	return t


## Seamless 3D noise for volume-sampled effects (dissolve): cellular as in StayAtHomeDev (128 cubed
## there; 64 cubed is 256 KB as L8 [added]).
static func noise_texture_3d(size: int = 64, frequency: float = 0.06, seed_v: int = 0) -> NoiseTexture3D:
	var fn := FastNoiseLite.new()
	fn.noise_type = FastNoiseLite.TYPE_CELLULAR
	fn.fractal_type = FastNoiseLite.FRACTAL_FBM
	fn.fractal_octaves = 2
	fn.frequency = frequency
	fn.seed = seed_v
	var t := NoiseTexture3D.new()
	t.width = size
	t.height = size
	t.depth = size
	t.seamless = true
	t.noise = fn
	return t


## NoiseTexture2D/3D generate on a thread: wait until the image exists before reading or capturing.
static func wait_texture(job, tex: Texture, max_frames: int = 240) -> bool:
	for i in max_frames:
		if tex is NoiseTexture2D and (tex as NoiseTexture2D).get_image() != null:
			return true
		if tex is NoiseTexture3D and not (tex as NoiseTexture3D).get_data().is_empty():
			return true
		await job.process_frame
	return false
