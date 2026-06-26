---
name: api-documentation
description: ">"
license: MIT
compatibility: ">"
allowed-tools: Read Write Edit Glob Grep
metadata:
  tags: api-documentation, developer-docs, openapi, swagger, graphql, webhooks, sdk-docs, developer-portal, integration-guides
  platforms: Claude, ChatGPT, Gemini
  version: 2.1.0
  modernization: 2026-04-13
  structural_hardening: 2026-04-17
---












# API Documentation

Use this skill when the main job is **publishing or refreshing developer-facing API docs that help integrators reach first success, understand reference truth, and stay unblocked as the API evolves**.

`api-documentation` is the documentation-cluster anchor for:
- endpoint / schema reference docs
- quickstarts and first-success flows
- task-oriented integration guides
- SDK guides
- webhook delivery / verification docs
- developer-portal navigation and grouped reference surfaces
- migration updates attached to the docs surface

Read these support docs before choosing the mode or output packet:
- [references/documentation-modes-and-boundaries.md](../api-documentation--references/documentation-modes-and-boundaries.md)
- [references/output-packets-and-navigation.md](../api-documentation--references/output-packets-and-navigation.md)
- [references/example-and-reference-checklist.md](../api-documentation--references/example-and-reference-checklist.md)
- [references/publishing-and-drift-control.md](../api-documentation--references/publishing-and-drift-control.md)

## When to use this skill
- A team needs API reference, quickstarts, or portal pages that external developers, partners, or internal integrators can actually use.
- An OpenAPI or schema artifact already exists, but the docs need structure, examples, auth/setup guidance, error handling, or clearer navigation.
- Existing API docs drifted after auth, versioning, retry, pagination, webhook, or SDK changes.
- A public, partner, or internal API launch needs developer-facing guides, migration notes, or trustworthy examples.
- A large API surface needs grouping, selective publishing, or cleaner portal structure instead of one giant reference dump.

## When not to use this skill
- **The main job is designing resources, endpoint shape, schema rules, or versioning strategy** → use `api-design`.
- **The main job is writing internal specs, ADRs, runbooks, rollout docs, or system migration procedures** → use `technical-writing`.
- **The main job is end-user/product UI onboarding, screenshots, tutorials, or help-center docs** → use `user-guide-writing`.
- **The main job is implementing auth/session/provider behavior rather than documenting how API consumers authenticate** → use `authentication-setup`.
- **The main job is release-note, semver, or changelog hygiene** → use `changelog-maintenance`.
- **There is no credible source of truth for the API behavior yet** → route missing contract questions back to `api-design` instead of inventing docs from vibes.

## Instructions

### Step 1: Classify the API-doc job
Normalize the request before drafting.

```yaml
api_documentation_mode:
  primary_mode: reference | quickstart | task-guide | sdk-guide | webhook-guide | migration-update
  api_style: rest | graphql | webhook | sdk | mixed | unknown
  audience: external-developers | internal-integrators | partners | mixed | unknown
  source_of_truth: openapi | graphql-schema | code-annotations | tests | mixed | unknown
  docs_surface: developer-portal | docs-site | repo-markdown | sdk-site | internal-catalog | unknown
  navigation_scope: single-operation | grouped-resource | large-api-surface | portal-section | unknown
  maintenance_state: new-docs | refresh | drift-fix | launch-critical
```

Choose one **primary mode** per run:
- `reference` → endpoint/schema truth with parameters, fields, errors, limits, and examples
- `quickstart` → fastest path to first successful API call or webhook receipt
- `task-guide` → one workflow or integration outcome
- `sdk-guide` → language/client-library guidance plus examples and caveats
- `webhook-guide` → delivery, verification, retry, and local-debug guidance
- `migration-update` → changed behavior and transition path on the docs surface

If the surface is large, also decide whether the task is about **grouping/navigation** as much as prose. Do not hide large-surface information architecture inside a generic “write docs” request.

### Step 2: Confirm boundary skills and the real developer job
Answer these four questions before writing:
1. Who is integrating with this API, and what exact job should they complete after reading?
2. What artifact is the real contract source of truth today?
3. Which docs surface are you updating: portal, repo docs, SDK site, internal catalog, or mixed?
4. Which neighboring skills must stay out of scope?

Quick route-out table:

| If the request sounds like... | Use |
|---|---|
| "Design the endpoints / resources / schema before coding" | `api-design` |
| "Write the architecture doc / ADR / rollout plan / runbook" | `technical-writing` |
| "Write customer help docs for using the product UI" | `user-guide-writing` |
| "Explain provider setup / session middleware / token implementation" | `authentication-setup` |
| "Summarize what shipped in the release" | `changelog-maintenance` |
| "Write the developer portal / OpenAPI docs / quickstart / webhook guide" | `api-documentation` |

