# Security Verification Ladder

A hardening recommendation is stronger when it names the evidence that would prove it worked.

## Level 1 — Manual review
Use for:
- header/cookie config inspection
- routing whether a finding is auth, schema, API, or app-hardening work
- reviewing whether a CSP or same-site policy is internally consistent

Questions:
- What exact control changed?
- Which routes/components/environments does it cover?
- What assumptions remain unverified?

## Level 2 — Static analysis / policy checks
Use for:
- unsafe pattern detection
- secret leakage checks
- dependency or code scanning
- CI policy validation

Examples:
- GitHub CodeQL or equivalent code scanning
- secret scanners / config linters
- framework-specific secure-default lint rules

## Level 3 — Targeted tests
Use for:
- auth/session regressions
- CSRF-protected state changes
- header presence assertions
- abuse-control behavior on sensitive endpoints

Good practice:
- Add a focused regression test when the control is easy to re-break.
- Route broader backend coverage design to `backend-testing`.

## Level 4 — Dynamic / runtime verification
Use for:
- DAST or automated scanners such as ZAP
- replaying sensitive flows in staging
- confirming alerting/metrics around abuse controls
- verifying browser-policy rollout after CSP/report-only changes

## Level 5 — Operational evidence
Use for:
- proving rate limits actually absorb abuse without harming normal users
- proving secret rotation / revocation processes work
- proving suspicious activity is observable and owned

## Rule of thumb
- New control, no evidence -> not done.
- Library installed, no scoped verification -> not done.
- Scanner finding routed to the wrong layer -> reclassify before fixing.
