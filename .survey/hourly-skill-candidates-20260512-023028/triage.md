# Triage
- Problem: Hourly skill discovery must maintain five-lane coverage and recommendation quality while open PR #271 is blocked by missing checks.
- Audience: Maintainers of akillness/oh-my-skills and reviewers of automated hourly runs.
- Why now: Keep development cadence without creating duplicate PRs and provide auditable evidence/provenance.

## Workflow Context
- Provenance label: indexed snippet (gh search repos)
- Open-PR gate active: yes (PR #271)
- Merge gate: blocked when checks are not reported.

## Affected Users
- Skill maintainers relying on unattended survey updates.
- Reviewers validating recommendation quality and lane balance.

## Current Workarounds
- Carry forward improvements on existing PR branch.
- Add blocker comment with deterministic CI bootstrap steps.

## Adjacent Problems
- Sparse lanes can produce low-fit candidates.
- Missing checks prevents merge even with valid artifacts.

## User Voices
- Priority is development/progression contributions over maintenance-only edits.
