# Loop Charter

## Goal
Reduce `autoresearch` front-door bloat while preserving trigger precision and the ML-specific boundary with `skill-autoresearch` and app-level eval platforms.

## Current Baseline
- `autoresearch/SKILL.md` is valid and support-complete, but it is still 333 lines and remains on the graph watchlist for oversized front doors.
- The current best version already separates ML search from `skill-autoresearch`; this run should improve structure, not change the lane.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/autoresearch/SKILL.md`

## Fixed Evaluation Harness
- Existing repo conventions from `skill-standardization`
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/autoresearch`
- Representative prompts:
  1. setup + first baseline run on a 40GB GPU
  2. write or update `program.md`
  3. monitor / interpret `results.tsv`
  4. low-VRAM adaptation without changing the evaluator
  5. route-out case for `SKILL.md` optimization / app eval tooling
- Scoring rubric:
  - trigger clarity stays explicit
  - ML-only boundary stays explicit
  - front door chooses modes instead of re-explaining everything
  - deep detail lives in references/scripts
  - compact/discovery surfaces remain in sync if wording changes materially

## Constraints
- Max scope: one structural hardening pass in this run
- Prefer one focused new reference over multiple new files
- No new neighboring skill
- Keep existing scripts unless a script bug is directly discovered
- Update README / README.ko / setup prompt / catalog surfaces only if the final wording changes materially

## Tried Already
- Keep: 2026-04-16 boundary hardening that clarified ML-vs-skill-autoresearch ownership
- Revert: any direction that broadens `autoresearch` into generic eval, observability, or repo-local prompt/skill optimization
- Why: the durable gap now is front-door size and route selection, not missing category coverage
