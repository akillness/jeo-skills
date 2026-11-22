--!nonstrict
-- Footsteps: material-aware steps on the Audio API, synced to animation markers when the run animation
-- has them (GnomeCode's `footstep` event with `left` or `right`), else to distance travelled.
-- The default R15 animations carry no markers (observed), so the stride fallback is what runs with them.
-- Client only. Requires AudioKit next to this module.
--
--   local stop = Footsteps.start(character, {
--       sets = {Default = {"rbxassetid://..."}, Grass = {...}, Concrete = {...}},
--       map = {[Enum.Material.Slate] = "Concrete", [Enum.Material.Brick] = "Concrete"},  -- few sets, small download
--       volume = {Grass = 0.3, Default = 0.5}, stride = 4.4, pitchJitter = 0.08,
--   })
-- Counts go to character attributes FootstepCount, FootstepSet and FootstepSource ("marker" or "stride").

local RunService = game:GetService("RunService")
local AudioKit = require((script.Parent :: any).AudioKit)

local Footsteps = {}

function Footsteps.start(character: Model, config)
	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	local root = character:WaitForChild("HumanoidRootPart") :: BasePart
	local animator = humanoid:WaitForChild("Animator") :: Animator
	local marker = config.marker or "footstep"
	local jitter = config.pitchJitter or 0.08
	-- Default R15 RunAnim: 0.625 s played at Speed 1.13 to 1.18 at WalkSpeed 16 (observed), so a cycle
	-- covers about 8.5 to 8.8 studs and one step about 4.4.
	local stride = config.stride or 4.4
	local conns = {}

	-- The default character sounds are legacy Sounds (CharacterSoundsUseNewApi Default, observed); the
	-- looped Running sound would double every step.
	local running = root:FindFirstChild("Running")
	if running and running:IsA("Sound") then
		running.Volume = 0
	end

	local feet = Instance.new("Attachment")
	feet.Name = "Footsteps"
	feet.Position = Vector3.new(0, -(root.Size.Y / 2 + humanoid.HipHeight), 0)
	feet.Parent = root
	local emitter = AudioKit.emitter(feet, config.curve)

	-- One AudioPlayer per asset, wired once: switching Asset per step would reload it.
	local players: { [string]: { AudioPlayer } } = {}
	for setName, assets in config.sets do
		players[setName] = {}
		for i, asset in assets do
			local p = AudioKit.player(asset, { Volume = (config.volume or {})[setName] or 0.5 }, feet)
			p.Name = setName .. i
			AudioKit.wire(p, emitter, nil, p)
			table.insert(players[setName], p)
		end
	end
	local lastIndex: { [string]: number } = {}

	local function step(source: string)
		local mat = humanoid.FloorMaterial
		if mat == Enum.Material.Air then
			return
		end
		local setName = (config.map and config.map[mat]) or mat.Name
		if not players[setName] then
			setName = "Default"
		end
		local list = players[setName]
		if not list or #list == 0 then
			return
		end
		local i = math.random(1, #list)
		if #list > 1 and i == lastIndex[setName] then
			i = i % #list + 1 -- never the same take twice in a row
		end
		lastIndex[setName] = i
		local p = list[i]
		p.PlaybackSpeed = 1 + (math.random() * 2 - 1) * jitter
		p.TimePosition = 0
		p:Play()
		character:SetAttribute("FootstepCount", ((character:GetAttribute("FootstepCount") :: number?) or 0) + 1)
		character:SetAttribute("FootstepSet", setName)
		character:SetAttribute("FootstepSource", source)
	end

	local markerSeen = false
	local function hook(track: AnimationTrack)
		table.insert(
			conns,
			track:GetMarkerReachedSignal(marker):Connect(function()
				markerSeen = true
				step("marker")
			end)
		)
	end
	for _, track in animator:GetPlayingAnimationTracks() do
		hook(track)
	end
	table.insert(conns, animator.AnimationPlayed:Connect(hook))

	-- Distance comes from the root's velocity: Humanoid.MoveDirection stays 0 while the character walks
	-- under Humanoid:MoveTo (observed with Studio's character_navigation).
	local travelled = 0
	local stop: () -> ()
	local wasParented = false
	table.insert(
		conns,
		RunService.Heartbeat:Connect(function(dt)
			-- an old character can be left unparented instead of destroyed: stop with it
			if character.Parent then
				wasParented = true
			elseif wasParented then
				stop()
				return
			end
			if markerSeen or humanoid.FloorMaterial == Enum.Material.Air then
				return
			end
			local v = root.AssemblyLinearVelocity
			local speed = Vector3.new(v.X, 0, v.Z).Magnitude
			if speed < 1 then
				return
			end
			travelled += speed * dt
			if travelled >= stride then
				travelled -= stride
				step("stride")
			end
		end)
	)

	stop = function()
		for _, c in conns do
			c:Disconnect()
		end
		table.clear(conns)
		feet:Destroy()
	end
	table.insert(conns, character.Destroying:Connect(stop))
	return stop
end

return Footsteps
