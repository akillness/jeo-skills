extends Node
## scenario-godot-ui 0.1 (Godot 4.7.2): settings store for a settings screen, meant as an autoload.
##   autoload: Settings="*res://addons/agentkit/ui/ui_settings.gd"
## The menu writes through set_value(); state lives here, not in the menu scene (freed when the game
## starts; CoffeeCrow 9H_fN4OxyIE). Persisted as plain values in user://settings.cfg.
##
## Choices behind apply():
## - "resolution" on a fullscreen game is the 3D render scale; the engine never changes the monitor
##   mode (docs, Multiple resolutions) and a smaller window blurs the UI.
## - window mode uses EXCLUSIVE_FULLSCREEN: FULLSCREEN keeps a 1 px border that can make integer
##   scaling pick a smaller factor (docs).
## - ui_scale is Window.content_scale_factor (docs: expose it for accessibility). It shrinks the
##   logical canvas: 1.5 at 1920x1080 with a 1152x648 base gives a 768x432 canvas (verified).
## - FSR 2 and MetalFX need Forward+ or Mobile; Compatibility gets bilinear.

signal changed(key: String, value: Variant)

const PATH := "user://settings.cfg"
const DEFAULTS := {
	"window_mode": "windowed",     # windowed | fullscreen (exclusive) | borderless
	"vsync": true,
	"render_scale": 1.0,           # 0.5 to 1.0, 3D only
	"upscaler": "auto",            # auto | bilinear | fsr | fsr2 | metalfx
	"quality": "high",             # low | medium | high
	"ui_scale": 1.0,               # 0.75 to 2.0
	"master_volume": 1.0, "music_volume": 0.8, "sfx_volume": 1.0,
	"locale": "",                  # "" = OS language
}
const QUALITY := {
	"low": {"msaa_3d": Viewport.MSAA_DISABLED, "ssaa": Viewport.SCREEN_SPACE_AA_DISABLED, "shadow_atlas": 1024},
	"medium": {"msaa_3d": Viewport.MSAA_2X, "ssaa": Viewport.SCREEN_SPACE_AA_FXAA, "shadow_atlas": 2048},
	"high": {"msaa_3d": Viewport.MSAA_4X, "ssaa": Viewport.SCREEN_SPACE_AA_SMAA, "shadow_atlas": 4096},
}

var values: Dictionary = DEFAULTS.duplicate()
var applied: Dictionary = {}


func _ready() -> void:
	load_settings()
	apply_all()


func get_value(key: String) -> Variant:
	return values.get(key, DEFAULTS.get(key))


func set_value(key: String, v: Variant, persist: bool = true) -> void:
	values[key] = v
	apply_key(key)
	changed.emit(key, v)
	if persist:
		save_settings()


func save_settings(path: String = PATH) -> Error:
	var cf := ConfigFile.new()
	for k in values:
		cf.set_value("settings", k, values[k])
	return cf.save(path)


func load_settings(path: String = PATH) -> bool:
	var cf := ConfigFile.new()
	if cf.load(path) != OK:
		return false
	for k in DEFAULTS:
		values[k] = cf.get_value("settings", k, DEFAULTS[k])
	return true


func apply_all() -> void:
	for k in values:
		apply_key(k)


func apply_key(key: String) -> void:
	var v = values.get(key)
	var w := get_tree().root
	match key:
		"window_mode":
			if DisplayServer.get_name() == "headless":
				applied[key] = "skipped (headless)"
				return
			var m := Window.MODE_WINDOWED
			if v == "fullscreen":
				m = Window.MODE_EXCLUSIVE_FULLSCREEN
			elif v == "borderless":
				m = Window.MODE_FULLSCREEN
			w.mode = m
			applied[key] = m
		"vsync":
			if DisplayServer.get_name() != "headless":
				DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if v else DisplayServer.VSYNC_DISABLED)
			applied[key] = v
		"render_scale", "upscaler":
			w.scaling_3d_scale = clampf(float(values["render_scale"]), 0.25, 2.0)
			w.scaling_3d_mode = _upscaler(str(values["upscaler"]))
			applied["scaling_3d_mode"] = w.scaling_3d_mode
			applied["render_scale"] = w.scaling_3d_scale
		"quality":
			var q: Dictionary = QUALITY.get(str(v), QUALITY["high"])
			w.msaa_3d = q["msaa_3d"]
			w.screen_space_aa = q["ssaa"]
			w.positional_shadow_atlas_size = q["shadow_atlas"]
			applied[key] = v
		"ui_scale":
			w.content_scale_factor = clampf(float(v), 0.5, 3.0)
			applied[key] = w.content_scale_factor
		"master_volume", "music_volume", "sfx_volume":
			var bus := {"master_volume": "Master", "music_volume": "Music", "sfx_volume": "SFX"}[key] as String
			var idx := AudioServer.get_bus_index(bus)
			if idx >= 0:
				AudioServer.set_bus_volume_linear(idx, clampf(float(v), 0.0, 1.0))
				applied[key] = AudioServer.get_bus_volume_linear(idx)
			else:
				applied[key] = "no bus " + bus
		"locale":
			var loc := str(v)
			TranslationServer.set_locale(loc if loc != "" else OS.get_locale_language())
			applied[key] = TranslationServer.get_locale()


func _upscaler(name: String) -> Viewport.Scaling3DMode:
	var method := str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "forward_plus"))
	if method == "gl_compatibility":
		return Viewport.SCALING_3D_MODE_BILINEAR
	match name:
		"bilinear":
			return Viewport.SCALING_3D_MODE_BILINEAR
		"fsr":
			return Viewport.SCALING_3D_MODE_FSR
		"fsr2":
			return Viewport.SCALING_3D_MODE_FSR2
		"metalfx":
			return Viewport.SCALING_3D_MODE_METALFX_SPATIAL if OS.get_name() in ["macOS", "iOS"] else Viewport.SCALING_3D_MODE_FSR
	if float(values["render_scale"]) >= 0.999:
		return Viewport.SCALING_3D_MODE_BILINEAR
	return Viewport.SCALING_3D_MODE_METALFX_SPATIAL if OS.get_name() in ["macOS", "iOS"] else Viewport.SCALING_3D_MODE_FSR
