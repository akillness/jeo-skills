--!nonstrict
-- AgentKit Stats: runtime numbers from a running data model (playtest Server or Client).
-- Scripts can read every Stats member used here (security None).
--
--   Stats.snapshot()          memory by tag, instance and physics counts, network rates,
--                             render counts (draw calls and triangles, meaningful on the Client)
--   Stats.frames(seconds)     Heartbeat frame times over a window: fps mean, p50, p95, worst ms
--   Stats.diff(a, b)          numeric differences between two snapshots (leak hunting)

local StatsKit = {}

local TAGS = {
	"Instances", "LuaHeap", "Script", "Signals", "PhysicsCollision", "BaseParts", "GraphicsMeshParts",
	"GraphicsParts", "GraphicsParticles", "GraphicsTexture", "GraphicsTerrain", "TerrainVoxels",
	"Sounds", "StreamingSounds", "Gui", "Animation", "Navigation", "GeometryCSG", "HttpCache",
}

local function round(x, n)
	local m = 10 ^ (n or 2)
	return math.floor(x * m + 0.5) / m
end

function StatsKit.snapshot()
	local S = game:GetService("Stats")
	local mem = {}
	for _, tag in ipairs(TAGS) do
		local ok, v = pcall(function()
			return S:GetMemoryUsageMbForTag(Enum.DeveloperMemoryTag[tag])
		end)
		if ok then
			mem[tag] = round(v)
		end
	end
	-- Some members exist only in one context (FrameTime is client-only): a failed read is nil, not an error.
	local function num(name, scale)
		local ok, v = pcall(function()
			return S[name]
		end)
		if not ok or type(v) ~= "number" then
			return nil
		end
		return if scale then round(v * scale) else v
	end
	return {
		context = if game:GetService("RunService"):IsServer() then "Server" else "Client",
		totalMemoryMb = round(S:GetTotalMemoryUsageMb()),
		memoryMb = mem,
		instances = num("InstanceCount"),
		primitives = num("PrimitivesCount"),
		movingPrimitives = num("MovingPrimitivesCount"),
		contacts = num("ContactsCount"),
		heartbeatMs = num("HeartbeatTime", 1000),
		physicsStepMs = num("PhysicsStepTime", 1000),
		frameMs = num("FrameTime", 1000),
		dataSendKbps = num("DataSendKbps", 1),
		dataReceiveKbps = num("DataReceiveKbps", 1),
		physicsSendKbps = num("PhysicsSendKbps", 1),
		physicsReceiveKbps = num("PhysicsReceiveKbps", 1),
		renderCpuMs = num("RenderCPUFrameTime", 1000),
		renderGpuMs = num("RenderGPUFrameTime", 1000),
		sceneDrawcalls = num("SceneDrawcallCount"),
		sceneTriangles = num("SceneTriangleCount"),
		shadowDrawcalls = num("ShadowsDrawcallCount"),
		ui2dDrawcalls = num("UI2DDrawcallCount"),
	}
end

function StatsKit.frames(seconds)
	seconds = seconds or 3
	local RunService = game:GetService("RunService")
	local dts = {}
	local conn = RunService.Heartbeat:Connect(function(dt)
		table.insert(dts, dt)
	end)
	task.wait(seconds)
	conn:Disconnect()
	if #dts == 0 then
		return { samples = 0 }
	end
	table.sort(dts)
	local sum = 0
	for _, dt in ipairs(dts) do
		sum += dt
	end
	local function pct(p)
		return dts[math.clamp(math.ceil(#dts * p), 1, #dts)]
	end
	return {
		samples = #dts,
		fpsMean = round(#dts / sum, 1),
		p50Ms = round(pct(0.5) * 1000),
		p95Ms = round(pct(0.95) * 1000),
		worstMs = round(dts[#dts] * 1000),
	}
end

function StatsKit.diff(a, b)
	local out = {}
	local function walk(x, y, prefix)
		for k, v in pairs(y) do
			local key = prefix .. tostring(k)
			if type(v) == "number" and type(x[k]) == "number" then
				local d = v - x[k]
				if d ~= 0 then
					out[key] = round(d)
				end
			elseif type(v) == "table" and type(x[k]) == "table" then
				walk(x[k], v, key .. ".")
			end
		end
	end
	walk(a, b, "")
	return out
end

return StatsKit
