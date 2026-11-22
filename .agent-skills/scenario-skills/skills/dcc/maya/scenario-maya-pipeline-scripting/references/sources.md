# Sources behind scenario-maya-pipeline-scripting

Per-source notes are in the project's `notes/scripting/` and `notes/pipeline/` (never edited to fit
this skill), with cross-batch material from `notes/modeling/_digest_modeling_tools_scene_hygiene.md`
(the H01 to H34 table) and `notes/rigging/_digest_rigging_systems_performance.md` (game export,
parallel evaluation). Saved documentation pages are in `sources/docs/`; the version map is
`sources/maya-version-deltas.md` (sections 2.10, 2.11, 3, 4). Credentials as stated in the notes;
"unverified" is kept where a note says so.

## Talks and videos

| Source                                                                                                                                                                                                                                                                             | Who                                                                                                         | Best for                                                                                                                                                 | Best timestamps                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New Tales from the Borderlands: Maximizing Time with an Automated Cinematic Pipeline, GDC 2023, https://www.youtube.com/watch?v=lfWkJrkhd2U                                                                                                                                        | Marion Guignolle, Senior Technical Animator, Gearbox Studio Québec, 12+ years (motion capture, outsourcing) | what to automate, generated names, origin at the action, one camera rig, per-cut FBX, publish diff, gates at the point of action, environment analyzer   | [00:03:18] automation rule; [00:04:58] naming; [00:16:30] origin volume; [00:19:23] camera rig; [00:22:11] approved-shot warning; [00:23:16] breakdown; [00:24:23] diff; [00:27:11] results |
| How RISE VFX Reached New Creative Heights with USD in Maya, FMX 2023, https://www.youtube.com/watch?v=8UIW-g1_heg                                                                                                                                                                  | Oliver Markowski, Head of 3D, and Kolja Hübschmann, pipeline developer, RISE Visual Effects Studios         | layer stacks, pinning and assetInfo, muting own and stronger layers, value clips, instanceable trap, LOD variants, camera bridge, Alembic vs USD cameras | [00:22:27] pinning; [00:26:19] muting; [00:34:50] session-layer bake; [00:37:03] value clips; [00:42:15] LODs; [00:44:30] cameras; [00:51:46] Alembic camera; [00:56:12] summary            |
| Maya Performance Webinar Part 2: Animation and Playback (2019), https://www.youtube.com/watch?v=rhtERzmAoUM                                                                                                                                                                        | Steven Roselle, Autodesk Maya product manager                                                               | profile before optimizing, evaluation vs drawing, evaluators, cache modes by memory                                                                      | [00:04:14] Profiler; [00:04:46] UV transfer; [00:05:17] thread view; [00:19:07] cache modes                                                                                                 |
| Accelerating Creative Workflows with Epic Games, GDC 2022, https://www.youtube.com/watch?v=Kw3PzotnLrE                                                                                                                                                                             | Steven Roselle (Autodesk), Daryl Obert (Epic Games), Warren Trezevant (ShotGrid)                            | what Live Link streams and does not, publish source with FBX, naming for engine tools                                                                    | [00:03:43] Live Link; [00:12:17] one-way push; [00:17:12] publish; [00:26:04] naming                                                                                                        |
| Intro to USD Workflow Ep.1 to Ep.5 (2024 to 2025): https://www.youtube.com/watch?v=PzfgbzrX8bs, https://www.youtube.com/watch?v=kq8O68q10nM, https://www.youtube.com/watch?v=OWLlAdQ3Uyc, https://www.youtube.com/watch?v=myl54b4HaNs, https://www.youtube.com/watch?v=oZ4VjueynTY | Yingying, Autodesk (Maya Learning Channel)                                                                  | asset structure, assembly with payloads and instancing, department layers and locks, Maya reference then Cache to USD, light linking, shot over sequence | Ep.2 [00:10:36] locks; Ep.3 [00:04:19] cache variant, [00:05:26] system lock; Ep.4 [00:06:58] expressions; Ep.5 [00:00:55] shot over sequence, [00:08:07] overs                             |
| Cult of Rig, Intro to OpenMaya2, designing a callback (2017), https://www.youtube.com/watch?v=Dt5ODNLUuSM                                                                                                                                                                          | Raffaele Fragapane, former supervisor at Animal Logic                                                       | cmds vs OM2, OM2 undo trap, numerical verification                                                                                                       | [00:30:41]; [01:16:03]; [01:17:49]; [01:20:37]                                                                                                                                              |
| Cult of Rig, Maya Parallel Evaluation (2018), https://www.youtube.com/watch?v=_0mb4wIZi80 (rigging batch)                                                                                                                                                                          | Raffaele Fragapane                                                                                          | Python nodes serialize, pure vs impure expressions, frozen switches, curves for parallelism                                                              | [00:55:10]; [01:07:55]; [01:16:10]; [01:18:26]                                                                                                                                              |
| Data Centric Rigging 025, Notes on Parallel Evaluation (2018), https://www.youtube.com/watch?v=NfYAaK3wtQs (rigging batch)                                                                                                                                                         | Miquel Campos, mGear author                                                                                 | dated profiles, UI hosts out of limbs, when single-rig optimization pays                                                                                 | [00:05:26]; [00:12:51]; [00:18:22]                                                                                                                                                          |
| Tools-Based Rigging in Bungie's Destiny, GDC 2015, https://www.youtube.com/watch?v=U_4u0kbf-JE (rigging batch)                                                                                                                                                                     | David Hunt and Forrest Soderlind, Bungie                                                                    | Problem Spotter batch scanning with overnight fixes, metadata nodes, explant, Python for building                                                        | [00:45:21] Problem Spotter; [00:23:10] metadata; [00:43:40] explant                                                                                                                         |
| Ultimate Guide to Clean Scenes (2018), https://www.youtube.com/watch?v=ToWRH4IXF7A (modeling batch)                                                                                                                                                                                | Henning Sanden and Morten Jaeger (FlippedNormals), former senior film character artists                     | the handoff contract behind validation and safe fixes                                                                                                    | [00:02:35] render stats; [00:11:50] n-gons by hand; [00:18:16] unique names; [00:24:00] smooth preview off                                                                                  |
| Introduction to Maya Python Plug-ins 1 to 3 (2012 to 2013): https://www.youtube.com/watch?v=Wf03mSCdh-Q, https://www.youtube.com/watch?v=BZyXe3MhEyI, https://www.youtube.com/watch?v=v1d8fCtIROI                                                                                  | Autodesk (presenter not named)                                                                              | plug-in skeleton, undo model, flags, flushUndo before unload                                                                                             | BZyXe3MhEyI [00:01:56], [00:11:47]; v1d8fCtIROI [00:06:49]                                                                                                                                  |
| Introduction to Python Scripting in Maya parts 1, 3, 5 (2013): https://www.youtube.com/watch?v=eXFGeZZbMzQ, https://www.youtube.com/watch?v=ijMyo-6T8Ow, https://www.youtube.com/watch?v=ZmCYXzsCMO0                                                                               | Autodesk (presenter not named)                                                                              | cmds foundations (held by the lead skill)                                                                                                                | eXFGeZZbMzQ [00:02:49]                                                                                                                                                                      |

