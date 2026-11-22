--!nonstrict
-- AgentKit SyncCheck: health of Script Sync from inside Studio (Edit data model, through rbx_run).
-- InstanceFileSyncService is PluginSecurity; when it is missing (Lune, older builds) pass
-- opts.roots and only the tree rules run.
--
--   SyncCheck.run(game)                          -- uses InstanceFileSyncService
--   SyncCheck.run(game, { roots = {game.ServerScriptService} })
--   -- {available, roots = {{path, status, scripts, others}}, findings = {{severity, rule, path, message}}, ok}
--
-- Rules from the Script Sync docs: only Script, LocalScript, ModuleScript and Folder sync; scripts
-- with attributes or tags lose them; names must be valid and unique on disk; 10,000 scripts per
-- root and 128 roots at most. Sibling names are compared case-insensitively because the default
-- macOS file system is case-insensitive [added].

local SyncCheck = {}

local MAX_SCRIPTS_PER_ROOT = 10000
local MAX_ROOTS = 128
local ILLEGAL = '[/\\:%*%?"<>|]'

local function status(service, inst)
	if not service then
		return "Unknown"
	end
	local ok, s = pcall(function()
		return service:GetStatus(inst)
	end)
	return if ok then s.Name else "Unknown"
end

local function isScript(inst)
	return inst:IsA("LuaSourceContainer")
end

local function count(t)
	local n = 0
	for _ in t do
		n += 1
	end
	return n
end

function SyncCheck.run(game, opts)
	opts = opts or {}
	local findings = {}
	local function add(severity, rule, inst, message)
		table.insert(findings, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
		})
	end

	local service
	pcall(function()
		service = game:GetService("InstanceFileSyncService")
	end)
	local roots = {}
	local available = false
	if opts.roots then
		roots = opts.roots
	elseif service then
		local ok, all = pcall(function()
			return service:GetAllInstances()
		end)
		if ok then
			available = true
			for _, inst in all do
				local s = status(service, inst)
				if s == "SyncedAsRoot" or s == "Errored" then
					table.insert(roots, inst)
				elseif s == "AncestorErrored" then
					add(
						"error",
						"sync-stopped",
						inst,
						"ancestor root errored: right-click the root > Script Sync > Resume sync"
					)
				end
			end
		end
	end

	if #roots > MAX_ROOTS then
		add("error", "too-many-roots", game, #roots .. " synced roots, Script Sync allows " .. MAX_ROOTS)
	end

	local report = {}
	for _, root in roots do
		local rootStatus = status(service, root)
		if rootStatus == "Errored" then
			add(
				"error",
				"sync-stopped",
				root,
				"root errored and stopped syncing: right-click > Script Sync > Resume sync"
			)
		end
		local scripts, others = 0, 0
		local list = root:GetDescendants()
		table.insert(list, 1, root)
		for _, d in list do
			if isScript(d) then
				scripts += 1
				local okA, attrs = pcall(function()
					return d:GetAttributes()
				end)
				local okT, tags = pcall(function()
					return d:GetTags()
				end)
				if (okA and count(attrs) > 0) or (okT and #tags > 0) then
					add(
						"error",
						"script-metadata",
						d,
						"Script Sync ignores attributes and tags on scripts: they are lost"
					)
				end
			elseif d:IsA("PackageLink") then
				add("warn", "package-link", d.Parent, "the PackageLink is not written to disk")
			elseif not d:IsA("Folder") and d ~= root then
				others += 1
				if others <= 5 then
					add(
						"warn",
						"studio-only",
						d,
						d.ClassName .. " in a synced folder is ignored by Script Sync (Studio only)"
					)
				end
			end
			if string.find(d.Name, ILLEGAL) then
				add("error", "bad-name", d, "name has a character that is invalid in file names")
			end
			local seen = {}
			for _, c in d:GetChildren() do
				if isScript(c) or c:IsA("Folder") then
					local key = string.lower(c.Name)
					if seen[key] then
						add("error", "duplicate-name", c, "two synced siblings map to the same file name")
					end
					seen[key] = true
				end
			end
		end
		if scripts > MAX_SCRIPTS_PER_ROOT then
			add(
				"error",
				"too-many-scripts",
				root,
				scripts .. " scripts, Script Sync allows " .. MAX_SCRIPTS_PER_ROOT .. " per root"
			)
		end
		table.insert(report, { path = root:GetFullName(), status = rootStatus, scripts = scripts, others = others })
	end

	local ok = true
	for _, f in findings do
		if f.severity == "error" then
			ok = false
		end
	end
	return { available = available, roots = report, findings = findings, ok = ok }
end

return SyncCheck
