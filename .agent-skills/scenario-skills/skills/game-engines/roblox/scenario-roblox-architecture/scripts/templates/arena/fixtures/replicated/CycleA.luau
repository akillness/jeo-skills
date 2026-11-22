-- FIXTURE: CycleA and CycleB require each other at load time (ArchAudit require-cycle).
local CycleB = require(script.Parent.CycleB)
return { b = CycleB }
