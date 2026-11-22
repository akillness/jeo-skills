--!nonstrict
-- Offline DataAudit of a place file, no Studio: lune run lune_data_audit.luau <place.rbxl|.rbxlx>
-- Prints JSON {findings, scripts}.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local DataAudit = require("./DataAudit")

local file = process.args[1]
if not file then
	error("usage: lune run lune_data_audit.luau <place.rbxl>")
end
local game = roblox.deserializePlace(fs.readFile(file))
print(serde.encode("json", DataAudit.place(game), true))
