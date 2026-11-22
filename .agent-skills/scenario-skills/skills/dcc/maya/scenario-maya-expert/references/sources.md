# Sources behind scenario-maya-expert

Per-source expert notes are in the project's `notes/` (never edited to fit this skill); saved
documentation pages in `sources/docs/`; the version map in `sources/maya-version-deltas.md`.
Credentials are as stated in the notes (the manifest verified some; "unverified" is kept where the
note says so).

## Experts and talks

| Source                                                                                                      | Who                                                                                                 | Best for                                                                                                                                                                                                             | Best timestamps                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cult of Rig, "Intro to OpenMaya2, designing a callback", https://www.youtube.com/watch?v=Dt5ODNLUuSM (2017) | Raffaele Fragapane, former supervisor at Animal Logic (animation pipeline, LEGO Movie rigging tech) | cmds vs OM2 judgment, the OM2 undo trap, world matrix extraction, type checks without exceptions, callback design, matrix identity check                                                                             | [00:08:18] callback as a graph; [00:27:21] to [00:42:21] world matrix route; [00:44:06] hasFn/hasAttribute; [00:59:59] rotation-order constants; [01:16:03] identity check; [01:17:49] undo trap; [01:20:37] cmds only for queries |
| FlippedNormals, "Ultimate Guide to Clean Scenes", https://www.youtube.com/watch?v=ToWRH4IXF7A (2018)        | Henning Sanden and Morten Jaeger, former senior film character artists (London VFX)                 | the modeling handoff checklist behind `mx_validate` profile "model" and `mx_audit` rules: history, frozen transforms, n-gons by hand, lamina and non-manifold, UVs in 0-1, unique names, smoothing off, render stats | [00:08:31] rebuild via OBJ; [00:11:50] never Cleanup n-gons; [00:18:16] unique names; [00:20:47] two-sided lighting hides flips; description checklist                                                                             |
| RISE VFX USD pipeline, https://www.youtube.com/watch?v=8UIW-g1_heg (FMX 2023)                               | Oliver Markowski (Head of 3D), Kolja Hübschmann (pipeline)                                          | layer ownership, value clips, pinning, validation before publish                                                                                                                                                     | see `notes/pipeline/` digest                                                                                                                                                                                                       |
| New Tales from the Borderlands, https://www.youtube.com/watch?v=lfWkJrkhd2U (GDC 2023)                      | Marion Guignolle, Senior Technical Animator, Gearbox Québec                                         | generated names and paths, publish diffs, gates at the point of action                                                                                                                                               | [00:22:11] approved-shot warnings; [00:24:23] publish diff                                                                                                                                                                         |
| Maya Performance Webinar Part 2, https://www.youtube.com/watch?v=rhtERzmAoUM (2019)                         | Steven Roselle, Autodesk Maya product manager                                                       | profile before optimizing; evaluation-bound vs draw-bound                                                                                                                                                            | [00:04:14] Profiler ranking                                                                                                                                                                                                        |

## Autodesk training series (official, presenters not named)

- "Introduction to Python Scripting in Maya" parts 1, 3, 5:
  https://www.youtube.com/watch?v=eXFGeZZbMzQ, https://www.youtube.com/watch?v=ijMyo-6T8Ow,
  https://www.youtube.com/watch?v=ZmCYXzsCMO0 (2013). Return shapes, `#` names, re-runnable scripts,
  linear tangents for loops, `objExists` before `addAttr`. Python 2 on screen: translate.
- "Introduction to Maya Python Plug-ins" 1 to 3: https://www.youtube.com/watch?v=Wf03mSCdh-Q,
  https://www.youtube.com/watch?v=BZyXe3MhEyI, https://www.youtube.com/watch?v=v1d8fCtIROI (2012 to
  2013). Undoable commands (`isUndoable`, `doIt` once, `redoIt`, `undoIt`, modifier as a queue), the
  undo round-trip test [00:11:47], `flushUndo` before unloading [00:06:49]. API 1.0 on screen:
  translated to 2.0 in `cmds-reliability.md`.

## Official documentation (Maya 2027 Help and Developer Help, retrieved 2026-09-24)

- Python in Maya (mayapy, maya.standalone, pip, threading, scriptJob, MEL vs Python), commandPort,
  undoInfo, evalDeferred, command-line start and rendering:
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-Scripting/files/GUID-C0F27A50-3DD6-454C-A4D1-9E3C44B3C990.htm.
  Ground truth for the execution channels and the capability matrix.
- Maya Python API 2.0 (MObject and function sets, MDGModifier, plug-ins, undo, threading):
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-DEVHELP/files/Maya_DEVHELP_Maya_Python_API_html.html
- Devkit What's New 2022 to 2027 (removed flags, renamed nodes, API behavior changes):
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-DEVHELP/files/Whats-New-Whats-Changed/2027-Whats-New-in-API.html
- Qt6 / PySide6 migration, workspace controls, modules:
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-DEVHELP/files/Whats-New-Whats-Changed/2025-Whats-New-in-API/Qt6Migration.html
- Managing scenes: projects, referencing, Alembic, GPU cache, FBX MEL commands, scale:
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-ManagingScenes/files/GUID-9CE78B5A-7E9F-45E6-AB6D-66795E5656F4.htm
- Fundamentals (DAG vs DG, history, freeze, Optimize Scene Size):
  https://help.autodesk.com/cloudhelp/2027/ENU/Maya-Basics/files/GUID-9C82DAE2-8F19-4F63-BA1A-C28E95DDBE58.htm
