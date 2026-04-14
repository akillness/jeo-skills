---
name: authentication-setup
description: >
  Design or refactor product authentication setup for web apps and APIs. Use when
  the user needs to choose or wire hosted auth, framework-native auth, platform-
  native auth, sessions vs JWTs, OAuth/social login, passkeys, org/member models,
  enterprise SSO/SCIM handoff, callback/cookie environment setup, or auth rollout
  boundaries before or alongside implementation. Not for deep authorization policy,
  general security hardening, API contract design, or backend test planning.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for SaaS, internal tools, B2B web apps, APIs, and fullstack frameworks such
  as Next.js, React, Node, Python, and Postgres/Supabase-style stacks where auth
  setup decisions cross frontend, backend, data, and deployment boundaries.
license: MIT
metadata:
  version: "2.0.0"
  modernization: 2026-04-14
  tags: authentication-setup, auth, sessions, jwt, oauth, passkeys, sso, scim, product-auth, backend
  platforms: Claude, ChatGPT, Gemini
---

# Authentication Setup

Use this skill when the main job is **choosing and structuring product authentication for a real app**, not dumping generic JWT snippets.

`authentication-setup` owns the setup layer for:
- choosing hosted vs framework-native vs platform-native vs self-hosted auth
- deciding session/cookie vs token boundaries
- wiring login methods: email/password, magic links, social OAuth, passkeys
- defining what user/profile/org/membership data lives in the app database
- planning enterprise add-ons such as SSO and SCIM without pretending they are the same as basic login
- handling callback URLs, cookie domains, preview/staging/prod env drift, and rollout boundaries

Read these support docs before choosing the lane or handoff:
- [references/auth-decision-matrix.md](references/auth-decision-matrix.md)
- [references/boundary-checklist.md](references/boundary-checklist.md)
- [references/session-and-deployment-notes.md](references/session-and-deployment-notes.md)

## When to use this skill
- Set up auth for a new web app, SaaS product, admin app, or API-backed product
- Decide between Clerk, Auth.js, Supabase Auth, Firebase Auth, Cognito, Keycloak, or similar options
- Add or refactor sessions, cookies, refresh-token strategy, or OAuth provider setup
- Plan app-owned user/profile/org tables around a hosted or framework-native auth system
- Add organizations, invites, roles, enterprise SSO, or SCIM as a next auth milestone
- Untangle auth boundaries across frontend routes, middleware, backend APIs, and database policy layers
- Review whether the current auth stack is too vendor-coupled, too DIY, or too vague to maintain safely

## When not to use this skill
- **The main job is deeper authorization policy design, permission inheritance, or ABAC/ReBAC modeling** → use `api-design` for contract semantics or treat it as a dedicated authorization design problem
- **The main job is cookie flags, CSRF, rate limiting, secret handling, OWASP hardening, or general vulnerability prevention** → use `security-best-practices`
- **The main job is API contract/interface design before auth is slotted into the API honestly** → use `api-design`
- **The main job is developer-facing reference docs, quickstarts, or API auth docs for consumers** → use `api-documentation`
- **The main job is backend regression coverage, auth-flow testing, fixture design, or CI-vs-local test layering** → use `backend-testing`
- **The main job is database normalization/indexing rather than auth-owned tables and identity boundaries** → use `database-schema-design`
- There is no product context yet; in that case define the open questions and choose the smallest credible auth lane instead of pretending the implementation is settled

## Instructions

### Step 1: Classify the auth setup job
Normalize the request before naming vendors or libraries.

```yaml
auth_setup_profile:
  app_type: saas | internal-tool | marketplace | consumer-app | api-only | mixed | unknown
  auth_lane: hosted | framework-native | platform-native | self-hosted | enterprise-add-on | unknown
  runtimes: browser | server | edge | mobile | api | mixed
  login_methods: password | magic-link | social-oauth | passkeys | sso | mixed | unknown
  identity_scope: single-user | teams-orgs | b2b-enterprise | mixed | unknown
  session_model: server-session | stateless-jwt | hybrid | unknown
  data_ownership: vendor-owned | app-owned | hybrid | unknown
  rollout_stage: greenfield | mvp | scale-up | migration | enterprise-expansion
```

