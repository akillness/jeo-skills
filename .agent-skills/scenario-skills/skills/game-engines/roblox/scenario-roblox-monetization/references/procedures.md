# Procedures: monetization and live-ops

Full code for each stage of the playbook in [SKILL.md](../SKILL.md). Each procedure names its tests:

- Offline suites, `tests/code/scenario-roblox-monetization/suites/<name>.luau`, run in Lune by
  `lune_run.luau` and unchanged in Studio's Luau by `run_live.py` (test L2).
- Live tests L1 to L14 in `tests/code/scenario-roblox-monetization/run_live.py`, against an
  unpublished place, through the scenario-roblox-expert toolkit.

Every Luau block below passes `rbx_check` with zero errors (offline test O6). Blocks headed
`-- File:` are the exact files the live tests run (offline test O7 compares them).

The modules are in [scripts/agentkit/monetization/](../scripts/agentkit/monetization/). Server
modules (`Catalog`, `Purchases`, `Telemetry`, `Entitlements`) go into `ServerScriptService.MonKit`,
with the data layer's `Receipts` (scenario-roblox-data). Shared modules (`Odds`, `PriceText`,
`LiveConfig`, `ShopRank`) go into `ReplicatedStorage.MonKit`. `MonAudit` stays in audits. The Python
side is [scripts/rbx_monetization.py](../scripts/rbx_monetization.py).

## Setup shared by the Python snippets

```python
import sys
from pathlib import Path
SKILLS = Path("skills")  # the folder that holds the installed skills
sys.path[:0] = [str(SKILLS / "scenario-roblox-expert" / "scripts"), str(SKILLS / "scenario-roblox-monetization" / "scripts")]
import rbx_env
import rbx_monetization as mon
from rbx_play import Playtest

with rbx_env.place_slot():
    s = rbx_env.open_place("places/shop/shop.rbxl")   # opened once, reused, never closed by the agent
```

## P1. Audit the place before changing it [L4, O4]

Goal: find receipt handlers on the client or assigned twice, grants on prompt signals, prices typed
in code, analytics and configs called from the client, ads without a product reward, random rewards
without a policy check, legacy services.

```python
report = mon.audit_place("shop.rbxl")                       # offline, Lune
for f in report["findings"]:
    print(f["severity"], f["rule"], f["path"], f["message"])
live = mon.run(s, "local r = MonAudit.run(game) return {rules = MonAudit.rules(r), tally = r.tally}", kit=["MonAudit"])
```

Rules (from `MonAudit.luau`): errors `receipt-client`, `receipt-missing`, `receipt-multiple`,
`analytics-client`, `config-client`, `ad-show-client`, `ad-availability-server`,
`ad-reward-not-product`, `transfer-no-receipt`; warnings `purchase-signal`, `price-literal`,
`pass-finished-client`, `pass-no-ownership-check`, `subscription-status-client`,
`subscription-no-change-event`, `config-no-refresh`, `random-no-policy`, `api:GamePassService`,
`api:ShowVideoAd`, `api:FireInGameEconomyEvent`; info `prompt-at-join`. The lead's Audit covers
`GetProductInfo`, `PlayerOwnsAsset`, `PromptPremiumPurchase` and the `Fire*` analytics names.

Result: Run in Studio 0.743 on 2026-10-19: pass, the Studio audit of the installed stack equals the
offline audit (16 scripts, 0 errors, 0 warnings); the bad fixtures raise 19 rules (offline O4: 8
errors, 12 warnings, 1 info).

## P2. One catalog, checked twice [suite catalog, L13]

Goal: every product, pass and subscription in one server table, grants as pure functions, no prices.
Validate the definitions offline; verify the ids against the engine in a published test server.

