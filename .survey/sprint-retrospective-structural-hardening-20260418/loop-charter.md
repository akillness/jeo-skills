# Loop Charter

## Goal
Improve `sprint-retrospective` so it behaves like the repo's newer routing-first PM anchors: smaller front door, clearer packet separation, stronger mode routing, and truthful discovery surfaces.

## Current Baseline
- `.agent-skills/sprint-retrospective/SKILL.md` is 304 lines.
- The skill is conceptually correct and already has `references/` + `evals/`, but the front door still carries more stable heuristics and packet detail than the repo's recent hardening pattern prefers.
- Discovery surfaces currently describe the skill accurately at a high level, but they do not yet reflect a packet-first structural hardening pass.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/sprint-retrospective/SKILL.md`

Supporting artifacts allowed if the primary rewrite justifies them:
- `.agent-skills/sprint-retrospective/references/*`
- `.agent-skills/sprint-retrospective/evals/evals.json`
- `.agent-skills/sprint-retrospective/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `graphify-out/*`
- `.agent-skills-wiki/*`

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/sprint-retrospective`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills`
- JSON parse checks for `evals/evals.json` and `.agent-skills/skills.json`
- Manual rubric:
  - description stays trigger-oriented and truthful
  - front door gets shorter and more scannable
  - PM-cluster route-outs stay explicit
  - no new overlapping PM skill is introduced

## Constraints
- One coherent bounded change set
- Prefer moving durable detail to `references/` rather than adding new front-door prose
- Keep README / README.ko / setup prompt synced if discovery wording changes materially
- Keep graph + wiki updates factual and append-only

## Tried Already
- Keep: 2026-04-12 modernization added mode selection, support files, and evals.
- Revert: adding another PM ceremony skill or broadening retros into planning / estimation / standups.
- Why: the cluster already has the right role split; the remaining problem is dense-anchor cleanup.
