--!nonstrict
-- Odds: paid random item tables that pass the Roblox disclosure policy (paid-random-items doc).
-- Pure Luau: runs inlined through rbx_run, as a ModuleScript, and in Lune.
--
--   local egg = Odds.fromWeights({ { "Common", 700 }, { "Rare", 250 }, { "Legendary", 50 } })
--   Odds.validate(egg)                 -> {} when every outcome is listed and the total is exactly 100%
--   Odds.display(egg)                  -> { lines = {"Common: 70%", ...}, disclaimer = nil | string }
--   Odds.boost(egg, { Legendary = 2 }) -> new table, renormalized: show it while the boost is active
--   Odds.remaining(egg, { Legendary = true }) -> unique outcomes already owned removed, renormalized
--   Odds.directPrice(10, 0.05)         -> 200 Robux: expected-value price for restricted players
--   Odds.roll(egg, Random.new())       -> outcome name (server only)
--
-- Weights are integers so the displayed percentages come from exact fractions; floating odds
-- typed by hand (0.333) rarely sum to exactly 1.

local Odds = {}

local DISCLAIMER = "Probabilities are rounded; total of displayed individual probabilities may not equal 100%."
Odds.DISCLAIMER = DISCLAIMER

local function total(entries)
	local sum = 0
	for _, e in ipairs(entries) do
		sum += e.weight
	end
	return sum
end

local function withP(entries)
	local sum = total(entries)
	local out = {}
	for _, e in ipairs(entries) do
		table.insert(out, { name = e.name, weight = e.weight, p = if sum > 0 then e.weight / sum else 0 })
	end
	return out
end

-- list: { {name, weight}, ... } or { {name = ..., weight = ...}, ... }
function Odds.fromWeights(list)
	local entries = {}
	for _, item in ipairs(list) do
		local name = item.name or item[1]
		local weight = item.weight or item[2]
		table.insert(entries, { name = name, weight = weight })
	end
	return withP(entries)
end

-- Findings as {rule, message}; an empty list means the table can be disclosed as is.
function Odds.validate(odds)
	local findings = {}
	local seen = {}
	local sumP = 0
	if #odds == 0 then
		table.insert(findings, { rule = "empty", message = "no outcomes listed" })
	end
	for _, e in ipairs(odds) do
		if type(e.name) ~= "string" or e.name == "" then
			table.insert(findings, { rule = "name", message = "outcome without a name" })
		elseif seen[e.name] then
			table.insert(findings, { rule = "duplicate", message = "outcome listed twice: " .. e.name })
		end
		seen[e.name or ""] = true
		if type(e.weight) ~= "number" or e.weight ~= e.weight or e.weight <= 0 or e.weight == math.huge then
			table.insert(findings, { rule = "weight", message = "weight must be a positive finite number: " .. tostring(e.name) })
		elseif e.weight % 1 ~= 0 then
			table.insert(findings, { rule = "fractional-weight", message = "use integer weights so the total is exact: " .. tostring(e.name) })
		end
		sumP += e.p or 0
	end
	if #odds > 0 and math.abs(sumP - 1) > 1e-9 then
		table.insert(findings, { rule = "sum", message = string.format("probabilities sum to %.12f, not exactly 1", sumP) })
	end
	return findings
end

-- Percentage text for one probability (0..1). Policy: round to four or more decimal places below
-- the first non-zero digit, plus the disclaimer. Counting from the first non-zero digit of the
-- fractional part meets every reading of that rule: 1/3 -> "33.33333%". Returns text, wasRounded.
function Odds.format(p)
	local pct = p * 100
	if pct <= 0 then
		return "0%", false
	end
	local frac = pct - math.floor(pct)
	local decimals = 0
	if frac > 1e-9 then
		decimals = math.min(12, 4 - math.floor(math.log10(frac)))
	end
	local text = string.format("%." .. decimals .. "f", pct)
	local rounded = math.abs(tonumber(text) - pct) > 1e-9
	if text:find("%.") then
		text = text:gsub("0+$", ""):gsub("%.$", "")
	end
	return text .. "%", rounded
end

function Odds.display(odds)
	local lines, anyRounded = {}, false
	for _, e in ipairs(odds) do
		local text, rounded = Odds.format(e.p)
		anyRounded = anyRounded or rounded
		table.insert(lines, e.name .. ": " .. text)
	end
	return { lines = lines, disclaimer = if anyRounded then DISCLAIMER else nil }
end

-- multipliers: { [name] = factor } applied to weights, then renormalized.
function Odds.boost(odds, multipliers)
	local entries = {}
	for _, e in ipairs(odds) do
		table.insert(entries, { name = e.name, weight = e.weight * (multipliers[e.name] or 1) })
	end
	return withP(entries)
end

-- owned: { [name] = true } for unique outcomes this player can no longer get.
function Odds.remaining(odds, owned)
	local entries = {}
	for _, e in ipairs(odds) do
		if not owned[e.name] then
			table.insert(entries, { name = e.name, weight = e.weight })
		end
	end
	return withP(entries)
end

-- Expected-value price of one outcome for players with ArePaidRandomItemsRestricted.
function Odds.directPrice(rollPrice, p)
	assert(p > 0, "Odds.directPrice: probability must be positive")
	return math.ceil(rollPrice / p - 1e-9)
end

function Odds.roll(odds, rng)
	local sum = total(odds)
	local x = rng:NextNumber() * sum
	for _, e in ipairs(odds) do
		x -= e.weight
		if x < 0 then
			return e.name
		end
	end
	return odds[#odds].name
end

return Odds
