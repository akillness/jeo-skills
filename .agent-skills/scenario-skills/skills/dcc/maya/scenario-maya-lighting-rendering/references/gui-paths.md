# GUI paths (for a computer-use agent or a human reading along)

Menus and editors for the same procedures as `procedures.md`. Menu paths come from the sources'
screens and the saved docs; several videos show Maya 2020 to 2022 UIs, so every path marked [verify]
must be confirmed in Maya 2027 before a computer-use agent relies on it. Maya maps Ctrl to Control
and Alt to Option on macOS, not Command (version deltas 2.13).

## Lights

| Task                                                                                  | GUI path                                                                                                    | Notes                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Area, skydome, mesh, photometric (IES) light, portal, physical sky                    | Arnold > Lights > Area Light / Skydome Light / Mesh Light / Photometric Light / Light Portal / Physical Sky | Arvid tears off the Arnold Lights menu to keep it at hand (ARV-L 00:02:50); Mesh light via this menu, not the mesh translator (deprecated, LGT) |
| Area light shape quad, disk, cylinder                                                 | light Attribute Editor > Light Shape [verify label]                                                         | set the shape first (LGT § Area Light (MtoA))                                                                                                   |
| Exposure, intensity, normalize, spread, roundness, soft edge                          | light Attribute Editor > Arnold section                                                                     | exposure in stops (LGT § Exposure); spread 1 = fully open (ARV-L 00:04:30)                                                                      |
| Color temperature                                                                     | light Attribute Editor > Use Color Temperature, Temperature (Kelvin)                                        | 6500 K neutral; overrides color and its textures (LGT)                                                                                          |
| Sampling mode (auto / local), samples                                                 | light Attribute Editor > Arnold > Sampling Mode [verify label, new in MtoA 5.6.0], Samples                  | Samples 0 disables the light (LGT § Samples)                                                                                                    |
| AOV light group                                                                       | light Attribute Editor > Visibility section > AOV Light Group (SARK 00:04:15) [verify section in 2027]      | "default" in the field means empty                                                                                                              |
| Per-ray contributions (camera, diffuse, specular, SSS, indirect, volume), max bounces | light Attribute Editor > Visibility                                                                         | keep Indirect at 1 (LGT)                                                                                                                        |
| Light blocker, decay, barndoor (spot), gobo (spot)                                    | light Attribute Editor > Light Filters > add [verify]; Arnold > Lights > Light Filters [verify]             | blockers on any light; barndoor and gobo only on spots (LGT § Light Filters)                                                                    |
| Place a light by looking through it                                                   | select the light, Panels > Look Through Selected (ARV-L 00:13:03)                                           | the headless substitute is `place_light` / `reflection_placement`                                                                               |
| Group setups and toggle them                                                          | select lights, Ctrl+G (ARV-L 00:10:45); Outliner visibility                                                 | keep alternatives as groups, not deleted lights                                                                                                 |
| Light list with solo toggles                                                          | Arnold > Utilities > Light Manager (Ctrl+Shift click puts it on the shelf, SARK 00:01:28)                   | solo each light before building passes                                                                                                          |
| Light linking                                                                         | Windows > Relationship Editors > Light Linking > Light Centric or Object Centric                            | the skydome is not listed (use defaultLightSet); instanced lights need linking none (LGT)                                                       |

## Render settings (Windows > Rendering Editors > Render Settings, renderer Arnold)

| Tab > section                          | What lives there                                                                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common > File Output                   | File name prefix (with the render pass token for per-pass files), image format, frame range, renderable camera, image size (SARK 00:08:59)                                                                                             |
| Common > Merge AOVs [verify placement] | one multi-layer EXR                                                                                                                                                                                                                    |
| Arnold Renderer > Sampling             | Camera (AA), Diffuse, Specular, Transmission, SSS, Volume Indirect; Adaptive Sampling (Max. Camera (AA), Adaptive Threshold); Clamping; Filter type and width                                                                          |
| Arnold Renderer > Ray Depth            | Total, Diffuse, Specular, Transmission, Volume, Transparency Depth                                                                                                                                                                     |
| Arnold Renderer > Lights               | Light Samples (the Global Light Sampling count) [verify label], Low Light Threshold                                                                                                                                                    |
| Arnold Renderer > Textures             | Auto-convert Textures to TX (off for farms), Use Existing TX (on) (ARV-T 00:14:44)                                                                                                                                                     |
| System                                 | Render Device (CPU only on macOS), Autodetect Threads off and a negative Threads count to keep the GUI fluid (ARV-T 00:13:05)                                                                                                          |
| Advanced                               | Lock Sampling Pattern, Nested Dielectrics                                                                                                                                                                                              |
| AOVs                                   | AOV Browser (double-click Available to Active), Active AOVs with driver and filter drop-downs, Add Custom; per-AOV Attribute Editor: Light Groups, All Light Groups, Global AOV, Light Path Expression; Legacy > Output Denoising AOVs |
| Imagers [verify tab name]              | OIDN denoiser (first in the list), color correct, lens effects (bloom aperture mode in 5.6.0)                                                                                                                                          |

