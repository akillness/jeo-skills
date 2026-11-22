extends RefCounted
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): crowd navigation benchmark, N enemies chasing a player.
##
##   gd_gameplay.crowd_bench(P, n=200, avoidance=True)         # headless, --fixed-fps 60
##   gd_run.run_script(P, "res://addons/agentkit/gameplay/crowd_bench.gd:run", {"n": 200},
##                     extra_args=["--fixed-fps", "60"])
##
## Args: n (200), mode ("body": CharacterBody3D + NavigationAgent3D per enemy; "server": data arrays,
## NavigationServer3D agents and query_path, one MultiMesh), avoidance (true), collide_agents (false),
## neighbor_distance (8.0), max_neighbors (8), time_horizon (0.5), radius (0.4), speed (4.0),
## repath_interval (0.25), self_tick (true), frames (600 measured), warmup (60), seed (7),
## player_moves (true), capture ("" or a PNG path: windowed runs only), csv ("crowd/frames.csv").
##
## Run it headless with --fixed-fps 60: every frame is then exactly one physics tick and the wall
## time per frame is the CPU cost of the frame (headless otherwise sleeps 6.9 ms a frame, observed).

const Nav = preload("res://addons/agentkit/gameplay/nav_tools.gd")
const Arena = preload("res://addons/agentkit/gameplay/arena.gd")
const EnemyBody = preload("res://addons/agentkit/gameplay/enemy_body.gd")

const L_WORLD := 1
const L_PLAYER := 2
const L_ENEMY := 4

var job
var n := 200
var mode := "body"
var radius := 0.4
var speed := 4.0
var avoidance := true
var player: Node3D
var level: Node3D
var map: RID
var t_sim := 0.0
var player_moves := true
# body mode
var bodies: Array = []
# server mode
var s_pos := PackedVector3Array()
var s_safe := PackedVector3Array()
var s_desired := PackedVector3Array()
var s_paths: Array = []
var s_idx := PackedInt32Array()
var s_repath := PackedFloat32Array()
var s_rids: Array = []
var s_mm: MultiMesh
var s_query: NavigationPathQueryParameters3D
var s_result: NavigationPathQueryResult3D
var repath_interval := 0.25
var path_queries := 0


func run(j) -> Dictionary:
	job = j
	n = job.arg("n", 200)
	mode = job.arg("mode", "body")
	radius = job.arg("radius", 0.4)
	speed = job.arg("speed", 4.0)
	avoidance = job.arg("avoidance", true)
	player_moves = job.arg("player_moves", true)
	repath_interval = job.arg("repath_interval", 0.25)
	var frames: int = job.arg("frames", 600)
	var warmup: int = job.arg("warmup", 60)
	var t_build := Time.get_ticks_usec()
	var a := Arena.build(job.root, {"size": 60.0, "obstacles": 14, "seed": job.arg("seed", 7)})
	level = a["level"]
	var region: NavigationRegion3D = a["region"]
	var nm := Nav.make_navmesh({"agent_radius": radius, "parsed": "colliders", "source": "group", "group": "nav_source"})
	var bake := Nav.bake(nm, region)
	region.navigation_mesh = nm
	map = region.get_navigation_map()
	var sync_frames := await Nav.wait_map_ready(job, map, 60)
	player = _make_player()
	var spawns := Arena.ring_points(n, 16.0, 28.0, a["boxes"], 11)
	if spawns.size() < n:
		return {"ok": false, "error": "only %d spawn points" % spawns.size()}
	if mode == "server":
		_spawn_server(spawns)
	else:
		_spawn_bodies(spawns)
	var build_ms := (Time.get_ticks_usec() - t_build) / 1000.0
	job.physics_frame.connect(_on_physics_frame)
	await job.wait_frames(warmup)
	var csv_path: String = job.out_path(str(job.arg("csv", "crowd/frames_%s_%d.csv" % [mode, n])))
	var f := FileAccess.open(csv_path, FileAccess.WRITE)
	f.store_line("frame,frame_ms,process_ms,physics_ms,navigation_ms,pairs,active_bodies,nav_agents,nodes")
	var fr: Array = []
	var phys: Array = []
	var navp: Array = []
	var pairs_max := 0
	var nav_agents := 0
	var start_pos := _positions()
	var mid_pos := PackedVector3Array()
	var last := Time.get_ticks_usec()
	for i in frames:
		await job.process_frame
		var now := Time.get_ticks_usec()
		var dt := (now - last) / 1000.0
		last = now
		var pm := Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
		var nvm := Performance.get_monitor(Performance.TIME_NAVIGATION_PROCESS) * 1000.0
		var pr := int(Performance.get_monitor(Performance.PHYSICS_3D_COLLISION_PAIRS))
		nav_agents = int(Performance.get_monitor(Performance.NAVIGATION_3D_AGENT_COUNT))
		pairs_max = maxi(pairs_max, pr)
		fr.append(dt)
		phys.append(pm)
		navp.append(nvm)
		f.store_line("%d,%.4f,%.4f,%.4f,%.4f,%d,%d,%d,%d" % [i, dt, Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
				pm, nvm, pr, int(Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)), nav_agents,
				int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))])
		if i == frames - 121:
			mid_pos = _positions()
	f.close()
	job.physics_frame.disconnect(_on_physics_frame)
	var end_pos := _positions()
	var crowd := _crowd_metrics(start_pos, mid_pos, end_pos)
	var r := {"ok": true, "mode": mode, "n": n, "avoidance": avoidance, "collide_agents": job.arg("collide_agents", false),
			"neighbor_distance": job.arg("neighbor_distance", 8.0), "max_neighbors": job.arg("max_neighbors", 8),
			"time_horizon": job.arg("time_horizon", 0.5), "repath_interval": repath_interval,
			"frames": frames, "build_ms": build_ms, "bake": bake, "sync_frames": sync_frames,
			"frame_ms": _stats(fr),
			"monitor_note": "Performance TIME_* monitors refresh about once per wall second and read 0 under --fixed-fps; time per frame comes from frame_ms (A/B runs attribute the cost)",
			"collision_pairs_max": pairs_max, "nav_agents": nav_agents,
			"nodes": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
			"path_queries": path_queries, "crowd": crowd, "csv": csv_path, "sim_seconds": t_sim}
	if mode == "body" and avoidance and not bodies.is_empty():
		var inside := 0
		var outside := 0
		for b in bodies:
			inside += b.ticks_in_physics
			outside += b.ticks_outside_physics
		r["velocity_computed_calls"] = {"inside_physics_frame": inside, "outside_physics_frame": outside}
	var cap_out: String = job.arg("capture", "")
	if cap_out != "" and not job.is_headless():
		var cap = load("res://addons/agentkit/agent_capture.gd").new()
		var cr: Dictionary = await cap.capture_node(job, level, cap_out, job.arg("capture_size", Vector2i(900, 900)), "", 3)
		r["capture"] = cr
	_cleanup()
	return r


