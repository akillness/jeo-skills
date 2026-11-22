--!strict
-- Hitbox: server-side spatial queries for melee and projectiles (Studio only).
--
--   local hits = Hitbox.box(root.CFrame * CFrame.new(0, 0, -3.5), Vector3.new(5, 5, 5), { exclude = { character } })
--   for model, humanoid in hits do ... end          -- one entry per character, never per limb
--   local cast = Hitbox.sphereCaster(0.5, params)   -- plugs into Projectile.step
--   Hitbox.overlapsAt(position, 0.5, params)        -- the start-overlap check casts skip

local Hitbox = {}

export type Hit = { distance: number, position: Vector3, normal: Vector3, instance: BasePart }
export type Options = {
	exclude: { Instance }?,
	include: { Instance }?,
	maxParts: number?,
	debugFor: number?, -- seconds to show the box (CanQuery false, so it never hits itself)
}

local function overlapParams(opts: Options?): OverlapParams
	local params = OverlapParams.new()
	if opts and opts.exclude then
		params.ExcludeInstances = opts.exclude
	end
	if opts and opts.include then
		params.IncludeInstances = opts.include
	end
	params.MaxParts = if opts and opts.maxParts then opts.maxParts else 64
	return params
end

-- Draws a query volume for `seconds`: Anchored, no collision, no touch, no query.
function Hitbox.debug(cf: CFrame, size: Vector3, seconds: number, color: Color3?): BasePart
	local p = Instance.new("Part")
	p.Name = "HitboxDebug"
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.CastShadow = false
	p.Transparency = 0.6
	p.Material = Enum.Material.Neon
	p.Color = color or Color3.fromRGB(255, 80, 60)
	p.Size = size
	p.CFrame = cf
	p.Parent = workspace
	task.delay(seconds, p.Destroy, p)
	return p
end

-- Characters (models with a living Humanoid) in a box. A swing overlaps several limbs of one
-- character, so results are keyed by model (Ludius, gmz904QpfxU 00:04:06).
function Hitbox.box(cf: CFrame, size: Vector3, opts: Options?): { [Model]: Humanoid }
	if opts and opts.debugFor then
		Hitbox.debug(cf, size, opts.debugFor)
	end
	local out: { [Model]: Humanoid } = {}
	for _, part in workspace:GetPartBoundsInBox(cf, size, overlapParams(opts)) do
		local model = part:FindFirstAncestorOfClass("Model")
		while model and not model:FindFirstChildOfClass("Humanoid") do
			model = model:FindFirstAncestorOfClass("Model")
		end
		if model and not out[model] then
			local hum = model:FindFirstChildOfClass("Humanoid")
			if hum and hum.Health > 0 then
				out[model] = hum
			end
		end
	end
	return out
end

-- The box in front of a root part: `reach` studs ahead along LookVector.
function Hitbox.inFront(root: BasePart, reach: number): CFrame
	return root.CFrame * CFrame.new(0, 0, -reach)
end

-- Parts overlapping a sphere at a projectile's spawn point: Spherecast, Blockcast and Shapecast
-- ignore parts the shape already intersects at its start (WorldRoot reference; veraktt GtqFcyFgIXQ 00:19:33).
function Hitbox.overlapsAt(position: Vector3, radius: number, params: OverlapParams?): { BasePart }
	return workspace:GetPartBoundsInRadius(position, radius, params or OverlapParams.new())
end

-- Pushes a character with a short LinearVelocity. A standing Humanoid cancels a one-shot impulse
-- (live: 45 studs/s via ApplyImpulse moved a dummy 1.2 studs). Server-created; the owner simulates it.
function Hitbox.knockback(root: BasePart, velocity: Vector3, seconds: number): LinearVelocity
	local att = Instance.new("Attachment")
	att.Name = "KnockbackAttachment"
	att.Parent = root
	local lv = Instance.new("LinearVelocity")
	lv.Name = "Knockback"
	lv.Attachment0 = att
	lv.RelativeTo = Enum.ActuatorRelativeTo.World
	lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	lv.VectorVelocity = velocity
	lv.MaxForce = root.AssemblyMass * workspace.Gravity * 20
	lv.Parent = root
	task.delay(seconds, function()
		lv:Destroy()
		att:Destroy()
	end)
	return lv
end

-- A Projectile cast function backed by workspace:Spherecast (max 1,024 studs per call).
function Hitbox.sphereCaster(radius: number, params: RaycastParams?): (Vector3, Vector3) -> Hit?
	return function(from: Vector3, disp: Vector3): Hit?
		local r = workspace:Spherecast(from, radius, disp, params)
		if r then
			return { distance = r.Distance, position = r.Position, normal = r.Normal, instance = r.Instance }
		end
		return nil
	end
end

-- A Projectile cast function backed by workspace:Raycast (max 15,000 studs per call).
function Hitbox.rayCaster(params: RaycastParams?): (Vector3, Vector3) -> Hit?
	return function(from: Vector3, disp: Vector3): Hit?
		local r = workspace:Raycast(from, disp, params)
		if r then
			return { distance = r.Distance, position = r.Position, normal = r.Normal, instance = r.Instance }
		end
		return nil
	end
end

return Hitbox
