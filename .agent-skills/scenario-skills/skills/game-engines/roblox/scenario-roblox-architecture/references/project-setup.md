# Project setup: client start, streaming, packages, team tools, two-client tests

Decide these at the start of a project. Moving them later touches every script.

**Test status:** the arena tests ran with StreamingEnabled off, because the toolkit's place template
turns it off. Everything below comes from the docs and the expert notes cited next to each point.
Every snippet here type-checks on both solvers (O7) and carries "not yet run (needs Studio)". The
one live measurement is the map streaming mode in section 2, with streaming off.

## 1. Client start sequence

The client loads in this order: ReplicatedFirst scripts, then the rest of the game (`game.Loaded`
fires, `game:IsLoaded()` turns true), then client Scripts in ReplicatedStorage, then the character
(docs, Properties and attributes, client load order; live: Main ran 35 to 36 ms after
ReplicatedFirst, with no character yet).

1. **One loading-screen script in ReplicatedFirst, self-contained.** ReplicatedFirst exists only for
   what must reach the client first (Crusherfire, 28z_064N-lc [00:05:06]). Its script cannot require
   modules from other services, because they have not loaded yet (docs, Properties and attributes).
2. **Show your screen, then remove the default one.** Parent the ScreenGui to PlayerGui, then call
   `ReplicatedFirst:RemoveDefaultLoadingScreen()` (docs, Loading screens). Set `ResetOnSpawn` false:
   a ScreenGui made in code with `ResetOnSpawn` true was destroyed at a respawn (live, P14).
3. **Wait for the game:** `if not game:IsLoaded() then game.Loaded:Wait() end` (docs, Loading
   screens; Suphi Kaner, YsXijBUUmmM [00:14:49]).
4. **The client entry boots, then says so.** The client Main boots the controllers through Loader,
   then sets a local `ClientReady` attribute. The loading screen waits for that flag, with a
   timeout, so a failed boot never traps the player. Suphi creates the screen at the top of his
   client loader and destroys it after the last module starts (YsXijBUUmmM [00:14:49 to 00:15:21]);
   the flag keeps that order across two scripts [added].
5. **Never wait for a Workspace part on the loading screen.** Under streaming, the client has no
   replication focus until its character exists, so the wait can hang forever (docs, Streaming
   techniques, "Script patterns").

```lua
--!strict
-- ReplicatedFirst loading screen (a LocalScript, or a Script with RunContext Client).
-- Not yet run (needs Studio).
local Players = game:GetService("Players")
local ReplicatedFirst = game:GetService("ReplicatedFirst")

local TIMEOUT = 15 -- seconds: a broken client boot must not keep the player behind the screen

local player = Players.LocalPlayer
local screen = Instance.new("ScreenGui")
screen.Name = "Loading"
screen.IgnoreGuiInset = true
screen.ResetOnSpawn = false
screen.DisplayOrder = 100
local label = Instance.new("TextLabel")
label.Size = UDim2.fromScale(1, 1)
label.BackgroundColor3 = Color3.fromRGB(0, 20, 40)
label.TextColor3 = Color3.new(0.8, 0.8, 0.8)
label.TextSize = 32
label.Text = "Loading"
label.Parent = screen
screen.Parent = player:WaitForChild("PlayerGui")
ReplicatedFirst:RemoveDefaultLoadingScreen() -- only once your own screen shows

if not game:IsLoaded() then
	game.Loaded:Wait()
end
-- Wait for the client entry, never for a Workspace part.
local deadline = os.clock() + TIMEOUT
while not player:GetAttribute("ClientReady") and os.clock() < deadline do
	task.wait(0.1)
end
screen:Destroy()
```

The last line of the client entry, after `Loader.boot` returns. Loader runs each module in its own
pcall, so this line runs even when a controller fails; the screen's timeout covers the rest.

```lua
--!strict
-- Not yet run (needs Studio).
local Players = game:GetService("Players")

Players.LocalPlayer:SetAttribute("ClientReady", true) -- local only: the server never sees it
```

## 2. StreamingEnabled

