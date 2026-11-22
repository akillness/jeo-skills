extends RefCounted
## scenario-godot-ui 0.1 example (Godot 4.7.2): build a main menu, a settings screen and a HUD in code,
## with a code-built theme and CSV translations. Idempotent: rerun rewrites the same files.
##   run_script(P, "res://addons/agentkit/ui/examples/build_g7.gd:build", {"base": [720, 720]})
## then gd_run.import_project(P) (imports the CSV into .translation files) and register them.
## Every string on screen is a translation key; every layout is containers and anchors.

const AgentBuild = preload("res://addons/agentkit/agent_build.gd")
const UITheme = preload("res://addons/agentkit/ui/ui_theme.gd")

const MAIN_MENU_GD := """extends Control
## Main menu: Settings opens through the MenuStack; the stack restores focus on close.
@onready var stack: Node = $MenuStack
@onready var settings: Control = $Settings

func _ready() -> void:
	%Play.pressed.connect(func(): get_tree().call_group("menu_events", "on_play"))
	%SettingsButton.pressed.connect(func(): stack.open(settings, %SettingsButton))
	%Quit.pressed.connect(func(): get_tree().quit())
	settings.get_node("%Back").pressed.connect(func(): stack.close())
"""

const HUD_GD := """extends CanvasLayer
## HUD: updates only on signals or calls, never in _process.
@onready var health: ProgressBar = %Health
@onready var ammo: Label = %Ammo
@onready var low: Label = %LowAmmo

func set_health(h: float, max_h: float = -1.0) -> void:
	health.set_health(h, max_h)

func set_ammo(mag: int, reserve: int) -> void:
	ammo.text = tr("HUD_AMMO").format({"mag": mag, "reserve": reserve})
	low.visible = mag <= 3
	low.text = tr_n("HUD_ROUNDS_LEFT", "HUD_ROUNDS_LEFT_PL", mag) % mag
"""

const CSV := """keys,?plural,en,fr,de,ja,ar
MENU_TITLE,,SKYFALL,SKYFALL,SKYFALL,スカイフォール,سكاي فول
MENU_PLAY,,Play,Jouer,Spielen,プレイ,العب
MENU_SETTINGS,,Settings,Paramètres,Einstellungen,設定,الإعدادات
MENU_QUIT,,Quit,Quitter,Beenden,終了,خروج
SET_TITLE,,Settings,Paramètres,Einstellungen,設定,الإعدادات
SET_VIDEO,,Video,Vidéo,Grafik,映像,الفيديو
SET_AUDIO,,Audio,Audio,Audio,オーディオ,الصوت
SET_CONTROLS,,Controls,Commandes,Steuerung,操作,التحكم
SET_WINDOW_MODE,,Window mode,Mode d'affichage,Fenstermodus,ウィンドウモード,وضع النافذة
SET_RENDER_SCALE,,3D resolution,Résolution 3D,3D-Auflösung,3D解像度,دقة ثلاثية الأبعاد
SET_QUALITY,,Quality,Qualité,Qualität,品質,الجودة
SET_UI_SCALE,,Interface size,Taille de l'interface,Größe der Benutzeroberfläche,UIサイズ,حجم الواجهة
SET_MASTER,,Master volume,Volume général,Gesamtlautstärke,マスター音量,مستوى الصوت الرئيسي
SET_MUSIC,,Music volume,Volume de la musique,Musiklautstärke,音楽の音量,مستوى صوت الموسيقى
SET_SFX,,Effects volume,Volume des effets,Effektlautstärke,効果音の音量,مستوى صوت المؤثرات
ACT_JUMP,,Jump,Sauter,Springen,ジャンプ,قفز
ACT_FIRE,,Fire,Tirer,Feuern,発射,إطلاق
ACT_RELOAD,,Reload,Recharger,Nachladen,リロード,إعادة التلقيم
OPT_WINDOWED,,Windowed,Fenêtré,Fenster,ウィンドウ,نافذة
OPT_FULLSCREEN,,Fullscreen,Plein écran,Vollbild,フルスクリーン,ملء الشاشة
OPT_BORDERLESS,,Borderless,Sans bordure,Rahmenlos,ボーダーレス,بلا حدود
OPT_LOW,,Low,Faible,Niedrig,低,منخفضة
OPT_MEDIUM,,Medium,Moyenne,Mittel,中,متوسطة
OPT_HIGH,,High,Élevée,Hoch,高,عالية
SET_BACK,,Back,Retour,Zurück,戻る,رجوع
HUD_HEALTH,,Health,Santé,Gesundheit,体力,الصحة
HUD_AMMO,,{mag} / {reserve},{mag} / {reserve},{mag} / {reserve},{mag} / {reserve},{mag} / {reserve}
HUD_ROUNDS_LEFT,HUD_ROUNDS_LEFT_PL,%d round left,%d cartouche restante,%d Schuss übrig,残り%d発,تبقى طلقة %d
,,%d rounds left,%d cartouches restantes,%d Schuss übrig,,تبقى %d طلقات
"""


