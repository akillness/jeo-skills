# Sources

Retrieved or watched in October 2026. Credentials are as the sources present them; "unverified"
means no independent check.

## Documentation (create.roblox.com)

| Source                   | URL                                                                           | Best for                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Input Action System      | https://create.roblox.com/docs/input/input-action-system                      | contexts, Priority 2000 and Sink, bindings, `UIButton`, label resolution, polling analog input |
| Gamepad input            | https://create.roblox.com/docs/input/gamepad                                  | `PreferredInput` over platform checks                                                          |
| Position and size        | https://create.roblox.com/docs/ui/position-and-size                           | Scale and Offset, mobile zones, placement relative to `JumpButton`                             |
| On-screen containers     | https://create.roblox.com/docs/ui/on-screen-containers                        | `ResetOnSpawn`, nested ScreenGuis, `ScreenInsets`                                              |
| List and flex layouts    | https://create.roblox.com/docs/ui/list-flex-layouts                           | flex fill, wraps, grid versus flex, reversed `LayoutOrder`                                     |
| UI animation             | https://create.roblox.com/docs/ui/animation                                   | tweens, `CanvasGroup` fades, typewriter text                                                   |
| UI styling               | https://create.roblox.com/docs/ui/styling                                     | StyleSheets, tokens, themes, query selectors, modified properties                              |
| Style Editor             | https://create.roblox.com/docs/ui/styling/editor                              | the GUI path for designs                                                                       |
| Accessibility guidelines | https://create.roblox.com/docs/production/publishing/accessibility            | `PreferredTransparency`, `PreferredTextSize`, `ReducedMotionEnabled`                           |
| Automatic translations   | https://create.roblox.com/docs/production/localization/automatic-translations | Automatic Text Capture, quota, locked entries                                                  |
| Add source content       | https://create.roblox.com/docs/production/localization/add-source-content     | Localization Tools, CSV round trip                                                             |
| Device Simulator         | https://create.roblox.com/docs/studio/device-simulator                        | toolbar, categories, display scaling, Device Manager                                           |
| Controller Emulator      | https://create.roblox.com/docs/studio/controller-emulator                     | emulated gamepads, handhelds, TV remotes                                                       |
| Console guidelines       | https://create.roblox.com/docs/production/publishing/console-guidelines       | ten-foot UI, `ViewportDisplaySize` Large, no chat window, few moves per key action             |
| Input overview           | https://create.roblox.com/docs/input                                          | default and Roblox-reserved bindings (keys a rebind must refuse)                               |
| Chat window              | https://create.roblox.com/docs/chat/chat-window                               | `ChatWindowConfiguration`: enable, alignment, size                                             |
| Custom events            | https://create.roblox.com/docs/production/analytics/custom-events             | server-only, published-only events; 100 events; adoption of a UI component                     |
| Custom fields            | https://create.roblox.com/docs/production/analytics/custom-fields             | `Enum.AnalyticsCustomFieldKeys`, string values                                                 |

## API reference (Roblox creator-docs repository)

| Class or enum                                             | URL                                                                                  | Best for                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| StudioDeviceSimulatorService                              | https://create.roblox.com/docs/reference/engine/classes/StudioDeviceSimulatorService | scripted device presets and orientation                                              |
| StyleRule, StyleSheet                                     | https://create.roblox.com/docs/reference/engine/classes/StyleRule                    | selectors, `SelectorError`, priority, transitions                                    |
| InputContext, InputAction, InputBinding, InputActionLabel | https://create.roblox.com/docs/reference/engine/classes/InputBinding                 | Scriptable bindings, `PreferredBinding`, deprecated `InputAction:Fire`               |
| GuiService                                                | https://create.roblox.com/docs/reference/engine/classes/GuiService                   | `TopbarInset`, `ViewportDisplaySize`, `Select`, `SelectedObject`, player preferences |
| UserInputService                                          | https://create.roblox.com/docs/reference/engine/classes/UserInputService             | `PreferredInput`                                                                     |
| GuiService.PreferredTextSize, Enum.PreferredTextSize      | https://create.roblox.com/docs/reference/engine/classes/GuiService                   | Medium to Largest, read-only, the `@PreferredTextSize*` selectors (StyleRule)        |
| ChatWindowConfiguration                                   | https://create.roblox.com/docs/reference/engine/classes/ChatWindowConfiguration      | `AbsolutePosition`, `AbsoluteSize`, `Enabled`                                        |
| SoundGroup                                                | https://create.roblox.com/docs/reference/engine/classes/SoundGroup                   | `Volume` multiplier, 0 to 10                                                         |
| Enum.ContextActionPriority                                | https://create.roblox.com/docs/reference/engine/enums/ContextActionPriority          | 1000, 2000, 3000                                                                     |
| Source repository                                         | https://github.com/Roblox/creator-docs                                               | the YAML behind every reference page                                                 |

## Videos

