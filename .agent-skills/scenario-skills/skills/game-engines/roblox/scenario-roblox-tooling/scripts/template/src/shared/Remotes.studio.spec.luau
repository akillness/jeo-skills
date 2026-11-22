--!strict
-- Needs the engine (Instances from the built place): Lune skips "*.studio.spec.luau".
local ReplicatedStorage = game:GetService("ReplicatedStorage")

return function(t: any)
	t:test("Hit remote is built from Remotes.model.json", function(expect: any)
		local shared = ReplicatedStorage:FindFirstChild("Shared")
		local remotes = shared and shared:FindFirstChild("Remotes")
		expect(remotes).toBeTruthy()
		if remotes then
			expect(remotes:FindFirstChild("Hit")).toBeA("RemoteEvent")
		end
	end)
end
