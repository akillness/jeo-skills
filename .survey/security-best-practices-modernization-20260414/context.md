# Context: security-best-practices modernization

## Workflow Context
`security-best-practices` is no longer acting as a small standalone skill: multiple upgraded skills now route cookie flags, CSRF, rate limiting, secret handling, and OWASP hardening work into it. The current skill is a monolithic Express-centric example dump, which makes it weak as a reusable router for web/frontend/backend/fullstack tasks. Modern hardening work happens across layers: transport + headers, session/cookie safety, abuse controls, validation/output encoding, secret handling, and verification tooling.

External evidence reinforces that the modern workflow is standards- and checklist-led rather than framework-snippet-led:
- OWASP ASVS positions itself as a basis for testing application technical security controls and a list of requirements for secure development, not a library tutorial. Source: https://owasp.org/www-project-application-security-verification-standard/
- MDN describes CSP as a browser-enforced restriction system used primarily to defend against XSS, clickjacking, and insecure requests, and recommends deployment/testing strategy rather than copy-pasted directives. Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- OWASP Cheat Sheet Series shows separate, focused cheat sheets for CSP, CSRF, cookie theft mitigation, HTTP headers, credential stuffing prevention, etc., implying a layered workflow rather than one undifferentiated middleware block. Source: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack developer | Harden auth/session flows, headers, CSRF, abuse controls, and secret handling before shipping | Intermediate |
| Backend/API developer | Protect state-changing routes, limit abuse, validate input, and decide verification steps | Intermediate |
| Frontend/platform engineer | Coordinate CSP, trusted types, clickjacking, and same-site/session boundaries with backend teams | Intermediate |
| Tech lead / reviewer | Review whether a proposed hardening change actually covers the right risk layer and handoffs | Advanced |
| Agent maintaining app code | Route security work to the right lane instead of emitting stale framework snippets | Intermediate |

## Current Workarounds
1. Use framework middleware bundles such as Helmet plus separate rate-limit libraries, then hand-tune the pieces later.
2. Rely on auth-provider/framework defaults for some controls and patch missing pieces manually.
3. Pull from OWASP cheat sheets or ASVS checklists during audits, then translate them into stack-specific tasks.
4. Add verification layers such as ZAP or GitHub CodeQL only after the app already has a baseline hardening plan.
5. Copy old Express/Node examples even when the real stack is Next.js, Python, Rails, or mixed infra.

## Adjacent Problems
- Auth setup gets conflated with general security hardening when session/cookie decisions are mixed with CSRF, rate limiting, and secret storage.
- API contract work gets muddied when security reviews skip threat boundaries and jump straight to code snippets.
- Security verification is often bolted on after the fact instead of being treated as a separate lane (headers/runtime controls vs scanning/testing).
- Repo overlap risk is high because `security-best-practices` sits near `authentication-setup`, `database-schema-design`, `system-environment-setup`, `code-review`, and `backend-testing`.

## User Voices
- Yahoo indexed snippet from Reddit `r/node`: developers still ask for "the simplest strategies to implement rate limiting for an express app" when they worry about feedback-form abuse or paid-API overuse — practical abuse control remains a common manual concern. Source: https://search.yahoo.com/search?p=site%3Areddit.com+web+app+security+headers+rate+limiting+checklist (indexed snippet, high confidence)
- Yahoo indexed snippet from Reddit `r/node`: developers note that `csurf` is deprecated and look for a secure replacement (`csrf-csrf`), which shows that stale snippet-based guidance ages badly. Source: https://search.yahoo.com/search?p=site%3Areddit.com+helmet+csrf+rate+limit+express+production (indexed snippet, high confidence)
- Yahoo indexed snippet from Reddit `r/Wordpress`: teams say rolling out solid CSP headers across production sites is possible but requires extensive debugging and testing, which argues for rollout guidance instead of magic defaults. Source: https://search.yahoo.com/search?p=site%3Areddit.com+security+headers+csp+helmet+production+express (indexed snippet, medium confidence)
- Yahoo indexed snippet from Reddit `r/webdev`: teams still debate whether mobile apps should bypass CSRF checks or request tokens explicitly, which suggests the skill should separate session-cookie risk from token/mobile contexts. Source: https://search.yahoo.com/search?p=site%3Areddit.com+csrf+cookie+flags+rate+limiting+web+app+security (indexed snippet, high confidence)
