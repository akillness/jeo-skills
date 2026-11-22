extends RefCounted
## scenario-godot-performance-export 0.1 (Godot 4.7.2): deliberately slow test scenes, to calibrate a device
## or to prove that a fix moves the number it should. Copied to res://addons/agentkit/perf/.
##
##   gd_run.run_script(P, "res://addons/agentkit/perf/perf_stress.gd:make_city", {"count": 2500})
##   gd_run.run_script(P, "res://addons/agentkit/perf/perf_stress.gd:make_occlusion", {})
##   gd_run.run_script(P, "res://addons/agentkit/perf/perf_stress.gd:make_area", {"count": 4000})
##
## make_city writes res://perf_fx/city_slow.tscn: `count` cubes on a grid, ONE shared BoxMesh but a
## UNIQUE StandardMaterial3D per cube from an 8-color palette (breaks Forward+ auto-instancing), a
## GDScript _process per cube (spin plus a little math), and `lights` shadowed OmniLight3D. Three
## classic costs in one scene: draw calls, per-node script time, shadow passes.

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")

const SPIN_GD := """extends MeshInstance3D
## Per-node work, the pattern the perf skill replaces with one MultiMesh plus a vertex shader.
@export var speed := 1.0
var _acc := 0.0

func _process(delta: float) -> void:
	rotate_y(speed * delta)
	for i in 24:
		_acc += sin(_acc + float(i)) * 0.001
"""

const SPIN_SHADER := """shader_type spatial;
// One MultiMesh, per-instance color (MultiMesh.use_colors) and speed (INSTANCE_CUSTOM.r).
// Replaces one MeshInstance3D + one GDScript _process per cube.
render_mode cull_back;

void vertex() {
	float a = TIME * INSTANCE_CUSTOM.r;
	mat2 r = mat2(vec2(cos(a), sin(a)), vec2(-sin(a), cos(a)));
	VERTEX.xz = r * VERTEX.xz;
	NORMAL.xz = r * NORMAL.xz;
}

void fragment() {
	// Instance colors copied from StandardMaterial3D.albedo_color are sRGB; ALBEDO is linear.
	vec3 c = COLOR.rgb;
	ALBEDO = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
	ROUGHNESS = 0.7;
}
"""


static func _write_text(path: String, text: String) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path.get_base_dir()))
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(text)
	f.close()


static func _base_env(root: Node3D) -> void:
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-55, -35, 0)
	root.add_child(sun)


## Slow city: see the header. Args: count (2500), spacing (2.0), lights (16), seed (7), out.
func make_city(job) -> Dictionary:
	var count: int = job.arg("count", 2500)
	var spacing: float = job.arg("spacing", 2.0)
	var n_lights: int = job.arg("lights", 16)
	var out: String = job.arg("out", "res://perf_fx/city_slow.tscn")
	_write_text("res://perf_fx/spin.gd", SPIN_GD)
	_write_text("res://perf_fx/spin_instanced.gdshader", SPIN_SHADER)
	var spin: GDScript = ResourceLoader.load("res://perf_fx/spin.gd", "", ResourceLoader.CACHE_MODE_REPLACE)
	var rng := RandomNumberGenerator.new()
	rng.seed = job.arg("seed", 7)
	var root := Node3D.new()
	root.name = "City"
	_base_env(root)
	var side := int(ceil(sqrt(float(count))))
	var half := float(side - 1) * spacing * 0.5
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.position = Vector3(0, half * 0.9 + 6.0, half * 1.35 + 6.0)
	cam.rotation_degrees = Vector3(-38, 0, 0)
	cam.far = 400.0
	cam.current = true
	root.add_child(cam)
	var ground := MeshInstance3D.new()
	ground.name = "Ground"
	var plane := PlaneMesh.new()
	plane.size = Vector2(side * spacing + 8.0, side * spacing + 8.0)
	ground.mesh = plane
	root.add_child(ground)
	var props := Node3D.new()
	props.name = "Props"
	root.add_child(props)
	var box := BoxMesh.new()
	box.size = Vector3(1, 1, 1)
	for i in count:
		var mi := MeshInstance3D.new()
		mi.name = "Cube%d" % i
		mi.mesh = box
		var mat := StandardMaterial3D.new()          # unique per cube on purpose (8-color palette)
		mat.albedo_color = Color.from_hsv(float(rng.randi() % 8) / 8.0, 0.55, 0.85)
		mat.roughness = 0.7
		mi.material_override = mat
		mi.position = Vector3(float(i % side) * spacing - half, 0.5, float(i / side) * spacing - half)
		mi.set_script(spin)
		mi.set("speed", rng.randf_range(0.5, 2.0))
		props.add_child(mi)
	var lights := Node3D.new()
	lights.name = "Lights"
	root.add_child(lights)
	var lside := int(ceil(sqrt(float(n_lights))))
	for j in n_lights:
		var l := OmniLight3D.new()
		l.name = "Omni%d" % j
		l.omni_range = spacing * side / float(lside) * 1.1
		l.light_energy = 1.5
		l.light_color = Color.from_hsv(float(j) / max(1, n_lights), 0.3, 1.0)
		l.shadow_enabled = true
		var cell := spacing * side / float(lside)
		l.position = Vector3((float(j % lside) + 0.5) * cell - half - spacing * 0.5, 3.0, (float(j / lside) + 0.5) * cell - half - spacing * 0.5)
		lights.add_child(l)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false), "scene": out, "cubes": count, "lights": n_lights, "saved": saved}


