extends RefCounted
## scenario-godot-gameplay kit 0.1: physics layer numbers for combat (1-based, as set_collision_layer_value
## takes them). Name them in project.godot too: layer_names/3d_physics/layer_5="player_hurtbox".

const WORLD := 1
const PLAYER := 2
const ENEMY := 3
const PLAYER_HURTBOX := 5
const ENEMY_HURTBOX := 6
const PROJECTILE := 7

enum Faction { PLAYER, ENEMY }


## Hurtbox layer of a faction (hurtboxes sit on it, hitboxes of the other faction scan it).
static func hurt_layer(faction: int) -> int:
	return PLAYER_HURTBOX if faction == Faction.PLAYER else ENEMY_HURTBOX


## Layer a hitbox of `faction` scans: the OTHER faction's hurtboxes.
static func target_layer(faction: int) -> int:
	return ENEMY_HURTBOX if faction == Faction.PLAYER else PLAYER_HURTBOX


## project.godot lines that name the layers (so the Inspector shows names, Queble [00:00:48]).
static func layer_names_text() -> String:
	return "\n".join(['layer_names/3d_physics/layer_1="world"', 'layer_names/3d_physics/layer_2="player"',
			'layer_names/3d_physics/layer_3="enemy"', 'layer_names/3d_physics/layer_5="player_hurtbox"',
			'layer_names/3d_physics/layer_6="enemy_hurtbox"', 'layer_names/3d_physics/layer_7="projectile"'])
