--!nonstrict
-- PerfProbe: windowed performance numbers from a running data model (playtest Server or Client).
-- Inline it with rbx_perf.run(..., kit=["PerfProbe"]) or require it from a ModuleScript.
--
--   PerfProbe.window(seconds, budgetMs)   per-frame samples over a window:
--       dtMs        Heartbeat delta (what players feel; capped near the frame interval)
--       jobsMs      Stats.HeartbeatTime (scheduler work per step: shows headroom while dt still reads 16.7)
--       physicsMs   Stats.PhysicsStepTime
--       renderCpuMs, renderGpuMs, frameMs (Client only)
--       each as {p50, p95, max, mean}; plus hitches (dt over 2x budget), gate, network and render means
--   PerfProbe.soak(seconds, every)        memory tags, gcinfo() and InstanceCount sampled over time,
--       with start, end, peak and a least-squares slope per minute for each series
--       gcKb is gcinfo() of the calling VM: from execute_luau it read about 0.9 MB, not the game's heap.
--       Use HeapProf for the game's Luau heap by memory category.
--   PerfProbe.gate(win, budgetMs)          {ok, reasons}: p95 at most 1.2 x budget, worst at most 2 x
--   PerfProbe.stats(list), PerfProbe.slope(xs, ys), PerfProbe.floorSlope(xs, ys, windows)
--       pure helpers (run in Lune); a leak raises the floor (per-window minima), a sawtooth does not

local PerfProbe = {}

local function round(x, n)
	local m = 10 ^ (n or 2)
	return math.floor(x * m + 0.5) / m
end

function PerfProbe.stats(list)
	local n = #list
	if n == 0 then
		return { n = 0 }
	end
	local sorted = table.clone(list)
	table.sort(sorted)
	local sum = 0
	for _, v in sorted do
		sum += v
	end
	local function pct(p)
		return sorted[math.clamp(math.ceil(n * p), 1, n)]
	end
	return {
		n = n,
		mean = round(sum / n, 3),
		p50 = round(pct(0.5), 3),
		p95 = round(pct(0.95), 3),
		max = round(sorted[n], 3),
	}
end

