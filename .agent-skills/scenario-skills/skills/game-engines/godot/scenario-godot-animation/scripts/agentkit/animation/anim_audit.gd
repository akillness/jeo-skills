extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): headless animation audits as JSON.
##
## scene(job): args scene (a .tscn or an imported .glb/.fbx), expect_loops ([names]), in_place ([names]),
##   root_motion_bone (""), max_listed (6). For every AnimationPlayer: libraries, each animation's length,
##   loop mode, track count by type, unresolved track paths (node, bone or property), immutable tracks,
##   RESET coverage, root bone travel; for every Skeleton3D: bones, T-pose check, mesh skeleton paths;
##   for every AnimationTree: see tree(). Flags list what an expert would fix.
## tree(job): args scene, tree ("" = every AnimationTree found).
## library(job): args path (an AnimationLibrary .tres/.res or an animation-only import).
## Run: gd_anim.audit(P, "res://assets/hero.glb") or gd_run.run_script(P, gd_anim.kit("anim_audit", "scene"), {...}).

const TYPE_NAMES := {Animation.TYPE_VALUE: "value", Animation.TYPE_POSITION_3D: "position_3d",
	Animation.TYPE_ROTATION_3D: "rotation_3d", Animation.TYPE_SCALE_3D: "scale_3d",
	Animation.TYPE_BLEND_SHAPE: "blend_shape", Animation.TYPE_METHOD: "method", Animation.TYPE_BEZIER: "bezier",
	Animation.TYPE_AUDIO: "audio", Animation.TYPE_ANIMATION: "animation"}
const LOOP_HINT := ["-loop", "_loop", "-cycle", "_cycle", "loop", "cycle"]


func scene(job) -> Dictionary:
	var path: String = job.arg("scene", "")
	if not ResourceLoader.exists(path):
		return {"ok": false, "error": "scene not found: " + path}
	var res = load(path)
	if res is AnimationLibrary:
		return library(job)
	if not (res is PackedScene):
		return {"ok": false, "error": "not a PackedScene: " + path}
	var inst: Node = (res as PackedScene).instantiate()
	job.root.add_child(inst)
	await job.wait_frames(1)
	var out := audit_node(inst, job.args)
	out["scene"] = path
	inst.queue_free()
	await job.wait_frames(1)
	return out


func audit_node(inst: Node, opts: Dictionary) -> Dictionary:
	var flags: Array = []
	var players: Array = []
	var skels: Array = []
	var trees: Array = []
	var meshes: Array = []
	for n in _all(inst):
		if n is AnimationPlayer:
			players.append(audit_player(n as AnimationPlayer, inst, opts, flags))
		elif n is AnimationTree:
			trees.append(audit_tree(n as AnimationTree, inst, flags))
		elif n is Skeleton3D:
			skels.append(audit_skeleton(n as Skeleton3D, inst, flags))
		elif n is MeshInstance3D and (n as MeshInstance3D).skin != null:
			var mi := n as MeshInstance3D
			var sk_ok := mi.get_node_or_null(mi.skeleton) is Skeleton3D
			meshes.append({"path": str(inst.get_path_to(mi)), "skeleton": str(mi.skeleton), "resolves": sk_ok})
			if not sk_ok:
				flags.append("skinned mesh %s: skeleton path '%s' does not resolve (4.6 default is NodePath(\"\"))" % [mi.name, mi.skeleton])
	var height := 0.0
	var aabb := _bounds(inst)
	if aabb.size != Vector3.ZERO:
		height = aabb.size.y
	return {"ok": true, "players": players, "skeletons": skels, "trees": trees, "skinned_meshes": meshes,
		"height_m": height, "aabb": {"position": aabb.position, "size": aabb.size}, "flags": flags,
		"root_class": inst.get_class(), "root_name": str(inst.name)}


