extends Node3D
## Grid cell streamer (scenario-godot-3d-world 0.1, Godot 4.7.2): loads the scenes of the cells around a target with
## ResourceLoader.load_threaded_request and frees them past a larger radius (hysteresis: a target pacing
## on a cell border does not load and free the same cell every frame).
## Cells are scenes at cell_path % [x, z] (x, z = floor(position / cell_size)); missing files are skipped.

@export var target: Node3D
@export var cell_size := 64.0
@export var cell_path := "res://world/cells/cell_%d_%d.tscn"
@export var load_radius := 1  # cells (Chebyshev distance) kept loaded around the target cell
@export var unload_radius := 2  # must be > load_radius
@export var max_instantiate_per_frame := 1  # spreads instantiate() hitches over frames

var loaded := {}  # Vector2i -> Node
var pending := {}  # Vector2i -> path
## Telemetry for tests: totals since ready.
var requests := 0
var loads := 0
var unloads := 0
var _ready_queue: Array = []


func cell_of(p: Vector3) -> Vector2i:
	return Vector2i(floori(p.x / cell_size), floori(p.z / cell_size))


func _process(_delta: float) -> void:
	if target == null:
		return
	var c := cell_of(target.global_position)
	for dz in range(-load_radius, load_radius + 1):
		for dx in range(-load_radius, load_radius + 1):
			var k := c + Vector2i(dx, dz)
			if loaded.has(k) or pending.has(k):
				continue
			var path := cell_path % [k.x, k.y]
			if not ResourceLoader.exists(path):
				continue
			if ResourceLoader.load_threaded_request(path) == OK:
				pending[k] = path
				requests += 1
	for k in pending.keys():
		var st := ResourceLoader.load_threaded_get_status(pending[k])
		if st == ResourceLoader.THREAD_LOAD_LOADED:
			_ready_queue.append(k)
		elif st == ResourceLoader.THREAD_LOAD_FAILED or st == ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
			push_warning("cell_streamer: failed to load " + str(pending[k]))
			pending.erase(k)
	var n := 0
	while not _ready_queue.is_empty() and n < max_instantiate_per_frame:
		var k: Vector2i = _ready_queue.pop_front()
		if not pending.has(k):
			continue
		var ps: PackedScene = ResourceLoader.load_threaded_get(pending[k])
		pending.erase(k)
		var far := maxi(absi(k.x - c.x), absi(k.y - c.y)) > unload_radius
		if far:
			continue  # target moved on while it loaded: drop it
		var inst := ps.instantiate()
		add_child(inst)
		loaded[k] = inst
		loads += 1
		n += 1
	for k in loaded.keys():
		if maxi(absi(k.x - c.x), absi(k.y - c.y)) > unload_radius:
			loaded[k].queue_free()
			loaded.erase(k)
			unloads += 1
