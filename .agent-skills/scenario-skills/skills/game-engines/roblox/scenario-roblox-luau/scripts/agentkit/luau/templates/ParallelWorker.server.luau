--!strict
-- Worker template for AgentKit Parallel. Keep it in ServerStorage (it does not run there);
-- Parallel.workers clones it under Actors with an ObjectValue "WorkModule" next to it.
-- The work module returns { run = function(jobId, payload, results: SharedTable) ... end }
-- and must not require anything inside run (require errors in a parallel phase). run executes under
-- pcall: never call task.synchronize or task.wait inside it; return and write from a serial script.
local actor = script:GetActor()
if actor == nil then
	return
end
type WorkModule = { run: (jobId: number, payload: any, results: SharedTable) -> () }
local ref = actor:WaitForChild("WorkModule") :: ObjectValue
-- Dynamic require paths are "Unknown require" errors for the type checker: cast require, type the result.
local Work: WorkModule = (require :: any)(ref.Value) -- serial: before any parallel phase

actor:BindToMessageParallel("work", function(jobId: number, payload: any, results: SharedTable)
	local ok, err = pcall(function()
		Work.run(jobId, payload, results)
	end)
	if not ok then
		results["error" .. jobId] = tostring(err)
	end
	SharedTable.increment(results, "done", 1)
end)
actor:SetAttribute("Ready", true)
