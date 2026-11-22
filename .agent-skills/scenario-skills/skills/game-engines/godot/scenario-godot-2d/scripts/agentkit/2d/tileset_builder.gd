extends RefCounted
## scenario-godot-2d TileSet builder (Godot 4.7.2): a TileSet from an atlas PNG, built in code instead of the
## TileSet editor (terrain bit painting, polygon drawing and tile creation are viewport tools there).
##
## Job use (gd_run.run_script(P, "res://addons/agentkit/2d/tileset_builder.gd:build", args)):
##   texture       res:// path of the atlas PNG (imported)
##   tile_size     [16, 16]; margins [0, 0]; separation [0, 0]
##   out           res:// path of the .tres to write (an external TileSet, shared by every layer)
##   terrain_mode  "corners_and_sides" (47-tile blob), "sides" (16-tile 3x3 + strips), "none"
##   terrain_name  "ground"; bits "alpha" derives peering bits from the art (opaque border probes)
##   collision     "full" (tile rectangle), "alpha" (outline from the tile alpha), "none"
##   occlusion     true adds an occlusion layer with the same outline (for 2D shadows)
##   one_way       [[x, y], ...] atlas coords that get a one-way collision polygon instead
##   physics_layer 1 (1-based layer number used for collision_layer)
## Static use from your own job: var ts: TileSet = TilesetBuilder.build_tileset(cfg)

const SIDE_BITS := {
	"E": TileSet.CELL_NEIGHBOR_RIGHT_SIDE, "S": TileSet.CELL_NEIGHBOR_BOTTOM_SIDE,
	"W": TileSet.CELL_NEIGHBOR_LEFT_SIDE, "N": TileSet.CELL_NEIGHBOR_TOP_SIDE,
}
const CORNER_BITS := {
	"SE": TileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER, "SW": TileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER,
	"NW": TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER, "NE": TileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER,
}
## Mask bits shared with gd_2d.py: N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128.
const MASK := {"N": 1, "NE": 2, "E": 4, "SE": 8, "S": 16, "SW": 32, "W": 64, "NW": 128}


func build(job) -> Dictionary:
	var cfg := {
		"texture": job.arg("texture", ""),
		"tile_size": job.arg("tile_size", Vector2i(16, 16)),
		"margins": job.arg("margins", Vector2i(0, 0)),
		"separation": job.arg("separation", Vector2i(0, 0)),
		"terrain_mode": job.arg("terrain_mode", "corners_and_sides"),
		"terrain_name": job.arg("terrain_name", "ground"),
		"bits": job.arg("bits", "alpha"),
		"collision": job.arg("collision", "full"),
		"occlusion": job.arg("occlusion", false),
		"one_way": job.arg("one_way", []),
		"physics_layer": job.arg("physics_layer", 1),
		"texture_padding": job.arg("texture_padding", true),
	}
	var info := {}
	var ts := build_tileset(cfg, info)
	if ts == null:
		return {"ok": false, "error": str(info.get("error", "build failed"))}
	var out: String = job.arg("out", "res://tiles/tileset.tres")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out.get_base_dir()))
	var err := ResourceSaver.save(ts, out)
	info["saved"] = out
	info["ok"] = err == OK
	if err != OK:
		info["error"] = "ResourceSaver.save failed: " + error_string(err)
	return info


