#!/usr/bin/env python3
"""
zb_print: print and pose gates measured on meshes exported from ZBrush (agent side, numpy).

The ZBrush SDK only reports counts, bounding boxes, area, volume and is_polymesh3d_solid() for
the active SubTool. Anything in millimetres, per region, or between two parts needs the
exported mesh. Export each print part with zb_ops.export_obj (dialog-free, proven v03), after
zb_pose.set_export_scale(target_mm) so the OBJ is written in millimetres, then:

    import sys; sys.path.insert(0, "<skills/scenario-zbrush-pose-print/scripts>")
    import zb_print as zp
    rep = zp.print_report({"torso": "/abs/torso.obj", "arm_l": "/abs/arm_l.obj"},
                          target_height_mm=300, min_wall_mm=1.0, out_json="/abs/report.json")
    zp.write_stl("/abs/torso.obj", "/abs/torso.stl")                 # binary, mm, Z up
    zp.write_3mf({"torso": "/abs/torso.obj"}, "/abs/figure.3mf")     # unit="millimeter"

    python3 zb_print.py report torso.obj arm_l.obj --target-height-mm 300 --json out.json

OBJ loading and the base audit reuse zb_audit (<skills>/scenario-zbrush-expert/scripts). Numbers in
the gates come from the experts named in GATE_NOTES; [added] marks this toolkit's own
defaults, meant to be overridden by the brief. Offline tests: tests/code/zbrush-pose-print/.
Nothing here needs ZBrush; the meshes it reads have not yet come from a live ZBrush session.

Sections
  loading      load, obj_header, face_groups
  geometry     tri_index, sample_surface, RayIndex (uniform grid + Moller-Trumbore)
  print gates  shells, thickness, clearance, interference, check_scale, fits_volume,
               center_of_mass, balance, deviation, outer_drift, envelope, caliper
  planning     scale_for, inflate_calibration, inflate_for, decimation_percent, section,
               plan_keys
  pose checks  same_order, rigid_fit, rigid_delta, stretch_report, group_vertices,
               joint_centres, loose_pieces, rigid_pieces, follows, placement_correction,
               piece_interference
  delivery     write_stl, read_stl, write_3mf, read_3mf, print_report
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import argparse
import json
import math
import os
import re
import struct
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))
if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)
import zb_audit  # noqa: E402  (lead toolkit: OBJ reader, audit, verdict)

GATE_NOTES = {
    "scale": "ZBrush and STL carry no units: the size is set up front and checked in mm "
             "(3D Print Hub doc; Gaboury W9P5 [00:21:43]); tolerance 0.5 % [added]",
    "watertight": "closed, outward normals, no non-manifold edges (3D Print Hub doc, "
                  "Preparing the Model)",
    "wall": "1 mm minimum wall, 0.85 mm was flagged (Bennett/Hasbro P08k [00:10:57] "
            "[00:16:46]); set min_wall_mm from the process",
    "edge": "cut edges at least 0.5 mm; about 0.2 mm floats away on the tray (Hasbro P08k "
            "[00:48:28] [00:11:31])",
    "clearance": "0.12 mm fit offset on most parts for Formlabs prototypes (Hasbro P08k "
                 "[00:37:55]); measured between the peg and the socket cutter",
    "faces": "about 1M polygons per mesh is more than enough; 10k to 20k triangles can "
             "still print (Gaboury W9P5 [01:11:40])",
    "cavity": "a sealed hollow traps resin and makes suction cups: vent or drain it "
              "(Gaboury W9P5 [01:35:21] on cups; trapped resin [added])",
    "floating": "no floating parts: every piece supported (3D Print Hub doc)",
    "balance": "the pose must stand steady (Plouffe lakC [00:25:45]); centre of mass over "
               "the footprint as the measurable proxy [added]",
    "build": "each part must fit the printer volume; the car body was split for the Form 2 "
             "bed (Gaboury W9P5 [00:49:27])",
    "units_stated": "STL maintains scale but not units: state mm in the delivery "
                    "(3D Print Hub doc, Set the Unit and Size)",
}


# ============================================================================================
# Loading
# ============================================================================================

def load(src):
    """zb_audit.Mesh from an OBJ path (header attached as .header) or a Mesh."""
    if isinstance(src, zb_audit.Mesh):
        if not hasattr(src, "header"):
            src.header = {}
        return src
    m = zb_audit.load_obj(src)
    m.header = obj_header(src)
    return m


_NUM = r"([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)"


def obj_header(path, max_lines=60):
    """ZBrush OBJ header: '#Auto scale x= y= z=' and '#Auto offset ...' (written by
    Tool:Export, v03 fixture), vertex and face counts. scale is the Export Scale applied
    on export [verify that it follows Tool:Export:Scale]."""
    out = {"zbrush": False, "scale": None, "offset": None, "vertex_count": None,
           "face_count": None}
    with open(path, "r", errors="ignore") as fh:
        for i, line in enumerate(fh):
            if i >= max_lines or line.startswith("v "):
                break
            s = line.strip()
            if "zbrush" in s.lower():
                out["zbrush"] = True
            for key, tag in (("scale", "scale"), ("offset", "offset")):
                m = re.match(r"#\s*Auto " + tag + r"\s+x=" + _NUM + r"\s+y=" + _NUM +
                             r"\s+z=" + _NUM, s)
                if m:
                    out[key] = [float(m.group(k)) for k in (1, 2, 3)]
            m = re.match(r"#\s*Vertex Count\s+(\d+)", s)
            if m:
                out["vertex_count"] = int(m.group(1))
            m = re.match(r"#\s*Face Count\s+(\d+)", s)
            if m:
                out["face_count"] = int(m.group(1))
    return out


def face_groups(path):
    """Group index per face, in the face order of zb_audit.load_obj, from 'g' lines (ZBrush
    writes polygroups as groups when Tool:Export:Grp is on [verify]) or 'usemtl' lines.
    Returns (array of int per face, list of names)."""
    g_cur = m_cur = None
    g_ids, m_ids = [], []
    g_idx, m_idx = {}, {}
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("g "):
                g_cur = line[2:].strip() or None
            elif line.startswith("usemtl "):
                m_cur = line[7:].strip() or None
            elif line.startswith("f "):
                g_ids.append(g_idx.setdefault(g_cur, len(g_idx)))
                m_ids.append(m_idx.setdefault(m_cur, len(m_idx)))
    use_g = len(g_idx) > 1 or len(m_idx) <= 1
    ids, idx = (g_ids, g_idx) if use_g else (m_ids, m_idx)
    names = [k if k is not None else "" for k, _ in sorted(idx.items(), key=lambda kv: kv[1])]
    return np.asarray(ids, dtype=np.int64), names


# ============================================================================================
# Geometry
# ============================================================================================

def tri_index(mesh):
    """Fan triangulation: (T,3) vertex indices and the face of each triangle."""
    sizes = mesh.sizes
    ntri = np.clip(sizes - 2, 0, None)
    face = np.repeat(np.arange(len(sizes)), ntri)
    if not len(face):
        return np.zeros((0, 3), dtype=np.int64), face
    start = np.concatenate([[0], np.cumsum(ntri)[:-1]])
    local = np.arange(len(face)) - np.repeat(start, ntri) + 1
    st = mesh.starts[face]
    tri = np.stack([mesh.flat[st], mesh.flat[st + local], mesh.flat[st + local + 1]], axis=1)
    return tri, face


def _tris(mesh):
    tri, face = tri_index(mesh)
    v = mesh.verts
    return tri, face, v[tri[:, 0]], v[tri[:, 1]], v[tri[:, 2]]


def _signed_volume(p0, p1, p2):
    return float((p0 * np.cross(p1, p2)).sum() / 6.0)


def sample_surface(p0, p1, p2, n, seed=0):
    """n area-weighted random points on the triangles: (points, triangle ids, unit normals)."""
    cr = np.cross(p1 - p0, p2 - p0)
    area = 0.5 * np.linalg.norm(cr, axis=1)
    tot = float(area.sum())
    if tot <= 0:
        raise ValueError("mesh has no area")
    rng = np.random.default_rng(seed)
    tid = rng.choice(len(area), size=int(n), p=area / tot)
    r1 = np.sqrt(rng.random(int(n)))
    r2 = rng.random(int(n))
    a, b, c = 1 - r1, r1 * (1 - r2), r1 * r2
    pts = a[:, None] * p0[tid] + b[:, None] * p1[tid] + c[:, None] * p2[tid]
    nrm = cr[tid] / np.maximum(np.linalg.norm(cr[tid], axis=1), 1e-300)[:, None]
    return pts, tid, nrm


_CORNERS = np.array([[i, j, k] for i in (0, 1) for j in (0, 1) for k in (0, 1)], dtype=np.int64)


class RayIndex:
    """Uniform grid over triangle bounding boxes plus vectorised Moller-Trumbore. Good for
    short rays (walls, gaps, deviations) on meshes up to a few million triangles."""

    def __init__(self, p0, p1, p2, cell=None):
        self.p0 = np.asarray(p0, dtype=np.float64)
        self.e1 = np.asarray(p1, dtype=np.float64) - self.p0
        self.e2 = np.asarray(p2, dtype=np.float64) - self.p0
        n = np.cross(self.e1, self.e2)
        self.nrm = n / np.maximum(np.linalg.norm(n, axis=1), 1e-300)[:, None]
        lo = np.minimum(np.minimum(self.p0, p1), p2)
        hi = np.maximum(np.maximum(self.p0, p1), p2)
        self.lo, self.hi = lo.min(axis=0), hi.max(axis=0)
        self.diag = float(np.linalg.norm(self.hi - self.lo)) or 1.0
        ext = (hi - lo).max(axis=1)
        if cell is None:
            cell = max(2.0 * float(np.median(ext)) if len(ext) else self.diag, self.diag / 256.0)
        self.cell = float(cell)
        self.origin = self.lo - 1e-9 * self.diag
        imin = np.floor((lo - self.origin) / self.cell).astype(np.int64)
        imax = np.floor((hi - self.origin) / self.cell).astype(np.int64)
        self.dims = imax.max(axis=0) + 1 if len(imax) else np.ones(3, dtype=np.int64)
        span = imax - imin + 1
        cnt = span.prod(axis=1)
        tid = np.repeat(np.arange(len(self.p0)), cnt)
        k = np.arange(len(tid)) - np.repeat(np.cumsum(cnt) - cnt, cnt)
        sy, sz = span[tid, 1], span[tid, 2]
        cells = imin[tid] + np.stack([k // (sy * sz), (k // sz) % sy, k % sz], axis=1)
        keys = self._pack(cells)
        order = np.argsort(keys, kind="stable")
        self.keys, self.tids = keys[order], tid[order]

    def _pack(self, c):
        return (c[:, 0] * self.dims[1] + c[:, 1]) * self.dims[2] + c[:, 2]

    def candidates(self, o, d, t0, t1):
        """Triangles whose grid cells the segment o + t d, t in [t0, t1], passes through."""
        t0, t1 = max(float(t0), -self.diag), min(float(t1), 3.0 * self.diag)
        m = max(1, int(math.ceil((t1 - t0) / (0.5 * self.cell))))
        ts = np.linspace(t0, t1, m + 1)
        c = np.floor((o[None, :] + ts[:, None] * d[None, :] - self.origin) / self.cell).astype(np.int64)
        a, b = c[:-1], c[1:]
        allc = (np.minimum(a, b)[:, None, :] + _CORNERS[None, :, :] * np.abs(b - a)[:, None, :]).reshape(-1, 3)
        allc = allc[np.all((allc >= 0) & (allc < self.dims), axis=1)]
        if not len(allc):
            return np.zeros(0, dtype=np.int64)
        keys = np.unique(self._pack(allc))
        left = np.searchsorted(self.keys, keys, "left")
        right = np.searchsorted(self.keys, keys, "right")
        ln = right - left
        if not ln.sum():
            return np.zeros(0, dtype=np.int64)
        idx = np.repeat(left, ln) + (np.arange(ln.sum()) - np.repeat(np.cumsum(ln) - ln, ln))
        return np.unique(self.tids[idx])

    def hits(self, o, d, t0, t1, cand=None):
        """All hits with t0 < t <= t1: (t array, triangle ids)."""
        o = np.asarray(o, dtype=np.float64)
        d = np.asarray(d, dtype=np.float64)
        cand = self.candidates(o, d, t0, t1) if cand is None else cand
        if not len(cand):
            return np.zeros(0), cand
        e1, e2, p0 = self.e1[cand], self.e2[cand], self.p0[cand]
        pvec = np.cross(d[None, :], e2)
        det = np.einsum("ij,ij->i", e1, pvec)
        ok = np.abs(det) > 1e-14 * np.einsum("ij,ij->i", e1, e1) * np.sqrt(np.einsum("ij,ij->i", e2, e2)) + 1e-300
        inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
        tv = o[None, :] - p0
        u = np.einsum("ij,ij->i", tv, pvec) * inv
        q = np.cross(tv, e1)
        v = (q @ d) * inv
        t = np.einsum("ij,ij->i", e2, q) * inv
        tol = 1e-9
        hit = ok & (u >= -tol) & (v >= -tol) & (u + v <= 1 + tol) & (t > t0) & (t <= t1)
        return t[hit], cand[hit]

    def nearest(self, o, d, t0, t1, exclude=None):
        t, ids = self.hits(o, d, t0, t1)
        if exclude is not None and len(ids):
            keep = ids != exclude
            t, ids = t[keep], ids[keep]
        if not len(t):
            return math.inf, -1
        k = int(np.argmin(t))
        return float(t[k]), int(ids[k])

    def first_exit(self, o, d, t0, t1, flip=False):
        """Nearest hit on a face whose outward normal points along d: where a ray leaves
        the solid (flip for an inside-out mesh)."""
        t, ids = self.hits(o, d, t0, t1)
        if not len(t):
            return math.inf, -1
        facing = (self.nrm[ids] @ np.asarray(d, dtype=np.float64)) * (-1.0 if flip else 1.0)
        t, ids = t[facing > 0], ids[facing > 0]
        if not len(t):
            return math.inf, -1
        k = int(np.argmin(t))
        return float(t[k]), int(ids[k])

    def inside(self, points, directions=None):
        """Even-odd test with three skewed rays per point, majority vote."""
        dirs = directions or ((0.5773, 0.5774, 0.5775), (-0.6, 0.64, 0.48), (0.28, -0.96, 0.02))
        dirs = [np.asarray(v) / np.linalg.norm(v) for v in dirs]
        out = []
        for p in np.asarray(points, dtype=np.float64):
            votes = 0
            for d in dirs:
                t, _ = self.hits(p, d, 0.0, 2.5 * self.diag)
                t = np.unique(np.round(t / (1e-9 * self.diag)))  # an edge hit counts once
                votes += len(t) % 2
            out.append(votes >= 2)
        return np.asarray(out, dtype=bool)


def _as_parts(parts):
    if isinstance(parts, dict):
        return dict(parts)
    if isinstance(parts, (str, zb_audit.Mesh)):
        parts = [parts]
    out = {}
    for i, p in enumerate(parts):
        name = os.path.splitext(os.path.basename(p))[0] if isinstance(p, str) else f"part{i}"
        out[name if name not in out else f"{name}_{i}"] = p
    return out


def _stats(x):
    x = np.asarray(x, dtype=np.float64)
    if not len(x):
        return {"n": 0}
    return {"n": int(len(x)), "min": round(float(x.min()), 4),
            "p01": round(float(np.percentile(x, 1)), 4),
            "p05": round(float(np.percentile(x, 5)), 4),
            "p50": round(float(np.percentile(x, 50)), 4),
            "p95": round(float(np.percentile(x, 95)), 4),
            "p99": round(float(np.percentile(x, 99)), 4),
            "max": round(float(x.max()), 4), "mean": round(float(x.mean()), 4)}


def _clusters(points, values, cell, top=12):
    """Group flagged sample points into grid cells: centroid, count, worst value, bbox."""
    if not len(points):
        return []
    key = np.floor(points / cell).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    out = []
    for g in range(int(inv.max()) + 1):
        sel = inv == g
        p = points[sel]
        out.append({"center": p.mean(axis=0).round(3).tolist(), "count": int(sel.sum()),
                    "worst": round(float(values[sel].min()), 4),
                    "bbox": [p.min(axis=0).round(3).tolist(), p.max(axis=0).round(3).tolist()]})
    out.sort(key=lambda c: (c["worst"], -c["count"]))
    return out[:top]


# ============================================================================================
# Print gates
# ============================================================================================

def shells(mesh):
    """Connected shells with signed volume: 'solid' (> 0), 'cavity' (< 0, an inner wall
    facing inward, as Create Shell or a boolean hollow makes), 'open' (has boundary edges).
    A cavity inside a solid with no opening is sealed."""
    m = load(mesh)
    a, b = zb_audit._edges(m)
    nv = len(m.verts)
    lab = zb_audit._shells(nv, np.minimum(a, b), np.maximum(a, b))
    tri, face, p0, p1, p2 = _tris(m)
    face_lab = lab[m.flat[m.starts]] if len(m.sizes) else np.zeros(0, dtype=np.int64)
    tri_lab = face_lab[face]
    n = max(nv, 1)
    und = np.minimum(a, b) * n + np.maximum(a, b)
    ukeys, counts = np.unique(und, return_counts=True)
    bverts = np.unique(np.concatenate([ukeys[counts == 1] // n, ukeys[counts == 1] % n])) \
        if (counts == 1).any() else np.zeros(0, dtype=np.int64)
    open_labels = set(lab[bverts].tolist())
    rows = []
    for s in np.unique(face_lab):
        sel = tri_lab == s
        vol = _signed_volume(p0[sel], p1[sel], p2[sel])
        vs = m.verts[np.unique(tri[sel].reshape(-1))]
        kind = "open" if int(s) in open_labels else ("solid" if vol > 0 else "cavity")
        rows.append({"label": int(s), "faces": int((face_lab == s).sum()), "kind": kind,
                     "volume": round(vol, 4), "bbox": [vs.min(axis=0).round(4).tolist(),
                                                       vs.max(axis=0).round(4).tolist()]})
    rows.sort(key=lambda r: -abs(r["volume"]))
    solids = [r for r in rows if r["kind"] == "solid"]
    for r in rows:
        if r["kind"] != "cavity":
            continue
        lo, hi = np.array(r["bbox"][0]), np.array(r["bbox"][1])
        r["inside_of"] = next((s["label"] for s in solids
                               if np.all(np.array(s["bbox"][0]) <= lo + 1e-9)
                               and np.all(np.array(s["bbox"][1]) >= hi - 1e-9)), None)
    sealed = [r for r in rows if r["kind"] == "cavity" and r.get("inside_of") is not None]
    return {"shells": rows, "solids": len(solids), "cavities": sum(r["kind"] == "cavity" for r in rows),
            "open": sum(r["kind"] == "open" for r in rows), "sealed_cavities": len(sealed),
            "floating_solids": max(0, len(solids) - 1), "expected_shells": len(rows),
            "net_volume": round(sum(r["volume"] for r in rows), 4)}


def thickness(mesh, min_wall_mm=1.0, samples=4000, max_mm=None, seed=0, max_thin_share=0.002,
              index=None):
    """Wall and feature thickness by ray casting: from area-weighted surface samples, along
    the inward normal, to the first opposite wall (the Ray method; ZBrush's From Thickness
    also offers Ray and a rolling Ball in 2026.2.1 [strings]). Units are the mesh units: mm
    once exported with the export scale set. A hit on a front face means internal geometry
    (overlapping shells that were never merged). Tips of tapering features read thin by
    nature (Hasbro allows knife-edge branch tips): judge the listed spots on a render.
    max_thin_share 0.2 % of samples is [added]."""
    m = load(mesh)
    tri, face, p0, p1, p2 = _tris(m)
    flip = _signed_volume(p0, p1, p2) < 0
    idx = index or RayIndex(p0, p1, p2)
    L = float(max_mm or 5.0 * min_wall_mm)
    pts, tid, nrm = sample_surface(p0, p1, p2, samples, seed)
    sgn = -1.0 if flip else 1.0
    nrm = nrm * sgn
    eps = 1e-7 * idx.diag
    th = np.full(len(pts), np.inf)
    facing = np.zeros(len(pts), dtype=np.int8)
    for i in range(len(pts)):
        d = -nrm[i]
        t, j = idx.nearest(pts[i] - eps * nrm[i], d, 0.0, L, exclude=tid[i])
        if j >= 0:
            th[i] = t + eps
            facing[i] = 1 if float(idx.nrm[j] @ d) * sgn > 0 else -1
    wall = facing == 1
    thin = wall & (th < min_wall_mm)
    vals = np.where(np.isfinite(th), th, L)
    rep = {"units": "mesh units (mm after set_export_scale)", "samples": int(len(pts)),
           "ray_max": L, "min_wall": min_wall_mm, "flipped_normals": bool(flip),
           "walls": _stats(vals[wall]), "thin_share": round(float(thin.mean()), 5),
           "thin_count": int(thin.sum()),
           "internal_share": round(float((facing == -1).mean()), 5),
           "no_hit_share": round(float((facing == 0).mean()), 5),
           "spots": _clusters(pts[thin], th[thin], max(3.0 * min_wall_mm, idx.diag / 60.0)),
           "source": GATE_NOTES["wall"]}
    rep["ok"] = rep["thin_share"] <= max_thin_share
    return rep


def clearance(peg, socket, target_mm=None, samples=3000, max_mm=None, seed=0, tol_frac=0.3):
    """Signed gap from the peg surface to the socket (cutter or cavity) along the peg's
    normal: positive = clearance, negative = interference. Only peg samples that see the
    socket within max_mm count. Gate with target_mm: no interference, median within
    tol_frac of the target and p05 at least half of it ([added] tolerances)."""
    A, B = load(peg), load(socket)
    _, _, a0, a1, a2 = _tris(A)
    _, _, b0, b1, b2 = _tris(B)
    idx = RayIndex(b0, b1, b2)
    L = float(max_mm or (4.0 * target_mm if target_mm else 0.01 * idx.diag))
    pts, _, nrm = sample_surface(a0, a1, a2, samples, seed)
    if _signed_volume(a0, a1, a2) < 0:
        nrm = -nrm
    t0 = -1e-9 * idx.diag
    gaps, where = [], []
    for i in range(len(pts)):
        t_out, _ = idx.nearest(pts[i], nrm[i], t0, L)
        t_in, _ = idx.nearest(pts[i], -nrm[i], t0, L)
        if math.isinf(t_out) and math.isinf(t_in):
            continue
        gaps.append(t_out if t_out <= t_in else -t_in)
        where.append(pts[i])
    g = np.asarray(gaps)
    rep = {"considered": int(len(g)), "samples": int(len(pts)), "ray_max": L,
           "gap": _stats(g), "interference_share": round(float((g < 0).mean()), 5) if len(g) else None,
           "target": target_mm, "source": GATE_NOTES["clearance"]}
    if len(g):
        bad = g < 0
        rep["interference_spots"] = _clusters(np.asarray(where)[bad], g[bad], max(L, idx.diag / 40.0), 6)
    if target_mm is not None and len(g):
        rep["ok"] = bool(rep["interference_share"] == 0
                         and abs(rep["gap"]["p50"] - target_mm) <= tol_frac * target_mm
                         and rep["gap"]["p05"] >= 0.5 * target_mm)
    else:
        rep["ok"] = bool(len(g)) and rep["interference_share"] == 0
    return rep


def interference(a, b, samples=400, seed=0):
    """Share of a's vertices inside b (even-odd, three rays): body against a weapon or a
    cape that will print separately must be 0."""
    A, B = load(a), load(b)
    _, _, b0, b1, b2 = _tris(B)
    idx = RayIndex(b0, b1, b2)
    rng = np.random.default_rng(seed)
    pick = rng.choice(len(A.verts), size=min(int(samples), len(A.verts)), replace=False)
    ins = idx.inside(A.verts[pick])
    pts = A.verts[pick][ins]
    return {"tested": int(len(pick)), "inside_share": round(float(ins.mean()), 5),
            "spots": _clusters(pts, np.zeros(len(pts)), idx.diag / 30.0, 6), "ok": not ins.any()}


def check_scale(parts, target_height_mm, up_axis=1, tol_pct=0.5):
    """Assembled height (union bbox of all parts) against the target, plus one export scale
    shared by every part (a part appended from another ZTool arrives at a different scale:
    Gaboury W9P5 [02:04:12], Hasbro P08k [00:56:51])."""
    ps = _as_parts(parts)
    los, his, scales = [], [], {}
    for name, src in ps.items():
        m = load(src)
        los.append(m.verts.min(axis=0))
        his.append(m.verts.max(axis=0))
        scales[name] = (m.header or {}).get("scale")
    lo, hi = np.min(los, axis=0), np.max(his, axis=0)
    size = hi - lo
    h = float(size[up_axis])
    err = abs(h - target_height_mm) / target_height_mm * 100.0
    known = [tuple(round(x, 6) for x in s) for s in scales.values() if s]
    rep = {"height_mm": round(h, 4), "target_mm": target_height_mm, "error_pct": round(err, 3),
           "size_mm": size.round(4).tolist(), "bbox": [lo.round(4).tolist(), hi.round(4).tolist()],
           "export_scales": scales, "scales_consistent": len(set(known)) <= 1,
           "ok": err <= tol_pct, "source": GATE_NOTES["scale"]}
    if abs(float(size.max()) - 2.0) < 0.05:
        rep["warning"] = "longest side is about 2: ZBrush units (Scale Unify), not mm; set the export scale"
    return rep


def scale_for(real_height_mm, ratio, shrink_pct=0.0):
    """Target height for a scale ratio ('1/6', 6 or 0.1667) with optional shrink
    compensation (Hasbro sculpts PVC at 104 %: height / 12 * 1.04 for 6 in, P08k [00:17:51])."""
    if isinstance(ratio, str):
        num, den = (float(x) for x in ratio.split("/"))
        f = num / den
    else:
        f = float(ratio)
        f = 1.0 / f if f > 1 else f
    return real_height_mm * f * (1.0 + shrink_pct / 100.0)


def fits_volume(size_mm, build_mm, margin_mm=0.0):
    """Axis-permutation fit of a part's bbox into the build volume [added]: returns the
    permutation (part axis per printer axis) or None."""
    import itertools
    size = [float(s) for s in size_mm]
    lim = [float(b) - margin_mm for b in build_mm]
    for perm in itertools.permutations(range(3)):
        if all(size[perm[k]] <= lim[k] for k in range(3)):
            return {"fits": True, "part_axis_per_printer_axis": list(perm),
                    "upright": perm[2] == 1, "size_mm": size, "build_mm": list(build_mm)}
    return {"fits": False, "size_mm": size, "build_mm": list(build_mm)}


def center_of_mass(meshes):
    """Volume-weighted centre of mass of closed meshes (signed tetrahedra; cavities count
    negatively) and the total volume."""
    tot, acc = 0.0, np.zeros(3)
    for src in (meshes if isinstance(meshes, (list, tuple)) else [meshes]):
        _, _, p0, p1, p2 = _tris(load(src))
        vol = (p0 * np.cross(p1, p2)).sum(axis=1) / 6.0
        tot += float(vol.sum())
        acc += ((p0 + p1 + p2) / 4.0 * vol[:, None]).sum(axis=0)
    if abs(tot) < 1e-300:
        raise ValueError("zero volume: open meshes?")
    return acc / tot, tot


def _hull2d(pts):
    p = sorted(set(map(tuple, np.round(pts, 6).tolist())))
    if len(p) < 3:
        return p

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for q in p:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], q) <= 0:
            lower.pop()
        lower.append(q)
    for q in reversed(p):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], q) <= 0:
            upper.pop()
        upper.append(q)
    return lower[:-1] + upper[:-1]


def _margin_in_hull(c, hull):
    """Signed distance from c to the convex hull boundary (positive inside)."""
    if len(hull) < 3:
        return -math.inf
    best = math.inf
    for i in range(len(hull)):
        a, b = np.array(hull[i]), np.array(hull[(i + 1) % len(hull)])
        e = b - a
        ln = float(np.linalg.norm(e)) or 1e-300
        best = min(best, float((e[0] * (c[1] - a[1]) - e[1] * (c[0] - a[0])) / ln))
    return best


def balance(meshes, up_axis=1, band_mm=1.0):
    """Does the posed figure stand? Centre of mass projected on the ground plane against the
    convex hull of the contact points (vertices within band_mm of the lowest point)."""
    ms = [load(s) for s in (meshes if isinstance(meshes, (list, tuple)) else [meshes])]
    com, vol = center_of_mass(ms)
    allv = np.concatenate([m.verts for m in ms])
    ground = float(allv[:, up_axis].min())
    contact = allv[allv[:, up_axis] <= ground + band_mm]
    plane = [k for k in range(3) if k != up_axis]
    hull = _hull2d(contact[:, plane])
    margin = _margin_in_hull(com[plane], hull)
    return {"com": com.round(4).tolist(), "volume": round(vol, 4), "ground": round(ground, 4),
            "contact_points": int(len(contact)), "hull": [list(h) for h in hull],
            "margin_mm": round(margin, 4) if math.isfinite(margin) else None,
            "stands": bool(math.isfinite(margin) and margin > 0), "source": GATE_NOTES["balance"]}


def deviation(original, decimated, samples=3000, max_mm=None, tol_mm=None, seed=0):
    """Distance from the decimated surface to the original (rays both ways along the
    decimated normal): the numeric partner of Gaboury's 'stop one step before faceting'.
    tol_mm: set it from the printer's XY resolution [added]."""
    O, D = load(original), load(decimated)
    _, _, o0, o1, o2 = _tris(O)
    _, _, d0, d1, d2 = _tris(D)
    idx = RayIndex(o0, o1, o2)
    L = float(max_mm or 0.02 * idx.diag)
    pts, _, nrm = sample_surface(d0, d1, d2, samples, seed)
    t0 = -1e-9 * idx.diag
    dev, miss = [], 0
    for i in range(len(pts)):
        a, _ = idx.nearest(pts[i], nrm[i], t0, L)
        b, _ = idx.nearest(pts[i], -nrm[i], t0, L)
        t = min(a, b)
        if math.isinf(t):
            miss += 1
        else:
            dev.append(abs(t))
    rep = {"deviation": _stats(dev), "missed_share": round(miss / len(pts), 5), "ray_max": L,
           "tol_mm": tol_mm}
    rep["ok"] = None if tol_mm is None else bool(dev and rep["deviation"]["p99"] <= tol_mm and miss == 0)
    return rep


