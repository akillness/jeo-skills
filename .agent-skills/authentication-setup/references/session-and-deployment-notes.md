# Session and Deployment Notes

This reference exists because auth bugs often come from environment drift, not from the login form itself.

## What to record early
- local app URL(s)
- preview/staging URL(s)
- production URL(s)
- OAuth callback URLs per environment
- cookie domain / subdomain rules
- secure / sameSite / httpOnly expectations
- token/session lifetime and refresh rules
- logout / revocation behavior

## Session-model heuristics

### Browser-heavy product UI
Usually prefer:
- server sessions or signed cookies
- middleware/server-side access to auth state
- explicit note about subdomain and preview behavior

### API-heavy or multi-service traffic
Usually prefer:
- short-lived access tokens
- refresh/session rotation story
- service-to-service and machine-token distinction

### Hybrid products
Often need both:
- browser sessions for the product UI
- API or machine tokens for integrations, webhooks, or automation

## Common deployment pitfalls
1. Callback URLs differ across local, preview, staging, and production.
2. Secure cookies break silently in misconfigured local proxies or preview domains.
3. Social-login provider dashboards lag behind domain changes.
4. Edge/runtime differences change what auth helpers can access.
5. Session refresh logic behaves differently in middleware, server rendering, and client navigation.
6. Logout/revocation is often under-specified until support incidents happen.

## Output reminder
Every auth setup plan should include an environment section with:
- callback URL checklist
- cookie/domain checklist
- secret/config ownership
- rollout / migration / rollback notes
