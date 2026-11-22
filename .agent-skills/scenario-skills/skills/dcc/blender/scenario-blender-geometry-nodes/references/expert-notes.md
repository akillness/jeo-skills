# Expert notes: how the Geometry Nodes experts think

Six of the eight sources are one voice: Simon Thommes, Blender Studio technical artist and
artist-side member of the Geometry Nodes design team since late 2020. Erindale (fields and
selections) and Johnny Matthews (closures) confirm the core ideas independently. Timestamps are
`[video id hh:mm:ss]`; ids are listed in `sources.md`. Items marked [added] come from this skill's
own 5.2.1 tests, not from the videos.

## 1. The mental model (Thommes)

- **Geometry is a container.** One geometry holds components (mesh, curves, point cloud, volume,
  instances; Grease Pencil since 4.3 behaves like "instances of curves"); each component has domains
  (point, edge, face, corner, curve, instance, layer); domains hold attributes. Vertex groups and UV
  maps are just attributes. `[1nvzwhbL-k0 00:03:18 to 00:05:28]`, `[Opzk1wUhzCw 00:23:56]`
- **"It's just 3D data that has a certain meaning."** Understanding the container is what makes node
  work predictable. `[1nvzwhbL-k0 00:02:45]`
- **Fields hold no data.** A field describes how to compute a value per element; it is evaluated
  where a geometry consumes it, on that node's domain. "The actual data is not in this node... it's
  only in the geometry." Diamond sockets are fields, round ones single values; dashed links carry
  fields. `[1nvzwhbL-k0 00:06:00, 00:10:59]`, `[-kwAc-tPmVM 00:31:10]`
  - [added, verified] The practical corollary for code: two values that update together (a
    particle's position and its velocity) must be computed in one Capture Attribute; if Store Named
    Attribute writes the velocity first, a later Set Position that reads velocity sees the new value
    (test_03: the naive order double-counts gravity in flight). `particle_drop_tree` captures both.
- **Name to cross a boundary.** Inside one tree, anonymous attributes (noodles) are fine; a shader,
  another modifier or the 5.2 physics cache only sees named attributes. "Nothing happens until the
  output is named." `[1nvzwhbL-k0 00:12:06]`, `[H2NRCcsX9Xo 00:18:30]`
- **Store to freeze.** "It's not a face area anymore, it's whatever the value is": storing a derived
  value cuts it from its source, which is how rest states survive deformation (stretch maps:
  deformed face area / stored rest face area). `[1nvzwhbL-k0 00:15:22, 00:16:28]`
- **Five kinds of production jobs:** attribute pipeline, quick hacks (a one-node Switch that hides a
  variation regardless of visibility flags), creative tools, technical tools, parametric assets. A
  small personal tool is legitimate "even when Blender should have it".
  `[1nvzwhbL-k0 00:08:13, 00:17:32, 00:45:19]`
- **Put control where the variation lives.** Per-object modifier inputs beat parameters baked into a
  shared shader: duplicate the object and tweak. `[1nvzwhbL-k0 00:09:19]`
- **Work on the input, not the output.** Drawing curves that drive a result keeps creative control;
  drawn curves have uneven density, so Resample before scattering and Fillet for round corners
  (embroidery). `[1nvzwhbL-k0 00:21:27, 00:23:40]`
- **Attach to deforming surfaces through UV space.** Curves authored in the badge's UV space and
  projected with Sample UV Surface follow transforms, edit-mode scaling and UV edits "like a
  texture". Debug view: Set Position to the UV map after Split Edges (UV seams are not split on the
  mesh). `[1nvzwhbL-k0 00:24:47 to 00:29:47]`
- **Accumulate Field is "the sum of previous elements within a group".** Trajectories for sparks,
  debris and smoke cards are accumulated per-step velocities grouped by trajectory id; everything is
  a function of time, so sub-frames and slow motion are free. `[1nvzwhbL-k0 00:35:19, 00:37:31]`
- **Instances plus per-instance attributes** (id, age) feed the shader without realizing, which
  keeps smoke and fire cheap. `[1nvzwhbL-k0 00:40:51]`

## 2. Simulation (Thommes BCON23, BCON26)

- **"Simulation is not physics."** A set of rules transforms the current state into the next; an
  animation is a predetermined function of time. Choose simulation only when state must accumulate
  or react to live input. `[H2NRCcsX9Xo 00:02:50, 00:04:30, 00:07:53]`
