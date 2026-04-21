# Authentication Decision Matrix

Use this reference when the request says "set up auth" but the real decision is *which auth lane fits the product*.

## Fast lane chooser

| Situation | Default lane | Why |
|---|---|---|
| New SaaS app, wants fastest safe launch | Hosted auth | Prebuilt login, providers, session UX, and org/B2B features arrive faster |
| Next.js/fullstack app wants auth mostly in code | Framework-native | Keeps auth closer to app architecture and DB ownership |
| Supabase/Firebase/Appwrite already chosen | Platform-native | Reduces architecture sprawl and keeps auth near platform primitives |
| Customer enterprise SSO / SCIM is the request | Enterprise add-on | This is a provisioning + federation project, not just another provider button |
| SaaS vendors are disallowed / on-prem required | Self-hosted | Identity infrastructure ownership is part of the requirement |

## Common lane-to-tool map

### Hosted auth
- Clerk
- Auth0
- Firebase Authentication
- Amazon Cognito

Best when:
- time to first working login matters most
- polished built-in UX is valuable
- you expect social login, MFA, or passkeys quickly

Tradeoffs:
- vendor coupling
- pricing cliffs
- app-specific authz still stays local

### Framework-native auth
- Auth.js
- Better Auth
- Lucia
- Passport.js only for legacy compatibility

Best when:
- framework/runtime fit matters
- you want app-owned data and control
- you can tolerate more setup work

Tradeoffs:
- more assembly around email, adapters, sessions, and account linking
- more responsibility for production hardening and edge cases

### Platform-native auth
- Supabase Auth
- Firebase Auth
- Appwrite Auth

Best when:
- backend platform is already fixed
- auth should stay near the same DB/platform primitives

Tradeoffs:
- architecture becomes more platform-shaped
- provider identity still does not eliminate app-owned authorization

### Enterprise add-on
- WorkOS
- Auth0 enterprise features
- Okta / Entra integrations depending on customer environment

Best when:
- customers need SAML/OIDC SSO, SCIM, domain verification, or directory sync

Tradeoffs:
- support + rollout work per customer
- account mapping and provisioning logic increase quickly

### Self-hosted
- Keycloak
- Authentik
- Zitadel / Ory-class options

Best when:
- sovereignty, on-prem, or OSS-only constraints dominate

Tradeoffs:
- operational load
- admin complexity
- backups/upgrades become part of the auth story

## Selection rules
1. Start from the team's constraints, not your favorite vendor.
2. If the backend platform is already fixed, evaluate the platform-native path first.
3. If the product needs enterprise SSO/SCIM, branch there explicitly instead of stuffing it into the consumer-login path.
4. Prefer one primary recommendation and one fallback, not a giant list.
5. If the team is already deep in a hosted auth product, optimize the app-owned boundary instead of assuming a full migration is free.
