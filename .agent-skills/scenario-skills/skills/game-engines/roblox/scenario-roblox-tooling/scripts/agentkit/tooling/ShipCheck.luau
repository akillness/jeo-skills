--!nonstrict
-- AgentKit ShipCheck: release gate for a built place, before any publish.
-- Lune: `lune run tools/ship_check.luau build/ship.rbxl` (reads the file, no Studio).
-- Rules include package-entry: every Wally link module must resolve to a ModuleScript.
-- Studio: rbx_run in the Edit data model, ShipCheck.run(game, opts).
--
--   ShipCheck.run(root, { requirePaths = {"ReplicatedStorage.Packages"} })
--   -- {ok, counts = {scripts, localScripts, modules, instances}, findings = {{severity, rule, path, message}}}
--
-- ok is false when any finding has severity "error". Lune only knows properties saved in the
-- file, so every property read goes through a pcall with a default.
-- On a DataModel it scans only the services a place file saves: in Studio, game also holds
-- CorePackages and CoreGui, whose Roblox test modules would flood the report.

local ShipCheck = {}

local MAX_PER_RULE = 20

local TEST_NAME_SUFFIXES = { ".spec", ".test" }
local DEV_CONTAINERS = { TestKit = true, DevPackages = true, TestEZ = true, testez = true, Jest = true }
-- Script Sync file suffixes that Rojo does not map: a build keeps them in the instance name.
local SYNC_SUFFIXES = { ".local", ".legacy", ".server", ".client", ".plugin" }
local STARTERS = { StarterPlayer = true, StarterGui = true, StarterPack = true }
-- The place publishing API does not update these (place publishing guide): such a place must be
-- published from Studio after they change.
local PUBLISH_API_UNSUPPORTED = { "PartOperation", "SurfaceAppearance", "EditableImage", "EditableMesh", "BaseWrap" }
local SAVED_SERVICES = {
	"Workspace",
	"Lighting",
	"MaterialService",
	"ReplicatedFirst",
	"ReplicatedStorage",
	"ServerScriptService",
	"ServerStorage",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"Teams",
	"SoundService",
	"TextChatService",
	"Chat",
	"LocalizationService",
	"TestService",
}

