# Loop Charter

## Goal
Improve `lmstudio-cli` into a reusable, support-backed LM Studio operations skill with clearer trigger boundaries, stronger downstream wiring guidance, and a lightweight validation harness.

## Current Baseline
- Existing artifact: `.agent-skills/lmstudio-cli/SKILL.md`
- Current weaknesses: no `references/`, no `evals/`, no helper scripts, thin description, and little explicit guidance for local-vs-remote or OpenAI-compatible-vs-native LM Studio workflows.

## Mutable Artifact
Primary file: `.agent-skills/lmstudio-cli/SKILL.md`

Supporting files allowed if they directly strengthen the same skill:
- `.agent-skills/lmstudio-cli/SKILL.toon`
- `.agent-skills/lmstudio-cli/references/*`
- `.agent-skills/lmstudio-cli/evals/evals.json`
- `.agent-skills/lmstudio-cli/scripts/*`
- discovery metadata entries that must stay aligned with the rewritten skill

## Fixed Evaluation Harness
- Agent Skills structure requirements via `skill-standardization/scripts/validate_skill.sh`
- Trigger quality test: description should clearly activate on LM Studio / `lms` / local OpenAI-compatible endpoint wiring prompts without broadening into generic local-LLM comparison work
- Dry-run usefulness test: 3 realistic prompts in `evals/evals.json`
- Catalog consistency check: repo-local manifest entry must match the updated description for `skills.json`

## Constraints
- Keep scope bounded to `lmstudio-cli` and directly dependent discovery/support files
- No new overlapping local-model skill unless the existing skill is unsalvageable
- Prefer transferable route-out and verification guidance over one-off host-specific hacks
- Save research artifacts under `.survey/lmstudio-cli-modernization-20260415/`

## Tried Already
- Keep: compact-variant completion added `SKILL.toon` coverage for `lmstudio-cli`
- Revisit now: the skill still lacks the support bundle and validation depth seen in other modernized high-utility skills
