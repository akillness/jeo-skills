# Logic Circuits

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Bit-vector SMT: model, wraparound and proof boundary](../../data/recipes/bit-vector-smt-model-proof.json) — `recipe.bit-vector-smt-model-proof`: Keep width, modular arithmetic, signed interpretation and solver evidence explicit.
- [Critical path and combinational delay](../../data/recipes/critical-path-delay.json) — `recipe.critical-path-delay`: Make timing a property of paths through a circuit, with the longest path selected by summation rather than by appearance.
- [Clocked finite-state machine explorer](../../data/recipes/finite-state-machine.json) — `recipe.finite-state-machine`: Separate present state, next state and committed clock transitions.
- [One-bit full adder](../../data/recipes/full-adder.json) — `recipe.full-adder`: Connect sum and carry outputs to all three input bits.
- [Boolean gate workbench](../../data/recipes/logic-gates.json) — `recipe.logic-gates`: Make a combinational circuit explain its output for each input combination.
- [Natural deduction: proof trees and assumption scope](../../data/recipes/natural-deduction-scope-tree.json) — `recipe.natural-deduction-scope-tree`: Inspect why each inference is licensed and which assumptions remain open.
- [Pipelining, latency and throughput](../../data/recipes/pipeline-throughput.json) — `recipe.pipeline-throughput`: Separate how long one item takes from how often items finish, and tie both to the slowest stage.
- [SAT: a model versus a checked refutation](../../data/recipes/sat-model-resolution-refutation.json) — `recipe.sat-model-resolution-refutation`: Separate one successful assignment from a proof that no assignment can work.
- [Setup, hold and the clock period budget](../../data/recipes/setup-hold-timing.json) — `recipe.setup-hold-timing`: Show a register timing budget as a scene where violating a window has a visible, named consequence.
- [SMT arithmetic: integer and real models](../../data/recipes/smt-arithmetic-model-status.json) — `recipe.smt-arithmetic-model-status`: Compare exact arithmetic domains and preserve solver uncertainty in the display.
