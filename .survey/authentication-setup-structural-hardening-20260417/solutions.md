# Solution Landscape: authentication-setup structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Clerk | Hosted auth platform | Fast onboarding, prebuilt flows, orgs/billing/security surfaces in one docs stack | Vendor coupling; app-owned authz/data still remains | Hosted-auth default when speed and polished UX dominate |
| Auth.js | Framework-native auth | Strong web/framework fit, broad OAuth/session guidance, open-source adoption | Session/runtime edge cases and more assembly work | Good canonical example for framework-native lane |
| Better Auth | Framework-agnostic TS auth framework | Broad built-in features, plugins, multi-tenancy, enterprise options, AI resources | Expanding surface can blur auth vs authz vs org workflow detail | Useful framework-native contrast to Auth.js |
| Supabase Auth | Platform-native auth | Auth stays near DB/platform primitives; docs cover sessions, enterprise SSO, redirect URLs, JWTs, RLS | Architectural coupling; app-owned authorization still required | Best when Supabase is already fixed |
| WorkOS | Enterprise add-on / auth platform | Clear SSO, Directory Sync, Admin Portal, RBAC, domain verification, data-sync surfaces | Enterprise scope can expand rollout/support work quickly | Best evidence for keeping enterprise add-ons as a distinct branch |
| Keycloak | Self-hosted identity platform | Strong fit for on-prem / sovereignty / OSS constraints | Operational/admin complexity, upgrade burden | Best evidence for self-hosted branch staying explicit |

## Categories
- **Hosted auth:** Clerk (plus Auth0/Cognito class from existing skill references)
- **Framework-native auth:** Auth.js, Better Auth, Lucia-class tools
- **Platform-native auth:** Supabase Auth, Firebase/Auth platform-tied options
- **Enterprise add-ons:** WorkOS, enterprise tiers on hosted stacks, IdP integrations
- **Self-hosted identity:** Keycloak, Authentik, Zitadel/Ory-class options

## What People Actually Use
In practice, teams do not pick a single abstract "auth solution." They mix a lane choice with surrounding boundary work:
- hosted or framework-native auth for baseline login/session UX
- app-owned users/orgs/memberships/roles in the product database
- enterprise add-ons later for SSO/SCIM/domain verification
- environment-specific callback/cookie handling across local, preview, staging, and prod
- route-outs to security hardening, authorization design, API docs, and regression testing

The GitHub issue layer shows persistent friction in exactly those mixed boundaries: App Router session behavior, client reload/session sync, organization workflows, invitation race conditions, and redirect URL drift.

## Frequency Ranking
1. **Framework-native + hosted auth** dominate the practical setup conversation for web apps and SaaS products.
   - Auth.js GitHub repo: 28.2k stars (`nextauthjs/next-auth`) via GitHub API primary-source retrieval
   - Better Auth GitHub repo: 27.8k stars (`better-auth/better-auth`) via GitHub API primary-source retrieval
2. **Platform-native auth** stays strong when the backend platform is already fixed.
   - Supabase GitHub repo: 100.9k stars (`supabase/supabase`) via GitHub API primary-source retrieval
3. **Self-hosted identity** remains important but is a narrower default lane.
   - Keycloak GitHub repo: 33.9k stars (`keycloak/keycloak`) via GitHub API primary-source retrieval
4. **Enterprise add-ons** recur as a later expansion path rather than the first greenfield default.
   - WorkOS docs foreground SSO, Directory Sync, Admin Portal, RBAC, and data syncing as explicit add-on surfaces.

## Key Gaps
- Many auth surfaces still bundle consumer login, enterprise federation, org modeling, callback/cookie environment drift, and security handoffs into one long front door.
- Repo maintainers need the skill to route cleanly without forcing every run to re-read a long mixed manual.
- Enterprise expansion and migration pressure deserve a clearer support packet rather than more prose in the main skill.

## Contradictions
- Product docs often market auth stacks as comprehensive, but issue threads still surface session sync, redirect drift, and organization/invitation complexity.
- Platform-native stacks reduce integration sprawl, yet still require app-owned authorization and local data boundaries.
- Enterprise add-ons are often sold as extensions of auth, but operationally they behave like a separate rollout/support track.

## Key Insight
The right improvement is not another auth helper skill. It is to keep `authentication-setup` as the canonical router while shrinking the main front door and moving lane-specific / enterprise-migration detail into references. The category landscape is already well represented; the actual repo gap is maintenance shape, not missing topic coverage.
