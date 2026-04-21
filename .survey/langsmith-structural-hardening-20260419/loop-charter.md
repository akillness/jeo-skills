# Loop Charter

## Goal
Improve `langsmith` so it matches the repo's routing-first hardening pattern: one primary LangSmith mode per request, one compact output packet, sharper route-outs, and synced discovery surfaces.

## Current Baseline
Baseline files:
- `.agent-skills/langsmith/SKILL.md`
- `.agent-skills/langsmith/SKILL.toon`
- `.agent-skills/langsmith/references/*`
- `.agent-skills/langsmith/evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

Baseline quality:
- `langsmith/SKILL.md` is useful but still oversized (~290 lines) compared with the repo's newer packet-first front doors.
- Existing references are solid, but the front door still carries too much mode detail and output-shape explanation.
- Discovery surfaces are accurate but flatter than the sharper routing boundary suggested by the current graph and survey evidence.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/langsmith/SKILL.md`

Supporting artifacts allowed in the same run:
- `.agent-skills/langsmith/SKILL.toon`
- `.agent-skills/langsmith/references/`
- `.agent-skills/langsmith/evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: must clearly separate LangSmith tracing/evals/review/prompt-registry/propagation work from generic observability, debugging, deployment, and data-analysis work
- Structural goal: reduce front-door sprawl while preserving the existing six-mode contract
- Dry-run prompts: existing evals plus at least one prompt-registry or multi-service propagation packet case
- Docs/discovery sync: `skills.json`, `skills.toon`, README surfaces, and `SKILL.toon` must all reflect the hardened routing-first trigger surface

## Constraints
- Max one coherent improvement set this run
- No new overlapping observability/eval skill
- Prefer shrinking/routing over adding broad new content
- Keep support-file additions bounded and directly useful
- Preserve truthful LangSmith-specific route-outs and config guidance

## Tried Already
- Keep: the earlier LangSmith modernization that established the six-mode workflow and support files
- Revert: broadening LangSmith into generic monitoring, deployment, or universal LLM platform ownership
- Why: the repo benefits more from tighter packet boundaries and synced discovery surfaces than from catalog growth
