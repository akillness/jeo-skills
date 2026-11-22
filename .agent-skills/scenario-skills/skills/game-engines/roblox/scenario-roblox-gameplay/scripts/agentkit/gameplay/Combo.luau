--!strict
-- Combo: server-clock rules for an N-hit melee chain. Pure: unit-tested in Lune, used by the server
-- handler. The client only says "attack"; the server picks the step from its own clock.
--
--   local st = Combo.new()
--   local ok, step, why = Combo.request(st, os.clock())   -- why: "cooldown", "too-soon", "stunned"
--   Combo.cancel(st, now, 0.5)                             -- stun: drop the chain, cancel pending hits
--   if Combo.alive(st, requestedAt) then ... end           -- before the delayed hitbox query

local Combo = {}

export type Step = {
	damage: number,
	hitDelay: number, -- seconds from accepted request to the hitbox query (the swing's hit frame)
	minGap: number, -- seconds before the next request can be accepted
	box: { number }, -- hitbox size {x, y, z} in studs, placed in front of the attacker
	reach: number, -- studs from the root to the box center
	knockback: number?, -- impulse speed in studs/s on the last step
}
export type Config = {
	steps: { Step },
	chainWindow: number, -- seconds after a swing during which the next request continues the chain
	finisherCooldown: number, -- seconds locked after the last step
	tolerance: number, -- fraction of minGap accepted (network jitter); 0.8 accepts 20% early
	stun: number, -- seconds a hit target stays stunned
}
export type State = {
	step: number,
	lastAt: number,
	lockedUntil: number,
	stunnedUntil: number,
	cancelledAt: number,
	accepted: number,
	rejected: number,
	cfg: Config,
}

Combo.DEFAULT = {
	steps = {
		{ damage = 10, hitDelay = 0.12, minGap = 0.30, box = { 5, 5, 5 }, reach = 3.5 },
		{ damage = 12, hitDelay = 0.12, minGap = 0.30, box = { 5, 5, 5 }, reach = 3.5 },
		{ damage = 20, hitDelay = 0.20, minGap = 0.45, box = { 7, 5, 6 }, reach = 4, knockback = 45 },
	},
	chainWindow = 0.9,
	finisherCooldown = 0.6,
	tolerance = 0.8,
	stun = 0.35,
} :: Config

function Combo.new(cfg: Config?): State
	return {
		step = 0,
		lastAt = -math.huge,
		lockedUntil = -math.huge,
		stunnedUntil = -math.huge,
		cancelledAt = -math.huge,
		accepted = 0,
		rejected = 0,
		cfg = cfg or Combo.DEFAULT,
	}
end

-- Accepts or rejects one attack request at server time `now`. Returns ok, step (1..N), reason.
function Combo.request(st: State, now: number): (boolean, number, string?)
	local cfg = st.cfg
	local function reject(why: string): (boolean, number, string?)
		st.rejected += 1
		return false, st.step, why
	end
	if now < st.stunnedUntil then
		return reject("stunned")
	end
	if now < st.lockedUntil then
		return reject("cooldown")
	end
	local gap = now - st.lastAt
	if st.step > 0 and gap < cfg.steps[st.step].minGap * cfg.tolerance then
		return reject("too-soon")
	end
	local nextStep = if st.step > 0 and st.step < #cfg.steps and gap <= cfg.chainWindow then st.step + 1 else 1
	st.step = nextStep
	st.lastAt = now
	st.accepted += 1
	if nextStep == #cfg.steps then
		st.lockedUntil = now + cfg.finisherCooldown
	end
	return true, nextStep, nil
end

-- A stun or knockback on the attacker drops the chain and cancels hits still pending
-- (ArTheDev, Aoc9HkGHu_8 00:02:57: knockback and stun must cancel pending hitboxes).
function Combo.cancel(st: State, now: number, stunFor: number?)
	st.step = 0
	st.cancelledAt = now
	st.stunnedUntil = math.max(st.stunnedUntil, now + (stunFor or 0))
end

-- True when the hit of the request accepted at `requestedAt` may still land (no cancel since).
function Combo.alive(st: State, requestedAt: number): boolean
	return st.cancelledAt < requestedAt
end

return Combo
