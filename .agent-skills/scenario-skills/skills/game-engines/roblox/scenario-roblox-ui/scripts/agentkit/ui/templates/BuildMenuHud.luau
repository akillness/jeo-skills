-- Build the HUD, main menu, shop (30 items) and settings as real instances in the Edit data model.
-- Run with rbx_ui.build(studio): UIKit, UIStyle and UIInput are inlined as locals; the Catalog
-- ModuleScript must exist (rbx_ui.install_scripts runs first). Idempotent: rebuilds replace the old tree.
-- Look (colors, fonts, text sizes, corner radius, ability and cell sizes) lives in the StyleSheet;
-- code sets layout only, because a property set on the instance overrides every StyleRule.

local RS = game:GetService("ReplicatedStorage")
local SG = game:GetService("StarterGui")
local LS = game:GetService("LocalizationService")
local new = UIKit.new

local ui = RS:FindFirstChild("UI") or new("Folder", { Name = "UI", Parent = RS })
local Catalog = require(ui:WaitForChild("Catalog")) :: any

-- 1. Style: tokens, two themes with the same token names, one design sheet.
local style = UIStyle.install(ui, {
	tokens = {
		Ink = Color3.fromHex("1B1F27"), Paper = Color3.fromHex("F4F1EA"), Gold = Color3.fromHex("FFC83D"),
		Blue = Color3.fromHex("1F5FD6"), Radius = UDim.new(0, 10), TextS = 14, TextSL = 20, TextM = 18, TextL = 26,
		Bar = UDim2.new(1, 0, 0, 24), BarL = UDim2.new(1, 0, 0, 34),
		Cell = UDim2.fromOffset(96, 112), CellS = UDim2.fromOffset(88, 100), CellL = UDim2.fromOffset(140, 160),
		Ability = UDim2.fromOffset(64, 64), AbilityL = UDim2.fromOffset(88, 88),
	},
	themes = {
		Dark = { Surface = "$Ink", Raised = Color3.fromHex("2A303B"), Hover = Color3.fromHex("3A4252"),
			OnSurface = "$Paper", Accent = "$Gold", OnAccent = "$Ink", Outline = Color3.fromHex("000000") },
		Light = { Surface = "$Paper", Raised = Color3.fromHex("FFFFFF"), Hover = Color3.fromHex("E2DDD2"),
			OnSurface = "$Ink", Accent = "$Blue", OnAccent = Color3.fromHex("FFFFFF"), Outline = "$Ink" },
	},
	theme = "Dark",
	rules = {
		{ selector = "TextLabel", props = { TextColor3 = "$OnSurface", Font = Enum.Font.FredokaOne, TextSize = "$TextM", BackgroundTransparency = 1 } },
		{ selector = "TextButton", props = { BackgroundColor3 = "$Raised", TextColor3 = "$OnSurface", Font = Enum.Font.FredokaOne, TextSize = "$TextM" },
			children = { { selector = "::UICorner", props = { CornerRadius = "$Radius" } } } },
		{ selector = "TextButton:Hover", priority = 2, props = { BackgroundColor3 = "$Hover" } },
		{ selector = "@ReducedMotionEnabledFalse TextButton", priority = 1, props = {},
			transitions = { BackgroundColor3 = TweenInfo.new(0.12) } },
		{ selector = ".Primary", priority = 5, props = { BackgroundColor3 = "$Accent", TextColor3 = "$OnAccent" } },
		{ selector = ".TabOn", priority = 5, props = { BackgroundColor3 = "$Accent", TextColor3 = "$OnAccent" } },
		{ selector = ".Panel", priority = 3, props = { BackgroundColor3 = "$Surface" },
			children = {
				{ selector = "::UICorner", props = { CornerRadius = "$Radius" } },
				{ selector = "::UIStroke", props = { Color = "$Outline", Thickness = 3, BorderStrokePosition = Enum.BorderStrokePosition.Outer } },
			} },
		{ selector = ".Picked::UIStroke", priority = 6, props = { Color = "$Accent", Thickness = 3 } },
		{ selector = ".Ability", priority = 3, props = { Size = "$Ability" } },
		{ selector = ".Badge", priority = 5, props = { TextColor3 = "$Ink", BackgroundTransparency = 0, TextSize = "$TextS" } },
		{ selector = ".AbilityKey", priority = 5, props = { TextSize = "$TextS" } },
		{ selector = ".Bar", priority = 3, props = { Size = "$Bar" } },
		{ selector = "UIGridLayout", props = { CellSize = "$Cell" } },
		{ selector = "@ViewportDisplaySizeSmall UIGridLayout", priority = 10, props = { CellSize = "$CellS" } },
		{ selector = "@ViewportDisplaySizeLarge UIGridLayout", priority = 10, props = { CellSize = "$CellL" } },
		{ selector = "@ViewportDisplaySizeLarge TextButton, @ViewportDisplaySizeLarge TextLabel", priority = 10, props = { TextSize = "$TextL" } },
		{ selector = "@ViewportDisplaySizeLarge .Ability", priority = 10, props = { Size = "$AbilityL" } },
		{ selector = "@ViewportDisplaySizeLarge .Bar", priority = 10, props = { Size = "$BarL" } },
		{ selector = "@ViewportDisplaySizeLarge .Badge, @ViewportDisplaySizeLarge .AbilityKey", priority = 11, props = { TextSize = "$TextSL" } },
		{ selector = "@PreferredInputTouch .AbilityKey", priority = 10, props = { Visible = false } },
	},
})

