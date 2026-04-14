---
name: security-best-practices
description: >
  Design or review web-application and API hardening: headers/CSP/HTTPS, session and
  cookie safety, CSRF, abuse controls, validation and output encoding, secret handling,
  and verification handoffs. Use when the main job is deciding which security layer is
  missing, auditing whether current controls are enough, or turning vague OWASP/security
  requests into a concrete hardening brief before or alongside implementation. Not for
  product-auth architecture, database schema design, or code-level vulnerability fixing.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for web apps, APIs, backend/fullstack services, edge/frontend-plus-backend systems,
  deployment configs, and review tasks where the team needs a vendor-neutral hardening
  workflow rather than a framework-specific snippet dump.
license: MIT
metadata:
  version: "2.0.0"
  modernization: 2026-04-14
  tags: security-best-practices, owasp, appsec, csp, csrf, secrets, rate-limiting, web-security, api-security
  platforms: Claude, ChatGPT, Gemini
---

# Security Best Practices

Use this skill when the main job is **layered web/app/API hardening**, not when the answer is just “install a middleware and hope.”

`security-best-practices` owns the decision layer for:
- HTTPS / transport expectations and header posture
- CSP, clickjacking, and browser-side defensive boundaries
- session/cookie/CSRF hardening for state-changing flows
- abuse controls such as rate limiting, throttling, lockouts, and anti-automation protections
- input validation, output encoding, and unsafe execution patterns
- secret handling, runtime config hygiene, and verification handoffs

Read these support docs before choosing the lane or handoff:
- [references/modes-and-boundaries.md](references/modes-and-boundaries.md)
- [references/hardening-review-checklist.md](references/hardening-review-checklist.md)
- [references/verification-ladder.md](references/verification-ladder.md)

## When to use this skill
- Harden a new or existing web app, API, admin tool, SaaS product, or mixed frontend/backend service
- Review whether current headers, cookies, CSRF posture, validation, rate limits, or secret handling are enough
- Turn “make this secure” into a bounded hardening brief with priorities and route-outs
- Audit common web-app vulnerability exposure before launch, migration, or compliance review
- Decide whether a request belongs in perimeter controls, session/cookie controls, abuse controls, secrets/config, or verification
- Translate OWASP/ASVS/security-scan findings into a practical remediation order
- Review whether a framework default is enough or whether the team is assuming coverage it does not actually provide

## When not to use this skill
- **The main job is product authentication stack choice, hosted-vs-native auth, org/member data shape, or enterprise SSO setup** → use `authentication-setup`
- **The main job is database modeling, constraints, indexes, or migration sequencing** → use `database-schema-design`
- **The main job is API contract/interface semantics before security controls are slotted into them honestly** → use `api-design`
- **The main job is backend regression coverage or auth/security test layering** → use `backend-testing`
- **The main job is reviewing code diffs for correctness/risk or fixing a specific bug/vulnerability in code** → use `code-review` or `debugging`
- **The main job is environment bootstrapping, config loading, or local/devcontainer setup rather than security posture** → use `system-environment-setup` or `environment-setup`
- **The main job is cloud/IAM/network policy for infrastructure outside the app boundary** → treat that as infrastructure security, not this skill’s primary lane

## Hardening mode selection
Choose one primary mode before recommending tools.

| Mode | Use when | Main output |
|------|----------|-------------|
| Perimeter / browser policy | HTTPS, CSP, clickjacking, iframe/embed rules, secure headers, browser trust boundaries | perimeter hardening brief |
| Session / cookie / CSRF | session cookies, same-site flags, token storage, CSRF on state-changing actions, mixed web/mobile auth surfaces | session-security brief |
| Abuse / rate limiting | brute force, credential stuffing, feedback-form abuse, expensive endpoint abuse, bot pressure | abuse-control brief |
| Validation / unsafe execution | input validation, output encoding, unsafe deserialization, injection surfaces, file upload or outbound-request risk | application-surface hardening brief |
| Secrets / runtime config | secret storage, env/config exposure, rotation boundaries, credential scoping, preview/staging/prod drift | secret-handling brief |
| Review / verification | the team already has controls but needs audit coverage, checklist mapping, scanner/testing handoffs, or remediation ordering | security review + verification plan |

