extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): import settings without the Advanced Import dialog.
##
## The Advanced Import Settings dialog writes into <file>.import: [params] keys and a `_subresources`
## dictionary (per node "PATH:<node path>", per animation name, per mesh, per material). These jobs edit
## that file through ConfigFile (real Variants, so a BoneMap resource serialises the way the editor writes
## it) and reimport through EditorFileSystem in a headless editor run (-e).
##
## set_options(job)   args files [res://x.glb], params {}, subresources {}, importer ("" | "scene" | "animation_library")
## reimport(job)      args files; run with gd_run.run_script(..., editor=True)
## make_bonemap(job)  args scene (an imported character) or bones [names], out (res://.../bonemap.tres),
##                    map ({profile_bone: skeleton_bone} overrides); Mixamo names are mapped automatically.
## Option names below were read from the 4.7.2 importer source (editor/import/3d/*.cpp) and checked live.

const MIXAMO_CORE := {"Hips": "Hips", "Spine": "Spine", "Chest": "Spine1", "UpperChest": "Spine2", "Neck": "Neck",
	"Head": "Head", "LeftEye": "LeftEye", "LeftShoulder": "LeftShoulder", "LeftUpperArm": "LeftArm",
	"LeftLowerArm": "LeftForeArm", "LeftHand": "LeftHand", "LeftThumbMetacarpal": "LeftHandThumb1",
	"LeftThumbProximal": "LeftHandThumb2", "LeftThumbDistal": "LeftHandThumb3", "LeftIndexProximal": "LeftHandIndex1",
	"LeftIndexIntermediate": "LeftHandIndex2", "LeftIndexDistal": "LeftHandIndex3", "LeftMiddleProximal": "LeftHandMiddle1",
	"LeftMiddleIntermediate": "LeftHandMiddle2", "LeftMiddleDistal": "LeftHandMiddle3", "LeftRingProximal": "LeftHandRing1",
	"LeftRingIntermediate": "LeftHandRing2", "LeftRingDistal": "LeftHandRing3", "LeftLittleProximal": "LeftHandPinky1",
	"LeftLittleIntermediate": "LeftHandPinky2", "LeftLittleDistal": "LeftHandPinky3", "LeftUpperLeg": "LeftUpLeg",
	"LeftLowerLeg": "LeftLeg", "LeftFoot": "LeftFoot", "LeftToes": "LeftToeBase"}


func set_options(job) -> Dictionary:
	var files: Array = job.arg("files", [])
	var params: Dictionary = job.arg("params", {})
	var subs: Dictionary = _fix(job.arg("subresources", {}))
	var importer: String = job.arg("importer", "")
	var done: Array = []
	for f in files:
		var ip := str(f) + ".import"
		var cf := ConfigFile.new()
		var err := cf.load(ip)
		if err != OK:
			return {"ok": false, "error": "cannot load %s (%s): import the file once first" % [ip, error_string(err)]}
		for k in params:
			cf.set_value("params", str(k), _fix(params[k]))
		var cur = cf.get_value("params", "_subresources", {})
		if not (cur is Dictionary):
			cur = {}
		_merge(cur, subs)
		cf.set_value("params", "_subresources", cur)
		if importer != "":
			cf.set_value("remap", "importer", importer)
			cf.set_value("remap", "type", "AnimationLibrary" if importer == "animation_library" else "PackedScene")
		err = cf.save(ip)
		if err != OK:
			return {"ok": false, "error": "cannot save " + ip}
		done.append({"file": ip, "subresources_keys": (cur as Dictionary).keys(), "importer": cf.get_value("remap", "importer", "")})
	return {"ok": true, "edited": done}


## Headless editor job (-e): reimport the files so the edited options apply.
func reimport(job) -> Dictionary:
	await job.wait_frames(2)
	var fs := EditorInterface.get_resource_filesystem()
	var t0 := Time.get_ticks_msec()
	while fs.is_scanning() and Time.get_ticks_msec() - t0 < 60000:
		await job.process_frame
	var files := PackedStringArray()
	for f in job.arg("files", []):
		files.append(str(f))
	fs.reimport_files(files)
	await job.wait_frames(2)
	var out: Array = []
	for f in files:
		var cf := ConfigFile.new()
		cf.load(f + ".import")
		var dest: String = str(cf.get_value("remap", "path", ""))
		out.append({"file": f, "importer": cf.get_value("remap", "importer", ""), "type": cf.get_value("remap", "type", ""),
			"dest": dest, "dest_exists": FileAccess.file_exists(dest)})
	return {"ok": true, "reimported": out, "scan_wait_ms": Time.get_ticks_msec() - t0}