def outer_drift(before, after, tol_mm=0.02, samples=3000, seed=0):
    """How far the outside moved between a part before and after a wall fix or a hollowing:
    rays from the BEFORE surface to the AFTER one. Hasbro fixes thin walls from the inside so
    the outside does not change (P08k [00:16:46]); with the inner shell as the cutter the
    outside of the detailed part should not move at all. tol_mm 0.02 is [added]."""
    rep = deviation(after, before, samples=samples, tol_mm=tol_mm, seed=seed)
    rep["note"] = "samples on the before surface; p99 above tol means the outside was changed"
    return rep


def envelope(parts, size_mm, up_axis=1):
    """Assembled size against the brief box (Gaboury's first SubTool: width X, height Y,
    depth Z in mm, W9P5 [00:21:43] [02:08:31]): per-axis overflow in mm, bottom centre of
    the assembly (the floor point for zb_pose.brief_box)."""
    ps = _as_parts(parts)
    los, his = [], []
    for src in ps.values():
        m = load(src)
        los.append(m.verts.min(axis=0))
        his.append(m.verts.max(axis=0))
    lo, hi = np.min(los, axis=0), np.max(his, axis=0)
    size = hi - lo
    box = np.asarray([float(s) for s in size_mm])
    over = np.maximum(size - box, 0.0)
    floor = (lo + hi) / 2.0
    floor[up_axis] = lo[up_axis]
    return {"size_mm": size.round(4).tolist(), "box_mm": box.tolist(), "overflow_mm": over.round(4).tolist(),
            "floor_center_mm": floor.round(4).tolist(), "ok": bool(not over.any()),
            "source": "nothing may clip out of the brief box (Gaboury W9P5 [02:08:31])"}


