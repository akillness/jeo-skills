extends RefCounted
## scenario-godot-2d terrain tools (Godot 4.7.2): paint a TileMapLayer from an ASCII map with terrains, and
## audit what the terrain solver picked against the cells' real neighbours.
##
##   var TT = preload("res://addons/agentkit/2d/terrain_tools.gd")
##   var cells := TT.cells_from_ascii(rows, "#")          # Array[Vector2i]
##   layer.set_cells_terrain_connect(cells, 0, 0)         # ONE call for the whole region
##   var audit := TT.audit_layer(layer)                    # {cells, side_mismatches, corner_mismatches, ...}
##
## The audit's "ideal" is the blob rule: a side bit should be the neighbour's terrain (or -1 when the
## neighbour is empty or another terrain); a corner bit should be the terrain only when the diagonal
## and both adjacent sides are that terrain. A full 47-tile set reaches 0 mismatches; a 16-tile set
## (no inner corners) shows its inner-corner compromise as corner mismatches.

const SIDES := [TileSet.CELL_NEIGHBOR_RIGHT_SIDE, TileSet.CELL_NEIGHBOR_BOTTOM_SIDE,
		TileSet.CELL_NEIGHBOR_LEFT_SIDE, TileSet.CELL_NEIGHBOR_TOP_SIDE]
## corner -> the two sides it sits between
const CORNERS := {
	TileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER: [TileSet.CELL_NEIGHBOR_BOTTOM_SIDE, TileSet.CELL_NEIGHBOR_RIGHT_SIDE],
	TileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER: [TileSet.CELL_NEIGHBOR_BOTTOM_SIDE, TileSet.CELL_NEIGHBOR_LEFT_SIDE],
	TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER: [TileSet.CELL_NEIGHBOR_TOP_SIDE, TileSet.CELL_NEIGHBOR_LEFT_SIDE],
	TileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER: [TileSet.CELL_NEIGHBOR_TOP_SIDE, TileSet.CELL_NEIGHBOR_RIGHT_SIDE],
}


static func cells_from_ascii(rows: Array, solid: String = "#", origin: Vector2i = Vector2i.ZERO) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in rows.size():
		var row: String = rows[y]
		for x in row.length():
			if solid.contains(row[x]):
				out.append(origin + Vector2i(x, y))
	return out


static func markers_from_ascii(rows: Array, ch: String, origin: Vector2i = Vector2i.ZERO) -> Array[Vector2i]:
	return cells_from_ascii(rows, ch, origin)


static func _terrain_at(layer: TileMapLayer, c: Vector2i, terrain_set: int) -> int:
	var td := layer.get_cell_tile_data(c)
	if td == null or td.terrain_set != terrain_set:
		return -1
	return td.terrain


## Compare every terrain cell's peering bits with its real neighbours.
static func audit_layer(layer: TileMapLayer, terrain_set: int = 0) -> Dictionary:
	var ts := layer.tile_set
	if ts == null or terrain_set >= ts.get_terrain_sets_count():
		return {"ok": false, "error": "layer has no TileSet or no terrain set %d" % terrain_set}
	var mode := ts.get_terrain_set_mode(terrain_set)
	var cells := 0
	var no_tile := 0
	var side_bad := 0
	var corner_bad := 0
	var examples := []
	for c in layer.get_used_cells():
		var td := layer.get_cell_tile_data(c)
		if td == null:
			no_tile += 1
			continue
		if td.terrain_set != terrain_set:
			continue
		cells += 1
		var t := td.terrain
		var side_ok := {}
		for b in SIDES:
			var want := t if _terrain_at(layer, layer.get_neighbor_cell(c, b), terrain_set) == t else -1
			var have := td.get_terrain_peering_bit(b) if td.is_valid_terrain_peering_bit(b) else -1
			side_ok[b] = want == t
			if have != want:
				side_bad += 1
				if examples.size() < 12:
					examples.append({"cell": c, "bit": "side %d" % b, "have": have, "want": want})
		if mode == TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES:
			for b in CORNERS:
				var pair: Array = CORNERS[b]
				var diag := _terrain_at(layer, layer.get_neighbor_cell(c, b), terrain_set) == t
				var want2 := t if (diag and side_ok[pair[0]] and side_ok[pair[1]]) else -1
				var have2 := td.get_terrain_peering_bit(b)
				if have2 != want2:
					corner_bad += 1
					if examples.size() < 12:
						examples.append({"cell": c, "bit": "corner %d" % b, "have": have2, "want": want2})
	return {"ok": side_bad == 0 and corner_bad == 0 and no_tile == 0, "cells": cells, "missing_tile_data": no_tile,
			"side_mismatches": side_bad, "corner_mismatches": corner_bad, "examples": examples,
			"mode": ["corners_and_sides", "corners", "sides"][mode]}
