extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): a procedural humanoid test rig and its clips.
##
## Why: tests need a skinned humanoid with known numbers (bone lengths, walk speed) and no download.
## The rig is a Skeleton3D with T-pose rests (identity rotations, character faces +Z, its left is +X),
## a rigidly skinned box mesh (left limbs blue, right limbs orange, so mirroring errors show in a
## capture), and analytic clips: the walk and run feet are solved with 2-bone IK on a ground path,
## so the in-place walk has a ground truth no-slide speed (walk 1.2 m/s, run 3.5 m/s).
##
## naming "profile": Godot SkeletonProfileHumanoid names with a Root bone (root motion ready).
## naming "mixamo": Mixamo names with the importer's sanitised prefix (mixamorig_Hips; Godot 4.7.2
## Skeleton3D refuses ':' and '/' in bone names, so mixamorig:Hips arrives as mixamorig_Hips), no Root.
##
## Job use: gd_run.run_script(P, "res://addons/agentkit/animation/anim_rig.gd:build",
##              {"naming": "profile", "scene": "res://anim/hero.tscn", "glb": "res://assets/hero.glb"})

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")

const CANON: Array[String] = ["Root", "Hips", "Spine", "Chest", "UpperChest", "Neck", "Head",
	"LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand",
	"RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand",
	"LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "LeftToes",
	"RightUpperLeg", "RightLowerLeg", "RightFoot", "RightToes"]

const PARENT := {"Hips": "Root", "Spine": "Hips", "Chest": "Spine", "UpperChest": "Chest", "Neck": "UpperChest",
	"Head": "Neck", "LeftShoulder": "UpperChest", "LeftUpperArm": "LeftShoulder", "LeftLowerArm": "LeftUpperArm",
	"LeftHand": "LeftLowerArm", "RightShoulder": "UpperChest", "RightUpperArm": "RightShoulder",
	"RightLowerArm": "RightUpperArm", "RightHand": "RightLowerArm", "LeftUpperLeg": "Hips",
	"LeftLowerLeg": "LeftUpperLeg", "LeftFoot": "LeftLowerLeg", "LeftToes": "LeftFoot", "RightUpperLeg": "Hips",
	"RightLowerLeg": "RightUpperLeg", "RightFoot": "RightLowerLeg", "RightToes": "RightFoot"}

## Rest offsets from the parent bone, metres (left side; the right side mirrors X).
const OFFSET := {"Root": Vector3.ZERO, "Hips": Vector3(0, 0.97, 0), "Spine": Vector3(0, 0.1, 0),
	"Chest": Vector3(0, 0.15, 0), "UpperChest": Vector3(0, 0.15, 0), "Neck": Vector3(0, 0.12, 0),
	"Head": Vector3(0, 0.1, 0), "LeftShoulder": Vector3(0.04, 0.08, 0), "LeftUpperArm": Vector3(0.12, 0, 0),
	"LeftLowerArm": Vector3(0.28, 0, 0), "LeftHand": Vector3(0.25, 0, 0), "LeftUpperLeg": Vector3(0.1, -0.05, 0),
	"LeftLowerLeg": Vector3(0, -0.42, 0), "LeftFoot": Vector3(0, -0.42, 0), "LeftToes": Vector3(0, -0.06, 0.13)}

const MIXAMO := {"Hips": "Hips", "Spine": "Spine", "Chest": "Spine1", "UpperChest": "Spine2", "Neck": "Neck",
	"Head": "Head", "LeftShoulder": "LeftShoulder", "LeftUpperArm": "LeftArm", "LeftLowerArm": "LeftForeArm",
	"LeftHand": "LeftHand", "LeftUpperLeg": "LeftUpLeg", "LeftLowerLeg": "LeftLeg", "LeftFoot": "LeftFoot",
	"LeftToes": "LeftToeBase"}

const THIGH := 0.42
const SHIN := 0.42
const ANKLE_H := 0.08
const HIP_TO_LEG := 0.05

