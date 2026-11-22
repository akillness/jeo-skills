--!strict
-- Shop screen: authored in StarterGui as a DIRECT child with ResetOnSpawn false, so it is cloned into
-- PlayerGui once and the same instance survives every death. This controller runs once per session
-- (client entry in ReplicatedStorage) and wires the screen once. What should reset on death, the open
-- state, is reset here on purpose instead of by rebuilding the GUI.
-- Items, prices and purchases belong to the data and monetization layers.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local ShopController = {}

local gui: ScreenGui?
local wired = 0

function ShopController.Start(self: any)
	local player = Players.LocalPlayer
	local found = player:WaitForChild("PlayerGui"):WaitForChild("Shop")
	assert(found:IsA("ScreenGui"), "PlayerGui.Shop is not a ScreenGui")
	gui = found
	wired += 1
	if RunService:IsStudio() then
		script:SetAttribute("Wired", wired)
	end
	player.CharacterAdded:Connect(function()
		self:Close()
	end)
end

function ShopController.Open(_self: any)
	if gui then
		gui.Enabled = true
	end
end

function ShopController.Close(_self: any)
	if gui then
		gui.Enabled = false
	end
end

function ShopController.IsOpen(_self: any): boolean
	return gui ~= nil and gui.Enabled
end

return ShopController
