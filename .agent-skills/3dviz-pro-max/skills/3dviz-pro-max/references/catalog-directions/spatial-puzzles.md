# Spatial Puzzles

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Interlocking burr and its disassembly order](../../data/recipes/burr-disassembly-order.json) — `recipe.burr-disassembly-order`: Design an interlocking puzzle whose only freedom at each step is a short list of legal slides, and expose that list.
- [Exact cover packing with a real search](../../data/recipes/exact-cover-packing.json) — `recipe.exact-cover-packing`: Keep the search honest: a packing scene either runs a real backtracking search or replays a recorded one, and says which.
- [Towers of Hanoi and its optimal move bound](../../data/recipes/hanoi-optimal-bound.json) — `recipe.hanoi-optimal-bound`: Let a viewer play the puzzle while the known minimum move count stays visible as a target rather than a decoration.
- [Layered maze route puzzle](../../data/recipes/layered-maze-navigation.json) — `recipe.layered-maze-navigation`: Navigate a designed stacked maze while retaining an exact cell-and-link path history.
- [Pyraminx legal-move state and turn player](../../data/recipes/pyraminx-legal-move-state.json) — `recipe.pyraminx-legal-move-state`: Drive a tetrahedral twisty puzzle from versioned discrete piece permutations and orientations, including distinct main-layer and tip moves, without inferring state from mesh transforms.
- [Sliding block escape board](../../data/recipes/sliding-block-escape.json) — `recipe.sliding-block-escape`: Slide authored rectangular blocks along constrained axes toward a visible exit.
- [Voxel packing tray puzzle](../../data/recipes/voxel-packing-tray.json) — `recipe.voxel-packing-tray`: Place authored polycube pieces into a small grid volume using exact occupied cells.
