---
name: database-schema-design
description: >
  Design or refactor application data models and schema evolution plans for relational
  and document databases. Use when the user needs entity boundaries, table/collection
  shape, cardinality, constraints, indexes, naming, multi-tenant or audit patterns,
  migration sequencing, or rollout-safe schema changes before or alongside backend
  implementation. Not for API contract design, auth setup, published docs, or backend
  test planning.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for backend, product, and fullstack work in web apps and APIs where schema
  choices must balance developer ergonomics, query patterns, integrity rules, and
  production-safe migrations across PostgreSQL, MySQL, SQLite, MongoDB, and similar
  stacks.
license: MIT
metadata:
  version: "2.0.0"
  modernization: 2026-04-14
  tags: database, schema-design, migrations, indexing, constraints, relational, nosql, backend
  platforms: Claude, ChatGPT, Gemini
---

# Database Schema Design

Use this skill when the main job is **choosing and evolving the storage model for a real product**, not dumping generic SQL examples.

`database-schema-design` owns the storage-design layer for:
- choosing relational vs document-heavy vs hybrid data shapes
- turning domain entities into tables, collections, join models, and ownership boundaries
- deciding keys, uniqueness, cardinality, nullability, lifecycle state, and deletion/audit rules
- planning indexes, partitioning, and read-vs-write tradeoffs
- sequencing safe schema evolution so migrations, backfills, and cleanup do not get hand-waved
- producing a design packet that implementation, auth, API, and testing work can share

Read these support docs before handling larger or riskier work:
- [references/storage-decision-matrix.md](references/storage-decision-matrix.md)
- [references/schema-review-checklist.md](references/schema-review-checklist.md)

## When to use this skill
- Design a new database schema for a product feature, service, admin app, marketplace, or internal tool
- Refactor an existing schema that has naming drift, weak constraints, poor cardinality modeling, or missing indexes
- Decide between normalized relational tables, document/JSON fields, event-style append models, or a deliberate hybrid
- Plan multi-tenant, soft-delete, audit-log, status-history, or entitlement-related storage patterns
- Review whether a migration is safe, reversible enough, and staged realistically for production traffic
- Choose indexes and data-access shape based on actual query patterns instead of guesswork
- Produce a storage-model packet before backend implementation starts or while a risky backend change is being designed

## When not to use this skill
- **The main job is REST/GraphQL interface shape, endpoint naming, versioning, or error semantics** → use `api-design`
- **The main job is product-auth provider choice, sessions/JWTs, login methods, or auth-owned user/org boundaries** → use `authentication-setup`
- **The main job is developer-facing docs, quickstarts, or example-heavy API/database documentation** → use `api-documentation`
- **The main job is backend regression coverage, contract tests, migration-test strategy, or CI-vs-local verification** → use `backend-testing`
- **The main job is broader security hardening such as secret handling, CSRF, cookie flags, or OWASP controls** → use `security-best-practices`
- The request has no concrete domain, access pattern, or lifecycle context yet; in that case define the open questions instead of pretending the schema is settled

## Instructions

### Step 1: Classify the storage-design job
Normalize the request before naming tables.

```yaml
schema_design_profile:
  domain: unknown
  workload_shape: oltp | analytics | event-log | content-heavy | mixed | unknown
  data_model_lane: relational | document-heavy | hybrid | unknown
  tenancy: single-tenant | shared-tenant | isolated-tenant | mixed | unknown
  change_type: greenfield | incremental | migration | cleanup | scale-fix
  durability_needs: basic | transactional | audit-heavy | compliance-sensitive | unknown
  traffic_shape: read-heavy | write-heavy | mixed | bursty | unknown
  scale_notes: small | moderate | large | unknown
  main_risks: integrity | performance | migration-safety | data-lifecycle | unclear
```

Ask or infer:
1. What product/domain entities exist, and which ones truly own the workflow?
2. What are the highest-value reads, writes, filters, joins, aggregates, and retention rules?
3. Is the task greenfield design, incremental change, or repairing drift in a live system?
4. Which constraints are real business rules versus implementation convenience?
5. What databases, ORMs, or platform constraints already exist?