If multiple modes appear, pick the **highest-risk missing layer** as primary and list the others as follow-up work.

## Instructions

### Step 1: Classify the security job before naming tools
Capture the minimum facts first.

Record:
- surface: frontend | backend/API | fullstack | edge | worker | mixed
- workflow type: new build | hardening pass | incident follow-up | audit/compliance review | migration
- auth/session model: cookie session | JWT/token | mixed | unknown
- current evidence: headers | CSP | CSRF controls | validators | rate limits | secret store | scan findings | none
- primary risk shape: XSS | CSRF | injection | abuse/automation | secret exposure | mixed | unknown
- deployment surfaces: local | preview | staging | prod | multi-environment | unknown
- ownership: app team | platform | security | shared | unknown

Do **not** start with “use Helmet” or “turn on CORS.” First label the layer that is missing.

### Step 2: Choose the primary hardening mode

#### Mode A — Perimeter / browser policy
Use when the core job is browser-enforced or transport-enforced defense.

Focus on:
- HTTPS-only expectations and redirect/HSTS posture
- CSP rollout strategy and whether report-only / staged deployment is needed
- frame/embed/clickjacking rules
- cross-origin policy and whether CORS is being confused with auth or CSRF protection
- secure cookie flags and browser-side trust boundaries where applicable

Return:
- which headers/policies are mandatory now
- which policies need staged rollout/testing
- what can break in previews, embeds, third-party scripts, or uploads
- what belongs to app code vs reverse proxy / CDN / framework config

#### Mode B — Session / cookie / CSRF
Use when requests mutate server-side state and browser/session context matters.

Focus on:
- whether cookies are used and whether `HttpOnly`, `Secure`, and `SameSite` settings are honest
- where CSRF protection is required vs where token/mobile/API contexts differ
- refresh-token and session-lifetime boundaries
- whether the team is relying on CORS alone to solve CSRF
- secret/session boundary handoffs back to `authentication-setup`

Return:
- which routes/actions need CSRF protection
- which token/session storage model is in play
- required cookie/session flags
- what mobile/native/API clients need if browser-origin assumptions differ

#### Mode C — Abuse / rate limiting
Use when the real issue is request abuse, brute force, bot traffic, or expensive endpoint misuse.

Focus on:
- login / password reset / invite / verification abuse
- high-cost or paid API endpoints
- endpoint-specific vs global limits
- device/IP/account-based controls, delays, lockouts, or challenge steps
- user harm and operations cost, not just “429 somewhere”

Return:
- the most important abuse surfaces
- which limits are global vs route-specific vs identity-specific
- whether soft throttles, lockouts, or queueing are safer than blunt denial
- what metrics and alerts prove the limits are working

#### Mode D — Validation / unsafe execution
Use when untrusted input, outbound calls, uploads, templates, or execution surfaces are the main concern.

Focus on:
- input validation boundaries and canonicalization
- parameterization / safe query construction
- output encoding / sanitization / trusted types where relevant
- SSRF, file upload, command execution, or deserialization risk
- unsafe defaults hidden by framework convenience

Return:
- highest-risk entry points
- required validation / encoding strategy per surface
- banned patterns or libraries
- what must be reviewed or tested before release

#### Mode E — Secrets / runtime config
Use when the hardest problem is secret handling or config leakage rather than request routing.

Focus on:
- where secrets live today and who can read them
- app config vs secret material separation
- preview/staging/prod drift and credential sprawl
- key rotation, scoping, and emergency revocation
- build-time vs runtime exposure

Return:
- which values are true secrets vs ordinary config
- where secrets should live and how they should be injected
- least-privilege / rotation requirements
- what should never be committed or surfaced in logs/errors/client bundles

#### Mode F — Review / verification
Use when controls exist but trust is low, findings are vague, or tooling needs handoffs.

