--!strict
-- Engine-side test entry, built into ServerStorage.TestKit by default.project.json only.
-- One line runs it everywhere: Open Cloud Luau Execution, the Studio command line, rbx_run:
--   return require(game:GetService("ServerStorage").TestKit.EngineTests)()
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Spec = require(script.Parent.Spec) :: any
local TestRunner = require(script.Parent.TestRunner) :: any

return function(extra: { [string]: (any) -> () }?)
	local report = TestRunner.run({ ReplicatedStorage, ServerScriptService }, Spec, extra)
	print(string.format("tests: %d passed, %d failed, %d files", report.passed, report.failed, report.files))
	return report
end
