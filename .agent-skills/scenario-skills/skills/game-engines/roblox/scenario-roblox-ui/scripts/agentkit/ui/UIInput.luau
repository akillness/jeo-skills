--!nonstrict
-- UIInput: Input Action System contexts from a table (InputContext > InputAction > InputBinding).
--
--   UIInput.context(ReplicatedStorage.Inputs, "Menu", {
--       priority = 3000, sink = true, enabled = false,
--       actions = {
--           Close = { keys = { Enum.KeyCode.M, Enum.KeyCode.ButtonB }, button = closeButton },
--           Move = { type = Enum.InputActionType.Direction2D, keys = { Enum.KeyCode.Thumbstick1 } },
--           Ability = { keys = { Enum.KeyCode.Q, Enum.KeyCode.ButtonX }, scriptable = true },
--       },
--   })
--
-- IAS builds no on-screen buttons: pass `button` (a GuiButton) for touch. A button inside a ScreenGui
-- in StarterGui is remapped to the player's PlayerGui copy at runtime (observed, Studio 0.743).
-- `scriptable = true` adds a Scriptable binding named "Script": tests and gameplay code call
-- binding:Fire(state). InputAction:Fire is deprecated.

local UIInput = {}

function UIInput.context(parent: Instance, name: string, spec)
	local old = parent:FindFirstChild(name)
	if old then
		old:Destroy()
	end
	local ctx = Instance.new("InputContext")
	ctx.Name = name
	ctx.Priority = spec.priority or 2000
	ctx.Sink = spec.sink == true
	ctx.Enabled = spec.enabled ~= false
	for actionName, a in spec.actions or {} do
		local act = Instance.new("InputAction")
		act.Name = actionName
		if a.type then
			act.Type = a.type
		end
		for i, key in a.keys or {} do
			local b = Instance.new("InputBinding")
			b.Name = string.format("Key%d_%s", i, key.Name)
			b.KeyCode = key
			b.Parent = act
		end
		if a.button then
			local b = Instance.new("InputBinding")
			b.Name = "Touch"
			b.UIButton = a.button
			b.Parent = act
		end
		if a.scriptable then
			local b = Instance.new("InputBinding")
			b.Name = "Script"
			b.Type = Enum.InputBindingType.Scriptable
			b.Parent = act
		end
		act.Parent = ctx
	end
	ctx.Parent = parent
	return ctx
end

-- Short glyph text for the binding that matches the player's current input (InputAction.PreferredBinding).
local PAD = {
	ButtonA = "A", ButtonB = "B", ButtonX = "X", ButtonY = "Y", ButtonL1 = "LB", ButtonR1 = "RB",
	ButtonL2 = "LT", ButtonR2 = "RT", ButtonL3 = "LS", ButtonR3 = "RS", ButtonSelect = "View", ButtonStart = "Menu",
}

function UIInput.glyph(action: InputAction): string
	local b = action.PreferredBinding
	if not b or b.UIButton then
		return ""
	end
	local k = b.KeyCode
	if k.Name == "Unknown" or k.Name == "None" then -- unset reads None in Studio 0.743
		return ""
	end
	return PAD[k.Name] or k.Name
end

return UIInput