-- 2. HUD: display-only status on the left, actions on the right or bottom center (placed at runtime).
local function abilityButton(name: string, label: string, order: number)
	return new("TextButton", { Name = name, Text = label, LayoutOrder = order, Tags = { "Ability" } }, {
		new("TextLabel", { Name = "Key", Tags = { "AbilityKey" }, Text = "", AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, -2, 0, 2), AutomaticSize = Enum.AutomaticSize.XY, AutoLocalize = false, ZIndex = 3 }),
		new("Frame", { Name = "Cooldown", AnchorPoint = Vector2.new(0, 1), Position = UDim2.fromScale(0, 1),
			Size = UDim2.fromScale(1, 0), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.35, ZIndex = 2 }),
		new("TextLabel", { Name = "Timer", Text = "", Size = UDim2.fromScale(1, 1), AutoLocalize = false, ZIndex = 3 }),
	})
end

local hud = new("ScreenGui", { Name = "HUD", ResetOnSpawn = false, DisplayOrder = 1, ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets }, {
	new("Frame", { Name = "Status", BackgroundTransparency = 1, Position = UDim2.fromOffset(12, 8),
		Size = UDim2.fromScale(0.28, 0), AutomaticSize = Enum.AutomaticSize.Y }, {
		new("UISizeConstraint", { MinSize = Vector2.new(160, 0), MaxSize = Vector2.new(320, math.huge) }),
		new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }),
		new("CanvasGroup", { Name = "HealthBar", LayoutOrder = 1, Tags = { "Panel", "Bar" } }, {
			new("Frame", { Name = "Fill", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromHex("2E9E4F"), BorderSizePixel = 0 }),
			new("TextLabel", { Name = "Value", Text = "100", Size = UDim2.fromScale(1, 1), AutoLocalize = false }),
		}),
		new("Frame", { Name = "CoinRow", LayoutOrder = 2, BackgroundTransparency = 1, Size = UDim2.fromScale(1, 0), AutomaticSize = Enum.AutomaticSize.Y }, {
			new("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6),
				VerticalAlignment = Enum.VerticalAlignment.Center, SortOrder = Enum.SortOrder.LayoutOrder }),
			new("Frame", { Name = "CoinIcon", LayoutOrder = 1, Size = UDim2.fromOffset(22, 22), BackgroundColor3 = Color3.fromHex("FFC83D") }, {
				new("UICorner", { CornerRadius = UDim.new(0.5, 0) }),
			}),
			new("TextLabel", { Name = "Coins", LayoutOrder = 2, Text = "0", Size = UDim2.new(1, -28, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
				TextXAlignment = Enum.TextXAlignment.Left, AutoLocalize = false }),
		}),
	}),
	new("Frame", { Name = "Abilities", BackgroundTransparency = 1, AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -16), AutomaticSize = Enum.AutomaticSize.XY, Size = UDim2.new() }, {
		new("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }),
		abilityButton("AbilityQ", "Dash", 1),
		abilityButton("AbilityE", "Blast", 2),
	}),
	UIKit.button("MenuButton", "Menu", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -12, 0, 8), Size = UDim2.fromOffset(72, 48) }),
})
UIStyle.link(hud, style.design)

