--!nonstrict
-- MonAudit: static monetization and live-ops checks over script sources. Runs in Studio (pass
-- `game` or any folder, Edit data model) and offline in Lune (lune_mon_audit.luau). Complements
-- the lead's Audit (deprecated names such as GetProductInfo, PromptPremiumPurchase, FireCustomEvent).
--
--   local r = MonAudit.run(game)   -- { findings = {{severity, rule, path, message}}, facts, tally }
--
-- Script context: LocalScript and RunContext Client scripts are client; other Scripts are server;
-- ModuleScripts are server under ServerScriptService or ServerStorage, client under the Starter
-- containers and ReplicatedFirst, shared elsewhere (a shared module may run on both sides).
-- The service is the ancestor just below `root`; a Folder there counts by its Name, so a Folder
-- holding folders named after services can be audited like a place.

local MonAudit = {}

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function topService(inst, root)
	local a = inst
	while a.Parent and a.Parent ~= root do
		a = a.Parent
	end
	return if a.ClassName == "Folder" then a.Name else a.ClassName
end

local function context(s, root)
	if s.ClassName == "LocalScript" then
		return "client"
	end
	if s.ClassName == "Script" then
		local rc = tostring(prop(s, "RunContext", "Enum.RunContext.Legacy"))
		return if rc:find("Client") then "client" else "server"
	end
	local top = topService(s, root)
	if top == "ServerScriptService" or top == "ServerStorage" then
		return "server"
	end
	if top == "StarterPlayer" or top == "StarterGui" or top == "StarterPack" or top == "ReplicatedFirst" then
		return "client"
	end
	return "shared"
end

-- name -> Lua pattern, matched per line with comments removed.
local P = {
	receiptAssign = "%.ProcessReceipt%s*=%f[^=]",
	bindReceipt = "BindReceiptHandler%s*%(",
	promptProduct = "PromptProductPurchase%s*%(",
	promptPass = "PromptGamePassPurchase%s*%(",
	promptSub = "PromptSubscriptionPurchase%s*%(",
	promptPlus = "PromptRobloxSubscriptionPurchase%s*%(",
	promptTransfer = "PromptRobuxTransferAsync%s*%(",
	productFinished = "PromptProductPurchaseFinished",
	passFinished = "PromptGamePassPurchaseFinished",
	ownsPass = "UserOwnsGamePassAsync",
	subStatus = "GetUserSubscriptionStatusAsync",
	subChanged = "UserSubscriptionStatusChanged",
	adReward = "CreateAdRewardFromDevProductId",
	adShow = "ShowRewardedVideoAdAsync",
	adAvail = "GetAdAvailabilityNowAsync",
	analytics = ":Log%a*Event%s*%(",
	config = "GetConfig%a*Async",
	configRefresh = "UpdateAvailable",
	configSignal = "GetValueChangedSignal",
	policyRandom = "ArePaidRandomItemsRestricted",
	random = "math%.random%s*%(",
	rng = ":Next[NI][un][mt]%a*%s*%(",
	oddsRoll = "Odds%.roll",
	join = "PlayerAdded:Connect",
}

local PRICE_PATTERNS = {
	"%d+%s*[Rr]obux",
	"R%$%s*%d",
	"\\u{[Ee]002}%s*%d",
	"\238\128\130%s*%d",
}

-- { pattern, name, message }: legacy names the lead's Audit does not cover.
local DEPRECATED = {
	{ "GamePassService", "GamePassService", "GamePassService is deprecated: MarketplaceService:UserOwnsGamePassAsync" },
	{ ":ShowVideoAd%s*%(", "ShowVideoAd", "AdService:ShowVideoAd is deprecated: ShowRewardedVideoAdAsync with an AdReward" },
	{ ":FireInGameEconomyEvent%s*%(", "FireInGameEconomyEvent", "FireInGameEconomyEvent is deprecated: LogEconomyEvent" },
}

local function stringsIn(code)
	local out = {}
	for s in code:gmatch('"([^"]*)"') do
		table.insert(out, s)
	end
	for s in code:gmatch("'([^']*)'") do
		table.insert(out, s)
	end
	for s in code:gmatch("`([^`]*)`") do
		table.insert(out, s)
	end
	return out
end

-- Services a game's own scripts live in. On a DataModel only these are read, so CoreGui and plugin
-- scripts never count (Studio and Lune then see the same scripts).
local GAME_SERVICES = {
	"Workspace", "ReplicatedFirst", "ReplicatedStorage", "ServerScriptService", "ServerStorage",
	"StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams", "TextChatService", "Chat",
}

local function scriptsOf(root)
	if root.ClassName ~= "DataModel" then
		return root:GetDescendants()
	end
	local out = {}
	for _, name in ipairs(GAME_SERVICES) do
		local svc = root:FindFirstChild(name)
		if svc then
			for _, d in ipairs(svc:GetDescendants()) do
				table.insert(out, d)
			end
		end
	end
	return out
end