## Official documentation (retrieved 2026-09-24)

- Maya 2027 Help, Managing Scenes and Interoperability: projects, file referencing and reference
  edits, namespaces, Alembic and GPU caches, Game Exporter, FBX Export, Import and General MEL
  commands, FBX Limitations and Troubleshooting, Send to Unity and Unreal, working in different
  scales: `sources/docs/scripting-pipeline__pipeline-refs-caches-fbx-game-export.md`,
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-ManagingScenes/files/GUID-9CE78B5A-7E9F-45E6-AB6D-66795E5656F4.htm.
  The authority for every FBX command in the presets.
- Epic Games, FBX Static Mesh Pipeline, plus Maya 2027 Game Exporter and FBX Export options:
  `sources/docs/modeling__game-asset-fbx-export-unreal-maya.md`,
  https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine
- Epic FBX Skeletal Mesh and Animation Pipelines, Unity 6.6 manual (Creating models for animation,
  Rig tab), Maya 2027 Game Exporter clips: `sources/docs/rigging__game-engine-export.md`. Epic, Root
  Motion (UE 5.8): `sources/docs/animation__unreal-root-motion.md`.
- maya-usd command readme (GitHub dev branch; flags may be newer than the 0.35 to 0.37 build):
  `sources/docs/scripting-pipeline__maya-usd-commands.md`,
  https://raw.githubusercontent.com/Autodesk/maya-usd/dev/lib/mayaUsd/commands/Readme.md
