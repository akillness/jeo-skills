---
title: Security Best Practices Structural Hardening
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, docs]
sources: [.survey/security-best-practices-structural-hardening-20260418/triage.md, .survey/security-best-practices-structural-hardening-20260418/context.md, .survey/security-best-practices-structural-hardening-20260418/solutions.md, .survey/security-best-practices-structural-hardening-20260418/loop-charter.md, .agent-skills/security-best-practices/SKILL.md, .agent-skills/security-best-practices/references/mode-packets-and-route-outs.md, graphify-out/GRAPH_REPORT.md]
---

# Security Best Practices Structural Hardening

## Question
What is the best bounded next improvement for the existing `security-best-practices` skill now that support coverage is already complete: add another security wrapper, or tighten `security-best-practices` into a smaller routing-first front door?

## Answer
Tighten `security-best-practices` in place.

The survey evidence still points to one coherent app-hardening router: browser/perimeter policy, session/cookie/CSRF safety, abuse controls, validation/unsafe execution, secrets/runtime config, and verification. The stronger move is not another OWASP/appsec wrapper. It is a smaller front door that quickly chooses one missing security layer, recommends one bounded first slice, names the verification ladder, and routes auth/schema/code/env work to neighboring skills.

## Why this won
1. Primary sources do not converge on a single all-in-one “security best practices” tool; they converge on layered standards, scanners, browser-policy references, secret detectors, and abuse controls that must be classified before use.
2. Real practice remains fragmented: teams lean on framework defaults, middleware, scanner queues, and WAF/rate-limit compensating controls, so routing clarity is more valuable than another product-shaped wrapper.
3. The graph refresh showed support coverage is already complete repo-wide, so the highest-value maintenance pattern is dense-anchor cleanup and discovery-sync, not another support-folder-only pass or new adjacent skill.
4. `security-best-practices` was still large enough to benefit from the same packet-first structural hardening already applied to neighboring anchors across infrastructure, backend, and code-quality lanes.

## Accepted changes
- Shrink `security-best-practices/SKILL.md` from 284 to 232 lines
- Reframe the front door around six security modes with one missing layer chosen per run
- Add `references/mode-packets-and-route-outs.md`
- Expand `evals/evals.json` with marketing-form abuse and game-service secret exposure cases
- Refresh `SKILL.toon`, `skills.json`, `skills.toon`, README.md, README.ko.md, and `setup-all-skills-prompt.md`
- Refresh graph artifacts so the structural layer records the smaller security anchor

## Rejected changes
- Adding another generic OWASP/appsec/security-hardening wrapper
- Letting `security-best-practices` absorb auth-stack design, schema work, backend test implementation, or environment bootstrap mechanics
- Treating scanners, middleware, or WAF rules as full proof of security posture without a verification ladder

## Durable findings
- Security hardening remains strongest as a **routing** skill, not a compliance dump or tool catalog.
- The most useful split is between **browser/perimeter policy**, **session/cookie/CSRF**, **abuse controls**, **validation/unsafe execution**, **secrets/runtime config**, and **review/verification**.
- Teams repeatedly need help reclassifying scanner or launch findings into the right missing security layer before any tool choice is trustworthy.

## Related pages
- [[skill-support-coverage]]
- [[security-best-practices-modernization-2026-04-14]]
- [[backend-api-cluster]]
- [[authentication-setup-structural-hardening-2026-04-17]]
