"""
bx_sculpt: sculpt-brush equivalents for an agent with no tablet.

Blender's brushes (`bpy.ops.sculpt.brush_stroke`) need a 3D view region, so they fail
headless, and several sculpt-mode operators (mask flood fill, mesh filter) crash
Blender in background mode. This module reproduces what the brushes do to the
surface directly on mesh data with numpy, so it works headless and inside a live GUI
session alike. It writes the real `.sculpt_mask` attribute, so masks carry over to
Blender's own sculpt mode.

  import sys; sys.path.append("<skill>/scripts"); import bx_sculpt as S
  sc = S.Sculptor(obj, symmetry_x=True)
  p = sc.surface_point(origin=(0, -2, 1.6), direction=(0, 1, 0))   # ray onto the surface
  sc.dab("draw", p, radius=0.08, strength=0.5)                       # one brush dab
  sc.stroke("clay", [p0, p1, p2], radius=0.05, strength=0.4)         # dabs along a path
  sc.grab(p, radius=0.3, delta=(0, -0.05, 0))                        # move a mass
  sc.smooth(p, radius=0.1, strength=0.5, iterations=3)
  sc.commit()                                                        # write back to the mesh

Brush semantics (what each does to the surface, radius and heights in world units):
  draw     push along the area normal (negative strength = carve)
  inflate  push each vertex along its own normal (swells or shrinks forms)
  clay     raise the surface toward a plane floating above it; fills dips first, builds
           flat-topped layers (Clay / Clay Strips feel); negative = dig
  layer    like draw but capped at a fixed height (even plateau)
  flatten  pull toward the local average plane from both sides (planes a form)
  fill     raise only what is below the average plane
  scrape   lower only what is above the average plane (knock down bumps, carve planes)
  pinch    pull vertices toward the dab centre along the surface (sharpens a crease/edge)
  crease   pinch + push inward: sharp valleys (eyelid folds, nasolabial, cloth folds)
  smooth   Laplacian relax (also the tool for polishing, use low strength)
  grab     move a region by a vector with falloff (proportions, masses)
  mask     paint 0..1 protection; every op is scaled by (1 - mask)

Falloff: smooth (default, Blender's), smoother (Clay Strips default), sphere, root,
sharp, pow4 (Blender "Sharper": Draw Sharp, Crease Sharp), linear, constant.
Heights default to `strength * radius * 0.25`, pass `height=` to control exactly.

Added 2026-09-24 (tested in tests/code/blender-sculpting/test_bx_sculpt.py):
  Sculptor(..., front_faces_only=True)   Front Faces Only: thin lips, ears, fins safe
  sc.crease_line(pts, radius, depth, pinch)   groove (depth>0) or pinched ridge (depth<0)
                                        along a polyline, falloff from the line itself
  sc.move_feature(c, r, translate, scale)     mask + Set Pivot Unmasked + Move/Scale tool
  sc.open_eyelids(c, r_eye)             open an eyelid mass so the eyeball shows (Thelen)
  sc.on_surface(p, view)                land a point like a viewport stroke (ray, not nearest)
  sc.line_project(plane_co, plane_no)   Line Project: flatten everything past a plane
  sc.blur_mask / grow_mask / invert_mask      mask pie substitutes (mask_filter crashes)
  symmetrize(obj, direction)            edit-mode symmetrize (sculpt.symmetrize crashes)
  remesh_stage(obj, voxel)              voxel remesh + symmetrize + volume-kept relax
  voxel_for_faces(obj, n)               faces ~ 1.5 * area / voxel^2 (measured, 3%)
  stage_report(obj)                     faces, components, stretch, mirror error, scale
  profile_rhythm(obj)                   out/in sequence of the midline front profile
  head_guides(H)                        landmark heights and widths from the experts
  expert_brush(name)                    real brush + the experts' settings (GUI strokes)

Added 2026-09-24, v2 (tested in tests/code/blender-sculpting/test_planes_sdf.py):
  sc.plane_cut(c, n, r, offset | plane_point=)   everything above a STATED plane onto it
                                        (Scrape with a fixed plane, Trim, regional Line Project)
  sc.corner_cut([(p, n), ...], c, r)    hard corner where 2 or 3 stated planes meet (gonial angle)
  sc.planarity(c, r)                    best-fit plane RMS / radius (0 = flat)
  drop_islands(obj)                     sealed shells after a remesh (inside remesh_stage too)
  fit_plane / fit_sphere / surface_samples / curvature_radius
  form_report(obj, pts, H), lower_face_report(obj, H)   shading-level check: does the lower
                                        face read as ONE ball (the E2 failure)?
  Clay + sd_* primitives                smooth-blend SDF blockout meshed with OpenVDB: blends only
                                        near seams, half-space clips = plane cuts with a set edge
  framing(objs, dir, lens), final_render(objs, path, ...)   client stills, px per unit
  write_shape_key(obj, name, co)        expression on a key, basis untouched
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

FALLOFF = {
    "smooth": lambda t: 3 * (1 - t) ** 2 - 2 * (1 - t) ** 3,
    "sphere": lambda t: np.sqrt(np.clip(1 - t * t, 0, 1)),
    "root": lambda t: np.sqrt(1 - t),
    "sharp": lambda t: (1 - t) ** 2,
    "linear": lambda t: 1 - t,
    "constant": lambda t: np.ones_like(t),
    "pow4": lambda t: (1 - t) ** 4,
    "smoother": lambda t: 1 - (6 * t ** 5 - 15 * t ** 4 + 10 * t ** 3),
}
# Front Faces Only fades in over normal dot 0..FRONT_RAMP instead of a hard cut: a binary
# cut left jagged steps on lips and lids (seen on the test head, 2026-09-24)
FRONT_RAMP = 0.25


class Sculptor:
    def __init__(self, obj, symmetry_x=True, falloff="smooth", front_faces_only=False):
        if obj.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        self.obj, self.me = obj, obj.data
        self.symmetry_x, self.falloff = symmetry_x, falloff
        self.front_faces_only = front_faces_only
        self._load()

    # ---------- data plumbing ----------
    def _load(self):
        me = self.me
        n = len(me.vertices)
        self.co = np.empty(n * 3, dtype=np.float64)
        me.vertices.foreach_get("co", self.co)
        self.co = self.co.reshape(n, 3)
        me.calc_loop_triangles()
        t = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", t)
        self.tris = t.reshape(-1, 3)
        e = np.empty(len(me.edges) * 2, dtype=np.int64)
        me.edges.foreach_get("vertices", e)
        self.edges = e.reshape(-1, 2)
        self.deg = np.bincount(self.edges.ravel(), minlength=n).astype(np.float64)
        self.deg[self.deg == 0] = 1
        attr = me.attributes.get(".sculpt_mask")
        self.mask = np.zeros(n)
        if attr is not None:
            attr.data.foreach_get("value", self.mask)
        self._normals()
        self._bvh = None

    def _normals(self):
        a, b, c = (self.co[self.tris[:, i]] for i in range(3))
        fn = np.cross(b - a, c - a)
        vn = np.zeros_like(self.co)
        for i in range(3):
            np.add.at(vn, self.tris[:, i], fn)
        ln = np.linalg.norm(vn, axis=1)
        ln[ln == 0] = 1
        self.vn = vn / ln[:, None]
        self._bvh = None

    def commit(self, remember_mask=True):
        """Write coordinates (and mask) back to the mesh."""
        self.me.vertices.foreach_set("co", self.co.astype(np.float32).ravel())
        if remember_mask:
            attr = self.me.attributes.get(".sculpt_mask") or \
                self.me.attributes.new(".sculpt_mask", "FLOAT", "POINT")
            attr.data.foreach_set("value", self.mask.astype(np.float32))
        self.me.update()

    def bvh(self):
        if self._bvh is None:
            self._bvh = BVHTree.FromPolygons(self.co.tolist(), self.tris.tolist())
        return self._bvh

    # ---------- surface queries (object-local coordinates) ----------
    # All coordinates in this class are object-local. Blockouts built with
    # union_remesh() have an identity transform, so local == world there.
    def to_local(self, p_world):
        return np.array(self.obj.matrix_world.inverted() @ Vector(p_world))

    def to_world(self, p_local):
        return np.array(self.obj.matrix_world @ Vector(p_local))

    def surface_point(self, origin, direction):
        """First hit of a ray on the surface, or None. Use to place dabs on landmarks."""
        loc, nor, idx, dist = self.bvh().ray_cast(Vector(origin), Vector(direction).normalized())
        return None if loc is None else np.array(loc)

    def nearest(self, p):
        loc, nor, idx, dist = self.bvh().find_nearest(Vector(p))
        return np.array(loc)

    def on_surface(self, p, view=None):
        """Put a point on the surface the way a stroke drawn in a viewport lands.
        view=None: nearest surface point (fine for points already close to the surface).
        view=(0, 1, 0) etc.: cast a ray along the view direction through p (front view
        looks along +Y). Use a view for anything placed from outside the head: from a
        point in front of the mouth, the NEAREST surface is often the nose tip."""
        if view is None:
            return self.nearest(p)
        v = np.asarray(view, dtype=np.float64)
        v = v / np.linalg.norm(v)
        far = float(np.linalg.norm(self.co.max(0) - self.co.min(0))) * 2
        hit = self.surface_point(np.asarray(p, dtype=np.float64) - v * far, v)
        return hit if hit is not None else self.nearest(p)

    def extremes(self):
        """Handy landmarks: bbox min/max and the most forward (-Y) midline point."""
        lo, hi = self.co.min(0), self.co.max(0)
        mid = np.abs(self.co[:, 0]) < (hi[0] - lo[0]) * 0.02
        front = self.co[mid][np.argmin(self.co[mid][:, 1])] if mid.any() else self.co[np.argmin(self.co[:, 1])]
        return {"min": lo, "max": hi, "center": (lo + hi) / 2, "front_midline": front}

    # ---------- core ----------
    def _weights(self, center, radius, falloff=None, front=None):
        d = np.linalg.norm(self.co - center, axis=1)
        inside = d < radius
        w = np.zeros(len(self.co))
        t = d[inside] / radius
        w[inside] = FALLOFF[falloff or self.falloff](t)
        if (self.front_faces_only if front is None else front) and inside.any():
            # Front Faces Only: skip vertices facing away from the surface under the
            # dab centre (the other side of a lip, ear or fin inside the radius)
            ref = self.vn[np.argmin(d)]
            w[inside] *= np.clip((self.vn[inside] @ ref) / FRONT_RAMP, 0, 1)
        return w * (1 - self.mask)

    def _blur(self, w, iterations):
        """Average a per-vertex array over the edge graph (Smooth Mask equivalent)."""
        for _ in range(iterations):
            s = np.zeros_like(w)
            np.add.at(s, self.edges[:, 0], w[self.edges[:, 1]])
            np.add.at(s, self.edges[:, 1], w[self.edges[:, 0]])
            w = 0.5 * w + 0.5 * s / self.deg
        return w

    def _area(self, w):
        s = w.sum()
        if s <= 0:
            return None, None
        p = (self.co * w[:, None]).sum(0) / s
        n = (self.vn * w[:, None]).sum(0)
        ln = np.linalg.norm(n)
        return p, (n / ln if ln > 0 else np.array([0, 0, 1.0]))

    def _passes(self, center):
        yield np.asarray(center, dtype=np.float64), np.array([1.0, 1, 1])
        if self.symmetry_x:
            yield np.asarray(center) * np.array([-1.0, 1, 1]), np.array([-1.0, 1, 1])

    def dab(self, brush, center, radius, strength=0.5, height=None, falloff=None, front=None):
        """Apply one brush dab (plus its X mirror). Returns number of vertices moved."""
        center = np.asarray(center, dtype=np.float64)
        h = height if height is not None else strength * radius * 0.25
        delta = np.zeros_like(self.co)
        wmax = np.zeros(len(self.co))
        for c, flip in self._passes(center):
            w = self._weights(c, radius, falloff, front)
            if not w.any():
                continue
            d = self._brush_delta(brush, c, radius, strength, h, w)
            take = w > wmax          # where passes overlap, the stronger dab wins
            delta[take] = d[take]
            wmax = np.maximum(wmax, w)
        self.co += delta
        return int((np.abs(delta).sum(1) > 0).sum())

    def _brush_delta(self, brush, c, radius, strength, h, w):
        co, vn = self.co, self.vn
        p, n = self._area(w)
        if p is None:
            return np.zeros_like(co)
        sgn = 1.0 if strength >= 0 else -1.0
        if brush == "draw":
            return n * (h * w)[:, None]
        if brush == "inflate":
            return vn * (h * w)[:, None]
        if brush == "layer":
            dist = (co - p) @ n
            return n * (np.clip(h - dist, 0, None) * w * abs(strength))[:, None] * sgn
        if brush in ("clay", "flatten", "fill", "scrape"):
            offset = {"clay": abs(h) * sgn, "flatten": 0.0, "fill": 0.0, "scrape": 0.0}[brush]
            plane = p + n * offset
            dist = (co - plane) @ n                       # >0 above the plane
            if brush == "clay":
                move = np.where(dist * sgn < 0, -dist, 0.0)  # only toward the plane
            elif brush == "fill":
                move = np.where(dist < 0, -dist, 0.0)
            elif brush == "scrape":
                move = np.where(dist > 0, -dist, 0.0)
            else:
                move = -dist
            return n * (move * w * min(abs(strength), 1.0))[:, None]
        if brush in ("pinch", "crease"):
            to_c = c - co
            to_c -= np.outer(to_c @ n, n)                 # keep it on the tangent plane
            d = to_c * (w * abs(strength) * 0.5)[:, None]
            if brush == "crease":
                d += n * (-abs(h) * sgn * w)[:, None]
            return d
        raise ValueError(f"unknown brush {brush}")

    def stroke(self, brush, points, radius, strength=0.5, spacing=0.3, height=None,
               falloff=None, project=True, front=None):
        """Dabs every spacing*radius along a polyline. Points snap to the surface:
        project=True nearest point, project=(x, y, z) ray along that view direction."""
        pts = [np.asarray(p, dtype=np.float64) for p in points]
        path = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            L = np.linalg.norm(b - a)
            k = max(1, int(L / (spacing * radius)))
            path += [a + (b - a) * (i / k) for i in range(1, k + 1)]
        moved = 0
        for i, q in enumerate(path):
            if project is not False and project is not None:
                q = self.on_surface(q, None if project is True else project)
            moved += self.dab(brush, q, radius, strength, height, falloff, front)
            if i % 4 == 3:
                self._normals()
        self._normals()
        return moved

    def grab(self, center, radius, delta, falloff=None, front=None):
        """Move a region by `delta` (mirrored in X when symmetry is on)."""
        delta = np.asarray(delta, dtype=np.float64)
        total = np.zeros_like(self.co)
        wmax = np.zeros(len(self.co))
        for c, flip in self._passes(np.asarray(center)):
            w = self._weights(c, radius, falloff, front)
            take = w > wmax
            total[take] = np.outer(w, delta * flip)[take]
            wmax = np.maximum(wmax, w)
        self.co += total
        self._normals()

    def smooth(self, center=None, radius=None, strength=0.5, iterations=1, falloff=None,
               preserve_volume=False):
        """Laplacian relax. center=None smooths the whole mesh (respecting the mask).
        preserve_volume=True uses Taubin lambda/mu passes so forms do not shrink
        (use it for global relax after a voxel remesh; plain Laplacian for polishing)."""
        if center is None:
            w = (1 - self.mask) * strength
        else:
            w = np.zeros(len(self.co))
            for c, _f in self._passes(np.asarray(center)):
                w = np.maximum(w, self._weights(c, radius, falloff))
            w *= strength
        w = np.clip(w, 0, 1)[:, None]
        factors = [1.0, -1.06] if preserve_volume else [1.0]
        for _ in range(iterations):
            for f in factors:
                s = np.zeros_like(self.co)
                np.add.at(s, self.edges[:, 0], self.co[self.edges[:, 1]])
                np.add.at(s, self.edges[:, 1], self.co[self.edges[:, 0]])
                avg = s / self.deg[:, None]
                self.co += (avg - self.co) * w * f
        self._normals()

    def paint_mask(self, center, radius, value=1.0, falloff=None, mode="max"):
        for c, _f in self._passes(np.asarray(center)):
            w = FALLOFF[falloff or "smooth"](np.clip(np.linalg.norm(self.co - c, axis=1) / radius, 0, 1))
            w[np.linalg.norm(self.co - c, axis=1) >= radius] = 0
            self.mask = np.maximum(self.mask, w * value) if mode == "max" else np.clip(self.mask - w * value, 0, 1)

    def clear_mask(self):
        self.mask[:] = 0

    def mask_by(self, predicate):
        """Mask with a numpy predicate on coordinates, e.g. lambda co: co[:, 2] < 1.4."""
        self.mask = np.where(predicate(self.co), 1.0, self.mask)

    # ---------- mask pie substitutes (sculpt.mask_filter crashes headless) ----------
    def blur_mask(self, iterations=3):
        """Smooth Mask (Kaspar/Reinhardt use 3 iterations before moving a feature)."""
        self.mask = np.clip(self._blur(self.mask, iterations), 0, 1)

    def grow_mask(self, steps=1):
        """Grow Mask: dilate the mask over edges `steps` rings."""
        for _ in range(steps):
            m = self.mask.copy()
            np.maximum.at(m, self.edges[:, 0], self.mask[self.edges[:, 1]])
            np.maximum.at(m, self.edges[:, 1], self.mask[self.edges[:, 0]])
            self.mask = m

    def invert_mask(self):
        self.mask = 1.0 - self.mask

    # ---------- line tools ----------
    def _resample_on_surface(self, points, step, project=True):
        pts = [np.asarray(p, dtype=np.float64) for p in points]
        path = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            k = max(1, int(np.linalg.norm(b - a) / step))
            path += [a + (b - a) * (i / k) for i in range(1, k + 1)]
        if project is not False and project is not None:
            view = None if project is True else project
            path = [self.on_surface(q, view) for q in path]
        return np.array(path)

    def _line_field(self, P, radius, falloff, front):
        """Per vertex: weight from the distance to polyline P, nearest point on P, and
        the surface normal there (area normal sampled along the line)."""
        co = self.co
        ns = []
        for s in P:                                   # area normal under each sample
            near = np.linalg.norm(co - s, axis=1) < radius
            n = self.vn[near].sum(0) if near.any() else self.vn[np.argmin(np.linalg.norm(co - s, axis=1))]
            ns.append(n / (np.linalg.norm(n) or 1.0))
        ns = np.array(ns)
        best_d = np.full(len(co), np.inf)
        best_q = np.zeros_like(co)
        best_n = np.zeros_like(co)
        for i in range(max(1, len(P) - 1)):
            a, b = P[i], P[min(i + 1, len(P) - 1)]
            ab = b - a
            L2 = ab @ ab
            t = np.clip(((co - a) @ ab) / L2, 0, 1) if L2 > 0 else np.zeros(len(co))
            q = a + t[:, None] * ab
            d = np.linalg.norm(co - q, axis=1)
            m = d < best_d
            if m.any():
                n = ns[i] * (1 - t[m, None]) + ns[min(i + 1, len(P) - 1)] * t[m, None]
                best_d[m], best_q[m], best_n[m] = d[m], q[m], n
        best_n /= np.maximum(np.linalg.norm(best_n, axis=1), 1e-12)[:, None]
        inside = best_d < radius
        w = np.zeros(len(co))
        w[inside] = FALLOFF[falloff](best_d[inside] / radius)
        if self.front_faces_only if front is None else front:
            w *= np.clip(np.einsum("ij,ij->i", self.vn, best_n) / FRONT_RAMP, 0, 1)
        return w * (1 - self.mask), best_q, best_n

    def crease_line(self, points, radius, depth, pinch=0.5, falloff="pow4", project=True,
                    front=None):
        """Crease / Draw Sharp along a polyline in one pass.
        depth > 0 cuts a V groove (mouth line, lid fold, behind the ear); depth < 0 raises a
        pinched knife ridge (the Ctrl-crease: lid rim, lip border, ear rim).
        pinch pulls the flanks toward the line: 0 = plain Draw Sharp cut or Kaspar's
        'landmark pencil' (Morren: crease with pinch reduced), 0.5 = Crease Polish,
        0.8 = Crease Sharp. Falloff is measured from the line itself, so the groove is even
        along its length. project: True = nearest point, or a view direction such as
        (0, 1, 0) to drop the line onto the face as seen from the front (safer).
        A crease only reads with 3 to 4 vertices across `radius`:
        remesh finer first (Ryan King). Mirrored in X when symmetry is on."""
        P = self._resample_on_surface(points, radius * 0.25, project)
        paths = [P]
        if self.symmetry_x:
            paths.append(P * np.array([-1.0, 1, 1]))
        delta = np.zeros_like(self.co)
        wmax = np.zeros(len(self.co))
        for Q in paths:
            w, q, n = self._line_field(Q, radius, falloff, front)
            d = -n * (depth * w)[:, None]
            to = q - self.co
            to -= np.einsum("ij,ij->i", to, n)[:, None] * n      # tangential part only
            d += to * (w * pinch * 0.5)[:, None]
            take = w > wmax
            delta[take] = d[take]
            wmax = np.maximum(wmax, w)
        self.co += delta
        self._normals()
        return int((wmax > 0).sum())

    def move_feature(self, center, radius, translate=(0, 0, 0), scale=1.0, pivot=None,
                     falloff="smooth", blur=3, front=None):
        """Move or resize a whole feature instead of re-sculpting it (Morren's mask ->
        Set Pivot Unmasked -> Move/Scale; Reinhardt's lasso mask -> Smooth Mask x3 -> Move).
        Weight = falloff around `center` x (1 - mask), blurred `blur` times over the edge
        graph; pivot = weighted centroid unless given; scale is a float or (sx, sy, sz).
        Paint mask first on neighbours that must not follow (Morren erases the mask near
        the cheek before moving the ear). Remesh afterwards if faces stretched."""
        s = np.broadcast_to(np.asarray(scale, dtype=np.float64), (3,))
        t = np.asarray(translate, dtype=np.float64)
        total = np.zeros_like(self.co)
        wmax = np.zeros(len(self.co))
        for c, flip in self._passes(np.asarray(center, dtype=np.float64)):
            w = self._weights(c, radius, falloff, front)
            if not w.any():
                continue
            w = np.clip(self._blur(w, blur), 0, 1) * (1 - self.mask)
            pv = (self.co * w[:, None]).sum(0) / w.sum() if pivot is None \
                else np.asarray(pivot, dtype=np.float64) * flip
            target = pv + (self.co - pv) * s + t * flip
            d = (target - self.co) * w[:, None]
            take = w > wmax
            total[take] = d[take]
            wmax = np.maximum(wmax, w)
        self.co += total
        self._normals()
        return int((wmax > 1e-6).sum())

    def open_eyelids(self, center, radius, forward=(0, -1, 0), half_width_deg=40.0,
                     up_deg=16.0, down_deg=22.0, tilt_deg=8.0, recess=0.88, feather=0.35):
        """Open the eye in an 'eyelid mass' (Thelen gC3FG8-4lsU 00:15:43: a sphere a bit
        larger than the eyeball is joined into the head and remeshed; a copy becomes the
        eyeball). Skin inside an almond-shaped opening, measured as angles seen from the
        eye centre, is pushed back to `recess` x radius so the separate eyeball object
        shows through; the ring of skin left around it reads as the lids.
          up_deg < down_deg  the upper lid covers more of the iris (Abbitt 9N87-yRR5aE 00:26:25)
          tilt_deg           outer corner higher (Thelen 00:46:10: about 8 degrees)
        `radius` is the EYEBALL radius. Mirrored in X. Call again after a remesh to restate."""
        f0 = np.asarray(forward, dtype=np.float64)
        f0 = f0 / np.linalg.norm(f0)
        tt = math.radians(tilt_deg)
        total = np.zeros_like(self.co)
        wmax = np.zeros(len(self.co))
        for c, flip in self._passes(np.asarray(center, dtype=np.float64)):
            f = f0 * flip
            up = np.array([0.0, 0, 1]) - f * f[2]
            up /= np.linalg.norm(up)
            out = np.cross(up, f)
            if out @ np.array([np.sign(c[0]) or 1.0, 0, 0]) < 0:
                out = -out                                # +u points away from the midline
            d = self.co - c
            dist = np.linalg.norm(d, axis=1)
            dn = d / np.maximum(dist, 1e-12)[:, None]
            fz = dn @ f
            a_h = np.arctan2(dn @ out, fz)
            a_v = np.arctan2(dn @ up, fz)
            u = a_h * math.cos(tt) + a_v * math.sin(tt)   # opening rotated: outer corner up
            v = -a_h * math.sin(tt) + a_v * math.cos(tt)
            vv = np.where(v > 0, math.radians(up_deg), math.radians(down_deg))
            e = (u / math.radians(half_width_deg)) ** 2 + (v / vv) ** 2
            t = np.clip((1 - e) / feather, 0, 1)
            w = t * t * (3 - 2 * t)
            target = radius * recess
            w *= (fz > 0) & (dist < radius * 1.8) & (dist > target)
            w *= 1 - self.mask
            dd = dn * ((target - dist) * w)[:, None]
            take = w > wmax
            total[take] = dd[take]
            wmax = np.maximum(wmax, w)
        self.co += total
        self._normals()
        return int((wmax > 0).sum())

    def line_project(self, plane_co, plane_no):
        """Line Project (Keelan Jon's bust base, Reinhardt's flat ear sides): every vertex
        on the +normal side of the plane is projected onto it. Respects the mask.
        Voxel remesh afterwards: the flattened side walls leave degenerate faces."""
        n = np.asarray(plane_no, dtype=np.float64)
        n = n / np.linalg.norm(n)
        h = (self.co - np.asarray(plane_co, dtype=np.float64)) @ n
        move = np.where(h > 0, h, 0.0) * (1 - self.mask)
        self.co -= np.outer(move, n)
        self._normals()
        return int((move > 0).sum())

    # ---------- explicit planes: the executable form of "planes before lines" ----------
    # flatten/scrape dabs fit their plane to the surface under the brush, so on a convex
    # ball they follow the ball and barely change it (E2 with-skill run, 2026-09-24). Experts
    # cut planes against a STATED plane: Scrape with a locked plane, Trim / Line Project
    # (Reinhardt), Ctrl Clay Strips along the jaw side (Ryan King), Draw Sharp plane borders
    # re-cut whenever the face looks off (Thelen). These two methods take the plane as input.
    @staticmethod
    def _ramp(t, hardness):
        """1 inside hardness, smoothstep to 0 at t = 1: a flat core with a soft border."""
        r = np.clip((1 - t) / max(1 - hardness, 1e-6), 0, 1)
        return r * r * (3 - 2 * r)

    def plane_cut(self, center, normal, radius, offset=0.0, hardness=0.6, mode="scrape",
                  region="cylinder", front=True, depth=None, max_move=None, strength=1.0,
                  plane_point=None):
        """Bring everything above an explicit plane down onto it (Scrape with a fixed plane,
        Trim tools, Line Project limited to a region). The plane passes through
        center + normal * offset (offset < 0 cuts deeper than the stated point) with the given
        outward normal, or through plane_point when given (a landmark such as the gonion:
        then center only places the region). Region: vertices within `radius` of the axis
        through center along the
        normal ('cylinder', like a Trim lasso seen along the normal) or of center ('sphere').
        Weight 1 inside hardness * radius, smoothstep to 0 at radius. mode: 'scrape' lowers
        only what is above; 'flatten' also raises what is below, down to `depth`
        (default 0.3 x radius); 'fill' only raises. front: skip vertices facing away from the
        plane (the far side of an ear or lip). max_move: leave vertices that would travel
        further alone (protects a nose inside a wide cheek cut). Mirrored in X with symmetry.
        Returns (vertices moved, largest move)."""
        n0 = np.asarray(normal, dtype=np.float64)
        n0 = n0 / np.linalg.norm(n0)
        depth = radius * 0.3 if depth is None else depth
        delta = np.zeros_like(self.co)
        wmax = np.zeros(len(self.co))
        for c, flip in self._passes(np.asarray(center, dtype=np.float64)):
            n = n0 * flip
            q = c + n * offset if plane_point is None else np.asarray(plane_point, dtype=np.float64) * flip
            hgt = (self.co - q) @ n
            relc = self.co - c                              # the region is centred on center
            d = np.linalg.norm(relc - np.outer(relc @ n, n), axis=1) if region == "cylinder" \
                else np.linalg.norm(relc, axis=1)
            w = np.where(d < radius, self._ramp(d / radius, hardness), 0.0)
            if front:
                w *= np.clip((self.vn @ n) / FRONT_RAMP, 0, 1)
            w *= (1 - self.mask) * min(abs(strength), 1.0)
            if mode == "scrape":
                move = np.where(hgt > 0, hgt, 0.0)
            elif mode == "fill":
                move = np.where((hgt < 0) & (hgt > -depth), hgt, 0.0)
            elif mode == "flatten":
                move = np.where(hgt > -depth, hgt, 0.0)
            else:
                raise ValueError(f"unknown plane_cut mode {mode}")
            if max_move is not None:
                w *= np.clip((max_move - np.abs(move)) / (0.25 * max_move), 0, 1)
            dd = -n[None, :] * (move * w)[:, None]
            take = w > wmax
            delta[take] = dd[take]
            wmax = np.maximum(wmax, w)
        self.co += delta
        self._normals()
        mv = np.linalg.norm(delta, axis=1)
        return int((mv > 0).sum()), float(mv.max())

    def corner_cut(self, planes, center, radius, hardness=0.5, iterations=8, front=True,
                   max_move=None):
        """Hard corner where two or three stated planes meet: the gonial angle (jaw side +
        jaw underside + ramus back), the cheekbone edge (front plane + side plane of the
        zygoma), a square chin (front + underside). planes = [(point, outward_normal), ...].
        Every vertex in the sphere (center, radius) that lies outside the intersection of the
        half-spaces is projected onto it (alternating projections, exact for two planes),
        weighted like plane_cut. front: only vertices whose normal agrees with the plane
        they violate move (the neck under a jaw corner faces sideways or forward and stays;
        mask it too when in doubt). max_move: optional guard, vertices that would travel
        further are faded out (it can leave a ridge; prefer front and the mask). The edge is
        as sharp as the mesh allows: every
        remesh softens it, restate after each remesh (Reinhardt, Keelan Jon). Mirrored in X.
        Returns (vertices moved, largest move)."""
        pl0 = []
        for p, n in planes:
            n = np.asarray(n, dtype=np.float64)
            pl0.append((np.asarray(p, dtype=np.float64), n / np.linalg.norm(n)))
        delta = np.zeros_like(self.co)
        wmax = np.zeros(len(self.co))
        for c, flip in self._passes(np.asarray(center, dtype=np.float64)):
            pl = [(p * flip, n * flip) for p, n in pl0]
            d = np.linalg.norm(self.co - c, axis=1)
            w = np.where(d < radius, self._ramp(d / radius, hardness), 0.0) * (1 - self.mask)
            if front:
                viol = np.stack([(self.co - p) @ n for p, n in pl], 1)
                worst = np.argmax(viol, axis=1)
                nw = np.stack([n for _p, n in pl])[worst]
                w *= np.clip(np.einsum("ij,ij->i", self.vn, nw) / FRONT_RAMP, 0, 1)
            P = self.co.copy()
            for _ in range(iterations):
                for p, n in pl:
                    P -= np.outer(np.maximum((P - p) @ n, 0.0), n)
            move = P - self.co
            if max_move is not None:
                w *= np.clip((max_move - np.linalg.norm(move, axis=1)) / (0.25 * max_move), 0, 1)
            dd = move * w[:, None]
            take = w > wmax
            delta[take] = dd[take]
            wmax = np.maximum(wmax, w)
        self.co += delta
        self._normals()
        mv = np.linalg.norm(delta, axis=1)
        return int((mv > 0).sum()), float(mv.max())

    def planarity(self, center, radius, region="sphere", normal=None):
        """Flatness of the surface around center: best-fit plane RMS residual / radius
        (0 = a perfect plane; a sphere of radius R sampled over a disc of radius r gives about
        r / (6.9 R)). region 'cylinder' needs the axis `normal`. Returns (rms_over_radius,
        fitted normal, vertex count)."""
        c = np.asarray(center, dtype=np.float64)
        if region == "cylinder":
            n = np.asarray(normal, dtype=np.float64) / np.linalg.norm(normal)
            rel = self.co - c
            sel = np.linalg.norm(rel - np.outer(rel @ n, n), axis=1) < radius
            sel &= (self.vn @ n) > 0
        else:
            sel = np.linalg.norm(self.co - c, axis=1) < radius
        if sel.sum() < 4:
            return float("nan"), None, int(sel.sum())
        _c, nrm, rms = fit_plane(self.co[sel])
        return rms / radius, nrm, int(sel.sum())


# ---------- topology stages (object mode, headless-safe) ----------
def voxel_remesh(obj, voxel_size, fix_poles=True, preserve_volume=True):
    """Blender's voxel remesh (Ctrl+R in sculpt mode). Merges intersecting parts.
    Headless it must run in Object Mode: object.voxel_remesh CRASHES Blender 5.2.1 in
    background when the object is in Sculpt Mode (probe_headless_ops.py)."""
    if bpy.app.background and obj.mode != "OBJECT":
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = obj
    me = obj.data
    me.remesh_voxel_size = voxel_size
    me.use_remesh_fix_poles = fix_poles
    me.use_remesh_preserve_volume = preserve_volume
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.voxel_remesh()
    me.shade_smooth()   # remesh output is flat-shaded: faceted banding in every render
    return len(me.vertices)


def union_remesh(objs, voxel_size, name="Blockout", relax=3):
    """Join primitive masses and voxel-remesh them into one sculptable surface.
    relax: volume-preserving smoothing passes that soften the voxel seams where the
    primitives intersect (0 to keep the raw remesh)."""
    from mathutils import Matrix
    for o in objs:
        for m in list(o.modifiers):
            with bpy.context.temp_override(object=o, active_object=o):
                bpy.ops.object.modifier_apply(modifier=m.name)
        # bake location/rotation/scale into the mesh: voxel size is measured in local
        # units, so an unapplied scale silently changes the resolution
        # (matrix_world is stale until a depsgraph update; view_layer.update() refreshes it)
        bpy.context.view_layer.update()
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    base = objs[0]
    with bpy.context.temp_override(active_object=base, selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    base.name = name
    voxel_remesh(base, voxel_size)
    drop_islands(base)      # sealed voids where 3+ primitives meet become separate shells
    if relax:
        sc = Sculptor(base, symmetry_x=False)
        sc.smooth(None, None, strength=0.5, iterations=relax, preserve_volume=True)
        sc.commit(remember_mask=False)
    return base


def ellipsoid(name, location, scale, segments=48, rings=24, collection=None):
    """UV-sphere mass scaled into an ellipsoid (the basic blockout primitive)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    ob.location, ob.scale = location, scale
    return ob


def subdivide_to(obj, target_verts):
    """Raise resolution evenly (Catmull-Clark, applied) until roughly target_verts."""
    while len(obj.data.vertices) * 4 <= target_verts * 1.5:
        m = obj.modifiers.new("bx_subd", "SUBSURF")
        m.levels = 1
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=m.name)
    return len(obj.data.vertices)


