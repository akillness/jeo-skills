# Expert notes: scenario-maya-modeling

The depth behind SKILL.md: what each expert does, why, and when their advice applies. Timestamps
point into the source video; "frame" marks a contact-sheet observation from the project's notes.
Source notes live in the project's `notes/modeling/` and `notes/fundamentals/` (never edited to fit
this skill). [added] marks this skill's own reasoning.

## Mario Elementza: sub-D hard-surface topology (`_bpsEd_5IW4`, 2024)

Hard-surface and industrial-design modeling educator (Elementza courses; no studio credits found).
The most complete reasoning source on where a cut goes, how dense to go, and when a triangle is
acceptable.

**Purpose decides whether topology matters.** A still render from CAD or booleans: "this topic is
not interesting for you" [00:00:32]. Games, animation, close hero renders, retopology of CAD: it
does [01:36:02]. Background prop vs "full-blown in camera hero asset" changes every decision
[01:00:27] [01:01:32].

**Bottom up.** Primary form with even quads first, secondary forms cut out of it [00:04:06]. If a
region confuses you, duplicate, extract the simplest sub-piece and solve it alone; if the simple
piece fails, the complex one will [00:05:13] [00:05:50]. Still stuck: model the form as if the cut
did not exist, "as clean as a cube", then cut [00:15:07] [00:16:13].

**Even grid, never double.** "Minimal is fine as long as it's not double" [00:08:31]; past 2:1,
balancing one side unbalances the other [00:07:59]. Close the largest possible quads first
[00:06:55]; quads keep direction as loops are added, a triangle makes "edges flow everywhere"
[00:07:28]. Stress test: keep adding loops; if it stays balanced, the base is right [00:10:11]
[01:04:55]. Uneven spacing produces "extreme kind of stretching" on the smoothed result [00:52:13].
Measure: `MM.balance` on the base grid, before support loops (a support loop is an intentional thin
band and always exceeds 2).

**Density comes from the narrowest feature.** "The shortest distance between the two edges" sets the
minimum density; balance the rest to it [00:16:47] [00:17:19]. Stop at the density you will use:
extra topology is waste unless you will cut details into it [00:53:51] [00:54:24].

**Loops prove quads are solved.** "If you notice that your loop is breaking somewhere, that means
you still have an open area where quad is not solved" [00:18:57]. A loop that "suddenly stops" can
be a double edge from an empty extrude, visible only in smooth preview [00:39:22] [00:39:53].

**Triangle protocol.** "When in doubt, remove the triangle and then bring them back once you have
more or less everything solved" [00:20:36]. A triangle is only a problem if it breaks a loop you
need or, on a curved surface, bends the curvature [00:21:45] [00:29:59]. Paying "the price of a
triangle" for better distribution is fine [00:30:32]. Judge with a metallic material on the smooth
preview: if the surface holds, the triangle stays [00:30:32] [00:31:05] (frame 00:58:24: Standard
Surface, metalness 1, roughness about 0.5, value uncertain in the note). After one Catmull-Clark
smooth, triangles become quads [01:22:33]. Agent tool: `MM.cage_report` sorts triangles into flat
(may stay if the highlight holds) and curved (remove, solve, reinstate only if it holds) [added
threshold: every face touching the triangle within 1 degree of its plane].

**Offset before cutting; support loops last on the base.** Before cutting a part out, extrude the
faces with an Offset and no translation (frame 00:39:05: Thickness 0, Local Translate Z 0, Offset >
0, Divisions 1, Keep Faces Together on): the offset ring is the support loop, "the job is already
kind of done for us" [00:38:16] [00:38:49]. Support loops "emphasize the highlights of the holding
corners" and go around every edge that must read sharp, after the base is balanced [00:27:46]
[00:28:21]. Inner support loop of an opening: a small inward extrusion, or points connected
following the outer edge [00:42:42].

**Corner routing template.** "If you're not sure, always take a cube, select every single edge,
bevel": the beveled cube's corner is exactly how support loops connect at a three-edge corner
[00:43:49] [00:44:24] [00:46:34].

