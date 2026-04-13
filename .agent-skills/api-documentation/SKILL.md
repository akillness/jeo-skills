---
name: api-documentation
description: >
  Write developer-facing API documentation for REST, GraphQL, webhook, and SDK
  surfaces: reference docs, portal pages, auth/setup guides, example requests,
  error handling notes, changelog-linked migration callouts, and getting-started
  integration guidance. Use when the main job is publishing or refreshing API docs
  that integrators will read, not designing the contract itself. Triggers on: API
  docs, OpenAPI reference, Swagger docs, SDK docs, developer portal, webhook docs,
  auth docs for API consumers, example requests, curl examples, endpoint reference,
  and integration guide. Route contract/interface design to `api-design`, internal
  specs/runbooks to `technical-writing`, end-user tutorials to `user-guide-writing`,
  release-note hygiene to `changelog-maintenance`, and auth implementation to
  `authentication-setup`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for docs-as-code repos, developer portals, OpenAPI/GraphQL references, SDK
  docs, and integration guides where the output helps external or internal
  integrators use an API safely and successfully.
license: MIT
metadata:
  tags: api-documentation, developer-docs, openapi, swagger, graphql, webhooks, sdk-docs, developer-portal, integration-guides
  platforms: Claude, ChatGPT, Gemini
  version: "2.0.0"
  modernization: 2026-04-13
---

# API Documentation

Use this skill when the main job is **publishing or restructuring developer-facing API documentation that helps integrators understand, call, debug, and safely adopt an API**.

`api-documentation` is the documentation-cluster anchor for:
- endpoint / schema reference docs
- developer portal pages
- SDK and integration guides
- auth/setup notes for API consumers
- example requests and responses
- error, pagination, rate-limit, and webhook guidance
- migration / deprecation callouts attached to the docs surface

Read these support docs before choosing the mode or boundary:
- [references/documentation-modes-and-boundaries.md](references/documentation-modes-and-boundaries.md)
- [references/example-and-reference-checklist.md](references/example-and-reference-checklist.md)
- [references/publishing-and-drift-control.md](references/publishing-and-drift-control.md)

## When to use this skill
- A team needs REST, GraphQL, webhook, or SDK docs that developers can actually use
- An OpenAPI or schema artifact exists, but the portal/reference pages need examples, auth notes, and onboarding structure
- A public or partner API launch needs a developer-facing guide, quickstart, or migration section
- Existing API docs drifted after endpoint changes, auth changes, versioning changes, or release work
- Docs need clearer explanations for errors, limits, retries, pagination, idempotency, or webhook verification
- An SDK or integration surface needs truthful code examples, setup guidance, and route-outs to the contract source of truth

## When not to use this skill
- **The main job is deciding resources, endpoint shape, schema design, versioning strategy, or compatibility rules before implementation** → use `api-design`
- **The main job is writing an internal spec, architecture doc, ADR, runbook, or migration procedure for builders/operators** → use `technical-writing`
- **The main job is writing onboarding/help-center docs for end users or admins inside the product UI** → use `user-guide-writing`
- **The main job is release-note hygiene, semantic version messaging, or `CHANGELOG.md` upkeep** → use `changelog-maintenance`
- **The main job is implementing auth/session/token behavior, provider configuration, or login flows** → use `authentication-setup`
- **There is no credible source of truth for the API behavior yet** → capture the gaps and route the contract questions back to `api-design` instead of inventing fake docs

## Instructions

### Step 1: Classify the API-doc job
Normalize the request into one primary mode before drafting.

```yaml
api_documentation_mode:
  primary_mode: reference | quickstart | integration-guide | sdk-guide | webhook-guide | migration-update
  api_style: rest | graphql | webhook | sdk | mixed | unknown
  audience: external-developers | internal-integrators | partners | mixed | unknown
  source_of_truth: openapi | graphql-schema | code-annotations | tests | mixed | unknown
  docs_surface: developer-portal | docs-site | repo-markdown | sdk-site | unknown
  maintenance_state: new-docs | refresh | drift-fix | launch-critical
```

Choose one primary mode per run:
- `reference` → endpoint/schema reference with parameters, fields, errors, limits, and examples
- `quickstart` → fastest path to first successful API call or webhook receipt
- `integration-guide` → task/outcome-oriented guide for one developer workflow
- `sdk-guide` → language/client-library setup plus examples and caveats
- `webhook-guide` → event delivery, verification, retry, and local-debug guidance
- `migration-update` → version/deprecation/changed-behavior update attached to the docs surface

