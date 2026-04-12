# Loop Charter

## Goal
Upgrade `.agent-skills/testing-strategies` from a legacy generic test-pyramid skill into a modern risk-based validation-policy skill that clearly routes implementation and diagnosis to neighboring skills.

## Current Baseline
Current `testing-strategies/SKILL.md` is a broad 1.0-era skill with sample unit/integration/E2E code, weak trigger wording, no supporting references, no evals, and blurry overlap with `backend-testing`, `test-driven-development`, `debugging`, and `code-review`.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/testing-strategies/SKILL.md`

Supporting artifacts allowed only if the primary rewrite is kept:
- `.agent-skills/testing-strategies/references/*`
- `.agent-skills/testing-strategies/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki and graph outputs reflecting the accepted change

## Fixed Evaluation Harness
- Agent Skills spec expectations from `.agent-skills/skill-standardization`
- Validation script: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/testing-strategies`
- JSON validation: `python3 -m json.tool .agent-skills/testing-strategies/evals/evals.json`
- Catalog validation: `python3 -m json.tool .agent-skills/skills.json`
- Dry-run prompts:
  1. "We keep adding flaky Playwright flows for every feature. What testing strategy should this repo adopt?"
  2. "This PR changes an API contract and a DB migration. What validation layers should be required before merge?"
  3. "Should this bugfix get a unit test, integration test, or just manual QA?"
- Success bar:
  - stronger trigger description and clearer boundaries than baseline
  - deterministic workflow focused on policy/orchestration rather than code samples
  - at least one durable `references/` bundle and one `evals/` bundle
  - discovery docs updated if the rewritten role changes user-visible positioning

## Constraints
- Keep this run bounded to one coherent modernization of `testing-strategies`
- Do not create a duplicate overlapping testing skill
- Do not rewrite the evaluation harness during the run
- Prefer transferable guidance over stack-specific code snippets
- Preserve compatibility with neighboring skills instead of absorbing their jobs

## Tried Already
- Keep: modernized adjacent anchors `backend-testing`, `debugging`, and `code-review`; those now make the `testing-strategies` gap easier to define
- Revert: adding more overlapping wrappers in already-crowded clusters
- Why: previous runs showed that strengthening the canonical legacy anchor is higher-value than adding another near-duplicate skill
