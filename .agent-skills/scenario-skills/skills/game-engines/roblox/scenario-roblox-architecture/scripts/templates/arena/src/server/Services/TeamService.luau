--!strict
-- Team assignment and the "who is still alive" query the round needs.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Teams = game:GetService("Teams")

local Config = require(ReplicatedStorage.Shared.Config)

local TeamService = {}

local teams: { Team } = {}

function TeamService.Init(_self: any)
	for i, name in Config.TEAMS do
		local team = Teams:FindFirstChild(name) :: Team?
		if not team then
			local t = Instance.new("Team")
			t.Name = name
			t.TeamColor = if i == 1 then BrickColor.new("Bright red") else BrickColor.new("Bright blue")
			t.AutoAssignable = false
			t.Parent = Teams
			team = t
		end
		table.insert(teams, team :: Team)
	end
end

function TeamService.Assign(_self: any, list: { Player })
	local sorted = table.clone(list)
	table.sort(sorted, function(a: Player, b: Player)
		return a.UserId < b.UserId
	end)
	for i, player in sorted do
		player.Neutral = false
		player.Team = teams[(i - 1) % #teams + 1]
	end
end

function TeamService.Clear(_self: any, list: { Player })
	for _, player in list do
		player.Team = nil :: any -- the API types Team as non-optional; nil is valid at runtime
		player.Neutral = true
	end
end

-- Number of teams with a living member, and the name of the last one found.
function TeamService.AliveTeams(_self: any): (number, string?)
	local alive: { [string]: boolean } = {}
	local count, last = 0, nil
	for _, team in teams do
		for _, player in team:GetPlayers() do
			local character = player.Character
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if humanoid and humanoid.Health > 0 and not alive[team.Name] then
				alive[team.Name] = true
				count += 1
				last = team.Name
			end
		end
	end
	return count, last
end

return TeamService
