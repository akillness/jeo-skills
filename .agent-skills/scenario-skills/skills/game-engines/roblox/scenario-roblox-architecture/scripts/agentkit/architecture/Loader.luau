--!strict
-- Loader: one entry Script per side boots every ModuleScript in two phases.
--
--   local Loader = require(ReplicatedStorage.Shared.Loader)
--   Loader.boot(Loader.ordered(script.Parent.Services, { "PlayerService", "RoundService" }), { publish = script })
--
-- Module contract:
--   top level: definitions only (no connections, instances or yields), so requiring the module
--   from a test, a plugin or the wrong side does nothing harmful;
--   Init(self, registry): own state, references, signal objects; must not yield;
--   Start(self, registry): may yield and may call other modules; runs in its own thread.
-- Every Init finishes before any Start, so the order of `require` never matters.
--
-- Report: { ok, order, log = {"require:A", "init:A", "start:A", ...}, errors = {{name, phase, message}}, ms }
-- With opts.publish = <Instance>, the report is written as attributes BootOk, BootErrors, BootLog,
-- BootMs and BootCount (incremented per boot: 2 means the entry script ran twice).

export type BootError = { name: string, phase: string, message: string }
export type Report = {
	ok: boolean,
	order: { string },
	log: { string },
	errors: { BootError },
	ms: number,
}
export type Options = {
	publish: Instance?,
	require: ((any) -> any)?,
	spawn: ((fn: () -> ()) -> ())?,
	clock: (() -> number)?,
	warn: ((...any) -> ())?,
}

local Loader = {}

-- xpcall message handler. Passing debug.traceback directly fails the new type solver (its overloads
-- leave xpcall's error type uninferable); this wrapper gives the same text.
local function trace(err: any): string
	return debug.traceback(tostring(err), 2)
end

-- ModuleScripts under `folder` reached through Folders only (a module's own child modules stay
-- private), the names in `first` in that order, then the rest sorted by path.
function Loader.ordered(folder: Instance, first: { string }?): { ModuleScript }
	local found: { [string]: ModuleScript } = {}
	local paths: { string } = {}
	local function walk(node: Instance, prefix: string)
		for _, child in node:GetChildren() do
			local path = prefix .. child.Name
			if child:IsA("ModuleScript") then
				if found[child.Name] then
					error(`Loader.ordered: two modules named {child.Name} under {folder:GetFullName()}`)
				end
				found[child.Name] = child
				table.insert(paths, path)
			elseif child:IsA("Folder") then
				walk(child, path .. "/")
			end
		end
	end
	walk(folder, "")
	table.sort(paths)
	local out: { ModuleScript } = {}
	local used: { [ModuleScript]: boolean } = {}
	if first then
		for _, name in first do
			local m = found[name]
			if not m then
				error(`Loader.ordered: {name} not found under {folder:GetFullName()}`)
			end
			table.insert(out, m)
			used[m] = true
		end
	end
	for _, path in paths do
		local name = string.match(path, "([^/]+)$") :: string
		local m = found[name]
		if not used[m] then
			table.insert(out, m)
			used[m] = true
		end
	end
	return out
end

local function publish(report: Report, target: Instance)
	target:SetAttribute("BootOk", report.ok)
	target:SetAttribute("BootErrors", #report.errors)
	target:SetAttribute("BootLog", table.concat(report.log, ","))
	target:SetAttribute("BootMs", math.floor(report.ms * 100 + 0.5) / 100)
end

function Loader.boot(modules: { any }, opts: Options?): Report
	local o: Options = opts or {}
	local req: (any) -> any = o.require or require
	local fork: (() -> ()) -> () = o.spawn or function(fn: () -> ())
		task.spawn(fn)
	end
	local clock: () -> number = o.clock or os.clock
	local say: (...any) -> () = o.warn or warn
	local t0 = clock()
	local report: Report = { ok = true, order = {}, log = {}, errors = {}, ms = 0 }
	local registry: { [string]: any } = {}
	local loaded: { { name: string, mod: any } } = {}

	local function fail(name: string, phase: string, message: string)
		report.ok = false
		table.insert(report.errors, { name = name, phase = phase, message = message })
		say(`[Loader] {phase} {name} failed: {message}`)
		if o.publish then
			publish(report, o.publish)
		end
	end

	if o.publish then
		o.publish:SetAttribute("BootCount", ((o.publish:GetAttribute("BootCount") :: number?) or 0) + 1)
	end

	-- Phase 1: require everything. A failing module is reported, the others still boot.
	for _, m in modules do
		local name = tostring(m.Name)
		if registry[name] ~= nil then
			fail(name, "require", "duplicate module name")
			continue
		end
		local ok, result = pcall(req, m)
		if not ok then
			fail(name, "require", tostring(result))
			continue
		end
		if type(result) ~= "table" then
			fail(name, "require", "module must return a table")
			continue
		end
		registry[name] = result
		table.insert(loaded, { name = name, mod = result })
		table.insert(report.order, name)
		table.insert(report.log, "require:" .. name)
	end
	table.freeze(registry)

	-- Phase 2: Init in order. It runs in a coroutine so a yield is caught instead of stalling boot.
	for _, e in loaded do
		local init = e.mod.Init
		if type(init) ~= "function" then
			continue
		end
		local co = coroutine.create(init)
		local ok, err = coroutine.resume(co, e.mod, registry)
		if not ok then
			fail(e.name, "init", debug.traceback(co, tostring(err)))
		elseif coroutine.status(co) ~= "dead" then
			fail(e.name, "init", "Init yielded: move yielding work to Start")
		else
			table.insert(report.log, "init:" .. e.name)
		end
	end

	-- Phase 3: Start, each in its own thread; errors after a yield still land in the report.
	for _, e in loaded do
		local start = e.mod.Start
		if type(start) ~= "function" then
			continue
		end
		table.insert(report.log, "start:" .. e.name)
		fork(function()
			local ok, err = xpcall(start, trace, e.mod, registry)
			if not ok then
				fail(e.name, "start", tostring(err))
			end
		end)
	end

	report.ms = (clock() - t0) * 1000
	if o.publish then
		publish(report, o.publish)
	end
	return report
end

return Loader
