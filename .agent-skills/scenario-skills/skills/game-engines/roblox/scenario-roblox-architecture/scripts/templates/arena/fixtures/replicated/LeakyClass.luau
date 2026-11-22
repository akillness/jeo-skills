-- FIXTURE: a class that keeps neither its connection nor cleans its per-player table
-- (ArchAudit class-connection-unstored, player-table-no-cleanup).
local RunService = game:GetService("RunService")

local LeakyClass = {}
LeakyClass.__index = LeakyClass

local byPlayer = {}

function LeakyClass.new(player: Player)
	local self = setmetatable({ player = player, ticks = 0 }, LeakyClass)
	byPlayer[player] = self
	RunService.Heartbeat:Connect(function()
		self.ticks += 1
	end)
	return self
end

function LeakyClass:Destroy()
	self.player = nil
end

return LeakyClass
