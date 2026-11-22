--!nonstrict
-- KeyQueue: DataStore calls in order per key, with bounded retries, backoff and jitter, and a
-- no-cache read that settles writes whose outcome is unknown. Use it for stores you call
-- yourself (trade log, leaderboards, global config). ProfileStore already does this for profiles.
--
--   local q = KeyQueue.new(DataStoreService:GetDataStore("TradeLog"))
--   local ok, value = q:UpdateAsync(tradeId, function(old) return old or "committed" end)
--   local ok2, v2 = q:UpdateAsync("Counter", function(old) ... end, function(stored) return applied(stored) end)
--
-- Rules (Roblox docs, player-data-purchasing and error-codes-and-limits):
--   * A retry must not overtake a newer request on the same key, or old data overwrites new data.
--   * A failed write may still have been applied: read with UseCache = false before redoing a
--     write that is not idempotent (pass `verify`).
--   * 101-107, 403, 509, 511-513 are bugs or config: never retry. 401/402: the server is closing.
-- Returns `ok, result_or_error` like the official DataStoreWrapper sample.

local KeyQueue = {}
KeyQueue.__index = KeyQueue

local NO_RETRY = {
	[101] = "bad key", [102] = "key too long", [103] = "value not allowed", [104] = "value not serializable",
	[105] = "value too large", [106] = "bad ordered args", [107] = "bad ordered range",
	[401] = "server shutting down", [402] = "server shutting down", [403] = "Studio API access off",
	[509] = "writes blocked on personal server", [511] = "metadata too large", [512] = "too many user ids",
	[513] = "bad user id or metadata",
}

-- "retry" | "fatal", plus a short reason. Unknown errors are retried (bounded).
function KeyQueue.classify(err: any): (string, string?)
	local msg = tostring(err)
	local code = tonumber(msg:match("^(%d%d%d):")) or tonumber(msg:match("%f[%d](%d%d%d)%f[%D]"))
	if code and NO_RETRY[code] then
		return "fatal", NO_RETRY[code]
	end
	if msg:find("must publish", 1, true) or msg:find("cannot yield", 1, true) then
		return "fatal", "configuration or code error"
	end
	if code and code >= 301 and code <= 306 then
		return "retry", "throttle queue full"
	end
	if msg:find("Throttled", 1, true) then
		return "retry", "throttled"
	end
	return "retry", if code then "server error " .. code else "unknown"
end

local function defaultNoCache()
	local ok, o = pcall(function()
		local opt = Instance.new("DataStoreGetOptions")
		opt.UseCache = false
		return opt
	end)
	if ok then
		return o
	end
	return { UseCache = false }
end

function KeyQueue.new(store: any, opts: any?): any
	opts = opts or {}
	local self = setmetatable({}, KeyQueue)
	self.store = store
	self.attempts = opts.attempts or 5
	self.base = opts.base or 1
	self.maxDelay = opts.maxDelay or 32
	local taskLib = opts.task or task -- Lune: pass require("@lune/task")
	self.wait = opts.wait or taskLib.wait
	self.spawn = taskLib.spawn
	self.random = opts.random or math.random
	self.noCache = opts.noCache or defaultNoCache()
	self.onRetry = opts.onRetry
	self.queues = {}
	self.stats = { calls = 0, retries = 0, verified = 0, fatal = 0, exhausted = 0 }
	return self
end

function KeyQueue:Length(key)
	local q = self.queues[key]
	return if q then #q else 0
end

-- Run fn as the next job for `key`; yields until every earlier job for that key has finished.
function KeyQueue:_serial(key, fn)
	local q = self.queues[key]
	if not q then
		q = {}
		self.queues[key] = q
	end
	local me = coroutine.running()
	table.insert(q, me)
	while q[1] ~= me do
		coroutine.yield()
	end
	local results = table.pack(pcall(fn))
	table.remove(q, 1)
	if q[1] then
		self.spawn(q[1])
	else
		self.queues[key] = nil
	end
	if not results[1] then
		error(results[2], 0)
	end
	return table.unpack(results, 2, results.n)
end

function KeyQueue:_attempt(key, method, args, verify)
	self.stats.calls += 1
	local lastErr
	for attempt = 1, self.attempts do
		local res = table.pack(pcall(self.store[method], self.store, table.unpack(args, 1, args.n)))
		if res[1] then
			return true, table.unpack(res, 2, res.n)
		end
		lastErr = res[2]
		local kind, reason = KeyQueue.classify(lastErr)
		if kind == "fatal" then
			self.stats.fatal += 1
			return false, lastErr
		end
		if verify then
			-- Unknown outcome: read through the cache before deciding to write again.
			local okRead, stored = pcall(self.store.GetAsync, self.store, key, self.noCache)
			if okRead and verify(stored) then
				self.stats.verified += 1
				return true, stored
			end
		end
		if attempt < self.attempts then
			self.stats.retries += 1
			local backoff = math.min(self.maxDelay, self.base * 2 ^ (attempt - 1))
			local delay = math.min(self.maxDelay, backoff + self.random() * backoff)
			if self.onRetry then
				self.onRetry(key, method, attempt, reason, delay)
			end
			self.wait(delay)
		end
	end
	self.stats.exhausted += 1
	return false, lastErr
end

function KeyQueue:GetAsync(key, options)
	return self:_serial(key, function()
		return self:_attempt(key, "GetAsync", table.pack(key, options))
	end)
end

-- `verify(storedValue) -> boolean`: true when the intended change is already in the store.
function KeyQueue:SetAsync(key, value, userIds, options, verify)
	return self:_serial(key, function()
		return self:_attempt(key, "SetAsync", table.pack(key, value, userIds, options), verify)
	end)
end

function KeyQueue:UpdateAsync(key, transform, verify)
	return self:_serial(key, function()
		return self:_attempt(key, "UpdateAsync", table.pack(key, transform), verify)
	end)
end

function KeyQueue:IncrementAsync(key, delta, userIds, options, verify)
	return self:_serial(key, function()
		return self:_attempt(key, "IncrementAsync", table.pack(key, delta, userIds, options), verify)
	end)
end

function KeyQueue:RemoveAsync(key)
	return self:_serial(key, function()
		return self:_attempt(key, "RemoveAsync", table.pack(key))
	end)
end

return KeyQueue
