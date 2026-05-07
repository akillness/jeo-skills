# Triage
- Problem: Hourly survey needs deterministic lane coverage and recommendation-quality filtering with provenance labels.
- Audience: Maintainers of akillness/oh-my-skills survey automation.
- Why now: Existing open PR has no checks reported; we still need carry-forward artifacts and low-risk quality hardening.

## Workflow Context
direct page retrieval + indexed snippet via GitHub search API (`gh search repos --json ...`).

## Affected Users
Repository maintainers and downstream users consuming generated survey artifacts.

## Current Workarounds
Manual PR triage, ad-hoc lane recovery, and inconsistent provenance placement.

## Adjacent Problems
License-shape drift, stale candidate inclusion, single-lane concentration blind spots.

## User Voices
- "Open PR exists: do not create new PR"
- "Keep cadence by adding actionable artifacts"
- Provenance labels required in markdown (`--require-provenance`).
