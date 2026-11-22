--!nonstrict
-- AudioKit: build and inspect Audio API graphs (AudioPlayer, Wire, effects, AudioEmitter, AudioListener,
-- AudioDeviceOutput). Ships in the game and runs inlined through rbx_vfx_audio.run.
--
--   local music = AudioKit.player("rbxassetid://...", {Looping = true, Volume = 0.6}, SoundService)
--   local bus = AudioKit.bus("Music", SoundService)              -- an AudioFader wired to a device output
--   AudioKit.chain(music, {Instance.new("AudioEqualizer")}, bus) -- n effects -> n + 1 wires
--   AudioKit.paths(music)  -> {"AudioDeviceOutput"} when the stream reaches the speakers
--
-- Pins (Studio 0.743): AudioPlayer, AudioListener out "Output"; AudioEmitter, AudioDeviceOutput,
-- AudioAnalyzer in "Input" only (an analyzer is a tap with no output); AudioCompressor in "Input" and
-- "Sidechain", out "Output". Wire.Connected is false until both ends are in the DataModel, and the
-- wire that closes a cycle reads false.

local AudioKit = {}

function AudioKit.wire(src: Instance, dst: Instance, targetPin: string?, parent: Instance?): Wire
	local w = Instance.new("Wire")
	w.SourceInstance = src
	w.TargetInstance = dst
	if targetPin then
		w.TargetName = targetPin
	end
	w.Parent = parent or dst
	return w
end

-- src -> e1 -> e2 -> ... -> dst; returns the n + 1 wires.
function AudioKit.chain(src: Instance, effects, dst: Instance, parent: Instance?)
	local wires = {}
	local prev = src
	for _, e in effects do
		if not e.Parent then
			e.Parent = parent or dst.Parent or dst
		end
		table.insert(wires, AudioKit.wire(prev, e, nil, parent))
		prev = e
	end
	table.insert(wires, AudioKit.wire(prev, dst, nil, parent))
	return wires
end

function AudioKit.player(asset: string, props, parent: Instance?): AudioPlayer
	local p = Instance.new("AudioPlayer")
	p.Asset = asset -- AssetId is deprecated
	for k, v in props or {} do
		(p :: any)[k] = v
	end
	p.Parent = parent
	return p
end

-- An AudioFader named `name` wired to `output` (created under `parent` when nil).
function AudioKit.bus(name: string, parent: Instance, output: Instance?): AudioFader
	local f: any = parent:FindFirstChild(name)
	if not f then
		f = Instance.new("AudioFader")
		f.Name = name
		f.Parent = parent
	end
	local out: any = output
	if not out then
		out = parent:FindFirstChild("Out") or Instance.new("AudioDeviceOutput")
		out.Name = "Out"
		out.Parent = parent
	end
	if #f:GetConnectedWires("Output") == 0 then
		AudioKit.wire(f, out)
	end
	return f
end

local EMITTER_PARENTS = { "Attachment", "PVInstance", "Camera" }

-- AudioEmitter under an Attachment, PVInstance or Camera (any other parent is silent, docs and
-- Cookie Tech). `curve` is {[distance] = volume}; `group` is the AudioInteractionGroup.
function AudioKit.emitter(parent: Instance, curve, group: string?): AudioEmitter
	local ok = false
	for _, c in EMITTER_PARENTS do
		if parent:IsA(c) then
			ok = true
		end
	end
	assert(ok, "AudioEmitter parent must be an Attachment, PVInstance or Camera, got " .. parent.ClassName)
	local e = Instance.new("AudioEmitter")
	if curve then
		e:SetDistanceAttenuation(curve)
	end
	if group then
		e.AudioInteractionGroup = group
	end
	e.Parent = parent
	return e
end

-- A listener with its own device output: needed whenever SoundService.DefaultListenerLocation is None,
-- and in a default place, where Default created no listener in a playtest (observed).
function AudioKit.listener(parent: Instance, group: string?): AudioListener
	local l = Instance.new("AudioListener")
	if group then
		l.AudioInteractionGroup = group
	end
	l.Parent = parent
	local out = Instance.new("AudioDeviceOutput")
	out.Parent = l
	AudioKit.wire(l, out, nil, l)
	return l
end

-- Ducking: `target` stream goes through a compressor whose Sidechain pin listens to `trigger`.
-- Returns the compressor; wire its output onward yourself. Threshold is in dB (-60 to 0).
function AudioKit.duck(target: Instance, trigger: Instance, props, parent: Instance?): AudioCompressor
	local c = Instance.new("AudioCompressor")
	c.Name = "Ducker"
	for k, v in props or { Threshold = -30, Ratio = 8, Attack = 0.01, Release = 0.3 } do
		(c :: any)[k] = v
	end
	c.Parent = parent or target.Parent
	AudioKit.wire(target, c, "Input", c)
	AudioKit.wire(trigger, c, "Sidechain", c)
	return c
end

local function outgoing(inst: Instance)
	local ok, wires = pcall(function()
		return (inst :: any):GetConnectedWires("Output")
	end)
	return ok and wires or {}
end

-- Where a source's stream ends up: class names of the terminals reached (AudioDeviceOutput,
-- AudioAnalyzer, AudioRecorder...). AudioEmitters hand over to the listeners that can hear them
-- (GetInteractingListeners), whose outputs are followed in turn.
function AudioKit.paths(src: Instance)
	local seen, ends = {}, {}
	local function walk(node: Instance, depth: number)
		if seen[node] or depth > 32 then
			return
		end
		seen[node] = true
		if node:IsA("AudioEmitter") then
			for _, l in node:GetInteractingListeners() do
				walk(l, depth + 1)
			end
			return
		end
		local outs = outgoing(node)
		if #outs == 0 and node ~= src then
			ends[node.ClassName] = (ends[node.ClassName] or 0) + 1
		end
		for _, w in outs do
			if w.Connected and w.TargetInstance then
				walk(w.TargetInstance, depth + 1)
			end
		end
	end
	walk(src, 0)
	local list = {}
	for k in ends do
		table.insert(list, k)
	end
	table.sort(list)
	return list
end

function AudioKit.audible(src: Instance): boolean
	return table.find(AudioKit.paths(src), "AudioDeviceOutput") ~= nil
end

-- Mean RmsLevel and max PeakLevel of an AudioAnalyzer over `seconds` (sampled every frame).
function AudioKit.meter(analyzer: AudioAnalyzer, seconds: number)
	local n, rms, peak = 0, 0, 0
	local t0 = os.clock()
	while os.clock() - t0 < seconds do
		task.wait()
		n += 1
		rms += analyzer.RmsLevel
		peak = math.max(peak, analyzer.PeakLevel)
	end
	return { rms = n > 0 and rms / n or 0, peak = peak, samples = n }
end

-- Peak of the loaded asset without playing it (AudioPlayer:GetWaveformAsync, -1..1 samples).
function AudioKit.assetPeak(player: AudioPlayer, samples: number?): number
	local wf = player:GetWaveformAsync(NumberRange.new(0, player.TimeLength), samples or 64)
	local m = 0
	for _, s in wf do
		m = math.max(m, math.abs(s))
	end
	return m
end

return AudioKit