```lua
--!nonstrict
-- File: ServerScriptService.MonKit.CatalogData (ModuleScript)
-- Test catalog of the unpublished test place. Ids are placeholders: real ids come from
-- Creator Hub > Monetization once the experience is published.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("MonKit")
local Odds = require(Shared:WaitForChild("Odds"))
local EGG = require(Shared:WaitForChild("EggOdds"))

local rng = Random.new()

return {
	products = {
		Coins100 = { id = 1001, kind = "currency", currency = "Coins", amount = 100 },
		Starter = {
			id = 1002,
			kind = "bundle",
			oncePerAccount = true,
			currencies = { Coins = 250 },
			items = { "Sword" },
			fallback = { Coins = 250 },
		},
		AdCoins = { id = 1003, kind = "adReward", currency = "Coins", amount = 20 },
		MysteryEgg = {
			id = 1004,
			kind = "custom",
			odds = EGG,
			-- Rolls inside the grant: Receipts runs it once per PurchaseId, without yielding.
			grant = function(data, _receipt, _events)
				data.Inventory = data.Inventory or {}
				table.insert(data.Inventory, Odds.roll(EGG, rng))
				return true
			end,
		},
		DirectDragon = {
			id = 1005,
			kind = "custom",
			grant = function(data)
				data.Inventory = data.Inventory or {}
				table.insert(data.Inventory, "Legendary Dragon")
				return true
			end,
		},
	},
	passes = { VIP = { id = 2001, perk = "vip" } },
	subscriptions = { Club = { id = "EXP-0000000001", perk = "club" } },
}
```

```lua
-- Server, published test server: the ids exist and belong to this game.
local MarketplaceService = game:GetService("MarketplaceService")
local ServerScriptService = game:GetService("ServerScriptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Kit = ServerScriptService:WaitForChild("MonKit")
local Catalog = require(Kit:WaitForChild("Catalog"))
local PriceText = require(ReplicatedStorage:WaitForChild("MonKit"):WaitForChild("PriceText"))

local catalog = Catalog.new(require(Kit:WaitForChild("CatalogData")))
local INFO = { product = Enum.InfoType.Product, pass = Enum.InfoType.GamePass }
local findings = catalog:validate()
for _, f in catalog:verify(function(id, kind)
	return PriceText.fetch(MarketplaceService, id, INFO[kind])
end, game.CreatorId) do
	table.insert(findings, f)
end
for _, f in findings do
	warn(f.severity, f.rule, f.message)
end
```

`verify` also warns `no-description` when an item's description is blank: items need a name, a
description and a thumbnail to be considered for Home and Search recommendations
([launch-liveops.md](launch-liveops.md)).

Result: Suite `catalog` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2): pass, 7
of 7 tests. Run in Studio 0.743 on 2026-10-19: pass, unpublished, `GetProductInfoAsync` for an
unknown product answers "MarketplaceService::getProductInfo - GetDeveloperProductInfo failed: Item
not found in batch response.", which `verify` reports as `unknown-id`. The block above ran in a
Studio 0.743 server on 2026-10-19 (L16, unpublished place): pass, `no-description` fired for pass
2001, an id that resolves to another creator's item with no description, so the check ran on a real
engine answer; the test place's own ids are placeholders, so its own items were not checked. Not yet
run: `no-description` on your own passes and products, which needs a published game with real items.

## P3. Receipts: one entry point, idempotent, saved before granted [suite receipts, L5, L6]

Goal: exactly one grant per `PurchaseId`, `Processed` (or `PurchaseGranted`) only once the saved
profile holds the id, everything else `NotProcessedYet`. The data layer owns persistence
(scenario-roblox-data `Receipts`: `PurchaseIds` log of 100 in the profile, grant confirmed by
`LastSavedData`); this module owns the receipt contract, the catalog and analytics.

The full server module of the test place wires P3 to P9:

