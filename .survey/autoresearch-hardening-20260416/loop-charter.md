# Loop Charter

## Goal
Harden the `autoresearch` skill so it clearly owns Karpathy-style GPU-bound ML experimentation, gains a reusable eval harness, and stays clearly separated from repo-local `skill-autoresearch` maintenance loops.

## Current Baseline
- `autoresearch` already has scripts/ and references/ but no `evals/evals.json`.
- The skill body is informative, but its trigger/boundary language can still blur with the newer `skill-autoresearch` lane.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/autoresearch/SKILL.md`

## Fixed Evaluation Harness
- Skill validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/autoresearch`
- JSON validation for any new eval file: `python3 -m json.tool .agent-skills/autoresearch/evals/evals.json`
- Catalog sync: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills --json`
- Dry-run prompts:
  1. "Help me set up Karpathy autoresearch on a 40GB GPU and write program.md."
  2. "I want to optimize a SKILL.md with fixed evals and keep/revert scoring."
  3. "My overnight autoresearch loop keeps crashing from VRAM pressure and metric drift."
- Ratchet rule: keep only changes that improve ML-specific trigger clarity, route-out clarity, or reusable support coverage without broadening scope.

## Constraints
- One coherent bounded improvement set this run.
- Support files allowed: `evals/evals.json`, compact/discovery surfaces, README surfaces, wiki, graph outputs.
- Do not create a new overlapping autoresearch wrapper.
- Do not change unrelated skills in the same run.

## Tried Already
- Keep: merged `skill-autoresearch` hardening first to reduce overlap before surveying `autoresearch`.
- Revert: none yet for this run.
- Why: the active PR was clean and should not stay open while planning the next bounded improvement.
