--!nonstrict
-- UILayout: measure laid-out UI and report layout faults at the current viewport.
-- Runs in the Client data model during a playtest (real top bar, touch controls, safe insets) or in
-- Edit (no top bar). Pair it with StudioDeviceSimulatorService:SetDeviceAsync to sweep devices.
--
--   local r = UILayout.check({ playerGui.HUD, playerGui.Menu }, { minTarget = 44, minText = 11, track = { "MenuButton" } })
--   r.env       viewport, inset, displaySize, preferredInput, topbar, safe area
--   r.reserved  core touch controls (JumpButton, thumbstick zone) when shown
--   r.findings  { severity, rule, path, message }; r.tracked = { name = { x, y, w, h } }
--
-- Coordinates are AbsolutePosition space: y = 0 is the bottom edge of the top bar (GetGuiInset), so
-- the top bar spans y in [-inset, 0). Rules: offscreen, topbar-overlap, outside-safe-area, reserved-touch,
-- small-target, overlap, text-clipped, text-small.
-- Defaults [added]: minTarget 44 (Apple HIG minimum hit target, 44 pt), minText 11 (Apple HIG smallest text size).

local UILayout = {}
local MAX_PER_RULE = 15

local function area(r)
	return math.max(0, r.w) * math.max(0, r.h)
end

function UILayout.intersect(a, b)
	local x0, y0 = math.max(a.x, b.x), math.max(a.y, b.y)
	local x1, y1 = math.min(a.x + a.w, b.x + b.w), math.min(a.y + a.h, b.y + b.h)
	return { x = x0, y = y0, w = math.max(0, x1 - x0), h = math.max(0, y1 - y0) }
end

function UILayout.overlapRatio(a, b)
	local small = math.min(area(a), area(b))
	if small <= 0 then
		return 0
	end
	return area(UILayout.intersect(a, b)) / small
end

local function rect(g)
	local p, s = g.AbsolutePosition, g.AbsoluteSize
	return { x = p.X, y = p.Y, w = s.X, h = s.Y }
end

local function round(r)
	return { x = math.floor(r.x + 0.5), y = math.floor(r.y + 0.5), w = math.floor(r.w + 0.5), h = math.floor(r.h + 0.5) }
end

-- A property as rendered: a StyleRule value is invisible to a direct read (it returns the default).
local function styled(g, name)
	local ok, v = pcall(g.GetStyled, g, name)
	if ok and v ~= nil then
		return v
	end
	return g[name]
end

-- Visible on screen: Visible itself and every GuiObject ancestor, ScreenGui Enabled.
local function shown(g)
	local node = g
	while node do
		if node:IsA("GuiObject") then
			if not styled(node, "Visible") then
				return false
			end
		elseif node:IsA("LayerCollector") then
			return node.Enabled
		end
		node = node.Parent
	end
	return true
end

-- Part of the rect left after clipping by ancestors with ClipsDescendants (ScrollingFrame, CanvasGroup...).
local function visibleRect(g)
	local r = rect(g)
	local node = g.Parent
	while node and node:IsA("GuiObject") do
		if node.ClipsDescendants or node:IsA("ScrollingFrame") or node:IsA("CanvasGroup") then
			r = UILayout.intersect(r, rect(node))
		end
		node = node.Parent
	end
	return r
end

local function interactive(g)
	return (g:IsA("GuiButton") or g:IsA("TextBox")) and g.Active ~= false
end

local function short(g)
	local parts = {}
	local node = g
	while node and not node:IsA("BasePlayerGui") and node ~= game do
		table.insert(parts, 1, node.Name)
		node = node.Parent
	end
	return table.concat(parts, ".")
end

function UILayout.env(parent: Instance?)
	local GuiService = game:GetService("GuiService")
	local UserInputService = game:GetService("UserInputService")
	local cam = workspace.CurrentCamera
	local inset = GuiService:GetGuiInset()
	local tb = GuiService.TopbarInset
	local env = {
		viewport = { w = cam.ViewportSize.X, h = cam.ViewportSize.Y },
		inset = inset.Y,
		displaySize = GuiService.ViewportDisplaySize.Name,
		preferredInput = UserInputService.PreferredInput.Name,
		topbar = { x = tb.Min.X, y = tb.Min.Y - inset.Y, w = tb.Width, h = tb.Height },
	}
	-- Safe area: measure a probe ScreenGui that uses the default insets.
	if parent then
		local probe = Instance.new("ScreenGui")
		probe.Name = "__UILayoutProbe"
		probe.ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets
		local f = Instance.new("Frame")
		f.Size = UDim2.fromScale(1, 1)
		f.BackgroundTransparency = 1
		f.Parent = probe
		probe.Parent = parent
		local r = rect(f)
		if r.w == 0 then
			task.wait()
			r = rect(f)
		end
		probe:Destroy()
		env.safe = round(r)
	end
	return env
end