def rounded_box(name, location, scale, rotation=(0, 0, 0), levels=3, collection=None):
    """Keelan Jon's blockout primitive: a cube with Subdivision Surface level 2 (applied by
    union_remesh). Boxier than an ellipsoid: jaws, chins, square skulls, hair masses.
    The subdivided faces sit at 0.84 x scale (measured), so divide the half-size you want
    by 0.84. levels=3 by default: voxel remesh keeps any primitive facet larger than the
    voxel (a level-2 cranium showed flat patches after remesh at H/40), so primitive faces
    must be finer than the voxel size."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    ob.location, ob.scale, ob.rotation_euler = location, scale, rotation
    ob.modifiers.new("bx_subd", "SUBSURF").levels = levels
    return ob


def symmetrize(obj, direction="POSITIVE_X", threshold=1e-4):
    """Make the mesh exactly X-symmetric (Keelan Jon symmetrizes after every remesh).
    Edit-mode mesh.symmetrize, headless-safe; sculpt.symmetrize CRASHES headless.
    POSITIVE_X keeps the +X half and mirrors it onto -X (verified 5.2.1)."""
    vl = bpy.context.view_layer
    # only this object may enter Edit Mode: every other selected mesh would be
    # symmetrized too (multi-object editing); selection is restored afterwards
    selected = [o for o in vl.objects if o.select_get()]
    active = vl.objects.active
    for o in selected:
        o.select_set(False)
    obj.select_set(True)
    vl.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.symmetrize(direction=direction, threshold=threshold)
        bpy.ops.object.mode_set(mode="OBJECT")
    finally:
        obj.select_set(obj in selected)
        for o in selected:
            o.select_set(True)
        vl.objects.active = active or obj
    obj.data.shade_smooth()
    return len(obj.data.vertices)


def _co_of(obj):
    me = obj.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def mirror_error(obj):
    """Distance from each vertex mirrored in local X to the nearest vertex (max, mean)."""
    from mathutils.kdtree import KDTree
    co = _co_of(obj)
    kd = KDTree(len(co))
    for i, v in enumerate(co):
        kd.insert(v, i)
    kd.balance()
    d = np.array([kd.find((-v[0], v[1], v[2]))[2] for v in co])
    return {"max": float(d.max()), "mean": float(d.mean())}


def surface_area(obj):
    a = np.empty(len(obj.data.polygons))
    obj.data.polygons.foreach_get("area", a)
    return float(a.sum())


def voxel_for_faces(obj, target_faces):
    """Voxel size that gives about target_faces on this surface: voxel remesh output has
    faces ~ 1.5 * area / voxel^2 (measured on spheres and ellipsoids in 5.2.1, within 3%)."""
    return math.sqrt(1.5 * surface_area(obj) / target_faces)


def _labels(n, edges):
    """Connected-component label per vertex (numpy min-propagation + pointer jumping)."""
    lab = np.arange(n)
    if len(edges) == 0:
        return lab
    a, b = edges[:, 0], edges[:, 1]
    while True:
        m = np.minimum(lab[a], lab[b])
        new = lab.copy()
        np.minimum.at(new, a, m)
        np.minimum.at(new, b, m)
        new = new[new]
        while True:
            nxt = new[new]
            if np.array_equal(nxt, new):
                break
            new = nxt
        if np.array_equal(new, lab):
            return lab
        lab = new


def drop_islands(obj, keep_ratio=0.01):
    """Delete loose shells smaller than keep_ratio x the vertex count (the largest always
    stays). Voxel remesh seals tiny internal voids where 3 or more primitives meet (E2 run:
    a 7-vertex shell between nose, muzzle and alae made stage_report say 2 components).
    Called by union_remesh and remesh_stage. Returns the number of vertices removed."""
    me = obj.data
    n = len(me.vertices)
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    lab = _labels(n, e.reshape(-1, 2))
    ids, counts = np.unique(lab, return_counts=True)
    small = ids[(counts < keep_ratio * n) & (counts < counts.max())]
    if len(small) == 0:
        return 0
    kill = np.isin(lab, small)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.flatnonzero(kill)], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    me.update()
    return int(kill.sum())


def remesh_stage(obj, voxel_size, relax=2, symmetric=True, direction="POSITIVE_X",
                 clear_mask=True, keep_ratio=0.01):
    """One resolution step of the ladder: voxel remesh, drop sealed internal shells
    (drop_islands), symmetrize (remesh is not symmetric: its grid is not centred on x=0),
    then a volume-preserving relax that removes voxel jaggies (Kaspar runs the Smooth mesh
    filter after remeshing finer). clear_mask: the mask survives voxel remesh (preserve
    attributes is on by default) and would silently protect regions in the next stage.
    The report gains 'islands_dropped'."""
    voxel_remesh(obj, voxel_size)
    dropped = drop_islands(obj, keep_ratio) if keep_ratio else 0
    if symmetric:
        symmetrize(obj, direction)
    sc = Sculptor(obj, symmetry_x=False)
    if clear_mask:
        sc.clear_mask()
    if relax:
        sc.smooth(None, None, strength=0.5, iterations=relax, preserve_volume=True)
    sc.commit()
    rep = stage_report(obj, voxel_size)
    rep["islands_dropped"] = dropped
    return rep


def _components(n, edges):
    parent = np.arange(n)

    def find(i):
        root = i
        while parent[root] != root:
            root = parent[root]
        while parent[i] != root:
            parent[i], i = root, parent[i]
        return root
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    return len({find(i) for i in range(n)})


def stage_report(obj, voxel_size=None):
    """Numbers to gate a sculpt stage on: faces, height H, voxel as a fraction of H,
    connected components (1 after a union remesh), non-manifold edges, stretch
    (p95 / median edge length: above ~2.5 means remesh), X-mirror error, applied scale."""
    me = obj.data
    co = _co_of(obj)
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    e = e.reshape(-1, 2)
    L = np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1)
    le = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("edge_index", le)
    per_edge = np.bincount(le, minlength=len(me.edges))
    H = float(co[:, 2].max() - co[:, 2].min())
    m = mirror_error(obj)
    return {
        "faces": len(me.polygons), "verts": len(me.vertices), "height": round(H, 5),
        "voxel": voxel_size, "voxel_over_H": round(voxel_size / H, 5) if voxel_size else None,
        "components": int(len(np.unique(_labels(len(co), e)))), "non_manifold_edges": int((per_edge != 2).sum()),
        "stretch_p95_over_median": round(float(np.percentile(L, 95) / np.median(L)), 3),
        "mirror_max": round(m["max"], 6), "mirror_mean": round(m["mean"], 6),
        "scale_applied": all(abs(s - 1) < 1e-6 for s in obj.scale),
    }


def profile_rhythm(obj, band=None, bins=60, min_prominence=None):
    """Front profile on the midline (front = -Y): for each height bin the most forward
    point of the vertices within `band` of x=0, then the alternating extremes from chin
    up. Ryan King's check: a male head reads 'chin out, in, mouth out, in, nose out'; a
    flat face shows too few extremes. Returns [(kind, z, y), ...], kind 'out' or 'in'."""
    co = _co_of(obj)
    lo, hi = co.min(0), co.max(0)
    band = band or (hi[0] - lo[0]) * 0.02
    mid = co[np.abs(co[:, 0]) < band]
    edges = np.linspace(lo[2], hi[2], bins + 1)
    zs, ys = [], []
    for a, b in zip(edges, edges[1:]):
        sel = mid[(mid[:, 2] >= a) & (mid[:, 2] < b)]
        if len(sel):
            zs.append((a + b) / 2)
            ys.append(sel[:, 1].min())
    ys = np.array(ys)
    fwd = -ys                                    # larger = more forward
    prom = min_prominence if min_prominence is not None else (hi[2] - lo[2]) * 0.005
    out, last_kind, last_val = [], None, None
    for i in range(1, len(fwd) - 1):
        kind = "out" if fwd[i] >= fwd[i - 1] and fwd[i] > fwd[i + 1] else \
               "in" if fwd[i] <= fwd[i - 1] and fwd[i] < fwd[i + 1] else None
        if kind is None:
            continue
        if last_val is not None and abs(fwd[i] - last_val) < prom:
            continue
        if kind == last_kind:                    # keep the stronger of two same extremes
            if (kind == "out") == (fwd[i] > last_val):
                out[-1] = (kind, float(zs[i]), float(ys[i]))
                last_val = fwd[i]
            continue
        out.append((kind, float(zs[i]), float(ys[i])))
        last_kind, last_val = kind, fwd[i]
    return out


# ---------- form metrics: what the silhouette and profile_rhythm cannot see ----------
def fit_plane(points):
    """Least-squares plane: (centroid, unit normal, RMS residual)."""
    P = np.asarray(points, dtype=np.float64)
    c = P.mean(0)
    _u, s, vt = np.linalg.svd(P - c, full_matrices=False)
    return c, vt[2], float(s[2] / math.sqrt(len(P)))


def fit_sphere(points):
    """Algebraic least-squares sphere: (centre, radius, RMS of |p - c| - r)."""
    P = np.asarray(points, dtype=np.float64)
    A = np.c_[2 * P, np.ones(len(P))]
    b = (P * P).sum(1)
    sol = np.linalg.lstsq(A, b, rcond=None)[0]
    c = sol[:3]
    r = math.sqrt(max(sol[3] + c @ c, 1e-18))
    return c, r, float(np.sqrt(np.mean((np.linalg.norm(P - c, axis=1) - r) ** 2)))


def surface_samples(obj, view, center, half_u, half_v, grid=28):
    """Visible surface points of a region, the way a viewport shows it: rays along `view`
    through a grid over a rectangle (half sizes half_u, half_v) centred on `center` and
    perpendicular to the view (u = horizontal, v = up). World space. Returns (points,
    normals) of the first hits."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(obj, dg)
    mw = obj.matrix_world
    imw = mw.inverted()
    d = np.asarray(view, dtype=np.float64)
    d /= np.linalg.norm(d)
    up = np.array([0, 0, 1.0]) if abs(d[2]) < 0.95 else np.array([0, 1.0, 0])
    u = np.cross(d, up)
    u /= np.linalg.norm(u)
    v = np.cross(u, d)
    far = 10 * max(half_u, half_v) + float(max(obj.dimensions))
    dl = Vector(imw.to_3x3() @ Vector(d)).normalized()
    pts, nrs = [], []
    for a in np.linspace(-1, 1, grid):
        for b in np.linspace(-1, 1, grid):
            o = np.asarray(center) + u * a * half_u + v * b * half_v - d * far
            loc, nor, _i, _dist = tree.ray_cast(imw @ Vector(o), dl)
            if loc is not None:
                pts.append(np.array(mw @ loc))
                nrs.append(np.array((mw.to_3x3() @ nor).normalized()))
    return np.array(pts).reshape(-1, 3), np.array(nrs).reshape(-1, 3)


