--!nonstrict
-- Restart game servers after a publish, through Open Cloud (universes/{id}:restartServers).
--   lune run tools/restart_servers --universe U [--places P1,P2] [--all-versions]
--        [--bleed-off-minutes 10] [--base URL] [--dry-run]
-- Defaults: only servers on an outdated version, 10-minute bleed-off (1 to 60). --bleed-off-minutes 0
-- shuts servers down at once. Players then teleport to the new version. Needs ROBLOX_RESTART_LIVE=1,
-- set only by the approved release job, and a key with universe:write (30 calls per minute).
local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")

local opts = { base = "https://apis.roblox.com", bleed = 10 }
local i = 1
while i <= #process.args do
	local a, v = process.args[i], process.args[i + 1]
	if a == "--all-versions" or a == "--dry-run" then
		opts[if a == "--dry-run" then "dryRun" else "allVersions"] = true
		i += 1
	else
		local key = ({
			["--universe"] = "universe",
			["--places"] = "places",
			["--bleed-off-minutes"] = "bleed",
			["--base"] = "base",
		})[a]
		if not key then
			error("unknown argument " .. a)
		end
		opts[key] = v
		i += 2
	end
end
assert(opts.universe, "--universe is required")
local bleed = tonumber(opts.bleed)
assert(bleed and bleed >= 0 and bleed <= 60, "--bleed-off-minutes must be 0 to 60")

local body = { closeAllVersions = opts.allVersions == true, bleedOffServers = bleed > 0 }
if bleed > 0 then
	body.bleedOffDurationMinutes = bleed
end
if opts.places then
	body.placeIds = {}
	for id in string.gmatch(opts.places, "%d+") do
		table.insert(body.placeIds, tonumber(id))
	end
end
local url = string.format("%s/cloud/v2/universes/%s:restartServers", opts.base, tostring(opts.universe))

if opts.dryRun then
	print("POST " .. url)
	print("body " .. serde.encode("json", body))
	process.exit(0)
end
if process.env.ROBLOX_RESTART_LIVE ~= "1" then
	error("restarting servers needs ROBLOX_RESTART_LIVE=1 (set only by the approved release job)")
end
local key = process.env.ROBLOX_API_KEY
assert(key and #key > 0, "ROBLOX_API_KEY is not set")

local res = net.request({
	url = url,
	method = "POST",
	headers = { ["x-api-key"] = key, ["content-type"] = "application/json" },
	body = serde.encode("json", body),
})
if not res.ok then
	print(string.format("restart failed: %d %s", res.statusCode, string.sub(res.body or "", 1, 300)))
	process.exit(1)
end
print("restart requested: " .. serde.encode("json", body))
