extends RefCounted
## Texture pass (scenario-godot-pipeline-automation 0.1, Godot 4.7.2): after the first --import, set every texture
## the glTF importer extracted into res://props/ to VRAM compression, mipmaps, the category size limit,
## and normal-map compression for images the materials use as normalTexture. Then run --import again.
##
## Why: extracted textures import as Lossless with detect_3d/compress_to=1 (VRAM "when used in 3D").
## That switch happens only when a GUI editor renders them; headless --import never flips it (test M7),
## so CI builds would ship lossless textures and a later editor session would rewrite 200 .import files.
##   gd_run.run_script(P, "res://addons/agentkit/pipeline/prop_textures.gd:fix", {})

const TEX_EXT := ["png", "jpg", "jpeg", "webp"]


func fix(job) -> Dictionary:
	var mf: String = job.arg("manifest", "res://props/props_manifest.json")
	var data = JSON.parse_string(FileAccess.get_file_as_string(mf))
	if not (data is Dictionary):
		return {"ok": false, "error": "cannot read " + mf}
	var counts := {"textures": 0, "changed": 0, "normal": 0, "albedo": 0, "orm": 0, "emission": 0, "unknown": 0}
	for e in data.entries:
		if not e.has("path"):
			continue
		var folder := str(e.path).get_base_dir()
		var id := str(e.id)
		var roles: Dictionary = e.get("image_roles", {})
		var limit := int(job.arg("size_limit", 0))
		for f in DirAccess.get_files_at(folder):
			if not f.ends_with(".import") or not f.get_basename().get_extension().to_lower() in TEX_EXT:
				continue
			counts.textures += 1
			var img_name := f.get_basename().get_basename().trim_prefix(id + "_")
			var role := str(roles.get(img_name, ""))
			if role == "":
				var low := img_name.to_lower()
				role = "normal" if (low.contains("normal") or low.ends_with("_n") or low.contains("_nrm")) else "unknown"
			counts[role if counts.has(role) else "unknown"] += 1
			var want := {"compress/mode": 2, "detect_3d/compress_to": 0, "mipmaps/generate": true,
					"compress/normal_map": 1 if role == "normal" else 0,
					"process/size_limit": limit if limit > 0 else _limit_for(e)}
			var path := folder.path_join(f)
			var cf := ConfigFile.new()
			if cf.load(path) != OK:
				continue
			var changed := false
			for k in want:
				if cf.get_value("params", k, null) != want[k]:
					cf.set_value("params", k, want[k])
					changed = true
			if changed:
				cf.save(path)
				counts.changed += 1
	return {"ok": true, "counts": counts}


## The category limit the ingest wrote into the GLB sidecar (pipeline/texture_limit), else 1024.
static func _limit_for(e: Dictionary) -> int:
	var cf := ConfigFile.new()
	if cf.load(str(e.path) + ".import") == OK:
		return int(cf.get_value("params", "pipeline/texture_limit", 1024))
	return 1024
