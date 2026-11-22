extends RefCounted
## scenario-godot-vfx 0.1: job methods, run as "res://addons/agentkit/vfx/vfx_jobs.gd:<method>" through gd_run.run_script.

const VR = preload("res://addons/agentkit/vfx/vfx_recipes.gd")
const VB = preload("res://addons/agentkit/vfx/vfx_build.gd")
const AgentBuild = preload("res://addons/agentkit/agent_build.gd")


## args: tier ("high", "mobile", "low"). Saves the kit (see vfx_recipes.build_all).
func build(job) -> Dictionary:
	var tier: String = job.arg("tier", "high")
	if not tier in ["high", "mobile", "low"]:
		return {"ok": false, "error": "tier must be high, mobile or low"}
	return VR.build_all(job, tier)


## Saves res://vfx/broken.tscn: one emitter per classic mistake, to prove vfx_audit bites (procedures P3).
func broken(job) -> Dictionary:
	var root := Node3D.new()
	root.name = "Broken"
	# 1. colour ramp + scale curve on a material without vertex colour and keep_scale
	var a := VB.emitter({"name": "NoVertexColor", "amount": 16, "lifetime": 1.0,
		"pm": {"color_ramp": [[0.0, [1, 0.5, 0, 1]], [1.0, [1, 0, 0, 0]]], "scale_curve": [[0.0, 1.0], [1.0, 0.0]]},
		"draw": {"mesh": "quad", "size": [0.5, 0.5]}})
	var am := (a.draw_pass_1 as PrimitiveMesh).material as StandardMaterial3D
	am.vertex_color_use_as_albedo = false
	am.billboard_keep_scale = false
	root.add_child(a)
	# 2. trail_enabled on a quad, material without use_particle_trails
	var b := VB.emitter({"name": "TrailOnQuad", "amount": 8, "lifetime": 1.0, "draw": {"mesh": "quad", "size": [0.2, 0.2]}})
	b.trail_enabled = true
	root.add_child(b)
	# 3. fast colliding sparks, default AABB, default collision_base_size, no fixed fps
	var c := VB.emitter({"name": "FastSparks", "amount": 32, "lifetime": 1.5, "fixed_fps": 0,
		"pm": {"initial_velocity_min": 20.0, "initial_velocity_max": 30.0, "collision_mode": ParticleProcessMaterial.COLLISION_RIGID},
		"draw": {"mesh": "quad", "size": [0.3, 0.3], "blend": "add"}})
	c.visibility_aabb = AABB(Vector3(-4, -4, -4), Vector3(8, 8, 8))
	c.collision_base_size = 0.01
	c.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	root.add_child(c)
	# 4. sub-emitter whose child amount is too small and whose AABB is smaller
	var p := VB.emitter({"name": "Parent", "amount": 20, "lifetime": 1.0, "aabb": [-6, -6, -6, 12, 12, 12]})
	var ch := VB.emitter({"name": "Child", "amount": 4, "lifetime": 1.0, "aabb": [-1, -1, -1, 2, 2, 2]})
	root.add_child(p)
	root.add_child(ch)
	var ppm := p.process_material as ParticleProcessMaterial
	ppm.sub_emitter_mode = ParticleProcessMaterial.SUB_EMITTER_AT_END
	ppm.sub_emitter_amount_at_end = 3
	p.sub_emitter = NodePath("../Child")
	# 5. one-shot with preprocess, amount_ratio
	var d := VB.emitter({"name": "PreBurst", "amount": 30, "lifetime": 0.6, "one_shot": true, "preprocess": 0.3})
	d.amount_ratio = 0.5
	root.add_child(d)
	# 6. light with shadows, a thin collider wall
	var l := OmniLight3D.new()
	l.name = "ShadowFlash"
	l.shadow_enabled = true
	root.add_child(l)
	var wall := GPUParticlesCollisionBox3D.new()
	wall.name = "ThinWall"
	wall.size = Vector3(4, 4, 0.2)
	root.add_child(wall)
	var saved := AgentBuild.save_scene(root, "res://vfx/broken.tscn")
	root.free()
	return {"ok": saved.get("ok", false), "saved": saved}


## args: scene (res://...), out (res://...). Converts every GPUParticles3D into CPUParticles3D.
func to_cpu(job) -> Dictionary:
	var scene: String = job.arg("scene", "")
	var out: String = job.arg("out", "")
	if not ResourceLoader.exists(scene) or out == "":
		return {"ok": false, "error": "scene and out are required"}
	var root: Node = (load(scene) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	var r := VB.to_cpu(root)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	r["saved"] = saved
	r["ok"] = saved.get("ok", false)
	return r


## args: effect (res://...tscn), out (res://...tscn), pos ([x, y, z], default the floor target), name ("Explosion").
## Saves the capture stage with the effect instanced, paused (autoplay off, free_when_done off).
func stage_with(job) -> Dictionary:
	var eff: String = job.arg("effect", "")
	var out: String = job.arg("out", "")
	if not ResourceLoader.exists(eff) or out == "":
		return {"ok": false, "error": "effect and out are required"}
	var st := VR.stage()
	var b := (load(eff) as PackedScene).instantiate() as Node3D
	b.name = str(job.arg("name", "Explosion"))
	if "autoplay" in b:
		b.set("autoplay", false)
		b.set("free_when_done", false)
	st.add_child(b)
	b.position = job.arg("pos", Vector3(0, 0.05, -8.0))
	var saved := AgentBuild.save_scene(st, out)
	st.free()
	return {"ok": saved.get("ok", false), "saved": saved}


## args: tier, count (6), out. Stage + `count` explosions replayed every 2 s by fx_looper (GPU profiling).
## count 0 gives the baseline stage.
func stress(job) -> Dictionary:
	var tier: String = job.arg("tier", "high")
	var count: int = job.arg("count", 6)
	var out: String = job.arg("out", "res://vfx/stress_%s_%d.tscn" % [tier, count])
	var st := VR.stage()
	var loop := Node3D.new()
	loop.name = "Looper"
	loop.set_script(load("res://addons/agentkit/vfx/fx_looper.gd"))
	st.add_child(loop)
	var scene := load("res://vfx/explosion_%s.tscn" % tier) as PackedScene
	for i in count:
		var b := scene.instantiate() as Node3D
		b.name = "Explosion%d" % i
		b.set("autoplay", false)
		b.set("free_when_done", false)
		loop.add_child(b)
		b.position = Vector3((i % 3) * 2.5 - 2.5, 0.05, -8.0 + (i / 3) * 2.5)
	var saved := AgentBuild.save_scene(st, out)
	st.free()
	return {"ok": saved.get("ok", false), "saved": saved, "out": out}
