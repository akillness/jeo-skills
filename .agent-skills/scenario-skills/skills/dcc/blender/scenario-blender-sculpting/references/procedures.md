# Tested sculpting procedures (Blender 5.2.1 LTS)

Every block below ran on Blender 5.2.1 LTS on 2026-09-24. Test scripts live in
`tests/code/blender-sculpting/`:

| Script                      | What it proves                                                                                                                                                                    | Result                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `test_bx_sculpt.py`         | the original `bx_sculpt` API (brushes, crease, move, eyelids, masks, remesh ladder, gates)                                                                                        | 39/39 pass                                                |
| `test_planes_sdf.py`        | v2: plane_cut, corner_cut, planarity, drop_islands, Clay vs union_remesh, form check calibration, planes on a balloon, remesh mirror error, final_render framing, write_shape_key | 39/39 pass                                                |
| `stylized_head_blockout.py` | the complete v2 example (P1, P2, P5, P6, P11, P14 to P17)                                                                                                                         | runs in 13 s, renders reviewed                            |
| `expression_readability.py` | corner move vs pixels at two framings (P11)                                                                                                                                       | renders reviewed                                          |
| `compare/make_compare.py`   | the three E2 heads rendered identically, lower_face_report for each                                                                                                               | sheet reviewed                                            |
| `test_procedures.py`        | its checks P1 to P6: remesh guard, mask extract (P9 here), face sets (P10), asymmetry key and reprojection (P11), long lens (P8)                                                  | 6/6 pass                                                  |
| `probe_headless_ops.py`     | the headless crash list (P12), one child process per operator                                                                                                                     | re-run v2, unchanged                                      |
| `gui_brush_presets.py`      | real brushes with the experts' settings in a GUI session on the v2 stage 2 head (P13)                                                                                             | 6/6 strokes FINISHED, local, mirrored (GUI, not headless) |

Import pattern (headless or inside a live session):

```python
import sys
sys.path += ["<skills>/scenario-blender-sculpting/scripts", "<skills>/scenario-blender-expert/scripts"]
import bx_sculpt as S, bx_review
```

Conventions: front = -Y, up = +Z, character left = +X. `H` = head height (chin to crown). Every
radius, voxel, blend and height is a fraction of H.

---

## P1. Design table before geometry

```python
H = 0.24
G = S.head_guides(H, brow=0.60)   # eye_z 0.5H, nose_base_z brow/2, mouth_z 1/3 down, head_width H/1.5 ...
STYLE = {"nose_tip_r": 0.085, "brow_r": 0.05, "jaw_to_cheek": 0.95, "eye_r": 0.064,
         "lid_thick": 0.012, "neck_r": 0.205, "gonial_blend": 0.025}   # the exaggerations, written first (Yan)
CUES = ["swept hair in clumps", "neckerchief"]                          # what sells "adventurer" [added]
```

`brow=0.60` is an [added] assumption (equal thirds with the hairline at 0.9 H).

## P2. Blockout: smooth-blend Clay (default for heads)

Verified in `stylized_head_blockout.py` (`head_clay`, `cranium`, `lid`). `Clay` keeps a
signed-distance grid; `add/sub/intersect` take a `blend` (smooth union radius); a primitive clipped
by `sd_halfspace` is a plane cut whose edge radius is the clip blend. `to_object` meshes with
OpenVDB, symmetrizes (pass `symmetric=False` for asymmetric parts) and drops islands.

