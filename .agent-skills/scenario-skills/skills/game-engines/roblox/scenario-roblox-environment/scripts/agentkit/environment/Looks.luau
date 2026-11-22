--!nonstrict
-- AgentKit environment/Looks: lighting looks as data, applied and undone from code.
-- Edit data model through rbx_environment.run(..., kit=["Looks"]). Nothing runs at load (Lune-safe).
--
--   Looks.PRESETS[name]        day_fantasy, sunset_warm, night_horror, interior_sun (sources in the comments)
--   Looks.snapshot()           Lighting properties, effects and tagged light states as plain data
--   Looks.apply(look)          a preset name or table; creates missing effects; returns what it set
--   Looks.restore(snap)        puts back a snapshot, removing effects the look created
--   Looks.nightLights(on)      enables or disables every light tagged "NightLight"
--   Looks.sun()                direction toward the sun, elevation and heading in degrees
--   Looks.aimSun(toward, opts) searches ClockTime and GeographicLatitude for a sun in that direction (the
--                              code substitute for a sun-placement plugin); applies and returns the best pair
--
-- Colors are {r, g, b} in 0..255, enums are item names. A section set to false removes that effect.
-- Values marked [added] are starting points from this kit, not from a source: tune them on a capture.

local Looks = {}

Looks.TAG_LIGHT = "NightLight"

Looks.LIGHTING = {
	"LightingStyle",
	"PrioritizeLightingQuality",
	"ClockTime",
	"GeographicLatitude",
	"Brightness",
	"Ambient",
	"OutdoorAmbient",
	"ColorShift_Top",
	"ColorShift_Bottom",
	"EnvironmentDiffuseScale",
	"EnvironmentSpecularScale",
	"ExposureCompensation",
	"ShadowSoftness",
	"GlobalShadows",
}

-- section -> class, parent ("Lighting" or "Terrain"), properties
Looks.EFFECTS = {
	atmosphere = {
		class = "Atmosphere",
		parent = "Lighting",
		props = { "Density", "Offset", "Color", "Decay", "Glare", "Haze" },
	},
	bloom = { class = "BloomEffect", parent = "Lighting", props = { "Intensity", "Size", "Threshold", "Enabled" } },
	colorCorrection = {
		class = "ColorCorrectionEffect",
		parent = "Lighting",
		props = { "Brightness", "Contrast", "Saturation", "TintColor", "Enabled" },
	},
	sunRays = { class = "SunRaysEffect", parent = "Lighting", props = { "Intensity", "Spread", "Enabled" } },
	clouds = { class = "Clouds", parent = "Terrain", props = { "Cover", "Density", "Color", "Enabled" } },
}

