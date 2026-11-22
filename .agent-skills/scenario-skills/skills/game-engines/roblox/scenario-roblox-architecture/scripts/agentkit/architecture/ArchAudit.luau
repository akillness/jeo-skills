--!nonstrict
-- ArchAudit: architecture checks of a place, from the instance tree and script sources.
-- Complements AgentKit Audit (placement that never runs, deprecated APIs, DataStore code in
-- replicated modules); rule names here do not overlap with it.
-- Studio: run through rbx_run in the Edit data model, ArchAudit.all(game).
-- Offline: lune run lune_arch_audit.luau place.rbxl (Lune knows only saved property values).
--
--   ArchAudit.all(root)    -> {counts, entries, graph = {modules, edges, unresolved}, findings, tally}
--   ArchAudit.graph(root)  -> {edges = {{from, to}}, unresolved = {{from, expr}}}
--   ArchAudit.resolve(fromInstance, expr, aliases) -> Instance?   (one require argument)
--
-- Severities: "error" (breaks at runtime), "warn" (architecture risk), "info" (worth a look).

local ArchAudit = {}

ArchAudit.LIMITS = { moduleLines = 500, entriesPerSide = 1, maxPerRule = 12 }

local SERVER_ONLY = { ServerScriptService = true, ServerStorage = true }
local CLIENT_VISIBLE = {
	ReplicatedStorage = true,
	ReplicatedFirst = true,
	Workspace = true,
	StarterPlayer = true,
	StarterGui = true,
	StarterPack = true,
	Lighting = true,
	SoundService = true,
	Teams = true,
}
local STARTER = { StarterPlayer = true, StarterGui = true, StarterPack = true }

-- Server-only APIs and secrets that a client-visible module must not hold (Audit already covers
-- DataStoreService, MessagingService and X-API-Key).
ArchAudit.SERVER_PATTERNS = {
	{ "ServerStorage", "references ServerStorage" },
	{ "ServerScriptService", "references ServerScriptService" },
	{ "MemoryStoreService", "uses MemoryStoreService" },
	{ "ProcessReceipt", "handles ProcessReceipt" },
	{ "HttpService%s*:%s*[RPG]%a*Async", "makes HTTP requests" },
	{ "[%w_]*[Ss]ecret[%w_]*%s*=", "assigns a secret" },
	{ "[%w_]*[Tt]oken%s*=%s*[\"']", "assigns a token string" },
}

local UI_NAME = { "Gui$", "GUI$", "UI$", "Hud$", "HUD$", "Menu$", "Screen$" }
local UI_FOLDER = { UI = true, Gui = true, GUI = true, Interface = true, Interfaces = true }

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function source(s)
	local ok, src = pcall(function()
		return s.Source
	end)
	return if ok and type(src) == "string" then src else nil
end

local function topService(inst)
	local a = inst
	while a.Parent and a.Parent.Parent do
		a = a.Parent
	end
	return a.ClassName
end

local function isFixture(inst)
	local a = inst
	while a do
		if string.find(a.Name, "^Fixture") then
			return true
		end
		a = a.Parent
	end
	return false
end

local function ancestorOfClass(inst, className)
	local a = inst.Parent
	while a do
		if a.ClassName == className then
			return a
		end
		a = a.Parent
	end
	return nil
end

local function runContext(s)
	return tostring(prop(s, "RunContext", "Enum.RunContext.Legacy"))
end

local function stripComments(src)
	src = string.gsub(src, "%-%-%[(=*)%[.-%]%1%]", "")
	src = string.gsub(src, "%-%-[^\n]*", "")
	return src
end

local function newOut()
	return { list = {}, byRule = {} }
end

local function add(out, severity, rule, inst, message)
	local n = (out.byRule[rule] or 0) + 1
	out.byRule[rule] = n
	if n <= ArchAudit.LIMITS.maxPerRule then
		table.insert(out.list, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
			fixture = if typeof(inst) == "Instance" then isFixture(inst) else false,
		})
	end
end

-- Where a script runs: "server", "client", "twice" (client, original plus copy), or nil.
function ArchAudit.side(s)
	if s.ClassName == "ModuleScript" or not prop(s, "Enabled", true) then
		return nil
	end
	local top = topService(s)
	if s.ClassName == "LocalScript" then
		if top == "ReplicatedFirst" or STARTER[top] or top == "Workspace" then
			return "client"
		end
		return nil
	end
	local rc = runContext(s)
	if string.find(rc, "Server") then
		return "server"
	elseif string.find(rc, "Client") then
		if SERVER_ONLY[top] then
			return nil
		end
		return if STARTER[top] then "twice" else "client"
	elseif string.find(rc, "Legacy") then
		if top == "ServerScriptService" or top == "Workspace" then
			return "server"
		end
	end
	return nil
