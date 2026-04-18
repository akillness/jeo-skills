# Solutions

## Solutions
| Solution family | What the external landscape actually does | Why it matters for this skill boundary | Repeated complaints / contradictions |
|---|---|---|---|
| Standards-first hardening baselines | OWASP ASVS and OWASP cheat sheets are the common starting point for app/API hardening decisions before any vendor tool choice. They repeatedly split concerns into headers/CSP, CSRF/session safety, API input/auth/error handling, and secrets lifecycle. | Keep `security-best-practices` as a routing/triage layer that classifies the missing control family first, instead of trying to be a full implementation cookbook. | Recurring contradiction: teams ask for “OWASP compliance” as one blob, but the sources break it into separate verification domains and ownership boundaries. Sources also repeatedly warn that framework defaults and one middleware do not finish the job. |
| Browser-policy analyzers and header posture tools | MDN, Mozilla Observatory, SecurityHeaders, and Google CSP Evaluator all center browser-enforced controls: CSP, HSTS, cookie flags, framing/embed policy, and header correctness. | The skill should keep a small “browser/perimeter policy” lane and route framework-specific implementation details elsewhere. | Repeated complaint: CSP is powerful but deployment is brittle; both OWASP and MDN push staged rollout / report-only first. Another recurring confusion is treating CORS as if it solved CSRF. |
| Verification scanners for runtime posture | Observatory/SecurityHeaders-style scanners and OWASP ZAP baseline scans are widely used to verify header posture and low-friction runtime findings. ZAP baseline explicitly relies on spider + passive scanning and does not do active attack traffic by default. | This fits a verification-handoff lane: the skill should tell users which scanner class to run and what it can or cannot prove. | Recurring contradiction: scanners are good at finding missing headers and obvious misconfigurations, but weak evidence for business-logic/auth correctness. Passive scans also need triage to avoid overclaiming coverage. |
| Code scanning and secret detection | GitHub CodeQL, GitHub secret scanning/push protection, and repo secret scanners like Gitleaks represent the mainstream “shift-left” layer. CodeQL emphasizes query-based static analysis; secret scanning emphasizes detection, custom patterns, and push protection; Gitleaks exposes baselines/allowlists for false-positive control. | This supports a smaller routing-first boundary: keep only “which scanner family belongs here?” guidance, then hand off concrete code remediation to `code-review` / `debugging` and repo/platform wiring to adjacent skills. | Repeated complaint: false positives and tuning overhead are normal, so the skill should not promise “turn this on and you are covered.” Secret detection also implies revocation/rotation work outside the scanner itself. |
| WAF, rate limiting, and bot/abuse controls | Cloudflare’s docs show a common perimeter pattern: WAF custom rules, route-aware rate limiting, and bot controls layered together, including verified-bot carve-outs. OWASP REST guidance also treats rate limiting and safe error handling as API hardening basics. | Keep abuse controls as a separate lane, not mixed into CSP/cookie guidance. The skill should route to “abuse/perimeter control selection” rather than absorb vendor rule authoring. | Recurring complaint: blunt rate limits and bot rules can block legitimate traffic and even search/SEO workflows; Cloudflare docs explicitly warn about verified bots and false positives. |
| Secret handling patterns | OWASP secrets guidance consistently recommends centralization/standardization, access control, automated rotation, revocation, and clear separation of secret material from normal config. | Secret handling is common enough to deserve a dedicated routing lane, but implementation specifics belong in environment/deployment docs rather than a giant security omnibus skill. | Repeated contradiction: “secret scanning” is often treated as the solution, but the primary sources frame it as detection only; real remediation requires storage, scoping, rotation, and revocation patterns. |

## Frequency Ranking
Ranked by how often the category recurred across the reviewed standards, browser docs, and tool docs.

1. **Standards/checklist routing first** — OWASP ASVS + multiple OWASP cheat sheets repeatedly define the control families before tools.
2. **Browser-policy hardening** — CSP, HSTS, clickjacking/frame policy, cookie flags, and CSRF guidance recur across OWASP + MDN + scanning tools.
3. **Verification tooling** — header scanners, CSP validators, and passive/dynamic scanners recur as the proof layer after policy decisions.
4. **Code + secret scanning** — static analysis and secret detection are common, but are positioned as partial coverage rather than complete hardening.
5. **WAF / rate limiting / bot controls** — common for public web/API surfaces, but clearly perimeter-specific and vendor-tuned.
6. **Secrets lifecycle management** — centralize, scope, rotate, revoke; important, but better treated as its own route than mixed into every web hardening answer.

## Categories
- **Standards / verification baselines**: OWASP ASVS, OWASP cheat sheets, API/web control checklists.
- **Browser policy / secure headers**: CSP, HSTS, framing rules, cookie attributes, SameSite, secure transport.
- **Session / CSRF correctness**: token patterns, origin checks, cookie behavior, CORS-vs-CSRF separation.
- **Verification scanners**: Mozilla Observatory, SecurityHeaders, Google CSP Evaluator, OWASP ZAP baseline/passive scans.
- **Static/code/secret scanning**: CodeQL, GitHub secret scanning, push protection, custom patterns, Gitleaks.
- **Perimeter abuse controls**: WAF custom rules, route-aware rate limits, bot filtering, verified-bot exceptions.
- **Secret lifecycle patterns**: centralized stores, least privilege, runtime injection, rotation, revocation.

