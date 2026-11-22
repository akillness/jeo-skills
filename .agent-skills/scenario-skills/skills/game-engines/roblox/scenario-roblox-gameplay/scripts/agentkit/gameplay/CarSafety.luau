--!strict
-- CarSafety: what happens when the driver leaves a Car (server).
--
--   CarSafety.watch(car)   -- next to Car.serve(car): loose parts follow the driver, motors are
--                          -- released on exit, the character leaves through the highest exit point
-- exitPoint and release touch no engine service, so Lune tests them.

local Players = game:GetService("Players")

local CarSafety = {}

-- Exit points in seat space, one each side (Suphi Kaner uses X -6 and +6, FVOowr2DXbM 01:00:05).
CarSafety.EXITS = { Vector3.new(-5, 1, 0), Vector3.new(5, 1, 0) }

-- The highest exit by world height: a car on its side or roof must not drop the player under the
-- map (Suphi Kaner, FVOowr2DXbM 01:02:23, 01:04:02).
function CarSafety.exitPoint(seatCFrame: CFrame, offsets: { Vector3 }?): Vector3
	local best: Vector3? = nil
	local list: { Vector3 } = offsets or CarSafety.EXITS
	for _, offset in list do
		local p = seatCFrame * offset
		if best == nil or p.Y > best.Y then
			best = p
		end
	end
	assert(best, "CarSafety.exitPoint needs at least one offset")
	return best
end

-- Drive motors to the idle brake, steering centered. Each simulating machine uses its own copy of
-- the motor values, so the car must stop whoever owns it after the driver leaves.
function CarSafety.release(car: Instance)
	local idle = (car:GetAttribute("IdleTorque") :: number?) or 2000
	for _, d in car:GetDescendants() do
		if d:IsA("CylindricalConstraint") then
			if d:GetAttribute("Drive") then
				d.AngularVelocity = 0
				d.MotorMaxTorque = idle
			end
			local a0 = d.Attachment0
			local base = if a0 then a0:GetAttribute("BaseCFrame") else nil
			if d:GetAttribute("Steer") and a0 and typeof(base) == "CFrame" then
				a0.CFrame = base
			end
		end
	end
	car:SetAttribute("SteerNow", 0)
end

-- Every unanchored part of the car to one owner, loose parts included: the chassis call covers its
-- mechanism, not parts outside it (Network ownership docs, Setting ownership). nil = automatic.
function CarSafety.setOwner(car: Instance, player: Player?)
	for _, d in car:GetDescendants() do
		if d:IsA("BasePart") and not d.Anchored and d:CanSetNetworkOwnership() then
			if player then
				d:SetNetworkOwner(player)
			else
				d:SetNetworkOwnershipAuto()
			end
		end
	end
end

function CarSafety.watch(car: Model): RBXScriptConnection
	local seat = car:WaitForChild("DriveSeat") :: VehicleSeat
	local last: Humanoid? = nil
	return seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		local hum = seat.Occupant
		if hum then
			last = hum
			local player = Players:GetPlayerFromCharacter(hum.Parent :: Model)
			if player then
				CarSafety.setOwner(car, player)
			end
			return
		end
		CarSafety.release(car)
		CarSafety.setOwner(car, nil)
		local h = last
		last = nil
		local character = if h then h.Parent else nil
		if h and h.Health > 0 and character and character:IsA("Model") then
			local target = CarSafety.exitPoint(seat.CFrame)
			task.defer(function() -- after the seat weld is gone
				character:PivotTo(CFrame.new(target))
			end)
		end
	end)
end

return CarSafety
