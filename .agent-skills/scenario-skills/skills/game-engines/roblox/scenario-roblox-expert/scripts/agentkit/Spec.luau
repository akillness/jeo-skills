--!nonstrict
-- AgentKit Spec: a tiny test runner that returns its report as a table (no output parsing).
-- Runs in Studio (any data model, through rbx_run) and in plain Luau or Lune.
--
--   local t = Spec.new()
--   t:test("damage is clamped", function(expect)
--       expect(Combat.damage(-5)).toBe(0)
--       expect(Combat.damage(1e9)).toBeAtMost(100)
--   end)
--   return t:run()     -- {passed, failed, total, results = {{name, ok, error, ms}}}
--
-- expect(v): toBe, toEqual (deep), toBeNear(x, eps), toBeTruthy, toBeFalsy, toBeA(typeName or
-- className), toBeAtLeast, toBeAtMost, toContain (string or array), toThrow (v is a function).

local Spec = {}
Spec.__index = Spec

local function show(v)
	if type(v) == "string" then
		return string.format("%q", v)
	end
	return tostring(v)
end

local function deepEqual(a, b, seen)
	if a == b then
		return true
	end
	if type(a) ~= "table" or type(b) ~= "table" then
		return false
	end
	seen = seen or {}
	if seen[a] == b then
		return true
	end
	seen[a] = b
	for k, v in pairs(a) do
		if not deepEqual(v, b[k], seen) then
			return false
		end
	end
	for k in pairs(b) do
		if a[k] == nil then
			return false
		end
	end
	return true
end

local function expect(v)
	local m = {}
	local function check(cond, msg)
		if not cond then
			error(msg, 3)
		end
	end
	function m.toBe(x)
		check(v == x, "expected " .. show(v) .. " to be " .. show(x))
	end
	function m.toEqual(x)
		check(deepEqual(v, x), "expected tables to be deeply equal")
	end
	function m.toBeNear(x, eps)
		eps = eps or 1e-4
		check(type(v) == "number" and math.abs(v - x) <= eps, "expected " .. show(v) .. " to be within " .. eps .. " of " .. show(x))
	end
	function m.toBeTruthy()
		check(v, "expected " .. show(v) .. " to be truthy")
	end
	function m.toBeFalsy()
		check(not v, "expected " .. show(v) .. " to be falsy")
	end
	function m.toBeA(kind)
		local t = typeof(v)
		local ok = t == kind or (t == "Instance" and v:IsA(kind))
		check(ok, "expected a " .. kind .. ", got " .. t)
	end
	function m.toBeAtLeast(x)
		check(v >= x, "expected " .. show(v) .. " >= " .. show(x))
	end
	function m.toBeAtMost(x)
		check(v <= x, "expected " .. show(v) .. " <= " .. show(x))
	end
	function m.toContain(x)
		if type(v) == "string" then
			check(v:find(x, 1, true) ~= nil, "expected " .. show(v) .. " to contain " .. show(x))
		else
			check(table.find(v, x) ~= nil, "expected array to contain " .. show(x))
		end
	end
	function m.toThrow(pattern)
		local ok, err = pcall(v)
		check(not ok, "expected function to throw")
		if pattern then
			check(tostring(err):find(pattern) ~= nil, "error " .. show(tostring(err)) .. " does not match " .. show(pattern))
		end
	end
	return m
end

function Spec.new()
	return setmetatable({ tests = {} }, Spec)
end

function Spec:test(name, fn)
	table.insert(self.tests, { name = name, fn = fn })
end

function Spec:run()
	local results, passed = {}, 0
	for _, t in ipairs(self.tests) do
		local t0 = os.clock()
		local ok, err = xpcall(t.fn, function(e)
			return tostring(e)
		end, expect)
		if ok then
			passed += 1
		end
		table.insert(results, { name = t.name, ok = ok, error = if ok then nil else err, ms = math.floor((os.clock() - t0) * 1e5) / 100 })
	end
	return { passed = passed, failed = #self.tests - passed, total = #self.tests, results = results }
end

return Spec
