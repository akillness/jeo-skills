--!nonstrict
-- Telemetry: server-only AnalyticsService wrapper that validates before it sends, so exploiters
-- and typos cannot pollute the funnel and economy dashboards. Every call is also kept in a trace
-- (`tel.trace`), which is how tests and Studio sessions read it: Roblox records events only from
-- published servers (analytics docs).
--
--   local tel = Telemetry.new({ analytics = AnalyticsService, http = HttpService,
--       onboardingSteps = { "Joined", "FirstCoin", "FirstShop" }, ccu = function() return #Players:GetPlayers() end })
--   tel:onboarding(player, 1)                         -- step names come from onboardingSteps
--   local sid = tel:newSession()                      -- GUID per shop visit (recurring funnels)
--   tel:funnel(player, "Shop", sid, 1, "Opened")
--   tel:economy(player, "Source", "Coins", 100, 350, "IAP", "Coins100")
--   tel:custom(player, "AdOffered", 1, { "Shop" })     -- custom fields: up to 3 values, in order
--
-- Limits enforced (analytics event-types doc): 120 + 20 x CCU calls per minute, 3 custom fields,
-- 10 currencies, 100 custom event names, 100 steps per funnel, 10 funnels. Past a limit the call
-- is dropped and counted, never sent.

local Telemetry = {}
Telemetry.__index = Telemetry

local FIELD_KEYS = { "CustomField01", "CustomField02", "CustomField03" }
local LIMITS = { currencies = 10, eventNames = 100, funnels = 10, steps = 100, fields = 3 }
Telemetry.LIMITS = LIMITS

function Telemetry.new(opts: any): any
	local self = setmetatable({}, Telemetry)
	self.analytics = opts.analytics
	self.http = opts.http
	self.isClient = opts.isClient or false
	self.send = if opts.send == nil then true else opts.send
	self.onboardingSteps = opts.onboardingSteps or {}
	self.ccu = opts.ccu or function()
		return 1
	end
	self.clock = opts.clock or os.clock
	self.trace = {}
	self.stats = { accepted = 0, dropped = 0, errors = 0, rateLimited = 0 }
	self.lastStep = {} -- [player] = last onboarding step logged
	self.seen = { currencies = {}, eventNames = {}, funnels = {} }
	self.window = { start = self.clock(), count = 0 }
	return self
end

local function fieldsFor(values)
	if values == nil then
		return nil
	end
	local out = {}
	for i, v in ipairs(values) do
		if i > #FIELD_KEYS then
			break
		end
		out[FIELD_KEYS[i]] = tostring(v)
	end
	return out
end

local function cleanName(s)
	return type(s) == "string" and s ~= "" and not s:find("[,\"'\n]")
end

function Telemetry:_drop(kind, reason, args)
	self.stats.dropped += 1
	table.insert(self.trace, { kind = kind, accepted = false, reason = reason, args = args })
	return false, reason
end

function Telemetry:_rateOk()
	local now = self.clock()
	if now - self.window.start >= 60 then
		self.window.start, self.window.count = now, 0
	end
	if self.window.count >= 120 + 20 * self.ccu() then
		self.stats.rateLimited += 1
		return false
	end
	self.window.count += 1
	return true
end

-- Records the call and forwards it to AnalyticsService when sending is on. `accepted` means the
-- engine call returned without error, not that the event reached the dashboard.
function Telemetry:_emit(kind, method, args)
	if self.isClient then
		return self:_drop(kind, "client: analytics events are server-only", args)
	end
	if not self:_rateOk() then
		return self:_drop(kind, "rate limit: 120 + 20 x CCU per minute", args)
	end
	local entry = { kind = kind, accepted = false, args = args }
	table.insert(self.trace, entry)
	if self.send and self.analytics then
		local ok, err = pcall(function()
			self.analytics[method](self.analytics, table.unpack(args, 1, args.n))
		end)
		entry.accepted = ok
		if ok then
			self.stats.accepted += 1
		else
			entry.error = tostring(err)
			self.stats.errors += 1
		end
	end
	return true
end

-- One-time onboarding funnel: steps start at 1 and only move forward by one; repeats are not sent
-- (Roblox ignores them but they still count against the rate limit).
function Telemetry:onboarding(player, step, fields)
	local last = self.lastStep[player] or 0
	local name = self.onboardingSteps[step]
	if type(step) ~= "number" or step % 1 ~= 0 or name == nil then
		return self:_drop("onboarding", "unknown step " .. tostring(step), { step })
	end
	if step <= last then
		return self:_drop("onboarding", "repeat of step " .. step, { step })
	end
	if step > last + 1 then
		return self:_drop("onboarding", "step " .. tostring(step) .. " skips " .. tostring(last + 1), { step })
	end
	self.lastStep[player] = step
	return self:_emit("onboarding", "LogOnboardingFunnelStepEvent", table.pack(player, step, name, fieldsFor(fields)))
end

function Telemetry:forget(player)
	self.lastStep[player] = nil
end

function Telemetry:newSession()
	return if self.http then self.http:GenerateGUID(false) else tostring(math.random(1, 2 ^ 31))
end

function Telemetry:funnel(player, funnelName, sessionId, step, stepName, fields)
	if not cleanName(funnelName) or not cleanName(stepName) then
		return self:_drop("funnel", "funnel and step names must be non-empty, without , \" ' or newline", { funnelName, stepName })
	end
	if type(step) ~= "number" or step < 1 or step > LIMITS.steps or step % 1 ~= 0 then
		return self:_drop("funnel", "step must be an integer from 1 to 100", { step })
	end
	if not self.seen.funnels[funnelName] then
		local n = 0
		for _ in pairs(self.seen.funnels) do
			n += 1
		end
		if n >= LIMITS.funnels then
			return self:_drop("funnel", "more than 10 funnels", { funnelName })
		end
		self.seen.funnels[funnelName] = true
	end
	return self:_emit("funnel", "LogFunnelStepEvent", table.pack(player, funnelName, sessionId, step, stepName, fieldsFor(fields)))
end

-- flow: "Source" or "Sink". transactionType: an Enum.AnalyticsEconomyTransactionType name
-- (IAP, Shop, Gameplay, ContextualPurchase, TimedReward, Onboarding) or a custom string.
-- Call it after the change is saved, so the dashboard never shows currency that was rolled back.
function Telemetry:economy(player, flow, currency, amount, endingBalance, transactionType, sku, fields)
	if flow ~= "Source" and flow ~= "Sink" then
		return self:_drop("economy", "flow must be Source or Sink", { flow })
	end
	if type(amount) ~= "number" or amount <= 0 or amount ~= amount then
		return self:_drop("economy", "amount must be a positive number", { amount })
	end
	if not self.seen.currencies[currency] then
		local n = 0
		for _ in pairs(self.seen.currencies) do
			n += 1
		end
		if n >= LIMITS.currencies then
			return self:_drop("economy", "more than 10 currencies: use one currency plus a custom field", { currency })
		end
		self.seen.currencies[currency] = true
	end
	local flowEnum = if typeof(Enum) == "Enums" then Enum.AnalyticsEconomyFlowType[flow] else flow
	return self:_emit("economy", "LogEconomyEvent",
		table.pack(player, flowEnum, currency, amount, endingBalance, transactionType, sku, fieldsFor(fields)))
end

function Telemetry:custom(player, eventName, value, fields)
	if not cleanName(eventName) then
		return self:_drop("custom", "event name must be non-empty, without , \" ' or newline", { eventName })
	end
	if not self.seen.eventNames[eventName] then
		local n = 0
		for _ in pairs(self.seen.eventNames) do
			n += 1
		end
		if n >= LIMITS.eventNames then
			return self:_drop("custom", "more than 100 event names: use custom fields", { eventName })
		end
		self.seen.eventNames[eventName] = true
	end
	return self:_emit("custom", "LogCustomEvent", table.pack(player, eventName, value or 1, fieldsFor(fields)))
end

-- Kinds in trace order, for assertions: { "onboarding:1", "economy:Coins", ... }.
function Telemetry:summary()
	local out = {}
	for _, e in ipairs(self.trace) do
		local a = e.args or {}
		local tag = e.kind
		if e.kind == "onboarding" then
			tag ..= ":" .. tostring(a[2] or a[1])
		elseif e.kind == "economy" then
			tag ..= ":" .. tostring(a[3])
		elseif e.kind == "funnel" then
			tag ..= ":" .. tostring(a[2]) .. ":" .. tostring(a[4])
		elseif e.kind == "custom" then
			tag ..= ":" .. tostring(a[2])
		end
		table.insert(out, tag .. (if e.accepted then "" elseif e.reason then " (dropped)" else " (not sent)"))
	end
	return out
end

return Telemetry
