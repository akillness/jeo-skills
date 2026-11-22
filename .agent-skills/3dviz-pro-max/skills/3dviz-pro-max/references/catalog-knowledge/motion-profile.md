# Motion Profile

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Animation layers and track masks](../../data/knowledge/motion-profile/animation-layer-track-mask.json) — `knowledge.animation-layer-track-mask`: Build layers from explicit track ownership: filter bindings for anatomical or functional masks, and convert true offset motion to an additive clip against a named reference pose.
- [Articulation from controlled movement](../../data/knowledge/motion-profile/articulation-from-motion.json) — `knowledge.articulation-from-motion`: Connect limb and body motion to actual movement or commanded pose rather than an unrelated clock.
- [Skinned and morph animation handoff ownership](../../data/knowledge/motion-profile/blender-deformation-animation-handoff.json) — `knowledge.blender-deformation-animation-handoff`: Freeze bind pose, joint influence and morph topology contracts, bake Blender-only animation logic into transportable channels, then assign one Three.js playback owner per property.
- [Clip-event marker contract](../../data/knowledge/motion-profile/clip-event-marker-contract.json) — `knowledge.clip-event-marker-contract`: Transport authored event markers through a separate manifest and dispatch them by interval crossing, because clip lifecycle events do not represent arbitrary marker payloads.
- [Interruptible animation transition](../../data/knowledge/motion-profile/interruptible-animation-transition.json) — `knowledge.interruptible-animation-transition`: Model crossfades as explicit transition state and, when interrupted, begin the new transition from the currently evaluated action weights and pose after cancelling obsolete fade and warp schedules.
- [Interruptible focus transition](../../data/knowledge/motion-profile/interruptible-focus.json) — `knowledge.interruptible-focus`: Move attention between views while preserving user control and object state.
- [Loop-seam continuity](../../data/knowledge/motion-profile/loop-seam-continuity.json) — `knowledge.loop-seam-continuity`: Author and test cyclic clips at the wrap as a boundary condition, checking pose and, where desired, first-derivative continuity under the exported interpolation and runtime loop mode.
- [Morph expression channel ownership](../../data/knowledge/motion-profile/morph-expression-channel-ownership.json) — `knowledge.morph-expression-channel-ownership`: Assign each expression morph channel to animation, procedural behavior or direct interaction at a given time, then combine only through declared envelopes and reset rules.
- [Physics timeline lifecycle and render interpolation](../../data/knowledge/motion-profile/physics-timeline-lifecycle.json) — `knowledge.physics-timeline-lifecycle`: Coordinate a fixed-step solver, variable-rate Three.js presentation and authored animation with one model-time lifecycle across run, pause, resume, reset and visibility changes.
- [Root-motion runtime ownership](../../data/knowledge/motion-profile/root-motion-runtime-ownership.json) — `knowledge.root-motion-runtime-ownership`: Choose whether clip root channels or an application controller own world displacement, then remove the duplicate contribution when extracting root deltas.
- [Slider-crank branch closure and dead centers](../../data/knowledge/motion-profile/slider-crank-closure.json) — `knowledge.slider-crank-closure`: Drive a piston from one crank angle while preserving rod length and the selected assembly branch.
- [State-derived playback with pause and reset](../../data/knowledge/motion-profile/state-playback.json) — `knowledge.state-playback`: Display a sequence without letting animation create a second conflicting source of state.
