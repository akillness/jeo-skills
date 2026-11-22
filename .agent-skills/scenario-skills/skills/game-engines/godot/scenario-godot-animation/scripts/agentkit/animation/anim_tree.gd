extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): AnimationTree built in code, driven and measured headless.
##
## build(job)  args scene (a character scene with an AnimationPlayer named AnimationPlayer whose clips are
##             idle walk run jump_up fall land wave), out (.tscn), lib ("" library prefix, e.g. "locomotion/"),
##             speeds ({"idle":0,"walk":1.2,"run":3.5}: the measured no-slide speeds), upper_body ([bones]
##             the OneShot filter lets through), skeleton ("Armature/Skeleton3D"), advance_mode (2 = Auto)
##   Graph: BlendTree [ sm (StateMachine: Ground BlendSpace1D, JumpUp, Fall, Land) -> act (OneShot, in1 =
##   wave, filtered to upper_body) -> ts (TimeScale) -> output ]. Transitions use advance expressions on a
##   child node "State" (locomotion_state.gd) so gameplay code never writes tree conditions.
## drive(job)  args scene, events [[t, {"speed": 1.2, "jump_pressed": true, ...} or {"param": path, "value": v}]],
##             duration, dt (1/60), bones, sample_every (s), deterministic (null = keep), filter (null = keep)
##   Advances the tree manually in fixed steps; returns the state sequence with times and bone samples.
## instances(job) args scene: checks that tree parameters are per instance and tree nodes are shared.

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")
const State = preload("res://addons/agentkit/animation/locomotion_state.gd")

const UPPER := ["RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand"]


static func anim_node(name: String) -> AnimationNodeAnimation:
	var a := AnimationNodeAnimation.new()
	a.animation = StringName(name)
	return a


static func transition(expr: String, at_end: bool, xfade: float, advance_mode: int) -> AnimationNodeStateMachineTransition:
	var t := AnimationNodeStateMachineTransition.new()
	t.xfade_time = xfade
	t.advance_mode = advance_mode
	if at_end:
		t.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END
	if expr != "":
		t.advance_expression = expr
	return t


static func make_tree_root(lib: String, speeds: Dictionary, upper: Array, skel: String, advance_mode: int,
		fall_expr: String = "not on_floor and not jump_pressed", jump_priority: int = 1) -> AnimationNodeBlendTree:
	var ground := AnimationNodeBlendSpace1D.new()
	ground.min_space = 0.0
	ground.max_space = maxf(4.0, float(speeds.get("run", 3.5)))
	ground.sync = true                                 # walk 1.0 s and run 0.66 s stay phase-locked
	for clip in ["idle", "walk", "run"]:
		ground.add_blend_point(anim_node(lib + clip), float(speeds.get(clip, 0.0)))
	var sm := AnimationNodeStateMachine.new()
	sm.add_node(&"Ground", ground, Vector2(200, 100))
	sm.add_node(&"JumpUp", anim_node(lib + "jump_up"), Vector2(400, 0))
	sm.add_node(&"Fall", anim_node(lib + "fall"), Vector2(600, 100))
	sm.add_node(&"Land", anim_node(lib + "land"), Vector2(400, 200))
	sm.add_transition(&"Start", &"Ground", transition("", false, 0.0, 2))
	var jump := transition("jump_pressed", false, 0.1, advance_mode)
	jump.priority = jump_priority
	sm.add_transition(&"Ground", &"JumpUp", jump)
	sm.add_transition(&"Ground", &"Fall", transition(fall_expr, false, 0.2, advance_mode))
	sm.add_transition(&"JumpUp", &"Fall", transition("", true, 0.1, 2))
	sm.add_transition(&"Fall", &"Land", transition("on_floor", false, 0.05, advance_mode))
	sm.add_transition(&"Land", &"Ground", transition("", true, 0.15, 2))
	var act := AnimationNodeOneShot.new()
	act.fadein_time = 0.2
	act.fadeout_time = 0.3
	act.filter_enabled = not upper.is_empty()
	for b in upper:
		act.set_filter_path(NodePath(skel + ":" + str(b)), true)
	var ts := AnimationNodeTimeScale.new()
	var bt := AnimationNodeBlendTree.new()
	bt.add_node(&"sm", sm, Vector2(0, 0))
	bt.add_node(&"wave", anim_node(lib + "wave"), Vector2(0, 200))
	bt.add_node(&"act", act, Vector2(250, 0))
	bt.add_node(&"ts", ts, Vector2(450, 0))
	bt.connect_node(&"act", 0, &"sm")
	bt.connect_node(&"act", 1, &"wave")
	bt.connect_node(&"ts", 0, &"act")
	bt.connect_node(&"output", 0, &"ts")
	return bt


func build(job) -> Dictionary:
	var src: String = job.arg("scene", "res://anim/hero.tscn")
	var out: String = job.arg("out", "res://anim/hero_tree.tscn")
	var lib: String = job.arg("lib", "")
	var skel: String = job.arg("skeleton", "Armature/Skeleton3D")
	var inst: Node = (load(src) as PackedScene).instantiate()
	var player := inst.get_node_or_null("AnimationPlayer") as AnimationPlayer
	if player == null:
		inst.free()
		return {"ok": false, "error": "no AnimationPlayer in " + src}
	var missing: Array = []
	for c in ["idle", "walk", "run", "jump_up", "fall", "land", "wave"]:
		if not player.has_animation(lib + c):
			missing.append(lib + c)
	if not missing.is_empty():
		inst.free()
		return {"ok": false, "error": "clips missing", "missing": missing}
	var state := State.new()
	state.name = "State"
	inst.add_child(state)
	var tree := AnimationTree.new()
	tree.name = "AnimationTree"
	inst.add_child(tree)
	tree.anim_player = NodePath("../AnimationPlayer")
	tree.advance_expression_base_node = NodePath("../State")
	tree.tree_root = make_tree_root(lib, job.arg("speeds", {"idle": 0.0, "walk": 1.2, "run": 3.5}),
		job.arg("upper_body", UPPER), skel, int(job.arg("advance_mode", 2)),
		str(job.arg("fall_expr", "not on_floor and not jump_pressed")), int(job.arg("jump_priority", 1)))
	if job.arg("root_motion_track", "") != "":
		tree.root_motion_track = NodePath(str(job.arg("root_motion_track")))
	var saved := AgentBuild.save_scene(inst, out)
	inst.free()
	return {"ok": saved.get("ok", false), "out": out, "saved": saved}


