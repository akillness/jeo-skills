# Applying the completed catalog to Latent Village

Date: 2026-09-07. This is an actual retrieval and code-inspection walkthrough with a proposed design. No demo code was changed, and no fresh rendered or interaction result is claimed. The skill was read directly from this repository, without host installation.

## Input and interpretation

Scope correction: the user means the Latent Village demo. The repository currently labels this scene "Lantern village". The earlier assistant analysis incorrectly imported the historical Harness Village brief; its agent-architecture recommendations are withdrawn. Retrieval below was rerun with the corrected prompt.

The corrected prompt used for the first query was:

> Improve Latent Village, an explorable fantasy farming diorama with varied hills, rivers, detailed buildings, expressive spirit creatures, substantial organic paths and visible physical interactions.

Conversation constraints add nonhuman actors, meaningful object construction, coherent materials, organic circulation, smooth movement and English repository content. The existing Three.js project is retained. The historical author-supplied Harness Village recording and this repository's Lantern Village are different artifacts.

This brief has three interacting responsibilities:

1. An invented settlement with a coherent art direction and inspectable construction/materials.
2. Expressive nonhuman residents whose anatomy, pose and movement agree with their chosen fictional body plans.
3. A traversable world with controlled locomotion and selected causal physical interactions.

Fictional geography and species are creative choices. Claims about real construction, biology or physical simulation need appropriate research and implementation evidence. A larger map or more polygons does not satisfy those responsibilities by itself. Building function means its role in the fictional settlement, such as lodging, milling or growing plants.

The model performs this interpretation. The helper performs lexical retrieval; it does not automatically reason about the prompt, generate a design system, or enforce policies.

## What search actually returned

Fourteen searches were run against the same catalog. Full candidate IDs, scores, filters and catalog fingerprints are in [retrieval-results.json](retrieval-results.json). Nineteen records were resolved with their sources in [selected-context.json](selected-context.json). [run.json](run.json) records the prompt, scope and inspected code hashes. These are inspected known-subject queries, not a held-out search benchmark.

Historical path note: the stored results record `data/knowledge/style-profiles.json`, which was later split into `style-profiles-shape-craft.json` and `style-profiles-render-abstract.json`. The record IDs are unchanged; these files are kept as the original run and are not updated.

| Query purpose | Actual leading candidates | Application decision |
| --- | --- | --- |
| Whole brief | `recipe.fantasy-village-diorama`, `recipe.historical-diorama`, `recipe.monte-carlo-volume` | Select fantasy village. Historical reconstruction requires evidence absent from this fictional brief; Monte Carlo volume is unrelated. |
| World and circulation | Village, streamflow forecast, terrain island | Use village and terrain; forecast playback needs actual time-series data and is irrelevant to an invented river. |
| Creature motion | Winged flight, garden patrol, stair geometry | Use flight and patrol according to species/state. Stair design is not a flight recommendation. |
| Construction | `knowledge.framed-shelter` | Inspect support, connected framing, door thickness/pivot and opening clearance. |
| Style | Low poly, stylized, stylized realism | Prefer stylized realism at object level for this detail-heavy brief; retain storybook exaggeration. The highest-ranked low-poly record does not override intent. |
| Theme | Fantasy woodland, industrial workshop, science-fiction outpost | Woodland is primary; selected workshop motifs can help functional buildings. No outpost theme is needed. |
| Surfaces and lighting | Dielectric, conductor, transmissive medium; PBR studio environment | Choose material identity per part and inspect under useful lighting. Reinterpret the lighting profile as outdoor environment/fill, not a mandatory studio scene. |
| World rules | Terrain height authority, DEM resolution limits, settlement function variation | Apply shared support authority and function-led variation. Real DEM resolution assumptions do not apply to this authored island. |
| Actor rules | Gait/contact consistency, coherent body plan | Connect speed, stride, heading and stance; give each species a deliberate joint/body plan. |
| Physical behavior/tools | Gravity contact; Three.js rigid-body adapter | Add a bounded dynamic experiment where useful; retain a controller for ordinary wandering. |
| Inspection and checking | Controlled experiment; traversable support clearance | Make effects repeatable and check the intended bridge, terrace and shoreline. |

Example reproducible commands, from the canonical skill folder:

