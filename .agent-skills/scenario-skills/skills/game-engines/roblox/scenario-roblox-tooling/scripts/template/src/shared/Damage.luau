--!strict
-- Pure game rules: no Instances, so the same spec runs under Lune and in Studio.
local Damage = {}

export type Hit = {
	base: number,
	multiplier: number,
	armor: number,
}

function Damage.compute(hit: Hit): number
	return math.max(0, math.round(hit.base * hit.multiplier - hit.armor))
end

function Damage.clampHealth(health: number, maxHealth: number): number
	return math.clamp(health, 0, maxHealth)
end

return Damage
