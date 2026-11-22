# scenario-zbrush-automation GUI paths (for a human or a computer-use agent)

The same operations as procedures.md, by palette, button and hotkey, ZBrush 2026.2.1 on macOS. Item
paths in code are the same labels joined by `:`. Labels marked [verify] are from docs or older
builds; confirm with Ctrl+hover (the path shows at the bottom of the popup, Maxon ZScript manual) or
the Activity log.

## Scripting and macros

| Operation               | GUI                                                                                            | Notes                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Run a Python file       | ZScript > Python Scripting > Load (file dialog), Reload                                        | the agent uses `zbrush.utils.run_path` or the bridge instead           |
| Show Python output      | ZScript > Script Window Mode > Python Output                                                   | output appears when the script returns                                 |
| Record Python           | ZScript > Python Scripting > New Macro, act, End Macro (save dialog)                           | Load places a console button; click it to run                          |
| Record ZScript          | Macro > New Macro, act, Macro > End Macro                                                      | save in `<Asset Dir>/ZStartup/Macros/<Subfolder>/`, name 8+ characters |
| Reload macros           | Macro > Reload All Macros                                                                      | a new subfolder needs a restart                                        |
| ZScript window          | H toggles it; ZScript > Load, Reload, Record, EndRec                                           | loading a script removes the previous one's buttons                    |
| Read a path             | hover an item, hold Ctrl                                                                       | same string as the recorded `IPress` line                              |
| Hotkey any button       | Ctrl+Alt+click the button, press the key (Pavlovich [01:04:24]); Preferences > Hotkeys > Store | never assign or send Cmd+W (quits ZBrush on macOS)                     |
| Abort a macro or script | Esc                                                                                            | Decimation Master doc: Esc stops a plugin that keeps focus             |
| Asset Directory         | Preferences > Asset Directory > Open Directory, Change Location (restart), Reset to Default    | here `~/Library/Preferences/Maxon/ZBrush_03C27D49/`                    |
| Known UI state          | Preferences > Init ZBrush                                                                      | resets the interface: save first                                       |
| Store configuration     | Preferences > Config > Store Config (Shift+Cmd+I on macOS)                                     | changes the user's startup UI                                          |

## Files

| Operation                    | GUI                                                      | Notes                                                                                                        |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| New tool from a file         | Tool > PolyMesh3D (star), then Tool > Import             | Import on another tool replaces its active SubTool                                                           |
| Export the active SubTool    | Tool > Export (extension picks OBJ, GoZ, others)         | options Qud, Tri, Txr, Grp, Mrg, Smooth Normals, Scale, X/Y/Z Offset at the bottom of the Export sub-palette |
| Import and export axis flips | Preferences > ImportExport (iFlip, eFlip, NormalMapFlip) | global since 2021.7                                                                                          |
| Save the tool                | Tool > Save As (.ZTL)                                    | Ctrl+S saves a project, not the tool                                                                         |
| Save the project             | File > Save As (.ZPR)                                    | opening a ZPR removes every loaded tool                                                                      |
| Export a texture             | Texture > Export                                         | after Tool > Normal Map > Clone NM or Tool > Texture Map > Clone Txtr                                        |
| Export an alpha              | Alpha > Export                                           | after Tool > Displacement Map > Clone Disp [verify]                                                          |

## SubTools

| Operation             | GUI                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Duplicate             | Tool > SubTool > Duplicate (Edit mode on)                                                                                   |
| Move up or down       | Tool > SubTool > arrow buttons (MoveUp, MoveDown); Shift+MoveUp jumps to the top (pocacola, Maxon forum)                    |
| Rename                | Tool > SubTool > Rename (text prompt)                                                                                       |
| Folder from selection | Ctrl+F with SubTools selected (2026.1), asks for a name                                                                     |
| Visibility            | eye icon per SubTool and per folder                                                                                         |
| Project detail        | Tool > SubTool > Project All (Dist, Mean, PA Blur)                                                                          |
| Export every SubTool  | Zplugin > SubTool Master > Export (visible) [verify]; Decimation Master > Export All SubTools (one OBJ, groups per SubTool) |

## Plugins

| Plugin             | GUI path                                                                                                                                                                                  | Main controls                                                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UV Master          | Zplugin > UV Master                                                                                                                                                                       | Unwrap, Unwrap All, Symmetry, Polygroups, Use Existing UV Seams, Enable Control Painting (Protect, Attract, Erase, Density), Attract From Ambient Occlusion, Check Seams, Flatten, UnFlatten, Work On Clone, Copy UVs, Paste UVs, Clear Control Maps               |
| Native unwrap      | Tool > UV Map > Create (Unwrap)                                                                                                                                                           | Unwrap, Auto Seams, Crease Edges, Crease Seams, Symmetry; UV Map Size                                                                                                                                                                                              |
| Decimation Master  | Zplugin > Decimation Master                                                                                                                                                               | Freeze Borders, Keep UVs, Keep & Use PolyPainting, Pre-process Current, Pre-process All, % of decimation (or a target in thousands of points or polygons [verify labels]), Decimate Current, Decimate All, presets, Utilities > Delete caches, Export All SubTools |
| Multi Map Exporter | Zplugin > Multi Map Exporter                                                                                                                                                              | map switches (Displacement, Vector Displacement, Normal, Texture From Polypaint, Ambient Occlusion, Cavity, Export Mesh), SubTools, Merge Maps, Map Size, Map Border, Flip V, Export Options, Create All Maps (save dialog)                                        |
| Maps per SubTool   | Tool > Normal Map (Tangent, Adaptive, SmoothUV, SwitchRG, FlipR/G/B, Create NormalMap, Clone NM); Tool > Displacement Map (Create DispMap, Mid, 32Bit, Clone Disp, Create And Export Map) | the selected level is the base, the top level the detail                                                                                                                                                                                                           |
| FBX                | Zplugin > FBX ExportImport (Selected, Visible, All; version; Tris; axis preset, "If in doubt then MayaYUp")                                                                               | options window: human step                                                                                                                                                                                                                                         |
| Scale              | Zplugin > Scale Master (Set Scene Scale dialog, ZBrush Scale Unify, Export to Unit Scale)                                                                                                 | dialogs; prefer Tool > Export > Scale                                                                                                                                                                                                                              |
| Substance Painter  | Texture > Substance Bridge > Send to Painter (2026.2)                                                                                                                                     | starts Painter, a new project each send                                                                                                                                                                                                                            |

## GoZ

| Operation                   | GUI                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Send                        | Tool palette top: GoZ (active), All, Visible; R resets the target app                                |
| New objects as SubTools     | Preferences > GoZ > Import as SubTool                                                                |
| Reinstall or repath targets | Preferences > GoZ > Update all Paths, Path to <App>, Force reinstall                                 |
| Maya side                   | GoZBrush shelf (from `userSetup.mel` sourcing `GoZScript.mel`), `gozMaya` plug-in, command port 5555 |
| Blender side                | GoB add-on (Blender extension): GoB Export and GoB Import in the top bar; Import keeps listening     |

## Human hand-off list (what the agent cannot click)

FBX export and import options; SubTool Rename and New Folder prompts; End Macro save dialog; GoZ app
chooser on the first press; GoZ reprojection prompt; Delete and Merge Down confirmations without a
key macro; Scale Master and 3D Print Hub size dialogs; Change Location of the Asset Directory. For
each, the agent screenshots first (when the screen is unlocked), names the button, and states what
the click will do.
