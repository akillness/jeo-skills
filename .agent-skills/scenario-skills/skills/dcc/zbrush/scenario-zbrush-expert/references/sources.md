# Sources of scenario-zbrush-expert

Each line: source, who, credential, where, what it is best for. Notes live in `notes/scripting/` and
`notes/fundamentals/` of the project; the digests are `_digest_python_sdk.md`,
`_digest_zscript_goz_automation.md` and `_digest_fundamentals_logic_files.md`.

## Revisions

- 2026-09-24 v1: initial build (snapshot `skills/_versions/zbrush-expert v1 2026-09-24/`).
- 2026-09-24 v2, refactor from the blind grade Z7 (all of it), the "missing from both" lists of Z1,
  Z2 and Z6, and `tests/OPEN_ISSUES.md` (toolkit): `zb_ops.project_all` safe by default (versioned
  checkpoint first, cgside MyhwQvkcnwI 00:02:19; Store MT and a New Layer at the top level,
  FlippedNormals Zp07GW3rND0 00:02:13, 00:02:47; Dist set to 0.1, Drust nxMYYsyJt3o 00:02:19; spike,
  point and volume gate; `morph_repair` instead of smoothing, 00:04:27, 00:06:36) with `top_level`,
  `store_morph_target`, `new_layer`, `set_layer_intensity`; volume and watertightness gates
  (`get_polymesh3d_volume`, `is_polymesh3d_solid`, SDK modeling reference) on DynaMesh, ZRemesher,
  Divide, Del Levels, Decimate, Polish and Project All; `quiet`, `frozen`, `sequence` for
  `show_actions(0)` and `freeze` (SDK GUI reference); PolyFrame path `Transform:Pf` and perspective
  `Draw:Perspective` from the installed `commands.xml`; shared-interpreter hygiene in
  `zb_launch.run` (exact `sys.path` restore, toolkit modules popped also after an error through a
  server hook, stdout and working directory restored, stale modules set aside; `hygiene()`,
  `purge()`), after the SDK Style Guide and ex_mod_curve_lightning. Offline tests only (65 pass);
  nothing of it has run in ZBrush (live_03, live_06 updated).
- Installed `ZData/ZLang/zcommands/commands.xml` (ZBrush 2026.2.1, dated 2026-06-01, 2,357 ids).
  Best for: the real item ids (`Transform: Pf`, `Draw:Perspective`, `Tool:SubTool:Dist`,
  `Tool:Layers:New`, `Tool:Morph Target:DelMT`).

## Evidence produced by this project (highest weight: it ran on this install)

- Bridge tests `tests/code/zbrush-expert/v01_setup_and_stroke.py`, `v02_synth_stroke.py`,
  `v03_export_and_paths.py` with `v0N_result.json` and `v03_canvas.png` (2026-09-24 05:20 to 05:21,
  ZBrush 2026.2.1 build 53205). Best for: what is proven (strokes, exports, paths).
- Project README, section "Agent bridge into ZBrush" (2026-09-24). Best for: the launch line, the
  main-thread design, side channels.
- ZBrush Activity logs
  `~/Library/Preferences/Maxon/ZBrush_03C27D49/Logs/Activity/Activity 2026-09-24-05-20-14.txt` and
  `-05-30-32.txt`. Best for: canonical item paths; the 05:30 startup stall.
- `tests/code/zbrush-expert/fixtures/v03_sphere.obj` (the v03 export) analyzed offline. Best for:
  OBJ axes against canvas pixels, counts and volume against the bridge.
- `sources/zbrush-version-deltas.md` (project, 2026-09-24). Best for: every 2026 version fact and
  the verify list.

## Maxon official (SDK and docs)

- ZBrush Python SDK 2026.1 manuals: quickstart, environment, libraries (Maxon SDK team),
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/manuals/index.html, local copy
  `/Applications/Maxon ZBrush 2026/Documentation/python-api`. Best for: entry points (`-script`,
  startup plugins), interpreter limits.
- API overview, item paths, modifiers, camera transform (Maxon SDK team),
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/manuals/api_overview.html. Best for: path
  rules (case and spaces ignored, picker items by name), what the API cannot see.
