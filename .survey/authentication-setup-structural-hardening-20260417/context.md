# Context: authentication-setup structural hardening

## Workflow Context
`authentication-setup` sits in a high-frequency backend/fullstack lane: teams choose between hosted auth, framework-native auth, platform-native auth, enterprise add-ons, and self-hosted identity before they can implement login, sessions, or org data safely. The repo-local graph report now says support coverage is complete across the skill catalog, so the next maintenance wins come from shrinking dense front doors and moving durable detail into references. `authentication-setup` still carries 337 lines in `SKILL.md`, despite already having references and evals.

Primary-source evidence shows why the lane stays broad in practice:
- Next.js documents auth as a cross-cutting app concern spanning authentication, session management, authorization, and context providers (`Guides: Authentication | Next.js`, browser-rendered primary page evidence: https://nextjs.org/docs/app/guides/authentication).
- Auth.js presents itself as "Authentication for the Web" with guides for OAuth providers, custom sign-in pages, and framework integrations (`Auth.js | Authentication for the Web`, browser-rendered primary page evidence: https://authjs.dev/).
- Clerk docs foreground authentication flows, session management, organization management, billing, and security in one hosted stack (`Welcome to Clerk Docs | Clerk Docs`, browser-rendered primary page evidence: https://clerk.com/docs).
- Supabase Auth explicitly combines authentication and authorization guidance, then branches into sessions, social login, enterprise SSO, redirect URLs, JWTs, and RLS (`Auth | Supabase Docs`, browser-rendered primary page evidence: https://supabase.com/docs/guides/auth).
- WorkOS separates full auth from enterprise add-ons like SSO, Directory Sync, Admin Portal, Roles and Permissions, and data syncing (`WorkOS Docs`, browser-rendered primary page evidence: https://workos.com/docs).
- Keycloak positions self-hosted identity as a heavier operational surface with separate getting-started, server install, admin, securing-apps, and authorization-services guides (`Documentation - Keycloak`, browser-rendered primary page evidence: https://www.keycloak.org/documentation).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack app builders | Choose auth stack, sessions, callback handling, and org/member modeling | Intermediate |
| Backend/API maintainers | Define provider-vs-app ownership, token/session transport, and migration boundaries | Intermediate–Advanced |
| B2B product teams | Add SSO/SCIM without flattening enterprise identity into consumer login flows | Advanced |
| Repo maintainers | Keep the skill concise, trigger-accurate, and easy to route without duplicate wrappers | Advanced |

## Current Workarounds
1. Keep a broad `SKILL.md` that mixes lane selection, boundary rules, session heuristics, and enterprise/self-hosted nuance in one front door.
2. Rely on existing references for detail, but still repeat lane and packet content in the main skill because the front door is trying to be self-sufficient.
3. Use compact discovery (`SKILL.toon`) to summarize the skill correctly while the main file still carries too much operational detail.

## Adjacent Problems
- Oversized front doors make boundary drift more likely: auth setup can slide into security hardening, API contract design, docs publishing, DB modeling, or backend testing.
- Enterprise add-ons (SSO/SCIM/domain verification) are easy to flatten into the same checklist as social login unless the main skill routes aggressively.
- Environment drift around callback URLs, cookie domains, and preview/staging behavior still causes practical auth failures even when the auth stack choice is correct.

## User Voices
- "auth() Returns Null in App Router Despite Valid Session Cookie and Database Session" — Auth.js issue showing session/runtime edge complexity in modern Next.js flows: https://github.com/nextauthjs/next-auth/issues/12894
- "useSession only getting the session after manually reloading the page" — Auth.js issue showing client/session sync friction: https://github.com/nextauthjs/next-auth/issues/9504
- "Organization Plugin: listMembers requires organizationId, preventing cross-organization member search" — Better Auth issue showing org/member modeling complexity beyond basic login: https://github.com/better-auth/better-auth/issues/8740
- "tracking: organization invitations (validation, race conditions, channels)" — Better Auth issue showing invitations and multi-tenant workflow complexity: https://github.com/better-auth/better-auth/issues/9184
- "[Auth] URLs reset in non-production branches" — Supabase issue showing preview/non-prod redirect drift as a real operator problem: https://github.com/supabase/supabase/issues/42323
