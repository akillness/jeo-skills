"""
bx_audit: objective mesh checks an agent runs before calling a model done.

Works inside any Blender 5.x session (headless or GUI). Two ways to use it:

  # inside a running Blender (MCP bridge / Python console)
  import sys; sys.path.append("<skill>/scripts"); import bx_audit
  report = bx_audit.audit(bpy.data.objects["Head_retopo"])
  report = bx_audit.audit(low, high=bpy.data.objects["Head_sculpt"])  # adds fidelity

  # headless
  blender --background scene.blend --python bx_audit.py -- --object Head_retopo \
          [--high Head_sculpt] [--json out.json]

What the numbers mean. Reference values measured with this script on Blender Studio's
own production retopology (CC-BY retopo_examples.blend, Julien Kaspar): Rex head 3,890
faces, 99.9% quads, 38 e3 + 31 e5 poles, 3 valence-6; Snow body 9,402 faces, 99.96%
quads, 250 e3 + 258 e5; Rain body 16,526 faces, 99.98% quads, 241 e3 + 247 e5, 2 v6.
  quads_pct          deforming character mesh: studio work sits at 99.9+; below 98 = look why
  ngons              0 on anything that gets subdivided, deformed or exported to a game engine
  poles_e3 / poles_e5plus   valence-3 / valence-5+ interior vertices; fine in flat,
                     non-deforming areas, never on lip/lid rims or inside a fold
  valence_6plus      almost always a mistake (pinching, shading artifacts)
  non_manifold_edges / loose_verts / loose_edges    0 unless intentional
  boundary_loops     list of open borders (eye holes, neck cut); unexpected ones = holes
  zero_area_faces, duplicate_verts                 0
  flipped_faces      faces whose normal disagrees with neighbours (inconsistent winding)
  self_intersections face pairs that cross each other (ignores neighbours)
  edge_len_cv        coefficient of variation of edge length. NOT a quality score: studio
                     character retopo measures 0.6 to 0.8 because density is deliberately
                     higher around eyes, mouth and joints. Uniform remeshes read ~0.2 to 0.35.
                     Use it to tell an auto-remesh (low) from a hand-planned layout (high).
  pole density       (poles_e3 + poles_e5plus) / faces: ~2% on a studio head, ~5% on a body
  symmetry_pct       share of vertices with an X-mirror partner (characters: ~100)
  fidelity_*         distance from low-poly verts to the high-poly surface, in scene units
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import json
import math
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def _bm_from(obj, evaluated=False):
    bm = bmesh.new()
    if evaluated:
        dg = bpy.context.evaluated_depsgraph_get()
        eo = obj.evaluated_get(dg)
        me = eo.to_mesh()
        bm.from_mesh(me)
        eo.to_mesh_clear()
    else:
        bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    return bm


def _boundary_loops(bm):
    edges = {e for e in bm.edges if e.is_boundary}
    loops = []
    while edges:
        start = edges.pop()
        count, stack = 1, [start]
        while stack:
            e = stack.pop()
            for v in e.verts:
                for n in v.link_edges:
                    if n in edges:
                        edges.remove(n)
                        stack.append(n)
                        count += 1
        loops.append(count)
    return sorted(loops, reverse=True)


def _flipped(bm):
    bad = 0
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        f1, f2 = e.link_faces
        # consistent winding: the shared edge runs in opposite directions in the two faces
        l1 = next(l for l in e.link_loops if l.face == f1)
        l2 = next(l for l in e.link_loops if l.face == f2)
        if l1.vert == l2.vert:
            bad += 1
    return bad


def _winding(bm, step):
    """Edges whose two faces run them the same way, and those of their faces that point
    into the part: a ray along the normal meets the back of another face. The rest are
    folds at a seam. On open geometry the ray can escape, so a fold may still leave a
    hairline gap under back-face culling. Returns (edges, inward faces)."""
    mixed, suspects = 0, set()
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        l1, l2 = e.link_loops[0], e.link_loops[1]
        if l1.vert == l2.vert:
            mixed += 1
            suspects.update(e.link_faces)
    if not suspects:
        return 0, []
    bm.faces.index_update()
    tree = BVHTree.FromBMesh(bm)
    inward = []
    for f in suspects:
        n = f.normal
        near = {g.index for v in f.verts for g in v.link_faces}
        origin = f.calc_center_median() + n * step
        for _ in range(8):  # step past the face's own neighbours, a fold's partner included
            loc, hit_n, idx, _d = tree.ray_cast(origin, n)
            if loc is None:
                break
            if idx not in near:
                if hit_n.dot(n) > 0:
                    inward.append(f)
                break
            origin = loc + n * step
    return mixed, inward


def _self_intersections(bm, limit=200000):
    if len(bm.faces) > limit:
        return None  # too heavy, skip on dense sculpts
    tree = BVHTree.FromBMesh(bm)
    pairs = tree.overlap(tree)
    faces = bm.faces
    n = 0
    for a, b in pairs:
        if a >= b:
            continue
        va = {v.index for v in faces[a].verts}
        if va & {v.index for v in faces[b].verts}:
            continue
        n += 1
    return n


def _symmetry(bm, axis=0, tol=None):
    co = [v.co for v in bm.verts]
    if not co:
        return 0.0
    size = max((max(c[i] for c in co) - min(c[i] for c in co)) for i in range(3)) or 1.0
    tol = tol or size * 1e-3
    from mathutils.kdtree import KDTree
    kd = KDTree(len(co))
    for i, c in enumerate(co):
        kd.insert(c, i)
    kd.balance()
    hit = 0
    for c in co:
        m = c.copy()
        m[axis] = -m[axis]
        _, _, d = kd.find(m)
        if d is not None and d <= tol:
            hit += 1
    return 100.0 * hit / len(co)


def audit(obj, high=None, evaluated=False, symmetry_axis=0, max_listed=25):
    """Return a dict of topology/geometry metrics for a mesh object (world space)."""
    bm = _bm_from(obj, evaluated)
    faces = bm.faces
    tris = sum(1 for f in faces if len(f.verts) == 3)
    quads = sum(1 for f in faces if len(f.verts) == 4)
    ngons = [f.index for f in faces if len(f.verts) > 4]
    val = {}
    poles3, poles5 = [], []
    for v in bm.verts:
        if v.is_boundary or not v.link_faces:
            continue
        k = len(v.link_edges)
        val[k] = val.get(k, 0) + 1
        if k == 3:
            poles3.append(v)
        elif k >= 5:
            poles5.append(v)
    lengths = [e.calc_length() for e in bm.edges]
    mean_len = sum(lengths) / len(lengths) if lengths else 0.0
    cv = (math.sqrt(sum((l - mean_len) ** 2 for l in lengths) / len(lengths)) / mean_len) if mean_len else 0.0
    dup = 0
    if bm.verts:
        from mathutils.kdtree import KDTree
        kd = KDTree(len(bm.verts))
        for v in bm.verts:
            kd.insert(v.co, v.index)
        kd.balance()
        eps = max(mean_len * 1e-3, 1e-6)
        for v in bm.verts:
            if len(kd.find_range(v.co, eps)) > 1:
                dup += 1
    r = {
        "object": obj.name,
        "verts": len(bm.verts), "edges": len(bm.edges), "faces": len(faces),
        "tris_equivalent": sum(len(f.verts) - 2 for f in faces),
        "tris": tris, "quads": quads, "ngons": len(ngons),
        "quads_pct": round(100.0 * quads / len(faces), 2) if faces else 0.0,
        "valence_hist_interior": dict(sorted(val.items())),
        "poles_e3": len(poles3), "poles_e5plus": len(poles5),
        "valence_6plus": sum(c for k, c in val.items() if k >= 6),
        "non_manifold_edges": sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary),
        "boundary_loops": _boundary_loops(bm),
        "loose_verts": sum(1 for v in bm.verts if not v.link_edges),
        "loose_edges": sum(1 for e in bm.edges if not e.link_faces),
        "zero_area_faces": sum(1 for f in faces if f.calc_area() < 1e-12),
        "duplicate_verts": dup,
        "flipped_faces": _flipped(bm),
        "self_intersections": _self_intersections(bm),
        "edge_len_mean": round(mean_len, 6), "edge_len_cv": round(cv, 3),
        "symmetry_pct": round(_symmetry(bm, symmetry_axis), 2),
        "dimensions": [round(d, 4) for d in obj.dimensions],
        "ngon_faces_sample": ngons[:max_listed],
        "pole_e5_sample": [[round(c, 4) for c in v.co] for v in poles5[:max_listed]],
        "pole_e3_sample": [[round(c, 4) for c in v.co] for v in poles3[:max_listed]],
    }
    if high is not None:
        r.update(fidelity(bm, high))
    bm.free()
    return r


def fidelity(low_bm_or_obj, high):
    """Distance from each low-poly vertex to the high-poly surface (world space)."""
    own = not isinstance(low_bm_or_obj, bmesh.types.BMesh)
    bm = _bm_from(low_bm_or_obj) if own else low_bm_or_obj
    hb = _bm_from(high, evaluated=True)
    tree = BVHTree.FromBMesh(hb)
    d = []
    for v in bm.verts:
        hit = tree.find_nearest(v.co)
        if hit[0] is not None:
            d.append(hit[3])
    hb.free()
    if own:
        bm.free()
    d.sort()
    if not d:
        return {"fidelity_mean": None}
    size = max(high.dimensions) or 1.0
    return {
        "fidelity_mean": round(sum(d) / len(d), 6),
        "fidelity_p95": round(d[int(0.95 * (len(d) - 1))], 6),
        "fidelity_max": round(d[-1], 6),
        "fidelity_max_pct_of_size": round(100.0 * d[-1] / size, 3),
    }


def verdict(r, deforming=True):
    """Short list of human-readable problems, empty when the mesh is clean."""
    out = []
    if r["ngons"]:
        out.append(f"{r['ngons']} n-gons")
    if deforming and r["quads_pct"] < 95:
        out.append(f"only {r['quads_pct']}% quads")
    if r["valence_6plus"]:
        out.append(f"{r['valence_6plus']} vertices with 6+ edges")
    for k in ("non_manifold_edges", "loose_verts", "loose_edges", "zero_area_faces",
              "duplicate_verts", "flipped_faces"):
        if r[k]:
            out.append(f"{r[k]} {k.replace('_', ' ')}")
    if r.get("self_intersections"):
        out.append(f"{r['self_intersections']} self-intersecting face pairs")
    if r.get("fidelity_max_pct_of_size", 0) > 1.0:
        out.append(f"max deviation from high poly {r['fidelity_max_pct_of_size']}% of size")
    return out


# --- Delivery gate: is the asset safe to export or hand off? ---------------------------
# audit() grades topology; deliverable() grades what an engine, renderer or slicer receives:
# parts that hover, coplanar faces that z-fight, closed parts turned inside out, scale left
# on the object. Severity per target profile: "error" fails the gate, "warn" is reported.
PROFILES = ("game", "render", "print", "roblox")
GATE = {  # check:        game     render   print    roblox
    "no_faces":         ("error", "error", "error", "error"),
    "negative_scale":   ("error", "error", "error", "error"),
    "unapplied_scale":  ("error", "warn",  "warn",  "error"),
    "inside_out":       ("error", "error", "error", "error"),
    "winding":          ("error", "warn",  "error", "error"),
    "winding_sliver":   ("warn",  None,    "error", "warn"),
    "fold":             ("warn",  None,    "warn",  "warn"),
    "double_faces":     ("error", "warn",  "error", "error"),
    "z_fighting":       ("error", "error", "warn",  "error"),
    "back_to_back":     ("warn",  None,    "warn",  "warn"),
    "floating":         ("error", "error", "error", "error"),
    "gap":              ("warn",  "warn",  "error", "warn"),
    "enclosed":         ("warn",  None,    "warn",  "warn"),
    "open_boundary":    (None,    None,    "error", "error"),
    "non_manifold":     ("warn",  None,    "error", "error"),
    "loose":            ("warn",  "warn",  "error", "error"),
    "zero_area":        ("warn",  None,    "warn",  "warn"),
    "ngons":            ("warn",  None,    None,    "error"),
    "no_uv":            ("error", "warn",  None,    "error"),
    "no_uv_flat":       ("warn",  None,    None,    "warn"),
    "material_slots":   ("warn",  "warn",  None,    "warn"),
    "tri_budget":       (None,    None,    None,    "error"),
    "origin":           ("warn",  None,    None,    "warn"),
}
ROBLOX_MAX_TRIS = 20000  # per mesh, Roblox Creator Hub mesh specifications (checked 2026-10-18)
MAX_PARTS = 5000  # beyond this the floating and enclosed checks are skipped, with a warning


def _n(k, noun):
    return f"{k} {noun}" if k == 1 else f"{k} {noun}s"


def _welded(obj, evaluated, weld):
    """World-space bmesh welded at `weld`, so UV-seam splits (every glTF import) do not
    read as holes or separate parts. Faces and exact double faces are counted before the weld."""
    bm = _bm_from(obj, evaluated)
    faces = len(bm.faces)
    seen, double, b2b = {}, 0, 0
    for f in bm.faces:
        key = frozenset(tuple(round(c / weld) for c in v.co) for v in f.verts)
        if len(key) < 3:
            continue
        if key not in seen:
            seen[key] = f.normal.copy()
        elif f.normal.dot(seen[key]) > 0:
            double += 1
        else:
            b2b += 1
    zero = sum(1 for f in bm.faces if f.calc_area() < weld * weld)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=weld)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    return bm, faces, double, b2b, zero


def _islands(bm, flip):
    """Connected parts of a welded bmesh, each with its BVH, closed flag and signed volume."""
    out, done = [], set()
    for f0 in bm.faces:
        if f0.index in done:
            continue
        done.add(f0.index)
        stack, faces = [f0], []
        while stack:
            f = stack.pop()
            faces.append(f)
            for v in f.verts:
                for g in v.link_faces:
                    if g.index not in done:
                        done.add(g.index)
                        stack.append(g)
        local, coords, polys, edges = {}, [], [], set()
        closed, vol, area = True, 0.0, 0.0
        for f in faces:
            ids = []
            for v in f.verts:
                if v.index not in local:
                    local[v.index] = len(coords)
                    coords.append(v.co.copy())
                ids.append(local[v.index])
            polys.append(ids)
            edges.update((min(a, b), max(a, b)) for a, b in zip(ids, ids[1:] + ids[:1]))
            closed = closed and all(len(e.link_faces) == 2 for e in f.edges)
            co = [v.co for v in f.verts]
            vol += sum(co[0].dot(co[i].cross(co[i + 1])) for i in range(1, len(co) - 1)) / 6.0
            area += f.calc_area()
        out.append({
            "coords": coords, "polys": polys, "edges": sorted(edges), "closed": closed, "volume": vol * flip,
            "area": area, "faces": len(faces),
            "centers": [f.calc_center_median() for f in faces],
            "normals": [f.normal.copy() for f in faces],
            "lo": [min(c[k] for c in coords) for k in range(3)],
            "hi": [max(c[k] for c in coords) for k in range(3)],
            "tree": BVHTree.FromPolygons(coords, polys),
        })
    return out


def _clip(p, q, lo, hi):
    """Parameter range (t0, t1) of segment p-q inside the box lo-hi, or None (Liang-Barsky)."""
    t0, t1 = 0.0, 1.0
    for k in range(3):
        d = q[k] - p[k]
        if abs(d) < 1e-12:
            if p[k] < lo[k] or p[k] > hi[k]:
                return None
            continue
        ta, tb = (lo[k] - p[k]) / d, (hi[k] - p[k]) / d
        if ta > tb:
            ta, tb = tb, ta
        t0, t1 = max(t0, ta), min(t1, tb)
        if t0 > t1:
            return None
    return t0, t1


def _edge_samples(x, lo, hi):
    """Points along the edges of part x, clipped to the box lo-hi: the ends and middle of each clipped piece."""
    co = x["coords"]
    for i, j in x["edges"]:
        p, q = co[i], co[j]
        if any(min(p[k], q[k]) > hi[k] or max(p[k], q[k]) < lo[k] for k in range(3)):
            continue
        t = _clip(p, q, lo, hi)
        if t is not None:
            for s in (t[0], (t[0] + t[1]) / 2, t[1]):
                yield p.lerp(q, s)


def _attached(a, b, tol):
    """True when parts a and b intersect or come within tol of each other. Where two parts cross face
    to face (a rail across a post) no vertex lies near the other part, and a hairline gap hides the
    contact from the overlap test, so points along each part's edges inside the overlap of the two
    bounding boxes are tested too."""
    if a["tree"].overlap(b["tree"]):
        return True
    for x, y in ((a, b), (b, a)):
        if any(y["tree"].find_nearest(c, tol)[0] is not None for c in x["coords"]):
            return True
    lo = [max(a["lo"][k], b["lo"][k]) - tol for k in range(3)]
    hi = [min(a["hi"][k], b["hi"][k]) + tol for k in range(3)]
    for x, y in ((a, b), (b, a)):
        if any(y["tree"].find_nearest(c, tol)[0] is not None for c in _edge_samples(x, lo, hi)):
            return True
    return False


def _winding_number(b, pts):
    """Winding numbers of closed part b about the points: +-1 inside, 0 outside (the solid angles of its
    triangles, Van Oosterom and Strackee, summed)."""
    if "tris" not in b:
        co = np.array([tuple(c) for c in b["coords"]], float)
        b["tris"] = co[np.array([(p[0], p[i], p[i + 1]) for p in b["polys"] for i in range(1, len(p) - 1)], int)]
    out = []
    for c in pts:
        A, B, C = (b["tris"][:, k] - np.array(tuple(c)) for k in range(3))
        la, lb, lc = (np.linalg.norm(X, axis=1) for X in (A, B, C))
        num = np.einsum("ij,ij->i", A, np.cross(B, C))
        den = (la * lb * lc + np.einsum("ij,ij->i", A, B) * lc + np.einsum("ij,ij->i", A, C) * lb
               + np.einsum("ij,ij->i", B, C) * la)
        out.append(float(np.arctan2(num, den).sum()) / (2 * math.pi))
    return out


def _inside(a, b):
    """True when sampled vertices of part a all lie inside closed part b. Behind b's nearest face is the quick
    test; past the rim of a thin shell the nearest point is an edge or corner, whose face can look away from a
    point far outside, so b's winding number about the samples decides."""
    if not b["closed"] or b["volume"] <= 0:
        return False
    pts = a["coords"][::max(1, len(a["coords"]) // 64)]
    for c in pts:
        loc, normal, _, _ = b["tree"].find_nearest(c)
        if loc is None or (c - loc).dot(normal) >= 0:
            return False
    return all(abs(w) > 0.5 for w in _winding_number(b, pts))


def _scale_owner(o):
    """The engine receives the world scale. When the object's own scale is 1, it is the
    nearest parent that carries one, and applying scale on the object cannot clear it."""
    def unit(ob):
        return ob.matrix_basis.determinant() > 0 and all(abs(s - 1.0) <= 1e-3 for s in ob.matrix_basis.to_scale())
    src = o
    while unit(src) and src.parent:
        src = src.parent
    return o if unit(src) else src


def _samples_image(tree, seen=None):
    """True when a node tree, or a node group nested in it, holds an Image Texture node."""
    seen = seen if seen is not None else set()
    if tree is None or tree.as_pointer() in seen:
        return False
    seen.add(tree.as_pointer())
    return any(nd.type == "TEX_IMAGE" or (nd.type == "GROUP" and _samples_image(nd.node_tree, seen))
               for nd in tree.nodes)


def deliverable(objs, profile="game", eps=None, tol=None, gap=None, evaluated=True, ground=None):
    """Gate the parts of ONE asset before export or handoff.

    objs: the mesh objects (or names) that make up the asset. Gate separate props one by
    one: every prop but the largest would read as floating.
    eps: coplanar distance for z-fighting. tol: two parts closer than this touch. gap: a
    part farther than this from the rest floats (an error); between tol and gap it is a
    warning, an error for print. Defaults: 0.01%, 0.2% and 1% of the bounding diagonal.
    evaluated: check the mesh with modifiers applied, as exporters write it by default.
    ground: height of the floor the asset stands on (e.g. 0.0), off by default. Parts that
    span it (lowest point at or below ground + tol, highest at or above ground - tol) stand on
    it together, so separate pieces each on the floor (bike-rack hoops, a scatter of stones) do
    not float, and the group on the floor is the asset: a part not connected to it floats,
    however large. When no part spans it, a warning says so and the largest group is the asset.
    Returns {"pass", "errors", "warnings", "per_object", "profile", "eps", "tol", "gap",
    "skipped"}.
    """
    if profile not in PROFILES:
        raise ValueError(f"profile must be one of {PROFILES}")
    col = PROFILES.index(profile)
    objs = [bpy.data.objects[o] if isinstance(o, str) else o for o in objs]
    meshes = [o for o in objs if o.type == "MESH"]
    if not meshes:
        raise ValueError("no mesh objects to gate")
    bpy.context.view_layer.update()
    box = {o.name: [o.matrix_world @ Vector(c) for c in o.bound_box] for o in meshes}
    every = [c for cs in box.values() for c in cs]
    diag = (Vector([max(c[k] for c in every) for k in range(3)])
            - Vector([min(c[k] for c in every) for k in range(3)])).length or 1.0
    eps = eps or diag * 1e-4
    tol = tol or diag * 2e-3
    gap = gap or diag * 1e-2
    weld = diag * 1e-6
    out = {"profile": profile, "eps": round(eps, 6), "tol": round(tol, 6), "gap": round(gap, 6), "pass": True,
           "errors": [], "warnings": [], "per_object": {},
           "skipped": [o.name for o in objs if o.type != "MESH"]}

    def flag(check, names, text):
        level = GATE[check][col]
        if level is None:
            return
        key = "errors" if level == "error" else "warnings"
        out[key].append(text)
        for n in names:
            out["per_object"][n][key].append(text)

    parts, owner = [], []  # island infos and the object name of each
    for o in meshes:
        n = o.name
        out["per_object"][n] = {"tris": 0, "parts": 0, "errors": [], "warnings": []}
        bm, faces, double, b2b, zero = _welded(o, evaluated, weld)
        if not faces:
            flag("no_faces", [n], f"{n}: no faces{' after modifiers' if evaluated else ''}; nothing would export")
            bm.free()
            continue
        det = o.matrix_world.determinant()
        scale = o.matrix_world.to_scale()
        src = _scale_owner(o)
        where = "" if src is o else f" from its parent {src.name}; apply it on {src.name} and its children"
        if det < 0:
            flag("negative_scale", [n], f"{n}: negative scale (mirrored){where or '; apply it'}, "
                                        "then recalculate normals")
        elif any(abs(s - 1.0) > 1e-3 for s in scale):
            flag("unapplied_scale", [n], f"{n}: unapplied scale {[round(s, 3) for s in scale]}{where}")
        isl =_islands(bm, 1.0 if det >= 0 else -1.0)
        tris = sum(len(f.verts) - 2 for f in bm.faces)
        out["per_object"][n].update(tris=tris, parts=len(isl))
        if double:
            flag("double_faces", [n], f"{n}: {_n(double, 'duplicate face')}")
        if b2b:
            flag("double_faces", [n], f"{n}: {_n(b2b, 'back-to-back face')} on the same vertices")
        mixed, inward = _winding(bm, eps)
        if inward:
            # engines cull these faces: past 0.1% of the surface the hole shows at a glance
            share = sum(f.calc_area() for f in inward) / max(sum(f.calc_area() for f in bm.faces), 1e-12)
            out["per_object"][n]["inward_faces_at"] = [[round(c, 4) for c in f.calc_center_median()]
                                                       for f in inward[:10]]
            what = f"{n}: {_n(len(inward), 'face')} pointing into the part ({share:.2%} of its surface)"
            if share >= 1e-3:
                flag("winding", [n], f"{what}, at edges of opposite winding")
            else:
                flag("winding_sliver", [n], f"{what}: engines cull them, leaving sliver holes")
        elif mixed:
            flag("fold", [n], f"{n}: {_n(mixed, 'edge')} of opposite winding where faces fold over at a seam; "
                                  "look at it with back-face culling")
        if not inward:
            inv = sum(1 for p in isl if p["closed"] and p["volume"] < -(diag ** 3) * 1e-9)
            if inv:
                flag("inside_out", [n], f"{n}: {_n(inv, 'closed part')} with normals pointing inward")
        holes = _boundary_loops(bm)
        if holes:
            flag("open_boundary", [n], f"{n}: {_n(len(holes), 'open border')} ({_n(sum(holes), 'edge')})")
        nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
        if nm:
            flag("non_manifold", [n], f"{n}: {_n(nm, 'edge')} shared by 3 or more faces")
        loose = sum(1 for v in bm.verts if not v.link_edges) + sum(1 for e in bm.edges if not e.link_faces)
        if loose:
            flag("loose", [n], f"{n}: {loose} loose vertices or edges")
        if zero:
            flag("zero_area", [n], f"{n}: {_n(zero, 'zero-area face')}")
        ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
        if ngons:
            flag("ngons", [n], f"{n}: {_n(ngons, 'n-gon')}")
        if profile == "roblox" and tris > ROBLOX_MAX_TRIS:
            flag("tri_budget", [n], f"{n}: {tris} triangles, over the {ROBLOX_MAX_TRIS} per-mesh limit")
        # UVs and materials as exported: modifiers (Geometry Nodes, UV Project) can add them.
        mats = ([s.material for s in o.evaluated_get(bpy.context.evaluated_depsgraph_get()).material_slots]
                if evaluated else [s.material for s in o.material_slots])
        if not bm.loops.layers.uv:
            textured = any(m and _samples_image(m.node_tree) for m in mats)
            if textured:
                flag("no_uv", [n], f"{n}: no UV map, and a material samples an image texture")
            else:
                flag("no_uv_flat", [n], f"{n}: no UV map (fine for flat colors; textures and lightmaps need one)")
        if not mats or None in mats:
            flag("material_slots", [n], f"{n}: no material or an empty material slot")
        lo = Vector([min(c[k] for c in box[n]) for k in range(3)])
        hi = Vector([max(c[k] for c in box[n]) for k in range(3)])
        pad = (hi - lo).length * 0.05
        org = o.matrix_world.translation
        # Parts of a multi-part asset usually share the asset's pivot, so only a lone mesh is checked.
        if len(meshes) == 1 and any(org[k] < lo[k] - pad or org[k] > hi[k] + pad for k in range(3)):
            flag("origin", [n], f"{n}: origin outside the mesh bounds")
        bm.free()
        parts += isl
        owner += [n] * len(isl)

    # Coplanar overlaps between different parts: same facing z-fights, opposite is back-to-back.
    coords, polys, face_part = [], [], []
    for i, p in enumerate(parts):
        polys += [[k + len(coords) for k in poly] for poly in p["polys"]]
        coords += p["coords"]
        face_part += [i] * p["faces"]
    tree = BVHTree.FromPolygons(coords, polys)
    hits = {}
    for i, p in enumerate(parts):
        for c, nrm in zip(p["centers"], p["normals"]):
            for loc, hn, idx, _ in tree.find_nearest_range(c, eps):
                j = face_part[idx]
                d = nrm.dot(hn)
                off = c - loc
                # the center must project inside the other face, not graze its edge
                if j != i and abs(d) > 0.999 and (off - off.dot(hn) * hn).length < eps * 0.01:
                    key = (min(owner[i], owner[j]), max(owner[i], owner[j]), d > 0)
                    hits[key] = hits.get(key, 0) + 1
    for (a, b, same), k in sorted(hits.items()):
        where = f"{a}, between its own parts" if a == b else f"{a} <-> {b}"
        if same:
            flag("z_fighting", {a, b}, f"{where}: {_n(k, 'coplanar overlapping face')} (z-fighting)")
        else:
            flag("back_to_back", {a, b}, f"{where}: {_n(k, 'back-to-back touching face')}")

    # Floating and enclosed parts: union every pair that touches, and every part on the ground;
    # the component on the ground, else the one with the most surface, is the asset, every
    # other component floats.
    standing = [] if ground is None else [i for i, p in enumerate(parts)
                                          if p["lo"][2] <= ground + tol and p["hi"][2] >= ground - tol]
    if ground is not None and parts and not standing:
        out["warnings"].append(f"no part reaches the ground at z = {ground}")
    if len(parts) > MAX_PARTS:
        out["warnings"].append(f"{len(parts)} parts: floating and enclosed checks skipped")
    elif len(parts) > 1:
        root = list(range(len(parts)))

        def find(i):
            while root[i] != i:
                root[i] = root[root[i]]
                i = root[i]
            return i

        enclosed = set()
        order = sorted(range(len(parts)), key=lambda i: parts[i]["lo"][0])
        for n_i, i in enumerate(order):
            a = parts[i]
            for j in order[n_i + 1:]:
                b = parts[j]
                if b["lo"][0] > a["hi"][0] + tol:
                    break
                if any(b["lo"][k] > a["hi"][k] + tol or a["lo"][k] > b["hi"][k] + tol for k in (1, 2)):
                    continue
                if find(i) == find(j):
                    continue
                if _attached(a, b, tol):
                    root[find(i)] = find(j)
                elif _inside(a, b) or _inside(b, a):
                    enclosed.add(i if _inside(a, b) else j)
                    root[find(i)] = find(j)
        for i in standing[1:]:
            root[find(i)] = find(standing[0])
        groups = {}
        for i in range(len(parts)):
            groups.setdefault(find(i), []).append(i)
        main = (groups[find(standing[0])] if standing
                else max(groups.values(), key=lambda g: sum(parts[i]["area"] for i in g)))
        coords, polys, poly_part = [], [], []
        for i in main:
            polys += [[k + len(coords) for k in poly] for poly in parts[i]["polys"]]
            poly_part += [i] * len(parts[i]["polys"])
            coords += parts[i]["coords"]
        body = BVHTree.FromPolygons(coords, polys)
        dist = {}  # part index -> its component's distance to the main component
        near = {}  # part index -> the main component's part nearest to its component
        for g in groups.values():
            if g is main:
                continue
            hit = min((body.find_nearest(c) for i in g
                       for c in parts[i]["coords"][::max(1, len(parts[i]["coords"]) // 64)]),
                      key=lambda h: h[3])
            dist.update((i, hit[3]) for i in g)
            near.update((i, poly_part[hit[2]]) for i in g)
        for n in out["per_object"]:
            for check, far in (("floating", True), ("gap", False)):
                mine = [i for i, d in dist.items() if owner[i] == n and (d > gap) == far]
                if not mine:
                    continue
                closest = min(mine, key=dist.get)
                d = dist[closest]
                if len(mine) == owner.count(n):
                    what = "floating" if far else "not touching"
                    flag(check, [n], f"{n}: {what}, {d:.3g} from {owner[near[closest]]}")
                else:
                    pct = 100.0 * sum(parts[i]["faces"] for i in mine) / sum(
                        parts[i]["faces"] for i in range(len(parts)) if owner[i] == n)
                    what = "floating fragment" if far else "detached fragment"
                    flag(check, [n], f"{n}: {_n(len(mine), what)} ({pct:.2g}% of its faces), nearest {d:.3g} from the rest")
        for n in out["per_object"]:
            k = sum(1 for i in enclosed if owner[i] == n)
            if k:
                flag("enclosed", [n], f"{n}: {_n(k, 'part')} enclosed inside another part (hidden geometry)")
    out["pass"] = not out["errors"]
    return out


IMPORTERS = {
    "glb": "import_scene.gltf", "gltf": "import_scene.gltf", "fbx": "import_scene.fbx",
    "obj": "wm.obj_import", "stl": "wm.stl_import", "ply": "wm.ply_import",
    "usd": "wm.usd_import", "usda": "wm.usd_import", "usdc": "wm.usd_import", "usdz": "wm.usd_import",
}


def _import(path):
    """Load a file into an empty scene, so only its own meshes are gated."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    module, name = IMPORTERS[path.lower().rsplit(".", 1)[-1]].split(".")
    getattr(getattr(bpy.ops, module), name)(filepath=path)


def _cli():
    import argparse
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="bx_audit.py")
    ap.add_argument("--object", help="audit one mesh")
    ap.add_argument("--high", help="high poly for the fidelity numbers")
    ap.add_argument("--deliverable", action="store_true", help="run the delivery gate")
    ap.add_argument("--objects", nargs="+", help="parts of the asset (default: every visible mesh)")
    ap.add_argument("--import", dest="source", help="gate this file alone (glb, fbx, obj, usd, stl, ply)")
    ap.add_argument("--profile", default="game", choices=PROFILES)
    ap.add_argument("--ground", type=float, help="floor height the parts stand on")
    ap.add_argument("--json", help="also write the report here")
    a = ap.parse_args(argv)
    if a.deliverable:
        if a.source:
            _import(a.source)
        objs = a.objects or [o.name for o in bpy.context.scene.objects if o.type == "MESH" and o.visible_get()]
        r = deliverable(objs, profile=a.profile, ground=a.ground)
    else:
        r = audit(bpy.data.objects[a.object], high=bpy.data.objects[a.high] if a.high else None)
        r["problems"] = verdict(r)
    text = json.dumps(r, indent=1)
    if a.json:
        with open(a.json, "w") as f:
            f.write(text)
    print(text)
    if a.deliverable:
        print("DELIVERABLE", "PASS" if r["pass"] else "FAIL")
        sys.exit(0 if r["pass"] else 2)

if __name__ == "__main__":
    _cli()