```lua
--!nonstrict
-- File: ServerScriptService.MonKit.Monetization (ModuleScript; a Script calls .start() once)
-- Server side of the monetization stack: receipts, entitlements, live config, paid random policy,
-- shop funnel and rewarded video. Started once by ServerScriptService.Main.
local AdService = game:GetService("AdService")
local AnalyticsService = game:GetService("AnalyticsService")
local ConfigService = game:GetService("ConfigService")
local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local PolicyService = game:GetService("PolicyService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")

local Kit = ServerScriptService:WaitForChild("MonKit")
local Shared = ReplicatedStorage:WaitForChild("MonKit")
local Catalog = require(Kit:WaitForChild("Catalog"))
local Entitlements = require(Kit:WaitForChild("Entitlements"))
local Profiles = require(Kit:WaitForChild("Profiles")) -- the data layer (scenario-roblox-data)
local Purchases = require(Kit:WaitForChild("Purchases"))
local Receipts = require(Kit:WaitForChild("Receipts")) -- scenario-roblox-data
local Telemetry = require(Kit:WaitForChild("Telemetry"))
local LiveConfig = require(Shared:WaitForChild("LiveConfig"))

local Monetization = { state = nil :: any }

local SHOP_STEPS = { "Opened", "ViewedOdds", "PromptShown" }
local PUBLIC_KEYS = { "shop.featured", "shop.eggEnabled" }

local function remote(folder, className, name)
	local r = Instance.new(className)
	r.Name = name
	r.Parent = folder
	return r
end

-- PolicyService errors count as restricted: hiding an offer is the safe failure.
local function paidRandomAllowed(player)
	local ok, info = pcall(function()
		return PolicyService:GetPolicyInfoForPlayerAsync(player)
	end)
	return ok and type(info) == "table" and info.ArePaidRandomItemsRestricted == false
end

function Monetization.start()
	assert(Monetization.state == nil, "Monetization.start: already started")
	local catalog = Catalog.new(require(Kit:WaitForChild("CatalogData")))
	for _, f in catalog:validate() do
		if f.severity == "error" then
			error("catalog: " .. f.message)
		end
	end

	local telemetry = Telemetry.new({
		analytics = AnalyticsService,
		http = HttpService,
		onboardingSteps = { "Joined", "OpenedShop" },
		ccu = function()
			return #Players:GetPlayers()
		end,
	})

	local receipts = Receipts.new({
		getProfile = function(userId)
			local player = Players:GetPlayerByUserId(userId)
			return player and Profiles.get(player)
		end,
		isPresent = function(userId)
			return Players:GetPlayerByUserId(userId) ~= nil
		end,
		handlers = catalog:handlers(),
	})
	local purchases = Purchases.new({ receipts = receipts, catalog = catalog, telemetry = telemetry, players = Players })
	purchases:bind(MarketplaceService)

	local vipTool = ServerStorage:FindFirstChild("VipTool")
	local entitlements = Entitlements.new({
		passes = catalog.passes,
		subscriptions = catalog.subscriptions,
		owns = function(userId, passId)
			return MarketplaceService:UserOwnsGamePassAsync(userId, passId)
		end,
		subStatus = function(player, subId)
			return MarketplaceService:GetUserSubscriptionStatusAsync(player, subId)
		end,
		onChanged = function(player, perk, active)
			if perk == "vip" and active and vipTool then
				Entitlements.giveTool(player, vipTool)
			end
		end,
	})

	local live = LiveConfig.new({
		service = ConfigService,
		http = HttpService,
		defaults = { ["shop.featured"] = "Starter", ["shop.eggEnabled"] = true },
	})

	local folder = Instance.new("Folder")
	folder.Name = "MonRemotes"
	local shopStep = remote(folder, "RemoteEvent", "ShopStep")
	local buyEgg = remote(folder, "RemoteEvent", "BuyEgg")
	local watchAd = remote(folder, "RemoteEvent", "WatchAd")
	folder.Parent = ReplicatedStorage

	-- Shop funnel: a new session at step 1, then forward steps only (Roblox completes skipped ones).
	local funnel = {}
	shopStep.OnServerEvent:Connect(function(player, step)
		if type(step) ~= "number" or step % 1 ~= 0 or SHOP_STEPS[step] == nil then
			return
		end
		local f = funnel[player]
		if step == 1 then
			f = { session = telemetry:newSession(), last = 0 }
			funnel[player] = f
			telemetry:onboarding(player, 2)
		end
		if f == nil or step <= f.last then
			return
		end
		f.last = step
		telemetry:funnel(player, "Shop", f.session, step, SHOP_STEPS[step])
	end)

	-- Paid random items are prompted by the server, after the policy check.
	buyEgg.OnServerEvent:Connect(function(player)
		if player:GetAttribute("paidRandom") == true and live:get("shop.eggEnabled") then
			MarketplaceService:PromptProductPurchase(player, catalog.products.MysteryEgg.id)
		end
	end)

	-- Rewarded video: the reward is a developer product, granted by the receipt handler.
	watchAd.OnServerEvent:Connect(function(player)
		local ok, result = pcall(function()
			local reward = AdService:CreateAdRewardFromDevProductId(catalog.products.AdCoins.id)
			return AdService:ShowRewardedVideoAdAsync(player, reward)
		end)
		player:SetAttribute("lastAdResult", if ok then tostring(result) else "error: " .. tostring(result))
	end)

	local function joined(player)
		telemetry:onboarding(player, 1)
		player:SetAttribute("paidRandom", paidRandomAllowed(player))
		live:publish(player, PUBLIC_KEYS)
	end
	Players.PlayerAdded:Connect(joined)
	for _, player in Players:GetPlayers() do
		task.spawn(joined, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		funnel[player] = nil
		telemetry:forget(player)
		live:forget(player)
	end)
	entitlements:connect(MarketplaceService, Players)

	-- ConfigService can take seconds (about 30 s to fail in an unpublished place): never block join.
	task.spawn(function()
		live:start()
		for _, player in Players:GetPlayers() do
			live:publish(player, PUBLIC_KEYS)
		end
		live:onUpdate(function()
			for _, player in Players:GetPlayers() do
				live:publish(player, PUBLIC_KEYS)
			end
		end)
	end)

	Monetization.state = {
		catalog = catalog,
		telemetry = telemetry,
		receipts = receipts,
		purchases = purchases,
		entitlements = entitlements,
		live = live,
		funnel = funnel,
	}
	return Monetization.state
end

return Monetization
```

