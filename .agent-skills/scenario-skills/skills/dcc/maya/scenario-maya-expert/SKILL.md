---
name: scenario-maya-expert
description: 'Use when doing any Autodesk Maya task through Python or a bridge, headless or live: maya.cmds or OpenMaya 2.0 scripts, mayapy or maya.standalone batch jobs, a commandPort or MCP connection into a running Maya, "Maya 2027", validating or exporting scenes, or a maya.cmds script that fails after the 2025 to 2027 changes (PySide6, OpenPBR, renamed math nodes, removed flags). Also when a Maya model, rig, shot or render must be judged like a professional before it is called done, or a brief must be routed to the right Maya specialist.'
license: MIT
---

# Maya expert (router and agent protocol)

Expert Maya work is a loop, not a script: block big to small, and at every stage measure, render,
look and fix before adding detail. This skill is the protocol every Maya task follows, the shared
toolkit the other scenario-maya-* skills call, and the map to them. Target: Maya 2027 on macOS Apple
Silicon, driven through Python. If a sibling skill named here is missing from your available skills,
load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**Status (2026-09-24):** Maya 2027 is not installed yet. Every Maya call in [`scripts/`](scripts/)
and `references/` is **not yet run in Maya**. The pure-Python parts and the Maya-layer logic ran
offline against fakes and pass. First action once Maya is installed:
`tests/code/maya-expert/run_all.sh`, then read
`archive/tests/maya-expert/<stamp>/results/test_00_probe.json` and correct anything marked [verify]
here.

## 1. Execution channels

| Channel                                                              | Use for                                                                                         | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headless `mayapy` through [`scripts/mx_run.py`](scripts/mx_run.py)   | audits, validation, exports, Arnold review renders, batch work, anything that needs no viewport | `python3 mx_run.py [--scene f.ma] [--plugins mtoa,fbx,abc,usd] job.py -- args`. One child process per scene: a crash or hang costs one job. The last stdout line is `MX_RESULT {json}`; exit 0 ok, 1 job error, 4 timeout. Children get `MAYA_DISABLE_ADP=1` and Maya's stderr at `warning` (`--maya-log all` to debug). Script nodes off. Never overwrite the source: `--save-as` a new version.                                                               |
| Live GUI Maya through [`scripts/mx_bridge.py`](scripts/mx_bridge.py) | playblasts, viewport captures, interactive tools, the user's open scene                         | Emmanuel starts [`mx_bridge_server.start()`](scripts/mx_bridge_server.py) once in the Script Editor. Then `Bridge().run(code)`: any length, multi-statement; every record carries `result`, `stdout`, `stderr`, `maya_messages` (Maya's warnings and errors) and the traceback, even on a timeout. Read them every call. One call = one undo chunk. Check `cmds.file(q=True, modified=True)` before replacing a scene. Never open modal UI. `stop()` when done. |

Do not launch a GUI Maya yourself [added]: it takes a license seat and cannot be driven without the
bridge. One Arnold render at a time per machine [added].

mayapy: `/Applications/Autodesk/maya2027/Maya.app/Contents/bin/mayapy` (Maya 2027 Help).
`mx_run.find_mayapy()` checks `$MX_MAYAPY`, `$MAYA_LOCATION/bin/mayapy` (on macOS `MAYA_LOCATION`
ends in `Maya.app/Contents`), then the newest `/Applications/Autodesk/maya20*/`. Log
`cmds.about(version=True)` at session start: Smart Bevel, MtoA and USD for Maya differ across
2027.x.

**Why files for the bridge:** a commandPort defaults to MEL, a 4096-character buffer (longer
commands close the connection, longer results become an error) and returns the result of one
statement only (Maya 2027 Help, commandPort; Python in Maya). `mx_bridge` sends one short line and
exchanges code and results as files (GG_MayaMCP pre-installs a handler; Palmer uses two round
trips). Security: the port is opened as `127.0.0.1:<port>` [verify with lsof] and has no
authentication; Maya's help warns an INET port runs any command, including `system()`, as the user.
Personal machine only, close it after the session.

**Capability matrix** (from the docs; the probe test confirms or corrects each row):

