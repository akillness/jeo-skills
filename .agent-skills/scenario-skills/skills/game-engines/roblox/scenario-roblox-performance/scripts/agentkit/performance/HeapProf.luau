--!nonstrict
-- HeapProf: Luau heap snapshots by code through HeapProfilerService (the Developer Console Luau Heap
-- tab's data). PluginSecurity: it runs from Studio's execute_luau (playtest Server or Client).
-- A request runs a full garbage collection first, so a snapshot is the live heap, not garbage.
--
--   HeapProf.snapshot()          decoded report of the current machine (Server, or the local client)
--   HeapProf.summary(data, top)  pure: totals and top entries per breakdown found in the report
--   HeapProf.diff(a, b, top)     pure: growth between two summaries, per breakdown entry (the leak)

local HeapProf = {}

local function round(x, n)
	local m = 10 ^ (n or 1)
	return math.floor(x * m + 0.5) / m
end

function HeapProf.snapshot()
	local HPS = game:GetService("HeapProfilerService")
	local RunService = game:GetService("RunService")
	local json
	if RunService:IsServer() then
		json = HPS:ServerRequestDataAsync()
	else
		json = HPS:ClientRequestDataAsync(game:GetService("Players").LocalPlayer)
	end
	local data = game:GetService("HttpService"):JSONDecode(json)
	data.__bytes = #json
	return data
end

-- A breakdown is any array of entries that carry a name and a size; the report nests several
-- (by value type, by memory category, by userdata class). Collect each under its key path.
local NAME_KEYS = { "Name", "name", "Category", "category", "Type", "type", "Class", "class" }
local SIZE_KEYS = { "Size", "size", "Bytes", "bytes", "TotalSize", "totalSize", "Memory", "memory" }

local function pick(t, keys)
	for _, k in keys do
		if t[k] ~= nil then
			return t[k]
		end
	end
	return nil
end

local function asEntries(v)
	-- array of {name, size}
	if type(v) ~= "table" then
		return nil
	end
	if #v > 0 and type(v[1]) == "table" then
		local out = {}
		for _, e in v do
			local n, s = pick(e, NAME_KEYS), pick(e, SIZE_KEYS)
			if type(s) ~= "number" then
				return nil
			end
			table.insert(out, { name = tostring(n), size = s, count = e.Count or e.count })
		end
		return out
	end
	-- map name -> number, or name -> {size}
	local out, any = {}, false
	for k, e in v do
		if type(k) ~= "string" then
			return nil
		end
		local s = if type(e) == "number" then e elseif type(e) == "table" then pick(e, SIZE_KEYS) else nil
		if type(s) ~= "number" then
			return nil
		end
		any = true
		table.insert(out, { name = k, size = s, count = if type(e) == "table" then e.Count or e.count else nil })
	end
	return if any then out else nil
end

function HeapProf.summary(data, top)
	top = top or 15
	local out = { bytes = data.__bytes, breakdowns = {}, keys = {} }
	for k in data do
		table.insert(out.keys, k)
	end
	table.sort(out.keys)
	local function walk(node, path, depth)
		if type(node) ~= "table" or depth > 4 then
			return
		end
		local entries = asEntries(node)
		if entries and #entries > 0 then
			table.sort(entries, function(a, b)
				return a.size > b.size
			end)
			local total = 0
			for _, e in entries do
				total += e.size
			end
			local rows = {}
			for i = 1, math.min(top, #entries) do
				rows[i] = entries[i]
			end
			out.breakdowns[path] = { total = total, n = #entries, top = rows }
			return
		end
		for k, v in node do
			if type(k) == "string" and k ~= "__bytes" then
				walk(v, if path == "" then k else path .. "." .. k, depth + 1)
			end
		end
	end
	walk(data, "", 0)
	return out
end

function HeapProf.diff(a, b, top)
	top = top or 10
	local out = {}
	for path, bb in b.breakdowns do
		local ab = a.breakdowns[path]
		local before = {}
		if ab then
			for _, e in ab.top do
				before[e.name] = e.size
			end
		end
		local rows = {}
		for _, e in bb.top do
			local d = e.size - (before[e.name] or 0)
			if d ~= 0 then
				table.insert(rows, { name = e.name, before = before[e.name] or 0, after = e.size, growth = d })
			end
		end
		table.sort(rows, function(x, y)
			return x.growth > y.growth
		end)
		local trimmed = {}
		for i = 1, math.min(top, #rows) do
			trimmed[i] = rows[i]
		end
		out[path] = {
			totalBefore = if ab then ab.total else 0,
			totalAfter = bb.total,
			growthKb = round(((bb.total) - (if ab then ab.total else 0)) / 1024, 1),
			top = trimmed,
		}
	end
	return out
end

return HeapProf
