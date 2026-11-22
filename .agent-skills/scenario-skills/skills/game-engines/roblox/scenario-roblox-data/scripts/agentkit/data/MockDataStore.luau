--!nonstrict
-- MockDataStore: a stand-in for DataStoreService and MessagingService with the engine's method
-- names, argument order and return shapes, plus a shared backend so several simulated servers
-- contend for the same keys. Runs in Studio (any data model) and in Lune: it only uses task, os,
-- math, string, table, utf8. Nothing is written to Roblox.
--
--   local backend = Mock.newBackend({ seed = 7, latency = { 0.002, 0.01 }, encode = jsonEncode, task = task })
--   local server = backend:server({ jobId = "A", players = 20 })
--   local store = server.DataStoreService:GetDataStore("PlayerData")
--   store:UpdateAsync("Player_1", function(old, keyInfo) return (old or 0) + 1 end)
--   backend:setFault("UpdateAsync", "ghost", 0.2)   -- write lands, call errors (unknown outcome)
--   backend:setFault("*", "error", 1)               -- outage
--   backend:advance(3600)                           -- virtual clock: cache, versions, lock ages
--   server:crash()                                  -- every later call from this server hangs
--
-- Engine behaviors reproduced (sources: creator-docs data-stores pages, GlobalDataStore.yaml):
--   UpdateAsync re-runs the transform when another writer committed in between; the transform
--   must not yield; returning nil cancels the write. GetAsync caches 4 s per store instance;
--   UseCache = false bypasses it. One retained version per key per UTC hour. Values must be
--   JSON-serializable, valid UTF-8, at most 4,194,304 characters. Per-server budgets
--   (60 + 40 x players read and write...) and experience budgets (300 + CCU x 40 read, x 20 write)
--   as token buckets; a throttled request waits in a queue of 30, then errors 301 to 306.
--   Per-key throughput 25 MB/min read, 4 MB/min write, rounded up to whole KB per request.
-- Simplifications (not engine facts): bucket capacity equals the per-minute limit, there is no
-- startup burst, error texts are "<code>: <doc message>", MB = 1,024 KB.

local Mock = {}

local MAX_VALUE = 4194304
local CACHE_SECONDS = 4
local QUEUE_LIMIT = 30
local KEY_READ_KB = 25 * 1024
local KEY_WRITE_KB = 4 * 1024

local QUEUE_CODE = { GetAsync = 301, SetAsync = 302, IncrementAsync = 303, UpdateAsync = 304, GetSortedAsync = 305, RemoveAsync = 306 }

-- Request type -> {base, perPlayer} per server, and {base, perCCU} per experience.
local SERVER_LIMITS = {
	StandardRead = { 60, 40 }, StandardWrite = { 60, 40 }, StandardList = { 5, 2 }, StandardRemove = { 60, 40 },
	OrderedRead = { 60, 40 }, OrderedWrite = { 30, 5 }, OrderedList = { 5, 2 }, OrderedRemove = { 30, 5 },
}
local EXPERIENCE_LIMITS = {
	StandardRead = { 300, 40 }, StandardWrite = { 300, 20 }, StandardList = { 300, 2 }, StandardRemove = { 300, 40 },
	OrderedRead = { 300, 40 }, OrderedWrite = { 300, 20 }, OrderedList = { 300, 2 }, OrderedRemove = { 300, 40 },
}
-- Legacy Enum.DataStoreRequestType names mapped to the 2026 request types.
local LEGACY = {
	GetAsync = "StandardRead", SetIncrementAsync = "StandardWrite", GetSortedAsync = "OrderedList",
	SetIncrementSortedAsync = "OrderedWrite", ListAsync = "StandardList", GetVersionAsync = "StandardRead",
}

local function fail(code, message)
	error(if code then tostring(code) .. ": " .. message else message, 0)
end

local function deepCopy(v, seen)
	if type(v) ~= "table" then
		return v
	end
	seen = seen or {}
	if seen[v] then
		return seen[v]
	end
	local out = {}
	seen[v] = out
	for k, x in pairs(v) do
		out[deepCopy(k, seen)] = deepCopy(x, seen)
	end
	return out
end
Mock.deepCopy = deepCopy

