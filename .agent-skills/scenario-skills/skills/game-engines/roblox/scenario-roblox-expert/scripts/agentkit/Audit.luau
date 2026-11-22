--!nonstrict
-- AgentKit Audit: static checks of a place, from the instance tree and script sources.
-- Works in Studio (pass `game`, Edit data model) and offline in Lune (pass a place loaded with
-- @lune/roblox, see lune_audit.luau). Returns plain tables, safe for rbx_run.
--
--   local r = Audit.all(game)        -- {counts, lighting, findings = {{severity, rule, path, message}}}
--   Audit.scripts(game), Audit.remotes(game), Audit.physics(game), Audit.ui(game)
--
-- Severities: "error" (broken or never runs), "warn" (deprecated or risky), "info" (worth a look).

local Audit = {}

local MAX_PER_RULE = 12

-- Property read that tolerates missing values (Lune only knows properties saved in the file).
local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function svc(root, className)
	return root:FindFirstChildOfClass(className)
end

local function add(out, severity, rule, inst, message)
	out.byRule = out.byRule or {}
	local n = (out.byRule[rule] or 0) + 1
	out.byRule[rule] = n
	if n <= MAX_PER_RULE then
		table.insert(out, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
		})
	end
end

local function finish(out)
	local list = {}
	for _, f in ipairs(out) do
		table.insert(list, f)
	end
	for rule, n in pairs(out.byRule or {}) do
		if n > MAX_PER_RULE then
			table.insert(list, {
				severity = "info",
				rule = rule,
				path = "",
				message = string.format("%d more findings of this rule not listed", n - MAX_PER_RULE),
			})
		end
	end
	return list
end

local function under(inst, ancestorClass)
	local a = inst.Parent
	while a do
		if a.ClassName == ancestorClass then
			return true
		end
		a = a.Parent
	end
	return false
end

local function topService(inst)
	local a = inst
	while a.Parent and a.Parent.Parent do
		a = a.Parent
	end
	return a.ClassName
end

local function source(script)
	local ok, src = pcall(function()
		return script.Source
	end)
	return if ok and type(src) == "string" then src else nil
end

