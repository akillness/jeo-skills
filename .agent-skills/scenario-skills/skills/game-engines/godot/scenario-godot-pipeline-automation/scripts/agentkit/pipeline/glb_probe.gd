extends RefCounted
## GLB probe (scenario-godot-pipeline-automation 0.1, Godot 4.7.2): read a .glb from BYTES, without importing it.
##
## Bytes in, Dictionary out (after Dinoleaf: the parser never touches FileAccess, so tests feed it
## literal bytes and the same code serves files, zips or downloads). Reports what a batch import
## must know before it spends minutes importing: validity, generator, triangle and vertex counts,
## materials, images with their pixel sizes, animations, the world-space bounds of scene 0 (node
## transforms applied), external URIs, and glTF extensions Godot 4.7.2 cannot read.
##
##   const GlbProbe = preload("res://addons/agentkit/pipeline/glb_probe.gd")
##   var info := GlbProbe.probe(FileAccess.get_file_as_bytes(path))
##   if not info.valid: print(info.error)

## Extensions the 4.7.2 importer reads (GLTFDocument.get_supported_gltf_extensions(), run 2026-10-02).
## Anything else in extensionsRequired makes the import fail; in extensionsUsed it is silently dropped.
const SUPPORTED_FALLBACK := ["EXT_texture_webp", "GODOT_single_root", "KHR_animation_pointer", "KHR_lights_punctual",
		"KHR_materials_emissive_strength", "KHR_materials_pbrSpecularGlossiness", "KHR_materials_unlit",
		"KHR_node_visibility", "KHR_texture_basisu", "KHR_texture_transform", "OMI_collider",
		"OMI_physics_body", "OMI_physics_shape"]


static func supported_extensions() -> PackedStringArray:
	if ClassDB.class_exists("GLTFDocument"):
		return GLTFDocument.get_supported_gltf_extensions()
	return PackedStringArray(SUPPORTED_FALLBACK)


static func probe(bytes: PackedByteArray) -> Dictionary:
	var r := {"valid": false, "error": "", "bytes": bytes.size()}
	if bytes.size() < 20:
		r.error = "too small for a GLB (%d bytes)" % bytes.size()
		return r
	if bytes.slice(0, 4).get_string_from_ascii() != "glTF":
		r.error = "bad magic (not a binary glTF)"
		return r
	var version := bytes.decode_u32(4)
	var length := bytes.decode_u32(8)
	r["version"] = version
	if version != 2:
		r.error = "glTF version %d (Godot reads 2.0)" % version
		return r
	if length > bytes.size():
		r.error = "truncated: header says %d bytes, file has %d" % [length, bytes.size()]
		return r
	var json_len := bytes.decode_u32(12)
	if bytes.slice(16, 20).get_string_from_ascii() != "JSON" or 20 + json_len > bytes.size():
		r.error = "first chunk is not a complete JSON chunk"
		return r
	var parsed = JSON.parse_string(bytes.slice(20, 20 + json_len).get_string_from_utf8())
	if not (parsed is Dictionary):
		r.error = "JSON chunk does not parse"
		return r
	var j: Dictionary = parsed
	var bin := PackedByteArray()
	var off := 20 + json_len
	if off + 8 <= bytes.size():
		var bin_len := bytes.decode_u32(off)
		if bytes.slice(off + 4, off + 7).get_string_from_ascii() == "BIN" and off + 8 + bin_len <= bytes.size():
			bin = bytes.slice(off + 8, off + 8 + bin_len)
	return _describe(j, bin, r)