def curvature_radius(obj, points, scale):
    """Local radius of curvature at each point, measured at `scale`: plane fit to the mesh
    vertices within `scale`, R = scale^2 / (6.93 x RMS) (exact for a sphere sampled by
    area). Large R = locally flat; R near `scale` = an edge or a tight form."""
    from mathutils.kdtree import KDTree
    co = _real_points([obj], limit=10 ** 9)          # evaluated: shape keys and modifiers
    kd = KDTree(len(co))
    for i, p in enumerate(co):
        kd.insert(p, i)
    kd.balance()
    out = []
    for p in points:
        idx = [i for _c, i, _d in kd.find_range(Vector(p), scale)]
        if len(idx) < 6:
            out.append(np.nan)
            continue
        rms = fit_plane(co[idx])[2]
        out.append(scale * scale / (6.93 * max(rms, 1e-12)))
    return np.array(out)


def form_report(obj, points, H, scale=None, flat_R=1.0, edge_R=0.12):
    """Shading-level form check on visible surface points (from surface_samples). The E2
    with-skill head passed the silhouette sheet and profile_rhythm while its cheek, jaw and
    jowl read as ONE sphere in shading; this measures that. Returns, in units of H:
      sphere_R, sphere_rms   one sphere fitted to the whole region (rms / region size)
      plane_rms              one plane fitted to the region (rms / region size)
      R_p10, R_p50, R_p90    local radius of curvature at `scale` (default 0.06 H)
      flat_frac              share of points locally flatter than flat_R x H (planes)
      edge_frac              share tighter than edge_R x H (corners, creases, borders)
      ball                   True when the region reads as one ball: one sphere fits it
                             within 10 % of its size AND fits at least twice as well as a
                             plane. Calibrated [added] on the E2 heads: the three balloon
                             jaws (with-skill final and stage 2, v1 example) gave sphere_rms
                             0.057 to 0.082 with plane_rms 0.22 to 0.25; the baseline head,
                             whose lower face reads as several forms, gave 0.18 to 0.20 with
                             plane_rms 0.13 to 0.19 (test_planes_sdf.py)."""
    P = np.asarray(points)
    scale = scale or 0.06 * H
    size = float(np.sqrt(((P - P.mean(0)) ** 2).sum(1).mean()))
    _c, R, srms = fit_sphere(P)
    prms = fit_plane(P)[2]
    Rl = curvature_radius(obj, P, scale) / H
    Rl = Rl[np.isfinite(Rl)]
    rep = {
        "n": int(len(P)), "size_H": round(size / H, 4),
        "sphere_R": round(R / H, 3), "sphere_rms": round(srms / size, 4),
        "plane_rms": round(prms / size, 4),
        "R_p10": round(float(np.percentile(Rl, 10)), 3), "R_p50": round(float(np.percentile(Rl, 50)), 3),
        "R_p90": round(float(np.percentile(Rl, 90)), 3),
        "flat_frac": round(float((Rl > flat_R).mean()), 3), "edge_frac": round(float((Rl < edge_R).mean()), 3),
    }
    rep["ball"] = bool(rep["sphere_rms"] < 0.10 and rep["sphere_rms"] < 0.5 * rep["plane_rms"])
    return rep


