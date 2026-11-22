# Motion and state

Choose motion from intent. A useful reveal can be a section plane, separated assembly, camera orbit or animated transition; none is mandatory. Let the viewer pause or inspect when understanding depends on time.

Separate model state from presentation:

- Discrete puzzle: retain piece identity, permutation and orientation. Animate a legal transition, then commit once. Queue or reject overlapping actions explicitly; undo uses the inverse action, not a visual color reset.
- Mathematical scene: derive geometry and displayed values from the same parameters. Handle singular and boundary inputs deliberately; a singular matrix is a valid linear map, though its inverse does not exist.
- Assembly: retain original attachment and transforms. Exploded offsets are display transforms; reset returns to the assembly, not to the last dragged pose.
- Numerical dynamics: advance the solver independently of camera/UI easing. Declare units, timestep assumptions and regime; slow playback without changing reported physical values.
- Living world: use terrain-aware paths, varied speeds and rests, believable heading changes. Ambient creatures are not task events unless the state model says so. Ground roads and foundations in the landscape rather than floating planes.

Use elapsed time and stable state transitions rather than frame-count movement. Pause/resume/reset and interruptions should have defined behavior where those features exist. Reduced-motion can shorten or remove animation while preserving the underlying action.

Test the artifact's own invariants and integration. Do not recreate an upstream solver's conformance suite. Numerical comparisons need a regime and tolerance. In a preview, inspect occlusion, labels and control responses as well as final poses.

When motion implies contact or shared space, use [physical interaction](physical-interaction.md) to choose collision geometry, support, acceleration and timestep behavior. Kinematic path following must not bypass collision response. Include animated extremities in clearance checks.

A parameter that changes motion needs an explicit paused-state response: resume on that user action, or keep paused with a clear pending-state explanation. Test the actual control handler from both running and paused states; a model setter test alone misses this boundary. Label whether a percentage controls speed, strength, volume or playback, and provide a view where the change is perceptible.

For interactive scenes, avoid redrawing unchanged paused views or advancing hidden documents. Invalidate on camera and state changes and bound active rendering where appropriate; preserve time-based motion. Report measured performance separately from configured work limits, and honor user constraints on browser/render testing.
