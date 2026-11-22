--!nonstrict
-- Place publishing through Open Cloud, all places of a game in two phases:
-- phase 1 uploads every place as a Saved version (not served to players); phase 2 runs only when
-- every upload succeeded and only with --published plus ROBLOX_PUBLISH_LIVE=1.
--   lune run tools/publish --universe U --place P --file build/ship.rbxl [--published] [--base URL] [--dry-run]
--   lune run tools/publish --manifest places.json [--published] ...
-- places.json: {"universe": U, "places": [{"name": "Lobby", "place": P, "file": "build/lobby.rbxl"}]}
-- "file" is what ships: run tools/merge_place --manifest places.json first, which writes it from
-- the code build and the place's "base" (the builders' place), when one is set.
-- The key comes from ROBLOX_API_KEY (scope universe-places:write, this experience only; the release key
-- may also hold universe:write and universe.place:read, see publish.yml).
-- The API does not update EditableImage, EditableMesh, PartOperation, SurfaceAppearance or BaseWrap.
local fs = require("@lune/fs")
local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")

local opts = { base = "https://apis.roblox.com" }
local i = 1
while i <= #process.args do
	local a, v = process.args[i], process.args[i + 1]
	if a == "--published" or a == "--dry-run" then
		opts[if a == "--published" then "published" else "dryRun"] = true
		i += 1
	else
		local key = ({
			["--universe"] = "universe",
			["--place"] = "place",
			["--file"] = "file",
			["--manifest"] = "manifest",
			["--base"] = "base",
		})[a]
		if not key then
			error("unknown argument " .. a)
		end
		opts[key] = v
		i += 2
	end
end

local universe, places
if opts.manifest then
	local m = serde.decode("json", fs.readFile(opts.manifest))
	universe, places = tostring(m.universe), m.places
else
	assert(opts.universe and opts.place and opts.file, "--universe, --place and --file are required")
	universe, places = opts.universe, { { name = "place", place = opts.place, file = opts.file } }
end
for _, p in places do
	assert(fs.isFile(p.file), "missing place file " .. p.file)
end
if opts.published and process.env.ROBLOX_PUBLISH_LIVE ~= "1" then
	error("--published needs ROBLOX_PUBLISH_LIVE=1 (set only by the approved release job)")
end

local function upload(p, versionType)
	local url = string.format(
		"%s/universes/v1/%s/places/%s/versions?versionType=%s",
		opts.base,
		universe,
		tostring(p.place),
		versionType
	)
	local contentType = if string.sub(p.file, -6) == ".rbxlx" then "application/xml" else "application/octet-stream"
	if opts.dryRun then
		print(string.format("POST %s (%s, %d bytes)", url, contentType, #fs.readFile(p.file)))
		return 0
	end
	local res = net.request({
		url = url,
		method = "POST",
		headers = { ["x-api-key"] = process.env.ROBLOX_API_KEY or "", ["content-type"] = contentType },
		body = fs.readFile(p.file),
	})
	if not res.ok then
		error(
			string.format(
				"%s %s failed: %d %s",
				p.name,
				versionType,
				res.statusCode,
				string.sub(res.body or "", 1, 300)
			)
		)
	end
	local version = serde.decode("json", res.body).versionNumber
	print(string.format("%s %s version %s", p.name, versionType, tostring(version)))
	return version
end

if not opts.dryRun then
	assert(process.env.ROBLOX_API_KEY and #process.env.ROBLOX_API_KEY > 0, "ROBLOX_API_KEY is not set")
end
local saved = {}
for _, p in places do
	saved[p.name] = upload(p, "Saved")
end
if opts.published then
	for _, p in places do
		upload(p, "Published")
	end
end
print(serde.encode("json", { saved = saved, published = opts.published == true }))
