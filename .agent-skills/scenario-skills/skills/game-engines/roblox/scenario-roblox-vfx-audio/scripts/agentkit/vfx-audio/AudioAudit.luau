--!nonstrict
-- AudioAudit: why a Roblox audio graph is silent, plus legacy Sound and memory findings.
-- Runs inlined through rbx_vfx_audio.run. Reading SoundService.DefaultListenerLocation needs plugin
-- security (execute_luau has it; a game script does not), so it is read through pcall.
--
--   local a = AudioAudit.audit(game)
--   -> {counts = {...}, listenerLocation, findings = {{severity, rule, path, message}}, tally}

local AudioAudit = {}

local function get(inst, prop, default)
	local ok, v = pcall(function()
		return inst[prop]
	end)
	if ok and v ~= nil then
		return v
	end
	return default
end

local function wires(inst: Instance, pin: string)
	local ok, w = pcall(function()
		return (inst :: any):GetConnectedWires(pin)
	end)
	return ok and w or {}
end

local function connected(list)
	for _, w in list do
		if get(w, "Connected", false) then
			return true
		end
	end
	return false
end

local VALID_EMITTER_PARENT = { "Attachment", "PVInstance", "Camera" }

function AudioAudit.audit(root: Instance)
	local findings = {}
	local function add(sev, rule, inst, msg)
		table.insert(findings, { severity = sev, rule = rule, path = inst:GetFullName(), message = msg })
	end
	local counts = {
		players = 0,
		emitters = 0,
		listeners = 0,
		outputs = 0,
		wires = 0,
		effects = 0,
		sounds = 0,
		soundsInSoundService = 0,
		autoLoad = 0,
	}
	local SoundService = game:GetService("SoundService")
	local loc = tostring(get(SoundService, "DefaultListenerLocation", "unknown"))
	local autoListener = loc:find("Camera") or loc:find("Character")
	local listenerGroups = {}
	local emitters = {}

	for _, d in root:GetDescendants() do
		if d:IsA("AudioPlayer") then
			counts.players += 1
			if get(d, "AutoLoad", true) then
				counts.autoLoad += 1
			end
			if get(d, "Asset", "") == "" then
				add("error", "player-no-asset", d, "AudioPlayer.Asset is empty (AssetId is deprecated)")
			end
			if not connected(wires(d, "Output")) then
				add("error", "player-dead-end", d, "no connected Wire on the Output pin: nothing can hear it")
			end
		elseif d:IsA("Wire") then
			counts.wires += 1
			if not get(d, "Connected", false) then
				add(
					"error",
					"wire-disconnected",
					d,
					"Wire.Connected is false: missing end, end outside the DataModel, bad pin name, or a cycle"
				)
			end
		elseif d:IsA("AudioEmitter") then
			counts.emitters += 1
			table.insert(emitters, d)
			local ok = false
			for _, c in VALID_EMITTER_PARENT do
				if d.Parent and d.Parent:IsA(c) then
					ok = true
				end
			end
			if not ok and tostring(get(d, "PositionType", "Parent")):find("Parent") then
				add("error", "emitter-bad-parent", d, "AudioEmitter parent must be an Attachment, PVInstance or Camera")
			end
			if not connected(wires(d, "Input")) then
				add("warn", "emitter-no-input", d, "AudioEmitter has no connected input Wire")
			end
		elseif d:IsA("AudioListener") then
			counts.listeners += 1
			listenerGroups[get(d, "AudioInteractionGroup", "")] = true
			if not connected(wires(d, "Output")) then
				add("warn", "listener-dead-end", d, "AudioListener output is not wired to anything")
			end
		elseif d:IsA("AudioDeviceOutput") then
			counts.outputs += 1
		elseif d:IsA("Sound") then
			counts.sounds += 1
			if d:IsDescendantOf(SoundService) then
				counts.soundsInSoundService += 1
			end
			if d.Parent and d.Parent:IsA("SoundGroup") and get(d, "SoundGroup", nil) ~= d.Parent then
				add(
					"warn",
					"sound-parented-to-group",
					d,
					"parenting to a SoundGroup does not assign it: set Sound.SoundGroup"
				)
			end
			if get(d, "SoundId", "") == "" then
				add("warn", "sound-no-id", d, "Sound has no SoundId")
			end
		elseif d.ClassName:match("^Audio") and #wires(d, "Input") > 0 then
			counts.effects += 1
		end
	end

	if autoListener then
		listenerGroups[""] = true
	end
	for _, e in emitters do
		local g = get(e, "AudioInteractionGroup", "")
		if not listenerGroups[g] then
			add(
				"warn",
				"no-listener-for-group",
				e,
				('no AudioListener with AudioInteractionGroup "%s" (DefaultListenerLocation %s)'):format(g, loc)
			)
		end
	end
	if counts.emitters > 0 and counts.listeners == 0 and not autoListener then
		table.insert(findings, {
			severity = "warn",
			rule = "no-listener",
			path = "SoundService",
			message = "emitters exist, no AudioListener, and DefaultListenerLocation "
				.. loc
				.. ": set it to Camera or Character, or create a listener wired to an AudioDeviceOutput",
		})
	end
	if counts.soundsInSoundService > 0 then
		table.insert(findings, {
			severity = "info",
			rule = "sounds-in-soundservice",
			path = "SoundService",
			message = ("%d Sound instances parked in SoundService stay in client memory"):format(
				counts.soundsInSoundService
			),
		})
	end
	local tally = { error = 0, warn = 0, info = 0 }
	for _, f in findings do
		tally[f.severity] += 1
	end
	return { counts = counts, listenerLocation = loc, findings = findings, tally = tally }
end

return AudioAudit
