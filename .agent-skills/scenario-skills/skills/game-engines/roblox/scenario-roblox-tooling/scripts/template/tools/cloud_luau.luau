--!nonstrict
-- Open Cloud Luau Execution: run a script against a place version with no Studio, then read its
-- result and logs. The key comes from ROBLOX_API_KEY and is never printed. This tool needs the scope
-- universe.place.luau-execution-session:write; the CI engine key also holds universe-places:write for
-- the Saved upload that comes before it (P13).
--   lune run tools/cloud_luau --universe U --place P [--version V] (--script-file F | --script S)
--        [--timeout 300s] [--expect-tests] [--max-wait 420] [--retries 6] [--backoff 5]
--        [--base URL] [--dry-run]
-- --expect-tests: exit 1 unless the first return value is a TestRunner report with failed == 0.
-- Limits (Open Cloud reference): create 5 per minute per key owner, get 200, logs 45; at most 10
-- incomplete tasks per place, the 11th create gets HTTP 429; script 4 MB; results 4 MB of JSON or
-- the task fails; logs keep the last 450 KB, so failures belong in the returned report. No physics,
-- place scripts do not run, changes never persist, DataStore calls hit real data.
-- A 429 is retried with backoff (backoff * attempt seconds, capped at 60); in CI, also queue engine
-- jobs in one concurrency group so pull requests never race for the 10 task slots.
local fs = require("@lune/fs")
local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")
local task = require("@lune/task")

local opts = { timeout = "300s", maxWait = 420, base = "https://apis.roblox.com", retries = 6, backoff = 5 }
local i = 1
while i <= #process.args do
	local a, v = process.args[i], process.args[i + 1]
	if a == "--dry-run" then
		opts.dryRun = true
		i += 1
	elseif a == "--expect-tests" then
		opts.expectTests = true
		i += 1
	else
		local key = ({
			["--universe"] = "universe",
			["--place"] = "place",
			["--version"] = "version",
			["--script-file"] = "scriptFile",
			["--script"] = "script",
			["--timeout"] = "timeout",
			["--max-wait"] = "maxWait",
			["--retries"] = "retries",
			["--backoff"] = "backoff",
			["--base"] = "base",
		})[a]
		if not key then
			error("unknown argument " .. a)
		end
		opts[key] = v
		i += 2
	end
end
assert(opts.universe and opts.place, "--universe and --place are required")
local source = opts.script or (opts.scriptFile and fs.readFile(opts.scriptFile))
assert(source, "--script or --script-file is required")

local createUrl = string.format(
	"%s/cloud/v2/universes/%s/places/%s%s/luau-execution-session-tasks",
	opts.base,
	opts.universe,
	opts.place,
	if opts.version then "/versions/" .. opts.version else ""
)
local body = serde.encode("json", { script = source, timeout = opts.timeout })

if opts.dryRun then
	print("POST " .. createUrl)
	print("x-api-key: <ROBLOX_API_KEY, " .. (if process.env.ROBLOX_API_KEY then "set" else "NOT SET") .. ">")
	print("body: " .. #body .. " bytes, timeout " .. opts.timeout)
	print("then GET <base>/cloud/v2/<task.path> until COMPLETE or FAILED, then <task.path>/logs?view=FLAT")
	process.exit(0)
end

local apiKey = process.env.ROBLOX_API_KEY
assert(apiKey and #apiKey > 0, "ROBLOX_API_KEY is not set")

local retries, backoff = tonumber(opts.retries), tonumber(opts.backoff)

local function call(method, url, payload)
	for attempt = 1, retries do
		local res = net.request({
			url = url,
			method = method,
			headers = { ["x-api-key"] = apiKey, ["content-type"] = "application/json" },
			body = payload,
		})
		if res.statusCode == 429 then
			if attempt == retries then
				print(
					string.format(
						"%s still 429 after %d tries: 10 tasks of this place are unfinished or the key owner"
							.. " hit 5 creates per minute; queue engine jobs in one concurrency group",
						method,
						retries
					)
				)
				process.exit(1)
			end
			local wait = math.min(60, backoff * attempt)
			print(string.format("429 on %s, retry %d of %d in %.1f s", method, attempt, retries - 1, wait))
			task.wait(wait)
		elseif not res.ok then
			error(string.format("%s %s -> %d %s", method, url, res.statusCode, string.sub(res.body or "", 1, 500)))
		else
			return serde.decode("json", res.body)
		end
	end
	error("unreachable")
end

local t0 = os.clock()
local created = call("POST", createUrl, body)
local path = created.path
print("task " .. tostring(path) .. " " .. tostring(created.state))
local state, final = created.state, created
local deadline = os.time() + tonumber(opts.maxWait)
while state ~= "COMPLETE" and state ~= "FAILED" and state ~= "CANCELLED" do
	if os.time() > deadline then
		print("timed out waiting, last state " .. tostring(state))
		process.exit(3)
	end
	task.wait(2)
	final = call("GET", opts.base .. "/cloud/v2/" .. path)
	state = final.state
end

local logs = call("GET", opts.base .. "/cloud/v2/" .. path .. "/logs?view=FLAT&maxPageSize=10000")
for _, entry in logs.luauExecutionSessionTaskLogs or {} do
	for _, line in entry.messages or {} do
		print("log  " .. line)
	end
end
print(string.format("state %s after %.1f s", state, os.clock() - t0))

if state ~= "COMPLETE" then
	print("error " .. serde.encode("json", final.error or {}))
	process.exit(1)
end
local results = (final.output and final.output.results) or {}
print("results " .. serde.encode("json", results))
if opts.expectTests then
	local r = results[1]
	if type(r) ~= "table" or type(r.failed) ~= "number" or r.failed > 0 or (r.total or 0) == 0 then
		print("tests did not pass")
		process.exit(1)
	end
	print(string.format("tests: %d passed, %d failed", r.passed or 0, r.failed))
end
process.exit(0)
