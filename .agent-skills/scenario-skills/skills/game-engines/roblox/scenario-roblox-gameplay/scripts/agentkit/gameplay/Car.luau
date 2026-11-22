--!strict
-- Car: a constraint car built in code (Studio only). Per wheel one CylindricalConstraint (suspension
-- slide, spin, motor) plus one SpringConstraint on the same attachments (Suphi Kaner, FVOowr2DXbM).
--
--   local car = Car.build(CFrame.new(0, 4, 60))   -- Edit or server; tagged "Car"
--   Car.serve(car)                                -- server: driver ownership, speed check
--   Car.controller(car)                           -- client (RunContext Client): seat floats -> motors
--   Car.apply(car, throttle, steer, dt)           -- one drive step (either side, on the owner)

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Car = {}

export type Options = {
	name: string?,
	chassis: Vector3?, -- studs; the chassis is the low, heavy floor
	wheelRadius: number?,
	wheelWidth: number?,
	track: number?, -- studs between left and right wheel centers
	wheelbase: number?, -- studs between front and rear axles
	stiffness: number?,
	damping: number?,
	freeLength: number?,
	upper: number?, -- slide limits along the (vertical) slide axis; upper below 0 keeps the spring working
	lower: number?,
	maxSpeed: number?, -- studs/s, stored on the VehicleSeat
	torque: number?, -- MotorMaxTorque at full throttle, stored on the VehicleSeat
	idleTorque: number?, -- engine brake when the throttle is 0
	steerAngle: number?, -- degrees
	steerTime: number?, -- seconds from center to full lock
	driveSign: number?, -- +1 or -1: motor direction that moves the car along its LookVector
}

local DEFAULTS = {
	name = "Car",
	chassis = Vector3.new(6, 1, 12),
	wheelRadius = 1.4,
	wheelWidth = 1,
	track = 8,
	wheelbase = 9,
	stiffness = 3500,
	damping = 200,
	freeLength = 2.8,
	upper = -1,
	lower = -2,
	maxSpeed = 50,
	torque = 5000,
	idleTorque = 2000,
	steerAngle = 30,
	steerTime = 0.4,
	driveSign = -1,
}

local function opt(o: Options?, key: string): any
	local v = o and (o :: any)[key]
	if v == nil then
		return (DEFAULTS :: any)[key]
	end
	return v
end

local function ensureGroups()
	for _, g in { "CarBody", "CarWheel" } do
		if not workspace:IsCollisionGroupRegistered(g) then
			workspace:RegisterCollisionGroup(g)
		end
	end
	workspace:CollisionGroupSetCollidable("CarBody", "CarWheel", false)
	workspace:CollisionGroupSetCollidable("CarWheel", "CarWheel", false)
end

