--!nonstrict
-- Entitlements: passes, experience subscriptions and Roblox Plus as per-player perks, checked on
-- the server and mirrored to `perk_<name>` attributes for the client UI.
--
--   local ent = Entitlements.new({
--       passes = catalog.passes, subscriptions = catalog.subscriptions,
--       owns = function(userId, passId) return MarketplaceService:UserOwnsGamePassAsync(userId, passId) end,
--       subStatus = function(player, subId) return MarketplaceService:GetUserSubscriptionStatusAsync(player, subId) end,
--       onChanged = function(player, perk, active) ... end,     -- grant or remove the benefit
--   })
--   ent:connect(MarketplaceService, Players)  -- PlayerAdded, pass prompt closed, subscription changed, Plus
--   ent:has(player, "vip")
--   Entitlements.giveTool(player, toolTemplate)  -- Backpack and StarterGear, once
--
-- Rules: a pass check that errors keeps the previous state (never revoke a paid pass on a network
-- error); a subscription that reports IsSubscribed false is revoked; checks run in parallel so
-- UserOwnsGamePassAsync batches them.

local Entitlements = {}
Entitlements.__index = Entitlements

function Entitlements.new(opts: any): any
	local self = setmetatable({}, Entitlements)
	self.passes = opts.passes or {}
	self.subscriptions = opts.subscriptions or {}
	self.owns = opts.owns
	self.subStatus = opts.subStatus
	self.onChanged = opts.onChanged or function() end
	self.retries = opts.retries or 3
	self.retryDelay = opts.retryDelay or 1
	self.task = opts.task or task -- Lune: pass require("@lune/task")
	self.state = {} -- [player] = { [perk] = true | false }
	self.stats = { checks = 0, errors = 0, changes = 0 }
	return self
end

function Entitlements:_retry(fn)
	local lastErr
	for attempt = 1, self.retries do
		local ok, v = pcall(fn)
		if ok then
			return true, v
		end
		lastErr = v
		self.stats.errors += 1
		if attempt < self.retries then
			self.task.wait(self.retryDelay * attempt)
		end
	end
	return false, lastErr
end

function Entitlements:_set(player, perk, active)
	local st = self.state[player]
	if st == nil then
		st = {}
		self.state[player] = st
	end
	if st[perk] == active then
		return
	end
	st[perk] = active
	self.stats.changes += 1
	pcall(function()
		player:SetAttribute("perk_" .. perk, active)
	end)
	self.onChanged(player, perk, active)
end

function Entitlements:has(player, perk)
	local st = self.state[player]
	return st ~= nil and st[perk] == true
end

function Entitlements:checkPass(player, def)
	self.stats.checks += 1
	local ok, owned = self:_retry(function()
		return self.owns(player.UserId, def.id)
	end)
	if ok then
		self:_set(player, def.perk, owned == true)
	end
	return ok, owned
end

function Entitlements:checkSubscription(player, def)
	self.stats.checks += 1
	local ok, status = self:_retry(function()
		return self.subStatus(player, def.id)
	end)
	if ok and type(status) == "table" then
		self:_set(player, def.perk, status.IsSubscribed == true)
	end
	return ok, status
end

-- All passes and subscriptions in parallel; returns when every check has finished.
function Entitlements:refresh(player)
	local pending = 0
	local function run(fn, def)
		pending += 1
		self.task.spawn(function()
			fn(self, player, def)
			pending -= 1
		end)
	end
	for _, def in pairs(self.passes) do
		run(Entitlements.checkPass, def)
	end
	for _, def in pairs(self.subscriptions) do
		run(Entitlements.checkSubscription, def)
	end
	while pending > 0 do
		self.task.wait()
	end
	local ok, plus = pcall(function()
		return player.HasRobloxSubscription
	end)
	if ok and plus ~= nil then
		self:_set(player, "plus", plus == true)
	end
end

-- Server-side PromptGamePassPurchaseFinished: wasPurchased is final on the server (reference).
function Entitlements:onPassPrompt(player, passId, wasPurchased)
	for _, def in pairs(self.passes) do
		if def.id == passId and wasPurchased then
			self:_set(player, def.perk, true)
		end
	end
end

function Entitlements:onSubscriptionChanged(player, subId)
	for _, def in pairs(self.subscriptions) do
		if def.id == subId then
			self:checkSubscription(player, def)
		end
	end
end

function Entitlements:forget(player)
	self.state[player] = nil
end

function Entitlements:connect(marketplace, players)
	local conns = {}
	local function added(player)
		self:refresh(player)
		table.insert(conns, player:GetPropertyChangedSignal("HasRobloxSubscription"):Connect(function()
			self:_set(player, "plus", player.HasRobloxSubscription == true)
		end))
	end
	table.insert(conns, players.PlayerAdded:Connect(added))
	for _, p in ipairs(players:GetPlayers()) do
		self.task.spawn(added, p)
	end
	table.insert(conns, players.PlayerRemoving:Connect(function(p)
		self:forget(p)
	end))
	table.insert(conns, marketplace.PromptGamePassPurchaseFinished:Connect(function(p, id, bought)
		self:onPassPrompt(p, id, bought)
	end))
	table.insert(conns, players.UserSubscriptionStatusChanged:Connect(function(p, subId)
		self:onSubscriptionChanged(p, subId)
	end))
	self.connections = conns
	return conns
end

-- Tool perks survive respawn only when StarterGear holds a copy too.
function Entitlements.giveTool(player, template)
	local placed = 0
	for _, containerName in ipairs({ "Backpack", "StarterGear" }) do
		local container = player:FindFirstChild(containerName)
		local equipped = containerName == "Backpack" and player.Character and player.Character:FindFirstChild(template.Name)
		if container and not container:FindFirstChild(template.Name) and not equipped then
			template:Clone().Parent = container
			placed += 1
		end
	end
	return placed
end

return Entitlements