function UILayout.reserved(playerGui: Instance?)
	local out = {}
	local width = workspace.CurrentCamera.ViewportSize.X
	local tg = playerGui and playerGui:FindFirstChild("TouchGui")
	if not (tg and tg:IsA("ScreenGui") and tg.Enabled) then
		return out
	end
	for _, name in { "JumpButton", "DynamicThumbstickFrame", "ThumbstickFrame" } do
		local g = tg:FindFirstChild(name, true)
		if g and g:IsA("GuiObject") and shown(g) and g.AbsoluteSize.X > 0 then
			local r = rect(g)
			if name ~= "JumpButton" then
				-- The thumbstick frame extends off the left edge and, in portrait, across the screen. Reserve
				-- its on-screen part up to 40% of the width: its right edge in landscape (observed).
				r = UILayout.intersect(r, { x = 0, y = r.y, w = width * 0.4, h = r.h })
			end
			out[name] = round(r)
		end
	end
	return out
end

function UILayout.check(guis, opts)
	opts = opts or {}
	local minTarget = opts.minTarget or 44
	local minText = opts.minText or 11
	local list = if typeof(guis) == "Instance" then { guis } else guis
	local parent = list[1] and list[1].Parent
	local env = UILayout.env(parent)
	local reserved = UILayout.reserved(parent)
	local findings, byRule = {}, {}
	local tally = { error = 0, warn = 0, info = 0 }
	local function add(sev, rule, g, msg)
		tally[sev] += 1
		byRule[rule] = (byRule[rule] or 0) + 1
		if byRule[rule] <= MAX_PER_RULE then
			table.insert(findings, { severity = sev, rule = rule, path = short(g), message = msg })
		end
	end
	local screen = { x = 0, y = -env.inset, w = env.viewport.w, h = env.viewport.h }
	local touch = env.preferredInput == "Touch"
	local buttons, tracked, counts = {}, {}, { objects = 0, interactive = 0, text = 0 }
	local trackSet = {}
	for _, n in opts.track or {} do
		trackSet[n] = true
	end
	for _, gui in list do
		for _, g in gui:GetDescendants() do
			if not g:IsA("GuiObject") or not shown(g) then
				continue
			end
			counts.objects += 1
			local r = rect(g)
			local v = visibleRect(g)
			if trackSet[g.Name] then
				tracked[g.Name] = round(r)
			end
			if area(v) <= 0 then
				continue -- clipped away (scrolled out), not a fault
			end
			local off = area(v) - area(UILayout.intersect(v, screen))
			if off > 1 then
				add("warn", "offscreen", g, string.format("%d px^2 of %dx%d outside the %dx%d viewport", off, r.w, r.h, env.viewport.w, env.viewport.h))
			end
			if interactive(g) then
				counts.interactive += 1
				table.insert(buttons, { g = g, r = v, full = r })
				local tb = UILayout.intersect(v, { x = 0, y = -env.inset, w = env.topbar.x, h = env.inset })
				if area(tb) > 0 then
					add("warn", "topbar-overlap", g, "covers the core top bar buttons")
				end
				if env.safe and area(v) - area(UILayout.intersect(v, env.safe)) > 1 and area(tb) == 0 and v.y >= 0 then
					add("warn", "outside-safe-area", g, "outside the core UI safe area (notch, home indicator)")
				end
				for name, rr in reserved do
					if area(UILayout.intersect(v, rr)) > 0 then
						add("warn", "reserved-touch", g, "overlaps the core " .. name)
					end
				end
				local side = math.min(r.w, r.h)
				if side < minTarget then
					add(if touch then "warn" else "info", "small-target", g, string.format("%d px hit target (minimum %d)", side, minTarget))
				end
			end
			if (g:IsA("TextLabel") or g:IsA("TextButton") or g:IsA("TextBox")) and g.Text ~= "" then
				counts.text += 1
				if not g.TextFits then
					add("warn", "text-clipped", g, string.format("text does not fit (%q)", string.sub(g.Text, 1, 24)))
				end
				local lines = math.max(1, #string.split(g.ContentText, "\n"))
				local size = if g.TextScaled then g.TextBounds.Y / lines else styled(g, "TextSize")
				if size > 0 and size < minText then
					add("warn", "text-small", g, string.format("%.1f px text (minimum %d)", size, minText))
				end
			end
		end
	end
	for i = 1, #buttons do
		for j = i + 1, #buttons do
			local a, b = buttons[i], buttons[j]
			if a.g:IsAncestorOf(b.g) or b.g:IsAncestorOf(a.g) then
				continue
			end
			if UILayout.overlapRatio(a.r, b.r) > 0.2 then
				add("warn", "overlap", a.g, "overlaps " .. short(b.g))
			end
		end
	end
	for rule, n in byRule do
		if n > MAX_PER_RULE then
			table.insert(findings, { severity = "info", rule = rule, path = "", message = (n - MAX_PER_RULE) .. " more not listed" })
		end
	end
	return { env = env, reserved = reserved, findings = findings, tally = tally, counts = counts, tracked = tracked }
end

return UILayout