-- Builds the car at `cf` (car faces cf.LookVector) and parents it to `parent` (default workspace).
function Car.build(cf: CFrame, o: Options?, parent: Instance?): Model
	ensureGroups()
	local radius: number = opt(o, "wheelRadius")
	local width: number = opt(o, "wheelWidth")
	local track: number = opt(o, "track")
	local base: number = opt(o, "wheelbase")
	local model = Instance.new("Model")
	model.Name = opt(o, "name")

	local chassis = Instance.new("Part")
	chassis.Name = "Chassis"
	chassis.Size = opt(o, "chassis")
	chassis.CustomPhysicalProperties = PhysicalProperties.new(1, 0.3, 0.5)
	chassis.Color = Color3.fromRGB(200, 60, 40)
	chassis.CollisionGroup = "CarBody"
	chassis.CFrame = cf
	chassis.Parent = model
	model.PrimaryPart = chassis

	local seat = Instance.new("VehicleSeat")
	seat.Name = "DriveSeat"
	seat.Size = Vector3.new(2, 1, 2)
	seat.CFrame = cf * CFrame.new(0, chassis.Size.Y / 2 + 0.5, 1)
	seat.MaxSpeed = opt(o, "maxSpeed")
	seat.Torque = opt(o, "torque")
	seat.HeadsUpDisplay = false
	seat.CollisionGroup = "CarBody"
	seat.Parent = model
	local weld = Instance.new("WeldConstraint")
	weld.Part0, weld.Part1 = chassis, seat
	weld.Parent = seat

	-- Attachment0 on the chassis: X axis up (the slide axis), Y axis to the right (the axle after
	-- InclinationAngle 90). Attachment1 on the wheel: X along the cylinder axis (the axle).
	local slide = CFrame.fromMatrix(Vector3.zero, Vector3.yAxis, Vector3.xAxis)
	local restDrop = -(opt(o, "upper") + opt(o, "lower")) / 2
	local wheels: { { name: string, side: number, axle: number } } = {
		{ name = "FL", side = -1, axle = -1 },
		{ name = "FR", side = 1, axle = -1 },
		{ name = "RL", side = -1, axle = 1 },
		{ name = "RR", side = 1, axle = 1 },
	}
	for _, w in wheels do
		local name, side, axle = w.name, w.side, w.axle
		local hub = Vector3.new(side * track / 2, 0, axle * base / 2)
		local a0 = Instance.new("Attachment")
		a0.Name = "Hub" .. name
		a0.CFrame = CFrame.new(hub) * slide
		a0:SetAttribute("BaseCFrame", a0.CFrame)
		a0.Parent = chassis

		local wheel = Instance.new("Part")
		wheel.Name = "Wheel" .. name
		wheel.Shape = Enum.PartType.Cylinder
		wheel.Size = Vector3.new(width, radius * 2, radius * 2)
		wheel.Color = Color3.fromRGB(30, 30, 30)
		wheel.CustomPhysicalProperties = PhysicalProperties.new(2, 1.5, 0.2, 100, 1)
		wheel.CollisionGroup = "CarWheel"
		wheel.CFrame = cf * CFrame.new(hub - Vector3.new(0, restDrop, 0))
		wheel.Parent = model
		local a1 = Instance.new("Attachment")
		a1.Name = "Axle"
		a1.Parent = wheel

		local cyl = Instance.new("CylindricalConstraint")
		cyl.Name = "Suspension"
		cyl.Attachment0, cyl.Attachment1 = a0, a1
		cyl.InclinationAngle = 90
		cyl.LimitsEnabled = true
		cyl.UpperLimit = opt(o, "upper")
		cyl.LowerLimit = opt(o, "lower")
		cyl.AngularActuatorType = if axle == 1 then Enum.ActuatorType.Motor else Enum.ActuatorType.None
		cyl.MotorMaxTorque = opt(o, "idleTorque")
		cyl.AngularVelocity = 0
		cyl:SetAttribute("Drive", axle == 1)
		cyl:SetAttribute("Steer", axle == -1)
		cyl.Parent = wheel

		local spring = Instance.new("SpringConstraint")
		spring.Name = "Spring"
		spring.Attachment0, spring.Attachment1 = a0, a1
		spring.Stiffness = opt(o, "stiffness")
		spring.Damping = opt(o, "damping")
		spring.FreeLength = opt(o, "freeLength")
		spring.Parent = wheel
	end
	model:SetAttribute("DriveSign", opt(o, "driveSign"))
	model:SetAttribute("SteerAngle", opt(o, "steerAngle"))
	model:SetAttribute("SteerTime", opt(o, "steerTime"))
	model:SetAttribute("IdleTorque", opt(o, "idleTorque"))
	model:SetAttribute("WheelRadius", radius)
	CollectionService:AddTag(model, "Car")
	model.Parent = parent or workspace
	return model
end

