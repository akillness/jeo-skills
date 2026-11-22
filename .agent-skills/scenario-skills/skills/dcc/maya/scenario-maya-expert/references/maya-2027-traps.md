# Maya 2027 traps for agent code

What breaks code written from memory or from 2016 to 2024 tutorials, with the 2027 replacement.
Condensed from the project's `sources/maya-version-deltas.md` (every row there is cited to a saved
Autodesk or Arnold page; the source keys below are that file's keys, for example DK = devkit What's
New 2022 to 2027, WN27 = What's New in Maya 2027). Nothing here has been run in Maya yet: rows
marked [verify] are open questions the probe test (`tests/code/maya-expert/test_00_probe.py`)
answers first.

**Read first:** `cmds.about(version=True)` at session start. Smart Bevel output, MtoA (5.6.0 /
5.6.1.1 / 5.6.2) and USD for Maya (0.35 / 0.36 / 0.37) change between 2027.0, 2027.1 and 2027.2
(WN27).

## 1. Python, Qt, API

| Do not use                                                                                                  | Use in 2027                                                                                                                                             | Since                 | Source   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| Python 2 syntax (`print x`, `raw_input`, `long`, `thread`), Maya's own 2027 help samples included           | Python 3; the shipped version is not documented: `mayapy -c "import sys; print(sys.version)"` [verify]                                                  | Python 2 removed 2023 | DK, PY   |
| PySide2, shiboken2, `pyside2-uic`, and `try: PySide6 except ImportError: PySide2` fallbacks                 | PySide6, shiboken6, `pyside6-uic`; import PySide6 only (a PySide2 fallback crashed 2027.0 when PySide2 was on the system, fixed 2027.1)                 | 2025                  | QT, WN27 |
| `wrapInstance(long(ptr), ...)`                                                                              | `wrapInstance(int(ptr), ...)`                                                                                                                           | 2025                  | QT       |
| `QtWidgets.QAction`, `QActionGroup`, `QShortcut`, `QFileSystemModel`; `QRegExp`; int arithmetic on Qt enums | `QtGui.*`; `QRegularExpression`; enum members (true Python enums)                                                                                       | 2025                  | QT       |
| `mayaSharedGLWidget`                                                                                        | `QApplication.instance().property("mayaSharedQOpenGLContext")`                                                                                          | 2025                  | QT       |
| `dockControl`                                                                                               | `workspaceControl` with a `uiScript` importable at every startup, or `MayaQWidgetDockableMixin.show(dockable=True)`                                     | not stated            | QT       |
| PyMEL in shipped code                                                                                       | `maya.cmds` + `maya.api.OpenMaya`; PyMEL is third party, unsupported by Autodesk, pip-installed                                                         | not stated            | PY       |
| API 1.0 idioms (`MScriptUtil`, `OpenMayaMPx.asMPxPtr`, output arguments, `setWritable()`)                   | API 2.0: return values, properties (`fn.writable = True`), creator returns the instance, `maya_useNewAPI()` in plug-ins; never pass a 1.0 object to 2.0 | not stated            | API2     |
| `MFn.kAttribute2Long`, `kAttribute3Long`                                                                    | `kAttribute2Int`, `kAttribute3Int`                                                                                                                      | 2022.1                | DK       |
| `MItGeometry(handle, 0, ...)` for all vertices                                                              | group id `-1` (0 now yields nothing)                                                                                                                    | 2022                  | DK       |
| `MFnMesh(dag)` on an empty mesh                                                                             | `mx_audit.mfn_mesh(shape)` (None when empty): it raises since 2022.1, and `polyEvaluate` returns a string, not 0, on nothing to count                   | 2022.1                | DK       |
| Workarounds for `MFnAnimCurve.evaluate()` / `addKey()` treating MTime as ticks                              | remove them: fixed in 2024                                                                                                                              | 2024                  | DK       |
| `==` between array `MPlug`s                                                                                 | `MPlug.isExactlyEqual()`                                                                                                                                | 2024                  | DK       |
| Names as dict keys for nodes                                                                                | `om.MObjectHandle` (hashable since 2024) or `cmds.ls(n, uuid=True)`                                                                                     | 2024                  | DK       |
| `evalDeferred` from Python per older pages                                                                  | `maya.utils.executeDeferred()`; `cmds.evalDeferred` also has a Python page [verify which works]                                                         | contradiction in docs | PY       |
| `executeInMainThreadWithResult`, `scriptJob` in mayapy                                                      | not available in batch: call Maya directly on the main thread; `scriptJob` needs the GUI                                                                | not stated            | PY       |