function MonAudit.run(root)
	local findings = {}
	local facts = { scripts = 0, unreadable = 0 }
	for k in pairs(P) do
		facts[k] = 0
	end
	local where = {} -- [fact] = { {script, ctx, line} }
	local function add(severity, rule, path, message)
		table.insert(findings, { severity = severity, rule = rule, path = path, message = message })
	end
	for _, s in ipairs(scriptsOf(root)) do
		if not s:IsA("LuaSourceContainer") then
			continue
		end
		local ok, src = pcall(function()
			return s.Source
		end)
		if not ok or type(src) ~= "string" then
			facts.unreadable += 1
			continue
		end
		facts.scripts += 1
		local ctx = context(s, root)
		local path = s:GetFullName()
		local lineNo = 0
		local joinLine = nil
		local local_ = { random = false, prompt = false }
		for line in (src .. "\n"):gmatch("(.-)\n") do
			lineNo += 1
			local code = line:gsub("%-%-.*$", "")
			if not code:find("%S") then
				continue
			end
			for name, pat in pairs(P) do
				if code:find(pat) then
					facts[name] += 1
					where[name] = where[name] or {}
					table.insert(where[name], { path = path, ctx = ctx, line = lineNo })
				end
			end
			local at = string.format("line %d: ", lineNo)
			if (code:find(P.receiptAssign) or code:find(P.bindReceipt)) and ctx ~= "server" then
				add("error", "receipt-client", path, at .. "receipt handlers belong in one server Script")
			end
			if code:find(P.analytics) and code:find("Log%a*Event") and ctx == "client" then
				add("error", "analytics-client", path, at .. "AnalyticsService events are server-only: fire a validated remote, log on the server")
			end
			if code:find(P.config) and ctx == "client" then
				add("error", "config-client", path, at .. "ConfigService is server-only: mirror values to Player attributes")
			end
			if code:find(P.adShow) and ctx == "client" then
				add("error", "ad-show-client", path, at .. "ShowRewardedVideoAdAsync runs only in a server Script")
			end
			if code:find(P.adAvail) and ctx == "server" then
				add("error", "ad-availability-server", path, at .. "GetAdAvailabilityNowAsync runs only on the client, when the menu opens")
			end
			if code:find(P.passFinished) and ctx == "client" then
				add("warn", "pass-finished-client", path, at .. "client values of PromptGamePassPurchaseFinished are not proof: handle it on the server")
			end
			if code:find(P.subStatus) and ctx == "client" then
				add("warn", "subscription-status-client", path, at .. "GetUserSubscriptionStatusAsync must run on the server")
			end
			if code:find(P.productFinished) then
				add("warn", "purchase-signal", path, at .. "PromptProductPurchaseFinished is not proof of payment: grant in the receipt handler only")
			end
			for _, str in ipairs(stringsIn(code)) do
				for _, pat in ipairs(PRICE_PATTERNS) do
					if str:find(pat) then
						add("warn", "price-literal", path, at .. "price written in code: read PriceInRobux from GetProductInfoAsync on the client")
						break
					end
				end
			end
			for _, d in ipairs(DEPRECATED) do
				if code:find(d[1]) then
					add("warn", "api:" .. d[2], path, at .. d[3])
				end
			end
			if code:find(P.join) then
				joinLine = lineNo
			end
			if joinLine and lineNo - joinLine <= 10 and (code:find(P.promptProduct) or code:find(P.promptPass) or code:find(P.promptPlus) or code:find(P.promptSub)) then
				add("info", "prompt-at-join", path, at .. "purchase prompt right after join: never an entry paywall; prompt on a player action")
			end
			if code:find(P.random) or code:find(P.rng) or code:find(P.oddsRoll) then
				local_.random = true
			end
			if code:find(P.promptProduct) or code:find("Odds%.") then
				local_.prompt = true
			end
		end
		if local_.random and local_.prompt then
			where.randomPaid = where.randomPaid or {}
			table.insert(where.randomPaid, { path = path, ctx = ctx })
		end
	end
	local function serverHas(name)
		for _, w in ipairs(where[name] or {}) do
			if w.ctx == "server" then
				return true
			end
		end
		return false
	end
	-- Whole-place rules.
	local receiptSites = facts.receiptAssign + facts.bindReceipt
	if receiptSites == 0 and (facts.promptProduct > 0 or facts.adReward > 0) then
		add("error", "receipt-missing", "", "products are prompted but nothing handles receipts: Roblox auto-acknowledges them and nothing is granted")
	end
	if facts.receiptAssign > 1 then
		add("error", "receipt-multiple", "", string.format("ProcessReceipt assigned %d times: the last assignment silently wins", facts.receiptAssign))
	end
	if (facts.passFinished > 0 or facts.promptPass > 0) and not serverHas("ownsPass") then
		add("warn", "pass-no-ownership-check", "", "no server UserOwnsGamePassAsync: passes bought on the Store tab or before joining are never granted")
	end
	if facts.subStatus > 0 and facts.subChanged == 0 then
		add("warn", "subscription-no-change-event", "", "subscription status read without Players.UserSubscriptionStatusChanged: lapses and Store-tab purchases are missed")
	end
	if facts.config > 0 and facts.configRefresh == 0 and facts.configSignal == 0 then
		add("warn", "config-no-refresh", "", "config snapshots never refresh: connect UpdateAvailable and call Refresh")
	end
	if facts.adShow > 0 and facts.adReward == 0 then
		add("error", "ad-reward-not-product", "", "rewarded video without CreateAdRewardFromDevProductId: the reward must be a developer product")
	end
	if facts.promptTransfer > 0 and facts.bindReceipt == 0 then
		add("error", "transfer-no-receipt", "", "Robux transfers prompted without BindReceiptHandler for RobuxTransferSender and RobuxTransferReceiver")
	end
	if where.randomPaid and facts.policyRandom == 0 then
		for _, w in ipairs(where.randomPaid) do
			add("warn", "random-no-policy", w.path, "random outcome next to a purchase and no ArePaidRandomItemsRestricted check anywhere")
		end
	end
	local tally = { error = 0, warn = 0, info = 0 }
	for _, f in ipairs(findings) do
		tally[f.severity] += 1
	end
	return { findings = findings, facts = facts, tally = tally }
end

-- Rule names only, sorted, for comparing two runs (Studio against Lune).
function MonAudit.rules(result)
	local out = {}
	for _, f in ipairs(result.findings) do
		table.insert(out, f.rule)
	end
	table.sort(out)
	return out
end

return MonAudit
