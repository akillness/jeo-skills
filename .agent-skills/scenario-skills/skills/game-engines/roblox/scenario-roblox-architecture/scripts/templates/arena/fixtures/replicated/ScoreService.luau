-- FIXTURE: a state service that requires its GUI (ArchAudit service-requires-ui).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Fixtures = ReplicatedStorage:WaitForChild("Fixtures")
local ScoreGui = require(Fixtures:WaitForChild("ScoreGui"))

local ScoreService = { score = 0 }

function ScoreService.add(n: number)
	ScoreService.score += n
	ScoreGui.refresh(ScoreService.score)
end

return ScoreService
