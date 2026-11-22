--!nonstrict
-- Offline gameplay audit of a place or model file, no Studio:
--   lune run lune_gameplay_audit.luau <place.rbxl|.rbxlx|.rbxm>
-- Prints {findings, tally} as JSON. Lune knows saved property values only.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local GameplayAudit = require("./GameplayAudit")

local file = process.args[1]
if not file then
	error("usage: lune run lune_gameplay_audit.luau <place.rbxl|.rbxm>")
end
local bytes = fs.readFile(file)
local root
if string.match(file, "%.rbxmx?$") then
	root = roblox.Instance.new("Folder")
	for _, inst in roblox.deserializeModel(bytes) do
		inst.Parent = root
	end
else
	root = roblox.deserializePlace(bytes)
end
print(serde.encode("json", GameplayAudit.run(root), true))
