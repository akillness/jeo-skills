# Traps: current Roblox, Studio MCP, and the file pipeline

Read this before the first job. Version facts come from Roblox announcements and the API reference
(October 2026). "Observed" means a live test in Studio 0.743 on 2026-10-18 (test ids in
procedures.md).

## 1. Roblox habits that are now wrong

| Old habit                                                                                                            | Current form                                                                               | Source                      |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| `LoadCharacter`, `GetProductInfo`, `PlayerOwnsAsset`, `AwardBadge`, `ApplyDescription`, `IsInGroup`, `ReserveServer` | the `Async` names; old names deprecated, not removed                                       | devforum 4257585            |
| `GetRankInGroup`, `GetRoleInGroup`                                                                                   | `GroupService:GetRolesInGroupAsync`                                                        | Player reference            |
| `wait`, `spawn`, `delay`                                                                                             | `task.wait`, `task.spawn`, `task.defer`, `task.delay`                                      | RobloxGlobals reference     |
| `PhysicsService` collision groups, `CollisionGroupId`                                                                | `workspace:RegisterCollisionGroup`, `BasePart.CollisionGroup` (string); 32 groups          | devforum 4848541            |
| DataStore budget `60 + players x 10`, 6 s write cooldown                                                             | per-server `60 + players x 40`; experience-wide limits shared with Open Cloud; no cooldown | data-stores limits page     |
| DataStore storage is free                                                                                            | 500 MB + 1 MB per lifetime user; overage billed                                            | devforum 4504347            |
| ProfileService, DataStore2                                                                                           | ProfileStore or `UpdateAsync` with a session lock                                          | devforum 3190543            |
| Legacy chat, `ChatMakeSystemMessage`, `ChatVersion`                                                                  | `TextChatService` only; `TextChannel:DisplaySystemMessage`                                 | devforum 3376880            |
| `FindPartOnRay`, `Ray.new`, `FilterType = Blacklist`                                                                 | `workspace:Raycast`; `RaycastParams.ExcludeInstances` or `IncludeInstances`                | devforum 4563575            |
| `Humanoid:LoadAnimation`                                                                                             | `Animator:LoadAnimation`, Animator created on the server                                   | devforum 857129             |
| `BodyVelocity`, `BodyGyro`, `BodyPosition`                                                                           | `LinearVelocity`, `AlignOrientation`, `AlignPosition`                                      | mover constraints page      |
| `MembershipType == Premium`, `PromptPremiumPurchase`                                                                 | `Player.HasRobloxSubscription`, `PromptRobloxSubscriptionPurchase`                         | devforum 4567894            |
| `SetPrimaryPartCFrame`, `Velocity`                                                                                   | `PivotTo`, `AssemblyLinearVelocity`                                                        | Model, BasePart reference   |
| `UserInputService` and `ContextActionService` bindings, forked `PlayerModule`                                        | Input Action System: `InputContext`, `InputAction`, `InputBinding`                         | devforum 4678416            |
| The client sees all of Workspace                                                                                     | StreamingEnabled is on for new places; `WaitForChild`, `ModelStreamingMode`                | streaming docs              |
| Handlers run inside `:Fire()`                                                                                        | `SignalBehavior` Deferred in new templates and under Server Authority                      | devforum 2276564            |
| `SetNetworkOwner` plus sanity checks is the only model                                                               | Server Authority (opt-in, full release 2026-07-09); `RunService:BindToSimulation`          | devforum 4727993            |
| Client `TeleportService:Teleport`                                                                                    | server `TeleportAsync` in `pcall` with retries                                             | TeleportService reference   |
| `RemoteEvent` for everything                                                                                         | `UnreliableRemoteEvent` for loss-tolerant data, dropped above 1,000 bytes                  | devforum 2724155            |
| `Sound` and `SoundGroup` are the whole stack                                                                         | Audio API: `AudioPlayer`, `Wire`, `AudioEmitter`, `AudioListener`; `AudioPlayer.Asset`     | devforum 3153454            |
| `Lighting.Technology`                                                                                                | `LightingStyle` plus `PrioritizeLightingQuality`; `Technology` is not scriptable           | devforum 3401512            |
| `Motor6D` joints, welded accessories                                                                                 | Avatar Joint Upgrade: `AnimationConstraint`, `RigidConstraint`                             | devforum 4298561            |
| `Instance.new("EditableMesh")`                                                                                       | `AssetService:CreateEditableMeshAsync`, shown through `Content.fromObject`                 | EditableMesh reference      |
| `require(assetId)`, `loadstring` in Store assets                                                                     | blocked in the Creator Store sandbox: vendor the code                                      | devforum 4634642            |
| `TouchEnabled`, `IsTenFootInterface` sniffing                                                                        | `UserInputService.PreferredInput`, `GuiService.ViewportDisplaySize`                        | devforum 3750890            |
| `AnalyticsService:FireEvent` and friends                                                                             | `LogCustomEvent`, `LogEconomyEvent`, `LogProgressionEvent`, `LogFunnelStepEvent`           | AnalyticsService reference  |
| Old Studio menus (View > Output, Test > Play)                                                                        | Next Gen Studio UI: Window menu, mezzanine playtest bar                                    | devforum 4085392            |
| `GenerateMeshAsync`                                                                                                  | `GenerationService:GenerateModelAsync`                                                     | GenerationService reference |

