extends "res://addons/agentkit/agent_job.gd"
## scenes/flash_2d.tscn: two sprites; "Hit" uses hit_flash.gdshader, "Ref" is untouched.
const AgentBuild := preload("res://addons/agentkit/agent_build.gd")
func run() -> Dictionary:
	var root := Node2D.new()
	root.name = "Flash2D"
	var bg := ColorRect.new()
	bg.color = Color(0.15, 0.17, 0.22)
	bg.size = Vector2(4000, 4000)
	bg.position = Vector2(-2000, -2000)
	root.add_child(bg)
	for i in 2:
		var s := Sprite2D.new()
		s.name = ["Hit", "Ref"][i]
		s.texture = load("res://icon.svg")
		s.position = Vector2(-90 + i * 180, 0)
		if i == 0:
			var m := ShaderMaterial.new()
			m.shader = load("res://shaders/hit_flash.gdshader")
			s.material = m
		root.add_child(s)
	var cam := Camera2D.new()
	cam.name = "Camera2D"
	root.add_child(cam)
	return {"ok": AgentBuild.save_scene(root, "res://scenes/flash_2d.tscn").get("ok", false)}
