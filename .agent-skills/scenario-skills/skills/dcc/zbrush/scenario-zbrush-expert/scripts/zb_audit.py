"""
zb_audit: objective checks on a mesh exported from ZBrush (OBJ), run on the agent side.

The ZBrush SDK only reports counts, bounding boxes, area, volume and watertightness
(query_mesh3d, get_polymesh3d_*, is_polymesh3d_solid); anything per vertex or per edge needs
an export (Maxon: "export the tool and parse it", SDK api-overview). Export with
zb_ops.export_obj(path) (dialog-free, proven in v03), then:

    import zb_audit
    rep = zb_audit.audit("/abs/body.obj")                # dict of numbers
    zb_audit.verdict(rep, profile="game", budget_tris=20000)
    python3 zb_audit.py body.obj --profile print --target-height-mm 300 --json out.json

Needs numpy (system python3), not available inside ZBrush.

Report keys
  points, faces, quads, triangles, ngons, quads_pct, tris_equiv (fan triangulation count)
  valence_hist (interior vertices), poles_e3, poles_e5, poles_6plus (interior only)
  non_manifold_edges (edges with 3+ faces), inconsistent_edges (two faces run the edge in the
  same direction: flipped winding), boundary_edges, boundary_loops (sizes), shells,
  loose_verts (unreferenced), zero_area_faces
  bbox_min, bbox_max, size, center, diag, area, volume (signed; meaningful when closed)
  edge_len_mean, edge_len_min, edge_len_max, edge_len_cv (std / mean)
  symmetry_x_pct (vertices with a mirror partner across x = sym_center within sym_tol*diag)
  has_uvs, uv_bbox
  unit_hint: "zbrush_default_2" when the longest side is about 2 (Scale Master: "ZBrush
  Scale Unify returns the Tool to XYZ Size 2", EXP doc)

Numbers in verdict() are attributed in PROFILE_NOTES; anything marked [added] is this
toolkit's own default, meant to be overridden by the brief.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import argparse
import json
import sys

import numpy as np


class Mesh:
    """verts (N,3) float64, flat (M,) int64 corner vertex indices, sizes (F,) corner counts,
    starts (F,) offsets into flat; uvs (T,2) and flat_uv (M,) or None."""

    def __init__(self, verts, flat, sizes, uvs=None, flat_uv=None, path=None):
        self.verts = np.asarray(verts, dtype=np.float64).reshape(-1, 3)
        self.flat = np.asarray(flat, dtype=np.int64)
        self.sizes = np.asarray(sizes, dtype=np.int64)
        self.starts = np.concatenate([[0], np.cumsum(self.sizes)[:-1]]) if len(self.sizes) \
            else np.zeros(0, dtype=np.int64)
        self.uvs = None if uvs is None or len(uvs) == 0 else np.asarray(uvs, dtype=np.float64)
        self.flat_uv = None if flat_uv is None else np.asarray(flat_uv, dtype=np.int64)
        self.path = path

    @classmethod
    def from_faces(cls, verts, faces):
        flat = [i for f in faces for i in f]
        return cls(verts, flat, [len(f) for f in faces])

    def faces(self):
        return [self.flat[s:s + n].tolist() for s, n in zip(self.starts, self.sizes)]


def load_obj(path):
    """Minimal OBJ reader: v, vt, f (v, v/vt, v//vn, v/vt/vn, negative indices)."""
    verts, uvs, flat, flat_uv, sizes = [], [], [], [], []
    has_vt = False
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                parts = line.split()
                verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
            elif line.startswith("vt "):
                parts = line.split()
                uvs.append((float(parts[1]), float(parts[2])))
            elif line.startswith("f "):
                toks = line.split()[1:]
                nv = len(verts)
                for t in toks:
                    a = t.split("/")
                    vi = int(a[0])
                    flat.append(vi - 1 if vi > 0 else nv + vi)
                    if len(a) > 1 and a[1]:
                        ti = int(a[1])
                        flat_uv.append(ti - 1 if ti > 0 else len(uvs) + ti)
                        has_vt = True
                    else:
                        flat_uv.append(-1)
                sizes.append(len(toks))
    return Mesh(verts, flat, sizes, uvs if has_vt else None, flat_uv if has_vt else None, path)


def _as_mesh(m):
    return load_obj(m) if isinstance(m, str) else m


def _edges(mesh):
    """Directed corner edges (a -> b) following each face's winding."""
    flat, sizes, starts = mesh.flat, mesh.sizes, mesh.starts
    nxt = np.roll(flat, -1)
    ends = starts + sizes - 1
    nxt[ends] = flat[starts]
    return flat, nxt


def _shells(n, a, b):
    """Connected components over vertices (hook and compress label propagation)."""
    lab = np.arange(n, dtype=np.int64)
    if len(a) == 0:
        return lab
    while True:
        m = np.minimum(lab[a], lab[b])
        old = lab.copy()
        np.minimum.at(lab, a, m)
        np.minimum.at(lab, b, m)
        while True:
            j = lab[lab]
            if np.array_equal(j, lab):
                break
            lab = j
        if np.array_equal(lab, old):
            return lab


def _boundary_loops(ba, bb, n):
    """Group boundary edges into connected components (independent of winding, so flipped
    faces do not split a hole); returns the edge count of each component, largest first.
    On a clean mesh each component is one hole."""
    lab = _shells(n, ba, bb)
    comp = lab[ba]
    _, counts = np.unique(comp, return_counts=True)
    return sorted((int(c) for c in counts), reverse=True)


def _symmetry(verts, diag, tol_rel, center):
    """Share of vertices whose mirror across x = center has a vertex within tol."""
    n = len(verts)
    if n == 0:
        return 100.0
    tol = max(tol_rel * diag, 1e-12)
    mir = verts.copy()
    mir[:, 0] = 2 * center - mir[:, 0]
    base = np.floor(np.minimum(verts.min(axis=0), mir.min(axis=0)) / tol).astype(np.int64) - 1
    q = np.floor(verts / tol).astype(np.int64) - base
    qm = np.floor(mir / tol).astype(np.int64) - base
    dims = np.maximum(q.max(axis=0), qm.max(axis=0)) + 2
    stride = (dims[1] * dims[2], dims[2], 1)

    def pack(c):
        return c[:, 0] * stride[0] + c[:, 1] * stride[1] + c[:, 2] * stride[2]

    key = pack(q)
    order = np.argsort(key, kind="stable")
    skey = key[order]
    found = np.zeros(n, dtype=bool)
    for off in ((dx, dy, dz) for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1)):
        k = pack(qm + np.array(off))          # cells stay >= 0 thanks to the -1 margin
        pos = np.clip(np.searchsorted(skey, k), 0, n - 1)
        hit = skey[pos] == k
        d = np.linalg.norm(verts[order[pos]] - mir, axis=1)
        found |= hit & (d <= tol)
    # one representative vertex per cell is tested: exact when tol is below vertex spacing
    return float(found.mean() * 100.0)


