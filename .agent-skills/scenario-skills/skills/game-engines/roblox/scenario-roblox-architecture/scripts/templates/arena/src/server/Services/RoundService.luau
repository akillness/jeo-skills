--!strict
-- Owns the round: truth in this module, a read-only mirror in ReplicatedStorage.GameState attributes.
-- Calls TeamService directly (it needs the result); announces states through StateChanged so
-- systems it does not know about (weapons, analytics) can react.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local RoundMachine = require(ReplicatedStorage.Shared.RoundMachine)
local Signal = require(ReplicatedStorage.Shared.Signal)

local RoundService = {}

local machine: RoundMachine.Machine
local state: Configuration
local teams: any

function RoundService.Init(self: any, registry: { [string]: any })
	self.StateChanged = Signal.new() :: Signal.Signal<string, string?>
	machine = RoundMachine.new()
	teams = registry.TeamService
	local found = ReplicatedStorage:FindFirstChild("GameState")
	if not found then
		local c = Instance.new("Configuration")
		c.Name = "GameState"
		c:SetAttribute("RoundState", "Lobby")
		c:SetAttribute("EndsAt", 0)
		c:SetAttribute("Winner", "")
		c.Parent = ReplicatedStorage
		found = c
	end
	state = found :: Configuration
end

-- Test_* attributes on GameState shorten the loop in Studio only; live servers ignore them.
function RoundService.Settings(_self: any): RoundMachine.Settings
	local s: RoundMachine.Settings = {
		minPlayers = Config.MIN_PLAYERS,
		intermission = Config.INTERMISSION,
		round = Config.ROUND,
		ending = Config.ENDING,
	}
	if RunService:IsStudio() then
		s.minPlayers = (state:GetAttribute("Test_MinPlayers") :: number?) or s.minPlayers
		s.intermission = (state:GetAttribute("Test_Intermission") :: number?) or s.intermission
		s.round = (state:GetAttribute("Test_Round") :: number?) or s.round
		s.ending = (state:GetAttribute("Test_Ending") :: number?) or s.ending
	end
	return s
end

function RoundService.GetState(_self: any): string
	return machine.state
end

function RoundService.Enter(self: any, new: string)
	local list = Players:GetPlayers()
	if new == "Round" then
		teams:Assign(list)
	elseif new == "Lobby" then
		teams:Clear(list)
	end
	-- Same-type changes generally arrive in order; clients still re-render on every attribute.
	state:SetAttribute("EndsAt", if machine.endsAt == math.huge then 0 else machine.endsAt)
	state:SetAttribute("Winner", machine.winner or "")
	state:SetAttribute("RoundState", new)
	self.StateChanged:Fire(new, machine.winner)
end

function RoundService.Start(self: any)
	while true do
		local alive, last = teams:AliveTeams()
		local snap: RoundMachine.Snapshot = { players = #Players:GetPlayers(), teamsAlive = alive, winner = last }
		local new = RoundMachine.step(machine, self:Settings(), workspace:GetServerTimeNow(), snap)
		if new then
			self:Enter(new)
		end
		task.wait(Config.TICK)
	end
end

return RoundService
