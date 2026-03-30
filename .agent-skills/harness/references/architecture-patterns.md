# Harness Architecture Patterns

Use this file when the correct topology is not obvious.

## Pattern chooser

| Pattern | Best for | Risk to watch |
|---------|----------|---------------|
| `pipeline` | strict sequential dependencies | one blocked step stalls the whole system |
| `fan-out/fan-in` | parallel independent exploration with synthesis | weak merge stage ruins good lane work |
| `producer-reviewer` | quality-sensitive generation | endless loops if revision limits are missing |
| `expert-pool` | selective invocation based on request type | router mistakes hide the right expert |
| `supervisor` | dynamic assignment over many tasks | central bottleneck and coordination overhead |
| `hybrid` | different phases need different patterns | unclear ownership between phases |

## Selection rules

1. If tasks must happen in a strict order, use `pipeline`.
2. If multiple viewpoints can explore the same input independently, use `fan-out/fan-in`.
3. If quality review must challenge generation before handoff, use `producer-reviewer`.
4. If only some experts are needed depending on input, use `expert-pool`.
5. If the work queue changes during execution, use `supervisor`.
6. If one pattern fits discovery and another fits delivery, use `hybrid`.

## Ownership rule

No matter which pattern you choose, assign file ownership before execution. Two parallel lanes editing the same file is a harness bug, not a coordination detail.

## Native vs adapter note

On Claude, these patterns can map closely to Agent Teams. On other platforms, keep the pattern description stable and swap only the transport layer.
