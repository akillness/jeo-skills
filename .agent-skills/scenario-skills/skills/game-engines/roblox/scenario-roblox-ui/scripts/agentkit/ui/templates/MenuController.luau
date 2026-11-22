--!nonstrict
-- HUD and menu controller (Script, RunContext Client, ReplicatedStorage.UIClient.MenuController).
-- The UI owns no game state: coins and ownership are player attributes set by the server, health is
-- the Humanoid's. State the UI does own (open page, selection, cooldown display) is mirrored to
-- attributes on the ScreenGuis, so a designer or an agent can read it in the Explorer.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer
local pg = player:WaitForChild("PlayerGui")
local hud = pg:WaitForChild("HUD")
local menu = pg:WaitForChild("Menu")
local ui = ReplicatedStorage:WaitForChild("UI")
local Catalog = require(ui:WaitForChild("Catalog"))
local UIInput = require(ui:WaitForChild("Kit"):WaitForChild("UIInput"))
local UIStyle = require(ui.Kit:WaitForChild("UIStyle"))
local design = ui:WaitForChild("Design")
local inputs = ReplicatedStorage:WaitForChild("Inputs")
local gameplay = inputs:WaitForChild("Gameplay")
local menuCtx = inputs:WaitForChild("Menu")
local buyRemote = ReplicatedStorage:WaitForChild("UIRemotes"):WaitForChild("BuyRequest")

local panel = menu:WaitForChild("Panel")
local pages = panel:WaitForChild("Pages")
local tabs = panel:WaitForChild("Header"):WaitForChild("Tabs")
local grid = pages.Shop.Grid
local abilities = hud:WaitForChild("Abilities")
local PAGES = { "Home", "Shop", "Settings" }
local COOLDOWN = { AbilityQ = 3, AbilityE = 5 }
local itemsById = {}
for _, it in Catalog.items do
	itemsById[it.id] = it
end

local reducedMotion = GuiService.ReducedMotionEnabled
local placeAbilities -- defined below; closeMenu re-places the buttons once touch controls return
local theme = "Dark"

-- Selection: focus the page for gamepad players only; touch and mouse players never see a cursor.
local function focus(target: GuiObject?)
	if UserInputService.PreferredInput == Enum.PreferredInput.Gamepad and target then
		GuiService:Select(target)
	end
end

local function setPage(name: string)
	for _, n in PAGES do
		pages[n].Visible = n == name
		local tab = tabs[n]
		if n == name then
			tab:AddTag("TabOn")
		else
			tab:RemoveTag("TabOn")
		end
	end
	menu:SetAttribute("Page", name)
	focus(if name == "Shop" then grid else pages[name])
end

local function openMenu(name: string)
	menu.Dim.Visible = true
	panel.Visible = true
	if reducedMotion then
		panel.GroupTransparency = 0
	else
		panel.GroupTransparency = 1
		TweenService:Create(panel, TweenInfo.new(0.2, Enum.EasingStyle.Quad), { GroupTransparency = 0 }):Play()
	end
	menuCtx.Enabled = true
	GuiService.TouchControlsEnabled = false -- modal: the jump button and thumbstick would sit under the panel
	menu:SetAttribute("Open", true)
	setPage(name)
end

local function closeMenu()
	panel.Visible = false
	menu.Dim.Visible = false
	menuCtx.Enabled = false
	GuiService.TouchControlsEnabled = true
	GuiService.SelectedObject = nil
	menu:SetAttribute("Open", false)
	task.delay(0.2, placeAbilities)
end

