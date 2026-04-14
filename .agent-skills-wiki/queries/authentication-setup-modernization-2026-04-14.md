---
title: Authentication Setup Modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/authentication-setup-modernization-20260413/triage.md, .survey/authentication-setup-modernization-20260413/context.md, .survey/authentication-setup-modernization-20260413/solutions.md, .survey/authentication-setup-modernization-20260413/loop-charter.md, graphify-out/GRAPH_REPORT.md]
---

# Authentication Setup Modernization 2026-04-14

## Question
What is the best bounded next backend-cluster modernization target after the API, testing, and documentation anchors were already sharpened, given the need to avoid another overlapping auth/security wrapper?

## Decision
Modernize `authentication-setup` into the product-auth setup router instead of adding a new auth helper or leaving the legacy JWT/OAuth catch-all in place.

## Why this won
- The survey showed a stable recurring decision surface around hosted vs framework-native vs platform-native vs self-hosted auth, plus enterprise SSO/SCIM as a distinct branch.
- The old skill was still a 600-line implementation dump with weak trigger wording, no support files, and almost no boundary guidance to `security-best-practices`, `api-design`, `api-documentation`, `backend-testing`, or `database-schema-design`.
- Graph refresh after the rewrite showed higher support coverage and clearer duplicate notes around auth vs security/authz/testing boundaries, which is more reusable than inventing another auth-adjacent skill.

## Accepted changes
- Rewrite `authentication-setup` as a decision-first product-auth setup skill.
- Add `references/` for auth-lane selection, provider-vs-app ownership boundaries, and session/deployment pitfalls.
- Add `evals/evals.json` that test Next.js SaaS auth, Supabase ownership boundaries, enterprise SSO/SCIM expansion, and route-out to `security-best-practices`.
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces stop hiding the sharper role.
- Refresh graph outputs and wiki notes so future runs see the backend lane as a cleaner auth/design/testing/security split.

## Rejected alternatives
- Adding another generic auth or authorization wrapper.
- Leaving `authentication-setup` as a JWT/OAuth/session keyword bucket.
- Folding CSRF/cookie/rate-limit/OWASP hardening into the same skill instead of routing that work to `security-best-practices`.
- Pretending enterprise SSO/SCIM is the same workflow as adding Google login.

## Durable takeaway
The backend cluster improves when `authentication-setup` owns auth-lane selection and product-boundary setup, while `security-best-practices` owns hardening, `api-design` owns contract semantics, `backend-testing` owns regression coverage, and `api-documentation` owns published developer guidance.

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[api-design-modernization-2026-04-12]]
- [[backend-testing-modernization-2026-04-12]]
- [[api-documentation-modernization-2026-04-13]]
