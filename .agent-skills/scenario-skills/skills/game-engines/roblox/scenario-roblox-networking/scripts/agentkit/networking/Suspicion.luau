--!strict
-- Suspicion: per-player score from many weak signals, with decay and a consequence ladder.
-- Pure Luau, injectable clock. The caller decides what each level does (Net.luau wires it).
--
--   local s = Suspicion.new({ halfLife = 120 })
--   local level = s:add(player.UserId, 2, "reach")   -- "none" | "log" | "mitigate" | "restrict" | "enforce"
--
-- Ladder from the Creator Docs (server-side detection): silent log, quiet mitigation (drop, clamp,
-- rubber-band), temporary restriction, then visible enforcement. One failed heuristic is never
-- enough for enforcement: `enforce` also needs `minSignals` distinct reasons.

export type Options = {
	halfLife: number?,
	thresholds: { log: number, mitigate: number, restrict: number, enforce: number }?,
	minSignals: number?,
	clock: (() -> number)?,
}

type Entry = { score: number, at: number, reasons: { [string]: number } }

type SuspicionFields = {
	halfLife: number,
	thresholds: { log: number, mitigate: number, restrict: number, enforce: number },
	minSignals: number,
	clock: () -> number,
	entries: { [any]: Entry },
}

local Suspicion = {}
Suspicion.__index = Suspicion

-- Methods live on the metatable; this type sees them with no cast.
export type Suspicion = typeof(setmetatable({} :: SuspicionFields, Suspicion))

function Suspicion.new(opts: Options?): Suspicion
	local o: Options = opts or {}
	local self: SuspicionFields = {
		halfLife = o.halfLife or 120,
		thresholds = o.thresholds or { log = 1, mitigate = 3, restrict = 6, enforce = 10 },
		minSignals = o.minSignals or 2,
		clock = o.clock or os.clock,
		entries = {},
	}
	return setmetatable(self, Suspicion)
end

local function decayed(self: Suspicion, key: any): Entry
	local now = self.clock()
	local e = self.entries[key]
	if e == nil then
		e = { score = 0, at = now, reasons = {} }
		self.entries[key] = e
	else
		local dt = math.max(0, now - e.at)
		e.score *= 0.5 ^ (dt / self.halfLife)
		e.at = now
	end
	return e
end

function Suspicion.score(self: Suspicion, key: any): number
	return decayed(self, key).score
end

function Suspicion.reasons(self: Suspicion, key: any): { [string]: number }
	return decayed(self, key).reasons
end

function Suspicion.level(self: Suspicion, key: any): string
	local e = decayed(self, key)
	local t = self.thresholds
	local distinct = 0
	for _ in e.reasons do
		distinct += 1
	end
	if e.score >= t.enforce and distinct >= self.minSignals then
		return "enforce"
	elseif e.score >= t.restrict then
		return "restrict"
	elseif e.score >= t.mitigate then
		return "mitigate"
	elseif e.score >= t.log then
		return "log"
	end
	return "none"
end

function Suspicion.add(self: Suspicion, key: any, weight: number, reason: string): string
	local e = decayed(self, key)
	if math.isfinite(weight) and weight > 0 then
		e.score += weight
		e.reasons[reason] = (e.reasons[reason] or 0) + 1
	end
	return self:level(key)
end

function Suspicion.forget(self: Suspicion, key: any)
	self.entries[key] = nil
end

return Suspicion
