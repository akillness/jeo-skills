--!nonstrict
-- VfxKit: build effects from data, play them from attributes, freeze them for captures.
-- Ships in the game (ReplicatedStorage) and runs inlined through rbx_vfx_audio.run. Pure Luau plus the
-- engine; arc() and bezier() also run in Lune.
--
--   local fx = VfxKit.build({name = "Hit", layers = {
--       {kind = "emitter", name = "Flash", attrs = {EmitCount = 1},
--        props = {Lifetime = 0.05, Size = {{0, 2}, {1, 6}}, Transparency = {{0, 0}, {1, 1}}, LightEmission = 1}},
--       {kind = "beam", name = "Arc", at0 = Vector3.new(-6, 0, 0), at1 = Vector3.new(6, 0, 0), props = {Width0 = 3, Width1 = 0}},
--   }})
--   VfxKit.play(fx, CFrame.new(0, 5, 0), workspace.Fx)  -- clone, place, emit, clean up after lifetime()
--
-- Layer kinds: emitter, beam (optional arc = bulge direction), trail, light, sound (AudioPlayer wired to an
-- AudioEmitter on the layer's Attachment; the Wire is cloned with the template and stays connected).
-- Attributes read by emit(): EmitCount (burst size), EmitDelay (s), EmitDuration (s of Enabled = true,
-- for emitters, beams, trails and lights). AudioPlayers inside the effect play on emit unless PlayOnEmit is false.

local VfxKit = {}

local RANGE_PROPS = { Lifetime = true, Speed = true, Rotation = true, RotSpeed = true, FlipbookFramerate = true }
local SEQ_PROPS = { Size = true, Transparency = true, Squash = true, WidthScale = true }

-- {{t, v, envelope?}, ...} or a number -> NumberSequence
function VfxKit.seq(v)
	if typeof(v) == "NumberSequence" then
		return v
	end
	if type(v) == "number" then
		return NumberSequence.new(v)
	end
	local keys = {}
	for _, k in v do
		table.insert(keys, NumberSequenceKeypoint.new(k[1], k[2], k[3] or 0))
	end
	return NumberSequence.new(keys)
end

-- {{t, Color3}, ...} or a Color3 -> ColorSequence
function VfxKit.colors(v)
	if typeof(v) == "ColorSequence" then
		return v
	end
	if typeof(v) == "Color3" then
		return ColorSequence.new(v)
	end
	local keys = {}
	for _, k in v do
		table.insert(keys, ColorSequenceKeypoint.new(k[1], k[2]))
	end
	return ColorSequence.new(keys)
end

function VfxKit.scaleSequence(seq: NumberSequence, k: number): NumberSequence
	local keys = {}
	for _, p in seq.Keypoints do
		table.insert(keys, NumberSequenceKeypoint.new(p.Time, p.Value * k, p.Envelope * k))
	end
	return NumberSequence.new(keys)
end

local function apply(inst: Instance, props)
	for key, value in props or {} do
		if RANGE_PROPS[key] and type(value) == "number" then
			value = NumberRange.new(value)
		elseif RANGE_PROPS[key] and type(value) == "table" then
			value = NumberRange.new(value[1], value[2])
		elseif SEQ_PROPS[key] and typeof(value) ~= "NumberSequence" then
			value = VfxKit.seq(value)
		elseif key == "Color" and (type(value) == "table") then
			value = VfxKit.colors(value)
		elseif
			key == "Color"
			and typeof(value) == "Color3"
			and (inst:IsA("ParticleEmitter") or inst:IsA("Beam") or inst:IsA("Trail"))
		then
			value = ColorSequence.new(value)
		end
		(inst :: any)[key] = value
	end
end

local function attach(root: BasePart, name: string, offset: Vector3?): Attachment
	local a = Instance.new("Attachment")
	a.Name = name
	a.Position = offset or Vector3.zero
	a.Parent = root
	return a
end

-- Builds a Model with an invisible anchored Root part; each layer gets its own Attachment(s).
-- Instance.new gives ParticleEmitter LightInfluence 0 while Studio's insert gives 1 (docs, observed 0 here).
function VfxKit.build(spec, parent: Instance?): Model
	local model = Instance.new("Model")
	model.Name = spec.name or "Effect"
	local root = Instance.new("Part")
	root.Name = "Root"
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.CastShadow = false
	root.Transparency = 1
	root.Size = Vector3.one
	root.Parent = model
	model.PrimaryPart = root
	for i, layer in spec.layers do
		local name = layer.name or (layer.kind .. i)
		local inst: any
		if layer.kind == "emitter" then
			local a = attach(root, name, layer.at)
			if layer.orient then
				a.Orientation = layer.orient
			end
			inst = Instance.new("ParticleEmitter")
			inst.Enabled = false
			inst.Parent = a
		elseif layer.kind == "beam" or layer.kind == "trail" then
			local a0 = attach(root, name .. "0", layer.at0)
			local a1 = attach(root, name .. "1", layer.at1)
			inst = Instance.new(layer.kind == "beam" and "Beam" or "Trail")
			inst.Attachment0 = a0
			inst.Attachment1 = a1
			if layer.kind == "beam" then
				-- an EmitDuration beam starts off; emit() switches it on for that long
				inst.Enabled = layer.enabled ~= false and not (layer.attrs and layer.attrs.EmitDuration)
			end
			inst.Parent = a0
			if layer.arc then
				VfxKit.arc(inst, layer.arc)
			end
		elseif layer.kind == "light" then
			local a = attach(root, name, layer.at)
			inst = Instance.new(layer.class or "PointLight")
			inst.Enabled = layer.enabled ~= false and not (layer.attrs and layer.attrs.EmitDuration)
			inst.Parent = a
		elseif layer.kind == "sound" then
			local a = attach(root, name, layer.at)
			local emitter = Instance.new("AudioEmitter")
			if layer.curve then
				emitter:SetDistanceAttenuation(layer.curve)
			end
			emitter.Parent = a
			inst = Instance.new("AudioPlayer")
			inst.Asset = layer.asset
			inst.Parent = a
			local w = Instance.new("Wire")
			w.SourceInstance = inst
			w.TargetInstance = emitter
			w.Parent = inst
		else
			error("unknown layer kind " .. tostring(layer.kind))
		end
		inst.Name = name
		apply(inst, layer.props)
		for k, v in layer.attrs or {} do
			inst:SetAttribute(k, v)
		end
	end
	model.Parent = parent
	return model
end

-- Emits every emitter by its EmitCount, honoring EmitDelay; toggles EmitDuration layers; plays audio.
function VfxKit.emit(root: Instance, scale: number?)
	local emitted, delayed = 0, 0
	for _, d in root:GetDescendants() do
		local count = d:GetAttribute("EmitCount")
		local delay = d:GetAttribute("EmitDelay") or 0
		local duration = d:GetAttribute("EmitDuration")
		if d:IsA("ParticleEmitter") and count then
			local n = math.max(1, math.round(count * (scale or 1)))
			if delay > 0 then
				delayed += 1
				task.delay(delay, function()
					if d.Parent then
						d:Emit(n)
					end
				end)
			else
				d:Emit(n)
			end
			emitted += n
		end
		if duration and (d:IsA("ParticleEmitter") or d:IsA("Beam") or d:IsA("Trail") or d:IsA("Light")) then
			task.delay(delay, function()
				d.Enabled = true
				task.delay(duration, function()
					d.Enabled = false
				end)
			end)
		end
		if d:IsA("AudioPlayer") and d:GetAttribute("PlayOnEmit") ~= false then
			d.TimePosition = 0
			d:Play()
		end
	end
	return { emitted = emitted, delayed = delayed }
end

-- Seconds until the last particle of one emit() is gone: delay + duration + Lifetime.Max / TimeScale.
function VfxKit.lifetime(root: Instance): number
	local t = 0
	for _, d in root:GetDescendants() do
		local delay = d:GetAttribute("EmitDelay") or 0
		local duration = d:GetAttribute("EmitDuration") or 0
		if d:IsA("ParticleEmitter") then
			t = math.max(t, delay + duration + d.Lifetime.Max / math.max(d.TimeScale, 0.01))
		elseif d:IsA("Trail") then
			t = math.max(t, delay + duration + d.Lifetime)
		elseif d:IsA("Beam") or d:IsA("Light") then
			t = math.max(t, delay + duration)
		elseif d:IsA("AudioPlayer") then
			t = math.max(t, d.TimeLength / math.max(d.PlaybackSpeed, 0.01))
		end
	end
	return t
end

-- Clone a template, place it, emit, destroy it after lifetime() + pad. Returns the clone and the delay.
function VfxKit.play(template: Model, cf: CFrame, parent: Instance, scale: number?, pad: number?)
	local fx = template:Clone()
	fx:PivotTo(cf)
	fx.Parent = parent
	VfxKit.emit(fx, scale)
	local life = VfxKit.lifetime(fx) + (pad or 0.25)
	task.delay(life, function()
		fx:Destroy()
	end)
	return fx, life
end

function VfxKit.clear(root: Instance)
	for _, d in root:GetDescendants() do
		if d:IsA("ParticleEmitter") or d:IsA("Trail") then
			d:Clear()
		end
	end
end

-- TimeScale 0 freezes particles in place (used for exact-time captures); 1 restores.
function VfxKit.setTimeScale(root: Instance, s: number)
	for _, d in root:GetDescendants() do
		if d:IsA("ParticleEmitter") then
			d.TimeScale = s
		end
	end
end

function VfxKit.count(root: Instance)
	local c = { emitters = 0, beams = 0, trails = 0, lights = 0, audio = 0 }
	for _, d in root:GetDescendants() do
		if d:IsA("ParticleEmitter") then
			c.emitters += 1
		elseif d:IsA("Beam") then
			c.beams += 1
		elseif d:IsA("Trail") then
			c.trails += 1
		elseif d:IsA("Light") then
			c.lights += 1
		elseif d:IsA("AudioPlayer") then
			c.audio += 1
		end
	end
	return c
end

-- Point on a beam's cubic Bezier: P1 = P0 + CurveSize0 * Attachment0 +X, P2 = P3 - CurveSize1 * Attachment1 +X
-- (Beam reference). Takes world positions and right vectors so it runs without the engine.
function VfxKit.bezier(p0: Vector3, x0: Vector3, c0: number, p3: Vector3, x1: Vector3, c1: number, t: number): Vector3
	local p1 = p0 + x0 * c0
	local p2 = p3 - x1 * c1
	local u = 1 - t
	return p0 * (u * u * u) + p1 * (3 * u * u * t) + p2 * (3 * u * t * t) + p3 * (t * t * t)
end

-- Semicircle arc between two attachments, bulging toward `bulge` (a world direction perpendicular to the
-- chord): both attachments' +X point at `bulge`, CurveSize0 = h and CurveSize1 = -h with h = chord x 2/3.
-- The curve's midpoint then sits 0.75 h = chord / 2 = the radius from the chord (Twist VFX's rule).
function VfxKit.arc(beam: Beam, bulge: Vector3): number
	local a0, a1 = beam.Attachment0, beam.Attachment1
	local p0, p3 = a0.WorldPosition, a1.WorldPosition
	local chord = (p3 - p0).Magnitude
	local dir = (p3 - p0).Unit
	local x = (bulge - dir * bulge:Dot(dir)).Unit -- keep only the part perpendicular to the chord
	local up = dir:Cross(x)
	local function orient(a: Attachment, p: Vector3)
		a.WorldCFrame = CFrame.fromMatrix(p, x, up)
	end
	orient(a0, p0)
	orient(a1, p3)
	local h = chord * 2 / 3
	beam.CurveSize0 = h
	beam.CurveSize1 = -h
	return h
end

return VfxKit
