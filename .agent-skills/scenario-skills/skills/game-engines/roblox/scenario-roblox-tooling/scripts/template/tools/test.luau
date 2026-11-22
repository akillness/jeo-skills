--!nonstrict
-- Runs every *.spec.luau under the given folders (default: src) in Lune with the AgentKit Spec.
-- Skips *.studio.spec.luau (engine needed). Run from the repository root:
--   lune run tools/test [folders...] [--json build/tests.json]
-- Exit code 1 when a test fails or a spec file does not load.
local fs = require("@lune/fs")
local process = require("@lune/process")
local serde = require("@lune/serde")

local Spec = require("./testkit/Spec")

local roots, jsonOut = {}, nil
local i = 1
while i <= #process.args do
	local a = process.args[i]
	if a == "--json" then
		jsonOut = process.args[i + 1]
		i += 2
	else
		table.insert(roots, (string.gsub(a, "/+$", "")))
		i += 1
	end
end
if #roots == 0 then
	roots = { "src" }
end

local function walk(dir, out)
	for _, name in fs.readDir(dir) do
		local p = dir .. "/" .. name
		if fs.isDir(p) then
			walk(p, out)
		elseif string.sub(name, -10) == ".spec.luau" and string.sub(name, -17) ~= ".studio.spec.luau" then
			table.insert(out, p)
		end
	end
end

local files = {}
for _, root in roots do
	if string.sub(root, 1, 1) == "/" then
		error("pass folders relative to the repository root, got " .. root)
	end
	walk(root, files)
end
table.sort(files)

local suite = Spec.new()
local loadErrors = {}
for _, file in files do
	-- require paths resolve from this file (tools/), so step up to the repository root.
	local ok, fn = pcall(require, "../" .. string.sub(file, 1, -6))
	if ok and type(fn) == "function" then
		local proxy = {}
		function proxy.test(_, name, body)
			suite:test(file .. " > " .. name, body)
		end
		local okReg, err = pcall(fn, proxy)
		if not okReg then
			table.insert(loadErrors, { file = file, error = tostring(err) })
		end
	else
		table.insert(loadErrors, { file = file, error = if ok then "spec must return function(t)" else tostring(fn) })
	end
end

local report = suite:run()
report.files = #files
report.loadErrors = loadErrors
report.failed += #loadErrors
report.total += #loadErrors

for _, r in report.results do
	if not r.ok then
		print("FAIL " .. r.name .. "\n     " .. tostring(r.error))
	end
end
for _, e in loadErrors do
	print("LOAD " .. e.file .. "\n     " .. e.error)
end
print(string.format("tests: %d passed, %d failed, %d files", report.passed, report.failed, report.files))
if jsonOut then
	fs.writeFile(jsonOut, serde.encode("json", report, true))
end
process.exit(if report.failed > 0 or report.total == 0 then 1 else 0)