### Step 2: Choose the data-model lane deliberately
Do not default to a database style because it is fashionable.

#### Prefer relational-first when
- data integrity, transactions, and clear entity relationships matter most
- the product has strong cardinality rules and shared business invariants
- reporting, joining, and consistency matter more than free-form document flexibility
- the team needs constraints and indexes to carry real business meaning

#### Prefer document-heavy when
- entity shape varies a lot across records
- nesting is natural and most reads happen around one aggregate document
- the team accepts weaker cross-document integrity and more application-owned invariants
- the product values ingestion flexibility more than relational rigor

#### Prefer hybrid when
- transactional core data is relational but some secondary metadata is naturally JSON/document-shaped
- the team can explain which fields are query-critical and which are flexible payloads
- there is a clear reason not to force every attribute into first-class columns

State the reason for the chosen lane. “Because the stack already has it” is useful context, not a full design rationale.

### Step 3: Model entities, ownership, and lifecycle
Turn the domain into explicit storage boundaries.

For each core entity or collection, define:
- purpose and ownership boundary
- stable identifier strategy
- required vs optional attributes
- lifecycle states and timestamps
- who references it and at what cardinality
- whether deletion should be hard, soft, archived, or evented
- whether tenant/org ownership, audit fields, or history tables are required

Watch for classic modeling traps:
- mixing lookup/reference data with user-generated mutable state
- hiding many-to-many relationships inside ad hoc arrays or comma-separated fields
- collapsing status history into a single overwritten status when history matters
- storing every variable field as JSON without a query/access plan
- letting auth/profile/org membership data blur into unrelated product entities

### Step 4: Design integrity rules and access patterns together
A schema is only as good as the invariants it enforces.

For relational lanes, define:
- primary keys and foreign keys
- uniqueness rules
- nullability and defaults
- check constraints and enum/state rules
- join tables and ownership direction

For document-heavy lanes, define:
- aggregate/document boundary
- embedded vs referenced substructures
- per-document uniqueness assumptions
- fields that still need app-level invariants or background reconciliation

For either lane, explicitly list:
- hottest reads and filters
- write amplification risks
- query patterns that justify indexes
- fields that need full-text, partial, composite, or time-based indexing
- places where denormalization is intentional rather than accidental

If you cannot name the main reads/writes, the indexing advice is probably fake.

### Step 5: Plan schema evolution, not just the end state
The design is incomplete if rollout safety is missing.

For incremental or live-system changes, define:
- what changes are additive, backfill-driven, destructive, or compatibility-sensitive
- whether the migration should be expand-and-contract
- when constraints/indexes are added relative to application deploys
- whether data backfill, dual write, or shadow read phases are needed
- what the rollback or stop condition looks like
- which old fields/tables can only be removed after traffic and job cleanup

Good defaults:
- add new columns/tables before switching reads/writes
- backfill before enforcing new non-null or uniqueness rules when possible
- treat destructive renames/drops as staged work, not one-step bravery
- call out long-running backfills, lock risk, and index build cost explicitly

### Step 6: Produce the storage design packet
Pick the lightest artifact that still gives downstream work a trustworthy map.

Recommended artifacts:
- **entity/table design memo** for early architecture work
- **schema review packet** for PRD/spec/ADR-driven changes
- **migration rollout plan** for live-system evolution
- **ERD + decisions table** when collaboration and review are the main need

Minimum packet:
- workload and data-model lane with rationale
- entity / collection map
- key integrity rules and lifecycle decisions
- index/access-pattern notes
- migration or rollout plan if the system is live
- open questions and risk notes
- handoffs to adjacent skills

### Step 7: Review for boundary quality and future pain
Before finalizing, check:
- does the model encode real business rules or just mirror current code objects?
- are lifecycle, retention, audit, and deletion rules explicit enough?
- are indexes justified by named queries, not superstition?
- did you accidentally turn API shape, auth setup, or testing strategy into part of this skill?
- is the migration path believable for a live system?
- will another engineer understand what is normalized, denormalized, or intentionally flexible?

