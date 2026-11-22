# scenario-roblox-architecture: procedures

Every procedure here ran on 2026-10-18 in Roblox Studio 0.743 on macOS, through the
scenario-roblox-expert toolkit, or offline with Rojo 7.7.1, Lune 0.11 and luau-lsp.

- Live tests: `tests/code/scenario-roblox-architecture/run_live.py` runs L0 to L10 in one command
  (`--only L6,L8` for a subset). Exit 0 all pass, 1 a failure, 3 no Studio reachable.
- Offline: `run_live.py --offline` (or `run_offline.sh`) runs O1 to O8 with no Studio. O7
  (`check_docs.py`) type-checks every Luau block of the skill's markdown.
- Lune unit tests: `tests/code/scenario-roblox-architecture/unit.luau` (18 tests, AgentKit `Spec`).
- Evidence: `tests/live_evidence/scenario-roblox-architecture/results.json`, `offline_results.json`,
  `console.txt`, `round_hud.png`.

The complete code is in the skill folder; each procedure names its files and shows the lines that
matter. Probe snippets that exist only here are complete. Every Luau block in this file passes
`rbx_check.check()` with 0 errors and 0 warnings (O7: 20 blocks on 2026-10-18).

- `scripts/rbx_architecture.py`: runner side, system `python3`.
- `scripts/agentkit/architecture/`: `Loader.luau`, `Binder.luau`, `ArchAudit.luau`, and the Lune
  runners `lune_arch_audit.luau` and `lune_place_facts.luau`.
- `scripts/templates/arena/src/`: the arena core. `fixtures/` holds deliberately wrong pieces for
  the audit tests; every fixture name starts with `Fixture`.

## 0. Setup

```python
import sys
sys.path.insert(0, "<skills>/scenario-roblox-architecture/scripts")  # also adds ../scenario-roblox-expert/scripts
import rbx_architecture as A
import rbx_env
from rbx_play import Playtest
```

One place per agent, opened once and kept open for the whole run:

```python
place = A.scaffold("tests/places/arena", name="arena")          # builds arena.rbxl, nothing published
with rbx_env.place_slot():
    s = rbx_env.open_place(place)    # binds the window if it is already open
    ...                              # every procedure below reuses `s`
    s.close()                        # closes the MCP session only; the window stays open
```

## P1. Scaffold the place (O1, L1)

`A.scaffold(dest, name, fixtures=False, overwrite=False)`:

1. copies `templates/arena/src` and Loader and Binder into `<dest>/src`;
2. builds the place with `rbx_env.new_place` and the tree below;
3. sets `"emitLegacyScripts": false` in `default.project.json` and rebuilds.

```json
{
  "emitLegacyScripts": false,
  "tree": {
    "ReplicatedFirst": { "Boot": { "$path": "src/first/Boot.client.luau" } },
    "ReplicatedStorage": {
      "Shared": { "$path": "src/shared" },
      "Client": { "$path": "src/client" },
      "GameState": {
        "$className": "Configuration",
        "$attributes": { "RoundState": "Lobby", "EndsAt": 0, "Winner": "", "Map": "" }
      }
    },
    "ServerScriptService": { "Server": { "$path": "src/server" } },
    "ServerStorage": {
      "Tools": { "$path": "src/assets/Tools" },
      "Maps": { "$path": "src/assets/Maps" }
    },
    "StarterGui": { "Shop": { "$path": "src/gui/Shop.model.json" } },
    "Teams": {
      "Red": {
        "$className": "Team",
        "$properties": { "TeamColor": { "BrickColor": 21 }, "AutoAssignable": false }
      },
      "Blue": {
        "$className": "Team",
        "$properties": { "TeamColor": { "BrickColor": 23 }, "AutoAssignable": false }
      }
    },
    "Workspace": {
      "$properties": { "SignalBehavior": "Deferred", "PlayerCharacterDestroyBehavior": "Enabled" }
    }
  }
}
```

Traps found while building it:

- Rojo rejects a TeamColor string: write `{"BrickColor": 21}`.
- Rojo 7.7.1 drops `"Position"` on a Part with exit 0 and leaves it at the origin: write a 12-number
  `"CFrame"` (the fixture door panels do). L1 asserts the Baseplate top at y 0.
- PlayerCharacterDestroyBehavior is NotScriptable, so the project file or the Properties panel sets
  it.
- The Sword Tool is `src/assets/Tools/Sword.model.json` with `"Tags": ["Sword"]` and a Handle Part.
- Rojo rejects a bare `[[0.5, 0], [0.5, 0]]` for a UDim2 ("data did not match any variant"): write
  `{"UDim2": [[0.5, 0], [0.5, 0]]}`.
- The maps `src/assets/Maps/Crossroads.model.json` and `Pillars.model.json` sit at x 400, outside
  the 512-stud lobby Baseplate, floor top at y 0; each holds a `Spawns` folder of pads and one Part
  tagged `Hazard` (P13).

Check the saved file with Lune: `A.place_facts(place)` returns the class and RunContext of every
script, part positions, every StarterGui ScreenGui (ResetOnSpawn, direct child or not) and the
Workspace settings.

Edit-time structure check (L1), run with `A.run(s, code)`:

<!-- test: L1 -->

```lua
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local remotes = 0
for _, d in game:GetDescendants() do
	if
		(d:IsA("RemoteEvent") or d:IsA("UnreliableRemoteEvent") or d:IsA("RemoteFunction"))
		and not string.find(d:GetFullName(), "Fixture")
	then
		remotes += 1
	end
end
local server = SSS:FindFirstChild("Server")
local client = RS:FindFirstChild("Client")
local serverMain = server and server:FindFirstChild("Main")
local clientMain = client and client:FindFirstChild("Main")
local boot = game:GetService("ReplicatedFirst"):FindFirstChild("Boot")
local gameState = RS:FindFirstChild("GameState")
local tools = game:GetService("ServerStorage"):FindFirstChild("Tools")
local sword = tools and tools:FindFirstChild("Sword")
local baseplate = workspace:FindFirstChild("Baseplate")
local maps = game:GetService("ServerStorage"):FindFirstChild("Maps")
local mapsInWorkspace = 0
for _, m in (if maps then maps:GetChildren() else {}) do
	if workspace:FindFirstChild(m.Name) then
		mapsInWorkspace += 1
	end
end
local shop = game:GetService("StarterGui"):FindFirstChild("Shop")
return {
	maps = if maps then #maps:GetChildren() else 0,
	mapsInWorkspace = mapsInWorkspace,
	shopResetOnSpawn = if shop and shop:IsA("ScreenGui") then shop.ResetOnSpawn else nil,
	groundTop = if baseplate and baseplate:IsA("BasePart") then baseplate.Position.Y + baseplate.Size.Y / 2 else nil,
	server = if serverMain and serverMain:IsA("Script") then tostring(serverMain.RunContext) else nil,
	client = if clientMain and clientMain:IsA("Script") then tostring(clientMain.RunContext) else nil,
	first = if boot and boot:IsA("Script") then tostring(boot.RunContext) else nil,
	swordTagged = sword ~= nil and sword:HasTag("Sword"),
	-- SignalBehavior is not readable from scripts: the pcall records the error text instead.
	signalBehavior = select(2, pcall(function()
		return tostring((workspace :: any).SignalBehavior)
	end)),
	remotes = remotes,
	roundState = if gameState then gameState:GetAttribute("RoundState") else nil,
}
```

- Offline, 2026-10-18: pass. 28 scripts in the fixture place; Server.Main RunContext Server,
  Client.Main and Boot RunContext Client; SignalBehavior Deferred and PlayerCharacterDestroyBehavior
  Enabled in the file.
- Run in Studio 0.743 on 2026-10-18: pass. RunContexts Server, Client, Client; 0 remotes outside
  fixtures; RoundState Lobby; the Sword template is tagged; Baseplate top at y 0 (the window opened
  from a build with every Part at the origin; the test harness restored 4 CFrames in Edit, then all
  tests ran again). `workspace.SignalBehavior` returned "SignalBehavior is not a valid member of
  Workspace".
- 2026-10-19, twice, on a place rebuilt with maps and GUIs: also 2 maps in ServerStorage, 0 in
  Workspace, StarterGui.Shop ResetOnSpawn false. O1 asserts the map floors' tops at y 0 and x 400,
  and the saved ResetOnSpawn of every StarterGui ScreenGui. Since 2026-10-19 it also asserts that
  the map templates carry no `ModelStreamingMode` (Default; project-setup.md, section 2). Atomic was
  set on both earlier that day and reverted: the right mode for a whole map is Default.

## P2. Entry scripts and client load order (L3, L4)

Server entry, `src/server/Main.server.luau` (Script, RunContext Server):

```lua
--!strict
-- The only server entry script (RunContext Server). Everything else is a module it boots.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Loader = require(ReplicatedStorage.Shared.Loader)

local ORDER = { "PlayerService", "TeamService", "RoundService", "WeaponService", "MapService" }
Loader.boot(Loader.ordered(script.Parent.Services, ORDER), { publish = script })
```

