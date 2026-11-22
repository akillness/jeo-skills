# Sources (scenario-roblox-expert)

Credentials are as stated by the source or its channel; "unverified" means no independent check.

## Videos

| Source                                                 | Credential                                                                        | URL                                         | Best for                                         | Best timestamps              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| How to use the MicroProfiler                           | Andrew, Roblox Learn (official)                                                   | https://www.youtube.com/watch?v=XLCZfGEm9tU | frame time over FPS; MicroProfiler navigation    | 00:01:00, 00:02:12           |
| Top Game Performance Tales (RDC 2025)                  | Peter McNeill (Roblox performance engineer), Lynn (Studio PM)                     | https://www.youtube.com/watch?v=rwLEnBtXr30 | triage order, server MicroProfiler               | 00:24:19, 00:29:19           |
| Using Roblox Tools to Improve Performance (RDC 2024)   | Peter McNeill (MrChickenRocket), ex-mobile engine director                        | https://www.youtube.com/watch?v=cWDNVvOh4o0 | budgets; Studio memory is not representative     | 00:27:53, 00:28:25           |
| Reliable vs Unreliable RemoteEvents                    | Steven, Roblox Learn                                                              | https://www.youtube.com/watch?v=n5uOVlCIUjI | measure network before changing it               | 00:04:24                     |
| Mastering Server Authority (RDC 2026)                  | Brian Neeler (PM), Jason Knight (engineer), Drew Hamilton (studio developer)      | https://www.youtube.com/watch?v=9IqNHhYXK0s | prediction tests under simulated latency         | 00:07:14, 00:10:06, 00:10:40 |
| Input Action System Q&A                                | Jasmine (PM) and Alex (engineer), Roblox Learn                                    | https://www.youtube.com/watch?v=KnFJl6z5UN0 | auditing agent output over the Studio MCP        | 00:19:07, 00:21:23           |
| Design, Grow, and Retain an 18+ Player Base (RDC 2026) | Jim Greer (Roblox) with guest studio founders                                     | https://www.youtube.com/watch?v=vumAuOqSmNA | feel cannot be automated                         | 00:29:36                     |
| How to start coding with AI on Roblox (MCP)            | Roblox Learn (official), presenter unnamed                                        | https://www.youtube.com/watch?v=v8r1d80DxOY | Git as a safety net; end-to-end setup check      | 00:00:45, 00:02:31           |
| How to Build Roblox Games With AI in 2026              | SmartyRBX, educator (unverified)                                                  | https://www.youtube.com/watch?v=0ENeVVC9QT0 | one feature per prompt; silent Script Sync stops | 00:10:26, 00:12:19, 00:13:25 |
| Introduction to Roblox Agentic AI Development          | SimTek Game Development (unverified)                                              | https://www.youtube.com/watch?v=-0H6JRtrA2Y | security review prompt; respawn tests            | 00:03:53, 00:06:42           |
| The Real Way to Vibe Code a Roblox Game                | SmartyRBX (unverified)                                                            | https://www.youtube.com/watch?v=da-wHJpNhBo | narrow corrections; taste stays human            | 00:06:55, 00:07:35           |
| Open Cloud CI/CD workflows (Connect 2023)              | CJ_Oyer, independent developer, three Accelerator internships                     | https://www.youtube.com/watch?v=gapG2tH-etI | CI gates, publish rights, first unit test        | 00:12:50, 00:19:38, 00:22:44 |
| Create and Ship Faster with AI (RDC 2024)              | Roblox staff (Stef Corazza, Sujoy Banerjee, Lynn Gong, Eric Yip) with Guy de Beer | https://www.youtube.com/watch?v=XrxUy51NsvI | pseudo-code prompts; generated output is a draft | 00:11:23, 00:14:59           |
| Building Fun Games with AI (RDC 2025)                  | Karun Shana (PM), Max Ignatyev (engineering lead)                                 | https://www.youtube.com/watch?v=3h25HUtBHFk | JSON contracts for LLM NPCs; theme guard rails   | 00:08:35, 00:31:41, 00:34:25 |
| Rojo Actually Explained                                | Distracted Games (unverified)                                                     | https://www.youtube.com/watch?v=Zhl_NAPMztY | `$ignoreUnknownInstances` and reconnect deletes  | 00:44:28                     |
| Wally with Script Sync                                 | Distracted Games (unverified)                                                     | https://www.youtube.com/watch?v=xlxnmAFmu6c | sourcemaps for luau-lsp beside Script Sync       | 00:11:51, 00:12:57           |
| Claude Code and Codex with a community MCP             | Crusherfire, educator (unverified)                                                | https://www.youtube.com/watch?v=6kcWSMJFaS4 | one agent per community MCP server               | 00:12:17                     |

## Official documentation (create.roblox.com/docs)

| Page                                                                               | Best for                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| https://create.roblox.com/docs/studio/mcp                                          | the Studio MCP server, its toggle and tool list            |
| https://create.roblox.com/docs/scripting/sync                                      | Script Sync suffixes, limits, conflicts                    |
| https://create.roblox.com/docs/studio/testing-modes                                | playtest modes, Server & Clients, StudioTestService        |
| https://create.roblox.com/docs/reference/engine/classes/StudioTestService          | programmatic multi-client tests                            |
| https://create.roblox.com/docs/reference/engine/classes/InstanceFileSyncService    | checking sync status from code                             |
| https://create.roblox.com/docs/studio/cli                                          | `--task RunScript`                                         |
| https://create.roblox.com/docs/cloud (API reference, Luau Execution session tasks) | Open Cloud Luau Execution limits                           |
| https://create.roblox.com/docs/studio/output                                       | the Output window                                          |
| https://create.roblox.com/docs/studio/importer                                     | the 3D Importer                                            |
| https://create.roblox.com/docs/production/publishing/publish-games-and-places      | publishing (human only)                                    |
| https://create.roblox.com/docs/performance-optimization/microprofiler              | MicroProfiler (index page)                                 |
| https://create.roblox.com/docs/reference/engine/classes/Workspace                  | `StreamingEnabled` and streaming properties                |
| https://create.roblox.com/docs/reference/engine/classes/Lighting                   | `LightingStyle`, `PrioritizeLightingQuality`, `Technology` |

## Tools

| Tool     | URL                                       | Used for                                        |
| -------- | ----------------------------------------- | ----------------------------------------------- |
| Rojo     | https://rojo.space/docs                   | project format, `rojo build`, `rojo sourcemap`  |
| Lune     | https://lune-org.github.io/docs           | offline place audits and Luau tests             |
| luau-lsp | https://github.com/JohnnyMorganz/luau-lsp | `rbx_check` type checks with Roblox definitions |
| Selene   | https://kampfkarren.github.io/selene      | lint with `std = "roblox"`                      |
| StyLua   | https://github.com/JohnnyMorganz/StyLua   | format check                                    |

## Version announcements (DevForum, https://devforum.roblox.com/t/<id>)

Async renames 4257585; collision groups 4848541; DataStore limits 2436230, 4504347, 4739240;
ProfileStore 3190543; chat 3376880; raycast filters 4563575; Animator 857129; Roblox Plus 4567894;
Input Action System 4678416; streaming 2462204, 4764052, 4904553; deferred signals 2276564; Server
Authority 4727993; BindToSimulation 4605516; UnreliableRemoteEvent 2724155; Audio API 3153454;
Unified Lighting 3401512; Avatar Joint Upgrade 4298561; Creator Store sandbox 4634642;
PreferredInput 3750890; Next Gen Studio UI 4085392; built-in Studio MCP 4474643; Script
Sync 4688454.
