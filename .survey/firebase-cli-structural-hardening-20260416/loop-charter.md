# Loop Charter

## Goal
Improve the practical usefulness and trigger clarity of `.agent-skills/firebase-cli` without adding a new overlapping Firebase wrapper.

## Current Baseline
- Primary mutable artifact: `.agent-skills/firebase-cli/SKILL.md`
- Baseline quality: broad coverage, but the front door is 419 lines and behaves like a command catalog instead of a workflow router.
- Existing support: `references/commands.md`, `scripts/install.sh`, `scripts/deploy.sh`, `scripts/emulators.sh`, `evals/evals.json`, `SKILL.toon`

## Mutable Artifact
Exactly one primary file: `.agent-skills/firebase-cli/SKILL.md`

Supporting files may be updated only if needed to keep the main skill truthful and discoverable:
- `references/*`
- `scripts/*`
- `evals/evals.json`
- `SKILL.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki / survey / graph artifacts tied to this run

## Fixed Evaluation Harness
- Agent Skills structural validation via `.agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/firebase-cli`
- Frozen rubric for this run:
  1. `SKILL.md` stays under 500 lines and becomes materially shorter than baseline.
  2. Trigger description remains specific and Firebase-operator focused.
  3. The front door clearly separates at least these modes: install/auth, bootstrap/config, local emulators, deploy/release, admin/data operations.
  4. Route-outs to `genkit` and `firebase-ai-logic` are explicit.
  5. Supporting files and discovery docs stay in sync with the new structure.
- Validation prompts: deploy Hosting/App Hosting, set up emulators, bootstrap Firebase project, CI auth/deploy, route AI app logic away from this skill.

## Constraints
- Max one coherent skill-upgrade change set this run.
- No new overlapping Firebase skill.
- Prefer transferable routing/support improvements over feature-list expansion.
- Keep claims grounded in repo-local evidence or primary-source docs.

## Tried Already
- Keep: repo-wide pattern of shrinking oversized `SKILL.md` files into routing-first front doors with focused references.
- Revert: creating nearby wrapper skills when a high-degree canonical anchor can be improved in place.
- Why: the graph and wiki both show boundary cleanup beats wrapper proliferation.