- **Zone mechanics.** First frame: the Simulation Input takes the incoming data. Every step: the
  body runs once. Next frame: the input outputs what reached the output last frame. "As soon as the
  simulation runs... this input is not taken into account at all anymore, it's only the
  initialization." Wire every state item from input to output or it resets.
  `[H2NRCcsX9Xo 00:06:09, 00:12:20, 00:12:55]`
  - [added, verified] The first frame already runs the body (a zone that emits 12 points per step
    has 12 points at frame 1). A jump past the cache computes one step. Stepping fills a memory
    cache that replays exactly. `simulation_nodes_cache_calculate_to_frame` is a no-op headless;
    bake for random access.
- **Per-step increments must be small** because they accumulate: heating 0.05, cooling 0.01, drip
  0.01. Use Delta Time for frame-rate independence; mesh-resolution independence is your job.
  `[H2NRCcsX9Xo 00:15:39, 00:19:41, 00:27:01, 00:41:15]`
- **Irreversible state = Maximum(previous, current)** (molten never unmelts).
  `[H2NRCcsX9Xo 00:25:54]`
- **Rest position** (`obj.add_rest_position_attribute`) stops procedural textures swimming on
  deforming meshes; also stabilizes hair distribution. `[H2NRCcsX9Xo 00:28:42, 00:38:20]`
- **Blend flow directions** to avoid self-folding: tangent flow mixed 0.5 with straight gravity,
  then 0.1 of the normal (0.5 "looks like baking bread"). `[H2NRCcsX9Xo 00:30:26, 00:30:58]`
- **Everything is object-local.** A (0, 0, -1) vector rotates with the object; the 3.6 workaround
  was an anchor empty; in 5.2 use matrices. `[H2NRCcsX9Xo 00:31:30, 00:38:55]`
- **The "big mistake":** a controller object referenced inside the tree; expose an Object socket so
  every user brings their own. "I would recommend to not create references to data blocks... inside
  of the node trees unless you really know what you're doing." Prove reuse by dropping the asset on
  Suzanne. `[H2NRCcsX9Xo 00:33:12, 00:35:31]`
- **Keep changing topology outside the simulation** and Sample Index the simulated data into it, so
  counts can change live (passing the stack through the zone freezes the first frame's instance
  count). `[rLfxq5KavzM 00:23:28]`
- **Append, never insert.** For hair dynamics on curves spawned by tears, "it needs to basically
  only have them added at the end": collect new elements in a simulation zone that starts empty and
  joins the new ones each step. `[8hMflOZVbSs 00:27:39, 00:28:12]`
  - [added, verified] Join Geometry puts the last created link first; build joins so the state comes
    first (`Builder.join`).

## 3. The 5.2 physics framework (Thommes BCON26)

- **Physics is built out of Geometry Nodes.** Cloth Dynamics, Hair Dynamics, Collider, Custom Force,
  Custom Effector are node groups around one solver node (`GeometryNodeXPBDSolver`).
  `[8hMflOZVbSs 00:01:43, 00:15:13]`
- **Declarative, not imperative.** "You really pass in what the solver actually does from the
  outside": constraints, forces and effectors arrive as bundles and closures.
  `[8hMflOZVbSs 00:09:38 to 00:10:45]`
- **"A solution plus an error."** The solver iterates constraints to satisfy them to a similar
  degree and returns a Residual Error. `[8hMflOZVbSs 00:15:46, 00:16:19]`
- **Three depths of customization:** asset inputs; extra effectors and forces as bundles (name the
  Combine Bundle entries so the structure stays readable); make the asset local and edit its
  constraints (sewing: Custom Length on Is Edge Loose). `[8hMflOZVbSs 00:05:03, 00:07:24, 00:16:52]`
- **Collider two ways:** a collection of objects carrying the Collider modifier (artist-friendly),
  or the Collider node's bundle plugged into Effectors (built in the tree); same result.
  `[8hMflOZVbSs 00:03:57, 00:05:38]`
- **Soften instantaneous constraints.** Seams ramp their rest length from 1 to 0 over one second of
  accumulated Delta Time. `[8hMflOZVbSs 00:17:58, 00:18:30]`
- **Tearing calibration:** threshold 1 tears as soon as an edge exceeds rest (too sensitive);
  reinforce the neck with a Switch to 10; randomize the base 1 to 1.1; Voronoi pattern; raise
  Bendiness because the solver is always slightly bendy. `[8hMflOZVbSs 00:21:26 to 00:23:40]`
- **Pick the stage deliberately:** Pre-Simulation initializes once, Pre-Solve and Post-Solve run per
  step. `[8hMflOZVbSs 00:30:58 to 00:33:19]`
  - [added, verified] With the default 5 substeps a Post-Solve or Pre-Solve effector ran once per
    frame; Pre-Simulation once on the first frame.
