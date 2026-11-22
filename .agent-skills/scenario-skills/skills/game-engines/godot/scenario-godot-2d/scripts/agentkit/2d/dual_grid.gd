@tool
extends Node2D
## scenario-godot-2d dual grid (jess::codes, jEWFSv3ivTg [00:02:26 to 00:04:36]), on Godot 4.3+ TileMapLayers.
##
## The WORLD layer holds the data (what is where) and is hidden at runtime. The DISPLAY layer is
## shifted by minus half a tile, so each display cell sits on a corner of four world cells and picks
## one of 16 tiles from them: index = TL*1 + TR*2 + BL*4 + BR*8, atlas coords (index % 4, index / 4)
## in a 4x4 atlas (gd_2d.make_dual_grid_atlas writes one in that order). Display cell d reads world
## cells d + (-1,-1), (0,-1), (-1,0), (0,0); a world cell c touches display cells c + (0,0), (1,0),
## (0,1), (1,1) (plus going world to display, minus going back: the sign rule in the video).
##
##   dual.world = $World; dual.display = $Display; dual.rebuild()
##   dual.set_world_cell(Vector2i(4, 2), true)    # updates the 4 display cells it touches

@export var world: TileMapLayer
@export var display: TileMapLayer
@export var display_source_id: int = 0
## Which world cells count as terrain: any tile (source >= 0) by default.
@export var world_source_id: int = -1
@export var hide_world_at_runtime: bool = true

const WORLD_FROM_DISPLAY := [Vector2i(-1, -1), Vector2i(0, -1), Vector2i(-1, 0), Vector2i(0, 0)]   # TL TR BL BR
const DISPLAY_FROM_WORLD := [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]


func _ready() -> void:
	if world and display:
		_align()
		if hide_world_at_runtime and not Engine.is_editor_hint():
			world.visible = false
		rebuild()


func _align() -> void:
	var t: Vector2i = world.tile_set.tile_size if world.tile_set else Vector2i(16, 16)
	display.position = world.position - Vector2(t) * 0.5


func is_terrain(c: Vector2i) -> bool:
	var sid := world.get_cell_source_id(c)
	return sid >= 0 and (world_source_id < 0 or sid == world_source_id)


func display_index(d: Vector2i) -> int:
	var idx := 0
	for i in 4:
		if is_terrain(d + WORLD_FROM_DISPLAY[i]):
			idx |= 1 << i
	return idx


func update_display_cell(d: Vector2i) -> void:
	var idx := display_index(d)
	if idx == 0:
		display.erase_cell(d)
	else:
		display.set_cell(d, display_source_id, Vector2i(idx % 4, idx / 4))


func set_world_cell(c: Vector2i, solid: bool, atlas: Vector2i = Vector2i(3, 3)) -> void:
	if solid:
		world.set_cell(c, display_source_id, atlas)
	else:
		world.erase_cell(c)
	for o in DISPLAY_FROM_WORLD:
		update_display_cell(c + o)


func rebuild() -> int:
	display.clear()
	var touched := {}
	for c in world.get_used_cells():
		for o in DISPLAY_FROM_WORLD:
			touched[c + o] = true
	for d in touched:
		update_display_cell(d)
	return touched.size()
