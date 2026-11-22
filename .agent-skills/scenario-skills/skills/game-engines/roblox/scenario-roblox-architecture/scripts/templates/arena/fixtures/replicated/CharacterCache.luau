-- FIXTURE: a table keyed by character that is never cleared (ArchAudit character-table-no-cleanup).
local Players = game:GetService("Players")

local cache = {}

Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function(character)
		cache[character] = os.clock()
	end)
end)

return cache
