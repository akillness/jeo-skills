"""
mx_modeling: builders and checks a modeler needs that the shared scenario-maya-expert toolkit lacks
(Maya 2027). Use it WITH mx_audit, mx_validate, mx_review and mx_run, never instead of them.

STATUS: not yet run in Maya (written 2026-09-24, Maya 2027 not installed). The pure-Python
layer ran offline with python3 (tests/code/maya-modeling/test_mm_offline.py). Every function
that touches maya.cmds or OpenMaya is unverified; the mx_run jobs in tests/code/maya-modeling/
exercise each one and record the flags marked [verify].

  import sys
  sys.path[:0] = ["<skills>/scenario-maya-modeling/scripts", "<skills>/scenario-maya-expert/scripts"]
  import mx_modeling as MM

  MM.balance("crate_geo")                 # adjacent face-area ratio (Mario Elementza: never double)
  MM.coincident_vertices("crate_geo")     # V-snapped but unmerged points, stacked shells
  MM.split_report("crate_geo")            # hard edges vs UV seams, estimated engine vertex count
  MM.set_hard_by_angle("crate_geo", 45)   # Polycount: hard where the surface bends > ~45 degrees
  MM.weighted_normals("crate_geo")        # area-weighted normals per smoothing fan (static meshes)
  MM.extrude(faces, offset_cm=0.3)        # refuses the empty extrude (double faces)
  MM.bevel(edges, width_cm=0.4, segments=2, method="smart" | "legacy")   # census before/after
  MM.crease(edges, 2.0, method="sets", set_name="lid_2");  MM.crease_report("cage_geo", render_levels=2)
  MM.subdiv_setup("cage_geo", 2, where="arnold" | "preview");  MM.smooth_copy("cage_geo", 2)
  MM.mirror_merge("body_geo", "x", threshold_cm=0.001)
  MM.build_quad_cylinder("bolt_geo", 1.0, 0.6, sides=24)   # quad cap, no triangle fan
  MM.cylinder_sides_for([0, 45, 90])      # side count whose edges line up with a cut
  MM.cage_report("cage_geo")              # hard edges 0, triangles flat vs curved, 6+ poles, fan caps
  MM.cleanup_technical("crate_geo")       # Cleanup for lamina / non-manifold / zero-length only, never n-gons
  MM.inverted_shells("crate_geo")         # closed shells inside out (two-sided lighting hides them)
  rec = MM.component_record("cage.e[4:9]");  MM.carry_components(rec, "low")   # refuses after a topology edit
  MM.triangulated_copy("low", toward="high")   # non-planar quads split on the diagonal nearer the high
  MM.flat_edges("cage_geo");  MM.deviation("low", "high")
  MM.shrink_wrap("low", "high");  MM.bend_test("arm_geo", [(0,150,0), (30,150,0), (55,150,0)])
  MM.highlight_review(["cage_geo"], "/abs/out/hl", subdiv=2)   # metal under stripes (Arnold)
  MM.handoff_report(["crate_GRP"], "/abs/out", to="retopology-uv", max_tris=None)

Headless, through mx_run (see main() for commands):
  python3 <skills>/scenario-maya-expert/scripts/mx_run.py --scene crate_v003.ma --plugins mtoa \
      <skills>/scenario-maya-modeling/scripts/mx_modeling.py -- handoff --roots crate_GRP --out /abs/out

Units: every *_cm argument and every returned distance is in centimeters (OpenMaya's internal
unit) whatever the scene's UI unit; values passed to cmds flags are converted to UI units here.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import hashlib
import json
import math
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERT = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-maya-expert", "scripts"))
if os.path.isdir(_EXPERT) and _EXPERT not in sys.path:
    sys.path.append(_EXPERT)


# =========================================================================== pure layer
def percentile(vals, q):
    """q in 0..100 over an already sorted list (nearest rank)."""
    if not vals:
        return None
    k = min(len(vals) - 1, max(0, int(round(q / 100.0 * (len(vals) - 1)))))
    return vals[k]


def faces_from(counts, connects):
    out, i = [], 0
    for c in counts:
        out.append(list(connects[i:i + c]))
        i += c
    return out


def newell(pts):
    """(unit normal, area) of a planar or near-planar polygon, right-hand winding."""
    nx = ny = nz = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0, z0 = pts[i]
        x1, y1, z1 = pts[(i + 1) % n]
        nx += (y0 - y1) * (z0 + z1)
        ny += (z0 - z1) * (x0 + x1)
        nz += (x0 - x1) * (y0 + y1)
    m = math.sqrt(nx * nx + ny * ny + nz * nz)
    if m == 0.0:
        return (0.0, 0.0, 0.0), 0.0
    return (nx / m, ny / m, nz / m), 0.5 * m


def face_normals_areas(faces, points):
    normals, areas = [], []
    for f in faces:
        n, a = newell([points[i] for i in f])
        normals.append(n)
        areas.append(a)
    return normals, areas


def _key(a, b):
    return (a, b) if a < b else (b, a)


def edge_map(faces):
    """{(a, b) with a < b: [face, ...]} for every edge used by the faces."""
    em = {}
    for f, vs in enumerate(faces):
        n = len(vs)
        for i in range(n):
            em.setdefault(_key(vs[i], vs[(i + 1) % n]), []).append(f)
    return em


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _angle_deg(a, b):
    d = max(-1.0, min(1.0, _dot(a, b)))
    return math.degrees(math.acos(d))


class _UF(object):
    def __init__(self):
        self.p = {}

    def find(self, x):
        p = self.p.setdefault(x, x)
        root = x
        while p != root:
            root, p = p, self.p.setdefault(p, p)
        while self.p[x] != root:                   # path compression
            self.p[x], x = root, self.p[x]
        return root

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def balance_analysis(faces, points, exclude=(), limit=2.0, max_listed=25):
    """Mario Elementza's even-grid rule: neighbouring quads may differ, "as long as it's not
    double" (_bpsEd_5IW4 [00:08:31]). Ratio of the two face areas on every 2-face edge.
    Run it on the base grid BEFORE support loops, or pass the support-loop edges in `exclude`:
    a support loop is an intentional thin band and always exceeds 2."""
    _, areas = face_normals_areas(faces, points)
    ex = set(_key(*e) for e in exclude)
    over, ratios = [], []
    for key, fs in edge_map(faces).items():
        if len(fs) != 2 or key in ex:
            continue
        a, b = areas[fs[0]], areas[fs[1]]
        lo, hi = min(a, b), max(a, b)
        if lo <= 0.0:
            continue
        r = hi / lo
        ratios.append(r)
        if r > limit:
            over.append((r, key))
    over.sort(reverse=True)
    ratios.sort()
    return {"interior_edges": len(ratios), "limit": limit, "edges_over_limit": len(over),
            "pct_over_limit": round(100.0 * len(over) / len(ratios), 2) if ratios else 0.0,
            "median_ratio": round(percentile(ratios, 50), 3) if ratios else None,
            "p95_ratio": round(percentile(ratios, 95), 3) if ratios else None,
            "worst_ratio": round(ratios[-1], 3) if ratios else None,
            "worst": [{"edge": k, "ratio": round(r, 3)} for r, k in over[:max_listed]]}


def coincident_pairs(points, tol, edges=None, max_pairs=1000):
    """Vertex pairs closer than tol. connected=True means an edge joins them (a zero-length
    edge: Mario's empty extrude); False means unmerged points (V-snap without weld, antCGi
    -mWWeFv07SI [00:17:07], or stacked duplicate shells)."""
    inv = 1.0 / tol
    grid = {}
    for i, p in enumerate(points):
        grid.setdefault((int(math.floor(p[0] * inv)), int(math.floor(p[1] * inv)),
                         int(math.floor(p[2] * inv))), []).append(i)
    eset = set(_key(*e) for e in edges) if edges else set()
    pairs = []
    t2 = tol * tol
    for (cx, cy, cz), ids in grid.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    other = grid.get((cx + dx, cy + dy, cz + dz))
                    if not other:
                        continue
                    for i in ids:
                        pi = points[i]
                        for j in other:
                            if j <= i:
                                continue
                            pj = points[j]
                            d2 = (pi[0] - pj[0]) ** 2 + (pi[1] - pj[1]) ** 2 + (pi[2] - pj[2]) ** 2
                            if d2 < t2:
                                pairs.append((i, j, math.sqrt(d2), _key(i, j) in eset))
                                if len(pairs) >= max_pairs:
                                    return pairs
    return pairs


def fans(faces, hard_keys):
    """Union-find over face-vertices: two corners of one vertex share a smoothing fan when
    their faces meet across a soft edge at that vertex. Edges with 3+ faces count as hard."""
    uf = _UF()
    hard = set(hard_keys)
    for f, vs in enumerate(faces):
        for v in vs:
            uf.find((f, v))
    for key, fs in edge_map(faces).items():
        if len(fs) != 2 or key in hard:
            continue
        f1, f2 = fs
        for v in key:
            uf.union((f1, v), (f2, v))
    return uf


def split_analysis(faces, hard_keys, uv_faces=None, shader_faces=None, max_listed=50):
    """Polycount's cost model (vertex count, not triangle count, is the real cost; UV seams,
    hard edges and material changes each split vertices; a hard edge on a UV seam is free).
    engine_verts_est counts unique (vertex, smoothing fan, UV id, shader) corners, which is
    what a GPU buffer holds after export [added estimate; engines differ in details]."""
    uf = fans(faces, hard_keys)
    hard = set(hard_keys)
    corners = set()
    fv = 0
    pos = []
    for f, vs in enumerate(faces):
        uvs = uv_faces[f] if uv_faces else None
        sh = shader_faces[f] if shader_faces else 0
        pos.append({v: i for i, v in enumerate(vs)})
        for i, v in enumerate(vs):
            corners.add((v, uf.find((f, v)), uvs[i] if uvs else -1, sh))
            fv += 1
    seams, hard_not_seam, soft_seam, mat_border, interior_hard = [], [], [], [], []
    for key, fs in edge_map(faces).items():
        if len(fs) != 2:
            continue
        f1, f2 = fs
        is_seam = False
        if uv_faces:
            u1, u2 = uv_faces[f1], uv_faces[f2]
            if not u1 or not u2:
                is_seam = True
            else:
                a, b = key
                is_seam = (u1[pos[f1][a]] != u2[pos[f2][a]]) or (u1[pos[f1][b]] != u2[pos[f2][b]])
        is_hard = key in hard
        if is_hard:
            interior_hard.append(key)
        if is_seam:
            seams.append(key)
        if is_hard and uv_faces and not is_seam:
            hard_not_seam.append(key)
        if is_seam and not is_hard:
            soft_seam.append(key)
        if shader_faces and shader_faces[f1] != shader_faces[f2]:
            mat_border.append(key)
    verts = len(set(v for vs in faces for v in vs))
    tris = sum(len(vs) - 2 for vs in faces)
    return {"mesh_verts": verts, "triangles": tris, "face_vertices": fv,
            "engine_verts_est": len(corners),
            "split_ratio": round(len(corners) / float(verts), 3) if verts else None,
            "hard_edges": len(interior_hard), "uv_seams": len(seams),
            "hard_not_on_uv_seam": len(hard_not_seam), "soft_uv_seams": len(soft_seam),
            "material_borders": len(mat_border), "has_uvs": bool(uv_faces),
            "hard_not_on_uv_seam_keys": hard_not_seam[:max_listed],
            "soft_uv_seam_keys": soft_seam[:max_listed]}


def weighted_fan_normals(faces, points, hard_keys, mode="largest", ratio=0.5, power=1.0):
    """Per face-vertex normals for a bevelled game low, so big flat faces shade flat and the
    gradient moves onto the small bevel faces (Polycount: edited vertex normals when a game low
    is bevelled). Normals are computed per smoothing fan (faces joined by soft edges at the vertex).
    mode "largest" [added]: only faces whose area is at least ratio x the largest face of the fan
    contribute (area-weighted), so a 2:1 neighbourhood still averages (smooth curves) while a big
    flat next to a thin chamfer wins outright. mode "area": every face weighted by area ** power
    (the usual "face weighted normals"; on the offline chamfer-box test it leaves about 4 degrees
    on the big faces when the chamfer is 5% of the face size). Returns a list per face of unit
    normals in the face's vertex order."""
    normals, areas = face_normals_areas(faces, points)
    uf = fans(faces, hard_keys)
    members = {}
    for f, vs in enumerate(faces):
        for v in vs:
            members.setdefault(uf.find((f, v)), []).append(f)
    acc = {}
    for root, fl in members.items():
        if mode == "largest":
            top = max(areas[f] for f in fl)
            use = [f for f in fl if areas[f] >= ratio * top]
            ws = [(f, areas[f]) for f in use]
        elif mode == "area":
            ws = [(f, areas[f] ** power if areas[f] > 0 else 0.0) for f in fl]
        else:
            raise ValueError("mode must be 'largest' or 'area'")
        a = [0.0, 0.0, 0.0]
        for f, w in ws:
            n = normals[f]
            a[0] += w * n[0]
            a[1] += w * n[1]
            a[2] += w * n[2]
        acc[root] = a
    out = []
    for f, vs in enumerate(faces):
        fl = []
        for v in vs:
            a = acc[uf.find((f, v))]
            m = math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
            fl.append((a[0] / m, a[1] / m, a[2] / m) if m > 0 else normals[f])
        out.append(fl)
    return out


