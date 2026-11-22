--!nonstrict
-- ScriptProf: the Developer Console Script Profiler, driven by code through ScriptProfilerService.
-- The service is PluginSecurity: it runs from Studio's execute_luau (playtest Server or Client),
-- never from game scripts.
--
--   ScriptProf.capture(seconds, frequency, top)  start, wait, request, stop; returns summarize() plus
--       frames (Heartbeats during the capture), msPerFrame and selfMsPerFrame per top row
--   ScriptProf.summarize(data, seconds, top)      pure: self and total time per function from the
--       profiler JSON (Categories, Nodes, Functions; durations in microseconds), top N by self time,
--       per-category totals. Runs in Lune on an exported JSON file.

local ScriptProf = {}

local function round(x, n)
	local m = 10 ^ (n or 2)
	return math.floor(x * m + 0.5) / m
end

local function label(f)
	if not f then
		return "?"
	end
	local name = f.Name or "<anonymous>"
	if f.Source then
		return string.format("%s %s:%s", name, f.Source, tostring(f.Line or "?"))
	end
	return name
end

function ScriptProf.summarize(data, seconds, top)
	top = top or 10
	local nodes = data.Nodes or {}
	local funcs = data.Functions or {}
	local selfUs, totalUs = {}, {}
	-- Children of a node are parallel arrays: FunctionIds[i] was called and produced node NodeIds[i].
	-- Recursive calls count their total time once per level (rare in game code).
	local function walk(nodeId, fid, depth)
		local node = nodes[nodeId]
		if not node or depth > 200 then
			return
		end
		local childSum = 0
		local kids = node.NodeIds or {}
		local kfids = node.FunctionIds or {}
		for i, kid in kids do
			local child = nodes[kid]
			if child then
				childSum += child.TotalDuration or 0
				walk(kid, kfids[i], depth + 1)
			end
		end
		if fid then
			selfUs[fid] = (selfUs[fid] or 0) + math.max((node.TotalDuration or 0) - childSum, 0)
			totalUs[fid] = (totalUs[fid] or 0) + (node.TotalDuration or 0)
		end
	end
	local categories = {}
	local grand = 0
	for _, cat in data.Categories or {} do
		local root = nodes[cat.NodeId]
		local us = if root then root.TotalDuration or 0 else 0
		grand += us
		table.insert(categories, { name = cat.Name, ms = round(us / 1000, 3) })
		walk(cat.NodeId, nil, 0)
	end
	table.sort(categories, function(a, b)
		return a.ms > b.ms
	end)
	local rows = {}
	for fid, us in selfUs do
		table.insert(rows, { fid = fid, selfUs = us, totalUs = totalUs[fid] or us })
	end
	table.sort(rows, function(a, b)
		return a.selfUs > b.selfUs
	end)
	local window = (seconds or 0) * 1e6
	local out = {}
	for i = 1, math.min(top, #rows) do
		local r = rows[i]
		local f = funcs[r.fid]
		table.insert(out, {
			fn = label(f),
			selfMs = round(r.selfUs / 1000, 3),
			totalMs = round(r.totalUs / 1000, 3),
			selfPct = if window > 0 then round(100 * r.selfUs / window, 2) else nil,
			native = if f and f.Flags then (f.Flags % 2) == 1 else nil,
		})
	end
	return {
		seconds = seconds,
		totalMs = round(grand / 1000, 3),
		msPerSecond = if seconds and seconds > 0 then round(grand / 1000 / seconds, 3) else nil,
		categories = categories,
		top = out,
		functions = #funcs,
	}
end

function ScriptProf.capture(seconds, frequency, top)
	seconds = seconds or 3
	frequency = frequency or 1000
	local SPS = game:GetService("ScriptProfilerService")
	local RunService = game:GetService("RunService")
	local HttpService = game:GetService("HttpService")
	local server = RunService:IsServer()
	local player = game:GetService("Players").LocalPlayer
	local json
	local conn = SPS.OnNewData:Connect(function(_, s)
		json = s
	end)
	if server then
		SPS:ServerStart(frequency)
	else
		SPS:ClientStart(player, frequency)
	end
	-- Per-frame work runs more often when frames get faster: compare fixes per frame, not per second.
	local frames = 0
	local hb = RunService.Heartbeat:Connect(function()
		frames += 1
	end)
	task.wait(seconds)
	hb:Disconnect()
	-- Request before stopping: the server profiler clears its data when a session ends.
	if server then
		SPS:ServerRequestData()
	else
		SPS:ClientRequestData(player)
	end
	local deadline = os.clock() + 10
	while not json and os.clock() < deadline do
		task.wait(0.1)
	end
	if server then
		SPS:ServerStop()
	else
		SPS:ClientStop(player)
	end
	conn:Disconnect()
	if not json then
		return { ok = false, error = "no OnNewData within 10 s" }
	end
	local data = HttpService:JSONDecode(json)
	local r = ScriptProf.summarize(data, seconds, top)
	r.ok = true
	r.jsonBytes = #json
	r.frames = frames
	if frames > 0 then
		r.msPerFrame = math.floor(r.totalMs / frames * 1000 + 0.5) / 1000
		for _, row in r.top do
			row.selfMsPerFrame = math.floor(row.selfMs / frames * 1000 + 0.5) / 1000
		end
	end
	return r
end

return ScriptProf
