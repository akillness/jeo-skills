# Algorithms Data Structures

Generated from canonical data. Read only the records relevant to the task.

[Back to catalog](../catalog-index.md)

Use the optional `scripts/resolve.py <record-id>` helper to read one record with its sources.

- [Binary heap, sift operations and heapsort](../../data/recipes/binary-heap-operations.json) — `recipe.binary-heap-operations`: Show one structure in two views at once: the array indices that own the data and the tree that explains the ordering.
- [Breadth-first search and shortest edge counts](../../data/recipes/breadth-first-frontier.json) — `recipe.breadth-first-frontier`: Expose discovery order, the FIFO queue and shortest paths on a small unweighted graph.
- [Dijkstra distances and edge relaxation](../../data/recipes/dijkstra-relaxation.json) — `recipe.dijkstra-relaxation`: Compare tentative distances with settled shortest distances while stepping edge relaxations.
- [Imported 3×3 state and solver-result verification](../../data/recipes/imported-cube-state-solver-verification.json) — `recipe.imported-cube-state-solver-verification`: Parse an imported 3×3 state independently of local move history, validate inventory and reachability, call a versioned solver adapter, then replay and verify its returned moves against the imported state.
- [KMP pattern DFA: prefix recovery on mismatch](../../data/recipes/kmp-prefix-pattern-dfa.json) — `recipe.kmp-prefix-pattern-dfa`: Derive transition behavior from a concrete pattern and explain why a mismatch can preserve a partial match.
- [Memory allocation: one first-fit fragmentation trace](../../data/recipes/memory-allocation-fragmentation-trace.json) — `recipe.memory-allocation-fragmentation-trace`: Replay one address-ordered heap so allocation failure, internal waste and external holes remain distinct.
- [Recursion, call stack and backtracking](../../data/recipes/recursion-call-stack.json) — `recipe.recursion-call-stack`: Build the call stack as a physical stack so that returning is popping, and let a backtracking search grow and prune it.
- [Stable mergesort with persistent item identity](../../data/recipes/stable-merge-sort-trace.json) — `recipe.stable-merge-sort-trace`: Track duplicate-valued items through recursive splitting and stable merging.
- [Kruskal, union-find and the cut property](../../data/recipes/union-find-mst.json) — `recipe.union-find-mst`: Show component membership as a first-class object so that rejecting an edge has a visible reason.
