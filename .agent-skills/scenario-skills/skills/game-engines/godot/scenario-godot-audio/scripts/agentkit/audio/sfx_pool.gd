extends Node3D
## scenario-godot-audio SfxPool (Godot 4.7.2): positional SFX voices for crowded combat (200 enemies).
##
## "A lot of audio technology is about not playing sounds" (Guy Somberg, GDC 2014). One pool of
## preallocated AudioStreamPlayer3D voices (Michael Games: a ring of 16 or 32 players instead of a
## node per shot), per-type caps (Aarimous), a max-radius rule (Somberg: keep about two of one
## sound inside a radius), a per-type cooldown, distance culling before a voice is spent, and
## priority stealing. play() always returns an int id, never a node (Somberg).
##
## Use: add as a child (or autoload), call define("rifle", {...}) once per sound type, then
## play("rifle", global_position). Types:
##   stream (AudioStream, required), bus ("SFX"), limit (max live voices of the type, 4),
##   radius_m (8.0) and radius_limit (2): live voices of the type within radius_m of the new one,
##   cooldown_ms (30), priority (0..100, 50), max_distance_m (60.0), unit_size (10.0),
##   volume_db (0.0), area_mask (1: room buses from Area3D apply; 4.7 default is 0),
##   occlusion (false): one ray listener -> source at play time; a blocked one-shot plays on
##   `occluded_bus` (a shared bus with a low-pass) at occluded_db. One ray per started voice, no
##   per-frame cost: right for shots and impacts; long emitters need occluder_3d.gd [added].

signal voice_started(id: int, type: StringName)

@export var voices := 32
@export var default_bus := &"SFX"
@export var occluded_bus := &"SFX_Occluded"
@export_flags_3d_physics var occlusion_mask := 1
@export var occluded_db := -4.0

var types: Dictionary = {}
var stats := {"requested": 0, "played": 0, "culled_distance": 0, "culled_limit": 0, "culled_radius": 0,
	"culled_cooldown": 0, "stolen": 0, "dropped": 0, "unknown_type": 0}

var _players: Array[AudioStreamPlayer3D] = []
var _voice_type: Array[StringName] = []
var _voice_priority: Array[int] = []
var _voice_id: Array[int] = []
var _last_play_ms: Dictionary = {}
var _next_id := 1
# Per-frame cache of live voices by type (positions), so 200 requests in one frame stay cheap.
var _cache_frame := -1
var _live: Dictionary = {}


func _ready() -> void:
	for i in voices:
		var p := AudioStreamPlayer3D.new()
		p.name = "Voice%02d" % i
		p.max_polyphony = 1
		add_child(p)
		_players.append(p)
		_voice_type.append(&"")
		_voice_priority.append(-1)
		_voice_id.append(0)


func define(type: StringName, cfg: Dictionary) -> void:
	var c := {"bus": default_bus, "limit": 4, "radius_m": 8.0, "radius_limit": 2, "cooldown_ms": 30,
		"priority": 50, "max_distance_m": 60.0, "unit_size": 10.0, "volume_db": 0.0, "area_mask": 1,
		"occlusion": false}
	c.merge(cfg, true)
	if c.get("stream") == null:
		push_error("SfxPool.define(%s): no stream" % type)   # fail loudly in development (Aarimous)
	if AudioServer.get_bus_index(c["bus"]) == -1:
		push_error("SfxPool.define(%s): bus %s does not exist (players would fall back to Master)" % [type, c["bus"]])
	types[type] = c


func listener_position() -> Vector3:
	var vp := get_viewport()
	var l := vp.get_audio_listener_3d() if vp else null
	if l:
		return l.global_position
	var cam := vp.get_camera_3d() if vp else null
	return cam.global_position if cam else global_position