def lower_face_report(obj, H, chin_z=0.0, face_y=None, grid=28, scale=None):
    """form_report on the lower face (cheek, jaw, jowl below the cheekbone) seen in profile
    (from +X) and in three-quarter (from front-left). face_y: y of the most forward chin
    point, found from the mesh when None (front = -Y). The window spans the jaw from the
    chin to just in front of the ear, 0.04 H to 0.40 H above the chin."""
    co = _co_of(obj)
    fy = face_y if face_y is not None else float(co[(co[:, 2] > chin_z) & (co[:, 2] < chin_z + 0.2 * H), 1].min())
    zc = chin_z + 0.22 * H
    out = {}
    views = {
        "profile": ((-1.0, 0.0, 0.0), np.array([0.0, fy + 0.22 * H, zc]), 0.18 * H, 0.18 * H),
        "threequarter": ((-0.64, 0.77, 0.0), np.array([0.12 * H, fy + 0.25 * H, zc]), 0.16 * H, 0.18 * H),
    }
    for name, (view, c, hu, hv) in views.items():
        P, _N = surface_samples(obj, view, c, hu, hv, grid)
        out[name] = form_report(obj, P, H, scale)
    out["ball"] = out["profile"]["ball"] or out["threequarter"]["ball"]
    return out


def long_lens_render(objs, path, lens=90, direction=(-0.7, -1.0, 0.15), res=720,
                     mode="matcap"):
    """Perspective render through a long lens, for proportion judgment: Morren 95 mm
    (BPAvvF8py1M 00:13:14), Kaspar 90 mm (uGde7HdmCa8 00:46:31), Yan 80 to 100, Naydenov
    ZBrush 85. bx_review's perspective views use 50 mm. Renders in a temporary scene (user
    settings untouched). mode: 'matcap' (clay_studio, cavity off) or 'silhouette'."""
    from mathutils import Vector
    sc = bpy.data.scenes.new("BX_LongLens")
    for o in objs:
        sc.collection.objects.link(o)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("BX_LongLens")
    sc.world = world
    sh = sc.display.shading
    if mode == "silhouette":
        sh.light, sh.color_type, sh.single_color = "FLAT", "SINGLE", (0, 0, 0)
        world.color = (1, 1, 1)
    else:
        sh.light, sh.studio_light, sh.color_type = "MATCAP", "clay_studio.exr", "SINGLE"
        sh.single_color, world.color = (0.8, 0.8, 0.8), (0.18, 0.18, 0.18)
    sh.show_cavity = False
    cam = bpy.data.objects.new("BX_LongLens", bpy.data.cameras.new("BX_LongLens"))
    sc.collection.objects.link(cam)
    cam.data.lens = lens
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    center, radius = (lo + hi) / 2, (hi - lo).length / 2
    fov = 2 * math.atan(cam.data.sensor_width / (2 * lens))
    d = Vector(direction).normalized()
    cam.location = center + d * (radius * 1.05 / math.tan(fov / 2))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.clip_start, cam.data.clip_end = radius * 0.01, (cam.location - center).length * 4
    sc.camera = cam
    sc.render.filepath = path
    try:
        bpy.ops.render.render(write_still=True, scene=sc.name)
    finally:
        cd = cam.data
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cd)
        bpy.data.scenes.remove(sc)
        bpy.data.worlds.remove(world)
    return path