end

-- require() resolution ------------------------------------------------------------------------

local function child(inst, name)
	if inst == nil then
		return nil
	end
	if inst.ClassName == "DataModel" then
		local svc = inst:FindFirstChildOfClass(name)
		if svc then
			return svc
		end
	end
	return inst:FindFirstChild(name)
end

-- Local aliases: `local X = <expr>` lines, in file order.
function ArchAudit.aliases(src)
	local map = {}
	for line in string.gmatch(src .. "\n", "(.-)\n") do
		local name, expr = string.match(line, "^%s*local%s+([%a_][%w_]*)%s*:?[^=]-=%s*(.-)%s*$")
		if name and expr and not string.find(expr, "^require") and not string.find(expr, "^function") then
			map[name] = expr
		end
	end
	return map
end

local function resolveString(from, path)
	local base
	local rest
	if string.sub(path, 1, 2) == "./" then
		base, rest = from.Parent, string.sub(path, 3)
	elseif string.sub(path, 1, 3) == "../" then
		base, rest = from.Parent and from.Parent.Parent, string.sub(path, 4)
	elseif string.sub(path, 1, 6) == "@self/" then
		base, rest = from, string.sub(path, 7)
	elseif string.sub(path, 1, 6) == "@game/" then
		local root = from
		while root.Parent do
			root = root.Parent
		end
		base, rest = root, string.sub(path, 7)
	else
		return nil
	end
	for part in string.gmatch(rest, "[^/]+") do
		if part == ".." then
			base = base and base.Parent
		elseif part ~= "." then
			base = child(base, part)
		end
		if base == nil then
			return nil
		end
	end
	return base
end

function ArchAudit.resolve(from, expr, aliases, depth)
	depth = depth or 0
	if depth > 8 or expr == nil then
		return nil
	end
	expr = string.gsub(expr, "%s+", "")
	local str = string.match(expr, "^[\"'](.-)[\"']$")
	if str then
		return resolveString(from, str)
	end
	local head, rest = string.match(expr, "^([%a_][%w_]*)(.*)$")
	if not head then
		return nil
	end
	local node
	if head == "script" then
		node = from
	elseif head == "game" then
		node = from
		while node.Parent do
			node = node.Parent
		end
	elseif head == "workspace" then
		local root = from
		while root.Parent do
			root = root.Parent
		end
		node = root:FindFirstChildOfClass("Workspace")
	elseif aliases and aliases[head] then
		node = ArchAudit.resolve(from, aliases[head], aliases, depth + 1)
	else
		return nil
	end
	while node and rest ~= "" do
		local name, after
		name, after = string.match(rest, "^%.([%a_][%w_]*)(.*)$")
		if name then
			node = if name == "Parent" then node.Parent else child(node, name)
		else
			name, after = string.match(rest, "^:[%a]+%([\"']([^\"']+)[\"'][^%)]*%)(.*)$")
			if name then
				node = child(node, name)
			else
				name, after = string.match(rest, "^%[[\"']([^\"']+)[\"']%](.*)$")
				if not name then
					return nil
				end
				node = child(node, name)
			end
		end
		rest = after
	end
	return node
end

-- Arguments of every require( ... ) call, balanced parentheses.
function ArchAudit.requires(src)
	local out = {}
	local i = 1
	while true do
		local s, e = string.find(src, "%f[%w_]require%s*%(", i)
		if not s then
			break
		end
		local depth, j = 1, e + 1
		while j <= #src and depth > 0 do
			local c = string.sub(src, j, j)
			if c == "(" then
				depth += 1
			elseif c == ")" then
				depth -= 1
			end
			j += 1
		end
		table.insert(out, string.sub(src, e + 1, j - 2))
		i = j
	end
	return out
end

