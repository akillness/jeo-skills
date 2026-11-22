--!nonstrict
-- AgentKit Probe: measure scheduler and event facts in the data model you run in (playtest
-- Server or Client through rbx_run). Every function yields a few frames and returns a table.
--
--   Probe.scheduler()      order of task.spawn / task.defer / task.delay(0) / task.wait() around a caller
--   Probe.delayTiming()    ms from task.delay(0) to its resume, called from PreSimulation vs Heartbeat
--   Probe.signals()        what Deferred (or Immediate) signal behavior does to ordinary code
--   Probe.yields()         which yields cross a C-call boundary (probed with coroutine.yield only)
--   Probe.pileup(seconds)  peak concurrent threads of a yielding Heartbeat handler vs a guarded one

local Probe = {}

local function frames(n)
	for _ = 1, n do
		task.wait()
	end
end

function Probe.scheduler()
	local log = {}
	local function mark(tag)
		table.insert(log, tag)
	end
	task.spawn(function()
		mark("spawn:body")
		task.wait()
		mark("spawn:afterWait")
	end)
	mark("caller:afterSpawn")
	task.defer(mark, "defer:1")
	task.defer(mark, "defer:2")
	task.delay(0, mark, "delay0")
	mark("caller:end")
	frames(4)
	return { order = table.concat(log, ",") }
end

function Probe.delayTiming()
	local RunService = game:GetService("RunService")
	local out, done = {}, 0
	local function measure(signal, key)
		signal:Once(function()
			local t0 = os.clock()
			task.delay(0, function()
				out[key] = math.floor((os.clock() - t0) * 1e5) / 100
				done += 1
			end)
		end)
	end
	frames(2)
	measure(RunService.PreSimulation, "fromPreSimulationMs")
	measure(RunService.Heartbeat, "fromHeartbeatMs")
	local deadline = os.clock() + 3
	while done < 2 and os.clock() < deadline do
		task.wait()
	end
	return out
end

function Probe.signals()
	local out = {}
	out.signalBehaviorReadable = (pcall(function()
		return (workspace :: any).SignalBehavior -- NotScriptable: expected to fail
	end))

	local ev = Instance.new("BindableEvent")
	local ran = false
	ev.Event:Connect(function()
		ran = true
	end)
	ev:Fire()
	out.handlerRanBeforeYield = ran
	task.wait()
	out.handlerRanAfterYield = ran

	local a, b = Instance.new("BindableEvent"), Instance.new("BindableEvent")
	local caught = 0
	a.Event:Connect(function()
		b.Event:Connect(function()
			caught += 1
		end)
	end)
	a:Fire()
	b:Fire()
	frames(2)
	out.connectInsideHandlerCaught = caught

	local A, B, C = Instance.new("BindableEvent"), Instance.new("BindableEvent"), Instance.new("BindableEvent")
	local order = {}
	A.Event:Connect(function()
		table.insert(order, "A")
		C:Fire()
	end)
	B.Event:Connect(function()
		table.insert(order, "B")
	end)
	C.Event:Connect(function()
		table.insert(order, "C")
	end)
	A:Fire()
	B:Fire()
	frames(2)
	out.nestedOrder = table.concat(order, ",")

	local holder = Instance.new("Folder")
	holder.Name = "ProbeHolder"
	holder.Parent = workspace
	local part = Instance.new("Part")
	part.Anchored = true
	part.Parent = holder
	local seenParent = "not run"
	part.Destroying:Connect(function()
		seenParent = if part.Parent then part.Parent:GetFullName() else "nil"
	end)
	part:Destroy()
	frames(1)
	out.destroyingSawParent = seenParent
	holder:Destroy()

	local ev2 = Instance.new("BindableEvent")
	local n = 0
	local conn
	conn = ev2.Event:Connect(function()
		n += 1
		conn:Disconnect()
	end)
	ev2:Fire()
	ev2:Fire()
	ev2:Fire()
	frames(1)
	out.disconnectInsideHandlerRuns = n

	local ev3 = Instance.new("BindableEvent")
	local m = 0
	ev3.Event:Once(function()
		m += 1
	end)
	ev3:Fire()
	ev3:Fire()
	ev3:Fire()
	frames(1)
	out.onceRuns = m

	local ev4 = Instance.new("BindableEvent")
	local k = 0
	ev4.Event:Connect(function()
		k += 1
	end)
	ev4:Fire()
	ev4:Fire()
	ev4:Destroy()
	frames(1)
	out.pendingRunAfterDestroy = k

	local p = Instance.new("Part")
	local changes = 0
	p:GetPropertyChangedSignal("Transparency"):Connect(function()
		changes += 1
	end)
	p.Transparency = 0.1
	p.Transparency = 0.2
	p.Transparency = 0.3
	frames(1)
	out.propertyChangedRunsFor3Sets = changes
	p:Destroy()

	local ev5 = Instance.new("BindableEvent")
	local depth = 0
	ev5.Event:Connect(function(d)
		depth = math.max(depth, d)
		if d < 50 then
			ev5:Fire(d + 1)
		end
	end)
	local ok, err = pcall(function()
		ev5:Fire(1)
	end)
	frames(20)
	out.selfFireDepthReached = depth
	out.selfFireError = if ok then nil else tostring(err)
	return out
