# Procedures: build, test and fix Roblox UI as an agent

Every procedure runs through the scenario-roblox-expert toolkit (`rbx_run`, `rbx_play`,
`rbx_review`) and this skill's [rbx_ui.py](../scripts/rbx_ui.py). Each block marked
`<!-- test: NAME -->` is read and run by `tests/code/scenario-roblox-ui/run_live.py`: the doc is
what runs. "Client" means the Client data model during a playtest (`rbx_play.Playtest`).

The worked example is the HUD, main menu, 30-item shop and settings screen of the G6 brief, built
from [BuildMenuHud.luau](../scripts/agentkit/ui/templates/BuildMenuHud.luau),
[MenuController.luau](../scripts/agentkit/ui/templates/MenuController.luau),
[ShopServer.luau](../scripts/agentkit/ui/templates/ShopServer.luau) and
[Catalog.luau](../scripts/agentkit/ui/templates/Catalog.luau).

## 0. Setup

```python
import sys; sys.path.insert(0, "<skills>/scenario-roblox-ui/scripts"); sys.path.insert(0, "<skills>/scenario-roblox-expert/scripts")
import rbx_env, rbx_ui
from rbx_play import Playtest
with rbx_env.place_slot():
    s = rbx_env.open_place("places/my-game/my-game.rbxl")   # binds the window when it is already open
```

The place needs `Workspace.PlayerScriptsUseInputActionSystem = Enabled`. The property is
RobloxScriptSecurity: set it in the Rojo project
(`"Workspace": {"$properties": {"PlayerScriptsUseInputActionSystem": "Enabled"}}`) or in the
Properties window; `execute_luau` cannot write it.

## P1. Build the UI as instances in Edit (L0, L1)

Goal: real ScreenGuis in StarterGui that a designer and an agent can inspect, with the look in a
StyleSheet and the input in InputContexts.

How: `rbx_ui.build(s)` installs the Catalog, the kit modules (`ReplicatedStorage.UI.Kit`), the
client controller (Script, RunContext Client) and the shop server, then runs BuildMenuHud in Edit.
It returns counts.

Layout decisions in the template:

- One universal tree for every device. Scale for the shell (panel 0.94 of the safe area,
  `UISizeConstraint` 920x640), Offset for touch targets and text.
- Status (health, coins) top left, display only. Menu button top right. Ability buttons above the
  core JumpButton on touch, bottom center otherwise (the controller moves them).
- Shop: `ScrollingFrame` with `AutomaticCanvasSize = Y` and a `UIGridLayout`; cell size comes from
  the StyleSheet (88x100 Small, 96x112 Medium, 140x160 Large).
- Tabs share the header row (`UIListLayout`, `HorizontalFlex = Fill`): on a phone in landscape every
  row of height counts.
- Dynamic labels (coins, health, prices, timers, key glyphs) set `AutoLocalize = false`.
- `StarterGui.ScreenOrientation = Sensor`: the default, LandscapeSensor (observed), never rotates to
  portrait.

Check the result in Edit:

<!-- test: P1_CHECK -->

```lua
local SG = game:GetService("StarterGui")
local RS = game:GetService("ReplicatedStorage")
local hud, menu = SG:WaitForChild("HUD"), SG:WaitForChild("Menu")
local grid = menu.Panel.Pages.Shop.Grid
local dynamic = { hud.Status.CoinRow.Coins, hud.Status.HealthBar.Value, hud.Abilities.AbilityQ.Timer,
	hud.Abilities.AbilityQ.Key, grid.Item1.Price, grid.Item1.Badge, menu.Panel.Pages.Shop.BuyBar.Selected }
local localized = 0
for _, label in dynamic do
	if label.AutoLocalize then
		localized += 1
	end
end
local inputs = RS.Inputs
return {
	resetOff = not hud.ResetOnSpawn and not menu.ResetOnSpawn,
	direct = hud.Parent == SG and menu.Parent == SG,
	links = #{ hud:FindFirstChildOfClass("StyleLink"), menu:FindFirstChildOfClass("StyleLink") },
	items = #grid:GetChildren() - 2,
	dynamicLocalized = localized,
	staticLocalized = menu.Panel.Header.Tabs.Shop.AutoLocalize,
	orientation = SG.ScreenOrientation.Name,
	gameplay = { priority = inputs.Gameplay.Priority, sink = inputs.Gameplay.Sink },
	menuCtx = { priority = inputs.Menu.Priority, sink = inputs.Menu.Sink, enabled = inputs.Menu.Enabled },
}
```

