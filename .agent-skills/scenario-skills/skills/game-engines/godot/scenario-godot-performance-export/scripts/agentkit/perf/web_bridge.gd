extends Node
## scenario-godot-performance-export 0.1 (Godot 4.7.2): game <-> page JavaScript bridge for web exports
## (the web half of a "JavaScript leaderboard on the page"). Add as an autoload.
##
## The page defines, BEFORE the engine starts (custom HTML shell, or a <script> in html/head_include):
##   window.Leaderboard = { getTop(n) { return Promise.resolve(JSON.stringify([...])) }, submit(score) {...} };
## The game calls it through JavaScriptBridge; the page calls the game through window.godotBridge.
## Off the web (desktop, editor, headless) every call is a no-op, so the same code runs everywhere.
##
## Rules this encodes (JavaScriptBridge docs, verified in headless Chrome 2026-10-02):
## - keep the JavaScriptObject returned by create_callback in a member, or it is freed and the
##   JS side calls a dead function;
## - JS values cross as JavaScriptObject or Variant primitives: pass JSON strings for structures;
## - anything the page can call, a player can call from DevTools: scores must be submitted by a
##   trusted server, the browser only reads (handoff to scenario-godot-multiplayer).

signal top_received(rows: Array)
signal page_message(text: String)

var _lb: JavaScriptObject
var _on_top_cb: JavaScriptObject
var _from_page_cb: JavaScriptObject
var ready_ok := false
## Rows asked from the page at start (0: none). The smoke test asserts on the reply.
@export var auto_top := 3


func _ready() -> void:
	if not OS.has_feature("web"):
		print("WEB_BRIDGE off (not a web build)")
		return
	_lb = JavaScriptBridge.get_interface("Leaderboard")
	_on_top_cb = JavaScriptBridge.create_callback(_on_top)
	_from_page_cb = JavaScriptBridge.create_callback(_on_page)
	var window := JavaScriptBridge.get_interface("window")
	var bridge: JavaScriptObject = JavaScriptBridge.create_object("Object")
	bridge.send = _from_page_cb            # page: window.godotBridge.send("text")
	window.godotBridge = bridge
	JavaScriptBridge.eval("window.godotReady = true;", true)
	ready_ok = true
	print("WEB_BRIDGE ready leaderboard=%s" % [_lb != null])
	if auto_top > 0:
		request_top(auto_top)


func request_top(n: int = 5) -> void:
	if _lb == null:
		return
	var promise: JavaScriptObject = _lb.getTop(n)
	promise.then(_on_top_cb)


func submit(score: int) -> void:
	if _lb == null:
		return
	_lb.submit(score)


func _on_top(args: Array) -> void:
	var rows = JSON.parse_string(str(args[0]))
	if rows is Array:
		print("WEB_BRIDGE top %d rows" % rows.size())
		top_received.emit(rows)


func _on_page(args: Array) -> void:
	var text := str(args[0]) if args.size() > 0 else ""
	print("WEB_BRIDGE from_page " + text)
	page_message.emit(text)
	JavaScriptBridge.eval("window.godotAck = %s;" % JSON.stringify(text), true)