- GUI API reference (Maxon SDK team),
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/api/zbr_cmds_gui.html. Best for:
  `set`/`press`/`get`, blocking calls, `canvas_click`, `update`, `freeze`.
- Modeling API reference (Maxon SDK team),
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/api/zbr_cmds_modeling.html. Best for:
  `query_mesh3d`, strokes, `get_transform`, `pixol_pick`, SubTool status bits, ZSpheres, curves,
  maps.
- System API reference plus the stub (Maxon SDK team),
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/api/zbr_cmds_system.html and
  `Documentation/python-api/api/zbrush/commands.py` (145 functions, dated 2025-10-28). Best for:
  `set_next_filename`, `zbrush_info`, the not-implemented `merge_undo` and broken `press_key`.
- Official examples (Ferdinand Hoppe, Javier Edo, Jan Wesbuer),
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/examples/index.html and
  `examples/fragments/*.py`. Best for: hello world, SubTool array, batch export, turntable framing
  rule, the V03 stroke string, `pixol_pick` background 0x303030.
- Migrating ZScript and the command map (Maxon SDK team),
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/manuals/migrating_zscript.html and
  `ZData/Python/zscript_command_mapping.json`. Best for: reading any ZScript macro as Python.
- Maxon developer forum, ZBrush SDK category (ferdinand, m_adam, i_mazlov, davide of the Maxon SDK
  team, and users), https://developers.maxon.net/forum/category/55/zbrush-sdk. Best for: current
  gaps (no SubTool rename, no mask data, FBX dialog, `press_key` failures, asset-directory
  `init.py`).
- ZScript command reference (Maxon help, originally Pixologic),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/customizing-zbrush/zscripting/command-reference/command-reference.html.
  Best for: argument orders, status bits, `FileNameSetNext`.
- ZScript interfaces, plugins, ZFileUtils, macros, user content (Maxon help),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/customizing-zbrush/zscripting/interfaces/zplugin-interface/zplugin-interface.html.
  Best for: one active ZScript at a time, macro folder rules, 2026.1 read-only install.
- ZScripting manual (Maxon help),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/customizing-zbrush/zscripting/technical/technical.html.
  Best for: learning paths from recordings, Ctrl+hover path display.
- Shipped 2026.2.1 macros, `/Applications/Maxon ZBrush 2026/ZData/Macros/` (Maxon, authors not
  named). Best for: known-good 2026 paths, `PopUp:<item>`, `IKeyPress` dialog answers, a recorded
  V02 stroke string.
- GoZ documentation (Maxon help),
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/zbrush-other-programs/goz/goz.html, and
  GoZ SDK PDF, https://developers.maxon.net/docs/zbrush/goz_sdk.pdf. Best for: round-trip rules
  (lowest level, unique names), the `/Users/Shared/Pixologic` folder protocol.
- Maxon docs on canvas, ZTools, saving, SubTools, folders, LightBox, hotkeys and user content
  (`sources/docs/fundamentals-sculpting__basic-concepts-files-subtools.md`,
  `...__custom-ui-hotkeys-preferences.md`). Best for: file safety (.ZTL vs .ZPR vs .ZBR, QuickSave,
  versioning advice).

## Experts and community

- Pablo Munoz Gomez, 3D concept artist and educator, ZBrushGuides founder, Maxon ZBrushLIVE host,
  "Understanding ZBrush's Logic" Parts 1 to 8 (2025-11 to 2025-12):
  https://www.youtube.com/watch?v=NckHjyO6GNk (Part 1, canvas and Edit mode [00:12:20]),
  https://www.youtube.com/watch?v=RABWfzWNw0c (Part 2), https://www.youtube.com/watch?v=gitoJ7B8FmY
  (Part 3, parts and Booleans), https://www.youtube.com/watch?v=mVp_jNfEI3I (Part 4),
  https://www.youtube.com/watch?v=FrqUnna1jns (Part 5, DynaMesh resolution relative to size
  [00:13:40]), https://www.youtube.com/watch?v=9a9S1OcYHx4 (Part 6, brushes),
  https://www.youtube.com/watch?v=rArw79xEpvE (Part 7, never Divide a DynaMesh [00:09:44], ZRemesher
  5 gave 4,963 [00:03:16]), https://www.youtube.com/watch?v=VRisbJQAaZw (Part 8, reprojection
  density [00:17:24]). Best for: the production order and the fundamentals of the expert loop.
