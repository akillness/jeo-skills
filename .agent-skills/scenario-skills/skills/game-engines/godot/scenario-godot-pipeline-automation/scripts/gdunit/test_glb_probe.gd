# gdUnit4 suite: the byte-level GLB probe on hand-built bytes (no files, no import).
extends GdUnitTestSuite

const GlbProbe = preload("res://addons/agentkit/pipeline/glb_probe.gd")


## Minimal GLB: one triangle, POSITION accessor with min/max, optional extensions.
func _glb(json: Dictionary) -> PackedByteArray:
	var bin := PackedByteArray()
	bin.resize(36)
	var js := JSON.stringify(json).to_utf8_buffer()
	while js.size() % 4 != 0:
		js.append(0x20)
	var out := PackedByteArray()
	out.resize(12)
	out.encode_u32(0, 0x46546C67)
	out.encode_u32(4, 2)
	out.encode_u32(8, 12 + 8 + js.size() + 8 + bin.size())
	var h := PackedByteArray()
	h.resize(8)
	h.encode_u32(0, js.size())
	h.encode_u32(4, 0x4E4F534A)
	out.append_array(h)
	out.append_array(js)
	h.encode_u32(0, bin.size())
	h.encode_u32(4, 0x004E4942)
	out.append_array(h)
	out.append_array(bin)
	return out


func _tri(extra := {}) -> Dictionary:
	var j := {"asset": {"version": "2.0", "generator": "unit test"}, "scene": 0, "scenes": [{"nodes": [0]}],
		"nodes": [{"mesh": 0, "translation": [0, 1, 0]}],
		"meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
		"accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [0, 0, 0], "max": [1, 2, 0]}],
		"bufferViews": [{"buffer": 0, "byteLength": 36}], "buffers": [{"byteLength": 36}]}
	j.merge(extra, true)
	return j


func test_triangle_counts_and_world_bounds() -> void:
	var r := GlbProbe.probe(_glb(_tri()))
	assert_bool(r.valid).is_true()
	assert_int(r.triangles).is_equal(1)
	assert_str(r.generator).is_equal("unit test")
	assert_float(r.aabb.position[1]).is_equal(1.0)  # node translation applied
	assert_float(r.aabb.size[1]).is_equal(2.0)


func test_required_draco_is_reported() -> void:
	var r := GlbProbe.probe(_glb(_tri({"extensionsUsed": ["KHR_draco_mesh_compression"],
			"extensionsRequired": ["KHR_draco_mesh_compression"]})))
	assert_array(r.unsupported_required).contains(["KHR_draco_mesh_compression"])


func test_used_clearcoat_is_reported_as_dropped() -> void:
	var r := GlbProbe.probe(_glb(_tri({"extensionsUsed": ["KHR_materials_clearcoat"]})))
	assert_array(r.unsupported_used).contains(["KHR_materials_clearcoat"])


func test_garbage_and_truncated_bytes_are_invalid() -> void:
	assert_bool(GlbProbe.probe("not a glb at all".to_utf8_buffer()).valid).is_false()
	var b := _glb(_tri())
	assert_bool(GlbProbe.probe(b.slice(0, 30)).valid).is_false()
	assert_bool(GlbProbe.probe(PackedByteArray()).valid).is_false()
