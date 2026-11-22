# Player settings and text size

The template's Settings page holds Theme and Reduced motion (P7, P8). A shipped game also needs
audio volume, camera shake, key rebinding, and a layout that survives the player's Text Size
setting. The logic lives in [UISettings.luau](../scripts/agentkit/ui/UISettings.luau), tested in
Lune 0.11 (`run_offline.sh` O2: rebind, swap, reserved keys, export and import, volume, steps,
locked text) and on Studio instances by `run_live.py` L11 (run in Studio 0.743 on 2026-10-19: pass,
rebind set, swap, swap, Escape and ButtonStart refused, an unset script key reads `None`, half
volume 0.4 on a 0.8 base, steps 0.75, 1, 0, shake default 1, 2 locked labels found in the fixture).
The key capture, the text-size rows and the chat code have live tests L12 to L14; their results are
recorded under each block.

## What the page holds

| Setting                      | Control                                                                 | Effect                                                                                                                                                  | Source                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Music, effects, voice volume | stepped, 0 to 100% in 25% steps                                         | `UISettings.setVolume(soundGroup, level)` scales the designer's volume                                                                                  | one volume per sound group (WooleyWool, accessibility roundtable K1pEI6LVJJA [00:35:41, 00:38:23]); volume sliders help everyone (BitwiseAndrea [00:14:00])                                                                                                                        |
| Camera shake                 | stepped, 0 to 100%                                                      | camera code multiplies its shake by the level; `UISettings.defaultShake(reducedMotion)` starts it at 0 for players who asked for reduced motion [added] | an intensity slider, not an on/off switch (BitwiseAndrea, K1pEI6LVJJA [00:52:34]); red flashes and large coverage are worse [00:48:51]                                                                                                                                             |
| Key bindings                 | one row per action: keyboard key, gamepad button, "press a key" capture | `UISettings.rebind(action, key)`                                                                                                                        | offer rebinding, keep WASD and arrows (K1pEI6LVJJA [00:44:17]); a rebind is one property change on the binding (derpmonster83, 8nqNw6kSKJ0 [00:09:21]); Roblox announced player-facing remapping on the IAS but had not shipped it (Fg-Ksoa7b-s [00:08:15]), so you build the page |
| Text size                    | none in game: the player sets it in the Roblox Settings menu            | read `GuiService.PreferredTextSize` (ReadOnly in the reference)                                                                                         | accessibility doc                                                                                                                                                                                                                                                                  |
| Theme, reduced motion        | template                                                                | P7, P8                                                                                                                                                  |                                                                                                                                                                                                                                                                                    |

Stepped controls instead of drag sliders [added]: a drag needs a mouse or a finger, while two
buttons (or left and right in gamepad selection mode) work on every input.
`UISettings.step(level, direction)` moves one step and clamps.

Save the page as one table with the player's data (scenario-roblox-data): volumes, shake, and
`UISettings.export(gameplayContext)` (strings such as
`{ AbilityQ = { Keyboard = "Q", Gamepad = "ButtonX" } }`). On load, `UISettings.import` goes through
`rebind`, so stale or tampered data can neither take a reserved key nor bind one key twice; it
returns what it refused.

Hand the shake level to the code that shakes the camera (scenario-roblox-gameplay or
scenario-roblox-vfx-audio), for example as a `ShakeScale` attribute on the local player. Route every
`Sound` to a `SoundGroup` (scenario-roblox-vfx-audio), or the volume rows change nothing.

## Rebinding rules

- One key per device kind per action. Inside one InputContext a conflict swaps the two keys
  (`rebind` returns "swapped with AbilityE"). Contexts that never run together may share keys: the
  template's menu reuses Q and E for tab cycling.
- Never offer a key Roblox keeps (input overview, default bindings): Esc, Start, F9, F11, F12, Print
  Screen, Backspace, Backslash and Select are always reserved. Slash, Tab, Backquote, the digit
  keys, L1, R1 and R2 belong to chat, the player list and the Backpack while those are enabled.
  `UISettings.RESERVED` holds the first list; add the second when you keep those features. The
  template binds L1 and R1, so a game that keeps the Backpack moves them.
- Refresh the key glyphs after a change (`UIInput.glyph(action)`), and store the export, not the
  binding instances.

Capture the next key for one action. Disable the contexts while listening, or the key also fires the
action being rebound and the menu shortcuts. Turn them back on only when that key is released:
re-enabled inside `InputBegan`, the IAS read the same press with the new binding and fired the
action (observed in L14, Studio 0.743). With the contexts off, that one press can still reach the
default character controls.

<!-- test: CAPTURE_KEY -->

