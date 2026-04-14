# Loop Charter

## Goal
Improve `vercel-deploy` so it works as a modern, provider-specific Vercel operations skill rather than a stale anonymous deploy shortcut.

## Current Baseline
- Existing best version: `.agent-skills/vercel-deploy/SKILL.md`
- Current quality: vendor-specific intent is valid, but the skill is anchored to a custom claimable deploy script, lacks references/evals, and underspecifies preview/prod/env/alias/rollback workflows.

## Mutable Artifact
- Primary mutable artifact: `.agent-skills/vercel-deploy/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: description must clearly route Vercel-specific deploy/alias/domain/env/rollback requests without stealing generic CI/release-strategy work
- Dry-run prompts:
  1. "Deploy this linked Next.js app to a preview URL on Vercel and give me a stable alias."
  2. "Promote this Vercel preview deployment to production after health checks."
  3. "My Vercel env vars look set in the UI but the deployment cannot read them."
- Supporting artifacts expected if useful: `references/` and `evals/evals.json`

## Constraints
- Max time per iteration: one bounded modernization pass in this run
- Max scope: one skill plus necessary discovery-surface and memory-layer updates
- Forbidden edits: do not redesign generic deployment strategy already owned by `deployment-automation`
- Output requirements: preserve reusable, vendor-specific guidance and clear route-outs

## Tried Already
- Keep: repo-level deployment boundary where generic rollout logic lives in `deployment-automation`
- Revert: adding adjacent wrapper skills instead of fixing stale anchors
- Why: repo history shows modernization of weak anchors transfers better than adding overlapping wrappers