def audit(mesh, sym_tol=1e-3, sym_center=0.0):
    """Measure a mesh (Mesh or OBJ path). sym_tol is relative to the bbox diagonal;
    sym_center is the mirror plane x value (ZBrush symmetry mirrors across local X = 0
    [added]; pass "bbox" to use the bbox centre)."""
    m = _as_mesh(mesh)
    v, sizes = m.verts, m.sizes
    nv, nf = len(v), len(sizes)
    rep = {"path": m.path, "points": int(nv), "faces": int(nf)}
    rep["triangles"] = int((sizes == 3).sum())
    rep["quads"] = int((sizes == 4).sum())
    rep["ngons"] = int((sizes > 4).sum())
    rep["degenerate_faces"] = int((sizes < 3).sum())
    rep["quads_pct"] = round(100.0 * rep["quads"] / nf, 3) if nf else 0.0
    rep["tris_equiv"] = int(np.clip(sizes - 2, 0, None).sum())

    lo, hi = (v.min(axis=0), v.max(axis=0)) if nv else (np.zeros(3), np.zeros(3))
    size = hi - lo
    diag = float(np.linalg.norm(size))
    rep.update(bbox_min=lo.round(6).tolist(), bbox_max=hi.round(6).tolist(),
               size=size.round(6).tolist(), center=((lo + hi) / 2).round(6).tolist(),
               diag=round(diag, 6))
    rep["unit_hint"] = "zbrush_default_2" if nv and abs(float(size.max()) - 2.0) < 0.05 else None

    a, b = _edges(m)
    n = max(nv, 1)
    und = np.minimum(a, b) * n + np.maximum(a, b)
    ukeys, inv, counts = np.unique(und, return_inverse=True, return_counts=True)
    rep["edges"] = int(len(ukeys))
    rep["boundary_edges"] = int((counts == 1).sum())
    rep["non_manifold_edges"] = int((counts > 2).sum())
    dkeys, dcounts = np.unique(a * n + b, return_counts=True)
    rep["inconsistent_edges"] = int((dcounts > 1).sum())

    bmask = counts[inv] == 1
    rep["boundary_loops"] = _boundary_loops(a[bmask], b[bmask], nv) if bmask.any() else []

    eu, ev = ukeys // n, ukeys % n
    val = np.bincount(np.concatenate([eu, ev]), minlength=nv) if nv else np.zeros(0, int)
    boundary_v = np.zeros(nv, dtype=bool)
    if bmask.any():
        boundary_v[a[bmask]] = True
        boundary_v[b[bmask]] = True
    used = np.zeros(nv, dtype=bool)
    used[m.flat] = True
    interior = used & ~boundary_v
    iv = val[interior]
    hist = np.bincount(iv) if len(iv) else np.zeros(0, int)
    rep["valence_hist"] = {int(k): int(c) for k, c in enumerate(hist) if c}
    rep["poles_e3"] = int((iv == 3).sum())
    rep["poles_e5"] = int((iv == 5).sum())
    rep["poles_6plus"] = int((iv >= 6).sum())
    rep["loose_verts"] = int((~used).sum())

    lab = _shells(nv, eu, ev)
    rep["shells"] = int(len(np.unique(lab[used]))) if used.any() else 0

    # fan triangulation for area and volume
    if nf:
        ntri = np.clip(sizes - 2, 0, None)
        rep_face = np.repeat(np.arange(nf), ntri)
        tri_start = np.concatenate([[0], np.cumsum(ntri)[:-1]])
        local = np.arange(len(rep_face)) - np.repeat(tri_start, ntri) + 1
        st = m.starts[rep_face]
        p0 = v[m.flat[st]]
        p1 = v[m.flat[st + local]]
        p2 = v[m.flat[st + local + 1]]
        cr = np.cross(p1 - p0, p2 - p0)
        tri_area = 0.5 * np.linalg.norm(cr, axis=1)
        rep["area"] = round(float(tri_area.sum()), 6)
        rep["volume"] = round(float((p0 * np.cross(p1, p2)).sum() / 6.0), 6)
        face_area = np.bincount(rep_face, weights=tri_area, minlength=nf)
        rep["zero_area_faces"] = int((face_area <= 1e-12 * max(diag, 1e-9) ** 2).sum())
    else:
        rep.update(area=0.0, volume=0.0, zero_area_faces=0)

    el = np.linalg.norm(v[eu] - v[ev], axis=1) if len(eu) else np.zeros(1)
    mean = float(el.mean())
    rep.update(edge_len_mean=round(mean, 6), edge_len_min=round(float(el.min()), 6),
               edge_len_max=round(float(el.max()), 6),
               edge_len_cv=round(float(el.std() / mean), 4) if mean > 0 else 0.0)

    c = float((lo[0] + hi[0]) / 2) if sym_center == "bbox" else float(sym_center)
    rep["symmetry_center_x"] = round(c, 6)
    rep["symmetry_x_pct"] = round(_symmetry(v, diag, sym_tol, c), 3)

    rep["has_uvs"] = m.uvs is not None and m.flat_uv is not None and bool((m.flat_uv >= 0).any())
    if rep["has_uvs"]:
        uv = m.uvs[m.flat_uv[m.flat_uv >= 0]]
        rep["uv_bbox"] = [round(float(uv[:, 0].min()), 6), round(float(uv[:, 1].min()), 6),
                          round(float(uv[:, 0].max()), 6), round(float(uv[:, 1].max()), 6)]
    else:
        rep["uv_bbox"] = None
    return rep