| Action                                                                                              | Headless mayapy                                     | GUI via bridge                                                   | Basis                          |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| cmds / OpenMaya edits, file IO, references, FBX, Alembic, USD export                                | yes                                                 | yes                                                              | Maya 2027 Help, Python in Maya |
| Arnold stills ([`mx_review`](scripts/mx_review.py))                                                 | yes, CPU; watermark without an Arnold batch license | yes                                                              | Arnold batch docs              |
| `Render -r hw2` viewport-style frames                                                               | documented, unverified on macOS                     | n/a                                                              | command-line render doc        |
| `playblast`, `modelEditor`, viewport grabs                                                          | no (needs a model panel) [verify]                   | yes, `mx_review.playblast`                                       | scripting digest               |
| Tool contexts: Quad Draw, Multi-Cut, sculpt, Paint Skin Weights, Skin Tools, 3D paint, XGen brushes | no                                                  | interactive only (no stroke API): script the underlying commands | Maya 2027 Help                 |
| `scriptJob`                                                                                         | no                                                  | yes, not during playback                                         | Maya 2027 Help, scriptJobs     |
| `maya.utils.executeInMainThreadWithResult`                                                          | no, "not available in batch mode"                   | yes                                                              | Maya 2027 Help, threading      |
| `maya.utils.executeDeferred`                                                                        | only when idle events run [verify]                  | yes                                                              | same                           |
| MMessage callbacks                                                                                  | [verify]                                            | yes                                                              | scripting digest               |
| commandPort                                                                                         | absent per Theodore 2014 [verify]                   | yes                                                              | MCP bridges note               |
| PySide6 windows, `workspaceControl`                                                                 | no                                                  | yes                                                              | Qt6 migration docs             |
| Flow Retopology (cloud)                                                                             | no: sign-in and network [added]                     | yes                                                              | version deltas                 |
| `confirmDialog`, `input()`, `pdb`, file dialogs                                                     | never                                               | never: they block Maya's main thread and the bridge              | Maya 2027 Help, standard input |

## 2. The expert loop (every domain)

1. **Brief in numbers.** Purpose (engine, film, still, animation), budgets (triangles, texture size
   and texel density, frame range and fps), style, references, deadline. When the brief is silent,
   take the domain skill's documented default and write it down.
2. **Stages** from the domain skill, big to small. Never start with detail.
3. **Build one stage** with small, idempotent scripts (get-or-create by name, tag what you create,
   selection-free).
