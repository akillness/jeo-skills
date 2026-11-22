--!nonstrict
-- AgentKit Bench: A/B timing for optimizations (native code, table layout, algorithm swaps).
-- Runs in Studio, plain luau and Lune. Keep one round under about 0.5 s: rounds yield between
-- them in Studio so long benchmarks do not hit the script timeout.
--
--   local r = Bench.run({ plain = function() Plain.run(2e6) end, native = function() Native.run(2e6) end }, 7)
--   r.plain.medianMs, r.native.minMs, Bench.ratio(r, "plain", "native")  -- > 1 means native is faster

local Bench = {}

function Bench.run(cases, rounds)
	rounds = rounds or 7
	local names = {}
	for name in cases do
		table.insert(names, name)
	end
	table.sort(names)
	local times = {}
	for _, name in names do
		times[name] = {}
		cases[name]() -- warm-up
	end
	for _ = 1, rounds do
		for _, name in names do -- interleaved so drift hits every case alike
			local t0 = os.clock()
			cases[name]()
			table.insert(times[name], (os.clock() - t0) * 1000)
			if task then
				task.wait()
			end
		end
	end
	local out = {}
	for _, name in names do
		local t = times[name]
		table.sort(t)
		out[name] = {
			medianMs = math.floor(t[math.ceil(#t / 2)] * 1000) / 1000,
			minMs = math.floor(t[1] * 1000) / 1000,
			rounds = #t,
		}
	end
	return out
end

function Bench.ratio(results, base, other)
	return math.floor(results[base].medianMs / results[other].medianMs * 100) / 100
end

return Bench