Test the handler directly with synthetic receipts. `MarketplaceService.ProcessReceipt` cannot be
read back, so keep the `Purchases` object and call `process`:

```lua
-- Edit data model or Lune: synthetic receipts against the real handler, with an in-memory profile.
local ServerScriptService = game:GetService("ServerScriptService")
local Kit = ServerScriptService:WaitForChild("MonKit")
local Catalog = require(Kit:WaitForChild("Catalog"))
local Purchases = require(Kit:WaitForChild("Purchases"))
local Receipts = require(Kit:WaitForChild("Receipts"))

local saved = Instance.new("BindableEvent")
local profile: any = { Data = { Coins = 0, PurchaseIds = {} }, OnAfterSave = saved.Event, failSaves = 1 }
profile.LastSavedData = table.clone(profile.Data)
function profile:IsActive()
	return true
end
function profile:Save()
	if profile.failSaves > 0 then
		profile.failSaves -= 1
		return -- a DataStore error: nothing lands
	end
	profile.LastSavedData = { Coins = profile.Data.Coins, PurchaseIds = table.clone(profile.Data.PurchaseIds) }
	task.defer(saved.Fire, saved)
end

local catalog = Catalog.new({ products = { Coins100 = { id = 1001, kind = "currency", currency = "Coins", amount = 100 } } })
local receipts = Receipts.new({
	getProfile = function()
		return profile
	end,
	handlers = catalog:handlers(),
	saveTimeout = 0.2,
	retryDelay = 0.1,
})
local purchases = Purchases.new({ receipts = receipts, catalog = catalog })
local receipt = { PurchaseId = "r1", PlayerId = 1, ProductId = 1001, CurrencySpent = 25, PlaceIdWherePurchased = 0 }
print(purchases:process(receipt), purchases:process(receipt)) -- PurchaseGranted twice
print(profile.Data.Coins, receipts.stats.granted, receipts.stats.duplicate) -- 100 1 1
```

Cases covered by the receipts suite (14 tests): first grant, same `PurchaseId` again, the same
receipt twice at once, buyer not in this server, profile loading late, buyer leaving before the
profile loads, two failed saves then a good one, saves failing until the session ends (then one
grant after rejoin), unknown product, failing grant, yielding grant, malformed receipt, receipt for
another place, rewarded video receipt (`CurrencySpent` 0, channel `AdReward`), `BindReceiptHandler`
decisions, bind once, and the official sample's nil case.

Result: Suite `receipts` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2): pass, 14
of 14 tests; a profile that loads late was waited for (151 ms), the failed-save case took 3 saves.
Run in Studio 0.743 on 2026-10-19: pass, the stack bound with BindReceiptHandler; a second module
bind errors "Purchases:bind: already bound in this server"; a second engine catch-all errors
"BindReceiptHandler: a catch-all handler is already registered for this ReceiptType"; reading
`ProcessReceipt` errors "ProcessReceipt is a callback member of MarketplaceService; you can only set
the callback value, get is not available". Run in Studio 0.743 on 2026-10-19: pass, first receipt
Enum.ReceiptDecision.Processed, Coins 100, saved copy holds the id true; same PurchaseId
Enum.ReceiptDecision.Processed, Coins 100; absent buyer Enum.ReceiptDecision.NotProcessedYet; one
failed save then Enum.ReceiptDecision.Processed after 25.2 s, Coins 200; ad reward (CurrencySpent 0,
channel AdReward) Enum.ReceiptDecision.Processed, Coins 220.

