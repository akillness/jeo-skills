--!nonstrict
-- Release gate on a built place file, no Studio:
--   lune run tools/ship_check build/ship.rbxl [--require ReplicatedStorage.Packages ...]
-- Prints the ShipCheck report as JSON; exit code 1 when any finding is an error.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local ShipCheck = require("./testkit/ShipCheck")

local file = process.args[1]
if not file then
	error("usage: lune run tools/ship_check <place.rbxl> [--require Dotted.Path ...]")
end
local requirePaths = {}
local i = 2
while i <= #process.args do
	if process.args[i] == "--require" then
		table.insert(requirePaths, process.args[i + 1])
		i += 2
	else
		i += 1
	end
end

local game = roblox.deserializePlace(fs.readFile(file))
local report = ShipCheck.run(game, { requirePaths = requirePaths })
print(serde.encode("json", report, true))
process.exit(if report.ok then 0 else 1)