def flatness_report(faces, points, per_face_normals, top_frac=0.25):
    """Largest angle (degrees) between a face's normal and its own vertex normals, for the
    biggest faces (top_frac by area) and for all faces. Near 0 on big faces = flat shading."""
    normals, areas = face_normals_areas(faces, points)
    dev = []
    for f in range(len(faces)):
        d = max([_angle_deg(normals[f], n) for n in per_face_normals[f]] or [0.0])
        dev.append((areas[f], d))
    dev.sort(reverse=True)
    top = [d for _, d in dev[:max(1, int(len(dev) * top_frac))]]
    alld = sorted(d for _, d in dev)
    return {"big_faces_max_dev_deg": round(max(top), 4) if top else None,
            "all_faces_p95_dev_deg": round(percentile(alld, 95), 4) if alld else None,
            "all_faces_max_dev_deg": round(alld[-1], 4) if alld else None}


def dihedral_angles(faces, points):
    """{edge key: angle in degrees between the two face normals} for 2-face edges."""
    normals, _ = face_normals_areas(faces, points)
    out = {}
    for key, fs in edge_map(faces).items():
        if len(fs) == 2:
            out[key] = _angle_deg(normals[fs[0]], normals[fs[1]])
    return out


def center_line_analysis(points, faces=None, axis=0, tol=1e-4, band=1e-2, max_listed=25):
    """antCGi's mirror check (QW8w15J00Ok [00:03:29]): vertices on the mirror plane, near misses
    that will crease or fail to merge (band is [added]), and how many separate paths the
    on-plane vertices form (1 expected for a closed symmetric body)."""
    on = [i for i, p in enumerate(points) if abs(p[axis]) < tol]
    near = [i for i, p in enumerate(points) if tol <= abs(p[axis]) < band]
    paths = None
    if faces is not None and on:
        s = set(on)
        uf = _UF()
        for i in on:
            uf.find(i)
        for a, b in edge_map(faces):
            if a in s and b in s:
                uf.union(a, b)
        paths = len(set(uf.find(i) for i in on))
    return {"axis": "xyz"[axis], "on_plane": len(on), "near_misses": len(near),
            "near_sample": near[:max_listed], "on_plane_paths": paths, "tol": tol, "band": band}


def cylinder_sides_for(angles_deg, candidates=(20, 24, 28, 32), phase_deg=0.0):
    """Mario Elementza: cylinders in multiples of four, chosen so the vertical edges line up
    with the cut; 28 was upgraded to 32 to align (_bpsEd_5IW4 [01:12:04] [01:18:41]).
    Returns candidates sorted by worst angular misalignment (degrees), then side count."""
    res = []
    for s in candidates:
        step = 360.0 / s
        err = 0.0
        for a in angles_deg:
            x = (a - phase_deg) % step
            err = max(err, min(x, step - x))
        res.append({"sides": s, "max_error_deg": round(err, 4), "multiple_of_4": s % 4 == 0})
    res.sort(key=lambda r: (not r["multiple_of_4"], round(r["max_error_deg"], 6), r["sides"]))
    return res


def quad_cylinder_data(radius, height, sides=24, height_divisions=1, ring=True, relax_iterations=80):
    """Closed cylinder along Y, centered on the origin, with all-quad caps instead of the
    default triangle fan (Mario Elementza _bpsEd_5IW4 [01:14:16]; Pixar OpenSubdiv: avoid high
    valence poles, cap with valence-4 quads). Each cap is an n x n grid (n = sides / 4) mapped
    to the disc; ring=True adds one ring of quads so the rim vertices are all valence 4 and the
    8 unavoidable valence-3 poles sit inside the flat caps [added layout].
    Returns (points, counts, connects, info) in the units of radius and height."""
    if sides % 4 or sides < 8:
        raise ValueError("sides must be a multiple of 4 and at least 8 (Mario Elementza: work in quarters)")
    n = sides // 4
    hd = max(1, int(height_divisions))
    pts = []

    def rim_angle(k):
        return math.radians(-45.0) + 2.0 * math.pi * k / sides

    def cap(y):
        base = len(pts)

        def gid(i, j):
            return base + i * (n + 1) + j
        r_in = radius * n / float(n + 2) if ring else radius
        for i in range(n + 1):
            for j in range(n + 1):
                sx, sz = -1.0 + 2.0 * i / n, -1.0 + 2.0 * j / n
                u = sx * math.sqrt(max(0.0, 1.0 - sz * sz / 2.0))       # square-to-disc mapping
                v = sz * math.sqrt(max(0.0, 1.0 - sx * sx / 2.0))
                pts.append([u * r_in, y, v * r_in])
        border = ([(n, j) for j in range(n)] + [(i, n) for i in range(n, 0, -1)] +
                  [(0, j) for j in range(n, 0, -1)] + [(i, 0) for i in range(n)])
        border = [gid(i, j) for i, j in border]               # counter-clockwise from (+x, -z)
        rim = []
        for k in range(sides):
            a = rim_angle(k)
            p = [radius * math.cos(a), y, radius * math.sin(a)]
            if ring:
                rim.append(len(pts))
                pts.append(p)
            else:
                pts[border[k]] = p
                rim.append(border[k])
        cf = [[gid(i, j), gid(i, j + 1), gid(i + 1, j + 1), gid(i + 1, j)] for i in range(n) for j in range(n)]
        if ring:
            cf += [[border[k], border[(k + 1) % sides], rim[(k + 1) % sides], rim[k]] for k in range(sides)]
        nbr = {}
        for f in cf:
            for a, b in zip(f, f[1:] + f[:1]):
                nbr.setdefault(a, set()).add(b)
                nbr.setdefault(b, set()).add(a)
        fixed = set(rim)
        free = [v for v in nbr if v not in fixed]
        for _ in range(relax_iterations):                    # uniform Laplacian, rim fixed
            new = [(v, sum(pts[w][0] for w in nbr[v]) / len(nbr[v]),
                    sum(pts[w][2] for w in nbr[v]) / len(nbr[v])) for v in free]
            for v, x, z in new:
                pts[v][0], pts[v][2] = x, z
        return cf, rim

    top_faces, top_rim = cap(height / 2.0)
    bot_faces, bot_rim = cap(-height / 2.0)
    levels = [bot_rim]
    for lv in range(1, hd):
        y = -height / 2.0 + height * lv / float(hd)
        ids = []
        for k in range(sides):
            a = rim_angle(k)
            ids.append(len(pts))
            pts.append([radius * math.cos(a), y, radius * math.sin(a)])
        levels.append(ids)
    levels.append(top_rim)
    side_faces = []
    for lv in range(hd):
        lo, hi = levels[lv], levels[lv + 1]
        side_faces += [[lo[k], lo[(k + 1) % sides], hi[(k + 1) % sides], hi[k]] for k in range(sides)]

    def orient(face, want):
        nrm, _ = newell([pts[i] for i in face])
        return face if _dot(nrm, want) >= 0.0 else face[::-1]

    faces = [orient(f, (0.0, 1.0, 0.0)) for f in top_faces] + [orient(f, (0.0, -1.0, 0.0)) for f in bot_faces]
    for f in side_faces:
        cx = sum(pts[i][0] for i in f) / 4.0
        cz = sum(pts[i][2] for i in f) / 4.0
        faces.append(orient(f, (cx, 0.0, cz)))
    counts = [len(f) for f in faces]
    connects = [i for f in faces for i in f]
    info = {"sides": sides, "grid": n, "ring": ring, "height_divisions": hd, "faces": len(faces),
            "verts": len(pts), "expected_valence3_poles": 8}
    return [tuple(p) for p in pts], counts, connects, info


def valence_histogram(faces):
    em = edge_map(faces)
    deg = {}
    for a, b in em:
        deg[a] = deg.get(a, 0) + 1
        deg[b] = deg.get(b, 0) + 1
    hist = {}
    for d in deg.values():
        hist[d] = hist.get(d, 0) + 1
    return dict(sorted(hist.items()))


