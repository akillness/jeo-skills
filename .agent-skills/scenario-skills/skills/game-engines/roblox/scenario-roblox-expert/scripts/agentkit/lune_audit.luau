--!nonstrict
-- Offline audit of a place file, no Studio: lune run lune_audit.luau <place.rbxl|.rbxlx> [area]
-- area: all (default), scripts, remotes, physics, lighting, ui, counts. Prints JSON.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local Audit = require("./Audit")

local file = process.args[1]
if not file then
	error("usage: lune run lune_audit.luau <place.rbxl> [area]")
end
local area = process.args[2] or "all"
local game = roblox.deserializePlace(fs.readFile(file))
local fn = Audit[area]
if type(fn) ~= "function" then
	error("unknown area " .. area)
end
print(serde.encode("json", fn(game), true))
