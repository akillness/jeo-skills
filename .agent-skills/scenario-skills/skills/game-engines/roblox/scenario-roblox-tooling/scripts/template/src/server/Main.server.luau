--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Damage = require(ReplicatedStorage.Shared.Damage)
local Signal = require(ReplicatedStorage.Packages.Signal)

local hits = Signal.new()
hits:Connect(function(amount: number)
	print(`[server] hit for {amount}`)
end)

ReplicatedStorage.Shared.Remotes.Hit.OnServerEvent:Connect(function(_player: Player, base: unknown)
	if typeof(base) ~= "number" or base ~= base or base < 0 or base > 100 then
		return
	end
	hits:Fire(Damage.compute({ base = base, multiplier = 1, armor = 0 }))
end)

print("[server] ready")
