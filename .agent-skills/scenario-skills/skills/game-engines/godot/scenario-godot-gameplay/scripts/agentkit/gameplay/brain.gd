extends RefCounted
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): enum brain with a pure decide() for crowds of enemies.
##
## The Shaggy Dev's lower tier (oqFbZoA2lnU [00:00:32]): an enum plus match, no nodes, so one
## manager can tick hundreds of them and a test can check the whole transition table without a scene.
## Hysteresis on every threshold pair so an enemy at the edge does not flicker [added].
##
##   const Brain = preload("res://addons/agentkit/gameplay/brain.gd")
##   state = Brain.decide(state, {"sees": true, "dist": 6.0, "health": 1.0, "lost_s": 0.0, "search_left": 0.0})

enum S { PATROL, CHASE, ATTACK, SEARCH, DEAD }

const NAMES := ["patrol", "chase", "attack", "search", "dead"]
## Distances in metres, times in seconds. Detect at DETECT_RANGE, keep tracking up to LOSE_RANGE.
const DETECT_RANGE := 12.0
const LOSE_RANGE := 16.0
const FOV_DEG := 110.0
const ATTACK_RANGE := 2.0
const ATTACK_EXIT := 2.6
const LOSE_AFTER := 1.5


## Next state from the current state and a percept (sees, dist, health, lost_s, search_left).
static func decide(s: int, p: Dictionary) -> int:
	if float(p.get("health", 1.0)) <= 0.0:
		return S.DEAD
	var sees: bool = p.get("sees", false)
	var dist := float(p.get("dist", INF))
	var lost := float(p.get("lost_s", 0.0))
	match s:
		S.PATROL:
			if sees:
				return S.ATTACK if dist <= ATTACK_RANGE else S.CHASE
		S.CHASE:
			if sees and dist <= ATTACK_RANGE:
				return S.ATTACK
			if not sees and lost >= LOSE_AFTER:
				return S.SEARCH
		S.ATTACK:
			if not sees or dist > ATTACK_EXIT:
				return S.CHASE
		S.SEARCH:
			if sees:
				return S.CHASE
			if float(p.get("search_left", 0.0)) <= 0.0:
				return S.PATROL
		S.DEAD:
			return S.DEAD
	return s


static func name_of(s: int) -> String:
	return NAMES[s] if s >= 0 and s < NAMES.size() else "?"