Looks.PRESETS = {
	-- Bright stylized afternoon. Develuper (vkEXLmRAQgs): Realistic first, Brightness 3, Ambient ~[84,147,158],
	-- OutdoorAmbient ~[117,126,140], Atmosphere Density 0.3 to 0.4 Offset 0, light Glare, darker Haze, contrast last.
	-- RingWorld (UlvSrWHESwA): day ClockTime 14. DatBoiEle (aq0Fi0R2FAY): warm ColorShift_Top, bloom with a low
	-- threshold, high size, low intensity; color correction in 0.05 steps, Contrast 0.1.
	day_fantasy = {
		lighting = {
			LightingStyle = "Realistic",
			PrioritizeLightingQuality = true,
			ClockTime = 14,
			GeographicLatitude = 0,
			Brightness = 3,
			Ambient = { 84, 147, 158 },
			OutdoorAmbient = { 117, 126, 140 },
			ColorShift_Top = { 255, 236, 200 }, -- [added] value; the source gives only "subtle yellow"
			EnvironmentDiffuseScale = 0.5,
			EnvironmentSpecularScale = 0.5, -- [added]
			ExposureCompensation = 0,
			ShadowSoftness = 0.2,
			GlobalShadows = true,
		},
		atmosphere = {
			Density = 0.34,
			Offset = 0,
			Color = { 199, 184, 166 },
			Decay = { 104, 112, 122 },
			Glare = 2.7,
			Haze = 1,
		},
		bloom = { Intensity = 0.1, Size = 56, Threshold = 0.9, Enabled = true }, -- [added] Threshold; DatBoiEle uses about 0.03
		colorCorrection = {
			Brightness = 0,
			Contrast = 0.1,
			Saturation = 0.1,
			TintColor = { 242, 248, 255 },
			Enabled = true,
		},
		sunRays = { Intensity = 0.08, Spread = 0.6, Enabled = true }, -- [added] values
		clouds = { Cover = 0.55, Density = 0.6, Color = { 255, 255, 255 }, Enabled = true }, -- [added] values
		nightLights = false,
	},
	-- Warm late sun. BONES (zAoY8pxJM9c): ClockTime 15 with GeographicLatitude 73 as the sun-direction control,
	-- ShadowSoftness 1, ExposureCompensation -0.4, OutdoorAmbient ~[165,111,56]. DatBoiEle: cool (blue) Ambient for
	-- sunset shadows, warm ColorShift_Top. Develuper: always some SunRays late in the day.
	sunset_warm = {
		lighting = {
			LightingStyle = "Realistic",
			PrioritizeLightingQuality = true,
			ClockTime = 15,
			GeographicLatitude = 73,
			Brightness = 3,
			Ambient = { 70, 82, 120 },
			OutdoorAmbient = { 165, 111, 56 },
			ColorShift_Top = { 255, 170, 100 }, -- [added] value
			EnvironmentDiffuseScale = 0.4,
			EnvironmentSpecularScale = 0.5, -- [added]
			ExposureCompensation = -0.4,
			ShadowSoftness = 1,
			GlobalShadows = true,
		},
		atmosphere = {
			Density = 0.32,
			Offset = 0,
			Color = { 255, 196, 150 },
			Decay = { 120, 92, 112 },
			Glare = 3,
			Haze = 1.5,
		}, -- [added] colors
		bloom = { Intensity = 0.15, Size = 56, Threshold = 0.9, Enabled = true },
		colorCorrection = {
			Brightness = 0,
			Contrast = 0.1,
			Saturation = 0.1,
			TintColor = { 255, 244, 232 },
			Enabled = true,
		},
		sunRays = { Intensity = 0.15, Spread = 0.8, Enabled = true },
		clouds = { Cover = 0.5, Density = 0.5, Color = { 255, 225, 200 }, Enabled = true },
		nightLights = false,
	},
	-- Dark and eerie. BONES (zAoY8pxJM9c): Atmosphere Color and Decay black, Density 0.495, Offset 0.25, Glare 0,
	-- Haze 5; dark Ambient; EnvironmentDiffuseScale and EnvironmentSpecularScale 0; ExposureCompensation -0.4.
	-- RingWorld (UlvSrWHESwA): night ClockTime, lower Brightness, no glare, blue color correction, a focal light.
	night_horror = {
		lighting = {
			LightingStyle = "Realistic",
			PrioritizeLightingQuality = true,
			ClockTime = 0,
			Brightness = 0.5,
			Ambient = { 18, 20, 28 },
			OutdoorAmbient = { 30, 34, 48 }, -- [added] values; the sources say "dark"
			ColorShift_Top = { 0, 0, 0 },
			EnvironmentDiffuseScale = 0,
			EnvironmentSpecularScale = 0,
			ExposureCompensation = -0.4,
			ShadowSoftness = 0.2,
			GlobalShadows = true,
		},
		atmosphere = { Density = 0.495, Offset = 0.25, Color = { 0, 0, 0 }, Decay = { 0, 0, 0 }, Glare = 0, Haze = 5 },
		bloom = { Intensity = 0.6, Size = 24, Threshold = 0.9, Enabled = true }, -- [added] lets lamps glow
		colorCorrection = {
			Brightness = 0,
			Contrast = 0.15,
			Saturation = -0.15,
			TintColor = { 205, 218, 255 },
			Enabled = true,
		}, -- [added]
		sunRays = { Intensity = 0, Spread = 0, Enabled = false },
		clouds = { Cover = 0.75, Density = 0.7, Color = { 60, 66, 80 }, Enabled = true }, -- [added]
		nightLights = true,
	},
	-- Night over open ground. RingWorld (UlvSrWHESwA): night ClockTime, darker Ambient, Brightness down, no
	-- Atmosphere glare, color correction toward blue, a focal light for the eye, near and far lights.
	-- The values are [added]: unlike night_horror, the skyline and terrain keep a readable silhouette.
	night_outdoor = {
		lighting = {
			LightingStyle = "Realistic",
			PrioritizeLightingQuality = true,
			ClockTime = 0,
			Brightness = 2,
			Ambient = { 40, 46, 70 },
			OutdoorAmbient = { 90, 105, 150 },
			ColorShift_Top = { 0, 0, 0 },
			EnvironmentDiffuseScale = 0.2,
			EnvironmentSpecularScale = 0.3,
			ExposureCompensation = 0.4,
			ShadowSoftness = 0.3,
			GlobalShadows = true,
		},
		atmosphere = {
			Density = 0.25,
			Offset = 0,
			Color = { 70, 84, 120 },
			Decay = { 40, 46, 70 },
			Glare = 0,
			Haze = 1.5,
		},
		bloom = { Intensity = 0.6, Size = 24, Threshold = 0.9, Enabled = true },
		colorCorrection = {
			Brightness = 0,
			Contrast = 0.1,
			Saturation = -0.1,
			TintColor = { 210, 222, 255 },
			Enabled = true,
		},
		sunRays = { Intensity = 0, Spread = 0, Enabled = false },
		clouds = { Cover = 0.6, Density = 0.5, Color = { 70, 78, 100 }, Enabled = true },
		nightLights = true,
	},
	-- Interior lit only through windows. BONES (zAoY8pxJM9c): Ambient and OutdoorAmbient [0,0,0], Brightness 44,
	-- EnvironmentDiffuseScale and EnvironmentSpecularScale 0, sun aimed about 45 degrees down into the room with
	-- ClockTime and GeographicLatitude; a fake-GI PointLight [234,255,254], Range 50, Shadows on (placed separately).
	interior_sun = {
		lighting = {
			LightingStyle = "Realistic",
			PrioritizeLightingQuality = true,
			ClockTime = 14,
			GeographicLatitude = 39,
			Brightness = 44,
			Ambient = { 0, 0, 0 },
			OutdoorAmbient = { 0, 0, 0 },
			ColorShift_Top = { 0, 0, 0 },
			EnvironmentDiffuseScale = 0,
			EnvironmentSpecularScale = 0,
			ExposureCompensation = 0,
			ShadowSoftness = 0.2,
			GlobalShadows = true,
		},
		atmosphere = false,
		bloom = false,
		colorCorrection = false,
		sunRays = false,
		clouds = false,
		nightLights = false,
	},
}

