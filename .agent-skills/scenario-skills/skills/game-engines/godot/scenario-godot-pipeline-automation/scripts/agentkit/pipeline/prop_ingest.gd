extends RefCounted
## Prop ingest (scenario-godot-pipeline-automation 0.1, Godot 4.7.2): art drop folder -> res://props/<cat>/<id>/<id>.glb
## plus a pre-written .glb.import sidecar per prop, BEFORE the first import. Plain headless job (no -e).
##
##   gd_run.run_script(P, "res://addons/agentkit/pipeline/prop_ingest.gd:ingest",
##                     {"drop": "/abs/art_drop/2026-10-02", "manifest": "manifest.csv"})
##
## Idempotent: a file is copied and its sidecar written only when the source md5 or the pipeline
## options changed, so a rerun on the same drop changes nothing and the next --import does nothing.
## Byte-identical duplicates are skipped; ids that collide get a _b, _c suffix and a warning; nothing
## is ever overwritten silently or deleted. Writes res://props/props_manifest.json and a report.

const GlbProbe = preload("res://addons/agentkit/pipeline/glb_probe.gd")
const Rules = preload("res://addons/agentkit/pipeline/prop_rules.gd")
const PIPELINE_VERSION := 1


func ingest(job) -> Dictionary:
	var t0 := Time.get_ticks_msec()
	var drop: String = job.arg("drop", "")
	var dest: String = job.arg("dest", "res://props")
	var texture_mode: String = job.arg("texture_mode", "extract")  # extract | basisu
	var collision: String = job.arg("collision", "box")
	var dry_run: bool = job.arg("dry_run", false)
	if drop == "" or not DirAccess.dir_exists_absolute(drop):
		return {"ok": false, "error": "drop folder not found: " + drop}
	var budgets: Dictionary = Rules.default_budgets()
	var over: Dictionary = job.arg("budgets", {})
	for k in over:
		budgets[k] = Rules.budget_for(budgets, k).merged(over[k], true)
	var rows := _read_manifest(drop.path_join(job.arg("manifest", "manifest.csv")))
	var known: Array = budgets.keys()
	var files: Array = []
	for f in DirAccess.get_files_at(drop):
		if f.get_extension().to_lower() == "glb":
			files.append(f)
	files.sort()
	var seen_md5 := {}
	var used_ids := {}
	var entries: Array = []
	var counts := {"accept": 0, "warn": 0, "reject": 0, "duplicate": 0, "copied": 0, "unchanged": 0, "sidecars_written": 0}
	for f in files:
		var src := drop.path_join(f)
		var bytes := FileAccess.get_file_as_bytes(src)
		var md5 := _md5(bytes)
		var e := {"file": f, "md5": md5, "bytes": bytes.size()}
		if seen_md5.has(md5):
			e["status"] = "duplicate"
			e["reasons"] = ["byte-identical to " + str(seen_md5[md5])]
			counts.duplicate += 1
			entries.append(e)
			continue
		seen_md5[md5] = f
		var row: Dictionary = rows.get(f, {})
		var name := Rules.normalize_name(str(row.get("name", "")) if str(row.get("name", "")) != "" else f.get_basename())
		var cat := str(row.get("category", ""))
		if cat == "":
			cat = Rules.infer_category(name, known)
			row = row.duplicate()
			row["category"] = cat
			e["inferred_category"] = true
		if not row.has("height_m"):
			row["height_m"] = 0.0
		var info := GlbProbe.probe(bytes)
		var d := Rules.decide(info, row, budgets)
		if e.get("inferred_category", false):
			d.reasons.append("not in manifest: category inferred as '%s'" % cat)
			if d.status == "accept":
				d.status = "warn"
		var id := Rules.prop_id(cat, name)
		var base_id := id
		var n := 1
		while used_ids.has(id):
			n += 1
			id = "%s_%s" % [base_id, "abcdefghij"[mini(n - 1, 9)]]
		if id != base_id:
			d.reasons.append("id collision with %s (from %s): renamed %s" % [base_id, used_ids[base_id], id])
			if d.status == "accept":
				d.status = "warn"
		if not Rules.id_valid(id):
			d.status = "reject"
			d.reasons.append("id '%s' breaks the naming rule %s" % [id, Rules.ID_PATTERN])
		e.merge({"id": id, "category": cat, "source": row.get("source", "dcc"), "status": d.status, "reasons": d.reasons,
				"fixes": d.fixes, "measured": d.measured, "generator": info.get("generator", ""),
				"extensions_dropped": info.get("unsupported_used", []), "images": (info.get("images", []) as Array).size(),
				"image_roles": _roles(info)})
		counts[d.status] += 1
		if d.status != "reject":
			used_ids[id] = f
			var folder := dest.path_join(cat).path_join(id)
			var glb := folder.path_join(id + ".glb")
			e["path"] = glb
			if not dry_run:
				var w := _write_prop(src, bytes, md5, glb, id, cat, d, info, budgets, texture_mode, collision)
				e["written"] = w
				if w.copied:
					counts.copied += 1
				else:
					counts.unchanged += 1
				if w.sidecar:
					counts.sidecars_written += 1
		entries.append(e)
	var report := {"pipeline_version": PIPELINE_VERSION, "drop": drop, "files": files.size(), "counts": counts,
			"texture_mode": texture_mode, "entries": entries, "seconds": (Time.get_ticks_msec() - t0) / 1000.0}
	if not dry_run:
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dest))
		var mf := FileAccess.open(dest.path_join("props_manifest.json"), FileAccess.WRITE)
		mf.store_string(JSON.stringify(report, "  ", false))
		mf.close()
	var reasons := {}
	for e in entries:
		for r in e.get("reasons", []):
			var head := RegEx.create_from_string("\\(.*\\)").sub(str(r).split(":")[0], "", true)
			var key := RegEx.create_from_string("-?[0-9][0-9.]*").sub(head, "N", true).strip_edges()
			reasons[key] = int(reasons.get(key, 0)) + 1
	return {"ok": true, "counts": counts, "files": files.size(), "seconds": report.seconds,
			"reason_counts": reasons, "rejects": entries.filter(func(x): return x.status == "reject").map(
				func(x): return {"file": x.file, "reasons": x.reasons}),
			"manifest": dest.path_join("props_manifest.json")}