PROFILE_NOTES = {
    "watertight": "print parts must be closed: no boundary loops, no non-manifold edges "
                  "(3D Print Hub doc; SDK is_polymesh3d_solid)",
    "print_faces": "about 1M polygons per mesh is plenty for print (Gaboury, W9P5 01:11:40)",
    "print_height": "bbox height within 0.5 percent of the target in mm [added, print digest]",
    "game_ngons": "triangulate the game mesh the way the engine does; n-gons triangulate "
                  "unpredictably (Polycount doc via retopology digest) [added wording]",
    "game_uvs": "maps need UVs (Multi Map Exporter, create_normal_map doc)",
    "poles6": "valence 6+ interior vertices pinch under subdivision [added]",
    "shells": "DynaMesh fuses intersecting parts; Split To Parts separates shells "
              "(fundamentals digest)",
    "winding": "faces running a shared edge in the same direction = flipped winding [added]",
}


def verdict(report, profile="sculpt", budget_tris=None, max_faces=None, expected_holes=0,
            expected_shells=1, symmetric=False, min_symmetry_pct=99.0, require_uvs=None,
            target_height_mm=None, height_axis=1, height_tol_pct=0.5):
    """Problems (must fix) and warnings (look at it) for a profile: sculpt, game, print."""
    r = report
    problems, warnings = [], []
    if r.get("non_manifold_edges"):
        problems.append(f"{r['non_manifold_edges']} non-manifold edges ({PROFILE_NOTES['watertight']})")
    if r.get("inconsistent_edges"):
        problems.append(f"{r['inconsistent_edges']} edges with flipped winding ({PROFILE_NOTES['winding']})")
    if r.get("degenerate_faces"):
        problems.append(f"{r['degenerate_faces']} faces with fewer than 3 corners")
    if r.get("zero_area_faces"):
        (problems if profile == "print" else warnings).append(f"{r['zero_area_faces']} zero-area faces")
    if r.get("loose_verts"):
        warnings.append(f"{r['loose_verts']} unreferenced vertices")
    holes = len(r.get("boundary_loops") or [])
    if profile == "print":
        if holes:
            problems.append(f"{holes} holes (boundary loops {r['boundary_loops'][:5]}): not watertight")
        if r.get("volume", 0) <= 0:
            problems.append(f"volume {r.get('volume')} <= 0: open or inside out")
        lim = max_faces or 1_000_000
        if r["faces"] > lim:
            warnings.append(f"{r['faces']} faces > {lim} ({PROFILE_NOTES['print_faces']})")
        if target_height_mm:
            h = r["size"][height_axis]
            err = abs(h - target_height_mm) / target_height_mm * 100
            if err > height_tol_pct:
                problems.append(f"height {h:.3f} vs target {target_height_mm} mm ({err:.2f} %; "
                                f"{PROFILE_NOTES['print_height']})")
        if r.get("shells", 1) > expected_shells:
            warnings.append(f"{r['shells']} shells: one part per shell unless intended")
    else:
        if holes > expected_holes:
            warnings.append(f"{holes} boundary loops (expected {expected_holes})")
        if r.get("shells", 1) > expected_shells:
            warnings.append(f"{r['shells']} shells, expected {expected_shells} ({PROFILE_NOTES['shells']})")
    if profile == "game":
        if r.get("ngons"):
            problems.append(f"{r['ngons']} n-gons ({PROFILE_NOTES['game_ngons']})")
        if budget_tris is not None and r["tris_equiv"] > budget_tris:
            problems.append(f"{r['tris_equiv']} triangles > budget {budget_tris}")
        if (require_uvs is None or require_uvs) and not r.get("has_uvs"):
            problems.append(f"no UVs ({PROFILE_NOTES['game_uvs']})")
        if r.get("poles_6plus"):
            warnings.append(f"{r['poles_6plus']} vertices with 6+ edges ({PROFILE_NOTES['poles6']})")
    elif profile == "sculpt":
        if r.get("ngons"):
            warnings.append(f"{r['ngons']} n-gons: Divide and ZRemesher expect quads/tris [added]")
        if require_uvs and not r.get("has_uvs"):
            problems.append("no UVs")
    if symmetric and r.get("symmetry_x_pct", 100) < min_symmetry_pct:
        warnings.append(f"symmetry {r['symmetry_x_pct']} % < {min_symmetry_pct} % [added threshold]")
    return {"profile": profile, "ok": not problems, "problems": problems, "warnings": warnings}


