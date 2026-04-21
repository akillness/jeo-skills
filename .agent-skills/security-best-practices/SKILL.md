---
name: security-best-practices
description: >
  Routing-first skill for web/application/API hardening. Use when the main job is
  classifying which security layer is missing — browser/perimeter policy,
  session/cookie/CSRF, abuse controls, validation/unsafe execution,
  secrets/runtime config, or verification — and turning vague OWASP/security asks
  into one concrete hardening brief. Route auth-stack choice to
  `authentication-setup`, schema work to `database-schema-design`, code-level bug
  fixing to `debugging` / `code-review`, and environment wiring to
  `system-environment-setup`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for web apps, APIs, backend/fullstack services, marketing-site forms,
  edge/frontend-plus-backend systems, and game-adjacent service/web launch
  surfaces where the team needs a vendor-neutral hardening workflow instead of a
  giant middleware or scanner checklist.
license: MIT
metadata:
  version: "2.1.0"
  modernization: 2026-04-14
  hardening: 2026-04-18
  tags: security-best-practices, owasp, appsec, csp, csrf, secrets, rate-limiting, web-security, api-security
  platforms: Claude, ChatGPT, Gemini, Codex
---

# Security Best Practices

Use this skill when the job is to **name one missing security layer and turn it into a bounded hardening brief**.

The job is not to dump a giant OWASP list, middleware catalog, or scanner parade.
The job is to:
1. frame the surface and risk,
2. choose one primary hardening mode,
3. recommend the smallest credible first slice,
4. name the verification ladder,
5. route adjacent work honestly.

Read these support docs first:
- [references/modes-and-boundaries.md](references/modes-and-boundaries.md)
- [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md)
- [references/hardening-review-checklist.md](references/hardening-review-checklist.md)
- [references/verification-ladder.md](references/verification-ladder.md)

## When to use this skill
- A team says “make this secure” and the missing security layer is still unclear
- A web app, API, marketing-site flow, admin panel, or game-service surface needs a hardening pass before launch or migration
- You need to decide whether the main problem is CSP/headers, cookies/CSRF, abuse controls, validation/unsafe execution, secret handling, or weak verification
- Scanner findings, OWASP requests, or launch-review notes need to be converted into one prioritized hardening brief
- The current stack has some controls already, but trust is low and the next verification step is unclear

## When not to use this skill
- **The main job is choosing an auth vendor, session architecture, org/member model, or enterprise SSO path** → `authentication-setup`
- **The main job is API contract/interface design before security controls are slotted in** → `api-design`
- **The main job is schema constraints, token tables, indexes, or migration safety** → `database-schema-design`
- **The main job is backend regression coverage or auth/security test implementation** → `backend-testing`
- **The main job is fixing a specific vulnerability in code or reviewing a concrete diff** → `debugging` or `code-review`
- **The main job is secret injection mechanics, toolchain bootstrapping, or environment wiring** → `system-environment-setup` / `environment-setup`
- **The main job is cloud IAM, VPC/network, or broader infrastructure security** → use the infrastructure-specific skill instead of this app-hardening anchor

## Instructions

### Step 1: Frame the hardening job before naming tools
Capture the minimum facts first.

```yaml
security_intake:
  surface: frontend | backend-api | fullstack | edge-worker | marketing-site | game-service-web | mixed | unknown
  workflow_type: new-build | hardening-pass | audit-review | launch-readiness | incident-follow-up | migration
  auth_session_model: cookie-session | bearer-token | mixed | unknown
  current_controls:
    - headers-csp
    - csrf
    - rate-limit
    - validation
    - secret-store
    - scanning
    - none
  primary_risk: xss-browser-policy | csrf-session | abuse-automation | injection-unsafe-execution | secret-exposure | verification-gap | mixed | unknown
  environments: local | preview | staging | prod | multi-env | unknown
  ownership: app-team | platform | security | shared | unknown
```

Rule: do **not** start with “install Helmet,” “turn on CORS,” or “just add WAF rules.”
First label the missing layer.

### Step 2: Choose exactly one primary hardening mode
Use the router in [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md).

Primary modes:
1. `browser-perimeter-policy`
2. `session-cookie-csrf`
3. `abuse-controls`
4. `validation-unsafe-execution`
5. `secrets-runtime-config`
6. `review-verification`

Pick the **highest-risk missing layer** as primary.
List everything else as follow-up, not as equal co-owners.

