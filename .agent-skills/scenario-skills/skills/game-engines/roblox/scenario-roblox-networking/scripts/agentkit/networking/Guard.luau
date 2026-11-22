--!strict
-- Guard: argument validators for remote handlers. Pure Luau: runs in Studio, Lune and the luau CLI.
--
--   local spec = { Guard.int(1, 99), Guard.str(32), Guard.inst(itemsFolder, "Tool") }
--   local ok, why = Guard.check(spec, ...)      -- the varargs after `player`
--
-- Every validator returns true only for a value the server can use as is. Numbers must be finite
-- (NaN passes typeof == "number" and fails every comparison, so range checks alone let it through).

export type Validator = (v: any) -> boolean

local Guard = {}

local function finite(n: number): boolean
	return math.isfinite(n)
end

function Guard.num(min: number, max: number): Validator
	return function(v: any): boolean
		return type(v) == "number" and finite(v) and v >= min and v <= max
	end
end

function Guard.int(min: number, max: number): Validator
	return function(v: any): boolean
		return type(v) == "number" and finite(v) and v % 1 == 0 and v >= min and v <= max
	end
end

-- Bytes, not characters. Rejects invalid UTF-8 (DataStores and TextService refuse it later).
function Guard.str(maxBytes: number, minBytes: number?): Validator
	local lo = minBytes or 0
	return function(v: any): boolean
		return type(v) == "string" and #v >= lo and #v <= maxBytes and utf8.len(v) ~= nil
	end
end

function Guard.bool(): Validator
	return function(v: any): boolean
		return type(v) == "boolean"
	end
end

-- Key must exist in a server-owned table (item ids, setting names). Never index with client strings first.
function Guard.oneOf(set: { [any]: any }): Validator
	return function(v: any): boolean
		return (type(v) == "string" or type(v) == "number") and set[v] ~= nil
	end
end

-- Every component finite; optional bound on magnitude (positions inside the map, unit directions).
function Guard.vec3(maxMagnitude: number?): Validator
	return function(v: any): boolean
		if typeof(v) ~= "Vector3" then
			return false
		end
		if not (finite(v.X) and finite(v.Y) and finite(v.Z)) then
			return false
		end
		return maxMagnitude == nil or v.Magnitude <= maxMagnitude
	end
end

-- Unit direction: finite and length within tolerance of 1.
function Guard.unit(tolerance: number?): Validator
	local tol = tolerance or 0.01
	return function(v: any): boolean
		return typeof(v) == "Vector3" and finite(v.X) and finite(v.Y) and finite(v.Z) and math.abs(v.Magnitude - 1) <= tol
	end
end

-- Real Instance (not a table that mimics one), still inside `folder` (a destroyed or reparented
-- instance fails), optionally of a class.
function Guard.inst(folder: Instance, className: string?): Validator
	return function(v: unknown): boolean
		if typeof(v) ~= "Instance" then
			return false
		end
		if not v:IsDescendantOf(folder) then
			return false
		end
		return className == nil or v:IsA(className)
	end
end

-- A table of plain values with a key count cap; nested tables are rejected.
function Guard.flatTable(maxKeys: number, value: Validator): Validator
	return function(v: any): boolean
		if type(v) ~= "table" or getmetatable(v) ~= nil then
			return false
		end
		local n = 0
		for k, x in v do
			n += 1
			if n > maxKeys or type(k) ~= "string" or not value(x) then
				return false
			end
		end
		return true
	end
end

function Guard.optional(inner: Validator): Validator
	return function(v: any): boolean
		return v == nil or inner(v)
	end
end

-- Validates the arguments after `player`. Extra arguments are rejected: a real client never sends them.
function Guard.check(spec: { Validator }, ...: any): (boolean, string?)
	local n = select("#", ...)
	if n > #spec then
		return false, string.format("too many arguments (%d > %d)", n, #spec)
	end
	for i, validate in spec do
		local v = select(i, ...)
		if not validate(v) then
			return false, string.format("argument %d rejected (%s)", i, typeof(v))
		end
	end
	return true, nil
end

return Guard