## Clip table: gait clips are solved, the rest are posed. v in m/s, T cycle length in s, s stance fraction.
const GAITS := {
	"walk": {"v": 1.2, "T": 1.0, "s": 0.6, "lift": 0.07, "drop": 0.075, "bob": 0.012, "arm": 18.0, "lean": 3.0},
	"run": {"v": 3.5, "T": 0.66, "s": 0.36, "lift": 0.16, "drop": 0.10, "bob": 0.025, "arm": 35.0, "lean": 10.0},
}
const FPS := 30.0


static func bone_name(canon: String, naming: String) -> String:
	if naming == "mixamo":
		var base := canon.replace("Right", "Left")
		var m: String = MIXAMO.get(base, canon)
		if canon.begins_with("Right"):
			m = m.replace("Left", "Right")
		return "mixamorig_" + m
	return canon


static func offset(canon: String) -> Vector3:
	var o: Vector3 = OFFSET.get(canon.replace("Right", "Left"), Vector3.ZERO)
	if canon.begins_with("Right"):
		o.x = -o.x
	return o


static func bones_for(with_root: bool) -> Array[String]:
	var out: Array[String] = []
	for c in CANON:
		if c == "Root" and not with_root:
			continue
		out.append(c)
	return out


# ------------------------------------------------------------------ character

## Hero (Node3D) > Armature (Node3D) > Skeleton3D > Body (MeshInstance3D), plus Hero/AnimationPlayer.
func build_character(naming: String = "profile", with_root: bool = true, clips: bool = true, scale: float = 1.0) -> Node3D:
	var hero := Node3D.new()
	hero.name = "Hero"
	var arm := Node3D.new()
	arm.name = "Armature"
	hero.add_child(arm)
	var sk := Skeleton3D.new()
	sk.name = "Skeleton3D"
	arm.add_child(sk)
	for c in bones_for(with_root):
		var idx := sk.add_bone(bone_name(c, naming))
		var pc: String = PARENT.get(c, "")
		if pc == "Root" and not with_root:
			pc = ""
		if pc != "":
			sk.set_bone_parent(idx, sk.find_bone(bone_name(pc, naming)))
		sk.set_bone_rest(idx, Transform3D(Basis.IDENTITY, offset(c) * scale))
	sk.reset_bone_poses()
	sk.add_child(_build_body(sk, naming))
	if clips:
		var player := AnimationPlayer.new()
		player.name = "AnimationPlayer"
		hero.add_child(player)
		player.add_animation_library(&"", build_library(naming, with_root, "Armature/Skeleton3D"))
	return hero


