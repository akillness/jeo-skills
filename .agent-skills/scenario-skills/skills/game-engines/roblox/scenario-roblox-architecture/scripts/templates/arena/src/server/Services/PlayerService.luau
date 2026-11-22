--!strict
-- Owns per-player and per-character server state, and removes it when they go.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

export type PlayerState = { joinedAt: number, kills: number }

local PlayerService = {}

local players: { [Player]: PlayerState } = {}
local characters: { [Model]: Player } = {}

local function size(t: { [any]: any }): number
	local n = 0
	for _ in t do
		n += 1
	end
	return n
end

-- Studio-only debug attributes: agent tests read them from any data model, no test door needed.
local function publish()
	if RunService:IsStudio() then
		script:SetAttribute("Players", size(players))
		script:SetAttribute("Characters", size(characters))
	end
end

local function onCharacter(player: Player, character: Model)
	characters[character] = player
	-- Deferred signals: this runs after the destroy, so it only clears, it never reads the character.
	character.Destroying:Once(function()
		characters[character] = nil
		publish()
	end)
	publish()
end

local function onPlayer(player: Player)
	players[player] = { joinedAt = os.clock(), kills = 0 }
	player.CharacterAdded:Connect(function(character)
		onCharacter(player, character)
	end)
	player.CharacterRemoving:Connect(function(character)
		characters[character] = nil
		publish()
	end)
	if player.Character then
		onCharacter(player, player.Character)
	end
	publish()
end

function PlayerService.Start(_self: any)
	-- Connect first, then catch players who joined before this ran.
	Players.PlayerAdded:Connect(onPlayer)
	Players.PlayerRemoving:Connect(function(player)
		players[player] = nil
		for character, owner in characters do
			if owner == player then
				characters[character] = nil
			end
		end
		publish()
	end)
	for _, player in Players:GetPlayers() do
		if not players[player] then
			onPlayer(player)
		end
	end
end

function PlayerService.Get(_self: any, player: Player): PlayerState?
	return players[player]
end

return PlayerService
