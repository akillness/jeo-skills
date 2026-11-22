--!nonstrict
-- VfxAudit: static findings for ParticleEmitters, Beams and Trails under a root, plus a budget tally.
-- Runs inlined through rbx_vfx_audio.run (Edit, Server or Client) and in Lune on a saved place
-- (properties read through pcall with defaults, since Lune only knows saved values).
--
--   local a = VfxAudit.audit(workspace, {mobile = true})
--   -> {counts = {...}, findings = {{severity, rule, path, message}}, tally = {error, warn, info}}

local VfxAudit = {}

local RATE_CAP = 400 -- particles per second per emitter (docs)
local RATE_CAP_MOBILE = 100 -- per emitter on mobile (docs)
local LIFETIME_CAP = 20 -- seconds, engine-capped (docs)
local FLIPBOOK_FPS_CAP = 30 -- frames per second (reference)
local DEFAULT_TEXTURE = "rbxasset://textures/particles/sparkles_main.dds"

local function get(inst, prop, default)
	local ok, v = pcall(function()
		return inst[prop]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function enumName(v)
	if v == nil then
		return ""
	end
	local s = tostring(v)
	return s:match("([^%.]+)$") or s
end

local function keypoints(seq)
	local ok, k = pcall(function()
		return seq.Keypoints
	end)
	return ok and k or {}
end

function VfxAudit.audit(root: Instance, opts)
	opts = opts or {}
	local findings = {}
	local counts = {
		emitters = 0,
		beams = 0,
		trails = 0,
		alwaysOn = 0,
		rateSum = 0,
		flipbooks = 0,
		textures = 0,
		emitCountSum = 0,
	}
	local textures = {}
	local function add(sev, rule, inst, msg)
		table.insert(findings, { severity = sev, rule = rule, path = inst:GetFullName(), message = msg })
	end

	for _, d in root:GetDescendants() do
		if d:IsA("ParticleEmitter") then
			counts.emitters += 1
			local rate = get(d, "Rate", 20)
			local enabled = get(d, "Enabled", true)
			local life = get(d, "Lifetime", NumberRange.new(5, 10))
			local speed = get(d, "Speed", NumberRange.new(5))
			local accel = get(d, "Acceleration", Vector3.zero)
			local orient = enumName(get(d, "Orientation", nil))
			local shape = enumName(get(d, "Shape", nil))
			local layout = enumName(get(d, "FlipbookLayout", nil))
			local mode = enumName(get(d, "FlipbookMode", nil))
			local tex = get(d, "Texture", DEFAULT_TEXTURE)
			local emitCount = d:GetAttribute("EmitCount")
			textures[tex] = true
			if emitCount then
				counts.emitCountSum += emitCount
			end
			if enabled and rate > 0 then
				counts.alwaysOn += 1
				counts.rateSum += rate
			end
			if rate > RATE_CAP then
				add("error", "rate-over-cap", d, ("Rate %g is above the 400/s engine cap"):format(rate))
			elseif opts.mobile and rate > RATE_CAP_MOBILE then
				add("warn", "rate-over-mobile", d, ("Rate %g is above the 100/s mobile cap"):format(rate))
			end
			if life.Max > LIFETIME_CAP then
				add("warn", "lifetime-over-cap", d, ("Lifetime max %g is capped at 20 s"):format(life.Max))
			end
			if
				(orient == "VelocityPerpendicular" or orient == "VelocityParallel")
				and speed.Min == 0
				and speed.Max == 0
				and accel.Magnitude == 0
			then
				add(
					"error",
					"zero-speed-velocity-orientation",
					d,
					orient .. " with Speed 0 has no direction: use Speed 0.001 to 0.01"
				)
			end
			if (shape == "Sphere" or shape == "Cylinder") and d.Parent and d.Parent:IsA("Attachment") then
				add("warn", "shape-on-attachment", d, shape .. " shape does not display correctly on an Attachment")
			end
			if layout ~= "" and layout ~= "None" then
				counts.flipbooks += 1
				local fps = get(d, "FlipbookFramerate", NumberRange.new(1))
				if mode ~= "OneShot" and fps.Max > FLIPBOOK_FPS_CAP then
					add("warn", "flipbook-fps", d, ("FlipbookFramerate %g is above the 30 fps cap"):format(fps.Max))
				end
				if tex == DEFAULT_TEXTURE then
					add("error", "flipbook-default-texture", d, "flipbook layout on the default sparkles texture")
				end
			end
			if get(d, "Brightness", 1) ~= 1 and get(d, "LightInfluence", 0) >= 1 then
				add("warn", "brightness-ignored", d, "Brightness only applies when LightInfluence is below 1")
			end
			local tk = keypoints(get(d, "Transparency", nil))
			local sk = keypoints(get(d, "Size", nil))
			local shrinks = #sk > 0 and sk[#sk].Value == 0
			if #tk > 0 and tk[#tk].Value < 0.95 and life.Max > 0.3 and not shrinks then
				add("info", "no-fade-out", d, "neither Transparency reaches 1 nor Size 0 at end of life: particles pop out")
			end
			if not enabled and rate == 0 and not emitCount and not d:GetAttribute("EmitDuration") then
				add("warn", "never-emits", d, "disabled, Rate 0 and no EmitCount or EmitDuration attribute")
			end
			if tex == DEFAULT_TEXTURE and not opts.allowDefaultTexture then
				add("info", "default-texture", d, "still on the default sparkles texture")
			end
		elseif d:IsA("Beam") then
			counts.beams += 1
			local a0, a1 = get(d, "Attachment0", nil), get(d, "Attachment1", nil)
			if not a0 or not a1 then
				add("error", "beam-missing-attachment", d, "Beam needs Attachment0 and Attachment1")
			end
			local segs = get(d, "Segments", 10)
			local n = math.max(#keypoints(get(d, "Transparency", nil)), #keypoints(get(d, "Color", nil)))
			if n > 0 and segs < n - 1 then
				add("warn", "beam-segments", d, ("%d keypoints need at least %d Segments"):format(n, n - 1))
			end
			if segs > 10 and get(d, "CurveSize0", 0) == 0 and get(d, "CurveSize1", 0) == 0 then
				add("info", "beam-segments-straight", d, ("%d Segments on a straight beam"):format(segs))
			end
			if get(d, "Brightness", 1) ~= 1 and get(d, "LightInfluence", 0) >= 1 then
				add("warn", "brightness-ignored", d, "Brightness only applies when LightInfluence is below 1")
			end
			if get(d, "Enabled", true) then
				counts.alwaysOn += 1
			end
			textures[get(d, "Texture", "")] = true
		elseif d:IsA("Trail") then
			counts.trails += 1
			if not get(d, "Attachment0", nil) or not get(d, "Attachment1", nil) then
				add(
					"error",
					"trail-missing-attachment",
					d,
					"Trail needs Attachment0 and Attachment1 or it draws nothing"
				)
			end
			textures[get(d, "Texture", "")] = true
		end
	end
	for t in textures do
		if t ~= "" then
			counts.textures += 1
		end
	end
	if opts.alwaysOnBudget and counts.alwaysOn > opts.alwaysOnBudget then
		table.insert(findings, {
			severity = "warn",
			rule = "always-on-budget",
			path = root:GetFullName(),
			message = ("%d always-on emitters and beams (budget %d); each is about one draw call and is not occlusion culled"):format(
				counts.alwaysOn,
				opts.alwaysOnBudget
			),
		})
	end
	local tally = { error = 0, warn = 0, info = 0 }
	for _, f in findings do
		tally[f.severity] += 1
	end
	return { counts = counts, findings = findings, tally = tally }
end

return VfxAudit