GATE: both ScreenGuis direct children of StarterGui with ResetOnSpawn false, 2 StyleLinks, 30 items,
0 dynamic labels localized, Menu context Priority 3000 with Sink.
`PlayerScriptsUseInputActionSystem` cannot be read from `execute_luau` either ("lacking capability
RobloxScript"): O3 reads it from the place file, and P5 proves it by behavior (the menu sinks the
default jump).

Test: `run_live.py` L0, L1. run in Studio 0.743 on 2026-10-19: pass, 30 items, 24 style rules, 2
contexts (Gameplay 2000 without Sink, Menu 3000 with Sink), 2 StyleLinks, 0 selector errors, 0
dynamic labels localized, orientation Sensor; UIAudit 0 error, 0 warn, 3 info; lead `Audit.ui` 0,
0, 0.

## P2. Audit (O2, L1)

Goal: static faults found before any playtest.

```python
a = rbx_ui.audit(s)          # {"ui": UIAudit.all(game), "lead": Audit.ui(game)}
```

[UIAudit.luau](../scripts/agentkit/ui/UIAudit.luau) rules: `nested-reset`, `root-uiscale`,
`nested-aspect`, `scroll-manual-canvas`, `stroke-round-thick`, `low-contrast` (WCAG 4.5:1, 3:1 for
text of 24 px and up [added]), `not-selectable`, `insets-interactive`, `selector-error`,
`ias-no-gamepad`, `ias-no-touch`, `ias-function-key`, `ias-chord`, `ias-empty-binding`,
`ias-priority-tie`, and script patterns (`mouse-click-event`, `device-sniff`, `renderstepped-ui`,
`cas-bind`, `ignore-inset`). The lead's `Audit.ui` adds `offset-only-size`, `textscaled-unbounded`
and `reset-on-spawn`. Offline: the same module runs in Lune on a place file.

GATE: 0 error and 0 warn on the built UI. Info findings are reviewed, not required to be zero (the
template keeps `ias-no-touch` on TabPrev, TabNext and Confirm: key and gamepad shortcuts for tabs
and the Buy button, which touch players tap directly).

Test: L1 builds a fixture with one fault per rule and expects every rule; O2 runs the same fixture
in Lune. run in Studio 0.743 on 2026-10-19: pass, the fixture fired 20 of 20 rules; `UIStyle.errors`
caught the one broken selector ("Expected a selector part, but found nothing."); O2 passed 5 of 5 in
Lune.

## P3. Layout across devices without a phone (L2)

Goal: measured layout on phones (both orientations), a tablet, PCs, a console and a handheld, plus a
capture of each.

How: `StudioDeviceSimulatorService` (PluginSecurity, reachable from `execute_luau` in Edit and in
the playtest Client) switches the window to a device preset. `UILayout.check` then reads
`AbsolutePosition` and `AbsoluteSize` of every visible object against the viewport, the top bar, the
core UI safe area and the core touch controls.

```lua
local sim = game:GetService("StudioDeviceSimulatorService")
sim:SetDeviceAsync("iphone_14")                                   -- ids: sim:GetDeviceListAsync()
sim:SetOrientationAsync(Enum.ScreenOrientation.Portrait)
task.wait(1)
local pg = game:GetService("Players").LocalPlayer.PlayerGui
local report = UILayout.check({ pg.HUD }, { minTarget = 44, minText = 11, track = { "Abilities" } })
sim:StopSimulationAsync()                                         -- always: the simulation stays on the window
return report
```