- Michael Pavlovich, Director of Character, Weapon and Vehicle Art at Certain Affinity, Maxon
  ZBrushLIVE host: Intro 005 ZTool, ZProject, QuickSave https://www.youtube.com/watch?v=rEIoFEEgS80
  (opening a ZPR deletes tools [00:09:55]); 026 Splitting
  https://www.youtube.com/watch?v=TjGlVX4w1nM; 030 SubTool options and folders
  https://www.youtube.com/watch?v=bBHqeaKNOzg (top SubTool takes the file name [00:00:30]); Workshop
  45 macros and ZRepeat It https://www.youtube.com/watch?v=9Acq70iPaVI (record once, apply to every
  SubTool [00:37:30]). Best for: file safety and per-SubTool automation habits.
- Joseph Drust, Pixologic, #AskZBrush Morph Target https://www.youtube.com/watch?v=B_wKwXwjcZs. Best
  for: morph targets as checkpoints.
- Paul Gaboury, Maxon ZBrush staff, #AskZBrush export all SubTools as FBX
  https://www.youtube.com/watch?v=echGh0tZEts. Best for: why FBX needs a dialog and OBJ loses names.
- MadPonyInteractive, ZBrush plugin author, ZScript Fundamentals (2019): What is ZScript
  https://www.youtube.com/watch?v=DnLlDJxfxHs, IButton https://www.youtube.com/watch?v=cfWdG_UPx90,
  IGet/ISet https://www.youtube.com/watch?v=vnaNrBzT1UQ, Loop
  https://www.youtube.com/watch?v=Iwg5i4pWAdE, Memory Variables
  https://www.youtube.com/watch?v=_YuSnHxJtsI, Routines https://www.youtube.com/watch?v=bBNrtIsHfiE,
  VarSave https://www.youtube.com/watch?v=_I5i60PNvj4, NoteBar
  https://www.youtube.com/watch?v=1L77Sssism0, Note Interface
  https://www.youtube.com/watch?v=EEEyBHE5UrE, Selecting SubTools
  https://www.youtube.com/watch?v=DNCJ_2vH9iU, Moving SubTools
  https://www.youtube.com/watch?v=9-5AkwkZqAo, Renaming SubTools
  https://www.youtube.com/watch?v=w7RxSx1G1hQ, Tools and Folders
  https://www.youtube.com/watch?v=Fns6YoDE1j4, Macros and Plugins
  https://www.youtube.com/watch?v=_1wAuQ3IUf4, Nudge Axis plugin
  https://www.youtube.com/watch?v=a9YEqjF0bkU and https://www.youtube.com/watch?v=xv-DDf4EckE (Euler
  flips [00:15:26], uniform scale [00:47:40]). Best for: ZScript semantics and view-transform
  behavior.
- cgside, 3D environment artist, ZScript batch automation
  https://www.youtube.com/watch?v=MyhwQvkcnwI (2022). Best for: the remesh-and-project batch recipe
  and the Decimation Master hand-off limit.
- FlippedNormals (Morten Jaeger, Henning Sanden), ZBrush to Blender with GoB
  https://www.youtube.com/watch?v=2-pFspCbykk (2020). Best for: GoZ lowest-level rule, FBX scale
  1000 into Blender.
- ZBrushCentral scripting threads (marcus_civis and others, 2007 to 2026),
  https://www.zbrushcentral.com/c/zscripting-help/14. Best for: command-line ZScript,
  one-active-script rule, popups as the automation killer.
- Community bridges on GitHub: baborub/usd-portal (tested on 2026.2), JoseConseco/GoB,
  LumaPictures/gozbruh, nlapinski/ZBrush-Command-Port, newsbubbles/zbrush-mcp (unverified). Best
  for: file-drop control, GoZ by path, Duplicate-needs-Edit, why a thread-only server starves.

## Sister skills used for shape

- scenario-blender-expert (Blender Expert Skills project): the router-and-protocol shape and the
  review-sheet loop.
