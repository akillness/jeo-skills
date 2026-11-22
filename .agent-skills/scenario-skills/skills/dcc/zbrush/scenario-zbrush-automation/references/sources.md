# Sources of scenario-zbrush-automation

Each line: source, who, credential, where, what it is best for, best timestamps. Notes live in
`notes/scripting/` (digests `_digest_zscript_goz_automation.md`, `_digest_python_sdk.md`),
`notes/versions/`, and for the plugins `notes/maps-export/`, `notes/retopology-uv/`,
`notes/pipeline/`. Version facts: `sources/zbrush-version-deltas.md`.

## Revisions

- 2026-09-24 v1: initial build (snapshot `skills/_versions/zbrush-automation v1 2026-09-24/`).
- 2026-09-24 v2, refactor from the blind grade Z7 ("missing from both" and the gaps of both
  answers): cgside's Auto Groups then ZRemesher Keep Groups recipe (MyhwQvkcnwI 00:01:43 to
  00:02:51, 00:08:38 to 00:09:42) as `make_low(auto_groups=True)` and on in `DEFAULT_PARAMS`; the
  save before ProjectAll (00:02:19) enforced by the lead's safe `zb_ops.project_all` and passed by
  the recipe (`{stem}_preproject.ztl`); morph target, layer and Dist 0.1 per pass (FlippedNormals
  Zp07GW3rND0, Drust nxMYYsyJt3o); zb_ops gates (volume, watertightness, spikes) read by
  `check_step`; interpreter hygiene through `zb_launch.build_code` (SDK Style Guide) and P19;
  `freeze` and `show_actions(0)` guidance, `for_each_subtool(freeze=True)`, SubTool loops under
  `quiet()` (SDK GUI reference). Offline tests only (56 pass); not yet run in ZBrush (live_a02
  updated).

## Evidence produced on this Mac (highest weight)

- `/Applications/Maxon ZBrush 2026/ZResources/DXFStar.GoZ`, a GoZ file written by ZBrush 2026.2.1:
  parsed and rewritten byte for byte by `zb_goz` (`tests/code/zbrush-automation/test_zb_goz.py`).
  Best for: the GoZ binary layout.
- `/Users/Shared/Pixologic/` (GoZ 1.01 folder, 2026-09-24 listing): `GoZApps/Maya/GoZ_Info.txt` (Y
  and Z flips, normal map V flip), `GoZ_Config.txt` (stale Maya 2017 path), `GoZScript.mel` (command
  port 5555, `gozMaya` plug-in), `GoZBrush/GoZ_Config.txt`, `GoZ_ProjectPath.txt`. Best for:
  round-trip conventions and what the protocol files look like.
- `/Applications/Maxon ZBrush 2026/ZData/ExportTemplates/GoZ Complete Binary.GoZ`: the block order
  ZBrush writes (header, mesh, flags, subdiv, points, faces, UVs, MRGB, mask, groups, creases, map
  paths, end).
- ZBrush Activity logs,
  `~/Library/Preferences/Maxon/ZBrush_03C27D49/Logs/Activity/Activity 2026-09-24-05-20-14.txt` and
  later. Best for: canonical item paths (the path oracle) and the startup stall.
- Project README, "Agent bridge into ZBrush" and the open startup stall (2026-09-24). Best for: what
  is proven, the kill -9 and relaunch history.
- scenario-zbrush-expert tests `tests/code/zbrush-expert/v01..v03_*` and the offline OBJ analysis.
  Best for: dialog-free exports, OBJ axes (Y up, +Z toward the front camera).
- This skill's offline tests (`tests/code/zbrush-automation/offline_results.json`). Best for: what
  the runner, recipe, reports and GoZ helpers do, against fakes.

## Maxon official

- ZBrush Python SDK 2026.1 manuals (Maxon SDK team): quickstart, environment, libraries,
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/manuals/index.html; local
  `/Applications/Maxon ZBrush 2026/Documentation/python-api`. Best for: `-script` (scene last),
  startup plugins, macro recording, shared interpreter.
- SDK API references (GUI, modeling, system) and the stub `api/zbrush/commands.py` (dated
  2025-10-28): https://developers.maxon.net/docs/zbrush/py/2026_1_0/api/zbr_cmds_gui.html,
  .../zbr_cmds_modeling.html, .../zbr_cmds_system.html. Best for: `set_next_filename`,
  `has_next_filename`, `create_normal_map(local_coordinates)`, blocking calls, `press_key` and
  `merge_undo` status.
