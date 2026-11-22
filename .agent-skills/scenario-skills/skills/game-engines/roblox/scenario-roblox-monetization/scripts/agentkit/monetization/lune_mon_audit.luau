--!nonstrict
-- Offline monetization audit of a place file, no Studio:
--   lune run lune_mon_audit.luau <place.rbxl|.rbxlx> [--warn]
-- Prints JSON: MonAudit findings, facts and tally. --warn drops "info" findings.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local MonAudit = require("./MonAudit")

local file = process.args[1]
if not file then
	error("usage: lune run lune_mon_audit.luau <place.rbxl> [--warn]")
end
local game = roblox.deserializePlace(fs.readFile(file))
local r = MonAudit.run(game)
if process.args[2] == "--warn" then
	local keep = {}
	for _, f in r.findings do
		if f.severity ~= "info" then
			table.insert(keep, f)
		end
	end
	r.findings = keep
end
r.rules = MonAudit.rules(r)
print(serde.encode("json", r, true))
