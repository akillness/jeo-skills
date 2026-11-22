--!strict
-- Typed class template. Methods use `function Class.name(self: Class, ...)`: the colon form
-- leaves `self` untyped (old solver) or loosely inferred (new solver) and lets field typos through.
-- Callers still write obj:name(). Everything the object creates is released by Destroy.
local RunService = game:GetService("RunService")

local Spinner = {}
Spinner.__index = Spinner

type Fields = {
	part: BasePart,
	speed: number,
	_connections: { RBXScriptConnection },
	_destroyed: boolean,
}
export type Spinner = typeof(setmetatable({} :: Fields, Spinner))

function Spinner.new(part: BasePart, speed: number): Spinner
	local self = setmetatable({
		part = part,
		speed = speed,
		_connections = {},
		_destroyed = false,
	}, Spinner)
	table.insert(self._connections, RunService.PreSimulation:Connect(function(dt: number)
		self:step(dt)
	end))
	table.insert(self._connections, part.Destroying:Connect(function()
		self:Destroy()
	end))
	return self
end

function Spinner.step(self: Spinner, dt: number)
	self.part.CFrame *= CFrame.Angles(0, self.speed * dt, 0)
end

function Spinner.Destroy(self: Spinner)
	if self._destroyed then
		return
	end
	self._destroyed = true
	for _, c in self._connections do
		c:Disconnect()
	end
	table.clear(self._connections)
end

return Spinner