```python
OPEN = 'local a = game.ReplicatedStorage.Inputs.Gameplay.OpenMenu.Script a:Fire(true) task.wait() a:Fire(false) task.wait(0.4) return true'
CLOSE = 'local a = game.ReplicatedStorage.Inputs.Menu.Close.Script a:Fire(true) task.wait() a:Fire(false) task.wait(0.4) return true'
with Playtest(s) as pt:
    rows = rbx_ui.layout_matrix(pt, rbx_ui.DEVICES, [("hud", None, ["HUD"]), ("shop", OPEN, ["Menu"], CLOSE)],
                                out_dir, track=["Abilities", "Grid", "Item1"])
rbx_review.contact_sheet([r["capture"] for r in rows], "sheet.png", cols=3, thumb=500)   # read the sheet, not 18 PNGs
```

Drive scenes with Scriptable bindings: a keyboard or mouse event switches `PreferredInput` to
KeyboardAndMouse and hides the touch layout you meant to test (observed). Set phone and tablet
orientation explicitly: with `ScreenOrientation = Sensor` the simulator opened iphone_7 in portrait
(observed).

GATE (measured): 0 warn per device and scene; on touch devices the ability buttons sit above the
JumpButton and clear of the thumbstick zone; the shop window shows at least one full row of cells;
Large display sizes get the Large cell size. GATE (visual): read the contact sheets; text legible,
nothing cut, nothing under the touch controls.

Test: L2. run in Studio 0.743 on 2026-10-19: pass, 18 checks (9 presets x HUD and shop), 0 problems,
0 blank captures. Abilities above the JumpButton on every touch preset (iphone_7 666x374: abilities
y 150 to 214, jump from y 226; iPad 1179x819: 475 to 539, jump 120 px from 551). Cells 88x100 on
Small, 96x112 on Medium, 140x160 on xbox (Large); smallest grid window 139 px on samsung_galaxy_a06
(705x338), 516 px when the panel is height-capped.

## P4. Drive buttons with the mouse (L3)

Goal: real clicks on the PlayerGui copies, asserted on state.

```python
pt.mouse([{"action": "mouseButtonClick", "instance_path": "LocalPlayer.PlayerGui.Menu.Panel.Pages.Home.Play", "mouse_button": "left"}])
```

`instance_path` starts at `LocalPlayer`. A click fires `Activated` and `MouseButton1Click` once each
(observed). A click on a button that is an InputBinding.UIButton fires the InputAction: the binding
set to `StarterGui.HUD.MenuButton` in Edit points to the PlayerGui copy at runtime (observed).

State after each step:

<!-- test: STATE -->

```lua
local player = game:GetService("Players").LocalPlayer
local pg = player.PlayerGui
local menu, hud = pg.Menu, pg.HUD
local grid = menu.Panel.Pages.Shop.Grid
local owned = {}
for _, b in grid:GetChildren() do
	if b:IsA("GuiButton") and b.Owned.Visible then
		table.insert(owned, b.Name)
	end
end
local q = hud.Abilities.AbilityQ
local sel = game:GetService("GuiService").SelectedObject
return {
	open = menu:GetAttribute("Open"), page = menu:GetAttribute("Page"), selected = menu:GetAttribute("Selected"),
	theme = menu:GetAttribute("Theme"), reducedMotion = menu:GetAttribute("ReducedMotion"),
	coins = player:GetAttribute("Coins"), coinsText = hud.Status.CoinRow.Coins.Text, owned = owned,
	usesQ = q:GetAttribute("Uses") or 0, usesE = hud.Abilities.AbilityE:GetAttribute("Uses") or 0,
	cooldownQ = math.max(0, (q:GetAttribute("CooldownEnds") or 0) - workspace:GetServerTimeNow()),
	overlayQ = q.Cooldown.Size.Y.Scale, timerQ = q.Timer.Text, keyQ = q.Key.Text, nameHiddenQ = q.TextTransparency == 1,
	placement = hud:GetAttribute("Placement"),
	selectedObject = sel and sel.Name, selX = sel and sel.AbsolutePosition.X, selY = sel and sel.AbsolutePosition.Y,
	canvasY = grid.CanvasPosition.Y, preferredInput = game:GetService("UserInputService").PreferredInput.Name,
	jumps = _G.uiTestJumps,
}
```

Sequence: the main menu is open on Home at start; Play closes it; the HUD Menu button opens the
shop; Item7 then Buy spends 25 coins on the server; Buy again is refused (owned); Close closes.

GATE: each click changes exactly the expected attribute; coins 500 to 475; Item7 shows Owned.

