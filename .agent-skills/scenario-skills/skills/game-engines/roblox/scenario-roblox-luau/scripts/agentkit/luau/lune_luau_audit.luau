--!nonstrict
-- Offline Luau audit, no Studio:
--   lune run lune_luau_audit.luau <place.rbxl|.rbxlx|source dir> [info|warn|error]
-- A directory is walked for .luau/.lua files (Rojo layout: .server/.client suffixes give the class).
-- Prints JSON {counts, findings}; exit code 1 on any error finding.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local LuauAudit = require("./LuauAudit")

local target = process.args[1]
if not target then
	error("usage: lune run lune_luau_audit.luau <place.rbxl|dir> [info|warn|error]")
end
local min = ({ info = 3, warn = 2, error = 1 })[process.args[2] or "info"] or 3
local rank = { error = 1, warn = 2, info = 3 }

local r
if fs.isDir(target) then
	local list = {}
	local function walk(dir)
		for _, name in fs.readDir(dir) do
			local p = dir .. "/" .. name
			if fs.isDir(p) then
				walk(p)
			elseif name:match("%.luau?$") then
				table.insert(list, { path = p, src = fs.readFile(p) })
			end
		end
	end
	walk(target)
	r = LuauAudit.files(list)
else
	r = LuauAudit.tree(roblox.deserializePlace(fs.readFile(target)))
end

local kept, errors = {}, 0
for _, f in r.findings do
	if rank[f.severity] <= min then
		table.insert(kept, f)
	end
	if f.severity == "error" then
		errors += 1
	end
end
r.findings = kept
print(serde.encode("json", r, true))
process.exit(if errors > 0 then 1 else 0)
