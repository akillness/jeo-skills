# Loop Charter

## Goal
Improve the practical usefulness of `.agent-skills/bmad-gds/SKILL.md` by turning it from a generic phase/command catalog into a clearer game-production orchestration skill with better trigger precision, stronger boundaries to adjacent game skills, and reusable support artifacts.

## Current Baseline
`bmad-gds` currently lists many phases and commands but does not clearly define intake structure, routing boundaries, or the concrete coordination artifacts it should output. It has no `references/` or `evals/` support files.

## Mutable Artifact
Primary file: `.agent-skills/bmad-gds/SKILL.md`

Supporting files allowed if the primary change proves useful:
- `.agent-skills/bmad-gds/references/*`
- `.agent-skills/bmad-gds/evals/evals.json`
- repo discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`)
- survey / wiki / graph artifacts for this run

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: `bmad-gds` should win cross-phase game orchestration prompts but lose specialist prompts to narrower game skills
- Execution clarity: deterministic intake, routing, output format, and boundaries must be explicit
- Dry-run prompts:
  1. "Turn this vague co-op survival idea into a milestone brief for a 3-person Unity team targeting a Steam demo in 8 weeks."
  2. "We have playtest notes, a bug list, and a Next Fest date — what should the team do next?"
  3. "Our Unreal build is failing in CI; help fix the packaging error." (should route out)
- Supporting-file check: add references/evals only if they sharpen behavior rather than pad the directory

## Constraints
- Keep this run bounded to one primary skill modernization, not a broad game-cluster rewrite
- Prefer consolidation and better routing over adding a new overlapping skill
- Update docs/setup surfaces only where `bmad-gds` positioning materially changes
- Keep claims grounded in repo context plus survey artifacts from this run

## Tried Already
- Keep: prior runs improved PM and frontend canonicalization by sharpening one canonical skill and narrowing overlaps
- Revert: adding new overlapping skills without clearer boundaries
- Why: transferable value comes from stronger routing and support coverage, not a noisier catalog
