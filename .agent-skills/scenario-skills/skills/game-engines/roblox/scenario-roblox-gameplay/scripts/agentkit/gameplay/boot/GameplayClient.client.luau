--!strict
-- GameplayClient: Script with RunContext Client in ReplicatedStorage (runs once per client).
-- Attack input through the Input Action System; car controllers for every car tagged "Car".

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("GameplayShared")
local Car = require(Shared:WaitForChild("Car") :: ModuleScript) :: any
local remotes = ReplicatedStorage:WaitForChild("GameplayRemotes")
local attackRemote = remotes:WaitForChild("Attack") :: RemoteEvent

-- ReplicatedStorage.GameplayInputs.Combat (InputContext) > Attack (InputAction, Bool) > bindings.
local inputs = ReplicatedStorage:WaitForChild("GameplayInputs")
local attack = inputs:WaitForChild("Combat"):WaitForChild("Attack") :: InputAction
attack.Pressed:Connect(function()
	attackRemote:FireServer() -- intent only: no target, no damage, no position
end)

local driven: { [Instance]: boolean } = {}
local function drive(car: Instance)
	if driven[car] or not car:IsA("Model") then
		return
	end
	driven[car] = true
	Car.controller(car)
end
CollectionService:GetInstanceAddedSignal("Car"):Connect(drive)
for _, car in CollectionService:GetTagged("Car") do
	drive(car)
end

-- Touch buttons (StarterGui.GameplayTouch, built by GameplayInputs) show only while the preferred
-- input is touch; their UIButton bindings fire the same InputActions as the keys.
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local touchGui = Players.LocalPlayer:WaitForChild("PlayerGui"):WaitForChild("GameplayTouch", 10) :: ScreenGui?
if touchGui then
	local gui = touchGui
	local function show()
		gui.Enabled = UserInputService.PreferredInput == Enum.PreferredInput.Touch
	end
	UserInputService:GetPropertyChangedSignal("PreferredInput"):Connect(show)
	show()
end