```sh
python3 scripts/search.py "fantasy village terrain river bridge paths landmarks"
python3 scripts/search.py "creature locomotion gait ground flight clearance" --collection knowledge --kind reasoning-rule
python3 scripts/search.py "terrain traversal support slope step clearance" --collection knowledge --kind domain-validation
python3 scripts/resolve.py recipe.fantasy-village-diorama recipe.terrain-island knowledge.reasoning-settlement-function-variation
```

Filtering, scope inspection and synthesis matter: the results above include real misses and inappropriate candidates. A BM25 score is not semantic confidence. Direct reading remains a valid fallback. The resolved context is deliberately a small selection, not the entire catalog.

## Rules selected for this particular scene

| Decision | Applicable guidance | Concrete consequence |
| --- | --- | --- |
| Make buildings recognizable | `knowledge.reasoning-settlement-function-variation` — advisory | Workshop, archive, observatory and meeting house differ by use, silhouette, site and associated tools, within a shared material vocabulary. |
| Connect object parts | `knowledge.framed-shelter`; stylized-realism profile | Roof-to-frame-to-foundation connections, hinge pivots and working clearances precede more scattered decoration. |
| Make terrain authoritative | `knowledge.reasoning-terrain-height-authority` — correctness within a supported-world model | Query height, normal and surface identity. Bridges and stacked surfaces need more than a single height at each horizontal coordinate. |
| Coordinate creatures | `knowledge.reasoning-gait-contact-consistency`; patrol and flight recipes | Distance/speed controls gait; rest and turn have their own states. A flier has explicit glide, approach and perch states if those behaviors are offered. |
| Make contact observable | `knowledge.gravity-contact`; `knowledge.controlled-experiment` | Release or push a delivery crate, observe displacement/contact and reset the same initial state. Keep the experiment small and optional. |
| Assign transform ownership | `knowledge.three-rigid-body-adapter` | Dynamic props follow the physics world. Character roots follow the collision-aware controller. Pose animation does not overwrite either authority. |
| Test the intended affordance | `knowledge.validation-traversable-support-clearance` | A bridge-crossing check must identify the bridge deck, not merely show an actor near the bridge. Probe slopes, steps and water boundaries under declared limits. |

Advisory records support artistic judgment. Correctness records apply only to the model and behavior the scene actually promises. A magical hovering creature can deliberately use a hover controller; it need not satisfy a walking stance contract. A watermill can use an explicitly authored flow-to-wheel relation without claiming a fluid solver.

## Reviewed Village versus those decisions

These are source-code findings, not new visual observations. The exact reviewed-source fingerprints
remain in [run.json](run.json); those byte revisions are no longer available. The archived source
links below show the later retired implementation for context and must not be treated as the
fingerprinted source evidence. Existing render/test history remains in the
[archived artifact validation report](../../../evidence/artifacts/legacy-early-slice/validation-report.md).

| Finding in the reviewed implementation | Later archived context | Proposed improvement and acceptance |
| --- | --- | --- |
| Existing buildings already have roof courses, framing, masonry, windows and greenhouse contents. | [Buildings](../../../evidence/artifacts/legacy-early-slice/village-buildings.js) | Preserve useful geometry. Inspect three hero objects at close range; add functional parts or clearer materials where they improve identity. More objects is not the default remedy. |
| Travel distance accumulates, but creature animation receives elapsed time alone. Grounded dragon wings also flap independently of flight state. | [Creature update/render](../../../evidence/artifacts/legacy-early-slice/village-creatures.js) | Feed gait from movement/state. Check stopped, turning and variable-speed motion; a planted foot should not slide under the chosen walking model. Treat dragon wing gestures as intentional display, or give it a real authored flight state. |
| Support meshes are captured before the bridge is built. The deck is not returned by the ground-height query. | [Landscape support and bridge](../../../evidence/artifacts/legacy-early-slice/village-landscape.js) | Register deck support with surface identity and an accessible approach. Verify a complete crossing with feet on the deck and clearance from rails. |
| Ground height is assigned after swept integration. New terrace routes can bypass the swept movement's vertical constraints. | [Creature update](../../../evidence/artifacts/legacy-early-slice/village-creatures.js), [movement sweep](../../../evidence/artifacts/legacy-early-slice/village-physics.js) | Resolve support/step transitions as part of accepted movement. Test the intended step limit and reject unreachable height changes. |
| Static collision avoidance exists; actor-to-actor contact and arbitrary moving obstacles are not handled. | [Creature collision inputs](../../../evidence/artifacts/legacy-early-slice/village-creatures.js), [cached navigation](../../../evidence/artifacts/legacy-early-slice/village-physics.js) | Before offering free rerouting, add actor separation/reservations and explicit blocked recovery. Invalidate navigation when relevant geometry changes. |
| The waterwheel rotates by `dt` alone although its description attributes motion to the stream. | [Mill construction/update](../../../evidence/artifacts/legacy-early-slice/village-buildings.js) | Expose an authored flow control and couple wheel speed, or keep the effect clearly decorative. Verify zero input and reset under the chosen model. |
| Focus buttons provide framing; they do not expose part selection, object manipulation or world-state reset. | [Village bindings](../../../evidence/artifacts/legacy-early-slice/village-scene.js) | Add selected-object inspection and a separate deterministic world reset. Camera reset remains a different action. |

