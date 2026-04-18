# Context: security-best-practices structural hardening

## Workflow Context
`security-best-practices` sits in a workflow where “make this secure” almost never means one library install. The recurring requests span browser policy, state-changing web flows, abuse throttling, secret handling, and verification handoffs across four surfaces:

- **Developer workflow / repo hygiene:** security hardening often starts before runtime changes. GitHub’s push protection is explicitly designed to stop hardcoded secrets from ever reaching the repository, not just alert after the leak. Source: [GitHub Docs — About push protection](https://docs.github.com/en/code-security/concepts/secret-security/about-push-protection)
- **Web/fullstack product work:** CSP and related header work are tied to app architecture and rollout strategy, not just header snippets. MDN frames CSP as defense against XSS, clickjacking, and insecure requests, with deployment/testing strategy. Next.js’s own CSP guide adds framework-specific tradeoffs like nonces, dynamic rendering, and performance implications. Sources: [MDN CSP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP), [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy)
- **Marketing-site operations:** “security hardening” often arrives as form-abuse and spam-control work on low-code or static-site surfaces. Netlify documents Akismet filtering plus honeypot and reCAPTCHA options for form abuse prevention. Source: [Netlify Forms spam filters](https://docs.netlify.com/forms/spam-filters/)
- **Game-service / web launch surfaces:** launch teams still need web/API hardening around login abuse, expensive endpoint protection, and secret scoping. Cloudflare rate limiting is documented for brute-force login protection and API call caps, while PlayFab says developer secret keys enable Admin/Server API calls and must never ship in client builds. Sources: [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/), [PlayFab secret key management](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/gamemanager/secret-key-management)
- **Cross-cutting verification:** OWASP ASVS positions application security verification as a testing/requirements basis, and the OWASP CSRF cheat sheet separates token patterns, Fetch Metadata, SameSite, and origin checks, reinforcing that the workflow is layered and checklist-led. Sources: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack / app developers | Add headers/CSP, cookie flags, CSRF protection, request validation, and secret-safe patterns without breaking app behavior | Intermediate |
| Frontend / platform engineers | Roll out browser-enforced controls, debug third-party script/embed breakage, and coordinate with backend/session owners | Intermediate–advanced |
| Backend / API engineers | Protect login/reset/write endpoints, scope secrets, and add endpoint-specific abuse controls | Intermediate |
| Marketing-site / web-ops owners | Keep contact/signup forms usable while reducing spam, bot submissions, and script/embed risk | Intermediate |
| Game backend / live-ops teams | Keep platform keys off clients, protect launch APIs from brute force or burst abuse, and harden companion web surfaces | Intermediate–advanced |
| Repo maintainers / security reviewers / coding agents | Turn vague OWASP/security asks into a bounded hardening brief with verification and route-outs | Mixed |

## Current Workarounds
1. Start with generic middleware or platform defaults, then patch missing layers later when CSP, cookies, forms, or APIs break in staging/production.
2. Treat CSP as a one-off header task, then debug embeds, analytics tags, inline scripts, or framework rendering constraints after rollout.
3. Handle CSRF, SameSite, and origin checks piecemeal from cheat sheets or framework issues because framework docs often cover only part of the web flow.
4. Stack abuse controls opportunistically: Akismet/honeypot/reCAPTCHA for marketing forms, plus CDN/WAF rate limits for login and API endpoints.
5. Rely on pre-push or CI secret detection plus manual key rotation because secret handling spans repo policy, runtime config, and vendor dashboards.
6. For game/web launches, proxy sensitive platform operations behind server endpoints and keep client builds on public IDs/tokens while server-only keys stay in dashboard/secret stores.

## Adjacent Problems
- **Rendering/deployment coupling:** strict CSP can force architectural tradeoffs in SSR/static frameworks, so hardening advice can’t stay Express-centric.
- **Auth/CORS/CSRF confusion:** teams still conflate browser session protection with token auth or CORS policy, especially on mixed web/mobile/API products.
- **Secrets vs environment setup:** repo secret leakage, CI/env injection, and runtime credential scoping overlap with environment/setup and deployment skills.
- **Abuse control is broader than “rate limit everything”:** marketing forms, password reset, invites, and high-cost game/API endpoints need different controls and telemetry.
- **Verification is its own lane:** ASVS/checklist mapping, secret scanning, runtime verification, and scanner handoffs are adjacent to but distinct from code-level remediation.

## User Voices
- A Next.js docs user explicitly asked for missing CSRF guidance: “I can't find on the next js documentation how to protect against CSRF attacks,” contrasting it with Laravel’s dedicated docs. Source: [vercel/next.js#40495](https://github.com/vercel/next.js/issues/40495)
- Next.js users report that strict CSP can collide with framework performance features: “Nonce-based CSP with inline `<head>` scripts is incompatible with cacheComponents.” Source: [vercel/next.js#89754](https://github.com/vercel/next.js/issues/89754)
- Even when teams follow framework CSP docs, they still hit runtime edge cases such as “Hydration warning when using `next/script` with a CSP that includes a nonce.” Source: [vercel/next.js#77952](https://github.com/vercel/next.js/issues/77952)
- Netlify users still surface marketing-form abuse as a practical security problem: one report described “Malicious attacks via our feedback form ... despite honeypot fields and recaptchas.” Source: [netlify/cli#4460](https://github.com/netlify/cli/issues/4460)