## Build the TileSet. `info` receives tile counts, the mask per tile and warnings.
static func build_tileset(cfg: Dictionary, info: Dictionary = {}) -> TileSet:
	var tex: Texture2D = load(str(cfg.get("texture", "")))
	if tex == null:
		info["error"] = "texture not found or not imported: " + str(cfg.get("texture", ""))
		return null
	var tile: Vector2i = cfg.get("tile_size", Vector2i(16, 16))
	var margins: Vector2i = cfg.get("margins", Vector2i.ZERO)
	var sep: Vector2i = cfg.get("separation", Vector2i.ZERO)
	var mode_name: String = str(cfg.get("terrain_mode", "corners_and_sides"))
	var ts := TileSet.new()
	ts.tile_size = tile                                   # set before tiles exist (docs, Using TileSets)
	ts.add_physics_layer()
	ts.set_physics_layer_collision_layer(0, 1 << (int(cfg.get("physics_layer", 1)) - 1))
	ts.set_physics_layer_collision_mask(0, 0)             # tiles sit in a layer; movers own the masks
	if cfg.get("occlusion", false):
		ts.add_occlusion_layer()
	var terrain := mode_name != "none"
	if terrain:
		ts.add_terrain_set()
		ts.set_terrain_set_mode(0, TileSet.TERRAIN_MODE_MATCH_SIDES if mode_name == "sides" else TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)
		ts.add_terrain(0)
		ts.set_terrain_name(0, 0, str(cfg.get("terrain_name", "ground")))
		ts.set_terrain_color(0, 0, Color(0.35, 0.75, 0.35))
	var src := TileSetAtlasSource.new()
	src.texture = tex
	src.margins = margins
	src.separation = sep
	src.texture_region_size = tile
	src.use_texture_padding = bool(cfg.get("texture_padding", true))
	var source_id := ts.add_source(src)                     # add before writing terrain on TileData
	var img := tex.get_image()
	if img.is_compressed():
		img.decompress()
	var grid := src.get_atlas_grid_size()
	var one_way: Array = cfg.get("one_way", [])
	var masks := {}
	var made := 0
	var half := Vector2(tile) * 0.5
	for y in grid.y:
		for x in grid.x:
			var c := Vector2i(x, y)
			var rect := Rect2i(margins + c * (tile + sep), tile)
			var sub := img.get_region(rect)
			if sub.is_invisible():
				continue                                    # fully transparent cell: no tile (as the editor does)
			src.create_tile(c)
			made += 1
			var td := src.get_tile_data(c, 0)
			var is_one_way := false
			for ow in one_way:
				if ow is Array and ow.size() >= 2 and int(ow[0]) == x and int(ow[1]) == y:
					is_one_way = true
			var outline := PackedVector2Array([-half, Vector2(half.x, -half.y), half, Vector2(-half.x, half.y)])
			if str(cfg.get("collision", "full")) == "alpha" or cfg.get("occlusion", false):
				var polys := alpha_outline(sub)
				if not polys.is_empty():
					var p: PackedVector2Array = polys[0]
					var shifted := PackedVector2Array()
					for v in p:
						shifted.append(v - half)
					if str(cfg.get("collision", "full")) == "alpha":
						outline = shifted
					if cfg.get("occlusion", false):
						var occ := OccluderPolygon2D.new()
						occ.polygon = shifted
						td.add_occluder_polygon(0)
						td.set_occluder_polygon(0, 0, occ)
			if is_one_way:
				var lip := PackedVector2Array([-half, Vector2(half.x, -half.y), Vector2(half.x, -half.y + 4), Vector2(-half.x, -half.y + 4)])
				td.add_collision_polygon(0)
				td.set_collision_polygon_points(0, 0, lip)
				td.set_collision_polygon_one_way(0, 0, true)
			elif str(cfg.get("collision", "full")) != "none":
				td.add_collision_polygon(0)
				td.set_collision_polygon_points(0, 0, outline)
			if terrain:
				td.terrain_set = 0                          # terrain_set first, then terrain, then bits
				td.terrain = 0
				var m := 0
				if str(cfg.get("bits", "alpha")) == "alpha":
					m = alpha_mask(sub)
				for k in SIDE_BITS:
					if m & MASK[k]:
						td.set_terrain_peering_bit(SIDE_BITS[k], 0)
				for k in CORNER_BITS:
					if m & MASK[k] and td.is_valid_terrain_peering_bit(CORNER_BITS[k]):
						td.set_terrain_peering_bit(CORNER_BITS[k], 0)
				masks["%d,%d" % [x, y]] = m
	info["source_id"] = source_id
	info["tiles"] = made
	info["grid"] = grid
	info["masks"] = masks
	info["terrain_mode"] = mode_name
	return ts


## Peering mask from the art: a side connects when the border band at its middle is opaque, a
## corner when the corner pixel band is opaque (probes inset 1 px). Works for terrain-versus-empty
## tilesets whose art reaches the border where it connects. Terrain-to-terrain transitions (grass to
## sand, both opaque) need a colour rule or an explicit table instead.
static func alpha_mask(sub: Image, alpha_min: float = 0.5) -> int:
	var w := sub.get_width()
	var h := sub.get_height()
	var probes := {
		"N": Vector2i(w / 2, 1), "S": Vector2i(w / 2, h - 2), "W": Vector2i(1, h / 2), "E": Vector2i(w - 2, h / 2),
		"NW": Vector2i(1, 1), "NE": Vector2i(w - 2, 1), "SW": Vector2i(1, h - 2), "SE": Vector2i(w - 2, h - 2),
	}
	var m := 0
	for k in probes:
		if sub.get_pixelv(probes[k]).a >= alpha_min:
			m |= MASK[k]
	return m


## Outline polygons of the opaque pixels of one tile image, in tile pixel coordinates (0..size).
static func alpha_outline(sub: Image, epsilon: float = 1.0) -> Array:
	var bm := BitMap.new()
	bm.create_from_image_alpha(sub, 0.5)
	return bm.opaque_to_polygons(Rect2i(Vector2i.ZERO, sub.get_size()), epsilon)