func _make_player() -> Node3D:
	var p := Node3D.new()
	p.name = "Player"
	var mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.7
	cyl.bottom_radius = 0.7
	cyl.height = 2.0
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.9, 0.15, 0.1)
	cyl.material = m
	mi.mesh = cyl
	mi.position.y = 1.0
	p.add_child(mi)
	level.add_child(p)
	return p


func _enemy_mesh() -> Mesh:
	var cm := CapsuleMesh.new()
	cm.radius = radius
	cm.height = 1.8
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.95, 0.8, 0.2)
	cm.material = m
	return cm


func _spawn_bodies(spawns: PackedVector3Array) -> void:
	var shape := CapsuleShape3D.new()
	shape.radius = radius
	shape.height = 1.8
	var mesh := _enemy_mesh()
	var collide: bool = job.arg("collide_agents", false)
	var self_tick: bool = job.arg("self_tick", true)
	var holder := Node3D.new()
	holder.name = "Enemies"
	level.add_child(holder)
	for i in n:
		var e: CharacterBody3D = EnemyBody.new()
		e.name = "Enemy%03d" % i
		e.speed = speed
		e.repath_interval = repath_interval
		e.self_tick = self_tick
		e.collision_layer = L_ENEMY
		e.collision_mask = L_WORLD | (L_ENEMY if collide else 0)
		var cs := CollisionShape3D.new()
		cs.shape = shape
		cs.position.y = 0.9
		e.add_child(cs)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.position.y = 0.9
		e.add_child(mi)
		var ag := NavigationAgent3D.new()
		ag.radius = radius
		ag.height = 1.8
		ag.max_speed = speed
		ag.path_desired_distance = 1.0
		ag.target_desired_distance = 1.0
		ag.avoidance_enabled = avoidance
		ag.neighbor_distance = job.arg("neighbor_distance", 8.0)
		ag.max_neighbors = job.arg("max_neighbors", 8)
		ag.time_horizon_agents = job.arg("time_horizon", 0.5)
		e.add_child(ag)
		e.position = spawns[i] + Vector3(0, 0.05, 0)
		holder.add_child(e)
		e.setup(ag, float(i % 16) / 16.0)
		e.target_node = player
		bodies.append(e)


