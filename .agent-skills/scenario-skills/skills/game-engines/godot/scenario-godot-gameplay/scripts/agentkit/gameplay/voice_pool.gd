extends Node3D
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): fixed pool of AudioStreamPlayer3D for gameplay one-shots
## (hits, footsteps, shots). Gameplay side only: the mix, buses and attenuation belong to scenario-godot-audio.
## play() reuses a free voice, else steals the oldest voice of equal or lower priority, else drops.
## A per-sound cooldown stops 200 enemies hitting the same frame from firing 200 identical sounds.

@export var voices := 16
@export var bus := &"SFX"
@export var min_interval_s := 0.03

var _players: Array[AudioStreamPlayer3D] = []
var _started: PackedFloat64Array = []
var _priority: PackedInt32Array = []
var _last_by_stream := {}
var played := 0
var stolen := 0
var dropped := 0
var throttled := 0


func _ready() -> void:
	for i in voices:
		var p := AudioStreamPlayer3D.new()
		p.bus = bus if AudioServer.get_bus_index(bus) >= 0 else &"Master"
		add_child(p)
		_players.append(p)
		_started.append(-1.0)
		_priority.append(0)


func _now() -> float:
	return Time.get_ticks_usec() / 1e6


func play(stream: AudioStream, at: Vector3, priority := 0, pitch_jitter := 0.05) -> AudioStreamPlayer3D:
	var now := _now()
	if now - float(_last_by_stream.get(stream, -1e9)) < min_interval_s:
		throttled += 1
		return null
	var pick := -1
	for i in _players.size():
		if not _players[i].playing:
			pick = i
			break
	if pick < 0:
		var oldest := INF
		for i in _players.size():
			if _priority[i] <= priority and _started[i] < oldest:
				oldest = _started[i]
				pick = i
		if pick < 0:
			dropped += 1
			return null
		stolen += 1
	var p := _players[pick]
	p.stream = stream
	p.global_position = at
	p.pitch_scale = 1.0 + randf_range(-pitch_jitter, pitch_jitter)
	p.play()
	_started[pick] = now
	_priority[pick] = priority
	_last_by_stream[stream] = now
	played += 1
	return p


func busy() -> int:
	return _players.filter(func(p): return p.playing).size()
