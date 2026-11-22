--!strict
-- HitCheck: server-side plausibility of a client-claimed hit, with latency in mind.
-- Pure math over Vector3 plus an injected obstruction test, so it runs in Lune and in Studio.
--
--   local hist = HitCheck.History.new(1)              -- one per character, fed on the server
--   hist:push(time(), root.Position)                  -- every Heartbeat or PostSimulation
--   local ok, why, d = HitCheck.melee({ attacker = myRoot.Position, target = hist, now = time(),
--       ping = player:GetNetworkPing(), reach = 7, slack = 1.5 })
--
-- What the attacker saw is the server state about one round trip plus interpolation ago; the check
-- accepts the hit when the target was within reach at any recorded moment in that window, and the
-- window is capped so a faked lag buys nothing past `cap`. Defaults are [added], tune them under
-- Studio's Network Simulator.

type HistoryFields = {
	seconds: number,
	samples: { { t: number, p: Vector3 } },
}

local History = {}
History.__index = History

-- Methods live on the metatable; this type sees them with no cast.
export type History = typeof(setmetatable({} :: HistoryFields, History))

function History.new(seconds: number): History
	local self: HistoryFields = { seconds = seconds, samples = {} }
	return setmetatable(self, History)
end

function History.push(self: History, t: number, p: Vector3)
	local s = self.samples
	table.insert(s, { t = t, p = p })
	local cutoff = t - self.seconds
	local drop = 0
	for i = 1, #s - 1 do
		if s[i + 1].t < cutoff then
			drop = i
		else
			break
		end
	end
	if drop > 0 then
		table.move(s, drop + 1, #s, 1)
		for i = #s - drop + 1, #s do
			s[i] = nil
		end
	end
end

-- Position at time t, linearly interpolated; clamps to the oldest or newest sample.
function History.at(self: History, t: number): Vector3?
	local s = self.samples
	if #s == 0 then
		return nil
	end
	if t <= s[1].t then
		return s[1].p
	end
	for i = 2, #s do
		local b = s[i]
		if t <= b.t then
			local a = s[i - 1]
			local span = b.t - a.t
			local alpha = if span > 0 then (t - a.t) / span else 1
			return a.p:Lerp(b.p, alpha)
		end
	end
	return s[#s].p
end

-- Interpolated endpoints plus every sample inside [t0, t1].
function History.window(self: History, t0: number, t1: number): { Vector3 }
	local out = {}
	local first = self:at(t0)
	if first then
		table.insert(out, first)
	end
	for _, x in self.samples do
		if x.t > t0 and x.t < t1 then
			table.insert(out, x.p)
		end
	end
	local last = self:at(t1)
	if last then
		table.insert(out, last)
	end
	return out
end

local HitCheck = {}
HitCheck.History = History

HitCheck.DEFAULTS = {
	interp = 0.1, -- [added] client interpolation delay on top of the round trip
	cap = 0.4, -- [added] maximum rewind in seconds; a lag switch gains nothing past it
	maxAngle = 10, -- degrees, plausibility cone (ev1, Inspire 2026)
}

-- Rewind window [now - rewind, now], rewind = min(ping + interp, cap).
function HitCheck.window(now: number, ping: number, interp: number?, cap: number?): (number, number)
	local p = if math.isfinite(ping) and ping > 0 then ping else 0
	local rewind = math.min(p + (interp or HitCheck.DEFAULTS.interp), cap or HitCheck.DEFAULTS.cap)
	return now - rewind, now
end

local function closest(points: { Vector3 }, to: Vector3): number
	local best = math.huge
	for _, p in points do
		local d = (p - to).Magnitude
		if d < best then
			best = d
		end
	end
	return best
end

export type MeleeArgs = {
	attacker: Vector3, -- server position of the attacker (never the client's claim)
	target: History,
	now: number,
	ping: number,
	reach: number,
	slack: number?,
	interp: number?,
	cap: number?,
}

function HitCheck.melee(a: MeleeArgs): (boolean, string, number)
	local t0, t1 = HitCheck.window(a.now, a.ping, a.interp, a.cap)
	local pts = a.target:window(t0, t1)
	if #pts == 0 then
		return false, "no history", math.huge
	end
	local d = closest(pts, a.attacker)
	if d <= a.reach + (a.slack or 0) then
		return true, "ok", d
	end
	return false, "reach", d
end

export type RangedArgs = {
	claimedOrigin: Vector3,
	serverOrigin: Vector3, -- muzzle or head position on the server
	originTolerance: number, -- grows with attacker speed x ping
	claimedHit: Vector3,
	target: History,
	hitTolerance: number,
	now: number,
	ping: number,
	look: Vector3?, -- trusted look direction (camera, InputAction) for the cone check
	maxAngle: number?,
	maxRange: number?,
	obstructed: ((from: Vector3, to: Vector3) -> boolean)?, -- static geometry only
	interp: number?,
	cap: number?,
}

function HitCheck.angle(a: Vector3, b: Vector3): number
	local la, lb = a.Magnitude, b.Magnitude
	if la == 0 or lb == 0 then
		return 180
	end
	return math.deg(math.acos(math.clamp(a:Dot(b) / (la * lb), -1, 1)))
end

function HitCheck.ranged(a: RangedArgs): (boolean, string, number)
	local od = (a.claimedOrigin - a.serverOrigin).Magnitude
	if not (od <= a.originTolerance) then -- written so NaN fails
		return false, "origin", od
	end
	local shot = a.claimedHit - a.claimedOrigin
	if a.maxRange and not (shot.Magnitude <= a.maxRange) then
		return false, "range", shot.Magnitude
	end
	if a.look then
		local ang = HitCheck.angle(a.look, shot)
		if not (ang <= (a.maxAngle or HitCheck.DEFAULTS.maxAngle)) then
			return false, "cone", ang
		end
	end
	local t0, t1 = HitCheck.window(a.now, a.ping, a.interp, a.cap)
	local pts = a.target:window(t0, t1)
	local hd = if #pts > 0 then closest(pts, a.claimedHit) else math.huge
	if not (hd <= a.hitTolerance) then
		return false, "hit", hd
	end
	if a.obstructed and a.obstructed(a.claimedOrigin, a.claimedHit) then
		return false, "wall", hd
	end
	return true, "ok", hd
end

return HitCheck
