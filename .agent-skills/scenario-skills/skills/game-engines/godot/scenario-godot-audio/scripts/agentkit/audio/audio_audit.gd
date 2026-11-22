extends RefCounted
## scenario-godot-audio AudioAudit (Godot 4.7.2): scan a scene tree for audio player mistakes.
## Flags: no stream; bus missing from the layout (plays on Master); bus left at Master; 3D player
## with max_distance 0 (audible at any range); area_mask 0 while an Area3D/2D in the tree overrides
## the bus (the 4.7 default makes the override do nothing) [added].


static func scan(root: Node) -> Dictionary:
	var players := []
	var flags := []
	var has_area_override := false
	var stack := [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if (n is Area3D or n is Area2D) and n.get("audio_bus_override"):
			has_area_override = true
		if n is AudioStreamPlayer or n is AudioStreamPlayer2D or n is AudioStreamPlayer3D:
			players.append(n)
	for p in players:
		var path := str(root.get_path_to(p))
		var bus := str(p.bus)
		if p.stream == null:
			flags.append("%s: no stream" % path)
		if AudioServer.get_bus_index(bus) == -1:
			flags.append("%s: bus %s not in the layout (plays on Master)" % [path, bus])
		elif bus == "Master":
			flags.append("%s: bus Master (route to Music/SFX/... so sliders and mix states reach it)" % path)
		if p is AudioStreamPlayer3D and p.max_distance == 0.0:
			flags.append("%s: max_distance 0 (never culled by distance)" % path)
		if (p is AudioStreamPlayer3D or p is AudioStreamPlayer2D) and has_area_override and p.area_mask == 0:
			flags.append("%s: area_mask 0 while an Area overrides the bus (4.7 default: override ignored)" % path)
	return {"ok": flags.is_empty(), "players": players.size(), "flags": flags}
