extends RefCounted
## NetAudit (scenario-godot-multiplayer 0.1, Godot 4.7.2): offline checks of networked scenes, run headless.
##
##   gd_run.run_script(P, "res://addons/agentkit/multiplayer/net_audit.gd:scene", {"scene": "res://net/world.tscn"})
##   gd_run.run_script(P, "res://addons/agentkit/multiplayer/net_audit.gd:kit")     # parse the kit itself
##
## scene(): every MultiplayerSynchronizer (root_path resolves, config set, no Object/Resource/RID
## properties, interval per mode), every MultiplayerSpawner (spawn_path resolves, scenes exist, limit),
## RPC tables of scripted nodes (get_node_rpc_config, 4.5+ name), auto-generated names.
## Spawnable scenes are instanced and audited too (their synchronizers are where configs live).

const OBJECT_TYPES := [TYPE_OBJECT, TYPE_RID, TYPE_CALLABLE, TYPE_SIGNAL]


func scene(job) -> Dictionary:
	var path: String = job.arg("scene", "res://net/world.tscn")
	if not ResourceLoader.exists(path):
		return {"ok": false, "error": "scene not found: " + path}
	var root: Node = (load(path) as PackedScene).instantiate()
	job.root.add_child(root)
	await job.process_frame
	var report := {"scene": path, "synchronizers": [], "spawners": [], "rpc_nodes": [], "flags": []}
	_walk(root, root, report)
	var seen := {}
	for sp in report["spawners"]:
		for sc in sp["scenes"]:
			if seen.has(sc) or not ResourceLoader.exists(sc):
				continue
			seen[sc] = true
			var inst: Node = (load(sc) as PackedScene).instantiate()
			job.root.add_child(inst)
			await job.process_frame
			var sub := {"scene": sc, "synchronizers": [], "spawners": [], "rpc_nodes": [], "flags": []}
			_walk(inst, inst, sub)
			for k in ["synchronizers", "spawners", "rpc_nodes"]:
				for row in sub[k]:
					row["scene"] = sc
					report[k].append(row)
			for f in sub["flags"]:
				report["flags"].append(sc + ": " + str(f))
			inst.free()
	root.free()
	report["ok"] = report["flags"].is_empty()
	return report


func _walk(n: Node, root: Node, report: Dictionary) -> void:
	var rel := str(root.get_path_to(n))
	if str(n.name).begins_with("@"):
		report["flags"].append("auto-generated name %s: differs between peers, breaks RPC and sync paths" % rel)
	if n is MultiplayerSynchronizer:
		report["synchronizers"].append(_sync_row(n as MultiplayerSynchronizer, rel, report["flags"]))
	elif n is MultiplayerSpawner:
		report["spawners"].append(_spawner_row(n as MultiplayerSpawner, rel, report["flags"]))
	if n.get_script() != null:
		# @rpc annotations live on the Script (Script.get_rpc_config); rpc_config() calls on the node
		# (Node.get_node_rpc_config, renamed from get_rpc_config in 4.5). Both feed the checksum.
		var rows := {}
		for cfg in [(n.get_script() as Script).get_rpc_config(), n.get_node_rpc_config()]:
			if cfg is Dictionary:
				for m in cfg:
					var c: Dictionary = cfg[m]
					rows[str(m)] = c.duplicate()   # rpc_mode, call_local, transfer_mode, channel keys as Godot stores them
		if not rows.is_empty():
			report["rpc_nodes"].append({"node": rel, "script": (n.get_script() as Script).resource_path, "rpcs": rows})
	for c in n.get_children():
		_walk(c, root, report)


