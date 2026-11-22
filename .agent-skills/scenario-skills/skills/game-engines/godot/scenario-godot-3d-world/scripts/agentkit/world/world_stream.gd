extends RefCounted
## Streaming test bed (scenario-godot-3d-world 0.1, Godot 4.7.2).
##   world_stream.gd:make_cells  writes N x N cell scenes (terrain-like slab + props) to res://world/cells/
##   world_stream.gd:walk        moves a target across the grid with runtime/cell_streamer.gd and records
##                               loaded cells, loads, unloads, the worst frame, and a border-pacing test

const W = preload("res://addons/agentkit/world/world_common.gd")
const STREAMER := "res://addons/agentkit/world/runtime/cell_streamer.gd"


func make_cells(job) -> Dictionary:
	var n: int = job.arg("n", 6)
	var cell: float = job.arg("cell_size", 64.0)
	var props: int = job.arg("props", 200)
	var dir: String = job.arg("dir", "res://world/cells")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var rng := RandomNumberGenerator.new()
	rng.seed = 9
	var bytes := 0
	var t0 := Time.get_ticks_usec()
	for z in n:
		for x in n:
			var root := Node3D.new()
			root.name = "Cell_%d_%d" % [x, z]
			root.position = Vector3(x * cell, 0, z * cell)
			var slab := MeshInstance3D.new()
			slab.name = "Ground"
			var pm := PlaneMesh.new()
			pm.size = Vector2(cell, cell)
			pm.subdivide_width = 63
			pm.subdivide_depth = 63
			slab.mesh = pm
			slab.position = Vector3(cell * 0.5, 0, cell * 0.5)
			slab.material_override = W.flat_material(Color.from_hsv(float((x + z) % 6) / 6.0, 0.3, 0.6))
			root.add_child(slab)
			var body := StaticBody3D.new()
			body.name = "Body"
			var cs := CollisionShape3D.new()
			var bs := BoxShape3D.new()
			bs.size = Vector3(cell, 1, cell)
			cs.shape = bs
			cs.position = Vector3(cell * 0.5, -0.5, cell * 0.5)
			body.add_child(cs)
			root.add_child(body)
			var box := BoxMesh.new()
			for i in props:
				var mi := MeshInstance3D.new()
				mi.mesh = box
				mi.position = Vector3(rng.randf() * cell, 0.5, rng.randf() * cell)
				root.add_child(mi)
			var path := dir.path_join("cell_%d_%d.tscn" % [x, z])
			W.save(root, path)
			bytes += FileAccess.get_file_as_bytes(path).size()
			root.free()
	return {"ok": true, "cells": n * n, "dir": dir, "bytes_total": bytes, "write_ms": (Time.get_ticks_usec() - t0) / 1000.0}


func walk(job) -> Dictionary:
	var n: int = job.arg("n", 6)
	var cell: float = job.arg("cell_size", 64.0)
	var speed: float = job.arg("speed", 20.0)  # m/s, a fast vehicle
	var root := Node3D.new()
	job.root.add_child(root)
	await job.process_frame
	var nodes_baseline := int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	var target := Node3D.new()
	target.name = "Target"
	root.add_child(target)
	var s: Node3D = load(STREAMER).new()
	s.name = "Streamer"
	s.set("target", target)
	s.set("cell_size", cell)
	s.set("cell_path", job.arg("dir", "res://world/cells") + "/cell_%d_%d.tscn")
	s.set("load_radius", job.arg("load_radius", 1))
	s.set("unload_radius", job.arg("unload_radius", 2))
	root.add_child(s)
	# diagonal walk across the grid
	var start := Vector3(cell * 0.5, 0, cell * 0.5)
	var end := Vector3(cell * (n - 0.5), 0, cell * (n - 0.5))
	target.global_position = start
	var max_loaded := 0
	var worst_ms := 0.0
	var frames := 0
	var dt := 1.0 / 60.0
	var ready_wait := 0
	while frames < 4000:
		var t0 := Time.get_ticks_usec()
		await job.process_frame
		var ms := (Time.get_ticks_usec() - t0) / 1000.0
		frames += 1
		if frames > 10:
			worst_ms = maxf(worst_ms, ms)
		max_loaded = maxi(max_loaded, s.get("loaded").size())
		if target.global_position.distance_to(end) < 0.5:
			break
		target.global_position = target.global_position.move_toward(end, speed * dt)
	var after_walk := {"requests": s.get("requests"), "loads": s.get("loads"), "unloads": s.get("unloads"), "loaded_now": s.get("loaded").size()}
	# border pacing: oscillate 2 m across a cell border for 240 frames; hysteresis means no new loads/unloads
	var border := Vector3(cell * 3.0, 0, cell * 2.5)
	target.global_position = border
	for i in 120:
		await job.process_frame
	for i in 60:  # warm-up: the first crossing legitimately loads the column on the other side
		target.global_position = border + Vector3(sin(i * 0.3) * 2.0, 0, 0)
		await job.process_frame
	for i in 600:  # let in-flight threaded loads land before counting
		if s.get("pending").is_empty():
			break
		await job.process_frame
	var r0: int = s.get("requests")
	var l0: int = s.get("loads")
	var u0: int = s.get("unloads")
	for i in 240:
		target.global_position = border + Vector3(sin(i * 0.3) * 2.0, 0, 0)
		await job.process_frame
	var pacing := {"requests": int(s.get("requests")) - r0, "loads": int(s.get("loads")) - l0, "unloads": int(s.get("unloads")) - u0}
	# Soak end: send the target far away; every cell must unload and the node count return to the
	# baseline plus the streamer and the target (2 nodes), else cells leak.
	target.global_position = Vector3(-100.0 * cell, 0, -100.0 * cell)
	for i in 600:
		await job.process_frame
		if s.get("loaded").is_empty() and s.get("pending").is_empty():
			break
	await job.process_frame
	var soak := {"baseline": nodes_baseline, "after_unload_all": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
			"loaded_left": s.get("loaded").size()}
	soak["extra_nodes"] = soak["after_unload_all"] - nodes_baseline
	root.queue_free()
	await job.process_frame
	var window := (2 * int(job.arg("load_radius", 1)) + 1)
	var hyst: bool = int(job.arg("unload_radius", 2)) > int(job.arg("load_radius", 1))
	return {"ok": (not hyst or (pacing["requests"] == 0 and pacing["unloads"] == 0)) and max_loaded <= (2 * int(job.arg("unload_radius", 2)) + 1) * (2 * int(job.arg("unload_radius", 2)) + 1),
			"frames": frames, "walk": after_walk, "max_loaded": max_loaded, "load_window": window * window,
			"worst_frame_ms": worst_ms, "border_pacing": pacing, "soak": soak}
