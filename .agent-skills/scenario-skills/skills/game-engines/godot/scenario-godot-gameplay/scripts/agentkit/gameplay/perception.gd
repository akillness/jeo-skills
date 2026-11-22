extends RefCounted
## scenario-godot-gameplay kit 0.1 (Godot 4.7.2): cheap-first sight test for AI.
##
## Order: squared distance, then the view cone (a dot product), then ONE ray, so most enemies are
## rejected before any physics query [added]. Once aware, the cone is skipped and the range grows to
## the lose range (hysteresis). No per-enemy vision Area3D: 200 overlapping detection areas create
## pair churn in the broadphase [added; the baseline answer says the same].
##
##   const Perception = preload("res://addons/agentkit/gameplay/perception.gd")
##   var p := Perception.sees(space, eye, -basis.z, target_pos, aware, mask, [self_rid], target_rid)

static var rays_cast := 0


static func sees(space: PhysicsDirectSpaceState3D, eye: Vector3, forward: Vector3, target: Vector3, aware: bool,
		mask: int, exclude: Array[RID], target_rid: RID, detect_range: float = 12.0, lose_range: float = 16.0,
		fov_deg: float = 110.0) -> Dictionary:
	var to := target - eye
	var d2 := to.length_squared()
	var rng := lose_range if aware else detect_range
	if d2 > rng * rng:
		return {"sees": false, "reason": "range", "dist": sqrt(d2)}
	var dist := sqrt(d2)
	if not aware and dist > 0.001:
		var flat_f := Vector3(forward.x, 0.0, forward.z).normalized()
		var flat_t := Vector3(to.x, 0.0, to.z).normalized()
		if flat_f.dot(flat_t) < cos(deg_to_rad(fov_deg * 0.5)):
			return {"sees": false, "reason": "cone", "dist": dist}
	var q := PhysicsRayQueryParameters3D.create(eye, target, mask, exclude)
	rays_cast += 1
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		return {"sees": true, "reason": "clear", "dist": dist}
	var hit_rid: RID = hit.get("rid", RID())
	if hit_rid == target_rid:
		# A body moved this frame (teleport, spawn) is still at its old place in the broadphase until
		# the next physics step: the ray can hit it there, between the eye and the new position, even
		# through a wall (observed 4.7.2, Jolt). Accept the hit only near the aim point.
		var hit_pos: Vector3 = hit.get("position", target)
		if hit_pos.distance_to(target) > 1.5:
			return {"sees": false, "reason": "stale_hit", "dist": dist}
		return {"sees": true, "reason": "target_hit", "dist": dist}
	return {"sees": false, "reason": "blocked", "dist": dist, "blocker": str(hit.get("collider", ""))}