Ask or infer:
1. What frameworks, runtimes, and deployment surfaces already exist?
2. Is the team optimizing for fastest safe launch, deeper control, enterprise support, or self-hosting?
3. Does the app only need sign-in, or also orgs, invites, roles, admin access, and customer SSO?
4. Which auth/data pieces are already fixed by the stack choice?

### Step 2: Choose the auth lane deliberately
Do not start with code snippets.

#### A. Hosted auth
Use when:
- speed and prebuilt UX matter most
- the team wants social login, MFA, or passkeys quickly
- the team does not want to own identity infrastructure first

Common options:
- Clerk
- Auth0
- Firebase Authentication
- Amazon Cognito

Watch for:
- vendor lock-in
- pricing/enterprise feature cliffs
- the need for app-owned org/membership/entitlement tables anyway

#### B. Framework-native auth
Use when:
- the team wants auth mostly inside app code
- framework ergonomics matter more than a hosted identity product
- the app already owns its database and server runtime

Common options:
- Auth.js
- Better Auth
- Lucia
- Passport.js for legacy compatibility, not as the default modern path

Watch for:
- more assembly work around sessions, adapters, email, and authz
- runtime-specific SSR/middleware/callback behavior

#### C. Platform-native auth
Use when:
- the backend platform is already chosen
- auth should align with the same DB/platform primitives

Common options:
- Supabase Auth
- Firebase Auth
- Appwrite Auth

Watch for:
- tighter architectural coupling
- the split between platform identity and app-specific authorization still remaining

#### D. Enterprise add-on lane
Use when the request mentions:
- SAML, OIDC enterprise SSO, SCIM, Azure AD / Entra, Okta, WorkOS
- directory sync, customer-managed identity, or domain verification

Treat this as a distinct branch, not just “another provider.”

Watch for:
- account linking and org mapping
- provisioning/deprovisioning expectations
- support and rollout processes per customer

#### E. Self-hosted auth
Use when:
- SaaS auth vendors are disallowed
- on-prem, air-gapped, or sovereignty requirements dominate

Common options:
- Keycloak
- Authentik
- Zitadel / Ory-class alternatives

Watch for:
- operational overhead
- admin complexity
- migration and backup expectations

### Step 3: Draw the ownership boundary
Before implementation, write down who owns what.

Minimum boundary packet:
- **Identity provider owns:** sign-in methods, password reset/email verification, MFA/passkey ceremony, token/session issuance, enterprise federation where applicable
- **Application owns:** local user/profile records, org/workspace membership, roles/entitlements, billing-linked access, admin/support exceptions, domain-specific authorization
- **Shared edge:** claims/roles copied into tokens or sessions, webhook/user sync, callback URLs, middleware, cookie config, audit/event visibility

If the request blurs auth and authz, say so explicitly.

### Step 4: Choose the session and token model
Pick the transport that matches the product surface.

#### Prefer server sessions or signed cookies when
- the app is browser-heavy
- SSR/server actions/middleware need easy access to auth state
- revocation and cookie security are easier than client-stored JWT logic

#### Prefer stateless JWTs when
- clients are API-heavy and cross-service token verification matters
- the team already has a credible token lifecycle story
- short-lived access tokens plus refresh/session rotation are understood

#### Prefer hybrid when
- browser sessions are needed for the product UI
- API tokens or machine tokens are also required for integrations or service calls

Always capture:
- token/session lifetime
- refresh/rotation strategy
- logout/revocation expectations
- cookie domain / subdomain behavior
- local dev vs preview vs prod callback/cookie differences

### Step 5: Define the auth methods and migration path
Choose the minimum set that fits the product now.

Common branches:
- email/password
- magic link / OTP
- social OAuth
- passkeys/WebAuthn
- enterprise SSO

For each chosen method, note:
- why it is needed now
- fallback and recovery path
- whether user identity links across providers
- what the next likely milestone is (for example org roles or enterprise SSO after MVP)

Do not force passkeys, SSO, or SCIM into the first version unless the product actually needs them.

### Step 6: Model app-owned auth data
Even hosted auth rarely removes the need for local tables.

