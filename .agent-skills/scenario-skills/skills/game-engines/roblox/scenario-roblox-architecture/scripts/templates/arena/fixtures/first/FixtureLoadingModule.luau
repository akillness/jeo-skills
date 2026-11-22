-- FIXTURE: ReplicatedFirst code that requires a module outside ReplicatedFirst
-- (ArchAudit replicatedfirst-requires-outside). It is not loaded yet when ReplicatedFirst runs.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

return { teams = Config.TEAMS }