## 2. Commands and flags

| Do not use                                                                                                                                                                                                                                                                                                                                   | Use in 2027                                                                  | Since      | Source |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- | ------ |
| `getAttr(noEvaluation=True)`, `attributeQuery(computeModifies=True)`, `dbtrace(level=)`                                                                                                                                                                                                                                                      | removed; drop the flag                                                       | 2026       | DK     |
| `cutKey(time=())` for all keys                                                                                                                                                                                                                                                                                                               | `cutKey(time=(None, None))`                                                  | 2022       | DK     |
| `about(ltVersion=True)`                                                                                                                                                                                                                                                                                                                      | `about(creativeVersion=True)`                                                | 2023.2     | DK     |
| `greasePencilCtx` and friends                                                                                                                                                                                                                                                                                                                | `bluePencil*` commands                                                       | 2023       | DK     |
| `performSkinCluster.mel`                                                                                                                                                                                                                                                                                                                     | `maya.internal.nodes.skincluster.cmd_create.Command().executeWithDefaults()` | 2022       | DK     |
| `skinCluster(ignoreHierarchy=)`; `ignoreBindPose`                                                                                                                                                                                                                                                                                            | `bindMethod`; ignored                                                        | not stated | SKIN   |
| `maya -render`                                                                                                                                                                                                                                                                                                                               | `Render -r <renderer>`; without `-r` the scene's renderer                    | not stated | PY     |
| `Render -pre` / `-post`                                                                                                                                                                                                                                                                                                                      | `-preRender` / `-postRender`                                                 | obsolete   | PY     |
| `dgdebug`, `dgInfo`                                                                                                                                                                                                                                                                                                                          | `dbpeek`                                                                     | deprecated | PAR26  |
| `dopeSheetEditor(showTicks=)`                                                                                                                                                                                                                                                                                                                | no effect since 2025                                                         | 2025       | DK     |
| New since 2026 you may use: `xform(parentSpace=)`, `loadPlugin(pluginPath=)`, `playblast(exposure=, gamma=, partialSave=)`, `confirmDialog(detailedMessage=)`, `-dumpInfo` on deformer commands; 2027: `polySmartBevel`; updated `playblast`, `loadPlugin`, `workspaceControl`, `confirmDialog` (flags not listed) [verify with `cmds.help`] |                                                                              | 2026, 2027 | DK     |

commandPort (2027 reference, PY): default `sourceType` is MEL; default `bufferSize` 4096 characters,
longer commands close the connection and longer results are replaced by an error; Python returns the
result of one statement only; `name=":7001"` is INET "on the local host" [verify the bind with
lsof], a name without a colon is a UNIX socket under /tmp, a name starting with `/` a full socket
path; no authentication. Third-party bridges report a Maya 2024 echoOutput bug, a security dialog on
first connection, and no commandPort under maya.standalone (Theodore 2014) (MCP) [verify all three].

## 3. Nodes (rigging and utilities)

