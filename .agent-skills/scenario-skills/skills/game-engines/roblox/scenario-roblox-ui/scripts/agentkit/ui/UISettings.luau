--!nonstrict
-- UISettings: what a settings page changes besides theme and motion. Audio volume per SoundGroup,
-- camera shake scale, key rebinding on Input Action System bindings, and text that cannot follow the
-- player's Text Size setting. Plain functions on instances: they run the same in Studio and in Lune.
--
--   UISettings.setVolume(SoundService.Music, 0.5)       half of the volume the designer set
--   UISettings.step(level, 1)                           stepped control: 0, 0.25, 0.5, 0.75, 1
--   UISettings.defaultShake(GuiService.ReducedMotionEnabled)
--   UISettings.rebind(action, Enum.KeyCode.F)           swaps inside the context on a conflict
--   UISettings.export(context) / UISettings.import(context, saved)   plain table for player data
--   UISettings.lockedText(playerGui)                    text the Text Size setting cannot enlarge
--
-- Tested in Lune 0.11 (offline check O2). The in-game key capture that calls
-- rebind needs Studio and is in references/player-settings.md.

local UISettings = {}

UISettings.STEP = 0.25

-- Keys Roblox keeps for itself (input overview, "Roblox reserved" bindings): never offer them.
-- While chat, the player list or the Backpack are enabled, Slash, Tab, Backquote, the digit keys,
-- ButtonL1, ButtonR1 and ButtonR2 belong to them as well: add those names when you keep the feature.
UISettings.RESERVED = {
	Escape = true,
	ButtonStart = true,
	F9 = true,
	F11 = true,
	F12 = true,
	Print = true,
	Backspace = true,
	BackSlash = true,
	ButtonSelect = true,
}

-- Unset properties raise in Lune and read a default in Studio: read through pcall.
local function read(inst: Instance, prop: string): any
	local ok, v = pcall(function()
		return (inst :: any)[prop]
	end)
	return if ok then v else nil
end

-- A volume slider scales a SoundGroup from the volume the designer set, kept in the BaseVolume attribute.
function UISettings.setVolume(group: SoundGroup, level: number)
	local base = group:GetAttribute("BaseVolume")
	if typeof(base) ~= "number" then
		base = read(group, "Volume") or 0.5
		group:SetAttribute("BaseVolume", base)
	end
	group.Volume = base * math.clamp(level, 0, 1)
end

-- One press of a stepped control (buttons or left and right in selection mode): no drag needed on any input.
function UISettings.step(level: number, direction: number): number
	local n = math.floor(level / UISettings.STEP + 0.5) + (if direction > 0 then 1 elseif direction < 0 then -1 else 0)
	return math.clamp(n * UISettings.STEP, 0, 1)
end

-- Camera shake starts off for players who asked for reduced motion; their own setting wins afterwards.
function UISettings.defaultShake(reducedMotion: boolean): number
	return if reducedMotion then 0 else 1
end

function UISettings.kind(key: Enum.KeyCode): string
	local n = key.Name
	if string.sub(n, 1, 6) == "Button" or string.sub(n, 1, 4) == "DPad" or string.sub(n, 1, 10) == "Thumbstick" then
		return "Gamepad"
	end
	return "Keyboard"
end

local function keyOf(binding: Instance): Enum.KeyCode?
	if not binding:IsA("InputBinding") or read(binding, "UIButton") then
		return nil
	end
	local k = read(binding, "KeyCode")
	if k == nil or k.Name == "None" or k.Name == "Unknown" then -- unset reads None in Studio 0.743
		return nil
	end
	return k
end

local function bindingFor(action: Instance, kind: string): InputBinding?
	for _, b in action:GetChildren() do
		local k = keyOf(b)
		if k and UISettings.kind(k) == kind then
			return b :: InputBinding
		end
	end
	return nil
end

-- Point the action's keyboard or gamepad binding (the kind of `key`) at `key`. When another action of
-- the same InputContext already uses `key`, the two swap, so no key is ever bound twice in one context.
-- Contexts that never run together (gameplay, menu) may share keys. Returns ok and what happened.
function UISettings.rebind(action: InputAction, key: Enum.KeyCode): (boolean, string)
	if UISettings.RESERVED[key.Name] then
		return false, key.Name .. " is reserved by Roblox"
	end
	local kind = UISettings.kind(key)
	local mine = bindingFor(action, kind)
	if not mine then
		return false, action.Name .. " has no " .. kind .. " binding"
	end
	local old = mine.KeyCode
	if old == key then
		return true, "unchanged"
	end
	local context = action.Parent
	if context then
		for _, other in context:GetChildren() do
			if other ~= action and other:IsA("InputAction") then
				for _, b in other:GetChildren() do
					if keyOf(b) == key then
						(b :: InputBinding).KeyCode = old
						mine.KeyCode = key
						return true, "swapped with " .. other.Name
					end
				end
			end
		end
	end
	mine.KeyCode = key
	return true, "set"
end

-- { [actionName] = { Keyboard = "Q", Gamepad = "ButtonX" } }: strings, ready for player data.
function UISettings.export(context: Instance): { [string]: { [string]: string } }
	local out = {}
	for _, action in context:GetChildren() do
		if action:IsA("InputAction") then
			local keys = {}
			for _, kind in { "Keyboard", "Gamepad" } do
				local b = bindingFor(action, kind)
				if b then
					keys[kind] = b.KeyCode.Name
				end
			end
			out[action.Name] = keys
		end
	end
	return out
end

local function keyNamed(name: string): Enum.KeyCode?
	for _, item in Enum.KeyCode:GetEnumItems() do
		if item.Name == name then
			return item
		end
	end
	return nil
end

-- Apply saved keys through rebind, so stale or tampered data can neither take a reserved key nor
-- bind one key twice. Returns the entries it refused.
function UISettings.import(context: Instance, saved: { [string]: { [string]: string } }): { string }
	local refused = {}
	for actionName, keys in saved do
		local action = context:FindFirstChild(actionName)
		for kind, name in keys do
			local key = if typeof(name) == "string" then keyNamed(name) else nil
			local ok = false
			if action and action:IsA("InputAction") and key and UISettings.kind(key) == kind then
				ok = UISettings.rebind(action, key)
			end
			if not ok then
				table.insert(refused, actionName .. "." .. tostring(kind))
			end
		end
	end
	return refused
end

-- Text the Text Size setting cannot enlarge (accessibility doc): TextScaled ignores PreferredTextSize, and
-- a UITextSizeConstraint caps it at MaxTextSize (default 1000). Report them for review; they are fine on
-- decorative numbers, not on body text.
function UISettings.lockedText(root: Instance): { { path: string, reason: string } }
	local out = {}
	for _, d in root:GetDescendants() do
		if (d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox")) and read(d, "TextScaled") == true then
			table.insert(out, { path = d:GetFullName(), reason = "TextScaled ignores PreferredTextSize" })
		elseif d:IsA("UITextSizeConstraint") then
			local max = read(d, "MaxTextSize")
			if typeof(max) == "number" and max < 1000 then
				table.insert(out, { path = d:GetFullName(), reason = "MaxTextSize caps text at " .. max .. " px" })
			end
		end
	end
	return out
end

return UISettings
