# scenario-zbrush-automation expert notes

The depth behind SKILL.md: what each source says, where, and how it changes an agent's batch. Notes
live in `notes/scripting/`, `notes/versions/`, `notes/maps-export/`, `notes/retopology-uv/`,
`notes/pipeline/`; version facts in `sources/zbrush-version-deltas.md`. `[added]` marks this skill's
own inference.

## 1. Control: one active script, plugins that keep it

- **marcus_civis** (ZBrushCentral, long-time ZScript and plugin author), 2014-02-17: "only one
  zscript/plugin can be active at a time, so if your zscript calls someting like UV Mapper control
  passes to UV Mapper and no more commands will run in your zscript." Same author, 2013-06-20 and
  2019-04-22: a script handed to ZBrush on the command line only runs without a button when wrapped
  in `[If,1, ...]`, and should guard itself with a memory block so it runs once.
- **ijacobs** (ZBrushCentral, 2013-02-21): "as soon as my code clicks the Pre-Process All button in
  Decimation Master, my script exits because Decimation Master is a plugin that calls it's own
  scripts." He pre-processed by hand, then ran a per-SubTool decimate loop (target 75,000 points per
  SubTool for print: `% = 75000 / points * 100`).
- **cgside** (3D environment artist, "ZSCRIPT in Zbrush | Automate tasks", 2022): "we can't really
  run other plugins like the decimation master within our script by default" [00:06:56]; a free
  helper plugin with a two-run routine got around it [00:08:38]. Decimation target: points / 10,
  then / 1000 because the plugin field is in thousands [00:08:04].
  - His remesh recipe [00:01:43]-[00:02:51], scripted at [00:08:38]-[00:09:42]: save with a suffix,
    Merge Visible, fill white, duplicate and decimate; then Polygroups > Auto Groups (one group per
    separate piece), duplicate again, ZRemesher with Keep Groups, Divide 4 times, move to the top,
    save, hide the decimated SubTool, set the projection settings, ProjectAll. Keep Groups on Auto
    Groups is what makes the low follow each piece of a merged tile instead of bridging them. The
    toolkit runs it as `make_low(auto_groups=True)` (on the copy [added]) and it is on in
    `DEFAULT_PARAMS`.
  - "save it before projectile [ProjectAll] since it might crash the program this way we have some
    sort of backup" [00:02:19]: `zb_ops.project_all` refuses to run without a checkpoint, and
    `divide_project` saves once before its first pass.
- **MadPony** (plugin author, "What is ZScript", 2019): "one Z script will cancel out the other Z
  script" [00:00:35]; loading a recorded script removed the macro's button [00:05:52]. "Improving
  the Nudge Axis Plugin" [00:03:27]: a plugin's variables were wiped after another macro ran.
- **Maxon interfaces doc**: "Only one zscript (or plugin or macro) can be active at a time"; Python
  differs: "a single, persistent session".
