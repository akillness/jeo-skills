---
title: React Skill Canonicalization 2026-04-12
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, consolidation, trigger-design, frontend, survey]
sources: [.survey/frontend-skill-consolidation-20260412/triage.md, .survey/frontend-skill-consolidation-20260412/context.md, .survey/frontend-skill-consolidation-20260412/solutions.md, .agent-skills/react-best-practices/SKILL.md, .agent-skills/vercel-react-best-practices/SKILL.md]
---

# React Skill Canonicalization 2026-04-12

## Question
What is the best bounded improvement for overlapping frontend skills right now?

## Answer
Upgrade the React pair before touching broader frontend overlap:
- `react-best-practices` becomes the clearly canonical React/Next.js performance skill.
- `vercel-react-best-practices` becomes an explicit compatibility alias, not a peer default.
- Add evals to both skills so future split/merge decisions can be judged against a fixed harness.
- Update README/setup/manifest surfaces so the canonical-vs-alias distinction is visible before activation.

## Accepted
- Canonical React description sharpened around waterfalls, bundle size, RSC, hydration, and rerender work.
- Alias React skill narrowed to exact-name/legacy-workflow compatibility.
- Evals added for both skills.

## Rejected
- No hard deletion of the alias name in this run.
- No expansion into the design-system pair in the same loop.

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
