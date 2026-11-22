--!strict
-- StateMachine: data-driven finite state machine (context blackboard, states, tests, transitions).
-- Pure Luau: runs in Studio and in Lune. Pattern from Roblox Learn, nlVpAZEkxgo.
--
--   local m = StateMachine.new({
--       name = "Guard", start = "Patrol",
--       states = { Patrol = { onEnter = fn, onStay = fn, onExit = fn }, Chase = {...} },
--       transitions = { { from = { "Patrol" }, to = "Chase", test = sees } },
--   }, context)
--   StateMachine.tick(m, dt)   -- first passing transition out of the current state wins, else onStay

local StateMachine = {}

export type Context = { [string]: any }
export type Test = (Context) -> boolean
export type State = {
	onEnter: ((Context) -> ())?,
	onStay: ((Context, number) -> ())?,
	onExit: ((Context) -> ())?,
}
export type Transition = { from: { string }, to: string, test: Test }
export type Definition = {
	name: string,
	start: string,
	states: { [string]: State },
	transitions: { Transition },
}
export type Machine = {
	def: Definition,
	current: string,
	context: Context,
	since: number,
	changes: number,
	history: { string },
	maxHistory: number,
	byFrom: { [string]: { Transition } },
}

-- Returns a list of problems; empty when the definition is consistent.
function StateMachine.validate(def: Definition): { string }
	local errors = {}
	if def.states[def.start] == nil then
		table.insert(errors, "start state '" .. tostring(def.start) .. "' is not defined")
	end
	for i, t in def.transitions do
		if def.states[t.to] == nil then
			table.insert(errors, string.format("transition %d: target '%s' is not defined", i, t.to))
		end
		if #t.from == 0 then
			table.insert(errors, string.format("transition %d: no source state", i))
		end
		for _, f in t.from do
			if def.states[f] == nil then
				table.insert(errors, string.format("transition %d: source '%s' is not defined", i, f))
			end
		end
		if type(t.test) ~= "function" then
			table.insert(errors, string.format("transition %d: test is not a function", i))
		end
	end
	return errors
end

function StateMachine.new(def: Definition, context: Context?, maxHistory: number?): Machine
	local errors = StateMachine.validate(def)
	if #errors > 0 then
		error("StateMachine '" .. def.name .. "': " .. table.concat(errors, "; "), 2)
	end
	-- Index transitions by source once; one transition may list several sources (nlVpAZEkxgo 00:06:55).
	local byFrom: { [string]: { Transition } } = {}
	for _, t in def.transitions do
		for _, f in t.from do
			byFrom[f] = byFrom[f] or {}
			table.insert(byFrom[f], t)
		end
	end
	local m: Machine = {
		def = def,
		current = def.start,
		context = context or {},
		since = 0,
		changes = 0,
		history = { def.start },
		maxHistory = maxHistory or 32,
		byFrom = byFrom,
	}
	local enter = def.states[def.start].onEnter
	if enter then
		enter(m.context)
	end
	return m
end

-- Moves to `to`, running onExit then onEnter. Used by tick and for forced changes (stun, death).
function StateMachine.go(m: Machine, to: string)
	local nextState = m.def.states[to]
	assert(nextState, "unknown state " .. to)
	local exit = m.def.states[m.current].onExit
	if exit then
		exit(m.context)
	end
	m.current = to
	m.since = 0
	m.changes += 1
	table.insert(m.history, to)
	if #m.history > m.maxHistory then
		table.remove(m.history, 1)
	end
	if nextState.onEnter then
		nextState.onEnter(m.context)
	end
end

-- Returns true when the state changed this tick.
function StateMachine.tick(m: Machine, dt: number): boolean
	m.since += dt
	local list = m.byFrom[m.current]
	if list then
		for _, t in list do
			if t.test(m.context) then
				StateMachine.go(m, t.to)
				return true
			end
		end
	end
	local stay = m.def.states[m.current].onStay
	if stay then
		stay(m.context, dt)
	end
	return false
end

function StateMachine.allOf(...: Test): Test
	local tests = { ... }
	return function(c: Context): boolean
		for _, t in tests do
			if not t(c) then
				return false
			end
		end
		return true
	end
end

function StateMachine.anyOf(...: Test): Test
	local tests = { ... }
	return function(c: Context): boolean
		for _, t in tests do
			if t(c) then
				return true
			end
		end
		return false
	end
end

function StateMachine.negate(test: Test): Test
	return function(c: Context): boolean
		return not test(c)
	end
end

return StateMachine