static func _btn(key: String, name: String, variation: String = "") -> Button:
	var b := Button.new()
	b.name = name
	b.text = key
	b.unique_name_in_owner = true
	b.custom_minimum_size = Vector2(0, 88)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if variation != "":
		b.theme_type_variation = StringName(variation)
	return b


static func _label(key: String, variation: String = "") -> Label:
	var l := Label.new()
	l.text = key
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if variation != "":
		l.theme_type_variation = StringName(variation)
	return l


static func _row(key: String, control: Control) -> BoxContainer:
	# HFlowContainer would also work; a BoxContainer that turns vertical below a width is explicit.
	var row := HBoxContainer.new()
	row.name = key.to_pascal_case()
	var l := _label(key)
	l.custom_minimum_size = Vector2(240, 0)
	row.add_child(l)
	control.custom_minimum_size = Vector2(260, 88)   # 88 logical = 132 px at 1.5x: above 48 dp on a phone
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	control.accessibility_name = key
	row.add_child(control)
	return row


static func _safe(script_path: String) -> MarginContainer:
	var m := MarginContainer.new()
	m.name = "SafeArea"
	m.set_script(load(script_path))
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return m


static func settings_panel() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = "Settings"
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.visible = false
	var sa := _safe("res://addons/agentkit/ui/safe_area.gd")
	sa.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.add_child(sa)
	var vb := VBoxContainer.new()
	vb.name = "Layout"
	sa.add_child(vb)
	vb.add_child(_label("SET_TITLE", "TitleLabel"))
	var tabs := TabContainer.new()
	tabs.name = "Tabs"
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vb.add_child(tabs)
	var pages := {"SET_VIDEO": [], "SET_AUDIO": [], "SET_CONTROLS": []}
	var mode := OptionButton.new()
	for k in ["OPT_WINDOWED", "OPT_FULLSCREEN", "OPT_BORDERLESS"]:
		mode.add_item(k)
	pages["SET_VIDEO"].append(_row("SET_WINDOW_MODE", mode))
	var rs := HSlider.new()
	rs.min_value = 0.5
	rs.max_value = 1.0
	rs.step = 0.05
	rs.value = 1.0
	pages["SET_VIDEO"].append(_row("SET_RENDER_SCALE", rs))
	var q := OptionButton.new()
	for k in ["OPT_LOW", "OPT_MEDIUM", "OPT_HIGH"]:
		q.add_item(k)
	pages["SET_VIDEO"].append(_row("SET_QUALITY", q))
	var us := HSlider.new()
	us.min_value = 0.75
	us.max_value = 2.0
	us.step = 0.25
	us.value = 1.0
	pages["SET_VIDEO"].append(_row("SET_UI_SCALE", us))
	for k in ["SET_MASTER", "SET_MUSIC", "SET_SFX"]:
		var s := HSlider.new()
		s.max_value = 1.0
		s.step = 0.05
		s.value = 0.8
		pages["SET_AUDIO"].append(_row(k, s))
	for a in ["ACT_JUMP", "ACT_FIRE", "ACT_RELOAD"]:
		var row := HBoxContainer.new()
		row.name = a.to_pascal_case()
		var l := _label(a)
		l.custom_minimum_size = Vector2(200, 0)
		row.add_child(l)
		for kind in ["Key", "Pad"]:
			var b := Button.new()
			b.name = kind
			b.text = "Space" if kind == "Key" else "A / Cross"
			b.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # key names are not translation keys
			b.custom_minimum_size = Vector2(150, 88)
			b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			b.accessibility_name = "%s %s binding" % [a, kind]
			row.add_child(b)
		pages["SET_CONTROLS"].append(row)
	for p in pages:
		var sc := ScrollContainer.new()
		sc.name = p.to_pascal_case()
		sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		var col := VBoxContainer.new()
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sc.add_child(col)
		for r in pages[p]:
			col.add_child(r)
		tabs.add_child(sc)
		tabs.set_tab_title(tabs.get_tab_count() - 1, p)
	var back := _btn("SET_BACK", "Back")
	back.size_flags_horizontal = Control.SIZE_SHRINK_END
	back.custom_minimum_size = Vector2(240, 88)
	vb.add_child(back)
	return panel


