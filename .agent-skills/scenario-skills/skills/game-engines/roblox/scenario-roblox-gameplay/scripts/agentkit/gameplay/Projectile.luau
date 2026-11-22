--!strict
-- Projectile: swept-cast projectile stepping. Pure: the caller injects `cast(from, displacement)`,
-- so the math runs in Lune and the same code runs in Studio with Hitbox.sphereCaster.
--
--   local p = Projectile.new(origin, direction * speed, { gravity = Vector3.new(0, -50, 0) })
--   local hit = Projectile.step(p, dt, cast)   -- sweeps the whole step BEFORE moving
--
-- Uses only arithmetic, .Magnitude and .Unit on the vectors it is given (no Vector3 global).

local Projectile = {}

export type Hit = { distance: number, position: any, normal: any?, instance: any? }
export type Cast = (from: any, displacement: any) -> Hit?
export type Options = { gravity: any?, maxDistance: number?, lifetime: number? }
export type State = {
	position: any,
	velocity: any,
	gravity: any,
	maxDistance: number,
	lifetime: number,
	traveled: number,
	age: number,
	alive: boolean,
	steps: number,
	hit: Hit?,
	reason: string?,
}

function Projectile.new(origin: any, velocity: any, opts: Options?): State
	local o: Options = opts or {}
	return {
		position = origin,
		velocity = velocity,
		gravity = o.gravity or velocity * 0, -- zero vector of the caller's type
		maxDistance = o.maxDistance or 1000,
		lifetime = o.lifetime or 5,
		traveled = 0,
		age = 0,
		alive = true,
		steps = 0,
		hit = nil,
		reason = nil,
	}
end

-- One step of `dt` seconds. Trapezoid displacement (average of old and new velocity) is exact under
-- constant gravity, so the path does not depend on the frame rate (BrawlDev, 0Dt-Ab8czPw 00:33:08).
-- Returns the hit, if any; on a hit the position is where the swept shape stops, not the contact point
-- (Crusherfire, EIOwGMZYidw 00:07:12).
function Projectile.step(p: State, dt: number, cast: Cast): Hit?
	if not p.alive then
		return nil
	end
	local v0 = p.velocity
	local v1 = v0 + p.gravity * dt
	local disp = (v0 + v1) * (0.5 * dt)
	local len = disp.Magnitude
	p.steps += 1
	if len > 0 then
		local hit = cast(p.position, disp)
		if hit then
			p.position = p.position + disp.Unit * hit.distance
			p.traveled += hit.distance
			p.alive = false
			p.hit = hit
			p.reason = "hit"
			return hit
		end
	end
	p.position = p.position + disp
	p.velocity = v1
	p.traveled += len
	p.age += dt
	if p.traveled >= p.maxDistance then
		p.alive = false
		p.reason = "maxDistance"
	elseif p.age >= p.lifetime then
		p.alive = false
		p.reason = "lifetime"
	end
	return nil
end

-- Steps until the projectile stops or `maxSteps` is reached. Returns the hit, if any.
function Projectile.run(p: State, dt: number, cast: Cast, maxSteps: number?): Hit?
	local limit = maxSteps or 100000
	while p.alive and p.steps < limit do
		local hit = Projectile.step(p, dt, cast)
		if hit then
			return hit
		end
	end
	return nil
end

return Projectile
