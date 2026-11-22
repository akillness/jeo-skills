--!nonstrict
-- Migrate: versioned, all-or-nothing schema migrations for a saved table (profile.Data).
--
--   local schema = Migrate.new({ latest = 3, steps = {
--       [2] = function(d) d.Items = arrayToCounts(d.Items) end,
--       [3] = function(d) d.Coins = (d.Coins or 0) + (d.Gold or 0); d.Gold = nil end,
--   } })
--   local status, from = schema:run(profile.Data)   -- "current" | "migrated" | "newer" | "error"
--
-- Run it BEFORE profile:Reconcile(): Reconcile copies the template's version field into old data
-- that lacks it, and the migrations are then skipped. Data without the field is version 1.
-- "newer" means a newer server build wrote this data: do not edit or save it from this build.
-- Steps run on a copy; the original table keeps its identity and changes only when all succeed.

local Migrate = {}
Migrate.__index = Migrate

local function deepCopy(v)
	if type(v) ~= "table" then
		return v
	end
	local out = {}
	for k, x in pairs(v) do
		out[k] = deepCopy(x)
	end
	return out
end

function Migrate.new(opts: any): any
	assert(type(opts.latest) == "number" and opts.latest >= 1, "Migrate.new: latest version required")
	local self = setmetatable({}, Migrate)
	self.latest = opts.latest
	self.steps = opts.steps or {}
	self.field = opts.field or "SchemaVersion"
	for v = 2, self.latest do
		assert(type(self.steps[v]) == "function", "Migrate.new: missing step " .. v)
	end
	return self
end

function Migrate:version(data)
	local v = data[self.field]
	if type(v) ~= "number" then
		return 1
	end
	return v
end

function Migrate:run(data)
	local from = self:version(data)
	if from > self.latest then
		return "newer", from
	end
	if from == self.latest then
		return "current", from
	end
	local work = deepCopy(data)
	for v = from + 1, self.latest do
		local ok, err = pcall(self.steps[v], work)
		if not ok then
			return "error", from, string.format("step %d failed: %s", v, tostring(err))
		end
		work[self.field] = v
	end
	for k in pairs(data) do
		data[k] = nil
	end
	for k, x in pairs(work) do
		data[k] = x
	end
	return "migrated", from
end

return Migrate
