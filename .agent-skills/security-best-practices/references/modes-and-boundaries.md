# Security Hardening Modes and Boundaries

Use this note when the request blurs multiple security topics and the main skill needs a fast routing decision.

## Primary modes

| Mode | Owns | Common traps |
|------|------|--------------|
| Perimeter / browser policy | HTTPS posture, CSP, security headers, clickjacking, browser trust boundaries | Treating CORS as authentication or assuming one default CSP will work everywhere |
| Session / cookie / CSRF | Cookie flags, session boundaries, CSRF on state-changing browser flows | Assuming APIs/mobile/native flows always need the same CSRF treatment as browser sessions |
| Abuse / rate limiting | Brute-force protection, endpoint-specific throttles, expensive endpoint abuse, anti-automation | Using only a global IP limit and calling it done |
| Validation / unsafe execution | Input validation, output encoding, injection prevention, SSRF/upload/command risk | Mixing data modeling or auth-vendor choice into secure-coding checks |
| Secrets / runtime config | Secret storage, rotation, least privilege, environment drift | Confusing setup mechanics with security policy |
| Review / verification | Mapping findings, scan handoffs, remediation order | Treating scanner output as self-executing truth |

## Adjacent skills

| If the real job is... | Better skill |
|---|---|
| Hosted auth vs framework-native auth vs platform-native auth | `authentication-setup` |
| API surface contracts, auth error semantics, webhook signature semantics | `api-design` |
| Schema constraints, token tables, migration safety | `database-schema-design` |
| Security regression tests, auth-flow tests, CI gates | `backend-testing` |
| Vulnerability fix in a specific diff or code path | `debugging` or `code-review` |
| Bootstrapping environments or loading env vars correctly | `system-environment-setup` / `environment-setup` |

## Routing heuristics
- If the request says “secure our login flow,” ask whether the missing piece is auth architecture, CSRF/cookies, abuse controls, or tests.
- If the request says “OWASP hardening,” pick the missing layer before choosing tooling.
- If the request came from a scanner finding, route to **Review / verification** first, then hand off concrete code/schema/auth work.
- If the request is mostly infra/IAM/network policy, this skill is not the primary owner.