def signed_volume(faces, points):
    """Positive for a closed mesh with outward winding (fan triangulation of each face)."""
    vol = 0.0
    for f in faces:
        p0 = points[f[0]]
        for i in range(1, len(f) - 1):
            p1, p2 = points[f[i]], points[f[i + 1]]
            vol += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) +
                    p0[2] * (p1[0] * p2[1] - p1[1] * p2[0]))
    return vol / 6.0


def bend_metrics(faces, rest, posed):
    """antCGi's deformation smoke test in numbers (x07USYlvu2o): per-face area ratio (collapse
    and pinching), normal flips (folding), edge length ratios (stretch). Thresholds are the
    caller's; 0.3 area ratio as a red flag is the digest's [added] value."""
    n0, a0 = face_normals_areas(faces, rest)
    n1, a1 = face_normals_areas(faces, posed)
    ratios = sorted(a1[f] / a0[f] for f in range(len(faces)) if a0[f] > 0)
    flips = sum(1 for f in range(len(faces)) if a0[f] > 0 and a1[f] > 0 and _dot(n0[f], n1[f]) < 0.0)
    er = []
    for a, b in edge_map(faces):
        l0 = math.sqrt(sum((rest[a][i] - rest[b][i]) ** 2 for i in range(3)))
        l1 = math.sqrt(sum((posed[a][i] - posed[b][i]) ** 2 for i in range(3)))
        if l0 > 0:
            er.append(l1 / l0)
    er.sort()
    return {"min_area_ratio": round(ratios[0], 4) if ratios else None,
            "p05_area_ratio": round(percentile(ratios, 5), 4) if ratios else None,
            "faces_below_0_3": sum(1 for r in ratios if r < 0.3),
            "normal_flips": flips,
            "min_edge_ratio": round(er[0], 4) if er else None,
            "max_edge_ratio": round(er[-1], 4) if er else None}


def cage_analysis(faces, points, hard_keys=(), flat_deg=1.0, fan_min_valence=5, max_listed=25):
    """Mario Elementza's cage review in numbers (_bpsEd_5IW4), run before smoothing the high.
    - Hard edges must be 0 on a SubD cage: a faceted patch after a mirror or bridge is a hard
      edge, "we just soften the edge" [01:28:38].
    - Triangles by position [00:21:45] [00:29:59]: "flat" when every face touching the
      triangle's vertices lies within flat_deg of its plane [added threshold]: it may stay if the
      metal highlight holds [00:30:32]; "curved": remove it, solve the rest, reinstate it only if
      the highlight holds [00:20:36].
    - Valence census (Pixar OpenSubdiv: high valence causes waviness): interior 6+ listed; a
      vertex of valence >= fan_min_valence surrounded only by triangles is a fan cap: rebuild as
      a quad cap (Mario [01:14:16]; build_quad_cylinder)."""
    normals, _ = face_normals_areas(faces, points)
    em = edge_map(faces)
    border, val, vfaces = set(), {}, {}
    for (a, b), fs in em.items():
        val[a] = val.get(a, 0) + 1
        val[b] = val.get(b, 0) + 1
        if len(fs) == 1:
            border.update((a, b))
    for f, vs in enumerate(faces):
        for v in vs:
            vfaces.setdefault(v, []).append(f)
    hard = sorted(set(_key(*k) for k in hard_keys) & set(em))
    flat_t, curved_t = [], []
    for f, vs in enumerate(faces):
        if len(vs) != 3:
            continue
        ring = set(g for v in vs for g in vfaces[v])
        dev = max(_angle_deg(normals[f], normals[g]) for g in ring)
        (flat_t if dev <= flat_deg else curved_t).append((f, round(dev, 3)))
    curved_t.sort(key=lambda t: -t[1])
    ngons = [f for f, vs in enumerate(faces) if len(vs) > 4]
    hist, high, fan = {}, [], []
    for v, k in val.items():
        if v in border:
            continue
        hist[k] = hist.get(k, 0) + 1
        if k >= 6:
            high.append((v, k))
        if k >= fan_min_valence and all(len(faces[g]) == 3 for g in vfaces.get(v, [])):
            fan.append((v, k))
    return {"hard_edges": len(hard), "hard_keys": hard[:max_listed],
            "triangles": len(flat_t) + len(curved_t), "flat_triangles": len(flat_t),
            "curved_triangles": len(curved_t), "curved_triangle_faces": curved_t[:max_listed],
            "flat_triangle_faces": flat_t[:max_listed], "flat_deg": flat_deg,
            "ngons": len(ngons), "ngon_faces": ngons[:max_listed],
            "valence_hist_interior": dict(sorted(hist.items())),
            "poles_e6plus": len(high), "poles_e6plus_verts": sorted(high, key=lambda t: -t[1])[:max_listed],
            "fan_poles": len(fan), "fan_pole_verts": sorted(fan, key=lambda t: -t[1])[:max_listed],
            "ready_to_smooth": not hard and not ngons and not fan}


def shell_volumes(faces, points):
    """Vertex-connected shells with a closed flag and the signed volume. A closed shell with a
    negative volume is inside out: every face flipped together, which a winding-consistency test
    cannot see and two-sided lighting hides (FlippedNormals ToWRH4IXF7A [00:20:47]). Open shells
    cannot be decided this way: judge them with two-sided lighting off or backface culling."""
    uf = _UF()
    for vs in faces:
        for v in vs[1:]:
            uf.union(vs[0], v)
    em = edge_map(faces)
    shells = {}
    for f, vs in enumerate(faces):
        s = shells.setdefault(uf.find(vs[0]), {"faces": [], "volume": 0.0, "closed": True})
        s["faces"].append(f)
        p0 = points[vs[0]]
        for i in range(1, len(vs) - 1):
            p1, p2 = points[vs[i]], points[vs[i + 1]]
            s["volume"] += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) +
                            p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6.0
    for key, fs in em.items():
        if len(fs) != 2:
            shells[uf.find(key[0])]["closed"] = False
    out = []
    for s in sorted(shells.values(), key=lambda s: -len(s["faces"])):
        out.append({"faces": s["faces"], "face_count": len(s["faces"]), "closed": s["closed"],
                    "volume": round(s["volume"], 6), "inverted": s["closed"] and s["volume"] < 0.0})
    return out


def quad_folds(faces, points, min_fold_deg=1.0):
    """Non-planar quads: the only faces whose triangulation changes the shape. Polycount: check
    the triangulation and fix a quad that became a ridge instead of a valley (§ Polygons Vs.
    Triangles). Per quad: the fold angle, both diagonal midpoints, and whether splitting along
    0-2 makes a ridge (convex along the face normal) or a valley; 1-3 is the opposite."""
    out = []
    for f, vs in enumerate(faces):
        if len(vs) != 4:
            continue
        p = [points[i] for i in vs]
        na, _ = newell([p[0], p[1], p[2]])
        nb, _ = newell([p[0], p[2], p[3]])
        fold = _angle_deg(na, nb) if na != (0.0, 0.0, 0.0) and nb != (0.0, 0.0, 0.0) else 0.0
        if fold < min_fold_deg:
            continue
        qn, _ = newell(p)
        m02 = tuple((p[0][i] + p[2][i]) / 2.0 for i in range(3))
        m13 = tuple((p[1][i] + p[3][i]) / 2.0 for i in range(3))
        h = _dot(tuple(m02[i] - m13[i] for i in range(3)), qn)
        out.append({"face": f, "verts": list(vs), "fold_deg": round(fold, 3), "mid02": m02, "mid13": m13,
                    "shape02": "ridge" if h > 0 else "valley", "shape13": "valley" if h > 0 else "ridge"})
    return out


def choose_diagonals(folds, distance):
    """For each quad_folds() entry, the diagonal whose midpoint lies closer to the target surface
    (the high poly): distance(point) -> float [added criterion: the triangulated low should hug
    the high]. Returns {"face", "diagonal": (a, b), "other": (c, d), "shape", "gain"}."""
    picks = []
    for q in folds:
        v = q["verts"]
        d02, d13 = distance(q["mid02"]), distance(q["mid13"])
        if d02 <= d13:
            picks.append({"face": q["face"], "diagonal": (v[0], v[2]), "other": (v[1], v[3]),
                          "shape": q["shape02"], "gain": round(d13 - d02, 6)})
        else:
            picks.append({"face": q["face"], "diagonal": (v[1], v[3]), "other": (v[0], v[2]),
                          "shape": q["shape13"], "gain": round(d02 - d13, 6)})
    return picks


_COMP_RE = re.compile(r"^(?P<node>.+)\.(?P<kind>vtx|e|f|map)\[(?P<a>\d+)(?::(?P<b>\d+))?\]$")


def parse_components(components):
    """'mesh.e[3]', ['mesh.e[4:6]', 'mesh.e[1]'] -> {"node": "mesh", "kind": "e", "ids": [1, 4, 5, 6]}.
    One node and one kind (vtx, e, f, map) per call; vtxFace is not supported."""
    if isinstance(components, str):
        components = [components]
    node, kind, ids = None, None, set()
    for c in components:
        m = _COMP_RE.match(c.strip())
        if not m:
            raise ValueError("not a component string: %r" % c)
        if node not in (None, m.group("node")) or kind not in (None, m.group("kind")):
            raise ValueError("one node and one component kind per call: %r" % c)
        node, kind = m.group("node"), m.group("kind")
        a = int(m.group("a"))
        b = int(m.group("b")) if m.group("b") is not None else a
        ids.update(range(a, b + 1))
    if node is None:
        raise ValueError("no components given")
    return {"node": node, "kind": kind, "ids": sorted(ids)}


def topology_key(faces):
    """Short fingerprint of the face-vertex lists. Equal keys mean component indices name the
    same components: a duplicate keeps the key, any topology edit (delete edge, extrude, bevel,
    triangulate, cleanup) changes it."""
    h = hashlib.sha1()
    for f in faces:
        h.update((",".join(str(v) for v in f) + ";").encode("ascii"))
    nv = 1 + max((v for f in faces for v in f), default=-1)
    return "v%d-f%d-%s" % (nv, len(faces), h.hexdigest()[:16])


# =========================================================================== Maya layer
def _cmds():
    import maya.cmds as cmds
    return cmds


def _om():
    import maya.api.OpenMaya as om
    return om


def _audit():
    import mx_audit
    return mx_audit


def _ui_per_cm(cmds):
    return 1.0 / _audit().UI_TO_CM.get(cmds.currentUnit(q=True, linear=True), 1.0)


def _dag(om, name):
    sl = om.MSelectionList()
    sl.add(name)
    return sl.getDagPath(0)


def _short(n):
    return n.rsplit("|", 1)[-1]


