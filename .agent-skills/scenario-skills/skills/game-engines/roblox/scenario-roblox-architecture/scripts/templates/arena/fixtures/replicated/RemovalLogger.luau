-- FIXTURE: a removal handler that reads Parent (ArchAudit removing-reads-parent). Under Deferred
-- signals the handler runs after Destroy, so Parent is already nil.
local RemovalLogger = {}

function RemovalLogger.watch(part: BasePart)
	part.Destroying:Connect(function()
		print("removed from", part.Parent)
	end)
end

return RemovalLogger