### Step 3: Keep the invariants visible
These rules survive every answer:
- CORS, auth, CSRF, rate limiting, validation, and secrets are separate concerns even when they touch the same route
- browser-policy work may need staged rollout or report-only verification
- framework defaults help, but they do not prove full coverage
- secret scanning is detection, not storage/rotation policy
- WAF and rate limiting are compensating/perimeter controls, not full substitutes for app-layer fixes
- every recommendation needs a matching verification step

### Step 4: Build the security hardening brief
Return this structure:

```markdown
# Security Hardening Brief

## Scope
- Surface: ...
- Workflow type: ...
- Primary mode: ...
- Confidence: high | medium | low

## Current control state
- Controls already present: ...
- Missing or untrusted controls: ...

## Highest-risk gaps
1. ...
2. ...
3. ...

## Recommended first slice
1. ...
2. ...
3. ...

## Verification plan
- Manual review: ...
- Static/policy checks: ...
- Dynamic/runtime verification: ...
- Operational evidence: ...

## Ownership and route-outs
- Primary owner: ...
- Adjacent skills / teams: ...
```

### Step 5: Use the mode packet, not a giant checklist
Pull the packet from [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md).

Mode rules:
- `browser-perimeter-policy` → headers, CSP, framing, secure transport, report-only rollout, proxy/CDN vs app ownership
- `session-cookie-csrf` → cookie flags, state-changing browser routes, origin assumptions, web vs API/mobile differences
- `abuse-controls` → login/reset/form/expensive-endpoint protection, per-route vs global limits, bot carve-outs, monitoring
- `validation-unsafe-execution` → trust boundaries, validation/encoding, uploads, SSRF, command execution, dangerous patterns
- `secrets-runtime-config` → secret-vs-config separation, storage/injection, least privilege, rotation/revocation, client-bundle avoidance
- `review-verification` → classify findings, keep/fix/add/defer decisions, smallest proof ladder, honest ownership

### Step 6: Route adjacent work explicitly
Use these route-outs when the problem crosses boundaries:

| If the real job is... | Route to... |
|---|---|
| auth vendor choice, enterprise SSO, org/member model, hosted-vs-native auth | `authentication-setup` |
| API auth/error/webhook contract design | `api-design` |
| schema constraints, token tables, migration/data-model safety | `database-schema-design` |
| backend security regression tests or CI gates | `backend-testing` |
| concrete vulnerability fix or risky diff review | `debugging` / `code-review` |
| environment bootstrap or secret injection wiring | `system-environment-setup` / `environment-setup` |

## Output expectations
A strong answer from this skill should:
1. identify the **primary missing layer**,
2. recommend one bounded first slice,
3. name the **verification ladder**,
4. avoid pretending one library/tool solves everything,
5. route adjacent work outward instead of absorbing it.

## Examples

### Example 1: cookie-based admin app hardening
**Input**
> Our Next.js admin app uses cookie sessions. POST routes lack CSRF protection and staging/prod cookie flags drift.

**Output direction**
- choose `session-cookie-csrf`
- identify which routes need CSRF protection and which cookie flags must be fixed
- include a verification step for staging/prod drift
- avoid reframing the task as auth-vendor selection

### Example 2: marketing-site form abuse
**Input**
> Our signup and demo-request forms are getting spammed even after adding a honeypot and CAPTCHA.

**Output direction**
- choose `abuse-controls`
- separate form abuse controls from generic CSP/header work
- recommend route-aware throttles / anti-automation steps plus monitoring
- keep broader infrastructure or vendor-rule authoring outside the core brief

### Example 3: game-service secret leakage risk
**Input**
> We have a game companion site plus backend APIs. I’m worried partner keys and admin tokens are drifting into CI logs and maybe client bundles.

**Output direction**
- choose `secrets-runtime-config`
- separate secret detection from storage/rotation/injection policy
- route environment bootstrapping details away when needed
- include revocation/rotation proof requirements

### Example 4: scanner report with weak ownership
**Input**
> The scanner says weak CSP and missing headers, but the app already added middleware and no one trusts the result.

**Output direction**
- choose `review-verification` or `browser-perimeter-policy`
- keep middleware installation distinct from rollout proof
- recommend staged/report-only verification or a scanner/runtime handoff

## Best practices
1. Choose the missing security layer before naming tools.
2. Keep browser policy, session safety, abuse controls, validation, secrets, and verification separate.
3. Pair every recommendation with evidence that would prove it worked.
4. Treat framework defaults and scanners as inputs, not final answers.
5. Prefer one bounded hardening brief over a giant compliance dump.

## References
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [OWASP ZAP](https://www.zaproxy.org/)
- [GitHub CodeQL code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/about-code-scanning-with-codeql)
