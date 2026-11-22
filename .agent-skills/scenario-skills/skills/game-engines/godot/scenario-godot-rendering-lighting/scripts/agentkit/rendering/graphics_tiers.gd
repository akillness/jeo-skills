extends RefCounted
## scenario-godot-rendering-lighting 0.1 (Godot 4.7.2): quality tiers for one project shipping on PC (Forward+)
## and phones (Mobile renderer, the built-in rendering_method.mobile default).
## Ship it as-is (call apply from a GraphicsSettings autoload) or copy the TIERS table.
##
##   const Tiers = preload("res://addons/agentkit/rendering/graphics_tiers.gd")
##   Tiers.apply("medium", get_viewport(), get_tree().current_scene)
##
## The base look must hold at "low": LightmapGI, ReflectionProbes, fog, glow and tonemapping run on
## every renderer, so they carry the art direction. Tiers only ADD Forward+ effects (SSAO, SSIL, SSR,
## SDFGI, volumetric fog, TAA) on PC. A Forward+-only key on a Mobile build is skipped here, so the log
## stays free of "only available when using the Forward+ renderer" warnings.
## Values are this skill's starting points [added]; measure them per project (procedures P11).

const TIERS := {
	"low": {"msaa_3d": 0, "screen_space_aa": 0, "scaling_3d_mode": 1, "scaling_3d_scale": 0.67, "mesh_lod_threshold": 4.0,
			"dir_shadow_size": 1024, "dir_soft": 0, "pos_soft": 0, "sun_mode": 1, "sun_distance": 40.0, "positional_shadows": false,
			"glow": true, "ssao": false, "ssil": false, "ssr": false, "sdfgi": false, "volumetric_fog": false, "fog_volume_size": 64,
			"taa": false, "max_fps": 30},
	"medium": {"msaa_3d": 1, "screen_space_aa": 0, "scaling_3d_mode": 1, "scaling_3d_scale": 0.8, "mesh_lod_threshold": 2.0,
			"dir_shadow_size": 2048, "dir_soft": 1, "pos_soft": 1, "sun_mode": 1, "sun_distance": 60.0, "positional_shadows": true,
			"glow": true, "ssao": false, "ssil": false, "ssr": false, "sdfgi": false, "volumetric_fog": false, "fog_volume_size": 64,
			"taa": false, "max_fps": 0},
	"high": {"msaa_3d": 1, "screen_space_aa": 2, "scaling_3d_mode": 0, "scaling_3d_scale": 1.0, "mesh_lod_threshold": 1.0,
			"dir_shadow_size": 4096, "dir_soft": 2, "pos_soft": 2, "sun_mode": 2, "sun_distance": 100.0, "positional_shadows": true,
			"glow": true, "ssao": true, "ssil": false, "ssr": false, "sdfgi": false, "volumetric_fog": true, "fog_volume_size": 64,
			"taa": false, "max_fps": 0},
	"ultra": {"msaa_3d": 1, "screen_space_aa": 2, "scaling_3d_mode": 0, "scaling_3d_scale": 1.0, "mesh_lod_threshold": 0.5,
			"dir_shadow_size": 4096, "dir_soft": 3, "pos_soft": 3, "sun_mode": 2, "sun_distance": 150.0, "positional_shadows": true,
			"glow": true, "ssao": true, "ssil": true, "ssr": true, "sdfgi": false, "volumetric_fog": true, "fog_volume_size": 128,
			"taa": false, "max_fps": 0},
}
const FORWARD_PLUS_ONLY := ["ssil", "ssr", "sdfgi", "volumetric_fog", "taa"]


## Apply a tier to a viewport and the scene under it. Returns what was applied and what was skipped.
static func apply(tier: String, vp: Viewport, scene_root: Node) -> Dictionary:
	if not TIERS.has(tier):
		return {"ok": false, "error": "unknown tier " + tier}
	var t: Dictionary = TIERS[tier]
	var method := RenderingServer.get_current_rendering_method()
	var skipped: Array = []
	vp.msaa_3d = t["msaa_3d"]
	vp.screen_space_aa = t["screen_space_aa"] if method != "gl_compatibility" else Viewport.SCREEN_SPACE_AA_DISABLED
	var mode: int = t["scaling_3d_mode"]
	if mode == Viewport.SCALING_3D_MODE_FSR and method != "forward_plus":
		# 4.7.2, observed: FSR1 on the Mobile renderer prints "only available when using the Forward+ renderer"
		# and renders exactly like bilinear. MetalFX spatial works there on the Metal driver (iOS, macOS).
		mode = Viewport.SCALING_3D_MODE_METALFX_SPATIAL if RenderingServer.get_current_rendering_driver_name() == "metal" else Viewport.SCALING_3D_MODE_BILINEAR
		skipped.append("fsr1")
	vp.scaling_3d_mode = mode
	vp.scaling_3d_scale = t["scaling_3d_scale"]
	vp.mesh_lod_threshold = t["mesh_lod_threshold"]
	vp.use_taa = t["taa"] and method == "forward_plus"
	vp.positional_shadow_atlas_size = 0 if not t["positional_shadows"] else 4096 if tier in ["high", "ultra"] else 2048
	RenderingServer.directional_shadow_atlas_set_size(t["dir_shadow_size"], true)
	RenderingServer.directional_soft_shadow_filter_set_quality(t["dir_soft"])
	RenderingServer.positional_soft_shadow_filter_set_quality(t["pos_soft"])
	var env: Environment = null
	for we in scene_root.find_children("*", "WorldEnvironment", true, false):
		env = (we as WorldEnvironment).environment
		break
	if env:
		env.glow_enabled = t["glow"]
		env.ssao_enabled = t["ssao"] and method != "mobile"          # SSAO: Forward+ and Compatibility (4.6+)
		for k in ["ssil", "ssr", "sdfgi", "volumetric_fog"]:
			var want: bool = t[k] and method == "forward_plus"
			if t[k] and not want:
				skipped.append(k)
			env.set(k + "_enabled", want)
		if env.volumetric_fog_enabled:
			RenderingServer.environment_set_volumetric_fog_volume_size(t["fog_volume_size"], 64)
	for l in scene_root.find_children("*", "DirectionalLight3D", true, false):
		var sun := l as DirectionalLight3D
		sun.directional_shadow_mode = t["sun_mode"]
		sun.directional_shadow_max_distance = t["sun_distance"]
	Engine.max_fps = t["max_fps"]
	return {"ok": true, "tier": tier, "renderer": method, "skipped_forward_plus_only": skipped}