| Do not use                                                              | Use in 2027                                                                                                                                                                 | Since        | Source     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| `addDoubleLinear`, `multiplyDoubleLinear`, `pointMatrixMult`            | `addDL`, `multiplyDL`, `pointMatrixMultDL`; old scenes open with warnings                                                                                                   | 2026         | WN26       |
| Assuming `createNode("power")`, `"absolute"` etc. carry units           | they now create unitless nodes; check `getAttr(n + ".input", type=True)` [verify]                                                                                           | 2026         | WN26       |
| `axisXFromMatrix`, `axisYFromMatrix`, `axisZFromMatrix`                 | `axisFromMatrix`                                                                                                                                                            | 2025         | DK         |
| Offset group transforms above controls                                  | `offsetParentMatrix` (with `inheritsTransform` off for world-space matrices); `parentMatrix` node (2025), `blendMatrix`, `aimMatrix`, `pickMatrix`, `uvPin`, `proximityPin` | 2020 to 2025 | MTX, WN25  |
| `blendMatrix` as a weighted average                                     | it is an ordered blend; `rotationFromMatrix` assumes XYZ                                                                                                                    | not stated   | MTX        |
| FBIK                                                                    | HumanIK (FBIK forces Serial evaluation, being deprecated)                                                                                                                   | not stated   | PAR27      |
| `ik2Bsolver`, `ikMCsolver`, `ikSpringSolver` without loading them       | load them first; `ikHandle` lists only RP, SC and spline as valid [verify]                                                                                                  | not stated   | SKEL       |
| `joint(e=True, oj=...)` on a joint with rotations or no child           | silently ignored: zero rotations first; negative primary axes (`xyzNeg`) fixed in 2027.1                                                                                    | 2027.1       | SKEL, WN27 |
| Legacy particles, fluids, rigid bodies in rigs meant to run in parallel | Nucleus, Bullet, Bifrost (legacy dynamics force DG)                                                                                                                         | not stated   | PAR26      |
| Expressions that call `getAttr`                                         | node networks: expressions hide dependencies from the Evaluation Manager (parallel by default since 2016)                                                                   | 2016         | PAR27      |

## 4. Modeling, UVs, retopology

- **Smart Bevel** `polySmartBevel` (2027): Width is in world units, not a fraction; Depth is a
  profile (1 flat chamfer, 0 to 1 rounded, negative concave); Filter defaults to Selected Edges;
  2027.1 fixed spikes and arc welding, 2027.2 is faster. The old bevel is now "legacy bevel" (POLY,
  WN27).
- **Smart Extrude** (2025) is Edit Mesh > Smart Extrude; the old shift-drag is "Shift Extrude"
  (WN25).
- **Booleans:** `polyBoolean` node (2023), 3ds Max engine (2025.3), Volume mode (2026); select
  meshes, not their group (DK, WN25, WN26, POLY).
- **UVs:** Unfold3D is the default for Unfold, Optimize and Layout and refuses non-manifold meshes;
  "Relax" is Optimize > Legacy; the UV Texture Editor is the UV Editor + UV Toolkit; Texel Density
  needs Map Size set first (UV).
- **Retopologize** (`polyRetopo`): delete history after it or it re-runs; Keep Original renames the
  input to `<name>_original` (RETO). Reduce (`polyReduce`) is decimation, not retopology (FUND).
- **Quad Draw** is interactive only (RETO). **Flow Retopology** is a cloud service needing sign-in
  and network: not for headless agents [added].
- **Smooth Mesh Preview** is display only (OpenSubdiv Catmull-Clark); crease sharpness 0 to 10,
  above 5 rarely needed (POLY, OSD).

## 5. Deformation

- **Skin Tools** (2027, built on ngSkinTools): layers exist only after Initialize Skin Layers; once
  they exist, classic Paint Skin Weights, Set Max Influences, Hammer, Paste, Move Weights, Import
  Weight Maps, Mirror, Substitute Geometry, Normalize and Copy Skin Weights are blocked; Smooth Skin
  Weights errors with several layers; Delete Skin Layers keeps the evaluated weights and is the
  handoff step; no Skin Tools Python API is in the saved docs (SKIN, WN27) [verify what
  `skinPercent` and `MFnSkinCluster.setWeights` do with layers present].