4. **Gate the stage** with measurable checks ([`mx_audit.verdict`](scripts/mx_audit.py),
   [`mx_validate`](scripts/mx_validate.py), the domain's numbers) AND a render you open with the
   image reader (`mx_review.review` sheet headless, or a playblast in the GUI). Experts turn the
   model constantly; the contact sheet is the agent's orbit. Judge it with the domain's
   `references/critique.md`.
5. **Fix before advancing.** A problem found at blockout costs one script; found after texturing it
   costs the stage.
6. **Deliver with evidence:** the saved version, audit and validation JSON, the sheet or playblast,
   and a list of what was not verified.

Never report a model, rig, shot or render as done without having looked at a render of it. Numbers
first, then eyes: Fragapane's standard for a matching tool is the inverse of the expected matrix
times the computed one equals identity, not "looks right" (Cult of Rig, [01:16:03]); dcc-mcp's
showcase proves claims with deltas of 0.0 and color drift of at most 1/255.

## 3. Persona pipelines

| Brief                            | Skill chain                                                                                                                                           | Deliverable                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Hard-surface prop or game asset  | scenario-maya-modeling, scenario-maya-retopology-uv, scenario-maya-lookdev, scenario-maya-pipeline-scripting (FBX)                                    | low poly, UVs, PBR set, FBX re-imported and compared                |
| Finish an AI-generated mesh      | scenario-3d, `mx_audit` on the raw mesh, scenario-maya-retopology-uv, scenario-maya-lookdev, scenario-maya-pipeline-scripting                         | clean, UV'd asset at a stated budget, baked from the generated high |
| Character for keyframe animation | scenario-maya-modeling, scenario-maya-retopology-uv, scenario-maya-rigging, scenario-maya-deformation, scenario-maya-animation (range-of-motion test) | referenced rig file, deformation playblast                          |
| Game character                   | the same chain with the game options of scenario-maya-rigging and scenario-maya-animation, then scenario-maya-pipeline-scripting                      | FBX skeletal mesh and clips for Unreal or Unity                     |
| Animated shot                    | scenario-maya-animation (fixes in scenario-maya-rigging), then scenario-maya-lighting-rendering                                                       | approved playblast, then renders                                    |
| Look dev or hero still           | scenario-maya-lookdev, scenario-maya-lighting-rendering                                                                                               | turntable, lit render, AOVs                                         |
| FX shot                          | scenario-maya-fx (nCloth, Bifrost, MASH), then scenario-maya-lighting-rendering                                                                       | versioned caches, render                                            |
| Groomed character                | scenario-maya-groom, scenario-maya-lookdev (hair shader), scenario-maya-lighting-rendering                                                            | groom, caches, render                                               |
| Pipeline or batch tool           | scenario-maya-pipeline-scripting, built on `mx_run` and `mx_validate`                                                                                 | tool and JSON report                                                |

**Handoff contract:** every handoff carries a new saved version (never the source overwritten), an
`mx_validate` report for the receiving profile with no `fail`, `mx_audit` numbers for its meshes, a
sheet or playblast the sender looked at, and the list of what was not verified. Units stay cm and
Y-up (Maya 2027 Help; Unreal's unit is 1 cm).

| From, to                             | Gate in code                                                                                                                                                                                                                                                            | Look at                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| modeling to retopology-uv or rigging | `validate(profile="model")` clean, no locked normals on meshes that will deform; 0 n-gons on subdivided or deforming meshes; frozen, no history (FlippedNormals); characters symmetric on X, standing on the grid at the origin, Y-up facing +Z (Quick Rig requires it) | silhouette and clay sheet |
| retopology-uv to lookdev or rigging  | every face mapped, UVs in 0-1 or clean UDIM tiles, texel density stated in px/cm, overlaps only where stacked on purpose                                                                                                                                                | wire and normals sheet    |
| rigging or deformation to animation  | rig referenced, never imported; `profile="rig"` clean; Skin Tools layers deleted before handoff (Maya 2027 Help: Delete Skin Layers keeps the weights)                                                                                                                  | range-of-motion playblast |
| animation to lighting                | `profile="shot", rules={"fps": ...}` clean; references loaded; caches versioned (Alembic is Ogawa only)                                                                                                                                                                 | final playblast           |
| lookdev to lighting                  | `file_paths` pass; color space set per file node                                                                                                                                                                                                                        | turntable                 |
| fx or groom to lighting              | caches versioned with frame range; Nucleus and Bifrost assume 1 unit = 1 m (Maya 2027 Help)                                                                                                                                                                             | playblast of the cache    |

## 4. Shared toolkit (`scripts/`, not yet run in Maya)

Import: `import sys; sys.path.insert(0, "<this skill>/scripts")`. The bridge server adds this folder
to Maya's `sys.path`, so `Bridge().call("mx_audit", "audit", "crate_geo")` works in the GUI too.

- `mx_run.py`: `find_mayapy()`,
  `run_subprocess(job, args, scene=, plugins=, timeout=, save_as=, maya_log=)` (parent side, parsed
  dict), `child_environment()`, `run(job, args)` (inside mayapy).
- `mx_bridge.py` / `mx_bridge_server.py`:
  `Bridge(port=7001).ping() / run(code) / call(module, fn, *a, reload=True) / fetch(id)`,
  `format_record(rec)`; server `start() / stop() / handle(id)`.
- `mx_audit.py`: `audit(mesh, texture_size=2048, units="cm")` returns counts, poles by valence,
  non-manifold, lamina, zero-area, borders and holes, winding, UV sets and bounds, UDIM tiles,
  overlapping and folded shells, texel density per shell, frozen transforms, pivot, history, naming,
  instances, symmetry on X, edge-length CV; `verdict(report, profile="game"|"film"|"subd")` lists
  `error:` / `warn:` / `info:` lines; `audit_all(roots)`. Guards for all skills: `mfn_mesh(shape)`
  (None on an empty mesh), `is_empty_mesh`, `split_history` (bind pose and weight drivers are not
  history).
- `mx_review.py`: `review(targets, out_dir, views, modes, resolution=1024, tile=512, focus=None)`:
  front, side, back, threequarter, top, low; clay, wire, silhouette, normals, opt-in `checker`
  (`checker_repeats=`) and custom `shader_modes=`; `subdiv=`; one labeled sheet plus tiles and each
  view's camera (`r["cameras"]`, review.json, `pixel_ray`), the user's settings restored. Skills use
  these options, never `_Session`. `turntable(targets, out_dir, frames=24)`;
  `playblast(path, start, end, display={...})` (GUI only).
- `mx_validate.py`: `validate(profile="model"|"rig"|"shot", roots=None, rules=None, fix=())`:
  naming, namespaces, history, frozen transforms, non-manifold, lamina, n-gons, UVs, locked normals,
  smoothing, render stats, layers, sets, unused and unknown nodes, plug-ins, references, script
  nodes, units and up axis, frame rate, missing files; `SAFE_FIXES`; roots held by UUID across fixes
  (`roots_after`).

## 5. Rules for Maya code (what generalist code gets wrong)

- **Selection-free and explicit:** pass node names to every command; never `select` then operate.
  Capture creation returns (`polyCube` returns `[transform, history]`, `#` names expand) and use
  them, not the name you asked for (Autodesk intro series).
- **Long names or UUIDs** for anything that can share a short name; `or []` after `ls`,
  `listRelatives`, `listConnections` [added, probed].
- **Undo is your job:** wrap GUI edits in an undo chunk with `try/finally`. OpenMaya 2.0 writes
  never reach the undo queue, and deleting with OM2 a node cmds created corrupts undo (Fragapane,
  [01:17:49]). OM2 for heavy reads and matrices, cmds for edits a user may undo.
- **Units:** OpenMaya works in centimeters and radians; cmds returns UI units and degrees [added,
  probed in `test_00_probe`].
- **Never touch nodes you did not create**; tag your own (namespace, attribute or set) and clean up
  by tag. Save stage versions, never over the source.
- **Main thread only:** cmds raises off the main thread (Maya 2027 Help).

## 6. Maya 2027 traps that break remembered code

- PySide6 only; ship no PySide2 fallback (it crashed 2027.0 when PySide2 was installed).
  `dockControl` is gone: `workspaceControl`.
- New scenes use OpenPBR Surface; its parameters do not port from Standard Surface (emission in
  nits, thin film in micrometers, SSS radius roles swapped).
- `addDoubleLinear`, `multiplyDoubleLinear`, `pointMatrixMult` became `addDL`, `multiplyDL`,
  `pointMatrixMultDL` (2026); plain names like `power` now create unitless nodes.
- Removed flags: `getAttr(noEvaluation=)`, `attributeQuery(computeModifies=)`; all keys is
  `cutKey(time=(None, None))`.
- Arnold on macOS: CPU only, no OptiX; OIDN imager in new scenes; Maya IPR does not work with MtoA
  5+ (Arnold RenderView); batch renders abort on license failure unless
  `ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL=0`.
- Color: OCIO v2 and ACEScg; the default input space is `sRGB Encoded Rec.709 (sRGB)` since 2026.2;
  query names, never hardcode them.
- Skin Tools layers block the classic weight tools (Mirror, Copy, Hammer, Paste, Normalize, Set Max
  Influences) until deleted.
- `maya -render` is obsolete: `Render -r <renderer>`; Render Setup and legacy render layers are
  exclusive per session.
- `mayaUSDExport` defaults: `frameRange` [1,1], catmullClark scheme, `map1` renamed `st`.
- `MFnMesh` raises on an empty mesh (use `mx_audit.mfn_mesh`); `MItGeometry` needs group -1 for all
  vertices. PyMEL is not bundled; the Python version is undocumented: probe it.

## References

- [`references/maya-2027-traps.md`](references/maya-2027-traps.md): the full list of what breaks
  agent code, old name to 2027 replacement, with sources. Load before writing code from memory or
  following a pre-2025 tutorial.
- [`references/cmds-reliability.md`](references/cmds-reliability.md): idioms and tested-pending
  procedures for reliable maya.cmds and OpenMaya 2.0 (return types, evaluated vs original data, OM2
  patterns, undo, idempotent get-or-create, batch hygiene). Load before any non-trivial script.
- [`references/sources.md`](references/sources.md): every source behind this skill and the toolkit,
  with what each is best for.
- Related skills outside this set: scenario-3d (generate meshes to finish in Maya),
  scenario-zbrush-expert and scenario-blender-expert (sister teams with the same protocol).
