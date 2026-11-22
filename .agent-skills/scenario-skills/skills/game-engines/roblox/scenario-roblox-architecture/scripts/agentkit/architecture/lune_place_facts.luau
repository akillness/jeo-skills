--!nonstrict
-- Saved facts of a place file, no Studio: lune run lune_place_facts.luau <place.rbxl>
-- Class and RunContext of every script, part positions (Rojo drops "Position": check them), StarterGui
-- ScreenGuis (ResetOnSpawn, direct child or not), non-default ModelStreamingMode values, and the Workspace
-- settings that change architecture.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local game = roblox.deserializePlace(fs.readFile(process.args[1]))

local function prop(inst, name)
	local ok, v = pcall(function()
		return inst[name]
	end)
	return if ok and v ~= nil then tostring(v) else nil
end

local scripts = {}
for _, d in game:GetDescendants() do
	if d:IsA("LuaSourceContainer") then
		scripts[d:GetFullName()] = { class = d.ClassName, runContext = prop(d, "RunContext") }
	end
end
local parts = {}
for _, d in game:GetDescendants() do
	if d:IsA("BasePart") then
		local p = d.CFrame.Position
		parts[d:GetFullName()] = { position = { p.X, p.Y, p.Z }, size = { d.Size.X, d.Size.Y, d.Size.Z } }
	end
end
-- ScreenGuis under StarterGui: ResetOnSpawn false only holds for a direct child.
local guis = {}
local starterGui = game:FindFirstChildOfClass("StarterGui")
for _, d in (if starterGui then starterGui:GetDescendants() else {}) do
	if d:IsA("ScreenGui") then
		guis[d:GetFullName()] = { resetOnSpawn = d.ResetOnSpawn, direct = d.Parent == starterGui, enabled = d.Enabled }
	end
end
-- Models with a non-default ModelStreamingMode (it only matters when StreamingEnabled is on).
local streamingModes = {}
for _, d in game:GetDescendants() do
	local mode = if d:IsA("Model") then prop(d, "ModelStreamingMode") else nil
	if mode and mode ~= "Enum.ModelStreamingMode.Default" then
		streamingModes[d:GetFullName()] = mode
	end
end
local ws = game:FindFirstChildOfClass("Workspace")
print(serde.encode("json", {
	scripts = scripts,
	parts = parts,
	guis = guis,
	streamingModes = streamingModes,
	signalBehavior = prop(ws, "SignalBehavior"),
	playerCharacterDestroyBehavior = prop(ws, "PlayerCharacterDestroyBehavior"),
	streamingEnabled = prop(ws, "StreamingEnabled"),
}, true))