- `skinCluster(multi=True)` for a second cluster (2024); `bm=3` needs `geomBind`; editing `mi` or
  `dr` in edit mode discards painted weights; Rigid Bind is gone (SKIN, DK).
- `copySkinWeights`: pass `mirrorMode` and `surfaceAssociation` explicitly (docs disagree on the
  default) (SKIN).
- ML Deformer (2025.2+) downloads PyTorch into `<MAYA_APP_DIR>/mlDeformer/...`; it sits above the
  deformers it learns (WN25, BLS).

## 6. Animation

- Default tangent is Auto Span (Legacy) per the Tangents menu page (one line still says Clamped)
  [verify with `keyTangent(q=True, g=True, itt=True)`]; Lock/Free Tangent Weight is now Tangent
  Length; Butterworth is Smooth Filter (Butterworth) (GE).
- Cached Playback is on by default; Trax, XGen, motion blur, classic particles and cloth disable it
  (CACHE). Time Editor replaces Trax and does not mix with animation layers (TE).
- Ghost Selected is the Ghost Editor; Motion Trail Editor since 2025 (GHOST, WN25).
- The Camera Sequencer is the Sequencer in 2027 (OTIO in 2027.1) (SEQ, WN27).
- HumanIK: bake from the HumanIK window, not Bake Simulation (HIK).
- Playblast: WebM since 2026; exposure and gamma follow the viewport toolbar (WN25, WN26). Playblast
  needs a model panel: GUI only [verify].

## 7. Look dev, lighting, color (Arnold for Maya 5.6.x, Arnold 7.5.x)

- **OpenPBR Surface** (`openPBRSurface`) is the default shader in new scenes (2026). Not 1:1 with
  Standard Surface: emission Luminance in nits scaled by `nits_per_unit`; thin film in micrometers
  (Standard Surface: nanometers); SSS Radius is scalar and Radius Scale the RGB multiplier
  (swapped); Sheen is Fuzz; dispersion needs Dispersion Scale above 0; metal Base Color is F0 and
  Specular Color the F82 tint (OPBR). Standard Surface still works and is what Substance presets
  target (SS).
- **Arnold GPU and OptiX are not available on macOS**: CPU plus OIDN (runs on Apple GPUs since MtoA
  5.4.5); OIDN imager added to new scenes (WN25, WN27, LGT).
- **Batch licensing:** command-line Arnold renders carry a watermark without batch licenses; since
  Arnold 7.3 batch renders abort on license failure; `ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL=0`
  watermarks instead (WN25, LGT). Arnold 7.5 uses license version ARNOL_2027 (WN27).
- **Maya IPR does not work with MtoA 5 or newer**: Arnold RenderView (WN27).
- **Sampling:** Global Light Sampling replaces per-light samples; per-light `sampling_mode`; most
  pixel filters are legacy (Gaussian 2.0 or Blackman-Harris); MtoA IPR defaults Camera AA 3, Diffuse
  2, Specular 2, Transmission 2, SSS 2 (SMP, WN27).
- **AOVs:** `direct_diffuse` is `diffuse_direct`; AOV shaders are Legacy, use Custom AOVs;
  Cryptomatte `object_split_instances` off by default (AOV, WN27).
- **Bloom:** simple mode and `bloom_radius` deprecated (WN27). Mesh lights via Arnold > Light > Mesh
  light, not `translator = mesh_light` (LGT).
- **Color management:** OCIO v2 Maya-default config, ACEScg rendering space, ACES sRGB view;
  synColor gone (2026); ACES2065-1 no longer a rendering space (2026.2); default input role
  `sRGB Encoded Rec.709 (sRGB)` (2026.2); linear sRGB is spelled two ways in the help: query names
  with `colorManagementPrefs`, never hardcode; rules tag .tx, .hdr and .exr as Raw, so a linear-sRGB
  HDRI is read as ACEScg; rules set only new file nodes (Reapply Rules); no gammaCorrect nodes;
  Apply Output Transform to Renderer for preview PNGs only, off for EXR (CM, WN26, BRJ-CM).
