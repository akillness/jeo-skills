# Hardening Review Checklist

Use this checklist to turn a vague security review into a concrete brief.

## 1. Scope and surface
- What surface is under review: frontend, backend/API, fullstack, edge, worker, or mixed?
- Is this a greenfield build, hardening pass, migration, audit, or incident follow-up?
- Which environments matter right now: preview, staging, prod?

## 2. Browser / perimeter controls
- Is HTTPS-only behavior enforced where it should be?
- Are security headers intentional, not just copied from a tutorial?
- Does CSP need staged rollout / report-only mode?
- Are embed/frame rules and clickjacking posture explicit?

## 3. Session / cookie / CSRF controls
- Does the app use session cookies, bearer tokens, or both?
- Are `HttpOnly`, `Secure`, and `SameSite` values consistent with the real deployment?
- Which state-changing browser routes require CSRF protection?
- Is anyone incorrectly relying on CORS to solve CSRF?

## 4. Abuse controls
- Which workflows are sensitive: login, reset, invite, upload, expensive API calls?
- Are limits global only, or route/account/device aware where needed?
- Are there lockout / backoff / challenge strategies beyond simple 429s?
- Which metrics confirm the controls work in production?

## 5. Validation / unsafe execution
- Where does untrusted input enter the system?
- Are validators and parameterized queries present at the real trust boundary?
- Is output encoding/sanitization/trusted-types guidance needed?
- Are file upload, SSRF, command execution, or deserialization surfaces relevant?

## 6. Secrets / runtime config
- Which values are actual secrets?
- Where are they stored and injected today?
- Is build-time or client exposure possible?
- What is the rotation / revocation plan?

## 7. Verification
- What can be checked by manual review?
- What belongs in static analysis or code scanning?
- What should be exercised dynamically (security test, DAST, smoke check, or runtime monitoring)?
- Which adjacent skills or owners must be involved before the issue is genuinely closed?