## P4. Passes, subscriptions and Plus as perks [suite entitlements, L9]

Goal: perks checked on the server at join, on the server-side prompt result and on subscription
changes; never revoked on a network error; tool perks in `Backpack` and `StarterGear`.

`Entitlements` is wired in the module above (`entitlements:connect(MarketplaceService, Players)`).
The client reads `perk_<name>` attributes:

```lua
-- LocalScript: show the VIP row as owned.
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function render()
	local owned = player:GetAttribute("perk_vip") == true
	print(if owned then "VIP: Owned" else "VIP: for sale")
end
player:GetAttributeChangedSignal("perk_vip"):Connect(render)
render()
```

Result: Suite `entitlements` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2):
pass, 5 of 5 tests. Run in Studio 0.743 on 2026-10-19: pass, pass perk granted: tool in Backpack
true and StarterGear true, `perk_vip` true; after LoadCharacterAsync the tool is back true; a second
giveTool placed 0; the VIP row reads "Owned".

## P5. Prices from the engine, on the client [suite pricetext, L10]

Goal: every price label comes from `GetProductInfoAsync` on the client, so price tests, regional
prices and Plus discounts show what each player pays. A placeholder until the answer arrives; never
a literal.

```lua
-- LocalScript: one price label.
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local PriceText = require(ReplicatedStorage:WaitForChild("MonKit"):WaitForChild("PriceText"))

local label = Instance.new("TextLabel")
label.Text = PriceText.PENDING
task.spawn(function()
	local info, err = PriceText.fetch(MarketplaceService, 1001, Enum.InfoType.Product)
	local view = PriceText.view(info)
	label.Text = if view.strike then view.text .. "  (was " .. view.strike .. ")" else view.text
	if err then
		warn("price unavailable: " .. err)
	end
end)
```

Result: Suite `pricetext` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2): pass, 4
of 4 tests. Run in Studio 0.743 on 2026-10-19: pass, unpublished, every price lookup fails, so Egg
"..." buyable false, Starter "..." buyable false, Coins100 "..." buyable false.

### Order the shop per player [suite shoprank]

`RankProductsAsync` returns the player's personalized order of up to 50 passes and products. Call it
on the client, once per session (developer-products page; client throttle 10 per minute). `ShopRank`
keeps the catalog order when the call fails and puts items the ranking leaves out after the ranked
ones [added].

```lua
-- LocalScript: order the shop rows once per session (RankProductsAsync is client only).
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ShopRank = require(ReplicatedStorage:WaitForChild("MonKit"):WaitForChild("ShopRank"))

-- The catalog order is the fallback. Replace the ids with your products and passes.
local ITEMS = {
	{ key = "Coins100", id = 1234567, infoType = Enum.InfoType.Product },
	{ key = "StarterPack", id = 2345678, infoType = Enum.InfoType.Product },
	{ key = "VIP", id = 3456789, infoType = Enum.InfoType.GamePass },
}
local order, err = ShopRank.fetch(MarketplaceService, ITEMS)
if err then
	warn("shop keeps its catalog order: " .. err)
end
for i, item in order do
	print(i, item.key) -- in the shop: rows[item.key].LayoutOrder = i
end
```

Result: Suite `shoprank` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2): pass, 5
of 5 tests. The suite tests the module logic with a faked engine answer. The block above ran in a
Studio 0.743 client on 2026-10-19 (L16, unpublished place): pass, `RankProductsAsync` answered "HTTP
request failed with status code: 400", the block warned and kept the catalog order (1 Coins100, 2
StarterPack, 3 VIP). Not yet run: a real ranked answer applied to the shop, which needs a published
game. On the server the call errors "Cannot be called from the Server." (Studio behavior record
below).

## P6. Paid random items: disclose, then gate per player [suite odds, L10, L11]

Goal: one odds table for the roll and the disclosure; percentages that sum to exactly 100% (or the
rounding disclaimer); a labeled "Details" button before purchase; the policy branch for restricted
players.

```lua
--!nonstrict
-- File: ReplicatedStorage.MonKit.EggOdds (ModuleScript)
-- One odds table for both the server roll and the client disclosure, so what players read is what
-- the server rolls. Integer weights: 700 + 250 + 49 + 1 = 1000.
local Odds = require(game:GetService("ReplicatedStorage"):WaitForChild("MonKit"):WaitForChild("Odds"))

return Odds.fromWeights({
	{ "Common Pup", 700 },
	{ "Rare Fox", 250 },
	{ "Epic Owl", 49 },
	{ "Legendary Dragon", 1 },
})
```

