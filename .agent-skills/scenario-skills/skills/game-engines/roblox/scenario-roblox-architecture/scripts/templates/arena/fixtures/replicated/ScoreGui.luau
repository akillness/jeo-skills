-- FIXTURE: the GUI that ScoreService should not know about.
local ScoreGui = {}

function ScoreGui.refresh(_score: number) end

return ScoreGui