- USD for Maya 2027 (0.37): stages, Edit as Maya Data and Merge, saving, relative paths, edit
  routing, materials, Component Creator, Asset Resolver:
  `sources/docs/scripting-pipeline__usd-for-maya-2027.md`,
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-USD/files/USD-for-Maya/GUID-36CFE2C3-766F-4B00-8464-E94F95E7AF4B.html
- Using Parallel Maya 2027 (Autodesk white paper):
  `sources/docs/rigging__using-parallel-maya-2027.md` (2026 edition:
  `sources/docs/scripting-pipeline__using-parallel-maya-2026.md`).
- Maya 2027 Developer Help: Qt6/PySide6 migration, Working with PySide, workspace controls, loadUI,
  modules: `sources/docs/scripting-pipeline__pyside6-workspace-controls-modules.md`,
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-DEVHELP/files/Whats-New-Whats-Changed/2025-Whats-New-in-API/Qt6Migration.html
- Maya Python API 2.0 (MPxNode, MFnNumericAttribute, MTypeId ranges, MDGModifier, threading):
  `sources/docs/scripting-pipeline__openmaya-python-api-2.md`,
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-DEVHELP/files/Maya_DEVHELP_Maya_Python_API_html.html
- Python in Maya 2027 (mayapy, pip, threading, scriptJob, commandPort, command-line rendering):
  `sources/docs/scripting-pipeline__python-in-maya-2027.md`
- Devkit What's New 2022 to 2027 (removed flags, API behavior changes, Ogawa only):
  `sources/docs/scripting-pipeline__devkit-whats-new-2022-2027.md`
- What's New in Maya 2025, 2026, 2027 (FBX log variables, USD for Maya versions, MaterialX default,
  PySide2 fallback crash, 2027.2 Alembic UV set fix, known issues):
  `sources/docs/scripting-pipeline__whats-new-maya-202{5,6,7}.md`

## Community references

- Polycount wiki (vertex vs triangle count, triangulate before baking, hard edges on UV seams):
  `sources/docs/modeling__polycount-wiki-topology-polycount-normals-uvs.md`
- MCP bridge designs: GG_MayaMCP (Gimbal Goats, unverified credential)
  https://github.com/GimbalGoats/GG_MayaMCP; chadrik/maya-mcp-server (Chad Dombrova, Scanline VFX,
  PyMEL maintainer); PatrickPalmer/MayaMCP (unverified); dcc-mcp-maya; Steve Theodore,
  theodox.github.io (2014, unverified credential):
  `sources/docs/scripting-pipeline__maya-mcp-commandport-bridges.md`

## Decisions of this skill not taken from a source ([added])

One mayapy per file by default and session chunks only with automatic process fallback; source sha1
before and after every job; per-child `MAYA_FBX_LOG_FILENAME`; refusing a clashing namespace instead
of accepting Maya's digit suffix; the 0.1 maximum weight change for automatic influence capping; the
world-matrix orthogonality test (tolerance 1e-4) as the FBX non-orthogonal check; the 1e-3
bounding-box tolerance relative to the diagonal in round-trip comparisons; vertex-count differences
after FBX re-import treated as notes until verified; Alembic exports to a temp path without spaces,
then moved; the order-independent normal signature (8 bins per axis) and its 2% round-trip
tolerance; the FBX log parse rules (lines naming error or warning, header sections) and X05 errors
as warnings unless strict; E11 as a warning on skeletal and anim exports and info on static ones;
E27 as an error for animation and a warning otherwise; the 2 GB free-disk preflight minimum. Each is
documented where it is used and can be overridden.

## Revision history

- 2026-09-24, refactor pass 1 (from blind grade M8, "missing from both"): stance "never run blind"
  (chadrik; FBX log doc; devkit 2022 batch variables); preflight (localhost and host name
  resolution, Python in Maya 2027 Troubleshoot hangs); FBX log lookup and parsing (X05); round trip
  with normal directions, per-mesh bounds, units and up axis (Maya 2027 Help, how an FBX is judged);
  E11 on every mesh of skeletal and anim exports; E24 through `mx_audit.mfn_mesh`; E27 time unit
  (Live Link note, pre-stream checks); reference health R01 to R05 before fixes; P16, new mistake
  rows and critique rows; the export job's namespace and bind-pose workarounds removed after the
  toolkit fixes. v1 kept in `skills/_versions/maya-pipeline-scripting v1 2026-09-24/`. Offline tests
  only, not verified in Maya.
