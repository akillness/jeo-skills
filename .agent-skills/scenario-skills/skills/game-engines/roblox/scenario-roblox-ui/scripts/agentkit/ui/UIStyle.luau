--!nonstrict
-- UIStyle: tokens, themes and one design StyleSheet from a table (engine StyleSheets, no framework).
--
--   local s = UIStyle.install(ReplicatedStorage.UI, {
--       tokens = { Ink = Color3.fromHex("101418"), Paper = Color3.fromHex("F4F1EA"), Gap = UDim.new(0, 8) },
--       themes = { Dark = { Surface = "$Ink", OnSurface = "$Paper" }, Light = { Surface = "$Paper", OnSurface = "$Ink" } },
--       theme = "Dark",
--       rules = { { selector = "TextButton", props = { BackgroundColor3 = "$Surface" }, priority = 0,
--                   transitions = { BackgroundColor3 = TweenInfo.new(0.15) }, children = { ... } } },
--   })
--   UIStyle.link(screenGui, s.design)       StyleLink under the ScreenGui
--   UIStyle.setTheme(s.design, s.themes.Light)   runtime swap: the design sheet's StyleDerive changes source
--   UIStyle.errors(s.design)                 rules whose Selector does not parse (StyleRule.SelectorError)
--
-- SelectorError is filled only when Selector changes on a rule that is already in the place, or when the rule
-- joins a sheet in use, and only a few frames later: a Selector set earlier reads "" even when broken
-- (observed, 0.743). errors() reassigns each Selector and waits `settle` seconds (default 0.3) before reading,
-- so call it once the design is parented, at build or test time (styles re-resolve during the wait).
--
-- Every theme must define the same token names (a missing token leaves the property unstyled).
-- Give query and variant rules a higher Priority than the base rule they override.

local UIStyle = {}

local function addRules(list, parent)
	for i, r in list do
		local rule = Instance.new("StyleRule")
		rule.Name = r.name or string.format("R%02d", i)
		if r.priority then
			rule.Priority = r.priority
		end
		rule:SetProperties(r.props or {})
		if r.transitions then
			for prop, info in r.transitions do
				rule:SetPropertyTransition(prop, info)
			end
		end
		rule.Parent = parent
		rule.Selector = r.selector
		if r.children then
			addRules(r.children, rule)
		end
	end
end

function UIStyle.install(parent: Instance, spec)
	local old = parent:FindFirstChild("Design")
	if old then
		old:Destroy()
	end
	local folder = Instance.new("Folder")
	folder.Name = "Design"
	local tokens = Instance.new("StyleSheet")
	tokens.Name = "Tokens"
	for k, v in spec.tokens or {} do
		tokens:SetAttribute(k, v)
	end
	tokens.Parent = folder
	local themes = {}
	local names = nil
	for name, values in spec.themes or {} do
		local sheet = Instance.new("StyleSheet")
		sheet.Name = name
		local d = Instance.new("StyleDerive")
		d.StyleSheet = tokens
		d.Parent = sheet
		local keys = {}
		for k, v in values do
			sheet:SetAttribute(k, v)
			table.insert(keys, k)
		end
		table.sort(keys)
		local joined = table.concat(keys, ",")
		if names and names ~= joined then
			error("UIStyle: theme " .. name .. " defines different tokens (" .. joined .. ") than " .. names)
		end
		names = joined
		sheet.Parent = folder
		themes[name] = sheet
	end
	local design = Instance.new("StyleSheet")
	design.Name = "DesignSheet"
	local derive = Instance.new("StyleDerive")
	derive.Name = "Theme"
	derive.StyleSheet = themes[spec.theme] or tokens
	derive.Parent = design
	addRules(spec.rules or {}, design)
	design.Parent = folder
	folder.Parent = parent
	return { folder = folder, design = design, tokens = tokens, themes = themes }
end

function UIStyle.link(gui: Instance, design: StyleSheet)
	local link = gui:FindFirstChildOfClass("StyleLink")
	if not link then
		link = Instance.new("StyleLink")
		link.Parent = gui
	end
	link.StyleSheet = design
	return link
end

function UIStyle.setTheme(design: StyleSheet, theme: StyleSheet)
	local derive = design:FindFirstChild("Theme") or design:FindFirstChildOfClass("StyleDerive")
	assert(derive, "UIStyle.setTheme: the design sheet has no StyleDerive")
	derive.StyleSheet = theme
end

function UIStyle.errors(root: Instance, settle: number?)
	local out = {}
	for _, r in root:GetDescendants() do
		if r:IsA("StyleRule") then
			local selector = r.Selector
			r.Selector = "" -- a change is what triggers the parse
			r.Selector = selector
		end
	end
	task.wait(settle or 0.3)
	for _, r in root:GetDescendants() do
		if r:IsA("StyleRule") and r.SelectorError ~= "" then
			table.insert(out, { path = r:GetFullName(), selector = r.Selector, error = r.SelectorError })
		end
	end
	return out
end

return UIStyle