func _build_body(sk: Skeleton3D, naming: String) -> MeshInstance3D:
	var g := {}
	for i in sk.get_bone_count():
		g[sk.get_bone_name(i)] = sk.get_bone_global_rest(i).origin
	var B := func(c: String) -> Vector3: return g[bone_name(c, naming)]
	var segs: Array = []   # [canon bone, p0, p1, half thickness, color]
	var grey := Color(0.72, 0.72, 0.74)
	segs.append(["Hips", B.call("Hips") + Vector3(0, -0.09, 0), B.call("Hips") + Vector3(0, 0.1, 0), Vector3(0.16, 0.0, 0.1), grey])
	segs.append(["Spine", B.call("Spine"), B.call("Chest"), Vector3(0.15, 0.0, 0.09), grey])
	segs.append(["Chest", B.call("Chest"), B.call("UpperChest"), Vector3(0.16, 0.0, 0.1), grey])
	segs.append(["UpperChest", B.call("UpperChest"), B.call("Neck"), Vector3(0.18, 0.0, 0.1), grey])
	segs.append(["Neck", B.call("Neck"), B.call("Head"), Vector3(0.04, 0.0, 0.04), grey])
	segs.append(["Head", B.call("Head"), B.call("Head") + Vector3(0, 0.22, 0), Vector3(0.1, 0.0, 0.11), Color(0.93, 0.83, 0.72)])
	for side in ["Left", "Right"]:
		var col := Color(0.2, 0.45, 0.9) if side == "Left" else Color(0.95, 0.5, 0.15)
		var sx := 1.0 if side == "Left" else -1.0
		segs.append([side + "Shoulder", B.call(side + "Shoulder"), B.call(side + "UpperArm"), Vector3(0.0, 0.05, 0.05), col])
		segs.append([side + "UpperArm", B.call(side + "UpperArm"), B.call(side + "LowerArm"), Vector3(0.0, 0.045, 0.045), col])
		segs.append([side + "LowerArm", B.call(side + "LowerArm"), B.call(side + "Hand"), Vector3(0.0, 0.04, 0.04), col])
		segs.append([side + "Hand", B.call(side + "Hand"), B.call(side + "Hand") + Vector3(0.15 * sx, 0, 0), Vector3(0.0, 0.02, 0.045), col.darkened(0.3)])
		segs.append([side + "UpperLeg", B.call(side + "UpperLeg"), B.call(side + "LowerLeg"), Vector3(0.06, 0.0, 0.06), col])
		segs.append([side + "LowerLeg", B.call(side + "LowerLeg"), B.call(side + "Foot"), Vector3(0.05, 0.0, 0.05), col])
		var ankle: Vector3 = B.call(side + "Foot")
		segs.append([side + "Foot", Vector3(ankle.x - 0.05, 0.0, ankle.z - 0.06), Vector3(ankle.x + 0.05, ankle.y + 0.02, ankle.z + 0.13), Vector3.ZERO, col.darkened(0.35)])
		var toe: Vector3 = B.call(side + "Toes")
		segs.append([side + "Toes", Vector3(toe.x - 0.05, 0.0, toe.z), Vector3(toe.x + 0.05, 0.05, toe.z + 0.07), Vector3.ZERO, col.darkened(0.5)])
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var bones := PackedInt32Array()
	var weights := PackedFloat32Array()
	var idx := PackedInt32Array()
	for s in segs:
		var b := sk.find_bone(bone_name(s[0], naming))
		var box := AABB(s[1], Vector3.ZERO).expand(s[2])
		var half: Vector3 = s[3]
		for ax in 3:
			if box.size[ax] < 2.0 * half[ax]:
				var c := box.position[ax] + box.size[ax] * 0.5
				box.position[ax] = c - half[ax]
				box.size[ax] = 2.0 * half[ax]
		_box(box, b, s[4], verts, norms, cols, bones, weights, idx)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_BONES] = bones
	arrays[Mesh.ARRAY_WEIGHTS] = weights
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.roughness = 0.85
	mesh.surface_set_material(0, mat)
	var skin := Skin.new()
	for i in sk.get_bone_count():
		skin.add_named_bind(sk.get_bone_name(i), sk.get_bone_global_rest(i).affine_inverse())
	var mi := MeshInstance3D.new()
	mi.name = "Body"
	mi.mesh = mesh
	mi.skin = skin
	mi.skeleton = NodePath("..")   # 4.6 changed the default to NodePath(""): set it (deltas section 7)
	return mi


func _box(box: AABB, bone: int, col: Color, verts: PackedVector3Array, norms: PackedVector3Array,
		cols: PackedColorArray, bones: PackedInt32Array, weights: PackedFloat32Array, idx: PackedInt32Array) -> void:
	var p := box.position
	var e := box.end
	var faces := [
		[Vector3(1, 0, 0), [Vector3(e.x, p.y, p.z), Vector3(e.x, e.y, p.z), Vector3(e.x, e.y, e.z), Vector3(e.x, p.y, e.z)]],
		[Vector3(-1, 0, 0), [Vector3(p.x, p.y, e.z), Vector3(p.x, e.y, e.z), Vector3(p.x, e.y, p.z), Vector3(p.x, p.y, p.z)]],
		[Vector3(0, 1, 0), [Vector3(p.x, e.y, p.z), Vector3(p.x, e.y, e.z), Vector3(e.x, e.y, e.z), Vector3(e.x, e.y, p.z)]],
		[Vector3(0, -1, 0), [Vector3(p.x, p.y, e.z), Vector3(p.x, p.y, p.z), Vector3(e.x, p.y, p.z), Vector3(e.x, p.y, e.z)]],
		[Vector3(0, 0, 1), [Vector3(e.x, p.y, e.z), Vector3(e.x, e.y, e.z), Vector3(p.x, e.y, e.z), Vector3(p.x, p.y, e.z)]],
		[Vector3(0, 0, -1), [Vector3(p.x, p.y, p.z), Vector3(p.x, e.y, p.z), Vector3(e.x, e.y, p.z), Vector3(e.x, p.y, p.z)]],
	]
	for f in faces:
		var base := verts.size()
		for v in f[1]:
			verts.append(v)
			norms.append(f[0])
			cols.append(col)
			bones.append_array([bone, 0, 0, 0])
			weights.append_array([1.0, 0.0, 0.0, 0.0])
		idx.append_array([base, base + 1, base + 2, base, base + 2, base + 3])