### Step 2: Confirm the real audience and boundary skills
Before writing, answer four questions:
1. Who is integrating with this API, and what do they already know?
2. What exact job should they complete after reading this doc?
3. What contract artifact is the source of truth today?
4. Which neighboring skills must stay out of scope?

Quick route-out table:

| If the request sounds like... | Use |
|---|---|
| "Design the endpoints / resources / schema before coding" | `api-design` |
| "Write the architecture doc / ADR / rollout plan / runbook" | `technical-writing` |
| "Write customer help docs for using the product UI" | `user-guide-writing` |
| "Explain auth provider setup / session middleware / token implementation" | `authentication-setup` |
| "Summarize what shipped in the release" | `changelog-maintenance` |
| "Write the developer portal / OpenAPI docs / examples / webhook guide" | `api-documentation` |

### Step 3: Gather the smallest truthful evidence set
Do not write API docs from vibes or from an outdated spec alone. Pull the minimum credible evidence first:
- current OpenAPI / GraphQL schema / endpoint list / SDK surface
- auth requirements: keys, headers, scopes, signing, callback/webhook verification, sandbox vs production
- example requests and responses that match current behavior
- common errors, retries, limits, rate limits, pagination/cursor behavior, and idempotency expectations
- versioning, deprecation, and migration notes
- source tests, integration fixtures, or real calls that can keep examples honest
- publishing surface constraints: portal, docs site, Markdown repo, SDK reference site

If the details are incomplete, label assumptions clearly and call out where the contract or implementation needs clarification.

### Step 4: Match the structure to the primary mode
Use the smallest structure that fits the job.

#### A. Reference docs
Use when integrators need endpoint/schema truth with examples.

Recommended skeleton:
```markdown
# <API / Service> Reference

## Base URL / environment
## Authentication
## Common headers and conventions
## Endpoints / operations
## Request parameters
## Response schema / example payloads
## Errors and status codes
## Pagination / rate limits / retries
## Related guides
```

#### B. Quickstart
Use for first-success onboarding.

Recommended skeleton:
```markdown
# Quickstart: <First successful API task>

## What you will do
## Prerequisites
## Step 1: Get credentials / access
## Step 2: Make the first request
## Step 3: Verify success
## Common mistakes
## Next guides
```

#### C. Integration guide
Use for one practical workflow beyond simple reference.

Recommended skeleton:
```markdown
# How to <Integration outcome>

## When to use this flow
## Prerequisites
## Step 1
## Step 2
## Step 3
## Verify success
## Failure modes / retries
## Related reference sections
```

#### D. SDK guide
Use when an official or internal client library needs developer guidance.

Recommended skeleton:
```markdown
# <SDK name> guide

## Install / import
## Configure credentials and environment
## First working example
## Common operations
## Error handling / retries
## Version compatibility notes
## Links to raw API reference
```

#### E. Webhook guide
Use for event-driven integrations.

Recommended skeleton:
```markdown
# Webhook integration guide

## Event delivery model
## Registering an endpoint
## Signature verification
## Retry / idempotency rules
## Local development and testing
## Event payload examples
## Failure troubleshooting
```

#### F. Migration update
Use when behavior changed and the docs need a developer-facing transition path.

Recommended skeleton:
```markdown
# <API / SDK> migration update

## What changed
## Who is affected
## Deprecated behavior
## New behavior / examples
## Migration steps
## Timeline and compatibility notes
## Related changelog / release notes
```

### Step 5: Apply API-doc rules instead of generic writing advice
Use these rules aggressively:
- **Lead with the developer task and the integration surface**, not with marketing copy.
- **State environment and auth assumptions early**: sandbox vs production, API keys, OAuth scopes, signing keys, tenant requirements, or network prerequisites.
- **Keep examples truthful**: if the example came from a test or verified request, preserve the real shapes and note placeholders clearly.
- **Separate contract truth from developer guidance**: the schema/reference shows what exists; the guide explains how to use it safely.
- **Document operational realities**: retries, limits, pagination, eventual consistency, async processing, webhook replay, and idempotency matter as much as the happy path.
- **Call out version or deprecation risk explicitly** when the docs cover changing surfaces.
- **Use copy-paste-ready snippets** sparingly but intentionally for first-success and common tasks.
- **Link outward deliberately**: quickstarts should point to reference docs; reference docs should point to integration guides; migration updates should point to changelog/release notes, not replace them.

