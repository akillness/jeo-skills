# Platform Map
## Settings
- Keep required five keyword families for hourly candidate sweep.
- Add open-PR backlog threshold setting to gate new PR creation.

## Rules
- If backlog threshold exceeded, prioritize merge carry-forward workflow before new candidate PR.
- Preserve survey artifacts and degraded-cause reporting regardless of gate outcome.

## Hooks
- `gh api search/repositories` for keyword sweep evidence.
- `gh pr list --state open` for backlog measurement.

## Platform Gaps
- Search-lane quality gates exist, but merge-queue saturation gate is currently implicit.

## Provenance
- indexed snippet
- direct page retrieval