Client entry, `src/client/Main.client.luau` (Script, RunContext Client, in ReplicatedStorage). It
records three boot facts for the tests:

```lua
--!strict
-- The only client entry script: a Script with RunContext Client in ReplicatedStorage (runs once,
-- Output links point at this stable path). It runs after the game has loaded, so saved instances
-- in ReplicatedStorage need no WaitForChild; instances the server creates at runtime do.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Boot facts read by agent tests (local attributes, nothing replicates).
script:SetAttribute("RanAt", os.clock())
script:SetAttribute("GameLoaded", game:IsLoaded())
script:SetAttribute("HadCharacter", Players.LocalPlayer.Character ~= nil)

local Loader = require(ReplicatedStorage.Shared.Loader)

Loader.boot(Loader.ordered(script.Parent.Controllers), { publish = script })
```

ReplicatedFirst entry, `src/first/Boot.client.luau`: self-contained, it requires nothing outside
ReplicatedFirst.

```lua
--!strict
-- ReplicatedFirst runs before the rest of the game has loaded: keep it self-contained (no requires
-- outside ReplicatedFirst). The loading screen goes here; call
-- ReplicatedFirst:RemoveDefaultLoadingScreen() once your own screen shows.
script:SetAttribute("RanAt", os.clock())
script:SetAttribute("GameLoaded", game:IsLoaded())
```

The runs-twice fixture is `fixtures/FixtureTwiceProbe.client.luau`, a Script with RunContext Client
in StarterPlayerScripts:

```lua
-- FIXTURE (deliberately wrong, for ArchAudit tests): a Script with RunContext Client in
-- StarterPlayerScripts. The docs say it runs twice: the original and the PlayerScripts copy.
workspace:SetAttribute("TwiceProbeRuns", ((workspace:GetAttribute("TwiceProbeRuns") :: number?) or 0) + 1)
local paths = (workspace:GetAttribute("TwiceProbePaths") :: string?) or ""
workspace:SetAttribute("TwiceProbePaths", paths .. script:GetFullName() .. ";")
```

Read during the playtest with `pt.client(code)`:

<!-- test: L4 -->

```lua
local boot = game:GetService("ReplicatedFirst"):WaitForChild("Boot")
local main = game:GetService("ReplicatedStorage"):WaitForChild("Client"):WaitForChild("Main")
return {
	bootRanAt = boot:GetAttribute("RanAt"),
	bootLoaded = boot:GetAttribute("GameLoaded"),
	mainRanAt = main:GetAttribute("RanAt"),
	mainLoaded = main:GetAttribute("GameLoaded"),
	mainHadCharacter = main:GetAttribute("HadCharacter"),
	twiceRuns = workspace:GetAttribute("TwiceProbeRuns"),
	twicePaths = workspace:GetAttribute("TwiceProbePaths"),
}
```

Run in Studio 0.743 on 2026-10-18: pass, twice.

- Boot ran 35 to 36 ms before client Main (os.clock 91.2608 and 91.2957).
- `IsLoaded` was false in ReplicatedFirst and true in client Main; the character did not exist yet
  when client Main ran.
- The fixture ran 2 times: `StarterPlayer.StarterPlayerScripts.FixtureTwiceProbe` and
  `Players.<name>.PlayerScripts.FixtureTwiceProbe`.
- Output showed: "Warning: The script 'FixtureTwiceProbe' with a non-legacy RunContext is parented
  to a container 'StarterPlayerScripts', which will cause it to run multiple times."

## P3. Two-phase boot with Loader (O5, L3)

File: `scripts/agentkit/architecture/Loader.luau` (181 lines, `--!strict`). Copied to
`ReplicatedStorage.Shared.Loader` by `scaffold`.

Module contract:

- top level: definitions only, no connections, instances or yields, so a test or a plugin can
  require the module safely;
- `Init(self, registry)`: own state, references and signal objects; never yields;
- `Start(self, registry)`: may yield and call other modules; runs in its own thread.

API:

- `Loader.ordered(folder, first?) -> {ModuleScript}`: modules reached through Folders only, the
  names in `first` in that order, then the rest sorted by path. Two modules with one name raise an
  error.
- `Loader.boot(modules, opts?) -> Report`:
  `{ok, order, log, errors = {{name, phase, message}}, ms}`. `opts.publish = script` writes BootOk,
  BootErrors, BootLog, BootMs and BootCount.

A module that follows the contract (the four arena services have this shape):

```lua
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Signal = require(ReplicatedStorage.Shared.Signal)

local ScoreService = {}

local scores: { [Player]: number } = {}
local rounds: any

function ScoreService.Init(self: any, registry: { [string]: any })
	-- Own state and references only: other modules exist here but may not be initialized yet.
	self.Changed = Signal.new() :: Signal.Signal<Player, number>
	rounds = registry.RoundService
end

function ScoreService.Start(self: any)
	rounds.StateChanged:Connect(function(state: string)
		if state == "Lobby" then
			table.clear(scores)
		end
	end)
end

function ScoreService.Add(self: any, player: Player, points: number)
	scores[player] = (scores[player] or 0) + points
	self.Changed:Fire(player, scores[player])
end

return ScoreService
```

Boot report during a playtest: `A.boot_report(pt)` reads the Boot attributes of
`ServerScriptService.Server.Main` and `ReplicatedStorage.Client.Main`.

- Offline, 2026-10-18: 8 Loader tests pass in Lune (order, isolation of a failing require, yielding
  Init, error phases, a Start error after a yield, frozen registry, publish and BootCount,
  `ordered`).
- Run in Studio 0.743 on 2026-10-18: pass, twice. Server: BootOk true, BootErrors 0, BootCount 1,
  1.12 and 1.25 ms; log
  `require:PlayerService,...,init:TeamService,init:RoundService,init:WeaponService,start:PlayerService,start:RoundService,start:WeaponService`.
  Client: BootOk true, 0.28 and 0.35 ms. No "required recursively" and no `[Loader]` line in the
  console.
- 2026-10-19, three runs, with MapService and ShopController: server 5 services 1.68, 1.56 and 2.52
  ms, every `init:` before every `start:`; client 2 controllers 0.45, 0.40 and 1.08 ms
  (`init:RoundController,start:RoundController,start:ShopController`: ShopController has no Init).

## P4. Observe live module state (L5)

Code run through `execute_luau` does not share the game scripts' module cache. Probe, in the Server
data model during a playtest:

<!-- test: L5 -->

```lua
local services = game:GetService("ServerScriptService"):WaitForChild("Server"):WaitForChild("Services")
local m = require(services:WaitForChild("RoundService")) :: any
return { sharedCache = m.StateChanged ~= nil }
```

Run in Studio 0.743 on 2026-10-18: `sharedCache` false, twice. The require returned a fresh copy
whose Init never ran.

So each module publishes what tests need as Studio-only attributes (`publish()` in PlayerService,
P7), and tests read them from any data model.

Do not add a callable door (a BindableFunction that runs any method) for tests [added]: attributes
are read-only, cost nothing outside Studio and expose no API.

## P5. Server truth and the attribute mirror (O5, L6)

Files: `shared/RoundMachine.luau` (pure, tested in Lune), `server/Services/RoundService.luau`,
`client/Controllers/RoundController.luau`.

- RoundMachine: Lobby to Intermission at `minPlayers`, Intermission to Round after the timer, Round
  to Ending on timeout or when one team is left, Ending to Lobby. Elimination applies only when the
  round started with 2 or more players, so a solo test round runs to its timer.
- RoundService ticks every `Config.TICK` (0.25 s). On a transition it writes `EndsAt`, `Winner`,
  then `RoundState`, and fires `StateChanged`.
- `Test_MinPlayers`, `Test_Intermission`, `Test_Round` and `Test_Ending` on GameState override the
  settings in Studio only (`RunService:IsStudio()`).
- RoundController renders on `RoundState` and `EndsAt` changes and every second; the countdown is
  `EndsAt - workspace:GetServerTimeNow()`.

`server/Services/RoundService.luau`:

```lua
--!strict
-- Owns the round: truth in this module, a read-only mirror in ReplicatedStorage.GameState attributes.
-- Calls TeamService directly (it needs the result); announces states through StateChanged so
-- systems it does not know about (weapons, analytics) can react.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local RoundMachine = require(ReplicatedStorage.Shared.RoundMachine)
local Signal = require(ReplicatedStorage.Shared.Signal)

local RoundService = {}

local machine: RoundMachine.Machine
local state: Configuration
local teams: any

function RoundService.Init(self: any, registry: { [string]: any })
	self.StateChanged = Signal.new() :: Signal.Signal<string, string?>
	machine = RoundMachine.new()
	teams = registry.TeamService
	local found = ReplicatedStorage:FindFirstChild("GameState")
	if not found then
		local c = Instance.new("Configuration")
		c.Name = "GameState"
		c:SetAttribute("RoundState", "Lobby")
		c:SetAttribute("EndsAt", 0)
		c:SetAttribute("Winner", "")
		c.Parent = ReplicatedStorage
		found = c
	end
	state = found :: Configuration
end

-- Test_* attributes on GameState shorten the loop in Studio only; live servers ignore them.
function RoundService.Settings(_self: any): RoundMachine.Settings
	local s: RoundMachine.Settings = {
		minPlayers = Config.MIN_PLAYERS,
		intermission = Config.INTERMISSION,
		round = Config.ROUND,
		ending = Config.ENDING,
	}
	if RunService:IsStudio() then
		s.minPlayers = (state:GetAttribute("Test_MinPlayers") :: number?) or s.minPlayers
		s.intermission = (state:GetAttribute("Test_Intermission") :: number?) or s.intermission
		s.round = (state:GetAttribute("Test_Round") :: number?) or s.round
		s.ending = (state:GetAttribute("Test_Ending") :: number?) or s.ending
	end
	return s
end

function RoundService.GetState(_self: any): string
	return machine.state
end

function RoundService.Enter(self: any, new: string)
	local list = Players:GetPlayers()
	if new == "Round" then
		teams:Assign(list)
	elseif new == "Lobby" then
		teams:Clear(list)
	end
	-- Same-type changes generally arrive in order; clients still re-render on every attribute.
	state:SetAttribute("EndsAt", if machine.endsAt == math.huge then 0 else machine.endsAt)
	state:SetAttribute("Winner", machine.winner or "")
	state:SetAttribute("RoundState", new)
	self.StateChanged:Fire(new, machine.winner)
end

function RoundService.Start(self: any)
	while true do
		local alive, last = teams:AliveTeams()
		local snap: RoundMachine.Snapshot = { players = #Players:GetPlayers(), teamsAlive = alive, winner = last }
		local new = RoundMachine.step(machine, self:Settings(), workspace:GetServerTimeNow(), snap)
		if new then
			self:Enter(new)
		end
		task.wait(Config.TICK)
	end
end

return RoundService
```

`client/Controllers/RoundController.luau`:

```lua
--!strict
-- Round HUD: reads the server's GameState mirror and never owns round state.
-- Layout and styling belong to the UI layer; this is the minimum that proves the data path.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local RoundController = {}

local gameState: Configuration
local label: TextLabel
local gui: ScreenGui

function RoundController.Init(_self: any)
	local found = ReplicatedStorage:FindFirstChild("GameState")
	assert(found and found:IsA("Configuration"), "ReplicatedStorage.GameState is missing")
	gameState = found
	gui = Instance.new("ScreenGui")
	gui.Name = "RoundHud"
	gui.ResetOnSpawn = false
	label = Instance.new("TextLabel")
	label.Name = "Status"
	label.AnchorPoint = Vector2.new(0.5, 0)
	label.Position = UDim2.fromScale(0.5, 0.02)
	label.Size = UDim2.fromScale(0.3, 0.07)
	label.BackgroundColor3 = Color3.fromRGB(20, 20, 24)
	label.BackgroundTransparency = 0.25
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	local limit = Instance.new("UITextSizeConstraint")
	limit.MaxTextSize = 36
	limit.Parent = label
	label.Parent = gui
end

function RoundController.Text(_self: any): string
	local round = (gameState:GetAttribute("RoundState") :: string?) or "Lobby"
	local endsAt = (gameState:GetAttribute("EndsAt") :: number?) or 0
	if endsAt <= 0 then
		return round
	end
	local left = math.max(0, math.ceil(endsAt - workspace:GetServerTimeNow()))
	return string.format("%s %d:%02d", round, left // 60, left % 60)
end

function RoundController.Start(self: any)
	gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
	local function render()
		local text = self:Text()
		label.Text = text
		if RunService:IsStudio() then
			script:SetAttribute("Shown", text)
		end
	end
	gameState:GetAttributeChangedSignal("RoundState"):Connect(render)
	gameState:GetAttributeChangedSignal("EndsAt"):Connect(render)
	render() -- without this first call the current state never shows
	while true do
		task.wait(1)
		render()
	end
end

return RoundController
```

The test sets the overrides in Edit before the playtest (removed afterwards; the place is never
saved):

<!-- test: SET_TEST -->

```lua
local gs = game:GetService("ReplicatedStorage"):WaitForChild("GameState")
for k, v in { Test_MinPlayers = 1, Test_Intermission = 3, Test_Round = 20, Test_Ending = 2 } do
	gs:SetAttribute(k, v)
end
return gs:GetAttributes()
```

Server read (`pt.server`):

<!-- test: L6_SERVER -->

```lua
local services = game:GetService("ServerScriptService"):WaitForChild("Server"):WaitForChild("Services")
local p = game:GetService("Players"):GetPlayers()[1]
local swords = 0
for _, c in { p:FindFirstChildOfClass("Backpack") :: Instance?, p.Character :: Instance? } do
	if c then
		for _, i in c:GetChildren() do
			if i:HasTag("Sword") then
				swords += 1
			end
		end
	end
end
return {
	state = game:GetService("ReplicatedStorage"):WaitForChild("GameState"):GetAttribute("RoundState"),
	team = if p.Team then p.Team.Name else nil,
	swords = swords,
	bound = services:WaitForChild("WeaponService"):GetAttribute("Bound"),
}
```

Client read (`pt.client`):

<!-- test: L6_CLIENT -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local rc = ReplicatedStorage:WaitForChild("Client"):WaitForChild("Controllers"):WaitForChild("RoundController")
local gui = game:GetService("Players").LocalPlayer.PlayerGui:FindFirstChild("RoundHud")
local status = gui and gui:FindFirstChild("Status")
return {
	state = ReplicatedStorage:WaitForChild("GameState"):GetAttribute("RoundState"),
	shown = rc:GetAttribute("Shown"),
	label = if status and status:IsA("TextLabel") then status.Text else nil,
}
```

Then `pt.capture(EVID / "round_hud.png")`, `rbx_review.image_checks(png)`, and open the PNG.

- Offline, 2026-10-18: 3 RoundMachine tests pass in Lune.
- Run in Studio 0.743 on 2026-10-18: pass, twice. Server: Round, team Red, 1 sword, Bound 1. Client:
  state Round, Shown and label "Round 0:16". Capture: no `image_checks` flag, mean luma 0.38 to
  0.46; opened, the HUD reads "Round 0:16" above the character. After the round: Intermission, Bound
  0, no team.

## P6. Behavior by tag with Binder (L8, L6)

File: `scripts/agentkit/architecture/Binder.luau` (153 lines).
`Binder.bind(tag, setup, {ancestors = {...}}) -> unbind`; `setup(inst)` returns a cleanup that
`Binder.clean` runs: a function, a connection, an Instance, a thread, an object with Destroy or
Disconnect, or an array of these.

Use in a service (`WeaponService.Start`):

```lua
--!strict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Binder = require(ReplicatedStorage.Shared.Binder)

local unbind = Binder.bind("Sword", function(tool: Instance)
	return (tool :: Tool).Activated:Connect(function()
		tool:SetAttribute("Swings", ((tool:GetAttribute("Swings") :: number?) or 0) + 1)
	end)
end, { ancestors = { workspace, Players } })

return unbind
```

Lifecycle probe (L8), inlined with `A.run(s, code, dm="Server", kit=["Binder"])`. The kit defines
the local `Binder`.

<!-- test: L8 -->

```lua
local CollectionService = game:GetService("CollectionService")
local ServerStorage = game:GetService("ServerStorage")
local TAG = "ArchProbe"
local n, setups, cleanups, rawAdded = 0, 0, 0, 0
local raw = CollectionService:GetInstanceAddedSignal(TAG):Connect(function()
	rawAdded += 1
end)
local template = Instance.new("Part")
template.Anchored = true
template:AddTag(TAG)
template.Parent = ServerStorage
local live = Instance.new("Part")
live.Anchored = true
live:AddTag(TAG)
live.Parent = workspace
local unbind = Binder.bind(TAG, function()
	n += 1
	setups += 1
	return function()
		n -= 1
		cleanups += 1
	end
end)
local steps = {}
local function step(name: string)
	task.wait(0.15)
	table.insert(steps, name .. "=" .. n)
end
step("initial")
local clone = template:Clone()
clone.Parent = workspace
step("clone")
live.Parent = ServerStorage
step("toStorage")
local addedBefore = rawAdded
live.Parent = workspace
step("back")
local reparentFiredAdded = rawAdded > addedBefore
clone:RemoveTag(TAG)
step("removeTag")
clone:AddTag(TAG)
step("addTag")
live:Destroy()
step("destroy")
unbind()
step("unbind")
raw:Disconnect()
clone:Destroy()
template:Destroy()
return {
	steps = table.concat(steps, ","),
	setups = setups,
	cleanups = cleanups,
	reparentFiredAdded = reparentFiredAdded,
}
```

Run in Studio 0.743 on 2026-10-18: pass in 6 of 7 runs. In one full run the MCP call got no answer
in 60 s; the next single and full runs passed.

- Steps `initial=1,clone=2,toStorage=1,back=2,removeTag=1,addTag=2,destroy=1,unbind=0`; 4 setups and
  4 cleanups.
- The tagged template in ServerStorage was never bound.
- `reparentFiredAdded` false: moving a tagged part from ServerStorage to Workspace fired no
  InstanceAdded.

## P7. Lifetimes: players, characters, respawn (L7)

Files: `server/Services/PlayerService.luau`, `server/Services/WeaponService.luau`.

- PlayerService connects PlayerAdded first, then loops over the players already in game.
- It clears a character entry on CharacterRemoving and on `character.Destroying:Once`, and both
  tables on PlayerRemoving.
- WeaponService gives the sword at Round, takes it at Lobby, and gives it again on CharacterAdded
  during a Round. A respawn empties the Backpack.

`server/Services/PlayerService.luau`:

```lua
--!strict
-- Owns per-player and per-character server state, and removes it when they go.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

