--!strict
local Damage = require("./Damage")

return function(t: any)
	t:test("armor reduces damage", function(expect: any)
		expect(Damage.compute({ base = 20, multiplier = 1, armor = 5 })).toBe(15)
	end)
	t:test("damage is never negative", function(expect: any)
		expect(Damage.compute({ base = 1, multiplier = 1, armor = 50 })).toBe(0)
	end)
	t:test("half points round up", function(expect: any)
		expect(Damage.compute({ base = 10, multiplier = 1.25, armor = 0 })).toBe(13)
	end)
	t:test("health stays in range", function(expect: any)
		expect(Damage.clampHealth(-5, 100)).toBe(0)
		expect(Damage.clampHealth(250, 100)).toBe(100)
	end)
end