func make_bonemap(job) -> Dictionary:
	var names: Array = job.arg("bones", [])
	var scene_path: String = job.arg("scene", "")
	if names.is_empty() and scene_path != "":
		var inst: Node = (load(scene_path) as PackedScene).instantiate()
		var sk := _skeleton(inst)
		if sk == null:
			inst.free()
			return {"ok": false, "error": "no Skeleton3D in " + scene_path}
		for i in sk.get_bone_count():
			names.append(sk.get_bone_name(i))
		inst.free()
	# Godot sanitises bone names on import (':' and '/' become '_', so mixamorig:Hips is mixamorig_Hips).
	# A BoneMap must name the IMPORTED bones: unmatched names give a GeneralSkeleton with nothing renamed.
	var sanitized := 0
	for i in names.size():
		var clean := str(names[i]).replace(":", "_").replace("/", "_")
		if clean != str(names[i]):
			sanitized += 1
		names[i] = clean
	var prefix := ""
	for n in names:
		if str(n).ends_with("Hips"):
			prefix = str(n).trim_suffix("Hips")
			break
	var overrides: Dictionary = job.arg("map", {})
	var prof := SkeletonProfileHumanoid.new()
	var bm := BoneMap.new()
	bm.profile = prof
	var have := {}
	for n in names:
		have[str(n)] = true
	var mapped := {}
	var missing_required: Array = []
	var missing_optional: Array = []
	for i in prof.bone_size:
		var pb := str(prof.get_bone_name(i))
		var cand := ""
		if overrides.has(pb):
			cand = str(overrides[pb])
		elif have.has(pb):
			cand = pb                       # already humanoid-profile names
		else:
			var base := pb.replace("Right", "Left")
			if MIXAMO_CORE.has(base):
				var m: String = MIXAMO_CORE[base]
				if pb.begins_with("Right"):
					m = m.replace("Left", "Right")
				cand = prefix + m
		if cand != "" and have.has(cand):
			bm.set_skeleton_bone_name(StringName(pb), StringName(cand))
			mapped[pb] = cand
		elif prof.is_required(i):
			missing_required.append(pb)
		else:
			missing_optional.append(pb)
	var unused: Array = []
	var used := {}
	for v in mapped.values():
		used[v] = true
	for n in names:
		if not used.has(str(n)):
			unused.append(str(n))
	var out: String = job.arg("out", "res://anim/bonemap.tres")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out.get_base_dir()))
	var err := ResourceSaver.save(bm, out)
	return {"ok": err == OK and missing_required.is_empty(), "out": out, "prefix": prefix, "mapped": mapped.size(), "sanitized_names": sanitized,
		"missing_required": missing_required, "missing_optional_count": missing_optional.size(),
		"skeleton_bones_unmapped": unused, "error": "" if missing_required.is_empty() else "required humanoid bones unmapped: " + str(missing_required)}


func _skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _skeleton(c)
		if s:
			return s
	return null


## JSON brings numbers as floats and resources as paths: make ints ints, load bone maps.
func _fix(v: Variant, key: String = "") -> Variant:
	if v is Dictionary:
		var d := {}
		for k in v:
			d[str(k)] = _fix(v[k], str(k))
		return d
	if v is Array:
		var a := []
		for x in v:
			a.append(_fix(x))
		return a
	if v is float and is_equal_approx(v, round(v)) and not key.ends_with("threshold") and not key.ends_with("adjustment") \
			and not key.ends_with("error") and not key.ends_with("scale"):
		return int(v)
	if v is String and (key.ends_with("bone_map") or key.ends_with("_resource")) and str(v).begins_with("res://"):
		return load(v)
	return v


func _merge(dst: Dictionary, src: Dictionary) -> void:
	for k in src:
		if src[k] is Dictionary and dst.get(k) is Dictionary:
			_merge(dst[k], src[k])
		else:
			dst[k] = src[k]
