# Twisty Puzzles

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Wide turns and inner slices on larger cubes](../../data/recipes/big-cube-wide-turns.json) — `recipe.big-cube-wide-turns`: Model a larger cube where a move addresses a contiguous range of layers and centre pieces carry individual identity even when they look interchangeable.
- [Commutators and conjugates as piece tools](../../data/recipes/commutator-conjugate-tools.json) — `recipe.commutator-conjugate-tools`: Build move sequences that touch few pieces and show why the algebraic form produces that effect.
- [Reachable cube states and their invariants](../../data/recipes/cube-state-invariants.json) — `recipe.cube-state-invariants`: Let a viewer build an impossible cube on purpose and have the model name which invariant is broken.
- [Direct-manipulation cube turns](../../data/recipes/direct-turn-cube.json) — `recipe.direct-turn-cube`: Translate face gestures into legal discrete moves while separating camera orbit.
- [Reversible guided layer-method tutorial](../../data/recipes/guided-layer-method-tutorial.json) — `recipe.guided-layer-method-tutorial`: Turn a declared beginner layer sequence into inspectable goal predicates, legal move demonstrations, learner commits, hints and exact step-level undo rather than an irreversible animation playlist.
- [Imported 3×3 state and solver-result verification](../../data/recipes/imported-cube-state-solver-verification.json) — `recipe.imported-cube-state-solver-verification`: Parse an imported 3×3 state independently of local move history, validate inventory and reachability, call a versioned solver adapter, then replay and verify its returned moves against the imported state.
- [Piece permutation cycle explorer](../../data/recipes/permutation-cycles.json) — `recipe.permutation-cycles`: Show where pieces move without mistaking position cycles for complete puzzle state.
- [Pyraminx legal-move state and turn player](../../data/recipes/pyraminx-legal-move-state.json) — `recipe.pyraminx-legal-move-state`: Drive a tetrahedral twisty puzzle from versioned discrete piece permutations and orientations, including distinct main-layer and tip moves, without inferring state from mesh transforms.
- [3 by 3 cube face-turn player](../../data/recipes/twisty-cube-3x3-face-turns.json) — `recipe.twisty-cube-3x3-face-turns`: Model legal outer-layer turns with exact discrete state and animate their presentation without using mesh transforms as the puzzle state.
- [Twisty-puzzle mechanism cutaway and turn explanation](../../data/recipes/twisty-mechanism-cutaway.json) — `recipe.twisty-mechanism-cutaway`: Use a patent-grounded 3×3 mechanism example to explain how centers, sliding piece connectors and an interior element retain pieces while a face layer turns, clearly labeling illustrative clearance and physics limits.
