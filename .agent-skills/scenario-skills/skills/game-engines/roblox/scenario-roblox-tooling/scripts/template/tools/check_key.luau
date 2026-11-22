--!nonstrict
-- Preflight for every job that uses an Open Cloud key: fail early with the fix instead of a 401
-- halfway through a release. Keys unused for 60 days auto-expire even without an expiry date.
--   lune run tools/check_key [--require-scope NAME:OPERATION ...] [--warn-days 7] [--base URL]
-- Scope strings are the Open Cloud reference names, such as universe-places:write. Introspect returns
-- each scope as a name plus its operations; NAME:OPERATION matches one operation, a bare NAME matches any.
-- Reads ROBLOX_API_KEY and never prints it. Exit 1 when the key is missing, rejected, disabled,
-- expired, or lacks a required scope.
local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")

local opts = { base = "https://apis.roblox.com", warnDays = 7, scopes = {} }
local i = 1
while i <= #process.args do
	local a, v = process.args[i], process.args[i + 1]
	if a == "--require-scope" then
		table.insert(opts.scopes, v)
	elseif a == "--warn-days" then
		opts.warnDays = tonumber(v)
	elseif a == "--base" then
		opts.base = v
	else
		error("unknown argument " .. a)
	end
	i += 2
end

local function fail(message)
	print("API key check failed: " .. message)
	process.exit(1)
end

local key = process.env.ROBLOX_API_KEY
if not key or #key == 0 then
	fail("ROBLOX_API_KEY is not set (add the secret to this job's environment)")
end

local res = net.request({
	url = opts.base .. "/api-keys/v1/introspect",
	method = "POST",
	headers = { ["content-type"] = "application/json" },
	body = serde.encode("json", { apiKey = key }),
})
if not res.ok then
	fail(string.format("introspect returned %d %s", res.statusCode, string.sub(res.body or "", 1, 200)))
end
local info = serde.decode("json", res.body)

if info.enabled == false then
	fail("key '" .. tostring(info.name) .. "' is disabled: Creator Dashboard > API Keys > turn on Enable Key")
end
if info.expired == true then
	fail(
		"key '"
			.. tostring(info.name)
			.. "' is expired. Keys unused for 60 days auto-expire: turn Enable Key off and on, or edit the"
			.. " key (name, description or expiry), or set a new expiration date; then rerun"
	)
end

local names, granted = {}, {}
for _, scope in info.scopes or {} do
	granted[scope.name] = true
	local ops = scope.operations or {}
	if #ops == 0 then
		names[scope.name] = true
	end
	for _, op in ops do
		names[scope.name .. ":" .. op] = true
		granted[scope.name .. ":" .. op] = true
	end
end
for _, wanted in opts.scopes do
	if not granted[wanted] then
		fail(
			"key '"
				.. tostring(info.name)
				.. "' lacks the scope "
				.. wanted
				.. ": Creator Dashboard > API Keys > edit the key > Access Permissions"
		)
	end
end

if type(info.expirationTimeUtc) == "string" then
	local y, mo, d = string.match(info.expirationTimeUtc, "^(%d+)-(%d+)-(%d+)")
	if y then
		local left = (os.time({ year = tonumber(y), month = tonumber(mo), day = tonumber(d), hour = 0 }) - os.time())
			/ 86400
		if left < opts.warnDays then
			print(string.format("warning: key '%s' expires in %.1f days", tostring(info.name), left))
		end
	end
end

local list = {}
for name in names do
	table.insert(list, name)
end
table.sort(list)
print(string.format("API key '%s' ok: enabled, not expired, scopes %s", tostring(info.name), table.concat(list, ", ")))