```lua
local UserInputService = game:GetService("UserInputService")

local function captureKey(action: InputAction, kind: string, contexts: { InputContext }, done: (boolean, string) -> ())
	local was = {}
	for i, c in contexts do
		was[i] = c.Enabled
		c.Enabled = false
	end
	local began: RBXScriptConnection
	began = UserInputService.InputBegan:Connect(function(input: InputObject)
		local key = input.KeyCode
		if key == Enum.KeyCode.None or UISettings.kind(key) ~= kind then
			return -- mouse clicks and the other device kind keep waiting
		end
		began:Disconnect()
		done(UISettings.rebind(action, key))
		local ended: RBXScriptConnection
		ended = UserInputService.InputEnded:Connect(function(up: InputObject)
			if up.KeyCode == key then -- the key is up: this press can no longer fire an action
				ended:Disconnect()
				for i, c in contexts do
					c.Enabled = was[i]
				end
			end
		end)
	end)
end

return captureKey
```

Test: L14 starts this capture on the template's AbilityQ, presses E through the MCP keyboard tool
and expects a swap with AbilityE, both contexts off while listening and restored after, no ability
fired by the captured press, E then firing AbilityQ and Q firing AbilityE, glyphs E and Q. Gamepad
capture cannot be driven (MCP sends keyboard events only). Result: run in Studio 0.743 on
2026-10-19: pass, both contexts off while listening, "swapped with AbilityE", the captured press
fired nothing (AbilityQ uses 2, 2, then 3 on E; AbilityE 1, 1, then 2 on Q), glyphs E and Q,
contexts and keys restored. The first version re-enabled the contexts inside `InputBegan` and
failed: the captured E fired AbilityQ.

## Text size

`GuiService.PreferredTextSize` is Medium by default; players raise it to Large, Larger or Largest in
the Roblox Settings menu, and the engine enlarges text through its font pipeline (accessibility
doc). The same doc lists what follows:

- `TextScaled` text ignores the setting.
- A `UITextSizeConstraint` caps it at `MaxTextSize`.
- `AutomaticSize` boxes grow with it, and `TextWrapped` text wraps inside its box.
- `TextService:GetTextSize` and `GetTextBoundsAsync` return the enlarged size.

So:

- Body text keeps a token `TextSize` (the template) and never `TextScaled`. Rows that hold text
  (settings rows, the buy bar) use `AutomaticSize = Y`; descriptions use `TextWrapped`.
- `UISettings.lockedText(root)` lists every `TextScaled` label and every capped constraint. Review
  each one: fine on a decorative number, wrong on a sentence.
- Adapt the layout, not the text, with the built-in selectors `@PreferredTextSizeLarge`,
  `@PreferredTextSizeLarger` and `@PreferredTextSizeLargest` (StyleRule reference). Raising
  `TextSize` in those rules would enlarge text the engine already enlarges [added, from the doc's
  wording].

Rows to add to the template's design sheet spec (passed to `UIStyle.install`): bigger cells, so
fewer columns, when text is bigger. The selector names come from the reference and follow the
pattern of the template's `@ViewportDisplaySize` rules, which parsed with 0 selector errors in L0.

<!-- test: TEXT_SIZE_RULES -->

```lua
local textSizeRules = {
	{ selector = "@PreferredTextSizeLarger UIGridLayout, @PreferredTextSizeLargest UIGridLayout", priority = 12, props = { CellSize = "$CellL" } },
	{ selector = "@PreferredTextSizeLargest .Bar", priority = 12, props = { Size = "$BarL" } },
}

return textSizeRules
```

Test: L12 adds these rows to the template's design sheet in Edit and expects 0 selector errors, no
change to the shop cell at the current text size, the Large cell (140x160) from the same row body
under a selector that matches now, and a clean removal. It also tries a script write to
`PreferredTextSize`: if Studio refuses it, Largest stays a manual check; if it accepts it, the cell
must turn Large. Result: run in Studio 0.743 on 2026-10-19: pass, 0 selector errors, text size
Medium, shop cell 88x100 before, after and at the end, the row body under a matching selector gives
140x160, and the write was refused ("Unable to assign property PreferredTextSize. Property is read
only").

Check at the largest size:

1. Every build: `UISettings.lockedText` on the built tree (Lune-tested logic; L11 expects 0 on the
   template's HUD and menu).
2. By hand in Studio (not run): start a playtest, open the Roblox menu (Esc), Settings, Text Size,
   Largest. Then run the P3 scenes with `UILayout.check` and read the contact sheet for
   `text-clipped`. The reference marks the property ReadOnly and L12 confirmed that a script write
   is refused. MCP clicks have not been tried on the Roblox menu, so record this as a human step.
3. Run `UIStyle.errors` after adding the rows: a typo in a selector reads as no rule at all.
