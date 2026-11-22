"""
mx_retopology_uv: retopology, UV and bake-prep tools for Maya 2027 agents (skill scenario-maya-retopology-uv).

STATUS (2026-09-24): the pure-Python layer (topology walks, ring and lid gates, seam seeds,
camera and texel-density math, mip padding, per-face distortion, UV mirroring and stacking,
cavities, tubes from plane sections, landmark similarity and RBF warp, review camera rays, mesh
mirroring, flag parsing, UV sheet images, and the deformation-ready gate: proxy bends, shear,
area and flip metrics, joint loop checks, topology-vs-rig diagnosis, lid clearance and blink,
silhouette overlap) ran offline with python3 in
tests/code/maya-retopology-uv/test_offline_math.py (99 checks pass). The MAYA functions' own
logic ran against a fake in-memory maya package in test_offline_fake_maya.py (40 checks pass);
that proves the bookkeeping, not Maya's behaviour. Every function whose docstring starts with
MAYA is NOT YET RUN IN MAYA (Maya 2027 was not installed); their tests are
tests/code/maya-retopology-uv/job_*.py, run through <skills>/scenario-maya-expert/scripts/mx_run.py by
run_all.sh.

Use it WITH the lead toolkit, never instead of it:
  mx_audit.audit / verdict   mesh and UV numbers (n-gons, poles, overlaps, per-shell texel density)
  mx_review.review           clay / wire / silhouette / normals contact sheets
  mx_run                     one mayapy child per job
This module adds what those do not: building topology without Quad Draw (template fit, tubes,
relax and project), polyRetopo with probed flags and history removal, ring / lid / joint /
deviation gates, the deformation-ready gate (deform_test, lid_check: is a bad bend the
modeler's or the rigger's fault), texel density SET from a camera-derived target, mip-aware
padding checks, per-face distortion, UV mirroring and stacking, bake copies and cages, high vs
low silhouette overlap, UV sheet images. Skinning itself is scenario-maya-deformation's.

  import sys; sys.path.insert(0, "<skills>/scenario-maya-retopology-uv/scripts")
  import mx_retopology_uv as RU
  RU.retopo_report("body_geo", "scan_high", openings={"eye_L": {"point": (3.1, 162, 8)}})
  RU.uv_report("body_geo", map_size=4096, smallest_mip=1024, target_density=20.48)

Units: MAYA functions read and write world-space centimeters through OpenMaya 2.0 (the
internal unit) whatever the UI unit is; densities are px/cm. MAYA functions write only to meshes
the agent created (duplicates, new meshes): OpenMaya writes bypass undo (Fragapane, Cult of Rig
[01:17:49]), so never point a writer at the user's own mesh in a GUI session.
Thresholds marked [added] are this module's defaults, not expert numbers.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD_SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-maya-expert", "scripts"))
if os.path.isdir(LEAD_SCRIPTS) and LEAD_SCRIPTS not in sys.path:
    sys.path.append(LEAD_SCRIPTS)


# =========================================================================== vector helpers
def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _len(a):
    return math.sqrt(_dot(a, a))


def _unit(a):
    n = _len(a)
    return (a[0] / n, a[1] / n, a[2] / n) if n > 1e-20 else (0.0, 0.0, 0.0)


def _mean(pts):
    n = float(len(pts)) or 1.0
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n, sum(p[2] for p in pts) / n)


def edge_key(a, b):
    return (a, b) if a < b else (b, a)


# =========================================================================== numbers (pure)
def pow2_round(x, mode="nearest"):
    """Power of two for a pixel estimate. Paulino rounds a ~500 px footprint to 512
    (iL2iXizf9xM [00:02:33]); mode "up" follows his "better more than less" [00:03:04]."""
    if x <= 1:
        return 1
    lo = 1 << int(math.floor(math.log2(x)))
    if lo == x:
        return lo
    hi = lo * 2
    if mode == "up":
        return hi
    if mode == "down":
        return lo
    return lo if (x - lo) < (hi - x) else hi


def uv_pixels_for_footprint(screen_px, mode="nearest"):
    """Paulino: UV resolution for a piece = 2 x its on-screen pixels at the closest shot,
    kept a power of two (iL2iXizf9xM [00:02:33] [00:03:04])."""
    return 2 * pow2_round(screen_px, mode)


def density_from_footprint(screen_px, piece_size, mode="nearest"):
    """Texel density (px per scene unit) for every shell, from the reference piece's on-screen
    footprint and its world size. [added] arithmetic of Paulino's method."""
    return uv_pixels_for_footprint(screen_px, mode) / float(piece_size)


def density_for_budget(surface_area, tiles=1, tile_px=2048, packing=0.7):
    """Highest uniform density (px/unit) that fits `tiles` maps of tile_px. packing 0.7 [added]."""
    return math.sqrt(tiles * float(tile_px) ** 2 * packing / float(surface_area))


def udim_estimate(surface_area, px_per_unit, tile_px=4096, packing=0.7):
    """Tiles needed at a density (Paulino's UDIM count logic; packing efficiency [added])."""
    need = float(surface_area) * px_per_unit ** 2
    exact = need / (float(tile_px) ** 2 * packing)
    return {"texels": need, "tiles_exact": round(exact, 4), "tiles": max(1, int(math.ceil(exact - 1e-9)))}


def udim_of(u, v):
    return 1001 + int(math.floor(u)) + 10 * int(math.floor(v))


def mip_padding(map_size, smallest_size=None, shell_px=4, border_px=2):
    """Maya 2027 Help, Shell spacing: 4 px between shells and 2 px to the border on the final
    texture, doubled for every mip or LOD step. 2048 used down to 512 -> 16 px and 8 px."""
    factor = float(map_size) / float(smallest_size or map_size)
    s, b = shell_px * factor, border_px * factor
    return {"shell_px": s, "border_px": b, "shell_uv": s / map_size, "border_uv": b / map_size,
            "factor": factor}


def screen_extent(points_cam, focal_mm=35.0, h_aperture_in=1.417, v_aperture_in=0.945,
                  res=(1920, 1080), fit="fill", ortho_width=None):
    """Pixel extent of camera-space points (Maya cameras look down -Z). fit: fill (Maya
    default), horizontal, vertical, overscan. Film offsets and lens squeeze ignored [added]."""
    rx, ry = res
    dev = rx / float(ry)
    fw, fh = h_aperture_in * 25.4, v_aperture_in * 25.4
    film = fw / fh
    if fit == "horizontal":
        span = fw
    elif fit == "vertical":
        span = fh * dev
    elif fit == "overscan":
        span = fh * dev if dev >= film else fw
    else:
        span = fw if dev >= film else fh * dev
    xs, ys, behind = [], [], 0
    for x, y, z in points_cam:
        if ortho_width:
            fx, fy = x / float(ortho_width), y / float(ortho_width)
        else:
            if z > -1e-9:
                behind += 1
                continue
            fx, fy = focal_mm * x / (-z) / span, focal_mm * y / (-z) / span
        xs.append(rx / 2.0 + fx * rx)
        ys.append(ry / 2.0 - fy * rx)
    if not xs:
        return {"width_px": 0.0, "height_px": 0.0, "max_px": 0.0, "behind": behind, "in_frame": 0.0}
    inside = sum(1 for x, y in zip(xs, ys) if 0 <= x <= rx and 0 <= y <= ry)
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    return {"width_px": round(w, 3), "height_px": round(h, 3), "max_px": round(max(w, h), 3),
            "bbox_px": [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)],
            "behind": behind, "in_frame": round(inside / float(len(xs)), 4)}


# =========================================================================== flags (pure)
_FLAG_RE = re.compile(r"^\s*-(\w+)\s+-(\w+)\b", re.M)


def parse_help_flags(text):
    """{long: short} from cmds.help(<command>) text. The lead's rule: never guess a flag."""
    return {long_: short for short, long_ in _FLAG_RE.findall(text or "")}


# =========================================================================== topology (pure)
def faces_of(counts, connects):
    out, off = [], 0
    for c in counts:
        out.append(list(connects[off:off + c]))
        off += c
    return out


def uv_faces(uv_counts, uv_ids, nfaces):
    """Per-face UV id lists (None for an unmapped face) from MFnMesh.getAssignedUVs()."""
    out, off = [], 0
    for i in range(nfaces):
        c = uv_counts[i] if i < len(uv_counts) else 0
        if c > 0:
            out.append(list(uv_ids[off:off + c]))
            off += c
        else:
            out.append(None)
    return out


def triangles_of(faces):
    """Fan triangulation (flat list of vertex ids)."""
    out = []
    for f in faces:
        for j in range(1, len(f) - 1):
            out += [f[0], f[j], f[j + 1]]
    return out


def face_area(points, f):
    """Newell vector area (exact for planar polygons)."""
    nx = ny = nz = 0.0
    n = len(f)
    for j in range(n):
        p, q = points[f[j]], points[f[(j + 1) % n]]
        nx += (p[1] - q[1]) * (p[2] + q[2])
        ny += (p[2] - q[2]) * (p[0] + q[0])
        nz += (p[0] - q[0]) * (p[1] + q[1])
    return 0.5 * math.sqrt(nx * nx + ny * ny + nz * nz), (nx, ny, nz)


def uv_area(u, v, ids):
    s = 0.0
    n = len(ids)
    for j in range(n):
        a, b = ids[j], ids[(j + 1) % n]
        s += u[a] * v[b] - u[b] * v[a]
    return 0.5 * s


def vertex_normals(points, faces):
    """Area-weighted vertex normals by topology (hard edges do not split them)."""
    acc = [[0.0, 0.0, 0.0] for _ in points]
    for f in faces:
        _, n = face_area(points, f)
        for vtx in f:
            a = acc[vtx]
            a[0] += n[0]
            a[1] += n[1]
            a[2] += n[2]
    return [_unit(tuple(a)) for a in acc]


class Topology(object):
    """Adjacency of a polygon mesh given as face vertex lists. Pure Python."""

    def __init__(self, faces, nverts):
        self.faces = faces
        self.n = nverts
        self.ef = {}
        self.vf = [[] for _ in range(nverts)]
        nb = [set() for _ in range(nverts)]
        for fi, f in enumerate(faces):
            m = len(f)
            for j in range(m):
                a, b = f[j], f[(j + 1) % m]
                self.ef.setdefault(edge_key(a, b), []).append(fi)
                nb[a].add(b)
                nb[b].add(a)
                self.vf[a].append(fi)
        self.nb = [sorted(s) for s in nb]
        self.border_edges = [k for k, fs in self.ef.items() if len(fs) == 1]
        self.border_v = bytearray(nverts)
        for a, b in self.border_edges:
            self.border_v[a] = self.border_v[b] = 1

    def valence(self, v):
        return len(self.nb[v])

    def poles(self):
        """Interior vertices with valence other than 4: [(vertex, valence)]."""
        return [(v, len(self.nb[v])) for v in range(self.n)
                if self.nb[v] and not self.border_v[v] and len(self.nb[v]) != 4]

    def border_loops(self):
        """Ordered vertex loops of the open borders (eye holes, cut necks, mouth openings)."""
        nxt = {}
        for f in self.faces:
            m = len(f)
            for j in range(m):
                a, b = f[j], f[(j + 1) % m]
                if len(self.ef[edge_key(a, b)]) == 1:
                    nxt.setdefault(a, []).append(b)
        loops, used = [], set()
        for start in sorted(nxt):
            for first in nxt[start]:
                if (start, first) in used:
                    continue
                loop, cur = [start], first
                used.add((start, first))
                while cur != start and cur in nxt:
                    loop.append(cur)
                    cand = [b for b in nxt[cur] if (cur, b) not in used]
                    if not cand:
                        break
                    used.add((cur, cand[0]))
                    cur = cand[0]
                loops.append(loop)
        return loops

    def _step(self, prev, cur):
        """Next vertex of a quad edge loop through cur, or None at poles and borders. A border
        edge continues along its border (Maya's loop selection on a border edge)."""
        fs = set(self.ef.get(edge_key(prev, cur), ()))
        if len(fs) == 1:
            cand = [n for n in self.nb[cur] if n != prev and len(self.ef[edge_key(cur, n)]) == 1]
            return cand[0] if len(cand) == 1 else None
        if len(self.nb[cur]) != 4 or self.border_v[cur]:
            return None
        cand = [n for n in self.nb[cur] if n != prev and not (set(self.ef[edge_key(cur, n)]) & fs)]
        return cand[0] if len(cand) == 1 else None

    def edge_loop(self, a, b, max_len=200000):
        """Vertex path of the edge loop through edge (a, b); (path, closed). Stops at poles and
        borders like Maya's loop selection [added]."""
        path, seen = [a, b], {a, b}
        prev, cur = a, b
        closed = False
        while len(path) < max_len:
            n = self._step(prev, cur)
            if n is None:
                break
            if n == path[0]:
                closed = True
                break
            if n in seen:
                break
            path.append(n)
            seen.add(n)
            prev, cur = cur, n
        if not closed:
            back, prev, cur = [], b, a
            while len(path) + len(back) < max_len:
                n = self._step(prev, cur)
                if n is None or n in seen:
                    break
                back.append(n)
                seen.add(n)
                prev, cur = cur, n
            path = back[::-1] + path
        return path, closed

    def _components(self, verts):
        verts = set(verts)
        comps, seen = [], set()
        for s in verts:
            if s in seen:
                continue
            comp, stack = [], [s]
            seen.add(s)
            while stack:
                x = stack.pop()
                comp.append(x)
                for y in self.nb[x]:
                    if y in verts and y not in seen:
                        seen.add(y)
                        stack.append(y)
            comps.append(comp)
        return comps

    def rings_around(self, loop, points=None, max_rings=6):
        """Concentric rings around a loop (eye hole, lip line). A ring is 'clean' when it is one
        closed cycle whose vertices all have valence 4. Border vertices count as regular."""
        visited, frontier = set(loop), set(loop)
        c = _mean([points[v] for v in loop]) if points else None
        r0 = (sum(_len(_sub(points[v], c)) for v in loop) / len(loop)) if points else None
        layers = []
        for _ in range(max_rings):
            nxt = set(b for a in frontier for b in self.nb[a] if b not in visited)
            if not nxt:
                break
            visited |= nxt
            layer = []
            for comp in self._components(nxt):
                cs = set(comp)
                cycle = all(sum(1 for y in self.nb[x] if y in cs) == 2 for x in comp)
                poles = [x for x in comp if not self.border_v[x] and len(self.nb[x]) != 4]
                entry = {"count": len(comp), "cycle": cycle, "poles": len(poles), "pole_ids": poles[:10]}
                if points:
                    rad = sum(_len(_sub(points[x], c)) for x in comp) / len(comp)
                    entry["radius"] = round(rad, 5)
                    entry["side"] = "outer" if rad >= r0 else "inner"
                else:
                    entry["side"] = "outer"
                layer.append(entry)
            layers.append(layer)
            frontier = nxt
        clean = 0
        for layer in layers:
            outer = [e for e in layer if e["side"] == "outer"]
            if len(outer) == 1 and outer[0]["cycle"] and outer[0]["poles"] == 0:
                clean += 1
            else:
                break
        return {"loop_count": len(loop), "layers": layers, "clean_outer_rings": clean}

    def relax_neighbors(self, border="slide"):
        """Neighbour lists for relaxing. border: slide (border verts follow their border, the
        Quad Draw Auto-Lock idea), lock (border fixed), free."""
        out = []
        bset = set(self.border_edges)
        for v in range(self.n):
            if self.border_v[v]:
                if border == "lock":
                    out.append([])
                elif border == "slide":
                    out.append([n for n in self.nb[v] if edge_key(v, n) in bset])
                else:
                    out.append(list(self.nb[v]))
            else:
                out.append(list(self.nb[v]))
        return out


def arc_counts(loop, a, b):
    """Edges on the two arcs of a closed loop between corners a and b (upper vs lower lid or
    lip). Equal counts: FlippedNormals 9N4rG5qHWgk [00:21:41]; antCGi RlNnp4qQIrU [00:05:22]."""
    ia, ib = loop.index(a), loop.index(b)
    d = (ib - ia) % len(loop)
    return d, len(loop) - d


def corners_by_axis(loop, points, axis=0):
    """Loop vertices at the two extremes along an axis (eye corners, mouth corners)."""
    lo = min(loop, key=lambda v: points[v][axis])
    hi = max(loop, key=lambda v: points[v][axis])
    return lo, hi


def crossings(points, path, center, axis, half_band):
    """Vertices of an along-the-limb loop inside a band around a joint = cross loops at the
    joint. Jessica Dru Johnson's rule of threes: 1 control + 2 support (ZiYEO49B768 [01:15:51])."""
    ax = _unit(axis)
    return sum(1 for v in path if abs(_dot(_sub(points[v], center), ax)) <= half_band)


def limb_seed_edge(points, topo, center, axis, radius):
    """Edge near a joint most parallel to the bone axis (to walk the along-limb loop)."""
    ax = _unit(axis)
    best, score = None, -1.0
    for a, b in topo.ef:
        m = _mul(_add(points[a], points[b]), 0.5)
        if _len(_sub(m, center)) > radius:
            continue
        s = abs(_dot(_unit(_sub(points[b], points[a])), ax))
        if s > score:
            best, score = (a, b), s
    return best, score


def seam_seed(points, topo, center, axis, radius, kind="ring", prefer=None):
    """Edge that starts a planned seam loop near a landmark. kind "ring": the edge most
    perpendicular to the limb axis closest to the joint plane (neck base, wrist, waist, boot
    top); kind "along": the edge most parallel to the axis on the `prefer` side (back of the
    arm, inner leg: seams where the camera does not look, Maya 2027 Help; MLC [00:03:36])."""
    ax = _unit(axis)
    best, score = None, None
    for a, b in topo.ef:
        m = _mul(_add(points[a], points[b]), 0.5)
        r = _sub(m, center)
        if _len(r) > radius:
            continue
        par = abs(_dot(_unit(_sub(points[b], points[a])), ax))
        if kind == "ring":
            s = (round(par, 6), abs(_dot(r, ax)))
        else:
            radial = _sub(r, _mul(ax, _dot(r, ax)))
            side = _dot(_unit(radial), _unit(prefer)) if prefer else 0.0
            s = (round(-par, 6), -side)
        if score is None or s < score:
            best, score = (a, b), s
    return best


def center_split(points, axis=0, on_tol=1e-4, band=1e-2):
    """Vertices on the center line and vertices drifting in the band (antCGi checks the
    1e-4 to 1e-2 band, QW8w15J00Ok; FlippedNormals fixed 0.01 to 0, 9N4rG5qHWgk [00:19:06])."""
    on, drift = [], []
    for i, p in enumerate(points):
        a = abs(p[axis])
        if a <= on_tol:
            on.append(i)
        elif a <= band:
            drift.append(i)
    return on, drift


def deviation_stats(dists, ref_len=None):
    if not dists:
        return {"n": 0}
    s = sorted(abs(d) for d in dists)
    n = len(s)
    out = {"n": n, "mean": sum(s) / n, "p95": s[min(n - 1, int(0.95 * n))], "max": s[-1]}
    if ref_len:
        for k in ("mean", "p95", "max"):
            out[k + "_rel_edge"] = out[k] / ref_len
    return {k: (round(v, 6) if isinstance(v, float) else v) for k, v in out.items()}


def laplacian_step(points, nbrs, locked=(), strength=0.5, normals=None):
    """One relax pass. With normals, the move is tangential (shape kept, spacing evened), the
    projection substitute for Quad Draw's Shift-drag relax [added]."""
    locked = set(locked)
    out = list(points)
    for i, nb in enumerate(nbrs):
        if i in locked or not nb:
            continue
        p = points[i]
        k = 1.0 / len(nb)
        avg = (sum(points[j][0] for j in nb) * k, sum(points[j][1] for j in nb) * k,
               sum(points[j][2] for j in nb) * k)
        d = _sub(avg, p)
        if normals is not None:
            n = normals[i]
            d = _sub(d, _mul(n, _dot(d, n)))
        out[i] = _add(p, _mul(d, strength))
    return out