```lua
-- LocalScript: odds lines for the Details pop-up.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("MonKit")
local Odds = require(Shared:WaitForChild("Odds"))
local EGG = require(Shared:WaitForChild("EggOdds"))

local shown = Odds.display(EGG)
for i, line in shown.lines do
	local l = Instance.new("TextLabel")
	l.LayoutOrder = i
	l.Text = line
end
if shown.disclaimer then
	print(shown.disclaimer)
end
-- Restricted players: the direct price of one outcome at expected value, to set in Creator Hub.
print(Odds.directPrice(25, EGG[4].p)) -- 25 Robux roll, 0.1% outcome: 25000
```

The server sets `paidRandom` per player from `PolicyService` (errors count as restricted) and
prompts the egg itself, after the check (module above, `buyEgg`).

Paid-item trading is gated by the data layer, not here: scenario-roblox-data blocks a trade when
`IsPaidItemTradingAllowed` is false for either player (`Trade.paidTradingAllowed`, fails closed).

Result: Suite `odds` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2): pass, 8 of 8
tests; 100,000 seeded rolls gave Common 70.36%, Rare 24.71%, Epic 4.83%, Legendary 0.11% against 70,
25, 4.9 and 0.1. Run in Studio 0.743 on 2026-10-19: pass, "Details" button opens a pop-up with
Common Pup: 70%; Rare Fox: 25%; Epic Owl: 4.9%; Legendary Dragon: 0.1%; capture [1318, 1080] px with
no flags, pop-up region contrast 0.122 (an empty pop-up measured 0.0). Run in Studio 0.743 on
2026-10-19: pass, restricted player: egg row visible false, direct-purchase row visible true, odds
panel visible false; 4.3% of pixels changed against the allowed view.

## P7. Rewarded video [L12]

Goal: availability checked on the client when the shop opens; the ad shown by the server; the reward
is a developer product granted by the receipt handler (channel `AdReward`). Serving needs
eligibility first, including 2,000 average monthly unique visitors, so the button stays hidden at
launch ([launch-liveops.md](launch-liveops.md)).

```lua
-- LocalScript: offer the ad only when one is available.
local AdService = game:GetService("AdService")

local function adAvailable()
	local ok, result = pcall(function()
		return AdService:GetAdAvailabilityNowAsync(Enum.AdFormat.RewardedVideo)
	end)
	return ok and result.AdAvailabilityResult == Enum.AdAvailabilityResult.IsAvailable
end
print("show the Watch button:", adAvailable())
```

Result: Run in Studio 0.743 on 2026-10-19: pass, server `ShowRewardedVideoAdAsync` answered
Enum.ShowAdResult.InternalError; client availability Enum.AdAvailabilityResult.InternalError; the ad
row stays hidden; a client `PromptProductPurchase` with an id that does not exist returned without
error, the capture 3 s later shows no purchase dialog and the console has no purchase line.

## P8. Analytics: onboarding, shop funnel, economy [suite telemetry, L7]

Goal: events only from the server, after the change is saved; client-reported steps validated
(forward only, known names); limits enforced before sending.

`Telemetry` is wired in the module above: onboarding step 1 at join, step 2 on the first shop open,
shop funnel steps from a validated remote, economy events from `Purchases` once a grant is saved.
Studio prints "AnalyticsService: <Method> event fired." for each accepted server call; read it with
`Playtest.console()`.

Result: Suite `telemetry` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2): pass, 7
of 7 tests. Run in Studio 0.743 on 2026-10-19: pass, trace onboarding:1, economy:Coins,
economy:Coins, economy:Coins, onboarding:2, funnel:Shop:1, funnel:Shop:2; invalid client steps 0,
2.5, "3", 2 and 99 refused; console "event fired" lines: LogOnboardingFunnelStepEvent 2,
LogFunnelStepEvent 2, LogEconomyEvent 3, LogCustomEvent 0.

## P9. Live config and experiments [suite liveconfig, L8]

Goal: typed defaults that work when `ConfigService` is down (always the case before publishing),
refresh on `UpdateAvailable`, enrollment only where the player meets the feature, values mirrored to
the client.