def mesh_data(mesh, space="world", uv_set=None):
    """Plain-Python snapshot of a mesh (points in cm): faces, Maya edge list with hard flags,
    per-face UV ids of one set, per-face shader index. Feeds the pure layer."""
    cmds, om = _cmds(), _om()
    shape, xform = _audit().resolve_mesh(mesh)
    if not cmds.polyEvaluate(shape, vertex=True):
        raise ValueError("empty mesh %s (MFnMesh raises on empty meshes since 2022.1)" % shape)
    dag = _dag(om, shape)
    fn = om.MFnMesh(dag)
    sp = om.MSpace.kWorld if space == "world" else om.MSpace.kObject
    pts = [(p.x, p.y, p.z) for p in fn.getPoints(sp)]
    counts, connects = fn.getVertices()
    faces = faces_from(list(counts), list(connects))
    edges, hard = [], []
    for e in range(fn.numEdges):
        a, b = fn.getEdgeVertices(e)                    # [verify] returns two ints in API 2.0
        edges.append(_key(a, b))
        hard.append(not fn.isEdgeSmooth(e))             # [verify]
    names = list(fn.getUVSetNames() or [])
    set_name, uv_faces = None, None
    if names:
        set_name = uv_set or fn.currentUVSetName() or names[0]
        if set_name in names:
            c, ids = fn.getAssignedUVs(set_name)
            uv_faces, k = [], 0
            for m in c:
                uv_faces.append(list(ids[k:k + m]) if m else None)
                k += m
            if not any(uv_faces):
                uv_faces = None
    shader_faces, shaders = None, []
    try:
        objs, idx = fn.getConnectedShaders(dag.instanceNumber())
        shader_faces = list(idx)
        shaders = [om.MFnDependencyNode(o).name() for o in objs]
    except Exception:
        pass
    return {"shape": shape, "transform": xform, "space": space, "points": pts, "faces": faces,
            "edges": edges, "hard": hard, "uv_set": set_name, "uv_faces": uv_faces,
            "shader_faces": shader_faces, "shaders": shaders}


def _edge_ids(d):
    return {k: i for i, k in enumerate(d["edges"])}


def _edge_comp(d, keys, ids=None):
    ids = ids or _edge_ids(d)
    return ["%s.e[%d]" % (d["transform"], ids[k]) for k in keys if k in ids]


def census(mesh):
    """Topology counts from mx_audit (no UV work): the before/after record of every edit."""
    r = _audit().audit(mesh, uv_checks=False)
    keys = ("verts", "faces", "tris", "quads", "ngons", "poles_e3", "poles_e5", "poles_e6plus",
            "non_manifold_edges", "non_manifold_verts", "lamina_faces", "zero_length_edges",
            "zero_area_faces", "inconsistent_winding_edges", "holes", "dimensions", "hard_edges")
    return {k: r.get(k) for k in keys}


def balance(mesh, limit=2.0, exclude_edges=None, max_listed=25):
    """balance_analysis on a Maya mesh; exclude_edges: edge ids or 'mesh.e[i]' strings."""
    d = mesh_data(mesh)
    ex = []
    for e in exclude_edges or []:
        i = int(str(e).rsplit("[", 1)[-1].rstrip("]")) if not isinstance(e, int) else e
        ex.append(d["edges"][i])
    r = balance_analysis(d["faces"], d["points"], ex, limit, max_listed)
    ids = _edge_ids(d)
    for w in r["worst"]:
        w["component"] = "%s.e[%d]" % (d["transform"], ids[w.pop("edge")])
    r["mesh"] = d["transform"]
    return r


def coincident_vertices(mesh, tol_cm=1e-4, max_pairs=200):
    d = mesh_data(mesh)
    pairs = coincident_pairs(d["points"], tol_cm, d["edges"], max_pairs)
    x = d["transform"]
    return {"mesh": x, "tol_cm": tol_cm, "pairs": len(pairs),
            "connected_pairs": sum(1 for p in pairs if p[3]),
            "unconnected_pairs": sum(1 for p in pairs if not p[3]),
            "sample": [["%s.vtx[%d]" % (x, i), "%s.vtx[%d]" % (x, j), round(dd, 6), c]
                       for i, j, dd, c in pairs[:25]]}


def _ranges(x, kind, ids):
    """Compact component strings: [1, 2, 3, 7] -> ['x.f[1:3]', 'x.f[7]']."""
    out, ids = [], sorted(ids)
    i = 0
    while i < len(ids):
        j = i
        while j + 1 < len(ids) and ids[j + 1] == ids[j] + 1:
            j += 1
        out.append("%s.%s[%d]" % (x, kind, ids[i]) if i == j else "%s.%s[%d:%d]" % (x, kind, ids[i], ids[j]))
        i = j + 1
    return out


def cage_report(mesh, flat_deg=1.0, fan_min_valence=5, max_listed=25):
    """cage_analysis on a SubD cage (or a bake high before smoothing): hard edges (must be 0;
    fix: cmds.polySoftEdge(cage, angle=180, ch=False)), triangles split flat / curved for the
    remove-solve-reinstate protocol, n-gons, valence 6+ and fan caps. ready_to_smooth is the gate."""
    d = mesh_data(mesh)
    hard_keys = [k for k, h in zip(d["edges"], d["hard"]) if h]
    r = cage_analysis(d["faces"], d["points"], hard_keys, flat_deg, fan_min_valence, max_listed)
    x = d["transform"]
    r["hard_edge_components"] = _edge_comp(d, r.pop("hard_keys"))
    r["curved_triangle_faces"] = [["%s.f[%d]" % (x, f), dev] for f, dev in r["curved_triangle_faces"]]
    r["flat_triangle_faces"] = [["%s.f[%d]" % (x, f), dev] for f, dev in r["flat_triangle_faces"]]
    r["ngon_faces"] = ["%s.f[%d]" % (x, f) for f in r["ngon_faces"]]
    r["poles_e6plus_verts"] = [["%s.vtx[%d]" % (x, v), k] for v, k in r["poles_e6plus_verts"]]
    r["fan_pole_verts"] = [["%s.vtx[%d]" % (x, v), k] for v, k in r["fan_pole_verts"]]
    r["mesh"] = x
    return r


def inverted_shells(mesh):
    """Closed shells whose faces all point inward (negative signed volume, object space: run it
    after freezing, since freezing a negative scale reverses the winding). Fix per listed shell:
    cmds.polyNormal(faces, normalMode=0, userNormalMode=0, ch=False) [verify enum]. Open shells
    are listed as undecided: look at them with two-sided lighting off."""
    d = mesh_data(mesh, space="object")
    x = d["transform"]
    shells = shell_volumes(d["faces"], d["points"])
    inv = [s for s in shells if s["inverted"]]
    return {"mesh": x, "shells": len(shells), "closed": sum(1 for s in shells if s["closed"]),
            "open": sum(1 for s in shells if not s["closed"]), "inverted": len(inv),
            "inverted_faces": [_ranges(x, "f", s["faces"]) for s in inv[:25]],
            "volumes": [s["volume"] for s in shells[:25]]}


# Mesh > Cleanup arguments, polyCleanupArgList version 4 [verify order in 2027: the Maya test
# plants lamina, zero-length and n-gon faces and checks only the first two are fixed].
_CLEANUP_TECHNICAL = [
    "0",            # 0 selected meshes, 1 all meshes
    "1",            # 1 cleanup matching polygons, 2 select matching polygons
    "0",            # keep construction history
    "0", "0",       # tessellate 4-sided faces, faces with more than 4 sides: OFF (n-gons are fixed by hand)
    "0", "0", "0",  # tessellate concave, holed, non-planar faces: OFF
    "1", "TOL",     # remove faces with zero geometry area, tolerance
    "1", "TOL",     # remove edges with zero length, tolerance
    "0", "1e-05",   # faces with zero map area: off (UVs belong to scenario-maya-retopology-uv)
    "0",            # shared UVs
    "1",            # non-manifold geometry: 1 normals and geometry, 2 geometry only, -1 off
    "1",            # lamina faces
    "0",            # invalid components
]


def cleanup_technical(mesh, tol_cm=1e-5):
    """FlippedNormals' Cleanup policy (ToWRH4IXF7A [00:10:44] [00:11:15] [00:11:50]): let Mesh >
    Cleanup fix only the "purely technical" defects (lamina faces, non-manifold geometry,
    zero-length edges, zero-area faces) and never tessellate n-gons: "you never know how it's
    gonna clean up". Census before and after. ok is False when a technical defect remains or when
    n-gons went down while triangles went up (Cleanup tessellated them: undo, fix by hand)."""
    cmds = _cmds()
    import maya.mel as mel
    shape, xform = _audit().resolve_mesh(mesh)
    _, deformers = _audit().history_info(shape)
    if deformers:
        raise RuntimeError("%s has deformers %s: clean the model before rigging" % (xform, deformers))
    before = census(xform)
    tol = "%.8g" % (tol_cm * _ui_per_cm(cmds))
    args = [tol if a == "TOL" else a for a in _CLEANUP_TECHNICAL]
    sel = cmds.ls(selection=True, long=True) or []
    cmds.select(xform, replace=True)
    try:
        mel.eval("polyCleanupArgList 4 { %s }" % ",".join('"%s"' % a for a in args))
    finally:
        if sel:
            cmds.select(sel, replace=True)
        else:
            cmds.select(clear=True)
    after = census(xform)
    left = {k: after.get(k) for k in ("non_manifold_edges", "non_manifold_verts", "lamina_faces",
                                      "zero_length_edges", "zero_area_faces") if after.get(k)}
    problems = ["error: %s still %s" % (k, v) for k, v in sorted(left.items())]
    tessellated = (after.get("ngons") or 0) < (before.get("ngons") or 0) and \
        (after.get("tris") or 0) > (before.get("tris") or 0)
    if tessellated:
        problems.append("error: n-gons %s -> %s while triangles %s -> %s: Cleanup tessellated them; undo "
                        "(or reopen the saved version) and fix n-gons by hand"
                        % (before.get("ngons"), after.get("ngons"), before.get("tris"), after.get("tris")))
    return {"mesh": xform, "before": before, "after": after, "args": args, "problems": problems,
            "ok": not problems}


def component_record(components):
    """A JSON-safe record of a component list: bare indices plus the topology_key of the mesh they
    were read from. Store this (never names alone) when a later stage or job must reuse the
    selection; carry_components() refuses it on a mesh whose topology changed."""
    p = parse_components(components)
    d = mesh_data(p["node"])
    return {"node": _short(d["transform"]), "kind": p["kind"], "ids": p["ids"],
            "topology_key": topology_key(d["faces"])}