### Step 6: Choose a source-of-truth strategy on purpose
Most API docs are hybrid. State which truth layers you are using.

Common patterns:
- `spec-first` → OpenAPI/schema is primary; examples and guides are attached downstream
- `code-first` → code annotations/generation produce reference output; editorial guidance still needs ownership
- `test-backed` → verified tests/fixtures provide trustworthy examples and expected responses
- `hybrid` → spec + tested examples + editorial guide layer

If the request mixes these layers, do not pretend they are one artifact. Record the relationship instead:
- contract artifact
- rendered reference surface
- example source
- narrative guides / quickstarts
- migration or release update notes

### Step 7: Make examples and edge cases usable
Before finalizing, verify the example set covers the work real integrators do.

Minimum example checklist:
1. One first-success request
2. One realistic success response
3. One common error and how to recover
4. One note about limits/pagination/retries if relevant
5. One auth/setup example or link to the correct auth section

When the API is more complex, add:
- webhook signature verification example
- idempotent write example
- pagination example
- version/deprecation example
- SDK and raw HTTP pair for the same task when both surfaces matter

### Step 8: Protect against doc drift
API docs decay quickly unless maintenance is explicit. Before shipping, add:
- source of truth references (spec/schema/tests)
- owner or review checkpoint if launch-critical
- sections likely to drift: auth requirements, limits, version notes, examples, webhook events
- related release/changelog links if behavior recently changed
- companion docs that must stay in sync: quickstarts, SDK pages, migration notes, Postman collections

Use this quick checklist:
1. Could a new integrator reach first success with the available docs?
2. Are auth and environment assumptions visible before the first request?
3. Do the examples reflect real behavior, not invented placeholder shapes?
4. Are errors, retries, limits, or webhook verification documented where needed?
5. Are route-outs to `api-design`, `technical-writing`, `authentication-setup`, `user-guide-writing`, and `changelog-maintenance` explicit where relevant?

### Step 9: Output the smallest useful artifact set
Return only the artifact set the request actually needs. Common outputs:
- one quickstart page
- one endpoint/reference section
- one integration guide
- one webhook guide
- one migration-update note
- one docs-gap list that routes missing contract questions back to `api-design`

## Examples

### Example 1: Public REST API quickstart
**Input:** “Write the developer quickstart for our Orders API so partners can generate an API key, create a test order, and verify the response format.”

**Output shape:**
- chooses `quickstart` mode
- includes prerequisites, environment/base URL, auth header format, first-success request, and a success check
- links to deeper reference docs for full field descriptions
- does not turn the task into internal API design work

### Example 2: Webhook documentation refresh
**Input:** “Our payment_succeeded webhook now includes `attempt_count` and retries for up to 24 hours; update the docs and explain signature verification.”

**Output shape:**
- chooses `webhook-guide` or `migration-update` mode
- documents payload change, retry behavior, verification, and affected examples
- notes related changelog/release links without replacing them
- keeps auth-provider implementation details out of scope

### Example 3: SDK docs handoff
**Input:** “We need Python SDK docs that show install, configuring the client with an API key, pagination examples, and error handling.”

**Output shape:**
- chooses `sdk-guide` mode
- includes install/config/first-success/common-operations/error-handling sections
- links raw REST reference where needed
- distinguishes SDK guidance from contract design

### Example 4: Route-out to API design
**Input:** “We haven’t decided whether this should be REST or GraphQL, and we need someone to propose the resource model and pagination approach.”

**Output shape:**
- routes the task to `api-design`
- explains that the main job is contract/interface design, not developer documentation
- may note what doc surfaces will be needed later, but does not invent reference docs first

## Best practices
1. Treat API docs as developer workflow artifacts, not just generated reference output.
2. Keep contract design (`api-design`) separate from developer-facing publication (`api-documentation`).
3. Use tested or otherwise verified examples whenever possible.
4. Make auth, limits, retries, pagination, and webhook behavior explicit early.
5. Add migration/deprecation callouts when behavior changed, but keep release-note hygiene in `changelog-maintenance`.
6. Prefer small, truthful guide sets over one giant portal page that mixes quickstart, reference, and changelog jobs.
7. Tie docs maintenance to real sources of truth so future updates do not drift.

## References
- [OpenAPI Initiative](https://www.openapis.org/)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [Redocly / Redoc](https://redocly.com/redoc/)
- [Docusaurus API docs](https://docusaurus.io/docs/api-docs/introduction)
- [Mintlify](https://mintlify.com/)