local function toValue(current, v)
	local t = typeof(current)
	if t == "Color3" and type(v) == "table" then
		return Color3.fromRGB(v[1], v[2], v[3])
	elseif t == "EnumItem" and type(v) == "string" then
		return (current :: EnumItem).EnumType:FromName(v)
	end
	return v
end

local function plain(v)
	local t = typeof(v)
	if t == "Color3" then
		return { math.floor(v.R * 255 + 0.5), math.floor(v.G * 255 + 0.5), math.floor(v.B * 255 + 0.5) }
	elseif t == "EnumItem" then
		return v.Name
	end
	return v
end

local function parentOf(section)
	if Looks.EFFECTS[section].parent == "Terrain" then
		return workspace.Terrain
	end
	return game:GetService("Lighting")
end

function Looks.nightLights(on)
	local n = 0
	for _, light in game:GetService("CollectionService"):GetTagged(Looks.TAG_LIGHT) do
		if light:IsA("Light") then
			light.Enabled = on
			n += 1
		end
	end
	return n
end

function Looks.sun()
	local d = game:GetService("Lighting"):GetSunDirection()
	return {
		direction = d,
		elevation = math.deg(math.asin(math.clamp(d.Y, -1, 1))),
		heading = math.deg(math.atan2(d.X, d.Z)), -- 0 = toward +Z, 90 = toward +X
	}
