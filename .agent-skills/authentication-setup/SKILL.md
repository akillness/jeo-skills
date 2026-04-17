---
name: authentication-setup
description: >
  Design or refactor product authentication setup for web apps and APIs. Use when
  the user needs to choose hosted, framework-native, platform-native, enterprise-
  add-on, or self-hosted auth; define sessions vs JWTs; wire OAuth/social login,
  passkeys, org/member models, callback/cookie environment setup, or SSO/SCIM
  rollout boundaries before implementation. Not for deeper authorization policy,
  general security hardening, API contract design, backend test planning, or pure
  database modeling.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for SaaS, internal tools, B2B web apps, APIs, and fullstack frameworks such
  as Next.js, React, Node, Python, and Postgres/Supabase-style stacks where auth
  setup decisions cross frontend, backend, data, deployment, and enterprise
  customer handoff.
license: MIT
metadata:
  version: "2.1.0"
  modernization: 2026-04-14
  structural_hardening: 2026-04-17
  tags: authentication-setup, auth, sessions, jwt, oauth, passkeys, sso, scim, product-auth, backend
  platforms: Claude, ChatGPT, Gemini
---

# Authentication Setup

Use this skill when the real job is **choosing and structuring product authentication for a real app**, not dumping JWT snippets or pretending authentication, authorization, security hardening, and docs are all the same task.

`authentication-setup` owns the setup layer for:
- choosing hosted vs framework-native vs platform-native vs enterprise add-on vs self-hosted auth
- deciding session/cookie vs token boundaries
- selecting login methods: email/password, magic links, social OAuth, passkeys
- defining what user/profile/org/membership data stays app-owned
- planning SSO/SCIM, domain mapping, and migration/cutover boundaries
- recording callback URLs, cookie domains, preview/staging drift, and rollout notes

Read these support docs before choosing the lane or handoff:
- [references/auth-decision-matrix.md](references/auth-decision-matrix.md)
- [references/boundary-checklist.md](references/boundary-checklist.md)
- [references/session-and-deployment-notes.md](references/session-and-deployment-notes.md)
- [references/enterprise-and-migration-notes.md](references/enterprise-and-migration-notes.md)

## When to use this skill
- Set up auth for a new web app, SaaS product, admin app, or API-backed product
- Decide between Clerk, Auth.js, Better Auth, Supabase Auth, Firebase Auth, Cognito, Keycloak, or similar paths
- Add or refactor sessions, cookies, refresh-token strategy, OAuth providers, or passkeys
- Define app-owned users, profiles, orgs, memberships, and role boundaries around an auth provider
- Add organizations, invites, enterprise SSO, SCIM, or domain verification as the next milestone
- Untangle auth boundaries across frontend routes, middleware, backend APIs, and database policy layers
- Review whether the current auth stack is too vendor-coupled, too DIY, or too vague to scale safely

## When not to use this skill
- **The main job is authorization policy, permission inheritance, or ABAC/ReBAC modeling** → treat it as a dedicated authorization design problem and route contract semantics to `api-design`
- **The main job is cookie flags, CSRF, rate limiting, secret handling, abuse prevention, or general vulnerability hardening** → use `security-best-practices`
- **The main job is API contract/interface design before auth is slotted into the API honestly** → use `api-design`
- **The main job is developer-facing reference docs, quickstarts, or API auth docs for consumers** → use `api-documentation`
- **The main job is backend regression coverage, login/callback testing, or role-matrix test planning** → use `backend-testing`
- **The main job is deeper schema normalization/indexing rather than auth-owned tables and identity boundaries** → use `database-schema-design`

## Instructions

### Step 1: Classify the auth job before naming vendors
Normalize the request first.