-- 3. Menu: one panel, tabs on a flex row, pages switched by Visible.
local function page(name: string, children)
	return new("Frame", { Name = name, BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Visible = name == "Home" }, children)
end

local items = {}
for i, it in Catalog.items do
	items[i] = new("TextButton", { Name = "Item" .. i, Text = "", LayoutOrder = i, Tags = { "ShopItem" },
		Attributes = { ItemId = it.id } }, {
		new("ImageLabel", { Name = "Icon", Image = "", BackgroundTransparency = 1, ScaleType = Enum.ScaleType.Fit,
			AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromScale(0.5, 0.4) }),
		new("TextLabel", { Name = "ItemName", Text = it.name, Position = UDim2.fromOffset(6, 4), Size = UDim2.new(1, -12, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y, TextWrapped = true }),
		new("TextLabel", { Name = "Price", Text = tostring(it.price), AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 6, 1, -4),
			Size = UDim2.new(1, -44, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextXAlignment = Enum.TextXAlignment.Left, AutoLocalize = false }),
		new("TextLabel", { Name = "Badge", Tags = { "Badge" }, Text = it.letter, AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -6, 1, -6),
			AutomaticSize = Enum.AutomaticSize.XY, BackgroundColor3 = it.color, AutoLocalize = false }, {
			new("UICorner", { CornerRadius = UDim.new(0, 6) }),
			new("UIPadding", { PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6), PaddingTop = UDim.new(0, 2), PaddingBottom = UDim.new(0, 2) }),
		}),
		new("TextLabel", { Name = "Owned", Text = "Owned", Visible = false, AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.55), Size = UDim2.fromScale(1, 0), AutomaticSize = Enum.AutomaticSize.Y }),
	})
end

local closeButton = UIKit.button("Close", "X", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.fromScale(1, 0), Size = UDim2.fromOffset(48, 44),
	AutoLocalize = false }) -- a symbol, not a word
local menu = new("ScreenGui", { Name = "Menu", ResetOnSpawn = false, DisplayOrder = 10, ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets }, {
	new("Frame", { Name = "Dim", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.45, Visible = false }),
	new("CanvasGroup", { Name = "Panel", Tags = { "Panel" }, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.94, 0.94), Visible = false }, {
		new("UISizeConstraint", { MaxSize = Vector2.new(920, 640) }),
		new("UIPadding", { PaddingTop = UDim.new(0, 10), PaddingBottom = UDim.new(0, 10), PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }),
		new("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
		new("Frame", { Name = "Header", LayoutOrder = 1, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 44) }, {
			new("Frame", { Name = "Tabs", BackgroundTransparency = 1, Size = UDim2.new(1, -56, 1, 0) }, {
				new("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, HorizontalFlex = Enum.UIFlexAlignment.Fill,
					Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
				UIKit.button("Home", "Home", { LayoutOrder = 1, Size = UDim2.new(0, 80, 1, 0) }),
				UIKit.button("Shop", "Shop", { LayoutOrder = 2, Size = UDim2.new(0, 80, 1, 0) }),
				UIKit.button("Settings", "Settings", { LayoutOrder = 3, Size = UDim2.new(0, 80, 1, 0) }),
			}),
			closeButton,
		}),
		new("Frame", { Name = "Pages", LayoutOrder = 3, BackgroundTransparency = 1, Size = UDim2.fromScale(1, 0) }, {
			new("UIFlexItem", { FlexMode = Enum.UIFlexMode.Fill }),
			page("Home", {
				new("UIListLayout", { HorizontalAlignment = Enum.HorizontalAlignment.Center, VerticalAlignment = Enum.VerticalAlignment.Center }),
				UIKit.button("Play", "Play", { Tags = { "Primary" }, Size = UDim2.new(0.6, 0, 0, 56) }),
			}),
			page("Shop", {
				new("ScrollingFrame", { Name = "Grid", Size = UDim2.new(1, 0, 1, -52), BackgroundTransparency = 1, CanvasSize = UDim2.new(),
					AutomaticCanvasSize = Enum.AutomaticSize.Y, ScrollingDirection = Enum.ScrollingDirection.Y, ScrollBarThickness = 8, Selectable = false }, {
					new("UIPadding", { PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4), PaddingLeft = UDim.new(0, 4), PaddingRight = UDim.new(0, 12) }),
					new("UIGridLayout", { CellPadding = UDim2.fromOffset(8, 8), SortOrder = Enum.SortOrder.LayoutOrder,
						HorizontalAlignment = Enum.HorizontalAlignment.Center }),
					table.unpack(items),
				}),
				new("Frame", { Name = "BuyBar", AnchorPoint = Vector2.new(0, 1), Position = UDim2.fromScale(0, 1), Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1 }, {
					new("TextLabel", { Name = "Selected", Text = "", Size = UDim2.new(1, -140, 1, 0), TextXAlignment = Enum.TextXAlignment.Left, AutoLocalize = false }),
					UIKit.button("Buy", "Buy", { Tags = { "Primary" }, AnchorPoint = Vector2.new(1, 0), Position = UDim2.fromScale(1, 0), Size = UDim2.new(0, 128, 1, 0) }),
				}),
			}),
			page("Settings", {
				new("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
				UIKit.button("ReducedMotion", "Reduced motion: Off", { LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 48), AutoLocalize = false }),
				UIKit.button("Theme", "Theme: Dark", { LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 48), AutoLocalize = false }),
			}),
		}),
	}),
})
UIStyle.link(menu, style.design)

