extends RefCounted
## scenario-godot-animation AgentKit (0.1, Godot 4.7.2): tweens and the SpringArm3D camera, measured headless.
##
## tweens(job)    kill guard, custom_step determinism, tween_await + set_timeout (4.7), subtween (4.4), stagger.
##                Tweens are paused and stepped with custom_step so values are exact; when two tweens animate
##                the same property, the later one processed wins each frame (creation order here).
## spring_arm(job) args wall_z (1.5), length (3.0), radius (0.2 sphere cast, 0 = ray). Reports get_hit_length()
##                and the camera's local z after physics frames, with and without the wall.

class Box extends Node3D:
	var value := 0.0
	signal hit


func _step(tws: Array, dt: float, n: int) -> void:
	for i in n:
		for tw in tws:
			if tw and tw.is_valid():
				tw.custom_step(dt)


func tweens(job) -> Dictionary:
	var res := {"ok": true}
	var b := Box.new()
	job.root.add_child(b)
	await job.process_frame                          # custom_step inside _init or before the tree runs does nothing
	# 1. Kill guard: a second tween on the same property while the first still runs.
	for guard in [false, true]:
		b.value = 0.0
		var a := b.create_tween()
		a.pause()
		a.tween_property(b, "value", 100.0, 1.0)
		_step([a], 0.05, 10)                           # 0.5 s: value 50
		var second: Tween
		if guard and a.is_valid():
			a.kill()
		second = b.create_tween()
		second.pause()
		second.tween_property(b, "value", 0.0, 1.0)   # from 50 back to 0
		_step([a, second], 0.05, 5)                    # 0.25 s more: B alone gives 37.5
		res["kill_guard_" + str(guard)] = {"value": snappedf(b.value, 0.001), "first_tween_valid": a.is_valid()}
		a.kill()
		second.kill()
		# keep going after A finishes: without the guard A's final write (100) lands on top of B
		if not guard:
			b.value = 0.0
			var a2 := b.create_tween()
			a2.pause()
			a2.tween_property(b, "value", 100.0, 1.0)
			_step([a2], 0.05, 10)
			var b2 := b.create_tween()
			b2.pause()
			b2.tween_property(b, "value", 0.0, 1.0)
			_step([a2, b2], 0.05, 10)                  # t = 1.0 for A (ends at 100), 0.5 for B
			res["no_guard_at_A_end"] = snappedf(b.value, 0.001)
			a2.kill()
			b2.kill()
	# 2. custom_step determinism: linear, ease in-out, one big step.
	b.value = 0.0
	var tl := b.create_tween()
	tl.pause()
	tl.tween_property(b, "value", 10.0, 2.0)
	tl.custom_step(0.5)
	res["linear_at_0.5_of_2s"] = snappedf(b.value, 0.0001)
	var big := tl.custom_step(10.0)
	res["after_big_step"] = {"value": b.value, "custom_step_returned": big, "valid": tl.is_valid()}
	b.value = 0.0
	var te := b.create_tween()
	te.pause()
	te.tween_property(b, "value", 10.0, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	te.custom_step(0.5)
	res["sine_inout_at_0.5_of_2s"] = snappedf(b.value, 0.0001)   # 10 * (1 - cos(pi/4)) / 2 = 1.4645
	te.kill()
	# 3. tween_await: the step waits for a signal, or gives up after set_timeout.
	for emit in [true, false]:
		var calls: Array = []
		var tw := b.create_tween()
		tw.pause()
		tw.tween_callback(func(): calls.append("launch"))
		tw.tween_await(b.hit).set_timeout(4.0)
		tw.tween_callback(func(): calls.append("explode@%.2f" % tw.get_total_elapsed_time()))
		_step([tw], 0.1, 10)                             # 1 s
		var at_1s := calls.duplicate()
		if emit:
			b.hit.emit()
		_step([tw], 0.1, 35)                             # 4.5 s total
		res["await_emit_" + str(emit)] = {"calls_at_1s": at_1s, "calls_at_4.5s": calls}
		tw.kill()
	# 4. Subtween: a nested sequence counts as one step of the parent.
	b.value = 0.0
	var seq: Array = []
	var sub := b.create_tween()
	sub.tween_property(b, "value", 5.0, 0.5)
	sub.tween_property(b, "value", 2.0, 0.5)
	var parent := b.create_tween()
	parent.pause()
	sub.pause()
	parent.tween_subtween(sub)
	parent.tween_callback(func(): seq.append(snappedf(b.value, 0.001)))
	_step([parent], 0.05, 25)
	res["subtween_value_when_parent_continues"] = seq
	# 5. Stagger: parallel tweeners with per-item delay (list entrance).
	var items: Array = []
	for i in 5:
		var it := Box.new()
		b.add_child(it)
		items.append(it)
	var st := b.create_tween().set_parallel(true)
	st.pause()
	for i in items.size():
		st.tween_property(items[i], "value", 1.0, 0.2).set_delay(0.05 * i)
	_step([st], 0.01, 20)                                # 0.2 s
	res["stagger_values_at_0.2s"] = items.map(func(x): return snappedf(x.value, 0.001))
	b.queue_free()
	await job.process_frame
	return res


func spring_arm(job) -> Dictionary:
	var out := {"ok": true}
	for wall in [false, true]:
		var root := Node3D.new()
		job.root.add_child(root)
		if wall:
			var sb := StaticBody3D.new()
			var cs := CollisionShape3D.new()
			var box := BoxShape3D.new()
			box.size = Vector3(4, 4, 0.2)
			cs.shape = box
			sb.add_child(cs)
			root.add_child(sb)
			sb.position = Vector3(0, 0, float(job.arg("wall_z", 1.5)) + 0.1)   # front face at wall_z
		var arm := SpringArm3D.new()
		arm.spring_length = float(job.arg("length", 3.0))
		var r := float(job.arg("radius", 0.2))
		if r > 0.0:
			var sph := SphereShape3D.new()
			sph.radius = r
			arm.shape = sph
		root.add_child(arm)
		var cam := Camera3D.new()
		arm.add_child(cam)
		for i in 6:
			await job.physics_frame
		out["wall_" + str(wall)] = {"hit_length": snappedf(arm.get_hit_length(), 0.0001), "camera_local_z": snappedf(cam.position.z, 0.0001),
			"margin": arm.margin}
		root.queue_free()
		await job.process_frame
	return out
