--!strict
-- Shop authority (Script in ServerScriptService). The server owns coins and ownership as player
-- attributes; the UI only reads them. Remotes are created here, at runtime, by the server.
-- Persistence: scenario-roblox-data. Robux purchases: scenario-roblox-monetization.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Catalog = require(ReplicatedStorage:WaitForChild("UI"):WaitForChild("Catalog")) :: any

local folder: Folder = (ReplicatedStorage:FindFirstChild("UIRemotes") :: Folder?) or Instance.new("Folder")
folder.Name = "UIRemotes"
local buy = Instance.new("RemoteEvent")
buy.Name = "BuyRequest"
buy.Parent = folder
folder.Parent = ReplicatedStorage

local byId = {}
for _, item in Catalog.items do
	byId[item.id] = item
end
local lastRequest: { [Player]: number } = {}

local function setup(player: Player)
	player:SetAttribute("Coins", 500)
	player:SetAttribute("Owned", "")
end

buy.OnServerEvent:Connect(function(player: Player, id: unknown)
	if typeof(id) ~= "string" then
		return
	end
	local item = byId[id]
	if not item then
		return
	end
	local now = os.clock()
	if lastRequest[player] and now - lastRequest[player] < 0.25 then
		return
	end
	lastRequest[player] = now
	local owned = (player:GetAttribute("Owned") or "") :: string
	if table.find(string.split(owned, ","), id) then
		return
	end
	local coins = (player:GetAttribute("Coins") or 0) :: number
	if coins < item.price then
		return
	end
	player:SetAttribute("Coins", coins - item.price)
	player:SetAttribute("Owned", if owned == "" then id else owned .. "," .. id)
end)

Players.PlayerAdded:Connect(setup)
for _, p in Players:GetPlayers() do
	setup(p)
end
Players.PlayerRemoving:Connect(function(p)
	lastRequest[p] = nil
end)
