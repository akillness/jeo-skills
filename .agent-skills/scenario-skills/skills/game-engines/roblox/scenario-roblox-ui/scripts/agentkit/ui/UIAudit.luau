--!nonstrict
-- UIAudit: static UI checks the lead's Audit.ui does not make. Works in Studio (Edit or Client) and in
-- Lune on a place file (properties not saved in the file read as their defaults).
--
--   UIAudit.all(game)            { counts, findings = { { severity, rule, path, message } }, tally }
--   UIAudit.guis(root)           ScreenGui and layout rules (root: game, StarterGui, a PlayerGui or any folder)
--   UIAudit.input(root)          Input Action System rules over every InputContext under root
--   UIAudit.scripts(root)        source patterns in UI scripts
--   UIAudit.contrast(c1, c2)     WCAG contrast ratio of two Color3 values (1 to 21)
--
-- selector-error reads StyleRule.SelectorError, which stays "" for a Selector set before the rule was parented
-- (observed): the audit never writes, so run UIStyle.errors(root) first for a complete selector check.

local UIAudit = {}
local MAX_PER_RULE = 12

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

-- Styled value when the engine offers GetStyled (Studio); the stored value otherwise (Lune).
local function styled(inst, name, default)
	local ok, v = pcall(function()
		return inst:GetStyled(name)
	end)
	if ok and v ~= nil then
		return v
	end
	return prop(inst, name, default)
end

local function isA(inst, class)
	local ok, v = pcall(function()
		return inst:IsA(class)
	end)
	return ok and v
end

local function newOut()
	return { list = {}, byRule = {}, tally = { error = 0, warn = 0, info = 0 } }
end

local function add(out, severity, rule, inst, message)
	out.tally[severity] += 1
	out.byRule[rule] = (out.byRule[rule] or 0) + 1
	if out.byRule[rule] <= MAX_PER_RULE then
		table.insert(out.list, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
		})
	end
end

local function finish(out, extra)
	for rule, n in out.byRule do
		if n > MAX_PER_RULE then
			table.insert(out.list, { severity = "info", rule = rule, path = "", message = (n - MAX_PER_RULE) .. " more not listed" })
		end
	end
	local r = { findings = out.list, tally = out.tally }
	for k, v in extra or {} do
		r[k] = v
	end
	return r
end

local function roots(root)
	if root == game or isA(root, "DataModel") then
		local list = {}
		for _, name in { "StarterGui", "ReplicatedStorage", "StarterPlayer", "ServerStorage" } do
			local s = root:FindFirstChildOfClass(name)
			if s then
				table.insert(list, s)
			end
		end
		return list
	end
	return { root }
end

-- WCAG 2.x relative luminance and contrast ratio.
local function channel(c)
	if c <= 0.04045 then
		return c / 12.92
	end
	return ((c + 0.055) / 1.055) ^ 2.4
end

function UIAudit.luminance(c)
	return 0.2126 * channel(c.R) + 0.7152 * channel(c.G) + 0.0722 * channel(c.B)
end

function UIAudit.contrast(a, b)
	local la, lb = UIAudit.luminance(a), UIAudit.luminance(b)
	if la < lb then
		la, lb = lb, la
	end
	return (la + 0.05) / (lb + 0.05)
end

-- Color behind a GuiObject: its own background when mostly opaque, else the nearest such ancestor.
local function backdrop(g)
	local node = g
	while node and isA(node, "GuiObject") do
		local t = styled(node, "BackgroundTransparency", 0)
		if t < 0.5 and not isA(node, "ScrollingFrame") then
			return styled(node, "BackgroundColor3", nil), node
		end
		node = node.Parent
	end
	return nil, nil
end

local function hasLayoutChild(g)
	for _, c in g:GetChildren() do
		if isA(c, "UIListLayout") or isA(c, "UIGridLayout") then
			return c
		end
	end
	return nil
end

