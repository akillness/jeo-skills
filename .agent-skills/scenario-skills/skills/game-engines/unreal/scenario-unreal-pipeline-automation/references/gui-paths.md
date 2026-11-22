# GUI paths for the same procedures (for a computer-use agent)

Menu paths from the 5.8 doc pages and the notes; labels marked [verify] come from older talks (5.1
to 5.5) or were not stated for 5.8. On macOS, documented Ctrl shortcuts usually map to Cmd [verify].
The code path for each row is in `procedures.md`. Not checked in a running 5.8 editor.

## Plugins and project settings

| Task                                                                                                                  | Human path                                                                                                                                                                                                | Code                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Enable plugins (Python Editor Script, Editor Scripting Utilities, Data Validation, PythonAutomationTest, Interchange) | Edit > Plugins, search, tick, restart                                                                                                                                                                     | `ue_env.enable_plugins(uproject, [...])`                                                        |
| Python settings (Developer Mode, Startup Scripts, Additional Paths, Enable Remote Execution)                          | Edit > Project Settings > Plugins > Python                                                                                                                                                                | `init_unreal.py`; remote execution for `ue_remote.PythonRemote`                                 |
| Interchange pipeline stacks                                                                                           | Edit > Project Settings > Engine > Interchange (Import Content: Assets, Materials, Textures; Import Into Level)                                                                                           | preset passed per import (P2)                                                                   |
| Engine pipelines                                                                                                      | Content Drawer > Settings > Show Engine Content > Engine > Plugins > Interchange Framework Content > Pipelines                                                                                            | `describe_pipeline()`                                                                           |
| Source control                                                                                                        | Edit > Editor Preferences > Loading & Saving (Automatically Checkout on Asset Modification, Prompt for Checkout on Package Modification); toolbar source control icon ("Revision Control" label [verify]) | PythonScript commandlet enables it before the script (5.8); `require_checkout`; `-autocheckout` |
| Unreal MCP                                                                                                            | Edit > Editor Preferences > General > Model Context Protocol > Auto Start Server                                                                                                                          | `-ModelContextProtocolStartServer`                                                              |
| Remote Control                                                                                                        | Edit > Plugins > Remote Control API; Project Settings > Plugins > Remote Control (5.8 UFUNCTION allow list [verify label])                                                                                | not used for imports                                                                            |

## Import

| Task                          | Human path                                                                                                                                                 | Code                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Import with a stack           | Content Browser > Import (or drag in); Interchange Pipeline Configuration window: Choose Pipeline Stack, Basic Layout, Filter on Contents, Preview, Import | `P.import_source` via the job         |
| See real defaults of a preset | import window > Reset Selected Pipeline (Oq6KbrqkGnw [00:13:48])                                                                                           | scripted imports read defaults anyway |
| Material route                | pipeline asset or import window > Materials: Material Import (Import as Material Instance), Parent Material (labels regrouped in 5.8 [verify])             | `pipeline_settings(route=...)`        |
| Vertex colors                 | pipeline asset or import window > Common Meshes: Vertex Color Import Option (Replace, Ignore, Override)                                                    | `EnumRef` row in the preset           |
| Inspect factory nodes         | add the Graph Inspector pipeline to a manual import's stack                                                                                                | log nodes from a Python pipeline      |
| Reimport                      | right-click asset > Reimport (conflicts window for material and skeleton changes)                                                                          | `reimport` action                     |
| Datasmith                     | Create (or Quick Add) > Datasmith > File Import                                                                                                            | P13                                   |

## Mesh settings

| Task                             | Human path                                                                                                                         | Code                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Nanite on one mesh               | Static Mesh Editor > Details > Nanite Settings > Enable Nanite Support; Fallback Relative Error                                    | `apply_mesh_rules`                                                      |
| Nanite in bulk                   | Content Browser select > right-click > Nanite > Enable                                                                             | same                                                                    |
| Collision                        | Static Mesh Editor > Collision menu (Add Box, Add 26DOP, Auto Convex Collision); viewport Show > Simple Collision                  | `add_simple_collisions`, `set_convex_decomposition_collisions` [verify] |
| LODs                             | Static Mesh Editor > Details > LOD Settings (LOD Group, Number of LODs, per-LOD Reduction Settings)                                | `lod_group` property or `set_lods`                                      |
| Material slots                   | Static Mesh Editor > Details > Material Slots                                                                                      | `assign_materials`                                                      |
| Material instance parameters     | double-click the MI > Details > Parameter Groups                                                                                   | `create_material_instance`                                              |
| Texture compression, sRGB, group | Texture editor > Details > Compression (Compression Settings), Texture (sRGB, Flip Green Channel), Level Of Detail (Texture Group) | `apply_texture_role`                                                    |

## Validation, redirectors, tests

| Task                  | Human path                                                                                                                             | Code                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Validate assets       | Content Browser right-click > Asset Actions > Validate Assets (or Validate Assets and Dependencies)                                    | job `validate`                            |
| Validate a folder     | right-click folder > Validate Assets in Folder                                                                                         | same                                      |
| Validate the project  | Tools > Validate Data...                                                                                                               | `-run=DataValidation` plus job `validate` |
| Validator cost        | console: `DataValidation.ReportCookValidationStats 1` (5.8, on by default), then read the cook log                                     | `validate_paths(...)["cost"]`             |
| Read results          | Window > Message Log > Asset Check / Data Validation                                                                                   | report.json                               |
| Show redirectors      | Content Browser Filter > Miscellaneous > Redirectors (or Other Filters > Show Redirectors)                                             | `redirectors_left`                        |
| Fix redirectors       | right-click redirector > Fixup; right-click folder > Fix Up Redirectors [verify label]                                                 | ResavePackages `-fixupredirects`          |
| Run tests             | Tools > Test Automation (Window > Test Automation on one page; Tools > Session Frontend in older talks): tick, Start Tests; export CSV | `P.automation_command`                    |
| Functional test       | place a Functional Test actor; Details > Time Limit; Level Blueprint OnTestStart > Finish Test                                         | C++ or Python tests                       |
| Screenshot comparison | Test Automation > Screenshot Comparison tab                                                                                            | P6 latent test                            |

## Editor utilities for the team

| Task                  | Human path                                                                                                                           | Code                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Asset Action Utility  | Content Browser right-click > Editor Utilities > Editor Utility Blueprint > Asset Action Utility; Class Defaults > Supported Classes | Execute Python Script node (P12)                         |
| Run it                | right-click assets > Scripted Asset Actions > category > function (Shift+click opens the Blueprint)                                  | job `validate`                                           |
| Editor Utility Widget | Editor Utilities > Editor Utility Widget; right-click > Run Editor Utility Widget                                                    | `EditorUtilitySubsystem.spawn_and_register_tab` [verify] |

## Build

| Task                        | Human path                                                                                                                          | Code                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Package                     | toolbar Platforms > Mac > Package Project                                                                                           | `P.package_command` + `ue_run.run_uat`                   |
| Get the exact command       | Platforms > Project Launcher (new UI Beta since 5.6, Legacy kept) > custom profile > run, copy from Output Log after `BuildCookRun` | `P.buildcookrun_diff(cmd, line)`, CLI `compare-launcher` |
| Xcode project settings      | Project Settings > Platforms > Xcode Projects section [verify path] (bundle ID, signing)                                            | `.p8` key on build machines                              |
| Distribute                  | Xcode > Product > Archive > Organizer > Distribute App                                                                              | `-distribution`                                          |
| Unquarantine a received app | Finder > right-click > Open (once)                                                                                                  | `xattr -dr com.apple.quarantine MyGame.app`              |
