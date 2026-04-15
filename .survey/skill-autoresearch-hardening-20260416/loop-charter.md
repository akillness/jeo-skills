# Loop Charter

## Goal
Improve `skill-autoresearch` so it better supports bounded repo-local skill optimization loops: frozen evaluator, explicit keep-or-revert ratcheting, repeat-run handling for non-determinism, and support artifacts that make the workflow reusable.

## Current Baseline
- Primary artifact: `.agent-skills/skill-autoresearch/SKILL.md`
- Current strengths: clear mutation-loop concept, binary eval guide reference, artifact expectations.
- Current weaknesses: no `evals/evals.json`, weak emphasis on frozen evaluation harness, limited guidance for repeatable dry runs, and positioning that undersells the repo-local niche versus hosted eval platforms.

## Mutable Artifact
Primary file: `.agent-skills/skill-autoresearch/SKILL.md`

Supporting files allowed this run:
- `.agent-skills/skill-autoresearch/SKILL.toon`
- `.agent-skills/skill-autoresearch/evals/evals.json`
- `.agent-skills/skill-autoresearch/references/*`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`
- `.survey/skill-autoresearch-hardening-20260416/*`

## Fixed Evaluation Harness
- Skill spec / validator: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/skill-autoresearch`
- Catalog sync: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills --json`
- Evals JSON validity: `python3 -m json.tool .agent-skills/skill-autoresearch/evals/evals.json`
- Dry-run rubric:
  1. clearly states when to use the skill,
  2. freezes evaluator/test prompts before mutation,
  3. keeps one meaningful change per iteration,
  4. requires keep-or-revert logging,
  5. leaves a reusable artifact package.

## Constraints
- Max one coherent improvement set this run.
- Prefer strengthening existing skill + support files over adding a new skill.
- No product code generation; research and skill-maintenance only.
- Keep changes transferable across multiple skill-maintenance prompts.
- Update discovery docs if positioning/discoverability changes materially.

## Tried Already
- Keep: repo-wide pattern of modernizing canonical skills instead of spawning new overlaps.
- Keep: survey-first, graph-backed, wiki-backed maintenance loop.
- Revert: broad keyword stuffing, duplicate skill creation, unfrozen evaluator changes.
- Why: the maintenance loop compounds only when the benchmark stays comparable and the resulting skill is easier to trigger and reuse.
