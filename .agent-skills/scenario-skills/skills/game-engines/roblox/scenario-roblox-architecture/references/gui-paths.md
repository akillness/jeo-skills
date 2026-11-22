# GUI paths: Roblox Studio (October 2026, Next Gen UI)

The same steps as [procedures.md](procedures.md), for a human or a computer-use agent. Labels come
from the current Creator Docs unless marked otherwise. The programmatic substitute comes first when
one exists.

## Scripts and RunContext

| Task                            | Substitute                                                                                   | GUI path                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Insert a script                 | Rojo file (`.server.luau`, `.client.luau`, `.luau`) or `Instance.new` in Edit                | Explorer, hover the container, **+**, Script or ModuleScript                            |
| Set RunContext                  | Rojo with `"emitLegacyScripts": false`; `script.RunContext = Enum.RunContext.Client` in Edit | select the Script, Properties, **RunContext** dropdown (Legacy, Server, Client, Plugin) |
| Find scripts that run twice     | `ArchAudit.all(game)`, rule `runs-twice`                                                     | Output during a playtest shows "non-legacy RunContext ... run multiple times"           |
| Strict type checking everywhere | `--!strict` per file                                                                         | Workspace, Properties, **LuauTypeCheckMode**                                            |

## Script Sync and Rojo

| Task                   | GUI path                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Sync a folder to disk  | Explorer, select folders, right-click, **Sync to…**, choose a local folder                              |
| Open the synced folder | right-click the folder, **Script Sync**, **Reveal in Finder** (macOS)                                   |
| Rojo live sync         | Rojo plugin, **Connect** (one click per session); agents use `rojo build` plus `A.sync_sources` instead |

Script Sync suffixes: `.server.luau` Script Server, `.client.luau` Script Client, `.local.luau`
LocalScript, `.legacy.luau` Script Legacy, `.plugin.luau` Script Plugin. Rojo 7.7.1 reads only the
first two this way (with `emitLegacyScripts` false).

## Tags and attributes

| Task                  | Substitute                                                                     | GUI path                                                       |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Add a tag             | `inst:AddTag("Sword")` in Edit, or `"Tags"` in a Rojo `.model.json`            | select the instance, Properties, **Tags** section, **+**       |
| Add an attribute      | `inst:SetAttribute(name, value)` in Edit, or `$attributes` in the Rojo project | select the instance, Properties, **Attributes** section, **+** |
| Find tagged instances | `CollectionService:GetTagged(tag)`                                             | Properties Tags section per instance                           |

## Workspace settings that change architecture

Set these in the Rojo project (`Workspace.$properties`) or by hand. Reading SignalBehavior from
`execute_luau` failed (live), and PlayerCharacterDestroyBehavior is NotScriptable (API reference).

| Property                       | Value                           | GUI path                                                  |
| ------------------------------ | ------------------------------- | --------------------------------------------------------- |
| SignalBehavior                 | Deferred                        | Workspace, Properties, **SignalBehavior**                 |
| PlayerCharacterDestroyBehavior | Enabled                         | Workspace, Properties, **PlayerCharacterDestroyBehavior** |
| StreamingEnabled               | per scenario-roblox-environment | Workspace, Properties, **StreamingEnabled**               |

Compare Immediate and Deferred by hand: set **SignalBehavior** to Immediate, run the L13 probe
(procedures P8) in a playtest, then set it back to Deferred. Expect `lateCatch` 1 and order A, C, B
under Immediate (docs and Crusherfire; not run here, the property is not scriptable from
`execute_luau`).

## Screens, maps and other round content

| Task                                  | Substitute                                                                          | GUI path                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep a screen across deaths           | `"ResetOnSpawn": false` in its `.model.json`, or `gui.ResetOnSpawn = false` in code | select the ScreenGui (a direct child of StarterGui, not inside a Folder), Properties (type ResetOnSpawn in the filter box; the API reference files it under Data), untick **ResetOnSpawn** |
| Store maps                            | `ServerStorage.Maps` in the Rojo project                                            | Explorer, drag each map Model into ServerStorage, Folder `Maps`                                                                                                                            |
| Check what a joining client downloads | ArchAudit `maps-replicated`                                                         | Explorer: nothing large under ReplicatedStorage or Workspace that is not needed at join                                                                                                    |

## Playtest and latency

| Task                                | Substitute                                                                                                                                                                                                             | GUI path                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Solo playtest                       | `rbx_play.Playtest(studio)`                                                                                                                                                                                            | mezzanine toolbar, **Test**                                                                                                     |
| See client or server state          | `execute_luau` with `datamodel_type` Client or Server                                                                                                                                                                  | during a solo playtest, the **Client/Server** toggle (blue border client, green border server); Output labels are blue or green |
| Add latency                         | `settings().Network.InboundNetworkMinDelayMs` and `OutboundNetworkMinDelayMs` (PluginSecurity, applies to playtest connections; set in Edit before the playtest; measured by scenario-roblox-networking, not run here) | Studio Settings (Option+S on Mac), **Network** section, **Network Simulation**: at least 50 to 150 ms inbound and outbound      |
| Latency, jitter, packet loss (beta) | none                                                                                                                                                                                                                   | **File**, **Beta Features**, enable **New Device Simulator**, restart; then Network Simulator controls                          |
| Two or more players                 | `StudioTestService:ExecuteMultiplayerTestAsync(numPlayers, args)` from a plugin script (not run here)                                                                                                                  | testing mode dropdown, **Server & Clients**, choose the client count                                                            |

`StudioTestService:ExecuteMultiplayerTestAsync(numPlayers, args)` (API reference, StudioTestService)
starts one server and `numPlayers` client data models (1 to 8), forwards `args` to scripts in the
session (`GetTestArgs`), yields until the server calls `EndTest(value)` and returns that value. It
needs plugin security, so it runs from a plugin script, not from game code; it errors when a test is
already running, and one multiplayer session runs at a time per Studio. In the session,
`AddPlayers(n)` (server) adds clients and `LeaveTest()` (client) disconnects one. Not run for this
skill: each simulated client opens its own Studio window on a shared machine. The two-team
elimination path is covered by the RoundMachine Lune tests instead. Plugin and server scripts for a
scripted two-client round: project-setup.md, section 4 (not yet run).

## Packages (your own systems across places)

GUI only; agents audit `PackageLink` properties (`AutoUpdate`, `VersionNumber`, `Status`) with
ArchAudit and AgentKit Audit.

1. Group the system in a Model or Folder, right-click, **Convert to Package**; set **Ownership** to
   the group when working in a team (ownership cannot be transferred later).
2. Select the `PackageLink` child, Properties, enable **AutoUpdate** (off by default).
3. After an edit, right-click the package, **Publish to Package**.
4. Outdated copies: right-click, **Get Latest Package**; or **Update All** for every copy (it saves
   the places, it does not publish them).
5. Versions: right-click, **Package Options**, **Package Details**, **Versions**; compare versions
   in the diff viewer.

## Version history and collaboration

| Task                  | GUI path                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Place versions        | **Window**, **Version History**                                                                                       |
| Script history        | right-click a script, **View Script History** (Roblox Learn video, 2025; not in the current docs, check the menu)     |
| Collaborators         | **Collaborate** button on the right of the mezzanine bar                                                              |
| Drafts mode           | **File**, **Experience Settings**, **Enable Drafts Mode**; commit from the **Drafts** window (add it to a custom tab) |
| Revert a place safely | turn collaboration off first, so auto-save cannot overwrite the revert                                                |

Agents use Rojo or Script Sync files under git for review instead of Drafts and script history.
