--!nonstrict
-- Newest Version History number of each builders' place, for merge_place --live-versions:
--   lune run tools/place_versions --manifest places.json --out build/live_versions.json [--base URL]
-- Reads every places.json entry that has "buildPlace" (the Team Create place its base copy came from)
-- and writes {"<name>": newest version number}. Entries without "buildPlace" are skipped.
-- Endpoint: GET /place-version-history-api/v1/{placeId}/history, scope universe.place:read, marked
-- EXPERIMENTAL in the Open Cloud reference (120 calls per minute per key owner). The reference does not
-- say how pages are sorted, so this reads every page and keeps the highest number.
-- Reads ROBLOX_API_KEY and never prints it. Exit 1 on any failed call.
local fs = require("@lune/fs")
local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")

local MAX_PAGES = 200

local opts = { base = "https://apis.roblox.com" }
local i = 1
while i <= #process.args do
	local key = ({ ["--manifest"] = "manifest", ["--out"] = "out", ["--base"] = "base" })[process.args[i]]
	if not key then
		error("unknown argument " .. tostring(process.args[i]))
	end
	opts[key] = process.args[i + 1]
	i += 2
end
assert(opts.manifest and opts.out, "--manifest and --out are required")

local function fail(message)
	print("place_versions failed: " .. message)
	process.exit(1)
end

local places = serde.decode("json", fs.readFile(opts.manifest)).places
local key = process.env.ROBLOX_API_KEY
local live = {}

for _, p in places do
	if p.buildPlace then
		if not key or #key == 0 then
			fail("ROBLOX_API_KEY is not set")
		end
		local newest, cursor, pages = nil, nil, 0
		repeat
			pages += 1
			if pages > MAX_PAGES then
				fail(string.format("%s: more than %d pages of versions", p.name, MAX_PAGES))
			end
			local url = string.format(
				"%s/place-version-history-api/v1/%s/history?pageSize=100",
				opts.base,
				tostring(p.buildPlace)
			)
			if cursor then
				url ..= "&cursor=" .. net.urlEncode(cursor)
			end
			local res = net.request({ url = url, method = "GET", headers = { ["x-api-key"] = key } })
			if not res.ok then
				fail(
					string.format(
						"%s: history returned %d %s",
						p.name,
						res.statusCode,
						string.sub(res.body or "", 1, 200)
					)
				)
			end
			local page = serde.decode("json", res.body)
			for _, v in page.placeVersions or {} do
				local n = tonumber(v.version)
				if n and (newest == nil or n > newest) then
					newest = n
				end
			end
			cursor = if page.hasMore then page.nextCursor else nil
		until not cursor
		if newest == nil then
			fail(p.name .. ": no versions returned for place " .. tostring(p.buildPlace))
		end
		live[p.name] = newest
		print(string.format("%s: build place %s is at version %d", p.name, tostring(p.buildPlace), newest))
	end
end

fs.writeFile(opts.out, serde.encode("json", live))
