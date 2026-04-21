# Context: authentication-setup modernization

## Workflow Context
Modern auth setup pain now shows up at product boundaries rather than only in password hashing or login endpoints.

It usually appears when teams need to decide:
1. whether to use hosted auth, framework-native auth, a bundled backend platform, or self-hosted identity
2. how browser sessions, API tokens, OAuth callbacks, SSR/middleware, and admin flows fit together
3. what minimum user, profile, org, membership, and role data the app must own locally
4. where authentication stops and deeper authorization, security hardening, or enterprise identity work begins

Representative workflow anchors:
- Next.js frames authentication as an app-architecture concern spanning middleware, server components, and route handlers rather than a single login snippet: https://nextjs.org/docs/app/building-your-application/authentication
- Auth.js is a common framework-native shell for JS fullstack apps, but still expects app-specific session, adapter, and authorization choices: https://authjs.dev/
- Clerk treats organizations as a first-class next step beyond basic login: https://clerk.com/docs/organizations/overview
- Supabase links auth directly to Postgres and row-level security concerns: https://supabase.com/docs/guides/auth and https://supabase.com/docs/guides/database/postgres/row-level-security
- Auth0 treats RBAC as an adjacent but distinct control surface: https://auth0.com/docs/manage-users/access-control/rbac
- WorkOS highlights the separate enterprise lane for SSO and SCIM: https://workos.com/docs

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack product engineer | Ship login, sessions, protected routes, invites, and admin/product permissions fast | Intermediate–advanced |
| Backend engineer | Define token/session boundaries, API auth behavior, and local user/role/org models | Intermediate–advanced |
| Startup / indie team | Choose the fastest safe auth path without painting the product into a corner | Beginner–intermediate |
| B2B SaaS team | Add organizations, roles, SSO, SCIM, and multi-tenant scoping after basic auth already exists | Intermediate–advanced |
| Security-minded platform team | Keep auth setup separate from broader hardening, compliance, and policy-engine work | Advanced |

## Current Workarounds
1. **Hosted auth plus local app tables** — teams use Clerk/Auth0/Supabase/Firebase/Cognito for sign-in, but still keep local `users`, `profiles`, `memberships`, `roles`, and entitlements in the app database.
2. **Roles in session/JWT claims** — a quick MVP pattern that works until teams need per-resource rules, org scoping, or support/admin exceptions.
3. **Middleware as the junk drawer** — route guards, redirects, org checks, feature gates, and provisioning hooks get piled into middleware because the auth setup never got a clean boundary.
4. **Database-layer authz later** — Supabase/Postgres teams often start with app checks, then move sensitive access rules into RLS once bugs or complexity show up.
5. **Vendor swap or hybridization** — teams start with a framework library or hosted auth vendor, then bolt on WorkOS, policy helpers, or custom claims as B2B requirements grow.
6. **Manual sync pipelines** — webhook-driven user/profile sync, backfills, and claim repair scripts remain normal when identity and app-owned authorization drift apart.

## Adjacent Problems
- Deep authorization model design: RBAC vs ABAC vs ReBAC, org/workspace membership, and permission inheritance
- Enterprise identity: SAML/OIDC enterprise SSO, SCIM, JIT provisioning, domain verification, audit expectations
- API/service authentication: service tokens, machine identities, webhook signature verification
- Security hardening: cookie attributes, CSRF defense, token rotation, secret handling, abuse controls, rate limiting
- Test coverage: auth matrix tests, middleware regression tests, redirect/callback coverage, RLS/policy tests
- Product data modeling: profiles, orgs, memberships, invitation state, billing-linked entitlements

## User Voices
The web-search tools were unavailable during this run (`401 Invalid API key`), so this survey relies on official docs plus repeated ecosystem patterns instead of fabricated direct quotes.

Recurring public pain themes that show up in docs, issues, and community hubs:
- “Authentication is easy; authorization is where product complexity starts.”
- “App Router / middleware / SSR boundaries make auth setup feel fragmented.”
- “Hosted auth solves login but not org membership, permission design, or local data ownership.”
- “RLS is powerful, but debugging policy and claim drift is harder than the marketing copy suggests.”
- “Enterprise SSO is a different project from basic product login, even when vendors market them together.”

Source entry points for later direct verification:
- https://github.com/nextauthjs/next-auth/discussions
- https://github.com/clerk/javascript/issues
- https://github.com/supabase/supabase/discussions
- https://community.auth0.com/
- https://stackoverflow.com/questions/tagged/next-auth
- https://stackoverflow.com/questions/tagged/oauth-2.0
