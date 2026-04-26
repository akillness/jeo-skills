# Hourly Survey Lane-Query-Transcript Ratchet (2026-04-27)

## Question
How can we keep degraded lane decisions auditable in unattended hourly survey runs when stage retries return sparse or zero results?

## Answer
Add a deterministic lane query transcript requirement to survey guidance: each lane must record `primary`, `stage1`, and `stage2` queries (when attempted), with result counts and stderr pointers. This keeps retrieval scarcity distinct from ecosystem scarcity and prevents ambiguous degraded outcomes.

## Evidence Snapshot
- Run slug: `hourly-skill-candidates-20260427-083908`
- Lane outcomes: pass=3, degraded=2 (`web-frontend-skill`, `web-backend-skill`)
- Both degraded lanes showed zero retained candidates after deterministic retry attempts.
- Provenance: `indexed snippet` (gh search) + `direct page retrieval` (gh api + raw README fetch)

## Landed Changes
1. Updated survey reference to require lane query transcript capture and explicit degraded-cause `no-results` usage for empty-lane outcomes.
2. Updated survey SKILL.md to require recording stage query transcript fields in evidence artifacts.
3. Added documentation onboarding for a new recommendation-grade candidate: `flutter-bloc-clean-architecture-skill`.

## Artifacts
- `.survey/hourly-skill-candidates-20260427-083908/evidence.json`
- `.survey/hourly-skill-candidates-20260427-083908/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260427-083908/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260427-083908/validation.txt`

## Risk / Rollback
- Risk: minimal (docs/process change only; no runtime codepath edits).
- Rollback: revert this run's commit or revert affected markdown files.