Test: L3. run in Studio 0.743 on 2026-10-19: pass, starts open on Home; Play closes it; the
MenuButton (UIButton binding) opens Shop; Item7 selected; coins 500 to 475, the second Buy refused
at 475; Item7 owned; Close closes; 0 retries.

## P5. Keyboard input and context priority (L4)

Goal: prove the IAS wiring: gameplay keys, cooldowns, and the menu context sinking gameplay keys and
the default jump.

<!-- test: JUMP_COUNTER -->

```lua
local humanoid = game:GetService("Players").LocalPlayer.Character:WaitForChild("Humanoid")
_G.uiTestJumps = 0
if _G.uiTestJumpConn then
	_G.uiTestJumpConn:Disconnect()
end
_G.uiTestJumpConn = humanoid.StateChanged:Connect(function(_, new)
	if new == Enum.HumanoidStateType.Jumping then
		_G.uiTestJumps += 1
	end
end)
return true
```

Keys go through `user_keyboard_input` (`pt.keys([{"action": "keyPress", "key_code": "Q"}])`).
Sequence: Q (ability, cooldown starts), Q again (refused by the cooldown), M (menu opens on Shop), E
(Menu context: next tab; the gameplay E is sunk), Q (previous tab; gameplay Q sunk), Space (sunk: no
jump), M (Close wins over OpenMenu), Space (jumps).

GATE: usesQ 1 after two presses; the timer replaces the ability name during the cooldown; usesE 0
while the menu was open; page Shop, Settings, Shop; jumps 0 with the menu open, 1 after it closes.

Test: L4. run in Studio 0.743 on 2026-10-19: pass, usesQ 1 after two presses, cooldown 2.38 s,
overlay 0.79, timer "3"; pages Shop, Settings, Shop; usesE 0 and jumps 0 with the menu open, jumps 1
after close; key label "Q".

## P6. Gamepad selection without a gamepad (L5)

Goal: check focus order, scrolling and gamepad glyphs as far as Studio's tools reach.

What the tools can and cannot send (observed):

- `user_keyboard_input` and `UserInputService:CreateVirtualInput()` deliver keyboard events only.
  Arrow keys move `GuiService.SelectedObject`; Return activates it.
- VirtualInput `SendKey(ButtonX)` arrives as a keyboard event and does not fire an IAS binding on
  ButtonX; `SendKey(ButtonB)` errors ("permanently bound to a CoreGUI core action").
- BackSlash from either source did not enter selection mode. Start selection with
  `GuiService:Select(container)`.
- A Scriptable `InputBinding:Fire(state)` stands in for the gamepad button.

<!-- test: SELECT_GRID -->

```lua
local GuiService = game:GetService("GuiService")
local grid = game:GetService("Players").LocalPlayer.PlayerGui.Menu.Panel.Pages.Shop.Grid
GuiService:Select(grid) -- selects the first selectable descendant
task.wait(0.1)
local s = GuiService.SelectedObject
return { selected = s and s.Name }
```

<!-- test: SCROLL_TO_LAST -->

```lua
local GuiService = game:GetService("GuiService")
local grid = game:GetService("Players").LocalPlayer.PlayerGui.Menu.Panel.Pages.Shop.Grid
local before = grid.CanvasPosition.Y
GuiService.SelectedObject = grid.Item30
task.wait(0.5)
return { before = before, after = grid.CanvasPosition.Y, canvas = grid.AbsoluteCanvasSize.Y, window = grid.AbsoluteWindowSize.Y }
```

<!-- test: FIRE -->

```lua
local binding = game:GetService("ReplicatedStorage").Inputs["%CTX%"]["%ACTION%"].Script
binding:Fire(true)
task.wait()
binding:Fire(false) -- the same state twice in a row does not fire again
task.wait(0.4)
return true
```

Glyphs and focus as a console player (the simulator switches `PreferredInput` with the device):

<!-- test: XBOX_GLYPH -->