**Density vs redirection.** Low density needs redirected edges and shows slight pinching; high
density needs no redirection and does not pinch [01:09:20] [01:10:26]. The decision is per corner
and per shot: write down the narrowest feature (the shortest distance between two edges that must
both exist, such as a groove, a seam gap or a recess wall) as the minimum density [00:17:19], then
let camera distance pick density or redirection [01:39:46]. Redirection on curvature is acceptable
on background props, not on a hero [01:00:27] [01:01:32]. Compared side by side on a glossy
material: medium density with a softer corner shows "almost nothing pinching"; redirected with a
sharper corner, "a lighter pinching" [01:38:09] [01:38:41].

**Cylinders.** "We can add horizontal edges the way we want to, but the vertical edges we cannot"
[00:57:43]; vertical cuts "destroyed the structure of the cylinder" [00:58:17]. Curvature is set by
neighboring edges; to add topology and keep it, smooth and subdivide [00:58:49] [00:59:55]
[01:16:27]. Sides in multiples of four (20, 24, 28, 32): model one quarter and duplicate; 26
rejected [01:11:30] [01:12:04] [01:12:36]. Vertical edges must line up with the cut; 28 was upgraded
to 32 [01:15:55] [01:18:41]. Cap with quads, not a fan: remove the cap edges, big quads first
(frames 01:12:18 fan, 01:15:41 quad cap) [01:13:42] [01:14:16]. On curved parts, create the support
loop before the detail [01:19:49]. Agent tools: `MM.cylinder_sides_for`, `MM.build_quad_cylinder`.

**Soft corners.** Real corners have falloff; razor-sharp corners are rare and distance makes corners
read sharp anyway [01:17:36] [01:18:09]. Polycount agrees for bake highs: round edges more than in
real life so they read at game size (PC § Edge Thickness).

**Fixes he shows.** Loop takes an unexpected path, pinch streak: select the loop, reroute [00:12:54]
[00:13:28]. Support loop spread too thick through a triangle: reposition, leave the harmless
triangle in the middle [01:27:01] [01:28:08]. Faceted patch after mirror or bridge: these are hard
edges, soften them [01:28:38] [01:29:14]; on a cage, every edge is soft before the high is smoothed
(`MM.cage_report` hard edges 0). Outside support loop missing because the inside one was not created
first on a curved part: rebuild it with an absolute-distance loop offset [01:29:14] [01:30:56].
Bridge wide or twisted: adjust twist or bridge in two parts [01:34:21].

**Limits.** He never discusses creases, weighted normals or mid-poly game bevels; those come from
the docs and Polycount below.

## Jessica Dru Johnson: performance topology (`ZiYEO49B768`, CG Futures 2018)

Senior Cinematic Artist, Blizzard in-game cinematics (StarCraft 2, World of Warcraft, Diablo 3,
Overwatch). Signal between [01:10:50] and [01:34:12].

- **Topology is for the people downstream:** "if you're making production art you have to make it
  work for everybody around you" [01:10:50]; ask riggers and animators; "a Disney style of doing
  things and a Pixar style... both are completely valid" [01:11:57].
- **Isolation loops** bound controls: one loop around a sub-part sets where one control's falloff
  stops [01:13:39] [01:14:11]. Face isolation set: full face, muzzle, mouth, nose, eyes, ears, brows
  (frame 01:26:29) [01:26:20] [01:26:54].
- **Concentric, parallel loops;** a loop spiraling down a limb is "bananas", artifacts and muddy
  weights; concentric loops let a rigger say "this joint affects exactly to here and no further"
  [01:12:33] [01:21:55].
- **Rule of threes:** "one edge loop for control, two edge loops for support" [01:15:51]. Kneecap,
  elbow, knuckles isolated with one inset or extrude [01:14:44] [01:16:27] [01:17:01]; knuckles
  three loops each [01:17:34]; thumb needs a loop around plus the palm-line isolation or it
  "collapses and shears" [01:18:38] [01:20:49]. Wrist: one transition loop, no fancy topology
  [01:21:23].
- **Shear:** a quad should get longer or shorter along the motion; shearing flickers between
  triangulations or collapses; kill jaw shearing with one loop from lip corner straight back to the
  jaw corner, scaled flat in Z [01:13:06] [01:30:10].
- **Mouth and eyes:** double circle at the lip edge, lengthwise loops meeting at one center point,
  mouth modeled flat [01:28:31] [01:29:03]; lid loops meet when closed (frames 01:31:17, 01:31:23).