```python
def h(*v): return tuple(x * H for x in v)
clay = S.Clay(h(-0.42, -0.70, -0.44), h(0.42, 0.62, 1.08), voxel=H / 40)   # H/40 blockout, H/110 primary
cran = S.sd_ellipsoid(h(0, 0.07, 0.60), h(0.335, 0.43, 0.43))
for s in (1, -1):                                   # flat skull sides, front taper from above
    cran = cran.clip(S.sd_halfspace(h(0.312 * s, 0, 0), (s, 0, 0)), 0.10 * H)
    cran = cran.clip(S.sd_halfspace(h(0.25 * s, -0.22, 0), (s, -0.55, 0)), 0.12 * H)
clay.add(cran)
clay.add(S.sd_round_box(h(0, -0.215, 0.50), h(0.25, 0.085, 0.10), 0.06 * H), blend=0.09 * H)   # frontal plane round the eyes
gon, chin_b, b = (0.27, 0.03, 0.13), (0, -0.34, 0), 0.025
jaw = S.sd_round_box(h(0, -0.09, 0.17), h(0.28, 0.21, 0.13), 0.06 * H, rot=(-6, 0, 0))   # BEHIND the mouth mound
for s in (1, -1):
    g = (gon[0] * s, gon[1], gon[2])
    jaw = jaw.clip(S.sd_halfspace(h(*g), (0.92 * s, -0.36, -0.14)), b * H)   # side: tapers to the chin
    jaw = jaw.clip(S.sd_halfspace(h(*g), (0.28 * s, 0.33, -0.90)), b * H)   # jaw line rising to the gonion
jaw = jaw.clip(S.sd_halfspace(h(*chin_b), (0, 0.34, -0.94)), b * H)          # underside
jaw = jaw.clip(S.sd_halfspace(h(0, 0.05, 0.13), (0, 0.97, -0.24)), b * H)    # ramus back: gonial corner
clay.add(jaw, blend=0.15 * H)                                                 # wide: fills the cheek
clay.add(S.sd_round_box(h(0, -0.32, 0.055), h(0.115, 0.07, 0.055), 0.05 * H), blend=0.10 * H)   # square chin
clay.add(S.sd_ellipsoid(h(0, -0.31, 0.215), h(0.16, 0.125, 0.10)), blend=0.06 * H)                # mouth mound
zyg = S.sd_ellipsoid(h(0.235, -0.14, 0.415), h(0.055, 0.14, 0.05), rot=(0, 0, -23))               # ear to cheek line
zyg = zyg.clip(S.sd_halfspace(h(0.235, -0.14, 0.395), (0.30, -0.30, -0.90)), 0.02 * H)           # its lower plane
clay.add(zyg, blend=0.10 * H, mirror=True)
# brow ridges, glabella, nose cone + tip, neck cone (15 degrees forward), trapezius, ears: see the script
clay.intersect(S.sd_halfspace(h(0, 0, -0.40), (0, 0, -1)))                    # flat bust base
head = clay.to_object("Head")
```

Measured (`test_planes_sdf.py`, `t_sdf_vs_union`):

- The v1 recipe's `rounded_box` (a Catmull-Clark subdivided cube) already reads as a ball before any
  smoothing: `form_report` ball True, sphere_rms 0.027, side-face planarity 0.068, edge radius 0.25
  H. `sd_round_box` (rounding 0.03 H): not a ball, side planarity 0.000, 59 % flat, edge radius
  0.068 H; rounding 0.08 H gives 0.082 H.
- Nine volume-preserving smooth passes at voxel 0.05 on a unit sphere widened a primitive seam only
  from R 0.195 to 0.202; a Clay blend of 0.15 gives 0.46 and 0.3 gives 0.99. Smoothing is not how
  seams fuse; the blend is.
- Iterations that failed on the way (logged in the script): a jaw block with its flat front ahead of
  the mouth read as a mask; a tall block left a panel edge across the cheek; a low block with a
  small blend left a hollow band under the cheekbone (fixed with a 0.15 H blend and the frontal
  box); a box cheekbone read as a bar (an ellipsoid along the ear-to-cheek line works).

Option, primitives + voxel remesh (the v1 path): `S.union_remesh(parts, H / 40, relax=3)`,
`S.symmetrize`, big `grab` moves. Use it where round forms are intended (creatures, cute
characters); never `rounded_box` for a jaw. Run `lower_face_report` at the gate.

## P3. Resolution ladder

```python
rep = S.remesh_stage(head, H / 150, relax=2)  # remesh + drop_islands + symmetrize + Taubin relax + clear mask
v = S.voxel_for_faces(head, 30000)            # faces ~ 1.5 * area / voxel^2 (within 3 % on ellipsoids)
```