```lua
local sim = game:GetService("StudioDeviceSimulatorService")
local RS = game:GetService("ReplicatedStorage")
local hud = game:GetService("Players").LocalPlayer.PlayerGui.HUD
local q = RS.Inputs.Gameplay.AbilityQ
local function fire(ctx, action)
	local b = RS.Inputs[ctx][action].Script
	b:Fire(true)
	task.wait()
	b:Fire(false)
end
sim:SetDeviceAsync("xbox")
task.wait(1.2)
local out = {
	preferred = game:GetService("UserInputService").PreferredInput.Name,
	binding = q.PreferredBinding and q.PreferredBinding.Name,
	key = hud.Abilities.AbilityQ.Key.Text,
	keyVisible = hud.Abilities.AbilityQ.Key:GetStyled("Visible"),
	buttonSize = hud.Abilities.AbilityQ.AbsoluteSize.X,
}
fire("Gameplay", "OpenMenu")
task.wait(0.4)
local sel = game:GetService("GuiService").SelectedObject
out.focus = sel and sel.Name
fire("Menu", "Close")
sim:SetDeviceAsync("iphone_7")
task.wait(1.2)
out.touchBinding = q.PreferredBinding and q.PreferredBinding.Name
out.touchKeyVisible = hud.Abilities.AbilityQ.Key:GetStyled("Visible")
sim:StopSimulationAsync()
return out
```

GATE: Select lands on Item1; Down moves to a lower cell, Right to the next column, Return selects
that item; selecting Item30 scrolls the canvas; on xbox the binding is the ButtonX one, the glyph
reads "X", ability buttons are 88 px and opening the menu focuses the grid; on a phone the key glyph
is hidden by the `@PreferredInputTouch` rule.

Not testable here: thumbstick and D-pad navigation, ButtonB, the real Select button, rumble. They
need a controller (or the GUI Controller Emulator, see gui-paths.md).

Test: L5. run in Studio 0.743 on 2026-10-19: pass, Select lands on Item1; Down to Item8, Right to
Item9; Return activated Item9 (selected item09); scrolling to Item30 moved CanvasPosition 0 to 100.7
(window 435, canvas 540); the Scriptable binding fired AbilityE 0 to 1. xbox: PreferredInput
Gamepad, binding Key2_ButtonX, glyph "X", buttons 88 px, focus Item1; on touch the binding is Touch
and the key glyph is hidden.

## P7. StyleSheets: read, swap, and the override trap (L6)

Goal: confirm styles apply, themes swap at runtime, and code does not silently override them.

<!-- test: STYLE_PROBE -->

```lua
local pg = game:GetService("Players").LocalPlayer.PlayerGui
local q = pg.HUD.Abilities.AbilityQ
local out = {
	direct = q.BackgroundColor3:ToHex(), -- the default: a direct read ignores StyleRules
	styled = q:GetStyled("BackgroundColor3"):ToHex(),
	panel = pg.Menu.Panel:GetStyled("BackgroundColor3"):ToHex(),
	size = tostring(q:GetStyled("Size")),
}
-- A property set on the instance beats every StyleRule.
local probe = q:Clone()
probe.Name = "OverrideProbe"
probe.Size = UDim2.fromOffset(100, 100)
probe.Parent = q.Parent
task.wait()
out.overrideStyled = tostring(probe:GetStyled("Size"))
out.overrideWidth = probe.AbsoluteSize.X
probe:Destroy()
return out
```

Theme swap: the Settings page's Theme button calls
`UIStyle.setTheme(design.DesignSheet, design.Light)`, which repoints the design sheet's
`StyleDerive`. Runtime contrast check of both themes: `UIAudit.guis(pg)` (kit `UIAudit`) after each
swap.

GATE: direct read differs from `GetStyled`; Dark panel 1B1F27, Light panel F4F1EA; override probe
keeps 100 px; 0 `low-contrast` in both themes.

Test: L6. run in Studio 0.743 on 2026-10-19: pass, direct read A3A2A5 vs `GetStyled` 2A303B; panel
Dark 1B1F27, Light F4F1EA after the theme click; override keeps 100 px; 0 low-contrast in both
themes.

## P8. Player preferences and reduced motion (L7)

<!-- test: MOTION_PROBE -->

