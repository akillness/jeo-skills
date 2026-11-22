# Screen budget, chat and discovery

What stays on screen, what must stay free, and how to know players find the shop. Design judgment
comes from the mobile roundtable (Cindering, Cinder Studios; Nathan "Undone Builder", Simple Games;
BsyU-SJ9L-c, 2023) and the console guidelines; the APIs come from the current docs.

## Show fewer things

- Whatever stays on screen tells the player "this is important". War Simulator keeps two permanent
  elements, money and a shop button, and moves shops and teleports into the world as ground rings
  (BsyU-SJ9L-c [00:06:40, 00:07:13, 00:07:28]).
- Keep what must be found: a hidden weapon shop sends players into battle unequipped [00:28:34].
- Before building, list the permanent HUD elements; a fourth needs a reason [added, from the
  roundtable's rule]. The template has a display-only status block, the menu button, and two ability
  buttons that only matter during play.
- One look and one convention across every menu: inconsistency is friction (BsyU-SJ9L-c [00:38:08,
  00:39:35, 00:40:10]). The StyleSheet enforces the look.

## Keep the chat area free

- **Phones.** Live chat covers the top left, and Studio test mode hides it, so a layout that looks
  clear in Studio can be covered on a phone. Put buttons in the right column instead (BsyU-SJ9L-c
  [00:32:09, 00:32:41]).
- **The 2023 hot-zone slide** [00:08:20]:
  - center top below the bar overlaps chat and the player's view;
  - left under chat holds display-only information such as currency;
  - most buttons go in the right column;
  - bottom center is free unless the Backpack is used.
- **The template follows the slide.** The status block is top left and display only, the menu button
  is top right, and the abilities sit bottom right.
- **Today's chat is TextChatService.** Its window defaults to the top left
  (`ChatWindowConfiguration.HorizontalAlignment` Left, `VerticalAlignment` Top) and can be moved or
  resized (chat window doc). `AbsolutePosition` and `AbsoluteSize` on `ChatWindowConfiguration` and
  `ChatInputBarConfiguration` give the rectangle buttons must stay out of.
- **A place built with Rojo needs `TextChatService.ChatVersion = TextChatService` in its project.**
  Left out, Studio loaded the file with `LegacyChatService`: no chat window, and `AbsoluteSize` 0 on
  both configurations (observed in L13, Studio 0.743). Scripts cannot write the property
  (RobloxScriptSecurity).
- **Console.** "Regardless of how you customize the chat system, disable the chat window for console
  games" (console guidelines; also TwinPlayz, 5-Wo0EHzJtM [00:06:55, 00:07:29]). Use
  `ViewportDisplaySize` Large as the TV signal: the GuiService reference supersedes
  `IsTenFootInterface` with it.

Client code. Confirm that the chat rectangle and the ScreenGui's `AbsolutePosition` share one
coordinate space (`IgnoreGuiInset`) before trusting an empty result: L13 checks it with a hit test
at the chat window's center.

<!-- test: CHAT_POLICY -->

```lua
local GuiService = game:GetService("GuiService")
local TextChatService = game:GetService("TextChatService")

local function applyChatPolicy()
	local window = TextChatService:FindFirstChildOfClass("ChatWindowConfiguration")
	if window then
		window.Enabled = GuiService.ViewportDisplaySize ~= Enum.DisplaySize.Large
	end
end
GuiService:GetPropertyChangedSignal("ViewportDisplaySize"):Connect(applyChatPolicy)
applyChatPolicy()

-- Buttons of `gui` that overlap the chat window or its input bar.
local function buttonsUnderChat(gui: ScreenGui): { string }
	local areas = {}
	for _, class in { "ChatWindowConfiguration", "ChatInputBarConfiguration" } do
		local c = TextChatService:FindFirstChildOfClass(class) :: any
		if c and c.Enabled then
			table.insert(areas, { x = c.AbsolutePosition.X, y = c.AbsolutePosition.Y, w = c.AbsoluteSize.X, h = c.AbsoluteSize.Y })
		end
	end
	local out = {}
	for _, b in gui:GetDescendants() do
		if b:IsA("GuiButton") and b.Visible then
			local r = { x = b.AbsolutePosition.X, y = b.AbsolutePosition.Y, w = b.AbsoluteSize.X, h = b.AbsoluteSize.Y }
			for _, area in areas do
				if UILayout.overlapRatio(r, area) > 0 then
					table.insert(out, b:GetFullName())
					break
				end
			end
		end
	end
	return out
end

return buttonsUnderChat
```

Test: L13 runs this block in a playtest client, then simulates the xbox preset (Large) and iPhone 7
(Small). It expects the chat window off at Large and on otherwise, 0 HUD buttons under chat on the
desktop window and on the phone, a control button placed on the chat window to be reported, and
`CoreGui:GetGuiObjectsAtPosition` at the chat window's center to return a chat object (same
coordinate space). Result: run in Studio 0.743 on 2026-10-19: pass, desktop window chat on at
(8, 12) 319x149, xbox (Large) chat off, iPhone 7 chat on at 266x79, 0 HUD buttons under chat on
both, the control button reported once, the hit test at the chat center found a chat object, chat
restored. The first run failed because the place had legacy chat (see above).