`Audit.all(game)` flags most of these in place scripts (`api:` rules).

## 2. Studio MCP server

- Every tool except `list_roblox_studios` needs `studio_id`; rows are `{id, name}`, and `name` can
  be null (observed). There is no `set_active_studio` tool, although one changelog lists it.
- `tools/list` is empty until a Studio with the server enabled connects (observed).
- The live list has 28 tools, including `generate_texture` and `segment_mesh`, which the docs page
  does not list (observed).
- `execute_luau` returns only the chunk's first return value as text. Prints go to the Output log
  (observed by the orchestrator). Use `rbx_run`, which returns one JSON payload.
- `execute_luau` runs on Studio's main thread: a long chunk freezes Studio and can drop the
  connection (tool description).
- `start_stop_play` takes `is_start`. Input tools and `character_navigation` require
  `datamodel_type` "Client". `screen_capture` requires `capture_id` (observed).
- A reply can be lost under load: `start_stop_play` once gave no answer in 120 s while play had
  started, and one `execute_luau` on the Client did the same (observed). Read `get_studio_state`
  before retrying a toggle; retry only read-only chunks.
- Each `StudioMCP` process is a proxy: the first one hosts the port and later ones relay through it.
  When the host exits, the others see "No Roblox Studio instances are connected" for about 4 s
  (observed by the orchestrator).
- `script_grep` takes a Lua pattern and ignores case: escape `[` as `%[` (observed).
- `screen_capture` shows the 3D viewport and the game's ScreenGuis, not Studio panels or dialogs
  (observed).
- A place window covered by other windows can stop drawing its 3D view: Edit captures come back as a
  dark viewport with only the view cube (not flagged `all_black`), and `Stats.SceneDrawcallCount`
  and `SceneTriangleCount` freeze while parts are added in front of the camera. Playtest captures in
  the same run still drew (observed twice with 5 place windows open, 2026-10-19). Before trusting a
  capture or render counter, add a part in view and check the counters move; keep few place windows
  open, and raise the window only when the user accepts a focus change.
- `upload_image` publishes images to Roblox. Use it only with the user's go.
- The server is one GUI toggle (gui-paths.md). Never script the GUI to flip it.

## 3. Places and processes

- Each open place is its own Studio child process of about 2.9 GB, and every window renders all the
  time; hiding windows did not lower GPU load (observed by the orchestrator). `open_place` waits for
  GPU and RAM headroom.
- SIGTERM to a place's process hung the window, raised "Save File Failure", and hid every Studio
  from the MCP server (observed). Never signal Studio processes. Never close a place you did not
  open; agents do not close places at all.