UIKit.replace(SG, hud)
UIKit.replace(SG, menu)
SG.ScreenOrientation = Enum.ScreenOrientation.Sensor -- phones may rotate to portrait; the default is landscape only

-- 4. Input: gameplay below the menu; the open menu sinks everything it binds (Space included, so no jump).
-- Scriptable bindings let game code (a shop NPC) and tests fire an action without changing PreferredInput.
local inputs = RS:FindFirstChild("Inputs") or new("Folder", { Name = "Inputs", Parent = RS })
UIInput.context(inputs, "Gameplay", { priority = 2000, actions = {
	AbilityQ = { keys = { Enum.KeyCode.Q, Enum.KeyCode.ButtonX }, button = hud.Abilities.AbilityQ, scriptable = true },
	AbilityE = { keys = { Enum.KeyCode.E, Enum.KeyCode.ButtonR1 }, button = hud.Abilities.AbilityE, scriptable = true },
	OpenMenu = { keys = { Enum.KeyCode.M, Enum.KeyCode.ButtonY }, button = hud.MenuButton, scriptable = true },
} })
UIInput.context(inputs, "Menu", { priority = 3000, sink = true, enabled = false, actions = {
	Close = { keys = { Enum.KeyCode.M, Enum.KeyCode.ButtonB }, button = closeButton, scriptable = true },
	TabPrev = { keys = { Enum.KeyCode.Q, Enum.KeyCode.ButtonL1 }, scriptable = true },
	TabNext = { keys = { Enum.KeyCode.E, Enum.KeyCode.ButtonR1 }, scriptable = true },
	Confirm = { keys = { Enum.KeyCode.Space, Enum.KeyCode.ButtonY }, scriptable = true },
} })

-- 5. Strings for translation (static text only; dynamic labels set AutoLocalize false above).
local strings = { Shop = { de = "Laden", fr = "Boutique" }, Settings = { de = "Einstellungen", fr = "Paramètres" },
	Play = { de = "Spielen", fr = "Jouer" }, Buy = { de = "Kaufen", fr = "Acheter" }, Menu = { de = "Menü", fr = "Menu" },
	Home = { de = "Start", fr = "Accueil" }, Owned = { de = "Im Besitz", fr = "Possédé" }, Dash = { de = "Sprint", fr = "Ruée" },
	Blast = { de = "Stoß", fr = "Souffle" } }
local entries = {}
for source, values in strings do
	table.insert(entries, { Key = source, Source = source, Context = "", Example = "", Values = values })
end
local tbl = LS:FindFirstChild("UIStrings") or new("LocalizationTable", { Name = "UIStrings", Parent = LS })
tbl:SetEntries(entries)

return {
	hud = #hud:GetDescendants(), menu = #menu:GetDescendants(), items = #items,
	rules = #style.design:GetDescendants(), selectorErrors = UIStyle.errors(style.folder),
	contexts = #inputs:GetChildren(), strings = #entries,
}