def mirror_arrays(points, faces, axis=0, tol=1e-3, keep_sign=1):
    """Mirror a half mesh into a whole one with the center line welded at `tol`. antCGi:
    custom merge threshold 0.001, never the automatic one (QW8w15J00Ok [00:02:24] [00:02:56]).
    Faces made only of center vertices are not duplicated (they would become lamina)."""
    center = set(i for i, p in enumerate(points) if abs(p[axis]) <= tol)
    wrong = [i for i, p in enumerate(points) if i not in center and p[axis] * keep_sign < 0]
    new_pts = []
    for i, p in enumerate(points):
        q = list(p)
        if i in center:
            q[axis] = 0.0
        new_pts.append(tuple(q))
    idx = {}
    for i, p in enumerate(points):
        if i in center:
            idx[i] = i
        else:
            idx[i] = len(new_pts)
            q = list(p)
            q[axis] = -q[axis]
            new_pts.append(tuple(q))
    new_faces = [list(f) for f in faces]
    skipped = 0
    for f in faces:
        if all(v in center for v in f):
            skipped += 1
            continue
        new_faces.append([idx[v] for v in reversed(f)])
    return {"points": new_pts, "faces": new_faces, "center_verts": len(center),
            "wrong_side_verts": len(wrong), "center_only_faces": skipped}


def cavity_arrays(points, faces, loop, depth, steps=3, scale=0.85, inward=None, close=True):
    """Extrude an open border loop inward into a pocket: mouth bag, nostril recess, eye pouch
    (FlippedNormals extrude the lip border inward repeatedly, 9N4rG5qHWgk [00:26:20] [00:27:22];
    nostrils as recesses because SSS misbehaves on solid ones [00:25:16]). loop must follow the
    face winding (Topology.border_loops order). Each ring shrinks by `scale` toward the loop
    centroid and moves depth/steps along `inward` (default: minus the mean normal around the
    loop). close caps the pocket with a triangle fan (hidden triangles in a cavity are accepted,
    [00:03:41]). Returns {points, faces, new_verts}."""
    pts = [tuple(p) for p in points]
    out_faces = [list(f) for f in faces]
    c = _mean([pts[v] for v in loop])
    if inward is None:
        nrm = vertex_normals(pts, faces)
        inward = _mul(_unit(_mean([nrm[v] for v in loop])), -1.0)
    inward = _unit(inward)
    ring = list(loop)
    n = len(loop)
    added = 0
    for k in range(1, steps + 1):
        new = []
        for v in loop:
            p = pts[v]
            q = _add(_add(c, _mul(_sub(p, c), scale ** k)), _mul(inward, depth * k / float(steps)))
            new.append(len(pts))
            pts.append(q)
            added += 1
        for i in range(n):
            j = (i + 1) % n
            out_faces.append([ring[j], ring[i], new[i], new[j]])
        ring = new
    if close:
        tip = len(pts)
        pts.append(_add(c, _mul(inward, depth * (steps + 0.5) / float(steps))))
        added += 1
        for i in range(n):
            j = (i + 1) % n
            out_faces.append([ring[j], ring[i], tip])
    return {"points": pts, "faces": out_faces, "new_verts": added}


def udim_table(u, v, fuv, default_res=4096, overrides=None):
    """Per-UDIM tile: faces, shells and the texture resolution the painter should use (Paulino
    keeps density by painting a half-scaled shell's tile at 8K, iL2iXizf9xM [00:05:48])."""
    overrides = overrides or {}
    _, shell_face, _ = uv_shell_ids(fuv, len(u))
    tiles = {}
    for fi, ids in enumerate(fuv):
        if not ids:
            continue
        cu = sum(u[i] for i in ids) / len(ids)
        cv = sum(v[i] for i in ids) / len(ids)
        t = udim_of(cu, cv)
        e = tiles.setdefault(t, {"udim": t, "faces": 0, "shells": set()})
        e["faces"] += 1
        e["shells"].add(shell_face[fi])
    return [{"udim": t, "faces": e["faces"], "shells": len(e["shells"]),
             "resolution": overrides.get(t, default_res)} for t, e in sorted(tiles.items())]


def view_frame(points, view, margin=1.1, up_axis="y", focus=None):
    """The camera mx_review.review uses for a view (same framing math), so a pixel on its tile
    can be turned into a ray. points: the targets' points in UI units, as mx_review samples them."""
    import mx_review
    d = mx_review.map_dir(mx_review.VIEW_DIRS[view], up_axis)
    if focus:
        center = tuple(focus[0])
        rad = float(focus[1])
        points = [_add(center, _mul(a, rad)) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    else:
        lo = [min(p[i] for p in points) for i in range(3)]
        hi = [max(p[i] for p in points) for i in range(3)]
        center = tuple((lo[i] + hi[i]) / 2.0 for i in range(3))
    persp = view in mx_review.PERSPECTIVE
    fr = mx_review.frame(points, center, d, persp, margin, up_axis)
    right, up, fwd = mx_review.basis(d, up_axis)
    fr.update(center=center, eye=_add(center, _mul(_unit(d), fr["distance"])), right=right, up=up, fwd=fwd,
              perspective=persp, tan_half=(mx_review.APERTURE_IN * 25.4 / 2.0) / mx_review.FOCAL_MM)
    return fr


def pixel_ray(frame, px, py, res):
    """Ray (origin, direction) through pixel (px, py) of a square render of `res` pixels, top-left
    origin, for a frame from view_frame."""
    nx = (px + 0.5) / float(res) * 2.0 - 1.0
    ny = 1.0 - (py + 0.5) / float(res) * 2.0
    if frame["perspective"]:
        t = frame["tan_half"]
        dvec = _unit(_add(frame["fwd"], _add(_mul(frame["right"], nx * t), _mul(frame["up"], ny * t))))
        return frame["eye"], dvec
    half = frame["ortho_width"] / 2.0
    o = _add(frame["eye"], _add(_mul(frame["right"], nx * half), _mul(frame["up"], ny * half)))
    return o, frame["fwd"]


# =========================================================================== landmark fit (pure)
def _jacobi_eig(a, iters=100):
    """Eigen decomposition of a small symmetric matrix (list of lists). Returns (w, V cols)."""
    n = len(a)
    a = [row[:] for row in a]
    v = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _ in range(iters):
        off = sum(a[i][j] ** 2 for i in range(n) for j in range(n) if i != j)
        if off < 1e-22:
            break
        for p in range(n):
            for q in range(p + 1, n):
                if abs(a[p][q]) < 1e-30:
                    continue
                theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q])
                t = (1.0 if theta >= 0 else -1.0) / (abs(theta) + math.sqrt(theta * theta + 1.0))
                c = 1.0 / math.sqrt(t * t + 1.0)
                s = t * c
                for k in range(n):
                    akp, akq = a[k][p], a[k][q]
                    a[k][p], a[k][q] = c * akp - s * akq, s * akp + c * akq
                for k in range(n):
                    apk, aqk = a[p][k], a[q][k]
                    a[p][k], a[q][k] = c * apk - s * aqk, s * apk + c * aqk
                for k in range(n):
                    vkp, vkq = v[k][p], v[k][q]
                    v[k][p], v[k][q] = c * vkp - s * vkq, s * vkp + c * vkq
    return [a[i][i] for i in range(n)], v


