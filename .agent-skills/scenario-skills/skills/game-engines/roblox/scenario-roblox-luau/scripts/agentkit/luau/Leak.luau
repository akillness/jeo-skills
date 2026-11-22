--!nonstrict
-- AgentKit Leak: prove whether objects are released, without the Luau Heap GUI.
-- Runs in Studio (Server or Client data model), plain luau and Lune.
--
--   Leak.collect(rounds)                       push the GC (Roblox scripts may only call collectgarbage("count"))
--   Leak.retained(make, release, n, rounds)    how many of n objects survive release + GC pressure
--   Leak.sample(action, cycles, every)         run action `cycles` times, sample heap KB and instance count
--   Leak.slope(points)                         least-squares slope of {x, y} points (KB per cycle)

local Leak = {}

local function yield()
	if task then
		task.wait()
	end
end

function Leak.heapKb(): number
	return gcinfo()
end

-- Full collection where allowed (luau, Lune); otherwise allocate garbage so the incremental GC runs.
function Leak.collect(rounds: number?)
	-- Roblox allows only collectgarbage("count"); there _G is a plain shared table, so gc is nil.
	local gc = (_G :: any).collectgarbage
	if gc and pcall(gc, "collect") then
		gc("collect")
		return "collect"
	end
	for _ = 1, rounds or 40 do
		local junk = {}
		for i = 1, 20000 do
			junk[i] = { i }
		end
		table.clear(junk)
		yield()
	end
	return "pressure"
end

-- make(i) returns an object (table, function or Instance); release(objects) runs your cleanup.
-- Survivors are counted through a weak-keyed table, so the probe itself holds nothing.
function Leak.retained(make, release, n: number, rounds: number?)
	local weak = setmetatable({}, { __mode = "k" })
	local objects = {}
	for i = 1, n do
		local o = make(i)
		weak[o] = true
		objects[i] = o
	end
	release(objects)
	table.clear(objects)
	local mode = Leak.collect(rounds)
	local alive = 0
	for _ in weak do
		alive += 1
	end
	return { made = n, alive = alive, gc = mode }
end

function Leak.sample(action, cycles: number, every: number?)
	local step: number = every or 1
	local points = {}
	local stats = game and game:FindFirstChildOfClass("Stats")
	for c = 1, cycles do
		action(c)
		if c % step == 0 then
			yield()
			table.insert(points, {
				cycle = c,
				heapKb = gcinfo(),
				instances = if stats then (stats :: Stats).InstanceCount else nil,
			})
		end
	end
	return points
end

function Leak.slope(points, xKey: string?, yKey: string?)
	xKey, yKey = xKey or "cycle", yKey or "heapKb"
	local n, sx, sy, sxx, sxy = 0, 0, 0, 0, 0
	for _, p in points do
		local x, y = p[xKey], p[yKey]
		if x and y then
			n += 1
			sx += x
			sy += y
			sxx += x * x
			sxy += x * y
		end
	end
	if n < 2 or n * sxx - sx * sx == 0 then
		return 0
	end
	return (n * sxy - sx * sy) / (n * sxx - sx * sx)
end

return Leak
