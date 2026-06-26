---
name: database-schema-design
description: ">"
license: MIT
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  version: 2.1.0
  modernization: 2026-04-14
  hardening: 2026-04-19
  tags: database, schema-design, migrations, indexing, constraints, relational, nosql, backend
  platforms: Claude, ChatGPT, Gemini
---






# Database Schema Design

Use this skill when the main job is **choosing and evolving the storage model**, not dumping generic SQL or ORM snippets.

`database-schema-design` is the backend storage-design anchor for:
- choosing between relational-first, document-heavy, and hybrid models
- turning domain entities into tables, collections, ownership boundaries, and lifecycle rules
- justifying constraints, indexes, tenant scope, history/audit structures, and deletion/retention behavior
- planning staged schema evolution so migrations, backfills, and cleanup are believable
- handing downstream teams one compact storage-design packet before implementation, verification, reporting, or observability work branches out

Read these support docs before handling larger or riskier work:
- [references/storage-decision-matrix.md](references/storage-decision-matrix.md)
- [references/schema-review-checklist.md](references/schema-review-checklist.md)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)

## When to use this skill
- Design a new schema for a product feature, internal tool, admin workflow, customer-data surface, or live-ops/game backend system.
- Refactor an existing storage model with weak constraints, naming drift, poor cardinality modeling, or untrusted indexing.
- Decide which fields must be first-class columns or indexed document fields versus flexible metadata payloads.
- Plan multi-tenant, audit-log, entitlement, status-history, retention, or soft-delete boundaries.
- Review whether a migration is safe, staged realistically, and honest about backfills, compatibility windows, and cleanup.
- Produce one bounded storage packet before implementation or while a risky backend change is being shaped.

## When not to use this skill
- **The main job is REST/GraphQL contract shape, endpoint behavior, webhook semantics, or versioning** → `api-design`.
- **The main job is identity/session/provider setup or auth-owned user/org boundaries** → `authentication-setup`.
- **The main job is migration verification, repository coverage, or contract/regression tests** → `backend-testing`.
- **The main job is published docs, quickstarts, or developer-facing schema/API explanations** → `api-documentation`.
- **The main job is broad hardening beyond data integrity, like secret handling, CSRF, cookies, or abuse controls** → `security-best-practices`.
- **The main job is dashboard/reporting presentation or telemetry/alert coverage on top of already-modeled data** → `looker-studio-bigquery` or `monitoring-observability`.
- The request has no real domain, access pattern, or lifecycle context yet; in that case return the missing questions instead of pretending the schema is settled.

## Instructions

### Step 1: Classify one primary storage-design packet
Use one primary lane and one smallest useful artifact.

```yaml
schema_packet:
  workload_shape: oltp | analytics-adjacent | event-log | content-heavy | mixed | unknown
  data_lane: relational-first | document-heavy | hybrid | unknown
  change_type: greenfield | incremental | migration | cleanup | scale-fix
  ownership_focus: product-core | internal-ops | marketing-customer-data | game-live-ops | mixed
  durability_needs: basic | transactional | audit-heavy | compliance-sensitive | unknown
  hottest_risk: integrity | queryability | migration-safety | lifecycle-drift | unclear
  output_packet: design-memo | schema-review | migration-rollout | erd-plus-decisions | unknown
```

Normalize first:
1. What are the real business entities or aggregates?
2. Which reads, writes, filters, joins, or reports are highest value?
3. Is this greenfield design, live-system change, or schema cleanup?
4. Which rules are true business invariants versus temporary implementation convenience?
5. Which platform constraints already exist (database engine, ORM, hosted service, compliance, scale)?

### Step 2: Gather the minimum credible evidence
Do not design storage from vibes alone. Pull the smallest packet that supports real decisions:
- product/domain objective
- current schema, models, or representative records if they exist
- known reads/writes, filters, joins, search/reporting needs, and retention rules
- tenant/ownership, audit/history, and deletion expectations
- rollout constraints: traffic, migration windows, lock risk, compatibility concerns, downstream consumers
- open questions that would make the design fake-ready

If the evidence is thin, say so explicitly and keep the packet at review/memo level instead of pretending it is implementation-ready.

### Step 3: Choose the data lane deliberately
Use [references/storage-decision-matrix.md](references/storage-decision-matrix.md).

- **Relational-first** when integrity, transactions, shared invariants, joins, or reporting matter most.
- **Document-heavy** when one aggregate is usually read/written together and the shape varies enough that strict relational modeling would be fake precision.
- **Hybrid** when the transactional core is stable but some metadata/content payloads are legitimately flexible.

State the reason in one or two sentences. “Because the stack already uses it” is useful context, not the whole rationale.

### Step 4: Model ownership, lifecycle, and query-critical fields
For each core entity/collection/aggregate, define:
- purpose and ownership boundary
- identifier strategy
- required vs optional attributes
- lifecycle states and timestamps
- relationships or reference direction
- tenant/org ownership if relevant
- deletion, archival, retention, and history rules
- which fields must stay queryable, unique, or reportable
- which fields can remain flexible metadata without harming search/reporting/ops