def carry_components(record, target):
    """Component strings on target for a component_record() (or a component list, recorded now).
    A duplicate keeps component indices, so ids carry from a cage to its fresh duplicate; after
    any topology edit they name different components, so this raises instead of guessing:
    re-derive the list on the target (by position, angle or a fresh query)."""
    if not isinstance(record, dict):
        record = component_record(record)
    d = mesh_data(target)
    key = topology_key(d["faces"])
    if key != record["topology_key"]:
        raise ValueError("topology of %s (%s) differs from where the components were read (%s, %s): "
                         "indices do not carry; re-derive them on %s"
                         % (d["transform"], key, record["node"], record["topology_key"], d["transform"]))
    return _ranges(d["transform"], record["kind"], record["ids"])


def split_report(mesh, uv_set=None, max_listed=50):
    """Hard edges vs UV seams and the estimated engine vertex count (Polycount)."""
    d = mesh_data(mesh, uv_set=uv_set)
    hard_keys = [k for k, h in zip(d["edges"], d["hard"]) if h]
    r = split_analysis(d["faces"], hard_keys, d["uv_faces"], d["shader_faces"], max_listed)
    ids = _edge_ids(d)
    r["hard_not_on_uv_seam_edges"] = _edge_comp(d, r.pop("hard_not_on_uv_seam_keys"), ids)
    r["soft_uv_seam_edges"] = _edge_comp(d, r.pop("soft_uv_seam_keys"), ids)
    r["hard_edge_components"] = _edge_comp(d, hard_keys[:5000], ids)   # cut UVs here (scenario-maya-retopology-uv)
    r["uv_set"] = d["uv_set"]
    r["shaders"] = d["shaders"]
    r["mesh"] = d["transform"]
    return r


def set_hard_by_angle(mesh, angle=45.0):
    """Mesh Display > Soften/Harden Edges by angle, selection-free. Returns the hard edge count.
    Polycount: hard edges where a mechanical surface bends more than about 45 degrees."""
    cmds = _cmds()
    shape, xform = _audit().resolve_mesh(mesh)
    cmds.polySoftEdge(xform, angle=float(angle), constructionHistory=False)
    d = mesh_data(xform)
    return {"mesh": xform, "angle": angle, "hard_edges": sum(1 for h in d["hard"] if h), "edges": len(d["hard"])}


def weighted_normals(mesh, mode="largest", ratio=0.5, power=1.0, delete_history=True, undoable=False):
    """Weighted normals per smoothing fan (weighted_fan_normals), written as locked face-vertex normals.
    Static meshes only (locked normals do not follow skinning: mx_audit warns on them, which is
    expected and must be declared at handoff). OpenMaya writes are not undoable: in a GUI
    session save first, or pass undoable=True (slower polyNormalPerVertex calls)."""
    cmds, om = _cmds(), _om()
    shape, xform = _audit().resolve_mesh(mesh)
    other, deformers = _audit().history_info(shape)
    if deformers:
        raise RuntimeError("%s has deformers %s: weighted normals are for static meshes" % (xform, deformers))
    deleted = False
    if other:
        if not delete_history:
            raise RuntimeError("%s has construction history %s: delete it first" % (xform, other[:4]))
        cmds.delete(xform, constructionHistory=True)
        deleted = True
    d = mesh_data(xform, space="object")
    hard_keys = [k for k, h in zip(d["edges"], d["hard"]) if h]
    per_face = weighted_fan_normals(d["faces"], d["points"], hard_keys, mode, ratio, power)
    if undoable:
        for f, vs in enumerate(d["faces"]):
            for v, n in zip(vs, per_face[f]):
                cmds.polyNormalPerVertex("%s.vtxFace[%d][%d]" % (xform, v, f), xyz=n)
    else:
        fn = om.MFnMesh(_dag(om, shape))
        normals = om.MVectorArray()
        fids, vids = [], []
        for f, vs in enumerate(d["faces"]):
            for v, n in zip(vs, per_face[f]):
                normals.append(om.MVector(*n))
                fids.append(f)
                vids.append(v)
        fn.setFaceVertexNormals(normals, fids, vids, om.MSpace.kObject)
    return {"mesh": xform, "face_vertices": sum(len(f) for f in d["faces"]), "mode": mode, "ratio": ratio,
            "power": power,
            "history_deleted": deleted, "locked": True,
            "flatness": flatness_report(d["faces"], d["points"], per_face)}


def extrude(faces, offset_cm=0.0, depth_cm=0.0, divisions=1, keep_together=True):
    """Edit Mesh > Extrude with Mario Elementza's guard: an extrude that neither offsets nor
    moves leaves double faces seen only in smooth preview (_bpsEd_5IW4 [00:39:22]); refused here.
    offset_cm > 0 with depth 0 is his "offset before cutting" support loop [00:38:16]."""
    cmds = _cmds()
    if not offset_cm and not depth_cm:
        raise ValueError("empty extrude refused: set offset_cm or depth_cm (Mario Elementza [00:39:22])")
    comps = cmds.ls(faces, flatten=True) or []
    if not comps:
        raise ValueError("no faces given")
    k = _ui_per_cm(cmds)
    node = cmds.polyExtrudeFacet(comps, offset=offset_cm * k, localTranslateZ=depth_cm * k, thickness=0,
                                 divisions=int(divisions), keepFacesTogether=bool(keep_together))[0]
    after = census(comps[0].split(".")[0])
    return {"node": node, "census": after, "ok": not after["zero_length_edges"] and not after["lamina_faces"]}


def _set_first(cmds, node, names, value, found):
    for a in names:
        if cmds.attributeQuery(a, node=node, exists=True):
            cmds.setAttr(node + "." + a, value)
            found[names[0]] = a
            return True
    found[names[0]] = None
    return False


def bevel(edges, width_cm=None, segments=2, depth=1.0, method="smart", fraction=0.5,
          smoothing_angle=30.0, check=True):
    """Bevel with a census before and after.
    method "smart": polySmartBevel (2027): Width in world units, Depth a profile (1 flat
      chamfer, 0..1 rounded, negative concave with 2+ segments), recommended after booleans
      and on messy topology (Maya 2027 Help). Flags are unknown before the install: the node is
      created with defaults, then attributes are set by probing names (recorded in attr_map).
    method "legacy": polyBevel3. width_cm=None uses Fractional (capped at the shortest edge, it
      cannot invert); width_cm uses Absolute (can invert on short edges: freeze first)."""
    cmds = _cmds()
    comps = cmds.ls(edges, flatten=True) or []
    if not comps:
        raise ValueError("no edges given")
    xform = comps[0].split(".")[0]
    before = census(xform) if check else None
    k = _ui_per_cm(cmds)
    rec = {"method": method, "maya": cmds.about(version=True), "edges": len(comps)}
    if method == "smart":
        if not hasattr(cmds, "polySmartBevel"):
            raise RuntimeError("polySmartBevel not available (Maya 2027+ command)")
        res = cmds.polySmartBevel(comps)                               # [verify] return value
        nodes = [n for n in (res or []) if cmds.objExists(n) and cmds.nodeType(n) == "polySmartBevel"]
        if not nodes:
            nodes = cmds.ls(cmds.listHistory(xform) or [], type="polySmartBevel") or []
        if not nodes:
            raise RuntimeError("polySmartBevel returned %r and no polySmartBevel node was found" % (res,))
        node = nodes[0]
        amap = {}
        if width_cm is not None:
            _set_first(cmds, node, ("width", "bevelWidth", "offset", "distance"), width_cm * k, amap)
        _set_first(cmds, node, ("segments", "segmentCount", "numberOfSegments"), int(segments), amap)
        _set_first(cmds, node, ("depth", "profile", "profileDepth"), float(depth), amap)
        rec["attr_map"] = amap
        rec["node_attrs"] = sorted(cmds.listAttr(node, keyable=True) or [])
    else:
        kw = dict(segments=int(segments), depth=float(depth), chamfer=True,
                  smoothingAngle=float(smoothing_angle), autoFit=True)
        if width_cm is None:
            kw.update(offsetAsFraction=True, fraction=float(fraction))
        else:
            kw.update(offsetAsFraction=False, offset=width_cm * k, worldSpace=True)
        node = cmds.polyBevel3(comps, **kw)[0]
    rec["node"] = node
    if check:
        after = census(xform)
        rec["before"], rec["after"] = before, after
        probs = []
        for key in ("non_manifold_edges", "non_manifold_verts", "lamina_faces", "zero_area_faces",
                    "zero_length_edges", "inconsistent_winding_edges"):
            if (after.get(key) or 0) > (before.get(key) or 0):
                probs.append("%s rose %s -> %s" % (key, before.get(key), after.get(key)))
        if (after.get("ngons") or 0) > (before.get("ngons") or 0):
            probs.append("n-gons rose %s -> %s (1-segment bevels on box corners do this: "
                         "FlippedNormals use 2 segments)" % (before.get("ngons"), after.get("ngons")))
        db = [abs(a - b) for a, b in zip(before.get("dimensions") or [], after.get("dimensions") or [])]
        if db and max(db) > 1e-3 * max(before["dimensions"]):
            probs.append("bounding box changed by %.4g cm: the bevel moved the silhouette" % max(db))
        rec["problems"] = probs
    return rec


def _fmt(v):
    return ("%g" % v).replace(".", "p")


def crease(edges, value, method="tool", set_name=None):
    """Semi-sharp creases. Pick ONE method per asset (Maya 2027 Help: Crease Tool and Crease
    Sets cannot be mixed on the same components). method "tool": polyCrease values on the
    components. method "sets": a creaseSet per value, named with the value (Pixar: topDeck_2)
    [verify creaseSet node and creaseLevel attribute]. Maya's value = subdivision levels
    creased, so keep it at or below the render subdivision level; above 5 is rarely needed."""
    cmds = _cmds()
    comps = cmds.ls(edges, flatten=True) or []
    if not comps:
        raise ValueError("no components given")
    rec = {"method": method, "value": value, "components": len(comps)}
    if method == "tool":
        cmds.polyCrease(comps, value=float(value))
        return rec
    name = set_name or "crease_%s" % _fmt(value)
    if not name.endswith("_" + _fmt(value)) and not name.endswith("_%g" % value):
        rec["warning"] = "crease set name %s does not carry its value (Pixar: topDeck_2)" % name
    cs = cmds.createNode("creaseSet", name=name)                    # [verify]
    cmds.setAttr(cs + ".creaseLevel", float(value))                 # [verify]
    cmds.sets(comps, addElement=cs)                                 # [verify] membership drives creases
    rec["crease_set"] = cs
    return rec


