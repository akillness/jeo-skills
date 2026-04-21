# Loop Charter

## Goal
Improve `authentication-setup` so it remains the canonical product-auth setup router while becoming shorter, easier to trigger correctly, and less likely to absorb adjacent security/docs/testing/database work.

## Current Baseline
- Current best version: `.agent-skills/authentication-setup/SKILL.md` at 337 lines with 3 references, evals, and a compact variant.
- Current quality: boundaries are correct, but the front door still repeats lane detail that can live in support docs.

## Mutable Artifact
Primary file: `.agent-skills/authentication-setup/SKILL.md`

Supporting files allowed only if they serve the primary shrink-and-clarify goal:
- `.agent-skills/authentication-setup/references/*`
- `.agent-skills/authentication-setup/SKILL.toon`
- `.agent-skills/authentication-setup/evals/evals.json`
- wiki / survey / graph outputs if the change is accepted

## Fixed Evaluation Harness
- Agent Skills structure + trigger-quality expectations from `skill-standardization`
- Existing route boundary for neighboring skills: `security-best-practices`, `api-design`, `api-documentation`, `backend-testing`, `database-schema-design`
- Frozen acceptance tests:
  1. `SKILL.md` should get materially shorter while keeping the same auth-lane coverage.
  2. Trigger description must still clearly cover hosted/framework-native/platform-native/self-hosted auth, sessions/JWTs, org/member models, and enterprise SSO/SCIM.
  3. The skill must still route adjacent hardening/docs/testing/database work out explicitly.
  4. If support docs or evals change, they must improve transferability rather than adding noise.
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/authentication-setup`
  - `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
  - `git diff --check`

## Constraints
- One bounded improvement set only; no new auth wrapper skill.
- Prefer moving detail into references over expanding the main file.
- Update README / README.ko / setup prompt only if the positioning/discovery wording materially changes.
- Keep evidence source-backed in the survey and wiki.

## Tried Already
- Keep: 2026-04-14 modernization turned the old JWT/OAuth catch-all into the current product-auth setup router.
- Revert: adding a new overlapping auth wrapper; broadening auth setup into security hardening, API docs, or backend testing.
- Why: the repo already has the right canonical skill; the gap is maintenance shape, not catalog coverage.