-- One drive step on the side that simulates the car. Throttle and steer are -1..1 (seat floats).
function Car.apply(car: Model, throttle: number, steer: number, dt: number)
	local seat = car:FindFirstChild("DriveSeat") :: VehicleSeat
	local sign = (car:GetAttribute("DriveSign") :: number?) or -1
	local radius = (car:GetAttribute("WheelRadius") :: number?) or 1.4
	local idle = (car:GetAttribute("IdleTorque") :: number?) or 2000
	local maxAngle = math.rad((car:GetAttribute("SteerAngle") :: number?) or 30)
	local steerTime = (car:GetAttribute("SteerTime") :: number?) or 0.4
	-- Speed = angular velocity x radius (FVOowr2DXbM 00:44:30). MotorMaxTorque rejects negatives.
	local maxW = seat.MaxSpeed / radius
	local current = (car:GetAttribute("SteerNow") :: number?) or 0
	-- Sign checked live: SteerFloat +1 (D, stick right) must turn the car right (test B5).
	local target = steer * maxAngle
	local stepMax = maxAngle / steerTime * dt
	current += math.clamp(target - current, -stepMax, stepMax)
	car:SetAttribute("SteerNow", current)
	for _, d in car:GetDescendants() do
		if d:IsA("CylindricalConstraint") then
			if d:GetAttribute("Drive") then
				d.AngularVelocity = sign * math.sign(throttle) * maxW
				d.MotorMaxTorque = if throttle == 0 then idle else math.abs(throttle) * seat.Torque
			end
			if d:GetAttribute("Steer") then
				local a0 = d.Attachment0 :: Attachment
				local baseCf = a0:GetAttribute("BaseCFrame") :: CFrame
				a0.CFrame = baseCf * CFrame.Angles(current, 0, 0)
			end
		end
	end
end

-- Server: the driver owns the whole mechanism while seated; ownership returns to automatic after.
-- A passenger who sat first would otherwise own the car (Network ownership docs).
function Car.serve(car: Model, onFlag: ((Player, string) -> ())?): RBXScriptConnection
	local seat = car:FindFirstChild("DriveSeat") :: VehicleSeat
	local chassis = car:FindFirstChild("Chassis") :: BasePart
	local driver: Player? = nil
	local fast = 0
	local conn = seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		local hum = seat.Occupant
		local player = hum and Players:GetPlayerFromCharacter(hum.Parent :: Model)
		driver = player
		car:SetAttribute("Driver", if player then player.Name else "")
		if player then
			chassis:SetNetworkOwner(player)
		elseif chassis:CanSetNetworkOwnership() then
			chassis:SetNetworkOwnershipAuto()
		end
	end)
	-- Coarse sanity check on the owner's physics: the owner can move the car anywhere.
	task.spawn(function()
		while car.Parent do
			task.wait(0.5)
			local speed = chassis.AssemblyLinearVelocity.Magnitude
			local who = driver
			if who and speed > seat.MaxSpeed * 1.5 then
				fast += 1
				if fast >= 2 then
					chassis:SetNetworkOwner(nil)
					chassis.AssemblyLinearVelocity = Vector3.zero
					local flag = onFlag
					if flag then
						flag(who, "car-speed")
					end
					fast = 0
				end
			else
				fast = 0
			end
		end
	end)
	return conn
end

-- Client (RunContext Client script): drives the car while the local player sits in its seat.
function Car.controller(car: Model): RBXScriptConnection
	local seat = car:WaitForChild("DriveSeat") :: VehicleSeat
	local step: RBXScriptConnection? = nil
	local function refresh()
		local hum = seat.Occupant
		local mine = hum ~= nil and Players:GetPlayerFromCharacter(hum.Parent :: Model) == Players.LocalPlayer
		if mine and not step then
			step = RunService.Heartbeat:Connect(function(dt)
				-- ThrottleFloat and SteerFloat are analog on gamepad and touch; Throttle and Steer are -1, 0, 1.
				Car.apply(car, seat.ThrottleFloat, seat.SteerFloat, dt)
			end)
		elseif not mine and step then
			step:Disconnect()
			step = nil
			Car.apply(car, 0, 0, 1)
		end
	end
	refresh()
	return seat:GetPropertyChangedSignal("Occupant"):Connect(refresh)
end

return Car
