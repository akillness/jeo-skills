# Loop Charter

## Goal
Improve `pattern-detection` so it matches the repo's routing-first hardening pattern: one primary detection packet per request, one compact detection brief, sharper route-outs, and synced discovery surfaces.

## Current Baseline
Baseline files:
- `.agent-skills/pattern-detection/SKILL.md`
- `.agent-skills/pattern-detection/SKILL.toon`
- `.agent-skills/pattern-detection/references/*`
- `.agent-skills/pattern-detection/evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

Baseline quality:
- `pattern-detection/SKILL.md` is useful, but it still carries more mode detail in the front door than the repo's newer packet-first skills.
- Existing support docs cover detection modes and confidence checks, but the primary skill file still behaves like a broad explainer instead of a smaller intake router.
- Compact discovery surfaces are stale: `SKILL.toon` and `.agent-skills/skills.toon` still describe the skill as generic trend detection.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/pattern-detection/SKILL.md`

Supporting artifacts allowed in the same run:
- `.agent-skills/pattern-detection/SKILL.toon`
- `.agent-skills/pattern-detection/references/`
- `.agent-skills/pattern-detection/evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: must clearly separate pattern/rule/anomaly hunting from root-cause log triage, stakeholder-ready data analysis, repo navigation, security remediation, and alert/incident operations
- Structural goal: reduce front-door sprawl while preserving the four-mode contract (`text-prefilter`, `structural-code-rule`, `log-event-pattern`, `metric-anomaly`)
- Dry-run prompts: existing evals plus at least one alert-vs-analysis or remediation route-out case
- Docs/discovery sync: `skills.json`, `skills.toon`, README surfaces, and `SKILL.toon` must all reflect the hardened routing-first trigger surface

## Constraints
- Max one coherent improvement set this run
- No new overlapping anomaly, observability, or security skill
- Prefer shrinking/routing over adding broad new content
- Keep support-file additions bounded and directly useful
- Preserve truthful route-outs for `log-analysis`, `data-analysis`, `codebase-search`, `security-best-practices`, and `monitoring-observability`

## Tried Already
- Keep: the earlier modernization that established the four detection modes, support docs, and eval coverage
- Revert: broadening `pattern-detection` into a generic security scan, full KPI analysis, or log-debugging skill
- Why: the repo benefits more from tighter packet boundaries and synced discovery surfaces than from catalog growth