The paths already have volume and edging; the bridge already has separate planks and rails. Earlier complaints about thin roads should not cause those improvements to be discarded. The next question is whether circulation, support and visible construction agree.

## Proposed design synthesis

**Concept:** a handcrafted storybook farming settlement with varied terrain, function-led buildings and expressive spirit creatures. Preserve existing useful geometry while improving the relationships between construction, materials, movement and contact.

| Place or actor | Fictional identity | Proposed observable behavior |
| --- | --- | --- |
| Inn | A sheltered gathering place | Open a substantial hinged door; inspect porch, frame and roof support. |
| Observatory | A distinctive lookout | Aim a mounted telescope within a declared range; preserve its pivot and clearance. |
| Watermill | A riverside working building | An explicitly authored flow control changes wheel speed, with a visible axle connection. |
| Glasshouse | A place for cultivating plants | Inspect frame/glass/plant separation; any growing or harvesting interaction is a separate optional feature. |
| Cottage | A quiet home integrated with terrain | Inspect foundation and entry support rather than adding generic decorative clutter. |
| Spirit creatures | Distinct fictional residents | Walk, rest, turn and react to blocked paths; flying/perching behavior only for species that actually offer it. |

Choose three hero subjects for the first improvement pass: the watermill wheel/axle, the inn doorway/frame and one articulated creature. Add an optional crate drop/push/reset experiment near the mill if physical interaction is part of the selected design. Expand map size after those relationships remain readable at overview and object scale.

Navigation state owns creature roots, animation derives poses from that state, and a solver owns dynamic props where used. These are scene implementation responsibilities. They do not turn the village into a diagram of an AI system.

Three.js supplies rendering and pose playback; its animation system supports clips and blended actions. Dynamic props and colliders can use the Rapier dependency already present in Object Lab, while movement still needs obstacle-aware control. These responsibility choices are grounded in the freshly read [Three.js animation overview](https://threejs.org/manual/en/animation-system.html), [Rapier body types](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) and [character-controller guide](https://rapier.rs/docs/user_guides/javascript/character_controller/). This is not a verified API integration for the installed versions.

## Improvement order and evidence to collect

1. **Object identity and inspection:** identify three hero subjects, inspect their existing construction and materials, and give any new interaction an explicit state and reset. Preserve useful detail already present.
2. **Movement and support:** speed-driven gait, blocked state, bridge deck and terrace transitions. Inspect both meshes and collision/support results on representative routes.
3. **Visible causality:** wheel control and one dynamic prop experiment. Check repeatable input/contact/reset and record the actual model limits.
4. **Object presentation:** close-up assembly/material review and species silhouette/pose refinement. Compare under fixed lighting before expanding decorative density or map size.

This walkthrough demonstrates that the catalog can supply relevant decisions and expose concrete implementation gaps. It does not yet demonstrate that a generated Village looks better. That conclusion requires implementing selected changes and recording new rendered and interaction observations.

## Subsequent implementation

The authorized Latent Village refinement is recorded in the [archived demo validation report](../../../evidence/artifacts/legacy-early-slice/validation-report.md#latent-village-catalog-application-2026-09-07). This walkthrough retains the original pre-implementation retrieval and fingerprints; subsequent browser evidence is stored separately.
