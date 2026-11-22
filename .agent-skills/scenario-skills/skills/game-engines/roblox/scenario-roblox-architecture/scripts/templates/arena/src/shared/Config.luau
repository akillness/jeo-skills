--!strict
-- Shared, client-readable tuning. Nothing secret or server-only belongs here: clients can read it.

local Config = {
	MIN_PLAYERS = 2,
	INTERMISSION = 15,
	ROUND = 120,
	ENDING = 5,
	TICK = 0.25,
	TEAMS = { "Red", "Blue" },
	WEAPON_TAG = "Sword",
	HAZARD_TAG = "Hazard",
}

return table.freeze(Config)
