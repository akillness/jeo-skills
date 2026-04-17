# Enterprise and Migration Notes

Use this reference when the request is no longer just "add login" and has become an enterprise identity rollout or an auth-stack migration.

## Treat enterprise add-ons as a distinct branch
Enterprise auth work is usually about federation, provisioning, and customer-specific rollout coordination, not just enabling another provider button.

Common signals:
- SAML, OIDC enterprise SSO, Entra ID / Azure AD, Okta, Google Workspace, Ping, or customer-managed IdPs
- SCIM or directory sync
- domain verification, discovery, or enforced SSO
- admin onboarding and customer IT handoff
- customer-specific support or staged rollout requirements

## Questions to answer before recommending the lane
1. Is this a new auth stack or an add-on to an existing login flow?
2. Which customer identity providers must be supported first?
3. Is provisioning manual, JIT, SCIM-driven, or mixed?
4. How do domains, organizations, and users map into the app?
5. What happens when a user already exists through email/password or social login?
6. What support path exists for failed SSO setup, bad mappings, or provisioning drift?

## Common enterprise boundary packet
- **Identity provider / enterprise layer owns:** federation handshake, customer IdP metadata, directory sync protocol, admin onboarding flow
- **Application owns:** organization/workspace records, role/entitlement mapping, support overrides, billing-linked access, customer-visible fallback UX
- **Shared edge:** account linking, domain verification, SCIM ↔ local membership sync, auditability, offboarding/deprovisioning behavior

## Migration patterns

### A. Hosted/framework-native auth adding enterprise later
Usually keep the existing auth stack, then add:
- organization/domain mapping rules
- account-linking rules for existing users
- enterprise-only admin/onboarding path
- sync/reconciliation plan for provisioning events

### B. Provider migration
Treat as an identity-data migration project, not a library swap.
Record:
- canonical user identifier and how it survives the cutover
- session invalidation / re-auth expectations
- password/import constraints if moving credential systems
- callback/domain changes per environment
- rollback boundary if the cutover misbehaves

### C. Self-hosted / sovereignty move
Expect more operational work:
- backup and upgrade policy
- realm/tenant configuration ownership
- secret rotation and signing-key handling
- admin/operator responsibility boundaries

## Failure modes worth naming
- Existing accounts do not link cleanly to enterprise identities.
- SCIM creates users before the app has a matching org or seat model.
- Domain verification or redirect URLs drift between preview and production.
- Enterprise onboarding requires per-customer manual support that was never scoped.
- Migrations ignore session invalidation and create surprise lockouts.

## Output reminder
If the request includes enterprise identity or migration pressure, the final plan should name:
1. whether this is an add-on vs replacement
2. account-linking strategy
3. org/domain mapping rules
4. provisioning / deprovisioning behavior
5. rollout and rollback notes