Usually define at least:
- `users` or `profiles`
- `organizations` / `workspaces` if multi-tenant
- `memberships` / `roles`
- invitation or provisioning state if teams are invited/admin-managed

Record:
- the stable user identifier used across auth provider and app DB
- which fields stay vendor-owned vs mirrored locally
- how webhook or sync failures are detected and repaired
- whether permissions live in claims, local tables, or both

If the request slides into broader schema design, route deeper modeling to `database-schema-design`.

### Step 7: Separate auth setup from adjacent work
Use this handoff table so the skill stays sharp.

| If the request becomes mainly about... | Route to |
|---|---|
| API auth semantics, scopes, or endpoint contract design | `api-design` |
| Published auth docs, developer quickstarts, or consumer examples | `api-documentation` |
| CSRF, rate limiting, cookie flags, secret handling, or OWASP controls | `security-best-practices` |
| Regression tests for login, callbacks, middleware, or permission paths | `backend-testing` |
| Deeper DB normalization/indexing beyond auth-owned tables | `database-schema-design` |

### Step 8: Produce an auth setup packet
The output should help the next implementation step succeed.

Preferred packet:
1. **Chosen auth lane** and why
2. **Recommended stack or candidate options** (1–3, not a random catalog)
3. **Ownership boundary** between provider, app DB, and authorization layer
4. **Session/token strategy** with runtime/deployment caveats
5. **User/org/membership data model outline**
6. **Environment checklist**: callback URLs, cookie domains, secrets, preview/staging/prod differences
7. **Next handoffs** to adjacent skills (`security-best-practices`, `backend-testing`, etc.)
8. **Open risks / migration notes**

## Output format
Use this structure unless the user requests another format:

```markdown
# Authentication Setup Plan

## Auth lane
- hosted | framework-native | platform-native | self-hosted | enterprise-add-on
- why this lane fits

## Recommended stack
- primary option
- fallback option(s)
- tradeoffs

## Ownership boundary
- provider owns
- app owns
- shared edge / sync points

## Session + login model
- sessions vs JWT vs hybrid
- chosen login methods
- token/cookie/callback notes

## App-owned data model
- users/profiles
- orgs/memberships/roles
- sync strategy

## Environment + rollout checklist
- local
- preview/staging
- production
- migration notes

## Route-outs
- adjacent skills and why
```

## Examples

### Example 1: Next.js SaaS with product auth
Input:
> Set up auth for a Next.js SaaS app with email login, Google OAuth, org roles, and an admin panel.

Expected handling:
- classify as browser/server mixed SaaS with teams/orgs
- compare hosted vs framework-native paths instead of jumping straight into JWT snippets
- define app-owned org/membership tables
- note SSR/middleware/cookie boundaries
- route security hardening and auth-flow testing to neighboring skills

### Example 2: Supabase-first app
Input:
> We already use Supabase. Decide what auth should live in Supabase vs our app DB, and how roles should work.

Expected handling:
- choose platform-native lane first
- keep provider identity separate from app-owned entitlements
- call out RLS/authz follow-through as an adjacent design/testing concern

### Example 3: Enterprise expansion
Input:
> We already have login. Now add enterprise SSO and SCIM for B2B customers.

Expected handling:
- classify as enterprise-add-on, not “basic auth setup”
- cover account mapping, org/domain verification, and provisioning boundaries
- avoid pretending SSO/SCIM is the same job as social login or password auth

## Best practices
1. Start with the auth lane and ownership boundary, not code snippets.
2. Keep authentication setup separate from deeper authorization policy and general security hardening.
3. Assume most products still need app-owned user/org/membership tables even with hosted auth.
4. Treat enterprise SSO/SCIM as a distinct branch once B2B requirements appear.
5. Record environment-specific callback, cookie, and preview-deployment behavior early.
6. Prefer one clear primary recommendation with a fallback, not a giant vendor list.
7. Route adjacent work explicitly so `authentication-setup` stays reusable instead of becoming another backend catch-all.

## References
- [Next.js Authentication](https://nextjs.org/docs/app/building-your-application/authentication)
- [Auth.js](https://authjs.dev/)
- [Clerk Docs](https://clerk.com/docs)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Auth0 Docs](https://auth0.com/docs)
- [WorkOS Docs](https://workos.com/docs)