local function newRng(seed)
	local s = math.floor(seed or 1) % 2147483647
	if s <= 0 then
		s += 2147483646
	end
	return function()
		s = (s * 16807) % 2147483647
		return (s - 1) / 2147483646
	end
end

-- Returns nil when the value can be stored, else (code, message) like the engine's 103/104/105.
-- The same rules as DataCheck.value, kept local so this module has no requires.
local function unstorable(v, seen, depth)
	local t = typeof(v)
	if t == "nil" or t == "boolean" or t == "buffer" then
		return nil
	elseif t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then
			return 104, "Can't store non-finite number in DataStore."
		end
		return nil
	elseif t == "string" then
		if utf8.len(v) == nil then
			return 104, "Can't store invalid UTF-8 string in DataStore."
		end
		return nil
	elseif t ~= "table" then
		return 104, "Can't store " .. t .. " in DataStore."
	end
	if seen[v] then
		return 104, "Can't store cyclic table in DataStore."
	end
	if depth > 100 then
		return 104, "Can't store table nested deeper than 100 in DataStore."
	end
	seen[v] = true
	local n, numeric, other = 0, 0, 0
	for k, x in pairs(v) do
		n += 1
		local kt = type(k)
		if kt == "number" then
			numeric += 1
		elseif kt == "string" then
			other += 1
			if utf8.len(k) == nil then
				return 104, "Can't store invalid UTF-8 key in DataStore."
			end
		else
			return 104, "Can't store table with " .. typeof(k) .. " key in DataStore."
		end
		local code, msg = unstorable(x, seen, depth + 1)
		if code then
			return code, msg
		end
	end
	seen[v] = nil
	if numeric > 0 and other > 0 then
		return 104, "Can't store mixed table (number and string keys) in DataStore."
	end
	if numeric > 0 and numeric ~= #v then
		return 104, "Can't store sparse array in DataStore."
	end
	return nil
end
Mock.unstorable = function(v)
	return unstorable(v, {}, 0)
end

local function defaultEncoder()
	local ok, http = pcall(function()
		return game:GetService("HttpService")
	end)
	if ok and http then
		return function(v)
			return http:JSONEncode(v)
		end
	end
	return nil
end

local function utcHour(epoch)
	return math.floor(epoch / 3600)
end

local function nameOf(enumOrString)
	if type(enumOrString) == "string" then
		return enumOrString
	end
	local ok, n = pcall(function()
		return enumOrString.Name
	end)
	return if ok then n else tostring(enumOrString)
end

---------------------------------------------------------------------------------------- buckets

local Bucket = {}
Bucket.__index = Bucket

local function newBucket(limitFn, now)
	return setmetatable({ limitFn = limitFn, tokens = limitFn(), last = now }, Bucket)
end

function Bucket:refill(now)
	local limit = self.limitFn()
	self.tokens = math.min(limit, self.tokens + (now - self.last) * limit / 60)
	self.last = now
end

---------------------------------------------------------------------------------------- backend

local Backend = {}
Backend.__index = Backend

function Mock.newBackend(opts: any?): any
	opts = opts or {}
	local self = setmetatable({}, Backend)
	self.rng = newRng(opts.seed or 1)
	self.latency = opts.latency or { 0, 0 }
	self.encode = opts.encode or defaultEncoder()
	assert(self.encode, "MockDataStore: pass opts.encode (a JSON encoder) outside Roblox")
	-- opts.task: a task library (Lune: require("@lune/task")); Roblox's global task by default.
	local taskLib = opts.task or task
	self.wait = opts.wait or taskLib.wait
	self.spawn = taskLib.spawn
	self.budgets = opts.budgets ~= false
	self.offset = 0
	self.epoch0 = os.time()
	self.clock0 = os.clock()
	self.stores = {} -- [storeName .. "\0" .. scope] = {kind, entries = {[key] = entry}}
	self.servers = {}
	self.faults = { error = {}, ghost = {}, conflict = {}, messageLoss = 0 }
	self.stats = { calls = {}, injected = { error = 0, ghost = 0, conflict = 0 }, queued = 0, dropped = 0, keyThrottled = 0, transformRuns = 0, messages = 0, messagesLost = 0 }
	self.topics = {} -- [topic] = {subscriptions}
	self.experience = {}
	for rt, l in pairs(EXPERIENCE_LIMITS) do
		self.experience[rt] = newBucket(function()
			return l[1] + l[2] * self:ccu()
		end, self:now())
	end
	return self
