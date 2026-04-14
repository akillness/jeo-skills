# Loop Charter

## Goal
Upgrade `authentication-setup` from a legacy auth code dump into a reusable product-auth setup router with clear boundaries to neighboring backend and security skills.

## Current Baseline
- `authentication-setup/SKILL.md` is a 600+ line catch-all mixing login implementation, JWT details, RBAC, OAuth, SSO, and framework-specific code.
- The skill lacks `references/` and `evals/`.
- README / README.ko / setup prompt describe it only as `JWT, OAuth, session management`, which hides the real decision surface and weakens activation.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/authentication-setup/SKILL.md`

Supporting artifacts allowed this run:
- `.agent-skills/authentication-setup/references/*`
- `.agent-skills/authentication-setup/evals/evals.json`
- `.agent-skills/authentication-setup/SKILL.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.survey/authentication-setup-modernization-20260413/*`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/authentication-setup`
- Trigger-quality review against these representative prompts:
  1. "Set up auth for a Next.js SaaS app with email login, Google OAuth, and org roles."
  2. "We already use Supabase. Decide what auth pieces belong in Supabase vs our app DB."
  3. "Add enterprise SSO and SCIM for B2B customers without rewriting our whole auth stack."
  4. "Harden cookies, CSRF, and abuse controls on our auth endpoints." → should route parts of the work to `security-best-practices`
- Structural success criteria:
  - clear routing between hosted/framework-native/platform-native/self-hosted/enterprise lanes
  - explicit route-outs to `api-design`, `backend-testing`, `security-best-practices`, `api-documentation`, and `database-schema-design`
  - support files added
  - discovery/docs surfaces updated to reflect the sharper role

## Constraints
- One bounded modernization target only: `authentication-setup`
- No new overlapping backend/auth skill in this run
- No code-generation-heavy examples as the core of the skill
- Keep the skill under the 500-line soft limit
- Prefer transferable decision frameworks over vendor-specific boilerplate

## Tried Already
- Keep: existing survey triage and context draft under `.survey/authentication-setup-modernization-20260413/`
- Revert: none yet in this run
- Why: the existing draft already identified the right opportunity; finish it instead of starting a fresh overlapping survey
