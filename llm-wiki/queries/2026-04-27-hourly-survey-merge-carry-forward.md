# Hourly survey merge carry-forward (2026-04-27)

## Question
How should the hourly loop handle a previously researched low-risk ratchet that remained unmerged due run interruption?

## Answer
Carry forward the unmerged, evidence-backed ratchet in the next run, regenerate current survey artifacts, and complete PR→self-review→merge in one pass.

## Evidence
- Survey artifacts: `.survey/hourly-skill-candidates-20260427-195430/`
- RTK summary: `.survey/hourly-skill-candidates-20260427-195430/rtk-summary.md`
- Graphify refinement: `.survey/hourly-skill-candidates-20260427-195430/graphify-refined.json`
- Prior candidate rationale: `.survey/hourly-skill-candidates-20260427-1828/solutions.md`

## Ratchet
- Keep explicit guard for `gh search repos` empty-success payload (`[]` + exit 0) before lane finalization.
- Prefer deterministic fallback endpoint form: `gh api "search/repositories?..."`.
- Preserve fallback stderr artifacts and provenance labels for reviewer auditability.
