# Physical interaction and spatial constraints

When an object appears to occupy shared space, ask what may touch, block, support or move it. Stylization is compatible with spatial coherence: a fantasy owl should not fly through a roof unless that is an intentional, communicated supernatural ability. Do not add a physics engine to a purely abstract transform just because it is 3D.

## Choose the model that fits the interaction

- **Display transform:** exploded anatomy, matrix deformation, a section-plane reveal or schematic arrow. Keep its semantic constraints; do not add gravity or collision that defeats the explanation.
- **Controlled locomotion:** walking/flying actors following authored goals. Track position and velocity, limit steering acceleration, handle obstacle clearance and use a suitable ground/support rule. An authored route alone does not provide collision handling.
- **Dynamic interaction:** falling, bouncing, pushing, stacking or jointed machinery. Use appropriate forces, mass/inertia, contact response and constraints, preferably through a suitable established engine for complex coupled contact.
- **Scientific dynamics:** choose the researched equations, regime, solver and validation quantities. A visually convincing bounce is not evidence that a numerical simulation is scientifically correct.

Explain only limitations that matter to the viewer. For example, a game character can use a constrained hover controller without claiming to simulate aerodynamic lift. A wheel may demonstrate kinematics without pretending to model torque and energy loss.

## Record the useful physical contract

For affected object families, record applicable parts of this contract in the scene specification or recipe. Omit irrelevant fields; do not force every object through a form.

| Concern | Decisions to make |
| --- | --- |
| Physical role | Static obstacle, controlled character, dynamic body, trigger, visual-only layer or constrained part |
| Scale and state | Units or clearly illustrative units; position, velocity, orientation and angular velocity as needed |
| Driving behavior | Forces or commanded velocity, speed/acceleration limits, turn-rate limits, braking and stopping behavior |
| Collision shape | Sphere/capsule/box/convex pieces/terrain; local offsets and world transforms; relation to the visible object |
| Contact | What blocks, slides, bounces, grips or merely signals; friction/restitution only when modeled |
| Support | Terrain height/slope, permitted steps, floor/bridge surface, water boundary, landing or hovering rule |
| Time | Fixed step or documented solver timestep; substeps/continuous collision needs; render interpolation; pause/resume/reset |
| Limits | Missing interaction classes, conservative clearance, approximation regime, unsupported imported state |
| Checks | Concrete initial states, actions, expected clearance/contact/trajectory and tolerance where meaningful |

## Water level and surface identity

Distinguish terrain or basin floor, declared water level or longitudinal stream profile, bridge deck and flow-cue offset. Use a shared coordinate frame and explicit surface identities; a water surface should not blindly inherit every basin-floor height. Inspect shoreline and bridge occlusion from above and obliquely, with cues hidden, so buried water, accidentally flooded dry banks and wrong support selection are visible.

For a filled, non-draining authored surface whose level is unchanged, setting its flow control to zero stops advection cues while retaining base coverage; a coupled authored wheel can decelerate to rest. Pause preserves state and reset restores declared level/coverage and cue phase. This is an application contract, not a claim that zero inflow always preserves volume or stops waves in physical water. Research a changing-volume or scientific flow model separately when that is the requested behavior.

## Make the collision volume follow the visible object

Derive static obstacle bounds from the actual scene transforms where practical. Include roofs, overhangs and attachments that matter to the route. A building base box that excludes its roof cannot stop a bird crossing the roof.

Use a conservative whole-body envelope or articulated/compound colliders for moving creatures. Account for wings, antlers and tails, their animated extremes and turning clearance. A point at the actor root is insufficient. Keep collider transforms synchronized when scaling or moving an object; inspect a collider overlay during development when useful.

Separate trigger volumes from blockers. Avoid invisible walls far beyond the visible object unless they represent a clearly authored navigation boundary. Conservative bounds are a practical approximation, but disclose or refine them when users need close contact.

## Integrate movement, then resolve contact

Route selection and steering decide where the object wants to go. Collision queries and response constrain where it can go. Avoid overwriting a resolved position with the next decorative sine/circle position. Preserve velocity across updates, constrain changes in velocity according to the intended behavior, and use meaningful heading/limb motion derived from movement.

For fast motion or thin obstacles, evaluate the movement segment or shape sweep rather than only testing the next frame's endpoint. On contact, apply the chosen response to the remaining movement and inward velocity; do not silently teleport through the blocker. If the actor becomes blocked, select a reachable target, replan or stop visibly rather than oscillating or walking in place forever.

Gravity applies where the model requires it. Flight may have a controlled lift/altitude rule; ground contact may be a character-controller constraint. Do not advertise those choices as a complete rigid-body or aerodynamic simulation.

## Verify paths, not only attractive frames

Exercise a representative complete route, the nearest roof/wall/terrain edge, a fast thin-obstacle crossing, and any reset or pause during motion. Check motion at more than one frame delta when integration owns that behavior. Validate application-owned invariants such as no penetration within a declared tolerance, bounded free-motion acceleration, no stale motion after reset and no movement while paused. Contact impulses may legitimately change velocity sharply; do not mislabel that as a free-motion acceleration failure.

Inspect the rendered body and its extremities during those checks. A collider test passing does not prove that an undersized collider encloses the mesh. For scientific claims, compare the reported trajectory or conserved quantity with the appropriate source or known solution within the stated regime.

## Source grounding

Read 2026-09-07:

- [Rapier colliders](https://rapier.rs/docs/user_guides/javascript/colliders/), “Collider type” and “Shapes”: collider geometry governs contact; sensor volumes report overlap without generating blocking contacts.
- [Rapier rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/), “Rigid-body type” and “Continuous collision detection”: kinematic control requires separate obstacle handling; continuous detection addresses tunneling. Adding an engine does not automatically make directly authored trajectories collision-safe.
- [Glenn Fiedler, Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/), “Free the physics” and interpolation discussion: separate simulation increments from rendering, retain accumulated remainder and interpolate where appropriate.

These sources support the engineering distinctions above. They do not certify a particular generated scene, mandate an engine, or provide evidence for unimplemented forces.
