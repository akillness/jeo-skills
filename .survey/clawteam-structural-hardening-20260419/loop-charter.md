# Loop Charter

## Goal
Improve the existing `clawteam` skill so it becomes a more truthful, reusable, routing-first operator front door for the ClawTeam CLI.

## Current Baseline
- `clawteam/SKILL.md` is 329 lines and behaves like a broad feature tour.
- Support docs and evals exist, but several commands/examples lag upstream README reality.
- Discovery surfaces already expose the skill, so stale wording amplifies quickly.

## Mutable Artifact
Primary: `.agent-skills/clawteam/SKILL.md`

Supporting artifacts allowed only when needed to keep the primary change truthful:
- `.agent-skills/clawteam/references/*.md`
- `.agent-skills/clawteam/evals/evals.json`
- `.agent-skills/clawteam/SKILL.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/clawteam`
- Catalog/discovery sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Trigger quality check: description must clearly prefer ClawTeam-specific operator asks over generic multi-agent orchestration
- Truthfulness check: main examples and references must align with current upstream command families (`team spawn-team`, `launch`, `board attach/serve`, `task create/update`, `inbox send`, `profile` / `preset`)
- Dry-run usefulness check against these prompts:
  1. "Use ClawTeam to split a full-stack feature across multiple agents."
  2. "How do I launch a prebuilt ClawTeam team and watch it live?"
  3. "Set up ClawTeam with a non-default provider/model profile."
  4. "I only need a generic multi-agent delivery loop with planning + QA." (should route away)

## Constraints
- Max one coherent skill-improvement set this run
- Prefer shrinking/rerouting over adding another wrapper skill
- Keep claims source-backed to upstream docs/issues or local repo evidence
- Update README / README.ko / setup prompt only if the trigger surface or positioning changes materially
- Keep the changed skill under the repo's preferred support-packet pattern

## Tried Already
- Keep: survey-driven structural hardening passes that shrink oversized front doors and move slower-changing detail into references
- Revert: adding adjacent wrapper skills when the cluster already has a canonical anchor
- Why: repo graph and wiki history show higher leverage from boundary cleanup and support-packet sync than from catalog growth
