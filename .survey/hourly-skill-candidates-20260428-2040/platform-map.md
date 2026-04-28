# Platform Map
## Settings
- Codex/Hermes unattended runs: require deterministic lane metrics and recommendation integrity checks before PR merge.

## Rules
- Preserve raw discovery breadth, but dedupe recommendation-grade keeps globally.
- Assign each recommended repo to one primary lane; record overlaps separately.

## Hooks
- Validator remains unchanged; dedupe/overlap checks are pre-PR synthesis logic.

## Platform Gaps
- Current survey skill defines per-lane metrics but not cross-lane dedupe semantics.
