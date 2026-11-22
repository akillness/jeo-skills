--!strict
-- NpcBrain: Patrol, Chase, Attack on top of StateMachine. Pure: the caller perceives, the brain decides,
-- the caller moves and attacks. Unit-tested in Lune; driven by NpcService in Studio.
--
--   local m = NpcBrain.new(cfg)
--   local state, attackNow = NpcBrain.step(m, { hasTarget, targetDist, hasSight }, now, dt)

local StateMachine = require("./StateMachine")

local NpcBrain = {}

export type Config = {
	detectRange: number, -- studs; first sight needs line of sight inside this range
	attackRange: number, -- studs; enter Attack at or below
	leaveAttackRange: number, -- studs; back to Chase above (hysteresis)
	loseAfter: number, -- seconds without sight before giving up
	attackCooldown: number, -- seconds between swings
	firstAttackDelay: number, -- seconds after entering Attack
}

export type Percept = { hasTarget: boolean, targetDist: number, hasSight: boolean }

NpcBrain.DEFAULT = {
	detectRange = 60,
	attackRange = 5,
	leaveAttackRange = 6.5,
	loseAfter = 4,
	attackCooldown = 1.2,
	firstAttackDelay = 0.2,
} :: Config

local function sees(c: any): boolean
	return c.hasTarget == true and c.hasSight == true and c.targetDist <= c.cfg.detectRange
end

local function inReach(c: any): boolean
	return c.hasTarget == true and c.targetDist <= c.cfg.attackRange
end

local function outOfReach(c: any): boolean
	return (not c.hasTarget) or c.targetDist > c.cfg.leaveAttackRange
end

local function lost(c: any): boolean
	return (not c.hasTarget) or (c.now - c.lastSeenAt) > c.cfg.loseAfter
end

local DEFINITION: StateMachine.Definition = {
	name = "NpcBrain",
	start = "Patrol",
	states = {
		Patrol = {
			onEnter = function(c)
				c.intent = "patrol"
			end,
		},
		Chase = {
			onEnter = function(c)
				c.intent = "chase"
			end,
		},
		Attack = {
			onEnter = function(c)
				c.intent = "attack"
				c.nextAttackAt = math.max(c.nextAttackAt, c.now + c.cfg.firstAttackDelay)
			end,
			onStay = function(c)
				if c.now >= c.nextAttackAt then
					c.wantAttack = true
					c.nextAttackAt = c.now + c.cfg.attackCooldown
				end
			end,
		},
	},
	transitions = {
		{ from = { "Patrol" }, to = "Chase", test = sees },
		-- Losing the target wins over every other exit.
		{ from = { "Chase", "Attack" }, to = "Patrol", test = lost },
		{ from = { "Chase" }, to = "Attack", test = inReach },
		{ from = { "Attack" }, to = "Chase", test = outOfReach },
	},
}

function NpcBrain.new(cfg: Config?)
	local context = {
		cfg = cfg or NpcBrain.DEFAULT,
		now = 0,
		hasTarget = false,
		targetDist = math.huge,
		hasSight = false,
		lastSeenAt = -math.huge,
		nextAttackAt = 0,
		wantAttack = false,
		intent = "patrol",
	}
	return StateMachine.new(DEFINITION, context)
end

-- Returns the state after this tick and whether an attack starts now.
function NpcBrain.step(m: StateMachine.Machine, p: Percept, now: number, dt: number): (string, boolean)
	local c = m.context
	c.now = now
	c.hasTarget = p.hasTarget
	c.targetDist = if p.hasTarget then p.targetDist else math.huge
	c.hasSight = p.hasSight
	if p.hasTarget and p.hasSight then
		c.lastSeenAt = now
	end
	StateMachine.tick(m, dt)
	local attack = c.wantAttack
	c.wantAttack = false
	return m.current, attack
end

NpcBrain.DEFINITION = DEFINITION
return NpcBrain
