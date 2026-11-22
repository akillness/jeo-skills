-- FIXTURE: server-only logic in a client-visible module (ArchAudit server-api-replicated).
local MemoryStoreService = game:GetService("MemoryStoreService")
local ServerStorage = game:GetService("ServerStorage")

local LeakyServerModule = {}

function LeakyServerModule.queue()
	return MemoryStoreService:GetQueue("matchmaking"), ServerStorage
end

return LeakyServerModule