end

function Backend:now()
	return self.epoch0 + (os.clock() - self.clock0) + self.offset
end

function Backend:advance(seconds)
	self.offset += seconds
end

function Backend:ccu()
	local n = 0
	for _, s in ipairs(self.servers) do
		if not s.dead then
			n += s:playerCount()
		end
	end
	return n
end

-- kind: "error" (fails before applying), "ghost" (applies, then fails), "conflict" (another writer
-- commits between read and write, so UpdateAsync re-runs the transform). method "*" = all.
function Backend:setFault(method, kind, probability)
	assert(self.faults[kind] and kind ~= "messageLoss", "unknown fault kind " .. tostring(kind))
	self.faults[kind][method] = probability
end

function Backend:setMessageLoss(probability)
	self.faults.messageLoss = probability
end

function Backend:clearFaults()
	self.faults = { error = {}, ghost = {}, conflict = {}, messageLoss = 0 }
end

function Backend:roll(kind, method)
	local p = self.faults[kind][method] or self.faults[kind]["*"] or 0
	if p > 0 and self.rng() < p then
		self.stats.injected[kind] += 1
		return true
	end
	return false
end

function Backend:storeTable(name, scope, kind)
	local id = name .. "\0" .. (scope or "global")
	local st = self.stores[id]
	if not st then
		st = { kind = kind, entries = {} }
		self.stores[id] = st
	end
	return st
end

-- Raw view for assertions: value, entry (versions, userIds, metadata), never charged.
function Backend:peek(name, key, scope)
	local st = self.stores[name .. "\0" .. (scope or "global")]
	local e = st and st.entries[key]
	if not e or e.deleted then
		return nil, e
	end
	return deepCopy(e.value), e
end

---------------------------------------------------------------------------------------- server

local Server = {}
Server.__index = Server