## Curated Sources
### Standards and primary guidance
- [OWASP Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/) — verification-first baseline for web/application controls.
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) — recommends staged CSP rollout and `Content-Security-Policy-Report-Only` for safer adoption.
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — explicitly separates CSRF controls from CORS and documents SameSite limitations.
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) — reinforces API-focused controls like HTTPS, input validation, safe error handling, and rate limiting.
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) — centralize/standardize secrets, automate rotation, and treat revocation as part of the lifecycle.

### Browser-policy and configuration references
- [MDN: Content-Security-Policy header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy) — browser-level reference for CSP directives, nonces, and reporting.
- [MDN: Practical CSP implementation guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP) — recommends strict CSP with nonces/hashes and report-only rollout; notes `report-to` cross-browser gaps.
- [MDN: Set-Cookie header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) — concrete semantics for `HttpOnly`, `Secure`, and `SameSite`.
- [MDN: CSRF prevention guide](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSRF_prevention) — shows how permissive CORS on state-changing routes can re-enable CSRF.
- [MDN: Strict-Transport-Security header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) — notes HSTS affects future requests, not the current insecure one.

### Verification and scanning tools
- [Mozilla HTTP Observatory](https://observatory.mozilla.org/) — automated scan focused on HTTP headers and key security configuration.
- [SecurityHeaders.com](https://securityheaders.com/) — popular quick posture check for security headers.
- [Google CSP Evaluator](https://csp-evaluator.withgoogle.com/) — focused validator for weak/unsafe CSP patterns.
- [OWASP ZAP Baseline Scan](https://www.zaproxy.org/docs/docker/baseline-scan/) — spider + passive scan only; useful for verification handoff, not proof of deep app correctness.

### Code/secret scanning and perimeter controls
- [GitHub Docs: About code scanning with CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql) — query-based static analysis; docs acknowledge ongoing tuning to reduce false positives.
- [GitHub Docs: About secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning) — secret detection, push protection, validity checks, and custom patterns.
- [Gitleaks](https://github.com/gitleaks/gitleaks) — repo/file/commit secret scanning with baselines and allowlists for noisy findings.
- [Cloudflare WAF overview](https://developers.cloudflare.com/waf/) — perimeter hardening families: custom rules, managed rules, rate limiting, bot controls.
- [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) — route-aware rate limits plus verified-bot caveats; useful evidence that abuse controls are their own category.
- [Cloudflare verified bots](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/) — documents carve-outs and false-positive realities for bot handling.

## What People Actually Use
- Framework defaults and convenience middleware first, then partial follow-up fixes when specific gaps surface.
- Scanner output, dependency alerts, and secret-detection findings as the main prioritization queue.
- Checklist mapping (ASVS / cheat sheets) for audit/compliance language, even when ownership is still fuzzy.
- WAF/rate-limiting layers as compensating controls when app-layer fixes are slower than launch pressure.

## Common Workarounds
1. Install header middleware or rely on framework defaults, then treat that as most of the hardening story.
2. Use report-only / staged CSP rollout because strict policy often breaks third-party scripts, embeds, or framework rendering behavior.
3. Add route-level rate limits or CAPTCHA to the loudest abuse endpoint and leave other workflows underspecified.
4. Treat secret scanning as the main control even when storage, scoping, rotation, and revocation are the real missing pieces.
5. Close scanner findings as tickets without reclassifying whether the issue is really browser policy, session safety, abuse control, validation, or verification.

## Pain Points With Current Solutions
- Defaults are partial, conditional, or environment-specific.
- Middleware solves one slice and gets overgeneralized into “security done.”
- Scanner queues organize findings by tool output, not by missing security layer.
- WAF/virtual-patch controls reduce exposure without removing root causes.
- Verification is uneven; teams often lack a consistent proof ladder from manual review to operational evidence.

## Key Gaps
- No single external product owns the full web/app/API hardening job without collapsing multiple security layers together.
- The repeated missing surface is **routing clarity**: teams need help deciding which layer is primary before they pick tools.
- Verification guidance is often adjacent but underspecified: many tools detect or scan, fewer tell teams what evidence actually closes the hardening claim.

## Contradictions
- Teams ask for “OWASP/security best practices” as one blob, but OWASP/MDN/tool docs consistently split the work into separate domains.
- Secret scanning is often treated as the solution, but the primary sources frame it as detection only.
- Browser middleware and scanners are marketed as fast wins, yet the docs themselves warn about staged rollout, false positives, or incomplete coverage.

## Key Insight
The external market does **not** converge on one “security best practices” product. It converges on a **routing stack**: choose the control family from a standard/checklist, apply the smallest appropriate layer, verify with the matching scanner or runtime check, then hand off implementation specifics to code, auth, environment, or deployment owners. That strongly supports shrinking this skill toward a **routing-first front door** with stable lanes for browser/perimeter policy, session/cookie/CSRF, abuse controls, validation/unsafe execution, secrets/runtime config, and verification handoffs instead of expanding it into a monolithic security manual.
