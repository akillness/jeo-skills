# Loop Charter

## Goal
Improve the overlapping environment skill pair so the repo has one strong canonical environment/setup anchor and one clearly narrower compatibility alias, with better trigger quality, support files, and discovery-surface wording.

## Current Baseline
- `environment-setup` and `system-environment-setup` are both legacy, overlapping, and example-heavy.
- Neither skill currently gives sharp routing between app config, secrets handoff, local services, toolchains, containers, and onboarding.
- Discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, graph/wiki memory) currently present them as peer skills without canonical guidance.

## Mutable Artifact
Primary: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/system-environment-setup/SKILL.md`

Supporting files allowed in this loop:
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/environment-setup/SKILL.md`
- supporting `references/` and `evals/` under both skill directories
- discovery/docs surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`)
- graph/wiki/survey artifacts for durable memory

## Fixed Evaluation Harness
- Agent Skills spec and the repo validator: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh <skill-dir>`
- Trigger/boundary rubric:
  - canonical skill must clearly own broader reproducible environment setup
  - alias skill must clearly narrow to app config / `.env` / env validation / secret handoff
  - both skills must route to each other and avoid peer-duplicate positioning
- Support-file rubric:
  - add useful `references/` and `evals/` when missing
- Discovery-surface rubric:
  - README / README.ko / setup prompt / skills manifest must reflect canonical-vs-alias positioning
- Validation prompts:
  1. "Set up a new repo so any dev can run it locally with consistent tooling and containers."
  2. "Help me organize .env files, validate required env vars, and stop config drift across environments."
  3. "Our devcontainer works but secrets and local overrides are still messy."
  4. "I need onboarding steps for local services, runtime versions, and per-env config."

## Constraints
- Max one bounded improvement theme this run: environment skill canonicalization
- Prefer consolidation over adding new skills
- Keep the broader skill and narrower alias transferable across stacks
- No product code; skill/docs/research/wiki/graph only
- Do not touch unrelated skills in the same loop

## Tried Already
- Keep: repeated repo pattern of one canonical skill plus a narrower compatibility alias when overlap is real but deletion would be too abrupt
- Revert: adding new overlapping wrapper skills for already-crowded clusters
- Why: the repo benefits more from stronger routing and support coverage than from more near-duplicates
