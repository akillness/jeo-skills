# Subject clarity and meaningful motion

Use this when a scene’s subject, action or explanation feels generic or
unclear. It complements [object reasoning](object-reasoning.md),
[motion and state](motion-and-state.md) and [research and truth](research-and-truth.md).

## Make the subject identifiable

Start with what the viewer should look at and recognize. Ask:

- What context and scale make the subject legible?
- Which silhouette, landmarks, connections and material responses establish its identity?
- What changes, what stays fixed, and why?
- Which view exposes the important relationship without decorative competition?

Treat each important object as its own design problem. A shared palette can unify a scene, but
shape, part structure, surface response and motion should still belong to the object. Spend detail
where it survives the intended camera distance and explains identity or function.

Use source geometry or references for the identity they actually contain. Verify landmarks,
registration, scale and scope after import. A generic proxy with a citation remains a generic proxy;
a source mesh does not validate a new material, deformation or mechanism.

Kits, quality tiers and shared utilities are construction options, not an artistic ceiling. Reuse
rendering, loading, inspection and geometry operations without forcing every artifact toward a
template's finished appearance. Preview one representative finished scene or demanding hero early
before multiplying an approach across a collection.

For a larger world, make scale meaningful through terrain variation, routes, landmarks, occlusion
and changes in density or elevation. Expanding a flat repeated surface rarely creates a stronger
sense of place.

## Tie motion to meaning

Motion should reveal a behavior, relationship or state change. Choose an authoritative state and
derive visible transforms, deformation, readouts and annotations from it.

- Articulated motion needs credible pivots, attachments and clearance through its full range.
- Soft or biological motion may need local deformation ownership. Whole-mesh translation cannot
  stand in for shortening, bulging, expansion, compression or sliding between attached structures.
- Opposing or coupled parts should respond together when that relationship carries the explanation.
- Locomotion needs terrain support and obstacle-aware clearance, including roofs, overhangs and
  animated extremities. A walk cycle plus a destination is not navigation.
- Water needs a readable persistent surface before foam, glints or flow cues. Animate lightweight
  surface detail when useful, and inspect whether a speed control causes a visible change.

Do not animate everything. Stillness, a parked comparison state or a deliberate camera can explain
more than ambient movement. Avoid motion that attracts attention without representing a modeled or
authored cause.

Define playback behavior where controls exist. Check the at-rest, middle, extreme, contact and paused
states that apply. Scrubbing should select an exact state; pause should freeze it; resume should
continue predictably; reset should restore a defined default. Respect reduced-motion preferences
without removing access to the underlying information.

## Keep the explanation coherent

For a scientific or technical scene, trace title and description → model → units → geometry and
motion → labels and readouts. Narrow any claim the artifact does not support. A polished render does
not repair a false fraction, mismatched axis or unexplained state variable.

Label controls by cause and unit: phase, angle, rate, strength, volume or playback speed are different
quantities. Put a control beside a view where its effect can be seen. If colors encode parts, states
or mathematical terms, supply a compact legend and keep that mapping stable.

Labels and landmarks should track their subjects through motion, sectioning and filtering. Check
that hidden structures do not leave floating annotations, and that a selected subset still has
enough context to understand its relationship to the whole.

## Review what the viewer receives

Build success and completed task counts establish implementation status, not artistic approval or
subject clarity. Inspect the real artifact and separate:

- what the model computes or authors;
- what the rendered view visibly communicates;
- what was checked numerically or interactively;
- what the user has accepted as clear and visually successful.

Use the project's shared build and inspection entry points where they fit. Reusing tooling preserves
repeatable checks; it does not require visual conformity. Choose visible-browser, captured-frame or
manual review according to the task and the user's constraints. No single review mode or fixed quota
of motion, labels or detail applies to every scene.
