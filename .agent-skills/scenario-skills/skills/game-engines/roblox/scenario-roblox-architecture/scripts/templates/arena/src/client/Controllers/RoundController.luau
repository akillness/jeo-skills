--!strict
-- Round HUD: reads the server's GameState mirror and never owns round state.
-- Layout and styling belong to the UI layer; this is the minimum that proves the data path.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local RoundController = {}

local gameState: Configuration
local label: TextLabel
local gui: ScreenGui

function RoundController.Init(_self: any)
	local found = ReplicatedStorage:FindFirstChild("GameState")
	assert(found and found:IsA("Configuration"), "ReplicatedStorage.GameState is missing")
	gameState = found
	gui = Instance.new("ScreenGui")
	gui.Name = "RoundHud"
	gui.ResetOnSpawn = false
	label = Instance.new("TextLabel")
	label.Name = "Status"
	label.AnchorPoint = Vector2.new(0.5, 0)
	label.Position = UDim2.fromScale(0.5, 0.02)
	label.Size = UDim2.fromScale(0.3, 0.07)
	label.BackgroundColor3 = Color3.fromRGB(20, 20, 24)
	label.BackgroundTransparency = 0.25
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	local limit = Instance.new("UITextSizeConstraint")
	limit.MaxTextSize = 36
	limit.Parent = label
	label.Parent = gui
end

function RoundController.Text(_self: any): string
	local round = (gameState:GetAttribute("RoundState") :: string?) or "Lobby"
	local endsAt = (gameState:GetAttribute("EndsAt") :: number?) or 0
	if endsAt <= 0 then
		return round
	end
	local left = math.max(0, math.ceil(endsAt - workspace:GetServerTimeNow()))
	return string.format("%s %d:%02d", round, left // 60, left % 60)
end

function RoundController.Start(self: any)
	gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
	local function render()
		local text = self:Text()
		label.Text = text
		if RunService:IsStudio() then
			script:SetAttribute("Shown", text)
		end
	end
	gameState:GetAttributeChangedSignal("RoundState"):Connect(render)
	gameState:GetAttributeChangedSignal("EndsAt"):Connect(render)
	render() -- without this first call the current state never shows
	while true do
		task.wait(1)
		render()
	end
end

return RoundController