- **Extra Sim Attributes.** The system copies the input into a simulation cache and merges back only
  known attributes, so you can still paint or edit the input after baking. "Any attribute that you
  want to propagate from one step to another basically needs to be added here."
  `[8hMflOZVbSs 00:36:13 to 00:38:30]`
  - [added, verified] Unlisted, a per-step counter stays at 1 every frame with no warning; listed,
    it counts 1 to 10.
- **After tearing, sample on face corners.** Store the corner index at Pre-Simulation and Duplicate
  Elements (Face) so indices stay coherent when one edge becomes two.
  `[8hMflOZVbSs 00:40:44 to 00:42:22]`
- **"Nothing works"?** Check you are on a frame inside the simulation range (he lost time on frame
  -1). `[8hMflOZVbSs 00:36:50]`

## 4. Loops, assets and gizmos (Thommes BCON24 and the 4.3 video)

- **Tools, not trees.** "Forget about nodes": ship node assets with gizmos that artists use in the
  viewport without knowing nodes drive them. `[-kwAc-tPmVM 00:02:11]`
- **Repeat vs for-each.** Repeat = serial chain of the same operation N times; For Each Geometry
  Element = the body runs once per element, in parallel. `[-kwAc-tPmVM 00:29:26, 00:30:01]`
- **Loops are a last resort.** "Usually try to not rely on this node if you don't have to";
  "whenever you can solve a problem without using the for each element zone it's probably more
  efficient". Built-ins use acceleration structures. Exception: a black-box generator per element,
  where "the simple stupid way which works" buys creative flexibility.
  `[-kwAc-tPmVM 00:38:29, 00:52:26]`, `[Opzk1wUhzCw 00:18:04]`
- **For-each sockets:** field outside, single value inside; Random Value's implicit ID is a field,
  so plug the zone Index into ID; seed = Index + an exposed offset; generated attributes must match
  the output domain (Instance after Geometry to Instance), and attributes belong to the geometry
  output above them. `[-kwAc-tPmVM 00:31:10, 00:40:13, 00:43:20]`, `[Opzk1wUhzCw 00:17:31]`
  - [added, verified] That red link is invisible in `md.node_warnings`; only `link.is_valid` shows
    it after an evaluation.
- **Name geometry** (Set Geometry Name + Join Strings) so the spreadsheet hierarchy stays legible.
  `[Opzk1wUhzCw 00:18:34 to 00:20:49]`
- **Collections of generators:** Realize Instances with Realize All off, Depth 1 flattens exactly
  one level so Pick Instance sees every tree. `[-kwAc-tPmVM 00:49:01]`
- **Gizmos drive backwards.** "Whatever goes into this value socket of the gizmo here will be driven
  kind of backwards." There is no value output. `[-kwAc-tPmVM 00:06:27]`, `[Opzk1wUhzCw 00:01:43]`
- **Drive the scaled value.** Position the grid gizmo at size x 0.5 and link the gizmo through the
  same multiply, or the arrow detaches while dragging. Back-propagation works only through
  invertible math, always into the first input. `[-kwAc-tPmVM 00:14:11, 00:53:32]`,
  `[Opzk1wUhzCw 00:04:25]`
- **Randomness goes on the second input** (gizmo value 10 x random 0.2 to 1).
  `[-kwAc-tPmVM 00:41:26]`, `[Opzk1wUhzCw 00:15:52]`
- **Join gizmo Transform outputs into the geometry** before later transforms; only Group Input
  sockets give artist-facing gizmos; the Transform gizmo follows the viewport orientation setting.
  `[-kwAc-tPmVM 00:21:33, 00:23:13, 00:25:33]`
- **Warning node Show pass-through** makes checks lazy; **Bake node set to Still** caches a heavy
  static upstream chunk (packed). `[Opzk1wUhzCw 00:21:41, 00:22:59]`

## 5. Matrices (Blender Studio "New Matrix Socket" video, narrator likely Thommes [?])

- **A 4x4 matrix is a transformation in one socket,** not a grid of numbers; transforms can be
  fields and attributes. `[rLfxq5KavzM 00:00:50, 00:05:22]`
- **Multiplication order = which space the second transform acts in;** swap the inputs to move along
  the other object's axes. `[rLfxq5KavzM 00:04:12]`
- **Pivot where the math happens:** box origin at its bottom face makes stacking trivial.
  `[rLfxq5KavzM 00:08:08]`
- **Accumulate Field on transforms:** Trailing (excludes self) for contact stacks, Leading (includes
  self) for propagated offsets; randomize the step transform so lean propagates.
  `[rLfxq5KavzM 00:11:43, 00:14:49, 00:20:50]`
