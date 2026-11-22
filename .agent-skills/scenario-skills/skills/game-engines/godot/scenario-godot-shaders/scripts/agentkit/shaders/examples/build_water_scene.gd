extends "res://addons/agentkit/agent_job.gd"
## Builds a shoreline test scene for a water shader: heightfield terrain crossing y = 0, rocks above
## and below the surface, a submerged pillar, sun with shadows, sky, camera. Idempotent (overwrites).
## gd_run.run_script(P, "jobs/build_water_scene.gd", {"shader": "res://shaders/water_stylized.gdshader",
##                   "out": "res://scenes/water_shore.tscn"})   shader "" = StandardMaterial3D baseline

const AgentBuild := preload("res://addons/agentkit/agent_build.gd")
const ShaderTools := preload("res://addons/agentkit/shaders/shader_tools.gd")

func height(x: float, z: float) -> float:
	var h := -1.5
	h += 1.75 * exp(-((x + 3.0) * (x + 3.0) + (z + 1.0) * (z + 1.0)) / 14.0)
	h += 1.1 * exp(-((x - 5.0) * (x - 5.0) + (z - 2.5) * (z - 2.5)) / 5.0)
	h += 0.08 * sin(x * 1.3) * cos(z * 1.1)
	return h

func run() -> Dictionary:
	var shader_path: String = arg("shader", "res://shaders/water_stylized.gdshader")
	var out: String = arg("out", "res://scenes/water_shore.tscn")
	var root := Node3D.new()
	root.name = "WaterShore"
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = Sky.new()
	env.sky.sky_material = ProceduralSkyMaterial.new()
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-38, -40, 0)
	root.add_child(sun)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.fov = 55.0
	root.add_child(cam)
	cam.look_at_from_position(Vector3(0.5, 4.2, 11.5), Vector3(-0.5, -0.6, 0.5), Vector3.UP)
	cam.current = true
	# terrain
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := 96
	var size := 24.0
	for iz in n:
		for ix in n:
			var quad := [Vector2(ix, iz), Vector2(ix + 1, iz), Vector2(ix + 1, iz + 1), Vector2(ix, iz), Vector2(ix + 1, iz + 1), Vector2(ix, iz + 1)]
			for q in quad:
				var x: float = q.x / n * size - size * 0.5
				var z: float = q.y / n * size - size * 0.5
				st.set_uv(Vector2(x, z) * 0.5)
				st.add_vertex(Vector3(x, height(x, z), z))
	st.generate_normals()
	var terrain := MeshInstance3D.new()
	terrain.name = "Terrain"
	terrain.mesh = st.commit()
	var img := Image.create_empty(64, 64, false, Image.FORMAT_RGB8)
	for y in 64:
		for x in 64:
			var c := Color(0.86, 0.76, 0.55) if ((x / 8) + (y / 8)) % 2 == 0 else Color(0.62, 0.52, 0.36)
			img.set_pixel(x, y, c)
	var tmat := StandardMaterial3D.new()
	tmat.albedo_texture = ImageTexture.create_from_image(img)
	tmat.roughness = 0.95
	terrain.material_override = tmat
	root.add_child(terrain)
	# rocks: two above the surface, one just below, one pillar crossing it
	var rock_mat := StandardMaterial3D.new()
	rock_mat.albedo_color = Color(0.42, 0.42, 0.46)
	var specs := [[Vector3(1.5, -0.2, 2.0), Vector3(1.2, 1.2, 1.2), 20.0], [Vector3(-1.0, -0.6, 4.0), Vector3(0.9, 0.9, 0.9), 50.0],
			[Vector3(3.0, -0.75, 4.5), Vector3(1.0, 0.6, 1.0), 10.0], [Vector3(-4.5, -0.3, 3.0), Vector3(0.5, 2.4, 0.5), 0.0]]
	for i in specs.size():
		var r := MeshInstance3D.new()
		r.name = "Rock%d" % i
		r.mesh = BoxMesh.new()
		r.position = specs[i][0]
		r.scale = specs[i][1]
		r.rotation_degrees = Vector3(12.0, specs[i][2], 8.0)
		r.material_override = rock_mat
		root.add_child(r)
	# water
	var water := MeshInstance3D.new()
	water.name = "Water"
	var pm := PlaneMesh.new()
	pm.size = Vector2(80, 80)
	pm.subdivide_width = 159
	pm.subdivide_depth = 159
	water.mesh = pm
	if shader_path == "":
		var wm := StandardMaterial3D.new()
		wm.albedo_color = Color(0.1, 0.45, 0.6, 0.7)
		wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		wm.roughness = 0.1
		water.material_override = wm
	else:
		var m := ShaderMaterial.new()
		m.shader = load(shader_path)
		m.set_shader_parameter("noise_tex", ShaderTools.noise_texture_2d(256, 0.02, 7))
		water.material_override = m
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(water)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false), "scene": out, "saved": saved, "shader": shader_path}
