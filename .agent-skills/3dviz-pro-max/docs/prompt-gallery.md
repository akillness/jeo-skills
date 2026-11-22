# Prompt gallery

These English prompts are starting points for evaluation, not claims of completed or one-shot results. Use the skill name explicitly when trying a host for the first time. The agent should preserve your existing stack when appropriate and report what it actually checked.

## Fantasy village

> Use 3dviz-pro-max to build a small fantasy village I can explore. Choose a distinctive art direction, vary the terrain and buildings, and add a few moving creatures. Let me select buildings and reset the camera. Build a runnable artifact and inspect the result.

Look for readable composition, useful camera framing, working selection, and visible motion. Creature movement can be decorative; it should not be described as a biological or physical simulation without a model and checks.

For a richer brief:

> Create an island village that feels like a place people actually live: paths connect entrances, structures adapt to slopes, and warm windows guide the eye. Choose the architecture and palette yourself. Add a compact building information panel and keyboard-accessible controls. Make reduced-motion mode usable, and verify selection and camera reset in the running scene.

## Linear transformation

> Use 3dviz-pro-max to help me understand linear transformations in 3D. Let me edit a matrix and compare the original and transformed basis vectors and a simple shape. Research the definitions, state the matrix convention, verify the calculations, and include reset and a clear explanation.

The visible geometry should match the actual matrix result. Identity, a simple scale, and a singular example make useful checks. A smooth transition between two displayed states should be labeled as an illustration of the change unless intermediate matrices are deliberately modeled.

## Cube face turns

> Use 3dviz-pro-max to build an interactive 3×3 cube face-turn explorer. Define the move notation and viewing convention, let me apply face turns, undo moves, pause playback, and reset. Verify that a move followed by its inverse restores the state and four quarter-turns restore that face-turn cycle. Do not add a solver unless it is actually implemented.

Check the state after animation completes, not just how a turn looks. Buttons, stickers, move notation, and undo must agree. The pilot concerns face turns and state playback; it does not imply a solving algorithm.

## Ask for a look

These three name an art direction rather than a subject. The agent should resolve the matching catalog record, paste its `defaults` values into the scene, and say in the design system which numbers it changed and why. Like every prompt here, they are starting points; no result below has been generated, rendered and certified.

> Use 3dviz-pro-max to build a riverside lantern festival I can walk the camera through at dusk: paper lanterns over dark water, warm reflections, people-sized boats. Make the lanterns the brightest thing in frame and let the rest fall away.

The named look is `knowledge.style-lantern-festival-riverside`; the mood rig is `knowledge.lighting-mood-night-lantern`. Check that the practicals actually carry the scene rather than a global light doing the work, and that the reflections come from something in the scene.

> Use 3dviz-pro-max to make my city block look like a tabletop model — miniature, sharply focused in the middle, soft at both ends, bright toy colours seen from above.

The named look is `knowledge.style-tilt-shift-diorama`. It deliberately turns fog off, because aerial haze destroys the miniature illusion; the agent should keep that opt-out and state it rather than adding atmosphere by reflex.

> Use 3dviz-pro-max to build a neon-noir street corner in the rain: wet asphalt, hard signage colours, one figure lit from behind, everything else in shadow.

The named look is `knowledge.style-neon-noir-rain`, paired with `knowledge.lighting-mood-noir-hard-key`. It is one of the two records that specify AgX rather than ACES filmic tone mapping, so the agent should apply the tone mapping the record states instead of the project default.

## Combine ideas

> Build a fantasy workshop where a selected machine demonstrates a linear transformation. Use the village as creative framing, but keep the matrix, basis vectors, and calculated geometry accurate. Clearly distinguish the fictional setting from the mathematical explanation. Keep the controls easy to find and verify their effects.

This is an exploratory composition prompt, not an additional tested recipe. Creative combinations are welcome even when the catalog does not contain an exact match.

## Follow-up edits

> Keep the scene and its interactions. Change the lighting to sunset and improve the camera framing, then verify that selection and reset still work.

> Reduce the motion so the explanation is easier to follow. Keep the calculated state unchanged and make the pause control accessible by keyboard.

> Show me the current design system and validation report. Separate what you observed in the running artifact from what remains untested.

Small revisions should update the relevant scene decisions without requiring a fresh full specification. To contribute a result to the gallery, include the original prompt, meaningful revisions, artifact revision, host/runtime details, checks, media rights, and any limitations; see [contributing data](contributing-data.md).

## Inspectable objects and physical interaction

> Build a detailed workshop in Three.js. Choose two hero objects and model their construction, joints and materials clearly. Let me inspect them close up and run a repeatable physical action with reset. Use a suitable solver for coupled contact, keep solver state authoritative, and make the cause and response visible. Choose illustrative parameters explicitly; research any engineering claims. Keep the art direction expressive.

> Improve this scene using object-level knowledge: identify which objects look generic, which parts explain their function, and which interaction would reveal their physical behavior. Retrieve only the useful archetypes, materials, behavior and tool-adapter records. Implement the changes and inspect their actual results.
