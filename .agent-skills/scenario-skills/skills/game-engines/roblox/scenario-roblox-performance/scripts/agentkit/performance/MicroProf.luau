--!nonstrict
-- MicroProf: MicroProfiler numbers by code through LibMP, the module Studio exposes to execute_luau and the
-- command bar as require("@rbx/LibMP"). A game script must ship its own copy of LibMP instead.
-- Snapshot first (never OpenFromLiveData from execute_luau): the session then reads a fixed buffer.
--
--   MicroProf.capture(seconds, opts)   enable, wait, snapshot, summarize, then disable unless opts.keep
--       opts.mask    timer name mask, '|' separates masks (default "Lab/*"); your debug.profilebegin labels
--       opts.frames  frame limit, at most 256 (default 128); changing it clears counter history
--       opts.ui      show the MicroProfiler overlay while capturing (default: on in a playtest, off in Edit)
--       opts.tries, opts.minFrames  capture again (up to tries) until the snapshot holds minFrames frames
--   MicroProf.summarize(session, mask)  frames {n, p50, p95, max} in ms, per-timer totals and per-frame
--       means, the threads each timer ran on, and the Luau heap counter

local MicroProf = {}

local function round(x, n)
	local m = 10 ^ (n or 3)
	return math.floor(x * m + 0.5) / m
end

local function stats(list)
	local n = #list
	if n == 0 then
		return { n = 0 }
	end
	local s = table.clone(list)
	table.sort(s)
	local sum = 0
	for _, v in s do
		sum += v
	end
	local function pct(p)
		return s[math.clamp(math.ceil(n * p), 1, n)]
	end
	return { n = n, mean = round(sum / n), p50 = round(pct(0.5)), p95 = round(pct(0.95)), max = round(s[n]) }
end

function MicroProf.summarize(session, mask)
	local g = session:FetchGlobalDesc()
	local toMs = g.TickToMsCpu
	local lo, hi = session:GetFrameIdMin(), session:GetFrameIdMax()
	local frames = {}
	for i = lo, hi do
		local f = session:FetchFrameDesc(i)
		-- Some frame ids have no descriptor (seen in playtest data models): skip them.
		if f and f.TickEndCpu > f.TickStartCpu then
			table.insert(frames, (f.TickEndCpu - f.TickStartCpu) * toMs)
		end
	end
	local out = { frames = stats(frames), frameIdMin = lo, frameIdMax = hi, timers = {} }
	local ids = session:FindTimerIds(mask or "Lab/*", false)
	if #ids > 0 then
		local iter = session:CreateLogIterator()
		iter:Configure({ SkipGpuThreads = true, SkipEvents = true, TimerIds = ids })
		local st = iter:GetState()
		iter:RewindTo(0, 0)
		local acc = {}
		while iter:Step() do
			if st:IsExit() and not st:ThreadStackIsUnderflowed() and not st:ThreadStackWasOverflowed() then
				local el = iter:GetCurrentThreadStackElement(st:ThreadStackDepth())
				if el then
					local tid = st:TimerId()
					local a = acc[tid]
					if not a then
						a = { ms = 0, count = 0, perFrame = {}, threads = {} }
						acc[tid] = a
					end
					local ms = (st:Timestamp() - el:EnterTimestamp()) * toMs
					a.ms += ms
					a.count += 1
					local fid = st:FrameId()
					a.perFrame[fid] = (a.perFrame[fid] or 0) + ms
					a.threads[st:ThreadId()] = true
				end
			end
		end
		iter:Dispose()
		local nFrames = math.max(#frames, 1)
		for tid, a in acc do
			local worst = 0
			for _, ms in a.perFrame do
				worst = math.max(worst, ms)
			end
			local threads = {}
			for th in a.threads do
				table.insert(threads, (string.gsub(session:FetchThreadDesc(th).ThreadName, "^%s+", "")))
			end
			table.sort(threads)
			table.insert(out.timers, {
				name = session:FetchTimerDesc(tid).TimerName,
				totalMs = round(a.ms),
				count = a.count,
				msPerFrame = round(a.ms / nFrames),
				worstFrameMs = round(worst),
				threads = threads,
			})
		end
		table.sort(out.timers, function(x, y)
			return x.totalMs > y.totalMs
		end)
	end
	local heap = session:FindCounterId("**/Luau/heap", false)
	if heap ~= 0 then
		local s = session:FetchLastCounterSample(heap)
		out.luauHeapCounter = s and s.Value
	end
	return out
end

function MicroProf.capture(seconds, opts)
	opts = opts or {}
	-- The @rbx alias resolves only in execute_luau and the command bar; the cast keeps luau-lsp quiet.
	local LibMP = (require :: any)("@rbx/LibMP")
	assert(LibMP.Control:IsBackendReady(), "LibMP backend not ready")
	-- In a playtest data model the snapshot held no frames until the MicroProfiler UI was shown.
	local ui = opts.ui
	if ui == nil then
		ui = game:GetService("RunService"):IsRunning()
	end
	if ui then
		LibMP.Control:ShowUI(true)
		task.wait(0.5)
	end
	local tries, minFrames = opts.tries or 1, opts.minFrames or 1
	local r, buf
	for attempt = 1, tries do
		-- In a playtest the first snapshots hold 0 to 5 frames; later ones hold more.
		LibMP.Control:SetFrameLimit(opts.frames or 128)
		LibMP.Control:EnableProfiler(true)
		LibMP.Control:EnableCapture(true)
		task.wait(seconds or 2)
		buf = LibMP.Control:CaptureToBufferSync()
		local session = LibMP.Session.OpenFromBuffer(buf)
		assert(session and session:IsValid(), "LibMP session did not open from the snapshot")
		local ok, res = pcall(MicroProf.summarize, session, opts.mask)
		session:Dispose()
		if not ok then
			error(res)
		end
		r = res
		r.attempt = attempt
		if r.frames.n >= minFrames and #r.timers > 0 then
			break
		end
	end
	if not opts.keep then
		if ui then
			LibMP.Control:ShowUI(false)
		end
		LibMP.Control:EnableProfiler(false)
	end
	r.bufferBytes = buffer.len(buf)
	return r
end

return MicroProf
