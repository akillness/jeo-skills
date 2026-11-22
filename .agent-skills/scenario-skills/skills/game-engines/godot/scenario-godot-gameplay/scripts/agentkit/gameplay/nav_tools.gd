extends RefCounted
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): navmesh baking from code, map-sync wait, path checks.
##
##   const Nav = preload("res://addons/agentkit/gameplay/nav_tools.gd")
##   var nm := Nav.make_navmesh({"agent_radius": 0.4, "source": "group", "group": "nav_source"})
##   var r := Nav.bake(nm, level_root)          # parse_source_geometry_data + bake_from_source_geometry_data
##   region.navigation_mesh = nm
##   var frames := await Nav.wait_map_ready(tree, region.get_navigation_map())
##
## NavigationServer3D.region_bake_navigation_mesh() is deprecated in 4.7.2; the parse + bake pair
## (or bake_from_source_geometry_data_async) is the current API (version deltas section 8).

const PARSED := {"meshes": NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES,
		"colliders": NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS,
		"both": NavigationMesh.PARSED_GEOMETRY_BOTH}
const SOURCE := {"root": NavigationMesh.SOURCE_GEOMETRY_ROOT_NODE_CHILDREN,
		"group": NavigationMesh.SOURCE_GEOMETRY_GROUPS_WITH_CHILDREN,
		"group_explicit": NavigationMesh.SOURCE_GEOMETRY_GROUPS_EXPLICIT}


## A NavigationMesh with the agent dimensions and the source filter set. Keys: agent_radius,
## agent_height, agent_max_climb, agent_max_slope, cell_size, cell_height, parsed (meshes|colliders|both),
## source (root|group|group_explicit), group, collision_mask.
static func make_navmesh(opts: Dictionary = {}) -> NavigationMesh:
	var nm := NavigationMesh.new()
	nm.agent_radius = float(opts.get("agent_radius", 0.4))
	nm.agent_height = float(opts.get("agent_height", 1.8))
	nm.agent_max_climb = float(opts.get("agent_max_climb", 0.3))
	nm.agent_max_slope = float(opts.get("agent_max_slope", 45.0))
	# Cell size must match the map's (navigation/3d/default_cell_size, 0.25 in 4.7.2) or the server warns.
	nm.cell_size = float(opts.get("cell_size", ProjectSettings.get_setting("navigation/3d/default_cell_size", 0.25)))
	nm.cell_height = float(opts.get("cell_height", ProjectSettings.get_setting("navigation/3d/default_cell_height", 0.25)))
	nm.geometry_parsed_geometry_type = PARSED.get(str(opts.get("parsed", "colliders")), NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS)
	nm.geometry_source_geometry_mode = SOURCE.get(str(opts.get("source", "root")), NavigationMesh.SOURCE_GEOMETRY_ROOT_NODE_CHILDREN)
	nm.geometry_source_group_name = StringName(str(opts.get("group", "nav_source")))
	nm.geometry_collision_mask = int(opts.get("collision_mask", 0xFFFFFFFF))
	return nm


## Parse source geometry under `root` and bake synchronously. Returns timings and counts.
static func bake(nm: NavigationMesh, root: Node) -> Dictionary:
	var src := NavigationMeshSourceGeometryData3D.new()
	var t0 := Time.get_ticks_usec()
	NavigationServer3D.parse_source_geometry_data(nm, src, root)
	var t1 := Time.get_ticks_usec()
	NavigationServer3D.bake_from_source_geometry_data(nm, src)
	var t2 := Time.get_ticks_usec()
	return {"parse_ms": (t1 - t0) / 1000.0, "bake_ms": (t2 - t1) / 1000.0,
			"source_vertices": src.get_vertices().size() / 3, "source_has_data": src.has_data(),
			"polygons": nm.get_polygon_count(), "vertices": nm.get_vertices().size()}


## Wait until the map has synchronised at least once (iteration id > 0) and, when `changed_from`
## is given, until it moved past that id. Paths queried before that come back empty.
static func wait_map_ready(tree: SceneTree, map: RID, max_frames: int = 30, changed_from: int = -1) -> int:
	var frames := 0
	while frames < max_frames:
		var it := NavigationServer3D.map_get_iteration_id(map)
		if it > 0 and (changed_from < 0 or it > changed_from):
			return frames
		await tree.physics_frame
		frames += 1
	return -1


## Region and map iteration ids, read before assigning a new navigation_mesh.
static func iteration_ids(region: NavigationRegion3D) -> Dictionary:
	return {"region": NavigationServer3D.region_get_iteration_id(region.get_rid()),
			"map": NavigationServer3D.map_get_iteration_id(region.get_navigation_map())}


## After `region.navigation_mesh = new_mesh`: wait until the region took the new mesh (region
## iteration id moved past `before.region`, async in 4.5+) AND the map synced after that. Waiting on
## the map id alone is not enough: it can tick while the region still serves the old polygons
## (observed 4.7.2: map id changed after 2 physics frames, old hole still there; see procedures G1).
static func wait_applied(tree: SceneTree, region: NavigationRegion3D, before: Dictionary, max_frames: int = 60) -> int:
	var frames := 0
	var rid := region.get_rid()
	var map := region.get_navigation_map()
	while frames < max_frames and NavigationServer3D.region_get_iteration_id(rid) <= int(before["region"]):
		await tree.physics_frame
		frames += 1
	var m0 := NavigationServer3D.map_get_iteration_id(map)
	while frames < max_frames and NavigationServer3D.map_get_iteration_id(map) <= m0:
		await tree.physics_frame
		frames += 1
	return frames if frames < max_frames else -1


## Length of a polyline.
static func path_length(path: PackedVector3Array) -> float:
	var d := 0.0
	for i in range(1, path.size()):
		d += path[i - 1].distance_to(path[i])
	return d


## True when a straight segment (XZ) crosses an AABB (sampled every `step` m).
static func segment_hits_aabb(a: Vector3, b: Vector3, box: AABB, step: float = 0.1) -> bool:
	var n := maxi(1, int(a.distance_to(b) / step))
	var flat := AABB(Vector3(box.position.x, -1000.0, box.position.z), Vector3(box.size.x, 2000.0, box.size.z))
	for i in range(n + 1):
		if flat.has_point(a.lerp(b, float(i) / n)):
			return true
	return false


## Number of path segments crossing any of the AABBs (0 means the path goes around them).
static func path_hits(path: PackedVector3Array, boxes: Array) -> int:
	var hits := 0
	for i in range(1, path.size()):
		for box in boxes:
			if segment_hits_aabb(path[i - 1], path[i], box):
				hits += 1
	return hits