```yaml
auth_setup_profile:
  app_type: saas | internal-tool | marketplace | consumer-app | api-only | mixed | unknown
  auth_lane: hosted | framework-native | platform-native | enterprise-add-on | self-hosted | unknown
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
4. Which auth/data pieces are already fixed by the current stack?

### Step 2: Choose the smallest credible auth lane
Use [auth-decision-matrix.md](references/auth-decision-matrix.md) instead of rebuilding the landscape from memory.

Default lane chooser:
- **Hosted auth** when speed, prebuilt UX, providers, MFA/passkeys, and polished onboarding matter most
- **Framework-native auth** when the team wants auth close to app code and app-owned data
- **Platform-native auth** when Supabase/Firebase/Appwrite-style platform choices are already fixed
- **Enterprise add-on** when the request includes SAML/OIDC SSO, SCIM, directory sync, or domain verification
- **Self-hosted** when sovereignty, air-gapped, OSS-only, or on-prem requirements dominate

Rules:
1. Recommend one primary lane and at most one fallback.
2. If the backend platform is already fixed, evaluate platform-native first.
3. If enterprise identity is mentioned, branch there explicitly instead of flattening it into consumer login.
4. If migration or cutover risk matters, pull in [enterprise-and-migration-notes.md](references/enterprise-and-migration-notes.md).

### Step 3: Draw the provider/app ownership boundary
Before implementation, state who owns what.

Minimum boundary packet:
- **Provider usually owns:** sign-in methods, password reset/email verification, MFA/passkey ceremony, token/session issuance, enterprise federation entry points
- **Application usually owns:** local user/profile records, org/workspace membership, roles/entitlements, billing-linked access, admin/support exceptions, domain-specific authorization
- **Shared edge:** claims copied into tokens or sessions, webhook/user sync, callback URLs, middleware, cookie config, audit/event visibility

Use [boundary-checklist.md](references/boundary-checklist.md) to keep the skill from drifting into neighboring lanes.

### Step 4: Choose the session and login model deliberately
Use [session-and-deployment-notes.md](references/session-and-deployment-notes.md) for the detailed heuristics.

Quick defaults:
- **Server sessions / signed cookies** for browser-heavy apps, SSR, and middleware-friendly auth state
- **Stateless JWTs** for API-heavy and multi-service traffic where token verification is a first-class requirement
- **Hybrid** when browser sessions and API/machine tokens both matter

Always record:
- chosen login methods and why they are needed now
- token/session lifetime and refresh strategy
- logout/revocation expectations
- callback URL and cookie/domain behavior across local, preview, staging, and production
- edge/runtime constraints that may change helper availability

### Step 5: Model app-owned auth data
Even hosted auth rarely removes the need for local tables.

Usually define at least:
- `users` or `profiles`
- `organizations` / `workspaces` if multi-tenant
- `memberships` / `roles`
- invitation, provisioning, or seat state if teams are invited/admin-managed

Record:
- the stable user identifier across provider and app DB
- which fields stay vendor-owned vs mirrored locally
- whether permissions live in claims, local tables, or both
- how webhook or sync failures are detected and repaired

If the request slides into broader schema design, route deeper modeling to `database-schema-design`.

### Step 6: Branch enterprise or migration work explicitly
If the request includes SSO, SCIM, domain verification, existing-user linking, provider migration, or self-hosted cutover risk, use [enterprise-and-migration-notes.md](references/enterprise-and-migration-notes.md).

Name these items directly:
- whether this is an add-on vs replacement
- account-linking and org/domain mapping rules
- provisioning / deprovisioning behavior
- customer onboarding/support expectations
- rollback boundary if the rollout or migration goes wrong

### Step 7: Produce an auth setup packet
The output should help the next implementation step succeed.

Preferred packet:
1. chosen auth lane and why
2. primary stack recommendation plus fallback
3. provider/app ownership boundary
4. session + login model
5. app-owned data model outline
6. environment checklist
7. adjacent route-outs
8. open risks or migration notes

## Output format
Use this structure unless the user asks for another format:

```markdown
# Authentication Setup Plan

## Auth lane
- chosen lane
- why it fits

## Recommended stack
- primary option
- fallback option
- tradeoffs

## Ownership boundary
- provider owns
- app owns
- shared edge / sync points

## Session + login model
- sessions vs JWT vs hybrid
- chosen login methods
- callback/cookie/runtime notes

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

### Example 3: Enterprise expansion or migration
Input:
> We already have login. Now add enterprise SSO and SCIM for B2B customers without rewriting our whole auth stack.

Expected handling:
- classify as enterprise add-on or migration-sensitive work, not basic consumer-login setup
- cover account linking, org/domain mapping, and provisioning boundaries
- avoid pretending SSO/SCIM is the same job as social login or password auth

## Best practices
1. Start with the auth lane and ownership boundary, not code snippets.
2. Keep authentication setup separate from deeper authorization policy and general security hardening.
3. Assume most products still need app-owned user/org/membership tables even with hosted auth.
4. Treat enterprise SSO/SCIM and migrations as a distinct branch once B2B or cutover pressure appears.
5. Record environment-specific callback, cookie, and preview-deployment behavior early.
6. Prefer one clear primary recommendation with a fallback, not a giant vendor list.
7. Route adjacent work explicitly so `authentication-setup` stays reusable instead of becoming another backend catch-all.

## References
- [Next.js Authentication](https://nextjs.org/docs/app/guides/authentication)
- [Auth.js](https://authjs.dev/)
- [Clerk Docs](https://clerk.com/docs)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Keycloak Docs](https://www.keycloak.org/documentation)
- [WorkOS Docs](https://workos.com/docs)