func audit_player(p: AnimationPlayer, owner: Node, opts: Dictionary, flags: Array) -> Dictionary:
	var root := p.get_node_or_null(p.root_node)
	var anims: Array = []
	var expect_loops: Array = opts.get("expect_loops", [])
	var in_place: Array = opts.get("in_place", [])
	var rm_bone: String = str(opts.get("root_motion_bone", ""))
	var max_listed: int = int(opts.get("max_listed", 6))
	var reset: Animation = p.get_animation(&"RESET") if p.has_animation(&"RESET") else null
	var reset_paths := {}
	if reset:
		for i in reset.get_track_count():
			reset_paths[str(reset.track_get_path(i))] = true
	var not_in_reset := {}
	for an in p.get_animation_list():
		var a := p.get_animation(an)
		var by_type := {}
		var unresolved: Array = []
		var immutable := 0
		var hip_travel := Vector3.ZERO
		var name_l := str(an).to_lower()
		for i in a.get_track_count():
			var tt := a.track_get_type(i)
			var tn: String = TYPE_NAMES.get(tt, str(tt))
			by_type[tn] = int(by_type.get(tn, 0)) + 1
			var tp := a.track_get_path(i)
			var why := _resolve(root, tp, tt, a, i)
			if why != "" and unresolved.size() < max_listed:
				unresolved.append({"path": str(tp), "why": why})
			if _is_immutable(a, i):
				immutable += 1
			if reset and an != &"RESET" and tt in [Animation.TYPE_VALUE, Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D, Animation.TYPE_BLEND_SHAPE]:
				if not reset_paths.has(str(tp)):
					not_in_reset[str(tp)] = true
			if tt == Animation.TYPE_POSITION_3D and a.track_get_key_count(i) > 0:
				var bone := str(tp.get_concatenated_subnames())
				var is_root_bone := (rm_bone != "" and bone == rm_bone) or (rm_bone == "" and (bone.ends_with("Hips") or bone == "Root"))
				if is_root_bone:
					var d := a.position_track_interpolate(i, a.length) - a.position_track_interpolate(i, 0.0)
					if d.length() > hip_travel.length():
						hip_travel = d
		var loop_names := ["none", "linear", "pingpong"]
		var entry := {"name": str(an), "length": a.length, "loop": loop_names[a.loop_mode], "tracks": a.get_track_count(),
			"by_type": by_type, "unresolved": unresolved, "immutable_tracks": immutable, "step": a.step,
			"root_travel_xz": Vector2(hip_travel.x, hip_travel.z).length(), "root_travel": hip_travel}
		anims.append(entry)
		if not unresolved.is_empty():
			flags.append("%s: %d track path(s) do not resolve, first %s (%s)" % [an, unresolved.size(), unresolved[0]["path"], unresolved[0]["why"]])
		var hinted := false
		for h in LOOP_HINT:
			if name_l.ends_with(h) or name_l.begins_with(h):
				hinted = true
		if (hinted or str(an) in expect_loops) and a.loop_mode == Animation.LOOP_NONE:
			flags.append("%s: expected to loop but loop_mode is none" % an)
		if str(an) in in_place and entry["root_travel_xz"] > 0.05:
			flags.append("%s: expected in place but the root bone travels %.2f m in XZ" % [an, entry["root_travel_xz"]])
	if reset == null and p.get_animation_list().size() > 0:
		flags.append("%s: no RESET animation (blends and saved scenes fall back to rest or 0)" % p.name)
	if not not_in_reset.is_empty():
		flags.append("%s: %d animated path(s) missing from RESET, first %s" % [p.name, not_in_reset.size(), not_in_reset.keys()[0]])
	var libs := {}
	for ln in p.get_animation_library_list():
		var lib := p.get_animation_library(ln)
		libs[str(ln)] = {"count": lib.get_animation_list().size(), "path": lib.resource_path, "local": lib.resource_path == "" or lib.resource_path.contains("::")}
	return {"path": str(owner.get_path_to(p)), "root_node": str(p.root_node), "root_resolves": root != null,
		"reset_on_save": p.reset_on_save, "deterministic": p.deterministic, "autoplay": str(p.autoplay),
		"libraries": libs, "animations": anims, "not_in_reset": not_in_reset.size()}


