--!strict
-- RateLimit: per-key token bucket for server handlers (remotes, prompts, clicks, Touched).
-- Pure Luau with an injectable clock, so it is unit-tested offline.
--
--   local limit = RateLimit.new(5, 0.5)        -- burst 5, refill 0.5 token per second
--   if not limit:allow(player.UserId) then return end
--   Players.PlayerRemoving:Connect(function(p) limit:forget(p.UserId) end)
--
-- Shape from the Creator Docs token bucket (client-server-boundary). The client may throttle too,
-- for politeness; only this server copy is a control.

type RateLimitFields = {
	capacity: number,
	perSecond: number,
	clock: () -> number,
	buckets: { [any]: { tokens: number, at: number } },
}

local RateLimit = {}
RateLimit.__index = RateLimit

-- Methods live on the metatable; this type sees them with no cast.
export type RateLimit = typeof(setmetatable({} :: RateLimitFields, RateLimit))

function RateLimit.new(capacity: number, perSecond: number, clock: (() -> number)?): RateLimit
	assert(capacity >= 1 and perSecond > 0, "capacity >= 1 and perSecond > 0")
	local self: RateLimitFields = {
		capacity = capacity,
		perSecond = perSecond,
		clock = clock or os.clock,
		buckets = {},
	}
	return setmetatable(self, RateLimit)
end

local function refill(self: RateLimit, key: any): { tokens: number, at: number }
	local now = self.clock()
	local b = self.buckets[key]
	if b == nil then
		b = { tokens = self.capacity, at = now }
		self.buckets[key] = b
	else
		local dt = math.max(0, now - b.at)
		b.tokens = math.min(self.capacity, b.tokens + dt * self.perSecond)
		b.at = now
	end
	return b
end

function RateLimit.allow(self: RateLimit, key: any, cost: number?): boolean
	local b = refill(self, key)
	local c = cost or 1
	if b.tokens >= c then
		b.tokens -= c
		return true
	end
	return false
end

function RateLimit.tokens(self: RateLimit, key: any): number
	return refill(self, key).tokens
end

function RateLimit.forget(self: RateLimit, key: any)
	self.buckets[key] = nil
end

function RateLimit.size(self: RateLimit): number
	local n = 0
	for _ in self.buckets do
		n += 1
	end
	return n
end

return RateLimit
