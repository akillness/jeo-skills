---
name: scenario-blender-geometry-nodes
description: "Use when building or debugging Geometry Nodes, headless or live: procedural modeling, scattering objects on a surface, arrays along a curve, repeat or for-each loops, simulation zones, 5.2 physics (cloth, colliders, forces, effectors), closures, bundles, matrices, node-group assets with gizmos. Also when a GN script links nothing, shows red links, ignores modifier inputs, loses instances in a bounding box, or a simulation resets or jumps."
license: MIT
---

# Blender Geometry Nodes (procedural systems and simulations)

Expert Geometry Nodes work means thinking in fields evaluated on domains, keeping systems
declarative (data and instructions come in from outside), and shipping tools that artists drive from
modifier inputs without opening the tree. For an agent it also means proving every tree with numbers
read from the evaluated geometry and a render, because the node editor's red links and warnings are
invisible from Python unless you ask for them. If a sibling skill named here is missing from your
available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).
Hair node groups (Interpolate, Clump, Curl, Hair Dynamics grooms): scenario-blender-hair.

## Stance (the expert delta)

- **A field is a deferred question, not data.** Thommes: it is evaluated by the node that consumes
  it, on that node's domain and geometry; values exist only once named or consumed. Consequence
  [added, verified]: two coupled updates (position and velocity) must be captured together in one
  Capture Attribute, or the second reads the first's new value.
- **Domain changes interpolate; everything becomes a Boolean by a rule.** Erindale: float > 0 is
  true (vectors: any non-zero), so a subdivided vertex-group selection bleeds; decide with Float to
  Integer or Compare with epsilon. Prefer trait selections (position, normal, proximity, raycast)
  over index ones, unless you generated the geometry and its order is the design (the Blender Studio
  matrix video drives a stack from Index == 0).
- **Simulation only when history matters.** Thommes: a simulation is rules applied to state; an
  animation is a function of time. If nothing depends on the previous frame, drive it from Scene
  Time and get scrubbing and sub-frames free.
- **Loops are a last resort.** Thommes: built-in nodes working on all elements use acceleration
  structures, loops cannot. For-each is for black-box generators run once per element: field
  outside, single value inside.
- **Everything is object-local.** Thommes: a (0, 0, -1) vector rotates with the object. World
  directions go through Self Object > Object Info > Invert Matrix > Transform Direction.
- **Tools, not trees.** Thommes: expose every scene dependency and tweakable value as a group input,
  never hard-reference an object inside a reusable tree, and drive gizmos only from Group Input
  sockets, through invertible math, into the first input of each math node.
- **5.2 physics is declarative.** Thommes (BCON26): forces, colliders and constraints travel as
  bundles and closures into a black-box solver. Customize from outside first (inputs, bundles,
  Custom Effector closures); make the asset local only to edit a built-in constraint. Any per-step
  custom attribute must be listed in Extra Sim Attributes, and topology-changing sims must append
  new elements at the end.

## Establish first