func _write_prop(src: String, bytes: PackedByteArray, md5: String, glb: String, id: String, cat: String, d: Dictionary,
		info: Dictionary, budgets: Dictionary, texture_mode: String, collision: String) -> Dictionary:
	var abs_glb := ProjectSettings.globalize_path(glb)
	DirAccess.make_dir_recursive_absolute(abs_glb.get_base_dir())
	var copied := false
	if not FileAccess.file_exists(abs_glb) or _md5(FileAccess.get_file_as_bytes(abs_glb)) != md5:
		var f := FileAccess.open(abs_glb, FileAccess.WRITE)
		f.store_buffer(bytes)
		f.close()
		copied = true
	# Pre-seed the import settings (honoured on the first --import, verified 4.7.2 test M2) and the
	# pipeline options read by the prop_pipeline EditorScenePostImportPlugin (test M10). An existing
	# sidecar keeps its [remap] uid, so references by uid:// survive a re-ingest.
	var cf := ConfigFile.new()
	var sidecar := abs_glb + ".import"
	if FileAccess.file_exists(sidecar):
		cf.load(sidecar)
	else:
		cf.set_value("remap", "importer", "scene")
	var bud := Rules.budget_for(budgets, cat)
	var want := {
		"nodes/root_name": id,
		"gltf/embedded_image_handling": 2 if texture_mode == "basisu" else 1,
		"animation/import": false,
		"meshes/generate_lods": true,
		"meshes/light_baking": 1,
		"pipeline/version": PIPELINE_VERSION,
		"pipeline/prop_id": id,
		"pipeline/category": cat,
		"pipeline/source_md5": md5,
		"pipeline/unit_scale": float(d.fixes.get("unit_scale", 1.0)),
		"pipeline/fit_height": float(d.fixes.get("fit_height", 0.0)),
		"pipeline/fix_pivot": bool(d.fixes.get("fix_pivot", false)),
		"pipeline/collision": collision,
		"pipeline/texture_limit": int(bud.texture),
	}
	var changed := false
	for k in want:
		if not cf.has_section_key("params", k) or cf.get_value("params", k) != want[k]:
			cf.set_value("params", k, want[k])
			changed = true
	if changed:
		cf.save(sidecar)
	return {"copied": copied, "sidecar": changed}


static func _roles(info: Dictionary) -> Dictionary:
	var out := {}
	for im in info.get("images", []):
		out[str(im.get("name", ""))] = str(im.get("role", "unused"))
	return out


static func _md5(b: PackedByteArray) -> String:
	if b.is_empty():  # HashingContext.update() logs an engine error on 0 bytes (4.7.2)
		return "d41d8cd98f00b204e9800998ecf8427e"
	var h := HashingContext.new()
	h.start(HashingContext.HASH_MD5)
	h.update(b)
	return h.finish().hex_encode()


## manifest.csv: file,category,name,height_m,source (header row; quoted fields allowed).
static func _read_manifest(path: String) -> Dictionary:
	var out := {}
	if not FileAccess.file_exists(path):
		return out
	var f := FileAccess.open(path, FileAccess.READ)
	var header := f.get_csv_line()
	while not f.eof_reached():
		var line := f.get_csv_line()
		if line.size() < header.size() or line[0].strip_edges() == "":
			continue
		var row := {}
		for i in header.size():
			row[header[i]] = line[i]
		if row.has("height_m"):
			row["height_m"] = float(row["height_m"])
		out[row["file"]] = row
	return out