export type PlayerState = { joinedAt: number, kills: number }

local PlayerService = {}

local players: { [Player]: PlayerState } = {}
local characters: { [Model]: Player } = {}

local function size(t: { [any]: any }): number
	local n = 0
	for _ in t do
		n += 1
	end
	return n
end

-- Studio-only debug attributes: agent tests read them from any data model, no test door needed.
local function publish()
	if RunService:IsStudio() then
		script:SetAttribute("Players", size(players))
		script:SetAttribute("Characters", size(characters))
	end
end

local function onCharacter(player: Player, character: Model)
	characters[character] = player
	-- Deferred signals: this runs after the destroy, so it only clears, it never reads the character.
	character.Destroying:Once(function()
		characters[character] = nil
		publish()
	end)
	publish()
end

local function onPlayer(player: Player)
	players[player] = { joinedAt = os.clock(), kills = 0 }
	player.CharacterAdded:Connect(function(character)
		onCharacter(player, character)
	end)
	player.CharacterRemoving:Connect(function(character)
		characters[character] = nil
		publish()
	end)
	if player.Character then
		onCharacter(player, player.Character)
	end
	publish()
end

function PlayerService.Start(_self: any)
	-- Connect first, then catch players who joined before this ran.
	Players.PlayerAdded:Connect(onPlayer)
	Players.PlayerRemoving:Connect(function(player)
		players[player] = nil
		for character, owner in characters do
			if owner == player then
				characters[character] = nil
			end
		end
		publish()
	end)
	for _, player in Players:GetPlayers() do
		if not players[player] then
			onPlayer(player)
		end
	end
end

function PlayerService.Get(_self: any, player: Player): PlayerState?
	return players[player]
end

return PlayerService
```

`server/Services/WeaponService.luau`:

```lua
--!strict
-- Weapons by tag: every Tool tagged Config.WEAPON_TAG in a character or a Backpack gets its server
-- behavior from here. The template in ServerStorage carries the tag too and is never bound.
-- Hit validation and damage belong to the combat and networking layer; Activated is only an intent.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local Binder = require(ReplicatedStorage.Shared.Binder)
local Config = require(ReplicatedStorage.Shared.Config)

local WeaponService = {}

local template: Tool
local bound = 0
local unbind: (() -> ())?

local function publish()
	if RunService:IsStudio() then
		script:SetAttribute("Bound", bound)
	end
end

local function containers(player: Player): { Instance }
	local list: { Instance } = {}
	local backpack = player:FindFirstChildOfClass("Backpack")
	if backpack then
		table.insert(list, backpack)
	end
	if player.Character then
		table.insert(list, player.Character)
	end
	return list
end

local function hasWeapon(player: Player): boolean
	for _, container in containers(player) do
		for _, item in container:GetChildren() do
			if item:HasTag(Config.WEAPON_TAG) then
				return true
			end
		end
	end
	return false
end

function WeaponService.Init(_self: any)
	local tools = ServerStorage:FindFirstChild("Tools")
	local found = tools and tools:FindFirstChild("Sword")
	assert(found and found:IsA("Tool"), "ServerStorage.Tools.Sword (Tool) is missing")
	template = found
end

local function setup(tool: Instance)
	bound += 1
	publish()
	local swing = (tool :: Tool).Activated:Connect(function()
		tool:SetAttribute("Swings", ((tool:GetAttribute("Swings") :: number?) or 0) + 1)
	end)
	local cleanup: { any } = {
		swing,
		function()
			bound -= 1
			publish()
		end,
	}
	return cleanup
end

function WeaponService.Start(self: any, registry: { [string]: any })
	local rounds = registry.RoundService
	unbind = Binder.bind(Config.WEAPON_TAG, setup, { ancestors = { workspace, Players } })
	publish()
	rounds.StateChanged:Connect(function(state: string)
		if state == "Round" then
			self:GiveAll()
		elseif state == "Lobby" then
			self:TakeAll()
		end
	end)
	-- A respawn empties the Backpack, and a late joiner has none yet: give again during a round.
	local function onPlayer(player: Player)
		player.CharacterAdded:Connect(function()
			if rounds:GetState() == "Round" then
				self:Give(player)
			end
		end)
	end
	Players.PlayerAdded:Connect(onPlayer)
	for _, player in Players:GetPlayers() do
		onPlayer(player)
	end
end

