extends RefCounted
## NetBuild (scenario-godot-multiplayer 0.1, Godot 4.7.2): build networked scenes in code (no Replication panel,
## no Auto Spawn List clicking) and write dedicated-server export presets.
##
## Job use:
##   gd_run.run_script(P, "res://addons/agentkit/multiplayer/net_build.gd:build", {"dir": "res://net"})
##   gd_run.run_script(P, "res://addons/agentkit/multiplayer/net_build.gd:server_preset",
##                     {"name": "Server Linux", "platform": "Linux", "mode": "strip"})
##
## Scenes written by build():
##   res://net/player.tscn       CharacterBody3D + StateSync (position: spawn + always; peer_id: spawn only)
##                               + Input/InputSync (move: always, owned by the client)
##   res://net/prop_always.tscn  Node3D + PropSync (position: spawn + always, unreliable)
##   res://net/prop_on_change.tscn  same with on_change (reliable, sent only when the value changes)
##   res://net/world.tscn        World root with Players + PlayerSpawner, Props + PropSpawner, NetLab, Boot

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")
const KIT := "res://addons/agentkit/multiplayer/"


## A synchronizer whose config lists `props` = [[path, spawn, mode], ...]; mode is a
## SceneReplicationConfig.REPLICATION_MODE_* value (NEVER with spawn true = sent once, at spawn).
static func make_sync(sync_name: String, root_path: NodePath, props: Array) -> MultiplayerSynchronizer:
	var s := MultiplayerSynchronizer.new()
	s.name = sync_name
	s.root_path = root_path
	var cfg := SceneReplicationConfig.new()
	for p in props:
		var path := NodePath(str(p[0]))
		cfg.add_property(path)
		cfg.property_set_spawn(path, bool(p[1]))
		cfg.property_set_replication_mode(path, int(p[2]))
	s.replication_config = cfg
	return s


static func make_spawner(spawner_name: String, spawn_path: NodePath, scenes: Array, limit: int = 0) -> MultiplayerSpawner:
	var sp := MultiplayerSpawner.new()
	sp.name = spawner_name
	sp.spawn_path = spawn_path
	sp.spawn_limit = limit
	for sc in scenes:
		sp.add_spawnable_scene(str(sc))
	return sp