```lua
-- LocalScript: read a mirrored config value.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LiveConfig = require(ReplicatedStorage:WaitForChild("MonKit"):WaitForChild("LiveConfig"))

local featured = LiveConfig.read(Players.LocalPlayer, "shop.featured", "Starter")
print("featured offer:", featured)
```

Call `live:forPlayer(player, key)` at the moment the player sees the tested feature (shop open), not
at join: the first `GetValue` on a player snapshot enrolls them.

Result: Suite `liveconfig` run in Lune 0.11 on 2026-10-19 and unchanged in Studio 0.743 (L2): pass,
6 of 6 tests. Run in Studio 0.743 on 2026-10-19: pass, the client read `cfgReady` 1 and featured
"Starter" from the defaults; ConfigService loaded false with "ConfigService: Failed to load config"
(already recorded when the test read it; a separate probe measured about 30 s before the failure).

## P10. Store art: thumbnails and icons [L14]

Goal: art that meets the size and policy rules before a person uploads it. Scenario-generated art
arrives from scenario-game-assets or scenario-image; gameplay captures come from a playtest.

```python
th = mon.thumb_from_capture("captures/arena.png", "out/thumb_1920x1080.png")   # 16:9 crop, 1920x1080
print(mon.check_art(th["out"], "thumbnail"))     # 16:9, 1920x1080, under 3 MB, bottom band
print(mon.check_art("out/icon.png", "icon"))      # square, 512x512, contrast at 150x150
print(mon.check_art("out/vip_pass.png", "pass"))  # at most 512x512, nothing outside the circle
```

Result: Run in Studio 0.743 on 2026-10-19: pass, thumbnail from a gameplay capture ok true (1.09 MB,
upscaled true, warnings 0); icon ok true, contrast at 150 px 0.217; pass icon inside the circle ok,
corner std 0.0; with corner detail 0.357 and the warning "detail outside the circle: corners are
cropped in the store"; contact sheet [1600, 832] px, read.

## P11. Plan experiments and the launch [O5]

Goal: test only what the traffic can detect; ship with flags; read dashboards on a schedule.

```python
print(mon.mde(enrolled=5000, baseline=0.02))    # payer conversion 2%, 2,500 per arm
print(mon.mde(enrolled=50000, baseline=0.02))
```

Result: Run offline on 2026-10-19 (O5): pass, 5,000 enrolled at 2% conversion: relative MDE 55.5%
(absolute 1.11 points); 50,000 enrolled: 17.5%.

## Studio behavior record [L13]

What each API answers in an unpublished place (`mon.studio_probe(pt)`, Server and Client data
models):

Run in Studio 0.743 on 2026-10-19, unpublished place:

| Call (data model)                          | Studio answer                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `server.developerProducts`                 | error: HTTP 404 (Not Found)                                                                                   |
| `server.hasRobloxSubscription`             | ok: False                                                                                                     |
| `server.logCustomEvent`                    | ok: returned                                                                                                  |
| `server.paidRandomRestricted`              | ok: False                                                                                                     |
| `server.playerSegments`                    | ok: False                                                                                                     |
| `server.priceLevel`                        | ok: 1000                                                                                                      |
| `server.productInfo_unknownProduct`        | error: MarketplaceService::getProductInfo - GetDeveloperProductInfo failed: Item not found in batch response. |
| `server.rankProducts_server`               | error: MarketplaceService:RankProductsAsync() Cannot be called from the Server.                               |
| `server.rewardedVideo`                     | ok: Enum.ShowAdResult.InternalError                                                                           |
| `server.subscriptionStatus EXP-0`          | ok: {"IsRenewing": true, "IsSubscribed": true}                                                                |
| `server.subscriptionStatus EXP-0000000001` | ok: {"IsRenewing": false, "IsSubscribed": false}                                                              |
| `server.subscriptionStatus EXP-1`          | ok: {"IsRenewing": false, "IsSubscribed": false}                                                              |
| `server.subscriptionStatus not-an-id`      | error: Invalid SubscriptionId                                                                                 |
| `server.userOwnsGamePass_unknown`          | ok: False                                                                                                     |
| `client.adAvailability`                    | ok: Enum.AdAvailabilityResult.InternalError                                                                   |
| `client.analyticsOnClient`                 | ok: returned                                                                                                  |
| `client.configOnClient`                    | error: ConfigService is only available in the game server.                                                    |
| `client.rankProducts_client`               | error: task: wait for RankProducts - Failed: HTTP request failed with status code: 400                        |