- UV Toolkit, Unfold3D, texel density, UDIM tiles (optimized game vs technical mapping): saved as
  `sources/docs/modeling__maya2027-help-uv-toolkit-unfold-layout.md`.
- Color management and Render Setup (output transform for renders and playblasts):
  `sources/docs/lookdev-lighting__maya-2027-color-management-render-setup.md`.
- What's New in Maya 2025, 2026, 2027 (point-release changes, known issues, Arnold license abort):
  `sources/docs/scripting-pipeline__whats-new-maya-202{5,6,7}.md`.
- Arnold for Maya user guide: batch rendering and watermark, kick, lights, cameras, GPU FAQ (no
  Arnold GPU on macOS); AOVs, OIDN and denoising; sampling defaults:
  `sources/docs/lookdev-lighting__arnold-*.md`.
- USD for Maya 2027 and the maya-usd command readme (dev branch):
  `sources/docs/scripting-pipeline__usd-for-maya-2027.md`,
  https://raw.githubusercontent.com/Autodesk/maya-usd/dev/lib/mayaUsd/commands/Readme.md
- Using Parallel Maya 2026 and 2027 (evaluation modes, expressions and dependencies, GPU Override):
  `sources/docs/rigging__using-parallel-maya-2027.md`.

## Community references

- Pixar OpenSubdiv modeling tips (valence, triangles and n-gons "used sparingly", crease sharpness 0
  to 10): `sources/docs/modeling__pixar-opensubdiv-modeling-tips.md`. Used by `mx_audit` profile
  "subd".
- Polycount wiki (poles away from deforming areas, UV shells off the 0-1 border unless tiling,
  triangulate before baking):
  `sources/docs/modeling__polycount-wiki-topology-polycount-normals-uvs.md`.
- Epic Games, FBX Static Mesh Pipeline (pivot at origin, FBX 2020.2, collision naming):
  https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine

## Maya bridges (design references for mx_bridge)

- GG_MayaMCP (Gimbal Goats, unverified credential): https://github.com/GimbalGoats/GG_MayaMCP. Typed
  tools, raw exec off by default, a handler that execs and returns JSON, unsaved-changes guard, 2024
  echoOutput workaround.
- chadrik/maya-mcp-server (Chad Dombrova, Scanline VFX, PyMEL maintainer): raw Python with stdout
  and stderr streaming; "the agent must see Maya's output".
- PatrickPalmer/MayaMCP (unverified): two round trips for results through the default MEL port;
  namespace-prefixed helpers.
- dcc-mcp-maya: main-thread affinity, per-tool timeouts, dialog suppression, proof by numbers
  (matrix deltas 0.0, color drift at most 1/255).
- Steve Theodore, theodox.github.io (2014, unverified credential): no commandPort under
  maya.standalone, `MAYA_SKIP_USERSETUP_PY`, modules, UI callback scoping. Re-test on 2027.

## Toolkit decisions not taken from a source ([added])

Result files instead of socket replies for the bridge; the exchange directory `/tmp/mx_bridge_<uid>`
at mode 0700; hard `os._exit` after `uninitialize`; Maya's stderr at `warning` in mayapy children;
Maya messages captured by kind (warning, error, stack trace) with MCommandMessage and deduplicated
against stderr; the deformer-input rule of `split_history` (a node whose every output ends on a
deformer's non-geometry input); roots held by UUID across validation fixes; the checker default of
16 repeats per UV tile; silhouette computed from alpha so a license watermark never reaches it;
duplicates in a temporary namespace for review renders; verdict thresholds `td_ratio_max=2.0`,
`symmetry_min_pct=99.0`, zero tolerances relative to the bounding box diagonal (1e-6), overlap grid
of 256 cells per UV unit. Each is documented where it is used and can be overridden.

## Revision history

- 2026-09-24, refactor pass 1 (blind grade M8 and `tests/OPEN_ISSUES.md`): `mx_run` children get
  `MAYA_DISABLE_ADP=1` and the batch logging levels (devkit What's New 2022), `maya_log=` /
  `--maya-log`; `mx_bridge` records always carry `stdout`, `stderr` and `maya_messages`, with
  partial output on a timeout (chadrik, maya-mcp-server); `mx_audit.mfn_mesh`, `is_empty_mesh` and
  `split_history` (MFnMesh raises on an empty mesh, devkit 2022.1; bind pose not history);
  `mx_validate` roots held by UUID across fixes, `locked_normals` check and `unlock_normals` fix
  (Maya 2027 Help, FBX Troubleshooting); `mx_review` public options (`checker` mode, `shader_modes`,
  `subdiv`, saved cameras, `pixel_ray`, `view_camera`) replacing the private patches in
  scenario-maya-modeling and scenario-maya-retopology-uv. v1 kept in
  `skills/_versions/maya-expert v1 2026-09-24/`. Offline tests only, not verified in Maya.