-- Deprecated or wrong APIs (from Roblox version deltas, 2026). Lua patterns, matched per line,
-- comments skipped. `%f[%w_.:]` keeps task.wait / obj:Wait from matching the globals.
Audit.API_RULES = {
	{ "%f[%w_.:]wait%s*%(", "warn", "global wait() is deprecated: use task.wait()" },
	{ "%f[%w_.:]spawn%s*%(", "warn", "global spawn() is deprecated: use task.spawn() or task.defer()" },
	{ "%f[%w_.:]delay%s*%(", "warn", "global delay() is deprecated: use task.delay()" },
	{ ":LoadCharacter%s*%(", "warn", "LoadCharacter is deprecated: LoadCharacterAsync" },
	{ ":GetProductInfo%s*%(", "warn", "GetProductInfo is deprecated: GetProductInfoAsync" },
	{ ":PlayerOwnsAsset%s*%(", "warn", "PlayerOwnsAsset is deprecated: PlayerOwnsAssetAsync" },
	{ ":AwardBadge%s*%(", "warn", "AwardBadge is deprecated: AwardBadgeAsync" },
	{ ":ApplyDescription%s*%(", "warn", "ApplyDescription is deprecated: ApplyDescriptionAsync" },
	{ ":IsInGroup%s*%(", "warn", "IsInGroup is deprecated: IsInGroupAsync" },
	{ ":ReserveServer%s*%(", "warn", "ReserveServer is deprecated: ReserveServerAsync" },
	{ "[Hh]um%w*:LoadAnimation%s*%(", "warn", "Humanoid:LoadAnimation is deprecated: load through the Animator" },
	{ "Instance%.new%s*%(%s*[\"']Body%a+[\"']", "warn", "Body movers are deprecated: LinearVelocity, AlignPosition, AlignOrientation" },
	{ "FindPartOnRay", "warn", "FindPartOnRay* is deprecated: workspace:Raycast with RaycastParams" },
	{ ":SetPrimaryPartCFrame%s*%(", "warn", "SetPrimaryPartCFrame is deprecated: Model:PivotTo" },
	{ "PhysicsService", "warn", "PhysicsService is deprecated: collision groups live on workspace, BasePart.CollisionGroup" },
	{ "CollisionGroupId", "warn", "CollisionGroupId is deprecated: BasePart.CollisionGroup (string)" },
	{ "ChatMakeSystemMessage", "error", "legacy chat is retired: TextChannel:DisplaySystemMessage" },
	{ "GetService%s*%(%s*[\"']Chat[\"']%s*%)", "warn", "legacy Chat service: use TextChatService" },
	{ "IsTenFootInterface", "warn", "IsTenFootInterface is deprecated: GuiService.ViewportDisplaySize" },
	{ "%f[%w_]require%s*%(%s*%d", "warn", "require(assetId) loads remote code: vendor the module and require by path" },
	{ "%f[%w_]loadstring%s*%(", "warn", "loadstring: disabled by default and a security risk" },
	{ ":connect%s*%(", "warn", "lowercase :connect is deprecated: :Connect" },
	{ ":OnUpdate%s*%(", "warn", "GlobalDataStore:OnUpdate is deprecated: MessagingService" },
	{ "Instance%.new%s*%(%s*[\"']EditableMesh", "error", "EditableMesh is not creatable: AssetService:CreateEditableMeshAsync" },
	{ "TeleportService:Teleport%s*%(", "warn", "TeleportService:Teleport: use TeleportAsync from the server, in pcall" },
	{ "MembershipType", "info", "MembershipType checks: see the subscription and Premium APIs current for 2026" },
	{ "PromptPremiumPurchase", "warn", "Premium is no longer sold: Player.HasRobloxSubscription, PromptRobloxSubscriptionPurchase" },
	{ ":GetHumanoidDescriptionFromUserId%s*%(", "warn", "GetHumanoidDescriptionFromUserId is deprecated: GetHumanoidDescriptionFromUserIdAsync" },
	{ ":CreateHumanoidModelFromDescription%s*%(", "warn", "CreateHumanoidModelFromDescription is deprecated: CreateHumanoidModelFromDescriptionAsync" },
	{ ":CreateHumanoidModelFromUserId%s*%(", "warn", "CreateHumanoidModelFromUserId is deprecated: CreateHumanoidModelFromUserIdAsync" },
	{ ":GetRankInGroup%s*%(", "warn", "GetRankInGroup is deprecated: GroupService:GetRolesInGroupAsync" },
	{ ":GetRoleInGroup%s*%(", "warn", "GetRoleInGroup is deprecated: GroupService:GetRolesInGroupAsync" },
	{ "RaycastFilterType%.Blacklist", "warn", "RaycastFilterType.Blacklist is gone: Exclude (or RaycastParams.ExcludeInstances)" },
	{ "RaycastFilterType%.Whitelist", "warn", "RaycastFilterType.Whitelist is gone: Include (or RaycastParams.IncludeInstances)" },
	{ ":FireCustomEvent%s*%(", "warn", "AnalyticsService:FireCustomEvent is deprecated: LogCustomEvent" },
	{ ":FirePlayerProgressionEvent%s*%(", "warn", "AnalyticsService:FirePlayerProgressionEvent is deprecated: LogProgressionEvent" },
	{ ":FireEvent%s*%(", "info", "if this is AnalyticsService:FireEvent, it is deprecated: LogCustomEvent and the other Log*Event methods" },
	{ "ChatVersion", "warn", "TextChatService.ChatVersion is deprecated: TextChatService is the only chat system" },
	{ "StreamingPauseMode", "warn", "StreamingPauseMode was removed: Workspace.StreamingIntegrityMode" },
	{ "%.Technology%f[^%w_]", "info", "Lighting.Technology is superseded and not scriptable: LightingStyle plus PrioritizeLightingQuality" },
	{ ":GetControls%s*%(", "info", "PlayerModule:GetControls may disappear: bind through InputContext, InputAction, InputBinding" },
	{ "GenerateMeshAsync", "info", "GenerateMeshAsync is scheduled for deprecation: GenerationService:GenerateModelAsync" },
	{ "Instance%.new%s*%(%s*[\"']EditableImage", "error", "EditableImage is not creatable: AssetService:CreateEditableImageAsync" },
	{ "Instance%.new%s*%(%s*[\"'][%w]+[\"']%s*,", "info", "Instance.new(class, parent): set properties first, parent last" },
}

local function isServerScript(s)
	if s.ClassName ~= "Script" then
		return false
	end
	local rc = tostring(prop(s, "RunContext", "Enum.RunContext.Legacy"))
	return not rc:find("Client")
end

