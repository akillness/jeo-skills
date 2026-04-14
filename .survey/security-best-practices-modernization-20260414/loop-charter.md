# Loop Charter

## Goal
Improve the practical usefulness and trigger clarity of `.agent-skills/security-best-practices/SKILL.md` so it becomes the repo’s layered web-hardening anchor instead of a stale Express-only snippet dump.

## Current Baseline
Current best version: existing `security-best-practices/SKILL.md` on `main`.
Current quality: broad description, weak trigger precision, Node/Express-heavy examples, no support files, no evals, and no explicit neighboring-skill boundaries despite frequent route-ins from upgraded skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/security-best-practices/SKILL.md`

Supporting artifacts allowed if the primary revision passes validation:
- `.agent-skills/security-best-practices/references/*`
- `.agent-skills/security-best-practices/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- survey/wiki/graph outputs needed to document the accepted change

## Fixed Evaluation Harness
- Agent Skills spec / `skill-standardization` guidance
- Existing neighboring skills must retain cleaner boundaries after the update (`authentication-setup`, `system-environment-setup`, `database-schema-design`, `backend-testing`, `code-review`)
- Validation prompts: hardening a cookie/session app, choosing CSP/rate-limit lanes, routing auth setup vs security hardening, selecting verification tooling
- Pass/fail rubric:
  - description clearly states what the skill does and when to trigger
  - instructions are vendor-neutral and lane-selecting before snippets/tools
  - route-outs to adjacent skills are explicit
  - support files help reusable execution rather than bloating SKILL.md
  - evals verify activation and handoff behavior

## Constraints
- Max scope: one skill modernization run, no new overlapping security skill
- Max change style: one coherent modernization, not multiple unrelated repo overhauls
- Forbidden edits: do not rewrite adjacent skills unless absolutely needed for catalog sync; do not broaden into infra-wide cloud security
- Output requirements: keep discovery surfaces synchronized if positioning changes materially

## Tried Already
- Keep: modernize weak existing anchors instead of adding overlapping wrappers
- Keep: add `references/` + `evals/` when a skill becomes a canonical anchor
- Revert: duplicate generalist skills that only repackage existing clusters
- Why: the repo gains more from clearer boundaries and support bundles than from more catalog noise