- **Deliver a neutral face** (flat lids, flat mouth) even if it "looks super peaceful" [01:00:30].
- **Engine limits are topology limits:** 4 bone influences per vertex; one extra mouth-corner span
  needed 5 [00:44:17] [00:59:24]. Standardized base topology took face skinning from three days to
  30 minutes [00:58:51].
- **Shoulder:** her animators prefer tube topology over deltoid isolation; isolate the scapula, and
  stop its loop at the elbow (frame 01:24:05) [01:24:07] [01:24:41].
- **Triangles:** keep quads, hide unavoidable triangles where there is little animation [01:12:33].
- **Scope by performance:** emotional, action, background; a background character may get textures
  and no modeling (frame 01:33:55) [01:33:28].
- **Deciding condition vs Mario:** she minimizes spans for bone budgets, he adds density for
  highlights. Static offline hero: density buys quality. Real-time deforming asset: every span costs
  influences and weights.

## Antony Ward (antCGi): organic base mesh and deformation test (2021 to 2022)

Game-industry veteran, author of _Game Character Development with Maya_ (book verified, studio list
unverified). Four lessons of #ModelingInMaya; captions machine-translated ("ribs" = edges, "cook" =
weld).

**Blocking (`-mWWeFv07SI`).** Autosave on: 10 backups, every 10 minutes, one fixed folder [00:02:01]
[00:03:05]. Low-division primitives: torso cylinder 12 x 8, arm and leg 8 x 6, chest sphere 6 x 6
[00:05:28] [00:11:23]. Delete caps, delete history per object (never Delete All by Type in a file
with deformers), then freeze [00:13:19] [00:13:50]. Insert with Edge Flow on curved areas, or new
edges flatten the form [00:16:04]. Target Weld, not V-snap: a snapped vertex is still two vertices
[00:17:07]. Delete Edge, not the Delete key, so vertices go too [00:19:16]. When Fill Hole fails:
extrude an edge, collapse it to a triangle, target weld [00:19:48] [00:20:51]. Match loop counts
before joining limbs [00:27:43]. Loops follow fold lines (hip crease) [00:30:21]. "The fewer edge
loops a model has, the better it will look and perform" [00:18:44].

**Mirror and symmetry (`QW8w15J00Ok`).** Mesh > Mirror: X, direction minus, Merge Border, threshold
Custom 0.001; Automatic ate the center topology [00:01:52] [00:02:24] [00:02:56]. After every
mirror, hunt stray center vertices; "select all vertices and Delete" removes winged ones [00:03:29]
[00:04:40]. Red symmetry components mean no match: edits there are one-sided; "I don't fully trust
the symmetry tool" [00:06:09] [00:13:44]. A pole above the chest "will cause problems with model
deformation... a kink": bevel the loop open and reroute [00:09:58] [00:10:29]. Shoulder loop wraps
the shoulder and passes under the chest (deltoid, pectoralis) [00:11:03]. A Relax error is a
topology error: Cleanup non-manifold in fix mode, then check for split vertices [00:13:13]
[00:13:56]. Finger extrusion rings are joint positions [00:19:24]. Agent tool: `MM.mirror_merge`
(seam-only merge, near-miss snap, verified counts).

**Face (`RlNnp4qQIrU`).** Openings start as one quad extruded with its middle deleted [00:01:46].
Loops follow facial muscles [00:02:51]. Upper and lower lids and lips carry the same loop count
[00:05:22] [00:12:00]. Mouth-corner loop "needs to run back under her cheek", and the loop from the
mouth corner around the head is "a key element for when we come to generate blend shapes" [00:09:32]
[00:23:15]. Model lids over the real eyeballs [00:08:24]. Judge unsmoothed too [00:19:11]. Bevel if
exported, crease if not: creases are lost on export [00:28:12] [00:35:01]. Placeholder ears, brows
and lashes early, or the head "looks too much like an alien" [00:29:50].

