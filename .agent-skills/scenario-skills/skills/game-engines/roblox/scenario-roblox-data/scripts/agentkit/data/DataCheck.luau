--!nonstrict
-- DataCheck: can this value be saved to a DataStore, and how close is it to the limits?
-- Runs in Studio (pass nothing: HttpService:JSONEncode is used) and in Lune (pass an encoder).
--
--   local r = DataCheck.report(profile.Data, { encode = enc })
--   r.ok, r.findings ({severity, rule, path, message}), r.bytes, r.kb, r.percent, r.writesPerMinute
--   DataCheck.key("Player_123")          -- findings for a key name
--   DataCheck.roundTrip(v, encode, decode) -- false when an encoder silently drops data
--
-- Why not just JSONEncode: since 2026 HttpService:JSONEncode turns NaN and inf into tagged
-- objects instead of failing, and other encoders drop sparse or mixed entries without an error.

local DataCheck = {}

DataCheck.MAX_CHARS = 4194304
DataCheck.KEY_WRITE_KB_PER_MIN = 4 * 1024
DataCheck.WARN_PERCENT = 25

local function add(out, severity, rule, path, message)
	table.insert(out, { severity = severity, rule = rule, path = path, message = message })
end

local function walk(v, path, out, seen, depth)
	local t = typeof(v)
	if t == "nil" or t == "boolean" or t == "buffer" then
		return
	elseif t == "number" then
		if v ~= v then
			add(out, "error", "nan", path, "NaN cannot be saved (JSON has no NaN)")
		elseif v == math.huge or v == -math.huge then
			add(out, "error", "inf", path, "infinity cannot be saved")
		elseif v % 1 == 0 and math.abs(v) > 2 ^ 53 then
			add(out, "warn", "precision", path, "integer above 2^53 loses precision as a double")
		end
		return
	elseif t == "string" then
		if utf8.len(v) == nil then
			add(out, "error", "utf8", path, "string is not valid UTF-8 (the write fails)")
		end
		return
	elseif t ~= "table" then
		add(out, "error", "type", path, t .. " cannot be saved: convert to numbers, strings and tables")
		return
	end
	if seen[v] then
		add(out, "error", "cycle", path, "table references itself")
		return
	end
	if depth > 100 then
		add(out, "error", "depth", path, "nesting deeper than 100")
		return
	end
	seen[v] = true
	local numeric, strings, count = 0, 0, 0
	for k, x in pairs(v) do
		count += 1
		local kt = typeof(k)
		local childPath
		if kt == "number" then
			numeric += 1
			childPath = path .. "[" .. tostring(k) .. "]"
			if k ~= k or k % 1 ~= 0 then
				add(out, "error", "key-number", childPath, "non-integer number key")
			end
		elseif kt == "string" then
			strings += 1
			childPath = path .. "." .. k
			if utf8.len(k) == nil then
				add(out, "error", "utf8", childPath, "key is not valid UTF-8")
			end
		else
			childPath = path .. "[" .. kt .. "]"
			add(out, "error", "key-type", childPath, kt .. " keys cannot be saved: use string keys")
		end
		walk(x, childPath, out, seen, depth + 1)
	end
	seen[v] = nil
	if numeric > 0 and strings > 0 then
		add(out, "error", "mixed", path, "table mixes number and string keys: only one kind survives")
	elseif numeric > 0 and numeric ~= #v then
		add(out, "error", "sparse", path, "array has holes or non-1..n number keys (store ids as string keys)")
	end
end

-- Findings for a value (no size). Paths start at "data".
function DataCheck.value(v: any): { any }
	local out = {}
	walk(v, "data", out, {}, 0)
	return out
end

local function defaultEncode()
	local ok, http = pcall(function()
		return game:GetService("HttpService")
	end)
	if ok and http then
		return function(x)
			return http:JSONEncode(x)
		end
	end
	return nil
end

-- Full report: findings plus size against the 4,194,304-character limit and the per-key write
-- throughput (4 MB per minute, rounded up per request to whole KB).
function DataCheck.report(v: any, opts: any?): any
	opts = opts or {}
	local findings = DataCheck.value(v)
	local r = { findings = findings, ok = true }
	for _, f in ipairs(findings) do
		if f.severity == "error" then
			r.ok = false
		end
	end
	if r.ok then
		local encode = opts.encode or defaultEncode()
		if encode then
			local okEnc, s = pcall(encode, v)
			if okEnc then
				r.bytes = #s
				r.kb = math.max(1, math.ceil(#s / 1024))
				r.percent = math.floor(#s / DataCheck.MAX_CHARS * 10000) / 100
				r.writesPerMinute = math.floor(DataCheck.KEY_WRITE_KB_PER_MIN / r.kb)
				if #s > DataCheck.MAX_CHARS then
					r.ok = false
					add(findings, "error", "size", "data", string.format("%d characters, limit %d", #s, DataCheck.MAX_CHARS))
				elseif r.percent > (opts.warnPercent or DataCheck.WARN_PERCENT) then
					add(findings, "warn", "size", "data", string.format("%.1f%% of the 4 MB limit: leave room for growth", r.percent))
				end
			else
				r.ok = false
				add(findings, "error", "encode", "data", tostring(s))
			end
		end
	end
	return r
end

-- Key names: 1 to 50 characters, static patterns that contain the user id (needed by RTBF templates).
function DataCheck.key(key: any, opts: any?): { any }
	opts = opts or {}
	local out = {}
	if type(key) ~= "string" then
		add(out, "error", "key-type", tostring(key), "keys are strings; tostring a UserId with a prefix")
		return out
	end
	if #key == 0 then
		add(out, "error", "key-empty", key, "error 101: empty key")
	elseif #key > 50 then
		add(out, "error", "key-length", key, "error 102: key over 50 characters")
	end
	if opts.userId and not key:find(tostring(opts.userId), 1, true) then
		add(out, "warn", "key-userid", key, "key does not contain the UserId: RTBF templates cannot match it")
	end
	if key:find("%s") then
		add(out, "warn", "key-space", key, "whitespace in a key usually means a display name was used")
	end
	return out
end

local function deepEqual(a, b)
	if a == b then
		return true
	end
	if type(a) ~= "table" or type(b) ~= "table" then
		return false
	end
	for k, v in pairs(a) do
		if not deepEqual(v, b[k]) then
			return false
		end
	end
	for k in pairs(b) do
		if a[k] == nil then
			return false
		end
	end
	return true
end
DataCheck.deepEqual = deepEqual

-- True when decode(encode(v)) equals v. Catches encoders that drop entries silently.
function DataCheck.roundTrip(v: any, encode: any, decode: any): (boolean, any)
	local ok, s = pcall(encode, v)
	if not ok then
		return false, s
	end
	local ok2, back = pcall(decode, s)
	if not ok2 then
		return false, back
	end
	return deepEqual(v, back), back
end

return DataCheck
