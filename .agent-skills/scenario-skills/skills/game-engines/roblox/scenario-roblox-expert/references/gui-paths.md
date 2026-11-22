# GUI paths (scenario-roblox-expert)

Menus and settings for the same tasks, for a human or a computer-use agent. Studio uses the Next Gen
UI by default since 2026-01-05: tabs Home, Model, Avatar, UI, Script, Plugins; playtest controls in
the toolbar strip under the tabs (the "mezzanine"). An agent driving the toolkit never needs these
paths, except where a step is marked GUI-only.

| Task                                                       | Path                                                                                                        | Agent substitute                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Turn on the Studio MCP server (GUI-only, the user does it) | Assistant panel (atom icon, top right) > **...** > **Manage MCP Servers** > **Enable Studio as MCP server** | none; check with `rbx_env.doctor()`                                  |
| Check that a client connected                              | same panel: green indicator under **Enable Studio as MCP server**                                           | `rbx_env.open_places()`                                              |
| Open a local place                                         | **File > Open from File**                                                                                   | `rbx_env.open_place(path)`                                           |
| Save the place (the user decides)                          | **File** menu save commands (label not checked against the docs)                                            | none by MCP; deliver files instead                                   |
| Close a place (orchestrator, with the user's agreement)    | **File > Close Place** (orchestrator's report)                                                              | none for agents                                                      |
| Output window                                              | **Window** menu or **Script** tab > **Output**                                                              | `get_console_output`, `rbx_run` output                               |
| Play, stop                                                 | mezzanine **Play**, **Stop**                                                                                | `rbx_play.Playtest`                                                  |
| Server and several clients                                 | mezzanine test mode dropdown > **Server & Clients**, choose 1 to 8, **Play** (F7)                           | `StudioTestService:ExecuteMultiplayerTestAsync` (not yet run here)   |
| Network Simulator (latency, jitter, loss)                  | mezzanine, next to the Device Simulator                                                                     | none run here                                                        |
| Device Simulator                                           | mezzanine device selector                                                                                   | `StudioDeviceSimulatorService`; MCP skill `rbx-device-simulator-lua` |
| MicroProfiler                                              | Ctrl+F6 (Cmd+F6 on macOS) in a playtest; pause with Ctrl+P or Cmd+P                                         | MCP skill `rbx-perf-profiling` (LibMP)                               |
| Developer Console (memory, network)                        | F9 in a playtest                                                                                            | `Stats.snapshot()`                                                   |
| Script Sync a service to a folder (GUI-only)               | Explorer > right-click the service > **Script Sync** > **Sync to**                                          | none; check `InstanceFileSyncService:GetStatus`                      |
| Resume a stopped Script Sync                               | Explorer > right-click > **Script Sync** > **Resume sync** (SmartyRBX)                                      | none                                                                 |
| Rojo live sync                                             | **Plugins** > Rojo > **Connect**                                                                            | `rojo build` then open the file                                      |
| Publish a place (never by an agent)                        | **File > Publish**                                                                                          | Open Cloud place publishing, with the user's go                      |
| Import a mesh (scenario-roblox-assets)                     | **File > Import** (3D Importer)                                                                             | Open Cloud assets API then `insert_asset`, with the user's go        |
| Experience settings (security, HTTP, avatar)               | **File > Experience Settings**                                                                              | none for most toggles                                                |
| Beta features (Script Sync in older builds)                | **File > Beta Features**                                                                                    | none                                                                 |
| Server Authority visualizer                                | Ctrl+Shift+F6 in a playtest                                                                                 | prediction numbers through scenario-roblox-networking                |

Sources: Roblox Creator Docs pages `studio/mcp`, `studio/ui-overview`, `studio/importer`,
`production/publishing/publish-games-and-places`, `studio/output`, `studio/testing-modes`,
`studio/network-simulator`, `studio/device-simulator`, `scripting/sync`,
`performance-optimization/microprofiler`; McNeill (rwLEnBtXr30); Andrew (XLCZfGEm9tU [00:01:00]);
Neeler, Knight and Hamilton (9IqNHhYXK0s [00:10:06]); SmartyRBX (0ENeVVC9QT0 [00:12:19]).
