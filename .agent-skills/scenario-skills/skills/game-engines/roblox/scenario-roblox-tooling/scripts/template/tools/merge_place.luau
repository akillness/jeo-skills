--!nonstrict
-- Release place = the builders' base place + the code from the Rojo build, no Studio:
--   lune run tools/merge_place --base assets/start.rbxl --code build/ship.rbxl --out build/start.rbxl [--project ship.project.json]
--   lune run tools/merge_place --manifest places.json [--live-versions build/live_versions.json]
-- places.json entries: {"name", "place", "file", "base"?, "code"?, "project"?, "buildPlace"?,
-- "baseVersion"?}; without "base" the code build is copied to "file" unchanged.
-- Stale base guard: "baseVersion" is the Version History number of the builders' place ("buildPlace")
-- when the base copy was saved. With --live-versions ({"<name>": newest number}, from
-- tools/place_versions), a base whose baseVersion is missing or older than the newest version is
-- refused (exit 1, nothing written): builders saved work after the copy, and merging it would ship
-- the old map.
-- Every node of the project file that Rojo builds from the repository ($path, or $className below a
-- service) replaces the instance of the same path in the base place. Everything else in the base
-- (Workspace map, Terrain, Lighting, builders' assets) is kept. The merged place then goes through
-- ShipCheck. Prints one JSON report per place.
-- Exit 0: merged and ShipCheck ok. Exit 1: bad input or a ShipCheck error.
-- Exit 2: the place that ships holds instances the place publishing API does not update
-- (EditableImage, EditableMesh, PartOperation, SurfaceAppearance, BaseWrap): the file is still
-- written, for a person to open in Studio and publish from there (place publishing guide).
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local ShipCheck = require("./testkit/ShipCheck")

local PUBLISH_API_UNSUPPORTED = { "PartOperation", "SurfaceAppearance", "EditableImage", "EditableMesh", "BaseWrap" }
local MAX_LIST = 20

local opts = {}
local i = 1
while i <= #process.args do
	local key = ({
		["--base"] = "base",
		["--code"] = "code",
		["--out"] = "file",
		["--project"] = "project",
		["--manifest"] = "manifest",
		["--live-versions"] = "liveVersions",
	})[process.args[i]]
	if not key then
		error("unknown argument " .. tostring(process.args[i]))
	end
	opts[key] = process.args[i + 1]
	i += 2
end

local function isAny(inst, classNames)
	for _, className in classNames do
		local ok, yes = pcall(function()
			return inst:IsA(className)
		end)
		if ok and yes then
			return className
		end
	end
	return nil
end

local function isCode(inst)
	return inst:IsA("LuaSourceContainer")
end

local function push(list, item)
	if #list < MAX_LIST then
		table.insert(list, item)
	end
end

local function childNamed(parent, name, report, path)
	local found = nil
	for _, child in parent:GetChildren() do
		if child.Name == name then
			if found then
				table.insert(report.errors, path .. ": two children with this name in the base place")
				return found
			end
			found = child
		end
	end
	return found
end

-- Moves the code instance into the base, replacing the base instance of the same name.
local function replace(baseParent, codeInst, name, path, report)
	local old = childNamed(baseParent, name, report, path)
	if old then
		for _, d in old:GetDescendants() do
			if not isCode(d) and not d:IsA("Folder") then
				report.droppedCount += 1
				push(report.dropped, { path = d:GetFullName(), class = d.ClassName })
			end
		end
		old:Destroy()
	end
	if codeInst then
		codeInst.Parent = baseParent
		table.insert(if old then report.replaced else report.added, path)
	elseif old then
		table.insert(report.removed, path)
	end
end

local function copyProperties(node, codeInst, baseInst, path, report)
	local props = node["$properties"]
	if type(props) ~= "table" then
		return
	end
	for name in props do
		local ok, err = pcall(function()
			baseInst[name] = codeInst[name]
		end)
		if not ok then
			table.insert(report.errors, path .. "." .. name .. ": " .. tostring(err))
		end
	end
end

local function mergeNode(node, codeParent, baseParent, path, atRoot, base, report)
	for key, child in node do
		if string.sub(key, 1, 1) == "$" or type(child) ~= "table" then
			continue
		end
		local childPath = if path == "" then key else path .. "." .. key
		local codeInst = codeParent:FindFirstChild(key)
		if atRoot then
			local svc = base:GetService(key)
			if child["$path"] ~= nil then
				-- the repository owns the whole service: replace its children
				for _, c in svc:GetChildren() do
					replace(svc, nil, c.Name, childPath .. "." .. c.Name, report)
				end
				if codeInst then
					for _, c in codeInst:GetChildren() do
						c.Parent = svc
					end
				end
				table.insert(report.owned, childPath)
			else
				if codeInst then
					copyProperties(child, codeInst, svc, childPath, report)
					mergeNode(child, codeInst, svc, childPath, false, base, report)
				end
			end
		elseif child["$path"] ~= nil or child["$className"] ~= nil then
			table.insert(report.owned, childPath)
			replace(baseParent, codeInst, key, childPath, report)
		else
			local baseInst = childNamed(baseParent, key, report, childPath)
			if not baseInst then
				replace(baseParent, codeInst, key, childPath, report)
			elseif codeInst then
				copyProperties(child, codeInst, baseInst, childPath, report)
				mergeNode(child, codeInst, baseInst, childPath, false, base, report)
			end
		end
	end
end

local function underAny(inst, owned)
	local full = inst:GetFullName()
	for _, p in owned do
		if full == p or string.sub(full, 1, #p + 1) == p .. "." then
			return true
		end
	end
	return false
end

local function savedRoots(game)
	local roots = {}
	for _, svc in game:GetChildren() do
		table.insert(roots, svc)
	end
	return roots
end

local live = if opts.liveVersions then serde.decode("json", fs.readFile(opts.liveVersions)) else nil

-- Refuses a base copy older than the builders' place. Returns a line for the report.
local function freshness(p)
	if not p.base then
		return "n/a: code-only place"
	end
	if not p.buildPlace then
		return 'not checked: no "buildPlace" in places.json; compare "baseVersion" with Window > Version History by hand'
	end
	if not live then
		return "not checked: no --live-versions (run tools/place_versions first)"
	end
	local newest = live[p.name]
	if newest == nil then
		error(p.name .. ": --live-versions has no entry for this place", 0)
	end
	if type(p.baseVersion) ~= "number" then
		error(
			string.format(
				'%s: no "baseVersion" in places.json. Record the Version History number of build place %s '
					.. "when you save %s (newest is %d)",
				p.name,
				tostring(p.buildPlace),
				p.base,
				newest
			),
			0
		)
	end
	if p.baseVersion < newest then
		error(
			string.format(
				"%s: %s was saved at version %d but build place %s is at version %d. Builders saved work after "
					.. "this copy; merging it would ship the old map. Save the place again (File > Save to File) "
					.. 'and set "baseVersion" to %d',
				p.name,
				p.base,
				p.baseVersion,
				tostring(p.buildPlace),
				newest,
				newest
			),
			0
		)
	end
	if p.baseVersion > newest then
		error(
			string.format(
				'%s: "baseVersion" %d is newer than build place %s (%d): check the number',
				p.name,
				p.baseVersion,
				tostring(p.buildPlace),
				newest
			),
			0
		)
	end
	return string.format("checked: base at version %d, build place at %d", p.baseVersion, newest)
end

local function mergeOne(p)
	local report = {
		name = p.name,
		file = p.file,
		owned = {},
		replaced = {},
		added = {},
		removed = {},
		dropped = {},
		droppedCount = 0,
		baseScripts = {},
		unsupported = {},
		errors = {},
	}
	assert(p.file, 'every place needs "file" (the place that ships)')
	report.freshness = freshness(p)
	local codeFile = p.code or "build/ship.rbxl"
	assert(
		fs.isFile(codeFile),
		"missing code build " .. codeFile .. " (rojo build ship.project.json -o " .. codeFile .. ")"
	)
	local game
	if not p.base then
		report.base = "none: code-only place"
		game = roblox.deserializePlace(fs.readFile(codeFile))
	else
		if not fs.isFile(p.base) then
			error(
				"missing base place "
					.. p.base
					.. ': a builder saves it from Studio with File > Save to File, or remove "base" to ship code only'
			)
		end
		report.base = p.base
		local project = serde.decode("json", fs.readFile(p.project or "ship.project.json"))
		game = roblox.deserializePlace(fs.readFile(p.base))
		local code = roblox.deserializePlace(fs.readFile(codeFile))
		mergeNode(project.tree, code, game, "", true, game, report)
	end

	-- Checked on the place that ships, so content from model files (option A) is caught as well.
	for _, root in savedRoots(game) do
		for _, d in root:GetDescendants() do
			if isAny(d, PUBLISH_API_UNSUPPORTED) then
				push(report.unsupported, { path = d:GetFullName(), class = d.ClassName })
			elseif p.base and isCode(d) and not underAny(d, report.owned) then
				push(report.baseScripts, d:GetFullName())
			end
		end
	end

	if p.base then
		fs.writeFile(p.file, roblox.serializePlace(game))
	elseif codeFile ~= p.file then
		fs.writeFile(p.file, fs.readFile(codeFile))
	end
	report.shipCheck = ShipCheck.run(game, { requirePaths = report.owned })
	report.ok = #report.errors == 0 and report.shipCheck.ok and #report.unsupported == 0
	if #report.errors > 0 or not report.shipCheck.ok then
		return report, 1
	end
	if #report.unsupported > 0 then
		report.message = string.format(
			"%s holds %d instance(s) the place publishing API does not update (%s, ...): publish it from Studio "
				.. "(open it, File > Publish to Roblox); the pipeline does not upload it",
			p.file,
			#report.unsupported,
			report.unsupported[1].class
		)
		return report, 2
	end
	return report, 0
end

local places
if opts.manifest then
	places = serde.decode("json", fs.readFile(opts.manifest)).places
else
	assert(opts.code and opts.file, "--code and --out are required (or --manifest places.json)")
	places = { { name = "place", base = opts.base, code = opts.code, project = opts.project, file = opts.file } }
end

local worst = 0
for _, p in places do
	local ok, report, code = pcall(mergeOne, p)
	if not ok then
		report, code = { name = p.name, ok = false, errors = { tostring(report) } }, 1
	end
	if report.shipCheck then
		report.shipCheck = {
			ok = report.shipCheck.ok,
			counts = report.shipCheck.counts,
			byRule = report.shipCheck.byRule,
			findings = report.shipCheck.findings,
		}
	end
	report.exit = code
	print(serde.encode("json", report, false))
	if report.message then
		print(report.message)
	end
	worst = math.max(worst, code)
end
process.exit(worst)