-- Least-squares slope of ys over xs (units of y per unit of x).
function PerfProbe.slope(xs, ys)
	local n = math.min(#xs, #ys)
	if n < 2 then
		return 0
	end
	local mx, my = 0, 0
	for i = 1, n do
		mx += xs[i]
		my += ys[i]
	end
	mx /= n
	my /= n
	local num, den = 0, 0
	for i = 1, n do
		num += (xs[i] - mx) * (ys[i] - my)
		den += (xs[i] - mx) ^ 2
	end
	if den == 0 then
		return 0
	end
	return num / den
end

-- Slope of the per-window minima: memory that grows and is collected (a sawtooth) has a flat floor;
-- a leak raises the floor. `windows` splits the series in equal parts (default 6).
function PerfProbe.floorSlope(xs, ys, windows)
	windows = windows or 6
	local n = math.min(#xs, #ys)
	if n < windows * 2 then
		return PerfProbe.slope(xs, ys)
	end
	local fx, fy = {}, {}
	local size = n // windows
	for w = 0, windows - 1 do
		local lo, hi = w * size + 1, if w == windows - 1 then n else (w + 1) * size
		local best, at = math.huge, lo
		for i = lo, hi do
			if ys[i] < best then
				best, at = ys[i], i
			end
		end
		table.insert(fx, xs[at])
		table.insert(fy, best)
	end
	return PerfProbe.slope(fx, fy)
end

function PerfProbe.gate(win, budgetMs)
	budgetMs = budgetMs or 1000 / 60
	local reasons = {}
	local dt = win.dtMs or {}
	if (dt.p95 or math.huge) > 1.2 * budgetMs then
		table.insert(reasons, string.format("p95 %.1f ms > %.1f", dt.p95 or -1, 1.2 * budgetMs))
	end
	if (dt.max or math.huge) > 2 * budgetMs then
		table.insert(reasons, string.format("worst %.1f ms > %.1f", dt.max or -1, 2 * budgetMs))
	end
	return { ok = #reasons == 0, reasons = reasons }
end

local function statNum(S, name)
	local ok, v = pcall(function()
		return S[name]
	end)
	if ok and type(v) == "number" then
		return v
	end
	return nil
end

function PerfProbe.window(seconds, budgetMs)
	seconds = seconds or 5
	budgetMs = budgetMs or 1000 / 60
	local RunService = game:GetService("RunService")
	local S = game:GetService("Stats")
	local isClient = RunService:IsClient() and not RunService:IsServer()
	local series = { dtMs = {}, jobsMs = {}, physicsMs = {} }
	if isClient then
		series.frameMs, series.renderCpuMs, series.renderGpuMs = {}, {}, {}
	end
	local sums = { send = 0, recv = 0, physSend = 0, physRecv = 0, draws = 0, tris = 0, ui = 0, shadow = 0, n = 0 }
	local conn = RunService.Heartbeat:Connect(function(dt)
		table.insert(series.dtMs, dt * 1000)
		local jobs = statNum(S, "HeartbeatTime")
		if jobs then
			table.insert(series.jobsMs, jobs * 1000)
		end
		local phys = statNum(S, "PhysicsStepTime")
		if phys then
			table.insert(series.physicsMs, phys * 1000)
		end
		sums.n += 1
		sums.send += statNum(S, "DataSendKbps") or 0
		sums.recv += statNum(S, "DataReceiveKbps") or 0
		sums.physSend += statNum(S, "PhysicsSendKbps") or 0
		sums.physRecv += statNum(S, "PhysicsReceiveKbps") or 0
		if isClient then
			local f = statNum(S, "FrameTime")
			if f then
				table.insert(series.frameMs, f * 1000)
			end
			local c = statNum(S, "RenderCPUFrameTime")
			if c then
				table.insert(series.renderCpuMs, c * 1000)
			end
			local g = statNum(S, "RenderGPUFrameTime")
			if g then
				table.insert(series.renderGpuMs, g * 1000)
			end
			sums.draws += statNum(S, "SceneDrawcallCount") or 0
			sums.tris += statNum(S, "SceneTriangleCount") or 0
			sums.ui += statNum(S, "UI2DDrawcallCount") or 0
			sums.shadow += statNum(S, "ShadowsDrawcallCount") or 0
		end
	end)
	task.wait(seconds)
	conn:Disconnect()
	local out = { context = if isClient then "Client" else "Server", seconds = seconds, budgetMs = round(budgetMs) }
	for name, list in series do
		out[name] = PerfProbe.stats(list)
	end
	local n = math.max(sums.n, 1)
	local hitches = 0
	for _, v in series.dtMs do
		if v > 2 * budgetMs then
			hitches += 1
		end
	end
	out.hitches = hitches
	out.fps = if out.dtMs.mean and out.dtMs.mean > 0 then round(1000 / out.dtMs.mean, 1) else 0
	out.net = {
		sendKbps = round(sums.send / n, 1),
		recvKbps = round(sums.recv / n, 1),
		physicsSendKbps = round(sums.physSend / n, 1),
		physicsRecvKbps = round(sums.physRecv / n, 1),
	}
	if isClient then
		out.render = {
			sceneDraws = round(sums.draws / n, 0),
			sceneTriangles = round(sums.tris / n, 0),
			uiDraws = round(sums.ui / n, 0),
			shadowDraws = round(sums.shadow / n, 0),
		}
	end
	out.physics = {
		primitives = statNum(S, "PrimitivesCount"),
		moving = statNum(S, "MovingPrimitivesCount"),
		contacts = statNum(S, "ContactsCount"),
	}
	out.gate = PerfProbe.gate(out, budgetMs)
	return out
end

local TAGS = { "LuaHeap", "Script", "Signals", "Instances", "Gui", "PhysicsCollision", "BaseParts", "GraphicsParts" }

function PerfProbe.soak(seconds, every)
	seconds = seconds or 30
	every = every or 1
	local S = game:GetService("Stats")
	local t0 = os.clock()
	local xs = {}
	local series = { gcKb = {}, instances = {} }
	for _, tag in TAGS do
		series[tag] = {}
	end
	while true do
		local t = os.clock() - t0
		table.insert(xs, t / 60)
		table.insert(series.gcKb, gcinfo())
		table.insert(series.instances, statNum(S, "InstanceCount") or 0)
		for _, tag in TAGS do
			local ok, v = pcall(function()
				return S:GetMemoryUsageMbForTag(Enum.DeveloperMemoryTag[tag])
			end)
			table.insert(series[tag], if ok then v else 0)
		end
		if t >= seconds then
			break
		end
		task.wait(every)
	end
	local out = { samples = #xs, minutes = round(xs[#xs], 3), series = {} }
	for name, ys in series do
		local peak = -math.huge
		for _, v in ys do
			peak = math.max(peak, v)
		end
		out.series[name] = {
			start = round(ys[1], 3),
			finish = round(ys[#ys], 3),
			peak = round(peak, 3),
			perMinute = round(PerfProbe.slope(xs, ys), 3),
			floorPerMinute = round(PerfProbe.floorSlope(xs, ys), 3),
		}
	end
	return out
end

return PerfProbe
