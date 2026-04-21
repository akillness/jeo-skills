# Loop Charter

## Goal
Improve `git-workflow` so it activates faster and behaves like the repo's newer routing-first dense anchors without creating a duplicate Git wrapper.

## Current Baseline
- `git-workflow/SKILL.md` is 298 lines.
- The skill already has two references and eval coverage.
- The wiki says the developer-workflow lane is structurally clean; the remaining gain is front-door quality, not missing support folders.

## Mutable Artifact
Primary: `.agent-skills/git-workflow/SKILL.md`

Supporting artifacts allowed only if the primary change proves worthwhile:
- `.agent-skills/git-workflow/SKILL.toon`
- `.agent-skills/git-workflow/references/*`
- `.agent-skills/git-workflow/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- wiki / graph / survey artifacts for this run

## Fixed Evaluation Harness
- Agent Skills validator: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/git-workflow`
- Catalog sync validator: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills`
- JSON parse checks for `evals/evals.json`, `.agent-skills/skills.json`, and `graphify-out/graph.json`
- Trigger/fit rubric:
  1. front door gets shorter and more router-like
  2. local Git boundary stays sharper, not blurrier
  3. compact/discovery surfaces stay truthful
  4. no duplicate skill is introduced

## Constraints
- One bounded skill-focused change set for this run
- No new overlapping Git skill
- Prefer moving detail to references over adding more top-level prose
- Keep docs/setup updates scoped to discovery wording affected by the change
- Keep the PR coherent enough to stand alone

## Tried Already
- Keep: 2026-04-12 modernization established the canonical local Git anchor with boundary + recovery references
- Revert: adding another Git-adjacent wrapper or mixing hosted PR operations into `git-workflow`
- Why: the cluster already has a clean owner; the remaining problem is front-door density, not missing category coverage
