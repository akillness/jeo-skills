---
name: api-design
description: ">"
license: Apache-2.0
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  version: 1.1.0
  author: Agent Skills Team
  tags: api-design, REST, GraphQL, OpenAPI, contract-design, versioning, backend
  platforms: Claude, ChatGPT, Gemini
---












# API Design

Use this skill to turn a vague integration idea, backend feature, or service boundary into a stable API contract that other skills can build on.

The job is not to generate pretty docs. The job is to:
- choose the right API style for the problem
- define resources, operations, inputs, outputs, and failure semantics
- make compatibility and versioning decisions explicit
- produce a contract artifact that implementation, testing, and documentation can share
- surface tradeoffs before the team hardens the wrong interface

Read [references/contract-review-checklist.md](../api-design--references/contract-review-checklist.md) and [references/boundary-guide.md](../api-design--references/boundary-guide.md) before handling unusual or high-risk API work.

If the user mainly needs:
- **reference docs, tutorials, example-heavy guides, or doc portal setup** → use `api-documentation`
- **auth implementation or token/session configuration** → use `authentication-setup`
- **contract/integration test strategy** → use `backend-testing`
- **schema/index/storage design** → use `database-schema-design`

## When to use this skill
- Design a new REST API, GraphQL schema, or internal service contract
- Refactor an existing API without breaking clients unnecessarily
- Review naming, resource boundaries, status codes, pagination, filtering, idempotency, or error models
- Produce an OpenAPI or GraphQL SDL contract before implementation starts
- Evaluate versioning and backward-compatibility decisions
- Decide whether an API should stay REST, move to GraphQL, or expose both layers deliberately
- Prepare an implementation-ready contract packet for backend, frontend, QA, or partner teams

## When not to use this skill
- The main task is building interactive docs, SDK docs, onboarding guides, or example portals → use `api-documentation`
- The main task is writing server code, auth middleware, resolvers, or persistence logic
- The main task is database normalization, indexing, or storage-model optimization → use `database-schema-design`
- The request is mainly test planning or contract-test coverage → use `backend-testing`
- There is not enough clarity yet to define the API shape honestly; in that case define the open questions and a design spike instead of faking certainty

## Instructions

### Step 1: Frame the contract problem
Capture the design inputs before inventing endpoints.

Record:
- users or systems calling the API
- business action or job to be done
- domain entities and ownership boundaries
- existing clients or migrations that constrain compatibility
- sensitivity/security requirements
- expected scale patterns: reads, writes, fan-out, pagination, burstiness
- artifact format requested: OpenAPI, GraphQL SDL, endpoint table, or design memo

If the request is underspecified, state the missing assumptions explicitly inside the design packet.

### Step 2: Choose the interface style deliberately
Do not default to a style out of habit.

#### Prefer REST when
- the workflow is resource-centric
- caching, predictable URLs, or simple CRUD-like operations matter
- external clients need stable, conventional HTTP semantics
- you want OpenAPI tooling, mocks, and broad ecosystem compatibility

#### Prefer GraphQL when
- clients need flexible field selection or combined graph traversal
- frontend teams need to reduce over-fetching/under-fetching across many screens
- the schema is a better shared contract than a fixed endpoint list
- you already have or expect schema-registry / breaking-change checks

#### Prefer a mixed approach only when
- the responsibilities are clearly different
- the team can explain who consumes which surface and why
- you can avoid duplicated ownership and drift

State the reason for the chosen style. “Because everyone uses it” is not enough.

### Step 3: Model resources, operations, and boundaries
For REST:
- define the top-level resources and their ownership boundaries
- choose nouns, not verb endpoints, unless an action endpoint is genuinely clearer
- keep URL structure shallow unless nested resources carry clear parent-child meaning
- list standard operations plus domain-specific actions separately

For GraphQL:
- define the core types, relationships, queries, and mutations
- avoid one giant catch-all mutation surface
- note where pagination, filtering, and field-level authorization apply
- identify schema areas likely to change frequently

For either style:
- mark synchronous vs asynchronous behavior
- identify idempotent vs non-idempotent writes
- call out eventual-consistency or long-running-job behavior if relevant

### Step 4: Define the request/response contract
Design the contract, not just the happy path.

