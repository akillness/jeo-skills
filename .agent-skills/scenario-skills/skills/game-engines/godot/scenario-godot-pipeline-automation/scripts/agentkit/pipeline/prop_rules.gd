extends RefCounted
## Prop rules (scenario-godot-pipeline-automation 0.1, Godot 4.7.2): naming, budgets and the accept/warn/reject
## decision for one probed GLB. Pure static functions (no files), so gdUnit4 tests call them directly.
##
##   const Rules = preload("res://addons/agentkit/pipeline/prop_rules.gd")
##   Rules.normalize_name("SM_Barrel05_v2 (copy)")   # "barrel_05"
##   var d := Rules.decide(probe_dict, manifest_row, Rules.default_budgets())

const VERSION := 1
## Final id: lower snake case, starts with the category, digits allowed (barrel_05, side_table_astra).
const ID_PATTERN := "^[a-z][a-z0-9]*(_[a-z0-9]+)+$"

const _ACCENTS := {"à": "a", "á": "a", "â": "a", "ä": "a", "ã": "a", "å": "a", "ç": "c", "è": "e", "é": "e", "ê": "e",
		"ë": "e", "ì": "i", "í": "i", "î": "i", "ï": "i", "ñ": "n", "ò": "o", "ó": "o", "ô": "o", "ö": "o", "õ": "o",
		"ù": "u", "ú": "u", "û": "u", "ü": "u", "ý": "y", "ÿ": "y", "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o"}


## Category budgets [added]: triangles (LOD0), materials (draw calls per instance), texture side (px,
## imported size limit), height tolerance. Numbers are a project policy, not engine limits: set them
## from the frame budget with scenario-godot-performance-export.
static func default_budgets() -> Dictionary:
	var base := {"tris": 5000, "materials": 4, "texture": 1024, "height_tolerance": 0.25}
	var b := {"default": base}
	for c in ["barrel", "crate", "chair", "table", "sign", "fence", "pot", "lamp"]:
		b[c] = base.merged({"tris": 3000}, true)
	b["rock"] = base.merged({"tris": 5000}, true)
	b["bush"] = base.merged({"tris": 5000}, true)
	b["foliage"] = base.merged({"tris": 5000}, true)
	b["furniture"] = base.merged({"tris": 10000, "materials": 6}, true)
	b["toy"] = base.merged({"tris": 20000, "materials": 8}, true)
	b["vehicle"] = base.merged({"tris": 40000, "materials": 12, "texture": 2048}, true)
	b["hero"] = base.merged({"tris": 60000, "materials": 12, "texture": 2048}, true)
	return b


static func budget_for(budgets: Dictionary, category: String) -> Dictionary:
	return (budgets.get("default", {}) as Dictionary).merged(budgets.get(category, {}), true)


## "SM_Barrel05_v2 (copy)" -> "barrel_05". Strips DCC prefixes and suffixes, splits CamelCase and
## letter-digit runs, folds accents, keeps [a-z0-9_].
static func normalize_name(stem: String) -> String:
	var s := stem.strip_edges().replace("(copy)", " ").replace("(Copy)", " ")
	var spaced := ""
	var prev := ""
	for ch in s:
		if prev != "":
			var camel := ch != ch.to_lower() and prev != prev.to_upper()  # lower-case letter then capital
			var digit_edge := _is_digit(ch) != _is_digit(prev)
			if camel or digit_edge:
				spaced += " "
		spaced += ch
		prev = ch
	var folded := ""
	for ch in spaced.to_lower():
		folded += _ACCENTS.get(ch, ch)
	var t := RegEx.create_from_string("[^a-z0-9]+").sub(folded, "_", true)
	var parts := Array(t.split("_", false))
	if parts.size() > 1 and parts[0] in ["sm", "s", "mesh", "geo", "prop"]:
		parts.remove_at(0)
	while parts.size() > 1:
		if parts[-1] in ["final", "copy", "export", "new", "fix", "low", "lod0"]:
			parts.remove_at(parts.size() - 1)
		elif parts.size() > 2 and str(parts[-1]).is_valid_int() and parts[-2] in ["v", "lod"]:
			parts.resize(parts.size() - 2)
		else:
			break
	# zero-pad a trailing single digit so sorting matches the art list (barrel_5 -> barrel_05)
	if parts.size() > 1 and str(parts[-1]).is_valid_int() and str(parts[-1]).length() == 1:
		parts[-1] = "0" + parts[-1]
	return "_".join(parts)


static func _is_digit(c: String) -> bool:
	return c >= "0" and c <= "9"


## Category from the manifest, else the first name token that is a known category, else "misc".
static func infer_category(name: String, known: Array) -> String:
	for tok in name.split("_", false):
		if tok in known:
			return tok
	return "misc"