func _spawn_server(spawns: PackedVector3Array) -> void:
	s_pos = spawns.duplicate()
	s_safe.resize(n)
	s_desired.resize(n)
	s_idx.resize(n)
	s_repath.resize(n)
	s_query = NavigationPathQueryParameters3D.new()
	s_query.map = map
	s_query.simplify_path = false
	s_result = NavigationPathQueryResult3D.new()
	for i in n:
		s_paths.append(PackedVector3Array())
		s_repath[i] = float(i % 16) / 16.0 * repath_interval
		var rid := NavigationServer3D.agent_create()
		NavigationServer3D.agent_set_map(rid, map)
		NavigationServer3D.agent_set_radius(rid, radius)
		NavigationServer3D.agent_set_height(rid, 1.8)
		NavigationServer3D.agent_set_max_speed(rid, speed)
		NavigationServer3D.agent_set_neighbor_distance(rid, job.arg("neighbor_distance", 8.0))
		NavigationServer3D.agent_set_max_neighbors(rid, job.arg("max_neighbors", 8))
		NavigationServer3D.agent_set_time_horizon_agents(rid, job.arg("time_horizon", 0.5))
		NavigationServer3D.agent_set_position(rid, s_pos[i])
		NavigationServer3D.agent_set_avoidance_enabled(rid, avoidance)
		if avoidance:
			NavigationServer3D.agent_set_avoidance_callback(rid, _on_safe.bind(i))
		s_rids.append(rid)
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "EnemyMultiMesh"
	s_mm = MultiMesh.new()
	s_mm.transform_format = MultiMesh.TRANSFORM_3D
	s_mm.mesh = _enemy_mesh()
	s_mm.instance_count = n
	mmi.multimesh = s_mm
	level.add_child(mmi)
	for i in n:
		s_mm.set_instance_transform(i, Transform3D(Basis(), s_pos[i] + Vector3(0, 0.9, 0)))


func _on_safe(safe_velocity: Vector3, i: int) -> void:
	s_safe[i] = safe_velocity


func _on_physics_frame() -> void:
	var delta := 1.0 / float(Engine.physics_ticks_per_second)
	t_sim += delta
	if player_moves:
		player.position = Vector3(cos(t_sim * 0.5) * 5.0, 0.0, sin(t_sim * 0.5) * 5.0)
	if mode == "server":
		_server_step(delta)
	elif not job.arg("self_tick", true):
		for b in bodies:
			b.tick(delta)


func _server_step(delta: float) -> void:
	var goal := player.global_position
	for i in n:
		s_repath[i] -= delta
		var p := s_pos[i]
		var path: PackedVector3Array = s_paths[i]
		if s_repath[i] <= 0.0:
			s_query.start_position = p
			s_query.target_position = goal
			NavigationServer3D.query_path(s_query, s_result)
			path = s_result.get_path()
			s_paths[i] = path
			s_idx[i] = 1 if path.size() > 1 else 0
			s_repath[i] = repath_interval
			path_queries += 1
		var desired := Vector3.ZERO
		if Vector2(goal.x - p.x, goal.z - p.z).length() > 1.5 and path.size() > 0:
			var k := s_idx[i]
			while k < path.size() - 1 and Vector2(path[k].x - p.x, path[k].z - p.z).length() < 1.0:
				k += 1
			s_idx[i] = k
			var d := path[mini(k, path.size() - 1)] - p
			d.y = 0.0
			if d.length_squared() > 0.0001:
				desired = d.normalized() * speed
		s_desired[i] = desired
		var v := s_safe[i] if avoidance else desired
		p += v * delta
		s_pos[i] = p
		if avoidance:
			NavigationServer3D.agent_set_position(s_rids[i], p)
			NavigationServer3D.agent_set_velocity(s_rids[i], desired)
		s_mm.set_instance_transform(i, Transform3D(Basis(), p + Vector3(0, 0.9, 0)))


func _positions() -> PackedVector3Array:
	if mode == "server":
		return s_pos.duplicate()
	var out := PackedVector3Array()
	for b in bodies:
		out.append((b as Node3D).global_position)
	return out


func _crowd_metrics(start: PackedVector3Array, mid: PackedVector3Array, fin: PackedVector3Array) -> Dictionary:
	var min_d := INF
	var overlaps := 0
	var limit := 2.0 * radius * 0.8
	for i in fin.size():
		for k in range(i + 1, fin.size()):
			var d := Vector2(fin[i].x - fin[k].x, fin[i].z - fin[k].z).length()
			min_d = minf(min_d, d)
			if d < limit:
				overlaps += 1
	var goal := player.global_position
	var near := 0
	var stuck := 0
	var travelled := 0.0
	for i in fin.size():
		var dg := Vector2(fin[i].x - goal.x, fin[i].z - goal.z).length()
		if dg < 8.0:
			near += 1
		elif mid.size() == fin.size() and mid[i].distance_to(fin[i]) < 0.3:
			stuck += 1
		travelled += start[i].distance_to(fin[i])
	var below_floor := 0
	for p in fin:
		if p.y < -0.5:
			below_floor += 1
	return {"min_pair_distance_m": min_d, "overlapping_pairs": overlaps, "overlap_limit_m": limit,
			"within_8m_of_player": near, "stuck_far": stuck, "mean_displacement_m": travelled / maxf(1.0, fin.size()),
			"fell_through_floor": below_floor}


func _stats(a: Array) -> Dictionary:
	if a.is_empty():
		return {}
	var s := a.duplicate()
	s.sort()
	var sum := 0.0
	for x in s:
		sum += x
	return {"mean": sum / s.size(), "p50": s[int(0.5 * (s.size() - 1))], "p95": s[int(0.95 * (s.size() - 1))],
			"p99": s[int(0.99 * (s.size() - 1))], "max": s[s.size() - 1]}


func _cleanup() -> void:
	for rid in s_rids:
		NavigationServer3D.free_rid(rid)
	s_rids.clear()
	if level:
		level.queue_free()
