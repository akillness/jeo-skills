# Viewer: streaming splats, walking, physics

The setup below is the one that shipped, built on three.js with [Spark](https://sparkjs.dev) for
splats and [Rapier](https://rapier.rs) for physics. Other renderers work if they stream splats by
level of detail; the physics rules hold for any engine.

## Splats

- Convert each `.spz` to a paged level-of-detail tree with Spark's `build-lod` tool
  (`--quality --rad-chunked --max-sh=0`), built from the same Spark release as the renderer the page
  ships. A room of 1.6 to 1.8 million splats became a header plus about 40 chunks of roughly 1 MB,
  so coarse levels arrive first and detail follows where the visitor looks. Offer the full `.spz` as
  a download.
- Add one `SparkRenderer` to the scene with `enableLod: true` (`lodSplatScale` below 1 on phones),
  and load each room as `new SplatMesh({ url, paged: true })` with an absolute URL: chunk files
  resolve against the page, not a `<base>` element. Apply the calibrated world transform to the mesh
  and await `mesh.initialized`.
- When switching rooms, keep the incoming mesh in the scene but hidden until it has streamed enough
  splats (a few hundred thousand on desktop, or a timeout), then reveal it.
- Render on demand: request frames from Spark's `onDirty` callback while pages stream, and stop when
  nothing moves.

## Walking

The visitor is a small circle (about 24 cm) at the calibrated eye height that slides along the
heightfield's blocked cells. Offer keys, a touch stick, and drag-to-look.

## Physics

- Load the physics engine after the room is on screen.
- Ground: the heightfield as a heightfield collider (blocked cells raised to wall height), a
  ceiling, and a safety floor just below y = 0 so nothing falls out.
- Props: one dynamic body per object with a convex-hull collider from its simplified mesh (a box if
  the hull fails), density, friction, and restitution by material class, light damping, and
  continuous collision detection on.
- Rigid props start asleep exactly where the photo had them and wake on touch; soft ones (cushions)
  start awake and settle onto their seats.
- The visitor is a kinematic capsule that shoves whatever it walks into.
- Grab and throw: on pointer down, joint the hit object with a spherical joint to a kinematic anchor
  that follows the pointer at the grab depth, and raise its angular damping while held. On release,
  remove the joint and set the object's velocity to the pointer's recent velocity, clamped. A tap
  without a drag nudges the object with a small impulse instead.
- Impact sounds: enable contact-force events with a threshold scaled by the object's density, record
  each object's speed before the physics step, and play a sound only when that speed was meaningful
  (about 0.45 m/s), the object is not held, and no sound played on it in the last 150 ms. Stay
  silent for the first second or two while soft props settle. Pan and attenuate from the contact
  point.
- Lighting for the props: a neutral studio environment map, a hemisphere light, and a sun tinted by
  each room's palette, so the meshes sit in the splat room instead of glowing on it.