static func _describe(j: Dictionary, bin: PackedByteArray, r: Dictionary) -> Dictionary:
	var asset: Dictionary = j.get("asset", {})
	r["generator"] = str(asset.get("generator", ""))
	r["copyright"] = str(asset.get("copyright", ""))
	var used: Array = j.get("extensionsUsed", [])
	var required: Array = j.get("extensionsRequired", [])
	var sup := supported_extensions()
	r["extensions_used"] = used
	r["extensions_required"] = required
	r["unsupported_required"] = required.filter(func(e): return not sup.has(e))
	r["unsupported_used"] = used.filter(func(e): return not sup.has(e))
	var accessors: Array = j.get("accessors", [])
	var meshes: Array = j.get("meshes", [])
	var tris := 0
	var verts := 0
	var prims := 0
	var mesh_aabbs: Array = []
	for m in meshes:
		var box := AABB()
		var has_box := false
		for p in m.get("primitives", []):
			prims += 1
			var attrs: Dictionary = p.get("attributes", {})
			var mode := int(p.get("mode", 4))
			var pos_i := int(attrs.get("POSITION", -1))
			var count := 0
			if p.has("indices"):
				count = int(accessors[int(p.indices)].get("count", 0))
			elif pos_i >= 0:
				count = int(accessors[pos_i].get("count", 0))
			if mode == 4:
				tris += count / 3
			elif mode == 5 or mode == 6:
				tris += maxi(count - 2, 0)
			if pos_i >= 0:
				var acc: Dictionary = accessors[pos_i]
				verts += int(acc.get("count", 0))
				if acc.has("min") and acc.has("max"):
					var mn := Vector3(acc["min"][0], acc["min"][1], acc["min"][2])
					var mx := Vector3(acc["max"][0], acc["max"][1], acc["max"][2])
					var b := AABB(mn, mx - mn)
					box = b if not has_box else box.merge(b)
					has_box = true
		if has_box:
			mesh_aabbs.append(box)
		else:
			mesh_aabbs.append(null)
	r["meshes"] = meshes.size()
	r["primitives"] = prims
	r["triangles"] = tris
	r["vertices"] = verts
	r["materials"] = (j.get("materials", []) as Array).size()
	r["animations"] = (j.get("animations", []) as Array).size()
	r["skins"] = (j.get("skins", []) as Array).size()
	r["nodes"] = (j.get("nodes", []) as Array).size()
	# images: size from the PNG/JPEG header in the BIN chunk; roles from the materials that use them
	var views: Array = j.get("bufferViews", [])
	var images: Array = j.get("images", [])
	var textures: Array = j.get("textures", [])
	var roles := {}
	for mat in j.get("materials", []):
		var pbr: Dictionary = mat.get("pbrMetallicRoughness", {})
		_role(roles, textures, pbr.get("baseColorTexture", {}), "albedo")
		_role(roles, textures, pbr.get("metallicRoughnessTexture", {}), "orm")
		_role(roles, textures, mat.get("normalTexture", {}), "normal")
		_role(roles, textures, mat.get("occlusionTexture", {}), "orm")
		_role(roles, textures, mat.get("emissiveTexture", {}), "emission")
	var imgs: Array = []
	var external: Array = []
	var max_side := 0
	for i in images.size():
		var im: Dictionary = images[i]
		var e := {"index": i, "name": str(im.get("name", "")), "mime": str(im.get("mimeType", "")), "w": 0, "h": 0,
				"role": roles.get(i, "unused")}
		if im.has("uri"):
			var uri := str(im.uri)
			e["uri"] = uri.substr(0, 40)
			if not uri.begins_with("data:"):
				external.append(uri)
		elif im.has("bufferView") and int(im.bufferView) < views.size() and not bin.is_empty():
			var v: Dictionary = views[int(im.bufferView)]
			var o := int(v.get("byteOffset", 0))
			var n := int(v.get("byteLength", 0))
			if o + n <= bin.size():
				var wh := image_size(bin.slice(o, mini(o + n, o + 65536)))
				e["w"] = wh.x
				e["h"] = wh.y
				max_side = maxi(max_side, maxi(wh.x, wh.y))
		imgs.append(e)
	for b in j.get("buffers", []):
		if (b as Dictionary).has("uri") and not str(b.uri).begins_with("data:"):
			external.append(str(b.uri))
	r["images"] = imgs
	r["max_texture"] = max_side
	r["external_uris"] = external
	# world bounds of the default scene (TRS or matrix per node, composed down the hierarchy)
	var nodes: Array = j.get("nodes", [])
	var scenes: Array = j.get("scenes", [])
	var scene_i := int(j.get("scene", 0))
	var roots: Array = scenes[scene_i].get("nodes", []) if scene_i < scenes.size() else []
	var acc_box := {"found": false, "box": AABB()}
	for n in roots:
		_walk(nodes, int(n), Transform3D.IDENTITY, mesh_aabbs, acc_box, 0)
	if acc_box["found"]:
		var bb: AABB = acc_box["box"]
		r["aabb"] = {"position": [bb.position.x, bb.position.y, bb.position.z], "size": [bb.size.x, bb.size.y, bb.size.z]}
	else:
		r["aabb"] = null
	r["valid"] = r.unsupported_required.is_empty() and external.is_empty() and tris > 0
	if not r.unsupported_required.is_empty():
		r.error = "requires unsupported glTF extension(s): " + ", ".join(r.unsupported_required)
	elif not external.is_empty():
		r.error = "references external file(s): " + ", ".join(external)
	elif tris == 0:
		r.error = "no triangles"
	return r


