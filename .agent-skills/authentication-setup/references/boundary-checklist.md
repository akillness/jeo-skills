# Authentication Boundary Checklist

Use this checklist to keep `authentication-setup` from collapsing into neighboring skills.

## Provider vs app ownership

### Provider usually owns
- sign-in methods and credential ceremony
- password reset / email verification flows
- MFA / passkey registration UX
- token or session issuance
- enterprise federation endpoints when applicable

### App usually owns
- profile and business-domain fields
- organizations / workspaces / memberships
- roles, entitlements, and support/admin exceptions
- billing-linked access
- product-specific authorization decisions

### Shared edge
- webhook / user-sync pipelines
- claims copied into tokens or sessions
- callback URLs and redirect handling
- middleware / guards / server helpers
- audit/event visibility across systems

## Route-outs

| Drift pattern | Route to |
|---|---|
| endpoint scopes, auth headers, API contract semantics | `api-design` |
| published developer docs, quickstarts, SDK or webhook auth docs | `api-documentation` |
| CSRF, rate limiting, cookie flags, headers, secret storage, OWASP controls | `security-best-practices` |
| login-flow regression tests, callback tests, role matrix tests, CI-vs-local coverage | `backend-testing` |
| deeper schema normalization / indexing / DB tuning | `database-schema-design` |

## Smells that mean the skill is too broad
- The answer is mostly JWT code and no product decision framework.
- The answer treats authorization as identical to authentication.
- The answer recommends an auth vendor but never states what data stays app-owned.
- The answer mixes SSO/SCIM into the same checklist as social login with no separate branch.
- The answer drifts into OWASP/security checklist territory without routing to `security-best-practices`.
- The answer designs a full policy engine instead of a setup boundary.

## Minimal boundary packet
A strong output should include all of these:
1. chosen auth lane
2. ownership boundary
3. session/token model
4. user/org/membership data outline
5. environment checklist
6. adjacent handoffs