- SDK examples (Ferdinand Hoppe, Javier Edo, Jan Wesbuer):
  `examples/modeling/ex_mod_subtool_export.py` (command-line batch export),
  `ex_sys_timeline_camera.py`, `ZData/Python/init.py`,
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/examples/index.html. Best for: the `-script`
  job template.
- Migrating ZScript and `ZData/Python/zscript_command_mapping.json`,
  https://developers.maxon.net/docs/zbrush/py/2026_1_0/manuals/migrating_zscript.html. Best for:
  reading any macro as Python.
- Maxon developer forum, ZBrush SDK category (ferdinand, m_adam, i_mazlov, davide; users pablo31,
  pocacola, wtz2025), https://developers.maxon.net/forum/category/55/zbrush-sdk. Best for: FBX
  dialog (2025-03-11), background export (2025-02-25), `press_key` failures and the macro workaround
  (2026-04-21), startup `init.py` in the Asset Directory (2026-04-15), no rename API (2026-09-10).
- ZScript command reference,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/customizing-zbrush/zscripting/command-reference/command-reference.html.
  Best for: FileNameSetNext, IKeyPress, SubTool status bits, Mesh3DGet.
- ZScript interfaces, plugins, macros, user content,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/customizing-zbrush/zscripting/interfaces/zplugin-interface/zplugin-interface.html.
  Best for: one active ZScript, macro folder and 8-character rule, read-only install since 2026.1.
- ZScripting manual,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/customizing-zbrush/zscripting/technical/technical.html.
  Best for: learning paths from recordings, Ctrl+hover, memory blocks.
- Shipped 2026.2.1 macros, `/Applications/Maxon ZBrush 2026/ZData/Macros/` (authors not named). Best
  for: `[IKeyPress,'2',...]` answers, `PopUp:` items, save and restore of user state.
- GoZ documentation,
  https://help.maxon.net/zbr/en-us/Content/html/user-guide/zbrush-other-programs/goz/goz.html; GoZ
  SDK PDF, https://developers.maxon.net/docs/zbrush/goz_sdk.pdf. Best for: lowest level, unique
  names, folder protocol, `GoZBrushFromApp`.
- Plugin documentation (local copies): `sources/docs/topology-export__decimation-master.md`,
  `topology-export__uv-master-uv-map.md`, `topology-export__multi-map-exporter-maps.md`,
  `topology-export__export-goz-fbx-scale.md`. Best for: plugin options, limits (UV Master 150k),
  cache and naming pitfalls, MME save dialog and bit depths, FBX presets.
- Release notes and What's New
  (`sources/docs/automation__zbrush-release-notes-2022-2026-maxon-kb.md`,
  `automation__zbrush-whats-new-2021-2026-help.md`). Best for: 2026.0 Python, 2026.1 Asset
  Directory, 2026.2.0 UV Master polygroups fix and Substance Bridge.

## Experts and practitioners

- marcus_civis (ZBrushCentral, long-time ZScript and plugin author, credential unverified), threads
  2009 to 2019, https://www.zbrushcentral.com/c/zscripting-help/14. Best for: one active script,
  `[If,1,...]` launch scripts, startup macros. Posts 2013-06-20, 2014-02-17, 2019-04-22.
- ijacobs, TVeyes, dargelos, danvas, BigRoyNL (ZBrushCentral users, 2013 to 2024). Best for: the
  plugin handover (ijacobs 2013-02-21), Note dialogs (TVeyes 2015-04-11, danvas 2017-03-10), no
  success signal (BigRoyNL 2024-03-07).
- cgside (3D environment artist), "ZSCRIPT in Zbrush | Automate tasks" (2022),
  https://www.youtube.com/watch?v=MyhwQvkcnwI. Best for: a production remesh-and-project batch, save
  before ProjectAll [00:02:19], the Decimation Master limit [00:06:56], target math [00:08:04].
- Michael Pavlovich (Director of Character, Weapon and Vehicle Art at Certain Affinity; Maxon
  ZBrushLIVE host), Workshop 45 (2018), https://www.youtube.com/watch?v=9Acq70iPaVI. Best for:
  ZRepeat It [00:37:30], DynaMesh 64 demo [00:42:53], editing recordings [01:02:07], Ctrl+Alt+click
  hotkeys [01:04:24].