- Render Setup and legacy render layers are exclusive per session; Render Setup nodes are dropped on
  import or reference (CM).

## 8. FX and grooming

- Legacy Bifrost Fluids containers and BOSS: rebuild with Bifrost Graph compounds
  (`basic_liquid_graph`, `basic_aero_graph`, `basic_combustion_graph`, MPM compounds); Bifrost is
  3.0 in 2027 and always installed since 2026.2; Nucleus and Bifrost assume 1 unit = 1 m (Space
  Scale 0.01 for cm scenes) (BSIM, WN26, NCL, PIPE). Some Bifrost node names are inconsistent across
  pages: read them in the graph [verify].
- MASH: Noise, Trig, Mute are Signal and Strength; default geometry type Repro (MASH).
- nCloth Bend Solver default is High Quality (NCL).
- XGen: legacy descriptions are not compatible with Interactive Groom tools; hair shader is Standard
  Hair (`scattering_mode` in 5.6.0); load MtoA before XGen; Card primitives unsupported in MtoA
  (XGIG, HAIR).

## 9. Pipeline

- **USD for Maya 0.35 to 0.37:** `mayaUSDExport` defaults to `frameRange` [1,1], `defaultMeshScheme`
  catmullClark (suppresses normals: use `none` for game meshes), `exportSkels`/`exportSkin` none,
  `map1` renamed `st` unless `preserveUVSetNames`; `-parentScope` is `-rootPrim`; pass
  `convertMaterialsTo` explicitly (MaterialX is the default target on new installs since 0.34 while
  the command readme says UsdPreviewSurface); `mayaUSDImport` ignores animation unless
  `readAnimData=True` (USDCMD, WN26).
- **FBX:** set the file version explicitly (the options page still names 2019.2 as default; Unreal
  uses 2020.2); Smoothing Groups, never `FBXExportHardEdges`; tangents only on all-triangle meshes;
  the split-take accumulator persists until `-clear`; wrap exports in `FBXPushSettings` /
  `FBXPopSettings` (FBXUE, PIPE).
- **Alembic:** Ogawa only (DK). **References:** never rename or restructure a child file in use
  (edits replay by name and path) (PIPE). **Units:** working units reset to cm in each new file
  (PIPE).

## 10. macOS specifics

- mayapy: `/Applications/Autodesk/maya2027/Maya.app/Contents/bin/mayapy`; `MAYA_LOCATION` is
  `.../Maya.app/Contents` while `internalVar(mayaInstallDir=True)` has no `Contents` (PY, DK).
- pip without admin rights:
  `mayapy -m pip install <pkg> --target ~/Library/Preferences/Autodesk/maya/2027/scripts/site-packages`
  (the folder exists after Maya's first start) (PY).
- `maya -log` and `Render -log` are Windows only: redirect stdout (PY). Batch renders can hang on
  localhost resolution: fix `/etc/hosts` (PY). Batch output is set by
  `MAYA_BATCH_STDOUT_LOGGING_LEVEL` (default none) and `MAYA_BATCH_STDERR_LOGGING_LEVEL` (default
  all), analytics by `MAYA_DISABLE_ADP=1`; mx_run sets all three for its children (DK 2022).
- Hotkeys: Maya's docs map Ctrl to Control and Alt to Option, not Command (FUND). Plug-ins are
  `.bundle`; path lists use `:` (QT). CgFX, synColor and the stereoCamera plug-in are unavailable on
  Apple Silicon (DK).
- GPU Override is documented as OpenCL with AMD and NVIDIA thresholds only; behavior on Apple GPUs
  is undocumented [verify] (PAR27).