Route next steps clearly:
- `api-design` for interface/contract shape that depends on the data model
- `authentication-setup` for user/org/session/provider ownership decisions
- `backend-testing` for migration verification, repository coverage, or contract/regression checks
- `api-documentation` for published docs/examples once the model is stable enough to explain
- `security-best-practices` for hardening that goes beyond data integrity modeling

## Output format

```markdown
## Storage Design Packet: [System or Feature]

### Design framing
- Domain: [...]
- Workload shape: [OLTP / analytics / content-heavy / mixed]
- Chosen lane: [relational / document-heavy / hybrid]
- Reason: [...]

### Entity / collection map
| Entity | Purpose | Key fields | Relationships / ownership | Lifecycle notes |
|--------|---------|------------|----------------------------|-----------------|
| ... | ... | ... | ... | ... |

### Integrity and access rules
- Required constraints: [...]
- Uniqueness rules: [...]
- Indexes and why: [...]
- Intentional denormalization / JSON usage: [...]

### Migration / rollout plan
- Change type: [greenfield / additive / staged migration / cleanup]
- Sequence: [...]
- Backfill / compatibility notes: [...]
- Removal / cleanup conditions: [...]

### Risks / open questions
- [...]

### Handoffs
- API contract: [...]
- Auth/data ownership: [...]
- Verification/testing: [...]
- Docs: [...]
```

## Examples

### Example 1: SaaS billing and organization model
**Input:** “We need schema help for a B2B SaaS app with users, orgs, memberships, subscriptions, invoices, and audit logs. We use Postgres and need something implementation-ready, not just an ERD.”

**Good response shape:**
- chooses relational-first because org membership, billing, and audit rules carry real integrity constraints
- separates `users`, `organizations`, `memberships`, `subscriptions`, and immutable invoice records clearly
- defines uniqueness and lifecycle rules for invites, membership role changes, and subscription history
- calls out audit/event tables separately from mutable entity state
- routes auth-provider/session details to `authentication-setup`
- includes index suggestions tied to named reads such as org membership lookup, invoice history, and subscription status review

### Example 2: Live migration from flexible JSON to structured fields
**Input:** “Our marketplace has a `products.metadata` JSON blob. Search, filtering, and moderation now depend on stable fields. We need a safe migration plan without breaking production.”

**Good response shape:**
- keeps the design focused on storage boundaries, not API docs
- identifies which metadata fields deserve first-class columns and which can remain JSON
- proposes expand-and-contract: add columns, backfill, dual read/write, then clean up
- notes index timing and backfill risk explicitly
- routes interface changes to `api-design` and migration verification to `backend-testing`

### Example 3: Document-heavy content workflow
**Input:** “We ingest user-authored page blocks with highly variable nested content, but still need account ownership and search.”

**Good response shape:**
- justifies a hybrid or document-heavy lane instead of forcing over-normalization
- separates stable ownership/account structures from flexible content payloads
- names which fields must stay queryable and therefore deserve indexes or extracted columns
- records lifecycle/retention choices for revisions and drafts

## Best practices
1. Start from business invariants and access patterns, not table aesthetics.
2. Treat migration safety as part of schema design for live systems.
3. Use JSON/document flexibility intentionally, not as a way to postpone modeling forever.
4. Name the reads and writes that justify every important index.
5. Separate mutable entity state, history/audit data, and derived/cache data.
6. Keep adjacent handoffs explicit so this skill does not absorb API, auth, docs, or test work.
7. Prefer a durable design packet over giant vendor-specific SQL dumps.

## References
- [Evolutionary Database Design — Martin Fowler](https://martinfowler.com/articles/evodb.html)
- [Prisma Migrate mental model](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model)
- [PostgreSQL Data Definition docs](https://www.postgresql.org/docs/current/ddl.html)
- [DBML docs](https://dbml.dbdiagram.io/docs)