Include:
- request shape and required fields
- response shape for success
- pagination or cursor rules
- filtering / sorting semantics
- nullability and defaults
- field naming conventions
- timestamps, IDs, and enum behavior
- partial update behavior

If the API supports both machine-to-machine and frontend clients, note where response shapes or expansion patterns differ.

### Step 5: Design auth, errors, and compatibility rules
Capture the operational semantics clients depend on.

Define:
- auth model expectations at the contract level (for example: bearer token required, role checks, tenant scoping)
- common status codes / error categories
- machine-readable error codes
- retry / idempotency expectations
- deprecation and sunset behavior
- compatibility promises: additive-safe, breaking, version-gated, or migration-required

Do not fully implement auth here. Define the contract and hand off detailed setup to `authentication-setup` when needed.

### Step 6: Produce the contract artifact
Pick the lightest artifact that still enables downstream work.

Recommended formats:
- **OpenAPI outline** for REST contracts and review-heavy environments
- **GraphQL SDL sketch** for schema-first GraphQL work
- **endpoint / operation table** for early architecture discussion
- **design memo + risk list** when the right shape is still being debated

Minimum contract packet:
- chosen style and why
- audience / consumers
- entity or type map
- operations and request/response summary
- auth/error/versioning notes
- open questions / risks
- downstream handoffs

### Step 7: Review for breakage and handoff quality
Before finalizing, check:
- would an existing client break?
- are naming and semantics consistent?
- are pagination/filtering rules actually implementable?
- are error states and auth failures explicit enough for frontend/QA/docs work?
- did you accidentally mix contract design with tutorial-writing or server implementation?

Route next steps clearly:
- `api-documentation` for published docs, tutorials, examples, and docs portal setup
- `backend-testing` for contract-test and integration-test planning
- `authentication-setup` for concrete auth implementation
- `database-schema-design` when the storage model needs its own pass

## Output format

```markdown
## API Design Packet: [Name]

### Contract framing
- Style: [REST | GraphQL | mixed-with-justification]
- Consumers: [internal services / frontend app / partners / public developers]
- Primary job: [what the API enables]

### Resource or type model
- [resource/type]: [purpose]
- [resource/type]: [purpose]

### Operations
| Operation | Purpose | Input summary | Output summary | Notes |
|-----------|---------|---------------|----------------|-------|
| [GET/POST/query/mutation] | ... | ... | ... | ... |

### Contract rules
- Auth model: [...]
- Error model: [...]
- Pagination/filtering: [...]
- Versioning / compatibility: [...]

### Risks / open questions
- [...]

### Handoffs
- Documentation: [does `api-documentation` need to turn this into published docs?]
- Testing: [does `backend-testing` need contract/integration coverage?]
- Auth / data model: [adjacent handoffs]
```

## Examples

### Example 1: Public REST contract for partner integrations
**Input:** “Design a partner-facing order status API for ecommerce vendors. We need stable polling, webhook fallback later, and careful versioning.”

**Good response shape:**
- choose REST because external partners need predictable HTTP semantics
- define `orders` and `order-events` clearly
- specify status transitions, pagination, filtering by updated time, and versioning/deprecation rules
- include machine-readable error codes and idempotent webhook registration expectations
- hand off to `api-documentation` for partner docs and examples

### Example 2: GraphQL schema for a dashboard client
**Input:** “We need a dashboard API for projects, deployments, incidents, and alerts. The UI has many views and keeps over-fetching in REST.”

**Good response shape:**
- justify GraphQL for flexible client reads
- define core types and query/mutation boundaries
- note pagination and authorization at field/query level
- flag likely schema hot spots and breaking-change review needs
- hand off to `backend-testing` for contract checks and to `api-documentation` for example queries

## Best practices
1. Treat the API contract as a product boundary, not just a code convenience.
2. Separate design decisions from documentation publishing.
3. Record assumptions and open questions instead of pretending certainty.
4. Prefer additive evolution and explicit deprecation over surprise breaking changes.
5. Keep rationale visible when choosing REST vs GraphQL.
6. Use the smallest artifact that lets downstream teams act.
7. Hand off intentionally to adjacent skills instead of bloating this one.

## References
- [OpenAPI Specification](https://swagger.io/specification/)
- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines)
- [Zalando RESTful API Guidelines](https://opensource.zalando.com/restful-api-guidelines/)
- [Architectural Decision Records](https://adr.github.io/)