def displaced(mesh_a, mesh_b, rel_tol=1e-4):
    """Vertices that moved between two exports of the same topology (for example before and
    after one scripted stroke). Returns {'count', 'indices', 'centroid_before',
    'centroid_after', 'max_disp'}; raises if the vertex counts differ (topology changed)."""
    a, b = _as_mesh(mesh_a), _as_mesh(mesh_b)
    if len(a.verts) != len(b.verts):
        raise ValueError(f"vertex count changed {len(a.verts)} -> {len(b.verts)}")
    diag = float(np.linalg.norm(a.verts.max(axis=0) - a.verts.min(axis=0))) or 1.0
    d = np.linalg.norm(b.verts - a.verts, axis=1)
    idx = np.nonzero(d > rel_tol * diag)[0]
    out = {"count": int(len(idx)), "indices": idx.tolist()[:50000],
           "max_disp": round(float(d.max()), 6) if len(d) else 0.0}
    if len(idx):
        w = d[idx][:, None]                    # weight by displacement: the stroke centre
        out["centroid_before"] = ((a.verts[idx] * w).sum(axis=0) / w.sum()).round(6).tolist()
        out["centroid_after"] = ((b.verts[idx] * w).sum(axis=0) / w.sum()).round(6).tolist()
        out["peak_before"] = a.verts[idx[int(np.argmax(w))]].round(6).tolist()
    return out


