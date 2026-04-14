# Solution Landscape: security-best-practices modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| OWASP ASVS | Verification standard / requirements catalog | Broad secure-development baseline; versioned requirement IDs; vendor-neutral | Too broad to act as a workflow by itself | Best source for framing hardening lanes and review checklists |
| OWASP Cheat Sheet Series | Topic-specific guidance library | Separate cheat sheets for CSRF, CSP, headers, credential stuffing, secrets, etc. | Easy to cherry-pick snippets without a workflow | Supports layered references instead of one monolith |
| MDN CSP guidance | Browser/platform reference | Explains CSP purpose, deployment/testing strategy, trusted types, clickjacking, HTTPS upgrade | CSP-only, not a whole app-security framework | Good support doc for the perimeter/header lane |
| Helmet.js | Express header middleware | Fast baseline for HTTP security headers; configurable per-header | Node/Express-specific; not sufficient for complete hardening | Good example under a header/perimeter lane, not the whole skill |
| express-rate-limit | Express abuse-control middleware | Familiar, maintained, endpoint-specific rate limits | Express-only; IP-based defaults are not a full abuse model | Good example under abuse/rate-limit lane |
| GitHub CodeQL code scanning | Static analysis / verification | Native GitHub integration; default/advanced/external CI options | Language support boundaries; not a replacement for runtime controls | Strong verification-layer reference |
| OWASP ZAP | Dynamic scanning / automation | Widely used free web app scanner; automation support | Needs target/setup; not a policy framework | Good verification handoff after baseline hardening |

## Categories
- **Standards / checklists:** OWASP ASVS, OWASP Cheat Sheet Series
- **Browser / protocol guidance:** MDN CSP, HTTP header guidance
- **Runtime control helpers:** Helmet.js, express-rate-limit, CSRF middleware replacements
- **Verification / automation:** GitHub CodeQL, OWASP ZAP

## What People Actually Use
People rarely solve web security with one unified product. In practice they combine:
1. a checklist or standard (OWASP ASVS / cheat sheets),
2. framework/runtime controls (headers, rate limits, cookie/session settings, validators), and
3. verification tools (static scanning, dynamic scanning, review checklists).

That means the repository skill should route by hardening lane and handoff, not pretend one framework recipe is the answer.

## Frequency Ranking
1. OWASP ASVS / Cheat Sheet Series as the most reusable standards layer
2. Middleware/runtime controls such as Helmet and rate-limit libraries as common implementation helpers
3. Verification tools such as CodeQL and ZAP as later-stage checks or CI/runtime safety nets

## Key Gaps
- The current skill has no mode selection for perimeter/headers vs session/CSRF vs abuse/rate-limit vs secrets vs verification.
- It lacks explicit boundaries to neighboring skills (`authentication-setup`, `system-environment-setup`, `database-schema-design`, `backend-testing`, `code-review`).
- It has no support bundle (`references/`, `evals/`) even though it is already a route target from other modernized skills.
- It overfits Express/Node snippets and under-serves fullstack teams using other stacks.

## Contradictions
- Marketed quick starts imply middleware can "secure your app" quickly, but standards/docs/user snippets still show that teams must debug CSP rollouts, choose endpoint-specific rate limits, and replace deprecated libraries.
- Security tooling promises automation, but runtime/session/secret boundaries still need human classification before automation helps.

## Key Insight
The right modernization is not adding another security wrapper skill — it is turning `security-best-practices` into the repo’s layered web-hardening anchor with explicit lane selection, route-outs, reusable references, and verification handoffs. That change is more transferable than any new vendor- or framework-specific skill.
