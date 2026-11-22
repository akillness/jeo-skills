--!nocheck
-- MoveGuard.start against a fake Players service: one character, a scripted path, a manual clock.
-- Run from the repository root: lune run tests/scenario-roblox-expert/lune/moveguard_start.luau
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")

local SOURCE = "skills/game-engines/roblox/scenario-roblox-networking/scripts/agentkit/networking/MoveGuard.luau"

local function run(enforce: boolean, path: { any })
	local now, loop = 0, nil
	local root = { Position = path[1], CFrame = roblox.CFrame.new(path[1]) }
	function root:IsA()
		return true
	end
	local pivots = {}
	local char = {}
	function char:FindFirstChildOfClass()
		return { Health = 100, WalkSpeed = 16 }
	end
	function char:FindFirstChild()
		return root
	end
	function char:PivotTo(cf)
		table.insert(pivots, cf.Position)
		root.Position, root.CFrame = cf.Position, cf
	end
	local player = { Character = char }
	local players = { PlayerRemoving = { Connect = function() end } }
	function players:GetPlayers()
		return { player }
	end
	local env = {
		CFrame = roblox.CFrame,
		game = { GetService = function()
			return players
		end },
		task = {
			spawn = function(fn)
				loop = coroutine.create(fn)
			end,
			wait = function()
				coroutine.yield()
			end,
		},
		os = { clock = function()
			return now
		end },
	}
	local MoveGuard = luau.load(fs.readFile(SOURCE), { debugName = "MoveGuard", environment = env })()
	local flags = 0
	MoveGuard.start({ interval = 0.25, enforce = enforce, onFlag = function()
		flags += 1
	end })
	assert(coroutine.resume(loop)) -- runs to the first task.wait
	for _, pos in path do
		now += 0.25
		if pos then -- false: the character stays where it is, rubber-banded or not
			root.Position, root.CFrame = pos, roblox.CFrame.new(pos)
		end
		assert(coroutine.resume(loop))
	end
	return flags, pivots
end

-- One teleport of 100 studs, then standing still for 2 s.
local path = { roblox.Vector3.new(0, 3, 0), roblox.Vector3.new(100, 3, 0) }
for _ = 1, 8 do
	table.insert(path, false)
end

local failures = 0
local function expect(name: string, ok: boolean, detail: string)
	print((if ok then "ok   " else "FAIL ") .. name .. ": " .. detail)
	if not ok then
		failures += 1
	end
end

local logFlags, logPivots = run(false, path)
expect("log only flags the teleport once", logFlags == 1, `{logFlags} flags`)
expect("log only never moves the character", #logPivots == 0, `{#logPivots} pivots`)

local enfFlags, enfPivots = run(true, path)
expect("enforce flags the teleport once", enfFlags == 1, `{enfFlags} flags`)
expect("enforce rubber-bands to the start", #enfPivots == 1 and enfPivots[1].X == 0, `{#enfPivots} pivots`)

if failures > 0 then
	error(`{failures} failed`)
end