### Step 3: Gather the smallest truthful evidence set
Do not write API docs from an outdated spec alone. Pull the minimum credible evidence first:
- current OpenAPI / GraphQL schema / endpoint list / SDK surface
- auth requirements: keys, headers, scopes, signing, sandbox vs production, callback/webhook verification
- example requests and responses that match current behavior
- common errors, retries, limits, pagination/cursor behavior, and idempotency expectations
- versioning, deprecation, and migration notes
- tests, fixtures, or verified requests that keep examples honest
- publishing constraints: portal nav, selective publishing needs, docs-site structure, or internal-catalog grouping

If details are incomplete, label assumptions clearly and produce a docs-gap list instead of faking certainty.

### Step 4: Choose the smallest useful packet
Match the output to the developer job. Do **not** dump quickstart, reference, SDK docs, and migration notes into one giant page by default.

Common packet choices:
- one quickstart page
- one grouped reference section
- one task/integration guide
- one SDK guide
- one webhook guide
- one migration-update note
- one docs-gap / drift checklist for unresolved truth-source issues
- one navigation/grouping proposal for a large API surface

Use [references/output-packets-and-navigation.md](../api-documentation--references/output-packets-and-navigation.md) for mode skeletons and portal/grouping guidance.

### Step 5: Apply API-doc rules instead of generic writing advice
Use these rules aggressively:
- **Lead with the developer task and integration surface**, not marketing copy.
- **State auth and environment assumptions early**.
- **Keep examples truthful**: prefer tests, verified requests, or real fixture shapes.
- **Document operational realities**: errors, retries, limits, pagination, webhook replay, eventual consistency, idempotency.
- **Separate reference truth from workflow guidance**.
- **Expose navigation decisions** on large APIs: grouping, selective publishing, and related-guide links matter.
- **Link outward deliberately**: quickstarts point to deeper reference; reference points to task guides; migration updates point to changelog/release notes rather than replacing them.

### Step 6: Protect against drift on purpose
Before finalizing, record:
- contract source of truth
- example source of truth
- publishing surface
- review trigger
- drift hotspots: auth, limits, retries, versioning, webhook fields, SDK examples, migration notes
- companion docs that must stay aligned: quickstarts, SDK pages, changelog entries, Postman collections, portal navigation

Use [references/publishing-and-drift-control.md](../api-documentation--references/publishing-and-drift-control.md) as the anti-drift checklist.

### Step 7: Verify output quality
Before shipping, check:
1. Could a new integrator reach first success with this doc set?
2. Are auth and environment assumptions visible before the first call?
3. Do examples match real behavior?
4. Are errors, limits, retries, pagination, or verification notes present where needed?
5. Is the output packet small enough for the request?
6. Are route-outs to `api-design`, `technical-writing`, `user-guide-writing`, `authentication-setup`, and `changelog-maintenance` still explicit?

## Examples

### Example 1: Partner API quickstart
**Input:** “Write the quickstart for our Orders API so partners can create an API key, send the first `POST /orders`, and verify the returned order ID.”

**Good output shape:** chooses `quickstart`, shows prerequisites and auth early, gives one first-success request plus a success check, and links to the deeper reference surface.

### Example 2: Large reference cleanup
**Input:** “Our developer portal publishes one huge OpenAPI collection; help us regroup endpoints, expose only partner-safe sections, and add navigation that developers can scan.”

**Good output shape:** treats this as `reference` plus `navigation/grouping` work, proposes grouped sections or selective publishing, preserves truthful reference links, and does not pretend auto-generation alone solves the structure problem.

### Example 3: Webhook change notice
**Input:** “Update our webhook docs because `invoice.paid` now retries for 24 hours, includes `attempt_count`, and requires HMAC verification on every delivery.”

**Good output shape:** chooses `webhook-guide` or `migration-update`, documents retry and verification behavior, updates affected examples, and keeps implementation details and release-note hygiene out of scope.

### Example 4: Route-out to API design
**Input:** “We haven’t decided whether this should be REST or GraphQL, and we need a resource model and pagination plan.”

**Good output shape:** routes the task to `api-design`, explains that contract/interface work must happen before docs publication, and may note what docs surfaces will be needed later.

## Best practices
1. Treat API docs as developer workflow artifacts, not as schema rendering alone.
2. Keep contract design separate from developer-facing publication.
3. Prefer small, truthful packets over one giant portal page.
4. Make auth, examples, limits, retries, pagination, and webhook behavior explicit early.
5. Document navigation/grouping decisions for large surfaces instead of burying them in prose.
6. Tie docs maintenance to real truth sources so refreshes do not drift.
7. Route adjacent writing, auth implementation, and release hygiene tasks to the right neighboring skill.

## References
- [OpenAPI Initiative](https://www.openapis.org/)
- [Stripe API Reference](https://docs.stripe.com/api)
- [GitHub REST API docs](https://docs.github.com/en/rest?apiVersion=2022-11-28)
- [ReadMe Guides](https://docs.readme.com/main/docs/guides)
- [Redocly docs](https://redocly.com/docs/)
- [Postman API documentation](https://www.postman.com/api-platform/api-documentation/)
