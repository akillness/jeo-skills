--!strict
-- DebugDraw: query boxes, casts and path waypoints drawn as HandleAdornments, so a screen capture
-- shows what the server tested. Adornments are not BaseParts: no physics, never in a spatial query,
-- so a drawing cannot block the next cast (the debug-Part trap, Crusherfire EIOwGMZYidw 00:10:42).
-- Draw the visualizer before tuning (BrawlDev, u6I17z6ggUg 00:08:18).
--
--   DebugDraw.box(root.CFrame * CFrame.new(0, 0, -3.5), Vector3.new(5, 5, 5), { seconds = 1 })
--   DebugDraw.path(path:GetWaypoints())       -- spheres (jumps yellow) joined by segments
--   DebugDraw.clear()
-- Server-made adornments under Workspace replicate, so the client capture shows them. They are
-- depth-tested by default: AlwaysOnTop adornments were missing from Studio screen captures (0.743),
-- so pass onTop = true only for drawings you look at live.

local DebugDraw = {}

export type Options = {
	color: Color3?,
	seconds: number?, -- remove after this many seconds; nil keeps it until clear()
	name: string?,
	onTop: boolean?, -- AlwaysOnTop: seen through walls live, but left out of screen captures
}

DebugDraw.folder = nil :: Instance? -- defaults to Workspace.DebugDraw
DebugDraw.adornee = nil :: PVInstance? -- defaults to Workspace.Terrain: CFrame identity, so world space

local function root(): Instance
	local f = DebugDraw.folder
	if f and f.Parent then
		return f
	end
	local made = Instance.new("Folder")
	made.Name = "DebugDraw"
	made.Parent = workspace
	DebugDraw.folder = made
	return made
end

local function finish(a: HandleAdornment, opts: Options?)
	a.Adornee = DebugDraw.adornee or workspace.Terrain
	a.AlwaysOnTop = (opts and opts.onTop) == true
	a.ZIndex = 1
	a.Parent = root()
	local seconds = opts and opts.seconds
	if seconds then
		task.delay(seconds, function()
			a:Destroy()
		end)
	end
end

-- A box in world space (the adornment CFrame is relative to the adornee at the origin).
function DebugDraw.box(cf: CFrame, size: Vector3, opts: Options?): BoxHandleAdornment
	local a = Instance.new("BoxHandleAdornment")
	a.Name = (opts and opts.name) or "Box"
	a.CFrame = cf
	a.Size = size
	a.Color3 = (opts and opts.color) or Color3.fromRGB(255, 80, 80)
	a.Transparency = 0.5
	finish(a, opts)
	return a
end

function DebugDraw.point(position: Vector3, radius: number, opts: Options?): SphereHandleAdornment
	local a = Instance.new("SphereHandleAdornment")
	a.Name = (opts and opts.name) or "Point"
	a.CFrame = CFrame.new(position)
	a.Radius = radius
	a.Color3 = (opts and opts.color) or Color3.fromRGB(255, 255, 255)
	a.Transparency = 0.2
	finish(a, opts)
	return a
end

-- A line from `from` to `to` (a cast, a path segment). Nil when both ends coincide.
function DebugDraw.segment(from: Vector3, to: Vector3, opts: Options?): LineHandleAdornment?
	local length = (to - from).Magnitude
	if length < 1e-3 then
		return nil
	end
	local a = Instance.new("LineHandleAdornment")
	a.Name = (opts and opts.name) or "Segment"
	a.CFrame = CFrame.lookAt(from, to) -- the line runs along the CFrame's LookVector
	a.Length = length
	a.Thickness = 3
	a.Color3 = (opts and opts.color) or Color3.fromRGB(80, 200, 255)
	finish(a, opts)
	return a
end

-- Waypoints from Path:GetWaypoints(): white spheres, yellow where Action is Jump, segments between.
-- Returns the number of adornments made.
function DebugDraw.path(waypoints: { any }, opts: Options?): number
	local made = 0
	for i, wp in waypoints do
		local jump = wp.Action == Enum.PathWaypointAction.Jump
		DebugDraw.point(wp.Position, 0.4, {
			name = "Waypoint" .. i,
			color = if jump then Color3.fromRGB(255, 220, 0) else (opts and opts.color),
			seconds = opts and opts.seconds,
			onTop = opts and opts.onTop,
		})
		made += 1
		local nextWp = waypoints[i + 1]
		if nextWp and DebugDraw.segment(wp.Position, nextWp.Position, { seconds = opts and opts.seconds, onTop = opts and opts.onTop }) then
			made += 1
		end
	end
	return made
end

function DebugDraw.clear()
	local f = DebugDraw.folder
	if f then
		f:ClearAllChildren()
	end
end

return DebugDraw
