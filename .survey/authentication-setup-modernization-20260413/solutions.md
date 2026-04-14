# Solution Landscape: authentication-setup modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Clerk | Hosted auth / developer-first auth SaaS | Fast DX, polished UI/components, organizations/B2B support, strong React/Next.js ergonomics | Vendor lock-in, ongoing cost, app-specific authz still remains local | Strong fit for fast-moving SaaS apps that want prebuilt product auth |
| Auth0 | Hosted auth / enterprise-capable identity platform | Mature OIDC/SAML support, extensibility, large ecosystem, enterprise depth | Heavier complexity and pricing than newer DX-first tools | Good when login and enterprise identity both matter |
| Firebase Authentication | Hosted auth bundled with app platform | Quick setup, mobile/web support, strong Firebase ecosystem fit | Less natural for deeper enterprise/B2B auth modeling | Common for Firebase-centric products |
| Amazon Cognito | Hosted auth bundled with AWS | Native AWS integration, enterprise familiarity, scales well | Rougher DX and setup friction | Often chosen in AWS-first organizations |
| Auth.js | Framework-native auth | Huge JS/fullstack mindshare, provider ecosystem, framework fit | You still own adapters, persistence, and much of authz | Default route for many Next.js teams who want auth in app code |
| Better Auth | Framework-native auth | Modern TS-first positioning, integrated auth primitives | Newer ecosystem and fewer long-tail examples | Growing option for modern JS apps |
| Lucia | Lightweight framework-native auth | Flexible, minimal, app-owned data model | More DIY and less ideal for fastest setup | Better for teams that want tight control |
| Supabase Auth | Platform-native auth | Tight Postgres + auth + RLS story, common in OSS/fullstack workflows | Works best if you accept Supabase’s architecture | Strong route when Supabase is already chosen |
| Appwrite Auth | Platform-native auth | Integrated backend/auth story, OSS option | Smaller ecosystem footprint | Situational but valid when Appwrite is already in use |
| WorkOS | Enterprise identity layer | Fast path to enterprise SSO, SCIM, directory sync | Often complements rather than replaces app auth | Distinct enterprise branch, not generic app auth |
| Keycloak | Self-hosted identity | Strong standards support, common OSS/on-prem identity choice | Operational overhead and admin complexity | Strong self-hosted / on-prem route |
| Authentik | Self-hosted identity | Modern OSS identity with friendlier admin experience | Smaller ecosystem than Keycloak | Good self-hosted alternative |

## Categories
- **Hosted auth**: Clerk, Auth0, Firebase Authentication, Amazon Cognito
- **Framework-native auth**: Auth.js, Better Auth, Lucia
- **Platform-native auth**: Supabase Auth, Appwrite Auth
- **Enterprise identity add-on**: WorkOS, Okta/Entra-class solutions, Auth0 enterprise features
- **Self-hosted identity**: Keycloak, Authentik, Zitadel/Ory-class options

## What People Actually Use
In practice, teams rarely use a single auth tool end-to-end.

Common real-world stack shapes:
1. hosted auth vendor for sign-in + app-owned DB tables for profiles, orgs, memberships, and entitlements
2. framework-native auth plus app-owned sessions/cookies, then custom middleware and database checks for authorization
3. Supabase/Firebase-style platform auth paired with local policies, RLS, or entitlement tables
4. basic product auth first, then an enterprise SSO layer such as WorkOS later for B2B customers
5. coarse roles in claims/tokens plus finer authorization in local tables and server checks

## Frequency Ranking
Practical routing frequency for 2025–2026 product-auth setup requests:
1. Auth.js / NextAuth ecosystem
2. Clerk
3. Supabase Auth
4. Firebase Authentication
5. Auth0
6. Better Auth
7. Amazon Cognito
8. WorkOS
9. Keycloak
10. Authentik

## Key Gaps
- Most solutions make sign-in easier than authorization, org modeling, or entitlement design.
- Vendor docs rarely own the full boundary between session transport, app-owned user data, and deeper authorization policy.
- Enterprise SSO/SCIM is a qualitatively different workflow from consumer/social login, but many generic auth guides flatten them together.
- Teams still need a reusable decision layer for choosing hosted vs framework-native vs platform-native vs self-hosted auth before implementation.

## Contradictions
- Marketed claim: one auth product can “do auth for your app.”
  Reality: teams usually still own local user/org data, authorization policy, support exceptions, and testing.
- Marketed claim: JWT/session choice is the main decision.
  Reality: framework/runtime boundaries, org modeling, provider lifecycle, and enterprise add-ons often matter more.
- Marketed claim: enterprise SSO is just another provider.
  Reality: SSO/SCIM introduces provisioning, domain verification, support, and account-mapping workflows that deserve their own branch.

## Key Insight
The best modernization target is not another auth implementation tutorial. It is a decision-first `authentication-setup` skill that routes users into the right auth lane — hosted, framework-native, platform-native, enterprise, or self-hosted — and then clearly hands off deeper authorization, security hardening, API semantics, and backend testing to adjacent skills.

## Curated Sources
- Next.js authentication: https://nextjs.org/docs/app/building-your-application/authentication
- Auth.js: https://authjs.dev/
- Better Auth docs: https://www.better-auth.com/docs
- Clerk docs: https://clerk.com/docs
- Auth0 docs: https://auth0.com/docs
- Supabase Auth docs: https://supabase.com/docs/guides/auth
- Firebase Authentication docs: https://firebase.google.com/docs/auth
- Amazon Cognito developer guide: https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html
- WorkOS docs: https://workos.com/docs
- Keycloak guides: https://www.keycloak.org/guides
- Authentik docs: https://goauthentik.io/docs/