```lua
local RS = game:GetService("ReplicatedStorage")
local panel = game:GetService("Players").LocalPlayer.PlayerGui.Menu.Panel
local function fire(ctx, action)
	local b = RS.Inputs[ctx][action].Script
	b:Fire(true)
	task.wait()
	b:Fire(false)
end
fire("Gameplay", "OpenMenu")
local atOpen = panel.GroupTransparency
task.wait(0.4)
local settled = panel.GroupTransparency
fire("Menu", "Close")
task.wait(0.2)
return { atOpen = atOpen, settled = settled }
```

<!-- test: PREFS -->

```lua
local GuiService = game:GetService("GuiService")
local function tryWrite(prop, value)
	local ok, err = pcall(function()
		(GuiService :: any)[prop] = value
	end)
	return if ok then "writable" else tostring(err)
end
return {
	transparency = GuiService.PreferredTransparency,
	textSize = GuiService.PreferredTextSize.Name,
	reducedMotion = GuiService.ReducedMotionEnabled,
	dim = game:GetService("Players").LocalPlayer.PlayerGui.Menu.Dim.BackgroundTransparency,
	writeReducedMotion = tryWrite("ReducedMotionEnabled", GuiService.ReducedMotionEnabled),
	writeTransparency = tryWrite("PreferredTransparency", GuiService.PreferredTransparency),
}
```

GATE: with reduced motion off the panel starts transparent and settles to 0; with the setting on it
is opaque on the first frame; Dim transparency equals 0.45 times PreferredTransparency.

Test: L7. run in Studio 0.743 on 2026-10-19: pass, PreferredTransparency 1 gives Dim 0.45; the fade
starts at GroupTransparency 1 and settles to 0; reduced motion gives 0 at open. Both settings are
read-only from scripts ("Property is read only"), so the reduced branch is driven by the in-game
toggle.

## P9. A HUD that survives respawn (L8)

<!-- test: RESET_SETUP -->

```lua
local SG = game:GetService("StarterGui")
for _, n in { "ResetDirect", "ResetFolder", "ResetControl" } do
	local old = SG:FindFirstChild(n)
	if old then
		old:Destroy()
	end
end
local control = Instance.new("ScreenGui") -- ResetOnSpawn true: proves the respawn happened
control.Name = "ResetControl"
control.Parent = SG
local direct = Instance.new("ScreenGui")
direct.Name = "ResetDirect"
direct.ResetOnSpawn = false
direct.Parent = SG
local folder = Instance.new("Folder")
folder.Name = "ResetFolder"
local nested = Instance.new("ScreenGui")
nested.Name = "ResetNested"
nested.ResetOnSpawn = false
nested.Parent = folder
folder.Parent = SG
return true
```

<!-- test: RESET_MARK -->

```lua
local pg = game:GetService("Players").LocalPlayer.PlayerGui
local folder = pg:FindFirstChild("ResetFolder")
local guis = { HUD = pg.HUD, ResetDirect = pg:FindFirstChild("ResetDirect"), ResetControl = pg:FindFirstChild("ResetControl"),
	ResetNested = folder and folder:FindFirstChild("ResetNested") }
_G.uiTestOldCharacter = game:GetService("Players").LocalPlayer.Character
local out = {}
for name, g in guis do
	g:SetAttribute("Mark", "before")
	out[name] = true
end
return out
```

Kill the character on the server (`Players:GetPlayers()[1].Character.Humanoid.Health = 0`), wait
until the client's `Character` is a new model with a living Humanoid (compare with
`_G.uiTestOldCharacter`, not with an attribute: replication lags), then:

<!-- test: RESET_CHECK -->

```lua
local pg = game:GetService("Players").LocalPlayer.PlayerGui
local folder = pg:FindFirstChild("ResetFolder")
local nested = folder and folder:FindFirstChild("ResetNested")
local direct = pg:FindFirstChild("ResetDirect")
local control = pg:FindFirstChild("ResetControl")
local huds = 0
for _, g in pg:GetChildren() do
	if g.Name == "HUD" then
		huds += 1
	end
end
return {
	hud = pg.HUD:GetAttribute("Mark") or "reset", direct = direct and direct:GetAttribute("Mark") or "reset",
	nested = nested and (nested:GetAttribute("Mark") or "reset") or "missing", huds = huds,
	control = control and (control:GetAttribute("Mark") or "reset") or "missing",
	health = pg.HUD.Status.HealthBar.Value.Text,
}
```