static func main_menu(menu_script: String) -> Control:
	var root := Control.new()
	root.name = "MainMenu"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.set_script(load(menu_script))
	var bg := ColorRect.new()
	bg.name = "Background"
	bg.color = Color("10131c")
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(bg)
	var sa := _safe("res://addons/agentkit/ui/safe_area.gd")
	root.add_child(sa)
	var center := CenterContainer.new()
	center.name = "Center"
	sa.add_child(center)
	var vb := VBoxContainer.new()
	vb.name = "Buttons"
	vb.custom_minimum_size = Vector2(420, 0)
	center.add_child(vb)
	var title := _label("MENU_TITLE", "TitleLabel")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(title)
	vb.add_child(_btn("MENU_PLAY", "Play", "PrimaryButton"))
	vb.add_child(_btn("MENU_SETTINGS", "SettingsButton"))
	vb.add_child(_btn("MENU_QUIT", "Quit"))
	var sp := settings_panel()
	root.add_child(sp)
	var stack := Node.new()
	stack.name = "MenuStack"
	stack.set_script(load("res://addons/agentkit/ui/menu_stack.gd"))
	root.add_child(stack)
	stack.set("base_panel", root)
	stack.set("default_button", vb.get_node("Play"))
	return root


static func hud(hud_script: String) -> CanvasLayer:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	layer.set_script(load(hud_script))
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE   # STOP (the default) would eat every game click
	layer.add_child(root)
	var sa := _safe("res://addons/agentkit/ui/safe_area.gd")
	root.add_child(sa)
	var col := VBoxContainer.new()
	col.name = "Column"
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sa.add_child(col)
	var top := HBoxContainer.new()
	top.name = "Top"
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(top)
	var hp := PanelContainer.new()
	hp.name = "HealthPanel"
	hp.theme_type_variation = &"HudPanel"
	hp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(hp)
	var hv := VBoxContainer.new()
	hp.add_child(hv)
	hv.add_child(_label("HUD_HEALTH", "HudLabel"))
	var bar := ProgressBar.new()
	bar.name = "Health"
	bar.unique_name_in_owner = true
	bar.set_script(load("res://addons/agentkit/ui/hud_bar.gd"))
	bar.custom_minimum_size = Vector2(240, 22)
	bar.max_value = 100
	bar.value = 100
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.accessibility_name = "HUD_HEALTH"
	bar.focus_mode = Control.FOCUS_ACCESSIBILITY
	hv.add_child(bar)
	var spacer := Control.new()
	spacer.name = "Spacer"
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(spacer)
	var mm := PanelContainer.new()
	mm.name = "Minimap"
	mm.theme_type_variation = &"HudPanel"
	mm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(mm)
	var ar := AspectRatioContainer.new()
	ar.ratio = 1.0
	ar.custom_minimum_size = Vector2(160, 160)
	ar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mm.add_child(ar)
	var map := ColorRect.new()
	map.name = "MapView"   # a SubViewport texture or a static map goes here
	map.color = Color("2a3b33")
	map.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ar.add_child(map)
	var fill := Control.new()
	fill.name = "Fill"
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(fill)
	var bottom := HBoxContainer.new()
	bottom.name = "Bottom"
	bottom.alignment = BoxContainer.ALIGNMENT_END
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(bottom)
	var ap := PanelContainer.new()
	ap.name = "AmmoPanel"
	ap.theme_type_variation = &"HudPanel"
	ap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.add_child(ap)
	var av := VBoxContainer.new()
	ap.add_child(av)
	var ammo := Label.new()
	ammo.name = "Ammo"
	ammo.unique_name_in_owner = true
	ammo.text = "12 / 120"
	ammo.theme_type_variation = &"HudValue"
	ammo.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	ammo.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED   # filled by code through tr()
	ammo.focus_mode = Control.FOCUS_ACCESSIBILITY
	ammo.accessibility_live = AccessibilityServer.LIVE_POLITE
	av.add_child(ammo)
	var low := Label.new()
	low.name = "LowAmmo"
	low.unique_name_in_owner = true
	low.theme_type_variation = &"HudLabel"
	low.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	low.visible = false
	av.add_child(low)
	return layer


