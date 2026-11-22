--!strict
-- MoveGuard: server-side speed and teleport check for places that keep client-owned characters
-- (AuthorityMode Automatic). In a Server Authority place the engine already rejects these moves.
--
-- Core (pure, unit-tested in Lune):
--   local g = MoveGuard.new({ margin = 5, burst = 6 })
--   local verdict, trusted = g:check(key, position, now, allowedSpeed)
-- Binder (Studio only): MoveGuard.start({ interval = 0.25, onFlag = fn }) samples every character,
-- rubber-bands to the last trusted position, and exposes MoveGuard.grace(player, seconds) for
-- server teleports, knockback and launch pads.
--
-- Method from the Creator Docs (average over time, XZ projection, exemptions, leaky bucket) and
-- Suphi Kaner (last trusted position, WalkSpeed + 5, dt clamp 0.01 s).

export type Options = {
	margin: number?, -- studs/s over the allowed speed (lag spikes)
	burst: number?, -- studs of excess tolerated before a flag (leaky bucket)
	leak: number?, -- fraction of the excess kept per second
	maxRise: number?, -- studs/s upward; falling is never limited
	clock: (() -> number)?,
}

type Track = { pos: Vector3, at: number, excess: number }

type MoveGuardFields = {
	margin: number,
	burst: number,
	leak: number,
	maxRise: number,
	tracks: { [any]: Track },
	graceUntil: { [any]: number },
}

local MoveGuard = {}
MoveGuard.__index = MoveGuard

-- Methods live on the metatable; this type sees them with no cast.
export type MoveGuard = typeof(setmetatable({} :: MoveGuardFields, MoveGuard))

function MoveGuard.new(opts: Options?): MoveGuard
	local o: Options = opts or {}
	local self: MoveGuardFields = {
		margin = o.margin or 5,
		burst = o.burst or 6,
		leak = o.leak or 0.5,
		maxRise = o.maxRise or 60,
		tracks = {},
		graceUntil = {},
	}
	return setmetatable(self, MoveGuard)
end

function MoveGuard.exempt(self: MoveGuard, key: any, untilTime: number)
	self.graceUntil[key] = untilTime
end

function MoveGuard.reset(self: MoveGuard, key: any, pos: Vector3?, now: number?)
	if pos and now then
		self.tracks[key] = { pos = pos, at = now, excess = 0 }
	else
		self.tracks[key] = nil
	end
end

-- Returns "ok", "grace", "speed", "rise" or "invalid", and the position the server should trust.
function MoveGuard.check(self: MoveGuard, key: any, pos: Vector3, now: number, allowedSpeed: number): (string, Vector3)
	local t = self.tracks[key]
	if not (math.isfinite(pos.X) and math.isfinite(pos.Y) and math.isfinite(pos.Z)) then
		return "invalid", if t then t.pos else pos
	end
	if t == nil then
		self.tracks[key] = { pos = pos, at = now, excess = 0 }
		return "ok", pos
	end
	local g = self.graceUntil[key]
	if g and now < g then
		t.pos, t.at, t.excess = pos, now, 0
		return "grace", pos
	end
	local dt = math.max(now - t.at, 0.01)
	local d = pos - t.pos
	local flat = math.sqrt(d.X * d.X + d.Z * d.Z) -- XZ only: falling and jumping are not speed
	local excess = flat - (allowedSpeed + self.margin) * dt
	t.excess = math.max(0, t.excess * (self.leak ^ dt) + excess)
	if t.excess > self.burst then
		t.excess = 0
		t.at = now
		return "speed", t.pos
	end
	if d.Y > self.maxRise * dt + self.burst then
		t.at = now
		return "rise", t.pos
	end
	t.pos, t.at = pos, now
	return "ok", pos
end

-- Studio binder. onFlag(player, verdict, studs) is called after the rubber-band.
export type StartOptions = {
	interval: number?,
	guard: MoveGuard?,
	enforce: boolean?, -- false: log only (tests, tuning)
	onFlag: ((player: Player, verdict: string, distance: number) -> ())?,
}

local active: MoveGuard? = nil

function MoveGuard.grace(player: Player, seconds: number)
	if active then
		active:exempt(player, os.clock() + seconds)
	end
end

function MoveGuard.start(opts: StartOptions?): MoveGuard
	local o: StartOptions = opts or {}
	local Players = game:GetService("Players")
	local guard = o.guard or MoveGuard.new()
	active = guard
	local interval = o.interval or 0.25
	Players.PlayerRemoving:Connect(function(p)
		guard:reset(p)
		guard.graceUntil[p] = nil
	end)
	task.spawn(function()
		while true do
			task.wait(interval)
			local now = os.clock()
			for _, player in Players:GetPlayers() do
				local char = player.Character
				local hum = char and char:FindFirstChildOfClass("Humanoid")
				local root = char and char:FindFirstChild("HumanoidRootPart")
				if not (char and hum and root and root:IsA("BasePart")) or hum.Health <= 0 or hum.SeatPart then
					guard:reset(player)
					continue
				end
				-- WalkSpeed read on the server: an exploit's local WalkSpeed never replicates.
				local verdict, trusted = guard:check(player, root.Position, now, hum.WalkSpeed)
				if verdict == "speed" or verdict == "rise" or verdict == "invalid" then
					local dist = (root.Position - trusted).Magnitude
					if o.enforce ~= false then
						char:PivotTo(CFrame.new(trusted) * root.CFrame.Rotation)
					else
						-- The character stays put, so measure from where it is: otherwise one teleport
						-- flags again on every later sample.
						guard:reset(player, root.Position, now)
					end
					local onFlag = o.onFlag
					if onFlag then
						onFlag(player, verdict, dist)
					end
				end
			end
		end
	end)
	return guard
end

return MoveGuard