GATE: ResetControl comes back without the mark (the respawn happened); HUD and ResetDirect keep it;
one HUD; the health label rebinds to the new Humanoid. ResetNested: the docs say its ResetOnSpawn
false is ignored, so it should reset; the result below records what Studio did.

Test: L8. run in Studio 0.743 on 2026-10-19: pass, HUD and ResetDirect kept the mark; ResetNested
and ResetControl reset (the nested case matches the docs); 1 HUD; health label "100" on the new
Humanoid; usesQ 1 to 2 after respawn.

## P10. Localization and text expansion (L9)

<!-- test: TRANSLATE -->

```lua
local LS = game:GetService("LocalizationService")
local pg = game:GetService("Players").LocalPlayer.PlayerGui
local translator = LS:GetTranslatorForLocaleAsync("de")
local originals, changed = {}, 0
for _, gui in { pg.HUD, pg.Menu } do
	for _, d in gui:GetDescendants() do
		if (d:IsA("TextLabel") or d:IsA("TextButton")) and d.AutoLocalize and d.Text ~= "" then
			local t = translator:Translate(d, d.Text)
			if t ~= d.Text then
				originals[d] = d.Text
				d.Text = t
				changed += 1
			end
		end
	end
end
_G.uiTestOriginals = originals
return { locale = translator.LocaleId, settings = translator:Translate(game, "Settings"), changed = changed }
```

<!-- test: PSEUDO -->

```lua
-- Pseudo-localization [added]: every localizable string 40% longer, to find boxes that clip.
local pg = game:GetService("Players").LocalPlayer.PlayerGui
local originals, changed = _G.uiTestOriginals or {}, 0
for _, gui in { pg.HUD, pg.Menu } do
	for _, d in gui:GetDescendants() do
		if (d:IsA("TextLabel") or d:IsA("TextButton")) and d.AutoLocalize and d.Text ~= "" then
			originals[d] = originals[d] or d.Text
			d.Text = originals[d] .. string.rep("~", math.ceil((utf8.len(originals[d]) or #originals[d]) * 0.4))
			changed += 1
		end
	end
end
_G.uiTestOriginals = originals
return changed
```

<!-- test: RESTORE_TEXT -->

```lua
for d, text in _G.uiTestOriginals or {} do
	d.Text = text
end
_G.uiTestOriginals = nil
return true
```

Then run `UILayout.check` on the smallest presets (iphone_7, samsung_galaxy_a06) with the menu on
each page.

GATE: German "Settings" is "Einstellungen"; 0 `text-clipped` on the smallest phones in German and in
pseudo-localization.

Not run here: Automatic Translation (Creator Hub, needs a published experience), and Studio's
language emulation (GUI).

Test: L9. run in Studio 0.743 on 2026-10-19: pass, German changed 38 strings ("Einstellungen" on the
tab); German and pseudo-localized text on iphone_7 and samsung_galaxy_a06, three pages each: 12
checks, 0 clipped.

## P11. Layout object facts (L10)

<!-- test: LAYOUT_FACTS -->

