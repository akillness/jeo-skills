--!nonstrict
-- AgentKit LuauAudit: static Luau checks that the shared Audit does not make (scheduler,
-- deferred events, yields, types, Parallel Luau, native code, leaks). Heuristic: it reads
-- source text, blanks strings and comments, and tracks blocks. Handlers passed by name
-- (`Heartbeat:Connect(onStep)`) are not followed.
--
--   LuauAudit.source(src, ctx) -> findings     ctx = {className?, hasActor?, path?}
--   LuauAudit.tree(root)       -> {counts, findings}   Studio (Edit data model) or Lune place
--   LuauAudit.files(list)      -> {counts, findings}   list = {{path, src}}, Rojo source files
--
-- Finding: {severity, rule, path, line, message}. Severities: error, warn, info.

local LuauAudit = {}

local OPENERS = { ["function"] = true, ["if"] = true, ["do"] = true, ["repeat"] = true }
local CLOSERS = { ["end"] = true, ["until"] = true }

local FRAME_EVENTS = { "RenderStepped", "Stepped", "Heartbeat", "PreRender", "PreAnimation", "PreSimulation", "PostSimulation" }
local REMOVAL_EVENTS = { "Destroying", "CharacterRemoving", "ChildRemoved", "DescendantRemoving" }
local YIELDS = {
	"task%.wait%s*%(", "%f[%w_.:]wait%s*%(", ":Wait%s*%(", ":WaitForChild%s*%(", "Async%s*%(",
	"coroutine%.yield%s*%(", ":InvokeServer%s*%(", ":InvokeClient%s*%(", ":Invoke%s*%(",
	"task%.desynchronize%s*%(", "task%.synchronize%s*%(",
}
local PARALLEL_UNSAFE = {
	{ "%.Parent%s*=[^=]", "sets Parent" },
	{ ":SetAttribute%s*%(", "calls SetAttribute" },
	{ ":Destroy%s*%(", "calls Destroy" },
	{ ":WriteVoxels%s*%(", "calls WriteVoxels" },
	{ "[%w_%]%)]%.%u[%w_]*%s*=[^=]", "may write an Instance property" },
}
local PLAYER_KEYS = { "player", "plr", "plyr", "Player" }

local function hasYield(code)
	for _, p in ipairs(YIELDS) do
		if code:find(p) then
			return true
		end
	end
	return false
end