Watch for these traps:
- mirroring UI objects instead of business concepts
- hiding many-to-many or history in JSON blobs or ad hoc arrays
- collapsing mutable state, audit history, and derived/cache data into one table/document
- letting auth/profile/session ownership blur into unrelated product entities
- storing analytics, telemetry, or campaign attributes in opaque payloads when they already drive filtering, reporting, or live-ops decisions

### Step 5: Design integrity and access rules together
A schema is only as good as the invariants it can defend.

Name:
- keys and ownership rules
- uniqueness / nullability / defaults / state constraints
- hottest reads, writes, filters, joins, or aggregate lookups
- indexes and why each one exists
- intentional denormalization or flexible fields and the reason they stay flexible

If you cannot name the main query shapes, the indexing guidance is probably fake.

### Step 6: Plan rollout and route-outs
For incremental or live-system changes, define:
- additive vs destructive changes
- expand-and-contract, backfill, dual-read/write, or shadow-read phases if needed
- when indexes/constraints become safe to enforce
- rollback or stop conditions
- cleanup conditions for old columns/tables/doc fields

Then route adjacent work clearly using [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md):
- `api-design` for interface or contract changes that depend on the model
- `authentication-setup` for identity/session/provider ownership
- `backend-testing` for migration verification and regression coverage
- `looker-studio-bigquery` when the main job is stakeholder dashboards/reporting over curated data
- `monitoring-observability` when the main job is telemetry freshness, alert coverage, or runtime visibility
- `security-best-practices` when the concern goes beyond data integrity into broader app/web hardening

### Step 7: Run the boundary check
Use [references/schema-review-checklist.md](references/schema-review-checklist.md) before finalizing.

Verify:
1. One data lane and one output packet were chosen.
2. Ownership, lifecycle, and query-critical fields are explicit.
3. Flexible metadata is justified instead of acting as deferred modeling debt.
4. Migration safety is believable for a live system.
5. API/auth/testing/reporting/observability work was routed out instead of silently absorbed.
6. The packet ends with the next concrete move.

## Output format

```markdown
## Storage Design Packet: [System or Feature]

### Packet framing
- Workload shape:
- Chosen data lane:
- Change type:
- Ownership focus:
- Why this lane fits:

### Evidence used
- Current artifacts:
- Query/reporting needs:
- Lifecycle or retention constraints:
- Assumptions / gaps:

### Entity / collection map
| Entity | Purpose | Key fields | Relationships / ownership | Lifecycle notes |
|--------|---------|------------|----------------------------|-----------------|
| ... | ... | ... | ... | ... |

### Integrity and access rules
- Required constraints:
- Uniqueness / nullability notes:
- Indexes and why:
- Flexible metadata that stays flexible:

### Rollout / migration plan
- Sequence:
- Backfill / compatibility notes:
- Cleanup conditions:
- Stop / rollback signals:

### Route-outs
- API / contract:
- Auth / identity:
- Verification:
- Reporting / observability:

### Recommended next move
- draft migration plan | review with owners | hand off to API/auth/testing/reporting | defer until missing evidence is gathered
```

## Examples

### Example 1: SaaS core model
**Input:** "We need schema help for a B2B SaaS app with users, organizations, memberships, subscriptions, invoices, and audit logs. We use Postgres and need something implementation-ready."

**Good output direction**
- chooses `relational-first`
- separates users, organizations, memberships, subscriptions, and immutable invoice records clearly
- treats audit/history separately from mutable entity state
- routes session/provider details to `authentication-setup`

### Example 2: Flexible metadata migration
**Input:** "Our marketplace stores product metadata in one JSON column, but search, moderation, and filters now depend on stable fields. Plan a safe migration."

**Good output direction**
- chooses `hybrid`
- identifies which fields must graduate from JSON into first-class columns or indexed fields
- proposes staged rollout, backfill, and cleanup conditions
- routes verification to `backend-testing`

### Example 3: Game live-ops boundary
**Input:** "We need to model player inventory, seasonal event progress, and telemetry for a live game without burying reporting needs in opaque blobs."

**Good output direction**
- separates player-owned transactional state from telemetry/reporting concerns
- keeps one storage packet focused on state integrity and lifecycle
- routes dashboard/telemetry follow-through to `looker-studio-bigquery` or `monitoring-observability`

## Best practices
1. Start from business invariants and access patterns, not table aesthetics.
2. Treat migration safety as part of schema design, not a later ops chore.
3. Keep flexible metadata honest: useful when justified, dangerous when it hides query-critical fields.
4. Separate mutable state, history/audit, and derived/reporting data.
5. Route adjacent API/auth/testing/reporting work outward instead of turning this into a generic backend mega-skill.
6. Prefer a durable packet over giant vendor-specific example dumps.

## References
- [PostgreSQL Data Definition docs](https://www.postgresql.org/docs/current/ddl.html)
- [Prisma Data Guide — Making Connections](https://www.prisma.io/dataguide/datamodeling/making-connections)
- [MongoDB data modeling docs](https://www.mongodb.com/docs/manual/data-modeling/)
- [Firestore structure-data guide](https://firebase.google.com/docs/firestore/manage-data/structure-data)