Example bust with neck: H/40 8.2k, H/110 64k, H/150 103k faces. `remesh_stage` reports
`islands_dropped`: voxel remesh can leave a sealed shell (E2 run: 7 vertices between nose, muzzle
and alae); `drop_islands` deletes loose parts under 1 % of the vertices. Raw voxel remesh mirror
error (nearest vertex after mirroring): max 0.67 to 0.75 voxel, mean 0.05 to 0.07 voxel
(`t_mirror_error`); symmetrize after every remesh. The global relax after a finer remesh is Kaspar's
Smooth filter (FDscc66fC90 00:11:55), headless as Taubin passes (`sculpt.mesh_filter` crashes
headless). Heavy smoothing belongs before an up-res (Abbitt): the same smooth removed 34 % of a bump
at voxel 0.08, 3 % at 0.02.

## P4. Place strokes like a viewport (view rays, not nearest)

```python
FRONT, SIDE, BELOW = (0, 1, 0), (-1, 0, 0), (0, 0, 1)
front = lambda sc, x, z: sc.on_surface(h(x, -1.0, z), FRONT)   # the ray passes through the point
below = lambda sc, x, y: sc.on_surface(h(x, y, -1.0), BELOW)
sc.crease_line(points_in_front_of_face, r, d, project=FRONT)
```

From a point in front of the mouth the nearest surface is the nose tip. A front-projected crease
across a surface seen at a grazing angle (the side of the mouth mound) cut parallel cracks in the v2
example: crease only where the surface faces the projection, or not at all.

## P5. Primary landmarks: sockets, thin lids, wings, ears

```python
er, c = STYLE["eye_r"] * H, np.array(h(0.140, -0.285, 0.50))
clay.sub(S.sd_sphere(tuple(c), er * 1.1), blend=0.03 * H, mirror=True)      # socket SMALLER than the lid shell
clay.add(lid(c, er, up=True), blend=0.012 * H, mirror=True)                 # shell cap: sphere(r + t) cut by the
clay.add(lid(c, er, up=False), blend=0.012 * H, mirror=True)                # margin plane, kept in front of c
clay.add(S.sd_sphere(h(0.066, -0.425, 0.31), 0.038 * H), blend=0.05 * H, mirror=True)   # nose wings, tucked
ear = S.sd_ellipsoid(h(0.305, 0.075, 0.45), h(0.04, 0.085, 0.145), rot=(-14, 14, 6))
clay.add(ear.cut(S.sd_ellipsoid(h(0.335, 0.07, 0.455), h(0.03, 0.058, 0.105), rot=(-14, 14, 6)), 0.01 * H), blend=0.02 * H, mirror=True)
```

`lid()`: upper margin 21 degrees above the eye center, lower 26 below, rolled 8 degrees (outer
corner up, Thelen 00:46:10), thickness 0.012 H, back clip at the eye center plane. Measured
failures: margin 14 degrees read sleepy; a socket 1.2 x the eyeball left a ring groove that read as
eye bags; a back clip behind the center let the two margin planes meet behind the eye (at y = +0.061
r) and seal a pocket (3 components).