def crease_report(mesh, render_levels=None, engine_bound=False):
    """Crease values on a mesh, crease sets touching it, and the rule breaks: values > 5
    (Pixar), values above the render subdivision level (Maya: value N creases N levels), any
    crease on an asset bound for an engine (antCGi: creases are lost on export, bevel instead)."""
    cmds = _cmds()
    shape, xform = _audit().resolve_mesh(mesh)
    ev = cmds.polyCrease(xform + ".e[*]", q=True, value=True) or []            # [verify] per-edge list
    vv = []
    try:
        vv = cmds.polyCrease(xform + ".vtx[*]", q=True, vertexValue=True) or []
    except Exception:
        pass
    creased = [(i, v) for i, v in enumerate(ev) if v and v > 0]
    vcreased = [(i, v) for i, v in enumerate(vv) if v and v > 0]
    sets = []
    for cs in cmds.ls(type="creaseSet") or []:
        members = cmds.sets(cs, q=True) or []
        mine = [m for m in members if m.split(".")[0] in (_short(xform), xform, _short(shape), shape)]
        if not mine:
            continue
        lvl = cmds.getAttr(cs + ".creaseLevel") if cmds.attributeQuery("creaseLevel", node=cs, exists=True) else None
        sets.append({"name": cs, "level": lvl, "members": len(mine),
                     "name_has_value": lvl is not None and (cs.endswith("_" + _fmt(lvl)) or cs.endswith("_%g" % lvl))})
    vals = [v for _, v in creased] + [v for _, v in vcreased] + [s["level"] for s in sets if s["level"]]
    top = max(vals) if vals else 0.0
    probs = []
    if top > 5:
        probs.append("warn: crease value %.3g above 5 (Pixar OpenSubdiv: rarely needed, cost grows with sharpness)" % top)
    if top >= 10:
        probs.append("warn: infinite crease (10): tears under displacement (Pixar)")
    if render_levels is not None and top > render_levels:
        probs.append("warn: crease %.3g above the %d render subdivision levels (Maya: value N creases N levels)"
                     % (top, render_levels))
    if engine_bound and vals:
        probs.append("error: creases on an asset bound for an engine are lost on export (antCGi RlNnp4qQIrU "
                     "[00:28:12]): bevel, or convert the smoothed mesh to polygons")
    for s in sets:
        if not s["name_has_value"]:
            probs.append("info: crease set %s does not carry its value in its name (Pixar)" % s["name"])
    return {"mesh": xform, "creased_edges": len(creased), "creased_verts": len(vcreased), "max_value": top,
            "crease_sets": sets, "problems": probs}


def subdiv_setup(mesh, iterations=2, where="arnold"):
    """Subdivide in ONE place (Arnold doc: Arnold also renders Smooth Mesh Preview's smoothed
    state on top of its own iterations; Maya Help: preview is display only for Maya's own
    rendering). where="arnold": preview off, aiSubdivType catclark, aiSubdivIterations n.
    where="preview": preview on at level n, Arnold subdivision off (Arnold renders the preview)."""
    cmds = _cmds()
    shape, xform = _audit().resolve_mesh(mesh)
    import mx_review
    rec = {"mesh": xform, "where": where, "iterations": iterations}
    if where == "arnold":
        cmds.setAttr(shape + ".displaySmoothMesh", 0)
        if cmds.attributeQuery("aiSubdivType", node=shape, exists=True):
            if not mx_review.set_enum(shape + ".aiSubdivType", "catclark"):
                cmds.setAttr(shape + ".aiSubdivType", 1)                     # [verify] 1 = catclark
            cmds.setAttr(shape + ".aiSubdivIterations", int(iterations))
        else:
            rec["warning"] = "aiSubdivType missing: load mtoa first"
    elif where == "preview":
        cmds.setAttr(shape + ".displaySmoothMesh", 2)
        if cmds.attributeQuery("smoothLevel", node=shape, exists=True):
            cmds.setAttr(shape + ".smoothLevel", int(iterations))
        if cmds.attributeQuery("aiSubdivType", node=shape, exists=True):
            if not mx_review.set_enum(shape + ".aiSubdivType", "none"):
                cmds.setAttr(shape + ".aiSubdivType", 0)
    else:
        raise ValueError("where must be 'arnold' or 'preview'")
    rec["state"] = {a: cmds.getAttr(shape + "." + a) for a in
                    ("displaySmoothMesh", "smoothLevel", "aiSubdivType", "aiSubdivIterations")
                    if cmds.attributeQuery(a, node=shape, exists=True)}
    return rec


def smooth_copy(mesh, levels=2, name=None, osd=True):
    """A polygon copy of the subdivided surface (bake high, or a baked hero still): duplicate,
    polySmooth, delete history, preview off. The source cage is untouched."""
    cmds = _cmds()
    shape, xform = _audit().resolve_mesh(mesh)
    dup = cmds.duplicate(xform, name=name or _short(xform).rsplit(":", 1)[-1] + "_high")[0]
    try:
        cmds.polySmooth(dup, divisions=int(levels), subdivisionType=2 if osd else 0)   # [verify] 2 = OpenSubdiv
    except TypeError:
        cmds.polySmooth(dup, divisions=int(levels))
    cmds.delete(dup, constructionHistory=True)
    for s in cmds.listRelatives(dup, shapes=True, fullPath=True, noIntermediate=True) or []:
        if cmds.attributeQuery("displaySmoothMesh", node=s, exists=True):
            cmds.setAttr(s + ".displaySmoothMesh", 0)
    return cmds.ls(dup, long=True)[0]