function ArchAudit.graph(root)
	local edges, unresolved, modules = {}, {}, 0
	for _, s in root:GetDescendants() do
		if s:IsA("LuaSourceContainer") then
			if s.ClassName == "ModuleScript" then
				modules += 1
			end
			local src = source(s)
			if src then
				src = stripComments(src)
				local aliases = ArchAudit.aliases(src)
				for _, expr in ArchAudit.requires(src) do
					local target = ArchAudit.resolve(s, expr, aliases)
					if target and target.ClassName == "ModuleScript" then
						table.insert(edges, { from = s, to = target })
					else
						table.insert(unresolved, { from = s, expr = expr })
					end
				end
			end
		end
	end
	return { edges = edges, unresolved = unresolved, modules = modules }
end

local function cycles(edges)
	local adj = {}
	for _, e in edges do
		adj[e.from] = adj[e.from] or {}
		table.insert(adj[e.from], e.to)
	end
	local found, seen = {}, {}
	local state = {}
	local stack = {}
	local function visit(n)
		state[n] = 1
		table.insert(stack, n)
		for _, m in adj[n] or {} do
			if state[m] == 1 then
				local cyc = {}
				local start = table.find(stack, m)
				for k = start, #stack do
					table.insert(cyc, stack[k])
				end
				local names = {}
				for _, x in cyc do
					table.insert(names, x.Name)
				end
				table.sort(names)
				local key = table.concat(names, ">")
				if not seen[key] then
					seen[key] = true
					table.insert(found, cyc)
				end
			elseif state[m] == nil then
				visit(m)
			end
		end
		table.remove(stack)
		state[n] = 2
	end
	for n in adj do
		if state[n] == nil then
			visit(n)
		end
	end
	return found
end

local function isUi(inst)
	for _, p in UI_NAME do
		if string.find(inst.Name, p) then
			return true
		end
	end
	local a = inst.Parent
	while a do
		if UI_FOLDER[a.Name] then
			return true
		end
		a = a.Parent
	end
	return false
end

-- Checks ----------------------------------------------------------------------------------------

