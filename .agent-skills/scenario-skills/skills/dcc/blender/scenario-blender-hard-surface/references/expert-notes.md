# Expert notes: hard surface

Distilled from nine videos (notes in `notes/hard-surface/`, digest `_digest_hard_surface.md`).
Timestamps are `[hh:mm:ss]` in the named video. Items marked [verified] were re-run in Blender 5.2.1
for this skill (tests in `tests/code/blender-hard-surface/`); [added] marks conclusions that are
this skill's, not an expert's.

## The two schools and when each wins

**School A: n-gons + booleans + bevel modifier + custom normals** (Gambrell, Ryuu, du Mont; Augusto
for game low poly). Flat faces may be n-gons; edges come from Bevel modifiers; shading from Harden
Normals and Weighted Normal. **School B: quad cage + Subdivision Surface + support loops or
creases** (rileyb3d, PzThree, Lampel, the quad half of Gambrell's comparison). Edge tightness comes
from loop proximity; the cage is the design.

| Condition                                                                     | Winner                                 | Evidence                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mostly planar machined parts, many cuts, late design changes                  | A                                      | same part in about a quarter of the time, cutters stay movable (Gambrell `svS9V2iAesA` [00:18:01], [00:18:33])                                                                        |
| Game mid-poly without a bake, engine triangulates anyway                      | A                                      | triangulate, Weighted Normal (Gambrell [00:19:36], [00:21:48])                                                                                                                        |
| Continuous curvature, soft transitions (bottles, handles, organic-mechanical) | B                                      | subD bottle in under 15 minutes (rileyb3d `EYtYCIGSSDc` [00:15:07])                                                                                                                   |
| Non-uniform roundness along one edge                                          | B                                      | the one advantage Gambrell concedes (`svS9V2iAesA` [00:20:41])                                                                                                                        |
| Part will be sculpted or needs a high poly to bake                            | B                                      | apply-one-level then multires (PzThree `iNYJ3wVeysg` [00:26:28]); subD high baked to low (rileyb3d [00:32:54])                                                                        |
| Booleans on curved surfaces                                                   | B, or A with a normal fix              | beveled n-gons on curvature cannot shade (Gambrell `qB1eg3ef5vs` [00:02:12]); in 5.2.1 Harden + WN already shaded cylinder cuts cleanly, `transfer_normals` fixed a sphere [verified] |
| Quad-only pipeline or portfolio review                                        | B                                      | (Gambrell [00:24:35])                                                                                                                                                                 |
| Tiny or distant details on a subD model                                       | neither: a plain bevel, no subdivision | (Lampel `R9g7Fmrc900` [00:06:45])                                                                                                                                                     |

Hybrids are normal: booleans inside a subD workflow followed by retopology into quads (Gambrell
[00:10:24]); a Bevel modifier before Subdivision as editable support loops (Lampel [00:07:32]);
Subdivision level 1 with full creases to round a coarse cylinder inside a bevel-modifier model (du
Mont [00:52:18]).

Cost measured on the test parts [added, verified]: rounded case 1,984 tris (A) vs 4,032 + 576 grip
(B, level 2); barrel 7,308 (A, render stack) vs 25,728 (B, level 2) vs 3,716 (A game copy).

## Louis du Mont (CG Boost, Frogbot course, 2026, Blender 5.x)

- Everything that shapes edges stays a modifier until the end; destructive bevels only on cutters
  [00:11:52], [00:18:40].
- **Two bevels:** weight-limited design bevel, 8 then 12 segments, strong weights on silhouette
  edges [00:12:25] to [00:14:07]; angle-limited micro bevel about 3 mm, 6 segments, Harden Normals
  "so we don't have bulging" [00:14:40], [00:15:15].
- Micro bevel after every boolean, pinned last [00:19:46], [00:25:51]. In 5.2 pin bottom-up
  [verified].
- **Bevel narrower after a boolean** = Clamp Overlap hiding thin polygons from a cutter edge near a
  target edge; fix A move the cutter far away [00:21:25], fix B make it effectively coincident
  [00:21:58]. Blender's own support edges can also make thin polygons: loop cut on the target
  through the middle of the boolean region, between existing vertices [00:30:20], [00:30:55]. In
  5.2.1 the EXACT solver produced no such slivers on any setup tried, and a support cut through a
  round cut halved its rim edges and made clamping worse (0 to 1.16) [verified]; keep it for cases
  where `sliver_report` shows boolean-made thin faces.
- Cutters must pass fully through; caps well past the surface [00:23:04], [00:29:09]; dissolve loops
  the cutter does not need [00:24:10]; move cutters so they live only in the Cutters collection
  [00:34:32].
- Apply scale before any bevel, and again after any object-mode scaling [00:05:28], [00:43:38];
  apply rotation before Array on surface-aligned objects [00:32:03].
- Small parts: 1 mm bevel, 2 segments, Harden Normals [00:46:23]; collar 0.1 mm [00:41:22];
  cyclorama 32 segments [01:58:34].
- Hide perfect intersections behind a collar [00:39:36]. Extrude Manifold for inward extrusions
  [00:54:28]. Coarse cylinder: full creases on cap edges + Subdivision level 1 [00:52:18].
- Rig prep: duplicate the collection, Convert to Mesh on the copies (keeps custom normals)
  [01:07:29] [verified via `collapse`].
- Watches bevel width on both sides of every cut; wire overlay and cutters as wire to see proximity
  [00:20:52], [00:29:45].

## Josh Gambrell (Blender Bros)

**Complete beginners guide (`1qVbGr_ie30`, 2021):**

- Real objects have no perfectly sharp edges; a tiny bevel on nearly every piece makes it read real
  [00:16:31].
- Bevel modifier: 3 segments "unless I'm making game assets", Harden Normals, tiny width, Miter
  Outer Arc [00:17:20], [00:18:28].
- Order: booleans first, bevel after; "if something's not working put your bevel at the bottom"
  [00:20:11], [00:20:44].
- Clamp Overlap is "a diagnosing" tool [00:26:00]. His fix "switch Exact to Fast, 99% of cases"
  [00:26:33] is outdated: Float breaks on coplanar faces in 5.2.1 [verified].
- Mirror the cutter, not the target, with its origin at world center [00:14:53], [00:15:27]. Union
  instead of Join so two pieces share a bevel [00:18:57]. Smooth-shade the cutter [00:25:26]. Make a
  slice single user before applying [00:31:51].
- Every detail placed for visual balance, never random [00:34:15].

**N-gons vs quads (`svS9V2iAesA`, 2021):**

- Same part both ways: n-gon school about a quarter of the time, editable, lower poly [00:18:01],
  [00:19:06].
- Harden Normals "still fighting" on the boolean model: Weighted Normal cleans it [00:02:42].
- Shading is about managing topology, not quads: the quad version shaded arguably worse [00:13:41],
  [00:25:08].
- Games: everything is triangulated anyway; triangulate, Weighted Normal, check the bake [00:19:36],
  [00:21:48]. Learn quads anyway [00:22:22].
- Debug subD shading by turning subdivision off (interior faces, bad routing) [00:14:44]; pinching
  from a stretched pole [00:13:41].

**Why your shading is broken (`qB1eg3ef5vs`, 2022):**

- If WN or Harden Normals changes nothing, "99% of the time" the face is not flat: scale it flat
  [00:01:06].
- A boolean ending on a curved surface leaves beveled n-gons that cannot shade; end it on a flat
  area, or Data Transfer custom normals (Face Corner, Projected Face Interpolated) from a clean
  duplicate scoped by a vertex group [00:02:12] to [00:05:29]. In 5.2.1 the vertex-group scope fails
  (EXACT gives cutter-made vertices the target's weights) and a distance scope works [verified].
- Mirror + boolean butterfly: bevel Face Strength Affected + WN Face Influence, weight 100
  [00:06:57].
- Inspect in MatCap, orbit, switch matcaps [00:00:33], [00:06:22].

## Ryuu (Blender Bros, no paid add-ons, 2022)

- Cutter slightly larger than the target so faces never coincide (Z-fighting) [00:05:09]; cutter
  edge bevels "10 is more than enough" [00:05:42]; auto-smooth the cutter before cutting [00:10:42].
- Even bevel segments on prototypes so a game version can drop every second loop [00:10:09]
  [verified: 4 to 2 segments, 7,266 to 4,166 tris on the panel].
- **Exact drops the object when the geometry is broken**; switch the solver only to see what is
  broken, then repair (apply, fill holes) [00:15:13] to [00:16:49]. Verified: an open cutter gives
  EXACT 19 non-manifold edges and MANIFOLD silently skips the cut.
- When fixing bevel overlaps, move the vertices that do not support the curvature, never the support
  edges [00:19:01]; clamping can leave doubles: merge [00:20:39].
- Red Face Orientation means shading and baking problems [00:21:11].
- Default bevel width 0.1 m is far too big [00:22:15]. "Weighted normal should be always at the
  bottom" [00:26:26]; a late Mirror goes above it [00:28:37].
- Set cylinder vertex count at creation (40 for screw holes) [00:29:43]; big rolling curve 46 to 50
  segments [00:12:53]; weld fillet about 10 [00:32:31].
- Clusters of detail vs calm areas for text and serials [00:28:37]; chamfers create planar shifts
  that catch light [00:33:05].

## Pedro Augusto (BCON23, hard surface for games, 2023)

- No high poly: bake Blender's Bevel shader node for edge rounding, paint a 32-bit float height for
  panel lines and rivets, merge into one normal map [00:18:03], [00:19:07], [00:21:22].
- Booleans, then Decimate, then cleanup gives a usable low poly "if my smooth group is already okay"
  [00:11:21] (on a boolean n-gon mesh a planar dissolve saved little, 1,268 to 1,260 tris
  [verified]).
- Budget 15k tris, one 2K map, animated or breakable parts separate [00:11:48], [00:12:57]; delete
  loops that do not change the silhouette [00:14:12]; UV space weighted toward what the gameplay
  camera sees [00:14:45].
- Only trust blueprints with section legends; model sections at their stations and bridge
  [00:07:37], [00:08:11].
- Speed is a deliverable: 8 to 10 days per aircraft engine-ready [00:03:10].

## rileyb3d (Mastering subD, 2025)

- Primary, secondary, tertiary forms in order [00:01:01]. Circles start at 18 vertices; add a
  separate 36-vertex object where detail needs more [00:01:34], [00:13:20].
- As few control points as possible: the Subdivision modifier does the heavy lifting [00:04:20].
- Pinching comes from loops too tight: space and align them, judge in a shiny, rotated matcap
  [00:06:00], [00:08:52]. Brace both sides of a ridge equally [00:11:08].
- UV Smooth All removes stretch on a sparse cage [00:19:34]; apply scale and rotation before
  unwrapping [00:19:34].
- Low poly = duplicate, lower levels (0 small parts, 1 body), apply, dissolve everything that does
  not shape the silhouette, bake the rest [00:32:54] to [00:34:31]; bake 3K export 2K, OpenGL
  normals (DirectX for Unreal) [00:37:16].

## PzThree (subD to multires, 2022)

- Build as resolutions: coarse cage, apply one level, next frequency of detail, repeat; save a
  numbered collection per pass [00:05:54], [00:11:28] [verified: apply one level headless].
- Square quads, never long rectangles: the grid becomes the panel layout and the sculpt surface
  [00:03:15], [00:09:12].
- Postpone sharpness until the resolution supports it [00:04:19], [00:30:16]. Avoid early insets:
  they kill flow [00:05:23].
- Delete faces on the mirror plane before applying subdivision [00:12:00]. Simple then Catmull-Clark
  subdivision for squarer rounding [00:03:48].
- The volume-holding level is the game mesh; multires detail bakes back to it [00:25:55],
  [00:26:28]. Outset a border around inset circles [00:42:25]. Soft edges suit low poly, view
  distance decides [00:07:00].
- Multires per part, preview 0, bake with Clear Image off so parts share a texture [00:57:32],
  [00:59:43].

## Jonathan Lampel (CG Cookie, loops vs bevels vs creases, 2021)

- Holding edges beat creases: at visual parity 3,600 tris (loops, level 2) vs 36,800 (crease,
  level 5) [00:05:28].
- Creases for small, low-importance details; for tiny or distant ones drop subdivision and bevel
  [00:06:01], [00:06:45].
- Bevel modifier before Subdivision: 2 segments, profile 1.0 so the original edge stays, Limit
  Method Weight, lower weight = sharper [00:08:06], [00:08:39]. Even segments and UV Smooth Keep
  Corners, apply the bevel before seams [00:11:15], [00:11:46].

## Disagreements and deciding conditions

| Topic                   | Position A                                       | Position B                                             | Deciding condition                                                                                                                                  |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solver                  | Fast fixes glitches (Gambrell 2021)              | Exact, switch only to diagnose (Ryuu)                  | EXACT default; MANIFOLD for speed on manifold operands; FLOAT only to diagnose [verified]                                                           |
| Harden Normals vs WN    | Harden is enough (du Mont)                       | WN when harden fights (Gambrell svS9, Ryuu)            | Harden fixes faces next to bevels; WN fixes large flat regions with booleans; neither fixes non-planar faces. Both together is the toolkit default. |
| Clamp Overlap           | off (Ryuu)                                       | on, fix geometry (du Mont)                             | on for automated work; any clamp effect is a geometry defect, and it is global [verified]                                                           |
| Cutter proximity        | far from target edges (du Mont)                  | exactly coincident (du Mont fix B)                     | far is robust; coincident only when exact; near-but-not-equal is the failure [verified]                                                             |
| Creases                 | avoid for main edges (Lampel)                    | full creases at level 1 on a coarse cylinder (du Mont) | creases to round a silhouette or for small details; support loops for primary edges                                                                 |
| UV Smooth               | Keep Corners (Lampel)                            | All (rileyb3d)                                         | Keep Corners with a bevel or tight loops on seams; All for sparse smooth cages                                                                      |
| Where to mirror         | target (Ryuu)                                    | cutter (Gambrell)                                      | target when the whole part is symmetric; cutter when only the cut is                                                                                |
| Apply booleans          | live to the end (du Mont, Gambrell)              | apply early (Augusto, Ryuu)                            | live while designing; apply for edit-mode access, a clean low poly or quads                                                                         |
| High poly for games     | none, Bevel-node bake + painted height (Augusto) | subD or multires high (rileyb3d, PzThree)              | schedule vs need for sculpted damage and complex curvature                                                                                          |
| Sharpness timing        | tighten loops now (Gambrell, rileyb3d)           | postpone (PzThree)                                     | single-pass cage vs iterative apply-one-level                                                                                                       |
| Triangulate vs WN order | triangulate then WN (Gambrell spoken)            | WN then triangulate (digest)                           | WN then Triangulate (keep custom normals) kept normals through glTF [verified]; compare in a matcap if unsure                                       |

## Added by this skill (measured in 5.2.1)

- Clamp Overlap limits the bevel over the whole object: a slot 0.7 degrees from a facet edge
  displaced a port rim 3.8 mm elsewhere; a groove across a design bevel narrowed the whole panel
  1.9x.
- Every wall, step, groove and rounding facet must be wider than 2x the micro width; rounding facets
  must stay clearly under the bevel angle limit (6 segments per half circle at 30 degrees clamped, 8
  did not).
- Round cutters in phase with the target facets give EXACT non-manifold slivers (10 edges, visible
  streaks); a half-segment offset is clean.
- Data Transfer must sit after WN, be scoped by distance, and draw from the uncut curved faces only
  (minus a ring touching flat faces), with area weighting on long extrusions.
- Game copies and slices share their cutters: moving them drops the cuts.