def triangulated_copy(mesh, name=None, toward=None, min_fold_deg=1.0):
    """Polycount and Epic: triangulate yourself, bake and export the SAME triangulation.
    toward=<high mesh>: on every non-planar quad of the source (quad_folds, fold >= min_fold_deg)
    keep the diagonal whose midpoint lies closer to the high (choose_diagonals), flipping Maya's
    choice with polyFlipEdge [verify]. Polycount: a quad that became a ridge instead of a valley
    shades wrong in the engine (§ Polygons Vs. Triangles). Needs polyTriangulate to keep vertex
    ids (it adds no vertices on quads) [verify: diagonals_wrong_after reports it]."""
    cmds = _cmds()
    shape, xform = _audit().resolve_mesh(mesh)
    folds = []
    if toward:
        d0 = mesh_data(xform)
        folds = quad_folds(d0["faces"], d0["points"], min_fold_deg)
    dup = cmds.duplicate(xform, name=name or _short(xform).rsplit(":", 1)[-1] + "_tri")[0]
    cmds.polyTriangulate(dup)
    cmds.delete(dup, constructionHistory=True)
    rec = {"nonplanar_quads": 0} if toward else {}
    if folds:
        om = _om()
        fn_high = om.MFnMesh(_dag(om, _audit().resolve_mesh(toward)[0]))

        def dist(p):
            q = fn_high.getClosestPoint(om.MPoint(*p), om.MSpace.kWorld)[0]     # [verify] (MPoint, faceId)
            return math.sqrt((q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2)
        picks = choose_diagonals(folds, dist)
        d1 = mesh_data(dup)
        ids = _edge_ids(d1)
        flip = ["%s.e[%d]" % (d1["transform"], ids[_key(*pk["other"])]) for pk in picks
                if _key(*pk["diagonal"]) not in ids and _key(*pk["other"]) in ids]
        if flip:
            cmds.polyFlipEdge(flip)                                                 # [verify] flags
            cmds.delete(dup, constructionHistory=True)
        ids2 = _edge_ids(mesh_data(dup))
        rec = {"nonplanar_quads": len(folds), "flipped": len(flip),
               "ridges": sum(1 for pk in picks if pk["shape"] == "ridge"),
               "valleys": sum(1 for pk in picks if pk["shape"] == "valley"),
               "diagonals_wrong_after": sum(1 for pk in picks if _key(*pk["diagonal"]) not in ids2),
               "max_fold_deg": max(q["fold_deg"] for q in folds)}
    f = cmds.polyEvaluate(dup, face=True)
    t = cmds.polyEvaluate(dup, triangle=True)
    out = {"mesh": cmds.ls(dup, long=True)[0], "faces": f, "triangles": t, "all_triangles": f == t}
    out.update(rec)
    return out


def flat_edges(mesh, max_angle=1.0):
    """Edges whose two faces are coplanar within max_angle degrees: they carry no form, so on a
    game low they are removal candidates (On Mars 3D: strip holding lines that do not shape the
    silhouette, YDu9pYMkkSM [00:05:50]). Delete with polyDelEdge(cleanVertices=True), then
    re-measure deviation() against the high."""
    d = mesh_data(mesh)
    ang = dihedral_angles(d["faces"], d["points"])
    ids = _edge_ids(d)
    keys = [k for k, a in ang.items() if a <= max_angle]
    return {"mesh": d["transform"], "max_angle": max_angle, "count": len(keys),
            "edges": _edge_comp(d, keys, ids)}


def build_quad_cylinder(name, radius_cm, height_cm, sides=24, height_divisions=1, ring=True, relax_iterations=80):
    """Create quad_cylinder_data() as a Maya mesh (no history, no UVs: scenario-maya-retopology-uv maps it)."""
    cmds, om = _cmds(), _om()
    pts, counts, connects, info = quad_cylinder_data(radius_cm, height_cm, sides, height_divisions, ring,
                                                     relax_iterations)
    obj = om.MFnMesh().create([om.MPoint(*p) for p in pts], counts, connects)    # internal units = cm
    xf = cmds.rename(om.MFnDagNode(obj).fullPathName(), name)
    try:
        cmds.sets(xf, e=True, forceElement="initialShadingGroup")
    except Exception:
        pass
    info["transform"] = cmds.ls(xf, long=True)[0]
    return info


def mirror_merge(mesh, axis="x", threshold_cm=0.001, snap_band_cm=0.01, method="auto"):
    """Model half, mirror, merge only the seam (antCGi QW8w15J00Ok [00:02:24] [00:02:56]: Mesh >
    Mirror with a custom 0.001 threshold and Border merge; automatic thresholds eat center
    topology). Steps: snap near-plane vertices onto the plane (band is [added]), mirror, merge
    seam vertices only, verify counts. method "auto" tries polyMirrorFace on a copy and falls
    back to duplicate, negative scale, combine and a seam-only merge. The result keeps the
    name and parent; the node is new (UUID changes)."""
    cmds, om = _cmds(), _om()
    ax = {"x": 0, "y": 1, "z": 2}[axis]
    shape, xform = _audit().resolve_mesh(mesh)
    tr = _audit().transform_info(xform)
    if not tr.get("frozen") or tr.get("ancestors_not_frozen"):
        raise RuntimeError("freeze %s and its parents first: the mirror plane is the world %s=0 plane"
                           % (xform, axis))
    other, deformers = _audit().history_info(shape)
    if deformers:
        raise RuntimeError("%s has deformers; mirror before rigging" % xform)
    if other:
        cmds.delete(xform, constructionHistory=True)
    short = _short(xform)
    parent = (cmds.listRelatives(xform, parent=True, fullPath=True) or [None])[0]
    k = _ui_per_cm(cmds)
    fn = om.MFnMesh(_dag(om, shape))
    pts = fn.getPoints(om.MSpace.kWorld)
    snapped = 0
    for i in range(len(pts)):
        c = (pts[i].x, pts[i].y, pts[i].z)[ax]
        if 0.0 < abs(c) < snap_band_cm:
            p = om.MPoint(pts[i])
            if ax == 0:
                p.x = 0.0
            elif ax == 1:
                p.y = 0.0
            else:
                p.z = 0.0
            pts[i] = p
            snapped += 1
    if snapped:
        fn.setPoints(pts, om.MSpace.kWorld)
    d = mesh_data(xform)
    nf, nv = len(d["faces"]), len(d["points"])
    on = sum(1 for p in d["points"] if abs(p[ax]) < threshold_cm)
    want = {"faces": 2 * nf, "verts": 2 * nv - on}
    rec = {"snapped": snapped, "seam_verts": on, "expected": want, "attempts": []}

    def good(node):
        c = census(node)
        bb = cmds.exactWorldBoundingBox(node)
        spans = bb[ax] < -1e-4 and bb[ax + 3] > 1e-4
        ok = (c["faces"] == want["faces"] and c["verts"] == want["verts"] and spans and
              not c["non_manifold_edges"] and not c["inconsistent_winding_edges"])
        return ok, c

    result = None
    if method in ("auto", "mirror"):
        for direction in (0, 1):                                       # [verify] which one is "toward -axis"
            tmp = cmds.duplicate(xform, name=short + "_mxMirror")[0]
            try:
                cmds.polyMirrorFace(tmp, axis=ax, axisDirection=direction, mirrorAxis=2, mirrorPosition=0.0,
                                    mergeMode=1, mergeThresholdType=1, mergeThreshold=threshold_cm * k,
                                    cutMesh=0)                          # [verify every flag and enum]
                cmds.delete(tmp, constructionHistory=True)
                ok, c = good(tmp)
                rec["attempts"].append({"method": "polyMirrorFace", "axisDirection": direction, "ok": ok, "census": c})
            except Exception as exc:
                ok = False
                rec["attempts"].append({"method": "polyMirrorFace", "axisDirection": direction, "error": str(exc)})
            if ok:
                result = tmp
                break
            cmds.delete(tmp)
    if result is None and method in ("auto", "manual"):
        dup = cmds.duplicate(xform, name=short + "_mxOther")[0]
        s = [1.0, 1.0, 1.0]
        s[ax] = -1.0
        cmds.scale(s[0], s[1], s[2], dup, pivot=(0.0, 0.0, 0.0), relative=True)
        cmds.makeIdentity(dup, apply=True, translate=True, rotate=True, scale=True, normal=0,
                          preserveNormals=True)                            # [verify] flips winding back
        keep = cmds.duplicate(xform, name=short + "_mxKeep")[0]
        united = cmds.polyUnite(keep, dup, name=short + "_mxUnited")[0]
        cmds.delete(united, constructionHistory=True)
        for n in (keep, dup):
            if cmds.objExists(n) and not cmds.listRelatives(n, children=True):
                cmds.delete(n)
        du = mesh_data(united)
        seam = ["%s.vtx[%d]" % (united, i) for i, p in enumerate(du["points"]) if abs(p[ax]) < threshold_cm]
        if seam:
            cmds.polyMergeVertex(seam, distance=threshold_cm * k)
            cmds.delete(united, constructionHistory=True)
        c = census(united)
        if c["inconsistent_winding_edges"]:
            cmds.polyNormal(united, normalMode=2, userNormalMode=0)   # [verify] 2 = conform
            cmds.delete(united, constructionHistory=True)
        ok, c = good(united)
        rec["attempts"].append({"method": "manual", "ok": ok, "census": c})
        if ok:
            result = united
        else:
            cmds.delete(united)                     # the original half stays untouched
    if result is None:
        raise RuntimeError("mirror failed, original kept: %s" % rec["attempts"])
    cmds.delete(xform)
    current = (cmds.listRelatives(result, parent=True, fullPath=True) or [None])[0]
    if parent and cmds.objExists(parent) and current != parent:
        result = cmds.parent(result, parent)[0]
    result = cmds.rename(result, short)
    rec["mesh"] = cmds.ls(result, long=True)[0]
    rec["ok"] = True
    d2 = mesh_data(result)
    rec["center_line"] = center_line_analysis(d2["points"], d2["faces"], ax, threshold_cm, snap_band_cm)
    return rec


def deviation(low, high, max_samples=20000, tol_cm=1e-3):
    """On Mars 3D's overlap check in numbers (YDu9pYMkkSM [00:07:27] [00:17:45]): distances from
    the low to the high surface and back, signed by the other mesh's normal (positive = outside).
    high_outside_low_max_cm is how far the high pokes out of the low: the cage distance a bake
    needs, or the place to add geometry (round corners need real edges on the low)."""
    om = _om()

    def one_way(src, dst):
        fs = om.MFnMesh(_dag(om, _audit().resolve_mesh(src)[0]))
        fd = om.MFnMesh(_dag(om, _audit().resolve_mesh(dst)[0]))
        pts = fs.getPoints(om.MSpace.kWorld)
        step = max(1, len(pts) // max_samples)
        signed = []
        for i in range(0, len(pts), step):
            p = pts[i]
            cp, nrm, _ = fd.getClosestPointAndNormal(p, om.MSpace.kWorld)
            v = p - cp
            nl = nrm.length()
            s = (v * nrm) / nl if nl > 0 else v.length()          # MVector * MVector = dot
            signed.append(math.copysign(v.length(), s))
        a = sorted(abs(x) for x in signed)
        return {"samples": len(signed), "max_cm": round(a[-1], 5) if a else None,
                "mean_cm": round(sum(a) / len(a), 5) if a else None, "p95_cm": round(percentile(a, 95), 5) if a else None,
                "outside_max_cm": round(max([x for x in signed if x > 0] or [0.0]), 5),
                "inside_max_cm": round(-min([x for x in signed if x < 0] or [0.0]), 5),
                "pct_outside": round(100.0 * sum(1 for x in signed if x > tol_cm) / len(signed), 2) if signed else 0.0}

    lo_to_hi = one_way(low, high)
    hi_to_lo = one_way(high, low)
    return {"low_to_high": lo_to_hi, "high_to_low": hi_to_lo,
            "high_outside_low_max_cm": hi_to_lo["outside_max_cm"]}


def shrink_wrap(low, high, method="transfer", delete_history=True):
    """Pull a cage-derived low back onto the smoothed high (subdivision shrinks the surface:
    On Mars 3D YDu9pYMkkSM [00:14:31] [00:17:45]). method "transfer": transferAttributes
    positions, closest point [verify enums]; "shrinkwrap": Deform > Shrink Wrap deformer
    [verify node attributes]. Returns deviation() before and after."""
    cmds = _cmds()
    before = deviation(low, high)
    lshape, lx = _audit().resolve_mesh(low)
    hshape, hx = _audit().resolve_mesh(high)
    rec = {"method": method, "before": before}
    if method == "transfer":
        cmds.transferAttributes(hx, lx, transferPositions=1, transferNormals=0, transferUVs=0,
                                transferColors=0, sampleSpace=0, searchMethod=3)
    elif method == "shrinkwrap":
        sw = cmds.deformer(lx, type="shrinkWrap")[0]
        cmds.connectAttr(hshape + ".worldMesh[0]", sw + ".targetGeom", force=True)      # [verify]
        rec["node"] = sw
    else:
        raise ValueError("method must be 'transfer' or 'shrinkwrap'")
    if delete_history:
        cmds.delete(lx, constructionHistory=True)
    rec["after"] = deviation(low, high)
    return rec


def bend_test(mesh, joint_points_cm, bend_index=1, angle=90.0, axis="z", max_influences=4):
    """antCGi's throwaway deformation test (x07USYlvu2o): a temporary chain, a default bind, one
    bend, numbers, then everything removed and the rest shape checked. Compare topology variants
    with the SAME joints and settings: loops across the joint are the modeler's job, volume at a
    clean hinge is the rigger's (correctives)."""
    cmds = _cmds()
    import mx_review
    shape, xform = _audit().resolve_mesh(mesh)
    other, deformers = _audit().history_info(shape)
    if other or deformers:
        raise RuntimeError("delete history on %s first (and never run this on a rigged mesh)" % xform)
    d0 = mesh_data(xform)
    k = _ui_per_cm(cmds)
    poses_before = set(cmds.ls(type="dagPose") or [])
    joints, parent = [], None
    for i, p in enumerate(joint_points_cm):
        kw = {"name": "mxBend_jnt%d" % i}
        if parent:
            kw["parent"] = parent
        j = cmds.createNode("joint", **kw)
        cmds.xform(j, worldSpace=True, translation=tuple(c * k for c in p))
        parent = cmds.ls(j, long=True)[0]
        joints.append(parent)
    skin = cmds.skinCluster(joints, xform, toSelectedBones=True, maximumInfluences=int(max_influences),
                            weightDistribution=1, normalizeWeights=1, bindMethod=0,
                            name="mxBend_skinCluster")[0]                # [verify] weightDistribution 1 = neighbors
    j = joints[bend_index]
    attr = j + ".rotate" + axis.upper()
    try:
        cmds.setAttr(attr, mx_review.to_ui_angles((angle,))[0])
        posed = [(p.x, p.y, p.z) for p in _om().MFnMesh(_dag(_om(), _audit().resolve_mesh(xform)[0])).getPoints(
            _om().MSpace.kWorld)]
        m = bend_metrics(d0["faces"], d0["points"], posed)
    finally:
        cmds.setAttr(attr, 0)
        cmds.skinCluster(skin, e=True, unbind=True)
        if cmds.objExists(joints[0]):
            cmds.delete(joints[0])
        new_poses = [n for n in cmds.ls(type="dagPose") or [] if n not in poses_before]
        if new_poses:
            cmds.delete(new_poses)                  # the bind pose the test created
        cmds.delete(xform, constructionHistory=True)
    d1 = mesh_data(xform)
    drift = max(abs(a[i] - b[i]) for a, b in zip(d0["points"], d1["points"]) for i in range(3))
    m.update({"mesh": xform, "angle": angle, "joint": bend_index, "restored": drift < 1e-4, "rest_drift_cm": drift})
    return m


def highlight_review(targets, out_dir, views=("threequarter", "front", "top", "low"), subdiv=None,
                     roughness=0.2, stripes=8, resolution=1024, tile=512, focus=None, with_wire=True, title=None):
    """Mario Elementza's judge: a metallic, low-roughness material on the smoothed surface,
    where pinching shows as dark streaks and wobbling highlights (_bpsEd_5IW4 [00:30:32],
    frames 00:12:45 and 01:38:42). Headless Arnold: temporary duplicates under a striped sky
    dome, optional Arnold subdivision on the duplicates only. A custom mode of mx_review.review
    (public options shader_modes and subdiv: namespace mxReview, everything restored), so it
    no longer depends on mx_review internals (2026-09-24)."""
    import mx_review as R
    t0 = time.time()
    out_dir = os.path.abspath(out_dir)
    made = {}

    def _metal(S):
        c = _cmds()
        t = R.pick_type("aiStandardSurface", "standardSurface", "openPBRSurface")
        metal = c.shadingNode(t, asShader=True, name=S.name("metal"))
        for attr, val in (("base", 1.0), ("metalness", 1.0), ("specularRoughness", roughness),
                          ("baseMetalness", 1.0), ("baseWeight", 1.0)):
            if c.attributeQuery(attr, node=metal, exists=True):
                c.setAttr(metal + "." + attr, val)
        if c.attributeQuery("baseColor", node=metal, exists=True):
            c.setAttr(metal + ".baseColor", 0.9, 0.9, 0.9, type="double3")
        ramp = c.shadingNode("ramp", asTexture=True, name=S.name("stripes"))
        c.setAttr(ramp + ".type", 0)                       # V ramp: bands of latitude on the dome
        c.setAttr(ramp + ".interpolation", 0)              # none: hard stripes
        for i in range(2 * stripes):
            v = 0.95 if i % 2 == 0 else 0.03
            c.setAttr("%s.colorEntryList[%d].position" % (ramp, i), i / float(2 * stripes))
            c.setAttr("%s.colorEntryList[%d].color" % (ramp, i), v, v, v, type="double3")
        made["ramp"] = ramp
        return metal

    modes = ("metal",) + (("wire",) if with_wire else ())
    r = R.review(targets, out_dir, views=tuple(views), modes=modes, resolution=resolution, tile=tile,
                 focus=focus, denoise=True, title=title or "highlight review", subdiv=subdiv,
                 shader_modes={"metal": {"build": _metal, "lit": True, "key_intensity": 0.6,
                                         "dome_color": lambda S: made["ramp"] + ".outColor"}},
                 render_prefix="hl_", sheet_name="highlight_sheet.png", json_name=None)
    rec = {"sheet": r["sheet"], "sheet_size": r["sheet_size"],
           "tiles": {"%s_%s" % (m, v): p for m in modes for v, p in r["tiles"].get(m, {}).items()},
           "cameras": r["cameras"], "notes": r["notes"], "renders": r["renders"], "subdiv": subdiv,
           "seconds": round(time.time() - t0, 2), "targets": r["targets"]}
    with open(os.path.join(out_dir, "highlight_review.json"), "w") as f:
        json.dump(rec, f, indent=1)
    return rec


EXPECTED_BY_RECEIVER = {
    # check ids that may fail at this handoff because the receiver owns them
    "retopology-uv": {"uvs": "UVs are made by scenario-maya-retopology-uv"},
    "rigging": {},
    "lookdev": {},
}


def handoff_report(roots, out_dir, to="retopology-uv", texture_size=2048, max_tris=None, audit_profile="game",
                   symmetric=None, render_levels=None, engine_bound=None, write=True):
    """The modeler's pre-handoff record: mx_validate profile "model" (read-only), mx_audit per
    mesh with verdict, split_report, crease_report, balance and coincident vertices. Failures
    the receiver owns (UVs for scenario-maya-retopology-uv) are listed as pending, not hidden."""
    import mx_validate
    cmds = _cmds()
    t0 = time.time()
    if engine_bound is None:
        engine_bound = audit_profile == "game"
    if symmetric is None:
        symmetric = to == "rigging"
    val = mx_validate.validate(profile="model", roots=roots)
    pending, fails, warns = [], [], []
    allowed = EXPECTED_BY_RECEIVER.get(to, {})
    for c in val.get("checks", []):
        item = {"id": c.get("id"), "message": c.get("message"), "count": c.get("count")}
        if c.get("status") == "fail":
            (pending if c.get("id") in allowed else fails).append(item)
        elif c.get("status") == "warn":
            warns.append(item)
    meshes = []
    for m in _audit().list_meshes(roots):
        r = _audit().audit(m, texture_size=texture_size)
        v = _audit().verdict(r, audit_profile, symmetric=symmetric, max_tris=max_tris)
        entry = {"mesh": m, "verdict": v, "tris": r.get("tris_equivalent"), "ngons": r.get("ngons"),
                 "poles_e6plus": r.get("poles_e6plus"), "dimensions_cm": r.get("dimensions")}
        checks = [("split", split_report, {}), ("creases", crease_report,
                   {"render_levels": render_levels, "engine_bound": engine_bound}),
                  ("balance", balance, {}), ("coincident", coincident_vertices, {}),
                  ("shells", inverted_shells, {})]
        if audit_profile == "subd":
            checks.append(("cage", cage_report, {}))
        for key, fn, kw in checks:
            try:
                entry[key] = fn(m, **kw)
            except Exception as exc:
                entry[key] = {"error": "%s: %s" % (type(exc).__name__, exc)}
        if entry["shells"].get("inverted"):
            v.append("error: %d closed shells inside out (two-sided lighting hides them): reverse %s"
                     % (entry["shells"]["inverted"], entry["shells"]["inverted_faces"][:2]))
        if audit_profile == "subd" and entry["cage"].get("hard_edges"):
            v.append("error: %d hard edges on a SubD cage (faceted patches when smoothed, Mario Elementza "
                     "[01:28:38]): polySoftEdge(angle=180)" % entry["cage"]["hard_edges"])
        if audit_profile == "subd" and entry["cage"].get("fan_poles"):
            v.append("warn: %d triangle-fan poles on a SubD cage: quad cap (Mario [01:14:16]; OpenSubdiv)"
                     % entry["cage"]["fan_poles"])
        if to == "rigging" and r.get("locked_normal_verts"):
            v.append("error: locked normals on a mesh going to rigging (they do not follow skinning)")
        if "uvs" in allowed:                     # UV lines belong to the receiver: list, do not hide
            entry["pending"] = [p for p in v if "UV" in p or "texel" in p]
            entry["verdict"] = [p for p in v if p not in entry["pending"]]
        meshes.append(entry)
    errors = [(e["mesh"], p) for e in meshes for p in e["verdict"] if p.startswith("error")]
    errors += [(e["mesh"], p) for e in meshes for p in e["creases"].get("problems", []) if p.startswith("error")]
    rec = {"to": to, "maya": cmds.about(version=True), "scene": cmds.file(q=True, sceneName=True),
           "validate_summary": val.get("summary"), "validate_fails": fails, "validate_warns": warns,
           "pending_for_receiver": pending,
           "meshes": meshes, "errors": errors, "ok": not fails and not errors,
           "not_verified": ["visual review: open the mx_review sheet and highlight_review sheet yourself",
                            "bake and engine import are downstream checks"],
           "seconds": round(time.time() - t0, 2)}
    if write:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, "handoff_%s.json" % to)
        with open(path, "w") as f:
            json.dump(rec, f, indent=1, default=str)
        rec["json"] = path
    return rec


def rebuild_scene(roots, out_dir, carrier="ma", force=False):
    """FlippedNormals' clean-scene rebuild (ToWRH4IXF7A [00:08:31]): export the asset, open a
    NEW scene, import it. carrier "obj": one combined mesh, drops extra UV sets, creases, vertex
    colors, hierarchy and pivots [added] (film sculpt bases); carrier "ma": exported selection
    without history, keeps hierarchy and UV sets. Replaces the open scene: refuses when it has
    unsaved changes unless force=True."""
    cmds = _cmds()
    if cmds.file(q=True, modified=True) and not force:
        raise RuntimeError("scene has unsaved changes: save a version first")
    os.makedirs(out_dir, exist_ok=True)
    roots = [cmds.ls(r, long=True)[0] for r in roots]
    path = os.path.join(out_dir, "rebuild_carrier." + ("obj" if carrier == "obj" else "ma"))
    cmds.select(roots, replace=True)                  # exportSelected acts on the selection
    try:
        if carrier == "obj":
            if not cmds.pluginInfo("objExport", q=True, loaded=True):
                cmds.loadPlugin("objExport", quiet=True)
            cmds.file(path, force=True, exportSelected=True, type="OBJexport", preserveReferences=False,
                      options="groups=0;ptgroups=0;materials=0;smoothing=1;normals=1")     # [verify]
        else:
            cmds.file(path, force=True, exportSelected=True, type="mayaAscii", preserveReferences=False,
                      constructionHistory=False, channels=False, expressions=False, constraints=False,
                      shader=True)                                                        # [verify]
    finally:
        cmds.select(clear=True)
    cmds.file(new=True, force=True)
    new = cmds.file(path, i=True, type="OBJ" if carrier == "obj" else "mayaAscii", returnNewNodes=True,
                    ignoreVersion=True, mergeNamespacesOnClash=False, defaultNamespace=True) or []  # [verify]
    tops = [n for n in (cmds.ls(new, assemblies=True, long=True) or [])]
    return {"carrier": path, "roots": tops, "imported_nodes": len(new)}


# =========================================================================== CLI (via mx_run)
def main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="mx_modeling")
    ap.add_argument("command", choices=("handoff", "split", "balance", "creases", "highlight", "census",
                                        "cage", "shells"))
    ap.add_argument("--roots", default="", help="comma list")
    ap.add_argument("--mesh", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--to", default="retopology-uv")
    ap.add_argument("--profile", default="game")
    ap.add_argument("--texture-size", type=int, default=2048)
    ap.add_argument("--max-tris", type=int, default=0)
    ap.add_argument("--subdiv", type=int, default=0)
    ap.add_argument("--render-levels", type=int, default=-1)
    a = ap.parse_args(argv)
    roots = [r for r in a.roots.split(",") if r]
    if a.command == "handoff":
        return handoff_report(roots or None, a.out, to=a.to, texture_size=a.texture_size,
                              max_tris=a.max_tris or None, audit_profile=a.profile,
                              render_levels=None if a.render_levels < 0 else a.render_levels)
    if a.command == "highlight":
        return highlight_review(roots or [a.mesh], a.out, subdiv=a.subdiv or None)
    fn = {"split": split_report, "balance": balance, "creases": crease_report, "census": census,
          "cage": cage_report, "shells": inverted_shells}[a.command]
    targets = [a.mesh] if a.mesh else _audit().list_meshes(roots or None)
    return {t: fn(t) for t in targets}