def caliper(mesh, a, b):
    """Gaboury's Transpose-line caliper (W9P5 [00:34:29] [00:36:20]) on the export: both ends
    snap to the nearest vertex, as the action line snaps to points; distance in mm."""
    m = load(mesh)
    ends = []
    for p in (a, b):
        p = np.asarray(p, dtype=np.float64)
        k = int(np.argmin(np.linalg.norm(m.verts - p, axis=1)))
        ends.append({"vertex": k, "point": m.verts[k].round(4).tolist(),
                     "snap_mm": round(float(np.linalg.norm(m.verts[k] - p)), 4)})
    d = float(np.linalg.norm(m.verts[ends[0]["vertex"]] - m.verts[ends[1]["vertex"]]))
    return {"distance_mm": round(d, 4), "ends": ends}


# ============================================================================================
# Planning
# ============================================================================================

def decimation_percent(faces_now, target_faces):
    """Decimation Master '% of decimation' that keeps about target_faces (100 = none,
    0.01 = maximum, doc)."""
    return round(min(100.0, max(0.01, 100.0 * float(target_faces) / float(faces_now))), 2)


def inflate_calibration(points):
    """points: [(inflate_value, measured_offset_mm), ...], the offset measured with
    clearance() between a part and its inflated duplicate. Least squares through the origin;
    Inflate is not in mm and depends on the ZTool's unit space (Hasbro P08k [00:56:20]
    [00:56:51]). 'linear' when the worst residual is under 10 % of the largest offset
    [added]."""
    v = np.array([p[0] for p in points], dtype=np.float64)
    o = np.array([p[1] for p in points], dtype=np.float64)
    slope = float((v * o).sum() / (v * v).sum())
    res = np.abs(o - slope * v)
    return {"mm_per_unit": slope, "points": [list(map(float, p)) for p in points],
            "max_residual_mm": round(float(res.max()), 5),
            "linear": bool(res.max() <= 0.1 * np.abs(o).max())}


