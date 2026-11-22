extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): character scenes assembled in code.
##
## share_library(job): one retargeted AnimationLibrary on any humanoid. args character (an imported scene
##   whose skeleton was retargeted to %GeneralSkeleton), library (an AnimationLibrary resource, for example
##   a .glb imported "As Animation Library"), library_name ("locomotion"), out (res://...tscn), unique (true:
##   duplicate the library so per-character edits never leak to every character sharing the file).

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")


func share_library(job) -> Dictionary:
	var char_path: String = job.arg("character", "")
	var lib_path: String = job.arg("library", "")
	var lib_name: String = job.arg("library_name", "locomotion")
	var out: String = job.arg("out", "res://anim/shared.tscn")
	if not ResourceLoader.exists(char_path) or not ResourceLoader.exists(lib_path):
		return {"ok": false, "error": "missing character or library"}
	var lib = load(lib_path)
	if not (lib is AnimationLibrary):
		return {"ok": false, "error": lib_path + " is not an AnimationLibrary (set Import As: Animation Library)"}
	if job.arg("unique", false):
		lib = (lib as AnimationLibrary).duplicate(true)
	var root := Node3D.new()
	root.name = str(job.arg("name", "Player"))
	var ch: Node = (load(char_path) as PackedScene).instantiate()
	ch.name = "Character"
	root.add_child(ch)
	var player := AnimationPlayer.new()
	player.name = "AnimationPlayer"
	root.add_child(player)
	player.root_node = NodePath("../Character")
	player.add_animation_library(StringName(lib_name), lib)
	job.root.add_child(root)
	await job.wait_frames(1)
	var unresolved := 0
	var first := ""
	var chr := player.get_node(player.root_node)
	for an in player.get_animation_list():
		var a := player.get_animation(an)
		for i in a.get_track_count():
			var tp := a.track_get_path(i)
			var n := chr.get_node_or_null(NodePath(str(tp).get_slice(":", 0)))
			var ok := n != null
			if ok and n is Skeleton3D:
				ok = (n as Skeleton3D).find_bone(str(tp.get_concatenated_subnames())) >= 0
			if not ok:
				unresolved += 1
				if first == "":
					first = str(tp)
	var n_anims := player.get_animation_list().size()
	job.root.remove_child(root)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false) and unresolved == 0, "out": out, "animations": n_anims,
		"unresolved_tracks": unresolved, "first_unresolved": first, "saved": saved}


## Two instances of a scene whose AnimationPlayer loads the same library file: does playing one move the other?
## args scene, anim_a ("locomotion/Walk"), anim_b ("locomotion/Idle"), time (0.25), bone ("Hips")
func independence(job) -> Dictionary:
	var ps := load(str(job.arg("scene", ""))) as PackedScene
	var a := ps.instantiate()
	var b := ps.instantiate()
	job.root.add_child(a)
	job.root.add_child(b)
	(b as Node3D).position.x = 2.0
	await job.wait_frames(1)
	var pa := a.get_node("AnimationPlayer") as AnimationPlayer
	var pb := b.get_node("AnimationPlayer") as AnimationPlayer
	var la := pa.get_animation_library(pa.get_animation_library_list()[0])
	var lb := pb.get_animation_library(pb.get_animation_library_list()[0])
	pa.play(str(job.arg("anim_a", "locomotion/Walk")))
	pa.seek(float(job.arg("time", 0.25)), true)
	pa.pause()
	pb.play(str(job.arg("anim_b", "locomotion/Idle")))
	pb.seek(0.0, true)
	pb.pause()
	await job.wait_frames(1)
	var bone := str(job.arg("bone", "Hips"))
	var sa := _skel(a)
	var sb := _skel(b)
	var ya := sa.get_bone_global_pose(sa.find_bone(bone)).origin
	var yb := sb.get_bone_global_pose(sb.find_bone(bone)).origin
	var res := {"ok": true, "same_library_object": la == lb, "a_current": str(pa.assigned_animation), "b_current": str(pb.assigned_animation),
		"a_bone": ya, "b_bone": yb, "poses_differ": not ya.is_equal_approx(yb)}
	a.queue_free()
	b.queue_free()
	await job.wait_frames(1)
	return res


func _skel(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _skel(c)
		if s:
			return s
	return null
