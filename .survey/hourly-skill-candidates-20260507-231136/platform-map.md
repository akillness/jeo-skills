# Platform Map
## What People Actually Use
- GitHub indexed snippet search
- direct page retrieval for repo metadata checks

## Frequency Ranking
- lane-health review per mandatory lane

## Key Gaps
- checks not reported on hourly carry-forward branches

## Contradictions
- Mergeable diffs without CI signal

## Key Insight
- Continue cadence on existing PR branch while merge is blocked.

## Settings
- Mandatory lanes: 5
- freshness window: 24 months
- signal floor: stars >= 3

## Rules
- open PR >= 1 => no new branch/PR
- no checks reported => do not merge

## Hooks
- validate_survey_artifacts.py .survey/<slug> --platform-topic --require-provenance

## Platform Gaps
- intermittent missing check reporting for branch-based hourly runs

Provenance: indexed snippet, direct page retrieval.
