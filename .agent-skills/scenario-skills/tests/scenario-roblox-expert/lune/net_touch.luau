--!nocheck
-- Net.touch against fake Players and parts: who touched, part state, distance, MoveGuard reach, rate.
-- Run from the repository root: lune run tests/scenario-roblox-expert/lune/net_touch.luau
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")

local KIT = "skills/game-engines/roblox/scenario-roblox-networking/scripts/agentkit/networking/"
local V = roblox.Vector3.new

-- A fresh NetKit per case: Net keeps its counters in module state.
local function netkit(players)
	local storage = roblox.Instance.new("Folder")
	local parent = {}
	local env = {
		Vector3 = roblox.Vector3,
		Instance = roblox.Instance,
		script = { Parent = parent },
		require = function(m)
			return m
		end,
		task = { delay = function() end },
		game = { GetService = function(_, name)
			return if name == "Players" then players else storage
		end },
	}
	for _, m in { "Guard", "RateLimit", "Suspicion", "Net" } do
		parent[m] = luau.load(fs.readFile(KIT .. m .. ".luau"), { debugName = m, environment = env })()
	end
	parent.Net.init()
	return parent, function(k)
		return storage:FindFirstChild("NetLog"):GetAttribute(k) or 0
	end
end

local function character(rootPos, health)
	local root = { Position = rootPos }
	function root:IsA()
		return true
	end
	local char = {}
	function char:FindFirstChildOfClass()
		return { Health = health or 100, WalkSpeed = 16 }
	end
	function char:FindFirstChild()
		return root
	end
	local limb = {}
	function limb:FindFirstAncestorOfClass()
		return char
	end
	return char, limb
end

local function world(rootPos, health)
	local char, limb = character(rootPos, health)
	local player = { UserId = 1, Name = "P" }
	local players = { PlayerRemoving = { Connect = function() end } }
	function players:GetPlayerFromCharacter(c)
		return if c == char then player else nil
	end
	return players, player, limb
end

local function coin(name, pos)
	local part = { Name = name, Position = pos, CanTouch = true }
	part.Touched = { Connect = function(_, fn)
		part.touch = fn
	end }
	return part
end

local failures = 0
local function expect(name: string, ok: boolean, detail: string)
	print((if ok then "ok   " else "FAIL ") .. name .. ": " .. detail)
	if not ok then
		failures += 1
	end
end

local function take(_player, part)
	part.CanTouch = false
end

do -- two limbs touch at once: one pickup
	local players, _, limb = world(V(0, 3, 3))
	local kit, count = netkit(players)
	local c = coin("Coin1", V(0, 3, 0))
	kit.Net.touch(c, { maxDistance = 8, handler = take })
	c.touch(limb)
	c.touch(limb)
	expect("honest pickup counts once", count("ok_touch_Coin1") == 1 and count("state_touch_Coin1") == 1,
		`ok {count("ok_touch_Coin1")}, state {count("state_touch_Coin1")}`)
end

do -- root far from the part, as the server sees it
	local players, _, limb = world(V(0, 3, 50))
	local kit, count = netkit(players)
	local c = coin("Coin1", V(0, 3, 0))
	kit.Net.touch(c, { maxDistance = 8, handler = take })
	c.touch(limb)
	expect("far touch is refused", count("ok_touch_Coin1") == 0 and count("distance_touch_Coin1") == 1, `ok {count("ok_touch_Coin1")}`)
end

do -- teleported onto the coin 0.1 s after MoveGuard's last sample
	local players, player, limb = world(V(100, 3, 0))
	local kit, count = netkit(players)
	local c = coin("Coin1", V(100, 3, 0))
	local guard = { margin = 5, burst = 6, tracks = { [player] = { pos = V(0, 3, 0), at = os.clock() - 0.1 } } }
	kit.Net.touch(c, { maxDistance = 8, guard = guard, handler = take })
	c.touch(limb)
	expect("teleport race is refused", count("ok_touch_Coin1") == 0 and count("teleport_touch_Coin1") == 1,
		`ok {count("ok_touch_Coin1")}, teleport {count("teleport_touch_Coin1")}`)
	guard.tracks[player] = { pos = V(98, 3, 0), at = os.clock() - 0.25 }
	c.touch(limb)
	expect("walking in since the sample is accepted", count("ok_touch_Coin1") == 1, `ok {count("ok_touch_Coin1")}`)
end

do -- a dead character collects nothing
	local players, _, limb = world(V(0, 3, 2), 0)
	local kit, count = netkit(players)
	local c = coin("Coin1", V(0, 3, 0))
	kit.Net.touch(c, { maxDistance = 8, handler = take })
	c.touch(limb)
	expect("dead character is refused", count("ok_touch_Coin1") == 0, `ok {count("ok_touch_Coin1")}`)
end

do -- one limiter shared by every coin
	local players, _, limb = world(V(0, 3, 0))
	local kit, count = netkit(players)
	local limiter = kit.RateLimit.new(2, 0.001)
	local coins = {}
	for i = 1, 3 do
		coins[i] = coin("Coin" .. i, V(0, 3, i))
		kit.Net.touch(coins[i], { maxDistance = 8, limiter = limiter, handler = take })
		coins[i].touch(limb)
	end
	expect("shared limiter caps pickups across coins", count("ok_touch_Coin3") == 0 and count("rate_touch_Coin3") == 1,
		`ok {count("ok_touch_Coin1") + count("ok_touch_Coin2")} then rate {count("rate_touch_Coin3")}`)
end

if failures > 0 then
	error(`{failures} failed`)
end