func build(job) -> Dictionary:
	var dir: String = job.arg("dir", "res://net")
	var out := {}
	out["player"] = _build_player(dir + "/player.tscn")
	out["prop_always"] = _build_prop(dir + "/prop_always.tscn", SceneReplicationConfig.REPLICATION_MODE_ALWAYS)
	out["prop_on_change"] = _build_prop(dir + "/prop_on_change.tscn", SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
	out["world"] = _build_world(dir, job.arg("spawn_limit", 0))
	var ok := true
	for k in out:
		ok = ok and bool(out[k].get("ok", false))
	# read back: the spawner list and the replication config must survive the save
	var w: Node = (load(dir + "/world.tscn") as PackedScene).instantiate()
	var sp := w.get_node("PlayerSpawner") as MultiplayerSpawner
	var scenes: Array = []
	for i in sp.get_spawnable_scene_count():
		scenes.append(sp.get_spawnable_scene(i))
	w.free()
	var pl: Node = (load(dir + "/player.tscn") as PackedScene).instantiate()
	var rc := (pl.get_node("StateSync") as MultiplayerSynchronizer).replication_config
	var props: Array = []
	for p in rc.get_properties():
		props.append({"path": str(p), "spawn": rc.property_get_spawn(p), "mode": rc.property_get_replication_mode(p)})
	pl.free()
	return {"ok": ok, "saved": out, "spawnable_scenes": scenes, "state_sync_props": props}


func _build_player(path: String) -> Dictionary:
	var p := CharacterBody3D.new()
	p.name = "Player"
	p.set_script(load(KIT + "net_player.gd"))
	var col := CollisionShape3D.new()
	col.name = "Collision"
	var cap := CapsuleShape3D.new()
	cap.radius = 0.4
	cap.height = 1.6
	col.shape = cap
	col.position = Vector3(0, 0.8, 0)
	p.add_child(col)
	var mesh := MeshInstance3D.new()
	mesh.name = "Mesh"
	var cm := CapsuleMesh.new()
	cm.radius = 0.4
	cm.height = 1.6
	mesh.mesh = cm
	mesh.position = Vector3(0, 0.8, 0)
	p.add_child(mesh)
	var M := SceneReplicationConfig.REPLICATION_MODE_ALWAYS
	var NEVER := SceneReplicationConfig.REPLICATION_MODE_NEVER
	p.add_child(make_sync("StateSync", ^"..", [[".:position", true, M], [".:peer_id", true, NEVER]]))
	var inp := Node.new()
	inp.name = "Input"
	inp.set_script(load(KIT + "net_input.gd"))
	inp.add_child(make_sync("InputSync", ^"..", [[".:move", false, M]]))
	p.add_child(inp)
	var r := AgentBuild.save_scene(p, path)
	p.free()
	return r


func _build_prop(path: String, mode: int) -> Dictionary:
	var n := Node3D.new()
	n.name = "Prop"
	n.set_script(load(KIT + "net_prop.gd"))
	var mesh := MeshInstance3D.new()
	mesh.name = "Mesh"
	var bm := BoxMesh.new()
	bm.size = Vector3(0.5, 0.5, 0.5)
	mesh.mesh = bm
	n.add_child(mesh)
	n.add_child(make_sync("PropSync", ^"..", [[".:position", true, mode]]))
	var r := AgentBuild.save_scene(n, path)
	n.free()
	return r


func _build_world(dir: String, spawn_limit: int) -> Dictionary:
	var w := Node3D.new()
	w.name = "World"
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-60, -30, 0)
	sun.shadow_enabled = true
	w.add_child(sun)
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.18, 0.2, 0.24)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.6, 0.62, 0.7)
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	we.environment = env
	w.add_child(we)
	var floor_body := StaticBody3D.new()
	floor_body.name = "Floor"
	var fm := MeshInstance3D.new()
	fm.name = "Mesh"
	var plane := PlaneMesh.new()
	plane.size = Vector2(20, 20)
	fm.mesh = plane
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(0.42, 0.45, 0.4)
	fm.material_override = fmat
	floor_body.add_child(fm)
	var fc := CollisionShape3D.new()
	fc.name = "Collision"
	var box := BoxShape3D.new()
	box.size = Vector3(20, 0.2, 20)
	fc.shape = box
	fc.position = Vector3(0, -0.1, 0)
	floor_body.add_child(fc)
	w.add_child(floor_body)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.position = Vector3(0, 13, 7)
	cam.rotation_degrees = Vector3(-62, 0, 0)
	cam.current = true
	w.add_child(cam)
	var players := Node3D.new()
	players.name = "Players"
	w.add_child(players)
	w.add_child(make_spawner("PlayerSpawner", ^"../Players", [dir + "/player.tscn"], spawn_limit))
	var props := Node3D.new()
	props.name = "Props"
	w.add_child(props)
	w.add_child(make_spawner("PropSpawner", ^"../Props", [dir + "/prop_always.tscn", dir + "/prop_on_change.tscn"]))
	var lab := Node.new()
	lab.name = "NetLab"
	lab.set_script(load(KIT + "net_lab.gd"))
	w.add_child(lab)
	var boot := Node.new()
	boot.name = "Boot"
	boot.set_script(load(KIT + "net_boot.gd"))
	w.add_child(boot)
	var r := AgentBuild.save_scene(w, dir + "/world.tscn")
	w.free()
	return r


## Dedicated-server export preset: export mode "Export as dedicated server" (adds the
## dedicated_server feature tag, which forces headless) with every resource set to Strip Visuals,
## except `keep` paths (resources the server reads pixels from) and `remove` paths (client-only files).
## Writes the keys the 4.7.2 editor writes: dedicated_server, export_filter="customized", customized_files.
func server_preset(job) -> Dictionary:
	var preset_name: String = job.arg("name", "Server")
	var platform: String = job.arg("platform", "Linux")
	var r := AgentBuild.write_preset(preset_name, platform, job.arg("export_path", ""), job.arg("options", {}))
	if not r.get("ok", false):
		return r
	var cf := ConfigFile.new()
	var path := "res://export_presets.cfg"
	if cf.load(path) != OK:
		return {"ok": false, "error": "cannot reload export_presets.cfg"}
	var sec := "preset.%d" % int(r["index"])
	var files := {"res://": str(job.arg("mode", "strip"))}
	for k in job.arg("keep", []):
		files[str(k)] = "keep"
	for k in job.arg("remove", []):
		files[str(k)] = "remove"
	cf.set_value(sec, "dedicated_server", true)
	cf.set_value(sec, "export_filter", "customized")
	cf.set_value(sec, "customized_files", files)
	cf.set_value(sec, "custom_features", str(job.arg("custom_features", "")))
	var err := cf.save(path)
	r["ok"] = err == OK
	r["customized_files"] = files
	return r