end

-- toward: Vector3 pointing from the scene to where the sun should be (for example behind the spawn camera
-- and above). opts.clockMin/clockMax bound the time of day (default 6 to 18). Restores nothing: it applies.
function Looks.aimSun(toward, opts)
	opts = opts or {}
	local L = game:GetService("Lighting")
	local want = toward.Unit
	local best, bestDot = nil, -2
	local function try(t, lat)
		L.ClockTime = t
		L.GeographicLatitude = lat
		local dot = L:GetSunDirection():Dot(want)
		if dot > bestDot then
			best, bestDot = { t, lat }, dot
		end
	end
	for t = opts.clockMin or 6, opts.clockMax or 18, 0.25 do
		for lat = -90, 270, 3 do
			try(t, lat)
		end
	end
	local t0, lat0 = best[1], best[2]
	for t = t0 - 0.25, t0 + 0.25, 0.05 do
		for lat = lat0 - 3, lat0 + 3, 0.5 do
			try(t, lat)
		end
	end
	L.ClockTime = best[1]
	L.GeographicLatitude = best[2]
	local s = Looks.sun()
	return {
		ClockTime = best[1],
		GeographicLatitude = best[2],
		errorDegrees = math.deg(math.acos(math.clamp(bestDot, -1, 1))),
		elevation = s.elevation,
		heading = s.heading,
	}
end

function Looks.snapshot()
	local L = game:GetService("Lighting")
	local snap = { lighting = {}, effects = {}, lights = {} }
	for _, prop in Looks.LIGHTING do
		snap.lighting[prop] = plain(L[prop])
	end
	for section, def in Looks.EFFECTS do
		local e = parentOf(section):FindFirstChildOfClass(def.class)
		if e then
			local props = {}
			for _, p in def.props do
				props[p] = plain(e[p])
			end
			snap.effects[section] = props
		else
			snap.effects[section] = false
		end
	end
	for _, light in game:GetService("CollectionService"):GetTagged(Looks.TAG_LIGHT) do
		if light:IsA("Light") then
			snap.lights[light:GetFullName()] = light.Enabled
		end
	end
	return snap
end

function Looks.apply(look)
	if type(look) == "string" then
		look = assert(Looks.PRESETS[look], "unknown look " .. look)
	end
	local L = game:GetService("Lighting")
	local report = { lighting = 0, created = {}, removed = {}, lights = nil }
	for prop, v in look.lighting or {} do
		L[prop] = toValue(L[prop], v)
		report.lighting += 1
	end
	for section, def in Looks.EFFECTS do
		local want = look[section]
		if want == nil then
			continue
		end
		local parent = parentOf(section)
		local e = parent:FindFirstChildOfClass(def.class)
		if want == false then
			if e then
				e:Destroy()
				table.insert(report.removed, def.class)
			end
			continue
		end
		if not e then
			e = Instance.new(def.class)
			e.Parent = parent
			table.insert(report.created, def.class)
		end
		for prop, v in want do
			e[prop] = toValue(e[prop], v)
		end
	end
	if look.nightLights ~= nil then
		report.lights = Looks.nightLights(look.nightLights)
	end
	return report
end

function Looks.restore(snap)
	local look = { lighting = snap.lighting }
	for section, props in snap.effects do
		look[section] = props
	end
	local report = Looks.apply(look)
	for path, on in snap.lights do
		for _, light in game:GetService("CollectionService"):GetTagged(Looks.TAG_LIGHT) do
			if light:GetFullName() == path then
				light.Enabled = on
			end
		end
	end
	return report
end

return Looks
