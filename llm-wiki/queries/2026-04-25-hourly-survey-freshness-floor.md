# Hourly survey run — freshness floor ratchet

## Question
How should hourly survey runs reduce noisy keyword matches without losing mandatory lane coverage?

## Answer
Use a recommendation-grade relevance gate: keep lane coverage evidence intact, but only keep candidates with explicit license and recent `pushed_at` (<=24 months) unless an exception rationale is documented.

## Evidence
- Survey artifact: `.survey/hourly-skill-candidates-20260425-040717/evidence.json`
- Required lanes covered and metadata captured via gh search repos.

## Proposed repo change
- Update `.agent-skills/survey/SKILL.md` and `.agent-skills/survey/SKILL.toon` with explicit freshness floor language.
- Add eval to enforce stale-repo exclusion by default.
- Update `references/keyword-sweep-and-relevance-rescue.md` with a concrete freshness gate.