| Question                                                             | Why it changes the plan                                                        | Default when silent                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| What consumes the result: shader, another modifier, export, physics? | Crossing a boundary needs a named attribute; export may need realized geometry | Named attributes for anything a shader reads; keep instances |
| Does it depend on the previous frame?                                | Simulation zone and baking vs Scene Time function                              | Function of time                                             |
| One-off authoring step or reusable asset?                            | One-off may be applied (Thommes' hair noise); assets never are                 | Reusable: expose inputs, panels, sensible min/max            |
| Scale: element counts, viewport cost                                 | Realize, loops and simulations cost; instances are cheap                       | Instances, fields, no loops                                  |
| World or object space for directions and ground                      | Object-local trap                                                              | World up, world gravity                                      |

## Workflow

1. **Plan the data flow.** Name the component and domain each value lives on, where each field gets
   evaluated, and which primitive fits: plain fields first, Accumulate Field for per-group sums,
   repeat zone for N dependent passes, for-each for a black-box generator per element, simulation
   zone for state, closure to inject behavior, bundle to pass many named values. GATE: you can say
   for every field which node evaluates it.
2. **Build with `bx_gn.Builder`** (headless or live, idempotent: a tree of the same name is rebuilt
   in place). `b.node(kind, prop=..., ins={...})` sets properties before inputs, links sources,
   assigns constants; `b.zone(...)` pairs zones and adds items; `b.join([...])` keeps list order.
   GATE: `b.done()` returns (zones paired, every link created).
3. **Attach and set inputs** with `G.attach(obj, tree, inputs={...})` or `G.set_inputs(md, {...})`;
   `"attr:NAME"` switches a field input to an attribute or vertex group. GATE: `G.check(md)["ok"]`,
   no `hard_refs` on an asset.
4. **Measure.** `G.stats(obj)` (counts, attributes per domain, world bbox with instances),
   `G.attribute`, `G.instance_transforms`, `G.positions`. Then the two robustness probes: rotate the
   object 90 degrees (world-space effects keep direction) and double the input resolution (trait
   selections scale, index ones jump). GATE: numbers match the analytic expectation.
5. **Look.** `G.snapshot(objs, path, views=..., frames=...)` renders the current scene state with
   material colors and shadows (floating instances show); `bx_review.review` for realized meshes.
   Open every sheet. GATE: [`references/critique.md`](references/critique.md) visual items pass.
6. **Simulations.** Step every frame in order with `G.step(range(...))`, or `G.bake(obj)` for random
   access; assert bounds, monotonic states, counts, no NaN. GATE: a direct jump to a late frame
   equals the stepped result only after a bake.
7. **Package** (assets): inputs grouped in panels with defaults, min/max and subtypes;
   `tree.is_modifier = True; tree.asset_mark()`; drop it on a different object (Thommes' Suzanne
   test). GATE: works on the second object with no tree edit.

Recipes in [`scripts/bx_gn.py`](scripts/bx_gn.py), tested and rendered: `scatter_tree` (density x
mask, world-space slope limit, upright or aligned, pick from object and collection),
`curve_array_tree` (tangent-aligned array, alternating twist makes a chain), `growth_tree`
(repeat-zone extrusion), `particle_drop_tree` (simulation zone with emission, world gravity, ground
bounce). Prefer the shipped Essentials assets (Scatter on Surface, Array, Instance on Elements,
Randomize Transforms) when their inputs cover the brief; build your own when you need world-space
rules, masks or custom attributes.

## Numbers

| Value                                                                                                                     | What it is relative to                              | Source            |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------- |
| Melt sim: 300 K ambient, 2000 K source, heating 0.05, cooling 0.01 per frame                                              | per-step Mix factors; small because they accumulate | Thommes BCON23    |
| Blur Attribute weight 0.5; smooth 5 iterations; melt mask 500 to 2000 K                                                   | heat diffusion and softening                        | Thommes BCON23    |
| Drip 0.01 per frame along -Z; normal mix 0.1 (0.5 "looks like baking bread")                                              | per-step offset                                     | Thommes BCON23    |
| Tearing threshold 1 = tears as soon as longer than rest (too sensitive); reinforce 10; base random 1 to 1.1; Voronoi mode | edge length ratio                                   | Thommes BCON26    |
| Sewing ramp: rest length x factor 1 to 0 over 1 s of accumulated Delta Time                                               | avoids snapping                                     | Thommes BCON26    |
| Threads on tears: about 2 cm, 3 points each                                                                               | performance cap                                     | Thommes BCON26    |
| Cloth asset defaults: Substeps 5, Constraint Steps 15, Collision Radius 0.01, Tearing Threshold 1.2                       | read from the 5.2.1 asset                           | digest [verified] |
| Gizmo position = size x 0.5 for a centered grid; random factor 0.2 to 1 on the SECOND input                               | keeps drags glued                                   | Thommes BCON24    |
| Stack: box origin at its bottom; random scale XY 1 to 1.5, Z 0.05 to 0.3                                                  | Accumulate Field Trailing                           | Matrix video      |
| Flatten regions: island min 5 faces; proximity falloff 0 to 0.2 m, Smoother Step; Volume to Mesh threshold about 0.5      | Erindale exercise                                   | Erindale          |
| Realize Instances: Realize All off, Depth 1                                                                               | flattens one hierarchy level                        | Thommes BCON24    |

## Quality gates

Measurable (code):

- `G.check(md)`: `ok` (no invalid link, no ERROR warning, zones paired), `hard_refs` empty for
  assets, Warning nodes you added report as expected.
- Counts match expectation: scatter count within about 12 percent of density x mask x eligible area
  [verified test]; curve array count = floor(length / spacing); repeat growth faces = F0 + sides x
  selected x iterations.
- Attributes exist on the right domain and type, values in range (`G.attribute`).
- Rotation probe and resolution probe (step 4).
- Simulation: counts per frame, bounds (nothing below the ground), prefix-stable ids when appending,
  energy or state monotonic where it must be, baked jump equals stepped.
- `G.time_eval(obj)` for hot trees; flag repeat or for-each zones in them.

Visual (`G.snapshot`, `bx_review`): scatter density reads natural and nothing floats or sinks;
arrays follow the curve without flips; growth has no self-intersection at the base; simulation strip
shows motion then rest; shader-driven attributes checked at render resolution. Gizmo feel is GUI
only.

## Common mistakes

| Mistake                                                  | What it looks like                                            | Fix                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `tree.links.new` across trees                            | returns None, nothing links, no error                         | `Builder.link` raises; never reuse a bound `links.new` after switching trees |
| Setting `md.properties.inputs.<id>.value` only           | result unchanged                                              | `obj.update_tag()` (or `G.set_inputs`)                                       |
| Random Value with its implicit ID inside a for-each zone | red link, output silently wrong; `md.node_warnings` empty     | zone Index into ID; `G.check` lists `invalid_links`                          |
| Same Seed on two Random Value nodes                      | scale and rotation move together (correlation 1.0 [verified]) | offset seeds (seed + k)                                                      |
| State not wired Simulation Input to Output               | value resets each frame                                       | wire every state item through                                                |
| Custom attribute inside Cloth or Hair Dynamics           | resets every step, no warning                                 | list it in Extra Sim Attributes                                              |
| Hard-referenced controller object in an asset            | works once, breaks on reuse                                   | Object socket on the Group Input                                             |
| Coupled fields updated by two nodes                      | velocity computed from the already-moved position             | one Capture Attribute for both                                               |
| Join order assumed = link order                          | new elements inserted first, solver or ids break              | `b.join([state, new])`                                                       |
| Local direction used as world                            | effect rotates with the object                                | Self Object matrix conversion                                                |
| Closure signature by auto-population                     | ERROR "Closure does not have output"                          | create both item lists, same names                                           |

## Blender 5.2 notes

- Modifier inputs: `md.properties.inputs.<Socket_N>.value` (old `md["Socket_N"]` raises TypeError),
  then `obj.update_tag()`.
- Menus are input sockets: Transform Geometry `Mode` = 'Matrix', Resample Curve `Mode`, Custom Force
  `Mode`, Custom Effector `Stage` (menu `Socket_1`; a string input is also named Stage, `Socket_2`).
- `node.inputs["A"]` on a Mix returns the available socket in 5.2.1; duplicate enabled names
  (Cloth's two `Gravity`) still need identifiers. `bx_gn.sock` raises with the identifiers.
- Join Geometry puts the last created link first [verified].
- Evaluated `obj.bound_box` ignores instances; the instance point cloud's `position` attribute reads
  zeros, use `instance_transform` [verified]. `md.execution_time` stays 0.0 headless.
- Simulation: the first frame already runs the zone body; a jump past the cache computes one step;
  `simulation_nodes_cache_calculate_to_frame` returns PASS_THROUGH headless and computes nothing;
  `simulation_nodes_cache_bake` works (packed) [verified].
- Lists (Field to List, Get List Item), Bundles, Closures and `GeometryNodeXPBDSolver` exist; modal
  node tools do not (experimental builds only).
- Shipped assets: `<DATAFILES>/assets/nodes/geometry_nodes_essentials.blend`,
  `geometry_nodes_dynamics_assets.blend`, `procedural_hair_node_assets.blend`
  (`G.append_group(name, library)`).

## References

- [`references/expert-notes.md`](references/expert-notes.md): Thommes, Erindale and Johnny Matthews
  principles with timestamps; load when designing a system or an asset.
- [`references/procedures.md`](references/procedures.md): tested code: raw-bpy procedures A to H
  (attribute pipeline, float simulation, repeat expand, for-each, closures, matrix stacking, gizmos,
  cloth) and the bx_gn recipes and physics tests; load before writing any tree.
- `references/critique.md`: the rubric to judge a tree, an asset and a simulation; load at every
  gate.
- [`references/sources.md`](references/sources.md): the eight source videos, what each is best for,
  best timestamps.
- `scripts/bx_gn.py`: builder, modifier, evaluation, simulation, snapshot helpers and recipes
  (docstrings list the traps).
