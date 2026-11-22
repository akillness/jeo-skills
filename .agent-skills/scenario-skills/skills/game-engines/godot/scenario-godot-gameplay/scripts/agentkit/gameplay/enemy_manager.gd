extends Node
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): one manager ticks many enemy brains on a budget.
##
## Each enemy thinks `think_hz` times a second (default 5), staggered, and at most
## `max_thinks_per_tick` brains run per physics tick, so sight rays stay bounded however many
## enemies are alive [added; the pattern is the baseline's, the numbers are measured in G3b].
## Thinking = perception (perception.gd) + brain.gd decide(). Movement stays on the bodies.
##
##   var m = preload("res://addons/agentkit/gameplay/enemy_manager.gd").new()
##   add_child(m); m.target = player; for e in enemies: m.register(e)
##   m.state_of(e) -> Brain.S value

const Brain = preload("res://addons/agentkit/gameplay/brain.gd")
const Perception = preload("res://addons/agentkit/gameplay/perception.gd")

signal state_changed(body: Node3D, from_state: int, to_state: int)

@export var think_hz := 5.0
@export var max_thinks_per_tick := 40
@export var sight_mask := 1 | 2
@export var search_seconds := 3.0

var target: CollisionObject3D
var entries: Array = []
var thinks_last_tick := 0
var thinks_total := 0
var rays_total := 0
var _cursor := 0
var _clock := 0.0
var _index: Dictionary = {}


func register(body: Node3D) -> void:
	var e := {"body": body, "state": Brain.S.PATROL, "aware": false, "lost_s": 0.0, "search_left": 0.0,
			"next_think": randf() / think_hz, "dist": INF, "sees": false}
	_index[body.get_instance_id()] = entries.size()
	entries.append(e)


func state_of(body: Node3D) -> int:
	var i: int = _index.get(body.get_instance_id(), -1)
	return entries[i]["state"] if i >= 0 else -1


func counts() -> Dictionary:
	var c := {}
	for e in entries:
		var k := Brain.name_of(e["state"])
		c[k] = int(c.get(k, 0)) + 1
	return c


func _physics_process(delta: float) -> void:
	_clock += delta
	var n := entries.size()
	if n == 0 or target == null:
		return
	for e in entries:
		if not e["sees"]:
			e["lost_s"] += delta
		if e["state"] == Brain.S.SEARCH:
			e["search_left"] -= delta
	var space := get_viewport().world_3d.direct_space_state
	var aim := target.global_position + Vector3(0, 1.0, 0)
	var budget := max_thinks_per_tick
	var visited := 0
	var done := 0
	var i := _cursor
	while done < budget and visited < n:
		var e: Dictionary = entries[i]
		if _clock >= float(e["next_think"]):
			_think(e, space, aim)
			e["next_think"] = _clock + 1.0 / think_hz
			done += 1
		i = (i + 1) % n
		visited += 1
	_cursor = i
	thinks_last_tick = done
	thinks_total += done


func _think(e: Dictionary, space: PhysicsDirectSpaceState3D, aim: Vector3) -> void:
	var body: Node3D = e["body"]
	var ex: Array[RID] = []
	if body is CollisionObject3D:
		ex.append((body as CollisionObject3D).get_rid())
	var before := Perception.rays_cast
	var p := Perception.sees(space, body.global_position + Vector3(0, 1.6, 0), -body.global_basis.z, aim,
			e["aware"], sight_mask, ex, target.get_rid(), Brain.DETECT_RANGE, Brain.LOSE_RANGE, Brain.FOV_DEG)
	rays_total += Perception.rays_cast - before
	e["sees"] = p["sees"]
	e["dist"] = p["dist"]
	if p["sees"]:
		e["aware"] = true
		e["lost_s"] = 0.0
	var old: int = e["state"]
	var nxt := Brain.decide(old, {"sees": p["sees"], "dist": p["dist"], "lost_s": e["lost_s"],
			"search_left": e["search_left"], "health": 1.0})
	if nxt != old:
		if nxt == Brain.S.SEARCH:
			e["search_left"] = search_seconds
		if nxt == Brain.S.PATROL:
			e["aware"] = false
		e["state"] = nxt
		state_changed.emit(body, old, nxt)
