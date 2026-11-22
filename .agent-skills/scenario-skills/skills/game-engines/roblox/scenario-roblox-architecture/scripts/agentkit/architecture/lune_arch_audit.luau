--!nonstrict
-- Offline architecture audit of a place file, no Studio:
--   lune run lune_arch_audit.luau <place.rbxl|.rbxlx> [all|graph]
-- Prints JSON. Lune knows only property values saved in the file; RunContext and Enabled are saved.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local ArchAudit = require("./ArchAudit")

local file = process.args[1]
if not file then
	error("usage: lune run lune_arch_audit.luau <place.rbxl> [all|graph]")
end
local area = process.args[2] or "all"
local game = roblox.deserializePlace(fs.readFile(file))
local result
if area == "graph" then
	local g = ArchAudit.graph(game)
	local edges, unresolved = {}, {}
	for _, e in g.edges do
		table.insert(edges, e.from:GetFullName() .. " -> " .. e.to:GetFullName())
	end
	for _, u in g.unresolved do
		table.insert(unresolved, u.from:GetFullName() .. ": require(" .. u.expr .. ")")
	end
	result = { modules = g.modules, edges = edges, unresolved = unresolved }
else
	result = ArchAudit.all(game)
end
print(serde.encode("json", result, true))
