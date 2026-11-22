extends Node
## scenario-godot-performance-export 0.1 (Godot 4.7.2): demo and DLC switches for a shipped build. Autoload.
##
## Demo build: the SAME project, a second export preset with custom_features="demo" (Cashew,
## feature tags). Code asks OS.has_feature("demo"); content the demo must not ship is left out of
## that preset with exclude_filter, so it is not only hidden but absent from the .pck.
##
## DLC: content exported as its own pack (--export-pack, a preset whose export_filter="resources"
## lists only the DLC files), mounted at runtime with ProjectSettings.load_resource_pack(). Paths
## inside the pack are res:// paths, so a scene in the pack loads like any other once mounted.
## Mount BEFORE loading anything the pack overrides (replace_files defaults to true).
##
## Prints one `DLC {json}` line so a smoke test can assert on it. User args:
##   --dlc <path-to.pck>     mount this pack (default: dlc.pck next to the executable, then user://dlc.pck)

const DLC_SCENE := "res://dlc/bonus.tscn"

var demo := false
var dlc_loaded := false


func _ready() -> void:
	demo = OS.has_feature("demo")
	var path := _dlc_path()
	if path != "" and not demo:
		# replace_files=false: a DLC pack exported from the project also carries project.binary and the
		# autoload scripts (seen in its listing, 4.7.2); never let an old DLC overwrite newer base files.
		dlc_loaded = ProjectSettings.load_resource_pack(path, false)
	var scene_ok := false
	if dlc_loaded and ResourceLoader.exists(DLC_SCENE):
		var ps := load(DLC_SCENE) as PackedScene
		scene_ok = ps != null and ps.can_instantiate()
	print("DLC " + JSON.stringify({"demo": demo, "pack": path, "loaded": dlc_loaded, "scene_ok": scene_ok,
			"in_base_pck": ResourceLoader.exists(DLC_SCENE) and not dlc_loaded}))


func _dlc_path() -> String:
	var ua := OS.get_cmdline_user_args()
	var i := ua.find("--dlc")
	if i >= 0 and i + 1 < ua.size():
		return ua[i + 1]
	for p in [OS.get_executable_path().get_base_dir().path_join("dlc.pck"), "user://dlc.pck"]:
		if FileAccess.file_exists(p):
			return p
	return ""
