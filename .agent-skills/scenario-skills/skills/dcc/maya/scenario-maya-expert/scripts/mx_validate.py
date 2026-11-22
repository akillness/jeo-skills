"""
mx_validate: the pre-handoff scene validator a pipeline TD runs (Maya 2027).

STATUS: not yet run in Maya (written 2026-09-24).

  import sys; sys.path.insert(0, "<skill>/scripts"); import mx_validate
  rep = mx_validate.validate(profile="model")                   # read-only
  rep["ok"], rep["summary"], [c for c in rep["checks"] if c["status"] == "fail"]
  rep = mx_validate.validate(profile="model", roots=["crate_GRP"],
                             fix=mx_validate.SAFE_FIXES)          # fix, then re-check
  rep = mx_validate.validate(profile="shot", rules={"fps": 24})

Headless, through mx_run (never overwrite the source: fixes go to --save-as):
  mayapy mx_run.py --scene in.ma --save-as out/in_fixed.ma mx_validate.py -- \
         --profile model --fix history,smooth_preview --json out/validate.json

Profiles (what the receiving department needs):
  model  modeling to retopology, rigging or look dev: no history, frozen transforms,
         clean manifold geometry, UVs, clean Outliner (the FlippedNormals clean-scene
         checklist, ToWRH4IXF7A)
  rig    rig to animation: deformer history allowed, scene hygiene, references state
  shot   animation or lighting shots: references loaded and resolvable, frame rate,
         units, paths; geometry rules skipped (assets are checked at their own handoff)

Checks (id): scene, units, frame_rate, naming_default, naming_duplicates, naming_pattern,
  namespaces, history, transforms, geometry (non-manifold, lamina, n-gons, empty meshes),
  uvs, locked_normals, smooth_preview, render_stats, display_layers, selection_sets,
  unused_nodes, unknown (unknown nodes and plug-ins), plugins, references, script_nodes,
  file_paths, cameras, deep_audit (mx_audit per mesh, opt-in with deep=True)
Each check: {id, status pass|warn|fail|skip|info, message, count, items, fix}
history ignores bind poses (dagPose) and deformer weight drivers (mx_audit.split_history).
locked_normals: imported, non-deformed geometry arrives with locked normals that do not
follow skinning or blend shapes (Maya 2027 Help, FBX Troubleshooting); deliberate custom
normals on a static mesh are the exception, so it warns and never fixes on its own.

Fixes (only when asked; each in its own undo chunk, then every check runs again):
  SAFE_FIXES: history (meshes without deformers), smooth_preview, unknown_dead (unknown
    nodes and plug-in requirements of dead plug-ins, default mental ray "Mayatomr")
  optional:   history_deformed (bakePartialHistory prePostDeformers: Delete Non-Deformer
    History), freeze (only unreferenced, unlocked, unconnected transforms with no skinned
    mesh, joint or instance below), namespaces (merge non-reference namespaces into root
    when no name clash), render_stats, unused_shading (Hypershade Delete Unused Nodes),
    empty_groups, unknown_all (deletes data of plug-ins missing on this machine),
    unlock_normals (Mesh Display > Unlock Normals on unreferenced meshes; shading then
    follows the edges' hard/soft flags, so compare a normals sheet before and after)
Never fixed automatically: non-manifold, lamina and n-gons (FlippedNormals: fix n-gons by
hand, Cleanup's automatic result is unpredictable), units, frame rate, references,
naming, script nodes.

Roots survive the fixes: validate() and apply_fixes() hold each root by UUID and find it
again after every fix, so a namespace merge that renames "chr:body_GRP" to "body_GRP"
keeps the scope (open issue 2026-09-24; it raised "root does not exist" before). The
report's roots_after lists the names after the fixes; roots_lost lists roots that no
longer exist (an empty_groups fix can delete one).
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import glob
import json
import os
import re
import sys
import time

DEFAULT_RULES = {
    "linear": "cm",          # keep Maya in centimeters (Maya 2027 Help, working in different scales)
    "angle": "deg",
    "up_axis": "y",
    "fps": None,             # e.g. 24 or 30; None = report only
    "uv_sets": None,         # e.g. ["map1"] or ["map1", "lightmap"]
    "name_patterns": {},     # e.g. {"mesh": r".+_geo$", "group": r".+_GRP$", "joint": r".+_jnt$"}
    "freeze_exclude": [],    # regexes of transforms allowed to keep values (eye groups: FlippedNormals)
    "dead_plugins": ["Mayatomr"],   # [added] mental ray: not shipped since Maya 2018
    "allowed_plugins": None, # list of plug-ins the receiving side has; None = report only
    "project_root": None,    # defaults to the current workspace root
    "max_items": 50,
    "deep_profile": None,    # mx_audit profile for deep=True: game, film or subd (default: film, shot: game)
}

SEV = {  # profile -> check -> severity when the check finds something (None = skip)
    "model": {"units": "fail", "frame_rate": "warn", "naming_default": "warn", "naming_duplicates": "fail",
              "naming_pattern": "warn", "namespaces": "warn", "history": "fail", "transforms": "fail",
              "geometry": "fail", "uvs": "fail", "locked_normals": "warn", "smooth_preview": "warn",
              "render_stats": "warn", "display_layers": "warn", "selection_sets": "warn", "unused_nodes": "warn",
              "unknown": "fail", "plugins": "warn", "references": "warn", "script_nodes": "warn",
              "file_paths": "fail", "cameras": "warn"},
    "rig": {"units": "fail", "frame_rate": "warn", "naming_default": "warn", "naming_duplicates": "fail",
            "naming_pattern": "warn", "namespaces": "warn", "history": "fail", "transforms": "fail",
            "geometry": "warn", "uvs": "warn", "locked_normals": "warn", "smooth_preview": "warn",
            "render_stats": None, "display_layers": None, "selection_sets": None, "unused_nodes": "warn",
            "unknown": "fail", "plugins": "warn", "references": "warn", "script_nodes": "warn",
            "file_paths": "fail", "cameras": "warn"},
    "shot": {"units": "fail", "frame_rate": "fail", "naming_default": None, "naming_duplicates": "warn",
             "naming_pattern": None, "namespaces": None, "history": None, "transforms": None,
             "geometry": None, "uvs": None, "locked_normals": None, "smooth_preview": None, "render_stats": None,
             "display_layers": None, "selection_sets": None, "unused_nodes": "warn", "unknown": "fail",
             "plugins": "warn", "references": "fail", "script_nodes": "warn", "file_paths": "fail",
             "cameras": None},
}

TIME_UNITS = {"game": 15.0, "film": 24.0, "pal": 25.0, "ntsc": 30.0, "show": 48.0, "palf": 50.0,
              "ntscf": 60.0, "sec": 1.0, "millisec": 1000.0}
DEFAULT_NAME_RE = re.compile(
    r"^(pCube|pSphere|pCylinder|pCone|pPlane|pTorus|pPrism|pPyramid|pPipe|pHelix|pSolid|pDisc|pPlatonic|"
    r"pGear|pSuperShape|polySurface|group|transform|null|nurbsSphere|nurbsCube|nurbsCylinder|nurbsCone|"
    r"nurbsPlane|nurbsTorus|nurbsCircle|curve|locator|joint)\d*$")
RENDER_STATS = {"castsShadows": 1, "receiveShadows": 1, "motionBlur": 1, "primaryVisibility": 1,
                "smoothShading": 1, "visibleInReflections": 1, "visibleInRefractions": 1,
                "doubleSided": 1, "opposite": 0}
PATH_ATTRS = [("file", "fileTextureName"), ("aiImage", "filename"), ("aiStandIn", "dso"),
              ("aiVolume", "filename"), ("gpuCache", "cacheFileName"), ("AlembicNode", "abc_File"),
              ("imagePlane", "imageName"), ("audio", "filename"), ("mayaUsdProxyShape", "filePath"),
              ("aiPhotometricLight", "aiFilename"), ("psdFileTex", "fileTextureName"),
              ("movie", "fileTextureName"), ("cacheFile", "cachePath")]
DEFAULT_SHADERS = {"lambert1", "particleCloud1", "shaderGlow1", "standardSurface1", "openPBRSurface1"}
DEFAULT_SETS = {"defaultLightSet", "defaultObjectSet", "initialShadingGroup", "initialParticleSE",
                "initialMaterialInfo"}
STANDARD_SCRIPT_NODES = {"uiConfigurationScriptNode", "sceneConfigurationScriptNode"}
# [added] names used by the self-replicating Maya scene "virus" that writes userSetup files
KNOWN_BAD_SCRIPT_NODES = {"vaccine_gene", "breed_gene"}
SUSPICIOUS_SCRIPT = ("userSetup", "base64", "exec(", "urllib", "socket", "os.system", "subprocess")
SAFE_FIXES = ("history", "smooth_preview", "unknown_dead")


def _cmds():
    import maya.cmds as cmds
    return cmds


def _audit():
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    import mx_audit
    return mx_audit


def _leaf(n):
    return n.rsplit("|", 1)[-1]


# --------------------------------------------------------------------------- roots by UUID
def root_handles(roots):
    """[(name, uuid)] for the roots, so they can be found again after a fix renames them
    (namespace merge). Raises for a root that does not exist. None for roots=None."""
    if not roots:
        return None
    cmds = _cmds()
    out = []
    for r in roots:
        if not cmds.objExists(r):
            raise ValueError("root %s does not exist" % r)
        u = cmds.ls(r, uuid=True) or []
        out.append((r, u[0] if u else None))
    return out


def live_roots(handles):
    """(current long names, [original names no longer found]) for root_handles()."""
    if handles is None:
        return None, []
    cmds = _cmds()
    now, lost = [], []
    for name, uid in handles:
        hits = (cmds.ls(uid, long=True) or []) if uid else []      # ls resolves UUIDs [verify]
        if not hits and cmds.objExists(name):
            hits = cmds.ls(name, long=True) or []
        if hits:
            if hits[0] not in now:
                now.append(hits[0])
        else:
            lost.append(name)
    return now, lost


def _check(cid, sev, items, message, fix=None, info=None, max_items=50):
    items = list(items or [])
    if sev is None:
        status = "skip"
    elif items:
        status = sev
    else:
        status = "pass"
    c = {"id": cid, "status": status, "count": len(items), "items": items[:max_items], "message": message}
    if fix and items and sev:
        c["fix"] = fix
    if info is not None:
        c["info"] = info
    return c


# --------------------------------------------------------------------------- scope
def _scope(roots):
    cmds = _cmds()
    if roots:
        xf = []
        for r in roots:
            if not cmds.objExists(r):
                raise ValueError("root %s does not exist" % r)
            xf += cmds.ls(r, long=True, type="transform") or []
            xf += cmds.listRelatives(r, allDescendents=True, type="transform", fullPath=True) or []
    else:
        xf = cmds.ls(type="transform", long=True) or []
    startup = set()
    for c in cmds.ls(type="camera", long=True) or []:
        if cmds.camera(c, q=True, startupCamera=True):
            startup.update(cmds.listRelatives(c, parent=True, fullPath=True) or [])
    xf = [x for x in dict.fromkeys(xf) if x not in startup]
    meshes = []
    for x in xf:
        for s in cmds.listRelatives(x, shapes=True, type="mesh", fullPath=True, noIntermediate=True) or []:
            meshes.append(s)
    return xf, meshes


def _is_ref(cmds, n):
    try:
        return cmds.referenceQuery(n, isNodeReferenced=True)
    except Exception:
        return False


def _mesh_history(cmds, shape):
    """(construction history nodes, deformers). A skinned mesh's bind pose and the drivers of
    deformer weights are not history (mx_audit.split_history)."""
    s = _audit().split_history(shape)
    return [h for h, _t in s["history"]], s["deformers"]


def _xform_values(cmds, x):
    t = cmds.getAttr(x + ".translate")[0]
    r = cmds.getAttr(x + ".rotate")[0]
    s = cmds.getAttr(x + ".scale")[0]
    sh = cmds.getAttr(x + ".shear")[0]
    opm = cmds.getAttr(x + ".offsetParentMatrix") if cmds.attributeQuery(
        "offsetParentMatrix", node=x, exists=True) else [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    ok = (all(abs(v) < 1e-5 for v in tuple(t) + tuple(r) + tuple(sh)) and all(abs(v - 1) < 1e-5 for v in s)
          and all(abs(a - b) < 1e-6 for a, b in zip(opm, ident)))
    return ok, {"t": list(t), "r": list(r), "s": list(s), "shear": list(sh),
                "offsetParentMatrix_identity": all(abs(a - b) < 1e-6 for a, b in zip(opm, ident))}


def fps_of(unit):
    """Frames per second of a Maya time unit ("film" 24, "ntsc" 30, "game" 15, "60fps"...),
    None when unknown. Pure."""
    if unit in TIME_UNITS:
        return TIME_UNITS[unit]
    m = re.match(r"^([\d.]+)fps$", unit or "")
    return float(m.group(1)) if m else None


_fps = fps_of


def _expand(path, root):
    cmds = _cmds()
    if not path:
        return path
    p = os.path.expandvars(os.path.expanduser(path))
    if not os.path.isabs(p):
        try:
            p = cmds.workspace(expandName=p)
        except Exception:
            p = os.path.join(root or "", p)
    return p


def locked_normal_count(shape):
    """Number of locked (frozen) normal entries on a mesh, 0 on an empty mesh or when the
    query fails. Same query as mx_audit's locked_normal_verts [verify on 2027 whether
    polyNormalPerVertex(q=True, freezeNormal=True) returns one flag per vertex or per
    vertex-face; either way 0 means none locked]."""
    cmds = _cmds()
    if _audit().is_empty_mesh(shape):
        return 0
    try:
        flags = cmds.polyNormalPerVertex(shape + ".vtx[*]", q=True, freezeNormal=True) or []
    except Exception:
        return 0
    return sum(1 for x in flags if x)


def _exists_pattern(path):
    if os.path.exists(path):
        return True
    pat = re.sub(r"<[^>]+>", "*", path)
    pat = re.sub(r"#+", "*", pat)
    pat = re.sub(r"_MAPID_|\$F\d*", "*", pat)
    return pat != path and bool(glob.glob(pat))


# --------------------------------------------------------------------------- checks
def run_checks(profile="model", roots=None, rules=None, deep=False):
    cmds = _cmds()
    R = dict(DEFAULT_RULES)
    R.update(rules or {})
    S = SEV[profile]
    mx = R["max_items"]
    xf, meshes = _scope(roots)
    checks = []
    add = checks.append

    add({"id": "scene", "status": "info", "count": 0, "items": [], "message": "scene info",
         "info": {"scene": cmds.file(q=True, sceneName=True), "modified": cmds.file(q=True, modified=True),
                  "maya": cmds.about(version=True), "transforms_in_scope": len(xf),
                  "meshes_in_scope": len(meshes), "nodes": len(cmds.ls() or [])}})
    # units and frame rate
    lin, ang, up = (cmds.currentUnit(q=True, linear=True), cmds.currentUnit(q=True, angle=True),
                    cmds.upAxis(q=True, axis=True))
    bad = []
    if R["linear"] and lin != R["linear"]:
        bad.append("linear unit %s (expected %s)" % (lin, R["linear"]))
    if R["angle"] and ang != R["angle"]:
        bad.append("angle unit %s (expected %s)" % (ang, R["angle"]))
    if R["up_axis"] and up != R["up_axis"]:
        bad.append("up axis %s (expected %s)" % (up, R["up_axis"]))
    add(_check("units", S["units"], bad, "working units and up axis (never change them silently)",
               info={"linear": lin, "angle": ang, "up": up}))
    tu = cmds.currentUnit(q=True, time=True)
    fps = _fps(tu)
    bad = []
    if R["fps"] and (fps is None or abs(fps - float(R["fps"])) > 1e-3):
        bad.append("time unit %s = %s fps (expected %s)" % (tu, fps, R["fps"]))
    add(_check("frame_rate", S["frame_rate"] if R["fps"] else "info", bad, "scene frame rate",
               info={"time_unit": tu, "fps": fps,
                     "range": [cmds.playbackOptions(q=True, minTime=True), cmds.playbackOptions(q=True, maxTime=True)]}))
    # naming
    add(_check("naming_default", S["naming_default"],
               [x for x in xf if DEFAULT_NAME_RE.match(_leaf(x).rsplit(":", 1)[-1]) and not _is_ref(cmds, x)],
               "default names (pCube1, group3...) in published nodes", max_items=mx))
    short = {}
    for x in cmds.ls(type="transform", long=True) or []:
        short.setdefault(_leaf(x), []).append(x)
    dups = [x for x in xf if len(short.get(_leaf(x), [])) > 1]
    add(_check("naming_duplicates", S["naming_duplicates"], dups,
               "two nodes share a short name (FlippedNormals: never in production; breaks rigs and name-based "
               "texture assignment)", max_items=mx))
    pats = R["name_patterns"] or {}
    badn = []
    if pats:
        for x in xf:
            kind = ("mesh" if cmds.listRelatives(x, shapes=True, type="mesh") else
                    "joint" if cmds.nodeType(x) == "joint" else
                    "group" if cmds.nodeType(x) == "transform" and not cmds.listRelatives(x, shapes=True) else None)
            if kind in pats and not re.match(pats[kind], _leaf(x).rsplit(":", 1)[-1]):
                badn.append("%s (%s: %s)" % (x, kind, pats[kind]))
    add(_check("naming_pattern", S["naming_pattern"] if pats else None, badn, "studio naming patterns", max_items=mx))
    # namespaces
    ref_ns = set()
    for ref in cmds.ls(type="reference") or []:
        if ref in ("sharedReferenceNode", "_UNKNOWN_REF_NODE_"):
            continue
        try:
            ref_ns.add(cmds.referenceQuery(ref, namespace=True).lstrip(":"))
        except Exception:
            pass
    all_ns = [n.lstrip(":") for n in (cmds.namespaceInfo(":", listOnlyNamespaces=True, recurse=True,
                                                          absoluteName=True) or [])]
    loose_ns = [n for n in all_ns if n not in ("UI", "shared") and n.split(":")[0] not in ref_ns]
    add(_check("namespaces", S["namespaces"], loose_ns, "namespaces not owned by a reference (import leftovers)",
               fix="namespaces", max_items=mx))
    # history and transforms
    hist_items = []
    for m in meshes:
        if _is_ref(cmds, m):
            continue
        other, deformers = _mesh_history(cmds, m)
        if other:
            hist_items.append({"mesh": m, "history": other[:8], "deformers": deformers[:8]})
    add(_check("history", S["history"], hist_items,
               "non-deformer construction history on meshes (FlippedNormals: delete history before handoff)",
               fix="history (no deformers) / history_deformed", max_items=mx))
    excl = [re.compile(p) for p in R["freeze_exclude"]]
    tr_items = []
    if S["transforms"]:
        for x in xf:
            if cmds.nodeType(x) != "transform" or _is_ref(cmds, x) or any(e.search(_leaf(x)) for e in excl):
                continue
            has_geo = cmds.listRelatives(x, shapes=True, type="mesh") or cmds.listRelatives(
                x, allDescendents=True, type="mesh")
            if not has_geo:
                continue
            ok, vals = _xform_values(cmds, x)
            if not ok:
                tr_items.append({"node": x, "values": vals})
    add(_check("transforms", S["transforms"], tr_items,
               "transforms of meshes and their groups not frozen (or offsetParentMatrix not identity)",
               fix="freeze", max_items=mx))
    # geometry
    geo_items = []
    uv_items = []
    if S["geometry"] or S["uvs"]:
        A = _audit()
        for m in meshes:
            fn = A.mfn_mesh(m)          # None for an empty mesh (MFnMesh raises on one since 2022.1)
            if fn is None:
                geo_items.append({"mesh": m, "problem": "empty mesh", "counted": A.mesh_counts(m)})
                continue
            probs = {}
            for flag, name in (("nonManifoldEdges", "non_manifold_edges"), ("nonManifoldVertices", "non_manifold_verts"),
                               ("laminaFaces", "lamina_faces")):
                res = cmds.polyInfo(m, **{flag: True}) or []
                try:
                    res = cmds.ls(res, flatten=True) or res
                except Exception:
                    pass
                if res:
                    probs[name] = len(res)
            counts, _ = fn.getVertices()
            ng = sum(1 for c in counts if c > 4)
            if ng:
                probs["ngons"] = ng
            if probs:
                geo_items.append(dict(mesh=m, **probs))
            sets = cmds.polyUVSet(m, q=True, allUVSets=True) or []
            up_ = {}
            if not sets:
                up_["problem"] = "no UV set"
            else:
                cur = fn.currentUVSetName()
                ucounts, _ = fn.getAssignedUVs(cur)
                missing = sum(1 for c in ucounts if c == 0)
                if missing:
                    up_["faces_without_uvs"] = missing
                if R["uv_sets"] and list(sets) != list(R["uv_sets"]):
                    up_["uv_sets"] = sets
            if up_:
                uv_items.append(dict(mesh=m, **up_))
    add(_check("geometry", S["geometry"], geo_items,
               "non-manifold, lamina, n-gons, empty meshes (fix by hand: Mesh > Cleanup is fine for lamina and "
               "non-manifold, never for n-gons, per FlippedNormals)", max_items=mx))
    add(_check("uvs", S["uvs"], uv_items, "UV sets present, every face mapped, expected set names", max_items=mx))
    ln_items = []
    if S["locked_normals"]:
        for m in meshes:
            if _is_ref(cmds, m):
                continue
            n = locked_normal_count(m)
            if n:
                ln_items.append({"mesh": m, "locked_entries": n,
                                 "deformed": bool(_mesh_history(cmds, m)[1])})
    add(_check("locked_normals", S["locked_normals"], ln_items,
               "locked normals do not follow skinning or blend shapes (typical after FBX or OBJ import): unlock "
               "before rigging, keep only deliberate custom normals on static meshes (Maya 2027 Help, FBX "
               "Troubleshooting)", fix="unlock_normals", max_items=mx))
    # display and render state
    sp = [m for m in meshes if cmds.attributeQuery("displaySmoothMesh", node=m, exists=True)
          and cmds.getAttr(m + ".displaySmoothMesh")]
    add(_check("smooth_preview", S["smooth_preview"], sp,
               "Smooth Mesh Preview on (FlippedNormals: save with smoothing off, press 1)", fix="smooth_preview",
               max_items=mx))
    rs = []
    if S["render_stats"]:
        for m in meshes:
            for a, v in RENDER_STATS.items():
                if cmds.attributeQuery(a, node=m, exists=True) and cmds.getAttr(m + "." + a) != v:
                    rs.append("%s.%s=%s" % (m, a, cmds.getAttr(m + "." + a)))
    add(_check("render_stats", S["render_stats"], rs,
               "render stats not at defaults (FlippedNormals: a stray unchecked box costs days)", fix="render_stats",
               max_items=mx))
    dl = [l for l in (cmds.ls(type="displayLayer") or []) if l != "defaultLayer" and not _is_ref(cmds, l)]
    add(_check("display_layers", S["display_layers"], dl, "display layers (FlippedNormals: delete before handoff)",
               max_items=mx))
    ss = []
    for s in cmds.ls(type="objectSet") or []:
        if cmds.nodeType(s) != "objectSet" or s in DEFAULT_SETS or _is_ref(cmds, s):
            continue
        if cmds.listConnections(s + ".usedBy", source=True, destination=False) if cmds.attributeQuery(
                "usedBy", node=s, exists=True) else False:
            continue      # deformer membership set
        ss.append(s)
    add(_check("selection_sets", S["selection_sets"], ss, "selection sets (FlippedNormals: delete before handoff)",
               max_items=mx))
    # unused nodes
    unused = []
    for se in cmds.ls(type="shadingEngine") or []:
        if se in DEFAULT_SETS or _is_ref(cmds, se):
            continue
        if not cmds.sets(se, q=True):
            unused.append("empty shading group %s" % se)
    for mat in cmds.ls(materials=True) or []:
        if mat in DEFAULT_SHADERS or _is_ref(cmds, mat):
            continue
        if not cmds.listConnections(mat, type="shadingEngine"):
            unused.append("unassigned material %s" % mat)
    for x in xf:
        if cmds.nodeType(x) == "transform" and not cmds.listRelatives(x, children=True) and not _is_ref(cmds, x):
            unused.append("empty group %s" % x)
    add(_check("unused_nodes", S["unused_nodes"], unused, "unused shading nodes and empty groups",
               fix="unused_shading / empty_groups", max_items=mx))
    # unknown nodes and plug-ins
    unk = []
    for t in ("unknown", "unknownDag", "unknownTransform"):
        for n in cmds.ls(type=t) or []:
            plug = None
            try:
                plug = cmds.unknownNode(n, q=True, plugin=True)
            except Exception:
                pass
            unk.append({"node": n, "type": t, "plugin": plug})
    try:
        unk_plugins = cmds.unknownPlugin(q=True, list=True) or []
    except Exception:
        unk_plugins = []
    items = unk + [{"plugin_requirement": p} for p in unk_plugins]
    add(_check("unknown", S["unknown"], items,
               "unknown nodes and missing plug-in requirements (data from plug-ins this Maya lacks)",
               fix="unknown_dead / unknown_all", max_items=mx,
               info={"dead_plugins": R["dead_plugins"]}))
    try:
        in_use = cmds.pluginInfo(q=True, pluginsInUse=True) or []
    except Exception:
        in_use = []
    names = in_use[0::2] if in_use and len(in_use) % 2 == 0 and not isinstance(in_use[0], (list, tuple)) else in_use
    bad = [p for p in names if R["allowed_plugins"] is not None and p not in R["allowed_plugins"]]
    add(_check("plugins", S["plugins"] if R["allowed_plugins"] is not None else "info", bad,
               "plug-ins the scene requires", info={"in_use": in_use}))
    # references
    ref_items = []
    for ref in cmds.ls(type="reference") or []:
        if ref in ("sharedReferenceNode", "_UNKNOWN_REF_NODE_"):
            continue
        d = {"ref": ref}
        try:
            d["file"] = cmds.referenceQuery(ref, filename=True, withoutCopyNumber=True)
            d["loaded"] = cmds.referenceQuery(ref, isLoaded=True)
            d["exists"] = os.path.isfile(_expand(d["file"], R["project_root"]))
            try:
                d["failed_edits"] = len(cmds.referenceQuery(ref, editStrings=True, failedEdits=True,
                                                            successfulEdits=False) or [])
            except Exception:
                d["failed_edits"] = None
        except Exception as exc:
            d["error"] = str(exc)
        problem = (not d.get("loaded") or not d.get("exists") or d.get("failed_edits") or d.get("error"))
        if problem or profile == "model":
            ref_items.append(d)
    fp = cmds.ls(type="fosterParent") or []
    ref_items += [{"fosterParent": f} for f in fp]
    add(_check("references", S["references"], ref_items,
               "references unloaded, missing, with failed edits, or present in an asset file; foster parents",
               max_items=mx))
    # script nodes
    sn = []
    for n in cmds.ls(type="script") or []:
        body = ""
        for a in ("before", "after"):
            try:
                body += cmds.getAttr(n + "." + a) or ""
            except Exception:
                pass
        sus = [s for s in SUSPICIOUS_SCRIPT if s in body]
        bad = n.split(":")[-1] in KNOWN_BAD_SCRIPT_NODES
        if n in STANDARD_SCRIPT_NODES and not sus:
            continue
        sn.append({"node": n, "known_malicious_name": bad, "suspicious": sus, "chars": len(body),
                   "scriptType": cmds.getAttr(n + ".scriptType")})
    sev = S["script_nodes"]
    if any(i["known_malicious_name"] for i in sn):
        sev = "fail"
    add(_check("script_nodes", sev, sn,
               "script nodes run code when the scene opens (open untrusted files with executeScriptNodes=False)",
               max_items=mx))
    # file paths
    root = R["project_root"] or cmds.workspace(q=True, rootDirectory=True)
    have = set(cmds.allNodeTypes() or [])
    paths = []
    for t, a in PATH_ATTRS:
        if t not in have:
            continue
        for n in cmds.ls(type=t) or []:
            if not cmds.attributeQuery(a, node=n, exists=True):
                continue
            v = cmds.getAttr(n + "." + a)
            if not v:
                continue
            full = _expand(v, root)
            ok = _exists_pattern(full)
            outside = os.path.isabs(v) and root and not os.path.abspath(v).startswith(os.path.abspath(root))
            if not ok or (outside and profile != "shot"):
                paths.append({"node": n, "attr": a, "path": v, "resolved": full, "exists": ok,
                              "absolute_outside_project": bool(outside)})
    missing = [p for p in paths if not p["exists"]]
    add(_check("file_paths", S["file_paths"] if missing else ("warn" if paths else S["file_paths"]), paths,
               "missing files (textures, caches, image planes, USD); absolute paths outside the project",
               max_items=mx, info={"project_root": root}))
    # cameras
    cams = []
    for c in cmds.ls(type="camera", long=True) or []:
        if not cmds.camera(c, q=True, startupCamera=True) and not _is_ref(cmds, c):
            cams.append(c)
    add(_check("cameras", S["cameras"], cams, "non-default cameras in an asset file travel into every scene "
               "that imports it", max_items=mx))
    if deep:
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            if here not in sys.path:
                sys.path.insert(0, here)
            import mx_audit
            prof = R.get("deep_profile") or {"model": "film", "rig": "film", "shot": "game"}[profile]
            deep_items = []
            for m in dict.fromkeys(cmds.listRelatives(s, parent=True, fullPath=True)[0] for s in meshes):
                r = mx_audit.audit(m)
                errs = [p for p in mx_audit.verdict(r, prof) if p.startswith("error")]
                if errs:
                    deep_items.append({"mesh": m, "problems": errs})
            add(_check("deep_audit", "fail", deep_items, "mx_audit verdict errors per mesh (%s profile)" % prof,
                       max_items=mx))
        except Exception as exc:
            add({"id": "deep_audit", "status": "warn", "count": 0, "items": [], "message": "deep audit failed: %s" % exc})
    return checks


def _summary(checks):
    s = {}
    for c in checks:
        s[c["status"]] = s.get(c["status"], 0) + 1
    return s


# --------------------------------------------------------------------------- fixes
def _chunk(cmds, name):
    class _C(object):
        def __enter__(self):
            cmds.undoInfo(openChunk=True, chunkName=name)

        def __exit__(self, *a):
            cmds.undoInfo(closeChunk=True)
            return False
    return _C()


def _safe_to_freeze(cmds, x):
    if _is_ref(cmds, x) or cmds.nodeType(x) != "transform":
        return False, "referenced or not a plain transform"
    for a in ("translate", "rotate", "scale", "shear") + tuple(c + ax for c in "trs" for ax in "xyz"):
        plug = "%s.%s" % (x, a)
        if not cmds.attributeQuery(a, node=x, exists=True):
            continue
        if cmds.getAttr(plug, lock=True):
            return False, "locked %s" % a
        if cmds.listConnections(plug, source=True, destination=False):
            return False, "%s is driven (animation or constraint)" % a
    below = [x] + (cmds.listRelatives(x, allDescendents=True, fullPath=True) or [])
    for n in below:
        t = cmds.nodeType(n)
        if t == "joint":
            return False, "joint below"
        if t == "mesh":
            if len(cmds.listRelatives(n, allParents=True) or []) > 1:
                return False, "instanced shape below"
            if cmds.ls(cmds.listHistory(n) or [], type="skinCluster"):
                return False, "skinned mesh below (unbind, freeze, rebind)"
    return True, ""


def apply_fixes(fixes, profile="model", roots=None, rules=None, handles=None):
    """Apply fix ids in order, each in its own undo chunk. Roots are held by UUID
    (root_handles) and found again after every fix, so a rename by one fix does not lose
    the scope of the next. Returns [{fix, done, skipped}]."""
    cmds = _cmds()
    import maya.mel as mel
    R = dict(DEFAULT_RULES)
    R.update(rules or {})
    if handles is None:
        handles = root_handles(roots)
    live, lost = live_roots(handles)
    xf, meshes = _scope(live)
    log = []
    for fx in fixes:
        done, skipped = [], []
        if handles is not None and not live:
            log.append({"fix": fx, "done": [], "skipped": ["no root left in scope (lost: %s)" % lost]})
            continue
        try:
            with _chunk(cmds, "mx_validate:%s" % fx):
                if fx in ("history", "history_deformed"):
                    for m in meshes:
                        if _is_ref(cmds, m):
                            continue
                        other, deformers = _mesh_history(cmds, m)
                        if not other:
                            continue
                        x = cmds.listRelatives(m, parent=True, fullPath=True)[0]
                        if not deformers:
                            cmds.delete(x, constructionHistory=True)
                            done.append(x)
                        elif fx == "history_deformed":
                            cmds.bakePartialHistory(x, prePostDeformers=True)
                            done.append(x)
                        else:
                            skipped.append("%s has deformers (use history_deformed)" % x)
                elif fx == "freeze":
                    excl = [re.compile(p) for p in R["freeze_exclude"]]
                    # top-down: freezing a group bakes its children too; children already
                    # frozen that way are skipped by the _xform_values test below
                    tops = sorted((x for x in xf if cmds.nodeType(x) == "transform"), key=lambda n: n.count("|"))
                    for x in tops:
                        if any(e.search(_leaf(x)) for e in excl):
                            continue
                        ok_vals, _ = _xform_values(cmds, x)
                        if ok_vals or not cmds.objExists(x):
                            continue
                        ok, why = _safe_to_freeze(cmds, x)
                        if not ok:
                            skipped.append("%s: %s" % (x, why))
                            continue
                        cmds.makeIdentity(x, apply=True, translate=True, rotate=True, scale=True,
                                          normal=0, preserveNormals=True)
                        done.append(x)
                elif fx == "unlock_normals":
                    for m in meshes:
                        if _is_ref(cmds, m) or not locked_normal_count(m):
                            continue
                        cmds.polyNormalPerVertex(m, unFreezeNormal=True)   # [verify] flag on 2027
                        done.append(m)
                elif fx == "smooth_preview":
                    for m in meshes:
                        if cmds.attributeQuery("displaySmoothMesh", node=m, exists=True) and \
                                cmds.getAttr(m + ".displaySmoothMesh") and not cmds.getAttr(m + ".displaySmoothMesh", lock=True):
                            cmds.setAttr(m + ".displaySmoothMesh", 0)
                            done.append(m)
                elif fx == "render_stats":
                    for m in meshes:
                        for a, v in RENDER_STATS.items():
                            p = m + "." + a
                            if cmds.attributeQuery(a, node=m, exists=True) and cmds.getAttr(p) != v and \
                                    not cmds.getAttr(p, lock=True) and not cmds.listConnections(p, s=True, d=False):
                                cmds.setAttr(p, v)
                                done.append(p)
                elif fx == "namespaces":
                    ref_ns = set()
                    for ref in cmds.ls(type="reference") or []:
                        try:
                            ref_ns.add(cmds.referenceQuery(ref, namespace=True).lstrip(":"))
                        except Exception:
                            pass
                    all_ns = [n.lstrip(":") for n in (cmds.namespaceInfo(":", listOnlyNamespaces=True, recurse=True,
                                                                         absoluteName=True) or [])]
                    for ns in sorted(all_ns, key=lambda n: -n.count(":")):     # deepest first
                        if ns in ("UI", "shared") or ns.split(":")[0] in ref_ns:
                            continue
                        members = cmds.namespaceInfo(":" + ns, listOnlyDependencyNodes=True, absoluteName=True) or []
                        clash = [n for n in members if cmds.objExists(":" + n.rsplit(":", 1)[-1])]
                        if clash:
                            skipped.append("%s: name clash for %s" % (ns, clash[:3]))
                            continue
                        cmds.namespace(removeNamespace=":" + ns, mergeNamespaceWithRoot=True)
                        done.append(ns)
                elif fx in ("unknown_dead", "unknown_all"):
                    dead = set(R["dead_plugins"])
                    for t in ("unknown", "unknownDag", "unknownTransform"):
                        for n in cmds.ls(type=t) or []:
                            plug = None
                            try:
                                plug = cmds.unknownNode(n, q=True, plugin=True)
                            except Exception:
                                pass
                            if fx == "unknown_all" or plug in dead:
                                if cmds.objExists(n):
                                    cmds.lockNode(n, lock=False)
                                    cmds.delete(n)
                                    done.append(n)
                            else:
                                skipped.append("%s (plug-in %s not in dead_plugins)" % (n, plug))
                    for p in cmds.unknownPlugin(q=True, list=True) or []:
                        if fx == "unknown_all" or p in dead:
                            try:
                                cmds.unknownPlugin(p, remove=True)
                                done.append("plugin requirement " + p)
                            except Exception as exc:
                                skipped.append("%s: %s" % (p, exc))
                elif fx == "unused_shading":
                    before = len(cmds.ls() or [])
                    mel.eval("MLdeleteUnused;")                  # Hypershade > Delete Unused Nodes [verify]
                    done.append("%d nodes removed" % (before - len(cmds.ls() or [])))
                elif fx == "empty_groups":
                    for x in sorted(xf, key=lambda n: -n.count("|")):
                        if cmds.objExists(x) and cmds.nodeType(x) == "transform" and not _is_ref(cmds, x) \
                                and not cmds.listRelatives(x, children=True):
                            cmds.delete(x)
                            done.append(x)
                else:
                    skipped.append("unknown fix id")
        except Exception as exc:
            skipped.append("failed: %s: %s" % (type(exc).__name__, exc))
        log.append({"fix": fx, "done": done, "skipped": skipped})
        live, lost = live_roots(handles)          # a fix may have renamed or removed a root
        xf, meshes = _scope(live) if (handles is None or live) else ([], [])
    return log


def validate(profile="model", roots=None, rules=None, fix=(), deep=False):
    """Run every check; with fix=[...] apply those fixes and check again.
    Returns {ok, profile, summary, checks, fixes, before_summary, roots, roots_after,
    roots_lost, seconds}. Roots are held by UUID across the fixes."""
    t0 = time.time()
    if profile not in SEV:
        raise ValueError("profile must be one of %s" % sorted(SEV))
    handles = root_handles(roots)
    before = run_checks(profile, roots, rules, deep)
    rep = {"profile": profile, "roots": roots, "rules": dict(DEFAULT_RULES, **(rules or {}))}
    if fix:
        rep["before_summary"] = _summary(before)
        rep["fixes"] = apply_fixes(list(fix), profile, roots, rules, handles=handles)
        live, lost = live_roots(handles)
        rep["roots_after"] = live
        if lost:
            rep["roots_lost"] = lost
        if handles is not None and not live:
            checks = [{"id": "roots", "status": "fail", "count": len(lost), "items": lost,
                       "message": "no root exists after the fixes: nothing left to validate"}]
        else:
            checks = run_checks(profile, live, rules, deep)
    else:
        rep["roots_after"] = live_roots(handles)[0]
        checks = before
    rep["checks"] = checks
    rep["summary"] = _summary(checks)
    rep["ok"] = not any(c["status"] == "fail" for c in checks)
    rep["seconds"] = round(time.time() - t0, 3)
    return rep


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="mx_validate")
    ap.add_argument("--profile", default="model", choices=sorted(SEV))
    ap.add_argument("--roots", default="")
    ap.add_argument("--fix", default="", help="comma list, or 'safe'")
    ap.add_argument("--rules", default="", help="JSON dict overriding DEFAULT_RULES")
    ap.add_argument("--deep", action="store_true")
    ap.add_argument("--json", default=None)
    a = ap.parse_args(argv)
    fixes = SAFE_FIXES if a.fix == "safe" else tuple(f for f in a.fix.split(",") if f)
    rep = validate(a.profile, [r for r in a.roots.split(",") if r] or None,
                   json.loads(a.rules) if a.rules else None, fixes, a.deep)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(rep, f, indent=1, default=str)
    return rep


if __name__ == "__main__":
    import maya.standalone
    maya.standalone.initialize(name="python")
    try:
        print(json.dumps(main(sys.argv[1:]), indent=1, default=str))
    finally:
        maya.standalone.uninitialize()