- MadPonyInteractive (ZBrush plugin author, credential unverified), ZScript Fundamentals (2019):
  What is ZScript https://www.youtube.com/watch?v=DnLlDJxfxHs [00:00:35], [00:02:16]; IGet/ISet
  https://www.youtube.com/watch?v=vnaNrBzT1UQ; Memory Variables
  https://www.youtube.com/watch?v=_YuSnHxJtsI; VarSave https://www.youtube.com/watch?v=_I5i60PNvj4;
  NoteBar https://www.youtube.com/watch?v=1L77Sssism0; Note Interface
  https://www.youtube.com/watch?v=EEEyBHE5UrE; Selecting SubTools
  https://www.youtube.com/watch?v=DNCJ_2vH9iU [00:01:35]; Moving SubTools
  https://www.youtube.com/watch?v=9-5AkwkZqAo; Renaming SubTools
  https://www.youtube.com/watch?v=w7RxSx1G1hQ [00:00:34]; Tools and Folders
  https://www.youtube.com/watch?v=Fns6YoDE1j4 [00:02:51]; Loop
  https://www.youtube.com/watch?v=Iwg5i4pWAdE; Routines https://www.youtube.com/watch?v=bBNrtIsHfiE;
  IButton https://www.youtube.com/watch?v=cfWdG_UPx90; Macros and Plugins
  https://www.youtube.com/watch?v=_1wAuQ3IUf4; Nudge Axis
  https://www.youtube.com/watch?v=a9YEqjF0bkU and https://www.youtube.com/watch?v=xv-DDf4EckE
  [00:03:27]. Best for: ZScript semantics, names and IDs, dialog-free saves.
- Paul Gaboury (Pixologic and Maxon ZBrush staff), #AskZBrush export all SubTools (2022),
  https://www.youtube.com/watch?v=echGh0tZEts [00:00:34], [00:01:06]. Best for: why FBX needs a
  dialog and OBJ loses names.
- Joseph Drust (Pixologic), #AskZBrush: decimation keeping polygroups
  https://www.youtube.com/watch?v=mRfA_WDvvrg [00:02:35]-[00:05:04]; normal maps
  https://www.youtube.com/watch?v=n0qqpwvn-jA [00:01:14]; small-detail bakes
  https://www.youtube.com/watch?v=2zDAtaQqwh8 [00:02:53]. Best for: plugin recipes and map level
  rules.
- Ian Robinson (senior ZBrush instructor, Maxon): #AskZBrush Keep Polypaint
  https://www.youtube.com/watch?v=bVX9utHc_ZI [00:01:17]; Asset Directory
  https://www.youtube.com/watch?v=w7lI2RCK2aI [00:02:12]; What's New 2026.1 with Rodolfo Silva
  https://www.youtube.com/watch?v=rbikNPggIeo [00:12:41]. Best for: 2026 folders and plugin load
  order.
- Maxon, Fall Release 2025 (2026.0), https://www.youtube.com/watch?v=DdKubRp7C4A [00:01:08]. Best
  for: dating Python support.
- FlippedNormals (Morten Jaeger, Henning Sanden, character artists and educators), ZBrush to Blender
  with GoB (2020), https://www.youtube.com/watch?v=2-pFspCbykk [00:04:02], [00:06:01], [00:08:15],
  [00:11:21]. Best for: GoB round trips, lowest level, FBX scale 1000.
- Laura Gallagher (Outgang; former Lead Character Artist, Eidos Montreal and Guerrilla Games), units
  and scale (2021), https://www.youtube.com/watch?v=EXjfH_X2hkM [00:24:03], [00:27:16], [00:28:23],
  [00:33:40]. Best for: Export Scale and offsets in round trips.
- Community bridges on GitHub: baborub/usd-portal (tested on 2026.2), JoseConseco/GoB,
  LumaPictures/gozbruh, nlapinski/ZBrush-Command-Port, newsbubbles/zbrush-mcp (unverified),
  https://github.com/baborub/usd-portal and others (note
  `automation__community-bridges-remote-control`). Best for: file-drop control, `.GoZ` by path,
  folder-aware visibility, the GoZ block tags, VarSave sandbox.

## Sister skills used

- scenario-zbrush-expert (this project): zb_launch, zb_ops, zb_audit, zb_review, zb_stroke; the
  bridge protocol and 2026 traps.
- scenario-maya-pipeline-scripting (Maya Expert Skills project): the batch-runner shape (one bad
  file must not kill a batch) and the Maya side of round trips.