def similarity_fit(src, dst, scale=True):
    """Rotation, uniform scale and translation mapping src landmarks onto dst (Horn's
    quaternion method). Returns {R (rows), s, t, rms}. Apply with apply_similarity."""
    n = len(src)
    if n < 3:
        raise ValueError("need at least 3 landmark pairs")
    ca, cb = _mean(src), _mean(dst)
    A = [_sub(p, ca) for p in src]
    B = [_sub(q, cb) for q in dst]
    S = [[sum(a[i] * b[j] for a, b in zip(A, B)) for j in range(3)] for i in range(3)]
    (sxx, sxy, sxz), (syx, syy, syz), (szx, szy, szz) = S
    N = [[sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
         [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
         [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
         [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]]
    w, V = _jacobi_eig(N)
    k = max(range(4), key=lambda i: w[i])
    qw, qx, qy, qz = (V[0][k], V[1][k], V[2][k], V[3][k])
    R = [[1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
         [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
         [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]]

    def rot(p):
        return (_dot(R[0], p), _dot(R[1], p), _dot(R[2], p))

    s = 1.0
    if scale:
        den = sum(_dot(a, a) for a in A)
        s = sum(_dot(b, rot(a)) for a, b in zip(A, B)) / den if den else 1.0
    t = _sub(cb, _mul(rot(ca), s))
    fit = {"R": R, "s": s, "t": t}
    err = [_len(_sub(apply_similarity(fit, p), q)) for p, q in zip(src, dst)]
    fit["rms"] = math.sqrt(sum(e * e for e in err) / n)
    return fit


def apply_similarity(fit, p):
    R, s, t = fit["R"], fit["s"], fit["t"]
    return (s * _dot(R[0], p) + t[0], s * _dot(R[1], p) + t[1], s * _dot(R[2], p) + t[2])


def _solve(M, rhs):
    """Gaussian elimination with partial pivoting; rhs is a list of columns."""
    n = len(M)
    A = [M[i][:] + [col[i] for col in rhs] for i in range(n)]
    m = len(rhs)
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(A[r][c]))
        if abs(A[piv][c]) < 1e-14:
            raise ValueError("singular system (landmarks coplanar or duplicated?)")
        A[c], A[piv] = A[piv], A[c]
        for r in range(c + 1, n):
            f = A[r][c] / A[c][c]
            if f:
                for k in range(c, n + m):
                    A[r][k] -= f * A[c][k]
    X = [[0.0] * n for _ in range(m)]
    for j in range(m):
        for r in range(n - 1, -1, -1):
            s = A[r][n + j] - sum(A[r][k] * X[j][k] for k in range(r + 1, n))
            X[j][r] = s / A[r][r]
    return X


def rbf_warp(src, dst, smooth=0.0):
    """Landmark warp with the biharmonic kernel phi(r) = r plus an affine part. Returns f(p).
    smooth > 0 relaxes exact interpolation [added]. Needs 4+ non-coplanar landmarks."""
    n = len(src)
    M = [[0.0] * (n + 4) for _ in range(n + 4)]
    for i in range(n):
        for j in range(n):
            M[i][j] = _len(_sub(src[i], src[j])) + (smooth if i == j else 0.0)
        row = (1.0,) + tuple(src[i])
        for k in range(4):
            M[i][n + k] = row[k]
            M[n + k][i] = row[k]
    rhs = [[dst[i][d] - src[i][d] for i in range(n)] + [0.0] * 4 for d in range(3)]
    W = _solve(M, rhs)

    def f(p):
        out = []
        for d in range(3):
            w = W[d]
            val = p[d] + w[n] + w[n + 1] * p[0] + w[n + 2] * p[1] + w[n + 3] * p[2]
            for i in range(n):
                val += w[i] * _len(_sub(p, src[i]))
            out.append(val)
        return tuple(out)
    return f


# =========================================================================== tubes from sections (pure)
class TriIndex(object):
    """Uniform grid over triangles for local plane sections of a dense source."""

    def __init__(self, points, tris, cell):
        self.points, self.tris, self.cell = points, tris, float(cell)
        self.grid = {}
        c = self.cell
        for t in range(len(tris) // 3):
            ps = [points[tris[3 * t + k]] for k in range(3)]
            lo = [int(math.floor(min(p[i] for p in ps) / c)) for i in range(3)]
            hi = [int(math.floor(max(p[i] for p in ps) / c)) for i in range(3)]
            for x in range(lo[0], hi[0] + 1):
                for y in range(lo[1], hi[1] + 1):
                    for z in range(lo[2], hi[2] + 1):
                        self.grid.setdefault((x, y, z), []).append(t)

    def near(self, p, r):
        c = self.cell
        lo = [int(math.floor((p[i] - r) / c)) for i in range(3)]
        hi = [int(math.floor((p[i] + r) / c)) for i in range(3)]
        out = set()
        for x in range(lo[0], hi[0] + 1):
            for y in range(lo[1], hi[1] + 1):
                for z in range(lo[2], hi[2] + 1):
                    out.update(self.grid.get((x, y, z), ()))
        return out


def plane_section_loops(points, tris, origin, normal, index=None, radius=None):
    """Closed polylines where a plane cuts a triangle mesh (works on triangle soup too, as long
    as neighbouring triangles share vertices). Returns a list of 3D point loops."""
    n = _unit(normal)
    cand = index.near(origin, radius) if (index is not None and radius) else range(len(tris) // 3)
    scale = radius or 1.0
    eps = 1e-9 * scale
    dist = {}

    def sd(v):
        d = dist.get(v)
        if d is None:
            d = _dot(_sub(points[v], origin), n)
            if abs(d) < eps:
                d = eps
            dist[v] = d
        return d

    pos, adj = {}, {}
    for t in cand:
        ids = tris[3 * t:3 * t + 3]
        ds = [sd(v) for v in ids]
        if (ds[0] > 0) == (ds[1] > 0) == (ds[2] > 0):
            continue
        keys = []
        for j in range(3):
            a, b = ids[j], ids[(j + 1) % 3]
            da, db = ds[j], ds[(j + 1) % 3]
            if (da > 0) != (db > 0):
                k = edge_key(a, b)
                if k not in pos:
                    w = da / (da - db)
                    pos[k] = _add(points[a], _mul(_sub(points[b], points[a]), w))
                keys.append(k)
        if len(keys) == 2 and keys[0] != keys[1]:
            adj.setdefault(keys[0], []).append(keys[1])
            adj.setdefault(keys[1], []).append(keys[0])
    loops, seen = [], set()
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        closed = False
        while True:
            nxt = [k for k in adj[cur] if k != prev]
            if not nxt:
                break
            k = nxt[0]
            if k == start:
                closed = True
                break
            if k in seen:
                break
            loop.append(k)
            seen.add(k)
            prev, cur = cur, k
        if closed and len(loop) >= 3:
            loops.append([pos[k] for k in loop])
    return loops


def _plane_basis(normal, ref):
    n = _unit(normal)
    e1 = _sub(ref, _mul(n, _dot(ref, n)))
    if _len(e1) < 1e-8:
        alt = (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0)
        e1 = _sub(alt, _mul(n, _dot(alt, n)))
    e1 = _unit(e1)
    return e1, _cross(n, e1)


def _poly_contains(pts2, x, y):
    inside = False
    m = len(pts2)
    for i in range(m):
        (x1, y1), (x2, y2) = pts2[i], pts2[(i + 1) % m]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xi > x:
                inside = not inside
    return inside


def _poly_area2(pts2):
    return 0.5 * sum(pts2[i][0] * pts2[(i + 1) % len(pts2)][1] - pts2[(i + 1) % len(pts2)][0] * pts2[i][1]
                     for i in range(len(pts2)))


def pick_section(loops, origin, e1, e2):
    """The smallest loop that encloses the station point, else the nearest one."""
    best, best_area = None, None
    for lp in loops:
        p2 = [(_dot(_sub(p, origin), e1), _dot(_sub(p, origin), e2)) for p in lp]
        if _poly_contains(p2, 0.0, 0.0):
            a = abs(_poly_area2(p2))
            if best is None or a < best_area:
                best, best_area = lp, a
    if best is None and loops:
        best = min(loops, key=lambda lp: _len(_sub(_mean(lp), origin)))
    return best


def resample_by_angle(loop, origin, e1, e2, sides, start_angle=0.0):
    """N points on a section loop at equal angles around the station point (rays from the
    center; the farthest hit is kept on non star-shaped sections [added])."""
    p2 = [(_dot(_sub(p, origin), e1), _dot(_sub(p, origin), e2)) for p in loop]
    m = len(loop)
    out = []
    for k in range(sides):
        th = start_angle + 2.0 * math.pi * k / sides
        dx, dy = math.cos(th), math.sin(th)
        best_t, best_pt = None, None
        for i in range(m):
            (ax, ay), (bx, by) = p2[i], p2[(i + 1) % m]
            ex, ey = bx - ax, by - ay
            den = dx * ey - dy * ex
            if abs(den) < 1e-15:
                continue
            t = (ax * ey - ay * ex) / den
            s = (ax * dy - ay * dx) / den
            if t > 0 and -1e-9 <= s <= 1 + 1e-9:
                if best_t is None or t > best_t:
                    best_t = t
                    best_pt = _add(loop[i], _mul(_sub(loop[(i + 1) % m], loop[i]), min(1.0, max(0.0, s))))
        out.append(best_pt)
    return out


def path_length(path):
    return sum(_len(_sub(path[i + 1], path[i])) for i in range(len(path) - 1))


def path_frame(path, s, blend=None):
    """Point and tangent at arc length s along a polyline. Near an interior vertex (a joint)
    the tangent blends toward the bisector, so the joint ring sits halfway through the bend."""
    seg = [_len(_sub(path[i + 1], path[i])) for i in range(len(path) - 1)]
    acc = 0.0
    for i, L in enumerate(seg):
        if s <= acc + L or i == len(seg) - 1:
            w = min(1.0, max(0.0, (s - acc) / L)) if L else 0.0
            p = _add(path[i], _mul(_sub(path[i + 1], path[i]), w))
            t = _unit(_sub(path[i + 1], path[i]))
            blend_len = blend if blend is not None else 0.5 * L
            for j, sj in ((i, acc), (i + 1, acc + L)):
                if 0 < j < len(path) - 1 and blend_len > 0 and abs(s - sj) < blend_len:
                    bis = _unit(_add(_unit(_sub(path[j], path[j - 1])), _unit(_sub(path[j + 1], path[j]))))
                    k = abs(s - sj) / blend_len
                    t = _unit(_add(_mul(bis, 1.0 - k), _mul(t, k)))
            return p, t
        acc += L
    return path[-1], _unit(_sub(path[-1], path[-2]))


def limb_stations(path, joint_span, spacing, joints=None, start=0.0, end=None):
    """Arc-length stations: at each joint one control ring plus one support ring on each side
    (Jessica Dru Johnson: 1 control + 2 support, ZiYEO49B768 [01:15:51]), filled in between at
    `spacing` or finer. joints: interior path indices (default all)."""
    cum = [0.0]
    for i in range(len(path) - 1):
        cum.append(cum[-1] + _len(_sub(path[i + 1], path[i])))
    end = cum[-1] if end is None else end
    jidx = list(range(1, len(path) - 1)) if joints is None else list(joints)
    fixed = [start, end]
    for j in jidx:
        fixed += [cum[j] - joint_span, cum[j], cum[j] + joint_span]
    fixed = sorted(set(round(x, 9) for x in fixed if start <= x <= end))
    out = []
    for a, b in zip(fixed[:-1], fixed[1:]):
        k = max(1, int(math.ceil((b - a) / float(spacing) - 1e-9)))
        out += [a + (b - a) * i / k for i in range(k)]
    out.append(fixed[-1])
    merged = []
    for x in out:
        if not merged or x - merged[-1] > joint_span * 0.25:
            merged.append(x)
    return merged


def tube_from_sections(points, tris, path, stations, sides=8, radius=None, ref=(0.0, 1.0, 0.0),
                       index=None, start_angle=0.0):
    """Quad tube (limb, finger, sleeve, tail, strap) from plane sections of the source along a
    path. Returns {points, faces, rings, stations_used, failed}. Ends stay open for bridging."""
    total = path_length(path)
    if radius is None:
        radius = 0.25 * total
    if index is None and len(tris) > 3000:
        index = TriIndex(points, tris, radius)
    rings, used, failed = [], [], []
    e1_prev = None
    for s in stations:
        o, t = path_frame(path, s)
        e1, e2 = _plane_basis(t, e1_prev if e1_prev is not None else ref)
        loops = plane_section_loops(points, tris, o, t, index=index, radius=radius)
        lp = pick_section(loops, o, e1, e2)
        if not lp:
            failed.append(s)
            continue
        ring = resample_by_angle(lp, o, e1, e2, sides, start_angle)
        if any(p is None for p in ring):
            failed.append(s)
            continue
        rings.append(ring)
        used.append(s)
        e1_prev = e1
    pts, faces = [], []
    for ring in rings:
        pts += ring
    for r in range(len(rings) - 1):
        a0, b0 = r * sides, (r + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append([a0 + i, a0 + j, b0 + j, b0 + i])
    return {"points": pts, "faces": faces, "rings": len(rings), "stations_used": used,
            "failed": failed, "sides": sides}


# =========================================================================== UV analysis (pure)
class _UF(object):
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        p = self.p
        while p[x] != x:
            p[x] = p[p[x]]
            x = p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def uv_shell_ids(fuv, nuv):
    """(shell id per UV, shell id per face or None, shell count)."""
    uf = _UF(nuv)
    for ids in fuv:
        if ids:
            for x in ids[1:]:
                uf.union(ids[0], x)
    remap, shell_uv = {}, [None] * nuv
    for i in range(nuv):
        r = uf.find(i)
        shell_uv[i] = remap.setdefault(r, len(remap))
    shell_face = [shell_uv[ids[0]] if ids else None for ids in fuv]
    used = sorted(set(s for s in shell_face if s is not None))
    dense = {s: k for k, s in enumerate(used)}
    shell_face = [dense[s] if s is not None else None for s in shell_face]
    shell_uv = [dense.get(s) for s in shell_uv]
    return shell_uv, shell_face, len(used)


def shell_densities(points, faces, u, v, fuv, map_size, shell_face=None):
    """{shell: {px_per_unit, area_3d, uv_area, bbox}} (same formula as mx_audit:
    map_size * sqrt(uv area / world area)). Used to SET density, mx_audit to gate it."""
    if shell_face is None:
        _, shell_face, _ = uv_shell_ids(fuv, len(u))
    acc = {}
    for fi, ids in enumerate(fuv):
        if not ids:
            continue
        s = shell_face[fi]
        a3, _ = face_area(points, faces[fi])
        e = acc.setdefault(s, {"area_3d": 0.0, "uv_area": 0.0, "bbox": [1e30, 1e30, -1e30, -1e30]})
        e["area_3d"] += a3
        e["uv_area"] += abs(uv_area(u, v, ids))
        b = e["bbox"]
        for i in ids:
            b[0], b[1] = min(b[0], u[i]), min(b[1], v[i])
            b[2], b[3] = max(b[2], u[i]), max(b[3], v[i])
    for s, e in acc.items():
        e["px_per_unit"] = map_size * math.sqrt(e["uv_area"] / e["area_3d"]) if e["area_3d"] > 0 else 0.0
    return acc


def density_scales(shell_td, target, bias=None):
    """Per-shell scale factors to reach target * bias (games: head bias, MLC s_KLbTUdKms [00:10:57])."""
    bias = bias or {}
    return {s: (target * bias.get(s, 1.0)) / td for s, td in shell_td.items() if td > 0}


def scale_uvs(u, v, shell_uv, scales, pivots):
    """New u, v lists with each shell scaled about its pivot."""
    nu, nv = list(u), list(v)
    for i in range(len(u)):
        s = shell_uv[i]
        if s in scales:
            k = scales[s]
            pu, pv = pivots[s]
            nu[i] = pu + (u[i] - pu) * k
            nv[i] = pv + (v[i] - pv) * k
    return nu, nv


def orient_angle(uv_a, uv_b, axis="v"):
    """Degrees to rotate a shell so the UV edge a-b lies along V (or U), smallest rotation
    (the MLC Orient to Edges step, s_KLbTUdKms [00:03:10])."""
    ang = math.degrees(math.atan2(uv_b[1] - uv_a[1], uv_b[0] - uv_a[0]))
    rot = (90.0 if axis == "v" else 0.0) - ang
    return ((rot + 90.0) % 180.0) - 90.0


def _pt_seg(p, a, b):
    ex, ey = b[0] - a[0], b[1] - a[1]
    L = ex * ex + ey * ey
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L))
    dx, dy = a[0] + t * ex - p[0], a[1] + t * ey - p[1]
    return math.sqrt(dx * dx + dy * dy)


def _seg_cross(p, q, r, s):
    def orient(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    d1, d2, d3, d4 = orient(r, s, p), orient(r, s, q), orient(p, q, r), orient(p, q, s)
    return (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0)


def _seg_dist(p, q, r, s):
    if _seg_cross(p, q, r, s):
        return 0.0
    return min(_pt_seg(p, r, s), _pt_seg(q, r, s), _pt_seg(r, p, q), _pt_seg(s, p, q))


def uv_boundary_edges(fuv):
    cnt = {}
    for ids in fuv:
        if not ids:
            continue
        n = len(ids)
        for j in range(n):
            a, b = ids[j], ids[(j + 1) % n]
            if a != b:
                k = edge_key(a, b)
                cnt[k] = cnt.get(k, 0) + 1
    return [k for k, c in cnt.items() if c == 1]


def padding_check(u, v, fuv, map_size, shell_px, border_px, stacked_ok=False, max_listed=20):
    """Minimum pixel gap between UV shells and to their tile borders, from the shells' border
    edges (exact segment distances, grid-accelerated). stacked_ok ignores pairs of shells whose
    boxes coincide (mirrored stacks for games, Maya 2027 Help, Optimizations) [added test].
    Only pairs within about twice the required gap are measured: min_shell_gap_px None means
    no pair came that close (pass). Overlapping shells read 0 (mx_audit reports overlaps)."""
    shell_uv, _, nshell = uv_shell_ids(fuv, len(u))
    bnd = uv_boundary_edges(fuv)
    gap = shell_px / float(map_size)
    cell = max(gap, 1.0 / 4096.0)
    grid = {}
    boxes = {}
    for idx, (a, b) in enumerate(bnd):
        s = shell_uv[a]
        bx = boxes.setdefault(s, [1e30, 1e30, -1e30, -1e30])
        for i in (a, b):
            bx[0], bx[1] = min(bx[0], u[i]), min(bx[1], v[i])
            bx[2], bx[3] = max(bx[2], u[i]), max(bx[3], v[i])
        x0, x1 = min(u[a], u[b]) - gap, max(u[a], u[b]) + gap
        y0, y1 = min(v[a], v[b]) - gap, max(v[a], v[b]) + gap
        for ix in range(int(math.floor(x0 / cell)), int(math.floor(x1 / cell)) + 1):
            for iy in range(int(math.floor(y0 / cell)), int(math.floor(y1 / cell)) + 1):
                grid.setdefault((ix, iy), []).append(idx)

    def stacked(s1, s2):
        b1, b2 = boxes[s1], boxes[s2]
        tol = 2.0 / map_size
        return all(abs(b1[k] - b2[k]) <= tol for k in range(4))

    pair_min = {}
    checked = set()
    for lst in grid.values():
        if len(lst) < 2:
            continue
        for i in range(len(lst)):
            ea = bnd[lst[i]]
            sa = shell_uv[ea[0]]
            for j in range(i + 1, len(lst)):
                eb = bnd[lst[j]]
                sb = shell_uv[eb[0]]
                if sa == sb:
                    continue
                key = (lst[i], lst[j]) if lst[i] < lst[j] else (lst[j], lst[i])
                if key in checked:
                    continue
                checked.add(key)
                d = _seg_dist((u[ea[0]], v[ea[0]]), (u[ea[1]], v[ea[1]]),
                              (u[eb[0]], v[eb[0]]), (u[eb[1]], v[eb[1]]))
                pk = edge_key(sa, sb)
                if d < pair_min.get(pk, 1e30):
                    pair_min[pk] = d
    close = []
    for (s1, s2), d in pair_min.items():
        if stacked_ok and stacked(s1, s2):
            continue
        if d * map_size < shell_px - 1e-6:
            close.append((s1, s2, round(d * map_size, 3)))
    close.sort(key=lambda x: x[2])
    bpts = set(i for e in bnd for i in e)
    border_min, border_bad, marks = 1e30, 0, []
    for i in bpts:
        tu, tv = math.floor(u[i]), math.floor(v[i])
        d = min(u[i] - tu, tu + 1 - u[i], v[i] - tv, tv + 1 - v[i]) * map_size
        border_min = min(border_min, d)
        if d < border_px - 1e-6:
            border_bad += 1
            if len(marks) < 500:
                marks.append((u[i], v[i]))
    finite = [d for (s1, s2), d in pair_min.items() if not (stacked_ok and stacked(s1, s2))]
    return {"map_size": map_size, "shell_px_required": shell_px, "border_px_required": border_px,
            "shells": nshell, "boundary_edges": len(bnd),
            "min_shell_gap_px": round(min(finite) * map_size, 3) if finite else None,
            "shell_pairs_too_close": len(close), "close_pairs": close[:max_listed],
            "min_border_px": round(border_min, 3) if bpts else None,
            "uvs_too_close_to_border": border_bad, "border_marks": marks,
            "ok": not close and border_bad == 0}


def _sv2(a, b, c, d):
    """Singular values of the 2x2 matrix [[a, b], [c, d]]."""
    s1 = a * a + b * b + c * c + d * d
    det = a * d - b * c
    disc = math.sqrt(max(0.0, s1 * s1 - 4 * det * det))
    return math.sqrt(max(0.0, (s1 + disc) / 2.0)), math.sqrt(max(0.0, (s1 - disc) / 2.0))


def face_distortion(points, faces, u, v, fuv, shell_face=None, area_band=(0.5, 2.0), aniso_max=2.0):
    """Per-face stretch, the numeric stand-in for the checker and the distortion shader.
    area_ratio: (UV area / 3D area) over the shell's own ratio (1 = even checker; below 1 the
    texture is sparser there). anisotropy: long over short axis of a checker square on the
    surface (1 = square). Bands are [added] defaults."""
    if shell_face is None:
        _, shell_face, _ = uv_shell_ids(fuv, len(u))
    per = [None] * len(faces)
    sh = {}
    for fi, ids in enumerate(fuv):
        if not ids:
            continue
        f = faces[fi]
        a3 = auv = aw = 0.0
        for j in range(1, len(f) - 1):
            p0, p1, p2 = points[f[0]], points[f[j]], points[f[j + 1]]
            q0, q1, q2 = (u[ids[0]], v[ids[0]]), (u[ids[j]], v[ids[j]]), (u[ids[j + 1]], v[ids[j + 1]])
            e1 = _sub(p1, p0)
            L1 = _len(e1)
            nrm = _cross(e1, _sub(p2, p0))
            A = 0.5 * _len(nrm)
            if L1 < 1e-15 or A < 1e-20:
                continue
            x1 = (L1, 0.0)
            ex = _unit(e1)
            ey = _unit(_cross(_unit(nrm), ex))
            x2 = (_dot(_sub(p2, p0), ex), _dot(_sub(p2, p0), ey))
            det = x1[0] * x2[1] - x2[0] * x1[1]
            if abs(det) < 1e-20:
                continue
            du1, dv1 = q1[0] - q0[0], q1[1] - q0[1]
            du2, dv2 = q2[0] - q0[0], q2[1] - q0[1]
            ia, ib, ic, id_ = x2[1] / det, -x2[0] / det, -x1[1] / det, x1[0] / det
            j00, j01 = du1 * ia + du2 * ic, du1 * ib + du2 * id_
            j10, j11 = dv1 * ia + dv2 * ic, dv1 * ib + dv2 * id_
            s1, s2 = _sv2(j00, j01, j10, j11)
            a3 += A
            auv += abs(0.5 * ((q1[0] - q0[0]) * (q2[1] - q0[1]) - (q2[0] - q0[0]) * (q1[1] - q0[1])))
            aw += A * (s1 / s2 if s2 > 1e-15 else 1e6)
        if a3 <= 0:
            continue
        per[fi] = [a3, auv, aw / a3]
        e = sh.setdefault(shell_face[fi], [0.0, 0.0])
        e[0] += a3
        e[1] += auv
    ratio = [None] * len(faces)
    aniso = [None] * len(faces)
    tot = bad_area = bad_aniso = 0.0
    for fi, rec in enumerate(per):
        if rec is None:
            continue
        a3, auv, an = rec
        s = sh[shell_face[fi]]
        base = s[1] / s[0] if s[0] > 0 else 0.0
        r = (auv / a3) / base if base > 0 else 0.0
        ratio[fi], aniso[fi] = r, an
        tot += a3
        if r < area_band[0] or r > area_band[1]:
            bad_area += a3
        if an > aniso_max:
            bad_aniso += a3
    return {"area_ratio": ratio, "anisotropy": aniso,
            "pct_area_outside_band": round(100.0 * bad_area / tot, 3) if tot else None,
            "pct_area_aniso_over": round(100.0 * bad_aniso / tot, 3) if tot else None,
            "area_band": list(area_band), "aniso_max": aniso_max,
            "max_anisotropy": round(max(a for a in aniso if a is not None), 4) if tot else None}


def seam_edges(faces, fuv):
    """(UV seam edges, mesh border edges) as vertex-pair keys."""
    ef = {}
    for fi, f in enumerate(faces):
        ids = fuv[fi]
        n = len(f)
        for j in range(n):
            a, b = f[j], f[(j + 1) % n]
            if ids:
                ua, ub = ids[j], ids[(j + 1) % n]
                uk = (ua, ub) if a < b else (ub, ua)
            else:
                uk = None
            ef.setdefault(edge_key(a, b), []).append(uk)
    seams, borders = set(), set()
    for k, lst in ef.items():
        if len(lst) == 1:
            borders.add(k)
        elif len(lst) > 2 or lst[0] is None or lst[0] != lst[1]:
            seams.add(k)
    return seams, borders


def hard_seam_report(faces, fuv, hard, max_listed=20):
    """Polycount: for normal-mapped game lows, hard edges belong on UV seams (a hard edge on a
    seam costs no extra vertices; a hard edge inside a shell bakes a visible line)."""
    seams, borders = seam_edges(faces, fuv)
    hard = set(hard)
    hard_inside = sorted(hard - seams - borders)
    soft_seams = sorted(seams - hard)
    return {"seam_edges": len(seams), "hard_edges": len(hard), "hard_not_on_seam": len(hard_inside),
            "hard_not_on_seam_sample": hard_inside[:max_listed], "soft_seams": len(soft_seams),
            "soft_seams_sample": soft_seams[:max_listed]}


def split_vertex_estimate(faces, fuv, normal_ids=None):
    """Vertices an engine uploads: unique (vertex, uv, normal) corners (Polycount, Triangle
    Count vs. Vertex Count)."""
    seen = set()
    for fi, f in enumerate(faces):
        ids = fuv[fi] or [None] * len(f)
        nids = (normal_ids[fi] if normal_ids else None) or [None] * len(f)
        for j, vtx in enumerate(f):
            seen.add((vtx, ids[j], nids[j]))
    return len(seen)


def mirror_map(points, axis=0, tol=None):
    """Vertex -> mirrored vertex across axis = 0 (spatial hash), -1 when missing."""
    if tol is None:
        span = max(max(p[i] for p in points) - min(p[i] for p in points) for i in range(3)) or 1.0
        tol = span * 1e-4
    cell = tol * 2.0
    grid = {}
    for i, p in enumerate(points):
        grid.setdefault(tuple(int(math.floor(p[k] / cell)) for k in range(3)), []).append(i)
    out = []
    for p in points:
        m = list(p)
        m[axis] = -m[axis]
        key = [int(math.floor(m[k] / cell)) for k in range(3)]
        best, bd = -1, tol
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j in grid.get((key[0] + dx, key[1] + dy, key[2] + dz), ()):
                        d = _len(_sub(points[j], tuple(m)))
                        if d <= bd:
                            best, bd = j, d
        out.append(best)
    return out


def mirror_uv_layout(points, faces, u, v, fuv, axis=0, source_sign=1, mode="stack", u_axis=0.5,
                     offset_u=0.0, tol=None):
    """Copy the finished side's UVs onto its mirror.
    mode "stack": the mirrored shells take the same UV area (games: MLC s_KLbTUdKms [00:11:32],
    Maya 2027 Help Optimizations); offset_u=1.0 moves them one tile over for baking (Polycount,
    Typical Mirroring Workflow). Only shells fully on one side are stacked.
    mode "mirror": mirrored positions across u = u_axis, per shell across the shell's own center
    UVs when the shell crosses the center line (the Symmetrize tool's result, MLC [00:06:17]).
    Returns {u, v, fuv (compacted), report}."""
    vm = mirror_map(points, axis, tol)
    shell_uv, shell_face, ns = uv_shell_ids(fuv, len(u))
    span_tol = tol if tol is not None else 1e-4 * (max(abs(p[axis]) for p in points) or 1.0)

    def side(f):
        c = sum(points[x][axis] for x in f) / len(f)
        return 0 if abs(c) <= span_tol else (1 if c > 0 else -1)

    fside = [side(f) for f in faces]
    shell_sides = {}
    for fi, s in enumerate(shell_face):
        if s is not None:
            shell_sides.setdefault(s, set()).add(fside[fi])
    by_key = {frozenset(f): i for i, f in enumerate(faces)}
    center_u = {}
    if mode == "mirror":
        for fi, f in enumerate(faces):
            ids = fuv[fi]
            if not ids:
                continue
            for j, x in enumerate(f):
                if vm[x] == x:
                    center_u.setdefault(shell_face[fi], []).append(u[ids[j]])
    nu, nv = list(u), list(v)
    nf = [list(x) if x else None for x in fuv]
    remap = {}
    rep = {"mode": mode, "target_faces": 0, "written": 0, "unmatched": 0, "skipped_crossing": 0}
    for fi, f in enumerate(faces):
        if fside[fi] != -source_sign or not fuv[fi]:
            continue
        rep["target_faces"] += 1
        mk = [vm[x] for x in f]
        g = by_key.get(frozenset(mk)) if -1 not in mk else None
        if g is None or not fuv[g]:
            rep["unmatched"] += 1
            continue
        if mode == "stack" and (shell_sides.get(shell_face[fi]) != {-source_sign}
                                or shell_sides.get(shell_face[g]) != {source_sign}):
            rep["skipped_crossing"] += 1
            continue
        axis_u = u_axis
        if mode == "mirror" and shell_face[g] in center_u:
            cu = center_u[shell_face[g]]
            axis_u = sum(cu) / len(cu)
        for k, x in enumerate(f):
            j = faces[g].index(vm[x])
            s = fuv[g][j]
            if mode == "mirror" and vm[x] == x and s in fuv[fi]:
                nf[fi][k] = s
                continue
            if s not in remap:
                remap[s] = len(nu)
                if mode == "stack":
                    nu.append(u[s] + offset_u)
                else:
                    nu.append(2.0 * axis_u - u[s] + offset_u)
                nv.append(v[s])
            nf[fi][k] = remap[s]
        rep["written"] += 1
    used = sorted(set(i for ids in nf if ids for i in ids))
    idx = {o: n for n, o in enumerate(used)}
    cu_, cv_ = [nu[o] for o in used], [nv[o] for o in used]
    cf = [[idx[i] for i in ids] if ids else None for ids in nf]
    rep["uvs_before"], rep["uvs_after"] = len(u), len(cu_)
    return {"u": cu_, "v": cv_, "fuv": cf, "report": rep}


# =========================================================================== UV sheet image (pure)
def _shell_color(s):
    h = (s * 0.61803398875) % 1.0
    r, g, b = [abs(((h * 6.0 + k) % 6.0) - 3.0) - 1.0 for k in (0.0, 4.0, 2.0)]
    return tuple(int(255 * (0.55 + 0.35 * max(0.0, min(1.0, c)))) for c in (r, g, b))


def distortion_color(ratio):
    """Blue: UV area below the shell average (texels sparse, blurry), white: even, red: above
    (texels dense). log2 scale, saturated at 2x."""
    if ratio is None:
        return (128, 128, 128)
    t = max(-1.0, min(1.0, math.log(max(ratio, 1e-6), 2)))
    if t < 0:
        k = -t
        return (int(255 * (1 - k)), int(255 * (1 - k)), 255)
    return (255, int(255 * (1 - t)), int(255 * (1 - t)))


def uv_sheet(path, u, v, fuv, size=1024, tile=(0, 0), face_rgb=None, marks=(), outline=True):
    """Draw one UV tile as a PNG the agent opens with its image reader: shells filled (per-shell
    colours, or face_rgb per face), shell borders dark, padding problems as magenta dots,
    tile border in grey. Uses mx_review.write_png (pure Python)."""
    import mx_review
    W = H = int(size)
    buf = bytearray(b"\xff" * (W * H * 3))
    tu, tv = tile
    _, shell_face, _ = uv_shell_ids(fuv, len(u))

    def px(i):
        return ((u[i] - tu) * W, (1.0 - (v[i] - tv)) * H)

    def fill_tri(p0, p1, p2, col):
        xs, ys = (p0[0], p1[0], p2[0]), (p0[1], p1[1], p2[1])
        x0, x1 = max(0, int(math.floor(min(xs)))), min(W - 1, int(math.ceil(max(xs))))
        y0, y1 = max(0, int(math.floor(min(ys)))), min(H - 1, int(math.ceil(max(ys))))
        area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])
        if abs(area) < 1e-12 or x0 > x1 or y0 > y1:
            return
        for y in range(y0, y1 + 1):
            cy = y + 0.5
            row = y * W
            for x in range(x0, x1 + 1):
                cx = x + 0.5
                w0 = (p1[0] - cx) * (p2[1] - cy) - (p1[1] - cy) * (p2[0] - cx)
                w1 = (p2[0] - cx) * (p0[1] - cy) - (p2[1] - cy) * (p0[0] - cx)
                w2 = (p0[0] - cx) * (p1[1] - cy) - (p0[1] - cy) * (p1[0] - cx)
                if (w0 >= 0 and w1 >= 0 and w2 >= 0) or (w0 <= 0 and w1 <= 0 and w2 <= 0):
                    o = (row + x) * 3
                    buf[o], buf[o + 1], buf[o + 2] = col

    def line(p, q, col):
        n = int(max(abs(q[0] - p[0]), abs(q[1] - p[1]))) + 1
        for k in range(n + 1):
            t = k / float(n)
            x, y = int(p[0] + (q[0] - p[0]) * t), int(p[1] + (q[1] - p[1]) * t)
            if 0 <= x < W and 0 <= y < H:
                o = (y * W + x) * 3
                buf[o], buf[o + 1], buf[o + 2] = col

    for fi, ids in enumerate(fuv):
        if not ids:
            continue
        col = face_rgb[fi] if face_rgb else _shell_color(shell_face[fi])
        pts = [px(i) for i in ids]
        for j in range(1, len(pts) - 1):
            fill_tri(pts[0], pts[j], pts[j + 1], col)
    if outline:
        for a, b in uv_boundary_edges(fuv):
            line(px(a), px(b), (30, 30, 30))
    for x in range(W):
        for y in (0, H - 1):
            o = (y * W + x) * 3
            buf[o], buf[o + 1], buf[o + 2] = (150, 150, 150)
    for y in range(H):
        for x in (0, W - 1):
            o = (y * W + x) * 3
            buf[o], buf[o + 1], buf[o + 2] = (150, 150, 150)
    for mu, mv in marks:
        cx, cy = int((mu - tu) * W), int((1.0 - (mv - tv)) * H)
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                x, y = cx + dx, cy + dy
                if 0 <= x < W and 0 <= y < H:
                    o = (y * W + x) * 3
                    buf[o], buf[o + 1], buf[o + 2] = (255, 0, 255)
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    return mx_review.write_png(path, W, H, buf)


# =========================================================================== deformation-ready gate (pure)
# The modeler's own deformation test (antCGi x07USYlvu2o [00:00:00]) and Jessica Dru Johnson's
# shear rule (ZiYEO49B768 [01:13:06]) as numbers. The bind is a PROXY [added]: a weight field
# computed from rest positions and a joint chain, so two topologies of the same surface get
# identical weights by construction, which is what antCGi's swap test needs ([00:16:24]).
# Real skinning, ROM files and correctives belong to scenario-maya-deformation; this gate only decides
# whether the loops are ready and, when a bend fails, whose fault it is.
DEFORM_THRESHOLDS = {
    "loop_angle_deg": 20.0,   # joint loop plane vs bone axis: the organic digest's [added] 20 degrees
    "min_loops": 3,           # 1 control + 2 support loops (Jessica [01:15:51])
    "along_drift_deg": 15.0,  # along-limb loop turning around the bone across the joint band: a spiral [added]
    "shear_deg": 10.0,        # corner-angle change that counts as shear [added]
    "shear_mean_deg": 10.0,   # hinge band (cheek, jaw side) mean shear: aligned grid 4 to 6, 15 deg off 16 to 24 offline [added]
    "collapse_area": 0.3,     # face area ratio red flag (organic digest [added]; scenario-maya-deformation uses 0.3 too)
    "section_area": 0.7,      # joint section area kept by an ideal ring (scenario-maya-deformation's [added] line)
    "loop_vs_ideal": 0.8,     # joint loop area kept, relative to the ideal ring under the same weights [added]
    "lid_gap_rel": 0.1,       # rest gap lid border to eyeball, fraction of the eyeball radius [added]
    "silhouette_xor": 0.02,   # high vs low silhouette pixels that differ, share of the union [added]
}


def rotate_point(p, pivot, axis, degrees):
    """Rodrigues rotation of p about the line through pivot along axis."""
    k = _unit(axis)
    a = math.radians(degrees)
    v = _sub(p, pivot)
    c, s = math.cos(a), math.sin(a)
    r = _add(_add(_mul(v, c), _mul(_cross(k, v), s)), _mul(k, _dot(k, v) * (1.0 - c)))
    return _add(pivot, r)


def _smooth01(e0, e1, x):
    if e1 <= e0:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def closest_on_chain(p, chain):
    """(segment index, t in 0..1, distance) of the closest point on a joint chain polyline."""
    best = None
    for i in range(len(chain) - 1):
        a, b = chain[i], chain[i + 1]
        ab = _sub(b, a)
        L2 = _dot(ab, ab)
        t = max(0.0, min(1.0, _dot(_sub(p, a), ab) / L2)) if L2 > 0 else 0.0
        d = _len(_sub(p, _add(a, _mul(ab, t))))
        if best is None or d < best[2]:
            best = (i, t, d)
    return best


def joint_frame(chain, joint):
    """(pivot, parent direction u, child direction v, bisector n) at an interior chain joint; the
    ideal joint loop lies in the plane through the pivot with normal n (it bisects the bend)."""
    J = chain[joint]
    v = _unit(_sub(chain[joint + 1], J))
    u = _unit(_sub(J, chain[joint - 1])) if joint > 0 else v
    n = _unit(_add(u, v))
    if _len(n) < 1e-9:
        n = v
    return J, u, v, n


def limb_radius(points, chain, joint, seg_info=None):
    """Local limb radius: median distance to the chain of the quarter of the vertices on the two
    segments meeting at the joint that lie nearest the joint plane (works on sparse meshes)."""
    J, u, v, n = joint_frame(chain, joint)
    segs = [_len(_sub(chain[i + 1], chain[i])) for i in range(len(chain) - 1)]
    near = [joint - 1, joint] if joint > 0 else [joint]
    info = seg_info or [closest_on_chain(p, chain) for p in points]
    cand = sorted((abs(_dot(_sub(p, J), n)), s[2]) for p, s in zip(points, info) if s[0] in near)
    if not cand:
        return 0.1 * min(segs[i] for i in near)
    top = sorted(d for _, d in cand[:max(3, len(cand) // 4)])
    return top[len(top) // 2]


def bend_weights(points, chain, joint, blend=None, max_dist=None, radius=None):
    """Proxy weight of the child side for a bend at chain[joint] [added]: 0 on segments before the
    joint, 1 after it, a smoothstep across the bisector plane (half width `blend`, default one local
    limb radius: narrower pinches a perfect ring layout at 45 degrees in the offline test). Vertices farther than max_dist (default 2.5 radii) from the chain stay put.
    radius skips the estimate (the same field on other points). Returns (weights, {"radius", "blend",
    "max_dist"})."""
    info = [closest_on_chain(p, chain) for p in points]
    r = limb_radius(points, chain, joint, info) if radius is None else float(radius)
    h = r if blend is None else float(blend)
    md = 2.5 * r if max_dist is None else float(max_dist)
    J, u, v, n = joint_frame(chain, joint)
    w = []
    for p, (s, t, d) in zip(points, info):
        if d > md or s < joint - 1:
            w.append(0.0)
        elif s > joint:
            w.append(1.0)
        else:
            w.append(_smooth01(-h, h, _dot(_sub(p, J), n)))
    return w, {"radius": r, "blend": h, "max_dist": md}


def twist_weights(points, chain, joint, max_dist=None, radius=None):
    """Proxy weights for a twist of the segment chain[joint] -> chain[joint + 1], spread along it
    the way twist joints spread it (0 at the joint, 1 at the far end) [added]. Judge twist mid-limb,
    never at the shoulder or wrist (antCGi x07USYlvu2o [00:08:40] [00:11:04])."""
    info = [closest_on_chain(p, chain) for p in points]
    ds = sorted(d for s, t, d in info if s == joint and 0.25 <= t <= 0.75)
    r = (ds[len(ds) // 2] if ds else 0.1 * _len(_sub(chain[joint + 1], chain[joint]))) if radius is None else float(radius)
    md = 2.5 * r if max_dist is None else float(max_dist)
    w = []
    for s, t, d in info:
        w.append(0.0 if (d > md or s < joint) else (t if s == joint else 1.0))
    return w, {"radius": r, "max_dist": md}


def hinge_weights(points, plane_point, plane_normal, blend, region=None):
    """Proxy weights for a face hinge (jaw open, brow raise) [added]: a smoothstep of half width
    `blend` across the plane (plane_point, plane_normal), 1 on the side the normal points to;
    region (center, radius) keeps the rest of the head still."""
    n = _unit(plane_normal)
    out = []
    for p in points:
        if region and _len(_sub(p, tuple(region[0]))) > float(region[1]):
            out.append(0.0)
        else:
            out.append(_smooth01(-blend, blend, _dot(_sub(p, tuple(plane_point)), n)))
    return out


def pose_points(points, weights, pivot, axis, degrees, mode="lbs"):
    """Posed copy. "lbs": (1 - w) p + w R p, a linear blend skin (what a smooth bind does);
    "rotate": R(w x angle) p, which keeps the distance to the pivot (lids about the eyeball)."""
    out = []
    for p, w in zip(points, weights):
        if w <= 0.0:
            out.append(p)
        elif mode == "rotate":
            out.append(rotate_point(p, pivot, axis, w * degrees))
        else:
            q = rotate_point(p, pivot, axis, degrees)
            out.append(_add(_mul(p, 1.0 - w), _mul(q, w)) if w < 1.0 else q)
    return out


def corner_angles(points, f):
    """Interior angle (radians) at each corner of a face."""
    out, m = [], len(f)
    for i in range(m):
        p = points[f[i]]
        a, b = _sub(points[f[i - 1]], p), _sub(points[f[(i + 1) % m]], p)
        la, lb = _len(a), _len(b)
        out.append(math.acos(max(-1.0, min(1.0, _dot(a, b) / (la * lb)))) if la > 1e-12 and lb > 1e-12 else 0.0)
    return out


def deform_metrics(rest, posed, faces, face_ids=None, expected_normal=None, thresholds=None):
    """One pose against rest, per face: area ratio (collapse, pinching), normal flips (the posed
    normal against the rest normal carried by the face's own rotation: a rotated forearm is not
    a flip) and Jessica Dru Johnson's shear (ZiYEO49B768 [01:13:06]): a quad should get longer
    or shorter along the motion; it shears when its corner angles change more than its edges
    do (max corner-angle change in radians above max |ln edge ratio|) [added formula].
    expected_normal(face_id, rest_normal) -> rest normal moved by the pose (default unchanged)."""
    thr = dict(DEFORM_THRESHOLDS)
    thr.update(thresholds or {})
    ids = range(len(faces)) if face_ids is None else face_ids
    ratios, flips, collapsed, shears, skew, worst = [], [], [], [], [], []
    quads = 0
    for fi in ids:
        f = faces[fi]
        a0, n0 = face_area(rest, f)
        a1, n1 = face_area(posed, f)
        if a0 <= 1e-20:
            continue
        r = a1 / a0
        ratios.append(r)
        if r < thr["collapse_area"]:
            collapsed.append(fi)
        e = expected_normal(fi, n0) if expected_normal else n0
        if _dot(e, n1) < 0.0:
            flips.append(fi)
        sh = max(abs(x - y) for x, y in zip(corner_angles(rest, f), corner_angles(posed, f)))
        st = 0.0
        m = len(f)
        for j in range(m):
            l0 = _len(_sub(rest[f[j]], rest[f[(j + 1) % m]]))
            l1 = _len(_sub(posed[f[j]], posed[f[(j + 1) % m]]))
            if l0 > 1e-12 and l1 > 1e-12:
                st = max(st, abs(math.log(l1 / l0)))
        deg = math.degrees(sh)
        shears.append(deg)
        worst.append((deg, fi))
        if m == 4:
            quads += 1
            if deg >= thr["shear_deg"] and sh > st:
                skew.append(fi)
    worst.sort(reverse=True)
    return {"faces": len(ratios), "quads": quads,
            "area_ratio_min": round(min(ratios), 4) if ratios else None,
            "collapsed": len(collapsed), "collapsed_ids": collapsed[:20],
            "normal_flips": len(flips), "flip_ids": flips[:20],
            "shear_max_deg": round(max(shears), 2) if shears else 0.0,
            "shear_mean_deg": round(sum(shears) / len(shears), 2) if shears else 0.0,
            "skew_dominant": len(skew), "skew_share": round(len(skew) / float(quads), 4) if quads else 0.0,
            "skew_ids": skew[:20], "worst_shear_ids": [fi for _, fi in worst[:10]]}


def loop_plane_normal(pts):
    """Best-fit plane normal of a point loop (smallest covariance eigenvector)."""
    c = _mean(pts)
    cov = [[sum((p[i] - c[i]) * (p[j] - c[j]) for p in pts) for j in range(3)] for i in range(3)]
    w, V = _jacobi_eig(cov)
    k = min(range(3), key=lambda i: w[i])
    return _unit((V[0][k], V[1][k], V[2][k]))


def angle_to_axis(n, axis):
    """Unsigned angle (degrees, 0 to 90) between a plane normal and an axis."""
    return math.degrees(math.acos(max(-1.0, min(1.0, abs(_dot(_unit(n), _unit(axis)))))))


def _azimuth(p, center, axis, ref):
    e1, e2 = _plane_basis(axis, ref)
    d = _sub(p, center)
    return math.degrees(math.atan2(_dot(d, e2), _dot(d, e1)))


def joint_loop_check(points, topo, center, axis, radius, half_band=None):
    """Topology side of antCGi's diagnosis (x07USYlvu2o [00:11:04] [00:17:37]): the edge loop
    nearest the joint must close around the limb and lie roughly perpendicular to the bone (plane
    normal within loop_angle_deg of the axis); 3 loops must cross the joint band (Jessica
    [01:15:51]); no pole may sit in it; and the along-limb loop must not turn around the bone
    across the band (a loop "spiraling down the arm", Jessica [01:12:33]). Numbers only, plus
    "_loop" (the joint loop's vertex ids, popped by deform_report); diagnose_bend judges them."""
    hb = 0.5 * radius if half_band is None else float(half_band)
    ax = _unit(axis)
    out = {"half_band": hb}
    search = 1.6 * radius                          # edges sit on the surface, about one radius out [added]
    seed = seam_seed(points, topo, center, ax, search, kind="ring")
    if seed:
        path, closed = topo.edge_loop(*seed)
        lp = [points[x] for x in path]
        off = _sub(_mean(lp), center)
        off = _len(_sub(off, _mul(ax, _dot(off, ax))))
        out.update(loop_closed=closed, loop_verts=len(path),
                   loop_angle_deg=round(angle_to_axis(loop_plane_normal(lp), ax), 2) if len(lp) >= 3 else 90.0,
                   loop_offset=round(off, 5), loop_surrounds=closed and off < radius, _loop=path)
    else:
        out["error"] = "no edge within %.3g of the joint" % search
    s2, _ = limb_seed_edge(points, topo, center, ax, search)
    if s2:
        along, _ = topo.edge_loop(*s2)
        out["loops_in_band"] = crossings(points, along, center, ax, hb)
        inb = sorted((_dot(_sub(points[x], center), ax), x) for x in along
                     if abs(_dot(_sub(points[x], center), ax)) <= hb)
        ref = _sub(points[s2[0]], center)
        if len(inb) >= 2:
            az = [_azimuth(points[x], center, ax, ref) for _, x in inb]
            tot = 0.0
            for a0, a1 in zip(az[:-1], az[1:]):
                d = (a1 - a0 + 180.0) % 360.0 - 180.0
                tot += d
            out["along_drift_deg"] = round(abs(tot), 2)
    poles = [x for x, val in topo.poles()
             if abs(_dot(_sub(points[x], center), ax)) <= hb and _len(_sub(points[x], center)) <= 2.0 * radius]
    out["poles_in_band"] = len(poles)
    out["pole_ids"] = poles[:10]
    return out


def loop_area(points, loop, normal):
    """Area of a vertex loop projected on the plane with this normal (shoelace)."""
    e1, e2 = _plane_basis(normal, (1.0, 0.0, 0.0))
    o = _mean([points[x] for x in loop])
    return abs(_poly_area2([(_dot(_sub(points[x], o), e1), _dot(_sub(points[x], o), e2)) for x in loop]))


def ideal_ring(points, loop, center, normal):
    """The joint loop projected into the joint plane: the ring a correctly looped hinge would have
    on this surface [added]. Posed with the same weights, it measures the volume the bend loses
    whatever the topology (the rig's share, antCGi x07USYlvu2o [00:10:27])."""
    n = _unit(normal)
    return [_sub(points[x], _mul(n, _dot(_sub(points[x], center), n))) for x in loop]


def diagnose_bend(loop, metrics, section=None, thresholds=None):
    """antCGi's split (x07USYlvu2o [00:10:27] [00:11:04] [00:16:24] [00:17:37]): loops that run
    along the joint instead of across it are the modeler's fault and a topology fix; volume lost
    at a correctly looped hinge is the rig's (correctives, twist joints: scenario-maya-deformation).
    Topology evidence: no closed loop around the limb, a tilted joint loop, under 3 loops in the
    band, a pole in the band, a spiral, or a joint loop that keeps much less area than the ideal
    ring under the same weights. Rig evidence: the ideal ring itself keeps under section_area.
    Collapse and folds side with the topology when it shows a fault, else with the rig. Shear is
    NOT a verdict input: a linear blend shears the inner half of a perfectly ringed hinge (about a
    fifth of the band quads at 90 degrees in this module's offline test), so on limbs shear is read
    against another variant under the same weights (compare_variants); it decides only on face
    hinges (diagnose_hinge).
    Returns {"verdict": "topology" | "rig" | "clean", "evidence": [...], "route": text}."""
    thr = dict(DEFORM_THRESHOLDS)
    thr.update(thresholds or {})
    topo_ev, rig_ev = [], []
    if loop.get("error") or not loop.get("loop_surrounds", False):
        topo_ev.append("no closed loop around the limb at the joint (%s)" % loop.get("error", "open or off axis"))
    elif loop.get("loop_angle_deg", 0.0) > thr["loop_angle_deg"]:
        topo_ev.append("joint loop tilted %.0f deg off the bone (max %.0f): loops run along the joint"
                       % (loop["loop_angle_deg"], thr["loop_angle_deg"]))
    if loop.get("loops_in_band", thr["min_loops"]) < thr["min_loops"]:
        topo_ev.append("%d loops cross the joint band (need %d)" % (loop["loops_in_band"], thr["min_loops"]))
    if loop.get("poles_in_band"):
        topo_ev.append("%d poles in the joint band" % loop["poles_in_band"])
    if loop.get("along_drift_deg", 0.0) > thr["along_drift_deg"]:
        topo_ev.append("along-limb loop turns %.0f deg around the bone across the band (spiral)" % loop["along_drift_deg"])
    sec = section or {}
    if sec.get("relative") is not None and sec["relative"] < thr["loop_vs_ideal"]:
        topo_ev.append("joint loop keeps %.0f%% of the area an ideal ring keeps under the same weights"
                       % (100 * sec["relative"]))
    if sec.get("ideal_ratio") is not None and sec["ideal_ratio"] < thr["section_area"]:
        rig_ev.append("even an ideal ring keeps %.0f%% of its area at this angle (volume loss at the hinge)"
                      % (100 * sec["ideal_ratio"]))
    for key, text in (("collapsed", "faces below %.0f%% area" % (100 * thr["collapse_area"])),
                      ("normal_flips", "faces fold over")):
        if metrics.get(key):
            (topo_ev if topo_ev else rig_ev).append("%d %s" % (metrics[key], text))
    verdict = "topology" if topo_ev else ("rig" if rig_ev else "clean")
    route = {"topology": "scenario-maya-retopology-uv: reroute the loops across the joint, rerun the same test (A/B)",
             "rig": "scenario-maya-deformation: correctives, twist joints or volume preservation; the loops are fine",
             "clean": "none"}[verdict]
    return {"verdict": verdict, "evidence": topo_ev + rig_ev, "route": route}


def diagnose_hinge(metrics, thresholds=None):
    """Jessica Dru Johnson's shear rule on a face hinge (ZiYEO49B768 [01:13:06] [01:13:39]
    [01:30:10]): in the stretch band a quad should get longer or shorter with the motion; quads
    whose corners turn (mean shear above shear_mean_deg [added]) sit diagonal to the motion, and
    the fix is topology: one loop run flat along the hinge line (lip corner to jaw corner)."""
    thr = dict(DEFORM_THRESHOLDS)
    thr.update(thresholds or {})
    topo_ev, rig_ev = [], []
    if metrics.get("shear_mean_deg", 0.0) > thr["shear_mean_deg"]:
        topo_ev.append("band quads shear against the motion (mean %.0f deg, max %.0f; %.0f%% skew-dominant)"
                       % (metrics["shear_mean_deg"], metrics.get("shear_max_deg", 0.0), 100 * metrics.get("skew_share", 0.0)))
    for key, text in (("collapsed", "faces below %.0f%% area" % (100 * thr["collapse_area"])),
                      ("normal_flips", "faces fold over")):
        if metrics.get(key):
            (topo_ev if topo_ev else rig_ev).append("%d %s" % (metrics[key], text))
    verdict = "topology" if topo_ev else ("rig" if rig_ev else "clean")
    route = {"topology": "scenario-maya-retopology-uv: run one loop flat along the hinge line, quads across it (Jessica [01:30:10])",
             "rig": "scenario-maya-deformation: weights or correctives at the hinge; the flow is fine",
             "clean": "none"}[verdict]
    return {"verdict": verdict, "evidence": topo_ev + rig_ev, "route": route}


def _hinge_item(points, faces, b, thr, keep_posed):
    ang = float(b["angle"])
    axis = _unit(b["axis"])
    pivot = tuple(b["pivot"])
    pp, pn = b["plane"]
    w = hinge_weights(points, pp, pn, float(b["blend"]), b.get("region"))
    posed = pose_points(points, w, pivot, axis, ang, mode="lbs")
    band = [fi for fi, f in enumerate(faces) if 0.02 < sum(w[x] for x in f) / float(len(f)) < 0.98]

    def expected(fi, n0):
        f = faces[fi]
        return rotate_point(n0, (0.0, 0.0, 0.0), axis, sum(w[x] for x in f) / float(len(f)) * ang)

    met = deform_metrics(points, posed, faces, band, expected, thr)
    item = {"name": b.get("name", "hinge_%g" % ang), "kind": "hinge", "angle": ang, "axis": list(axis),
            "band_faces": len(band), "metrics": met, "diagnosis": diagnose_hinge(met, thr),
            "moved_verts": sum(1 for x in w if x > 0), "joint": None, "radius": float(b["blend"]),
            "pivot": list(pivot)}
    if keep_posed:
        item["_posed"] = posed
    return item


def _default_bend_axis(u, v):
    a = _cross(u, v)
    if _len(a) > 1e-6:
        return _unit(a)
    for ref in ((0.0, 1.0, 0.0), (0.0, 0.0, 1.0)):
        a = _cross(v, ref)
        if _len(a) > 1e-6:
            return _unit(a)
    return (1.0, 0.0, 0.0)


def deform_report(points, faces, chain, bends, max_dist=None, thresholds=None, keep_posed=False):
    """The deformation-ready gate on plain arrays. chain: joint positions (cm) along one limb, root
    side first (shoulder, elbow, wrist, fingertip); bends: [{"name", "joint": chain index,
    "angle": deg, "axis": xyz or None (default: the chain's own bend plane, else a guess [added]),
    "kind": "bend" | "twist"}]. A twist turns the segment after `joint` about itself and is
    judged mid-segment. A face hinge needs no chain: {"kind": "hinge", "pivot", "axis", "angle",
    "plane": (point, normal toward the moving side), "blend": cm, "region": (center, radius)}.
    Per limb bend: joint loop check, band metrics (shear, area, flips), joint loop area against
    the ideal ring, the diagnosis; per hinge: band metrics and the shear diagnosis. keep_posed
    stores the posed points ("_posed")."""
    thr = dict(DEFORM_THRESHOLDS)
    thr.update(thresholds or {})
    topo = Topology(faces, len(points))
    rep = {"chain": [list(p) for p in chain], "bends": [], "thresholds": thr}
    for b in bends:
        kind = b.get("kind", "bend")
        if kind == "hinge":
            rep["bends"].append(_hinge_item(points, faces, b, thr, keep_posed))
            continue
        j = int(b["joint"])
        if not (0 <= j < len(chain) - 1) or (kind != "twist" and j == 0):
            raise ValueError("bend %r: joint %d must be an interior chain index (a twist may use 0)" % (b, j))
        ang = float(b["angle"])
        J, u, v, n = joint_frame(chain, j)
        if kind == "twist":
            w, winfo = twist_weights(points, chain, j, max_dist)
            axis, pivot = v, J
            center = _mul(_add(chain[j], chain[j + 1]), 0.5)          # judged mid-limb
            normal0 = normal1 = v

            def weigh(pts, winfo=winfo, j=j):
                return twist_weights(pts, chain, j, winfo["max_dist"], winfo["radius"])[0]
        else:
            w, winfo = bend_weights(points, chain, j, max_dist=max_dist)
            axis = _unit(b["axis"]) if b.get("axis") else _default_bend_axis(u, v)
            pivot, center, normal0 = J, J, n
            normal1 = _unit(_add(u, _sub(rotate_point(_add(J, v), J, axis, ang), J)))

            def weigh(pts, winfo=winfo, j=j):
                return bend_weights(pts, chain, j, winfo["blend"], winfo["max_dist"], winfo["radius"])[0]
        r = winfo["radius"]
        posed = pose_points(points, w, pivot, axis, ang, mode="lbs")
        band = []
        for fi, f in enumerate(faces):
            c = _mean([points[x] for x in f])
            if abs(_dot(_sub(c, center), normal0)) <= r and _len(_sub(c, center)) <= 2.5 * r:
                band.append(fi)

        def expected(fi, n0, w=w, axis=axis, ang=ang):
            f = faces[fi]
            wf = sum(w[x] for x in f) / float(len(f))
            return rotate_point(n0, (0.0, 0.0, 0.0), axis, wf * ang)

        met = deform_metrics(points, posed, faces, band, expected, thr)
        loop = joint_loop_check(points, topo, center, normal0, r, half_band=r)
        ids = loop.pop("_loop", None)
        sec = {"loop_ratio": None, "ideal_ratio": None, "relative": None}
        if ids and len(ids) >= 3:
            a0 = loop_area(points, ids, normal0)
            if a0 > 1e-12:
                sec["loop_ratio"] = round(loop_area(posed, ids, normal1) / a0, 4)
            ring = ideal_ring(points, ids, center, normal0)
            ring_posed = pose_points(ring, weigh(ring), pivot, axis, ang, mode="lbs")
            idx = list(range(len(ring)))
            i0 = loop_area(ring, idx, normal0)
            if i0 > 1e-12:
                sec["ideal_ratio"] = round(loop_area(ring_posed, idx, normal1) / i0, 4)
            if sec["loop_ratio"] is not None and sec["ideal_ratio"]:
                sec["relative"] = round(sec["loop_ratio"] / sec["ideal_ratio"], 4)
        item = {"name": b.get("name", "%s_%d_%g" % (kind, j, ang)), "kind": kind, "joint": j, "angle": ang,
                "axis": list(axis), "radius": round(r, 5), "band_faces": len(band), "loop": loop,
                "metrics": met, "section": sec, "diagnosis": diagnose_bend(loop, met, sec, thr),
                "moved_verts": sum(1 for x in w if x > 0)}
        if keep_posed:
            item["_posed"] = posed
        rep["bends"].append(item)
    order = {"clean": 0, "rig": 1, "topology": 2}
    rep["verdict"] = max((x["diagnosis"]["verdict"] for x in rep["bends"]), key=order.get, default="clean")
    rep["fails"] = ["%s: %s: %s" % ("error" if x["diagnosis"]["verdict"] == "topology" else "warn", x["name"],
                                    "; ".join(x["diagnosis"]["evidence"])) for x in rep["bends"]
                    if x["diagnosis"]["verdict"] != "clean"]
    rep["ok"] = rep["verdict"] != "topology"
    return rep


def _variant_key(b):
    m = b["metrics"]
    bad = m["collapsed"] + m["normal_flips"]
    if b["kind"] == "hinge":
        return (-round(m["shear_mean_deg"], 1), -bad)
    return (round(b["section"].get("loop_ratio") or 0.0, 3), -bad, -round(m["shear_mean_deg"], 1))


def compare_variants(a, b):
    """antCGi's proof by swapping topology under the same weights (x07USYlvu2o [00:16:24]): two
    deform reports with the same chain and bends. Per limb bend the variant that keeps more joint
    loop area wins, then fewer collapsed or folded faces, then less shear; per hinge, less shear
    wins. Build the reference variant with build_tube (P5) on the same source when there is no
    second candidate."""
    out = []
    for ba, bb in zip(a["bends"], b["bends"]):
        ka, kb = _variant_key(ba), _variant_key(bb)
        out.append({"name": ba["name"], "better": "a" if ka > kb else ("b" if kb > ka else "same"),
                    "key_a": ka, "key_b": kb})
    return out


# ------------------------------------------------------------ lids over the real eyeballs (pure)
def sphere_closest(center, radius):
    """closest(p) -> (point, outward normal) on a sphere: an eyeball stand-in."""
    def closest(p):
        n = _unit(_sub(p, center))
        return _add(center, _mul(n, radius)), n
    return closest


def clearance(points, verts, edges, closest):
    """Signed distance to a surface (positive outside) at vertices AND edge midpoints: a lid with
    too few loops passes its chords through the eyeball even when every vertex sits outside
    (antCGi x07USYlvu2o [00:15:18] [00:15:50]: more lid loops curve the lid over the eye)."""
    def sd(p):
        q, n = closest(p)
        dv = _sub(p, q)
        return _len(dv) * (1.0 if _dot(dv, n) >= 0.0 else -1.0)
    dv = [sd(points[x]) for x in verts]
    de = [sd(_mul(_add(points[a], points[b]), 0.5)) for a, b in edges]
    allv = dv + de
    return {"verts": len(dv), "edges": len(de), "min": round(min(allv), 6) if allv else None,
            "vert_min": round(min(dv), 6) if dv else None, "mid_min": round(min(de), 6) if de else None,
            "inside_verts": sum(1 for x in dv if x < 0.0), "inside_mids": sum(1 for x in de if x < 0.0)}


def _elevation(p, center, axis, up):
    fwd = _unit(_cross(axis, up))
    d = _sub(p, center)
    return math.degrees(math.atan2(_dot(d, _unit(up)), _dot(d, fwd)))


def lid_report(points, faces, eye_center, eye_radius, closest, eye_point=None, up=(0.0, 1.0, 0.0),
               axis=(1.0, 0.0, 0.0), blink_deg=None, extent_deg=None, reach=2.0, thresholds=None):
    """Lids fitted over the real eyeball (antCGi RlNnp4qQIrU [00:08:24]; x07USYlvu2o [00:15:18]).
    Rest: no lid vertex or edge midpoint inside the eyeball, border gap under lid_gap_rel x eye
    radius [added]. Blink: the upper lid rotates about the eyeball centre (axis: the eye's
    left-right axis) until its top border vertex meets the bottom one (full close by the upper lid
    [added]), weights falling with elevation over `extent_deg` (default the blink angle) [added],
    so two topologies get the same weights; then the same clearance. `reach` limits the lid
    region to that many eyeball radii from the centre [added]."""
    thr = dict(DEFORM_THRESHOLDS)
    thr.update(thresholds or {})
    topo = Topology(faces, len(points))
    loop, _ = _nearest_loop(topo, points, tuple(eye_point or eye_center), True)
    if not loop:
        return {"ok": False, "fails": ["error: no eye opening found near %s" % (eye_point or eye_center,)]}
    region = set(i for i, p in enumerate(points) if _len(_sub(p, eye_center)) <= reach * eye_radius)
    region |= set(loop)
    edges = [k for k in topo.ef if k[0] in region and k[1] in region]
    rest = clearance(points, sorted(region), edges, closest)
    border = clearance(points, loop, [], closest)
    gap = max(clearance(points, [x], [], closest)["min"] for x in loop)
    el = {x: _elevation(points[x], eye_center, axis, up) for x in region}
    top = max(loop, key=lambda x: el[x])
    bot = min(loop, key=lambda x: el[x])
    ai = max(range(3), key=lambda i: abs(axis[i]))
    ca, cb = corners_by_axis(loop, points, ai)
    corner_el = 0.5 * (el[ca] + el[cb])
    ang = (el[top] - el[bot]) if blink_deg is None else float(blink_deg)
    ext = ang if extent_deg is None else float(extent_deg)
    span = el[top] - corner_el
    w = [0.0] * len(points)
    upper = []
    for x in region:
        e = el[x]
        if e <= corner_el:
            continue
        upper.append(x)
        wc = _smooth01(0.0, span, e - corner_el) if span > 0 else 1.0       # corners stay pinned [added]
        we = 1.0 - max(0.0, min(1.0, (e - el[top]) / ext)) if ext > 0 else 1.0
        w[x] = wc * we
    posed = pose_points(points, w, eye_center, axis, ang, mode="rotate")
    uset = set(upper)
    blink = clearance(posed, upper, [k for k in edges if k[0] in uset and k[1] in uset], closest)
    rep = {"loop_verts": len(loop), "rest": rest, "border_min": border["min"], "border_gap_max": round(gap, 6),
           "blink_deg": round(ang, 3), "extent_deg": round(ext, 3), "upper_verts": len(upper), "blink": blink,
           "eye_radius": eye_radius}
    fails = []
    if rest["min"] is not None and rest["min"] < 0.0:
        fails.append("error: lid inside the eyeball at rest (%d vertices, %d edge midpoints, min %.4g cm)"
                     % (rest["inside_verts"], rest["inside_mids"], rest["min"]))
    if gap > thr["lid_gap_rel"] * eye_radius:
        fails.append("warn: lid border stands %.4g cm off the eyeball (max %.4g): fit it over the eye"
                     % (gap, thr["lid_gap_rel"] * eye_radius))
    if blink["min"] is not None and blink["min"] < 0.0:
        fix = "fix the rest fit first" if (rest["min"] is not None and rest["min"] < 0.0) else "add lid loops"
        fails.append("error: the blink pushes %d lid points into the eyeball (min %.4g cm): %s"
                     % (blink["inside_verts"] + blink["inside_mids"], blink["min"], fix))
    rep["fails"] = fails
    rep["ok"] = not any(x.startswith("error") for x in fails)
    if thresholds and thresholds.get("_keep_posed"):
        rep["_posed"] = posed
    return rep


# ------------------------------------------------------------ high vs low silhouettes (pure)
def silhouette_overlap(w, h, rgba_high, rgba_low, out_png=None):
    """On Mars' flat-black silhouette check (YDu9pYMkkSM [00:01:16]) as numbers: two silhouette
    renders of high and low from the same camera (black shape on white). high_only pixels are
    where the high pokes out of the low (the bake will miss them); low_only where the low is
    bigger. Writes a diff image when out_png is given: grey both, red high only, blue low only."""
    ha, la = rgba_high[0::4], rgba_low[0::4]
    both = high = low = 0
    buf = bytearray(b"\xff" * (w * h * 3)) if out_png else None
    for i in range(w * h):
        a, b = ha[i] < 128, la[i] < 128
        if a and b:
            both += 1
            col = (150, 150, 150)
        elif a:
            high += 1
            col = (220, 30, 30)
        elif b:
            low += 1
            col = (30, 60, 220)
        else:
            continue
        if buf is not None:
            buf[3 * i:3 * i + 3] = bytes(col)
    union = both + high + low
    rep = {"both": both, "high_only": high, "low_only": low,
           "xor_share": round((high + low) / float(union), 5) if union else 0.0}
    if out_png:
        import mx_review
        rep["image"] = mx_review.write_png(out_png, w, h, bytes(buf))
    return rep


# =========================================================================== Maya layer
def _cmds():
    import maya.cmds as cmds
    return cmds


def _om():
    import maya.api.OpenMaya as om
    return om


def _dag(name):
    om = _om()
    sl = om.MSelectionList()
    sl.add(name)
    return sl.getDagPath(0)


def _resolve(mesh):
    import mx_audit
    return mx_audit.resolve_mesh(mesh)


def _short(name):
    return name.split("|")[-1].split(":")[-1]


def _num(obj, name):
    x = getattr(obj, name)
    return x() if callable(x) else x


_FLAG_CACHE = {}


def command_flags(cmd):
    """MAYA. {long: short} flags of a command from cmds.help (cached)."""
    if cmd not in _FLAG_CACHE:
        try:
            text = _cmds().help(cmd)
        except Exception:
            text = ""
        _FLAG_CACHE[cmd] = parse_help_flags(text)
    return _FLAG_CACHE[cmd]


def call(cmd, *args, **flags):
    """MAYA. Run cmds.<cmd> with only the flags its help lists; (result, dropped flags). When
    help lists nothing (unparsed), every flag is passed and a bad one raises as usual."""
    known = command_flags(cmd)
    shorts = set(known.values())
    use, dropped = {}, []
    for k, val in flags.items():
        if not known or k in known or k in shorts:
            use[k] = val
        else:
            dropped.append(k)
    return getattr(_cmds(), cmd)(*args, **use), dropped


def ensure_plugin(name):
    """MAYA. Load a plug-in quietly; True when loaded. Unfold3D commands (u3dUnfold, u3dOptimize,
    u3dLayout, u3dAutoSeam) come from the Unfold3D plug-in [verify]."""
    cmds = _cmds()
    try:
        if not cmds.pluginInfo(name, q=True, loaded=True):
            cmds.loadPlugin(name, quiet=True)
        return bool(cmds.pluginInfo(name, q=True, loaded=True))
    except Exception:
        return False


def mesh_data(mesh, uv_set=None, hard=False, normals=False):
    """MAYA. Plain lists of a mesh: world points (cm), faces, u, v, per-face UV ids, UV sets;
    optional hard edges (vertex-pair keys) and per-corner normal ids."""
    om = _om()
    shape, xf = _resolve(mesh)
    fn = om.MFnMesh(_dag(shape))
    pts = [(p.x, p.y, p.z) for p in fn.getPoints(om.MSpace.kWorld)]
    counts, conn = fn.getVertices()
    faces = faces_of(list(counts), list(conn))
    sets = list(fn.getUVSetNames())
    uvs = uv_set or fn.currentUVSetName()
    d = {"name": xf, "shape": shape, "points": pts, "faces": faces, "uv_set": uvs, "uv_sets": sets}
    if uvs in sets:
        u, v = fn.getUVs(uvs)
        uc, ui = fn.getAssignedUVs(uvs)
        d.update(u=list(u), v=list(v), fuv=uv_faces(list(uc), list(ui), len(faces)))
    else:
        d.update(u=[], v=[], fuv=[None] * len(faces))
    if hard:
        keys = set()
        for e in range(int(_num(fn, "numEdges"))):
            if not fn.isEdgeSmooth(e):
                a, b = fn.getEdgeVertices(e)
                keys.add(edge_key(a, b))
        d["hard"] = keys
    if normals:
        nc, nids = fn.getNormalIds()
        d["normal_ids"] = uv_faces(list(nc), list(nids), len(faces))
    return d


def _clear_history(shape):
    """Delete construction history before an OpenMaya write (upstream nodes would overwrite the
    write on the next evaluation). Refuses a deformed mesh: after skinning only Delete
    Non-Deformer History is safe (antCGi x07USYlvu2o [00:11:37]), and UV or point surgery on a
    rigged mesh is not this skill's job."""
    import mx_audit
    cmds = _cmds()
    hist, deformers = mx_audit.history_info(shape)
    if deformers:
        raise RuntimeError("%s has deformers %s: refusing to write points or UVs" % (shape, deformers[:4]))
    if hist:
        xf = (cmds.listRelatives(shape, parent=True, fullPath=True) or [shape])[0]
        cmds.delete(xf, constructionHistory=True)


def write_points(mesh, pts):
    """MAYA. Set world points (cm) on a mesh without history (OpenMaya, not undoable)."""
    om = _om()
    shape, _ = _resolve(mesh)
    _clear_history(shape)
    om.MFnMesh(_dag(shape)).setPoints(om.MPointArray([om.MPoint(*p) for p in pts]), om.MSpace.kWorld)


def write_uvs(mesh, u, v, fuv, uv_set=None):
    """MAYA. Replace a UV set's coordinates and assignments (faces with None stay unmapped)."""
    om = _om()
    shape, _ = _resolve(mesh)
    _clear_history(shape)
    fn = om.MFnMesh(_dag(shape))
    s = uv_set or fn.currentUVSetName()
    fn.clearUVs(s)
    fn.setUVs(om.MFloatArray(u), om.MFloatArray(v), s)
    fn.assignUVs(om.MIntArray([len(x) if x else 0 for x in fuv]),
                 om.MIntArray([i for x in fuv if x for i in x]), s)


def create_mesh(name, points, faces):
    """MAYA. New mesh from world points (cm) and face lists, in initialShadingGroup."""
    om, cmds = _om(), _cmds()
    fn = om.MFnMesh()
    obj = fn.create(om.MPointArray([om.MPoint(*p) for p in points]),
                    om.MIntArray([len(f) for f in faces]), om.MIntArray([x for f in faces for x in f]))
    xf = cmds.rename(om.MFnDagNode(obj).fullPathName(), name)
    try:
        cmds.sets(xf, e=True, forceElement="initialShadingGroup")
    except Exception:
        pass
    return cmds.ls(xf, long=True)[0]


class SurfaceProjector(object):
    """MAYA. Closest points on a target mesh through MMeshIntersector, with the space convention
    self-calibrated on one of the target's own vertices (world in / world out, world in /
    local out, or local in / local out) [added: the convention is not in the saved docs]."""

    def __init__(self, target):
        om = _om()
        shape, _ = _resolve(target)
        dag = _dag(shape)
        self.om = om
        self.m = dag.inclusiveMatrix()
        self.mi = self.m.inverse()
        self.fn = om.MFnMesh(dag)
        self.inter = om.MMeshIntersector()
        self.inter.create(dag.node(), self.m)
        self.mode = self._calibrate()

    def _calibrate(self):
        om = self.om
        p = self.fn.getPoint(0, om.MSpace.kWorld)
        q = self._pt(self.inter.getClosestPoint(p).point)
        if q.distanceTo(p) < 1e-3:
            return "world"
        if (q * self.m).distanceTo(p) < 1e-3:
            return "world_in_local_out"
        q2 = self._pt(self.inter.getClosestPoint(p * self.mi).point)
        if (q2 * self.m).distanceTo(p) < 1e-3:
            return "local"
        raise RuntimeError("MMeshIntersector space convention not recognized; freeze the target "
                           "transform and retry")

    def _pt(self, fp):
        return self.om.MPoint(fp.x, fp.y, fp.z)      # MPointOnMesh.point is an MFloatPoint

    def closest(self, p):
        """World point (tuple, cm) -> (world closest point, world normal)."""
        om = self.om
        wp = om.MPoint(*p)
        res = self.inter.getClosestPoint(wp if self.mode != "local" else wp * self.mi)
        q = self._pt(res.point)
        fn_ = res.normal
        n = om.MVector(fn_.x, fn_.y, fn_.z)
        if self.mode != "world":
            q = q * self.m
            n = n * self.m
        n.normalize()
        return (q.x, q.y, q.z), (n.x, n.y, n.z)


def sample_ids(n, samples):
    step = max(1, n // max(1, samples))
    return range(0, n, step)


def deviation(mesh, target, samples=20000, both=True):
    """MAYA. Closest-point distances mesh -> target (and target -> mesh), in cm, with the sign
    against the target normal (positive = outside). 'outside_pct' is the share above 0."""
    out = {}
    pairs = [("to_target", mesh, target)] + ([("from_target", target, mesh)] if both else [])
    for key, a, b in pairs:
        pts = mesh_data(a)["points"]
        proj = SurfaceProjector(b)
        d = []
        for i in sample_ids(len(pts), samples):
            q, n = proj.closest(pts[i])
            dv = _sub(pts[i], q)
            d.append(_len(dv) * (1.0 if _dot(dv, n) >= 0 else -1.0))
        st = deviation_stats(d)
        st["outside_pct"] = round(100.0 * sum(1 for x in d if x > 0) / len(d), 2) if d else None
        st["max_outside"] = round(max([x for x in d if x > 0] or [0.0]), 6)
        out[key] = st
    return out


def prep_source(src, name=None, weld=None, soften=True):
    """MAYA. Working copy of a dense sculpt, scan or AI mesh; the source is never modified (it is
    the bake source). Welds coincident vertices (AI meshes are often unwelded), softens all edges
    (scanners mark every edge hard, Maya 2027 Help, Tips for working with scan data) and reports
    what Retopologize and Unfold3D refuse. Nothing is auto-fixed beyond the weld."""
    cmds = _cmds()
    shape, xf = _resolve(src)
    work = cmds.duplicate(xf, name=name or _short(xf) + "_work", returnRootsOnly=True)[0]
    cmds.delete(work, constructionHistory=True)
    bb = cmds.exactWorldBoundingBox(work)
    diag = math.sqrt(sum((bb[i + 3] - bb[i]) ** 2 for i in range(3)))
    before = cmds.polyEvaluate(work, vertex=True)
    d = weld if weld is not None else diag * 1e-6          # [added] relative weld distance
    call("polyMergeVertex", work + ".vtx[*]", distance=d, constructionHistory=False)
    if soften:
        call("polySoftEdge", work, angle=180, constructionHistory=False)
    cmds.delete(work, constructionHistory=True)
    rep = {"work": cmds.ls(work, long=True)[0], "verts_before": before,
           "verts_after": cmds.polyEvaluate(work, vertex=True),
           "tris": cmds.polyEvaluate(work, triangle=True), "shells": cmds.polyEvaluate(work, shell=True),
           "weld_distance": d}
    for key, flag in (("non_manifold_edges", "nonManifoldEdges"), ("non_manifold_verts", "nonManifoldVertices"),
                      ("lamina_faces", "laminaFaces")):
        rep[key] = len(cmds.polyInfo(work, **{flag: True}) or [])
    rep["retopologize_ready"] = not (rep["non_manifold_edges"] or rep["non_manifold_verts"] or rep["lamina_faces"])
    return rep["work"], rep


def decimate(mesh, triangles, name=None):
    """MAYA. Decimated copy (polyReduce, the command behind Reduce: decimation, not retopology,
    Maya 2027 Help marking menu wording) as a fast projection or section proxy. Pass the prep
    copy from prep_source: whether polyReduce accepts non-manifold input is [verify]
    (job_probe_commands)."""
    cmds = _cmds()
    _, xf = _resolve(mesh)
    dup = cmds.duplicate(xf, name=name or _short(xf) + "_proxy", returnRootsOnly=True)[0]
    _, dropped = call("polyReduce", dup, version=1, termination=2, triangleCount=int(triangles),
                      keepQuadsWeight=0.0, constructionHistory=False)     # [verify] termination 2 = triangles
    cmds.delete(dup, constructionHistory=True)
    return cmds.ls(dup, long=True)[0], {"tris": cmds.polyEvaluate(dup, triangle=True), "dropped_flags": dropped}


def _set_enum_label(node, attr, label):
    cmds = _cmds()
    plug = node + "." + attr
    try:
        names = (cmds.attributeQuery(attr, node=node, listEnum=True) or [""])[0].split(":")
    except Exception:
        names = []
    for i, n in enumerate(names):
        nm, _, val = n.partition("=")
        if nm.strip().lower().replace(" ", "") == label.lower().replace(" ", ""):
            cmds.setAttr(plug, int(val) if val else i)
            return True
    return False


def _find_attr(attrs, wanted):
    w = wanted.lower()
    for a in attrs:
        if a.lower() == w:
            return a
    for a in attrs:
        if w in a.lower():
            return a
    return None


def retopologize(mesh, target_faces, hard_surface=False, preprocess=None, tolerance_pct=None,
                 symmetry=None, preserve_hard_edges=None, tags=None, name=None):
    """MAYA. Mesh > Retopologize on a duplicate, then history deleted (Maya 2027 Help: polyRetopo
    re-runs on later edits and on file open otherwise). hard_surface sets Topology Regularity 1,
    Face Uniformity 1, Anisotropy 0 (same doc). symmetry: {"axis": "+X to -X", "position":
    "Bounding Box"}; runs on the whole mesh (never half). tags: edge component tag names
    (comma list, <name>* wildcards) to guide edge flow. Flags the command does not list are set
    on the polyRetopo node instead, with Pause on while editing when the node has it."""
    cmds = _cmds()
    _, xf = _resolve(mesh)
    work = cmds.duplicate(xf, name=name or _short(xf) + "_retopo", returnRootsOnly=True)[0]
    cmds.delete(work, constructionHistory=True)
    wanted = {"targetFaceCount": int(target_faces)}
    if tolerance_pct is not None:
        wanted["targetFaceCountTolerance"] = float(tolerance_pct)
    if preprocess is not None:
        wanted["preprocessMesh"] = bool(preprocess)
    if hard_surface:
        wanted.update(topologyRegularity=1.0, faceUniformity=1.0, anisotropy=0.0)
    if preserve_hard_edges is not None:
        wanted["preserveHardEdges"] = bool(preserve_hard_edges)
    if symmetry:
        wanted["symmetry"] = True
    if tags:
        wanted["featureTags"] = tags if isinstance(tags, str) else ",".join(tags)
    t0 = time.time()
    _, dropped = call("polyRetopo", work, **wanted)                        # [verify] flags
    node = next((n for n in cmds.listHistory(work) or [] if cmds.nodeType(n) == "polyRetopo"), None)
    rep = {"node": node, "dropped_flags": dropped, "set_on_node": {}, "enum_set": {}}
    if node:
        attrs = cmds.listAttr(node) or []
        todo = [(k, wanted[k]) for k in dropped]
        if symmetry:
            todo.append(("__enum__", symmetry))
        pause = _find_attr(attrs, "pause")
        if todo:
            if pause:
                cmds.setAttr(node + "." + pause, 1)
            for k, val in todo:
                if k == "__enum__":
                    for key, attr_guess in (("axis", "axis"), ("position", "axisPosition")):
                        if key in val:
                            a = _find_attr(attrs, attr_guess)
                            rep["enum_set"][key] = bool(a) and _set_enum_label(node, a, val[key])
                    continue
                a = _find_attr(attrs, k if k != "featureTags" else "tag")
                if a:
                    try:
                        if isinstance(val, str):
                            cmds.setAttr(node + "." + a, val, type="string")
                        else:
                            cmds.setAttr(node + "." + a, val)
                        rep["set_on_node"][k] = a
                    except Exception as exc:
                        rep["set_on_node"][k] = "failed: %s" % exc
            if pause:
                cmds.setAttr(node + "." + pause, 0)
        rep["node_attrs_sample"] = [a for a in attrs if any(w in a.lower() for w in (
            "face", "uniform", "regular", "aniso", "preprocess", "symm", "axis", "tag", "hard", "angle",
            "pause", "tolerance"))][:40]
    faces = cmds.polyEvaluate(work, face=True)
    cmds.delete(work, constructionHistory=True)
    left = [n for n in cmds.listHistory(work) or [] if cmds.nodeType(n) == "polyRetopo"]
    rep.update(result=cmds.ls(work, long=True)[0], faces=faces, target=int(target_faces),
               seconds=round(time.time() - t0, 2), history_left=left,
               quads_only=cmds.polyEvaluate(work, triangle=True) == 2 * faces)
    return rep["result"], rep


def tag_edges(mesh, tag, edge_ids):
    """MAYA. Edge component tag on a mesh shape, to steer Retopologize's feature preservation
    without hard edges (Maya 2027 Help, Preserve areas). Attribute layout componentTags[i].
    componentTagName / componentTagContents is [verify] (not in the saved pages)."""
    cmds = _cmds()
    shape, _ = _resolve(mesh)
    idx = cmds.getAttr(shape + ".componentTags", multiIndices=True) or []
    i = (max(idx) + 1) if idx else 0
    cmds.setAttr("%s.componentTags[%d].componentTagName" % (shape, i), tag, type="string")
    comps = ["e[%d]" % e for e in edge_ids]
    cmds.setAttr("%s.componentTags[%d].componentTagContents" % (shape, i), len(comps), *comps,
                 type="componentList")
    return i


def edge_ids_for(mesh, keys):
    """MAYA. Mesh edge indices for vertex-pair keys."""
    om = _om()
    shape, _ = _resolve(mesh)
    fn = om.MFnMesh(_dag(shape))
    want = set(edge_key(a, b) for a, b in keys)
    out = []
    for e in range(int(_num(fn, "numEdges"))):
        a, b = fn.getEdgeVertices(e)
        if edge_key(a, b) in want:
            out.append(e)
    return out


def relax_project(mesh, target, iterations=4, strength=0.5, border="slide", center_axis=0,
                  center_tol=1e-3, lock=(), tangential=True):
    """MAYA. The scripted Quad Draw relax: tangential Laplacian passes, each followed by a
    closest-point projection onto the target; center-line vertices stay at 0 (FlippedNormals
    recentre the middle line, 9N4rG5qHWgk [00:19:06]). Writes the mesh (an agent-made
    duplicate without history). Relax before UVs: relaxing moves UVs (antCGi e74KphYwMww
    [00:19:21])."""
    d = mesh_data(mesh)
    pts, faces = d["points"], d["faces"]
    topo = Topology(faces, len(pts))
    nbrs = topo.relax_neighbors(border)
    proj = SurfaceProjector(target)
    locked = set(lock)
    center = []
    if center_axis is not None:
        center = [i for i, p in enumerate(pts) if abs(p[center_axis]) <= center_tol]
    moved = 0.0
    for _ in range(iterations):
        nrm = vertex_normals(pts, faces) if tangential else None
        new = laplacian_step(pts, nbrs, locked, strength, nrm)
        for i in range(len(new)):
            if i not in locked:
                new[i] = proj.closest(new[i])[0]
        for i in center:
            q = list(new[i])
            q[center_axis] = 0.0
            new[i] = tuple(q)
        moved = max(_len(_sub(a, b)) for a, b in zip(pts, new)) if pts else 0.0
        pts = new
    write_points(mesh, pts)
    return {"iterations": iterations, "last_max_move": round(moved, 6), "center_verts": len(center),
            "projector_mode": proj.mode}


def project_to_surface(mesh, target, lock=()):
    """MAYA. Snap every vertex onto the target (closest point): the scripted Shrink Wrap On
    Mars uses to make the low hug the high (YDu9pYMkkSM [00:15:02] [00:17:45])."""
    d = mesh_data(mesh)
    proj = SurfaceProjector(target)
    locked = set(lock)
    pts = [p if i in locked else proj.closest(p)[0] for i, p in enumerate(d["points"])]
    write_points(mesh, pts)
    return len(pts) - len(locked)


def fit_template(template, target, landmarks, name=None, smooth=0.0, relax_iterations=3):
    """MAYA. Reuse approved topology (FlippedNormals 9N4rG5qHWgk [00:10:11]; Jessica Dru Johnson's
    standard base, ZiYEO49B768 [00:58:51]): duplicate the template, align it by landmark pairs
    (similarity, then biharmonic warp), project onto the target, relax and re-project.
    landmarks: {name: (template_vertex_id, (x, y, z) on the target)}, 4+ spread pairs."""
    cmds = _cmds()
    _, xf = _resolve(template)
    dup = cmds.duplicate(xf, name=name or _short(xf) + "_fit", returnRootsOnly=True)[0]
    cmds.delete(dup, constructionHistory=True)
    try:
        cmds.makeIdentity(dup, apply=True, t=True, r=True, s=True, n=0)
    except Exception:
        pass
    d = mesh_data(dup)
    pts = d["points"]
    names = sorted(landmarks)
    src = [pts[landmarks[k][0]] for k in names]
    dst = [tuple(landmarks[k][1]) for k in names]
    sim = similarity_fit(src, dst)
    pts = [apply_similarity(sim, p) for p in pts]
    src2 = [apply_similarity(sim, p) for p in src]
    warp = rbf_warp(src2, dst, smooth=smooth) if len(names) >= 4 else None
    if warp:
        pts = [warp(p) for p in pts]
    write_points(dup, pts)
    project_to_surface(dup, target)
    rel = relax_project(dup, target, iterations=relax_iterations) if relax_iterations else None
    after = mesh_data(dup)["points"]
    lm_err = [_len(_sub(after[landmarks[k][0]], tuple(landmarks[k][1]))) for k in names]
    return cmds.ls(dup, long=True)[0], {"similarity_rms": round(sim["rms"], 5), "scale": round(sim["s"], 6),
                                        "landmark_error_max": round(max(lm_err), 5), "relax": rel}


def build_tube(source, path, stations, sides=8, radius=None, name="tube_geo", ref=(0.0, 1.0, 0.0)):
    """MAYA. Quad tube from plane sections of the source (see tube_from_sections). For a
    1M+ triangle source pass a decimated proxy (decimate()) and project onto the full source
    afterwards with relax_project."""
    d = mesh_data(source)
    tris = triangles_of(d["faces"])
    res = tube_from_sections(d["points"], tris, path, stations, sides, radius, ref)
    if not res["faces"]:
        raise RuntimeError("no tube built: stations failed %s" % res["failed"])
    node = create_mesh(name, res["points"], res["faces"])
    res.pop("points")
    res.pop("faces")
    return node, res


def cavity(mesh, point, depth, steps=3, scale=0.85, close=True, name=None):
    """MAYA. Pocket on the open border nearest `point` (cavity_arrays), as a NEW mesh built
    with OpenMaya (topology changes; do it before UVs). Returns (node, report)."""
    d = mesh_data(mesh)
    topo = Topology(d["faces"], len(d["points"]))
    loop, _ = _nearest_loop(topo, d["points"], tuple(point), True)
    if not loop:
        raise RuntimeError("no open border near %s" % (point,))
    res = cavity_arrays(d["points"], d["faces"], loop, depth, steps, scale, close=close)
    node = create_mesh(name or _short(d["name"]) + "_cav", res["points"], res["faces"])
    return node, {"loop_verts": len(loop), "new_verts": res["new_verts"], "faces": len(res["faces"])}


def surface_hit(mesh, origin, direction):
    """MAYA. First hit of a world ray (cm) on a mesh (MFnMesh.closestIntersection [verify
    return layout]), or None."""
    om = _om()
    shape, _ = _resolve(mesh)
    fn = om.MFnMesh(_dag(shape))
    res = fn.closestIntersection(om.MFloatPoint(*origin), om.MFloatVector(*direction), om.MSpace.kWorld,
                                 1e7, False)
    if not res or res[2] is None or res[2] < 0:
        return None
    p = res[0]
    return (p.x, p.y, p.z)


def landmark_from_pixel(targets, mesh, view, px, py, resolution=1024, margin=1.1, focus=None, camera=None):
    """MAYA. Turn a pixel the agent picked on an mx_review tile (full-size tile, top-left
    origin) into a point on the mesh: same camera as mx_review.review, then a ray cast.
    camera: the view's saved camera (review()["cameras"][view] or review.json), exact even if
    the scene moved since the render; without it the camera is rebuilt from the targets'
    points (mx_review.target_points, the public sampler review() uses)."""
    import mx_audit
    import mx_review
    cmds = _cmds()
    k = mx_audit.UI_TO_CM.get(cmds.currentUnit(q=True, linear=True), 1.0)
    if camera is not None:
        fr = camera
        resolution = resolution or camera.get("resolution")
    else:
        pts = mx_review.target_points(targets)
        foc = ((tuple(x / k for x in focus[0]), focus[1] / k) if focus else None)
        fr = view_frame(pts, view, margin, cmds.upAxis(q=True, axis=True), foc)
    o, dvec = pixel_ray(fr, px, py, resolution)
    hit = surface_hit(mesh, _mul(o, k), dvec)
    return hit


def snap_center(mesh, axis=0, band=0.01, border_only=False):
    """MAYA. Put center-line vertices (|coord| <= band) exactly on 0 (FlippedNormals fixed 39
    vertices at 0.01, 9N4rG5qHWgk [00:19:06]). border_only for a half mesh's cut border."""
    d = mesh_data(mesh)
    pts = d["points"]
    topo = Topology(d["faces"], len(pts)) if border_only else None
    moved = 0
    for i, p in enumerate(pts):
        if abs(p[axis]) <= band and p[axis] != 0.0 and (not border_only or topo.border_v[i]):
            q = list(p)
            q[axis] = 0.0
            pts[i] = tuple(q)
            moved += 1
    write_points(mesh, pts)
    return moved


def mirror_half(mesh, axis=0, tol=1e-3, keep_sign=1, name=None):
    """MAYA. Whole mesh from a half with the center welded at tol (mirror_arrays). A new mesh;
    the half stays for the caller to delete. UVs are not carried (unwrap after mirroring)."""
    d = mesh_data(mesh)
    res = mirror_arrays(d["points"], d["faces"], axis, tol, keep_sign)
    node = create_mesh(name or _short(d["name"]) + "_full", res["points"], res["faces"])
    return node, {k: res[k] for k in ("center_verts", "wrong_side_verts", "center_only_faces")}


def _nearest_loop(topo, pts, point, border=True):
    if border:
        loops = topo.border_loops()
        if loops:
            def score(lp):
                c = _mean([pts[x] for x in lp])
                return (round(_len(_sub(c, point)), 6), sum(_len(_sub(pts[x], point)) for x in lp) / len(lp))
            return min(loops, key=score), True
    vi = min(range(len(pts)), key=lambda i: _len(_sub(pts[i], point)))
    best = None
    for n in topo.nb[vi]:
        path, closed = topo.edge_loop(vi, n)
        if closed and (best is None or _len(_sub(_mean([pts[x] for x in path]), point)) <
                       _len(_sub(_mean([pts[x] for x in best]), point))):
            best = path
    return best, False


def retopo_report(retopo, source=None, openings=None, joints=None, cavities=None, regions=None,
                  symmetric=True, profile="subd", samples=20000, min_rings=3):
    """MAYA. The retopology gate. openings: {name: {"point": xyz, "border": True, "corner_axis": 0}}
    (eyes, mouth); joints: {name: {"center": xyz, "axis": xyz, "radius": r, "half_band": b}};
    cavities: {name: (center, radius)} where triangles are accepted (nostril, ear, mouth bag,
    eye corner: FlippedNormals 9N4rG5qHWgk [00:03:41]); regions: {name: (center, radius)} for mean
    edge length (eyes denser than cranium, [00:21:10]). min_rings=3 is [added]."""
    import mx_audit
    cmds = _cmds()
    audit = mx_audit.audit(retopo, symmetry_axis="x")
    d = mesh_data(retopo)
    pts, faces = d["points"], d["faces"]
    topo = Topology(faces, len(pts))
    shape = d["shape"]
    rep = {"mesh": d["name"], "faces": len(faces), "verdict": mx_audit.verdict(audit, profile, symmetric=symmetric)}
    rep["polyRetopo_in_history"] = any(cmds.nodeType(n) == "polyRetopo" for n in cmds.listHistory(shape) or [])
    edge_mean = audit.get("edge_len_mean") or 1.0
    if source:
        rep["deviation"] = deviation(retopo, source, samples=samples)
        for st in rep["deviation"].values():
            if st.get("n"):
                st["max_rel_edge"] = round(st["max"] / edge_mean, 4)
    rep["openings"] = {}
    for key, spec in (openings or {}).items():
        loop, is_border = _nearest_loop(topo, pts, tuple(spec["point"]), spec.get("border", True))
        if not loop:
            rep["openings"][key] = {"error": "no loop found near %s" % (spec["point"],)}
            continue
        rings = topo.rings_around(loop, pts, max_rings=spec.get("max_rings", 6))
        a, b = corners_by_axis(loop, pts, spec.get("corner_axis", 0))
        arcs = arc_counts(loop, a, b)
        rep["openings"][key] = {"loop_verts": len(loop), "border": is_border,
                                "clean_outer_rings": rings["clean_outer_rings"],
                                "ring_counts": [[e["count"] for e in lay] for lay in rings["layers"]],
                                "upper_lower": arcs, "equal_halves": arcs[0] == arcs[1],
                                "ok": rings["clean_outer_rings"] >= min_rings and arcs[0] == arcs[1]}
    rep["joints"] = {}
    for key, spec in (joints or {}).items():
        c, ax, r = tuple(spec["center"]), tuple(spec["axis"]), float(spec["radius"])
        seed, par = limb_seed_edge(pts, topo, c, ax, r)
        if not seed:
            rep["joints"][key] = {"error": "no edge within radius"}
            continue
        path, _ = topo.edge_loop(*seed)
        n = crossings(pts, path, c, ax, float(spec.get("half_band", 0.5 * r)))
        rep["joints"][key] = {"loops_in_band": n, "seed_parallel": round(par, 3), "ok": n >= 3}
    poles = topo.poles()
    labelled = {}
    areas = dict(openings or {})
    for key, spec in (joints or {}).items():
        areas[key] = {"point": spec["center"], "radius": spec["radius"]}
    for v_, val in poles:
        lab = "elsewhere"
        for key, spec in areas.items():
            p = tuple(spec.get("point", spec.get("center", (0, 0, 0))))
            if _len(_sub(pts[v_], p)) <= float(spec.get("radius", 3.0 * edge_mean)):
                lab = key
                break
        labelled.setdefault(lab, []).append(val)
    rep["poles_by_region"] = {k: {"count": len(x), "valences": sorted(set(x))} for k, x in labelled.items()}
    tris_out = []
    for fi, f in enumerate(faces):
        if len(f) == 3:
            c = _mean([pts[x] for x in f])
            if not any(_len(_sub(c, tuple(cc))) <= rr for cc, rr in (cavities or {}).values()):
                tris_out.append([round(x, 3) for x in c])
    rep["triangles_outside_cavities"] = {"count": len(tris_out), "sample": tris_out[:15]}
    if regions:
        rep["edge_length_by_region"] = {}
        for key, (cc, rr) in regions.items():
            L = [_len(_sub(pts[a], pts[b])) for a, b in topo.ef
                 if _len(_sub(_mul(_add(pts[a], pts[b]), 0.5), tuple(cc))) <= rr]
            rep["edge_length_by_region"][key] = round(sum(L) / len(L), 5) if L else None
    on, drift = center_split(pts, 0)
    rep["center_line"] = {"on_center": len(on), "drifting_1e-4_to_1e-2": len(drift)}
    rep["audit"] = {k: audit.get(k) for k in ("verts", "faces", "tris", "quads", "ngons", "quads_pct",
                                               "poles_e3", "poles_e5", "poles_e6plus", "holes",
                                               "symmetry_pct", "edge_len_mean", "edge_len_cv")}
    fails = [x for x in rep["verdict"] if x.startswith("error")]
    if rep["polyRetopo_in_history"]:
        fails.append("error: polyRetopo still in history (delete history)")
    fails += ["error: opening %s rings/halves" % k for k, o in rep["openings"].items() if not o.get("ok")]
    fails += ["error: joint %s has %s loops in band (need 3)" % (k, j.get("loops_in_band"))
              for k, j in rep["joints"].items() if not j.get("ok")]
    if drift:
        fails.append("error: %d vertices drift near the center line" % len(drift))
    rep["fails"] = fails
    rep["ok"] = not fails
    return rep


# ---------------------------------------------------------------- deformation-ready gate (Maya)
def deform_test(mesh, chain, bends, max_dist=None, thresholds=None, review_dir=None,
                views=("front", "threequarter"), keep=False):
    """MAYA. The deformation-ready gate on a retopologized mesh (procedures P19). Reads the mesh's
    points and writes nothing to it; deform_report poses a copy of the arrays with proxy weights
    (identical for any topology of the same surface, so two variants compare fairly). With
    review_dir or keep, one posed copy per bend is built (<mesh>_<bend>_pose) and, with
    review_dir, rendered by mx_review (wire and clay, framed on the joint); keep=False deletes the
    copies afterwards. No skinCluster is made: binds, Skin Tools layers and correctives are
    scenario-maya-deformation's."""
    cmds = _cmds()
    d = mesh_data(mesh)
    need = bool(review_dir or keep)
    rep = deform_report(d["points"], d["faces"], chain, bends, max_dist, thresholds, keep_posed=need)
    rep["mesh"] = d["name"]
    made = []
    for b in rep["bends"]:
        posed = b.pop("_posed", None)
        if posed is None:
            continue
        node = create_mesh("%s_%s_pose" % (_short(d["name"]), re.sub(r"\W", "_", str(b["name"]))), posed, d["faces"])
        made.append(node)
        b["posed_mesh"] = node
        if review_dir:
            import mx_review
            focus = (tuple(chain[b["joint"]]), 3.0 * b["radius"])
            rv = mx_review.review([node], os.path.join(os.path.abspath(review_dir), re.sub(r"\W", "_", str(b["name"]))),
                                  views=views, modes=("wire", "clay"), focus=focus)
            b["sheet"] = rv["sheet"]
    if made and not keep:
        cmds.delete(made)
        for b in rep["bends"]:
            b.pop("posed_mesh", None)
    return rep


def tension_node(posed, rest, name="mxTension"):
    """MAYA [verify]. The 2026.3 dgaTension node (What's New in Maya 2026: stretch and squash of
    deformed geometry against reference geometry, Edge or UV method, output for dgaVisualizer or a
    deformer weight list). Its attribute names are not in the saved docs: this creates the node,
    connects posed and rest to the first attributes whose names look like input and reference,
    and returns what it found (job_probe_commands confirms). The gate's numbers come from
    deform_report; use this for a live heat map on a skinned mesh in a GUI session."""
    cmds = _cmds()
    rep = {"node": None, "attrs": [], "connected": {}, "error": None}
    try:
        node = cmds.createNode("dgaTension", name=name)
    except Exception as exc:
        rep["error"] = "createNode dgaTension failed: %s" % exc
        return rep
    rep["node"] = node
    attrs = cmds.listAttr(node) or []
    rep["attrs"] = attrs
    ps, _ = _resolve(posed)
    rs, _ = _resolve(rest)
    for key, src, guesses in (("input", ps + ".outMesh", ("inputGeometry", "inMesh", "input")),
                              ("reference", rs + ".outMesh", ("referenceGeometry", "reference", "rest"))):
        a = next((x for x in (_find_attr(attrs, g) for g in guesses) if x), None)
        if not a:
            rep["connected"][key] = None
            continue
        try:
            cmds.connectAttr(src, "%s.%s" % (node, a), force=True)
            rep["connected"][key] = a
        except Exception as exc:
            rep["connected"][key] = "failed %s: %s" % (a, exc)
    rep["output_candidates"] = [a for a in attrs if any(w in a.lower() for w in ("out", "weight", "tension"))][:20]
    return rep


def lid_check(head, eyeball, eye_point=None, up=(0.0, 1.0, 0.0), axis=(1.0, 0.0, 0.0), blink_deg=None,
              extent_deg=None, thresholds=None):
    """MAYA. Lids against the real eyeball mesh (procedures P20; antCGi RlNnp4qQIrU [00:08:24],
    x07USYlvu2o [00:15:18] [00:15:50]): lid_report with the eyeball's own closest points. The
    eyeball is the separate, forward-looking mesh the handoff requires; its centre is its bounding
    box centre and its radius the mean distance of its points [added]. eye_point defaults to the
    front of the eyeball, which finds the lid-margin border; after an eye pouch (P7) the margin is
    no longer a border, so run this before the pouch or pass eye_point on the margin opening."""
    dh, de = mesh_data(head), mesh_data(eyeball)
    pts = de["points"]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    c = tuple(0.5 * (lo[i] + hi[i]) for i in range(3))
    r = sum(_len(_sub(p, c)) for p in pts) / float(len(pts))
    fwd = _unit(_cross(axis, up))
    proj = SurfaceProjector(eyeball)
    rep = lid_report(dh["points"], dh["faces"], c, r, proj.closest, eye_point or _add(c, _mul(fwd, r)), up, axis,
                     blink_deg, extent_deg, thresholds=thresholds)
    rep.update(head=dh["name"], eyeball=de["name"], eye_center=[round(x, 5) for x in c])
    return rep


def overlap_review(low, high, out_dir, views=("front", "side", "threequarter"), resolution=512, thresholds=None):
    """MAYA (Arnold, headless in an mx_run child). On Mars' high-vs-low check (YDu9pYMkkSM
    [00:01:16] [00:07:27], procedures P21): mx_review silhouettes of the high and of the low from
    the same cameras (one focus sphere around the high), then silhouette_overlap per view: the share
    of differing pixels and a diff image (red = high outside the low, blue = low outside it)."""
    import mx_review
    thr = dict(DEFORM_THRESHOLDS)
    thr.update(thresholds or {})
    pts = mesh_data(high)["points"]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    c = tuple(0.5 * (lo[i] + hi[i]) for i in range(3))
    rad = 0.5 * _len(_sub(tuple(hi), tuple(lo)))
    out_dir = os.path.abspath(out_dir)
    kw = dict(views=views, modes=("silhouette",), resolution=resolution, focus=(c, rad))
    rh = mx_review.review([high], os.path.join(out_dir, "high"), **kw)
    rl = mx_review.review([low], os.path.join(out_dir, "low"), **kw)
    rep = {"views": {}, "fails": []}
    for v in views:
        ph, pl = rh["tiles"]["silhouette"].get(v), rl["tiles"]["silhouette"].get(v)
        if not (ph and pl):
            rep["views"][v] = {"error": "missing silhouette tile"}
            rep["fails"].append("warn: %s: missing silhouette tile" % v)
            continue
        w1, h1, dh = mx_review.read_rgba(ph)
        w2, h2, dl = mx_review.read_rgba(pl)
        if (w1, h1) != (w2, h2):
            rep["views"][v] = {"error": "tile sizes differ"}
            continue
        r = silhouette_overlap(w1, h1, dh, dl, os.path.join(out_dir, "overlap_%s.png" % v))
        rep["views"][v] = r
        if r["xor_share"] > thr["silhouette_xor"]:
            rep["fails"].append("warn: %s: %.1f%% of silhouette pixels differ (%d high only, %d low only)"
                                % (v, 100 * r["xor_share"], r["high_only"], r["low_only"]))
    rep["ok"] = not rep["fails"]
    return rep


# ---------------------------------------------------------------- UVs (Maya)
def planar_base(mesh, axis="z"):
    """MAYA. One planar projection so the mesh has UVs to cut (MLC s_KLbTUdKms [00:00:36])."""
    _, xf = _resolve(mesh)
    return call("polyPlanarProjection", xf + ".f[*]", mapDirection=axis, constructionHistory=False)[1]


def cut_seams(mesh, keys):
    """MAYA. Cut UVs along vertex-pair edges (the scripted 3D Cut and Sew UV Tool)."""
    _, xf = _resolve(mesh)
    ids = edge_ids_for(xf, keys)
    if ids:
        call("polyMapCut", ["%s.e[%d]" % (xf, e) for e in ids], constructionHistory=False)
    return len(ids)


def loop_keys(mesh, a, b):
    """MAYA. Vertex-pair keys of the edge loop through edge (a, b) (seam or straightening row)."""
    d = mesh_data(mesh)
    path, closed = Topology(d["faces"], len(d["points"])).edge_loop(a, b)
    keys = [edge_key(path[i], path[i + 1]) for i in range(len(path) - 1)]
    if closed:
        keys.append(edge_key(path[-1], path[0]))
    return keys


def unfold(target, map_size=2048, room_px=2, iterations=1):
    """MAYA. Unfold3D unfold. Unselected UVs are pinned automatically with Unfold3D (Maya 2027
    Help, Unfold a UV mesh); Room space stays at its 2 px default (do not raise it: slow and
    distorting; padding belongs to Layout)."""
    ensure_plugin("Unfold3D")
    return call("u3dUnfold", target, iterations=iterations, pack=0, borderintersection=1, triangleflip=1,
                mapsize=map_size, roomspace=room_px)[1]


def optimize(target, map_size=2048, room_px=2, iterations=1, power=100, surfangle=1):
    """MAYA. Unfold3D Optimize with the documented defaults (Power 100, Surfangle 1)."""
    ensure_plugin("Unfold3D")
    return call("u3dOptimize", target, iterations=iterations, power=power, surfangle=surfangle,
                borderintersection=1, triangleflip=1, mapsize=map_size, roomspace=room_px)[1]


def pin_uvs(mesh, uv_ids, on=True):
    """MAYA. Pin or unpin UVs (polyPinUV [verify])."""
    _, xf = _resolve(mesh)
    return call("polyPinUV", ["%s.map[%d]" % (xf, i) for i in uv_ids], value=1.0 if on else 0.0)[1]


def straighten_rows(mesh, rows, axis="v", map_size=2048):
    """MAYA. The MLC straightening: align each border row of UVs to its max (V rows) or max U,
    pin the rows, Optimize the interior, unpin (s_KLbTUdKms [00:04:49] [00:05:19]).
    rows: lists of UV ids."""
    d = mesh_data(mesh)
    u, v = d["u"], d["v"]
    k = 1 if axis == "v" else 0
    for row in rows:
        su = max(u[i] for i in row) - min(u[i] for i in row)
        sv = max(v[i] for i in row) - min(v[i] for i in row)
        if (sv if k else su) > (su if k else sv):
            raise ValueError("row of %d UVs runs along %s: aligning it would collapse it; orient the shell "
                             "first (orient_shell)" % (len(row), axis.upper()))
    for row in rows:
        val = max((v if k else u)[i] for i in row)
        for i in row:
            if k:
                v[i] = val
            else:
                u[i] = val
    write_uvs(mesh, u, v, d["fuv"], d["uv_set"])
    pinned = [i for r in rows for i in r]
    pin_uvs(mesh, pinned, True)
    shell_uv, _, _ = uv_shell_ids(d["fuv"], len(u))
    shells = set(shell_uv[i] for i in pinned)
    others = [i for i in range(len(u)) if shell_uv[i] in shells and i not in set(pinned)]
    _, xf = _resolve(mesh)
    if others:
        optimize(["%s.map[%d]" % (xf, i) for i in others], map_size=map_size)
    pin_uvs(mesh, pinned, False)
    return len(pinned)


def rotate_uvs(u, v, ids, angle_deg, pivot):
    """Pure: rotate the listed UVs about a pivot (counterclockwise degrees)."""
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    nu, nv = list(u), list(v)
    for i in ids:
        x, y = u[i] - pivot[0], v[i] - pivot[1]
        nu[i], nv[i] = pivot[0] + ca * x - sa * y, pivot[1] + sa * x + ca * y
    return nu, nv


def orient_shell(mesh, uv_a, uv_b, axis="u"):
    """MAYA. Orient to Edges (MLC s_KLbTUdKms [00:03:10]): rotate the whole shell holding UV
    uv_a so the UV edge a-b lies along U or V, about the shell's box center. Do it before
    straightening rows, or an aligned row can collapse."""
    d = mesh_data(mesh)
    u, v = d["u"], d["v"]
    shell_uv, _, _ = uv_shell_ids(d["fuv"], len(u))
    ids = [i for i in range(len(u)) if shell_uv[i] == shell_uv[uv_a]]
    ang = orient_angle((u[uv_a], v[uv_a]), (u[uv_b], v[uv_b]), axis)
    piv = ((min(u[i] for i in ids) + max(u[i] for i in ids)) / 2.0, (min(v[i] for i in ids) + max(v[i] for i in ids)) / 2.0)
    nu, nv = rotate_uvs(u, v, ids, ang, piv)
    write_uvs(mesh, nu, nv, d["fuv"], d["uv_set"])
    return ang


def rotate_shell(mesh, uv_ids, angle):
    """MAYA. Rotate UVs about their bounding-box center (polyEditUV rotation)."""
    d = mesh_data(mesh)
    us, vs = [d["u"][i] for i in uv_ids], [d["v"][i] for i in uv_ids]
    _, xf = _resolve(mesh)
    return call("polyEditUV", ["%s.map[%d]" % (xf, i) for i in uv_ids], rotation=True, angle=angle,
                pivotU=(min(us) + max(us)) / 2.0, pivotV=(min(vs) + max(vs)) / 2.0)[1]


def set_texel_density(mesh, target, map_size=2048, bias=None, uv_set=None):
    """MAYA. Scale every shell about its UV box center to target px/cm (x bias per shell), the
    scripted Texel Density Set (the 2027 UI needs Map Size first; the script takes it as an
    argument). Returns before/after per shell. Pack afterwards with layout(scale_mode="off")."""
    d = mesh_data(mesh, uv_set)
    shell_uv, shell_face, _ = uv_shell_ids(d["fuv"], len(d["u"]))
    td = shell_densities(d["points"], d["faces"], d["u"], d["v"], d["fuv"], map_size, shell_face)
    scales = density_scales({s: e["px_per_unit"] for s, e in td.items()}, target, bias)
    piv = {s: ((e["bbox"][0] + e["bbox"][2]) / 2.0, (e["bbox"][1] + e["bbox"][3]) / 2.0) for s, e in td.items()}
    nu, nv = scale_uvs(d["u"], d["v"], shell_uv, scales, piv)
    write_uvs(mesh, nu, nv, d["fuv"], d["uv_set"])
    after = shell_densities(d["points"], d["faces"], nu, nv, d["fuv"], map_size, shell_face)
    return {"target": target, "shells": len(td),
            "before": {s: round(e["px_per_unit"], 4) for s, e in td.items()},
            "after": {s: round(e["px_per_unit"], 4) for s, e in after.items()}}


def layout(mesh, map_size=2048, shell_px=16, border_px=8, scale_mode="off", rotate_step=90,
           pre_scale="off", pre_rotate="off", tiles=(1, 1), resolution=256):
    """MAYA. Unfold3D Layout with padding in UV units = px / map size (Maya 2027 Help: Layout
    Settings; Shell spacing). scale_mode "off" keeps the texel density you set; "uniform"
    (the UI default) rescales everything to fill the tile, then report the achieved px/cm.
    Enum values and the tiles flag are [verify]; dropped flags are returned."""
    ensure_plugin("Unfold3D")
    _, xf = _resolve(mesh)
    enum = {"off": 0, "uniform": 1, "nonuniform": 2, "preserve3d": 1, "preserveuv": 2,
            "horizontal": 1, "vertical": 2}
    flags = dict(resolution=resolution, shellSpacing=shell_px / float(map_size),
                 tileMargin=border_px / float(map_size), layoutScaleMode=enum[scale_mode],
                 rotateStep=rotate_step, preScaleMode=enum[pre_scale], preRotateMode=enum[pre_rotate])
    if tuple(tiles) != (1, 1):
        flags["packBox"] = [0.0, float(tiles[0]), 0.0, float(tiles[1])]
    return call("u3dLayout", xf, **flags)[1]


def mirror_uvs(mesh, axis=0, source_sign=1, mode="stack", u_axis=0.5, offset_u=0.0, uv_set=None):
    """MAYA. Apply mirror_uv_layout to a mesh (stack mirrored shells for games, or symmetrize)."""
    d = mesh_data(mesh, uv_set)
    res = mirror_uv_layout(d["points"], d["faces"], d["u"], d["v"], d["fuv"], axis, source_sign, mode,
                           u_axis, offset_u)
    write_uvs(mesh, res["u"], res["v"], res["fuv"], d["uv_set"])
    return res["report"]


def lightmap_set(mesh, name="lightmap", source="map1", map_size=512, smallest_mip=None):
    """MAYA. Maya 2027 Help, Mapping UVs for lightmaps: duplicate the set, uniform density,
    no overlaps (unstack via layout on that set), padding from the lightmap size. The current
    set is restored."""
    cmds = _cmds()
    _, xf = _resolve(mesh)
    cur = (cmds.polyUVSet(xf, q=True, currentUVSet=True) or [source])[0]
    if name not in (cmds.polyUVSet(xf, q=True, allUVSets=True) or []):
        cmds.polyUVSet(xf, copy=True, uvSet=source, newUVSet=name)
    cmds.polyUVSet(xf, currentUVSet=True, uvSet=name)
    try:
        pad = mip_padding(map_size, smallest_mip)
        dropped = layout(xf, map_size=map_size, shell_px=pad["shell_px"], border_px=pad["border_px"],
                         scale_mode="uniform", pre_scale="preserve3d")
    finally:
        cmds.polyUVSet(xf, currentUVSet=True, uvSet=cur)
    return {"set": name, "padding": pad, "dropped_flags": dropped}


TRANSFER_SPACE = {"world": 0, "local": 1, "uv": 3, "component": 4, "topology": 5}   # [verify] probed


def transfer_uvs(src, dst, space="topology", sets="all"):
    """MAYA. Mesh > Transfer Attributes for UVs, then history deleted on dst. topology: same
    mesh before and after a relax (antCGi restores UVs this way, e74KphYwMww [00:20:05] used
    World) or a smoothed duplicate (Maya 2027 Help, Transfer UVs between meshes); world: a new
    topology (follows the old seams, usually worse than a fresh unwrap [added])."""
    cmds = _cmds()
    _, sx = _resolve(src)
    _, dx = _resolve(dst)
    _, dropped = call("transferAttributes", sx, dx, transferPositions=0, transferNormals=0,
                      transferUVs=2 if sets == "all" else 1, transferColors=0,
                      sampleSpace=TRANSFER_SPACE[space], searchMethod=3)
    cmds.delete(dx, constructionHistory=True)
    return dropped


def harden_uv_borders(mesh):
    """MAYA. Soften everything, then harden UV seams and borders (Polycount: hard edges where the
    UV seams are, for normal-mapped game lows)."""
    d = mesh_data(mesh)
    seams, borders = seam_edges(d["faces"], d["fuv"])
    _, xf = _resolve(mesh)
    call("polySoftEdge", xf, angle=180, constructionHistory=False)
    ids = edge_ids_for(xf, seams | borders)
    if ids:
        call("polySoftEdge", ["%s.e[%d]" % (xf, e) for e in ids], angle=0, constructionHistory=False)
    return len(ids)


def uv_report(mesh, map_size=2048, smallest_mip=None, target_density=None, tolerance=0.10,
              stacked_ok=False, uv_set=None, profile="film", images_dir=None, check_hard_edges=False):
    """MAYA. The UV gate: mx_audit numbers plus padding at the smallest mip, per-face distortion,
    per-shell density against the target (tolerance 10% [added]), hard edges vs seams (game
    lows), and UV sheet PNGs (shells, distortion, padding marks) to look at."""
    import mx_audit
    audit = mx_audit.audit(mesh, texture_size=map_size, uv_set=uv_set)
    d = mesh_data(mesh, uv_set, hard=check_hard_edges)
    pad_req = mip_padding(map_size, smallest_mip)
    pad = padding_check(d["u"], d["v"], d["fuv"], map_size, pad_req["shell_px"], pad_req["border_px"], stacked_ok)
    dist = face_distortion(d["points"], d["faces"], d["u"], d["v"], d["fuv"])
    _, shell_face, _ = uv_shell_ids(d["fuv"], len(d["u"]))
    td = shell_densities(d["points"], d["faces"], d["u"], d["v"], d["fuv"], map_size, shell_face)
    rep = {"mesh": d["name"], "uv_set": d["uv_set"], "uv_sets": d["uv_sets"], "map_size": map_size,
           "verdict": mx_audit.verdict(audit, "game" if profile == "game" else profile),
           "uv_audit": audit.get("uv"), "padding": {k: val for k, val in pad.items() if k != "border_marks"},
           "distortion": {k: val for k, val in dist.items() if k not in ("area_ratio", "anisotropy")}}
    if target_density:
        off = {s: round(e["px_per_unit"] / target_density, 3) for s, e in td.items()
               if abs(e["px_per_unit"] / target_density - 1.0) > tolerance}
        rep["density_off_target"] = {"target": target_density, "tolerance": tolerance, "shells": off}
    if check_hard_edges:
        rep["hard_edges_vs_seams"] = hard_seam_report(d["faces"], d["fuv"], d["hard"])
    if images_dir:
        tiles = sorted(set((int(math.floor(d["u"][i])), int(math.floor(d["v"][i]))) for i in range(len(d["u"]))))[:4]
        rep["images"] = []
        for t in tiles or [(0, 0)]:
            tag = "%d" % udim_of(t[0] + 0.5, t[1] + 0.5)
            rep["images"].append(uv_sheet(os.path.join(images_dir, "uv_shells_%s.png" % tag), d["u"], d["v"],
                                          d["fuv"], tile=t, marks=pad["border_marks"]))
            rep["images"].append(uv_sheet(os.path.join(images_dir, "uv_distortion_%s.png" % tag), d["u"], d["v"],
                                          d["fuv"], tile=t,
                                          face_rgb=[distortion_color(r) for r in dist["area_ratio"]]))
    fails = [x for x in rep["verdict"] if x.startswith("error")]
    if not pad["ok"]:
        fails.append("error: padding below %.1f px between shells or %.1f px to borders"
                     % (pad_req["shell_px"], pad_req["border_px"]))
    if target_density and rep["density_off_target"]["shells"]:
        fails.append("warn: %d shells off the target density" % len(rep["density_off_target"]["shells"]))
    rep["fails"] = fails
    rep["ok"] = not [x for x in fails if x.startswith("error")]
    return rep


# ---------------------------------------------------------------- camera and review (Maya)
def camera_footprint(targets, camera, res=None):
    """MAYA. Pixel extent of targets seen from a camera at render resolution (Paulino measures
    the closest framing with the Field Chart, iL2iXizf9xM [00:02:33]; this is the numeric
    version). filmFit enum order fill, horizontal, vertical, overscan is [verify]."""
    cmds, om = _cmds(), _om()
    shapes = cmds.listRelatives(camera, shapes=True, fullPath=True) or [camera]
    cs = shapes[0]
    cam_dag = _dag(cs)
    inv = cam_dag.inclusiveMatrixInverse()
    res = res or (cmds.getAttr("defaultResolution.width"), cmds.getAttr("defaultResolution.height"))
    fit = ["fill", "horizontal", "vertical", "overscan"][int(cmds.getAttr(cs + ".filmFit"))]
    ortho = cmds.getAttr(cs + ".orthographic")
    pts = []
    for t in targets if isinstance(targets, (list, tuple)) else [targets]:
        for p in mesh_data(t)["points"]:
            q = om.MPoint(*p) * inv
            pts.append((q.x, q.y, q.z))
    ext = screen_extent(pts, cmds.getAttr(cs + ".focalLength"), cmds.getAttr(cs + ".horizontalFilmAperture"),
                        cmds.getAttr(cs + ".verticalFilmAperture"), tuple(res), fit,
                        cmds.getAttr(cs + ".orthographicWidth") if ortho else None)
    ext.update(camera=cs, res=list(res), fit=fit)
    return ext


def density_from_camera(piece, camera, piece_size=None, res=None, mode="nearest"):
    """MAYA. Paulino's method end to end: the reference piece's footprint at the closest shot,
    doubled, power of two, divided by its size -> px/cm for every shell."""
    cmds = _cmds()
    ext = camera_footprint([piece], camera, res)
    if piece_size is None:
        bb = cmds.exactWorldBoundingBox(piece)
        import mx_audit
        k = mx_audit.UI_TO_CM.get(cmds.currentUnit(q=True, linear=True), 1.0)
        piece_size = max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * k
    uv_px = uv_pixels_for_footprint(ext["max_px"], mode)
    return {"screen_px": ext["max_px"], "uv_px": uv_px, "piece_size_cm": piece_size,
            "px_per_cm": uv_px / float(piece_size), "footprint": ext}


def checker_review(targets, out_dir, map_size=2048, square_px=64, views=("front", "side", "threequarter"),
                   focus=None, resolution=1024):
    """MAYA (Arnold, headless job). mx_review.review in its public checker mode, with
    map_size/square_px checker repeats per UV tile (place2dTexture repeatUV, same value as
    before): even squares = even density, stretched squares = distortion, big squares on the
    head at the close-up = too few texels. The record carries each view's camera
    (rec["cameras"]), which landmark_from_pixel(camera=...) accepts."""
    import mx_review
    reps = float(map_size) / float(square_px)
    return mx_review.review(targets, out_dir, views=views, modes=("checker",), resolution=resolution,
                            focus=focus, checker_repeats=reps,
                            title="checker %d px squares, %d map" % (square_px, map_size))


# ---------------------------------------------------------------- bake prep (Maya)
def bake_copy(low, name=None):
    """MAYA. Triangulated duplicate for the baker AND the export, so both see one triangulation
    (Polycount, Triangulation). UVs and hard edges are kept."""
    cmds = _cmds()
    _, xf = _resolve(low)
    dup = cmds.duplicate(xf, name=name or _short(xf) + "_bake", returnRootsOnly=True)[0]
    call("polyTriangulate", dup, constructionHistory=False)
    cmds.delete(dup, constructionHistory=True)
    return cmds.ls(dup, long=True)[0]


def make_cage(low, offset, name=None):
    """MAYA. Cage = low pushed along topological vertex normals by offset (cm). Take offset from
    deviation(high -> low)['max_outside'] plus a margin [added]."""
    cmds = _cmds()
    _, xf = _resolve(low)
    dup = cmds.duplicate(xf, name=name or _short(xf) + "_cage", returnRootsOnly=True)[0]
    cmds.delete(dup, constructionHistory=True)
    d = mesh_data(dup)
    nrm = vertex_normals(d["points"], d["faces"])
    write_points(dup, [_add(p, _mul(n, offset)) for p, n in zip(d["points"], nrm)])
    return cmds.ls(dup, long=True)[0]


def bake_check(low, high, samples=20000, margin=1.25):
    """MAYA. Does the low hug the high (On Mars: shrink-wrapped low, no custom cage needed,
    YDu9pYMkkSM [00:17:45])? Returns deviation both ways and a suggested cage offset."""
    dev = deviation(low, high, samples=samples)
    out_max = dev["from_target"].get("max_outside", 0.0) if "from_target" in dev else 0.0
    return {"deviation": dev, "suggested_cage_offset_cm": round(out_max * margin, 6)}


# =========================================================================== CLI (through mx_run)
def main(argv):
    """mx_run job: python3 mx_run.py --scene s.ma mx_retopology_uv.py -- uv-report --mesh body_geo
    --map-size 4096 --smallest-mip 1024 --target 20.48 --json out.json [--images dir]
    or retopo-report --mesh body_geo --source scan_high [--openings openings.json]."""
    import argparse
    ap = argparse.ArgumentParser(prog="mx_retopology_uv")
    ap.add_argument("action", choices=["uv-report", "retopo-report", "footprint"])
    ap.add_argument("--mesh", required=True)
    ap.add_argument("--source", default=None)
    ap.add_argument("--camera", default=None)
    ap.add_argument("--map-size", type=int, default=2048)
    ap.add_argument("--smallest-mip", type=int, default=None)
    ap.add_argument("--target", type=float, default=None)
    ap.add_argument("--profile", default="film")
    ap.add_argument("--stacked-ok", action="store_true")
    ap.add_argument("--images", default=None)
    ap.add_argument("--spec", default=None, help="JSON file with openings, joints, cavities, regions")
    ap.add_argument("--json", default=None)
    a = ap.parse_args(argv)
    if a.action == "uv-report":
        rep = uv_report(a.mesh, a.map_size, a.smallest_mip, a.target, stacked_ok=a.stacked_ok,
                        profile=a.profile, images_dir=a.images)
    elif a.action == "retopo-report":
        spec = {}
        if a.spec:
            with open(a.spec) as fh:
                spec = json.load(fh)
        rep = retopo_report(a.mesh, a.source, spec.get("openings"), spec.get("joints"), spec.get("cavities"),
                            spec.get("regions"), profile=a.profile)
    else:
        rep = camera_footprint([a.mesh], a.camera)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(rep, f, indent=1, default=str)
    return rep
