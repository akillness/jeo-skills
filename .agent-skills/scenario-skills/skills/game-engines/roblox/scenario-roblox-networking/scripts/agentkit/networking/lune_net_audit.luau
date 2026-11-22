--!nonstrict
-- Offline network security audit of a place file, no Studio:
--   lune run lune_net_audit.luau <place.rbxl|.rbxlx> [--warn]
-- Prints JSON: NetAudit findings merged with the lead's Audit.remotes and InvokeClient rule.
-- Also reports the six Server Authority settings saved in the file (Lune reads saved values only).
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local Audit = require("../../../../scenario-roblox-expert/scripts/agentkit/Audit")
local NetAudit = require("./NetAudit")

local file = process.args[1]
if not file then
	error("usage: lune run lune_net_audit.luau <place.rbxl> [--warn]")
end
local game = roblox.deserializePlace(fs.readFile(file))
local r = NetAudit.run(game, Audit)
if process.args[2] == "--warn" then
	local keep = {}
	for _, f in r.findings do
		if f.severity ~= "info" then
			table.insert(keep, f)
		end
	end
	r.findings = keep
end

-- AuthorityMode Server needs all six; a file edited outside Studio can carry only some of them.
local ws = game:GetService("Workspace")
local function read(name)
	local ok, v = pcall(function()
		return ws[name]
	end)
	return if ok and v ~= nil then tostring(v) else "unset"
end
local sa = {
	AuthorityMode = read("AuthorityMode"),
	NextGenerationReplication = read("NextGenerationReplication"),
	PlayerScriptsUseInputActionSystem = read("PlayerScriptsUseInputActionSystem"),
	SignalBehavior = read("SignalBehavior"),
	UseFixedSimulation = read("UseFixedSimulation"),
	StreamingEnabled = read("StreamingEnabled"),
}
local wantServer = sa.AuthorityMode == "Enum.AuthorityMode.Server"
local missing = {}
if wantServer then
	local want = {
		NextGenerationReplication = "Enum.RolloutState.Enabled",
		PlayerScriptsUseInputActionSystem = "Enum.RolloutState.Enabled",
		SignalBehavior = "Enum.SignalBehavior.Deferred",
		UseFixedSimulation = "Enum.RolloutState.Enabled",
		StreamingEnabled = "true",
	}
	for k, v in want do
		if sa[k] ~= v then
			table.insert(missing, k .. "=" .. sa[k])
		end
	end
	table.sort(missing)
end
sa.serverAuthority = wantServer
sa.missing = missing
r.serverAuthority = sa
print(serde.encode("json", r, true))
