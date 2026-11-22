extends RefCounted
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): seeded grid dungeon. A main path from START to BOSS (each step
## picks among 3 directions: never straight back), side branches that end in LOOT, then validators.
## Pure data: build geometry from `cells` afterwards (see build_level). Same seed, same hash.
##
##   const Gen = preload("res://addons/agentkit/gameplay/dungeon_gen.gd")
##   var d := Gen.generate(1234, {"main_length": 14, "branches": 4})
##   assert(Gen.validate(d).ok)

enum Cell { EMPTY, ROOM, START, BOSS, LOOT }
const DIRS := [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1)]


static func generate(seed_value: int, opts := {}) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var main_len: int = opts.get("main_length", 14)
	var n_branches: int = opts.get("branches", 4)
	var attempts := 0
	while attempts < 50:
		attempts += 1
		var cells := {}
		var main: Array[Vector2i] = [Vector2i.ZERO]
		cells[Vector2i.ZERO] = Cell.START
		var heading := Vector2i(1, 0)
		var dead := false
		while main.size() < main_len and not dead:
			var opts_dir: Array = [heading, Vector2i(-heading.y, heading.x), Vector2i(heading.y, -heading.x)]
			# The new cell may touch only its predecessor: a path that folds back beside itself makes a
			# shortcut and the boss ends 3 rooms from the start (24% of seeds before this rule).
			var free: Array = opts_dir.filter(func(d): return not cells.has(main[-1] + d) and _free_around(cells, main[-1] + d, main[-1]))
			if free.is_empty():
				dead = true
				break
			# Weight forward twice: corridors read as progress, not a spiral.
			var pick: Vector2i = free[0] if free[0] == heading and rng.randf() < 0.5 else free[rng.randi_range(0, free.size() - 1)]
			heading = pick
			var c: Vector2i = main[-1] + pick
			cells[c] = Cell.ROOM
			main.append(c)
		if dead:
			continue
		cells[main[-1]] = Cell.BOSS
		var branches: Array = []
		var tries := 0
		while branches.size() < n_branches and tries < 100:
			tries += 1
			var root_cell: Vector2i = main[rng.randi_range(1, main.size() - 3)]
			var length := rng.randi_range(2, 4)
			var b: Array[Vector2i] = []
			var cur := root_cell
			for i in length:
				# Check against the branch's own earlier cells too, or it curls and the loot room gets two doors.
				var free: Array = DIRS.filter(func(d): return not cells.has(cur + d) and not b.has(cur + d) \
						and _free_around(cells, cur + d, cur, b))
				if free.is_empty():
					break
				cur = cur + free[rng.randi_range(0, free.size() - 1)]
				b.append(cur)
			if b.size() < 2:
				continue
			for c in b:
				cells[c] = Cell.ROOM
			cells[b[-1]] = Cell.LOOT
			branches.append({"from": root_cell, "cells": b})
		return {"seed": seed_value, "cells": cells, "main": main, "branches": branches, "attempts": attempts}
	return {"seed": seed_value, "cells": {}, "main": [], "branches": [], "attempts": attempts, "error": "no layout in 50 attempts"}


## A branch cell may touch only its own predecessor, so branches never merge into the main path sideways.
static func _free_around(cells: Dictionary, c: Vector2i, came_from: Vector2i, extra: Array = []) -> bool:
	for d in DIRS:
		var n: Vector2i = c + d
		if n != came_from and (cells.has(n) or extra.has(n)):
			return false
	return true


static func neighbours(cells: Dictionary, c: Vector2i) -> Array:
	return DIRS.map(func(d): return c + d).filter(func(n): return cells.has(n))


static func validate(d: Dictionary, opts := {}) -> Dictionary:
	var cells: Dictionary = d["cells"]
	var problems: Array = []
	var starts := cells.values().count(Cell.START)
	var bosses := cells.values().count(Cell.BOSS)
	if starts != 1 or bosses != 1:
		problems.append("start %d boss %d" % [starts, bosses])
	# BFS from start: every cell reachable, boss distance equals the main path length
	var dist := {Vector2i.ZERO: 0}
	var q: Array = [Vector2i.ZERO]
	while not q.is_empty():
		var c: Vector2i = q.pop_front()
		for n in neighbours(cells, c):
			if not dist.has(n):
				dist[n] = dist[c] + 1
				q.append(n)
	if dist.size() != cells.size():
		problems.append("unreachable cells %d" % (cells.size() - dist.size()))
	var boss_cell: Vector2i = d["main"][-1] if d["main"].size() > 0 else Vector2i.ZERO
	var min_boss: int = opts.get("min_boss_distance", 8)
	if dist.get(boss_cell, 0) < min_boss:
		problems.append("boss too close: %d" % dist.get(boss_cell, 0))
	for b in d["branches"]:
		var end: Vector2i = b["cells"][-1]
		if cells.get(end) != Cell.LOOT:
			problems.append("branch without loot")
		if neighbours(cells, end).size() != 1:
			problems.append("loot not at a dead end")
	return {"ok": problems.is_empty(), "problems": problems, "boss_distance": dist.get(boss_cell, -1),
			"rooms": cells.size(), "loot": cells.values().count(Cell.LOOT)}


static func layout_hash(d: Dictionary) -> int:
	var keys: Array = d["cells"].keys()
	keys.sort()
	var s := ""
	for k in keys:
		s += "%d,%d:%d;" % [k.x, k.y, d["cells"][k]]
	return hash(s)


## Floors (and doorway-free walls between non-adjacent rooms are skipped: rooms are open squares joined
## by their shared edge). Floors go in group `group` so a NavigationMesh in group mode bakes them.
static func build_level(parent: Node3D, d: Dictionary, room := 6.0, group := &"nav_source") -> Dictionary:
	var colors := {Cell.ROOM: Color(0.55, 0.55, 0.6), Cell.START: Color(0.2, 0.8, 0.3), Cell.BOSS: Color(0.9, 0.2, 0.2), Cell.LOOT: Color(1.0, 0.8, 0.1)}
	var mats := {}
	for k in colors:
		var m := StandardMaterial3D.new()
		m.albedo_color = colors[k]
		mats[k] = m
	var box := BoxShape3D.new()
	box.size = Vector3(room, 0.4, room)
	var mesh := BoxMesh.new()
	mesh.size = Vector3(room - 0.3, 0.4, room - 0.3)
	for c in d["cells"]:
		var body := StaticBody3D.new()
		body.add_to_group(group)
		var cs := CollisionShape3D.new()
		cs.shape = box
		body.add_child(cs)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = mats[d["cells"][c]]
		body.add_child(mi)
		parent.add_child(body)
		body.position = Vector3(c.x * room, -0.2, c.y * room)
	return {"start": Vector3.ZERO, "boss": Vector3(d["main"][-1].x * room, 0, d["main"][-1].y * room)}