def inflate_for(offset_mm, calibration):
    slope = calibration["mm_per_unit"] if isinstance(calibration, dict) else float(calibration)
    return offset_mm / slope


def _basis(n):
    n = np.asarray(n, dtype=np.float64)
    n = n / np.linalg.norm(n)
    helper = np.array([1.0, 0, 0]) if abs(n[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(n, helper)
    u /= np.linalg.norm(u)
    return n, u, np.cross(n, u)


def section(mesh, point, normal):
    """Cross-section of a closed mesh by a plane: oriented 2D segments (outer boundary
    counter-clockwise seen from +normal, holes clockwise), net area and 2D bbox."""
    m = load(mesh)
    tri, _, p0, p1, p2 = _tris(m)
    n, u, v = _basis(normal)
    point = np.asarray(point, dtype=np.float64)
    sd = (m.verts - point) @ n
    scale = float(np.abs(sd).max()) or 1.0
    sd = np.where(np.abs(sd) < 1e-12 * scale, 1e-12 * scale, sd)
    s = sd[tri]
    cross = (s.min(axis=1) < 0) & (s.max(axis=1) > 0)
    if not cross.any():
        return {"segments": np.zeros((0, 2, 2)), "area": 0.0, "bbox": None, "point": point.tolist(),
                "normal": n.tolist(), "u": u.tolist(), "v": v.tolist()}
    P = np.stack([p0, p1, p2], axis=1)[cross]
    S = s[cross]
    tn = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    ends = []
    for i, j in ((0, 1), (1, 2), (2, 0)):
        si, sj = S[:, i], S[:, j]
        hit = si * sj < 0
        f = np.where(hit, si / np.where(hit, si - sj, 1.0), 0.0)
        ends.append((hit, P[:, i] + (P[:, j] - P[:, i]) * f[:, None]))
    seg = []
    for k in range(len(P)):
        e = [pt[k] for h, pt in ends if h[k]]
        if len(e) == 2:
            seg.append(e)
    seg = np.asarray(seg)
    tn = tn[[k for k in range(len(P)) if sum(bool(h[k]) for h, _ in ends) == 2]]
    a2 = np.stack([(seg[:, 0] - point) @ u, (seg[:, 0] - point) @ v], axis=1)
    b2 = np.stack([(seg[:, 1] - point) @ u, (seg[:, 1] - point) @ v], axis=1)
    m2 = np.stack([tn @ u, tn @ v], axis=1)
    dd = b2 - a2
    right = np.stack([dd[:, 1], -dd[:, 0]], axis=1)
    swap = (right * m2).sum(axis=1) < 0
    a2[swap], b2[swap] = b2[swap].copy(), a2[swap].copy()
    segs = np.stack([a2, b2], axis=1)
    area = 0.5 * float((a2[:, 0] * b2[:, 1] - b2[:, 0] * a2[:, 1]).sum())
    allp = segs.reshape(-1, 2)
    return {"segments": segs, "area": round(area, 5),
            "bbox": [*allp.min(axis=0).round(5).tolist(), *allp.max(axis=0).round(5).tolist()],
            "point": point.tolist(), "normal": n.tolist(), "u": u.tolist(), "v": v.tolist()}


def _inside2d(q, segs, block=256):
    """Even-odd test of 2D points against oriented segments, in blocks to bound memory."""
    out = np.zeros(len(q), dtype=bool)
    ax, ay, bx, by = segs[:, 0, 0][None], segs[:, 0, 1][None], segs[:, 1, 0][None], segs[:, 1, 1][None]
    for s0 in range(0, len(q), block):
        x, y = q[s0:s0 + block, 0][:, None], q[s0:s0 + block, 1][:, None]
        cond = (ay > y) != (by > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            xc = ax + (y - ay) * (bx - ax) / (by - ay)
        out[s0:s0 + block] = ((cond & (x < xc)).sum(axis=1) % 2) == 1
    return out


def _dist2d(q, segs, block=256):
    """Distance from 2D points to the nearest segment, in blocks to bound memory."""
    a, b = segs[:, 0][None], segs[:, 1][None]
    ab = b - a
    ab2 = np.maximum((ab * ab).sum(axis=2), 1e-300)
    out = np.empty(len(q))
    for s0 in range(0, len(q), block):
        qq = q[s0:s0 + block, None, :]
        t = np.clip(((qq - a) * ab).sum(axis=2) / ab2, 0, 1)
        d = qq - (a + t[:, :, None] * ab)
        out[s0:s0 + block] = np.sqrt((d * d).sum(axis=2)).min(axis=1)
    return out


def plan_keys(part_a, point, normal, clearance_mm=0.12, min_wall_mm=1.0, part_b=None, n_keys=None,
              radius_mm=None, grid=40, min_radius_mm=0.5):
    """Alignment keys for a planar cut. part_a carries the pegs, part_b (on the +normal
    side) the sockets. Pegs sit at the points of the section farthest from its outline
    (pole of inaccessibility on a grid). Sizing rules are [added]: radius = half of
    (room - min_wall - clearance), two keys when the section is elongated (aspect >= 2) so
    a round key cannot spin, peg length = min(3 radius, socket side depth - min wall -
    clearance). Clearance and wall come from the process (Hasbro: 0.12 mm, 1 mm)."""
    A = load(part_a)
    sec = section(A, point, normal)
    segs = sec["segments"]
    if not len(segs):
        raise ValueError("the plane does not cut part_a")
    x0, y0, x1, y1 = sec["bbox"]
    step = max(x1 - x0, y1 - y0) / float(grid)
    gx, gy = np.meshgrid(np.arange(x0 + step / 2, x1, step), np.arange(y0 + step / 2, y1, step))
    q = np.stack([gx.ravel(), gy.ravel()], axis=1)
    q = q[_inside2d(q, segs)]
    if not len(q):
        raise ValueError("no interior points on the section grid: raise grid")
    dist = _dist2d(q, segs)
    warnings = []
    if n_keys is None:
        ev, evec = np.linalg.eigh(np.cov(q.T)) if len(q) > 2 else (np.array([1.0, 1.0]), np.eye(2))
        n_keys = 2 if ev[-1] / max(ev[0], 1e-300) >= 4.0 else 1          # aspect >= 2 [added]
    else:
        evec = np.linalg.eigh(np.cov(q.T))[1] if len(q) > 2 else np.eye(2)
    if n_keys == 1:
        picks = [int(np.argmax(dist))]
        warnings.append("one round key can spin: glue it, or use two keys or a non-round key [added]")
    else:
        axis = evec[:, -1]
        along = (q - q.mean(axis=0)) @ axis
        side = along > 0
        dist = np.minimum(dist, np.abs(along))          # each key stays in its own half
        picks = [int(np.flatnonzero(s)[np.argmax(dist[s])]) for s in (side, ~side) if s.any()]
    n, u, v = (np.asarray(sec[k]) for k in ("normal", "u", "v"))
    origin = np.asarray(sec["point"])
    B = load(part_b) if part_b is not None else None
    idx_b = None
    if B is not None:
        _, _, b0, b1, b2 = _tris(B)
        idx_b = RayIndex(b0, b1, b2)
    else:
        _, _, a0, a1, a2 = _tris(A)
        idx_b = RayIndex(a0, a1, a2)
        warnings.append("no part_b: socket depth estimated from part_a along -normal")
    keys = []
    for k in picks:
        room = float(dist[k])
        r = radius_mm if radius_mm else 0.5 * (room - min_wall_mm - clearance_mm)
        c3 = origin + q[k, 0] * u + q[k, 1] * v
        d = n if B is not None else -n
        depth, _ = idx_b.first_exit(c3, d, -1e-9 * idx_b.diag, 10.0 * max(room, 1.0))
        avail = depth - min_wall_mm - clearance_mm
        length = min(3.0 * r, avail) if math.isfinite(avail) else 3.0 * r
        ok = r >= min_radius_mm and length >= r
        if not ok:
            warnings.append(f"key at {c3.round(3).tolist()}: room {room:.3f} mm, depth {depth:.3f} mm "
                            "is too small: thicken the cut zone or move the cut [added]")
        keys.append({"center": c3.round(4).tolist(), "room_mm": round(room, 4),
                     "peg_radius_mm": round(r, 4), "socket_radius_mm": round(r + clearance_mm, 4),
                     "peg_length_mm": round(length, 4),
                     "socket_depth_mm": round(length + clearance_mm, 4),
                     "socket_side_depth_mm": round(depth, 4) if math.isfinite(depth) else None,
                     "ok": bool(ok)})
    return {"section_area_mm2": sec["area"], "section_bbox": sec["bbox"], "normal": n.tolist(),
            "keys": keys, "clearance_mm": clearance_mm, "min_wall_mm": min_wall_mm,
            "warnings": warnings, "source": GATE_NOTES["clearance"]}


# ============================================================================================
# Pose checks
# ============================================================================================

def same_order(a, b):
    """Vertex order sacred (Pavlovich irnu [00:08:31]; Munoz Gomez oxyK [00:39:55]): same
    point count and identical face lists, so a posed mesh can go back onto a layer or a
    TPose mesh."""
    A, B = load(a), load(b)
    same_n = len(A.verts) == len(B.verts)
    same_f = same_n and np.array_equal(A.sizes, B.sizes) and np.array_equal(A.flat, B.flat)
    return {"points": [len(A.verts), len(B.verts)], "faces": [len(A.sizes), len(B.sizes)],
            "same_count": bool(same_n), "same_faces": bool(same_f), "ok": bool(same_f)}


def rigid_fit(P, Q):
    """Kabsch: R, t with Q ~ R P + t, and the RMS residual."""
    P, Q = np.asarray(P, dtype=np.float64), np.asarray(Q, dtype=np.float64)
    cp, cq = P.mean(axis=0), Q.mean(axis=0)
    H = (P - cp).T @ (Q - cq)
    U, _, Vt = np.linalg.svd(H)
    dd = np.sign(np.linalg.det(Vt.T @ U.T)) or 1.0
    R = Vt.T @ np.diag([1.0, 1.0, dd]) @ U.T
    t = cq - R @ cp
    rms = float(np.sqrt(((P @ R.T + t - Q) ** 2).sum(axis=1).mean()))
    return R, t, rms


def axis_angle(R):
    ang = math.degrees(math.acos(max(-1.0, min(1.0, (np.trace(R) - 1.0) / 2.0))))
    if ang < 1e-6:
        return None, 0.0
    if ang > 179.999:
        w, vecs = np.linalg.eig(R)
        axis = np.real(vecs[:, int(np.argmin(np.abs(w - 1.0)))])
    else:
        axis = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return axis / np.linalg.norm(axis), ang


def rigid_delta(before, after, vertices=None):
    """How a region moved between two exports of the same topology: angle (deg), axis,
    pivot (closest point of the rotation axis to the region), screw translation along the
    axis and the RMS of the rigid fit (small = moved rigidly). vertices: indices, a boolean
    mask, or None for all."""
    A, B = load(before), load(after)
    if len(A.verts) != len(B.verts):
        raise ValueError(f"vertex count changed {len(A.verts)} -> {len(B.verts)}")
    sel = np.arange(len(A.verts)) if vertices is None else np.asarray(vertices)
    P, Q = A.verts[sel], B.verts[sel]
    R, t, rms = rigid_fit(P, Q)
    axis, ang = axis_angle(R)
    out = {"count": int(len(P)), "angle_deg": round(ang, 4), "rms": round(rms, 6),
           "translation": t.round(6).tolist(), "max_disp": round(float(np.linalg.norm(Q - P, axis=1).max()), 6)}
    if axis is not None:
        c, *_ = np.linalg.lstsq(np.eye(3) - R, t - axis * float(t @ axis), rcond=None)
        cen = P.mean(axis=0)
        c = c + axis * float((cen - c) @ axis)
        out.update(axis=axis.round(6).tolist(), pivot=c.round(6).tolist(),
                   screw=round(float(t @ axis), 6))
    return out


def stretch_report(before, after, warn_ratio=1.5, top=10):
    """Edge-length change between two exports of the same topology: the numeric partner of
    Munoz Gomez's Polyframe look at stretched polygons (oxyK [00:06:40]). warn_ratio 1.5 is
    [added]."""
    A, B = load(before), load(after)
    if len(A.verts) != len(B.verts):
        raise ValueError("vertex count changed: not the same topology")
    a, b = zb_audit._edges(A)
    n = len(A.verts)
    key = np.unique(np.minimum(a, b) * n + np.maximum(a, b))
    i, j = key // n, key % n
    la = np.linalg.norm(A.verts[i] - A.verts[j], axis=1)
    lb = np.linalg.norm(B.verts[i] - B.verts[j], axis=1)
    ok = la > 0
    ratio = lb[ok] / la[ok]
    mid = ((B.verts[i] + B.verts[j]) / 2.0)[ok]
    st = ratio > warn_ratio
    sq = ratio < 1.0 / warn_ratio
    diag = float(np.linalg.norm(B.verts.max(axis=0) - B.verts.min(axis=0))) or 1.0
    return {"edges": int(ok.sum()), "ratio": _stats(ratio), "stretched_share": round(float(st.mean()), 5),
            "compressed_share": round(float(sq.mean()), 5), "warn_ratio": warn_ratio,
            "stretched_spots": _clusters(mid[st], -ratio[st], diag / 25.0, top),
            "compressed_spots": _clusters(mid[sq], ratio[sq], diag / 25.0, top)}


def group_vertices(mesh, group, groups=None):
    """Vertex indices of one polygroup (name or id) of an OBJ exported with groups, for
    rigid_delta per limb segment. groups: (ids, names) from face_groups, else read from the
    path."""
    m = load(mesh)
    if groups is None:
        if not isinstance(mesh, str):
            raise ValueError("pass groups when mesh is not an OBJ path")
        groups = face_groups(mesh)
    ids, names = groups
    gid = names.index(group) if isinstance(group, str) else int(group)
    faces = np.flatnonzero(np.asarray(ids) == gid)
    if not len(faces):
        return np.zeros(0, dtype=np.int64)
    sel = np.concatenate([m.flat[m.starts[f]:m.starts[f] + m.sizes[f]] for f in faces])
    return np.unique(sel)


def joint_centres(mesh, groups=None):
    """Pivot candidates from polygroup borders: for each pair of adjacent groups, the
    centroid of their shared border vertices, the border's plane normal (the bone
    direction, sign arbitrary) and its mean radius. groups: per-face ids (face_groups) or
    None to read them from the OBJ path. Plouffe and Munoz Gomez pose by polygroup, pivot
    on the joint (lakC [00:16:33]; oxyK [00:05:00])."""
    m = load(mesh)
    if groups is None:
        if not isinstance(mesh, str):
            raise ValueError("pass groups when mesh is not an OBJ path")
        groups, names = face_groups(mesh)
    else:
        names = None
    groups = np.asarray(groups)
    a, b = zb_audit._edges(m)
    fid = np.repeat(np.arange(len(m.sizes)), m.sizes)
    n = len(m.verts)
    key = np.minimum(a, b) * n + np.maximum(a, b)
    order = np.argsort(key, kind="stable")
    ks, fs = key[order], fid[order]
    same = ks[1:] == ks[:-1]
    first = np.flatnonzero(same)
    ga, gb = groups[fs[first]], groups[fs[first + 1]]
    border = ga != gb
    out = []
    pairs = {}
    for e, g1, g2 in zip(ks[first][border], ga[border], gb[border]):
        pairs.setdefault((int(min(g1, g2)), int(max(g1, g2))), []).append(int(e))
    for (g1, g2), edges in sorted(pairs.items()):
        e = np.asarray(edges)
        vs = np.unique(np.concatenate([e // n, e % n]))
        p = m.verts[vs]
        c = p.mean(axis=0)
        w, vec = np.linalg.eigh(np.cov((p - c).T)) if len(p) > 3 else (None, np.eye(3))
        out.append({"groups": [g1, g2], "names": [names[g1], names[g2]] if names else None,
                    "center": c.round(6).tolist(), "normal": vec[:, 0].round(6).tolist(),
                    "radius": round(float(np.linalg.norm(p - c, axis=1).mean()), 6),
                    "border_vertices": int(len(vs))})
    return out


def _face_pieces(m):
    """Connected-piece label of every face (vertex label propagation of zb_audit)."""
    a, b = zb_audit._edges(m)
    lab = zb_audit._shells(len(m.verts), np.minimum(a, b), np.maximum(a, b))
    return lab[m.flat[m.starts]]


def loose_pieces(mesh, min_faces=1):
    """Connected pieces of one OBJ, largest first: what Auto Groups makes in ZBrush (one group
    per disconnected piece: plates, a weapon, bolts; Munoz Gomez oxyK [00:15:37]), computed on
    the export so the Grps segment groups of the TPose mesh stay intact. Each row: piece,
    vertices (indices), faces, bbox, volume (signed, mesh units)."""
    m = load(mesh)
    if not len(m.sizes):
        return []
    face_lab = _face_pieces(m)
    tri, face, p0, p1, p2 = _tris(m)
    tri_lab = face_lab[face]
    rows = []
    for s in np.unique(face_lab):
        nf = int((face_lab == s).sum())
        if nf < min_faces:
            continue
        sel = tri_lab == s
        vs = np.unique(tri[sel].reshape(-1))
        p = m.verts[vs]
        rows.append({"label": int(s), "vertices": vs, "faces": nf,
                     "bbox": [p.min(axis=0).round(4).tolist(), p.max(axis=0).round(4).tolist()],
                     "volume": round(_signed_volume(p0[sel], p1[sel], p2[sel]), 6)})
    rows.sort(key=lambda r: (-r["faces"], r["label"]))
    for k, r in enumerate(rows):
        r["piece"] = k
    return rows


def rigid_pieces(rest, posed, pieces=None, tol_mm=0.05, skip_largest=True):
    """Did every rigid piece (plate, weapon, bolt: a loose piece of the TPose mesh) move as
    one body between two exports of the same topology? Kabsch fit per piece; rms above
    tol_mm means the piece bent (Munoz Gomez keeps plates whole with Auto Groups, oxyK
    [00:15:37] [00:16:14]; Plouffe keeps primitives unstretched, lakC [00:33:23]).
    skip_largest leaves out the body, which is meant to bend. tol_mm 0.05 is [added]."""
    A, B = load(rest), load(posed)
    if len(A.verts) != len(B.verts):
        raise ValueError(f"vertex count changed {len(A.verts)} -> {len(B.verts)}")
    rows = pieces if pieces is not None else loose_pieces(A)
    if skip_largest and pieces is None:
        rows = rows[1:]
    out = []
    for r in rows:
        vs = np.asarray(r["vertices"])
        if len(vs) < 3:
            continue
        R, t, rms = rigid_fit(A.verts[vs], B.verts[vs])
        _, ang = axis_angle(R)
        out.append({"piece": r.get("piece"), "count": int(len(vs)), "rms": round(rms, 6),
                    "angle_deg": round(ang, 4), "moved_mm": round(float(np.linalg.norm(
                        B.verts[vs] - A.verts[vs], axis=1).max()), 4), "bent": bool(rms > tol_mm)})
    return {"pieces": out, "bent": [r["piece"] for r in out if r["bent"]], "tol_mm": tol_mm,
            "ok": not any(r["bent"] for r in out)}


def follows(carrier_rest, carrier_posed, part_rest, part_posed, carrier_vertices=None,
            part_vertices=None, tol_mm=0.5, rigid_tol_mm=0.05):
    """Does a carried part (a sword in the hand, a plate on its segment) sit where its carrier
    took it? The carrier's rigid transform between rest and posed (fit on carrier_vertices,
    e.g. the palm group) is applied to the part's rest points and compared with its posed
    points. interference() == 0 alone passes a sword left far from the hand; this does not.
    Works on one TPose export (same paths, two vertex sets) or on separate SubTool exports.
    tol_mm 0.5 and rigid_tol_mm 0.05 are [added]."""
    C0, C1, P0, P1 = (load(x) for x in (carrier_rest, carrier_posed, part_rest, part_posed))
    cs = np.arange(len(C0.verts)) if carrier_vertices is None else np.asarray(carrier_vertices)
    ps = np.arange(len(P0.verts)) if part_vertices is None else np.asarray(part_vertices)
    R, t, crms = rigid_fit(C0.verts[cs], C1.verts[cs])
    pred = P0.verts[ps] @ R.T + t
    res = np.linalg.norm(P1.verts[ps] - pred, axis=1)
    _, _, prms = rigid_fit(P0.verts[ps], P1.verts[ps])
    st = _stats(res)
    return {"residual_mm": st, "carrier_rms": round(crms, 6), "part_rms": round(prms, 6),
            "carrier_R": R.round(9).tolist(), "carrier_t": t.round(6).tolist(),
            "part_rigid": bool(prms <= rigid_tol_mm), "tol_mm": tol_mm,
            "ok": bool(st["p95"] <= tol_mm and prms <= rigid_tol_mm)}


def placement_correction(rest_part, moved_part, R, t):
    """After zb_pose.rotate_subtool_matrix(R): the translation (mm, OBJ axes) still needed so
    the part lands at R p + t (pass it to zb_pose.translate_subtool), and how far the
    rotation that ZBrush applied is from R (degrees). Measured, because the rotation centre
    of Deformation Rotate is [verify]."""
    A, B = load(rest_part), load(moved_part)
    R, t = np.asarray(R, dtype=np.float64), np.asarray(t, dtype=np.float64)
    Ra, _, rms = rigid_fit(A.verts, B.verts)
    delta = (A.verts @ R.T + t - B.verts).mean(axis=0)
    return {"translate_mm": delta.round(6).tolist(), "rotation_error_deg": round(axis_angle(Ra.T @ R)[1], 4),
            "rms": round(rms, 6)}


def piece_interference(mesh, pieces=None, samples=200, seed=0, min_share=0.0):
    """Loose pieces of one mesh that pass into each other after posing (a plate into the
    body, a sword through the thigh): the targets of Munoz Gomez's Move Topological, which
    moves only the connected piece under the brush (oxyK [00:17:24]). Only pairs whose
    bboxes overlap are tested; share = sampled vertices of piece i inside piece j."""
    m = load(mesh)
    rows = pieces if pieces is not None else loose_pieces(m)
    tri, face, p0, p1, p2 = _tris(m)
    tri_lab = _face_pieces(m)[face]
    rng = np.random.default_rng(seed)
    idx = {}
    out = []
    for i in rows:
        for j in rows:
            if i is j:
                continue
            lo_i, hi_i = np.array(i["bbox"][0]), np.array(i["bbox"][1])
            lo_j, hi_j = np.array(j["bbox"][0]), np.array(j["bbox"][1])
            if np.any(hi_i < lo_j) or np.any(hi_j < lo_i):
                continue
            if j["label"] not in idx:
                sel = tri_lab == j["label"]
                idx[j["label"]] = RayIndex(p0[sel], p1[sel], p2[sel])
            vs = np.asarray(i["vertices"])
            pick = vs[rng.choice(len(vs), size=min(int(samples), len(vs)), replace=False)]
            ins = idx[j["label"]].inside(m.verts[pick])
            share = float(ins.mean()) if len(ins) else 0.0
            if share > min_share:
                pts = m.verts[pick][ins]
                out.append({"piece": i["piece"], "into": j["piece"], "inside_share": round(share, 5),
                            "center": pts.mean(axis=0).round(4).tolist()})
    out.sort(key=lambda r: -r["inside_share"])
    return {"pairs": out, "ok": not out}


# ============================================================================================
# Delivery
# ============================================================================================

def _y_to_z(P):
    """ZBrush OBJ is Y up (+Z toward the front camera, v03 analysis); printers are Z up.
    Rotation +90 deg about X: (x, y, z) -> (x, -z, y), handedness and winding kept."""
    out = np.empty_like(P)
    out[..., 0], out[..., 1], out[..., 2] = P[..., 0], -P[..., 2], P[..., 1]
    return out


def _target(path, overwrite):
    """Never overwrite silently: an existing file is kept as .bak (project rule)."""
    path = os.path.abspath(os.path.expanduser(path))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        if not overwrite:
            raise FileExistsError(f"{path} exists: pass overwrite=True (the old file is kept as .bak)")
        os.replace(path, path + time.strftime(".%Y%m%d-%H%M%S.bak"))
    return path


def write_stl(mesh, path, scale=1.0, up="z", overwrite=False):
    """Binary STL of one part (mesh units times scale, mm expected). STL stores no units:
    the header says mm, and the delivery note must too (3D Print Hub doc)."""
    m = load(mesh)
    _, _, p0, p1, p2 = _tris(m)
    P = np.stack([p0, p1, p2], axis=1) * float(scale)
    if up == "z":
        P = _y_to_z(P)
    nrm = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1), 1e-300)[:, None]
    rec = np.zeros(len(P), dtype=np.dtype([("n", "<f4", (3,)), ("v", "<f4", (3, 3)), ("a", "<u2")]))
    rec["n"], rec["v"] = nrm, P
    path = _target(path, overwrite)
    head = f"zb_print binary STL | units mm | up {up.upper()}".encode("ascii").ljust(80, b" ")
    with open(path, "wb") as fh:
        fh.write(head)
        fh.write(struct.pack("<I", len(P)))
        fh.write(rec.tobytes())
    flat = P.reshape(-1, 3)
    return {"path": path, "triangles": int(len(P)), "bytes": os.path.getsize(path),
            "bbox_mm": [flat.min(axis=0).round(4).tolist(), flat.max(axis=0).round(4).tolist()],
            "units": "mm (stated here: STL itself carries none)"}


def read_stl(path):
    """Binary STL -> (T,3,3) float64 triangles and the header text."""
    with open(path, "rb") as fh:
        head = fh.read(80)
        (n,) = struct.unpack("<I", fh.read(4))
        rec = np.frombuffer(fh.read(50 * n), dtype=np.dtype([("n", "<f4", (3,)), ("v", "<f4", (3, 3)), ("a", "<u2")]))
    return rec["v"].astype(np.float64), head.decode("ascii", "ignore").strip()


_CT = ('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/'
       'package/2006/content-types"><Default Extension="rels" ContentType="application/'
       'vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType='
       '"application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
_RELS = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.'
         'openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model"'
         ' Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
         '</Relationships>')
_NS3MF = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"


def write_3mf(parts, path, unit="millimeter", scale=1.0, up="z", overwrite=False, title=None):
    """3MF package (core spec), one object per part, units declared in the file: the unit
    problem of STL disappears. 3D Print Hub also has 'Export to 3MF' in 2026.2.1 [strings]
    [verify]; this writer is the dialog-free route."""
    ps = _as_parts(parts)
    objs, items = [], []
    tri_total = 0
    for oid, (name, src) in enumerate(ps.items(), start=1):
        m = load(src)
        tri, _ = tri_index(m)
        V = m.verts * float(scale)
        if up == "z":
            V = _y_to_z(V)
        vx = "".join(f'<vertex x="{x:.6g}" y="{y:.6g}" z="{z:.6g}"/>' for x, y, z in V.tolist())
        tx = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in tri.tolist())
        safe = re.sub(r'[<>&"]', "_", str(name))
        objs.append(f'<object id="{oid}" type="model" name="{safe}"><mesh><vertices>{vx}</vertices>'
                    f'<triangles>{tx}</triangles></mesh></object>')
        items.append(f'<item objectid="{oid}"/>')
        tri_total += len(tri)
    model = (f'<?xml version="1.0" encoding="UTF-8"?>\n<model unit="{unit}" xml:lang="en-US" '
             f'xmlns="{_NS3MF}"><metadata name="Title">{re.sub(r"[<>&]", "_", title or "zb_print")}'
             f'</metadata><resources>{"".join(objs)}</resources><build>{"".join(items)}</build></model>')
    path = _target(path, overwrite)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _CT)
        z.writestr("_rels/.rels", _RELS)
        z.writestr("3D/3dmodel.model", model)
    return {"path": path, "objects": len(objs), "triangles": tri_total, "unit": unit,
            "bytes": os.path.getsize(path)}


def read_3mf(path):
    """{name: (verts (N,3), tris (T,3))} and the declared unit, for checking a package."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("3D/3dmodel.model"))
    ns = {"m": _NS3MF}
    out = {}
    for obj in root.findall("m:resources/m:object", ns):
        vs = np.array([[float(v.get(k)) for k in "xyz"] for v in obj.findall("m:mesh/m:vertices/m:vertex", ns)])
        ts = np.array([[int(t.get(k)) for k in ("v1", "v2", "v3")] for t in obj.findall("m:mesh/m:triangles/m:triangle", ns)])
        out[obj.get("name")] = (vs, ts)
    return out, root.get("unit")


def _gate(rows, gate, part, ok, value=None, limit=None, severity="must", source=None):
    rows.append({"gate": gate, "part": part, "pass": bool(ok), "value": value, "limit": limit,
                 "severity": severity, "source": source})


def print_report(parts, target_height_mm=None, up_axis=1, min_wall_mm=1.0, max_faces=1_000_000,
                 build_volume_mm=None, thickness_samples=3000, keys=None, check_balance=True,
                 balance_band_mm=1.0, process="resin", out_json=None, seed=0, overwrite=False,
                 envelope_mm=None):
    """Every measurable gate for a set of print parts (OBJ in mm), in one dict.
    keys: [(peg_obj, socket_obj, target_clearance_mm), ...] measured with clearance().
    envelope_mm: the brief box (width, height, depth) nothing may clip out of.
    process 'resin' makes a sealed cavity a failure; other processes only flag it.
    Gates with severity 'must' decide 'ok'; 'look' ones go to the visual review."""
    ps = _as_parts(parts)
    rep = {"when": time.strftime("%Y-%m-%d %H:%M:%S"), "units": "mm", "process": process,
           "parts": {}, "assembly": {}, "gates": []}
    g = rep["gates"]
    meshes = {}
    for name, src in ps.items():
        m = load(src)
        meshes[name] = m
        a = zb_audit.audit(m)
        sh = shells(m)
        v = zb_audit.verdict(a, "print", max_faces=max_faces, expected_shells=sh["expected_shells"])
        th = thickness(m, min_wall_mm=min_wall_mm, samples=thickness_samples, seed=seed)
        rep["parts"][name] = {"path": src if isinstance(src, str) else None, "header": m.header,
                              "faces": a["faces"], "points": a["points"], "size_mm": a["size"],
                              "volume_mm3": a["volume"], "resin_ml": round(a["volume"] / 1000.0, 3),
                              "audit_verdict": v, "shells": sh, "thickness": th}
        closed = not a["boundary_loops"] and not a["non_manifold_edges"] and not a["inconsistent_edges"]
        _gate(g, "watertight", name, closed, {"holes": len(a["boundary_loops"]),
              "non_manifold": a["non_manifold_edges"], "flipped": a["inconsistent_edges"]}, 0,
              source=GATE_NOTES["watertight"])
        _gate(g, "positive volume", name, a["volume"] > 0, a["volume"], "> 0", source=GATE_NOTES["watertight"])
        _gate(g, "faces", name, a["faces"] <= max_faces, a["faces"], max_faces, "look", GATE_NOTES["faces"])
        _gate(g, "min wall", name, th["ok"], {"thin_share": th["thin_share"], "p01": th["walls"].get("p01")},
              min_wall_mm, source=GATE_NOTES["wall"])
        _gate(g, "internal surfaces", name, th["internal_share"] <= 0.01, th["internal_share"], 0.01, "look",
              "overlapping shells never merged: union them before export [added threshold]")
        _gate(g, "sealed cavities", name, sh["sealed_cavities"] == 0, sh["sealed_cavities"], 0,
              "must" if process == "resin" else "look", GATE_NOTES["cavity"])
        _gate(g, "floating solids", name, sh["floating_solids"] == 0, sh["floating_solids"], 0, "look",
              GATE_NOTES["floating"])
        if build_volume_mm:
            fv = fits_volume(a["size"], build_volume_mm)
            rep["parts"][name]["fits_build"] = fv
            _gate(g, "fits build volume", name, fv["fits"], a["size"], list(build_volume_mm),
                  source=GATE_NOTES["build"])
    if target_height_mm:
        sc = check_scale(meshes, target_height_mm, up_axis)
        rep["assembly"]["scale"] = sc
        _gate(g, "height", "assembly", sc["ok"], sc["height_mm"], target_height_mm, source=GATE_NOTES["scale"])
        _gate(g, "one export scale", "assembly", sc["scales_consistent"], sc["export_scales"], None,
              source=GATE_NOTES["scale"])
    if envelope_mm:
        env = envelope(meshes, envelope_mm, up_axis)
        rep["assembly"]["envelope"] = env
        _gate(g, "inside brief box", "assembly", env["ok"], env["overflow_mm"], list(envelope_mm),
              source=env["source"])
    if check_balance:
        try:
            bal = balance(list(meshes.values()), up_axis, balance_band_mm)
            rep["assembly"]["balance"] = bal
            _gate(g, "stands on its footprint", "assembly", bal["stands"], bal["margin_mm"], "> 0", "look",
                  GATE_NOTES["balance"])
        except ValueError as e:
            rep["assembly"]["balance"] = {"error": str(e)}
    for k, (peg, sock, target) in enumerate(keys or []):
        cl = clearance(peg, sock, target_mm=target, seed=seed)
        rep["assembly"].setdefault("keys", []).append({"peg": peg if isinstance(peg, str) else k,
                                                       "socket": sock if isinstance(sock, str) else k, **cl})
        _gate(g, "key clearance", f"key{k}", cl["ok"], cl["gap"].get("p50"), target, source=GATE_NOTES["clearance"])
    rep["ok"] = all(r["pass"] for r in g if r["severity"] == "must")
    rep["failed"] = [f"{r['part']}: {r['gate']}" for r in g if not r["pass"] and r["severity"] == "must"]
    rep["to_look_at"] = [f"{r['part']}: {r['gate']}" for r in g if not r["pass"] and r["severity"] == "look"]
    rep["note"] = GATE_NOTES["units_stated"]
    if out_json:
        with open(_target(out_json, overwrite), "w") as fh:
            json.dump(rep, fh, indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else repr(o))
    return rep


# ============================================================================================
# CLI
# ============================================================================================

def _dims(s):
    return [float(x) for x in re.split(r"[x,]", s)]


def _cli(argv=None):
    ap = argparse.ArgumentParser(description="Print gates on OBJ parts exported from ZBrush (mm)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("report")
    r.add_argument("objs", nargs="+")
    r.add_argument("--target-height-mm", type=float)
    r.add_argument("--min-wall-mm", type=float, default=1.0)
    r.add_argument("--max-faces", type=int, default=1_000_000)
    r.add_argument("--build", type=_dims, help="printer volume, e.g. 218x123x250")
    r.add_argument("--process", default="resin")
    r.add_argument("--samples", type=int, default=3000)
    r.add_argument("--json")
    t = sub.add_parser("thickness")
    t.add_argument("obj")
    t.add_argument("--min-wall-mm", type=float, default=1.0)
    t.add_argument("--samples", type=int, default=4000)
    c = sub.add_parser("clearance")
    c.add_argument("peg")
    c.add_argument("socket")
    c.add_argument("--target", type=float, default=0.12)
    s = sub.add_parser("stl")
    s.add_argument("obj")
    s.add_argument("stl")
    s.add_argument("--overwrite", action="store_true")
    f = sub.add_parser("3mf")
    f.add_argument("out")
    f.add_argument("objs", nargs="+")
    f.add_argument("--overwrite", action="store_true")
    ns = ap.parse_args(argv)
    if ns.cmd == "report":
        out = print_report(ns.objs, ns.target_height_mm, min_wall_mm=ns.min_wall_mm,
                           max_faces=ns.max_faces, build_volume_mm=ns.build, process=ns.process,
                           thickness_samples=ns.samples, out_json=ns.json)
        code = 0 if out["ok"] else 1
    elif ns.cmd == "thickness":
        out = thickness(ns.obj, ns.min_wall_mm, ns.samples)
        code = 0 if out["ok"] else 1
    elif ns.cmd == "clearance":
        out = clearance(ns.peg, ns.socket, ns.target)
        code = 0 if out["ok"] else 1
    elif ns.cmd == "stl":
        out, code = write_stl(ns.obj, ns.stl, overwrite=ns.overwrite), 0
    else:
        out, code = write_3mf(ns.objs, ns.out, overwrite=ns.overwrite), 0
    print(json.dumps(out, indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else repr(o)))
    return code


if __name__ == "__main__":
    sys.exit(_cli())