On a union_remesh blockout the alternative is the eyelid mass + `sc.open_eyelids(c, er, ...)`
(Thelen's method, restate after every remesh); it gives thicker lids.

## P6. Secondary lines, restated after every remesh

```python
S.remesh_stage(head, H / 150, relax=2)
sc = S.Sculptor(head, symmetry_x=True, front_faces_only=True)
mz = G["mouth_z"] / H
sc.crease_line([h(0, -1, mz), h(0.05, -1, mz + .002), h(0.10, -1, mz + .006), h(0.135, -1, mz + .012)],
               0.026 * H, 0.010 * H, pinch=0.5, project=FRONT)                       # mouth, neutral
sc.crease_line([h(0, -1, mz + .035), h(0.06, -1, mz + .032), h(0.115, -1, mz + .02)],
               0.02 * H, -0.003 * H, pinch=0.6, project=FRONT)                      # upper lip border ridge
sc.crease_line([h(0, -1, 0.12), h(0.05, -1, 0.123), h(0.09, -1, 0.133)],
               0.036 * H, 0.013 * H, pinch=0.3, project=FRONT)                      # under-lip: the chin-in beat
sc.dab("draw", sc.on_surface(h(0.045, -0.50, -1), BELOW), 0.022 * H, strength=-1.0, height=-0.009 * H)   # nostrils
sc.commit()
```

Removed from the example after review: a lid-fold crease on top of the socket rim (doubled into
bags), a chin cleft (read as a scratch), a front-projected nasolabial (cracks), Draw Sharp lines on
the hair snapped with `nearest` (jagged). `crease_line`: depth > 0 groove, depth < 0 pinched ridge;
pinch 0 = Draw Sharp, 0.5 = Crease Polish, 0.8 = Crease Sharp; 3 to 4 vertices across the radius.

## P7. Gate numbers for a stage

```python
rep = S.stage_report(head, voxel)      # faces, voxel_over_H, components, non_manifold_edges, stretch, mirror_max
lf = S.lower_face_report(head, H)      # {'profile': {...}, 'threequarter': {...}, 'ball': bool}
rh = S.profile_rhythm(head)            # [('out', z, y), ('in', ...)]
```

v2 example stage 3: 102,992 faces, voxel 0.0047 H, 1 component, 0 non-manifold, stretch 1.14, mirror
1e-5; lower face sphere_rms 0.259 / 0.235, not a ball; rhythm chin out 0.065 H, in 0.112 H, nose out
0.327 H. The lip and nose-base beats are hidden in profile by a nose that hangs to the nose-base
line (the midline profile at z 0.24 H is the nose, y -0.56 H); the under-lip crease had to reach
0.013 H before the chin-in beat passed the 0.007 H filter.

## P8. Review and client renders

```python
bx_review.review([head, eyes], out, views=("front", "right", "threequarter", "low", "top"), modes=("silhouette", "matcap"))
S.long_lens_render([head, eyes], out + "/lens90.png", lens=90)                         # 720 px review
S.final_render(objs, out + "/final_tq.png", direction=(-0.75, -1.0, 0.12), lens=90, res=1600)   # cavity, AA 16
S.final_render(objs, out + "/planes.png", mode="flat", cavity=False)                    # flat shading reads planes (Kaspar f-mx-Jfx9lA 00:05:32)
target, cam_loc, ppu = S.framing(objs, (0, -1, 0), lens=90, margin=1.08)                 # ppu * res = px per meter
```

`final_render` frames on real evaluated vertices (the sphere test measured 778 px against 791
predicted by `framing`, 1.6 %), uses a temporary scene and leaves nothing behind. The gate is the
long-lens perspective view (85 to 95 mm, Morren, Kaspar, Naydenov, Yan); bx_review's ortho views
serve the silhouette.

## P9. Mask extract headless (beard, cloth, brows)

Verified: `test_procedures.py` P2.

```python
sc = S.Sculptor(body, symmetry_x=False)
sc.mask_by(lambda co: (co[:, 2] > -0.3) & (co[:, 2] < 0.5)); sc.blur_mask(2); sc.commit()
bpy.ops.object.mode_set(mode="SCULPT")
bpy.ops.sculpt.paint_mask_extract(mask_threshold=0.5, add_boundary_loop=True, smooth_iterations=4,
                                  apply_shrinkwrap=True, add_solidify=True)   # new object with Solidify
bpy.ops.object.mode_set(mode="OBJECT")
```

Apply the Solidify before any remesh (Naydenov ep01 00:46:29); never voxel-remesh an open thin
sheet, subdivide it (Keelan Jon 01:23:40).

## P10. Face sets without sculpt operators

Verified: `test_procedures.py` P3 (`sculpt.face_sets_init` CRASHES headless, P12). Flood-fill faces
with bmesh (stop at `edge.seam` for seam-bounded sets), then:

```python
me.attributes.new(".sculpt_face_set", "INT", "FACE").data.foreach_set("value", ids)
```

The attribute survives voxel remesh with preserve attributes on (distiller,
`archive/tests/sculpt_studio_anatomy/probe5.py`).

## P11. Expression on a shape key (neutral basis), readable size, and the hand-off reprojection

Verified: `stylized_head_blockout.py` stage 4, `expression_readability.py`, `test_planes_sdf.py`
(`t_shape_key`), `test_procedures.py` P4 and P5.

```python
sc = S.Sculptor(head, symmetry_x=False)                              # symmetry OFF for this pass
corner = sc.on_surface(h(0.135, -1, 0.212), FRONT)
sc.move_feature(corner, 0.07 * H, translate=h(0.006, 0.012, 0.028))   # up, back, out: 0.031 H
sc.move_feature(sc.on_surface(h(0.16, -1, 0.31), FRONT), 0.07 * H, translate=h(0.004, -0.004, 0.018))   # cheek bunches
sc.move_feature(sc.on_surface(h(0.15, -1, 0.44), FRONT), 0.035 * H, translate=h(0, -0.002, 0.010))     # lower lid squint
sc.move_feature(sc.on_surface(h(-0.16, -1, 0.64), FRONT), 0.07 * H, translate=h(0, 0, 0.016))          # other brow up
key = S.write_shape_key(head, "Smirk", sc.co)                       # basis untouched, mirror 1e-5
```

Readability, measured on the v2 head (mouth 65 mm wide, H 240 mm) through a 90 mm lens with the
camera on the smirk side: bust filling a 1080 px frame = 2.83 px per mm, bust 270 px tall (a
waist-up shot) = 0.75 px per mm. Judged on native-resolution crops: 1 mm (3 px close) invisible, 2
mm a hint, 4 mm a slight upturn, 8 mm a clear smirk at both framings (25 px close, 6.5 px medium).
Rule [added]: move a corner about 1/8 of the mouth width (0.03 H) for a smirk that reads, and check
the pixels with `framing` at the delivery framing. Kaspar builds expressions on the base level with
Grab and Smooth, adds asymmetry to each, and reads the set for proportion errors (f-mx-Jfx9lA
00:09:44 to 00:11:22); Reinhardt switches Grab to Sharp falloff for a crisp smile corner
(KURuPAVJ6hM 01:25:31).

Reprojection onto clean quads (Kaspar Rain f-mx-Jfx9lA 00:09:44, Naydenov ep20 00:34:16):

```python
bpy.ops.object.quadriflow_remesh(target_faces=3000)          # on a duplicate of the sculpt
low.modifiers.new("Multires", "MULTIRES")
for _ in range(2): bpy.ops.object.multires_subdivide(modifier="Multires", mode="CATMULL_CLARK")
sw = low.modifiers.new("Shrinkwrap", "SHRINKWRAP")
sw.target, sw.wrap_method = sculpt, "PROJECT"
sw.use_negative_direction = sw.use_positive_direction = True
bpy.ops.object.modifier_apply(modifier="Shrinkwrap")
```

Multires belongs on a settled clean base like this one, never as a blockout tool (Henning
Cmi0KoFtc-4 00:16:04). Production retopology: scenario-blender-retopology.

## P12. Headless operator matrix (Blender 5.2.1, `probe_headless_ops.py`)

| Operator                                                                                                                                     | `--background` result                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `sculpt.symmetrize`, `sculpt.mesh_filter`, `paint.mask_flood_fill`, `sculpt.mask_filter`, `sculpt.face_sets_create`, `sculpt.face_sets_init` | CRASH (segfault, exit -11)                              |
| `object.voxel_remesh` while the object is in Sculpt Mode                                                                                     | CRASH (works in Object Mode; `S.voxel_remesh` switches) |
| `sculpt.brush_stroke`, `sculpt.set_pivot_position`, `sculpt.detail_flood_fill`                                                               | poll fails (needs a 3D view)                            |
| `sculpt.dynamic_topology_toggle`                                                                                                             | works, but dyntopo only refines under strokes           |
| `sculpt.paint_mask_extract`, `brush.asset_activate`, `mesh.symmetrize` (Edit Mode), `object.quadriflow_remesh`, multires ops                 | work                                                    |

Substitutes: `S.symmetrize` for symmetrize, `Sculptor.smooth` / Smooth modifier for mesh filters,
`.sculpt_mask` writes plus `blur_mask` / `grow_mask` / `invert_mask` for the mask pie,
`move_feature` for Set Pivot + Move/Scale.

## P13. Real brushes in a live GUI session (bx_gui + the experts' settings)

Verified in a GUI Blender 5.2.1 window: `gui_brush_presets.py` (Clay Strips, Crease Polish landmark,
Draw Sharp, Flatten/Contrast, Smooth, Grab: all FINISHED, 255 to 800 vertices moved per stroke,
mirrored in X).

```python
import bx_gui as G
sc = S.Sculptor(head, symmetry_x=False)                       # Object Mode: compute stroke points
pts = [tuple(sc.on_surface(h(x, -1, z), FRONT)) for x, z in ((0.20, 0.40), (0.24, 0.36), (0.26, 0.31))]
G.set_view("FRONT", frame=head)                               # frames from any mode (see below)
bpy.ops.object.mode_set(mode="SCULPT")
head.data.use_mirror_x = True
G.set_view("FRONT")                                           # axis only, keeps the framing
S.expert_brush("Clay Strips")                                 # tip roundness 0.5, frontface, accumulate
G.stroke("SCULPT", pts, size=50, strength=0.5)
```

v2 re-run (2026-09-24, GUI window): Clay Strips, Crease Polish landmark, Draw Sharp,
Flatten/Contrast, Smooth, Grab all FINISHED on the Clay head, 310 to 1,106 vertices moved each,
largest move 0.021 H, mirrored; the Grab points moved to x 0.16 H because the tapered v2 jaw is no
longer under x 0.28 H from the front. Trap found on 2026-09-24: `view3d.view_selected` does not
frame the object in Sculpt Mode. `set_view(frame=obj)` issued there left `view_distance` at 18.4 m,
and a 30 px Crease stroke then covered the whole 0.24 m head and flattened it by 0.17 m in depth,
invisible from the front. Fixed in `bx_gui` the same day: set_view() now frames in Object Mode with
Smooth View off, forces a redraw and restores the mode; stroke() raycasts each point onto the mesh
and passes OBJECT-space locations (the exec path reads `location` in object space: world coordinates
on an object away from the origin moved nothing). Verified in a GUI session for Draw, Clay Strips,
Crease Polish, Inflate/Deflate, Flatten/Contrast, Smooth. Still check `region_3d.view_distance` is a
few head heights before stroking.

`S.expert_brush` names: `Smooth` (0.2), `Clay Strips`, `Flatten/Contrast` (normal radius 1.0),
`Crease Polish`, `Crease Polish:landmark` (pinch 0.1), `Draw Sharp` (direction explicit, 0.65),
`Grab` (topology auto-masking), `Draw:pits`, `Draw` (restores pit settings). Dyntopo in a GUI: use
`tool_settings.sculpt.detail_type_method = 'CONSTANT'` for density that does not depend on zoom
[added, not run].

## P14. Explicit planes on a mesh: plane_cut, corner_cut, planarity

Verified: `test_planes_sdf.py` (`t_plane_cut`, `t_corner_cut`, `t_planes_on_balloon`).

```python
sc = S.Sculptor(head, symmetry_x=True)
gon = np.array(h(0.27, 0.03, 0.13))
sc.plane_cut(center, normal, radius, plane_point=gon, hardness=0.6)      # everything above the plane onto it
sc.corner_cut([(gon, (0.92, -0.36, -0.14)), (gon, (0.28, 0.33, -0.90)),
               (np.array(h(0, 0.05, 0.13)), (0, 0.97, -0.24))], gon, radius=0.12 * H)   # gonial corner
flat, normal, n = sc.planarity(point, 0.05 * H)                            # rms / radius, 0 = flat
```

On a unit sphere: planarity 0.034 before (theory r / 6.9 R = 0.036), 0.005 after a full-strength
flatten or scrape dab, 0.000 after `plane_cut`, the core exactly on the stated plane, the soft
border 0.0026 proud; `corner_cut` gives two faces at 90.0 degrees and reaches the stated corner
within 0.01 (0.14 before). `front=True` kept a neck under a jaw underside still (0.000 moved, 0.46
without).

Where it helps: restating planes after a remesh on a form whose mass is right, flat chin fronts,
bust bases, carved stone facets. Where it fails: on the v1 balloon jaw, moving the mass, cutting the
gonial corner and softening flipped `lower_face_report` (sphere_rms 0.057 to 0.115) but the render
showed a gem facet with a rim, not a jaw (`planes_sdf_out/planes_on_balloon_*.png`). Rebuild the jaw
block (P2). Keep the region radius larger than the plane's intersection with the form: a
partial-weight border stands proud as a lip.

## P15. Shading-level form check

Verified: `test_planes_sdf.py` (`t_form_report`), calibration on the E2 heads.

```python
lf = S.lower_face_report(head, H, chin_z=0.0)     # rays from the side and three-quarter over the lower face
P, N = S.surface_samples(obj, view, center, half_u, half_v)    # any region, as a viewport shows it
rep = S.form_report(obj, P, H)                    # sphere_R, sphere_rms, plane_rms, R_p10/50/90, flat_frac, edge_frac, ball
```

`ball` = one sphere fits within 10 % of the region size AND fits at least twice as well as a plane.
Calibration: E2 with-skill final 0.082 / 0.073, its stage 2 0.070 / 0.064, v1 example stage 3 0.057
/ 0.065 (all balls, plane_rms 0.22 to 0.25); E2 baseline 0.180 / 0.197 (not a ball); v2 example
0.255 / 0.231. `flat_frac` did not separate the heads (baseline 0.0): what makes a lower face read
is several forms, not flatness.

## P16. Stylized hair as clumps (separate object)

Verified in `stylized_head_blockout.py` (`hair_clay`).

```python
clay = S.Clay(h(-0.40, -0.52, 0.30), h(0.40, 0.58, 1.18), H / 110)
cran = cranium()                                  # the same skull field as the head: hair follows the skull (Yan)
mass = S.Prim(lambda x, y, z: cran(x, y, z) - H * (0.008 + 0.012 * np.clip((z / H - 0.62) / 0.36, 0, 1)),
              np.array(h(-0.40, -0.52, 0.30)), np.array(h(0.40, 0.58, 1.18)))
mass = mass.clip(S.sd_halfspace(h(0, -0.31, 0.765), (0, -0.50, -0.87)), 0.04 * H)   # hairline
clay.add(mass)
for pts in clumps:                                # (azimuth, elevation, radius, rise) from the hairline back
    guide = [scalp(a, e, 0.02) for a, e, r, k in pts]
    clay.stroke(guide, [r * H for a, e, r, k in pts], [k * r * H for a, e, r, k in pts], op="add", blend=0.015 * H, n=32)
hair = clay.to_object("Hair", symmetric=False)
```

One quiff swept to one side owns the front, three clumps behind it (Yan: three is the magic number,
keep hair off the eyes and forehead, vB7kPWjBgQI 01:08:06, 01:10:27; Keelan Jon: a slicked-back mass
with ridges, amVAlpxHp8k 00:50:44). Failures on the way: a uniform offset read as a helmet; tubes on
a thick cap as a beanie with worms; clumps starting behind the hairline left a bare headband; temple
cuts left horn points; symmetrizing the swept hair made a centered flame with a seam.

## P17. Costume cue

A neckerchief from `sd_tube` rings round the neck, a knot ellipsoid and a clipped flap (`scarf_clay`
in the example). Keep it above the bust cut: the first flap sat below `z = -0.40 H` and was cut
away.

## Brush table (5.2 assets and their headless equivalents)

| Brush                              | Surface effect                             | Headless                                      | Expert use                                                 |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------- |
| Grab                               | translates the caught region               | `grab`, `move_feature`                        | all blockout; Sharp falloff for a smile corner (Reinhardt) |
| Draw / Draw Sharp                  | offset along the area normal; Sharp = POW4 | `dab("draw")`, `crease_line(pinch=0)`         | plane borders and lines (Thelen, Kaspar)                   |
| Clay Strips / Clay                 | raise toward a plane above the surface     | `dab("clay")`, `Clay.stroke`                  | masses; Ctrl on the jaw side (Ryan King)                   |
| Crease Polish / Sharp              | V groove plus pinch; Ctrl = ridge          | `crease_line(depth, pinch)`                   | lids, lips, ear rims                                       |
| Flatten, Scrape, Fill (Plane type) | toward the area plane                      | `dab(...)`; stated plane: `plane_cut`         | Scrape for clean planes (Reinhardt 00:40:53)               |
| Trim, Line Project                 | cut to a drawn plane                       | `plane_cut`, `line_project`, `Clay.intersect` | chin and eye recesses, flat ear sides, bust base           |
| Inflate, Pinch                     | along own normal; toward center            | `dab("inflate" / "pinch")`                    | cheeks; tighten edges                                      |
| Smooth                             | Laplacian relax                            | `smooth(preserve_volume=True)`                | 0.2, one form at a time                                    |
| Mask + Move/Scale                  | rigid move about a pivot                   | `paint_mask`, `move_feature`                  | proportion fixes (Morren)                                  |
