@tool
extends CompositorEffect
## scenario-godot-rendering-lighting 0.1 (Godot 4.7.2): a full-screen compute CompositorEffect that runs one
## .glsl file (an RDShaderFile, the production path the docs recommend over runtime-compiled strings).
## Forward+ and Mobile only (Compatibility has no RenderingDevice). _render_callback runs on the
## RENDER THREAD: keep shared state to plain values set before use, or guard it with a Mutex.
## Add `class_name` if you want it in the inspector's "Add Element" list (needs an --import).

@export_file("*.glsl") var shader_path: String = "res://addons/agentkit/rendering/compositor/grayscale.glsl"
@export_range(0.0, 1.0) var strength: float = 1.0

var rd: RenderingDevice
var shader: RID
var pipeline: RID
var _compiled_path := ""
var _warned := false


func _init() -> void:
	effect_callback_type = EFFECT_CALLBACK_TYPE_POST_TRANSPARENT
	rd = RenderingServer.get_rendering_device()


func _notification(what: int) -> void:
	if what == NOTIFICATION_PREDELETE and shader.is_valid() and rd:
		rd.free_rid(shader)   # the pipeline depends on the shader and is freed with it


func _compile() -> void:
	if shader.is_valid():
		rd.free_rid(shader)
	shader = RID()
	pipeline = RID()
	_compiled_path = shader_path
	var f := load(shader_path) as RDShaderFile
	if f == null:
		push_error("post_effect: %s is not an imported RDShaderFile (run --import)" % shader_path)
		return
	var spirv := f.get_spirv()
	if spirv.compile_error_compute != "":
		push_error("post_effect: " + spirv.compile_error_compute)
		return
	shader = rd.shader_create_from_spirv(spirv)
	if shader.is_valid():
		pipeline = rd.compute_pipeline_create(shader)


func _render_callback(callback_type: int, render_data: RenderData) -> void:
	if rd == null or callback_type != EFFECT_CALLBACK_TYPE_POST_TRANSPARENT:
		return
	if not pipeline.is_valid() or _compiled_path != shader_path:
		_compile()
		if not pipeline.is_valid():
			return
	var buffers := render_data.get_render_scene_buffers() as RenderSceneBuffersRD
	if buffers == null:
		return
	var size := buffers.get_internal_size()   # 3D resolution BEFORE upscaling (upscaling runs after post)
	if size.x == 0 or size.y == 0:
		return
	var groups := Vector2i(ceili(size.x / 8.0), ceili(size.y / 8.0))
	var pc := PackedFloat32Array([size.x, size.y, strength, 0.0]).to_byte_array()   # 16-byte aligned
	# Mobile renderer, 4.7.2 (observed on Metal and Vulkan): the color layer has no STORAGE usage bit, so an
	# image2D write fails with an error every frame. Check the capability instead of the renderer name.
	var fmt := rd.texture_get_format(buffers.get_color_layer(0))
	if fmt == null or (fmt.usage_bits & RenderingDevice.TEXTURE_USAGE_STORAGE_BIT) == 0:
		if not _warned:
			push_warning("post_effect: color buffer is not a storage image on this renderer (%s): effect skipped" % RenderingServer.get_current_rendering_method())
			_warned = true
		return
	for view in buffers.get_view_count():
		var u := RDUniform.new()
		u.uniform_type = RenderingDevice.UNIFORM_TYPE_IMAGE
		u.binding = 0
		u.add_id(buffers.get_color_layer(view))
		var uset := UniformSetCacheRD.get_cache(shader, 0, [u])
		var cl := rd.compute_list_begin()
		rd.compute_list_bind_compute_pipeline(cl, pipeline)
		rd.compute_list_bind_uniform_set(cl, uset, 0)
		rd.compute_list_set_push_constant(cl, pc, pc.size())
		rd.compute_list_dispatch(cl, groups.x, groups.y, 1)
		rd.compute_list_end()