function UIAudit.guis(root)
	local out = newOut()
	local c = { screenGuis = 0, textObjects = 0, buttons = 0, styleRules = 0 }
	for _, base in roots(root) do
		for _, d in base:GetDescendants() do
			local class = d.ClassName
			if class == "ScreenGui" then
				c.screenGuis += 1
				local p = d.Parent
				local direct = p and (isA(p, "StarterGui") or isA(p, "BasePlayerGui"))
				if not prop(d, "ResetOnSpawn", true) and not direct and base.ClassName == "StarterGui" then
					add(out, "warn", "nested-reset", d, "ResetOnSpawn false is ignored for a ScreenGui nested in a Folder: parent it to StarterGui directly")
				end
				local insets = prop(d, "ScreenInsets", nil)
				if insets and (insets.Name == "None" or insets.Name == "DeviceSafeInsets") then
					for _, x in d:GetDescendants() do
						if isA(x, "GuiButton") or isA(x, "TextBox") then
							add(out, "warn", "insets-interactive", d, "ScreenInsets " .. insets.Name .. " with buttons: they can land under the top bar or a notch (CoreUISafeInsets)")
							break
						end
					end
				end
			elseif class == "UIScale" and d.Parent and isA(d.Parent, "LayerCollector") then
				add(out, "warn", "root-uiscale", d, "UIScale on the whole ScreenGui to fit screen sizes breaks layouts: Scale plus constraints, tokens per display size")
			elseif class == "UIAspectRatioConstraint" then
				local node = d.Parent and d.Parent.Parent
				while node and isA(node, "GuiObject") do
					if node:FindFirstChildOfClass("UIAspectRatioConstraint") then
						add(out, "info", "nested-aspect", d, "aspect constraint inside an aspect-constrained container: constrain the outer container only")
						break
					end
					node = node.Parent
				end
			elseif class == "ScrollingFrame" then
				local layout = hasLayoutChild(d)
				local auto = prop(d, "AutomaticCanvasSize", nil)
				if layout and (auto == nil or auto.Name == "None") then
					add(out, "warn", "scroll-manual-canvas", d, "layout inside a ScrollingFrame with AutomaticCanvasSize None: set AutomaticCanvasSize instead of a canvas script")
				end
			elseif class == "UIStroke" then
				local p = d.Parent
				if p and (isA(p, "TextLabel") or isA(p, "TextButton")) and prop(d, "Thickness", 1) >= 3 then
					local join = prop(d, "LineJoinMode", nil)
					if join == nil or join.Name == "Round" then
						add(out, "info", "stroke-round-thick", d, "thick text stroke with Round joins shows see-through overlaps: LineJoinMode Bevel or Miter")
					end
				end
			elseif class == "StyleRule" then
				c.styleRules += 1
				local err = prop(d, "SelectorError", "")
				if err ~= "" then
					add(out, "error", "selector-error", d, "selector does not parse: " .. err)
				end
			end
			if isA(d, "GuiButton") then
				c.buttons += 1
				if prop(d, "Selectable", true) == false and prop(d, "Visible", true) then
					add(out, "info", "not-selectable", d, "button not Selectable: gamepad navigation skips it")
				end
			end
			if class == "TextLabel" or class == "TextButton" or class == "TextBox" then
				c.textObjects += 1
				if prop(d, "Text", "") ~= "" and prop(d, "TextTransparency", 0) < 1 then
					local bg = backdrop(d)
					local fg = styled(d, "TextColor3", nil)
					if bg and fg then
						local ratio = UIAudit.contrast(fg, bg)
						local need = if styled(d, "TextSize", 14) >= 24 or prop(d, "TextScaled", false) then 3 else 4.5
						if ratio < need then
							add(out, "warn", "low-contrast", d, string.format("text contrast %.2f:1 (minimum %.1f:1)", ratio, need))
						end
					end
				end
			end
		end
	end
	return finish(out, { counts = c })
end

local PAD_PREFIX = { "Button", "DPad", "Thumbstick" }

-- An unset KeyCode reads Enum.KeyCode.None in Studio 0.743 (the reference says Unknown).
local function unset(key)
	return key == nil or key.Name == "Unknown" or key.Name == "None"
end