# ------------------------------------------------------------------ clips

## 2-bone leg solve in the sagittal plane. dz, dy: ankle minus hip joint (dy < 0).
## Returns (thigh angle, knee angle, foot angle) about +X; negative swings the limb forward (+Z).
static func solve_leg(dz: float, dy: float) -> Vector3:
	var d := clampf(sqrt(dz * dz + dy * dy), 0.05, THIGH + SHIN - 0.001)
	var phi := atan2(-dz, -dy)
	var alpha := acos(clampf((THIGH * THIGH + d * d - SHIN * SHIN) / (2.0 * THIGH * d), -1.0, 1.0))
	var beta := acos(clampf((THIGH * THIGH + SHIN * SHIN - d * d) / (2.0 * THIGH * SHIN), -1.0, 1.0))
	var a := phi - alpha
	var b := PI - beta
	return Vector3(a, b, -(a + b))


static func _arms(out: Dictionary, down_deg: float, swing_l: float, swing_r: float, elbow_deg: float) -> void:
	out["LeftUpperArm"] = Quaternion(Vector3.RIGHT, swing_l) * Quaternion(Vector3.BACK, deg_to_rad(-down_deg))
	out["RightUpperArm"] = Quaternion(Vector3.RIGHT, swing_r) * Quaternion(Vector3.BACK, deg_to_rad(down_deg))
	out["LeftLowerArm"] = Quaternion(Vector3.UP, deg_to_rad(-elbow_deg))
	out["RightLowerArm"] = Quaternion(Vector3.UP, deg_to_rad(elbow_deg))
	out["LeftHand"] = Quaternion.IDENTITY
	out["RightHand"] = Quaternion.IDENTITY


static func _legs_at(out: Dictionary, hips_y: float, lz: float, ly: float, rz: float, ry: float) -> void:
	for side in ["Left", "Right"]:
		var fz := lz if side == "Left" else rz
		var fy := ly if side == "Left" else ry
		var leg := solve_leg(fz, fy - (hips_y - HIP_TO_LEG))
		out[side + "UpperLeg"] = Quaternion(Vector3.RIGHT, leg.x)
		out[side + "LowerLeg"] = Quaternion(Vector3.RIGHT, leg.y)
		out[side + "Foot"] = Quaternion(Vector3.RIGHT, leg.z)
		out[side + "Toes"] = Quaternion.IDENTITY


static func _spine(out: Dictionary, lean_deg: float, twist_deg: float, breath_deg: float) -> void:
	out["Spine"] = Quaternion(Vector3.RIGHT, deg_to_rad(lean_deg))
	out["Chest"] = Quaternion(Vector3.UP, deg_to_rad(twist_deg)) * Quaternion(Vector3.RIGHT, deg_to_rad(breath_deg))
	out["UpperChest"] = Quaternion.IDENTITY
	out["Neck"] = Quaternion.IDENTITY
	out["Head"] = Quaternion(Vector3.RIGHT, deg_to_rad(-lean_deg * 0.6))
	out["LeftShoulder"] = Quaternion.IDENTITY
	out["RightShoulder"] = Quaternion.IDENTITY