def _real_points(objs, limit=30000):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != "MESH":
            continue
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)[:: max(1, len(me.vertices) // max(1, limit // len(objs)))]
        mw = np.array(eo.matrix_world)
        pts.append(co @ mw[:3, :3].T + mw[:3, 3])
        eo.to_mesh_clear()
    return np.vstack(pts)


def framing(objs, direction, lens=90, margin=1.08, sensor=36.0):
    """Camera placement that fits the REAL vertices (evaluated, modifiers included) of objs
    seen from `direction` (camera side, pointing from the subject to the camera) through a
    `lens` mm lens: bbox corners overshoot in diagonal views. Returns (target, camera
    location, px_per_unit at a 1 px wide image): multiply by the resolution for pixels per
    metre at the target depth (used to size expression moves, see SKILL.md)."""
    P = _real_points(objs)
    center = (P.min(0) + P.max(0)) / 2
    d = np.asarray(direction, dtype=np.float64)
    d /= np.linalg.norm(d)
    up = np.array([0, 0, 1.0]) if abs(d[2]) < 0.99 else np.array([0, 1.0, 0])
    right = np.cross(-d, up)
    right /= np.linalg.norm(right)
    up = np.cross(right, -d)
    tan_half = sensor / (2 * lens) / margin
    r = P - center
    toward = r @ d
    dist = float(max((np.abs(r @ right) / tan_half + toward).max(), (np.abs(r @ up) / tan_half + toward).max()))
    return center, center + d * dist, 1.0 / (2 * dist * sensor / (2 * lens))


def final_render(objs, path, direction=(-0.7, -1.0, 0.12), lens=90, res=1600, cavity=True,
                 margin=1.08, mode="matcap", color=(0.80, 0.78, 0.76), background=(0.16, 0.16, 0.17)):
    """Client-quality still: Workbench clay matcap with cavity (ridge 0.6, valley 1.0), a long
    lens (Kaspar 90 mm, Morren 95), 16x anti-aliasing, framed on real vertices, any
    resolution (long_lens_render is the 720 px review variant). Temporary scene, user
    settings untouched. mode 'flat' renders flat-shaded studio light to read planes (Kaspar
    Rain 00:05:32). direction: from the subject toward the camera; front = (0, -1, 0)."""
    sc = bpy.data.scenes.new("BX_Final")
    for o in objs:
        sc.collection.objects.link(o)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    sc.display.render_aa = "16"
    world = bpy.data.worlds.new("BX_Final")
    sc.world = world
    world.color = background
    sh = sc.display.shading
    sh.color_type, sh.single_color = "SINGLE", color
    if mode == "flat":
        sh.light, sh.studio_light = "STUDIO", "Default"
        for o in objs:
            if o.type == "MESH":
                o.data.shade_flat()
    else:
        sh.light, sh.studio_light = "MATCAP", "clay_studio.exr"
    sh.show_cavity = cavity
    if cavity:
        sh.cavity_type = "BOTH"
        sh.cavity_ridge_factor, sh.cavity_valley_factor = 0.6, 1.0
        sh.curvature_ridge_factor, sh.curvature_valley_factor = 0.5, 0.8
    cam = bpy.data.objects.new("BX_Final", bpy.data.cameras.new("BX_Final"))
    sc.collection.objects.link(cam)
    cam.data.lens, cam.data.sensor_width = lens, 36.0
    target, loc, _ppu = framing(objs, direction, lens, margin)
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    dist = float(np.linalg.norm(loc - target))
    cam.data.clip_start, cam.data.clip_end = dist * 0.01, dist * 10
    sc.camera = cam
    sc.render.filepath = path
    try:
        bpy.ops.render.render(write_still=True, scene=sc.name)
    finally:
        if mode == "flat":
            for o in objs:
                if o.type == "MESH":
                    o.data.shade_smooth()
        cd = cam.data
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cd)
        bpy.data.scenes.remove(sc)
        bpy.data.worlds.remove(world)
    return path


def write_shape_key(obj, name, co, value=1.0):
    """Store sculpted coordinates (e.g. Sculptor.co after an expression pass) in a shape key
    and leave the basis untouched: the neutral basis stays symmetric and the expression is
    the whole read of the key (Kaspar f-mx-Jfx9lA 00:09:44: expressions are shape keys on
    the base level; Thelen gC3FG8-4lsU 00:38:27: asymmetry last, on purpose). Voxel remesh
    drops shape keys, so this is the last step. Creates 'Basis' when missing."""
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    kb = obj.data.shape_keys.key_blocks
    key = kb.get(name) or obj.shape_key_add(name=name, from_mix=False)
    key.data.foreach_set("co", np.asarray(co, dtype=np.float32).ravel())
    key.value = value
    obj.data.update()
    return key


# ---------- real brushes (live GUI session): the experts' settings, not 5.2 defaults ----------
# Activation and settings work headless; the stroke itself needs bx_gui.stroke() in a GUI.
EXPERT_BRUSHES = {
    # Henning Sanden Cmi0KoFtc-4 00:07:20: default Smooth (0.7 in 5.2) "nukes the entire shape"
    "Smooth": {"strength": 0.2},
    # Henning 00:05:44: tip roundness ~0.5 (5.2 default 0.15), no radius pressure;
    # Ryan King Km9JSdWTjVY 00:03:01: Accumulate and Front Faces Only on, per brush
    "Clay Strips": {"tip_roundness": 0.5, "use_pressure_size": False, "use_frontface": True,
                    "use_accumulate": True},
    # Jim Morren BPAvvF8py1M 00:29:39: normal radius 1 turns Flatten into a polish brush
    "Flatten/Contrast": {"normal_radius_factor": 1.0},
    # Morren 00:05:16: crease with pinch reduced as a landmark pencil [0.1 is an added value]
    "Crease Polish:landmark": {"crease_pinch_factor": 0.1},
    "Crease Polish": {"crease_pinch_factor": 0.5},
    # Keelan Jon amVAlpxHp8k 00:31:34: Draw Sharp 0.65, Sharper falloff; set direction
    # explicitly (5.2 default is SUBTRACT, Thelen's brow line uses the opposite)
    "Draw Sharp": {"direction": "SUBTRACT", "strength": 0.65},
    # Kaspar FDscc66fC90 00:26:04: Grab with topology auto-masking "all the time"
    "Grab": {"mesh_automasking_settings.use_automasking_topology": True},
    # Reinhardt KURuPAVJ6hM 01:36:32: pits = Draw, Sphere falloff, spacing 300%, high jitter,
    # Subtract, radius in scene units [jitter 1.0 is an added value]; the plain "Draw" entry
    # restores spacing 10 and jitter 0 afterwards (his brush kept the pit settings: 02:37:29)
    "Draw:pits": {"curve_distance_falloff_preset": "SPHERE", "spacing": 300, "jitter": 1.0,
                  "direction": "SUBTRACT", "use_locked_size": "SCENE"},
    "Draw": {"curve_distance_falloff_preset": "SMOOTH", "spacing": 10, "jitter": 0.0,
             "direction": "ADD", "use_locked_size": "VIEW"},
}


def expert_brush(name):
    """Activate an Essentials sculpt brush and apply the experts' settings from
    EXPERT_BRUSHES ('Crease Polish:landmark' = brush 'Crease Polish' + that variant).
    The object must be in Sculpt Mode. Returns the brush."""
    base = name.split(":")[0]
    bpy.ops.brush.asset_activate(
        asset_library_type="ESSENTIALS", asset_library_identifier="",
        relative_asset_identifier=f"brushes/essentials_brushes-mesh_sculpt.blend/Brush/{base}")
    b = bpy.context.scene.tool_settings.sculpt.brush
    for key, val in EXPERT_BRUSHES.get(name, {}).items():
        target, attr = b, key
        if "." in key:
            path, attr = key.rsplit(".", 1)
            for part in path.split("."):
                target = getattr(target, part)
        setattr(target, attr, val)
    return b


def head_guides(H, brow=0.60, chin_z=0.0):
    """Landmark targets for a head of height H (chin z=chin_z to crown), front = -Y.
    Realistic canon from the source experts; stylize by moving these knowingly, never by
    stretching everything (Yan). `brow` is the one free choice: the experts give ratios,
    not an absolute brow height; 0.60 follows from equal thirds with the hairline at
    0.9 H [added assumption, check against the reference]. Returns absolute values."""
    g = {
        "crown_z": 1.0,
        "eye_z": 0.50,            # Abbitt K7AJVx0H3Ec 00:11:45; Naydenov oY9XybQRxzQ 00:03:23; Thelen gC3FG8-4lsU 00:07:22
        "brow_z": brow,
        "nose_base_z": brow / 2,  # Naydenov 00:05:49 (halfway brow to chin) = Thelen equal thirds 00:20:46
        "hairline_z": brow * 1.5,  # Thelen equal thirds 00:20:46
        "mouth_z": brow / 2 * 2 / 3,  # lip parting 1/3 down nose base to chin: Naydenov 00:09:06, Yan vB7kPWjBgQI 00:08:35
        "ear_top_z": brow,        # Naydenov 00:10:37 (brow line); Thelen, Yan: eye line; Abbitt: mid-eye
        "ear_bottom_z": brow / 2,  # nose base: Naydenov, Thelen 00:04:04, Yan 00:17:29, Abbitt 00:25:28
        "head_width": 1 / 1.5,    # height about 1.5 x width: Thelen 00:00:35
    }
    g["eye_width"] = g["head_width"] / 5          # five eyes across: Naydenov 00:07:28
    g["eye_center_x"] = g["eye_width"]           # one eye between the eyes: Naydenov, Thelen 00:17:24
    g["mouth_corner_x"] = g["eye_center_x"]      # under the eyes: Morren BPAvvF8py1M 00:35:07, Naydenov 00:08:33
    g["jaw_width_min"] = 0.9                     # x cheekbone width, male: Thelen 00:20:46
    g["canthal_tilt_deg"] = 8.0                  # outer corner higher: Thelen 00:46:10
    g["neck_tilt_deg"] = 15.0                    # neck leans forward: Thelen 00:02:20
    out = {}
    for k, v in g.items():
        if k.endswith("_z"):
            out[k] = chin_z + v * H
        elif k in ("head_width", "eye_width", "eye_center_x", "mouth_corner_x"):
            out[k] = v * H
        else:
            out[k] = v
    out["H"] = H
    return out


# ---------- smooth-blend SDF blockout (an option next to union_remesh) ----------
# Adapted from the E2 baseline run's own "digital clay" (tests/exec/E2_sculpt/baseline/
# scripts/sdf.py: smooth union/subtract of analytic distance fields, surface-projected tube
# strokes, meshed with Blender's bundled OpenVDB). Why it is here: union_remesh fuses
# primitives with a hard crease, and the smoothing that removes that crease also rounds
# every convex corner, which turned the tilted jaw box of the v1 recipe into a ball. A
# smooth union blends ONLY within `blend` of the seam and keeps planes and corners exact;
# intersecting a half-space with a small blend is a plane cut with a controlled edge radius
# (the gonial angle, a flat chin front, skull side planes). Measured in
# tests/code/blender-sculpting/test_planes_sdf.py.
def _rot(rot_deg):
    """World -> local rotation for Euler XYZ degrees (Blender's convention)."""
    rx, ry, rz = np.radians(rot_deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return (Rz @ Ry @ Rx).T


def smin(a, b, k):
    """Polynomial smooth minimum: blends two distance fields within k of their seam."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


class Prim:
    """A signed distance field (negative inside) with a bounding box for cheap evaluation."""
    def __init__(self, fn, lo, hi):
        self.fn, self.lo, self.hi = fn, np.asarray(lo, float), np.asarray(hi, float)

    def __call__(self, x, y, z):
        return self.fn(x, y, z)

    def cut(self, other, blend=0.0):
        """self minus other (a socket, a bowl, a nostril)."""
        return Prim(lambda x, y, z: smax(self.fn(x, y, z), -other.fn(x, y, z), blend), self.lo, self.hi)

    def clip(self, other, blend=0.0):
        """self intersect other: clip by sd_halfspace for a plane cut with an edge of radius ~blend."""
        return Prim(lambda x, y, z: smax(self.fn(x, y, z), other.fn(x, y, z), blend), self.lo, self.hi)

    def add(self, other, blend=0.0):
        return Prim(lambda x, y, z: smin(self.fn(x, y, z), other.fn(x, y, z), blend),
                    np.minimum(self.lo, other.lo), np.maximum(self.hi, other.hi))


def _local(x, y, z, c, R):
    dx, dy, dz = x - c[0], y - c[1], z - c[2]
    if R is None:
        return dx, dy, dz
    return (R[0, 0] * dx + R[0, 1] * dy + R[0, 2] * dz, R[1, 0] * dx + R[1, 1] * dy + R[1, 2] * dz,
            R[2, 0] * dx + R[2, 1] * dy + R[2, 2] * dz)


def sd_sphere(c, r):
    c = np.asarray(c, float)
    return Prim(lambda x, y, z: np.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2) - r, c - r, c + r)


def sd_ellipsoid(c, radii, rot=None):
    """Ellipsoid (approximate distance, exact surface). rot: Euler XYZ degrees."""
    c, rad = np.asarray(c, float), np.asarray(radii, float)
    R = _rot(rot) if rot is not None else None

    def fn(x, y, z):
        px, py, pz = _local(x, y, z, c, R)
        k0 = np.sqrt((px / rad[0]) ** 2 + (py / rad[1]) ** 2 + (pz / rad[2]) ** 2)
        k1 = np.sqrt((px / rad[0] ** 2) ** 2 + (py / rad[1] ** 2) ** 2 + (pz / rad[2] ** 2) ** 2)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
    m = rad.max() if R is not None else rad
    return Prim(fn, c - m, c + m)


def sd_round_box(c, half, rounding, rot=None):
    """Box with half-sizes `half` and edges rounded by `rounding` (a jaw block, a chin, a
    hair lock): flat faces stay flat, unlike a subdivided cube."""
    c, half = np.asarray(c, float), np.asarray(half, float)
    R = _rot(rot) if rot is not None else None

    def fn(x, y, z):
        px, py, pz = _local(x, y, z, c, R)
        qx, qy, qz = np.abs(px) - half[0] + rounding, np.abs(py) - half[1] + rounding, np.abs(pz) - half[2] + rounding
        out = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2 + np.maximum(qz, 0) ** 2)
        return out + np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0) - rounding
    m = np.linalg.norm(half) if R is not None else half
    return Prim(fn, c - m, c + m)


def sd_halfspace(point, normal):
    """Everything behind the plane (opposite the outward normal) is inside. Use with
    Prim.clip or Clay.intersect to cut a plane."""
    p = np.asarray(point, float)
    n = np.asarray(normal, float)
    n = n / np.linalg.norm(n)
    return Prim(lambda x, y, z: (x - p[0]) * n[0] + (y - p[1]) * n[1] + (z - p[2]) * n[2], [-1e3] * 3, [1e3] * 3)


def sd_cone(a, b, r1, r2):
    """Round cone (capsule with different end radii) from a (radius r1) to b (radius r2)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2

    def fn(x, y, z):
        pax, pay, paz = x - a[0], y - a[1], z - a[2]
        yy = pax * ba[0] + pay * ba[1] + paz * ba[2]
        zz = yy - l2
        vx, vy, vz = pax * l2 - ba[0] * yy, pay * l2 - ba[1] * yy, paz * l2 - ba[2] * yy
        x2 = vx * vx + vy * vy + vz * vz
        y2, z2 = yy * yy * l2, zz * zz * l2
        k = np.sign(rr) * rr * rr * x2
        d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + yy * rr) * il2 - r1
        d1 = np.sqrt(x2 + z2) * il2 - r2
        d2 = np.sqrt(x2 + y2) * il2 - r1
        return np.where(np.sign(zz) * a2 * z2 > k, d1, np.where(np.sign(yy) * a2 * y2 < k, d2, d3))
    return Prim(fn, np.minimum(a - r1, b - r2), np.maximum(a + r1, b + r2))


def sd_tube(points, radii, blend=0.0):
    """Tapered tube through a polyline (hair clump, eyebrow bar, scarf ring, neck muscle)."""
    pts = [np.asarray(p, float) for p in points]
    radii = [radii] * len(pts) if np.isscalar(radii) else list(radii)
    segs = [sd_cone(pts[i], pts[i + 1], radii[i], radii[i + 1]) for i in range(len(pts) - 1)]

    def fn(x, y, z):
        d = segs[0](x, y, z)
        for s in segs[1:]:
            d = smin(d, s(x, y, z), blend)
        return d
    return Prim(fn, np.min([s.lo for s in segs], 0), np.max([s.hi for s in segs], 0))


def sd_mirror_x(p):
    fn = p.fn
    return Prim(lambda x, y, z: fn(-x, y, z), [-p.hi[0], p.lo[1], p.lo[2]], [-p.lo[0], p.hi[1], p.hi[2]])


def bezier(p0, p1, p2, p3, n=12):
    """Points on a cubic Bezier (guide curves for tubes and strokes)."""
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(p, float) for p in (p0, p1, p2, p3))
    return list((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3)


class Clay:
    """Dense signed-distance 'clay' on a regular grid: add / sub / intersect primitives with a
    smooth blend radius, then mesh it with OpenVDB (bundled with Blender 5.2) into a closed
    quad surface ready for remesh_stage and the Sculptor brushes.

      clay = S.Clay(lo=(-.15, -.17, -.11), hi=(.15, .14, .27), voxel=H / 100)
      clay.add(S.sd_ellipsoid(c, r))                        # cranium
      jaw = S.sd_round_box(c, half, 0.02 * H).clip(S.sd_halfspace(p, n), 0.02 * H)
      clay.add(jaw, blend=0.06 * H)                         # fused only near the seam
      clay.add(S.sd_ellipsoid(...), blend=..., mirror=True) # both sides
      obj = clay.to_object("Head")

    The grid is centred on x = 0 with a node on the midline; OpenVDB's mesher still leaves
    about 0.2 voxel of mirror error, so to_object symmetrizes by default. Memory: the
    example bust bounds (0.84 x 1.32 x 1.52 H) hold about 1.7M floats at H/100, 14M at H/200."""
    def __init__(self, lo, hi, voxel, far=None):
        lo, hi = np.asarray(lo, float), np.asarray(hi, float)
        hx = max(abs(lo[0]), abs(hi[0]))
        nxh = int(math.ceil(hx / voxel))
        self.vs = voxel
        self.bmin = np.array([-nxh * voxel, lo[1], lo[2]])
        n = np.ceil((hi - self.bmin) / voxel).astype(int) + 1
        n[0] = 2 * nxh + 1
        self.shape = tuple(int(v) for v in n)
        self.far = far or max(6 * voxel, 0.08 * float(max(hi - lo)))
        self.D = np.full(self.shape, self.far, np.float32)
        self.ax = [np.float32(self.bmin[i] + np.arange(self.shape[i]) * voxel) for i in range(3)]

    def _box(self, lo, hi, margin):
        i0 = np.clip(np.floor((lo - margin - self.bmin) / self.vs).astype(int), 0, np.array(self.shape))
        i1 = np.clip(np.ceil((hi + margin - self.bmin) / self.vs).astype(int) + 1, 0, np.array(self.shape))
        sl = tuple(slice(int(i0[i]), int(i1[i])) for i in range(3))
        return sl, self.ax[0][sl[0]][:, None, None], self.ax[1][sl[1]][None, :, None], self.ax[2][sl[2]][None, None, :]

    def apply(self, prim, op="add", blend=0.0, mirror=False):
        for p in ([prim, sd_mirror_x(prim)] if mirror else [prim]):
            if op == "int":
                sl = tuple(slice(0, s) for s in self.shape)
                x, y, z = self.ax[0][:, None, None], self.ax[1][None, :, None], self.ax[2][None, None, :]
            else:
                # outside box + margin the primitive is further than far + blend: no change
                sl, x, y, z = self._box(p.lo, p.hi, 1.3 * (self.far + blend) + 4 * self.vs)
                if any(s.stop <= s.start for s in sl):
                    continue
            d = np.broadcast_to(p(x, y, z), self.D[sl].shape)
            cur = self.D[sl]
            if op == "add":
                res = smin(cur, d, blend)
            elif op == "sub":
                res = smax(cur, -d, blend)
            else:
                res = smax(cur, d, blend)
            self.D[sl] = np.clip(res, -self.far, self.far)

    def add(self, prim, blend=0.0, mirror=False):
        self.apply(prim, "add", blend, mirror)

    def sub(self, prim, blend=0.0, mirror=False):
        self.apply(prim, "sub", blend, mirror)

    def intersect(self, prim, blend=0.0, mirror=False):
        """Global intersection (a half-space cuts the whole clay: bust base, skull side planes
        with mirror=True)."""
        self.apply(prim, "int", blend, mirror)

    # surface-aware strokes (Clay Strips / Draw Sharp along a path on the current clay)
    def sample(self, P):
        f = np.clip((np.asarray(P, float) - self.bmin) / self.vs, 0, np.array(self.shape) - 1.001)
        i = np.floor(f).astype(int)
        t = f - i
        out = 0.0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1]) * (t[:, 2] if dz else 1 - t[:, 2])
                    out = out + w * self.D[i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz]
        return out

    def normal(self, P):
        e = np.eye(3) * self.vs
        n = np.stack([self.sample(P + e[i]) - self.sample(P - e[i]) for i in range(3)], 1)
        return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)

    def project(self, P, iters=8):
        """Snap points onto the current surface (where a brush cursor would land)."""
        P = np.array(P, float)
        for _ in range(iters):
            P = P - self.sample(P)[:, None] * self.normal(P)
        return P, self.normal(P)

    def stroke(self, points, radii, amount, op="add", blend=0.0, n=None, mirror=False):
        """A tube laid along `points` projected onto the surface: op 'add' rises `amount`
        above it (a Clay Strips ridge: brow, lip border), 'sub' cuts `amount` deep (a Draw
        Sharp line: mouth, lid fold). radii/amount: scalar or per point."""
        pts = np.asarray(points, float)
        n = n or max(len(pts), 12)
        seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        u = np.linspace(0, s[-1], n)
        P = np.stack([np.interp(u, s, pts[:, i]) for i in range(3)], 1)
        tt = np.linspace(0, 1, n)
        r = np.interp(tt, np.linspace(0, 1, np.size(radii)), np.atleast_1d(radii).astype(float))
        a = np.interp(tt, np.linspace(0, 1, np.size(amount)), np.atleast_1d(amount).astype(float))
        S, N = self.project(P)
        C = S - N * (r - a)[:, None] if op == "add" else S + N * (r - a)[:, None]
        self.apply(sd_tube(list(C), list(r)), op, blend, mirror)
        return S, N

    def to_object(self, name, collection=None, smooth=True, symmetric=True):
        """Mesh the zero level set (OpenVDB volume to quads), merge duplicate vertices,
        orient normals outward, symmetrize in X (POSITIVE_X). Returns the new object
        (identity transform)."""
        import openvdb as vdb
        band = 4 * self.vs
        D = np.clip(self.D, -band, band).astype(np.float32)
        g = vdb.FloatGrid(2 * band)       # background != any stored value: every voxel active,
        g.copyFromArray(D, (0, 0, 0), 0.0)  # which avoids seams at leaf boundaries (baseline run)
        pts, quads = g.convertToQuads(0.0)
        pts = np.asarray(pts, float) * self.vs + self.bmin
        quads = np.asarray(quads, np.int64)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(pts))
        me.vertices.foreach_set("co", pts.astype(np.float32).ravel())
        me.loops.add(len(quads) * 4)
        me.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
        me.polygons.add(len(quads))
        me.polygons.foreach_set("loop_start", np.arange(0, len(quads) * 4, 4, dtype=np.int32))
        me.update(calc_edges=True)
        me.validate(clean_customdata=False)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=self.vs * 0.02)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        co = _co_of(ob)
        me.calc_loop_triangles()
        t = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", t)
        t = t.reshape(-1, 3)
        vol = np.einsum("ij,ij->i", co[t[:, 0]], np.cross(co[t[:, 1]], co[t[:, 2]])).sum() / 6
        if vol < 0:
            me.flip_normals()
        me.update()
        if symmetric:
            symmetrize(ob)
        drop_islands(ob)
        if smooth:
            me.shade_smooth()
        else:
            me.shade_flat()
        return ob