func _resolve(root: Node, tp: NodePath, tt: int, a: Animation, i: int) -> String:
	if root == null:
		return "player root_node does not resolve"
	var node_path := NodePath(str(tp).get_slice(":", 0))
	var n := root.get_node_or_null(node_path)
	if n == null:
		return "node not found"
	var sub := str(tp.get_concatenated_subnames())
	match tt:
		Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D:
			if sub != "" and n is Skeleton3D and (n as Skeleton3D).find_bone(sub) < 0:
				return "bone '%s' not in %s" % [sub, n.name]
		Animation.TYPE_VALUE, Animation.TYPE_BEZIER:
			var prop := sub.get_slice(":", 0)
			if prop != "" and not _has_prop(n, prop):
				return "property '%s' not on %s" % [prop, n.get_class()]
		Animation.TYPE_METHOD:
			for k in a.track_get_key_count(i):
				var m := str(a.method_track_get_name(i, k))
				if not n.has_method(m):
					return "method '%s' not on %s" % [m, n.get_class()]
		Animation.TYPE_ANIMATION:
			if not (n is AnimationPlayer):
				return "animation track target is not an AnimationPlayer"
			for k in a.track_get_key_count(i):
				var an := a.animation_track_get_key_animation(i, k)
				if an != &"[stop]" and not (n as AnimationPlayer).has_animation(an):
					return "animation '%s' not in %s" % [an, n.name]
		Animation.TYPE_BLEND_SHAPE:
			if n is MeshInstance3D and (n as MeshInstance3D).find_blend_shape_by_name(StringName(sub)) < 0:
				return "blend shape '%s' missing" % sub
	return ""


func _has_prop(n: Object, prop: String) -> bool:
	for p in n.get_property_list():
		if str(p.name) == prop:
			return true
	return false


func _is_immutable(a: Animation, i: int) -> bool:
	var n := a.track_get_key_count(i)
	if n < 2:
		return false
	var tt := a.track_get_type(i)
	if not (tt in [Animation.TYPE_VALUE, Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D]):
		return false
	if a.track_is_compressed(i):
		return false
	var v0 = a.track_get_key_value(i, 0)
	for k in range(1, n):
		var v = a.track_get_key_value(i, k)
		if typeof(v) != typeof(v0):
			return false
		if v is Quaternion:
			if not (v as Quaternion).is_equal_approx(v0):
				return false
		elif v is Vector3:
			if not (v as Vector3).is_equal_approx(v0):
				return false
		elif v != v0:
			return false
	return true


func audit_skeleton(sk: Skeleton3D, owner: Node, flags: Array) -> Dictionary:
	var names: Array = []
	for i in sk.get_bone_count():
		names.append(sk.get_bone_name(i))
	var tpose := {}
	for side in ["Left", "Right"]:
		var ua := _find_any(sk, [side + "UpperArm", "mixamorig_" + side + "Arm", side + "Arm"])
		var la := _find_any(sk, [side + "LowerArm", "mixamorig_" + side + "ForeArm", side + "ForeArm"])
		if ua >= 0 and la >= 0:
			var d := sk.get_bone_global_rest(la).origin - sk.get_bone_global_rest(ua).origin
			tpose[side + "_arm_elevation_deg"] = rad_to_deg(asin(clampf(d.normalized().y, -1.0, 1.0)))
	for k in tpose:
		if absf(float(tpose[k])) > 20.0:
			flags.append("%s: rest is not a T-pose (%s = %.0f deg); blends and retargeting prefer a T-pose rest" % [sk.name, k, tpose[k]])
	if str(sk.name) == "GeneralSkeleton" and sk.find_bone("Hips") < 0:
		flags.append("%s: retargeted (renamed to GeneralSkeleton) but no bone is named Hips: the BoneMap names bones the importer never saw (':' is imported as '_')" % sk.name)
	var mods: Array = []
	for c in sk.get_children():
		if c is SkeletonModifier3D:
			mods.append({"name": str(c.name), "class": c.get_class(), "active": (c as SkeletonModifier3D).active,
				"influence": (c as SkeletonModifier3D).influence})
	return {"path": str(owner.get_path_to(sk)), "bones": sk.get_bone_count(), "names": names.slice(0, 80),
		"unique_name": sk.unique_name_in_owner, "motion_scale": sk.motion_scale, "tpose": tpose, "modifiers": mods,
		"modifier_callback_mode_process": sk.modifier_callback_mode_process}


func _find_any(sk: Skeleton3D, names: Array) -> int:
	for n in names:
		var i := sk.find_bone(str(n))
		if i >= 0:
			return i
	return -1


# ------------------------------------------------------------------ AnimationTree

func tree(job) -> Dictionary:
	var path: String = job.arg("scene", "")
	if not ResourceLoader.exists(path):
		return {"ok": false, "error": "scene not found: " + path}
	var inst: Node = (load(path) as PackedScene).instantiate()
	job.root.add_child(inst)
	await job.wait_frames(1)
	var flags: Array = []
	var trees: Array = []
	for n in _all(inst):
		if n is AnimationTree:
			trees.append(audit_tree(n as AnimationTree, inst, flags))
	inst.queue_free()
	await job.wait_frames(1)
	return {"ok": true, "trees": trees, "flags": flags}


