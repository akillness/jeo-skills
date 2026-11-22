--!nonstrict
-- AgentKit Parallel: Actor workers driven by messages, results in a SharedTable.
-- Studio only (Actors and SharedTable need the engine). Serial setup, parallel compute.
--
--   local actors = Parallel.workers(template, 8, ServerScriptService, workModule)
--   local r = Parallel.run(actors, jobs)     -- jobs: array of payloads (copied into each message)
--   Parallel.run(actors, jobs, 30, { hits = 0 })  -- optional initial SharedTable fields
--   r.elapsedMs, r.results[i] (what workModule.run stored), r.done
--   Parallel.cleanup(actors)
--
-- `template` is the ParallelWorker script (templates/ParallelWorker.server.luau) kept in
-- ServerStorage, where it does not run. Each clone runs under its own Actor, which is its own
-- Luau VM: `workModule` is required once per Actor and its module state is not shared.

local Parallel = {}

function Parallel.workers(template: Script, n: number, parent: Instance, workModule: ModuleScript, timeout: number?)
	local actors = {}
	for i = 1, n do
		local actor = Instance.new("Actor")
		actor.Name = "Worker" .. i
		local ref = Instance.new("ObjectValue")
		ref.Name = "WorkModule"
		ref.Value = workModule
		ref.Parent = actor
		local s = template:Clone()
		s.Parent = actor
		actor.Parent = parent
		table.insert(actors, actor)
	end
	local deadline = os.clock() + (timeout or 10)
	for _, actor in actors do
		while not actor:GetAttribute("Ready") do
			if os.clock() > deadline then
				error("worker " .. actor.Name .. " never set Ready (is the template a Script with a Legacy or Server RunContext?)")
			end
			task.wait()
		end
	end
	return actors
end

-- Jobs go round-robin; each worker calls workModule.run(jobId, payload, results) in parallel.
function Parallel.run(actors, jobs, timeout: number?, init: { [string]: any }?)
	local fields = table.clone(init or {})
	fields.done = 0
	local results = SharedTable.new(fields)
	local t0 = os.clock()
	for i, payload in jobs do
		actors[(i - 1) % #actors + 1]:SendMessage("work", i, payload, results)
	end
	local deadline = t0 + (timeout or 30)
	while results.done < #jobs do
		if os.clock() > deadline then
			error(string.format("only %d of %d jobs finished", results.done, #jobs))
		end
		task.wait()
	end
	return { elapsedMs = math.floor((os.clock() - t0) * 1e5) / 100, done = results.done, results = results }
end

function Parallel.cleanup(actors)
	for _, actor in actors do
		actor:Destroy()
	end
end

return Parallel
