--!nonstrict
-- AgentKit TestRunner: runs spec ModuleScripts (names ending in ".spec") with the AgentKit Spec.
-- Same entry point in Studio (rbx_run, any data model), the Studio command line (RunScript) and
-- Open Cloud Luau Execution. tools/test.luau runs the same spec files from disk under Lune.
--
--   local report = TestRunner.run({ game.ReplicatedStorage, game.ServerScriptService }, Spec)
--   -- {passed, failed, total, files, loadErrors = {{file, error}}, results = {{name, ok, error, ms}}}
--
-- A spec module returns `function(t)` and registers tests with `t:test(name, function(expect) end)`.
-- "X.studio.spec" modules need the engine: Lune skips them, Studio and the cloud run them.
-- A spec that fails to load counts as one failed test, so a broken file can never pass silently.

local TestRunner = {}

local function isSpec(inst)
	return inst:IsA("ModuleScript") and string.sub(inst.Name, -5) == ".spec"
end

function TestRunner.discover(roots)
	local found = {}
	for _, root in roots do
		if isSpec(root) then
			table.insert(found, root)
		end
		for _, d in root:GetDescendants() do
			if isSpec(d) then
				table.insert(found, d)
			end
		end
	end
	table.sort(found, function(a, b)
		return a:GetFullName() < b:GetFullName()
	end)
	return found
end

-- extra: optional {[label] = function(t)} specs passed as code (used to plant a failing test).
function TestRunner.run(roots, Spec, extra)
	local suite = Spec.new()
	local loadErrors = {}
	local files = 0
	local function register(label, fn)
		files += 1
		local proxy = {}
		function proxy.test(_, name, body)
			suite:test(label .. " > " .. name, body)
		end
		local ok, err = pcall(fn, proxy)
		if not ok then
			table.insert(loadErrors, { file = label, error = tostring(err) })
		end
	end
	for _, m in TestRunner.discover(roots) do
		local ok, fn = pcall(require, m)
		if ok and type(fn) == "function" then
			register(m:GetFullName(), fn)
		else
			table.insert(loadErrors, {
				file = m:GetFullName(),
				error = if ok then "spec module must return function(t)" else tostring(fn),
			})
		end
	end
	if extra then
		for label, fn in extra do
			register(label, fn)
		end
	end
	local report = suite:run()
	report.files = files
	report.loadErrors = loadErrors
	report.failed += #loadErrors
	report.total += #loadErrors
	return report
end

return TestRunner