-- Blank string contents and remove comments, keeping every newline so line numbers hold.
function LuauAudit.strip(src: string): string
	local out, i, n = {}, 1, #src
	local function blank(s)
		return (s:gsub("[^\n]", " "))
	end
	while i <= n do
		local c = src:sub(i, i)
		if c == "-" and src:sub(i, i + 1) == "--" then
			local eq = src:match("^%[(=*)%[", i + 2)
			if eq then
				local close = "]" .. eq .. "]"
				local j = src:find(close, i, true)
				j = j and (j + #close - 1) or n
				table.insert(out, blank(src:sub(i, j)))
				i = j + 1
			else
				local j = src:find("\n", i, true) or (n + 1)
				i = j
			end
		elseif c == "[" and src:match("^%[=*%[", i) then
			local eq = src:match("^%[(=*)%[", i)
			local close = "]" .. eq .. "]"
			local j = src:find(close, i, true)
			j = j and (j + #close - 1) or n
			table.insert(out, "[[" .. blank(src:sub(i + 2, j - 2)) .. "]]")
			i = j + 1
		elseif c == '"' or c == "'" or c == "`" then
			local j = i + 1
			while j <= n do
				local d = src:sub(j, j)
				if d == "\\" then
					j += 2
				elseif d == c or (d == "\n" and c ~= "`") then
					break
				else
					j += 1
				end
			end
			table.insert(out, c .. blank(src:sub(i + 1, j - 1)) .. c)
			i = j + 1
		else
			table.insert(out, c)
			i += 1
		end
	end
	return table.concat(out)
end

local function directives(src)
	local d = {}
	for line in (src .. "\n"):gmatch("(.-)\n") do
		local name = line:match("^%s*%-%-!(%a+)")
		if name then
			d[name] = true
		elseif line:find("%S") and not line:match("^%s*%-%-") then
			break
		end
	end
	return d
end

local function params(list)
	local out = {}
	for p in (list .. ","):gmatch("%s*([^,]-)%s*,") do
		if p ~= "" and p ~= "..." and not p:match("^%.%.%.") and p ~= "self" then
			table.insert(out, p)
		end
	end
	return out
end

function LuauAudit.source(src, ctx)
	ctx = ctx or {}
	local path = ctx.path or "<source>"
	local findings = {}
	local function add(sev, rule, line, msg)
		table.insert(findings, { severity = sev, rule = rule, path = path, line = line, message = msg })
	end
	local dir = directives(src)
	local code = LuauAudit.strip(src)
	local lines = {}
	for l in (code .. "\n"):gmatch("(.-)\n") do
		table.insert(lines, l)
	end

	if ctx.className == "ModuleScript" and not dir.strict then
		add("info", "module-not-strict", 1, "ModuleScript without --!strict: new modules start strict so the checker sees field and argument types")
	end

	local stack = {} -- {kind = "function" | "block", tag = string?, line = n, sawYield = bool, fnIndex = n}
	local anyCasts, anyFirst, colonMethods, colonFirst = 0, nil, 0, nil
	local playerAssign, playerLine = false, nil
	local nativeNext = false
	local desync = nil -- stack depth at which task.desynchronize() ran

	local function innerFunction()
		for k = #stack, 1, -1 do
			if stack[k].kind == "function" then
				return stack[k], k
			end
		end
		return nil, 0
	end
	local function insideTag(tag)
		local fn = innerFunction()
		return fn ~= nil and fn.tag == tag
	end

	for ln, line in ipairs(lines) do
		-- Tags for the first `function` / `do` opener on this line.
		local tagAt, tagName = nil, nil
		for _, ev in ipairs(FRAME_EVENTS) do
			local s = line:find("%f[%w_]" .. ev .. "%s*:%s*Connect%w*%s*%(")
			if s then
				tagAt, tagName = s, "frame"
			end
		end
		for _, ev in ipairs(REMOVAL_EVENTS) do
			local s = line:find("%f[%w_]" .. ev .. "%s*:%s*Connect%w*%s*%(") or line:find("%f[%w_]" .. ev .. "%s*:%s*Once%s*%(")
			if s then
				tagAt, tagName = s, "removal"
			end
		end
		local ps = line:find("ConnectParallel%s*%(") or line:find("BindToMessageParallel%s*%(")
		if ps then
			tagAt, tagName = ps, "parallel"
		end
		local ms = line:find("__%a+%s*=%s*function") or line:find("table%.sort%s*%(") or line:find("gsub%s*%(")
		if ms and not tagAt then
			tagAt, tagName = ms, "metamethod"
		end
		local whileTrue = line:find("%f[%w_]while%s+true%s+do%f[^%w_]")

		-- Per-line rules.
		if line:find("%.RenderStepped%f[^%w_]") then
			add("warn", "superseded-runservice", ln, "RenderStepped is superseded by RunService.PreRender")
		end
		if line:find("%.Stepped%f[^%w_]") then
			add("warn", "superseded-runservice", ln, "Stepped is superseded by RunService.PreSimulation (passes deltaTime only)")
		end
		if line:find("%f[%w_]getfenv%s*%(") or line:find("%f[%w_]setfenv%s*%(") then
			add("warn", "env-deopt", ln, "getfenv/setfenv disable fastcalls, imports and native code for the whole script")
		end
		if line:find("__index%s*=%s*function") then
			add("info", "index-function", ln, "__index as a function is slower than __index pointing at the class table")
		end
		for _ in line:gmatch("::%s*any%f[^%w_]") do
			anyCasts += 1
			anyFirst = anyFirst or ln
		end
		if dir.strict and line:find("%f[%w_]function%s+[%w_%.]+:[%w_]+%s*%(") then
			colonMethods += 1
			colonFirst = colonFirst or ln
		end
		for _, k in ipairs(PLAYER_KEYS) do
			if line:find("%[%s*" .. k .. "[%w_%.]*%s*%]%s*=%s*[^=%s]") and not line:find("%[%s*" .. k .. "[%w_%.]*%s*%]%s*=%s*nil") then
				playerAssign, playerLine = true, playerLine or ln
			end
		end
		local fnHere = innerFunction()
		if line:find("task%.desynchronize%s*%(") then
			desync = #stack
			if fnHere then
				fnHere.synced = false
			end
		elseif line:find("task%.synchronize%s*%(") then
			desync = nil
			if fnHere then
				fnHere.synced = true
			end
		end
		local inParallel = (insideTag("parallel") and not (fnHere and fnHere.synced)) or desync ~= nil
		if inParallel and line:find("%f[%w_]require%s*%(") then
			add("error", "require-in-parallel", ln, "require() in a desynchronized phase errors: require at the top, serially")
		end
		if inParallel and not line:find("task%.synchronize") then
			for _, u in ipairs(PARALLEL_UNSAFE) do
				if line:find(u[1]) then
					add("warn", "parallel-unsafe-write", ln, "in a parallel phase this " .. u[2] .. ": call task.synchronize() first")
					break
				end
			end
		end
		local own = line:match("^(.-)%f[%w_]function%f[^%w_]") or line
		if insideTag("frame") and hasYield(own) then
			add("warn", "yield-in-frame-handler", ln, "yield inside a per-frame handler: each frame starts another thread while this one waits; use task.delay or a busy flag")
		end
		if insideTag("metamethod") and hasYield(own) then
			add("error", "yield-in-metamethod", ln, "yield inside a metamethod, sort comparator or gsub callback fails: attempt to yield across metamethod/C-call boundary")
		end
		if insideTag("removal") and (line:find("%.Parent%f[^%w_]") or line:find(":GetFullName%s*%(") or line:find(":FindFirstAncestor")) then
			add("warn", "removal-handler-reads-parent", ln, "under Deferred signals the instance is already removed when this handler runs: read what you need before Destroy")
		end
		if hasYield(line) then
			local _, fnIdx = innerFunction()
			for _, b in ipairs(stack) do
				if b.tag == "whiletrue" and b.fnIndex == fnIdx then
					b.sawYield = true
				end
			end
		end
		if line:find("@native") then
			nativeNext = true
		end
		if nativeNext or dir.native then
			local fname, plist = line:match("%f[%w_]function%s*([%w_%.:]*)%s*%((.-)%)")
			if plist then
				local untyped = {}
				for _, p in ipairs(params(plist)) do
					if not p:find(":") then
						table.insert(untyped, p)
					end
				end
				if #untyped > 0 then
					add("warn", "native-untyped", ln, string.format("native function %s has untyped parameters (%s): annotate them, Vector3 above all", fname ~= "" and fname or "<anonymous>", table.concat(untyped, ", ")))
				end
				nativeNext = false
			end
		end

		-- Block tracking, token by token.
		local taggedDone, whileDone = false, false
		for pos, word in line:gmatch("()([%a_][%w_]*)") do
			local prev = pos > 1 and line:sub(pos - 1, pos - 1) or ""
			if prev == "." or prev == ":" then
				continue
			end
			if OPENERS[word] then
				local entry = { kind = if word == "function" then "function" else "block", line = ln }
				if word == "function" and tagAt and pos > tagAt and not taggedDone then
					entry.tag, taggedDone = tagName, true
					local rest = line:sub(pos + 8)
					rest = rest:match("^(.-)%f[%w_]function%f[^%w_]") or rest
					if hasYield(rest) and tagName == "frame" then
						add("warn", "yield-in-frame-handler", ln, "yield inside a per-frame handler: each frame starts another thread while this one waits; use task.delay or a busy flag")
					elseif hasYield(rest) and tagName == "metamethod" then
						add("error", "yield-in-metamethod", ln, "yield inside a metamethod, sort comparator or gsub callback fails: attempt to yield across metamethod/C-call boundary")
					end
				elseif word == "do" and whileTrue and pos > whileTrue and not whileDone then
					local _, idx = innerFunction()
					entry.tag, entry.fnIndex, whileDone = "whiletrue", idx, true
					entry.sawYield = hasYield(line:sub(pos + 2))
				end
				table.insert(stack, entry)
			elseif CLOSERS[word] then
				local b = table.remove(stack)
				if b and b.tag == "whiletrue" and not b.sawYield then
					add("warn", "while-true-no-yield", b.line, "while true loop with no yield in its body: the script stops with 'Script timeout: exhausted allowed execution time'")
				end
				if desync and #stack < desync then
					desync = nil
				end
			end
		end
	end

	if anyCasts > 0 then
		add("info", "any-cast", anyFirst, string.format("%d ':: any' cast(s): the checker stops here; narrow with IsA or FindFirstChildOfClass", anyCasts))
	end
	if colonMethods > 0 then
		add("info", "colon-method-strict", colonFirst, string.format("%d method(s) defined with ':' in a strict module: self is untyped (old solver) or loosely inferred (new solver); define `function Class.name(self: Class, ...)`", colonMethods))
	end
	if playerAssign and not code:find("PlayerRemoving") then
		add("warn", "player-table-no-cleanup", playerLine, "table keyed by player with no PlayerRemoving cleanup: entries outlive the player (server leak)")
	end
	-- A script that checks script:GetActor() is a worker template meant to be cloned under an Actor.
	if ctx.hasActor == false and ctx.className ~= "ModuleScript" and not code:find(":GetActor%s*%(") then
		if code:find("ConnectParallel%s*%(") or code:find("task%.desynchronize%s*%(") or code:find("BindToMessageParallel%s*%(") then
			add("error", "parallel-without-actor", 1, "parallel API in a script with no Actor ancestor: it errors and the handler never runs")
		end
	end
	return findings
end

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

function LuauAudit.tree(root)
	local findings, counts = {}, { scripts = 0, unreadable = 0, lines = 0 }
	for _, s in ipairs(root:GetDescendants()) do
		if s:IsA("LuaSourceContainer") then
			counts.scripts += 1
			local src = prop(s, "Source", nil)
			if type(src) ~= "string" then
				counts.unreadable += 1
				continue
			end
			local _, nl = src:gsub("\n", "")
			counts.lines += nl + 1
			local hasActor = s:FindFirstAncestorWhichIsA("Actor") ~= nil
			for _, f in ipairs(LuauAudit.source(src, { className = s.ClassName, hasActor = hasActor, path = s:GetFullName() })) do
				table.insert(findings, f)
			end
		end
	end
	local ws = root:FindFirstChildOfClass("Workspace")
	if ws then
		local sb = tostring(prop(ws, "SignalBehavior", "unreadable"))
		counts.signalBehavior = sb
		if sb:find("Immediate") or sb:find("Default") then
			table.insert(findings, { severity = "info", rule = "signal-behavior", path = ws:GetFullName(), line = 0, message = "Workspace.SignalBehavior is " .. sb .. " (Immediate): new templates use Deferred; test both before switching" })
		end
	end
	local order = { error = 1, warn = 2, info = 3 }
	table.sort(findings, function(a, b)
		if order[a.severity] ~= order[b.severity] then
			return order[a.severity] < order[b.severity]
		end
		if a.path ~= b.path then
			return a.path < b.path
		end
		return a.line < b.line
	end)
	return { counts = counts, findings = findings }
end

-- Rojo source files: {path, src} pairs. Script class comes from the file suffix; Actor ancestry is
-- unknown on disk, so parallel-without-actor is only checked in tree().
function LuauAudit.files(list)
	local findings, counts = {}, { scripts = 0, lines = 0 }
	for _, item in ipairs(list) do
		counts.scripts += 1
		local _, nl = item.src:gsub("\n", "")
		counts.lines += nl + 1
		local className = if item.path:find("%.server%.lua") then "Script" elseif item.path:find("%.client%.lua") then "LocalScript" else "ModuleScript"
		for _, f in ipairs(LuauAudit.source(item.src, { className = className, path = item.path })) do
			table.insert(findings, f)
		end
	end
	local order = { error = 1, warn = 2, info = 3 }
	table.sort(findings, function(a, b)
		if order[a.severity] ~= order[b.severity] then
			return order[a.severity] < order[b.severity]
		end
		if a.path ~= b.path then
			return a.path < b.path
		end
		return a.line < b.line
	end)
	return { counts = counts, findings = findings }
end

return LuauAudit