function Audit.scripts(root)
	local out = {}
	local counts = { Script = 0, LocalScript = 0, ModuleScript = 0, lines = 0, unreadable = 0 }
	for _, s in ipairs(root:GetDescendants()) do
		if s:IsA("LuaSourceContainer") and counts[s.ClassName] ~= nil then
			counts[s.ClassName] += 1
			local top = topService(s)
			local rc = if s.ClassName == "Script" then tostring(prop(s, "RunContext", "Enum.RunContext.Legacy")) else ""
			-- Placement: scripts that never run where they sit.
			if s.ClassName == "Script" and (rc:find("Legacy") or rc == "") then
				if top ~= "Workspace" and top ~= "ServerScriptService" then
					add(out, "error", "never-runs", s, "Legacy-context Script outside Workspace/ServerScriptService never runs (set RunContext or move it)")
				end
			elseif s.ClassName == "Script" and rc:find("Client") and (top == "ServerScriptService" or top == "ServerStorage") then
				add(out, "error", "never-runs", s, "RunContext Client script in a server-only container never runs")
			elseif s.ClassName == "LocalScript" then
				if top == "ServerScriptService" or top == "ServerStorage" then
					add(out, "error", "never-runs", s, "LocalScript in a server-only container never runs")
				elseif top == "Workspace" then
					add(out, "info", "localscript-in-workspace", s, "LocalScript in Workspace runs only inside the local player's character")
				end
			end
			local src = source(s)
			if not src then
				counts.unreadable += 1
				continue
			end
			local lineNo = 0
			for line in (src .. "\n"):gmatch("(.-)\n") do
				lineNo += 1
				local code = line:gsub("%-%-.*$", "")
				if code:find("%S") then
					for _, r in ipairs(Audit.API_RULES) do
						if code:find(r[1]) then
							add(out, r[2], "api:" .. r[1], s, string.format("line %d: %s", lineNo, r[3]))
						end
					end
				end
			end
			counts.lines += lineNo
			-- Server-only logic shipped to clients.
			if s.ClassName == "ModuleScript" and (top == "ReplicatedStorage" or top == "ReplicatedFirst" or top == "Workspace") then
				if src:find("DataStoreService") or src:find("[Xx]%-[Aa][Pp][Ii]%-[Kk][Ee][Yy]") or src:find("MessagingService") then
					add(out, "warn", "server-code-replicated", s, "module in a replicated container references server services or API keys: clients can read it")
				end
			end
			if isServerScript(s) and src:find(":InvokeClient%s*%(") then
				add(out, "warn", "invoke-client", s, "server calls InvokeClient: a client can yield the server forever or error it")
			end
		end
	end
	return { counts = counts, findings = finish(out) }
end

