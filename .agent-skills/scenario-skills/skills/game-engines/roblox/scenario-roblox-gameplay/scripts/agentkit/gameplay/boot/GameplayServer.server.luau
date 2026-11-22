--!strict
-- GameplayServer: boots NPCs, melee combo and cars on the server. Installed as a Script in
-- ServerScriptService next to the GameplayKit folder (rbx_gameplay.install).
-- In Studio only, ServerStorage.GameplayHook (BindableFunction) lets an agent drive the systems
-- inside this script's module cache: an execute_luau chunk that requires a module gets its own copy.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local Kit = (script.Parent :: Instance):WaitForChild("GameplayKit")
local NpcService = require(Kit:WaitForChild("NpcService") :: ModuleScript) :: any
local Combo = require(Kit:WaitForChild("Combo") :: ModuleScript) :: any
local Hitbox = require(Kit:WaitForChild("Hitbox") :: ModuleScript) :: any
local Car = require(Kit:WaitForChild("Car") :: ModuleScript) :: any
local CarSafety = require(Kit:WaitForChild("CarSafety") :: ModuleScript) :: any

local function child(parent: Instance, class: string, name: string): Instance
	local found = parent:FindFirstChild(name)
	if found then
		return found
	end
	local made = Instance.new(class)
	made.Name = name
	made.Parent = parent
	return made
end

local remotes = child(ReplicatedStorage, "Folder", "GameplayRemotes")
local attackRemote = child(remotes, "RemoteEvent", "Attack") :: RemoteEvent

-- Melee combo -------------------------------------------------------------------------------------
local combos: { [Player]: any } = {}
local swings: { any } = {}
local requests: { number } = {} -- server arrival time of every Attack, accepted or not (Studio tests)
local debugHitboxes = RunService:IsStudio()

-- The client sends no arguments: the server picks the step and the hitbox from its own clock.
-- Argument validation and rate limits for real remotes: scenario-roblox-networking (Net.bind).
local function onAttack(player: Player)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not (char and hum and hum.Health > 0 and root and root:IsA("BasePart")) then
		return
	end
	local st = combos[player] or Combo.new()
	combos[player] = st
	local requestedAt = time()
	table.insert(requests, requestedAt)
	local ok, step, why = Combo.request(st, requestedAt)
	player:SetAttribute("ComboAccepted", st.accepted)
	player:SetAttribute("ComboRejected", st.rejected)
	if not ok then
		player:SetAttribute("ComboLastReject", why)
		return
	end
	local cfg = st.cfg.steps[step]
	char:SetAttribute("ComboStep", step)
	task.delay(cfg.hitDelay, function()
		local entry = { at = requestedAt, step = step, hits = {} :: { string }, cancelled = false }
		table.insert(swings, entry)
		if not Combo.alive(st, requestedAt) or hum.Health <= 0 then
			entry.cancelled = true
			return
		end
		local size = Vector3.new(cfg.box[1], cfg.box[2], cfg.box[3])
		local hits = Hitbox.box(Hitbox.inFront(root, cfg.reach), size, {
			exclude = { char },
			debugFor = if debugHitboxes then 0.25 else nil,
		})
		for model, targetHum in hits do
			targetHum:TakeDamage(cfg.damage)
			table.insert(entry.hits, model.Name)
			model:SetAttribute("HitsTaken", ((model:GetAttribute("HitsTaken") :: number?) or 0) + 1)
			model:SetAttribute("LastHitStep", step)
			local targetRoot = model:FindFirstChild("HumanoidRootPart")
			if cfg.knockback and targetRoot and targetRoot:IsA("BasePart") and not targetRoot.Anchored then
				local away = (targetRoot.Position - root.Position) * Vector3.new(1, 0, 1)
				if away.Magnitude > 0.01 then
					Hitbox.knockback(targetRoot, away.Unit * cfg.knockback, 0.2)
				end
			end
			-- A hit player loses its own pending swing (stun cancels hitboxes).
			local victim = Players:GetPlayerFromCharacter(model)
			if victim and combos[victim] then
				Combo.cancel(combos[victim], time(), st.cfg.stun)
			end
		end
	end)
end
attackRemote.OnServerEvent:Connect(onAttack)

Players.PlayerRemoving:Connect(function(p: Player)
	combos[p] = nil
end)

-- Cars ---------------------------------------------------------------------------------------------
local served: { [Instance]: boolean } = {}
local function serve(car: Instance)
	if served[car] or not car:IsA("Model") or not car:IsDescendantOf(workspace) then
		return
	end
	served[car] = true
	Car.serve(car)
	CarSafety.watch(car) -- loose parts follow the driver; on exit: motors released, highest exit point
end
CollectionService:GetInstanceAddedSignal("Car"):Connect(serve)
for _, car in CollectionService:GetTagged("Car") do
	serve(car)
end

-- NPCs ---------------------------------------------------------------------------------------------
NpcService.configure({ map = workspace:FindFirstChild("Map") })
NpcService.start()

-- Studio-only agent hook ---------------------------------------------------------------------------
if RunService:IsStudio() then
	local hook = child(ServerStorage, "BindableFunction", "GameplayHook") :: BindableFunction
	hook.OnInvoke = function(cmd: string, a: any, b: any): any
		if cmd == "spawn" then
			local template = ServerStorage:FindFirstChild("NpcTemplate") :: Model
			local n: number = a
			local opts = b or {}
			local center: Vector3 = opts.center or Vector3.new(0, 3, -60)
			local spacing: number = opts.spacing or 6
			local side = math.ceil(math.sqrt(n))
			for i = 0, n - 1 do
				local x = (i % side - (side - 1) / 2) * spacing
				local z = (i // side - (side - 1) / 2) * spacing
				NpcService.spawn(template, CFrame.new(center + Vector3.new(x, 0, z)), opts.brain)
				if i % 25 == 24 then
					task.wait() -- spread the spawn over frames
				end
			end
			return #NpcService.list()
		elseif cmd == "clear" then
			NpcService.clear()
			return 0
		elseif cmd == "stats" then
			return NpcService.stats()
		elseif cmd == "resetStats" then
			NpcService.resetStats()
			return true
		elseif cmd == "configure" then
			NpcService.configure(a)
			return true
		elseif cmd == "npcs" then
			local out = {}
			for _, m in NpcService.list() do
				table.insert(out, { name = m.Name, state = m:GetAttribute("State"), position = m:GetPivot().Position })
			end
			return out
		elseif cmd == "swings" then
			return swings
		elseif cmd == "resetCombat" then
			table.clear(swings)
			table.clear(combos)
			table.clear(requests)
			return true
		elseif cmd == "requests" then
			return requests
		elseif cmd == "attackAs" then
			local p = Players:FindFirstChild(a) :: Player?
			if p then
				onAttack(p) -- the same path as the remote, without the network hop
				return true
			end
			return false
		elseif cmd == "stun" then
			local p = Players:FindFirstChild(a) :: Player?
			if p and combos[p] then
				Combo.cancel(combos[p], time(), b or 0.5)
				return true
			end
			return false
		end
		error("unknown GameplayHook command " .. tostring(cmd))
	end
end
