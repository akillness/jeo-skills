extends RefCounted
## scenario-godot-gameplay kit 0.1: what an NPC offers when spoken to. Order matters and is the bug in most
## first drafts: hand in a finished quest, then continue an active one, then offer a new one whose
## prerequisites are done. quests: Array of {id, giver, requires: Array[StringName]}.
## state: {quest_id: "active" | "ready" | "done"}.

static func pick(npc: StringName, quests: Array, state: Dictionary) -> Dictionary:
	for q in quests:
		if q["giver"] == npc and state.get(q["id"], "") == "ready":
			return {"action": "turn_in", "quest": q["id"]}
	for q in quests:
		if q["giver"] == npc and state.get(q["id"], "") == "active":
			return {"action": "continue", "quest": q["id"]}
	for q in quests:
		if q["giver"] != npc or state.has(q["id"]):
			continue
		var ok := true
		for req in q.get("requires", []):
			if state.get(req, "") != "done":
				ok = false
		if ok:
			return {"action": "offer", "quest": q["id"]}
	return {"action": "idle"}
