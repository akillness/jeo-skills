--!strict
-- The only client entry script: a Script with RunContext Client in ReplicatedStorage (runs once,
-- Output links point at this stable path). It runs after the game has loaded, so saved instances
-- in ReplicatedStorage need no WaitForChild; instances the server creates at runtime do.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Boot facts read by agent tests (local attributes, nothing replicates).
script:SetAttribute("RanAt", os.clock())
script:SetAttribute("GameLoaded", game:IsLoaded())
script:SetAttribute("HadCharacter", Players.LocalPlayer.Character ~= nil)

local Loader = require(ReplicatedStorage.Shared.Loader)

Loader.boot(Loader.ordered(script.Parent.Controllers), { publish = script })