func _refresh_cache() -> void:
	var f := Engine.get_process_frames()
	if f == _cache_frame:
		return
	_cache_frame = f
	_live.clear()
	for i in _players.size():
		if _players[i].playing:
			if not _live.has(_voice_type[i]):
				_live[_voice_type[i]] = []
			_live[_voice_type[i]].append(_players[i].global_position)


## True when static geometry on occlusion_mask lies between the listener and the source.
func is_occluded(from: Vector3, to: Vector3) -> bool:
	if occlusion_mask == 0 or not is_inside_tree():
		return false
	var q := PhysicsRayQueryParameters3D.create(from, to, occlusion_mask)
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	return not hit.is_empty() and (hit["position"] as Vector3).distance_to(to) > 0.3


func live_count(type: StringName = &"") -> int:
	var n := 0
	for i in _players.size():
		if _players[i].playing and (type == &"" or _voice_type[i] == type):
			n += 1
	return n


func is_voice_playing(id: int) -> bool:
	var i := _voice_id.find(id)
	return i >= 0 and _players[i].playing


## Request a sound. Returns an id > 0; the id stays valid (is_voice_playing() false) when the request
## was culled, so callers never need a null check.
func play(type: StringName, pos: Vector3, priority: int = -1) -> int:
	stats["requested"] += 1
	var id := _next_id
	_next_id += 1
	if not types.has(type):
		stats["unknown_type"] += 1
		push_error("SfxPool.play: undefined sound type %s" % type)
		return id
	var c: Dictionary = types[type]
	var prio: int = c["priority"] if priority < 0 else priority
	var now := Time.get_ticks_msec()
	if now - int(_last_play_ms.get(type, -100000)) < int(c["cooldown_ms"]):
		stats["culled_cooldown"] += 1
		return id
	var lis := listener_position()
	if float(c["max_distance_m"]) > 0.0 and pos.distance_to(lis) > float(c["max_distance_m"]):
		stats["culled_distance"] += 1
		return id
	_refresh_cache()
	var live_pos: Array = _live.get(type, [])
	var same := live_pos.size()
	var near := 0
	if same < int(c["limit"]):
		for lp in live_pos:
			if (lp as Vector3).distance_to(pos) < float(c["radius_m"]):
				near += 1
	if same >= int(c["limit"]):
		stats["culled_limit"] += 1
		return id
	if near >= int(c["radius_limit"]):
		stats["culled_radius"] += 1
		return id
	var slot := -1
	for i in _players.size():
		if not _players[i].playing:
			slot = i
			break
	if slot == -1:
		# Steal: lowest priority first, then the farthest from the listener, never a higher priority.
		var best := -1
		var best_key := Vector2(INF, -INF)
		for i in _players.size():
			if _voice_priority[i] > prio:
				continue
			var key := Vector2(_voice_priority[i], _players[i].global_position.distance_to(lis))
			if key.x < best_key.x or (key.x == best_key.x and key.y > best_key.y):
				best_key = key
				best = i
		if best == -1:
			stats["dropped"] += 1
			return id
		slot = best
		stats["stolen"] += 1
		if _live.has(_voice_type[slot]):
			_live[_voice_type[slot]].erase(_players[slot].global_position)
	var p := _players[slot]
	p.stop()
	p.stream = c["stream"]
	p.bus = c["bus"]
	p.unit_size = c["unit_size"]
	p.max_distance = c["max_distance_m"]
	p.volume_db = c["volume_db"]
	if c["occlusion"] and is_occluded(lis, pos):
		p.bus = occluded_bus
		p.volume_db += occluded_db
		stats["occluded"] = int(stats.get("occluded", 0)) + 1
	p.area_mask = c["area_mask"]
	p.global_position = pos
	p.play()
	_voice_type[slot] = type
	_voice_priority[slot] = prio
	_voice_id[slot] = id
	_last_play_ms[type] = now
	if not _live.has(type):
		_live[type] = []
	_live[type].append(pos)
	stats["played"] += 1
	voice_started.emit(id, type)
	return id
