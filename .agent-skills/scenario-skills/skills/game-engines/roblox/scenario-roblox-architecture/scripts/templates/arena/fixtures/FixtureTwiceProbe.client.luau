-- FIXTURE (deliberately wrong, for ArchAudit tests): a Script with RunContext Client in
-- StarterPlayerScripts. The docs say it runs twice: the original and the PlayerScripts copy.
workspace:SetAttribute("TwiceProbeRuns", ((workspace:GetAttribute("TwiceProbeRuns") :: number?) or 0) + 1)
local paths = (workspace:GetAttribute("TwiceProbePaths") :: string?) or ""
workspace:SetAttribute("TwiceProbePaths", paths .. script:GetFullName() .. ";")