## Occlusion test: a 40 x 12 m wall 12 m in front of the camera, `count` cubes behind it, `count_side`
## cubes beside it (visible). Args: count (1200), count_side (60), out. Camera looks down -Z.
func make_occlusion(job) -> Dictionary:
	var count: int = job.arg("count", 1200)
	var side_count: int = job.arg("count_side", 60)
	var out: String = job.arg("out", "res://perf_fx/occlusion.tscn")
	var root := Node3D.new()
	root.name = "Occlusion"
	_base_env(root)
	var cam := Camera3D.new()
	cam.name = "Camera3D"
	cam.position = Vector3(0, 1.7, 0)
	cam.fov = 70.0
	cam.far = 300.0
	cam.current = true
	root.add_child(cam)
	var wall := MeshInstance3D.new()
	wall.name = "Wall"
	var wm := BoxMesh.new()
	wm.size = Vector3(40, 12, 1)
	wall.mesh = wm
	wall.position = Vector3(0, 6, -12)
	root.add_child(wall)
	var behind := Node3D.new()
	behind.name = "Behind"
	root.add_child(behind)
	var box := BoxMesh.new()
	box.size = Vector3(0.8, 0.8, 0.8)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.85, 0.4, 0.2)
	var cols := 30
	for i in count:
		var mi := MeshInstance3D.new()
		mi.name = "B%d" % i
		mi.mesh = box
		mi.material_override = mat
		# rows from 16 m to 76 m in front of the camera: inside the frustum (frustum culling keeps
		# them) but hidden by the wall, which fills the whole view from the eye
		var row := i / cols
		var depth := 16.0 + float(row) * 1.5
		var width := depth * 0.9
		mi.position = Vector3(lerpf(-width, width, float(i % cols) / float(cols - 1)), 0.4 + float(row % 3) * 1.2, -depth)
		behind.add_child(mi)
	var beside := Node3D.new()
	beside.name = "Beside"
	root.add_child(beside)
	for k in side_count:
		var mi := MeshInstance3D.new()
		mi.name = "S%d" % k
		mi.mesh = box
		mi.material_override = mat
		mi.position = Vector3(-6.0 + float(k % 12), 0.4 + float(k / 12) * 1.0, -4.0 - float(k / 12) * 0.5)
		beside.add_child(mi)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false), "scene": out, "behind": count, "beside": side_count, "saved": saved}


## Heavy "next area" for the hitch test: `count` MeshInstance3D with `materials` distinct new
## materials (their pipelines are not compiled yet when the area appears). Args: count, materials, out.
func make_area(job) -> Dictionary:
	var count: int = job.arg("count", 4000)
	var n_mat: int = job.arg("materials", 48)
	var out: String = job.arg("out", "res://perf_fx/area.tscn")
	var root := Node3D.new()
	root.name = "Area"
	var mats: Array = []
	for m in n_mat:
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color.from_hsv(float(m) / n_mat, 0.6, 0.9)
		# vary features so each material needs its own shader variant (pipeline)
		mat.metallic = float(m % 3) * 0.5
		mat.rim_enabled = m % 2 == 0
		mat.clearcoat_enabled = m % 4 == 1
		mat.anisotropy_enabled = m % 5 == 2
		mat.emission_enabled = m % 6 == 3
		mat.emission = Color(0.2, 0.1, 0.0)
		mats.append(mat)
	var meshes: Array = [BoxMesh.new(), SphereMesh.new(), CylinderMesh.new(), PrismMesh.new()]
	var side := int(ceil(sqrt(float(count))))
	for i in count:
		var mi := MeshInstance3D.new()
		mi.name = "P%d" % i
		mi.mesh = meshes[i % meshes.size()]
		mi.material_override = mats[i % n_mat]
		mi.scale = Vector3.ONE * 0.4
		mi.position = Vector3(float(i % side) * 0.6 - side * 0.3, 0.3, -8.0 - float(i / side) * 0.6)
		root.add_child(mi)
	var saved := AgentBuild.save_scene(root, out)
	root.free()
	return {"ok": saved.get("ok", false), "scene": out, "nodes": count, "materials": n_mat, "saved": saved}
