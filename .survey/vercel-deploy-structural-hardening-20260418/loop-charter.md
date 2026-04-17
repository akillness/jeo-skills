# Loop Charter

## Goal
Improve `vercel-deploy` as a reusable Vercel-specific operations skill by tightening the front door, syncing compact/discovery surfaces, and preserving clean boundaries with adjacent deployment/setup/debugging skills.

## Current Baseline
Current best artifact: `.agent-skills/vercel-deploy/SKILL.md` at 313 lines with support references and evals already present, but the front door is still oversized and `.agent-skills/vercel-deploy/SKILL.toon` still reflects the old claimable-deploy framing.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/vercel-deploy/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec / `skill-standardization` validator expectations
- Representative prompts:
  1. Promote a known-good Vercel preview to production after smoke checks
  2. Fix preview-vs-production env mismatch on Vercel without rewriting CI
  3. Attach a custom domain / preview alias and report remaining manual DNS work
  4. Route generic rollout-policy work away to `deployment-automation`
- Success rubric:
  - spec-valid frontmatter and required sections
  - clearer trigger/boundary wording than baseline
  - smaller, more routing-first front door without losing Vercel operator coverage
  - compact/discovery surfaces (`SKILL.toon`, docs/manifest text if touched) remain truthful

## Constraints
- Max time: one bounded cron run
- Max tool budget: focused repo inspection, direct-source retrieval, validation, and one coherent PR update
- Forbidden edits: no new overlapping Vercel wrapper skill; no evaluator/rubric drift mid-run
- Output requirements: keep support files aligned if the route-in contract changes; update docs/setup surfaces if positioning/discoverability materially changes

## Tried Already
- Keep: 2026-04-15 modernization into a Vercel-specific operations anchor
- Revert: legacy claimable-deploy-only framing
- Why: current repo state already established the right canonical direction; this run only tests whether structural hardening and sync improve precision/usability further