func audit_tree(t: AnimationTree, owner: Node, flags: Array) -> Dictionary:
	var player := t.get_node_or_null(t.anim_player) as AnimationPlayer
	var base := t.get_node_or_null(t.advance_expression_base_node)
	var info := {"path": str(owner.get_path_to(t)), "active": t.active, "anim_player": str(t.anim_player),
		"player_resolves": player != null, "base_node": str(t.advance_expression_base_node),
		"base_resolves": base != null, "root_class": t.tree_root.get_class() if t.tree_root else "",
		"root_motion_track": str(t.root_motion_track), "callback_mode_process": t.callback_mode_process,
		"deterministic": t.deterministic, "tree_root_path": t.tree_root.resource_path if t.tree_root else ""}
	var anims: Array = []
	var conditions: Array = []
	var expressions: Array = []
	if t.tree_root:
		_walk_tree(t.tree_root, "", anims, conditions, expressions)
	var params: Array = []
	for p in t.get_property_list():
		if str(p.name).begins_with("parameters/"):
			params.append(str(p.name))
	info["parameters"] = params
	info["animations"] = anims
	info["conditions"] = conditions
	info["expressions"] = expressions
	if t.tree_root == null:
		flags.append("%s: no tree_root" % t.name)
	if player == null:
		flags.append("%s: anim_player '%s' does not resolve" % [t.name, t.anim_player])
	else:
		for a in anims:
			if a["animation"] != "" and not player.has_animation(StringName(a["animation"])):
				flags.append("%s: node %s plays '%s', which the player does not have" % [t.name, a["node"], a["animation"]])
	for c in conditions:
		var cn := str(c["condition"])
		if cn.begins_with("!") or cn.begins_with("not "):
			flags.append("%s: advance condition '%s' cannot negate (conditions only test true); use an expression" % [t.name, cn])
	if not expressions.is_empty() and base == null:
		flags.append("%s: advance expressions used but advance_expression_base_node does not resolve" % t.name)
	if t.root_motion_track != NodePath("") and player:
		var rm := str(t.root_motion_track)
		var found := false
		for an in player.get_animation_list():
			if player.get_animation(an).find_track(t.root_motion_track, Animation.TYPE_POSITION_3D) >= 0:
				found = true
				break
		if not found:
			flags.append("%s: root_motion_track %s is in no animation" % [t.name, rm])
	return info


func _walk_tree(node: AnimationNode, prefix: String, anims: Array, conditions: Array, expressions: Array) -> void:
	if node is AnimationNodeAnimation:
		anims.append({"node": prefix, "animation": str((node as AnimationNodeAnimation).animation)})
	elif node is AnimationNodeStateMachine:
		var sm := node as AnimationNodeStateMachine
		for s in sm.get_node_list():
			if s in [&"Start", &"End"]:
				continue
			_walk_tree(sm.get_node(s), prefix + "/" + str(s), anims, conditions, expressions)
		for i in sm.get_transition_count():
			var tr := sm.get_transition(i)
			var lbl := "%s/%s->%s" % [prefix, sm.get_transition_from(i), sm.get_transition_to(i)]
			if tr.advance_condition != &"":
				conditions.append({"transition": lbl, "condition": str(tr.advance_condition)})
			if tr.advance_expression != "":
				expressions.append({"transition": lbl, "expression": tr.advance_expression})
	elif node is AnimationNodeBlendTree:
		var bt := node as AnimationNodeBlendTree
		for nn in bt.get_node_list():
			if nn == &"output":
				continue
			_walk_tree(bt.get_node(nn), prefix + "/" + str(nn), anims, conditions, expressions)
	elif node is AnimationNodeBlendSpace1D:
		var b1 := node as AnimationNodeBlendSpace1D
		for i in b1.get_blend_point_count():
			_walk_tree(b1.get_blend_point_node(i), "%s/%d@%.2f" % [prefix, i, b1.get_blend_point_position(i)], anims, conditions, expressions)
	elif node is AnimationNodeBlendSpace2D:
		var b2 := node as AnimationNodeBlendSpace2D
		for i in b2.get_blend_point_count():
			_walk_tree(b2.get_blend_point_node(i), "%s/%d@%s" % [prefix, i, b2.get_blend_point_position(i)], anims, conditions, expressions)