static func _role(roles: Dictionary, textures: Array, info: Dictionary, role: String) -> void:
	if not info.has("index"):
		return
	var ti := int(info["index"])
	if ti < textures.size():
		var src := int((textures[ti] as Dictionary).get("source", -1))
		if src >= 0 and not roles.has(src):
			roles[src] = role


static func _walk(nodes: Array, i: int, parent: Transform3D, mesh_aabbs: Array, acc: Dictionary, depth: int) -> void:
	if i < 0 or i >= nodes.size() or depth > 64:
		return
	var n: Dictionary = nodes[i]
	var t := parent * node_transform(n)
	if n.has("mesh"):
		var mi := int(n.mesh)
		if mi < mesh_aabbs.size() and mesh_aabbs[mi] != null:
			var b: AABB = t * (mesh_aabbs[mi] as AABB)
			if acc["found"]:
				acc["box"] = (acc["box"] as AABB).merge(b)
			else:
				acc["box"] = b
			acc["found"] = true
	for c in n.get("children", []):
		_walk(nodes, int(c), t, mesh_aabbs, acc, depth + 1)


static func node_transform(n: Dictionary) -> Transform3D:
	if n.has("matrix"):
		var m: Array = n.matrix  # column-major 4x4
		return Transform3D(Basis(Vector3(m[0], m[1], m[2]), Vector3(m[4], m[5], m[6]), Vector3(m[8], m[9], m[10])),
				Vector3(m[12], m[13], m[14]))
	var t := Vector3.ZERO
	var q := Quaternion.IDENTITY
	var s := Vector3.ONE
	if n.has("translation"):
		t = Vector3(n.translation[0], n.translation[1], n.translation[2])
	if n.has("rotation"):
		q = Quaternion(n.rotation[0], n.rotation[1], n.rotation[2], n.rotation[3]).normalized()
	if n.has("scale"):
		s = Vector3(n.scale[0], n.scale[1], n.scale[2])
	return Transform3D(Basis(q) * Basis.from_scale(s), t)


## Width and height from the first bytes of a PNG or JPEG (0, 0 when unknown).
static func image_size(b: PackedByteArray) -> Vector2i:
	if b.size() >= 24 and b[0] == 0x89 and b[1] == 0x50 and b[2] == 0x4E and b[3] == 0x47:
		return Vector2i(_be32(b, 16), _be32(b, 20))
	if b.size() >= 4 and b[0] == 0xFF and b[1] == 0xD8:
		var i := 2
		while i + 9 < b.size():
			if b[i] != 0xFF:
				i += 1
				continue
			var marker := b[i + 1]
			var seg := (b[i + 2] << 8) | b[i + 3]
			if marker >= 0xC0 and marker <= 0xCF and marker != 0xC4 and marker != 0xC8 and marker != 0xCC:
				return Vector2i((b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6])
			i += 2 + seg
	return Vector2i.ZERO


static func _be32(b: PackedByteArray, o: int) -> int:
	return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]