## Gait pose at time t. Returns {canon: Quaternion, "Hips_pos": Vector3, "Root_pos": Vector3 (root motion)}.
static func pose_gait(t: float, g: Dictionary, root_motion: bool) -> Dictionary:
	var T: float = g["T"]
	var v: float = g["v"]
	var s: float = g["s"]
	var S := v * T * s
	var p := fposmod(t / T, 1.0)
	if is_equal_approx(t, T):
		p = 1.0
	var out := {}
	var hips_y: float = 0.97 - float(g["drop"]) - float(g["bob"]) * cos(4.0 * PI * p)   # lowest at heel strike
	out["Hips_pos"] = Vector3(0, hips_y, 0)
	var feet := {}
	for side in ["Left", "Right"]:
		var ph := fposmod(p, 1.0) if side == "Left" else fposmod(p + 0.5, 1.0)
		var fz: float
		var fy: float
		if ph < s:
			fz = S * 0.5 - S * (ph / s)
			fy = ANKLE_H
		else:
			var q := (ph - s) / (1.0 - s)
			var sm := q * q * (3.0 - 2.0 * q)
			fz = -S * 0.5 + S * sm
			fy = ANKLE_H + float(g["lift"]) * sin(PI * q)
		feet[side] = Vector2(fz, fy)
	var lf: Vector2 = feet["Left"]
	var rf: Vector2 = feet["Right"]
	_legs_at(out, hips_y, lf.x, lf.y, rf.x, rf.y)
	var a := deg_to_rad(float(g["arm"]))
	_arms(out, 75.0, a * cos(2.0 * PI * p), -a * cos(2.0 * PI * p), 20.0)
	_spine(out, float(g["lean"]), 4.0 * sin(2.0 * PI * p), 0.0)
	out["Root_pos"] = Vector3(0, 0, v * t) if root_motion else Vector3.ZERO
	return out


static func pose_clip(name: String, t: float) -> Dictionary:
	var out := {}
	match name:
		"idle":
			var hy := 0.94 + 0.008 * sin(2.0 * PI * t / 2.0)
			out["Hips_pos"] = Vector3(0, hy, 0)
			_legs_at(out, hy, 0.02, ANKLE_H, 0.02, ANKLE_H)
			_arms(out, 75.0, 0.03 * sin(2.0 * PI * t / 2.0), 0.03 * sin(2.0 * PI * t / 2.0), 10.0)
			_spine(out, 0.0, 0.0, 1.5 * sin(2.0 * PI * t / 2.0))
		"jump_up":
			var k := t / 0.3
			var hy := 0.97 - 0.15 * (1.0 - k) - 0.02 * k
			out["Hips_pos"] = Vector3(0, hy, 0)
			_legs_at(out, hy, 0.03, ANKLE_H, 0.03, ANKLE_H)
			_arms(out, lerpf(75.0, 20.0, k), deg_to_rad(30.0) * (1.0 - k), deg_to_rad(30.0) * (1.0 - k), 15.0)
			_spine(out, 12.0 * (1.0 - k), 0.0, 0.0)
		"fall":
			var hy := 0.97
			out["Hips_pos"] = Vector3(0, hy, 0)
			_legs_at(out, hy, 0.12, ANKLE_H + 0.16, -0.05, ANKLE_H + 0.12)
			_arms(out, 30.0 + 5.0 * sin(2.0 * PI * t / 0.6), 0.0, 0.0, 10.0)
			_spine(out, 4.0, 0.0, 0.0)
		"land":
			var k := t / 0.35
			var hy := 0.97 - 0.03 - 0.15 * sin(PI * k)
			out["Hips_pos"] = Vector3(0, hy, 0)
			_legs_at(out, hy, 0.04, ANKLE_H, 0.0, ANKLE_H)
			_arms(out, lerpf(40.0, 75.0, k), 0.0, 0.0, 15.0)
			_spine(out, 15.0 * sin(PI * k), 0.0, 0.0)
		"wave":   # right arm only, on purpose: a partial clip for the filter and RESET tests
			out["RightUpperArm"] = Quaternion(Vector3.BACK, deg_to_rad(-60.0))
			out["RightLowerArm"] = Quaternion(Vector3.BACK, deg_to_rad(-40.0 - 25.0 * sin(2.0 * PI * t / 0.4)))
			out["RightHand"] = Quaternion.IDENTITY
		"RESET":
			for c in CANON:
				if c != "Root":
					out[c] = Quaternion.IDENTITY
			out["Hips_pos"] = OFFSET["Hips"]
			out["Root_pos"] = Vector3.ZERO      # walk_rm animates Root: every animated path needs a RESET key
	return out