Focus on:
- mapping findings to real layers
- which controls are missing vs merely undocumented
- static/dynamic verification sequence
- smallest remediation order with highest risk reduction
- route-outs to `backend-testing`, `code-review`, or infrastructure owners where needed

Return:
- keep / fix / add / defer decisions
- verification ladder (manual review, static scan, dynamic scan, test coverage)
- ownership by issue class
- evidence still missing before claiming the app is hardened

### Step 3: Build the hardening brief
Return a concise report with this shape:

```markdown
# Security Hardening Brief

## Scope
- Surface: ...
- Workflow type: ...
- Primary mode: ...
- Confidence: high | medium | low

## Current control state
- Controls already present
- Missing or untrusted controls

## Highest-risk gaps
- Gap 1: ...
- Gap 2: ...
- Gap 3: ...

## Recommended first slice
- 1-3 smallest high-value hardening changes

## Verification plan
- Manual review: ...
- Static analysis / lint / scan: ...
- Dynamic / runtime verification: ...

## Ownership and route-outs
- Primary owner: ...
- Adjacent skills / teams: ...
```

### Step 4: Apply hardening defaults carefully
Use these rules unless the evidence says otherwise.

- Prefer **small explicit controls** over giant “security middleware solves everything” claims.
- Treat **CORS, auth, CSRF, and rate limiting as separate concerns** even when they touch the same routes.
- Use **report-only / staged rollout** for CSP or strict browser policies when breakage risk is real.
- Rate-limit **per sensitive workflow** (login, reset, invites, expensive writes), not only globally.
- Separate **secret material** from ordinary config and keep build-time/client exposure explicit.
- Pair runtime hardening with a **verification step**; do not assume library install = coverage.
- If a library or pattern is deprecated or stale, update the recommendation instead of cargo-culting it.

### Step 5: Route adjacent work explicitly
Use these handoffs when the problem crosses skill boundaries.

| If the real job is... | Route to... |
|---|---|
| Choosing auth vendor/stack, org/member model, or session architecture | `authentication-setup` |
| API contract semantics, auth/error contract design, or public interface design | `api-design` |
| Backend security test coverage, auth-flow tests, regression gates | `backend-testing` |
| Specific vulnerability fix in code or diff review | `debugging` / `code-review` |
| Database integrity/schema/migration concerns | `database-schema-design` |
| Environment setup or secret injection mechanics for local/dev/prod bootstrapping | `system-environment-setup` / `environment-setup` |

## Output expectations
A strong answer from this skill should:
1. identify the **primary risk layer**,
2. avoid pretending one middleware/library solves the whole problem,
3. distinguish immediate fixes from follow-up work,
4. name the **verification path**, and
5. hand off adjacent work honestly.

## Best practices
1. Use a checklist/standard mindset first, a library choice second.
2. Keep browser-policy, session-safety, abuse-control, and secret-handling decisions separate.
3. Prefer control + evidence pairs: every important recommendation should imply how it will be verified.
4. Call out where a framework default helps and where it does **not** finish the job.
5. Route stale or deprecated snippet patterns away instead of preserving them for convenience.

## Examples

### Example 1: Cookie-based admin app hardening
The app already uses sessions, but admin POST routes lack CSRF coverage and cookie flags are inconsistent between staging and prod.

Expected handling:
- choose **Session / cookie / CSRF** mode
- identify which routes need CSRF protection
- specify required cookie flags and environment drift checks
- route auth-architecture questions back to `authentication-setup` only if the session model itself is still undecided

### Example 2: “Make our API secure” request
The real concern is login brute force plus expensive write endpoints that trigger third-party billing.

Expected handling:
- choose **Abuse / rate limiting** mode
- separate login/reset/invite limits from general API limits
- recommend metrics/alerts proving the limits work
- avoid drifting into generic header tutorials unless they are part of the first slice

## References
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [Helmet.js](https://helmetjs.github.io/)
- [OWASP ZAP](https://www.zaproxy.org/)
- [GitHub CodeQL code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/about-code-scanning-with-codeql)
