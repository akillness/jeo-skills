extends Node
## Events autoload (register as "Events"): cross-system signals only, never state.
##
## Rule (Eric Peterson, GodotCon 2025): call down, signal up, event out. Use a signal here only when
## the emitter and the listeners live in unrelated subtrees (world and UI, gameplay and audio) or the
## emitter cannot know who cares. Payloads that grow travel as one object (DamageInfo), so adding a
## field does not break every connected callback.

signal item_picked_up(item_id: StringName, count: int)
signal actor_damaged(actor: Node, info: DamageInfo, dealt: float)
signal actor_died(actor: Node)
signal game_saved(slot: int)
signal game_loaded(slot: int)
