extends RefCounted
## Prop audit (scenario-godot-pipeline-automation 0.1, Godot 4.7.2): load every imported prop and check it against
## the rules. One source of truth: the gdUnit4 suite calls check_prop() per prop, the job runs all.
##   gd_run.run_script(P, "res://addons/agentkit/pipeline/prop_audit.gd:audit", {})
## Also builds res://props/showroom.tscn (every prop on a grid) for the visual pass.

const Rules = preload("res://addons/agentkit/pipeline/prop_rules.gd")
const PIPELINE_VERSION := 1


static func load_manifest(path: String = "res://props/props_manifest.json") -> Dictionary:
	var d = JSON.parse_string(FileAccess.get_file_as_string(path))
	return d if d is Dictionary else {}


static func imported_entries(manifest: Dictionary) -> Array:
	return (manifest.get("entries", []) as Array).filter(func(e): return e.has("path"))


## Problems for one prop ([] = pass). entry: one row of props_manifest.json.
static func check_prop(entry: Dictionary, budgets: Dictionary = {}) -> Array:
	var bud := Rules.budget_for(budgets if not budgets.is_empty() else Rules.default_budgets(), str(entry.category))
	var probs: Array = []
	var path := str(entry.path)
	if not ResourceLoader.exists(path):
		return ["not imported: " + path]
	var ps = load(path)
	if not (ps is PackedScene):
		return ["does not load as PackedScene"]
	var root: Node = ps.instantiate()
	var meta: Dictionary = root.get_meta("pipeline", {})
	if meta.is_empty():
		probs.append("no pipeline meta: prop_pipeline plugin disabled at import?")
	else:
		if int(meta.version) != PIPELINE_VERSION:
			probs.append("pipeline version %s, expected %d: reimport" % [meta.version, PIPELINE_VERSION])
		if str(root.name) != str(entry.id):
			probs.append("root name %s != id %s" % [root.name, entry.id])
		if not Rules.id_valid(str(entry.id)):
			probs.append("id breaks naming rule")
		var pos: Vector3 = meta.aabb_position
		var size: Vector3 = meta.aabb_size
		if absf(pos.y) > 0.01 * maxf(size.y, 0.01):
			probs.append("pivot not at base (min y %.3f)" % pos.y)
		var cx := pos.x + size.x * 0.5
		var cz := pos.z + size.z * 0.5
		if Vector2(cx, cz).length() > 0.1 * maxf(maxf(size.x, size.z), 0.01) and bool(entry.fixes.get("fix_pivot", false)):
			probs.append("pivot not centred after fix (%.3f, %.3f)" % [cx, cz])
		var target := float(entry.fixes.get("fit_height", 0.0))
		if target > 0.0 and absf(size.y - target) > 0.01 * target:
			probs.append("height %.3f != fitted %.3f" % [size.y, target])
		if size.y < 0.05 or size.y > 20.0:
			probs.append("height %.3f m outside 0.05 to 20 m" % size.y)
		if int(meta.triangles) > 3 * int(bud.tris):
			probs.append("%d triangles > 3x budget" % meta.triangles)
		if str(meta.collision) != "none" and root.get_node_or_null("Collision") == null:
			probs.append("no Collision body")
	if root.find_children("*", "AnimationPlayer", true, false).size() > 0:
		probs.append("AnimationPlayer kept (animation/import should be false)")
	root.free()
	# textures: every extracted texture VRAM-compressed (headless never flips detect_3d)
	var folder := path.get_base_dir()
	for f in DirAccess.get_files_at(folder):
		if f.ends_with(".import") and not f.ends_with(".glb.import"):
			var cf := ConfigFile.new()
			if cf.load(folder.path_join(f)) == OK and int(cf.get_value("params", "compress/mode", -1)) != 2:
				probs.append("texture not VRAM compressed: " + f.trim_suffix(".import"))
	return probs


func audit(job) -> Dictionary:
	var t0 := Time.get_ticks_msec()
	var m := load_manifest(job.arg("manifest", "res://props/props_manifest.json"))
	var entries := imported_entries(m)
	var failures := {}
	var heights := []
	var tris_total := 0
	for e in entries:
		var p := check_prop(e)
		if not p.is_empty():
			failures[e.id] = p
	var showroom := ""
	if job.arg("showroom", true):
		showroom = build_showroom(entries, job.arg("showroom_path", "res://props/showroom.tscn"))
	return {"ok": failures.is_empty(), "checked": entries.size(), "failed": failures.size(), "failures": failures,
			"showroom": showroom, "seconds": (Time.get_ticks_msec() - t0) / 1000.0}


## Every prop instanced on a grid, 3 m apart, sorted by id; saved with owner set (instances stay instances).
static func build_showroom(entries: Array, path: String) -> String:
	var root := Node3D.new()
	root.name = "Showroom"
	var ids := entries.map(func(e): return e.id)
	var by_id := {}
	for e in entries:
		by_id[e.id] = e
	ids.sort()
	var cols := ceili(sqrt(float(ids.size())))
	for i in ids.size():
		var e: Dictionary = by_id[ids[i]]
		if not ResourceLoader.exists(str(e.path)):
			continue
		var inst: Node3D = load(str(e.path)).instantiate()
		inst.position = Vector3((i % cols) * 3.0, 0, (i / cols) * 3.0)
		root.add_child(inst)
		inst.owner = root
	var ps := PackedScene.new()
	ps.pack(root)
	ResourceSaver.save(ps, path)
	root.free()
	return path
