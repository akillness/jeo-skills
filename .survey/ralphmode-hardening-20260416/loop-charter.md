# Loop Charter

## Goal
Improve the reusable quality of `ralphmode` without broadening it into another orchestration runtime skill.

## Current Baseline
`ralphmode` already has a reasonably sharp cross-platform permission-profile body plus `references/permission-profiles.md`, but it is still missing `evals/evals.json` and could state the portable settings / rules / hooks mental model more explicitly.

## Mutable Artifact
Primary: `.agent-skills/ralphmode/SKILL.md`
Supporting: `.agent-skills/ralphmode/evals/evals.json`, `.agent-skills/ralphmode/SKILL.toon`, discovery copy only if the description changes materially.

## Fixed Evaluation Harness
- Agent Skills validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/ralphmode`
- Compact/discovery sync when the description changes: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills --json`
- JSON validity for evals: `python3 -m json.tool .agent-skills/ralphmode/evals/evals.json`
- Dry-run check against representative prompts:
  1. cross-platform repo-safe automation setup
  2. sandbox-only YOLO / bypass guidance
  3. hooks vs prompt-contract comparison
  4. false-positive check against a generic orchestration-runtime request

## Constraints
- Bounded run: one skill-centered improvement set only.
- Do not create a new overlapping permission or orchestration wrapper.
- Preserve `ralphmode` as the permission/profile layer, not the runtime anchor.
- Prefer transferable improvements (trigger clarity, route boundaries, eval coverage) over syntax churn.

## Tried Already
- Keep: repo-local first, sandbox-only full bypass, secret/destructive-command denylist, cross-platform references.
- Target for this run: explicit settings/rules/hooks framing and eval coverage.
- Revert if the change broadens scope into `ralph`, `jeo`, `omc`, `omx`, or `ohmg` runtime ownership.