# ------------------------------------------------------------------ libraries

func library(job) -> Dictionary:
	var path: String = job.arg("path", job.arg("scene", ""))
	if not ResourceLoader.exists(path):
		return {"ok": false, "error": "not found: " + path}
	var lib = load(path)
	if not (lib is AnimationLibrary):
		return {"ok": false, "error": "not an AnimationLibrary: " + path + " (" + str(lib) + ")"}
	var out: Array = []
	var first_paths := {}
	var layouts_match := true
	for an in (lib as AnimationLibrary).get_animation_list():
		var a := (lib as AnimationLibrary).get_animation(an)
		var paths := []
		for i in a.get_track_count():
			paths.append("%s|%d" % [a.track_get_path(i), a.track_get_type(i)])
		if first_paths.is_empty():
			for p in paths:
				first_paths[p] = true
		elif paths.size() != first_paths.size() or not paths.all(func(p): return first_paths.has(p)):
			layouts_match = false
		out.append({"name": str(an), "length": a.length, "loop": a.loop_mode, "tracks": a.get_track_count(),
			"first_paths": paths.slice(0, 3)})
	return {"ok": true, "path": path, "animations": out, "identical_track_layout": layouts_match}


# ------------------------------------------------------------------ helpers

func _all(n: Node) -> Array:
	var out := [n]
	for c in n.get_children():
		out.append_array(_all(c))
	return out


func _bounds(n: Node) -> AABB:
	var acc := AABB()
	var first := true
	for x in _all(n):
		if x is VisualInstance3D and (x as VisualInstance3D).visible:
			var b: AABB = (x as VisualInstance3D).global_transform * (x as VisualInstance3D).get_aabb()
			if b.size.length() <= 0.0:
				continue
			if first:
				acc = b
				first = false
			else:
				acc = acc.merge(b)
	return acc


# ------------------------------------------------------------------ pose sampling (headless)

## Bone world positions at exact times. args scene, anim, times [s], bones [canonical names such as
## LeftFoot; profile, Mixamo (mixamorig_*) and GeneralSkeleton names resolve], player ("AnimationPlayer"),
## frames (1: wait so SkeletonModifier3D children apply), modifiers (true: keep them active).
func sample(job) -> Dictionary:
	var path: String = job.arg("scene", "")
	if not ResourceLoader.exists(path):
		return {"ok": false, "error": "scene not found: " + path}
	var inst: Node = (load(path) as PackedScene).instantiate()
	job.root.add_child(inst)
	await job.wait_frames(1)
	var p := inst.get_node_or_null(str(job.arg("player", "AnimationPlayer"))) as AnimationPlayer
	var anim: String = job.arg("anim", "")
	if p == null or not p.has_animation(anim):
		var have: Array = Array(p.get_animation_list()) if p else []
		inst.queue_free()
		return {"ok": false, "error": "no animation %s" % anim, "have": have}
	var sk: Skeleton3D = null
	for n in _all(inst):
		if n is Skeleton3D:
			sk = n
			break
	if not job.arg("modifiers", true):
		for c in sk.get_children():
			if c is SkeletonModifier3D:
				(c as SkeletonModifier3D).active = false
	var Rig = load("res://addons/agentkit/animation/anim_rig.gd")
	var idx := {}
	for b in job.arg("bones", ["Hips", "LeftFoot", "RightFoot"]):
		var cands := [str(b), Rig.bone_name(str(b), "mixamo")]
		for c in cands:
			if sk.find_bone(c) >= 0:
				idx[str(b)] = sk.find_bone(c)
				break
	var frames: int = job.arg("frames", 1)
	p.play(anim)
	p.pause()
	var out := {}
	for b in idx:
		out[b] = []
	var times: Array = job.arg("times", [0.0])
	var length := p.get_animation(anim).length
	for t in times:
		p.seek(float(t), true)
		await job.wait_frames(frames)
		for b in idx:
			(out[b] as Array).append(sk.global_transform * sk.get_bone_global_pose(idx[b]).origin)
	inst.queue_free()
	await job.wait_frames(1)
	return {"ok": true, "times": times, "bones": out, "resolved": idx.keys(), "length": length}
