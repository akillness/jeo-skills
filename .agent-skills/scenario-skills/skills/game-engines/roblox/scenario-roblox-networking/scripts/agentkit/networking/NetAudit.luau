--!nonstrict
-- NetAudit: static security review of everything a client can trigger. Builds on the lead's
-- Audit.remotes (remote with no server handler, RemoteFunction use) and Audit.scripts
-- (InvokeClient): pass Audit in to merge them; this module adds handler-level rules.
-- Runs in Studio (Edit data model, `game`) and offline in Lune on a place file.
--
--   local r = NetAudit.run(game, Audit)   -- {remotes, handlers, findings = {{severity, rule, path, message}}}
--
-- Findings are review prompts from source patterns, not proofs: confirm each with an exploit test.

local NetAudit = {}

local MAX_PER_RULE = 15

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function topService(inst)
	local a = inst
	while a.Parent and a.Parent.Parent do
		a = a.Parent
	end
	return a.ClassName
end

local function source(s)
	local ok, src = pcall(function()
		return s.Source
	end)
	if ok and type(src) == "string" then
		-- strip line comments so commented-out code is not judged
		return (src:gsub("%-%-%[(=*)%[.-%]%1%]", ""):gsub("%-%-[^\n]*", ""))
	end
	return nil
end

local perRule = {}

local function add(out, severity, rule, inst, message)
	perRule[rule] = (perRule[rule] or 0) + 1
	if perRule[rule] <= MAX_PER_RULE then
		table.insert(out, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
		})
	end
end

-- Server side: Script not on the client, or a ModuleScript in a server-only container.
local function side(s)
	local c = s.ClassName
	local top = topService(s)
	if c == "Script" then
		local rc = tostring(prop(s, "RunContext", "Legacy"))
		if rc:find("Client") then
			return "client"
		end
		return "server"
	elseif c == "LocalScript" then
		return "client"
	elseif c == "ModuleScript" then
		if top == "ServerScriptService" or top == "ServerStorage" then
			return "server"
		end
		return "shared"
	end
	return "other"
end

local VALIDATION = { "typeof%s*%(", "type%s*%(", "isfinite", "Guard%.", "[Vv]alidat", "IsDescendantOf", "Net%.bind" }
local RATE = { ":allow%s*%(", "RateLimit", "TokenBucket", "Net%.bind", "[Cc]ooldown", "os%.clock", "debounce" }
local CURRENCY = { "damage", "price", "cost", "amount", "reward", "coins", "gold", "cash", "money", "health", "walkspeed", "speed", "xp", "level" }
local SPATIAL = { "position", "cframe", "target", "victim", "hit", "origin" }

local function any(text, patterns)
	for _, p in patterns do
		if text:find(p) then
			return true
		end
	end
	return false
end

