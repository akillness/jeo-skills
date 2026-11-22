extends Area3D
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): a hurtbox sits on its faction's hurtbox LAYER, scans
## nothing (monitoring off), and forwards hits to an explicit `receiver` (Queble, cX-vzfmzjnE
## [00:08:13]). `receiver` is set in code: `owner` is null for nodes built in code (observed G4).

const Layers = preload("res://addons/agentkit/gameplay/combat_layers.gd")

signal hit_received(damage: int, attacker: Node)

@export var faction := 1
## Object with take_damage(amount: int, attacker: Node); usually the character root.
var receiver: Node


func _ready() -> void:
	monitoring = false
	monitorable = true
	collision_layer = 0                  # new Area3D: layer 1 and mask 1 by default (verified 4.7.2)
	collision_mask = 0
	set_collision_layer_value(Layers.hurt_layer(faction), true)


func received_hit(damage: int, attacker: Node) -> void:
	hit_received.emit(damage, attacker)
	if receiver != null and receiver.has_method("take_damage"):
		receiver.take_damage(damage, attacker)
