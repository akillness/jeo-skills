-- FIXTURE: a client-visible module that requires a server-only module (ArchAudit client-requires-server).
local ServerScriptService = game:GetService("ServerScriptService")
local RoundService = require(ServerScriptService.Server.Services.RoundService)

return { round = RoundService }
