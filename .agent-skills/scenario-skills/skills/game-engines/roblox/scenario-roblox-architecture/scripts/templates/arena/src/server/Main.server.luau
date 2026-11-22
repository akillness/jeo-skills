--!strict
-- The only server entry script (RunContext Server). Everything else is a module it boots.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Loader = require(ReplicatedStorage.Shared.Loader)

local ORDER = { "PlayerService", "TeamService", "RoundService", "WeaponService", "MapService" }
Loader.boot(Loader.ordered(script.Parent.Services, ORDER), { publish = script })