-- Body of a handler: from the match to the next handler connection, capped.
local function bodyFrom(src: string, startAt: number): string
	local nextAt = src:find("OnServer[EI][vn][ev][no][tk]", startAt + 10) or (#src + 1)
	return src:sub(startAt, math.min(nextAt - 1, startAt + 4000))
end

local function namedBody(src, fname)
	local i = src:find("function%s+" .. fname .. "%s*%(")
	if not i then
		i = src:find(fname .. "%s*=%s*function%s*%(")
	end
	if not i then
		return nil, nil
	end
	local params = src:match("%(([^)]*)%)", i)
	return bodyFrom(src, i), params
end

local function paramsAfterPlayer(params)
	local list = {}
	for p in (params or ""):gmatch("[%w_]+") do
		table.insert(list, p)
	end
	table.remove(list, 1)
	-- type annotations leak into the match ("player: Player"): drop capitalized type names
	local out = {}
	for _, p in list do
		if not p:match("^%u") and p ~= "any" and p ~= "number" and p ~= "string" and p ~= "boolean" then
			table.insert(out, p)
		end
	end
	return out
end

local function handlers(src)
	local found = {}
	for remote, params, at in src:gmatch("([%w_%.%[%]\"']+)%.OnServerEvent:Connect%(%s*function%s*%(([^)]*)%)()") do
		table.insert(found, { remote = remote, params = params, body = bodyFrom(src, at) })
	end
	for remote, params, at in src:gmatch("([%w_%.%[%]\"']+)%.OnServerInvoke%s*=%s*function%s*%(([^)]*)%)()") do
		table.insert(found, { remote = remote, params = params, body = bodyFrom(src, at) })
	end
	for remote, fname in src:gmatch("([%w_%.%[%]\"']+)%.OnServerEvent:Connect%(%s*([%a_][%w_]*)%s*%)") do
		local body, params = namedBody(src, fname)
		if body then
			table.insert(found, { remote = remote, params = params, body = body })
		end
	end
	for remote, fname in src:gmatch("([%w_%.%[%]\"']+)%.OnServerInvoke%s*=%s*([%a_][%w_]*)%s*\n") do
		local body, params = namedBody(src, fname)
		if body then
			table.insert(found, { remote = remote, params = params, body = body })
		end
	end
	return found
end

function NetAudit.run(root, Audit)
	local out = {}
	perRule = {}
	local remotes, scripts = {}, {}
	local interactive = 0
	for _, d in root:GetDescendants() do
		local c = d.ClassName
		if c == "RemoteEvent" or c == "UnreliableRemoteEvent" or c == "RemoteFunction" then
			table.insert(remotes, d)
			local top = topService(d)
			if top == "ServerStorage" or top == "ServerScriptService" then
				add(out, "warn", "remote-unreachable", d, "remote in a server-only container: clients cannot see it")
			end
		elseif d:IsA("LuaSourceContainer") then
			local src = source(d)
			if src then
				table.insert(scripts, { inst = d, src = src, side = side(d) })
			end
		elseif c == "ProximityPrompt" or c == "ClickDetector" or c == "DragDetector" then
			interactive += 1
			local p = d.Parent
			while p and not p:IsA("BasePart") and p ~= root do
				p = p.Parent
			end
			if p and p:IsA("BasePart") and not prop(p, "Anchored", false) then
				add(out, "warn", "unanchored-interactive", d, "interactive object on an unanchored part: a nearby client can own it and drag it to itself, defeating distance checks (anchor it or SetNetworkOwner(nil))")
			end
		end
	end

	local hcount, wrapped, honeypot = 0, 0, false
	local serverText = {}
	for _, s in scripts do
		local src = s.src
		if src:find("[Hh]oneypot") then
			honeypot = true
		end
		if s.side == "server" then
			table.insert(serverText, src)
			for _ in src:gmatch("Net%.bind%s*%(") do
				wrapped += 1
			end
			for _, h in handlers(src) do
				hcount += 1
				local extra = paramsAfterPlayer(h.params)
				local where = s.inst
				if #extra > 0 and not any(h.body, VALIDATION) then
					add(out, "warn", "handler-unvalidated", where, string.format("%s handler uses client arguments (%s) with no type or range check", h.remote, table.concat(extra, ", ")))
				end
				if (h.body:find("\"number\"") and not h.body:find("isfinite")) and not h.body:find("([%w_]+)%s*~=%s*%1[^%w_]") then
					add(out, "warn", "nan-unsafe", where, h.remote .. " handler checks for numbers without math.isfinite: NaN and inf pass typeof and every range check")
				end
				for _, p in extra do
					local lower = p:lower()
					for _, w in CURRENCY do
						if lower == w or lower:find(w, 1, true) then
							add(out, "warn", "trusted-value", where, string.format("%s takes client-supplied '%s': compute it on the server from its own tables", h.remote, p))
							break
						end
					end
					for _, w in SPATIAL do
						if lower:find(w, 1, true) then
							add(out, "info", "spatial-claim", where, string.format("%s takes client-supplied '%s': check it against server positions with latency tolerance (HitCheck)", h.remote, p))
							break
						end
					end
				end
				if h.body:find(":Kick%s*%(") or h.body:find("BanAsync") then
					add(out, "info", "instant-enforcement", where, h.remote .. " handler kicks or bans directly: score signals and delay visible consequences")
				end
			end
			if src:find("OnServer[EI]") and not any(src, RATE) then
				add(out, "warn", "no-rate-limit", s.inst, "remote handlers with no server-side rate limit (token bucket keyed by UserId)")
			end
			if src:find("PromptProductPurchaseFinished") then
				add(out, "warn", "purchase-signal", s.inst, "PromptProductPurchaseFinished is not proof of payment: grant in MarketplaceService.ProcessReceipt only")
			end
			if (src:find("%.MouseClick:Connect") or src:find("%.Triggered:Connect")) and not (src:find("Magnitude") or src:find("DistanceFromCharacter")) then
				add(out, "warn", "interaction-unchecked", s.inst, "ClickDetector or ProximityPrompt handler with no server distance check (ClickDetector has none; prompt state is client-editable)")
			end
			if src:find("%.Touched:Connect") and not (src:find("Magnitude") or src:find("DistanceFromCharacter")) then
				add(out, "info", "touched-trusted", s.inst, "Touched reported for client-owned parts can be spoofed: add a server distance or state check before granting")
			end
		elseif s.side == "client" or s.side == "shared" then
			if src:find("FireServer") and (src:find("RenderStepped") or src:find("PreRender") or src:find("Heartbeat") or src:find("while%s+true")) then
				add(out, "info", "per-frame-fire", s.inst, "FireServer in a per-frame loop: send on change, throttle on the client, or use an UnreliableRemoteEvent (payload under 1000 bytes)")
			end
		end
		if src:find("%f[%w_]tick%s*%(") then
			add(out, "info", "legacy-clock", s.inst, "tick() is legacy: os.clock() for rate limits, time() inside server-authority simulation")
		end
		if src:find("FilterDescendantsInstances") or src:find("RaycastFilterType%.Blacklist") or src:find("RaycastFilterType%.Whitelist") then
			add(out, "info", "raycast-filter", s.inst, "use RaycastParams.ExcludeInstances / IncludeInstances (2026); hit obstruction checks use static geometry only")
		end
	end

	if #remotes > 0 and not honeypot then
		add(out, "info", "no-honeypot", root, "no honeypot remote: one decoy remote nobody legitimate fires gives a high-confidence signal")
	end

	-- Merge the lead's remote and InvokeClient rules instead of re-implementing them.
	if Audit then
		for _, f in Audit.remotes(root).findings do
			table.insert(out, f)
		end
		for _, f in Audit.scripts(root).findings do
			if f.rule == "invoke-client" then
				table.insert(out, f)
			end
		end
	end

	local list, tally = {}, { error = 0, warn = 0, info = 0 }
	for _, f in ipairs(out) do
		table.insert(list, f)
		tally[f.severity] = (tally[f.severity] or 0) + 1
	end
	for rule, n in pairs(perRule) do
		if n > MAX_PER_RULE then
			table.insert(list, { severity = "info", rule = rule, path = "", message = (n - MAX_PER_RULE) .. " more not listed" })
		end
	end
	local rank = { error = 1, warn = 2, info = 3 }
	table.sort(list, function(a, b)
		return rank[a.severity] < rank[b.severity]
	end)
	return { remotes = #remotes, handlers = hcount, wrapped = wrapped, interactive = interactive, tally = tally, findings = list }
end

return NetAudit
