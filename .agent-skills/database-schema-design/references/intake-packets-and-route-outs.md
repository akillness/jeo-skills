# Intake Packets and Route-outs

Use this note when the request is real but the next artifact is not obvious yet.

## 1. Pick the smallest honest packet

### A. `design-memo`
Use when the domain is still being shaped and the team needs a clear storage direction, not a migration script.

Best for:
- new product features
- internal tools and admin workflows
- early customer-data / live-ops modeling

Include:
- chosen data lane
- core entities / aggregates
- query-critical fields
- biggest unknowns

### B. `schema-review`
Use when a PRD, ADR, issue, or technical design already exists and the main job is reviewing the storage model.

Best for:
- refactors
- risky index/constraint additions
- cross-team architecture review
- marketing/customer-data systems where reporting needs are already known

Include:
- evidence used
- integrity rules
- index rationale
- lifecycle / retention notes
- explicit route-outs

### C. `migration-rollout`
Use when the schema is live and rollout safety is the actual risk.

Best for:
- JSON-to-column promotion
- table or collection splits
- rename / backfill / cleanup work
- large tenant-scoped data changes

Include:
- expand-and-contract sequence
- backfill plan
- compatibility window
- cleanup conditions
- rollback / stop signals

### D. `erd-plus-decisions`
Use when collaboration and alignment matter more than migration detail.

Best for:
- multi-entity system design reviews
- vendor / service selection conversations
- game live-ops state design that needs a quick shared model

Include:
- entity map
- relationship direction
- lifecycle notes
- explicit decisions and deferred questions

## 2. Quick domain packets

### Backend / SaaS core
- Stable account, billing, entitlement, and audit structures usually lean relational-first.
- Route auth/session/provider ownership to `authentication-setup`.
- Route API contract follow-through to `api-design`.

### Product / ops systems
- Admin workflows often need clear status history, approvals, and audit trails.
- Watch for UI-shaped tables and nullable fields that actually hide missing product decisions.

### Marketing / customer-data workflows
- Keep customer/account/event identity queryable.
- Treat campaign or attribution metadata as flexible only if reporting does not depend on it yet.
- Route dashboard and stakeholder reporting work to `looker-studio-bigquery` once the model is stable enough.

### Game / live-ops systems
- Separate player-owned transactional state from telemetry/reporting streams.
- Keep inventory, progression, and entitlement integrity distinct from analytics/event ingestion.
- Route alerting, runtime visibility, or telemetry freshness work to `monitoring-observability`.

## 3. Route-out ladder
- `api-design` → interface shape, endpoint/webhook contracts, payload semantics
- `authentication-setup` → users/orgs/sessions/providers/identity ownership
- `backend-testing` → migration verification, repository coverage, contract/regression tests
- `api-documentation` → published docs once the model is stable enough to explain
- `looker-studio-bigquery` → stakeholder dashboards and KPI presentation over curated data
- `monitoring-observability` → telemetry freshness, alerts, dashboards, and runtime visibility
- `security-best-practices` → hardening beyond storage integrity

## 4. Common anti-patterns
- Treating the ORM model as the product truth without checking query or lifecycle reality
- Hiding many-to-many or history in JSON because the relationship felt inconvenient
- Pushing dashboard or telemetry design into the schema packet when the storage boundary is already good enough
- Pretending a destructive migration is safe because the final schema looks clean