func _playback(tree: AnimationTree) -> AnimationNodeStateMachinePlayback:
	return tree.get("parameters/sm/playback") as AnimationNodeStateMachinePlayback


func drive(job) -> Dictionary:
	var src: String = job.arg("scene", "res://anim/hero_tree.tscn")
	var inst: Node = (load(src) as PackedScene).instantiate()
	job.root.add_child(inst)
	var tree := inst.get_node("AnimationTree") as AnimationTree
	var state := inst.get_node_or_null("State")
	var sk := inst.get_node(str(job.arg("skeleton", "Armature/Skeleton3D"))) as Skeleton3D
	if job.arg("deterministic", null) != null:
		tree.deterministic = bool(job.arg("deterministic"))
	if job.arg("filter", null) != null:
		var bt := tree.tree_root as AnimationNodeBlendTree
		(bt.get_node(&"act") as AnimationNodeOneShot).filter_enabled = bool(job.arg("filter"))
	tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	tree.active = true
	var dt: float = job.arg("dt", 1.0 / 60.0)
	var duration: float = job.arg("duration", 3.0)
	var every: float = job.arg("sample_every", 0.0)
	var events: Array = job.arg("events", [])
	events.sort_custom(func(a, b): return float(a[0]) < float(b[0]))
	var bones: Array = job.arg("bones", [])
	var states: Array = []
	var samples: Array = []
	var ev := 0
	var t := 0.0
	var last := ""
	var next_sample := 0.0
	var steps := int(round(duration / dt))
	var pre: Array = job.arg("before_start", [])     # e.g. [["travel", "Fall"]] to test travel before the first advance
	for p in pre:
		if str(p[0]) == "travel":
			_playback(tree).travel(StringName(str(p[1])))
	for i in range(steps + 1):
		while ev < events.size() and float(events[ev][0]) <= t + 1e-6:
			var e: Dictionary = events[ev][1]
			if e.has("param"):
				tree.set(str(e["param"]), e["value"])
			elif e.has("travel"):
				_playback(tree).travel(StringName(str(e["travel"])))
			else:
				for k in e:
					state.set(str(k), e[k])
			ev += 1
		tree.advance(0.0 if i == 0 else dt)
		var pb := _playback(tree)
		var cur := str(pb.get_current_node())
		if cur != last:
			states.append([snappedf(t, 0.0001), cur])
			last = cur
		if bones.size() > 0 and every > 0.0 and t + 1e-6 >= next_sample:
			var row := {"t": snappedf(t, 0.0001), "state": cur, "pos": snappedf(pb.get_current_play_position(), 0.0001)}
			for b in bones:
				var bi := sk.find_bone(str(b))
				if bi >= 0:
					var p: Vector3 = sk.global_transform * sk.get_bone_global_pose(bi).origin
					row[str(b)] = [snappedf(p.x, 0.0001), snappedf(p.y, 0.0001), snappedf(p.z, 0.0001)]
			samples.append(row)
			next_sample += every
		t += dt
	var res := {"ok": true, "states": states, "samples": samples, "deterministic": tree.deterministic,
		"travel_path": Array(_playback(tree).get_travel_path())}
	inst.queue_free()
	await job.wait_frames(1)
	return res


func instances(job) -> Dictionary:
	var src: String = job.arg("scene", "res://anim/hero_tree.tscn")
	var ps := load(src) as PackedScene
	var a := ps.instantiate()
	var b := ps.instantiate()
	job.root.add_child(a)
	job.root.add_child(b)
	var ta := a.get_node("AnimationTree") as AnimationTree
	var tb := b.get_node("AnimationTree") as AnimationTree
	await job.wait_frames(1)
	ta.set("parameters/sm/Ground/blend_position", 3.0)
	ta.set("parameters/ts/scale", 0.5)
	var same_root := ta.tree_root == tb.tree_root
	var bt := ta.tree_root as AnimationNodeBlendTree
	var act := bt.get_node(&"act") as AnimationNodeOneShot
	var before: float = (tb.tree_root as AnimationNodeBlendTree).get_node(&"act").fadein_time
	act.fadein_time = 0.9                                 # edits the shared resource
	var after_b: float = (tb.tree_root as AnimationNodeBlendTree).get_node(&"act").fadein_time
	var res := {"ok": true, "same_tree_root_object": same_root,
		"a_blend": ta.get("parameters/sm/Ground/blend_position"), "b_blend": tb.get("parameters/sm/Ground/blend_position"),
		"a_scale": ta.get("parameters/ts/scale"), "b_scale": tb.get("parameters/ts/scale"),
		"b_fadein_before": before, "b_fadein_after_editing_a": after_b}
	act.fadein_time = before
	a.queue_free()
	b.queue_free()
	await job.wait_frames(1)
	return res