local function isPad(key)
	for _, p in PAD_PREFIX do
		if string.sub(key.Name, 1, #p) == p then
			return true
		end
	end
	return false
end

function UIAudit.input(root)
	local out = newOut()
	local contexts = {}
	for _, base in roots(root) do
		for _, d in base:GetDescendants() do
			if d.ClassName == "InputContext" then
				table.insert(contexts, d)
			end
		end
	end
	local keysByPriority = {}
	for _, ctx in contexts do
		local pr = prop(ctx, "Priority", 0)
		for _, act in ctx:GetChildren() do
			if act.ClassName ~= "InputAction" then
				continue
			end
			local hasKey, hasPad, hasTouch = false, false, false
			for _, b in act:GetChildren() do
				if b.ClassName ~= "InputBinding" then
					continue
				end
				local key = prop(b, "KeyCode", nil)
				local btn = prop(b, "UIButton", nil)
				local kind = prop(b, "Type", nil)
				if unset(key) then
					-- Composite bindings (Direction1D/2D/3D) put their keys in Up, Down, Left, Right, Forward, Backward.
					for _, dir in { "Up", "Down", "Left", "Right", "Forward", "Backward" } do
						local k = prop(b, dir, nil)
						if not unset(k) then
							key = k
							break
						end
					end
				end
				if kind and kind.Name == "Scriptable" then
					continue
				elseif btn then
					hasTouch = true
				elseif not unset(key) then
					if isPad(key) then
						hasPad = true
					else
						hasKey = true
					end
					local k = pr .. ":" .. key.Name
					local prev = keysByPriority[k]
					if prev and prev ~= ctx then
						add(out, "warn", "ias-priority-tie", b, key.Name .. " is bound in two contexts at Priority " .. pr .. ": their order is not deterministic")
					end
					keysByPriority[k] = ctx
					local f = string.match(key.Name, "^F(%d+)$")
					if f then
						add(out, "info", "ias-function-key", b, key.Name .. ": F keys are media keys on many laptops; offer another key")
					end
					local mod = prop(b, "PrimaryModifier", nil)
					if not unset(mod) then
						add(out, "info", "ias-chord", b, "two-key chord: some players cannot press keys together; offer a single key")
					end
				else
					add(out, "warn", "ias-empty-binding", b, "binding has no KeyCode, UIButton or Scriptable type")
				end
			end
			if hasKey and not hasPad then
				add(out, "warn", "ias-no-gamepad", act, "no gamepad binding: console and controller players cannot trigger it")
			end
			if (hasKey or hasPad) and not hasTouch then
				add(out, "info", "ias-no-touch", act, "no UIButton binding: IAS builds no on-screen button for touch players")
			end
		end
	end
	return finish(out, { contexts = #contexts })
end

local SCRIPT_RULES = {
	{ "%.MouseButton1Click", "info", "mouse-click-event", "MouseButton1Click: GuiButton.Activated is the cross-input event in the docs" },
	{ "%.TouchEnabled", "warn", "device-sniff", "TouchEnabled for layout or prompts: UserInputService.PreferredInput and GuiService.ViewportDisplaySize" },
	{ "%.GamepadEnabled", "info", "device-sniff", "GamepadEnabled: a pad can be plugged into any device; react to PreferredInput" },
	{ "%.KeyboardEnabled", "info", "device-sniff", "KeyboardEnabled: react to PreferredInput" },
	{ "RenderStepped", "info", "renderstepped-ui", "RenderStepped runs before each frame renders: use Heartbeat, TweenService or StyleRule transitions for UI" },
	{ ":BindAction", "info", "cas-bind", "ContextActionService binding: new input goes through InputContext, InputAction, InputBinding" },
	{ "IgnoreGuiInset%s*=%s*true", "info", "ignore-inset", "IgnoreGuiInset true: keep buttons out of the top bar (ScreenInsets CoreUISafeInsets)" },
}

function UIAudit.scripts(root)
	local out = newOut()
	local n = 0
	for _, base in roots(root) do
		for _, s in base:GetDescendants() do
			if not (s.ClassName == "Script" or s.ClassName == "LocalScript" or s.ClassName == "ModuleScript") then
				continue
			end
			local src = prop(s, "Source", "")
			n += 1
			for _, r in SCRIPT_RULES do
				if string.find(src, r[1]) then
					add(out, r[2], r[3], s, r[4])
				end
			end
		end
	end
	return finish(out, { scripts = n })
end

function UIAudit.all(root)
	local parts = { guis = UIAudit.guis(root), input = UIAudit.input(root), scripts = UIAudit.scripts(root) }
	local findings, tally = {}, { error = 0, warn = 0, info = 0 }
	for _, k in { "guis", "input", "scripts" } do
		for _, f in parts[k].findings do
			table.insert(findings, f)
		end
		for sev, v in parts[k].tally do
			tally[sev] += v
		end
	end
	return {
		counts = parts.guis.counts,
		contexts = parts.input.contexts,
		scripts = parts.scripts.scripts,
		findings = findings,
		tally = tally,
	}
end

return UIAudit