## Job method. args: base [w, h] (default [720, 720], the square base from the docs),
## dir (default res://ui). Writes theme, CSV, scripts and three scenes; sets project settings.
func build(job) -> Dictionary:
	var dir: String = job.arg("dir", "res://ui")
	var base: Vector2i = job.arg("base", Vector2i(720, 720))
	for d in [dir, dir + "/i18n", dir + "/theme"]:
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(d))
	var files := {dir + "/main_menu.gd": MAIN_MENU_GD, dir + "/hud.gd": HUD_GD, dir + "/i18n/strings.csv": CSV}
	for p in files:
		var f := FileAccess.open(p, FileAccess.WRITE)
		f.store_string(files[p])
		f.close()
	# Theme with font fallbacks: the built-in default font has no CJK or Arabic glyphs.
	var body := SystemFont.new()
	body.font_names = PackedStringArray(["Avenir Next", "Helvetica Neue", "Noto Sans", "Arial"])
	var cjk := SystemFont.new()
	cjk.font_names = PackedStringArray(["Hiragino Sans", "Noto Sans CJK JP", "Yu Gothic", "Microsoft YaHei"])
	var arabic := SystemFont.new()
	arabic.font_names = PackedStringArray(["Geeza Pro", "Noto Naskh Arabic", "Segoe UI"])
	body.fallbacks = [cjk, arabic]
	var theme := UITheme.build({})
	theme.default_font = body
	var tp := dir + "/theme/game_theme.tres"
	var err := ResourceSaver.save(theme, tp)
	ProjectSettings.set_setting("gui/theme/custom", tp)
	ProjectSettings.set_setting("display/window/size/viewport_width", base.x)
	ProjectSettings.set_setting("display/window/size/viewport_height", base.y)
	ProjectSettings.set_setting("display/window/stretch/mode", "canvas_items")
	ProjectSettings.set_setting("display/window/stretch/aspect", "expand")
	ProjectSettings.set_setting("display/window/handheld/orientation", DisplayServer.SCREEN_SENSOR)
	ProjectSettings.set_setting("application/run/main_scene", dir + "/main_menu.tscn")
	var saved_settings := ProjectSettings.save()
	var mm := main_menu(dir + "/main_menu.gd")
	var hd := hud(dir + "/hud.gd")
	var sp := settings_panel()
	sp.visible = true
	var r1 := AgentBuild.save_scene(mm, dir + "/main_menu.tscn")
	var r2 := AgentBuild.save_scene(hd, dir + "/hud.tscn")
	var r3 := AgentBuild.save_scene(sp, dir + "/settings.tscn")
	for n in [mm, hd, sp]:
		n.free()   # built in code and never added to the tree: free or they leak at exit
	return {"ok": err == OK and saved_settings == OK and r1.get("ok", false) and r2.get("ok", false) and r3.get("ok", false),
			"theme": tp, "scenes": [dir + "/main_menu.tscn", dir + "/hud.tscn", dir + "/settings.tscn"], "base": base}