| Expert                                                                 | Credential                                                                           | URL                                         | Best for                                                       | Best timestamps                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Jasmine and Alex (Roblox Learn)                                        | Roblox product manager, interactivity; player scripts engineer                       | https://www.youtube.com/watch?v=Fg-Ksoa7b-s | IAS walkthrough, migration by intent                           | 00:02:38, 00:04:04, 00:06:39                     |
| Jasmine, Alex, host Jeremy (Roblox Learn)                              | Roblox staff                                                                         | https://www.youtube.com/watch?v=KnFJl6z5UN0 | IAS priority, Sink, rollout, gaps                              | 00:13:30, 00:17:26, 00:18:33, 00:25:43, 00:39:43 |
| Roblox product team (Roblox Learn)                                     | Roblox product manager and UI/UX designer                                            | https://www.youtube.com/watch?v=_k1ea0OIKaU | tokens, themes, runtime theme swap                             | 00:03:22, 00:03:52, 00:04:56, 00:05:57           |
| Cindering, Nathan "Undone Builder", hosts Dan and Erin (Roblox Learn)  | lead developer Cinder Studios; CEO Simple Games (War Simulator)                      | https://www.youtube.com/watch?v=BsyU-SJ9L-c | mobile hot zones, fewer elements, emulator checks              | 00:07:13, 00:08:20, 00:11:15, 00:14:06, 00:32:09 |
| BitwiseAndrea, WooleyWool, ControlCoreAngel, host DSPAV (Roblox Learn) | Roblox accessibility engineer; disabled developers                                   | https://www.youtube.com/watch?v=K1pEI6LVJJA | second channel, color, keys, motion                            | 00:18:25, 00:29:24, 00:43:15, 00:48:51           |
| Andrea Fletcher, grilme99, kampfkarren, elttob, boatbomber (RDC 2024)  | Roblox design systems lead; React maintainer; Fusion author; plugin and tool authors | https://www.youtube.com/watch?v=OHqMLEL5QnY | framework choice, benchmarks, preview harness, no root UIScale | 00:05:42, 00:09:20, 00:28:11, 00:38:15           |
| Leif                                                                   | YouTube Roblox developer (unverified)                                                | https://www.youtube.com/watch?v=Ezk3vEOvv8o | React Luau bindings, state placement                           | 00:10:25, 00:12:44, 00:13:51                     |
| Chase Higgins                                                          | developer (unverified)                                                               | https://www.youtube.com/watch?v=p86bt9ROQfk | Vide sources and effects                                       | 00:07:36, 00:11:40                               |
| Fusion 0.3 showcase                                                    | open source showcase (unverified presenter)                                          | https://www.youtube.com/watch?v=3e406QQHt7o | Fusion 0.3 scopes and `peek`                                   | 00:01:58, 00:10:50, 00:13:37                     |
| Itz_FloppyFish                                                         | beginner tutorial channel (unverified)                                               | https://www.youtube.com/watch?v=BLZl-0cl2DM | constraints on outer containers, grids in scrollers            | 00:05:52, 00:16:37, 00:27:12                     |
| Stewiepfing                                                            | YouTube scripter (unverified)                                                        | https://www.youtube.com/watch?v=9kuWl_t1AOE | stroke joins, progress bars, iPad aspect                       | 00:00:12, 00:00:54, 00:02:59                     |
| Stewiepfing                                                            | YouTube scripter (unverified)                                                        | https://www.youtube.com/watch?v=h-POiqC120Y | per-frame motion, clamped progress                             | 00:02:41, 00:14:37                               |
| BrawlDev                                                               | scripting educator since 2016 (unverified)                                           | https://www.youtube.com/watch?v=gsA2_hlvfF0 | legacy CAS buttons (superseded)                                | 00:14:45, 00:26:14                               |
| BrawlDev                                                               | scripting educator (unverified)                                                      | https://www.youtube.com/watch?v=jRnyca_BWZQ | list, grid and page layouts                                    | 00:03:14, 00:07:21                               |
| TwinPlayz                                                              | hobbyist creator (unverified)                                                        | https://www.youtube.com/watch?v=5-Wo0EHzJtM | console conventions                                            | 00:04:05, 00:07:50                               |
| derpmonster83                                                          | hobbyist developer (unverified)                                                      | https://www.youtube.com/watch?v=8nqNw6kSKJ0 | state-scoped IAS contexts                                      | 00:08:26, 00:09:21                               |
| Hamorei, presented by Kek                                              | UI designer (unverified)                                                             | https://www.youtube.com/watch?v=z16zs2v-FNI | cartoony UI recipe, stroke and radius constants                | 00:12:11, 00:24:27, 00:34:07                     |
| TheDevKing                                                             | YouTube educator (unverified)                                                        | https://www.youtube.com/watch?v=QWdyxoni7aw | localization basics (2020 paths)                               | 00:05:00, 00:07:08                               |

## Added thresholds

| Value                                    | Source                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Contrast 4.5:1, 3:1 for large text       | WCAG 2 (https://www.w3.org/TR/WCAG22/#contrast-minimum)                                                        |
| 44 pt minimum target, 11 pt minimum text | Apple Human Interface Guidelines (https://developer.apple.com/design/human-interface-guidelines/accessibility) |