local function cyclePage(step: number)
	local i = table.find(PAGES, menu:GetAttribute("Page")) or 1
	setPage(PAGES[(i - 1 + step) % #PAGES + 1])
end

-- Shop: selection is UI state; purchase is a request the server validates.
local function pick(button: GuiButton)
	for _, b in grid:GetChildren() do
		if b:IsA("GuiButton") then
			b:RemoveTag("Picked")
		end
	end
	button:AddTag("Picked")
	local it = itemsById[button:GetAttribute("ItemId")]
	menu:SetAttribute("Selected", it.id)
	pages.Shop.BuyBar.Selected.Text = string.format("%s  %d", it.name, it.price)
end

local function buySelected()
	local id = menu:GetAttribute("Selected")
	if id then
		buyRemote:FireServer(id)
	end
end

local function refreshOwned()
	local owned = string.split(player:GetAttribute("Owned") or "", ",")
	for _, b in grid:GetChildren() do
		if b:IsA("GuiButton") then
			b.Owned.Visible = table.find(owned, b:GetAttribute("ItemId")) ~= nil
		end
	end
end

-- Abilities: cooldown fill driven by Heartbeat, clamped, disconnected at the end.
local function useAbility(button: any)
	local now = workspace:GetServerTimeNow()
	if now < ((button:GetAttribute("CooldownEnds") or 0) :: number) then
		return
	end
	local seconds = COOLDOWN[button.Name] :: number
	button:SetAttribute("Uses", (button:GetAttribute("Uses") or 0) + 1)
	button:SetAttribute("CooldownEnds", now + seconds)
	local conn
	conn = RunService.Heartbeat:Connect(function()
		local left = math.clamp((button:GetAttribute("CooldownEnds") - workspace:GetServerTimeNow()) / seconds, 0, 1)
		button.Cooldown.Size = UDim2.fromScale(1, left)
		button.Timer.Text = if left > 0 then tostring(math.ceil(left * seconds)) else ""
		button.TextTransparency = if left > 0 then 1 else 0 -- the timer replaces the name; drawn over it, neither reads
		if left <= 0 then
			conn:Disconnect()
		end
	end)
end

-- Placement: on touch, stack the ability buttons above the core JumpButton; otherwise bottom center.
function placeAbilities()
	local jump = nil
	if UserInputService.PreferredInput == Enum.PreferredInput.Touch and GuiService.TouchControlsEnabled then
		local tg = pg:FindFirstChild("TouchGui")
		local j = tg and tg:FindFirstChild("JumpButton", true)
		if j and j.Visible and j.AbsoluteSize.X > 0 then
			jump = j
		end
	end
	if jump then
		local size = abilities.AbsoluteSize
		local p, s = jump.AbsolutePosition, jump.AbsoluteSize
		abilities.AnchorPoint = Vector2.zero
		abilities.Position = UDim2.fromOffset(p.X + s.X - size.X, p.Y - size.Y - 12)
		hud:SetAttribute("Placement", "aboveJump")
	else
		abilities.AnchorPoint = Vector2.new(0.5, 1)
		abilities.Position = UDim2.new(0.5, 0, 1, -16)
		hud:SetAttribute("Placement", "bottomCenter")
	end
	for _, name in { "AbilityQ", "AbilityE" } do
		abilities[name].Key.Text = UIInput.glyph(gameplay[name])
	end
end

local function schedulePlacement()
	task.delay(0.2, placeAbilities) -- core touch controls relayout after an input or viewport change
end

-- Player preferences: PreferredTransparency multiplies decorative transparency.
local function applyTransparency()
	menu.Dim.BackgroundTransparency = 0.45 * GuiService.PreferredTransparency
end

-- Health and coins: read, never stored.
local function bindCharacter(character: Model)
	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	local bar = hud.Status.HealthBar
	local function update()
		local frac = math.clamp(humanoid.Health / humanoid.MaxHealth, 0, 1)
		bar.Value.Text = tostring(math.ceil(humanoid.Health))
		if reducedMotion then
			bar.Fill.Size = UDim2.fromScale(frac, 1)
		else
			TweenService:Create(bar.Fill, TweenInfo.new(0.15), { Size = UDim2.fromScale(frac, 1) }):Play()
		end
	end
	humanoid.HealthChanged:Connect(update)
	update()
end

local function refreshCoins()
	hud.Status.CoinRow.Coins.Text = tostring(player:GetAttribute("Coins") or 0)
end

-- Wiring
for _, n in PAGES do
	tabs[n].Activated:Connect(function()
		setPage(n)
	end)
end
pages.Home.Play.Activated:Connect(closeMenu)
for _, b in grid:GetChildren() do
	if b:IsA("GuiButton") then
		b.Activated:Connect(function()
			pick(b)
		end)
	end
end
pages.Shop.BuyBar.Buy.Activated:Connect(buySelected)
pages.Settings.ReducedMotion.Activated:Connect(function()
	reducedMotion = not reducedMotion
	pages.Settings.ReducedMotion.Text = "Reduced motion: " .. (if reducedMotion then "On" else "Off")
	menu:SetAttribute("ReducedMotion", reducedMotion)
end)
pages.Settings.Theme.Activated:Connect(function()
	theme = if theme == "Dark" then "Light" else "Dark"
	UIStyle.setTheme(design.DesignSheet, design[theme])
	pages.Settings.Theme.Text = "Theme: " .. theme
	menu:SetAttribute("Theme", theme)
end)

gameplay.AbilityQ.Pressed:Connect(function()
	useAbility(abilities.AbilityQ)
end)
gameplay.AbilityE.Pressed:Connect(function()
	useAbility(abilities.AbilityE)
end)
gameplay.OpenMenu.Pressed:Connect(function()
	if not menu:GetAttribute("Open") then
		openMenu("Shop")
	end
end)
menuCtx.Close.Pressed:Connect(closeMenu)
menuCtx.TabPrev.Pressed:Connect(function()
	cyclePage(-1)
end)
menuCtx.TabNext.Pressed:Connect(function()
	cyclePage(1)
end)
menuCtx.Confirm.Pressed:Connect(function()
	if menu:GetAttribute("Page") == "Shop" then
		buySelected()
	end
end)

player:GetAttributeChangedSignal("Coins"):Connect(refreshCoins)
player:GetAttributeChangedSignal("Owned"):Connect(refreshOwned)
UserInputService:GetPropertyChangedSignal("PreferredInput"):Connect(schedulePlacement)
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(schedulePlacement)
GuiService:GetPropertyChangedSignal("PreferredTransparency"):Connect(applyTransparency)
player.CharacterAdded:Connect(bindCharacter)
if player.Character then
	task.spawn(bindCharacter, player.Character)
end

refreshCoins()
refreshOwned()
applyTransparency()
menu:SetAttribute("ReducedMotion", reducedMotion)
menu:SetAttribute("Theme", theme)
openMenu("Home") -- the main menu is the first screen
placeAbilities()
menu:SetAttribute("Ready", true)
