extends RefCounted
## scenario-godot-rendering-lighting 0.1 (Godot 4.7.2): attach a CompositorEffect to a scene (headless).
##   gd_run.run_script(P, kit("compositor_tools.gd:attach"), {"scene": "res://level.tscn",
##       "shader": "res://addons/agentkit/rendering/compositor/grayscale.glsl", "strength": 1.0})
## target: "world" (WorldEnvironment.compositor: every viewport) or a Camera3D path (that camera only).

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")
const PostEffect = preload("res://addons/agentkit/rendering/compositor/post_effect.gd")


func attach(job) -> Dictionary:
	var scene_path: String = job.arg("scene", "res://main.tscn")
	var target: String = job.arg("target", "world")
	var root: Node = (load(scene_path) as PackedScene).instantiate()
	var holder: Node = null
	if target == "world":
		for n in root.find_children("*", "WorldEnvironment", true, false):
			holder = n
			break
	else:
		holder = root.get_node_or_null(target) as Camera3D
	if holder == null:
		root.free()
		return {"ok": false, "error": "no WorldEnvironment / camera '%s' in %s" % [target, scene_path]}
	var comp: Compositor = holder.get("compositor")
	if comp == null:
		comp = Compositor.new()
	var fx = PostEffect.new()
	fx.shader_path = job.arg("shader", "res://addons/agentkit/rendering/compositor/grayscale.glsl")
	fx.strength = job.arg("strength", 1.0)
	fx.enabled = true
	var list: Array[CompositorEffect] = comp.compositor_effects
	list.append(fx)
	comp.compositor_effects = list            # reassign: element writes do not reach the setter
	holder.set("compositor", comp)
	var out: String = job.arg("out", scene_path)
	var holder_name := str(holder.name)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false), "scene": out, "effects": list.size(), "holder": holder_name}
