--!strict
-- Pure round state machine: no Roblox API, so it runs and is tested in Lune or plain luau.
-- step() returns the new state on a transition and nil otherwise; side effects belong to the caller.

export type State = "Lobby" | "Intermission" | "Round" | "Ending"
export type Settings = { minPlayers: number, intermission: number, round: number, ending: number }
export type Snapshot = { players: number, teamsAlive: number, winner: string? }
export type Machine = { state: State, endsAt: number, winner: string?, elimination: boolean }

local RoundMachine = {}

function RoundMachine.new(): Machine
	return { state = "Lobby", endsAt = math.huge, winner = nil, elimination = false }
end

function RoundMachine.step(m: Machine, s: Settings, now: number, snap: Snapshot): State?
	if m.state == "Lobby" then
		if snap.players >= s.minPlayers then
			m.state, m.endsAt = "Intermission", now + s.intermission
			return m.state
		end
	elseif m.state == "Intermission" then
		if snap.players < s.minPlayers then
			m.state, m.endsAt = "Lobby", math.huge
			return m.state
		elseif now >= m.endsAt then
			-- Elimination only ends a round that started with an opponent to eliminate.
			m.state, m.endsAt, m.winner, m.elimination = "Round", now + s.round, nil, snap.players >= 2
			return m.state
		end
	elseif m.state == "Round" then
		if now >= m.endsAt or (m.elimination and snap.teamsAlive <= 1) then
			m.winner = if m.elimination and snap.teamsAlive == 1 then snap.winner else nil
			m.state, m.endsAt = "Ending", now + s.ending
			return m.state
		end
	elseif m.state == "Ending" then
		if now >= m.endsAt then
			m.state, m.endsAt = "Lobby", math.huge
			return m.state
		end
	end
	return nil
end

return RoundMachine