- No script API closes or saves a place (checked: DataModel, StudioService, StudioTestService).
- `RobloxStudio --task RunScript` on a Mac with Studio open hands off to that Studio and closed the
  user's window (2026-10-18). Use it only on a machine with no interactive Studio.
- An Edit change is not on disk until someone saves; a Server change in play vanishes at stop (L24,
  L25).
- In Edit, `RunService:IsServer()` is true, so `Stats.snapshot().context` reads "Server" (observed).
- `Stats.FrameTime` read 66 ms on the Client while Heartbeat ran at 60 fps (observed). Gate on
  `Stats.frames`.
- Studio memory (3,800 MB during a small playtest) is not a game number (observed; McNeill,
  cWDNVvOh4o0 [00:28:25]).

## 4. Files: Rojo, Script Sync, linters

- Rojo 7.7.1 drops `"Position": [x, y, z]` on a Part with exit 0 and leaves it at the origin
  (observed). Write `"CFrame": [x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1]`; `rbx_env.new_place` converts
  `Position` for you.
- Rojo 7.7.1 applies these forms in a project's `$properties` and a `.model.json`'s `properties`
  (built, then read back with Lune 0.11.0):
  - an enum by item name, `"Shape": "Cylinder"`, `"Material": "SmoothPlastic"`;
  - `"Color": [1, 0.78, 0.15]`, three floats from 0 to 1;
  - `"Tags": ["Coin"]`.
- Attributes go in `$attributes` or `attributes`. Lune's `deserializePlace` reads both back
  (`GetTags`, `GetAttribute`), so check them offline before Studio.
- Studio derives `LightingStyle` and `PrioritizeLightingQuality` from the file's `Technology` when
  it loads a place (observed: a file with only the new pair opened as Soft and false). Write
  `Technology` in the file.
- The user's `rojo serve` syncs every edit under their project into their open window. Edit a git
  worktree or a copy of their files, never their `src/`, and build your own place from it.
- `$ignoreUnknownInstances` defaults to false under `$path`: live sync deletes Studio-only children
  such as RemoteEvents (Rojo docs; Distracted Games, Zhl_NAPMztY [00:44:28]).
- Rojo cannot live-sync Terrain, CSG, `MeshPart.MeshId` or `HttpService.HttpEnabled` (Rojo sync
  details).
- Rojo `emitLegacyScripts` defaults to true: `.client.luau` becomes a LocalScript. With false,
  scripts get `RunContext`, as Script Sync does (scenario-roblox-tooling evidence).
- Rojo builds `.local.luau` and `.legacy.luau` as ModuleScripts named `X.local` and `X.legacy`,
  while Script Sync reads them as scripts (scenario-roblox-tooling evidence).
- Script Sync syncs Script, LocalScript, ModuleScript and Folder only. Attributes and tags on synced
  scripts are lost. Limits: 10,000 scripts per root, 128 roots (Script Sync docs).
- Script Sync can stop silently, for example after reopening a place (SmartyRBX, 0ENeVVC9QT0
  [00:12:19]). Check `InstanceFileSyncService:GetStatus`.
- Selene needs `std = "roblox"` or typed Luau fails to parse; luau-lsp needs a `rojo sourcemap` to
  resolve the DataModel (tested; Distracted Games, xlxnmAFmu6c [00:11:51]).

## 5. Corrections to the version deltas (live)

- `Workspace.StreamingEnabled`: the reference says "not scriptable", and the deltas say no script
  can set it. From `execute_luau` in the Edit data model, a write succeeded (false to true, then
  restored) on 2026-10-18. Game scripts at runtime were not tested.
- `Lighting.Technology` read from `execute_luau` fails with "lacking capability RobloxScript", as
  the deltas say (observed).
- The MCP tool `set_active_studio` (deltas row 44) does not exist in Studio 0.743: target a window
  with `studio_id`.