**Deformation test (`x07USYlvu2o`).** Test before texturing [00:00:00]. Throwaway chain with a root
anchor, bind with Weight Distribution Neighbors, pose, flood by region, smooth [00:03:34] [00:04:12]
[00:06:57]. Separate faults: at the elbow "the topology is okay so it would need something extra in
the rig"; at wrist and ankle the flow must run across the joint, a modeling fix [00:10:27]
[00:11:04] [00:17:37]. Proof: the updated elbow topology deforms better with the same weights
[00:16:24]. Twist is judged mid-limb [00:08:40]. Delete Non-Deformer History, never History, on a
skinned mesh [00:12:41]. Unbind with Delete history to return to bind [00:13:49]. Face tests with
joints, because blend shapes break on topology change [00:19:00]. Walk, jog, run, then a ROM file
[00:19:43] [00:21:10]. Agent tool: `MM.bend_test` (same chain and bind settings for every topology
variant, rest shape checked after teardown).

**Model evaluation before rigging (`e74KphYwMww`, rigging batch).** What the rigger checks on
arrival: working units cm, size to spec, feet on the ground, centered on X, frozen main group, eyes
looking dead ahead, loops around knuckles and knees, mouth bag for a face rig, A pose, symmetric
parts combined so weights can be mirrored [00:02:52] to [00:25:47]. "Game model optimization never
justifies sacrificing deformation" [00:22:50].

## FlippedNormals (Henning Sanden, Morten Jaeger): hygiene and tool choices

Former senior film character artists (London VFX; Framestore for Henning per manifest).

**Clean scenes (`ToWRH4IXF7A`, 2018).** The modeler is "the first person to really ingest data into
the project" [00:00:58]. Agent tools for their policy: `MM.cleanup_technical` (Cleanup with only the
technical switches), `MM.inverted_shells` (what two-sided lighting hides), `mx_audit` naming flags.
Rebuild beats repair: export the geometry and import into a fresh scene, "99% of the problem"
[00:08:31] [00:09:38] (deciding condition [added]: OBJ only for single-UV-set sculpt bases; it drops
UV2, creases, hierarchy and pivots; otherwise `MM.rebuild_scene(carrier="ma")`). Cleanup auto-fixes
only lamina, non-manifold and zero-length edges; n-gons are selected and fixed by hand: "you never
know how it's gonna clean up" [00:10:44] [00:11:50]. Render Stats are a silent failure: two days
debugging missing reflections [00:02:35] [00:03:00]. Two-sided lighting hides flipped normals: turn
it off, or work with backface culling on as Henning does [00:20:47]. Never two objects with the same
short name, sides from the character's point of view, `_geo` suffix, top group `<asset>_model`
[00:15:15] [00:17:07] [00:18:16]. Freeze groups too, except eye groups [00:20:16]. Outliner with DAG
Objects Only off shows hidden junk [00:22:07]. Save with smoothing off (press 1) and soft normals:
smaller, faster files [00:24:00] [00:24:33]. Scale is a contract [00:23:28]. Publish folder equals
latest WIP, never work on the published file [00:25:06]. The 17-item checklist in the description is
what `mx_validate` profile "model" encodes.

**Modeling tools (`zSr8i6yT5Ek`, 2021).** Multi-Cut replaces Insert Edge Loop for most cuts
[00:06:12]. Average Vertices around 10 iterations, repeat rather than raise [00:07:43]. Bridge one
face first to avoid twists [00:10:48]. Delete history right after Combine and Separate [00:12:55]
[00:13:39]. Smooth subdivides, it does not relax [00:14:14]. Edit Edge Flow places a loop from its
neighbors, no memory [00:16:06]. Beveling every edge of a box with 1 segment leaves n-gons at the
corners; 2 segments fixes it [00:18:18]. This is the legacy bevel (2021, before Smart Bevel
existed); `test_mm_build` records what 2027's legacy bevel and Smart Bevel each do, so never state
the rule for Smart Bevel until that result exists. Circularize plus extrude and subdivide for clean
round holes [00:19:56].

**Modeling secrets (`BAxUMjHdS84`, 2018).** Thicken or thin along normals, not by scaling [00:02:00]
[00:03:05]. Edit Edge Flow is the cleanup after rough topology [00:04:35]. Pivot and point snapping
for exact contact [00:13:06].

## On Mars 3D (Aunmar Mohammed): high to low (`YDu9pYMkkSM`, 2021)

15+ years in CG, VFX and games; Epic credit self-reported (unverified).

