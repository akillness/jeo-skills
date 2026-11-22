--!strict
-- Maps: every arena lives in ServerStorage.Maps, which never replicates, so a joining player downloads
-- none of them. One clone per round goes into Workspace at Intermission (clients receive it during the
-- countdown) and is destroyed on the way back to Lobby, which also resets whatever the round broke.
-- Per-map behavior is bound by tag (Binder), so destroying the map is the whole cleanup: no list of
-- per-map connections to keep in sync. Maps rotate in name order.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local Binder = require(ReplicatedStorage.Shared.Binder)
local Config = require(ReplicatedStorage.Shared.Config)

local MapService = {}

local maps: { Model } = {}
local gameState: Configuration
local lobby: BasePart?
local current: Model?
local nextIndex = 1
local hazards = 0
local loads, unloads = 0, 0
local unbind: (() -> ())?

local function publish()
	gameState:SetAttribute("Map", if current then current.Name else "")
	if RunService:IsStudio() then
		script:SetAttribute("Hazards", hazards)
		script:SetAttribute("Loads", loads)
		script:SetAttribute("Unloads", unloads)
	end
end

function MapService.Init(_self: any)
	local folder = ServerStorage:FindFirstChild("Maps")
	assert(folder, "ServerStorage.Maps is missing")
	for _, m in folder:GetChildren() do
		if m:IsA("Model") and m:FindFirstChild("Spawns") then
			table.insert(maps, m)
		end
	end
	assert(#maps > 0, "ServerStorage.Maps has no Model with a Spawns folder")
	table.sort(maps, function(a: Model, b: Model)
		return a.Name < b.Name
	end)
	-- RoundService boots first and creates GameState when the place has none.
	local found = ReplicatedStorage:FindFirstChild("GameState")
	assert(found and found:IsA("Configuration"), "ReplicatedStorage.GameState is missing")
	gameState = found
	lobby = workspace:FindFirstChildOfClass("SpawnLocation")
end

-- A hazard part kills on touch. The template in ServerStorage carries the tag too and is never bound.
local function hazard(part: Instance)
	hazards += 1
	publish()
	local touched = (part :: BasePart).Touched:Connect(function(hit: BasePart)
		local model = hit:FindFirstAncestorOfClass("Model")
		local humanoid = model and model:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.Health = 0
		end
	end)
	local cleanup: { any } = {
		touched,
		function()
			hazards -= 1
			publish()
		end,
	}
	return cleanup
end

-- Red takes the first pad, Blue the second; players without a team take the first.
local function padFor(player: Player): BasePart?
	local spawns = current and current:FindFirstChild("Spawns")
	if not spawns then
		return nil
	end
	local pads = spawns:GetChildren()
	table.sort(pads, function(a: Instance, b: Instance)
		return a.Name < b.Name
	end)
	local i = if player.Team then table.find(Config.TEAMS, player.Team.Name) or 1 else 1
	local pad = pads[(i - 1) % #pads + 1]
	return if pad and pad:IsA("BasePart") then pad else nil
end

local function place(player: Player, target: CFrame)
	local character = player.Character
	if not character then
		return
	end
	if workspace.StreamingEnabled then
		player:RequestStreamAroundAsync(target.Position) -- yields: callers run this in its own thread
	end
	character:PivotTo(target + Vector3.new(0, 3, 0))
end

function MapService.Load(_self: any): Model
	if current then
		return current
	end
	local map = maps[nextIndex]:Clone()
	nextIndex = nextIndex % #maps + 1
	map.Parent = workspace
	current = map
	loads += 1
	publish()
	return map
end

function MapService.Unload(_self: any)
	local map = current
	if not map then
		return
	end
	current = nil -- drop the only reference first: nothing keeps the destroyed map alive
	local spawn = lobby
	for _, player in Players:GetPlayers() do
		local character = player.Character
		if spawn and character then
			character:PivotTo(spawn.CFrame + Vector3.new(0, 3, 0))
		end
	end
	map:Destroy() -- tagged parts leave the DataModel, so Binder runs every hazard cleanup
	unloads += 1
	publish()
end

function MapService.GetMap(_self: any): Model?
	return current
end

function MapService.Start(self: any, registry: { [string]: any })
	local rounds = registry.RoundService
	unbind = Binder.bind(Config.HAZARD_TAG, hazard, { ancestors = { workspace } })
	local function onState(state: string)
		if state == "Intermission" then
			self:Load()
		elseif state == "Round" then
			self:Load() -- no-op when Intermission loaded it
			for _, player in Players:GetPlayers() do
				local pad = padFor(player)
				if pad then
					task.spawn(place, player, pad.CFrame)
				end
			end
		elseif state == "Lobby" then
			self:Unload()
		end
	end
	rounds.StateChanged:Connect(onState)
	onState(rounds:GetState()) -- the loop may have moved before this Start ran
	-- A respawn during the round puts the player back on the map, not in the lobby.
	local function onPlayer(player: Player)
		player.CharacterAdded:Connect(function()
			local pad = padFor(player)
			if pad and rounds:GetState() == "Round" then
				place(player, pad.CFrame)
			end
		end)
	end
	Players.PlayerAdded:Connect(onPlayer)
	for _, player in Players:GetPlayers() do
		onPlayer(player)
	end
	publish()
end

function MapService.Stop(self: any)
	if unbind then
		unbind()
		unbind = nil
	end
	self:Unload()
end

return MapService