function Audit.remotes(root)
	local out = {}
	local remotes = {}
	local serverSrc = {}
	for _, d in ipairs(root:GetDescendants()) do
		local c = d.ClassName
		if c == "RemoteEvent" or c == "UnreliableRemoteEvent" or c == "RemoteFunction" then
			table.insert(remotes, d)
		elseif d:IsA("LuaSourceContainer") then
			local top = topService(d)
			local serverSide = isServerScript(d)
				or (c == "ModuleScript" and (top == "ServerScriptService" or top == "ServerStorage"))
			if serverSide then
				table.insert(serverSrc, source(d) or "")
			end
		end
	end
	local all = table.concat(serverSrc, "\n")
	local handled = all:find("OnServerEvent") ~= nil or all:find("OnServerInvoke") ~= nil
	for _, r in ipairs(remotes) do
		if not all:find(r.Name, 1, true) then
			add(out, if handled then "info" else "warn", "remote-unreferenced", r, "no server-side script mentions this remote by name (handler missing, or remotes built by a wrapper)")
		end
		if r.ClassName == "RemoteFunction" then
			add(out, "info", "remote-function", r, "RemoteFunction: server must never InvokeClient; prefer RemoteEvent pairs for client-to-server requests that can fail")
		end
	end
	return { count = #remotes, findings = finish(out) }
end

function Audit.physics(root)
	local out = {}
	local ws = svc(root, "Workspace")
	local c = { parts = 0, meshParts = 0, unions = 0, unanchored = 0, precise = 0, decorQueryable = 0, models = 0 }
	if not ws then
		return { counts = c, findings = {} }
	end
	for _, d in ipairs(ws:GetDescendants()) do
		if d:IsA("BasePart") then
			c.parts += 1
			if d.ClassName == "MeshPart" then
				c.meshParts += 1
			elseif d.ClassName == "UnionOperation" then
				c.unions += 1
			end
			local inCharacter = d.Parent and d.Parent:FindFirstChildOfClass("Humanoid") ~= nil
			if not prop(d, "Anchored", false) and not inCharacter then
				c.unanchored += 1
				add(out, "info", "unanchored", d, "unanchored part: simulated and network-owned; anchor static geometry")
			end
			if (d.ClassName == "MeshPart" or d.ClassName == "UnionOperation")
				and tostring(prop(d, "CollisionFidelity", "Default")):find("PreciseConvexDecomposition") then
				c.precise += 1
				add(out, "info", "precise-fidelity", d, "PreciseConvexDecomposition is the costliest fidelity: use Box or Hull unless players touch the detail")
			end
			if not prop(d, "CanCollide", true) and (prop(d, "CanQuery", true) or prop(d, "CanTouch", true)) then
				c.decorQueryable += 1
				add(out, "info", "decor-queryable", d, "non-colliding part still queryable or touchable: set CanQuery and CanTouch false on pure decoration")
			end
		elseif d:IsA("Model") then
			c.models += 1
		end
	end
	return { counts = c, findings = finish(out) }
end

function Audit.lighting(root)
	local out = {}
	local L = svc(root, "Lighting")
	if not L then
		return { findings = {} }
	end
	-- Technology is RobloxScriptSecurity in Studio (reads "unknown"); Lune reads it from the file.
	local tech = tostring(prop(L, "Technology", "unknown"))
	local s = {
		technology = tech,
		lightingStyle = tostring(prop(L, "LightingStyle", "unknown")),
		prioritizeLightingQuality = prop(L, "PrioritizeLightingQuality", nil),
		clockTime = prop(L, "ClockTime", 14),
		brightness = prop(L, "Brightness", 2),
		environmentDiffuseScale = prop(L, "EnvironmentDiffuseScale", 0),
		environmentSpecularScale = prop(L, "EnvironmentSpecularScale", 0),
		children = {},
	}
	for _, ch in ipairs(L:GetChildren()) do
		table.insert(s.children, ch.ClassName)
	end
	if tech:find("Legacy") or tech:find("Compatibility") then
		add(out, "warn", "lighting-technology", L, "Lighting.Technology " .. tech .. " is deprecated: ShadowMap or Future")
	end
	if not L:FindFirstChildOfClass("Atmosphere") then
		add(out, "info", "no-atmosphere", L, "no Atmosphere: distance haze and sky color are flat")
	end
	local shadowLights = 0
	local ws = svc(root, "Workspace")
	if ws then
		for _, d in ipairs(ws:GetDescendants()) do
			if d:IsA("Light") and prop(d, "Shadows", false) then
				shadowLights += 1
			end
		end
	end
	s.shadowCastingLights = shadowLights
	s.findings = finish(out)
	return s
end

function Audit.ui(root)
	local out = {}
	local sg = svc(root, "StarterGui")
	local c = { screenGuis = 0, guiObjects = 0, offsetOnly = 0, textScaledNoConstraint = 0 }
	if not sg then
		return { counts = c, findings = {} }
	end
	for _, d in ipairs(sg:GetDescendants()) do
		if d.ClassName == "ScreenGui" then
			c.screenGuis += 1
			if prop(d, "ResetOnSpawn", true) then
				add(out, "info", "reset-on-spawn", d, "ResetOnSpawn is true: the GUI and its state are rebuilt at every respawn")
			end
		elseif d:IsA("GuiObject") then
			c.guiObjects += 1
			local sz = prop(d, "Size", nil)
			if sz and sz.X.Scale == 0 and sz.Y.Scale == 0 and (sz.X.Offset > 400 or sz.Y.Offset > 300) then
				c.offsetOnly += 1
				add(out, "warn", "offset-only-size", d, string.format("offset-only size %dx%d px: overflows phone screens; use Scale plus constraints", sz.X.Offset, sz.Y.Offset))
			end
			if (d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox")) and prop(d, "TextScaled", false)
				and not d:FindFirstChildOfClass("UITextSizeConstraint") then
				c.textScaledNoConstraint += 1
				add(out, "info", "textscaled-unbounded", d, "TextScaled without UITextSizeConstraint: text gets huge on big screens and tiny on phones")
			end
		end
	end
	return { counts = c, findings = finish(out) }
end

function Audit.counts(root)
	local byClass = {}
	local total = 0
	for _, d in ipairs(root:GetDescendants()) do
		total += 1
		byClass[d.ClassName] = (byClass[d.ClassName] or 0) + 1
	end
	local top = {}
	for k, v in pairs(byClass) do
		table.insert(top, { class = k, n = v })
	end
	table.sort(top, function(a, b)
		return a.n > b.n
	end)
	local summary = {}
	for i = 1, math.min(15, #top) do
		summary[i] = top[i].class .. " " .. top[i].n
	end
	local ws = svc(root, "Workspace")
	return {
		instances = total,
		topClasses = summary,
		streamingEnabled = if ws then prop(ws, "StreamingEnabled", nil) else nil,
	}
end

function Audit.all(root)
	local r = {
		counts = Audit.counts(root),
		scripts = Audit.scripts(root),
		remotes = Audit.remotes(root),
		physics = Audit.physics(root),
		lighting = Audit.lighting(root),
		ui = Audit.ui(root),
	}
	local findings, tally = {}, { error = 0, warn = 0, info = 0 }
	for _, k in ipairs({ "scripts", "remotes", "physics", "lighting", "ui" }) do
		for _, f in ipairs(r[k].findings) do
			f.area = k
			table.insert(findings, f)
			tally[f.severity] += 1
		end
		r[k].findings = nil
	end
	local rank = { error = 1, warn = 2, info = 3 }
	table.sort(findings, function(a, b)
		return rank[a.severity] < rank[b.severity]
	end)
	r.findings = findings
	r.tally = tally
	return r
end

return Audit
