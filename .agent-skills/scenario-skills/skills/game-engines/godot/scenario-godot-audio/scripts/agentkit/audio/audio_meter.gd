extends RefCounted
## scenario-godot-audio AudioMeter (Godot 4.7.2): render and measure audio without ears.
##
## Three channels, all verified 2026-10-02:
## 1. offline: render_stream() pulls frames from AudioStreamPlayback.mix_audio() (no AudioServer,
##    no buses, deterministic): stream logic such as AudioStreamInteractive transitions,
##    AudioStreamRandomizer picks, loop seams.
## 2. real time, headless: the Dummy driver still mixes on its own thread, so bus peak meters,
##    AudioEffectCapture and AudioEffectRecord work under --headless (record_bus, peak_trace).
## 3. movie: a windowed --write-movie run writes frame-locked audio (see gd_audio.movie_audio).
## Write WAV files with write_wav() and analyse them offline with gd_audio.analyze().

const DB_FLOOR := -200.0


## Render `seconds` of a stream offline at AudioServer.get_mix_rate() (44100 headless). `events`
## is an Array of [time_s, Callable] pairs; each Callable receives the AudioStreamPlayback (for
## example switch_to_clip_by_name). `pitch` is the rate_scale (1.0 = as authored). Returns frames.
static func render_stream(stream: AudioStream, seconds: float, events: Array = [],
		chunk: int = 512, from_pos: float = 0.0, pitch: float = 1.0) -> PackedVector2Array:
	var pb := stream.instantiate_playback()
	var out := PackedVector2Array()
	if pb == null:
		push_error("render_stream: stream has no playback")
		return out
	pb.start(from_pos)
	var mix_rate := AudioServer.get_mix_rate()
	var total := int(seconds * mix_rate)
	var done := 0
	var pending := events.duplicate()
	pending.sort_custom(func(a, b): return a[0] < b[0])
	while done < total:
		while not pending.is_empty() and float(done) / mix_rate >= float(pending[0][0]):
			var ev = pending.pop_front()
			(ev[1] as Callable).call(pb)
		var n := mini(chunk, total - done)
		var block := pb.mix_audio(pitch, n)
		if block.size() < n:
			block.resize(n)   # a stopped playback returns fewer frames: pad with silence
		out.append_array(block)
		done += n
	pb.stop()
	return out


## Write stereo float frames to a 16-bit PCM WAV (absolute or res:// path). Returns an Error.
static func write_wav(frames: PackedVector2Array, path: String, mix_rate: int = 44100) -> int:
	var data := PackedByteArray()
	data.resize(frames.size() * 4)
	var o := 0
	for f in frames:
		data.encode_s16(o, int(clampf(f.x, -1.0, 1.0) * 32767.0))
		data.encode_s16(o + 2, int(clampf(f.y, -1.0, 1.0) * 32767.0))
		o += 4
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.stereo = true
	w.mix_rate = mix_rate
	w.data = data
	return w.save_to_wav(path)


static func peak_db(frames: PackedVector2Array) -> float:
	var m := 0.0
	for f in frames:
		m = maxf(m, maxf(absf(f.x), absf(f.y)))
	return linear_to_db(m) if m > 0.0 else DB_FLOOR


static func rms_db(frames: PackedVector2Array) -> float:
	if frames.is_empty():
		return DB_FLOOR
	var s := 0.0
	for f in frames:
		s += (f.x * f.x + f.y * f.y) * 0.5
	var r := sqrt(s / frames.size())
	return linear_to_db(r) if r > 0.0 else DB_FLOOR


## Per-channel RMS in dB: [left, right]. Use it to check panning.
static func channel_rms_db(frames: PackedVector2Array) -> Array:
	var l := 0.0
	var r := 0.0
	for f in frames:
		l += f.x * f.x
		r += f.y * f.y
	var n := maxf(1.0, frames.size())
	return [linear_to_db(sqrt(l / n)) if l > 0.0 else DB_FLOOR, linear_to_db(sqrt(r / n)) if r > 0.0 else DB_FLOOR]


## Goertzel power (dB, relative) of one frequency in a mono mix of the frames.
static func tone_db(frames: PackedVector2Array, freq: float, mix_rate: float = 44100.0) -> float:
	var n := frames.size()
	if n == 0:
		return DB_FLOOR
	var k := 2.0 * cos(TAU * freq / mix_rate)
	var s1 := 0.0
	var s2 := 0.0
	for f in frames:
		var s0 := (f.x + f.y) * 0.5 + k * s1 - s2
		s2 = s1
		s1 = s0
	var p := s1 * s1 + s2 * s2 - k * s1 * s2
	var amp := 2.0 * sqrt(maxf(p, 0.0)) / n
	return linear_to_db(amp) if amp > 0.0 else DB_FLOOR