- Agent consequence [added]: in Python the question is whether `zbc.press()` on a ZScript plugin
  returns to the caller at all (untested in 2026: scenario-zbrush-expert live_08, live_09, this
  skill's live_a02, live_a03). Until then every plugin press is a separate bridge call with a
  timeout, and the batch runner, not ZBrush, owns the loop.

## 2. Dialogs, notes and popups

- **TVeyes** (ZBrushCentral, 2015-04-11): "There is no reliable solution to using an external
  library to dismiss the note window based messages ZBrush displays." Merge Down's confirmation
  cannot be answered by a script because Space or Enter triggers the first Note button, which is
  Cancel (TVeyes, dargelos).
- **danvas** (2017-03-10): a studio dropped ZBrush from its render farm because Note dialogs when
  splitting polygroups could not be controlled.
- **BigRoyNL** (2024-03-07): "I can run zscripts from external, but have no way to detect whether
  they succeed or error"; plugin exports "seem to stop the current zscript execution".
- **m_adam** (Maxon SDK team, 2025-02-25): background-thread export from another program is likely
  impossible, and "if the export plugin, trigger a popup you are screwed".
- **ferdinand** (Maxon SDK team, 2025-03-11) on FBX: "You cannot escape any GUI associated with such
  call." **pablo31** (2026-02-04): `set_next_filename` before `Zplugin:FBX ExportImport:Import`
  still opened the file dialog; `Tool:SubTool:New Folder` opens a name prompt.
- **usd-portal** (baborub, tested on 2026.2): the USD Format plugin "opens its own file dialog and
  ignores FileNameSetNext".
- **Maxon shipped macros** (2026.2.1): confirmations are answered by holding a key during the press:
  `[IKeyPress,'2',[IPress,Tool:SubTool:Del All]]` (Delete All),
  `[IKeyPress,'1',[IPress,"Brush:Create:Create InsertMesh"]]` (Create Instance Subtool).
- **pocacola** (Maxon forum, 2026-04-21): Python `press_key` with modifier chords does not work;
  pressing a macro button that contains the `IKeyPress` worked.
- **SDK stub** (2026.1): `press_key` "Does not work, hidden for now"; `merge_undo` "Not
  implemented"; `message_*`, `ask_*` and `show_note(duration 0)` block until a click.
- Agent consequence: the dialog budget of a recipe is decided before the run (table in section 9);
  `has_next_filename()` after a file press is the cheap detector [added]; a modal Note is visible
  only in a screenshot, because ZBrush draws Notes inside its canvas, not as OS windows [added:
  System Events lists OS windows only].

## 3. Files without dialogs

- **Command reference** (FileNameSetNext): "Pre-sets the file name that will be used in the next
  Save/Load action"; `FileNameHasNext` tests whether it is still pending. Python:
  `set_next_filename`, `has_next_filename`, `get_last_used_filename` (returns a full path despite
  its name, SDK system doc).
- **MadPony** ("Tools and Folders", 2019): `FileNameSetNext` before `Tool:Save As` names the saved
  tool [00:02:51]; without it the tool takes its first SubTool's name [00:03:48].
- **Maxon example ex_mod_subtool_export** (Javier Edo, 2025): loop SubTools, skip unless status bit
  0x01, name from `get_active_tool_path().rsplit('/')[-1]`, `set_next_filename`,
  `press("Tool:Export")`, `sys.exit(not exported)`.
- **usd-portal**: folder-aware visibility (eye 0x1 and folder 0x2); `.GoZ` by path "reliably carries
  UVs + polypaint"; OBJ is the reliable import; import onto the PolyMesh3D star, never SimpleBrush;
  Duplicate is "not found" outside Edit mode; textures need unique file names or ZBrush adds "(1)".
- **Paul Gaboury** (Maxon, #AskZBrush echGh0tZEts, 2022): OBJ cannot keep every SubTool with its
  name in one file [00:00:34]; FBX can, through its options dialog [00:01:06]; check by re-importing
  onto the PolyMesh3D star [00:01:42].
- **Maxon SDK environment doc**: the working directory is the app folder; since 2026.1 ZBrush does
  not write into its install (interfaces doc "Important Information for Users"): absolute paths
  outside the install only.

## 4. Launch channels

| Channel                                                                                              | Source                                               | Good for                                              | Weak points                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Project bridge (socket plus main-thread serve loop)                                                  | README (proven 04:25, 05:20)                         | interactive batches with return values and tracebacks | a hung main thread silences it; startup stall since 05:29 (open) |
| `ZBrush -script job.py args scene.ZPR`                                                               | Maxon SDK quickstart; ex_mod_subtool_export          | one process per file, isolation by process            | quit-on-exit and `-batch` undocumented; launch cost per file     |
| File-drop ZScript (`open -a ZBrush.app job.txt`)                                                     | usd-portal, GoB, gozbruh                             | stock install without the bridge                      | one way, no errors, ends the active ZScript, VarSave sandbox     |
| GoZ folder (`GoZ_ObjectList.txt` + `GoZBrushFromApp.app`)                                            | GoZ SDK; GoB                                         | pushing meshes in from another app                    | not a command channel; names and identifiers must match          |
| Startup Python (`init.py` on PYTHONPATH, `*.py` on ZBRUSH_PLUGIN_PATH, `<Asset Dir>/Python/init.py`) | SDK environment doc; davide (Maxon forum 2026-04-15) | installing helpers permanently                        | changes the user's ZBrush                                        |

## 5. Learning paths

- **Maxon ZScript manual**: "do the thing you're interested in while recording a zscript of your
  actions... open this in a text editor and examine it"; "To find the button path for any item on
  the interface, place the cursor over the item and hold down Ctrl."
- **MadPony** ("What is ZScript" [00:04:40]-[00:05:17]): the Ctrl+hover path equals the recorded
  `IPress` line.
- **Pavlovich** (Workshop 45, 2018): recorded ZRepeat It scripts are editable text ("you can go
  through here and you can edit it" [01:02:07]); Ctrl+Alt+click any button to give it a hotkey
  [01:04:24].
- **Maxon SDK quickstart**: Python Scripting > New Macro and End Macro record Python; End Macro
  opens a save dialog; loading the file places a button instead of running it.
- **SDK API overview**: item paths ignore case and spaces; picker items (brushes, tools, materials)
  resolve by name without opening the picker.
- **Project Activity log** (README, 05:20 log): ZBrush writes every `IPress`/`ISet` with its
  canonical path, including plugin sliders at startup (`ISet, "Zplugin:3D Print Hub:X(mm)", 25.4`);
  the agent reads new lines after a human click [added use as an oracle].

## 6. Per-SubTool repetition and names

- **Pavlovich** (Workshop 45): ZRepeat It "you can record ... and then name it and then you can tell
  it I want to apply what I just did to this single visible sub tool or all visible sub tools or all
  sub tools" [00:37:30]; demo DynaMesh 64, Blur 0 [00:42:53]. Not shipped in 2026.2.1: a Python loop
  replaces it.
- **MadPony** ("Selecting SubTools" [00:01:03]-[00:03:10]): names repeat and "a duplicate will
  always give you the same ID"; work by index, re-read after any reorder; the ItemInfo title ends
  with a period (strip 2 characters, usd-portal).
- **MadPony** ("Renaming SubTools" [00:00:34]; "Moving SubTools" [00:01:06]): `ToolSetPath` renames
  only the top SubTool; move it up while MoveUp is enabled, rename, move back.
- **davide** (Maxon forum 2026-09-10): SubTool and folder management "are high on the list" for a
  future API; no date.
- **GoZ docs** ("Restrictions"): unique Tool and SubTool names "including between all the loaded
  Tools", no spaces or non-alphanumeric characters; PolyMesh3D only.

## 7. Plugins

- **Decimation Master doc**: options, then Pre-process (progressive meshes from 100 to 0 % on disk),
  then Decimate; the result reflects the model at pre-process time; unique SubTool names required; a
  new tool with a cached name reuses stale caches; Keep UVs +50 % memory; quality 40 to 100 % near
  identical, 2 % still good, 1 % degrades; killing the plugin process leaves ZBrush alive but the
  calling ZScript keeps focus, and ESC stops it (Troubleshooting). Up to 100M polygons since
  2021.6.3 (version deltas).
- **Ian Robinson** (Maxon, #AskZBrush bVX9utHc_ZI, 2022): Use and Keep Polypaint "by default this is
  turned off" [00:01:17]; presets pre-process and decimate in one click [00:02:15].
- **Joseph Drust** (Pixologic, #AskZBrush mRfA_WDvvrg, 2018): polygroups are lost; Unweld Groups
  Border [00:02:35], Freeze Borders and a preset [00:03:14], Auto Groups [00:03:50], Weld Points
  [00:04:30], divide to check [00:05:04].
- **UV Master doc**: a UV creator, not an editor; 100k to 150k faces maximum, up to 5 minutes at
  150k; Work on Clone whenever there are levels or polypaint (clone is a new CL_ tool); Copy UVs,
  Paste UVs between same-topology meshes; polygroups speed it up and reduce cuts; Attract from
  Ambient Occlusion is the stroke-free seam hint; control maps are bound to the tool name. UV Master
  with Polygroups fixed in 2026.2.0 (release notes).
- **Multi Map Exporter doc**: Create All Maps opens a save dialog; aborting with ESC can lose UVs,
  back up first; Mid 0 and Scale 1 for 32-bit displacement, 0.5 and Get Scale's lower value for
  16-bit; Flip V flips all maps; UDIM naming options.
- **Joseph Drust** (#AskZBrush n0qqpwvn-jA, 2017): a ZBrush map compares the selected level with the
  highest level of the same SubTool, "you can't have a subtool that is your low resolution version
  and then a subtool that is your high resolution version" [00:01:14]; 2zDAtaQqwh8 (2020): baking
  from a high level keeps only micro detail [00:02:53].
- **SDK stub**: `create_normal_map(..., local_coordinates=False)` is world space by default; tangent
  needs True.

## 8. GoZ, Maya and Blender

- **GoZ docs**: GoZ, All, Visible, R; ZBrush sends the lowest subdivision level; maps travel only if
  loaded in the Tool's map slots; topology changes raise a reprojection prompt that "can be time
  consuming" and "may alter a little bit the quality"; Preferences > GoZ > Import as SubTool.
- **GoZ SDK** ("not really a true SDK"): the shared folder `/Users/Shared/Pixologic`; object
  identifier = full path without extension; `GoZ_ObjectList.txt`; `GoZBrushFromApp` opens listed
  objects in the running ZBrush; `GoZ_Info.txt` flip flags per app.
- **Local files** (2026-09-24): Maya's `GoZ_Info.txt` sets EXPORT/IMPORT_FLIP_Y and _Z and
  NORMAL_MAP_FLIP_VERT to TRUE; Maya's `GoZ_Config.txt` points at `/Applications/Autodesk/maya2017`
  (no Maya installed); the Maya side loads the `gozMaya` plug-in and opens command port 5555;
  `ZResources/DXFStar.GoZ` confirms the binary layout (header, name, flags 5001, points 10001, faces
  20001, material 2, 16-byte end).
- **FlippedNormals** (Morten Jaeger, Henning Sanden, 2020): GoB is "by far the fastest way"; GoZ
  exports "from the lowest subdivision level" [00:04:02]; delete lower levels before sending if
  polypaint resolution matters [00:06:01]; pack and unpack textures out of the public folder
  [00:08:15]; FBX into Blender at scale 1000 [00:11:21].
- **usd-portal**: GoZ UVs match USD, but an imported Texture Map needs a V flip; OBJ vertex colors
  are decoded sRGB to linear, so pre-encode.
- **Laura Gallagher** (Outgang, ex Lead Character Artist at Eidos Montreal): ZBrush has only units
  [00:04:27]; keep XYZ Size near 2 [00:28:23]; Export Scale converts to real units and an OBJ import
  sets it [00:24:03]; offsets are in internal units [00:33:40]; Unify is unsafe on characters with
  layers and morph targets [00:27:16].

## 9. Dialog budget for batches

| Step                                              | Modal risk                          | Plan                                                                       |
| ------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Import, Export, Save As, Texture and Alpha export | file dialog without a preset        | `set_next_filename`, then `has_next_filename()` false and the file on disk |
| DynaMesh or ZRemesher on a SubTool with levels    | note [verify]                       | zb_ops refuses; ZRemesher a duplicate                                      |
| UV Master, Decimation Master, MME                 | control handover, save dialog (MME) | own call, timeout, fallback, last in the recipe                            |
| FBX ExportImport, USD Format                      | options or file dialog              | not in unattended recipes                                                  |
| SubTool Rename, New Folder                        | text prompt                         | name at creation, top-SubTool trick                                        |
| Del All, Delete, Merge Down                       | confirmation note                   | avoid; key-held macro with consent                                         |
| GoZ first press, GoZ return with new topology     | app chooser, reprojection prompt    | `.GoZ` by path; import as a new SubTool and Project All                    |
| Quit with unsaved work                            | save prompt                         | `zb_launch.stop` answers No when unlocked, else SIGTERM                    |

## 10. ZScript to Python (for reading macros and forum answers)

| ZScript                                                       | Python (`zbrush.commands`)                              | Trap                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `[IPress,p]` `[IUnPress,p]` `[IToggle,p]`                     | `press`, `un_press`, `toggle`                           | `un_press` cannot release radio groups                                                                                      |
| `[ISet,p,v]` `[IGet,p]` `[IModSet,p,bits]`                    | `set`, `get`, `set_mod`                                 | `set` on a missing path is silent (v03)                                                                                     |
| `[IExists,p]` `[IsEnabled,p]` `[IGetTitle,p]` `[IGetInfo,p]`  | `exists`, `is_enabled`, `get_title`, `get_info`         | `get_status` is enabled or grayed, not on or off                                                                            |
| `[FileNameSetNext,f]` `[FileNameHasNext]`                     | `set_next_filename`, `has_next_filename`                | plugins may ignore it                                                                                                       |
| `[Mesh3DGet,0,,,var]`                                         | `query_mesh3d(0)[0]`                                    | returns a list; ZScript returned a status                                                                                   |
| `[SubToolSelect,i]` `[SubToolGetStatus,i]` `[ToolSetPath,,n]` | `select_subtool`, `get_subtool_status`, `set_tool_path` | -1 on error; top SubTool only for the rename                                                                                |
| `[IFreeze,...]` `[IShowActions,0]`                            | `freeze(fn)`, `show_actions(0)`                         | progress bars still update; toolkit: `zb_ops.frozen`, `quiet`, `sequence` (no plugin press or canvas export inside [added]) |
| `[IKeyPress,k,...]` `[MergeUndo]`                             | `press_key`, `merge_undo`                               | broken and not implemented: use a macro                                                                                     |
| `[VarSave]` `[MVarDef]` `[Loop]` `[If]` `[Sleep]`             | files, globals, `for`, `if`; no `Sleep`                 | memory blocks are case-sensitive, strings capped at 255, math left to right                                                 |

## 11. Where the sources disagree, and the deciding condition

| Choice            | Option A                                              | Option B                                                                     | Decide by                                                                                            |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Batch loop        | one script inside ZBrush (Maxon example, cgside)      | agent-side loop, one call per step [added]                                   | any plugin press, any file count above a handful, any unattended run: B                              |
| Launch            | bridge (README)                                       | `-script` per file (SDK quickstart)                                          | need return values and screenshots: bridge; need isolation after live_a05 proves the exit: `-script` |
| Rename            | top-SubTool trick (MadPony)                           | rename files before import (wtz2025, Maxon forum)                            | names known before import: rename files; inside an existing tool: the trick                          |
| UVs               | UV Master (seams in cavities, polygroups, AO attract) | native Create (Unwrap) (2023+, in the SDK docs)                              | organic, readable islands: UV Master; hard surface with creased seams, or UV Master hangs: native    |
| Decimated preview | Decimation Master (quality at 2 %)                    | ZRemesher low as preview, or decimate the OBJ outside ZBrush [added]         | DM returns control: DM; it hangs: B                                                                  |
| Exchange          | GoZ buttons (one click, GoZ docs)                     | `.GoZ` or OBJ by path (usd-portal)                                           | human at the desk: buttons; agent: files                                                             |
| Known UI state    | `zbc.config(2026)` (SDK quickstart)                   | explicit sets and read-backs (Maxon config doc warns it overwrites settings) | a dedicated agent profile: config; the user's ZBrush: explicit sets                                  |

## 12. Projection safety and the shared interpreter (added 2026-09-24 from the Z7 grade)

- **FlippedNormals** (Henning Sanden, Morten Jaeger, ex-MPC and ex-Framestore, Zp07GW3rND0, 2018):
  at the highest level, Store Morph Target, then a New Layer, then Project All; "It's important that
  you do all of this on the highest level" [00:02:13]. Repair busted areas with the Morph brush, not
  smoothing: "you're never gonna be able to smooth these kind of things out properly" [00:06:36].
  Local fix: mask, invert, project again [00:09:27].
- **Joseph Drust** (Pixologic, #AskZBrush nxMYYsyJt3o): Dist 0.1; the small default causes "90
  percent" of Project All artifacts [00:02:19]. Set explicitly by `zb_ops.project_all`.
- **Maxon SDK Style Guide and examples**: one persistent interpreter; the script folder is not on
  `sys.path`; insert a folder only for the import, then remove it and pop the modules
  (ex_mod_curve_lightning); `random.seed = 42` breaks `random.seed` until restart. `freeze(fn)` for
  heavy sequences ("Frozen will be most of the UI, but things like progress bars will still work"),
  `show_actions(0)` before scripted presses (not needed for `set`).
- **Maxon SDK modeling reference**: `get_polymesh3d_volume()` and `is_polymesh3d_solid()` are one
  call each; the toolkit gates every destructive op on them (python_sdk digest delta 22: catch a
  collapsed or exploded remesh). Bands are [added].