function Backend:server(opts)
	opts = opts or {}
	local s = setmetatable({}, Server)
	s.backend = self
	s.jobId = opts.jobId or ("job-" .. tostring(#self.servers + 1))
	s.players = opts.players or 0
	s.dead = false
	s.calls = 0
	s.queues = {}
	s.dataStores = {}
	s.buckets = {}
	for rt, l in pairs(SERVER_LIMITS) do
		s.buckets[rt] = newBucket(function()
			return l[1] + l[2] * s:playerCount()
		end, self:now())
	end
	s.DataStoreService = Mock.dataStoreService(s)
	s.MessagingService = Mock.messagingService(s)
	table.insert(self.servers, s)
	return s
end

function Server:playerCount()
	if type(self.players) == "function" then
		return self.players()
	end
	return self.players
end

-- A crashed server never completes another request: calls from it suspend forever.
function Server:crash()
	self.dead = true
	for _, subs in pairs(self.backend.topics) do
		for i = #subs, 1, -1 do
			if subs[i].server == self then
				table.remove(subs, i)
			end
		end
	end
end

function Server:hangIfDead()
	if self.dead then
		coroutine.yield()
		coroutine.yield() -- never resumed
	end
end

function Server:sleep()
	local b = self.backend
	local lo, hi = b.latency[1], b.latency[2]
	local d = lo + (hi - lo) * b.rng()
	if d > 0 then
		b.wait(d)
	end
	self:hangIfDead()
end

-- Charge one request of `rt` (server and experience buckets); wait in the method queue if empty.
function Server:charge(method, rt, silent)
	local b = self.backend
	if not silent then
		b.stats.calls[method] = (b.stats.calls[method] or 0) + 1
		self.calls += 1
	end
	if not b.budgets then
		return
	end
	local function ready()
		local now = b:now()
		local sb, eb = self.buckets[rt], b.experience[rt]
		sb:refill(now)
		eb:refill(now)
		return sb.tokens >= 1 and eb.tokens >= 1, sb, eb
	end
	local ok, sb, eb = ready()
	if not ok then
		local q = self.queues[method] or 0
		if q >= QUEUE_LIMIT then
			b.stats.dropped += 1
			fail(QUEUE_CODE[method] or 302, method .. " request dropped. Request was throttled but queue was full.")
		end
		self.queues[method] = q + 1
		b.stats.queued += 1
		repeat
			b.wait(0.02)
			self:hangIfDead()
			ok, sb, eb = ready()
		until ok
		self.queues[method] -= 1
	end
	sb.tokens -= 1
	eb.tokens -= 1
end

function Server:budget(requestType)
	local rt = nameOf(requestType)
	rt = LEGACY[rt] or rt
	if rt == "UpdateAsync" then
		return math.min(self:budget("StandardRead"), self:budget("StandardWrite"))
	end
	local bucket = self.buckets[rt]
	if not bucket then
		fail(nil, "MockDataStore: unknown request type " .. tostring(rt))
	end
	bucket:refill(self.backend:now())
	return math.floor(bucket.tokens)
end

-- Per-key throughput, trailing 60 s, shared by all servers. Waits (counted as keyThrottled) when over.
function Server:throughput(storeTable, key, kind, bytes)
	local b = self.backend
	local kb = math.max(1, math.ceil(bytes / 1024))
	local limit = if kind == "write" then KEY_WRITE_KB else KEY_READ_KB
	storeTable.windows = storeTable.windows or {}
	local win = storeTable.windows[key]
	if not win then
		win = {}
		storeTable.windows[key] = win
	end
	local waited = false
	while true do
		local now = b:now()
		local used = 0
		for i = #win, 1, -1 do
			local w = win[i]
			if now - w.t > 60 then
				table.remove(win, i)
			elseif w.kind == kind then
				used += w.kb
			end
		end
		if used + kb <= limit or used == 0 then
			table.insert(win, { t = now, kb = kb, kind = kind })
			return
		end
		if not waited then
			b.stats.keyThrottled += 1
			waited = true
		end
		b.wait(0.02)
		self:hangIfDead()
	end
end

---------------------------------------------------------------------------------------- key info

local function keyInfo(e)
	local userIds, metadata = deepCopy(e.userIds or {}), deepCopy(e.metadata or {})
	return {
		Version = e.version,
		CreatedTime = math.floor(e.created * 1000),
		UpdatedTime = math.floor(e.updated * 1000),
		GetUserIds = function()
			return deepCopy(userIds)
		end,
		GetMetadata = function()
			return deepCopy(metadata)
		end,
	}
end

local function metadataFrom(options)
	if options == nil then
		return nil
	end
	local ok, md = pcall(function()
		return options:GetMetadata()
	end)
	if ok then
		return md
	end
	return options.Metadata
end

---------------------------------------------------------------------------------------- data store

local Store = {}
Store.__index = Store

local function checkKey(key)
	if type(key) ~= "string" and type(key) ~= "number" then
		fail(nil, "Argument 1 missing or nil")
	end
	key = tostring(key)
	if #key == 0 then
		fail(101, "Key name can't be empty.")
	elseif #key > 50 then
		fail(102, "Key name exceeds the 50 character limit.")
	end
	return key
end

function Store:serialize(value)
	local code, msg = unstorable(value, {}, 0)
	if code then
		fail(code, msg)
	end
	local s = self.server.backend.encode(value)
	if #s > MAX_VALUE then
		fail(105, "Serialized value exceeds 4194304 limit.")
	end
	return s
end

function Store:entry(key)
	return self.table.entries[key]
end

-- Write `value` to `key` as one committed version. Keeps one version per UTC hour.
function Store:commit(key, value, userIds, metadata, bytes)
	local b = self.server.backend
	local now = b:now()
	local e = self.table.entries[key]
	if not e then
		e = { created = now, versions = {}, counter = 0 }
		self.table.entries[key] = e
	end
	e.counter += 1
	e.version = string.format("%08d.%s", e.counter, self.server.jobId)
	e.value = deepCopy(value)
	e.userIds = deepCopy(userIds)
	e.metadata = deepCopy(metadata)
	e.updated = now
	e.deleted = value == nil
	e.bytes = bytes or 0
	local last = e.versions[#e.versions]
	local record = { Version = e.version, CreatedTime = math.floor(now * 1000), IsDeleted = e.deleted, value = deepCopy(value), userIds = deepCopy(userIds), metadata = deepCopy(metadata) }
	if last and utcHour(last.CreatedTime / 1000) == utcHour(now) then
		e.versions[#e.versions] = record -- same UTC hour: the backup is overwritten
	else
		table.insert(e.versions, record)
	end
	self.cache[key] = { value = deepCopy(value), info = keyInfo(e), t = now }
	return e
end

function Store:begin(method, rt)
	local s = self.server
	s:hangIfDead()
	s:charge(method, rt)
	s:sleep()
	if s.backend:roll("error", method) then
		fail(502, "API Services rejected the request with error 500 (mock injected).")
	end
end

function Store:ghost(method)
	if self.server.backend:roll("ghost", method) then
		fail(502, "API Services rejected the request with error 504 (mock injected; the write was applied).")
	end
end

function Store:GetAsync(key, options)
	key = checkKey(key)
	local useCache = not (options ~= nil and options.UseCache == false)
	local c = self.cache[key]
	if useCache and c and self.server.backend:now() - c.t < CACHE_SECONDS then
		self.server.backend.stats.calls.GetAsyncCached = (self.server.backend.stats.calls.GetAsyncCached or 0) + 1
		return deepCopy(c.value), c.info
	end
	self:begin("GetAsync", self.readType)
	local e = self:entry(key)
	self.server:throughput(self.table, key, "read", (e and e.bytes) or 0)
	if not e or e.deleted then
		self.cache[key] = { value = nil, info = nil, t = self.server.backend:now() }
		return nil, nil
	end
	local info = keyInfo(e)
	self.cache[key] = { value = deepCopy(e.value), info = info, t = self.server.backend:now() }
	return deepCopy(e.value), info
end

function Store:SetAsync(key, value, userIds, options)
	key = checkKey(key)
	local s = self:serialize(value)
	value = deepCopy(value)
	self:begin("SetAsync", self.writeType)
	self.server:throughput(self.table, key, "write", #s)
	local e = self:commit(key, value, userIds, metadataFrom(options), #s)
	self:ghost("SetAsync")
	return e.version
end

function Store:IncrementAsync(key, delta, userIds, options)
	key = checkKey(key)
	delta = delta or 1
	if type(delta) ~= "number" or delta % 1 ~= 0 then
		fail(nil, "IncrementAsync delta must be an integer")
	end
	self:begin("IncrementAsync", self.writeType)
	local e = self:entry(key)
	local old = if e and not e.deleted then e.value else 0
	if type(old) ~= "number" then
		fail(nil, "IncrementAsync: value is not a number")
	end
	local new = old + delta
	e = self:commit(key, new, userIds or (e and e.userIds), metadataFrom(options) or (e and e.metadata), #tostring(new))
	self:ghost("IncrementAsync")
	return new
end

function Store:UpdateAsync(key, transform)
	key = checkKey(key)
	assert(type(transform) == "function", "Argument 2 missing or nil")
	local b = self.server.backend
	self:begin("UpdateAsync", self.readType)
	self.server:charge("UpdateAsync", self.writeType, true)
	for _ = 1, 50 do
		local e = self:entry(key)
		local seenVersion = e and e.version
		local current = if e and not e.deleted then deepCopy(e.value) else nil
		local info = if e and not e.deleted then keyInfo(e) else nil
		b.stats.transformRuns += 1
		local co = coroutine.create(transform)
		local ok, newValue, userIds, metadata = coroutine.resume(co, current, info)
		if not ok then
			error(newValue, 0)
		end
		if coroutine.status(co) ~= "dead" then
			fail(nil, "UpdateAsync transform function yielded; transform functions cannot yield")
		end
		if newValue == nil then
			return nil, nil -- write cancelled
		end
		-- The engine serializes the returned value before it yields: later edits must not leak in.
		newValue = deepCopy(newValue)
		local s = self:serialize(newValue)
		self.server:throughput(self.table, key, "write", #s)
		if b:roll("conflict", "UpdateAsync") then
			-- Another server commits between our read and our write.
			local other = self:entry(key)
			self:commit(key, other and other.value, other and other.userIds, other and other.metadata, other and other.bytes)
		end
		self.server:sleep()
		local now = self:entry(key)
		if (now and now.version) == seenVersion then
			local committed = self:commit(key, newValue, userIds, metadata, #s)
			self:ghost("UpdateAsync")
			return deepCopy(newValue), keyInfo(committed)
		end
		-- version moved: the engine calls the transform again with the newer value
	end
	fail(nil, "UpdateAsync: too many conflicting writers")
	return nil, nil
end

function Store:RemoveAsync(key)
	key = checkKey(key)
	self:begin("RemoveAsync", self.removeType)
	local e = self:entry(key)
	if not e or e.deleted then
		return nil, nil
	end
	local old, info = deepCopy(e.value), keyInfo(e)
	self:commit(key, nil, nil, nil, 0)
	self:ghost("RemoveAsync")
	return old, info
end

function Store:GetVersionAsync(key, version)
	key = checkKey(key)
	self:begin("GetVersionAsync", "StandardRead")
	local e = self:entry(key)
	for _, v in ipairs(e and e.versions or {}) do
		if v.Version == version then
			if v.IsDeleted then
				return nil, nil
			end
			return deepCopy(v.value), keyInfo({ version = v.Version, created = e.created, updated = v.CreatedTime / 1000, userIds = v.userIds, metadata = v.metadata })
		end
	end
	fail(nil, "GetVersionAsync: version is not valid")
	return nil, nil
end

-- Pages of {Version, CreatedTime, IsDeleted}; sortDirection Enum.SortDirection or "Ascending"/"Descending".
function Store:ListVersionsAsync(key, sortDirection, minDate, maxDate, pageSize)
	key = checkKey(key)
	self:begin("ListVersionsAsync", "StandardList")
	local e = self:entry(key)
	local items = {}
	for _, v in ipairs(e and e.versions or {}) do
		if (not minDate or minDate == 0 or v.CreatedTime >= minDate) and (not maxDate or maxDate == 0 or v.CreatedTime <= maxDate) then
			table.insert(items, { Version = v.Version, CreatedTime = v.CreatedTime, IsDeleted = v.IsDeleted })
		end
	end
	if tostring(sortDirection):find("Descending") then
		table.sort(items, function(a, b2)
			return a.CreatedTime > b2.CreatedTime
		end)
	end
	return Mock.pages(items, pageSize or 1024)
end

function Mock.pages(items: any, pageSize: number): any
	local p = { index = 1, pageSize = math.max(1, pageSize), items = items }
	p.IsFinished = #items <= p.pageSize
	function p:GetCurrentPage()
		local out = {}
		for i = self.index, math.min(#self.items, self.index + self.pageSize - 1) do
			table.insert(out, self.items[i])
		end
		return out
	end
	function p:AdvanceToNextPageAsync()
		self.index += self.pageSize
		self.IsFinished = self.index + self.pageSize > #self.items
	end
	return p
end

---------------------------------------------------------------------------------------- ordered

local Ordered = setmetatable({}, { __index = Store })
Ordered.__index = Ordered

local function checkInteger(value)
	if type(value) ~= "number" or value % 1 ~= 0 or value ~= value then
		fail(103, "Can't allow non-integer in OrderedDataStore.")
	end
end

function Ordered:SetAsync(key, value)
	key = checkKey(key)
	checkInteger(value)
	self:begin("SetAsync", "OrderedWrite")
	self:commit(key, value, nil, nil, #tostring(value))
	self:ghost("SetAsync")
	return nil
end

function Ordered:GetSortedAsync(ascending, pageSize, minValue, maxValue)
	pageSize = pageSize or 50
	if pageSize < 1 or pageSize > 100 then
		fail(106, "PageSize must be within a predefined range.")
	end
	if minValue ~= nil and minValue % 1 ~= 0 then
		fail(106, "MinValue must be an integer.")
	end
	if maxValue ~= nil and maxValue % 1 ~= 0 then
		fail(106, "MaxValue must be an integer.")
	end
	if minValue ~= nil and maxValue ~= nil and maxValue < minValue then
		fail(107, "MaxValue must be greater than or equal to MinValue.")
	end
	self:begin("GetSortedAsync", "OrderedList")
	local rows = {}
	for k, e in pairs(self.table.entries) do
		if not e.deleted and (minValue == nil or e.value >= minValue) and (maxValue == nil or e.value <= maxValue) then
			table.insert(rows, { key = k, value = e.value })
		end
	end
	table.sort(rows, function(a, b2)
		if a.value == b2.value then
			return a.key < b2.key
		end
		if ascending then
			return a.value < b2.value
		end
		return a.value > b2.value
	end)
	local pages = Mock.pages(rows, pageSize)
	local advance = pages.AdvanceToNextPageAsync
	local store = self
	function pages:AdvanceToNextPageAsync()
		store:begin("GetSortedAsync", "OrderedList")
		advance(self)
	end
	return pages
end

---------------------------------------------------------------------------------------- services

function Mock.dataStoreService(server: any): any
	local svc = {}
	local function get(name, scope, ordered)
		if type(name) ~= "string" or #name == 0 or #name > 50 then
			fail(nil, "DataStore name must be 1 to 50 characters")
		end
		if scope ~= nil and (type(scope) ~= "string" or #scope > 50) then
			fail(nil, "DataStore scope must be at most 50 characters")
		end
		local id = (if ordered then "O:" else "S:") .. name .. "\0" .. (scope or "global")
		local inst = server.dataStores[id]
		if inst then
			return inst
		end
		local kindPrefix = if ordered then "Ordered" else "Standard"
		inst = setmetatable({
			server = server,
			Name = name,
			table = server.backend:storeTable((if ordered then "ordered:" else "") .. name, scope, kindPrefix),
			cache = {},
			readType = kindPrefix .. "Read",
			writeType = kindPrefix .. "Write",
			removeType = kindPrefix .. "Remove",
		}, if ordered then Ordered else Store)
		server.dataStores[id] = inst
		return inst
	end
	function svc:GetDataStore(name, scope, options)
		if options ~= nil then
			local ok, all = pcall(function()
				return options.AllScopes
			end)
			if ok and all then
				fail(nil, "MockDataStore: AllScopes is not supported")
			end
		end
		return get(name, scope, false)
	end
	function svc:GetGlobalDataStore()
		return get("__global", nil, false)
	end
	function svc:GetOrderedDataStore(name, scope)
		return get(name, scope, true)
	end
	function svc:GetRequestBudgetForRequestType(requestType)
		return server:budget(requestType)
	end
	function svc:SetRateLimitForRequestType(requestType, baseLimit, perPlayerLimit)
		local rt = nameOf(requestType)
		if rt == "UpdateAsync" or rt == "OnUpdate" then
			fail(nil, "SetRateLimitForRequestType: " .. rt .. " cannot be configured")
		end
		rt = LEGACY[rt] or rt
		local bucket = server.buckets[rt]
		assert(bucket, "unknown request type " .. tostring(rt))
		bucket.limitFn = function()
			return baseLimit + perPlayerLimit * server:playerCount()
		end
		bucket.tokens = math.min(bucket.tokens, bucket.limitFn())
	end
	return svc
end

function Mock.messagingService(server: any): any
	local b = server.backend
	local svc = {}
	local function checkTopic(topic)
		if type(topic) ~= "string" or #topic < 1 or #topic > 80 then
			fail(nil, "MessagingService topic must be 1 to 80 characters")
		end
	end
	function svc:SubscribeAsync(topic, callback)
		checkTopic(topic)
		server:hangIfDead()
		server:sleep()
		local subs = b.topics[topic]
		if not subs then
			subs = {}
			b.topics[topic] = subs
		end
		local sub = { server = server, callback = callback, connected = true }
		table.insert(subs, sub)
		return {
			Disconnect = function()
				sub.connected = false
				local i = table.find(subs, sub)
				if i then
					table.remove(subs, i)
				end
			end,
		}
	end
	function svc:PublishAsync(topic, message)
		checkTopic(topic)
		server:hangIfDead()
		local code, msg = unstorable(message, {}, 0)
		if code then
			fail(nil, "PublishAsync: " .. msg)
		end
		if #b.encode({ m = message }) > 1024 then
			fail(nil, "PublishAsync: message exceeds 1kB")
		end
		server:sleep()
		local sent = b:now()
		for _, sub in ipairs(table.clone(b.topics[topic] or {})) do
			b.stats.messages += 1
			if b.faults.messageLoss > 0 and b.rng() < b.faults.messageLoss then
				b.stats.messagesLost += 1
			else
				b.spawn(function()
					server:sleep()
					if sub.connected and not sub.server.dead then
						sub.callback({ Data = deepCopy(message), Sent = sent })
					end
				end)
			end
		end
	end
	return svc
end

return Mock
