extends Node3D
## scenario-godot-vfx 0.1: root of a one-shot effect (impact, explosion). Restarts its emitters, flashes its light,
## then frees itself (or emits `done` for a pool) once every one-shot emitter has sent `finished`
## and the sub-emitter children have had one lifetime to die.
##
## Spawn-and-forget: instantiate, add to the world, set global_transform. No spawning script needed
## (Bonkahe BUa-mKHEPUM 00:22:56 does the same with an autoplaying AnimationPlayer).

signal done

@export var autoplay := true
@export var free_when_done := true
@export var light_path: NodePath = ^"FlashLight"
@export var light_energy := 6.0
@export var light_time := 0.25
## Upper bound on the effect's life, in case an emitter never sends `finished` (0 = computed).
@export var safety_seconds := 0.0

var _pending := 0
var _playing := false


func _ready() -> void:
	if autoplay:
		play()


func play() -> void:
	_playing = true
	_pending = 0
	var tail := 0.0
	var longest := 0.0
	for e in _emitters(self):
		var life: float = e.lifetime / maxf(e.speed_scale, 0.001)
		longest = maxf(longest, life)
		if e.one_shot:
			_pending += 1
			if not e.finished.is_connected(_on_finished):
				e.finished.connect(_on_finished, CONNECT_ONE_SHOT)
			e.restart()
		else:
			tail = maxf(tail, life)   # sub-emitter targets and loops: allow one lifetime after the bursts
	var light := get_node_or_null(light_path) as Light3D
	if light:
		light.visible = true
		light.light_energy = light_energy
		var tw := create_tween()
		tw.tween_property(light, "light_energy", 0.0, light_time).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_EXPO)
		tw.tween_callback(light.hide)
	var cap := safety_seconds if safety_seconds > 0.0 else (longest + tail) * 2.0 + 1.0
	_safety(cap)
	if _pending == 0:
		_finish_after(tail)
	set_meta("fx_tail", tail)


func _on_finished() -> void:
	_pending -= 1
	if _pending == 0 and _playing:
		_finish_after(float(get_meta("fx_tail", 0.0)))


func _finish_after(seconds: float) -> void:
	if seconds > 0.0:
		await get_tree().create_timer(seconds, false).timeout
	_end()


func _safety(seconds: float) -> void:
	await get_tree().create_timer(seconds, false).timeout
	if _playing:
		push_warning("fx_burst %s: safety timeout (%.1f s), an emitter never finished" % [name, seconds])
		_end()


func _end() -> void:
	if not _playing:
		return
	_playing = false
	done.emit()
	if free_when_done:
		queue_free()


static func _emitters(root: Node) -> Array:
	var out: Array = []
	var stack: Array = [root]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		if x is GPUParticles3D or x is CPUParticles3D:
			out.append(x)
		for c in x.get_children():
			stack.append(c)
	return out
