--!strict
-- PathGuard: the failure rules around Path:ComputeAsync and Humanoid:MoveTo, as pure decisions
-- (no engine calls, so Lune tests them).
--
--   local ok, why = PathGuard.canCompute({ airborne = humanoid.FloorMaterial == Enum.Material.Air,
--       loaded = worldReady, from = root.Position, to = goal })
--   path.Blocked:Connect(function(i) if PathGuard.shouldRecompute(i, nextIndex) then ... end end)
--   local action = PathGuard.onMoveFinished(reached, failsAtThisWaypoint) -- "next" | "retry" | "snap"

local PathGuard = {}

-- Pathfinding docs, Limitations: the goal must be within 3,000 studs of the start, and a search
-- stops after 20,000 nodes (mazes and open worlds can hit that first). A failed limit shows up as
-- a non-Success Status, not as an error.
PathGuard.MAX_STUDS = 3000
PathGuard.MAX_NODES = 20000
PathGuard.LEG_STUDS = 2500 -- legs for long trips, under the limit with margin
PathGuard.RETRIES = 1 -- MoveTo re-issues on one waypoint before the snap

export type Query = {
	airborne: boolean, -- Humanoid.FloorMaterial == Air: a path computed mid-air starts in the air
	loaded: boolean, -- the map, terrain or streamed area around both ends is present
	from: Vector3,
	to: Vector3,
}

export type MoveAction = "next" | "retry" | "snap"

-- Compute only on the ground, in a loaded world, inside the distance limit.
function PathGuard.canCompute(q: Query): (boolean, string?)
	if not q.loaded then
		return false, "world-not-loaded"
	end
	if q.airborne then
		return false, "airborne"
	end
	if (q.to - q.from).Magnitude > PathGuard.MAX_STUDS then
		return false, "too-far"
	end
	return true, nil
end

-- Long trips: intermediate goals at most `maxStuds` apart on the straight line. Fine in open
-- terrain; in a maze use authored waypoints instead, because a straight-line point can sit in a wall.
function PathGuard.legs(from: Vector3, to: Vector3, maxStuds: number?): { Vector3 }
	local limit = maxStuds or PathGuard.LEG_STUDS
	local delta = to - from
	local n = math.max(1, math.ceil(delta.Magnitude / limit))
	local out: { Vector3 } = {}
	for i = 1, n do
		out[i] = from + delta * (i / n)
	end
	return out
end

-- Path.Blocked(index): recompute only when the blocked waypoint is the next one or later; a block
-- behind the agent does not matter (Pathfinding docs, Blocked paths).
function PathGuard.shouldRecompute(blockedIndex: number, nextIndex: number): boolean
	return blockedIndex >= nextIndex
end

-- Humanoid.MoveToFinished(reached). MoveTo gives up after 8 s without arrival and fires
-- reached = false (Humanoid reference). Re-issue MoveTo once, then snap the root to THIS waypoint,
-- never to the final goal (Suphi Kaner, JyMxrcqEzu8 00:38:26).
function PathGuard.onMoveFinished(reached: boolean, failsHere: number): MoveAction
	if reached then
		return "next"
	end
	if failsHere < PathGuard.RETRIES then
		return "retry"
	end
	return "snap"
end

return PathGuard