`Workspace.StreamingEnabled` is on by default in new places. No script can set it: change it in
Studio (docs, Instance streaming). Only Workspace descendants stream. ReplicatedStorage and
ReplicatedFirst always arrive whole (docs, Instance streaming, "Scope").

Client code must tolerate missing parts:

- **Wait with a timeout, or check for nil.** Use `WaitForChild(name, timeout)` when a part is
  needed, and a `FindFirstChild` nil check when it is optional (docs, Streaming techniques, "Script
  patterns").
  - At `CharacterAdded`, not every character part has arrived: `character.Humanoid` can fail, so
    wait for it.
  - A remote and the instance it names travel separately. The instance can arrive later, or never.
- **Prefer tags and attributes to WaitForChild chains.** Stephen Leitnick binds by CollectionService
  tag, waits only for the descendants he needs, and has the server set attributes so streamed parts
  arrive with their state (RDC23 panel, sSVh-bcvYSI [00:16:37]).
  - Tag signals fire on every stream-in and stream-out. Binder setup and cleanup then run each time,
    which suits visuals.
  - A stream-out is not a removal. Keep "first spawn" and counters in server attributes (docs,
    Streaming techniques).
- **Client hit queries see only streamed parts.** Raycasts, `GetPartBoundsInBox` and
  `GetBoundingBox` on the client return only what has streamed in (docs, Streaming techniques).
  - Do line of sight and hit checks on distant targets on the server. Long sightlines, such as
    sniping across the map, are where streaming breaks (sSVh-bcvYSI [00:19:20]).
  - Hit validation belongs to scenario-roblox-gameplay.
- **Server teleports request the area first.** `player:RequestStreamAroundAsync(position)` runs
  before the move (docs). MapService does this when StreamingEnabled is on.

Set `ModelStreamingMode` per model, in Properties or in a server Script, never in a LocalScript (API
reference, Model):

| Mode                | Use it for                                                                                                                           | Client waits for                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Nonatomic (Default) | most scenery                                                                                                                         | nothing: tolerate absence                                                                 |
| Atomic              | a small model scripts need whole: a spawn pad group, a door with its frame, a test dummy that a client check reads; not a whole map  | `WaitForChild` on the model only; its descendants come with it (docs, Instance streaming) |
| Persistent          | a tiny set a client script needs at all times, such as a flag carrier (Roblox Learn, VDO_amtWfDw [00:05:34]; Wwj8EkMWFhI [00:04:27]) | `Workspace.PersistentLoaded`, which fires after `Loaded` (API reference, Workspace)       |
| PersistentPerPlayer | per-player game-critical models such as plots: `Model:AddPersistentPlayer(player)`                                                   | as Persistent                                                                             |

- **Keep Persistent rare.** Overuse defeats streaming (docs, Instance streaming). A Persistent model
  inside an Atomic one makes the Atomic model persistent too (docs, Streaming techniques).
- **Map roots stay Default; mark small sub-models.** Atomic suits small models, not whole maps: an
  Atomic root streams every part of the map in together when one part comes in range, and streams
  out only when every part can (docs, Instance streaming, "Atomic"). The docs ask to decompose
  container models into small, related ones (Streaming techniques, "Model structure"). Mark the pads
  group and each landmark instead.
- **The arena maps ship Default.** No client code in the arena reads map parts (the HUD reads
  GameState attributes; hazards bind on the server), so nothing needs the map whole. O1 checks that
  the map templates carry no streaming mode.
- **Measured, streaming off (2026-10-19, 6 paired rounds):** the client's worst frame across the
  clone was 18.9 to 19.4 ms with Atomic and 18.7 to 39.5 ms with Default; p95 stayed 17.3 to 17.5
  ms. With StreamingEnabled off the mode has no effect; the one long frame (39.5 ms, in a Default
  round, with other place windows running tests) did not repeat. The cost of an Atomic map with
  streaming on was not measured here.
- **Test dummies a client test reads:** make them Atomic and place them within `StreamingMinRadius`
  (64 studs by default) of the test character. Use Persistent only while a test reads them from far
  away [added].
- **Streaming test.** Build a copy with `StreamingTargetRadius` 64. Walk and teleport across the
  map, revisit areas, and watch Output for `attempt to index nil` (docs, Streaming techniques).

```lua
--!strict
-- Client code that survives streaming. Not yet run (needs Studio).
local Players = game:GetService("Players")

Players.LocalPlayer.CharacterAdded:Connect(function(character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not (humanoid and humanoid:IsA("Humanoid")) then
		return -- not streamed in: skip this life, do not error
	end
	humanoid:SetAttribute("ClientWired", true) -- wire this life's effects to humanoid here
end)

-- Map visuals by tag: setup runs on every stream-in, the returned cleanup on every stream-out.
local mapRoots: { Instance } = { workspace }
Binder.bind("Hazard", function(part: Instance)
	local glow = Instance.new("Highlight")
	glow.Parent = part
	return glow
end, { ancestors = mapRoots })
```

## 3. Reusable core, server-only modules, team tools

**Reusable core.** Split each system into a game-agnostic core and a game-specific implementation
(Crusherfire, 6Q_p2ObUXSo [00:11:02]).

- **Package the core.** Convert the core to a Package, publish it to the group, and turn Auto Update
  on, since it is off by default (6Q_p2ObUXSo [00:25:23]; Roblox Learn, AzKZy2BqIh8 [00:08:16],
  [00:09:55]).
- **Keep game wiring outside the package.** Setup modules hold it. A simple tweak can be an
  attribute on the package folder (6Q_p2ObUXSo [00:11:35], [00:25:23]).
- **In this arena,** Loader, Binder, Signal and RoundMachine are the game-agnostic core. The
  services hold the game's wiring.
- **Use Wally for third-party code** (Leif, IJDg6tRJmHo [00:02:05]).

The package traps (docs, Packages; Roblox Learn, sU9nTX0JFyY [00:01:45]):

- Auto Update pulls a new version only when a place is opened in Studio. Live servers keep the old
  copy until the place is published again.
- Editing a copy marks it modified. A modified copy ignores Auto Update until you publish or revert
  it.
- Package scripts are read-only until you unlock them, and unlocking marks the package modified.
- With Ownership left on your user, teammates cannot update the package (AzKZy2BqIh8 [00:08:16]).
- Pick one source of truth for the core: a Rojo-synced folder rewrites the package's scripts and
  leaves it modified. Keep core code in git (Wally or the repository) or in a Package, not both
  [added].

**Server-only modules leave replicated folders on day one.** Put each server half in
ServerScriptService from the start (Leif, F3ASTJuO82A [00:01:00]; "organize early to avoid chaos
later" [00:10:43]).

- A package that must stay one folder can keep its server modules inside it. Flag them with an
  attribute, and a server Script moves them to ServerScriptService at server start, before any
  player joins. Requires keep working through a pointer module (Crusherfire, 6Q_p2ObUXSo [00:09:47],
  [00:24:18]).
- The reverse, storing everything in ServerStorage and moving the shared parts out, breaks require
  paths (6Q_p2ObUXSo [00:10:20]).
- ArchAudit `server-api-replicated` flags server APIs found in replicated code.

**Builders and scripters together.** Builders edit Workspace and the maps in Studio. Scripters edit
files.

| Tool                                 | Use for                                                                       | Trap                                                                                                                                                                                                                                                                             | Avoid it                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Team Create (live collaboration)     | builders and scripters in one place                                           | Every edit, including an agent's `execute_luau` or `multi_edit`, lands live for everyone. Auto-save every 4 minutes (scripts every 5) can overwrite a version revert made while someone edits (docs, Collaboration).                                                             | Check the Team Create state before bulk edits. Turn collaboration off before a revert.                                     |
| Collaborative editing in Drafts mode | scripters who edit and test alone, then commit                                | Drafts live on one machine until committed, and Team Test runs only committed code. Enabling Drafts mode needs every collaborator to leave the session. A script that a collaborator deletes while you draft it comes back under Workspace (docs, Collaboration, "Drafts mode"). | Commit before a Team Test. Re-parent restored scripts.                                                                     |
| Script Sync                          | scripts as local files for git and an external editor; works with Team Create | Two people syncing the same scripts overwrite each other. New instances under a synced tree get a numeric name suffix, and Loader keys modules by name. On resume, a conflict dialog asks Keep Studio or Keep Disk (docs, Script Sync, "Team Create", "Conflict resolution").    | One owner per synced folder. Check names after a sync. Never run Rojo on the same folder (SKILL.md, Current Roblox notes). |
| Rojo                                 | the file tree as the source of truth, CI                                      | Live sync overwrites Studio edits to synced scripts. A Workspace subtree in the project file clobbers what builders built (Leif, IJDg6tRJmHo [00:04:03]).                                                                                                                        | Keep Workspace out of the project file. Move the maps out of the Rojo tree once builders own them [added].                 |

## 4. Two-client tests (StudioTestService)

Two-client tests can be scripted. They are not limited to the **Server & Clients** menu (docs,
Testing modes, "Testing APIs"; API reference, StudioTestService). gui-paths.md lists the menu path
and the API limits.

**How the API works:**

- `StudioTestService:ExecuteMultiplayerTestAsync(numPlayers, args)` runs from a plugin script only,
  because it needs plugin security.
- It starts one server and 1 to 8 simulated clients, yields until the server calls `EndTest(value)`,
  and returns that value.
- It errors inside a running test. One multiplayer session runs at a time per Studio.

**Not run for this skill:** each simulated client opens a Studio window. Whether `execute_luau` can
call it from Edit was not tried. The two-team elimination path is covered by the RoundMachine Lune
tests.

**Server-side calls:**

- The server reads `args` with `GetTestArgs()`.
- `AddPlayers(n)` adds clients mid-session.
- `EndTest(value)` ends the test.

**Client-side calls:**

- A client calls `LeaveTest()` to disconnect. `CanLeaveTest()` tells whether it can.
- `GetTestArgs` has a known issue when called from a client LocalScript, so pass test data through
  the server.

Plugin side: a toolbar button, so nothing starts when Studio opens a place.

```lua
--!strict
-- Plugin script (plugin security). Not yet run (needs Studio): each simulated client opens a window.
local StudioTestService = game:GetService("StudioTestService")

local toolbar = plugin:CreateToolbar("Arena tests")
local button = toolbar:CreateButton("TwoClientRound", "One round with two clients", "")

button.Click:Connect(function()
	button.Enabled = false
	local ok, result = pcall(function()
		return StudioTestService:ExecuteMultiplayerTestAsync(2, { test = "elimination" })
	end)
	print("two-client round:", ok, result)
	button.Enabled = true
end)
```

Server side: a Script that returns at once unless the test passed its args. Ship it in a test-only
build, never in the published place.

```lua
--!strict
-- Server driver for a scripted two-client round. Not yet run (needs Studio).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local StudioTestService = game:GetService("StudioTestService")

local args = if RunService:IsStudio() then StudioTestService:GetTestArgs() else nil
if type(args) ~= "table" or args.test ~= "elimination" then
	return -- a normal playtest or a live server: do nothing
end

local gameState = ReplicatedStorage:WaitForChild("GameState")
gameState:SetAttribute("Test_Intermission", 2) -- Studio-only overrides read by RoundService
gameState:SetAttribute("Test_Round", 30)

local function waitForState(state: string, timeout: number): boolean
	local deadline = os.clock() + timeout
	while gameState:GetAttribute("RoundState") ~= state do
		if os.clock() > deadline then
			return false
		end
		task.wait(0.2)
	end
	return true
end

if not waitForState("Round", 60) then
	StudioTestService:EndTest({ ok = false, reason = "no round", players = #Players:GetPlayers() })
	return
end
-- Eliminate one player: the other team must win before the round timer ends.
local loser = Players:GetPlayers()[1]
local character = loser and loser.Character
local humanoid = character and character:FindFirstChildOfClass("Humanoid")
if humanoid then
	humanoid.Health = 0
end
local ended = waitForState("Ending", 10)
local winner = gameState:GetAttribute("Winner")
StudioTestService:EndTest({
	ok = ended and winner ~= "" and winner ~= (loser and loser.Team and loser.Team.Name),
	winner = winner,
	players = #Players:GetPlayers(),
})
```