end

-- Yield boundaries are probed with coroutine.yield in a private coroutine, never with task.wait or a
-- yielding WaitForChild: a failed task.wait under pcall leaves the thread registered with the scheduler
-- ("already 'waiting'"), and Studio 0.743 crashed shortly after such a probe.
function Probe.yields()
	local function attempt(f)
		local co = coroutine.create(f)
		local ok, err = coroutine.resume(co)
		return { yielded = ok and coroutine.status(co) == "suspended", err = if ok then nil else tostring(err) }
	end
	local out = {}
	out.inIndex = attempt(function()
		local lazy = setmetatable({}, {
			__index = function()
				coroutine.yield()
				return 1
			end,
		})
		return lazy.x
	end)
	out.inSortComparator = attempt(function()
		table.sort({ 3, 1, 2 }, function(x, y)
			coroutine.yield()
			return x < y
		end)
	end)
	out.inGsubCallback = attempt(function()
		string.gsub("ab", "%a", function(c)
			coroutine.yield()
			return c
		end)
	end)
	out.inPcall = attempt(function()
		pcall(function()
			coroutine.yield()
		end)
	end)
	-- WaitForChild returns at once when the child exists (no yield), so this one is safe to run.
	local folder = Instance.new("Folder")
	local child = Instance.new("Folder")
	child.Name = "Here"
	child.Parent = folder
	local byName = setmetatable({}, {
		__index = function(_, key)
			return folder:FindFirstChild(key) or folder:WaitForChild(key, 1)
		end,
	})
	out.existingChildInIndex = (pcall(function()
		return byName.Here
	end))
	out.taskWaitInsidePcall = (pcall(function()
		task.wait()
	end))
	folder:Destroy()
	return out
end

function Probe.pileup(seconds)
	seconds = seconds or 1
	local RunService = game:GetService("RunService")
	local active, peak = 0, 0
	local c = RunService.Heartbeat:Connect(function()
		active += 1
		peak = math.max(peak, active)
		task.wait(0.25)
		active -= 1
	end)
	task.wait(seconds)
	c:Disconnect()
	task.wait(0.3)

	local busy, runs = false, 0
	local c2 = RunService.Heartbeat:Connect(function()
		if busy then
			return
		end
		busy = true
		runs += 1
		task.delay(0.25, function()
			busy = false
		end)
	end)
	task.wait(seconds)
	c2:Disconnect()
	return { yieldingPeakThreads = peak, guardedRuns = runs, seconds = seconds }
end

return Probe
