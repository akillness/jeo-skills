--!nonstrict
-- Offline performance audit of a place file, no Studio:
--   lune run lune_perf_audit.luau <place.rbxl|.rbxlx>          PerfAudit.all
--   lune run lune_perf_audit.luau <place.rbxl|.rbxlx> assets   PerfAudit.assets (memory, draw groups, images, rigs)
-- Prints the JSON; exit code 1 when a warn finding exists (use as a CI gate).
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local PerfAudit = require("./PerfAudit")

local file = process.args[1]
if not file then
	error("usage: lune run lune_perf_audit.luau <place.rbxl> [assets]")
end
local game = roblox.deserializePlace(fs.readFile(file))
local r = if process.args[2] == "assets" then PerfAudit.assets(game, 10) else PerfAudit.all(game)
print(serde.encode("json", r, true))
process.exit(if r.tally.warn > 0 or r.tally.error > 0 then 1 else 0)
