--!strict
-- Weapons by tag: every Tool tagged Config.WEAPON_TAG in a character or a Backpack gets its server
-- behavior from here. The template in ServerStorage carries the tag too and is never bound.
-- Hit validation and damage belong to the combat and networking layer; Activated is only an intent.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local Binder = require(ReplicatedStorage.Shared.Binder)
local Config = require(ReplicatedStorage.Shared.Config)

local WeaponService = {}

local template: Tool
local bound = 0
local unbind: (() -> ())?

local function publish()
	if RunService:IsStudio() then
		script:SetAttribute("Bound", bound)
	end
end

local function containers(player: Player): { Instance }
	local list: { Instance } = {}
	local backpack = player:FindFirstChildOfClass("Backpack")
	if backpack then
		table.insert(list, backpack)
	end
	if player.Character then
		table.insert(list, player.Character)
	end
	return list
end

local function hasWeapon(player: Player): boolean
	for _, container in containers(player) do
		for _, item in container:GetChildren() do
			if item:HasTag(Config.WEAPON_TAG) then
				return true
			end
		end
	end
	return false
end

function WeaponService.Init(_self: any)
	local tools = ServerStorage:FindFirstChild("Tools")
	local found = tools and tools:FindFirstChild("Sword")
	assert(found and found:IsA("Tool"), "ServerStorage.Tools.Sword (Tool) is missing")
	template = found
end

local function setup(tool: Instance)
	bound += 1
	publish()
	local swing = (tool :: Tool).Activated:Connect(function()
		tool:SetAttribute("Swings", ((tool:GetAttribute("Swings") :: number?) or 0) + 1)
	end)
	local cleanup: { any } = {
		swing,
		function()
			bound -= 1
			publish()
		end,
	}
	return cleanup
end

function WeaponService.Start(self: any, registry: { [string]: any })
	local rounds = registry.RoundService
	unbind = Binder.bind(Config.WEAPON_TAG, setup, { ancestors = { workspace, Players } })
	publish()
	rounds.StateChanged:Connect(function(state: string)
		if state == "Round" then
			self:GiveAll()
		elseif state == "Lobby" then
			self:TakeAll()
		end
	end)
	-- A respawn empties the Backpack, and a late joiner has none yet: give again during a round.
	local function onPlayer(player: Player)
		player.CharacterAdded:Connect(function()
			if rounds:GetState() == "Round" then
				self:Give(player)
			end
		end)
	end
	Players.PlayerAdded:Connect(onPlayer)
	for _, player in Players:GetPlayers() do
		onPlayer(player)
	end
end

function WeaponService.Give(_self: any, player: Player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if backpack and not hasWeapon(player) then
		template:Clone().Parent = backpack
	end
end

function WeaponService.GiveAll(self: any)
	for _, player in Players:GetPlayers() do
		self:Give(player)
	end
end

function WeaponService.TakeAll(_self: any)
	for _, player in Players:GetPlayers() do
		for _, container in containers(player) do
			for _, item in container:GetChildren() do
				if item:HasTag(Config.WEAPON_TAG) then
					item:Destroy()
				end
			end
		end
	end
end

function WeaponService.Stop(_self: any)
	if unbind then
		unbind()
		unbind = nil
	end
end

return WeaponService
