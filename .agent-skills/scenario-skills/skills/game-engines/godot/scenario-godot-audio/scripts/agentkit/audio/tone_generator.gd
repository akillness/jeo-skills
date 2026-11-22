extends AudioStreamPlayer
## scenario-godot-audio ToneGenerator (Godot 4.7.2): procedural audio through AudioStreamGenerator.
## Pushes a sine (optionally with vibrato) every frame. GDScript fills are slow: keep the generator
## mix rate low (the class doc says 11025 or 22050 Hz from GDScript) and the buffer long enough to
## cover a frame hitch. The generator does not resample: mix_rate is the rate of what you push.
## Read get_skips() on the playback: a growing count means the buffer ran dry (audible gaps).

@export var frequency := 440.0
@export var amplitude := 0.25
@export var vibrato_hz := 0.0
@export var vibrato_depth := 0.0     # fraction of frequency
@export var rate := 22050.0
@export var buffer_s := 0.1

var fill_usec_total := 0
var fill_calls := 0
var frames_pushed := 0
var _phase := 0.0
var _t := 0.0
var _pb: AudioStreamGeneratorPlayback


func _ready() -> void:
	var g := AudioStreamGenerator.new()
	g.mix_rate_mode = AudioStreamGenerator.MIX_RATE_CUSTOM
	g.mix_rate = rate
	g.buffer_length = buffer_s
	stream = g
	play()
	_pb = get_stream_playback()       # exists only after play()
	_fill()


func _process(_delta: float) -> void:
	_fill()


func _fill() -> void:
	if _pb == null:
		return
	var t0 := Time.get_ticks_usec()
	var n := _pb.get_frames_available()
	if n <= 0:
		return
	var buf := PackedVector2Array()
	buf.resize(n)
	var inc := 1.0 / rate
	for i in n:
		var f := frequency * (1.0 + vibrato_depth * sin(TAU * vibrato_hz * _t))
		_phase = fmod(_phase + f * inc, 1.0)
		var v := amplitude * sin(TAU * _phase)
		buf[i] = Vector2(v, v)
		_t += inc
	_pb.push_buffer(buf)              # one call per fill, cheaper than push_frame per sample [added]
	frames_pushed += n
	fill_usec_total += Time.get_ticks_usec() - t0
	fill_calls += 1


func skips() -> int:
	return _pb.get_skips() if _pb else -1
