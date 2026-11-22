extends RefCounted
## scenario-godot-architecture AgentKit: typed vs untyped GDScript on this machine and this Godot.
##
##   gd_run.run_script(P, "res://addons/agentkit/architecture/bench.gd:typing", args={"n": 2000, "reps": 5})
##
## Re-measures Boon Makes Games' 4.1-era result (mNa0m2fvGOc [00:01:39]): typed bubble sort much
## faster, built-in Array.sort() unchanged by typing because it works on Variants.
## Report the median of `reps`; numbers are machine- and version-specific.


func typing(job) -> Dictionary:
	var n: int = job.arg("n", 2000)
	var reps: int = job.arg("reps", 5)
	var sort_n: int = job.arg("sort_n", 200000)
	var rng := RandomNumberGenerator.new()
	rng.seed = 42
	var src: Array[int] = []
	for i in n:
		src.append(rng.randi_range(0, 1_000_000))
	var t_untyped: Array[float] = []
	var t_typed: Array[float] = []
	for r in reps:
		var a: Array = src.duplicate()
		var t0 := Time.get_ticks_usec()
		_bubble_untyped(a)
		t_untyped.append((Time.get_ticks_usec() - t0) / 1000.0)
		var b: Array[int] = src.duplicate()
		t0 = Time.get_ticks_usec()
		_bubble_typed(b)
		t_typed.append((Time.get_ticks_usec() - t0) / 1000.0)
	var big_untyped: Array = []
	var big_typed: Array[int] = []
	for i in sort_n:
		var v := rng.randi_range(0, 1_000_000)
		big_untyped.append(v)
		big_typed.append(v)
	var s_untyped: Array[float] = []
	var s_typed: Array[float] = []
	for r in reps:
		var a: Array = big_untyped.duplicate()
		var t0 := Time.get_ticks_usec()
		a.sort()
		s_untyped.append((Time.get_ticks_usec() - t0) / 1000.0)
		var b: Array[int] = big_typed.duplicate()
		t0 = Time.get_ticks_usec()
		b.sort()
		s_typed.append((Time.get_ticks_usec() - t0) / 1000.0)
	var mu := _median(t_untyped)
	var mt := _median(t_typed)
	var su := _median(s_untyped)
	var st := _median(s_typed)
	return {"ok": true, "n": n, "reps": reps, "bubble_untyped_ms": mu, "bubble_typed_ms": mt,
			"bubble_speedup": mu / maxf(mt, 0.001), "sort_n": sort_n, "sort_untyped_ms": su,
			"sort_typed_ms": st, "sort_ratio": su / maxf(st, 0.001),
			"godot": Engine.get_version_info().get("string", ""), "debug_build": OS.is_debug_build()}


func _bubble_untyped(a):
	var size = a.size()
	for i in range(size):
		for j in range(size - i - 1):
			if a[j] > a[j + 1]:
				var tmp = a[j]
				a[j] = a[j + 1]
				a[j + 1] = tmp


func _bubble_typed(a: Array[int]) -> void:
	var size: int = a.size()
	for i: int in range(size):
		for j: int in range(size - i - 1):
			if a[j] > a[j + 1]:
				var tmp: int = a[j]
				a[j] = a[j + 1]
				a[j + 1] = tmp


static func _median(v: Array[float]) -> float:
	var s := v.duplicate()
	s.sort()
	return s[s.size() / 2]