## Rendering and review

| Task                                      | GUI path                                                             | Notes                                                        |
| ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Interactive render                        | Arnold > Render, or Arnold > Open Arnold RenderView                  | Maya IPR does not work with MtoA 5+ (version deltas 2.6)     |
| Switch passes, light groups               | Arnold RenderView > AOV drop-down, Light Groups list (SARK 00:07:19) |                                                              |
| Live light balancing                      | Arnold RenderView > Light Mixer imager [verify]                      | headless substitute: light groups + `grade_to_light`         |
| Region render                             | drag a region in the Arnold RenderView (ARV-C 00:53:24)              | headless: `Render -reg` [verify order], or a crop resolution |
| Render a sequence without a batch license | Render > Render Sequence (LGT § Batch Rendering)                     | command line and Batch Render watermark without a license    |
| Batch render                              | Render > Batch Render                                                |                                                              |
| TX conversion                             | Arnold > Utilities > TX Manager (ARV-T 00:15:17)                     | shell: `maketx` from the MtoA bin folder [verify path]       |
| Denoise an EXR sequence                   | Arnold > Utilities > Arnold Denoiser (noice UI) (ARV-T 00:24:27)     | temporal stability for sequences                             |
| Export a stand-in                         | Arnold > Export Selection, then Arnold > Stand-in (ARV-T 00:15:57)   |                                                              |

## Render Setup

| Task                                          | GUI path                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Open the editor                               | Windows > Rendering Editors > Render Setup (status line icon too)                                                                          |
| Layers, collections, overrides                | right-click in the editor: Create Render Layer, Create Collection; Property Editor for expressions (`chr::*` for namespaces) and overrides |
| Templates                                     | Render Setup File menu > Export All / Import All (Import All only takes Export All files)                                                  |
| Legacy layers vs Render Setup                 | Preferences > Rendering > Preferred Render Setup system, then restart (exclusive per session)                                              |
| Refresh a stale viewport after a layer switch | click the red-bordered visibility icon (CM § Troubleshoot)                                                                                 |

## Color management

| Task                                                                                          | GUI path                                                                                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Enable, config, rendering space, display, view, input rules, output transforms, policy export | Windows > Settings/Preferences > Preferences > Color Management                                      |
| Per-texture space                                                                             | file node Attribute Editor > Color Space, Ignore Color Space File Rules                              |
| Reapply rules to existing nodes                                                               | Preferences > Color Management > Input Color Space Rules > Reapply Rules to Scene [verify placement] |
| Preview view, exposure, gamma (not saved)                                                     | Viewport and Render View color management toolbar                                                    |
| Color-managed swatches                                                                        | Attribute Editor > Show > Show Color Managed Pots (a user setting)                                   |

## Camera

| Task                                                            | GUI path                                 |
| --------------------------------------------------------------- | ---------------------------------------- |
| Arnold DOF, aperture size and blades, anamorphic ratio, shutter | camera Attribute Editor > Arnold section |
| Film fit, film back                                             | camera Attribute Editor > Film Back      |

## Compositing side (Nuke, from the sources; not Maya)

Plus-merge light passes: select two, M, operation plus, channels RGB (SARK 00:10:57; BR 01:00:14); D
disables a node for before/after (SARK 00:12:30); Alt+K clones a grade so both branches stay linked
(SARK 00:14:07). The agent's substitute is `check_sums`, `light_group_sheet` and `grade_to_light`.
