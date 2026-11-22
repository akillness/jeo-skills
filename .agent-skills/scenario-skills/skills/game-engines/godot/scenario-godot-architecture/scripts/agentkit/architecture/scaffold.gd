extends RefCounted
## scenario-godot-architecture AgentKit: build the main scene skeleton (roots, UI layers, process modes).
##
##   gd_run.run_script(P, "res://addons/agentkit/architecture/scaffold.gd:main_scene",
##                     args={"path": "res://core/main/main.tscn", "dim": "3d",
##                           "script": "res://core/main/main_game.gd", "set_main": true})
##
## Layout after FAT Earth Studios (V4SO7foDoW4 [00:06:39, 00:08:57]): MainGame (always) > Systems,
## World (pausable) > LevelRoot, EntityRoot, EffectRoot; CanvasLayers HUD 10 (pausable),
## PauseLayer 20 (when paused), TransitionLayer 30 (always), DebugLayer 40 (always). Gaps of 10
## leave room for layers added later. Idempotent: an existing scene is rebuilt from scratch only
## when "overwrite" is true.

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")

const LAYERS := [
	["HUD", 10, Node.PROCESS_MODE_PAUSABLE],
	["PauseLayer", 20, Node.PROCESS_MODE_WHEN_PAUSED],
	["TransitionLayer", 30, Node.PROCESS_MODE_ALWAYS],
	["DebugLayer", 40, Node.PROCESS_MODE_ALWAYS],
]


func main_scene(job) -> Dictionary:
	var path: String = job.arg("path", "res://core/main/main.tscn")
	var dim: String = job.arg("dim", "3d")
	var script_path: String = job.arg("script", "")
	if ResourceLoader.exists(path) and not job.arg("overwrite", false):
		return {"ok": true, "path": path, "skipped": "exists (pass overwrite=true to rebuild)"}
	var root := Node.new()
	root.name = "Main"
	root.process_mode = Node.PROCESS_MODE_ALWAYS
	var systems := Node.new()
	systems.name = "Systems"
	root.add_child(systems)
	var world: Node = Node3D.new() if dim == "3d" else Node2D.new()
	world.name = "World"
	world.process_mode = Node.PROCESS_MODE_PAUSABLE
	world.unique_name_in_owner = true
	root.add_child(world)
	for n in ["LevelRoot", "EntityRoot", "EffectRoot"]:
		var c: Node = Node3D.new() if dim == "3d" else Node2D.new()
		c.name = n
		c.unique_name_in_owner = true
		world.add_child(c)
	for spec: Array in LAYERS:
		var layer := CanvasLayer.new()
		layer.name = spec[0]
		layer.layer = spec[1]
		layer.process_mode = spec[2]
		root.add_child(layer)
	if script_path != "":
		var scr: Script = load(script_path)
		if scr == null:
			root.free()
			return {"ok": false, "error": "cannot load script " + script_path}
		root.set_script(scr)
	# "props": exported values for the root script; res:// strings are loaded (PackedScene, Resource).
	var props: Dictionary = job.arg("props", {})
	for k: Variant in props:
		var v: Variant = props[k]
		if v is String and (v as String).begins_with("res://"):
			v = load(v)
		root.set(str(k), v)
	# unique_name_in_owner needs the owner set first, which save_scene does; set it again after.
	for n: Node in root.find_children("*", "", true, false):
		n.owner = root
	for n in ["World", "LevelRoot", "EntityRoot", "EffectRoot"]:
		root.find_child(n, true, false).unique_name_in_owner = true
	var saved := AgentBuild.save_scene(root, path)
	root.free()
	if not saved.get("ok", false):
		return saved
	if job.arg("set_main", false):
		ProjectSettings.set_setting("application/run/main_scene", path)
		ProjectSettings.save()
	return {"ok": true, "path": path, "nodes": saved.get("nodes", 0), "set_main": job.arg("set_main", false)}
