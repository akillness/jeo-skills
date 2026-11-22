extends Node
## scenario-godot-audio Occluder3D (Godot 4.7.2): continuous occlusion for a LONG emitter (engine, machine,
## music source). After Blekoh (mHokBQyB_08): the source gets its own bus with a low-pass, the
## target cutoff and volume follow a ray test, and the values are lerped every frame because hard
## jumps "sound harsh". One ray every `interval_s`, not per frame. Each instance owns a bus: keep
## these to a handful of long emitters (one-shots use SfxPool occlusion instead) [added].
## Add as a child of an AudioStreamPlayer3D.

@export var interval_s := 0.1
@export_flags_3d_physics var mask := 1
@export var open_hz := 20000.0
@export var occluded_hz := 800.0
@export var occluded_db := -6.0
@export var smoothing := 8.0        # 1/s; about 0.5 s to settle at 8 (measured, P8)
@export var send_bus := &"SFX"

var occluded := false
var cutoff_hz := 20000.0
var offset_db := 0.0
var bus_name := &""
var _lp: AudioEffectLowPassFilter
var _timer := 0.0
var _base_db := 0.0


func _ready() -> void:
	var src := get_parent() as AudioStreamPlayer3D
	bus_name = StringName("Occ_%d" % src.get_instance_id())
	var idx := AudioServer.bus_count
	AudioServer.add_bus(idx)
	AudioServer.set_bus_name(idx, bus_name)
	AudioServer.set_bus_send(idx, send_bus)
	_lp = AudioEffectLowPassFilter.new()
	_lp.cutoff_hz = open_hz
	AudioServer.add_bus_effect(idx, _lp)
	_base_db = src.volume_db
	src.bus = bus_name


func _exit_tree() -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx > 0:
		AudioServer.remove_bus(idx)


func _physics_process(delta: float) -> void:
	var src := get_parent() as AudioStreamPlayer3D
	_timer -= delta
	if _timer <= 0.0:
		_timer = interval_s
		var vp := src.get_viewport()
		var lis: Node3D = vp.get_audio_listener_3d() if vp.get_audio_listener_3d() else vp.get_camera_3d()
		if lis:
			var q := PhysicsRayQueryParameters3D.create(lis.global_position, src.global_position, mask)
			var hit := src.get_world_3d().direct_space_state.intersect_ray(q)
			occluded = not hit.is_empty() and (hit["position"] as Vector3).distance_to(src.global_position) > 0.3
	var k := 1.0 - exp(-smoothing * delta)
	# lerp the cutoff in log space so the sweep is even to the ear [added]
	cutoff_hz = exp(lerpf(log(cutoff_hz), log(occluded_hz if occluded else open_hz), k))
	offset_db = lerpf(offset_db, occluded_db if occluded else 0.0, k)
	_lp.cutoff_hz = cutoff_hz
	src.volume_db = _base_db + offset_db