def compare(before, after):
    """Numeric deltas between two audit reports (face ratio, volume change, bbox change)."""
    out = {"faces_ratio": round(after["faces"] / before["faces"], 4) if before["faces"] else None}
    if before.get("volume"):
        out["volume_change_pct"] = round((after["volume"] - before["volume"]) / abs(before["volume"]) * 100, 3)
    out["size_change"] = [round(b - a, 6) for a, b in zip(before["size"], after["size"])]
    return out


def _cli(argv=None):
    ap = argparse.ArgumentParser(description="Audit an OBJ exported from ZBrush")
    ap.add_argument("obj")
    ap.add_argument("--profile", default="sculpt", choices=("sculpt", "game", "print"))
    ap.add_argument("--budget-tris", type=int)
    ap.add_argument("--max-faces", type=int)
    ap.add_argument("--target-height-mm", type=float)
    ap.add_argument("--symmetric", action="store_true")
    ap.add_argument("--json")
    ns = ap.parse_args(argv)
    rep = audit(ns.obj)
    rep["verdict"] = verdict(rep, ns.profile, budget_tris=ns.budget_tris, max_faces=ns.max_faces,
                             target_height_mm=ns.target_height_mm, symmetric=ns.symmetric)
    text = json.dumps(rep, indent=1)
    if ns.json:
        with open(ns.json, "w") as fh:
            fh.write(text)
    print(text)
    return 0 if rep["verdict"]["ok"] else 1


if __name__ == "__main__":
    sys.exit(_cli())
