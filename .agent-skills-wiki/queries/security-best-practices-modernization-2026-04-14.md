---
title: Security Best Practices Modernization (2026-04-14)
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [survey, skills, skill-quality, trigger-design, docs]
sources: [.survey/security-best-practices-modernization-20260414/triage.md, .survey/security-best-practices-modernization-20260414/context.md, .survey/security-best-practices-modernization-20260414/solutions.md, .agent-skills/security-best-practices/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Security Best Practices Modernization (2026-04-14)

## Why this skill was the best bounded target
`security-best-practices` had become the weakest remaining high-traffic hardening anchor in the web/fullstack lane. Multiple modernized neighbors already routed cookie flags, CSRF, rate limiting, secret handling, and OWASP hardening work into it, but the skill itself was still a legacy Express-heavy snippet dump with no `references/`, no `evals/`, and weak trigger boundaries.

## What changed
- Rewrote `security-best-practices` into a layered hardening skill with six modes: perimeter/browser policy, session/cookie/CSRF, abuse/rate limiting, validation/unsafe execution, secrets/runtime config, and review/verification.
- Added explicit route-outs to `authentication-setup`, `api-design`, `database-schema-design`, `backend-testing`, `code-review`, `debugging`, and environment-setup skills.
- Added reusable support files:
  - `references/modes-and-boundaries.md`
  - `references/hardening-review-checklist.md`
  - `references/verification-ladder.md`
  - `evals/evals.json`
- Updated discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`) so the repositioned skill is visible at the catalog layer.

## Accepted reasoning
- OWASP ASVS and cheat sheets support a layered standards/checklist mindset better than framework-specific snippets.
- Indexed Reddit/Yahoo snippets showed real-world friction around CSP rollout, deprecated CSRF middleware, and endpoint-specific abuse controls; that favored a classification-and-handoff workflow over another code dump.
- Graph findings showed that improving this anchor was better than adding another overlapping security wrapper.

## Rejected alternatives
- Adding a separate OWASP checklist skill or another generic appsec wrapper.
- Folding auth-stack selection into `security-best-practices` instead of routing it to `authentication-setup`.
- Leaving the skill as a middleware-centric Node/Express tutorial.

## Durable insight
The backend/web security boundary improves when `security-best-practices` owns layered hardening and verification handoffs, while auth architecture stays in [[authentication-setup-modernization-2026-04-14]] and storage/interface concerns stay with [[backend-api-cluster]]. Support bundles matter here because this skill is a common route target, not a niche leaf skill.

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[authentication-setup-modernization-2026-04-14]]
- [[database-schema-design-modernization-2026-04-14]]