- **Budget from screen coverage, in triangles:** a hero grenade "seen large on screen" [00:03:15]:
  cage 61,000 tris, smoothed about 1,000,000, low 24,000 against a 25,000 target (20,000 "great",
  30,000 push further) [00:00:37] [00:03:47] [00:04:21]; secondary or tertiary props at 10 to 15% of
  the screen get much less (no figure given) [00:04:21]; background props of that class 10,000 or
  5,000 [00:04:55]. Three bands, not one number: anchor a new prop on the band its screen coverage
  matches, then ask the lead. "Know what your goal is before going through and beginning your
  optimization process" [00:04:55]. "Polygons" in captions means roughly half the triangles
  [00:21:31].
- **Silhouette first:** flat black (Use All Lights with no lights) and compare cage, smooth and low
  outlines [00:01:16]. Removing edges along the main curvature creates visible hard corners
  [00:01:47].
- **Duplicate the cage, strip holding loops and bevels** that only served subdivision, keep every
  silhouette edge [00:05:18] [00:05:50] [00:06:54]. The low is reached by deleting edges; triangles
  terminate loops locally instead of running them around the model: "great for terminating edges
  that you don't need to run throughout the duration of the model" [00:09:22] [00:10:29].
- **Contrasting materials** on overlapping high and low show where the low deviates [00:07:27].
- **Round high corners need a radius of real edges on the low;** two to three edges on a visible
  curvature were too few; space them evenly and add an edge at the highest point of the corner to
  help baking [00:12:50] [00:25:29] [00:26:34].
- **Subdivision shrinks the surface:** shrink-wrap the cage-derived low onto the high; no custom
  bake cage needed [00:14:31] [00:17:45]. Agent tools: `MM.deviation`, `MM.shrink_wrap`,
  `MM.flat_edges`.

## Documentation

**Maya 2027 Help, polygon tools (POLY).** Smart Bevel (2027) follows shape not topology, is
recommended after booleans and on messy geometry; Width is in world units; Depth is a profile (1.0
flat chamfer, 0 to 1 rounded, negative concave with 2+ segments); Filter defaults to Selected Edges
(also Hard Edges, Edges by Angle); segments 1 hard, 2 to 3 for most hard surface; "use the lowest
segment count that achieves the desired visual result"; 2027.1 fixed spikes, sawtooth corners and
arc welding, 2027.2 is up to 20x faster. Legacy bevel: Fractional (default) caps width at the
shortest edge and cannot invert, Absolute can; defaults 1 segment, depth 1, chamfer on, smoothing
angle 30. Crease value N creases N subdivision levels; the maximum visible crease equals the mesh's
subdivision level; Crease Tool and Crease Sets "cannot be used interchangeably on the same
components". Smooth Mesh Preview is display only for Maya's rendering. Edit Edge Flow: at most 2
non-adjacent loops. Bridge: same mesh, equal border counts, consistent normals; a bow tie means
inconsistent normals, a spiral an offset. Booleans: manifold inputs, uniform normals, meshes
selected, not their group. Topological symmetry: equal halves, a center edge, never edit the seam
edge.

**Arnold subdivision settings (SS doc).** "Arnold will also render this preview smoothed state in
the final image": preview plus Arnold iterations multiply (2 preview levels + 4 Arnold iterations on
426,936 polygons is 1.7 billion). This contradicts the Maya help's "display only" for Arnold
renders: set subdivision in one place (`MM.subdiv_setup`).

**Maya 2027 Help, fundamentals (FUND).** A mesh is a transform plus a shape. Deleting history bakes
the object and can change its appearance. Parenting geometry with history can transform it twice;
`group` handles it, `parent` does not. Freeze and Reset differ. Optimize Scene Size has no undo.
Reduce is decimation, not retopology. macOS: Ctrl is Control, Alt is Option.

**Pixar OpenSubdiv modeling tips (OSD).** Regular faces, few extraordinary vertices, manifold. About
6 spans for accurate circles, 4 for background. High valence (above 4) causes waviness and cost; GPU
limit about 27; cap revolution shapes with valence-4 quads. Pentagons "sparingly" at saddles. Crease
sharpness 0 to 10, above 5 rarely needed, cost grows with sharpness; crease sets named with the
value (`topDeck_2`); infinite creases tear under displacement.