const CLIPS := {"idle": [2.0, true], "walk": [1.0, true], "run": [0.66, true], "jump_up": [0.3, false],
	"fall": [0.6, true], "land": [0.35, false], "wave": [1.2, false], "RESET": [0.0, false]}


## Bake one clip into an Animation (keys at 0, 1/30 s, ..., length inclusive, like a glTF export).
func bake_clip(name: String, naming: String, with_root: bool, skel_path: String, root_motion: bool = false) -> Animation:
	var base := name.trim_suffix("_rm")
	var spec: Array = CLIPS[base]
	var length: float = spec[0]
	if GAITS.has(base):
		length = float(GAITS[base]["T"])
	var anim := Animation.new()
	anim.length = length
	anim.loop_mode = Animation.LOOP_LINEAR if bool(spec[1]) else Animation.LOOP_NONE
	var tracks := {}
	var n := int(round(length * FPS))
	for i in range(n + 1):
		var t := minf(float(i) / FPS, length)
		var pose: Dictionary
		if GAITS.has(base):
			pose = pose_gait(t, GAITS[base], root_motion)
		else:
			pose = pose_clip(base, t)
		for key in pose:
			var k: String = key
			var is_pos := k.ends_with("_pos")
			var canon := k.trim_suffix("_pos")
			if canon == "Root" and (not with_root or (not root_motion and base != "RESET")):
				continue
			var tk := k
			if not tracks.has(tk):
				var ti := anim.add_track(Animation.TYPE_POSITION_3D if is_pos else Animation.TYPE_ROTATION_3D)
				anim.track_set_path(ti, NodePath(skel_path + ":" + bone_name(canon, naming)))
				tracks[tk] = ti
			var idx: int = tracks[tk]
			if is_pos:
				anim.position_track_insert_key(idx, t, pose[k])
			else:
				anim.rotation_track_insert_key(idx, t, pose[k])
		if n == 0:
			break
	return anim


func build_library(naming: String, with_root: bool, skel_path: String) -> AnimationLibrary:
	var lib := AnimationLibrary.new()
	for c in CLIPS:
		lib.add_animation(StringName(c), bake_clip(c, naming, with_root, skel_path))
	if with_root:
		lib.add_animation(&"walk_rm", bake_clip("walk_rm", naming, with_root, skel_path, true))
	return lib


# ------------------------------------------------------------------ job entry points

## Build the hero, save it as a scene, and optionally export a GLB (GLTFDocument) for import tests.
## args: naming ("profile"), with_root (true), scene ("res://anim/hero.tscn"), glb ("" = none).
func build(job) -> Dictionary:
	var naming: String = job.arg("naming", "profile")
	var with_root: bool = job.arg("with_root", naming != "mixamo")
	var scene_path: String = job.arg("scene", "res://anim/hero.tscn")
	var glb: String = job.arg("glb", "")
	var hero := build_character(naming, with_root, job.arg("clips", true), job.arg("scale", 1.0))
	job.root.add_child(hero)
	await job.wait_frames(1)
	var sk: Skeleton3D = hero.get_node("Armature/Skeleton3D")
	var player := hero.get_node_or_null("AnimationPlayer") as AnimationPlayer
	var res := {"ok": true, "naming": naming, "with_root": with_root, "bones": sk.get_bone_count(),
		"animations": Array(player.get_animation_list()) if player else []}
	var mi: MeshInstance3D = sk.get_node("Body")
	var box := mi.get_aabb()
	res["mesh_aabb"] = {"position": box.position, "size": box.size}
	if scene_path != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(scene_path.get_base_dir()))
		hero.get_parent().remove_child(hero)
		res["saved"] = AgentBuild.save_scene(hero, scene_path)
		job.root.add_child(hero)
		await job.wait_frames(1)
	if glb != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(glb.get_base_dir()))
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		var err := doc.append_from_scene(hero, state)
		if err == OK:
			err = doc.write_to_filesystem(state, ProjectSettings.globalize_path(glb))
		res["glb"] = glb
		res["glb_error"] = error_string(err)
		res["ok"] = res["ok"] and err == OK
	hero.queue_free()
	await job.wait_frames(1)
	return res