func _sync_row(s: MultiplayerSynchronizer, rel: String, flags: Array) -> Dictionary:
	var row := {"node": rel, "root_path": str(s.root_path), "replication_interval": s.replication_interval,
			"delta_interval": s.delta_interval, "public_visibility": s.public_visibility, "properties": []}
	var target := s.get_node_or_null(s.root_path)
	if target == null:
		flags.append("%s: root_path %s does not resolve" % [rel, s.root_path])
	var cfg := s.replication_config
	if cfg == null:
		flags.append("%s: no replication_config (syncs nothing)" % rel)
		return row
	var modes := {}
	for p in cfg.get_properties():
		var mode := cfg.property_get_replication_mode(p)
		modes[mode] = true
		var prop := {"path": str(p), "spawn": cfg.property_get_spawn(p), "mode": mode}
		if target:
			var holder := target.get_node_or_null(NodePath(str(p).get_slice(":", 0)))
			if holder == null:
				flags.append("%s: property %s: node not found" % [rel, p])
			else:
				var v = holder.get_indexed(NodePath(":" + str(p).get_slice(":", 1)))
				prop["type"] = type_string(typeof(v))
				if typeof(v) in OBJECT_TYPES:
					flags.append("%s: property %s is %s (objects, resources and RIDs cannot sync)" % [rel, p, prop["type"]])
		if mode == SceneReplicationConfig.REPLICATION_MODE_NEVER and not cfg.property_get_spawn(p):
			flags.append("%s: property %s neither spawns nor replicates" % [rel, p])
		row["properties"].append(prop)
	if s.replication_interval > 0.0 and not modes.has(SceneReplicationConfig.REPLICATION_MODE_ALWAYS):
		flags.append("%s: replication_interval set but no ALWAYS property (it only applies to ALWAYS)" % rel)
	if s.delta_interval > 0.0 and not modes.has(SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE):
		flags.append("%s: delta_interval set but no ON_CHANGE property (it only applies to ON_CHANGE)" % rel)
	return row


func _spawner_row(sp: MultiplayerSpawner, rel: String, flags: Array) -> Dictionary:
	var scenes: Array = []
	for i in sp.get_spawnable_scene_count():
		var sc := sp.get_spawnable_scene(i)
		scenes.append(sc)
		if not ResourceLoader.exists(sc):
			flags.append("%s: spawnable scene missing: %s" % [rel, sc])
	var row := {"node": rel, "spawn_path": str(sp.spawn_path), "spawn_limit": sp.spawn_limit, "scenes": scenes,
			"custom_spawn_function": sp.spawn_function.is_valid()}
	if str(sp.spawn_path) == "":
		flags.append("%s: spawn_path is empty (nothing replicates)" % rel)
	elif sp.get_node_or_null(sp.spawn_path) == null:
		flags.append("%s: spawn_path %s does not resolve" % [rel, sp.spawn_path])
	if scenes.is_empty() and not sp.spawn_function.is_valid():
		flags.append("%s: no spawnable scenes and no spawn_function" % rel)
	return row


## Compile every script of the multiplayer kit (or of args.dir): parse and compile errors show up.
func kit(job) -> Dictionary:
	job.expect_errors = true
	var dir: String = job.arg("dir", "res://addons/agentkit/multiplayer/")
	var failed: Array = []
	var checked: Array = []
	for f in DirAccess.get_files_at(dir):
		if not f.ends_with(".gd"):
			continue
		var before: int = job.captured_error_count()
		# Compile a fresh GDScript from the source. ResourceLoader.load(..., CACHE_MODE_IGNORE) on this
		# very file replaced the running script and failed with "Bad address index" (4.7.2).
		var s := GDScript.new()
		s.source_code = FileAccess.get_file_as_string(dir + f)
		var err := s.reload()
		var errs: Array = job.captured_errors().slice(before)
		checked.append(f)
		if err != OK or not errs.is_empty():
			var msgs: Array = []
			for e in errs.slice(0, 5):
				msgs.append("%s:%s %s" % [e.get("file", ""), e.get("line", ""), e["message"]])
			failed.append({"path": dir + f, "errors": msgs})
	return {"ok": failed.is_empty(), "checked": checked, "failed": failed}
