--!nonstrict
-- DataAudit: static checks of the data layer in script sources. Complements AgentKit Audit
-- (deprecated APIs such as ReserveServer, OnUpdate, TeleportService:Teleport are there).
-- Runs in Studio Edit (pass `game`) and in Lune (pass a place from @lune/roblox, or a list).
--
--   DataAudit.place(game)                          -- {findings, scripts}
--   DataAudit.sources({ { path = "Main", className = "Script", source = src }, ... })
--
-- Text heuristics, not a parser: every finding names a line to read, not a proven bug.

local DataAudit = {}

local DS_METHODS = {
	GetAsync = true, SetAsync = true, UpdateAsync = true, IncrementAsync = true, RemoveAsync = true,
	GetSortedAsync = true, PublishAsync = true, SubscribeAsync = true, ListKeysAsync = true,
}

local function add(out, severity, rule, path, line, message)
	table.insert(out, { severity = severity, rule = rule, path = path .. (if line then ":" .. line else ""), message = message })
end

local function lines(src)
	local t = {}
	for l in (src .. "\n"):gmatch("([^\n]*)\n") do
		local code = l:gsub("%-%-.*$", "")
		table.insert(t, code)
	end
	return t
end

local function near(ls, i, before, after, pattern)
	for j = math.max(1, i - before), math.min(#ls, i + after) do
		if ls[j]:find(pattern) then
			return true
		end
	end
	return false
end

-- Rules over one script. `all` is the concatenated source of the place (cross-script rules).
local function scan(item, out, ctx)
	local path, class = item.path, item.className
	local ls = lines(item.source)
	local src = table.concat(ls, "\n") -- comments stripped
	local isProfileStoreItself = src:find("ProfileStore", 1, true) and src:find("SESSION_STEAL", 1, true)
	if isProfileStoreItself then
		return
	end
	local usesDS = src:find("DataStoreService", 1, true) or src:find("GetDataStore", 1, true)
	ctx.rawServices[path] = usesDS or src:find("MessagingService", 1, true) or src:find("MemoryStoreService", 1, true)
	if class == "LocalScript" or (class == "Script" and item.runContext == "Client") then
		if usesDS or src:find("MemoryStoreService", 1, true) or src:find("MessagingService", 1, true) then
			add(out, "error", "client-datastore", path, nil, "data services are server-only: move this to a server Script")
		end
	end
	for i, l in ipairs(ls) do
		local isDefinition = l:find("^%s*function ") or l:find("^%s*local function ")
		for receiver, method in l:gmatch("([%w_]+)[:%.]([%a]+Async)%s*%(") do
			-- Raw service calls only: ProfileStore and KeyQueue methods handle their own failures.
			local raw = ctx.rawServices[path] and not receiver:find("[Pp]rofile") and not receiver:find("[Qq]ueue")
			if raw and not isDefinition and DS_METHODS[method] and not near(ls, i, 3, 0, "pcall") then
				add(out, "warn", "no-pcall", path, i, method .. " outside pcall: every data call can fail")
			end
		end
		if l:find(":SetAsync%s*%(") and (l:find("[Pp]layer") or l:find("UserId")) then
			add(out, "warn", "setasync-player", path, i, "SetAsync on player data overwrites other servers' writes: UpdateAsync or ProfileStore")
		end
		if l:find("Async%s*%(.-%.Name[%s,%)%.]") or l:find("Async%s*%(.-DisplayName") then
			if l:lower():find("store") or l:find("Session") then
				add(out, "error", "key-name", path, i, "key built from a name: names change; build keys from UserId")
			end
		end
		if l:find("UpdateAsync%s*%(") then
			for j = i + 1, math.min(#ls, i + 15) do
				if ls[j]:find("task%.wait") or ls[j]:find(":WaitForChild") or ls[j]:find("Async%s*%(") then
					add(out, "error", "transform-yields", path, j, "UpdateAsync transform must not yield (it may also run several times)")
					break
				end
				if ls[j]:find("^%s*end%s*%)") then
					break
				end
			end
		end
		if l:find("ProcessReceipt%s*=") and item.runs ~= false then
			ctx.receiptSetters += 1
			table.insert(ctx.receiptPaths, path .. ":" .. i)
		end
		if l:find("%.Data%s*=%s*[^=]") and src:find("StartSessionAsync", 1, true) then
			add(out, "warn", "replace-data", path, i, "replacing profile.Data breaks the table ProfileStore saves: edit fields instead")
		end
	end
	-- Returning the decision (Enum...PurchaseGranted or a decisions table), not a fake Enum definition.
	if src:find("%.PurchaseGranted") or src:find("%[%s*[\"']PurchaseGranted") then
		if not src:find("PurchaseId", 1, true) then
			add(out, "error", "receipt-no-log", path, nil, "grants without a PurchaseId log: a retried receipt grants twice")
		end
		if not src:find("NotProcessedYet", 1, true) then
			add(out, "error", "receipt-no-retry", path, nil, "no NotProcessedYet path: a failed grant is never retried")
		end
		if src:find("SetAsync", 1, true) and not src:find("Profile", 1, true) then
			add(out, "warn", "receipt-setasync", path, nil, "receipt saved with SetAsync: concurrent servers can lose it")
		end
	end
	-- Player sessions: StartSessionAsync in a script that handles PlayerAdded.
	if src:find("StartSessionAsync", 1, true) and src:find("PlayerAdded", 1, true) then
		ctx.sessions += 1
		if not src:find("Cancel", 1, true) then
			add(out, "warn", "session-no-cancel", path, nil, "StartSessionAsync without Cancel keeps retrying after the player left")
		end
		if not src:find("AddUserId", 1, true) then
			add(out, "warn", "session-no-userid", path, nil, "no AddUserId: right-to-erasure requests cannot find this key")
		end
		if not src:find("OnSessionEnd", 1, true) then
			add(out, "warn", "session-no-end", path, nil, "no OnSessionEnd handler: a stolen session keeps playing on stale data")
		end
		if not src:find("EndSession", 1, true) then
			add(out, "error", "session-no-release", path, nil, "no EndSession on leave: the next server waits for the lock to expire")
		end
		if not src:find(":Kick%s*%(") then
			add(out, "warn", "session-no-kick", path, nil, "no Kick when the session is nil or ends: the player plays without saving")
		end
		local r, m = src:find(":Reconcile%s*%("), src:find("[Mm]igrat")
		if r and m then
			local mi = src:find(":run%s*%(") or src:find("[Mm]igrate%s*%(")
			if mi and r < mi then
				add(out, "error", "reconcile-before-migrate", path, nil, "Reconcile runs before migration: the template version hides old data")
			end
		end
	end
	if src:find("GetDataStore%s*%(") and not src:find("StartSessionAsync", 1, true) then
		if src:find("PlayerAdded", 1, true) and src:find("PlayerRemoving", 1, true) then
			add(out, "info", "no-session-lock", path, nil, "player data on raw DataStores: no session lock against duplication; consider ProfileStore")
		end
		if src:find("PlayerRemoving", 1, true) and not src:find("BindToClose", 1, true) then
			add(out, "warn", "no-bindtoclose", path, nil, "saves on PlayerRemoving only: a shutdown can drop the last save")
		end
	end
	if src:find("TeleportAsync", 1, true) then
		ctx.teleports += 1
	end
	if src:find("require%(.-ProfileService") or src:find("DataStore2") then
		add(out, "info", "legacy-wrapper", path, nil, "ProfileService and DataStore2 are superseded: ProfileStore (same author as ProfileService)")
	end
end

function DataAudit.sources(list: any): any
	local out = {}
	local all = {}
	for _, item in ipairs(list) do
		table.insert(all, item.source)
	end
	local joined = table.concat(all, "\n")
	local ctx = {
		receiptSetters = 0,
		receiptPaths = {},
		rawServices = {},
		sessions = 0,
		teleports = 0,
	}
	for _, item in ipairs(list) do
		scan(item, out, ctx)
	end
	if ctx.receiptSetters > 1 then
		add(out, "error", "receipt-multiple", table.concat(ctx.receiptPaths, ", "), nil, "ProcessReceipt set in several places: only the last assignment runs")
	end
	if ctx.teleports > 0 and not joined:find("TeleportInitFailed", 1, true) then
		add(out, "warn", "teleport-no-initfailed", "place", nil, "TeleportAsync without a TeleportInitFailed handler: late failures leave players stranded")
	end
	return { findings = out, scripts = #list }
end

-- Collect scripts from an instance tree (Studio `game`, or a Lune place).
function DataAudit.collect(root: any): any
	local list = {}
	for _, inst in ipairs(root:GetDescendants()) do
		if inst:IsA("LuaSourceContainer") then
			local ok, src = pcall(function()
				return inst.Source
			end)
			if ok and type(src) == "string" then
				local rc = nil
				pcall(function()
					rc = inst.RunContext.Name
				end)
				-- Legacy Scripts in ServerStorage or ReplicatedStorage never run (RunContext changes that).
				local path = inst:GetFullName()
				local stored = path:find("^ServerStorage%.") or path:find("^ReplicatedStorage%.")
				local runs = inst.ClassName ~= "ModuleScript" and not (stored and (rc == nil or rc == "Legacy"))
				table.insert(list, { path = path, className = inst.ClassName, source = src, runContext = rc, runs = runs })
			end
		end
	end
	return list
end

function DataAudit.place(root: any): any
	return DataAudit.sources(DataAudit.collect(root))
end

return DataAudit
