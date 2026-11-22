--!strict
-- A Script with RunContext Client in ReplicatedStorage runs once on every client.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local hit = ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Remotes"):WaitForChild("Hit") :: RemoteEvent
print(`[client] ready for {Players.LocalPlayer.Name}`)
hit:FireServer(10)
