extends RefCounted
## scenario-godot-audio AudioBuses (Godot 4.7.2): bus layout as data, saved, audited; volume and mix states.
##
## The Audio bottom panel is a GUI editor. An agent builds the same layout through AudioServer and
## saves AudioServer.generate_bus_layout() to the file named by audio/buses/default_bus_layout
## (default res://default_bus_layout.tres), which every later run loads at startup.
## Spec: Array of {"name", "send" (a bus to the LEFT), "volume_db", "effects": [{"type", props...}]}.
## Master is index 0 and is configured with an entry named "Master".

const COMBAT_LAYOUT := [
	{"name": "Master", "effects": [{"type": "AudioEffectHardLimiter", "ceiling_db": -1.0}]},
	{"name": "Music", "send": "Master"},
	{"name": "SFX", "send": "Master"},
	{"name": "Weapons", "send": "SFX"},
	{"name": "Impacts", "send": "SFX"},
	{"name": "Enemies", "send": "SFX"},
	{"name": "Player", "send": "SFX"},
	{"name": "SFX_Occluded", "send": "SFX", "effects": [{"type": "AudioEffectLowPassFilter", "cutoff_hz": 1000.0}]},
	{"name": "RoomReverb", "send": "SFX", "effects": [{"type": "AudioEffectReverb", "dry": 0.0, "wet": 1.0, "room_size": 0.6}]},
	{"name": "Ambience", "send": "Master"},
	{"name": "UI", "send": "Master"},
]


static func build_layout(spec: Array) -> Dictionary:
	AudioServer.bus_count = 1
	for i in AudioServer.get_bus_effect_count(0):
		AudioServer.remove_bus_effect(0, 0)
	var errors := []
	for b in spec:
		var idx := 0
		if b["name"] != "Master":
			idx = AudioServer.bus_count
			AudioServer.add_bus(idx)
			AudioServer.set_bus_name(idx, b["name"])
			var send: String = b.get("send", "Master")
			var si := AudioServer.get_bus_index(send)
			if si == -1 or si >= idx:
				errors.append("%s sends to %s, which is not on its left" % [b["name"], send])
			AudioServer.set_bus_send(idx, send)
		AudioServer.set_bus_volume_db(idx, float(b.get("volume_db", 0.0)))
		for e in b.get("effects", []):
			var fx = ClassDB.instantiate(e["type"])
			if fx == null or not (fx is AudioEffect):
				errors.append("unknown effect " + str(e["type"]))
				continue
			for k in e:
				if k != "type":
					fx.set(k, e[k])
			AudioServer.add_bus_effect(idx, fx)
	return {"ok": errors.is_empty(), "errors": errors, "bus_count": AudioServer.bus_count}


static func save_layout(path: String = "") -> int:
	if path == "":
		path = ProjectSettings.get_setting("audio/buses/default_bus_layout", "res://default_bus_layout.tres")
	return ResourceSaver.save(AudioServer.generate_bus_layout(), path)


## Layout facts plus flags: sends that do not point left, Master above 0 dB, missing names.
static func audit_layout(expected: Array = []) -> Dictionary:
	var buses := []
	var flags := []
	for i in AudioServer.bus_count:
		var fx := []
		for j in AudioServer.get_bus_effect_count(i):
			fx.append({"class": AudioServer.get_bus_effect(i, j).get_class(), "enabled": AudioServer.is_bus_effect_enabled(i, j)})
		var send := str(AudioServer.get_bus_send(i))
		var si := AudioServer.get_bus_index(send)
		buses.append({"index": i, "name": AudioServer.get_bus_name(i), "send": send, "volume_db": AudioServer.get_bus_volume_db(i),
			"mute": AudioServer.is_bus_mute(i), "solo": AudioServer.is_bus_solo(i), "effects": fx})
		if i > 0 and (si == -1 or si >= i):
			flags.append("bus %s sends to %s (must be a bus to its left)" % [AudioServer.get_bus_name(i), send])
		for f in fx:
			if f["class"] == "AudioEffectLimiter":
				flags.append("bus %s uses deprecated AudioEffectLimiter; use AudioEffectHardLimiter" % AudioServer.get_bus_name(i))
	if AudioServer.get_bus_volume_db(0) > 0.0:
		flags.append("Master volume above 0 dB")
	for n in expected:
		if AudioServer.get_bus_index(n) == -1:
			flags.append("expected bus %s missing (players naming it play on Master)" % n)
	return {"ok": flags.is_empty(), "flags": flags, "buses": buses,
		"layout_setting": ProjectSettings.get_setting("audio/buses/default_bus_layout", "")}


## Settings slider: linear 0..1 to the bus, muted under `mute_below` (Game Dev Artisan uses 0.05).
static func set_volume_linear(bus: String, value: float, mute_below: float = 0.05) -> bool:
	var i := AudioServer.get_bus_index(bus)
	if i == -1:
		push_error("set_volume_linear: no bus " + bus)
		return false
	AudioServer.set_bus_volume_linear(i, clampf(value, 0.0, 1.0))
	AudioServer.set_bus_mute(i, value < mute_below)
	return true


static func save_volumes(path: String, buses: Array) -> int:
	var cf := ConfigFile.new()
	for b in buses:
		var i := AudioServer.get_bus_index(b)
		if i != -1:
			cf.set_value("volume", b, AudioServer.get_bus_volume_linear(i))
	return cf.save(path)


static func load_volumes(path: String) -> int:
	var cf := ConfigFile.new()
	var err := cf.load(path)
	if err != OK:
		return err
	for b in cf.get_section_keys("volume"):
		set_volume_linear(b, float(cf.get_value("volume", b, 1.0)))
	return OK


## Mix state (a snapshot: Just Cause 4, Somberg): {bus: target_db}. Tweens every bus over `fade_s`
## on `owner`'s tree. Returns the Tween (await tween.finished to sequence states).
static func apply_state(owner: Node, state: Dictionary, fade_s: float = 1.0) -> Tween:
	var tw := owner.create_tween().set_parallel(true)
	for bus in state:
		var i := AudioServer.get_bus_index(bus)
		if i == -1:
			push_error("apply_state: no bus " + str(bus))
			continue
		var from := AudioServer.get_bus_volume_db(i)
		tw.tween_method(func(db: float): AudioServer.set_bus_volume_db(i, db), from, float(state[bus]), fade_s)
	return tw
