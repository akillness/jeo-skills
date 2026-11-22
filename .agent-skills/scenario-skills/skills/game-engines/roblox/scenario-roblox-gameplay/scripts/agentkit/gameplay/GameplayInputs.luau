--!strict
-- GameplayInputs: the Input Action System tree for combat actions, with an on-screen button per
-- action for touch. Phones are the most common device, and IAS draws no buttons itself: a touch
-- binding is an InputBinding whose UIButton is a GuiButton you build (IAS walkthrough,
-- Fg-Ksoa7b-s 00:03:27). A UIButton set to the StarterGui button fires from each player's
-- PlayerGui copy at runtime (measured in scenario-roblox-ui).
--
--   GameplayInputs.build(ReplicatedStorage.GameplayInputs, StarterGui)   -- Edit or server, idempotent
-- The client shows the ScreenGui only while UserInputService.PreferredInput is Touch.

local GameplayInputs = {}

export type Action = {
	name: string,
	key: string?, -- Enum.KeyCode names
	mouse: string?,
	pad: string?,
	label: string, -- text on the touch button
}

GameplayInputs.CONTEXT = "Combat"
GameplayInputs.GUI = "GameplayTouch"
GameplayInputs.ACTIONS = {
	{ name = "Attack", key = "F", mouse = "MouseLeftButton", pad = "ButtonX", label = "Hit" },
} :: { Action }

local function child(parent: Instance, class: string, name: string): Instance
	local found = parent:FindFirstChild(name)
	if found and found.ClassName == class then
		return found
	end
	local made = Instance.new(class)
	made.Name = name
	made.Parent = parent
	return made
end

-- Returns one "Action.Binding=Input" line per binding made or updated.
function GameplayInputs.build(inputs: Instance, starterGui: Instance, actions: { Action }?): { string }
	local list = actions or GameplayInputs.ACTIONS
	local ctx = child(inputs, "InputContext", GameplayInputs.CONTEXT)
	local gui = child(starterGui, "ScreenGui", GameplayInputs.GUI) :: ScreenGui
	gui.ResetOnSpawn = false
	gui.Enabled = false
	local made = {}
	for i, a in list do
		local action = child(ctx, "InputAction", a.name)
		local slots: { { slot: string, input: string? } } =
			{ { slot = "Key", input = a.key }, { slot = "Mouse", input = a.mouse }, { slot = "Pad", input = a.pad } }
		for _, b in slots do
			local slot, input = b.slot, b.input
			if input then
				local binding = child(action, "InputBinding", slot) :: InputBinding
				binding.KeyCode = (Enum.KeyCode :: any)[input]
				table.insert(made, a.name .. "." .. slot .. "=" .. input)
			end
		end
		-- Bottom right, left of the default jump button; one column per action.
		local button = child(gui, "TextButton", a.name) :: TextButton
		button.Text = a.label
		button.Size = UDim2.fromOffset(72, 72)
		button.AnchorPoint = Vector2.new(1, 1)
		button.Position = UDim2.new(1, -170 - (i - 1) * 84, 1, -30)
		local touch = child(action, "InputBinding", "Touch") :: InputBinding
		touch.UIButton = button
		table.insert(made, a.name .. ".Touch=" .. button.Name)
	end
	return made
end

return GameplayInputs
