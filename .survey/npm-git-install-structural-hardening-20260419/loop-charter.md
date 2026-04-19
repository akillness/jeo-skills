# Loop Charter

## Goal
Improve `npm-git-install` by converting it from a dense decision-first skill into a smaller routing-first front door that still preserves trigger precision, cross-package-manager coverage, and honest route-outs.

## Current Baseline
- Current best version: `.agent-skills/npm-git-install/SKILL.md` on `main` at 2026-04-19 start-of-run state.
- Current quality: good boundary, complete support coverage, but still larger and more front-door-heavy than the repo's newer packet-first skills.

## Mutable Artifact
- Primary mutable artifact: `.agent-skills/npm-git-install/SKILL.md`

## Fixed Evaluation Harness
- Spec / standards:
  - Agent Skills frontmatter + recommended sections
  - Existing repo pattern for routing-first structural hardening
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/npm-git-install`
  - `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Dry-run prompts / acceptance tests:
  - Existing `evals/evals.json`
  - At least one new eval that checks route-out behavior for durable shared usage or cross-domain tooling
- Success rubric:
  - clearer intake packet selection
  - smaller / cleaner front door
  - no boundary drift into Git workflow, repo admin, or environment setup
  - discovery surfaces kept in sync if wording changes materially

## Constraints
- Max time per iteration: one bounded maintenance pass this run
- Max scope: one skill lane plus directly affected support/docs/wiki/graph artifacts
- Forbidden edits: do not add a new overlapping skill; do not broaden into package-registry administration or generic Node setup
- Output requirements: keep reusable support detail in references, not a bloated SKILL front door

## Tried Already
- Keep: 2026-04-15 modernization pass that established package-delivery mode selection and support docs
- Revisit now: front-door shrink / packet-first hardening
- Avoid: adding another Node package-management wrapper or re-expanding the skill into a syntax catalog