## Add a bus (or reuse one) holding an AudioEffectRecord, routed to `send`. Returns its index.
static func ensure_record_bus(name: String = "AgentRecord", send: String = "Master") -> int:
	var idx := AudioServer.get_bus_index(name)
	if idx == -1:
		idx = AudioServer.bus_count
		AudioServer.add_bus(idx)
		AudioServer.set_bus_name(idx, name)
		AudioServer.set_bus_send(idx, send)
	for i in AudioServer.get_bus_effect_count(idx):
		if AudioServer.get_bus_effect(idx, i) is AudioEffectRecord:
			return idx
	AudioServer.add_bus_effect(idx, AudioEffectRecord.new())
	return idx


static func _record_effect(bus_idx: int) -> AudioEffectRecord:
	for i in AudioServer.get_bus_effect_count(bus_idx):
		var e := AudioServer.get_bus_effect(bus_idx, i)
		if e is AudioEffectRecord:
			return e
	return null


## Record what passes through a bus (Master included) for `seconds` in real time, save a WAV.
## Works headless (Dummy driver mixes in real time). Returns {path, seconds, err}.
static func record_bus(job, bus_name: String, seconds: float, rel_path: String) -> Dictionary:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx == -1:
		return {"err": ERR_DOES_NOT_EXIST, "error": "no bus " + bus_name}
	var rec := _record_effect(idx)
	if rec == null:
		rec = AudioEffectRecord.new()
		AudioServer.add_bus_effect(idx, rec)
	rec.set_recording_active(true)
	await job.wait_seconds(seconds)
	rec.set_recording_active(false)
	var wav := rec.get_recording()
	if wav == null:
		return {"err": ERR_CANT_CREATE, "error": "empty recording"}
	var path: String = job.out_path(rel_path)
	return {"path": path, "seconds": wav.get_length(), "err": wav.save_to_wav(path)}


## Sample a bus peak meter (max of L/R, dB) every `every` seconds for `seconds`. Returns the list.
static func peak_trace(job, bus_name: String, seconds: float, every: float = 0.05) -> Array:
	var idx := AudioServer.get_bus_index(bus_name)
	var out := []
	var t := 0.0
	while t < seconds:
		await job.wait_seconds(every)
		t += every
		var l := AudioServer.get_bus_peak_volume_left_db(idx, 0)
		var r := AudioServer.get_bus_peak_volume_right_db(idx, 0)
		out.append(snappedf(maxf(l, r), 0.01))
	return out


## Fundamental (Hz) from positive-going zero crossings of the mono mix between t0 and t1 seconds.
static func zero_cross_hz(frames: PackedVector2Array, t0: float, t1: float) -> float:
	var rate := AudioServer.get_mix_rate()
	var a := int(t0 * rate)
	var b := mini(int(t1 * rate), frames.size())
	var first := -1
	var last := -1
	var count := 0
	var prev := 0.0
	for i in range(a, b):
		var v := (frames[i].x + frames[i].y) * 0.5
		if i > a and prev < 0.0 and v >= 0.0:
			if first < 0:
				first = i
			last = i
			count += 1
		prev = v
	if count < 3:
		return 0.0
	return (count - 1) * rate / float(last - first)


## Loop seam check for a looping stream: render 0.3 s before to 0.3 s after the wrap and align the
## part after the wrap with a render of the file's start. Gapless: best_lag_samples 0 and
## resid_db_best far below 0. Encoder padding shows as a nonzero lag (ffmpeg's native Vorbis: -32).
static func loop_seam(stream: AudioStream, n: int = 4096) -> Dictionary:
	var L := stream.get_length()
	var rate := AudioServer.get_mix_rate()
	var across := render_stream(stream, 0.6, [], 256, L - 0.3)
	var head := render_stream(stream, 0.3, [], 256, 0.0)
	var after := across.slice(int(0.3 * rate))
	var best_lag := 0
	var best := 1e9
	for lag in range(-2048, 2049, 4):
		var r := _resid_db(after, head, lag, n)
		if r < best:
			best = r
			best_lag = lag
	for lag in range(best_lag - 4, best_lag + 5):
		var r := _resid_db(after, head, lag, n)
		if r < best:
			best = r
			best_lag = lag
	return {"loop": stream.get("loop"), "length_s": snappedf(L, 0.0001), "after_wrap_rms_db": snappedf(rms_db(after), 0.01),
		"head_rms_db": snappedf(rms_db(head), 0.01), "resid_db_lag0": snappedf(_resid_db(after, head, 0, n), 0.1),
		"best_lag_samples": best_lag, "resid_db_best": snappedf(best, 0.1), "frames": across}


static func _resid_db(a: PackedVector2Array, b: PackedVector2Array, lag: int, n: int) -> float:
	var e := 0.0
	var s := 0.0
	for i in mini(n, b.size()):
		var j := i + lag
		if j < 0 or j >= a.size():
			continue
		var d := a[j].x - b[i].x
		e += d * d
		s += b[i].x * b[i].x
	return 10.0 * log(maxf(e, 1e-20) / maxf(s, 1e-20)) / log(10.0)