```lua
local sg = Instance.new("ScreenGui")
sg.Name = "LayoutFacts"
local bar = Instance.new("Frame")
bar.Size = UDim2.fromOffset(300, 40)
bar.Parent = sg
local list = Instance.new("UIListLayout")
list.FillDirection = Enum.FillDirection.Horizontal
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Padding = UDim.new(0, 6)
list.Parent = bar
local function fill(n)
	for _, c in bar:GetChildren() do
		if c:IsA("GuiObject") then
			c:Destroy()
		end
	end
	for i = 1, n do
		local b = Instance.new("TextButton")
		b.Name = "T" .. i
		b.LayoutOrder = i
		b.Size = UDim2.new(0, 40, 1, 0)
		b.Parent = bar
	end
	task.wait()
	local total = 0
	for _, c in bar:GetChildren() do
		if c:IsA("GuiObject") then
			total += c.AbsoluteSize.X
		end
	end
	return total
end
sg.Parent = game:GetService("StarterGui")
local out = {}
out.fixedThree = fill(3)
list.HorizontalFlex = Enum.UIFlexAlignment.Fill
out.flexThree = fill(3)
out.flexSix = fill(6)
-- The layout owns Position: a child's own Position is ignored.
bar.T1.Position = UDim2.fromOffset(500, 500)
task.wait()
out.positionIgnored = bar.T1.AbsolutePosition.X == bar.AbsolutePosition.X
-- Negating LayoutOrder reverses the order.
for _, c in bar:GetChildren() do
	if c:IsA("GuiObject") then
		c.LayoutOrder = -c.LayoutOrder
	end
end
task.wait()
out.reversed = bar.T6.AbsolutePosition.X < bar.T1.AbsolutePosition.X
-- Scale-height cells inside an auto-sized canvas.
local sf = Instance.new("ScrollingFrame")
sf.Size = UDim2.fromOffset(300, 200)
sf.CanvasSize = UDim2.new()
sf.AutomaticCanvasSize = Enum.AutomaticSize.Y
sf.Parent = sg
local grid = Instance.new("UIGridLayout")
grid.CellSize = UDim2.new(0.3, 0, 0.3, 0)
grid.Parent = sf
for i = 1, 30 do
	Instance.new("Frame").Parent = sf
end
task.wait()
out.scaleCell = sf:FindFirstChildOfClass("Frame").AbsoluteSize.Y
out.scaleCanvas = sf.AbsoluteCanvasSize.Y
sg:Destroy()
return out
```

GATE: fixed tabs sum to 120 px, flex tabs fill the 300 px bar minus padding with 3 and 6 tabs;
Position ignored; order reversed. Scale cells in an auto canvas: recorded.

Test: L10. run in Studio 0.743 on 2026-10-19: pass, fixed tabs 120 px; 3 flex tabs 288 px, 6 flex
tabs 270 px; Position ignored; negated LayoutOrder puts T6 first; 30 scale cells (0.3 of a 200 px
frame) measure 60 px, canvas 645 px.

## P12. Scenario-generated UI art (handoff, not run)

Icons, panel frames and button skins come from the scenario-game-assets skill as transparent PNGs.
An upload publishes to Roblox, so it needs the user's go (Asset Manager > Bulk Import, or Open Cloud
Assets API through scenario-roblox-tooling). Then:

- Item icons: set `Icon.Image` in each shop cell (`ScaleType = Fit`); the template leaves an empty
  `Icon` ImageLabel per cell.
- Frames and buttons: `ImageLabel.ScaleType = Slice` with `SliceCenter` on the stretchable middle
  (9-slice), so one image serves every size.
- Generate at the largest display size you ship (Large cells are 140x160), and keep text out of the
  art: baked text cannot be translated or scaled.

Not yet run: needs an uploaded image id.

## Final full run

Command: `python3 tests/code/scenario-roblox-ui/run_live.py` (or `--offline` for O1 to O3, which
need no Studio). L11 to L14 (UISettings on Studio instances, the text-size rows, the chat code, the
key capture) run the doc blocks of player-settings.md and screen-budget.md followed by
`tests/code/scenario-roblox-ui/live_*.luau`; their numbers are recorded under each block. The test
place sets `TextChatService.ChatVersion` in its Rojo project (L13 needs the in-experience chat
window) and O3 checks it. Evidence: `tests/live_evidence/scenario-roblox-ui/` (results.json, contact
sheets of the matrix and of the input states, console.txt).

run in Studio 0.743 on 2026-10-19 03:51, L0 to L14: 15 of 16 entries pass. L9 failed on a lost MCP
reply ("no answer in 120s" on the German translation, second phone), not on an assertion; the runner
now restores the text and repeats that call once. L9 rerun alone at 03:56: pass, 38 strings
translated, "Settings" is "Einstellungen", 12 checks, 0 clipped. An earlier full run the same day
(L0 to L10, before the settings work): pass, 11 of 11 plus the lost-reply count (0), exit 0. Offline
at 03:58 the same day, after these fixes: O1 rbx_check 37 files, 22 doc blocks and the 4 live
chunks, 0 errors, 0 warnings (old and new solver); O2 Lune 9 of 9; O3 Rojo build writes
`PlayerScriptsUseInputActionSystem` Enabled and `ChatVersion` TextChatService, and the lead Lune
audit reports 0 error, 0 warn.
