extends "res://addons/agentkit/agent_job.gd"
## GPU-only compute output: a compute shader writes an RGBA32F image on the MAIN RenderingDevice,
## Texture2DRD shows it on a TextureRect with no CPU readback (The Pathfinders Codex recipe). All RD
## calls run on the render thread (RenderingServer.call_on_render_thread); no submit()/sync() on the
## main device. Windowed only. Captures the TextureRect to PNG and frees every RID it created.

const Capture := preload("res://addons/agentkit/agent_capture.gd")
const GLSL := """#version 450
layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;
layout(rgba32f, set = 0, binding = 0) uniform restrict writeonly image2D out_img;
layout(push_constant, std430) uniform Params { float time; float pad0; float pad1; float pad2; } params;
void main() {
	ivec2 p = ivec2(gl_GlobalInvocationID.xy);
	ivec2 size = imageSize(out_img);
	if (p.x >= size.x || p.y >= size.y) { return; }
	vec2 uv = (vec2(p) + 0.5) / vec2(size);
	float r = length(uv - 0.5);
	float rings = 0.5 + 0.5 * cos(r * 60.0 - params.time * 4.0);
	imageStore(out_img, p, vec4(uv.x, rings, uv.y, 1.0));
}
"""

var rd: RenderingDevice
var tex_rid: RID
var shader_rid: RID
var pipe_rid: RID
var uset_rid: RID
var size := 256
var errors_rt: Array = []

func _setup() -> void:
	var src := RDShaderSource.new()
	src.source_compute = GLSL
	var spirv := rd.shader_compile_spirv_from_source(src)
	if spirv.compile_error_compute != "":
		errors_rt.append(spirv.compile_error_compute)
		return
	shader_rid = rd.shader_create_from_spirv(spirv)
	pipe_rid = rd.compute_pipeline_create(shader_rid)
	var fmt := RDTextureFormat.new()
	fmt.format = RenderingDevice.DATA_FORMAT_R32G32B32A32_SFLOAT
	fmt.width = size
	fmt.height = size
	fmt.usage_bits = RenderingDevice.TEXTURE_USAGE_STORAGE_BIT | RenderingDevice.TEXTURE_USAGE_SAMPLING_BIT | RenderingDevice.TEXTURE_USAGE_CAN_COPY_FROM_BIT
	tex_rid = rd.texture_create(fmt, RDTextureView.new(), [])
	var u := RDUniform.new()
	u.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
	u.binding = 0
	u.add_id(tex_rid)
	uset_rid = rd.uniform_set_create([u], shader_rid, 0)

func _dispatch(t: float) -> void:
	if not pipe_rid.is_valid():
		return
	var pc := PackedFloat32Array([t, 0.0, 0.0, 0.0]).to_byte_array()
	var cl := rd.compute_list_begin()
	rd.compute_list_bind_compute_pipeline(cl, pipe_rid)
	rd.compute_list_bind_uniform_set(cl, uset_rid, 0)
	rd.compute_list_set_push_constant(cl, pc, pc.size())
	rd.compute_list_dispatch(cl, size / 8, size / 8, 1)
	rd.compute_list_end()

func _cleanup() -> void:
	for rid in [uset_rid, pipe_rid, tex_rid, shader_rid]:
		if rid.is_valid():
			rd.free_rid(rid)

func run() -> Dictionary:
	if is_headless():
		return {"ok": false, "error": "needs a windowed run (main RenderingDevice)"}
	rd = RenderingServer.get_rendering_device()
	if rd == null:
		return {"ok": false, "error": "no main RenderingDevice (Compatibility renderer?)"}
	RenderingServer.call_on_render_thread(_setup)
	await wait_frames(2)
	if not errors_rt.is_empty():
		return {"ok": false, "error": str(errors_rt)}
	var t2d := Texture2DRD.new()
	t2d.texture_rd_rid = tex_rid
	var cap = Capture.new()
	var vp: SubViewport = cap.make_viewport(self, Vector2i(256, 256), false)
	var tr := TextureRect.new()
	tr.texture = t2d
	tr.size = Vector2(256, 256)
	vp.size_2d_override = Vector2i.ZERO
	vp.add_child(tr)
	var shots: Array = []
	for i in 2:
		RenderingServer.call_on_render_thread(_dispatch.bind(float(i) * 0.4))
		await wait_frames(3)
		await RenderingServer.frame_post_draw
		var p := out_path("captures/compute/texture2drd_%d.png" % i)
		var err: String = cap._save(vp, p)
		if err != "":
			return {"ok": false, "error": err}
		shots.append(p)
	vp.queue_free()
	tr.texture = null
	t2d.texture_rd_rid = RID()
	await wait_frames(1)
	RenderingServer.call_on_render_thread(_cleanup)
	await wait_frames(2)
	return {"ok": true, "images": shots, "driver": RenderingServer.get_current_rendering_driver_name()}