function ArchAudit.all(root)
	local out = newOut()
	local counts = { scripts = 0, modules = 0, lines = 0, remotes = 0, packages = 0 }
	local entries = { server = {}, client = {} }
	local bySource = {}
	local siblings = {}

	for _, d in root:GetDescendants() do
		local c = d.ClassName
		if c == "RemoteEvent" or c == "UnreliableRemoteEvent" or c == "RemoteFunction" then
			counts.remotes += 1
			add(
				out,
				"info",
				"hand-made-remote",
				d,
				"remote saved in the place: create remotes in code from one schema module (one owner, clean diffs, no name drift)"
			)
		elseif c == "PackageLink" then
			counts.packages += 1
			if prop(d, "AutoUpdate", false) == false then
				add(
					out,
					"info",
					"package-autoupdate-off",
					d.Parent or d,
					"PackageLink.AutoUpdate is off (the default): copies never receive publishes unless pinned on purpose"
				)
			end
		elseif c == "ScreenGui" then
			local starterGui = ancestorOfClass(d, "StarterGui")
			if starterGui and d.Parent ~= starterGui and prop(d, "ResetOnSpawn", true) == false then
				add(
					out,
					"warn",
					"reset-ignored-nested",
					d,
					"ResetOnSpawn false is ignored: the ScreenGui is not a direct child of StarterGui, so it is rebuilt at every respawn"
				)
			end
		elseif c == "Folder" and string.find(d.Name, "[Mm]aps$") and CLIENT_VISIBLE[topService(d)] then
			local models = 0
			for _, m in d:GetChildren() do
				if m:IsA("Model") then
					models += 1
				end
			end
			if models > 0 then
				add(
					out,
					"warn",
					"maps-replicated",
					d,
					string.format(
						"%d map model(s) in a replicated container: every client downloads them at join; keep maps in ServerStorage and clone one per round",
						models
					)
				)
			end
		end
		if not d:IsA("LuaSourceContainer") then
			continue
		end
		local top = topService(d)
		local key = (if d.Parent then d.Parent:GetFullName() else "") .. "/" .. d.Name
		siblings[key] = (siblings[key] or 0) + 1
		if siblings[key] == 2 then
			add(
				out,
				"warn",
				"sibling-name-collision",
				d,
				"two scripts with this name under one parent: script.Parent." .. d.Name .. " picks one arbitrarily"
			)
		end
		if c == "ModuleScript" then
			counts.modules += 1
		else
			counts.scripts += 1
			local side = ArchAudit.side(d)
			if side == "twice" then
				add(
					out,
					"error",
					"runs-twice",
					d,
					"Script with RunContext Client in a Starter container runs twice (original and copy): use a LocalScript there or move it to ReplicatedStorage"
				)
				table.insert(entries.client, d:GetFullName())
			elseif side == "server" or side == "client" then
				local inTool = ancestorOfClass(d, "Tool") ~= nil
				if top == "Workspace" and not inTool then
					local packaged = false
					local a = d.Parent
					while a and not packaged do
						packaged = a:FindFirstChildOfClass("PackageLink") ~= nil
						a = a.Parent
					end
					if packaged then
						add(
							out,
							"info",
							"script-in-workspace",
							d,
							"script inside a packaged Workspace model: fine for a distributable model, set RunContext explicitly"
						)
					else
						add(
							out,
							"warn",
							"script-in-workspace",
							d,
							"script inside a Workspace instance: tag the instance and bind it from one module"
						)
					end
				elseif not inTool and not (side == "client" and top == "ReplicatedFirst") then
					table.insert(entries[side], d:GetFullName())
				end
			end
			if c == "Script" and string.find(runContext(d), "Legacy") and top == "ServerScriptService" then
				add(
					out,
					"info",
					"legacy-runcontext",
					d,
					"RunContext is Legacy (the default): set Server explicitly so the script's side does not depend on its container"
				)
			end
		end

		local src = source(d)
		if not src then
			continue
		end
		local _, nl = string.gsub(src, "\n", "")
		counts.lines += nl + 1
		local code = stripComments(src)
		local trimmed = string.gsub(code, "%s+", " ")
		if #trimmed > 20 then
			bySource[trimmed] = bySource[trimmed] or {}
			table.insert(bySource[trimmed], d)
		end

		if c == "ModuleScript" and nl + 1 > ArchAudit.LIMITS.moduleLines then
			add(
				out,
				"info",
				"module-size",
				d,
				string.format(
					"%d lines: over %d usually mixes responsibilities (split by purpose)",
					nl + 1,
					ArchAudit.LIMITS.moduleLines
				)
			)
		end

		if
			CLIENT_VISIBLE[top]
			and (c == "ModuleScript" or ArchAudit.side(d) == "client" or ArchAudit.side(d) == "twice")
		then
			for _, p in ArchAudit.SERVER_PATTERNS do
				if string.find(code, p[1]) then
					add(
						out,
						"warn",
						"server-api-replicated",
						d,
						"client-visible code " .. p[2] .. ": exploiters can read it; keep it in ServerScriptService"
					)
					break
				end
			end
		end

		if string.find(code, "%f[%w_]_G%s*[%.%[]") or string.find(code, "%f[%w_]shared%s*[%.%[]") then
			add(
				out,
				"warn",
				"global-registry",
				d,
				"_G or shared used as a registry: hidden load-order dependency; require the module instead"
			)
		end

		local isClass = string.find(code, "function%s+[%w_]+%.new%s*%(") ~= nil
			and string.find(code, "[%.:]Destroy%s*%(") ~= nil
		if isClass then
			local unstored = 0
			for line in string.gmatch(code .. "\n", "(.-)\n") do
				if string.find(line, ":Connect%s*%(") or string.find(line, ":Once%s*%(") then
					local before = string.match(line, "^(.-):Connect") or string.match(line, "^(.-):Once") or ""
					local stored = string.find(before, "=")
						or string.find(line, "return")
						or string.find(line, ":Add%s*%(")
						or string.find(line, "insert%s*%(")
						or string.find(string.lower(line), "trove")
						or string.find(string.lower(line), "janitor")
						or string.find(string.lower(line), "maid")
						or string.find(string.lower(line), "cleanup")
					if not stored then
						unstored += 1
					end
				end
			end
			if unstored > 0 then
				add(
					out,
					"info",
					"class-connection-unstored",
					d,
					string.format(
						"class module with %d connection(s) whose handle is not kept: they outlive Destroy unless their instance is destroyed",
						unstored
					)
				)
			end
		end

		if string.find(code, "%[%s*[%w_]*[Pp]layer%s*%]%s*=[^=]") and not string.find(code, "PlayerRemoving") then
			add(
				out,
				"warn",
				"player-table-no-cleanup",
				d,
				"table keyed by Player is written but nothing handles PlayerRemoving: it grows for the server's lifetime"
			)
		end
		if
			string.find(code, "%[%s*[%w_]*[Cc]har%w*%s*%]%s*=[^=]")
			and not (
				string.find(code, "CharacterRemoving")
				or string.find(code, "Destroying")
				or string.find(code, "AncestryChanged")
			)
		then
			add(
				out,
				"warn",
				"character-table-no-cleanup",
				d,
				"table keyed by character is written but never cleared on CharacterRemoving or Destroying"
			)
		end

		local lines = {}
		for line in string.gmatch(code .. "\n", "(.-)\n") do
			table.insert(lines, line)
		end
		for i, line in lines do
			if
				string.find(line, "Destroying")
				or string.find(line, "CharacterRemoving")
				or string.find(line, "ChildRemoved")
				or string.find(line, "DescendantRemoving")
			then
				for k = i, math.min(#lines, i + 6) do
					if string.find(lines[k], "%.Parent%f[^%w_]") and not string.find(lines[k], "%.Parent%s*=[^=]") then
						add(
							out,
							"info",
							"removing-reads-parent",
							d,
							string.format(
								"line %d: a removal handler reads .Parent; under Deferred signals it is already nil, capture state before Destroy",
								k
							)
						)
						break
					end
				end
			end
		end
	end

	for _, list in bySource do
		if #list >= 2 then
			for _, s in list do
				add(
					out,
					"warn",
					"duplicate-source",
					s,
					string.format("%d scripts share this exact source: one module plus a CollectionService tag", #list)
				)
			end
		end
	end

	for _, side in { "server", "client" } do
		if #entries[side] > ArchAudit.LIMITS.entriesPerSide then
			add(
				out,
				"warn",
				"entry-count",
				side,
				string.format(
					"%d %s entry scripts (%s): one entry per side that boots every module",
					#entries[side],
					side,
					table.concat(entries[side], ", ")
				)
			)
		end
	end

	local g = ArchAudit.graph(root)
	for _, e in g.edges do
		local fromTop, toTop = topService(e.from), topService(e.to)
		local fromSide = if e.from.ClassName == "ModuleScript" then "module" else ArchAudit.side(e.from)
		if CLIENT_VISIBLE[fromTop] and SERVER_ONLY[toTop] and fromSide ~= "server" then
			add(
				out,
				"error",
				"client-requires-server",
				e.from,
				"requires " .. e.to:GetFullName() .. ": not replicated, fails on the client"
			)
		end
		if fromTop == "ReplicatedFirst" and toTop ~= "ReplicatedFirst" then
			add(
				out,
				"warn",
				"replicatedfirst-requires-outside",
				e.from,
				"requires "
					.. e.to:GetFullName()
					.. ": not loaded yet when ReplicatedFirst runs; keep loading code self-contained"
			)
		end
		if string.find(e.from.Name, "Service$") and isUi(e.to) then
			add(
				out,
				"warn",
				"service-requires-ui",
				e.from,
				"requires "
					.. e.to:GetFullName()
					.. ": state services never depend on UI; the UI calls the service and listens to its change signal"
			)
		end
	end
	for _, cyc in cycles(g.edges) do
		local names = {}
		for _, x in cyc do
			table.insert(names, x:GetFullName())
		end
		table.insert(names, cyc[1]:GetFullName())
		add(
			out,
			"error",
			"require-cycle",
			cyc[1],
			"require cycle "
				.. table.concat(names, " -> ")
				.. ": 'Requested module was required recursively' when these run at load time; pass the dependency in Init or move it to Start"
		)
	end

	local findings, tally = {}, { error = 0, warn = 0, info = 0 }
	for _, f in out.list do
		table.insert(findings, f)
		tally[f.severity] += 1
	end
	for rule, n in out.byRule do
		if n > ArchAudit.LIMITS.maxPerRule then
			table.insert(findings, {
				severity = "info",
				rule = rule,
				path = "",
				message = string.format("%d more findings of this rule not listed", n - ArchAudit.LIMITS.maxPerRule),
				fixture = false,
			})
		end
	end
	local rank = { error = 1, warn = 2, info = 3 }
	table.sort(findings, function(a, b)
		return rank[a.severity] < rank[b.severity]
	end)
	local edgeList = {}
	for _, e in g.edges do
		table.insert(edgeList, e.from:GetFullName() .. " -> " .. e.to:GetFullName())
	end
	local unresolvedList = {}
	for _, u in g.unresolved do
		table.insert(unresolvedList, u.from:GetFullName() .. ": require(" .. u.expr .. ")")
	end
	return {
		counts = counts,
		entries = entries,
		graph = { modules = g.modules, edges = edgeList, unresolved = unresolvedList },
		findings = findings,
		tally = tally,
	}
end

return ArchAudit