- **Strip what you do not want** (scale from a control empty) with Separate / Combine Transform.
  `[rLfxq5KavzM 00:22:45]`

## 6. Selections (Erindale)

- **"Selections are the most important thing in geometry nodes."** A selection is a yes/no question
  asked of each element. `[p4rwhifXNCw 00:00:00, 00:16:01]`
- **Implicit Boolean:** float/int > 0 true; vectors true when non-zero [verified: (-1, 0, 0) is
  true]. `[p4rwhifXNCw 00:05:32]`
- **Interpolation bleeds:** after Subdivide, vertex-group floats become 0.5, 0.25 and the selection
  grows; fix with Float to Integer (Round, Ceiling, Floor) or Compare Equal with epsilon.
  `[p4rwhifXNCw 00:10:14 to 00:12:39]`
- **Trait over index:** "index-based stuff does have a tendency to break at the slightest change".
  Grids: row = index floored-modulo N, column = floor(index / N).
  `[p4rwhifXNCw 00:17:39, 00:18:44, 00:20:21]`
- **Per-group questions = Accumulate Field** with Island Index as Group ID: Trailing starts at 0,
  Total counts (Value 1); sum / count = mean. `[p4rwhifXNCw 00:26:10 to 00:27:17, 01:03:05]`
- **Normal selection** for scattering on flatter ground: Compare, Vector, Direction against (0, 0,
  1), Angle + epsilon; point normals are interpolated so edge vertices need more epsilon.
  `[p4rwhifXNCw 00:35:19 to 00:36:58]`
- **Raycast** Is Hit and Hit Distance ("a big node but it calculates fast").
  `[p4rwhifXNCw 00:37:47 to 00:39:32]`
- **When a node needs faces, make faces:** extrude a curve into a ribbon to use Edge Angle, then
  back to curves. `[p4rwhifXNCw 00:44:02]`
- **Topological expand:** Evaluate on Domain point > edge > point + Ceil in a repeat zone; crisp
  ring-by-ring growth vs Blur Attribute's soft diffusion. `[p4rwhifXNCw 00:48:46, 00:49:53]`
- **Map Range for soft masks,** Compare for discrete ones; transfer island values back with Sample
  Nearest + Sample Index and blend by proximity (0 to 0.2 m, Smoother Step).
  `[p4rwhifXNCw 01:05:52 to 01:09:48]`
- **Look at every selection** (small icospheres on selected points, random color per island) before
  building on it. `[p4rwhifXNCw 00:03:19, 00:25:28]`

## 7. Closures and bundles (Johnny Matthews)

- **A closure is a function passed as data:** "those nodes will be treated as if they were right
  here, in this particular context". Keep the fixed machinery in a group, inject the varying part.
  `[BqMos-6sSy4 00:05:16, 00:07:57, 00:09:09]`
- **Signatures must match;** auto-population fails "in several situations": add the items by hand.
  `[BqMos-6sSy4 00:10:12, 00:10:43]` [verified: matching is by item name]
- **Closures are a data type:** switch them (Index Switch, Menu Switch), wrap each in a small group
  exposing its parameters. `[BqMos-6sSy4 00:12:20, 00:13:29]`
- The payoff is declarative systems like the 5.2 physics nodes. `[BqMos-6sSy4 00:17:53]`

## Where the experts differ, and the deciding condition

| Choice                   | Option A                                                  | Option B                                        | Decide by                                                                                                               |
| ------------------------ | --------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Index vs trait selection | Index (Thommes' stack Index == 0, for-each Index as seed) | Traits (Erindale)                               | Index when you generated the geometry and its order is the design; traits on input meshes or when resolution may change |
| Spread over topology     | Blur Attribute (Thommes' heat)                            | Domain-chain expand in a repeat zone (Erindale) | Soft diffusion vs crisp rings with a step count                                                                         |
| Hard vs soft mask        | Compare                                                   | Map Range with a smooth curve                   | Delete / separate vs blend                                                                                              |
| Colliders                | Collection with Collider modifiers                        | Collider bundle built in the tree               | Artist-placed objects vs procedural effectors                                                                           |
| Customize physics        | From outside (inputs, bundles, closures)                  | Local copy of the asset                         | Local only to change a built-in constraint                                                                              |
| Attribute output         | Store Named Attribute                                     | Group output field named in the modifier        | Name fixed by the pipeline (shader) vs user-chosen                                                                      |
| Apply the modifier       | Apply and keep working (hair noise)                       | Never apply                                     | One-off authoring step vs shot-level variation                                                                          |
| Loop                     | For-each over a black box                                 | Field rewrite                                   | Creative flexibility and small counts vs performance                                                                    |
