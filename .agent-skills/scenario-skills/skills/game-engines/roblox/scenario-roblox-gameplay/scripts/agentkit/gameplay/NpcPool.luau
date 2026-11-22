--!strict
-- NpcPool: reuse NPC models across waves instead of Clone and Destroy per spawn [added].
-- One R15 NPC was about 214 instances in the bench (P5): a pool keeps that creation and the
-- replication of fresh models off the server when waves respawn.
--
--   local pool = NpcPool.new(template, ServerStorage, 120)
--   local model = NpcPool.acquire(pool)          -- then PivotTo, parent, SetNetworkOwner(nil)
--   NpcPool.release(pool, model)                 -- parked in storage, health and attributes reset
--
-- A Humanoid that enters the Dead state stays dead. For a pooled NPC, disable Dead
-- (humanoid:SetStateEnabled(Enum.HumanoidStateType.Dead, false)), end it in code when Health reaches
-- 0, then release it; release(pool, model, true) destroys one that did die.

local NpcPool = {}

export type Pool = {
	template: Model,
	storage: Instance,
	free: { Model },
	max: number,
	created: number,
	reused: number,
}

function NpcPool.new(template: Model, storage: Instance, max: number?): Pool
	return { template = template, storage = storage, free = {}, max = max or 200, created = 0, reused = 0 }
end

function NpcPool.acquire(pool: Pool): Model
	local model = table.remove(pool.free)
	if model then
		pool.reused += 1
		return model
	end
	pool.created += 1
	return pool.template:Clone()
end

function NpcPool.release(pool: Pool, model: Model, dead: boolean?)
	if dead or #pool.free >= pool.max then
		model:Destroy()
		return
	end
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.Health = humanoid.MaxHealth
	end
	for name in model:GetAttributes() do
		model:SetAttribute(name, nil)
	end
	model.Parent = pool.storage
	table.insert(pool.free, model)
end

return NpcPool
