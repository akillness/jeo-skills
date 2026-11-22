extends Area3D
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): a hitbox has a MASK only (the other faction's hurtbox
## layer), no layer, is not monitorable, lives `lifetime` s, and hits each target once per HitLog
## (Queble, cX-vzfmzjnE [00:01:13 to 00:17:45], ported to 3D).
##
##   var hb = Hitbox.new(self, 10, Layers.Faction.PLAYER, 0.15, SphereShape3D.new(), shared_log)
##   weapon_socket.add_child(hb)

const Layers = preload("res://addons/agentkit/gameplay/combat_layers.gd")
const HitLog = preload("res://addons/agentkit/gameplay/hit_log.gd")

signal hit(target: Node)

var attacker: Node
var damage := 1
var faction := 0
var lifetime := 0.0
var shape: Shape3D
var hit_log: RefCounted
var hits := 0


func _init(p_attacker: Node = null, p_damage: int = 1, p_faction: int = 0, p_lifetime: float = 0.0,
		p_shape: Shape3D = null, p_log: RefCounted = null) -> void:
	attacker = p_attacker
	damage = p_damage
	faction = p_faction
	lifetime = p_lifetime
	shape = p_shape
	hit_log = p_log if p_log != null else HitLog.new()


func _ready() -> void:
	monitorable = false
	monitoring = true
	collision_layer = 0
	collision_mask = 0
	set_collision_mask_value(Layers.target_layer(faction), true)
	if shape != null:
		var cs := CollisionShape3D.new()
		cs.shape = shape
		add_child(cs)
	area_entered.connect(_on_area_entered)
	if lifetime > 0.0:
		get_tree().create_timer(lifetime, false, true).timeout.connect(queue_free)


func _on_area_entered(area: Area3D) -> void:
	if not area.has_method("received_hit"):
		return
	var key: Object = area.get("receiver") if area.get("receiver") != null else area
	if hit_log.has_hit(key):
		return
	hit_log.log_hit(key)
	hits += 1
	area.received_hit(damage, attacker)
	hit.emit(area)
