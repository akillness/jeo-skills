# Security Mode Packets and Route-Outs

Use this note after the primary security layer has been classified.

## 1. browser-perimeter-policy
Use when the core risk is browser-enforced or transport-enforced defense.

### Focus
- HTTPS-only expectations and redirect/HSTS posture
- CSP rollout strategy, report-only use, framing/embed policy
- clickjacking protections and browser trust boundaries
- proxy/CDN/framework ownership splits

### Return
- mandatory browser/perimeter controls now
- staged rollout/testing items
- breakage risks for analytics, embeds, third-party scripts, previews, or uploads
- route-outs when implementation becomes framework-specific

### Route-outs
- auth/session architecture → `authentication-setup`
- broader UI accessibility/perf side effects → neighboring frontend skills
- infra/CDN rule authoring beyond app posture → infra-specific skill

## 2. session-cookie-csrf
Use when state-changing browser flows, cookie flags, or origin assumptions are the main risk.

### Focus
- `HttpOnly` / `Secure` / `SameSite` truthfulness
- which routes/actions need CSRF protection
- browser versus API/mobile/native client differences
- session lifetime / refresh boundaries

### Return
- required cookie/session flags
- actions that need CSRF protection
- where token/API clients differ from browser assumptions
- auth-architecture handoff if the session model itself is still undecided

### Route-outs
- hosted/native auth choice or org/member design → `authentication-setup`
- backend auth regression coverage → `backend-testing`

## 3. abuse-controls
Use when the real issue is brute force, bot traffic, spam submissions, or expensive endpoint misuse.

### Focus
- login/reset/invite/form/upload/paid-endpoint abuse
- route/account/device-aware controls versus global limits
- challenge/backoff/queue/lockout decisions
- verified-bot or search-crawler carve-outs
- telemetry showing the controls actually work

### Return
- most important abuse surfaces
- the safest control layer per surface
- where softer controls beat blunt denial
- monitoring/ownership expectations

### Route-outs
- vendor-specific WAF rule authoring or bot platform setup → vendor/infra skill
- ongoing alerts/metrics platform work → `monitoring-observability`

## 4. validation-unsafe-execution
Use when untrusted input, unsafe output handling, uploads, SSRF, command execution, or deserialization risk is primary.

### Focus
- trust boundaries and validation points
- parameterization / encoding / sanitization expectations
- high-risk entry points: upload, outbound requests, command execution, deserialization
- banned patterns and review requirements

### Return
- highest-risk entry points
- required validation/encoding strategy per surface
- banned patterns or libraries
- tests/reviews needed before release

### Route-outs
- code-level bug fixing or exploit patching → `debugging`
- concrete diff risk review → `code-review`

## 5. secrets-runtime-config
Use when secret handling, exposure, scoping, or lifecycle policy is the main problem.

### Focus
- which values are true secrets versus normal config
- storage/injection boundaries
- build-time, CI/log, runtime, and client exposure risks
- least privilege, rotation, revocation, break-glass handling

### Return
- secret inventory by sensitivity
- where secrets should live and how they should be injected
- rotation/revocation expectations
- what must never reach repos, logs, or client bundles

### Route-outs
- environment bootstrap / local-dev injection mechanics → `system-environment-setup` / `environment-setup`
- deployment platform/env rollout specifics → `deployment-automation` or platform skill

## 6. review-verification
Use when controls exist but ownership is unclear, findings are vague, or proof is weaker than the claims.

### Focus
- classify findings into the right security layer
- keep / fix / add / defer decisions
- smallest proof ladder: manual → static/policy → targeted test → dynamic/runtime → operational evidence
- ownership by issue class

### Return
- reclassified findings
- smallest high-value remediation order
- verification ladder by issue class
- evidence still missing before the app can be called hardened

### Route-outs
- backend test implementation → `backend-testing`
- code-level fixes → `debugging`
- review of a concrete change → `code-review`

## Quick routing heuristic
- If the request says “secure our login flow,” ask whether the missing layer is session/CSRF, abuse controls, auth architecture, or test coverage.
- If the request says “OWASP hardening,” choose the missing layer before recommending any tool.
- If the request came from a scanner finding, use `review-verification` first unless the missing layer is already obvious.
- If the request is mostly infra/IAM/network policy, this skill is not the primary owner.