## Do players find the shop?

- A button can look obvious and go unused. Nathan's purple House button was clicked by under 10% of
  players, measured with a badge awarded on the first click (BsyU-SJ9L-c [00:34:55, 00:43:08]).
  Making his shop obvious "literally quadruples my monetization" [00:33:50, 00:34:21].
- Today, log a custom event from the server instead of a badge.
  - `AnalyticsService:LogCustomEvent` works only from the server and only in a published game, never
    from the client or Studio. A game can have up to 100 custom events (custom events doc).
  - Put the variants in custom fields, not in event names (custom fields doc).
  - Unique users of the event over daily users is the discovery rate. The `source` field shows
    whether players arrive from the HUD button, a key, the gamepad or a world object.
- Give the screen open and close events to scenario-roblox-monetization for its funnels.

Server code, not yet run: events log only in a published game, which needs the user's go. The client
calls `ReplicatedStorage.ShopOpened:FireServer("HudButton")` when the shop page opens.

```lua
local AnalyticsService = game:GetService("AnalyticsService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local SOURCES = { HudButton = true, Key = true, Gamepad = true, World = true }
local logged: { [Player]: boolean } = {}

local shopOpened = Instance.new("RemoteEvent")
shopOpened.Name = "ShopOpened"
shopOpened.Parent = ReplicatedStorage

shopOpened.OnServerEvent:Connect(function(player: Player, source: unknown)
	if typeof(source) ~= "string" or not SOURCES[source] or logged[player] then
		return -- unknown sources are dropped; one event per player per server
	end
	logged[player] = true
	AnalyticsService:LogCustomEvent(player, "ShopOpened", 1, {
		[Enum.AnalyticsCustomFieldKeys.CustomField01.Name] = "Source - " .. source,
	})
end)

Players.PlayerRemoving:Connect(function(player)
	logged[player] = nil
end)
```

- **The naive-player test.** Give the build to someone who does not play mobile games and watch,
  silently, where they get stuck (BsyU-SJ9L-c [00:42:07]); players and videos of real play tell the
  rest [00:42:39]. An agent cannot run this: ask the user, and say so in the report.
- **What an agent can measure** [added]: the inputs from the HUD to a finished purchase. The
  template takes three clicks (menu button, item, Buy; L3). Console players move one button at a
  time, so key actions should take only a few moves (console guidelines).

## Reward the purchase

- Show and sound every purchase. Without feedback, or with the item buried in an inventory scroll,
  players ask "did they steal my money" (BsyU-SJ9L-c [00:40:30]).
- The template updates the coin counter from the server attribute and marks the cell Owned (L3).
- Add [added]:
  - a short highlight on the bought cell and the counter, skipped under reduced motion;
  - a purchase sound from scenario-roblox-vfx-audio;
  - on a refusal, the reason in text ("Not enough coins"), never color alone.
