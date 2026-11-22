# Reliable maya.cmds and OpenMaya 2.0 for agents (Maya 2027)

The idioms that keep generated Maya code correct, re-runnable and safe in someone's scene. Sources:
Raffaele Fragapane (Cult of Rig, OpenMaya 2 stream, Dt5ODNLUuSM), the Autodesk Python scripting and
plug-in series (2012 to 2013), the Maya 2027 Help (Python in Maya, API 2.0, devkit What's New), the
public Maya MCP bridges (GG_MayaMCP, chadrik, Palmer, dcc-mcp) and Steve Theodore's posts; details
in `sources.md`. **All code below is not yet run in Maya**; items marked [verify] are answered by
`tests/code/maya-expert/test_00_probe.py`, [added] marks this toolkit's own rules.

## 1. Checklist (compact)

1. `import maya.cmds as cmds`; never `from maya.cmds import *` (shadows built-ins such as `help`)
   (Maya 2027 Help, Using Python).
2. Every command gets explicit node arguments; no `select` then operate, no `ls(sl=True)` in batch
   code (Autodesk series; [added] for agents).
3. Capture creation returns and use them: `polyCube` returns `[transform, historyNode]`,
   `name="crate#"` expands `#` to a unique number, a clashing name is renamed (Autodesk series,
   eXFGeZZbMzQ [00:02:49]).
4. Long names (`long=True`, `fullPath=True`) or UUIDs (`cmds.ls(n, uuid=True)`) wherever two nodes
   can share a short name [added].
5. `or []` after `ls`, `listRelatives`, `listConnections`, `listHistory`, `polyInfo` [added: several
   return None on no match; probe records which].
6. Compound `getAttr` returns `[(x, y, z)]`; take `[0]` (Autodesk series, ZmCYXzsCMO0 [00:01:23]).
7. Fixed arguments cannot be tuple-packed: `cmds.move(x, y, z, node)` or `cmds.move(*vec, node)`
   (Maya 2027 Help, Current limitations).
8. Flags that are Python keywords lose that name (`is` short flag: use `internalSet`; `break` long
   flag: use `b`); time ranges are tuples; units are strings (`"10pal"`) (same).
9. `objExists(node + ".attr")` or `attributeQuery(..., exists=True)` before `addAttr` (Autodesk
   series, ZmCYXzsCMO0 [00:03:59]).
10. Get-or-create by name, tag what you create, and clean up by tag, never by a wildcard that can
    hit user nodes (P2) [added].
11. Never modify or delete nodes you did not create unless the task is to fix them, and then report
    every change (mx_validate's fix log) [added].
12. GUI edits inside an undo chunk closed in `finally`; one agent step = one chunk (Maya 2027 Help,
    undoInfo: misused chunks "can leave the undo queue in a bad state").
13. OpenMaya 2.0 writes are invisible to undo; in a GUI session write with cmds, or with OM2 only
    inside an `MPxCommand` owning an `MDGModifier` (Fragapane [01:17:49]; Autodesk plug-in series,
    BZyXe3MhEyI).
14. Never create a node with cmds and delete it with OM2 in one undoable operation: undo then tries
    to delete a node that is gone (Fragapane [01:17:49] to [01:18:56]).
15. Check types without exceptions: `obj.hasFn(om.MFn.kDagNode)`, `MFnDependencyNode.hasAttribute()`
    before `findPlug`; use the narrowest function set, it validates input for free (Fragapane
    [00:44:06] to [00:47:26]).
16. Use named rotation-order constants; `MTransformationMatrix` orders are off by one against
    `MEulerRotation`; `MEulerRotation` takes radians (Fragapane [00:59:59] to [01:01:04]).
17. OpenMaya works in internal units (centimeters, radians); cmds reads and writes UI units (the
    user may be in meters or degrees) [added, probed].
18. `MFnMesh` raises on an empty mesh (devkit 2022.1), and `polyEvaluate` returns a message string,
    not 0, when it counts nothing, so `if not polyEvaluate(...)` is not a guard: use
    `mx_audit.mfn_mesh(shape)` (None on an empty mesh) or `mx_audit.is_empty_mesh(shape)` [added].
19. Only the main thread talks to Maya: cmds raises elsewhere, OpenMaya has "unforeseen side
    effects" (Maya 2027 Help, Python and threading).
20. Over a bridge, never call `input()`, `pdb`, `confirmDialog`, `promptDialog`, `fileDialog2`: they
    open modal UI and block Maya (Maya 2027 Help, standard input; dcc-mcp suppresses dialogs for the
    same reason).
21. Before `file(new=True)` or `file(open=True, force=True)`: `cmds.file(q=True, modified=True)` is
    False or a copy was saved (GG_MayaMCP refuses otherwise).
22. Open untrusted scenes with `executeScriptNodes=False` [added: script nodes run arbitrary code on
    open; verify the flag]; save to a new path, never over the source.
23. Pass callables, not strings, to UI callbacks; accept `*args`; `functools.partial` instead of
    lambdas in loops (Theodore, callbacks cheat sheet).
24. Log `cmds.about(version=True)`, `cmds.about(apiVersion=True)`, `sys.version`,
    `cmds.about(batch=True)` with every report (devkit notes, [added]).
25. Prefer node networks (2024 math nodes, 2025 matrix nodes) to expressions for arithmetic:
    expressions with `getAttr` hide dependencies from the Evaluation Manager (Using Parallel Maya
    2027). Keep expressions for formulas with no node equivalent.

## 2. cmds or OpenMaya 2.0

| Work                                                        | Use                                                                                 | Why                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One-off queries, `objExists`, `ls`, `listConnections`       | cmds                                                                                | Fragapane: cmds queries are often faster than API loops, sometimes faster than equivalent C++ [01:18:56] |
| Edits in a live session the user may undo                   | cmds inside an undo chunk                                                           | OM2 does nothing for undo [01:17:49]                                                                     |
| Thousands of points or components, topology walks, matrices | OM2 (`MFnMesh.getPoints`, `getVertices`, `MItMeshEdge`, `MDagPath.inclusiveMatrix`) | one call instead of thousands; "long to write, fast to execute" [00:30:41]                               |
| Callbacks                                                   | OM2 `MMessage` classes, cheap bodies, ids stored and removed                        | Fragapane: design the callback as a small graph first [00:08:18]                                         |
| Batch jobs that never undo                                  | OM2 writes are fine                                                                 | nothing to undo headless [added]                                                                         |
| Undoable OM2 operations in the GUI                          | an API 2.0 `MPxCommand` with an `MDGModifier` (P9)                                  | the Autodesk undo model: `doIt` once, `redoIt`, `undoIt`                                                 |

## 3. Evaluated vs original data

- A deformed mesh has two shapes: the visible one (deformed result) and an intermediate
  `...ShapeOrig` (`intermediateObject` 1) that feeds the deformer chain.
  `listRelatives(x, shapes=True, noIntermediate=True)` returns the visible shape; `MFnMesh` on it
  reads deformed points; read the Orig shape for rest positions [added, verify].
- Maya's graph is pull-based: querying a dirty plug (`getAttr`, `xform(q=True, ws=True)`,
  `MFnMesh.getPoints`) evaluates it; no refresh call is needed after `setAttr` [added]. To read
  another frame without moving time: `cmds.getAttr(plug, time=t)`; to step,
  `cmds.currentTime(t, update=True)` [verify how Cached Playback interacts with scripted stepping].
- `getAttr(".translate")` is local; world values come from `xform(q=True, ws=True, ...)` (UI units)
  or `MDagPath.inclusiveMatrix()` (cm).
- History: `listHistory(shape, pruneDagObjects=True)` lists upstream nodes; deformers are the ones
  whose `nodeType(n, inherited=True)` contains `geometryFilter`. Delete construction history with
  `delete(n, constructionHistory=True)`; on skinned meshes use
  `bakePartialHistory(n, prePostDeformers=True)` (Delete Non-Deformer History) [verify flag].
- Instances share one shape with several DAG paths: `MDagPath.isInstanced()`,
  `listRelatives(shape, allParents=True)` (API 2.0 help, scene graph).
- Referenced nodes: `referenceQuery(n, isNodeReferenced=True)`; edits to them live in the parent's
  reference node and replay by name and path, so never rename or re-parent inside a referenced file
  (Maya 2027 Help, reference edits).

## 4. Procedures (not yet run in Maya; test scripts under `tests/code/maya-expert/`)

**P1. Session probe**

```python
import sys, platform
import maya.cmds as cmds

def session_info():
    return {"maya": cmds.about(version=True), "api": cmds.about(apiVersion=True),
            "python": sys.version.split()[0], "machine": platform.machine(),
            "batch": cmds.about(batch=True), "scene": cmds.file(q=True, sceneName=True),
            "modified": cmds.file(q=True, modified=True),
            "units": (cmds.currentUnit(q=True, linear=True), cmds.currentUnit(q=True, angle=True),
                      cmds.currentUnit(q=True, time=True), cmds.upAxis(q=True, axis=True))}
```

`mx_run.session_info()` is the headless version.

**P2. Idempotent get-or-create, tagged, and cleanup by tag** [added]

```python
TAG = "mxAgent"

def get_or_create(node_type, name, parent=None):
    """Long name of our node `name`, created if missing. Refuses a user node of that name."""
    if cmds.objExists(name):
        n = cmds.ls(name, long=True)[0]
        if cmds.attributeQuery(TAG, node=n, exists=True):
            return n
        raise RuntimeError("%s exists and is not ours: choose another name" % name)
    n = cmds.createNode(node_type, name=name, parent=parent) if parent else cmds.createNode(node_type, name=name)
    cmds.addAttr(n, longName=TAG, attributeType="bool", defaultValue=True)
    return cmds.ls(n, long=True)[0]

def our_nodes():
    return [n for n in cmds.ls(long=True) or [] if cmds.attributeQuery(TAG, node=n, exists=True)]
```

`createNode` of a shape type without a parent also creates a transform; tag the transform too.
Alternatives: a namespace for temporary setups (mx_review creates everything in `mxReview` and
removes the namespace with its content) or an object set.

**P3. Undo chunk**

```python
from contextlib import contextmanager

@contextmanager
def undo_chunk(name="agent"):
    cmds.undoInfo(openChunk=True, chunkName=name)
    try:
        yield
    finally:
        cmds.undoInfo(closeChunk=True)      # always close
```

The bridge server wraps every call in one chunk already (`mx:<job id>`).

**P4. Undo round trip as the acceptance test** (Autodesk plug-in series, BZyXe3MhEyI [00:11:47])

```python
def undo_round_trip(fn, *a, **kw):
    before = sorted(cmds.ls(long=True))
    with undo_chunk("probe"):
        fn(*a, **kw)
    after = sorted(cmds.ls(long=True))
    cmds.undo()
    undone = sorted(cmds.ls(long=True)) == before
    cmds.redo()
    redone = sorted(cmds.ls(long=True)) == after
    return undone and redone
```

In mayapy, check `cmds.undoInfo(q=True, state=True)` first [verify undo is on headless].

**P5. OpenMaya 2.0 reads** (Fragapane; API 2.0 help)

```python
import maya.api.OpenMaya as om

def dag(name):
    sl = om.MSelectionList(); sl.add(name); return sl.getDagPath(0)

def mobject(name):
    sl = om.MSelectionList(); sl.add(name); return sl.getDependNode(0)

def world_points(mesh):                       # one call, centimeters; [] on an empty mesh
    import mx_audit                           # scenario-maya-expert/scripts on sys.path
    fn = mx_audit.mfn_mesh(mesh)              # MFnMesh raises on an empty mesh (2022.1)
    return fn.getPoints(om.MSpace.kWorld) if fn else []

def world_matrix(name):                       # [added] instance-aware, shortest route
    return dag(name).inclusiveMatrix()

def world_matrix_from_plug(obj):              # Fragapane's plug route; MDataHandle.asMatrix() returns garbage
    if not obj.hasFn(om.MFn.kDagNode):
        return None
    p = om.MFnDagNode(obj).findPlug("worldMatrix", False).elementByLogicalIndex(0)
    return om.MFnMatrixData(p.asMObject()).matrix()

def matrices_match(expected, computed, tol=1e-5):   # the rigorous check [01:16:03]
    return (expected.inverse() * computed).isEquivalent(om.MMatrix(), tol)   # [verify signature]
```

**P6. Unit-safe values** [added]

```python
UI_TO_CM = {"mm": 0.1, "cm": 1.0, "m": 100.0, "in": 2.54, "ft": 30.48, "yd": 91.44}

def ui_to_cm(v):
    return v * UI_TO_CM[cmds.currentUnit(q=True, linear=True)]
```

Never change the scene's units to make a script work; convert. Nucleus and Bifrost assume 1 unit = 1
m whatever the working unit (Maya 2027 Help).

**P7. Selection-free attribute work** (Autodesk series, improved)

```python
if not cmds.attributeQuery("expansion", node=ctrl, exists=True):
    cmds.addAttr(ctrl, longName="expansion", attributeType="double", minValue=0, maxValue=100,
                 defaultValue=100, keyable=True)
cmds.addAttr(node, longName="fkBufferMsg", attributeType="message")        # metadata link
cmds.connectAttr(buffer + ".message", node + ".fkBufferMsg")               # (Fragapane [00:14:56])
cmds.keyTangent(obj, attribute="rotateY", time=(s, e), inTangentType="linear", outTangentType="linear")
cmds.cutKey(obj, attribute="rotateY", time=(None, None))                   # all keys since 2022
```

Constraint weight attribute names: query `weightAliasList=True`, never hardcode `W0` [verify flag].

**P8. Headless job for mx_run**

```python
# job_export.py   run: python3 mx_run.py --scene in.ma --plugins fbx job_export.py -- /abs/out/asset.fbx
import maya.cmds as cmds
import maya.mel as mel

def main(argv):
    out = argv[0]
    roots = cmds.ls("|*_GRP", long=True) or []           # explicit roots, no selection state kept
    mel.eval("FBXPushSettings")
    try:
        mel.eval("FBXResetExport")
        mel.eval("FBXExportSmoothingGroups -v true")
        cmds.select(roots, replace=True)                 # FBXExport -s needs a selection
        mel.eval('FBXExport -f "%s" -s' % out)
    finally:
        mel.eval("FBXPopSettings")
    return {"fbx": out, "roots": roots}
```

The full Unreal preset lives in scenario-maya-pipeline-scripting. Settings are global state: reset,
set every option, log them with `-q` (Maya 2027 Help, FBX commands).

**P9. Undoable OpenMaya command** (Autodesk plug-in series translated to API 2.0)

```python
import maya.api.OpenMaya as om

def maya_useNewAPI():
    pass

class AgentMakeGroup(om.MPxCommand):
    kName = "agentMakeGroup"

    def __init__(self):
        om.MPxCommand.__init__(self)
        self.mod = om.MDagModifier()

    def isUndoable(self):
        return True

    def doIt(self, args):                 # runs once: set up, then redoIt
        node = self.mod.createNode("transform")
        self.mod.renameNode(node, "agentGrp#")          # [verify] '#' expansion
        self.redoIt()

    def redoIt(self):
        self.mod.doIt()

    def undoIt(self):
        self.mod.undoIt()

def initializePlugin(obj):
    om.MFnPlugin(obj).registerCommand(AgentMakeGroup.kName, AgentMakeGroup)

def uninitializePlugin(obj):
    om.MFnPlugin(obj).deregisterCommand(AgentMakeGroup.kName)
```

MDGModifier deletion: call `doIt()` before `deleteNode()` and again right after (API 2.0 help). Node
IDs for internal plug-ins: `0x00000` to `0x7ffff`.

**P10. Plug-in reload** (Autodesk plug-in series, v1d8fCtIROI [00:06:49])

```python
def reload_plugin(path, name):
    cmds.flushUndo()                      # no instance of the old command left on the undo stack
    if cmds.pluginInfo(name, q=True, loaded=True):
        cmds.unloadPlugin(name)
    cmds.loadPlugin(path)
```

**P11. Scene callbacks with a registry** (Fragapane's design discipline; API names [verify])

```python
_CALLBACKS = []

def watch_attr(node, attr, fn):
    obj = mobject(node)
    def cb(msg, plug, other, client):
        if msg & om.MNodeMessage.kAttributeSet and plug.partialName(useLongNames=True) == attr:
            fn(plug)
    _CALLBACKS.append(om.MNodeMessage.addAttributeChangedCallback(obj, cb))

def clear_callbacks():
    for cid in _CALLBACKS:
        om.MMessage.removeCallback(cid)
    del _CALLBACKS[:]
```

Run the body as a plain function first; callbacks are not saved in the scene (Fragapane [00:43:30],
[00:01:10]).

## 5. Lint before running generated code

Refuse or rewrite: `from maya.cmds import *`; `import pymel`; `PySide2`, `shiboken2`,
`QtWidgets.QAction`, `dockControl`; Python 2 syntax; `OpenMayaMPx` or `MScriptUtil` in API 2.0 code;
`noEvaluation`, `computeModifies`, `time=()`; `addDoubleLinear`, `multiplyDoubleLinear`,
`pointMatrixMult`; `ls(sl=True)` in batch code; `input(`, `pdb`, `confirmDialog`, `promptDialog`,
`fileDialog2` over a bridge (mx_bridge lints the last group automatically); string UI callbacks;
`file(new=True, force=True)` without a modified check (scripting digest, quality gates).

## 6. Runtime gates

- Version probe logged; required plug-ins loaded (`pluginInfo(p, q=True, loaded=True)`).
- Undo round trip passes for every scene-changing tool (P4).
- Matrix gate `matrices_match` for any snapping, matching or rigging math.
- Each OM2 helper returns cleanly (None or a neutral value) on a wrong-type node (Fragapane
  [00:45:44]).
- Batch: child exit code 0, `MX_RESULT` parsed, uninitialize reached; one child per scene.
- Bridge: port on loopback only (`lsof -nP -iTCP:7001 -sTCP:LISTEN`), every reply parsed, timeout
  set, port closed at the end.

## 7. GUI habit, agent substitute

| Human habit                             | Agent substitute                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Learn the MEL from Script Editor echo   | `cmds.help("<command>")` and the CommandsPython reference; never guess a flag     |
| Orbit the viewport                      | `mx_review.review` contact sheet (headless) or `mx_review.playblast` (GUI)        |
| Plug-in Manager                         | `loadPlugin`, `pluginInfo(q=True, loaded=True)`, `mx_run --plugins`               |
| Connection Editor, Add Attribute window | `connectAttr`, `addAttr` (message, matrix and array types the window cannot make) |
| Mesh > Cleanup (select matching)        | `polyInfo(nonManifoldEdges=, nonManifoldVertices=, laminaFaces=)` plus `mx_audit` |
| Outliner with DAG Objects Only off      | `ls()` with types; `mx_validate` unused, unknown, sets, layers checks             |
| Ctrl+Z                                  | `cmds.undo()`; one bridge call is one chunk                                       |
| Render View IPR                         | not with MtoA 5+; `mx_review` stills headless, Arnold RenderView in the GUI       |