function WeaponService.Give(_self: any, player: Player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if backpack and not hasWeapon(player) then
		template:Clone().Parent = backpack
	end
end

function WeaponService.GiveAll(self: any)
	for _, player in Players:GetPlayers() do
		self:Give(player)
	end
end

function WeaponService.TakeAll(_self: any)
	for _, player in Players:GetPlayers() do
		for _, container in containers(player) do
			for _, item in container:GetChildren() do
				if item:HasTag(Config.WEAPON_TAG) then
					item:Destroy()
				end
			end
		end
	end
end

function WeaponService.Stop(_self: any)
	if unbind then
		unbind()
		unbind = nil
	end
end

return WeaponService
```

Respawn probe (L7), run when at least 13 s of the round remain, with
`rbx_run.run(s, code, dm="Server", kit=["Stats"])`:

<!-- test: L7 -->

```lua
local services = game:GetService("ServerScriptService"):WaitForChild("Server"):WaitForChild("Services")
local p = game:GetService("Players"):GetPlayers()[1]
local function swords(): number
	local count = 0
	for _, c in { p:FindFirstChildOfClass("Backpack") :: Instance?, p.Character :: Instance? } do
		if c then
			for _, i in c:GetChildren() do
				if i:HasTag("Sword") then
					count += 1
				end
			end
		end
	end
	return count
end
local before = Stats.snapshot()
local boundBefore = services:WaitForChild("WeaponService"):GetAttribute("Bound")
for _ = 1, 5 do
	p:LoadCharacterAsync()
	task.wait(0.5)
end
task.wait(1.5)
local after = Stats.snapshot()
return {
	state = game:GetService("ReplicatedStorage"):WaitForChild("GameState"):GetAttribute("RoundState"),
	characters = services:WaitForChild("PlayerService"):GetAttribute("Characters"),
	players = services:WaitForChild("PlayerService"):GetAttribute("Players"),
	boundBefore = boundBefore,
	bound = services:WaitForChild("WeaponService"):GetAttribute("Bound"),
	swords = swords(),
	instancesBefore = before.instances,
	instancesAfter = after.instances,
	rootX = if p.Character then p.Character:GetPivot().Position.X else nil, -- MapService puts respawns on the map
}
```

Run in Studio 0.743 on 2026-10-18: pass, 6 runs. State Round; Characters 1, Players 1; Bound 1
before and after; 1 sword. Instances 46,150 to 46,153 (5 runs) and 46,156 to 46,153.

Run again on 2026-10-19 with MapService, twice: pass. The same counts; instances 46,197 to 46,200
and 46,203 to 46,200; `rootX` 400, the character back on the map pad after each respawn.

## P8. Ordering traps: replication, Deferred handlers, removal (L9, L13)

What the sources say, checked before writing:

| Trap                                                                                                                                                                                     | Source                                                                 | Safe pattern                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A property or attribute change and a remote are not ordered relative to each other: `SetAttribute` then `FireAllClients` can arrive either way round                                     | docs, Attributes, "Replication order"; docs, Server Authority overview | put the state the handler needs in the remote payload, or publish state only as attributes and render on their change signals (two attribute changes generally arrive in order) |
| RemoteEvents are ordered with each other, across instances, per connection and direction; a RemoteFunction is not ordered with them; ordering is when a handler starts, not when it ends | docs, Remote events, "Delivery guarantees"                             | one remote type for related messages, or a sequence number; never assume a yielding handler finished                                                                            |
| A handler connected inside another handler misses the fire that is already queued                                                                                                        | Crusherfire, xz_G2n1Q8-U [00:03:19 to 00:05:51]; docs, Deferred events | connect every listener before the first fire (boot Init), or `Once`                                                                                                             |
| Nested fires run breadth-first under Deferred: A fires C, main fires A then B, the order is A, B, C (Immediate: A, C, B)                                                                 | Crusherfire [00:06:06 to 00:08:52]; docs, Deferred events diagram      | never depend on the order of nested handlers; call the dependent function directly                                                                                              |
| Removal handlers (`Destroying`, `CharacterRemoving`, `ChildRemoved`) run after the removal: Parent is nil                                                                                | Crusherfire [00:08:54 to 00:13:17]; docs, Deferred events              | capture what you need before `Destroy` or when the object arrives (CharacterAdded), and only clear tables in the handler                                                        |

RoundService follows the second pattern: it writes `EndsAt`, `Winner`, then `RoundState`, and
RoundController re-renders on each change and reads all of them, so a late `EndsAt` only delays the
countdown by one change.

<!-- test: L9 -->

```lua
local p = Instance.new("Part")
p.Anchored = true
p.Parent = workspace
local seen = "unset"
p.Destroying:Connect(function()
	seen = if p.Parent then p.Parent:GetFullName() else "nil"
end)
p:Destroy()
local beforeYield = seen
task.wait(0.1)
return { beforeYield = beforeYield, inHandler = seen }
```

Run in Studio 0.743 on 2026-10-18 (Server data model, place saved with SignalBehavior Deferred):
pass, twice. `beforeYield` "unset" (the handler had not run), `inHandler` "nil". Under Immediate
signals the handler would run inside `Destroy` [docs, Deferred events].

Handler-order probe (L13), Server data model through `pt.server`. It also runs the safe patterns:
connect before firing, and capture before removal.

<!-- test: L13 -->

```lua
local Players = game:GetService("Players")
local function settle()
	for _ = 1, 3 do
		task.wait()
	end
end

-- 1. A listener connected inside another handler misses the fire already queued.
local a, b = Instance.new("BindableEvent"), Instance.new("BindableEvent")
local late = 0
a.Event:Connect(function()
	b.Event:Connect(function()
		late += 1
	end)
end)
a:Fire()
b:Fire()
settle()

-- Safe: connect before firing.
local c = Instance.new("BindableEvent")
local early = 0
c.Event:Connect(function()
	early += 1
end)
c:Fire()
settle()

-- 2. Nested fires: A's handler fires C; the main code fires A then B.
local order = {}
local evA, evB, evC = Instance.new("BindableEvent"), Instance.new("BindableEvent"), Instance.new("BindableEvent")
evA.Event:Connect(function()
	table.insert(order, "A")
	evC:Fire()
end)
evB.Event:Connect(function()
	table.insert(order, "B")
end)
evC.Event:Connect(function()
	table.insert(order, "C")
end)
evA:Fire()
evB:Fire()
settle()

-- 3. CharacterRemoving runs after the old character left the DataModel. Safe: capture first.
local player = Players:GetPlayers()[1]
local old = player.Character
local captured = if old then old:GetPivot().Position else nil
local seen: { [string]: any } = {}
local conn = player.CharacterRemoving:Connect(function(character: Model)
	seen.parent = if character.Parent then character.Parent:GetFullName() else "nil"
	seen.root = character:FindFirstChild("HumanoidRootPart") ~= nil
end)
player:LoadCharacterAsync()
settle()
task.wait(0.5)
conn:Disconnect()
for _, e in { a, b, c, evA, evB, evC } do
	e:Destroy()
end
return {
	lateCatch = late,
	connectBefore = early,
	order = table.concat(order, ","),
	removingParent = seen.parent,
	removingRoot = seen.root,
	captured = captured ~= nil,
}
```

Property versus remote probe (L13, second part). Five short calls, because a client listener has to
exist before the server fires:

<!-- test: L13_R_SETUP -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
for _, name in { "ProbeOrder", "ProbeState" } do
	local old = ReplicatedStorage:FindFirstChild(name)
	if old then
		old:Destroy()
	end
end
local remote = Instance.new("RemoteEvent")
remote.Name = "ProbeOrder"
remote.Parent = ReplicatedStorage
local state = Instance.new("Configuration")
state.Name = "ProbeState"
state:SetAttribute("Seq", 0)
state.Parent = ReplicatedStorage
return true
```

<!-- test: L13_R_LISTEN -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = ReplicatedStorage:WaitForChild("ProbeOrder") :: RemoteEvent
local state = ReplicatedStorage:WaitForChild("ProbeState")
remote.OnClientEvent:Connect(function(seq: number)
	-- What the handler sees: the payload, and the attribute at that moment. Local attributes on the
	-- client copy never replicate, and a later call reads them.
	remote:SetAttribute("r" .. seq, state:GetAttribute("Seq"))
end)
return true
```

<!-- test: L13_R_FIRE -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = ReplicatedStorage:WaitForChild("ProbeOrder") :: RemoteEvent
local state = ReplicatedStorage:WaitForChild("ProbeState")
for seq = 1, 40 do
	if seq <= 20 then
		state:SetAttribute("Seq", seq) -- attribute first, then the remote (the common trap)
		remote:FireAllClients(seq)
	else
		remote:FireAllClients(seq) -- remote first, then the attribute
		state:SetAttribute("Seq", seq)
	end
	task.wait(0.05)
end
task.wait(1)
return true
```

<!-- test: L13_R_READ -->

```lua
local remote = game:GetService("ReplicatedStorage"):WaitForChild("ProbeOrder")
local out = {
	attributeFirst = { received = 0, current = 0, stale = 0 },
	remoteFirst = { received = 0, current = 0, stale = 0 },
}
for seq = 1, 40 do
	local seen = remote:GetAttribute("r" .. seq) :: number?
	local bucket = if seq <= 20 then out.attributeFirst else out.remoteFirst
	if seen ~= nil then
		bucket.received += 1
		if seen == seq then
			bucket.current += 1
		elseif seen < seq then
			bucket.stale += 1
		end
	end
end
return out
```

<!-- test: L13_R_CLEAN -->

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
for _, name in { "ProbeOrder", "ProbeState" } do
	local old = ReplicatedStorage:FindFirstChild(name)
	if old then
		old:Destroy()
	end
end
return true
```

Run in Studio 0.743 on 2026-10-19 (playtest, place saved with SignalBehavior Deferred): pass, twice
on 2026-10-19 (full runs at about 00:59 and 01:01), with the same values both times.

- Connect inside a handler: `lateCatch` 0, the listener missed the fire. Connected before firing:
  `connectBefore` 1.
- Nested fires: order A, B, C (breadth-first, as Crusherfire shows for Deferred).
- CharacterRemoving: Parent read "nil" inside the handler, yet `HumanoidRootPart` was still a child.
  Only Parent is gone, so read positions and other state before the respawn (`captured` true).
- Property versus remote at 0 ms latency: 20 of 20 handlers saw the current attribute when the
  attribute was set first, and also 20 of 20 when the remote fired first. The deferred handler ran
  after both arrived in the same frame. Studio hides the trap both ways: this is not evidence of
  ordering.
- A connection made by one `execute_luau` call on the Client kept firing after the call returned, so
  later calls can read what it recorded.

What Studio could not test:

- Immediate versus Deferred side by side: `workspace.SignalBehavior` cannot be read or set from
  `execute_luau` (P1), so the Immediate column comes from the docs and Crusherfire. Switch it in
  Properties to compare by hand.
- Property versus remote order under real latency and loss: a solo playtest has 0 ms latency and
  Network Simulation is a GUI setting (gui-paths.md). A probe that sees every attribute already
  current proves nothing about live servers; the docs are the authority and the safe patterns above
  hold either way.

## P9. Architecture audit (O3, O4, L2)

File: `scripts/agentkit/architecture/ArchAudit.luau`. Offline: `A.audit_file(place)` (Lune). Live:
`A.run(s, "return ArchAudit.all(game)", kit=["ArchAudit"])`. It complements AgentKit `Audit`; rule
names do not overlap.

| Rule                               | Severity | Catches                                                                                   |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `runs-twice`                       | error    | Client Script in a Starter container                                                      |
| `require-cycle`                    | error    | a cycle in the static require graph                                                       |
| `client-requires-server`           | error    | client-visible code requiring ServerScriptService or ServerStorage modules                |
| `entry-count`                      | warn     | more than 1 entry script per side                                                         |
| `script-in-workspace`              | warn     | a script inside a Workspace instance (info when packaged)                                 |
| `duplicate-source`                 | warn     | 2 or more scripts with identical source                                                   |
| `server-api-replicated`            | warn     | ServerStorage, ProcessReceipt, MemoryStoreService, HTTP or secrets in client-visible code |
| `service-requires-ui`              | warn     | a service module requiring a UI module                                                    |
| `replicatedfirst-requires-outside` | warn     | ReplicatedFirst code requiring other services                                             |
| `player-table-no-cleanup`          | warn     | a table keyed by Player with no PlayerRemoving                                            |
| `character-table-no-cleanup`       | warn     | a table keyed by character with no CharacterRemoving or Destroying                        |
| `global-registry`                  | warn     | `_G` or `shared` used as a registry                                                       |
| `sibling-name-collision`           | warn     | 2 siblings with one name (string requires break)                                          |
| `reset-ignored-nested`             | warn     | a ScreenGui with ResetOnSpawn false inside a Folder under StarterGui (it resets anyway)   |
| `maps-replicated`                  | warn     | a `Maps` folder of Models in ReplicatedStorage, Workspace or another replicated container |
| `hand-made-remote`                 | info     | a remote saved in the place                                                               |
| `package-autoupdate-off`           | info     | a PackageLink with AutoUpdate off                                                         |
| `legacy-runcontext`                | info     | Script with RunContext Legacy                                                             |
| `module-size`                      | info     | a module over 500 lines                                                                   |
| `class-connection-unstored`        | info     | a class module connection whose handle is not kept                                        |
| `removing-reads-parent`            | info     | a removal handler that reads `.Parent`                                                    |

It resolves `require` arguments through `script`, `game`, GetService aliases, `WaitForChild`,
`FindFirstChild`, `.Parent`, and the string prefixes `./`, `../`, `@self/` and `@game/`.

- Offline, 2026-10-18: pass. Fixture place: 3 errors, 13 warnings, 3 infos, every expected rule on
  its fixture, 0 findings outside fixtures, 13 resolved edges, 0 unresolved. 2026-10-19, with the
  two GUI and map fixtures: 3 errors, 15 warnings, 3 infos; `reset-ignored-nested` on
  `StarterGui.FixtureScreens.FixtureNested`, `maps-replicated` on `ReplicatedStorage.Fixtures.Maps`.
  Clean skeleton: 0 errors, 0 warnings; AgentKit `lune_audit` 0 errors, 0 warnings, 1 info (no
  Atmosphere).
- Run in Studio 0.743 on 2026-10-18: pass. Live tally equals the offline tally (3, 13, 3). AgentKit
  `Audit.all(game)`: 0 errors, 1 warning (the fixture remote has no handler), 1 info. 2026-10-19,
  twice: live equals offline (3, 15, 3), 15 resolved edges; AgentKit 0 errors, 1 warning, 2 infos
  (one is its `reset-on-spawn` info on FixturePerLife).
- 4 Lune unit tests cover `resolve` (strings, instance paths and aliases), `requires` and `side`.

## P10. Rojo suffixes and emitLegacyScripts (O2)

Build the same five files with and without `"emitLegacyScripts": false`, then read classes with
`A.place_facts`.

| File            | Default (true)          | `false`                 |
| --------------- | ----------------------- | ----------------------- |
| `S.server.luau` | Script, Legacy          | Script, Server          |
| `C.client.luau` | LocalScript             | Script, Client          |
| `L.local.luau`  | ModuleScript `L.local`  | ModuleScript `L.local`  |
| `G.legacy.luau` | ModuleScript `G.legacy` | ModuleScript `G.legacy` |
| `M.luau`        | ModuleScript            | ModuleScript            |

Offline with Rojo 7.7.1, 2026-10-18: pass, as in the table.

## P11. Sync sources into the open place (L0)

The place stays open for the whole run, so edits go in live. `A.update_sources(dest)` copies the
template files into `<dest>/src` without rebuilding the open `.rbxl`. `A.sync_sources(s, dest)` then
reads the Rojo sourcemap and writes every `.luau` into the matching script's `Source` in the Edit
data model. It returns `{changed, missing, same}` and saves nothing.

Run in Studio 0.743 on 2026-10-18: pass. 26 scripts matched, 0 missing. 2026-10-19, with MapService
and ShopController: 28 matched, 0 missing.

## P12. CreateCollection probe (L10)

`CollectionService:CreateCollection(query, root)` is in the API reference: a live, query-based group
with `OnAdded` and `OnRemoved`. Probe it before relying on it:

<!-- test: L10 -->

```lua
local CollectionService = game:GetService("CollectionService") :: any
if type(CollectionService.CreateCollection) ~= "function" then
	return { exists = false }
end
local ok, err = pcall(function()
	local col = CollectionService:CreateCollection(".ArchProbe2", workspace)
	col:Destroy()
end)
return { exists = true, works = ok, error = if ok then nil else tostring(err) }
```

Run in Studio 0.743 on 2026-10-18 (Server data model): the method exists, and the call errored
"Collections are not enabled". Keep tags and Binder until it ships.

## P13. Map rotation from ServerStorage (L11, L7)

Docs, Data model, "ServerStorage": store large objects such as maps there "until they are needed and
move them into the workspace only when required. This lets you decrease client network traffic on
initial join." GnomeCode's round loop (oEWoyT-GBZY [00:11:03 to 00:13:51]) clones one map per round
and destroys it after, so damage never carries over, but keeps the maps in ReplicatedStorage, which
every client downloads at join: keep the clone-and-destroy loop, move the storage to ServerStorage.
ArchAudit `maps-replicated` flags a `Maps` folder of Models in a replicated container.

Lifecycle, driven by `RoundService.StateChanged`:

| State entered | MapService                                                                              |
| ------------- | --------------------------------------------------------------------------------------- |
| Intermission  | clone the next map (name order) into Workspace; clients receive it during the countdown |
| Round         | place every player on the map's pads; a respawn during the round goes back to the map   |
| Ending        | keep the map (the winner screen shows on it)                                            |
| Lobby         | move players to the lobby SpawnLocation, drop the reference, `Destroy` the map          |

Per-map behavior (the `Hazard` part) is bound by tag through Binder with
`ancestors = { workspace }`, so the templates in ServerStorage are never bound and destroying the
map runs every cleanup. With StreamingEnabled, `RequestStreamAroundAsync` runs before the teleport
(GnomeCode note, added from the version deltas).

File: `scripts/templates/arena/src/server/Services/MapService.luau` (booted after WeaponService).

```lua
--!strict
-- Maps: every arena lives in ServerStorage.Maps, which never replicates, so a joining player downloads
-- none of them. One clone per round goes into Workspace at Intermission (clients receive it during the
-- countdown) and is destroyed on the way back to Lobby, which also resets whatever the round broke.
-- Per-map behavior is bound by tag (Binder), so destroying the map is the whole cleanup: no list of
-- per-map connections to keep in sync. Maps rotate in name order.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local Binder = require(ReplicatedStorage.Shared.Binder)
local Config = require(ReplicatedStorage.Shared.Config)

local MapService = {}

local maps: { Model } = {}
local gameState: Configuration
local lobby: BasePart?
local current: Model?
local nextIndex = 1
local hazards = 0
local loads, unloads = 0, 0
local unbind: (() -> ())?

local function publish()
	gameState:SetAttribute("Map", if current then current.Name else "")
	if RunService:IsStudio() then
		script:SetAttribute("Hazards", hazards)
		script:SetAttribute("Loads", loads)
		script:SetAttribute("Unloads", unloads)
	end
end

function MapService.Init(_self: any)
	local folder = ServerStorage:FindFirstChild("Maps")
	assert(folder, "ServerStorage.Maps is missing")
	for _, m in folder:GetChildren() do
		if m:IsA("Model") and m:FindFirstChild("Spawns") then
			table.insert(maps, m)
		end
	end
	assert(#maps > 0, "ServerStorage.Maps has no Model with a Spawns folder")
	table.sort(maps, function(a: Model, b: Model)
		return a.Name < b.Name
	end)
	-- RoundService boots first and creates GameState when the place has none.
	local found = ReplicatedStorage:FindFirstChild("GameState")
	assert(found and found:IsA("Configuration"), "ReplicatedStorage.GameState is missing")
	gameState = found
	lobby = workspace:FindFirstChildOfClass("SpawnLocation")
end

-- A hazard part kills on touch. The template in ServerStorage carries the tag too and is never bound.
local function hazard(part: Instance)
	hazards += 1
	publish()
	local touched = (part :: BasePart).Touched:Connect(function(hit: BasePart)
		local model = hit:FindFirstAncestorOfClass("Model")
		local humanoid = model and model:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.Health = 0
		end
	end)
	local cleanup: { any } = {
		touched,
		function()
			hazards -= 1
			publish()
		end,
	}
	return cleanup
end

-- Red takes the first pad, Blue the second; players without a team take the first.
local function padFor(player: Player): BasePart?
	local spawns = current and current:FindFirstChild("Spawns")
	if not spawns then
		return nil
	end
	local pads = spawns:GetChildren()
	table.sort(pads, function(a: Instance, b: Instance)
		return a.Name < b.Name
	end)
	local i = if player.Team then table.find(Config.TEAMS, player.Team.Name) or 1 else 1
	local pad = pads[(i - 1) % #pads + 1]
	return if pad and pad:IsA("BasePart") then pad else nil
end

local function place(player: Player, target: CFrame)
	local character = player.Character
	if not character then
		return
	end
	if workspace.StreamingEnabled then
		player:RequestStreamAroundAsync(target.Position) -- yields: callers run this in its own thread
	end
	character:PivotTo(target + Vector3.new(0, 3, 0))
end

function MapService.Load(_self: any): Model
	if current then
		return current
	end
	local map = maps[nextIndex]:Clone()
	nextIndex = nextIndex % #maps + 1
	map.Parent = workspace
	current = map
	loads += 1
	publish()
	return map
end

function MapService.Unload(_self: any)
	local map = current
	if not map then
		return
	end
	current = nil -- drop the only reference first: nothing keeps the destroyed map alive
	local spawn = lobby
	for _, player in Players:GetPlayers() do
		local character = player.Character
		if spawn and character then
			character:PivotTo(spawn.CFrame + Vector3.new(0, 3, 0))
		end
	end
	map:Destroy() -- tagged parts leave the DataModel, so Binder runs every hazard cleanup
	unloads += 1
	publish()
end

function MapService.GetMap(_self: any): Model?
	return current
end

function MapService.Start(self: any, registry: { [string]: any })
	local rounds = registry.RoundService
	unbind = Binder.bind(Config.HAZARD_TAG, hazard, { ancestors = { workspace } })
	local function onState(state: string)
		if state == "Intermission" then
			self:Load()
		elseif state == "Round" then
			self:Load() -- no-op when Intermission loaded it
			for _, player in Players:GetPlayers() do
				local pad = padFor(player)
				if pad then
					task.spawn(place, player, pad.CFrame)
				end
			end
		elseif state == "Lobby" then
			self:Unload()
		end
	end
	rounds.StateChanged:Connect(onState)
	onState(rounds:GetState()) -- the loop may have moved before this Start ran
	-- A respawn during the round puts the player back on the map, not in the lobby.
	local function onPlayer(player: Player)
		player.CharacterAdded:Connect(function()
			local pad = padFor(player)
			if pad and rounds:GetState() == "Round" then
				place(player, pad.CFrame)
			end
		end)
	end
	Players.PlayerAdded:Connect(onPlayer)
	for _, player in Players:GetPlayers() do
		onPlayer(player)
	end
	publish()
end

function MapService.Stop(self: any)
	if unbind then
		unbind()
		unbind = nil
	end
	self:Unload()
end

return MapService
```

Live test (L11). The harness holds the loop in Lobby by raising `Test_MinPlayers` to 2 (one player),
then releases it for one short round:

<!-- test: L11_HOLD -->

```lua
local gs = game:GetService("ReplicatedStorage"):WaitForChild("GameState")
gs:SetAttribute("Test_MinPlayers", 2) -- one player: the loop stops in Lobby after this round
gs:SetAttribute("Test_Round", 6)
return { state = gs:GetAttribute("RoundState"), map = gs:GetAttribute("Map") }
```

In Lobby, run with `kit=["Stats"]` (twice: after the first round and after the released one):

<!-- test: L11_LOBBY -->

```lua
local ServerStorage = game:GetService("ServerStorage")
local gs = game:GetService("ReplicatedStorage"):WaitForChild("GameState")
local services = game:GetService("ServerScriptService"):WaitForChild("Server"):WaitForChild("Services")
local ms = services:WaitForChild("MapService")
local inWorkspace = 0
for _, m in ServerStorage:WaitForChild("Maps"):GetChildren() do
	if workspace:FindFirstChild(m.Name) then
		inWorkspace += 1
	end
end
local character = game:GetService("Players"):GetPlayers()[1].Character
return {
	state = gs:GetAttribute("RoundState"),
	map = gs:GetAttribute("Map"),
	mapsInWorkspace = inWorkspace,
	hazards = ms:GetAttribute("Hazards"),
	loads = ms:GetAttribute("Loads"),
	unloads = ms:GetAttribute("Unloads"),
	rootX = if character then character:GetPivot().Position.X else nil,
	instances = Stats.snapshot().instances,
}
```

Release, measure the Server frames across the clone and the teleport, then read the round
(`kit=["Stats"]`):

<!-- test: L11_CYCLE -->

```lua
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local gs = game:GetService("ReplicatedStorage"):WaitForChild("GameState")
local services = game:GetService("ServerScriptService"):WaitForChild("Server"):WaitForChild("Services")
local ms = services:WaitForChild("MapService")
gs:SetAttribute("Test_MinPlayers", 1) -- release: Intermission clones the next map, Round places players
local frames = Stats.frames(5) -- spans the clone (Intermission, 3 s) and the teleport (Round start)
local t0 = os.clock()
while gs:GetAttribute("RoundState") ~= "Round" and os.clock() - t0 < 5 do
	task.wait(0.1)
end
task.wait(0.5)
local name = gs:GetAttribute("Map") :: string
local map = workspace:FindFirstChild(name)
local character = Players:GetPlayers()[1].Character
local nearest = math.huge
if map and character then
	local root = character:GetPivot().Position
	for _, pad in map:WaitForChild("Spawns"):GetChildren() do
		local d = (pad :: BasePart).Position - root
		nearest = math.min(nearest, Vector3.new(d.X, 0, d.Z).Magnitude)
	end
end
gs:SetAttribute("Test_MinPlayers", 2) -- hold again after this round
return {
	state = gs:GetAttribute("RoundState"),
	map = name,
	mapInWorkspace = map ~= nil,
	storageMaps = #ServerStorage:WaitForChild("Maps"):GetChildren(),
	hazards = ms:GetAttribute("Hazards"),
	padDistance = nearest,
	frames = frames,
}
```

Then `Stats.frames(3)` on the Client during the round, a capture, the second L11_LOBBY, and a
restore:

<!-- test: L11_RESTORE -->

```lua
local gs = game:GetService("ReplicatedStorage"):WaitForChild("GameState")
gs:SetAttribute("Test_MinPlayers", 1)
gs:SetAttribute("Test_Round", 20)
return true
```

Pass when: each Lobby read shows Map "", 0 maps in Workspace, Hazards 0, the character back on the
lobby Baseplate and Loads equal to Unloads; the released round shows the other map (rotation), 1
bound hazard, the character within 8 studs of a pad and both templates still in ServerStorage; the
instance count of the two Lobby reads differs by 10 or fewer; Server and Client frames meet the
gate.

Frame gate (from scenario-roblox-expert): p95 at most 1.2 x the frame budget and worst at most 2 x,
so 20 ms and 33.3 ms at 60 fps. Heartbeat p95 reads 17.2 to 17.4 ms on a healthy place. Gate on p95
and worst, not on mean fps.

Client resample (since 2026-10-19): when the Client window has a healthy p95 but one frame above
33.3 ms, L11 samples 3 s more and gates on that second window; `client_frames_first` keeps the
first. A real cost repeats; a hitch from other Studio windows does not. Why: a full run on
2026-10-19 failed on a Client worst of 76.6 ms (p95 17.36 ms) on a shared machine with up to four
place windows. In the reruns, 25 Client windows (1 L11 run, 8 probe rounds of 3 windows each) gave
p95 17.2 to 18.8 ms and one long frame, 39.5 ms, that did not repeat in the next window. The place
ran with StreamingEnabled off and both maps Default during that failure, so the Atomic template
change (made and reverted the same day) was not involved. Paired rounds that alternated Atomic and
Default on the map templates (Server data model) gave Client worst frames across the clone of 18.9,
19.2 and 19.4 ms (Atomic) and 21.3, 18.7 and 39.5 ms (Default).

L7 also checks that a respawn during the round lands on the map (`rootX` within 50 studs of x 400).

Run in Studio 0.743 on 2026-10-19: pass, twice on 2026-10-19 (full runs at about 00:59 and 01:01).

- Start of the test: Round on Pillars. First Lobby: Map "", 0 maps in Workspace, Hazards 0, Loads 2,
  Unloads 2, the character at x 0, 46,186 instances.
- Released round: Crossroads (rotation), 1 bound hazard, the character 0 studs from a pad, both
  templates still in ServerStorage.
- Second Lobby: the same as the first, with Loads 3, Unloads 3 and 46,186 instances (delta 0, in
  both runs).
- Server frames across the clone and the teleport: 60 fps, p50 16.66 ms, p95 17.27, 17.30 and 17.34
  ms, worst 20.03, 17.49 and 18.09 ms. Client during the round: p95 17.38, 17.26 and 17.43 ms, worst
  17.75, 17.58 and 17.67 ms. All within the gate (the third run after the type-solver fixes).
- Capture `map_round.png`: no `image_checks` flag, mean luma 0.41. Opened: the character stands on
  the Crossroads slate floor at x 360, the lobby Baseplate edge visible behind, and the HUD reads
  "Round 0:04".
- L7 in the same runs: after five respawns during a Pillars round, the character was at x 400 (the
  pad), not in the lobby.

## P14. GUI lifetimes: ResetOnSpawn for HUD and shop (L12)

Docs, On-screen UI containers, "Reset on spawn", and the StarterGui reference: when a character
spawns, PlayerGui is emptied and StarterGui is copied in again, except ScreenGuis with
`ResetOnSpawn` false, which are copied once. The table there: a ScreenGui resets when ResetOnSpawn
is true (the default) or when it is an indirect descendant of StarterGui (inside a Folder), and
stays only when ResetOnSpawn is false and it is a direct child. GnomeCode sets the round HUD to
false so a death does not wipe it (oEWoyT-GBZY [00:14:38]).

Decision for a round game where players die every round:

| Screen                                      | Where it is made                                           | ResetOnSpawn                 | Why                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Round HUD                                   | RoundController builds it in code, parents it to PlayerGui | false                        | the controller runs once per session and holds `label`; a reset would leave it writing to a destroyed copy |
| Shop                                        | authored in StarterGui as a direct child                   | false                        | ShopController wires it once; the open state is closed on CharacterAdded on purpose                        |
| Per-life UI (ability bar of this character) | its own ScreenGui                                          | true, with its script inside | it should start fresh with each character                                                                  |

A controller that runs once must never hold a ScreenGui that resets. Folders under StarterGui
silently cancel `false` (ArchAudit `reset-ignored-nested`).

File: `scripts/templates/arena/src/client/Controllers/ShopController.luau`:

```lua
--!strict
-- Shop screen: authored in StarterGui as a DIRECT child with ResetOnSpawn false, so it is cloned into
-- PlayerGui once and the same instance survives every death. This controller runs once per session
-- (client entry in ReplicatedStorage) and wires the screen once. What should reset on death, the open
-- state, is reset here on purpose instead of by rebuilding the GUI.
-- Items, prices and purchases belong to the data and monetization layers.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local ShopController = {}

local gui: ScreenGui?
local wired = 0

function ShopController.Start(self: any)
	local player = Players.LocalPlayer
	local found = player:WaitForChild("PlayerGui"):WaitForChild("Shop")
	assert(found:IsA("ScreenGui"), "PlayerGui.Shop is not a ScreenGui")
	gui = found
	wired += 1
	if RunService:IsStudio() then
		script:SetAttribute("Wired", wired)
	end
	player.CharacterAdded:Connect(function()
		self:Close()
	end)
end

function ShopController.Open(_self: any)
	if gui then
		gui.Enabled = true
	end
end

function ShopController.Close(_self: any)
	if gui then
		gui.Enabled = false
	end
end

function ShopController.IsOpen(_self: any): boolean
	return gui ~= nil and gui.Enabled
end

return ShopController
```

Live test (L12). Mark every screen on the Client, open the shop, respawn on the Server, then read
again:

<!-- test: L12_MARK -->

```lua
local Players = game:GetService("Players")
local pg = Players.LocalPlayer:WaitForChild("PlayerGui")
-- A HUD built in code with the default ResetOnSpawn (true): the trap a run-once controller falls into.
local trap = Instance.new("ScreenGui")
trap.Name = "ProbeCodeReset"
trap.Parent = pg
local marked = {}
for _, path in { "RoundHud", "Shop", "FixturePerLife", "FixtureScreens.FixtureNested", "ProbeCodeReset" } do
	local inst: Instance? = pg
	for name in string.gmatch(path, "[^%.]+") do
		inst = inst and inst:FindFirstChild(name)
	end
	if inst then
		inst:SetAttribute("Mark", "before") -- a local attribute: only this copy carries it
		table.insert(marked, path)
	end
end
local shop = pg:FindFirstChild("Shop")
if shop and shop:IsA("ScreenGui") then
	shop.Enabled = true -- the player died with the shop open
end
return { marked = marked }
```

<!-- test: L12_RESPAWN -->

```lua
local player = game:GetService("Players"):GetPlayers()[1]
player:LoadCharacterAsync()
task.wait(1.5)
return true
```

<!-- test: L12_CHECK -->

```lua
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local pg = Players.LocalPlayer:WaitForChild("PlayerGui")
local controllers = ReplicatedStorage:WaitForChild("Client"):WaitForChild("Controllers")
local out: { [string]: string } = {}
local copies: { [string]: number } = {}
for _, path in { "RoundHud", "Shop", "FixturePerLife", "FixtureScreens.FixtureNested", "ProbeCodeReset" } do
	local parent: Instance? = pg
	local names = string.split(path, ".")
	for i = 1, #names - 1 do
		parent = parent and parent:FindFirstChild(names[i])
	end
	local last = names[#names]
	local n, inst = 0, nil
	local children: { Instance } = if parent then parent:GetChildren() else {}
	for _, c in children do
		if c.Name == last then
			n += 1
			inst = c
		end
	end
	copies[path] = n
	out[path] = if inst == nil then "gone" elseif inst:GetAttribute("Mark") == "before" then "same" else "new"
end
local shop = pg:FindFirstChild("Shop")
local hud = pg:FindFirstChild("RoundHud")
local status = hud and hud:FindFirstChild("Status")
task.wait(1.2) -- one HUD render tick
return {
	guis = out,
	copies = copies,
	shopOpen = if shop and shop:IsA("ScreenGui") then shop.Enabled else nil,
	wired = controllers:WaitForChild("ShopController"):GetAttribute("Wired"),
	shown = controllers:WaitForChild("RoundController"):GetAttribute("Shown"),
	label = if status and status:IsA("TextLabel") then status.Text else nil,
}
```

Pass when: RoundHud and Shop are the same instances (one copy each), FixturePerLife and
FixtureNested are new copies, ProbeCodeReset is gone, the shop is closed, Wired is 1, and the HUD
label in PlayerGui still follows RoundController.

Run in Studio 0.743 on 2026-10-19: pass, twice on 2026-10-19 (full runs at about 00:59 and 01:01).

- RoundHud and Shop were the same instances, one copy each; the shop was closed by ShopController
  (opened before the respawn); Wired 1.
- FixturePerLife (ResetOnSpawn true) and FixtureNested (false, inside a Folder) were new copies, one
  each: the docs table holds.
- ProbeCodeReset, a ScreenGui made in code with the default ResetOnSpawn true, was gone and not
  recreated. A run-once controller that builds its HUD that way loses it at the first death.
- The HUD label in PlayerGui matched RoundController ("Round 0:11", then "Round 0:10").

## P15. Type check on both solvers (O6, O7, O8)

`luau-lsp analyze` 1.70.1 runs the old solver unless `--flag:LuauSolverV2=true` is set. Studio runs
nonstrict scripts on the new solver since its general release (2025-11-20), and strict scripts
follow `Workspace.UseNewLuauTypeSolver`, which scripts cannot read. So every shipped file and
snippet is checked on both (rule shared with scenario-roblox-luau and scenario-roblox-tooling).
`A.typecheck(files, sourcemap)` runs the two passes and tags each error with its solver;
`A.check(dest)` uses it, and `A.sourcemap` passes `--include-non-scripts` so the new solver knows
saved instances.

- O6: template and kit (Loader, Binder, ArchAudit) with the place sourcemap.
- O7: every `lua` block of SKILL.md and the references. A block that is a byte-identical copy of a
  shipped file is checked as that file in O6 or O8, where the sourcemap types `script`. A block
  introduced by a file name that is not identical fails as drift.
- O8: the audit fixtures, where the only errors allowed are the deliberate require cycle (CycleA and
  CycleB, "Cyclic dependencies", on both solvers), and the two Lune runners on the standard platform
  with Lune's own type definitions (`lune setup`).

What the new solver rejected and the old one passed (2026-10-19). Every fix uses a real type, not
`:: any`:

| Code                                                                                                                        | New-solver error                               | Fix                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `xpcall(fn, debug.traceback, ...)` (Loader, Binder)                                                                         | no valid instantiation for xpcall's error type | a typed handler, `local function trace(err: any): string return debug.traceback(tostring(err), 2) end`             |
| `if type(x.Destroy) == "function" then x:Destroy()` with `x: any` (Binder.clean)                                            | cannot call a value of type `function`         | typed views first: `local destroyable = x :: Destroyable` with `type Destroyable = { Destroy: (self: any) -> () }` |
| `table.sort(list, function(a, b) return a.Name < b.Name end)` (MapService, TeamService)                                     | `unknown` cannot be compared with `<`          | annotate the comparator: `function(a: Model, b: Model)`                                                            |
| `if lobby and player.Character then player.Character:PivotTo(lobby.CFrame)`, with `lobby` a module-level local (MapService) | `BasePart?` could be nil                       | copy to locals first: `local spawn = lobby`, `local character = player.Character`                                  |
| Doc copies of the entry scripts, checked loose: `script.Parent.Services`                                                    | `Instance?` could be nil; `Services` not found | check the copy as the file itself (O7 rule above)                                                                  |

Offline on 2026-10-19: before the fixes, the old solver 0 errors and the new solver 15 (8 in shipped
files, 7 in doc snippets); after, 0 and 0 on 16 files and 35 blocks (40 blocks after
project-setup.md was added the same day, still 0 and 0). The fixtures report only the 2 deliberate
cycle errors on each solver, and the Lune runners report 0 on each. The Lune unit tests still pass
(18 of 18).

## Final full run

`python3 tests/code/scenario-roblox-architecture/run_live.py` on 2026-10-18 at 23:17, 23:22 and
23:25 (the last with part positions restored): L0 to L10 pass, exit 0, about 60 s each. On
2026-10-19 at about 00:59 and 01:01, after the map, GUI and ordering tests were added: L0 to L13
pass, exit 0, about 100 s each (L11 holds the loop in Lobby twice). The first run opened the place
once, after waiting for the machine guard; the second bound the open window. At about 01:50, after
the type-solver fixes of P15 changed Loader, Binder, MapService and TeamService: the place was
rebuilt while closed, reopened once (after the guard, capped at 4 windows), and L0 to L13 passed
again, exit 0. Later on 2026-10-19, a full run failed L11 once on a single 76.6 ms Client frame;
after the reruns of P13 and the Client resample, the full run at 03:30 passed L0 to L13, exit 0 (L11
Client p95 17.34 ms, worst 17.72 ms, no resample needed; Server p95 17.29 ms, worst 17.59 ms). The
Luau of every probe is read from this file at run time (`<!-- test: ... -->` markers). `--offline`:
O1 to O7 pass, exit 0.