static func prop_id(category: String, name: String) -> String:
	var n := name
	if n == category or n.begins_with(category + "_"):
		return n
	return category + "_" + n


static func id_valid(id: String) -> bool:
	return RegEx.create_from_string(ID_PATTERN).search(id) != null


## Decide what to do with one probed file. row: {category, height_m, source} (manifest; may be {}).
## Returns {status: accept|warn|reject, reasons[], fixes{unit_scale, fit_height, fix_pivot}, measured{}}.
static func decide(info: Dictionary, row: Dictionary, budgets: Dictionary) -> Dictionary:
	var reasons: Array = []
	var status := "accept"
	if not info.get("valid", false):
		return {"status": "reject", "reasons": ["invalid: " + str(info.get("error", "?"))], "fixes": {}, "measured": {}}
	var cat: String = str(row.get("category", "misc"))
	var bud := budget_for(budgets, cat)
	var src := str(row.get("source", "dcc"))
	var is_ai := src.begins_with("ai")
	var target := float(row.get("height_m", 0.0))
	var bb = info.get("aabb")
	var size := Vector3.ZERO
	var pos := Vector3.ZERO
	if bb is Dictionary:
		size = Vector3(bb.size[0], bb.size[1], bb.size[2])
		pos = Vector3(bb.position[0], bb.position[1], bb.position[2])
	var h := size.y
	var fixes := {"unit_scale": 1.0, "fit_height": 0.0, "fix_pivot": false}
	if h <= 0.0:
		return {"status": "reject", "reasons": ["no bounds (POSITION min/max missing)"], "fixes": {}, "measured": {}}
	# scale: DCC files keep their authored size once units are fixed; image-to-3D output has no
	# real-world scale, so it is fitted to the manifest height [added]
	if is_ai:
		if target <= 0.0:
			return {"status": "reject", "reasons": ["image-to-3D asset without height_m in the manifest"], "fixes": {}, "measured": {}}
		fixes.fit_height = target
		reasons.append("ai: scale fitted to %.2f m (raw height %.3f)" % [target, h])
		status = "warn"
	elif target > 0.0:
		var ratio := h / target
		if ratio > 40.0 and ratio < 250.0:
			fixes.unit_scale = 0.01
			reasons.append("authored in centimetres: unit_scale 0.01")
		elif ratio > 0.004 and ratio < 0.025:
			fixes.unit_scale = 100.0
			reasons.append("authored in hectometres or scaled down 100x: unit_scale 100")
		var final_h := h * float(fixes.unit_scale)
		if absf(final_h / target - 1.0) > float(bud.height_tolerance):
			reasons.append("height %.2f m vs %.2f m expected" % [final_h, target])
			status = "warn"
	# pivot: bottom centre within 2% of height and 10% of the footprint
	var foot := maxf(size.x, size.z)
	var centre := pos + size * 0.5
	if absf(pos.y) > 0.02 * h or Vector2(centre.x, centre.z).length() > 0.1 * maxf(foot, 0.001):
		fixes.fix_pivot = true
		reasons.append("pivot moved to bottom centre (was min y %.3f, centre xz %.3f, %.3f)" % [pos.y, centre.x, centre.z])
	# budgets
	var tris := int(info.get("triangles", 0))
	if tris > 3 * int(bud.tris):
		return {"status": "reject", "reasons": ["%d triangles > 3x budget %d: decimate first (blender-expert)" % [tris, bud.tris]],
				"fixes": fixes, "measured": {"triangles": tris}}
	if tris > int(bud.tris):
		reasons.append("%d triangles over budget %d (LODs generated, LOD0 unchanged)" % [tris, bud.tris])
		status = "warn"
	var mats := int(info.get("materials", 0))
	if mats > int(bud.materials):
		reasons.append("%d materials > %d: one draw call each per instance" % [mats, bud.materials])
		status = "warn"
	if int(info.get("max_texture", 0)) > int(bud.texture):
		reasons.append("texture %d px > %d: size_limit applied at import" % [info.max_texture, bud.texture])
	var dropped: Array = info.get("unsupported_used", [])
	if not dropped.is_empty():
		reasons.append("material features Godot ignores: " + ", ".join(dropped) + " (check by eye)")
		status = "warn"
	if int(info.get("animations", 0)) > 0:
		reasons.append("%d animation(s) stripped (static prop)" % info.animations)
	if (info.get("images", []) as Array).is_empty() and mats > 0:
		reasons.append("no textures (factor-only materials)")
	return {"status": status, "reasons": reasons, "fixes": fixes,
			"measured": {"triangles": tris, "materials": mats, "height": h, "max_texture": info.get("max_texture", 0)}}