**Polycount wiki (PC).** Poly count in games means triangles; vertex count is the real cost because
UV seams, hard edges and material changes duplicate vertices; a hard edge on a UV seam is free. Hard
edges on UV seams and on mechanical bends above about 45 degrees. Bevels improve silhouette and
highlights but create thin triangles and more vertices; if you bevel, edit the normals so big flats
stay flat. Triangulate before baking and export the same triangulation; mirror the triangulation
too; check the triangulation in the engine and triangulate by hand a quad that became a ridge
instead of a valley (§ Polygons Vs. Triangles, workflow step 7; agent tool
`MM.triangulated_copy(toward=high)`). Mismatched tangent bases between baker and renderer show as
artifacts (§ Smoothing Groups & Hard Edges). Bake the whole mirrored model with mirrored UVs offset
by 1 unit. Floating geometry works for normal maps; for AO make floaters separate with shadow
casting off. Keep the low contiguous, one connected chunk where possible, to avoid overlap bake
errors, aliased edges and UV waste (§ Contiguous Meshes). LODs can introduce normal-map seams (§
Level of Detail Models); straight UV shell borders help LOD generation (§ UV Tutorials & Threads).
Poles in flat areas, away from deformation.

**Epic, FBX Static Mesh Pipeline (FBXUE).** The export origin is the pivot, often at a corner for
grid snapping; triangulate in the DCC; FBX 2020.2; UCX_ collision named after the render mesh;
Smoothing Groups on. The Maya scene stays Y up; the FBX exporter's axis conversion (or the importer)
handles a Z-up engine (pipeline FBX note).

**Maya 2027 Help, UV Toolkit (UVDOC), for the handoff boundary only.** Unfold3D refuses non-manifold
meshes and Maya sends Unfold a triangulated mesh, so non-planar faces can hide non-manifold cases:
clean before unfolding (§ Prepare a UV mesh, step 2). Room space stays at the 2 px default (§ Room
Space Options). Unfold3D pins unselected UVs automatically (§ Unfold a UV mesh). Optimized game maps
may lower density on unseen faces and share sheets (§ Optimizations). The UV work itself is
scenario-maya-retopology-uv's; this skill guarantees the mesh-side preconditions (procedures P17).

## Where the experts disagree, and the deciding condition

| Question                       | Positions                                                                                                                                                                          | Decide by                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Triangles                      | Mario keeps them on flats, removes on curves; Jessica hides them away from animation; antCGi removes all on a sculpt base; Polycount: fine on game lows if every edge has a reason | static flat vs curved vs deforming; sculpt base vs final asset vs game low                                   |
| Density vs redirection         | Mario: density on heroes; Jessica: minimal spans for bone budgets                                                                                                                  | offline static hero vs real-time deforming                                                                   |
| Sharp edges                    | support loops (Mario), creases (OSD: cheaper), chamfer plus normals or hard edges on UV seams (Polycount), bevel for export (antCGi)                                               | does the surface stay in a subdivision renderer or leave for an engine                                       |
| Legacy vs Smart Bevel          | legacy predictable on clean quads and matches tutorials; Smart after booleans and messy meshes                                                                                     | clean hand-built quads vs boolean or dense input, and the point release                                      |
| Clean-scene rebuild            | FlippedNormals: OBJ round trip                                                                                                                                                     | OBJ for a single-UV-set sculpt base; MA carrier otherwise [added]                                            |
| Pivot                          | FlippedNormals: world or object center, consistently; Epic: origin, often a corner                                                                                                 | film vs engine placement                                                                                     |
| Shoulder topology              | Jessica's animators: tube; antCGi: deltoid and pectoral loop                                                                                                                       | rig shapes via correctives vs via topology: ask the rigger                                                   |
| Mirror tool vs symmetry        | antCGi: symmetry for shaping, mirror for topology truth                                                                                                                            | agents: model half and `MM.mirror_merge` [added]                                                             |
| Separate parts on a game asset | Polycount: floaters are fine on the HIGH for normal maps (AO: shadows off); the LOW contiguous where possible                                                                      | high vs low: floaters feed the bake, a low with intersecting pieces bakes overlap errors and wastes UV space |