local function prop(inst, name, default)
	local ok, v = pcall(function()
		return inst[name]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function isAny(inst, classNames)
	for _, className in classNames do
		local ok, yes = pcall(function()
			return inst:IsA(className)
		end)
		if ok and yes then
			return className
		end
	end
	return nil
end

local function endsWith(s, suffix)
	return string.sub(s, -#suffix) == suffix
end

local function add(out, severity, rule, inst, message)
	out.byRule[rule] = (out.byRule[rule] or 0) + 1
	if out.byRule[rule] <= MAX_PER_RULE then
		table.insert(out.findings, {
			severity = severity,
			rule = rule,
			path = if typeof(inst) == "Instance" then inst:GetFullName() else tostring(inst),
			message = message,
		})
	end
end

local function inStarter(inst)
	local p = inst.Parent
	while p do
		if STARTERS[p.ClassName] then
			return true
		end
		p = p.Parent
	end
	return false
end

local function find(root, dotted)
	local node = root
	for part in string.gmatch(dotted, "[^%.]+") do
		node = node and node:FindFirstChild(part)
	end
	return node
end

-- Wally link modules return require(script.Parent._Index["scope_name@1.2.3"]["name"]); a dependency
-- link inside _Index uses script.Parent.Parent[...][...]. A package published without an init module
-- builds as a Folder, and require on a Folder fails at runtime (xlxnmAFmu6c, 00:01:44).
local function checkPackageLink(out, link, index, pattern)
	local pkg, entry = string.match(prop(link, "Source", ""), pattern)
	if not pkg then
		return
	end
	local folder = index:FindFirstChild(pkg)
	local target = folder and folder:FindFirstChild(entry)
	if not target then
		add(out, "error", "package-entry", link, "links to _Index." .. pkg .. "." .. entry .. ", which is missing")
	elseif not target:IsA("ModuleScript") then
		local modules = {}
		for _, c in target:GetChildren() do
			if c:IsA("ModuleScript") then
				table.insert(modules, c.Name)
			end
		end
		add(
			out,
			"error",
			"package-entry",
			link,
			string.format(
				"resolves to a %s with no init module, so require fails; require its entry (%s) or copy the module",
				target.ClassName,
				if #modules > 0 then table.concat(modules, ", ") else "none found"
			)
		)
	end
end

local function checkPackages(out, index)
	local packages = index.Parent
	for _, link in packages:GetChildren() do
		if link:IsA("ModuleScript") then
			checkPackageLink(out, link, index, '_Index%["([^"]+)"%]%["([^"]+)"%]')
		end
	end
	for _, pkg in index:GetChildren() do
		for _, link in pkg:GetChildren() do
			if link:IsA("ModuleScript") then
				checkPackageLink(out, link, index, 'Parent%.Parent%["([^"]+)"%]%["([^"]+)"%]')
			end
		end
	end
end

function ShipCheck.run(root, opts)
	opts = opts or {}
	local out = { findings = {}, byRule = {} }
	local counts = { scripts = 0, localScripts = 0, modules = 0, instances = 0 }
	local all = {}
	if root.ClassName == "DataModel" then
		for _, className in SAVED_SERVICES do
			local service = root:FindFirstChildOfClass(className)
			if service then
				table.insert(all, service)
				for _, d in service:GetDescendants() do
					table.insert(all, d)
				end
			end
		end
	else
		all = root:GetDescendants()
	end
	for _, d in all do
		counts.instances += 1
		local name = d.Name
		local unsupported = isAny(d, PUBLISH_API_UNSUPPORTED)
		if unsupported then
			add(
				out,
				"warn",
				"publish-api-unsupported",
				d,
				unsupported
					.. " content is not updated by the place publishing API: publish this place from Studio after it changes"
			)
		end
		if name == "_Index" and d.Parent and not d:IsA("LuaSourceContainer") then
			checkPackages(out, d)
		end
		if DEV_CONTAINERS[name] then
			add(out, "error", "dev-container", d, "test or dev tooling container in a release build")
		end
		if d:IsA("LuaSourceContainer") then
			if d:IsA("ModuleScript") then
				counts.modules += 1
			elseif d:IsA("LocalScript") then
				counts.localScripts += 1
			else
				counts.scripts += 1
			end
			for _, suffix in TEST_NAME_SUFFIXES do
				if endsWith(name, suffix) then
					add(out, "error", "test-code", d, "test module ships; exclude it with globIgnorePaths")
				end
			end
			for _, suffix in SYNC_SUFFIXES do
				if endsWith(name, suffix) then
					add(
						out,
						"error",
						"sync-suffix",
						d,
						"file suffix '" .. suffix .. ".luau' was not mapped by the build tool"
					)
				end
			end
			if d:IsA("ModuleScript") and name == "wally" then
				add(
					out,
					"warn",
					"package-manifest",
					d,
					"wally.toml became a ModuleScript; ignore Packages/**/wally.toml"
				)
			end
			local runContext = tostring(prop(d, "RunContext", ""))
			if d.ClassName == "Script" and runContext == "Enum.RunContext.Plugin" then
				add(out, "warn", "plugin-script", d, "RunContext Plugin never runs in a game")
			end
			if d.ClassName == "Script" and runContext == "Enum.RunContext.Client" and inStarter(d) then
				add(
					out,
					"warn",
					"starter-runcontext",
					d,
					"Starter containers should hold LocalScripts (docs: Script types and locations)"
				)
			end
			local source = prop(d, "Source", "")
			if string.find(source, "require%(%s*%d") then
				add(
					out,
					"warn",
					"asset-require",
					d,
					"require(assetId) loads code from outside the place; vendor the module"
				)
			end
			if string.find(source, "loadstring%s*%(") then
				add(out, "warn", "loadstring", d, "loadstring needs LoadStringEnabled and is usually a mistake")
			end
			if not d:IsA("ModuleScript") and string.match(source, "^%s*$") then
				add(out, "info", "empty-script", d, "script has no source")
			end
		end
	end
	for _, path in opts.requirePaths or {} do
		if not find(root, path) then
			add(out, "error", "missing-path", path, "required instance is missing from the build")
		end
	end
	local ok = true
	for _, f in out.findings do
		if f.severity == "error" then
			ok = false
		end
	end
	return { ok = ok, counts = counts, findings = out.findings, byRule = out.byRule }
end

return ShipCheck
