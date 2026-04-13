# Technical Writing Modes and Boundaries

Use `technical-writing` for **internal technical documentation**. The fastest way to avoid overlap is to classify the document by the action it enables.

## Canonical modes

### 1. Technical spec
Use when a team needs a pre-implementation design artifact.

Typical signals:
- goals / non-goals
- scope boundaries
- constraints
- rollout / rollback planning
- open questions before coding

### 2. Architecture document
Use when the goal is explaining system structure, boundaries, and trade-offs.

Typical signals:
- components and responsibilities
- request / data flow
- integration boundaries
- failure modes and operational concerns

### 3. ADR
Use when a single meaningful decision needs a durable record.

Typical signals:
- options considered
- rationale for the chosen approach
- consequences and follow-up actions
- decision status and date

### 4. Runbook
Use when someone must operate, diagnose, recover, or escalate.

Typical signals:
- symptoms and checks
- access requirements
- standard operating procedure
- escalation path
- rollback or recovery

### 5. Migration guide
Use when moving from an old system/state to a new one.

Typical signals:
- compatibility or breaking changes
- step ordering
- validation after each stage
- rollback path
- communication notes

### 6. Internal developer guide
Use when maintainers need implementation-facing explanation that is not an end-user tutorial.

Typical signals:
- local development workflow
- subsystem concepts
- ownership and boundaries
- operational or implementation pitfalls

## Boundary table

| If the request is mainly about... | Use |
|---|---|
| Published API docs, OpenAPI reference, SDK examples, developer portal UX | `api-documentation` |
| End-user onboarding, screenshots, how-to guides, help-center flows, FAQs | `user-guide-writing` |
| Release notes, semantic versioning, CHANGELOG.md hygiene | `changelog-maintenance` |
| Deciding the API or feature design before turning it into docs | `api-design`, `task-planning`, or a planning skill |

## Common failure modes
- Turning an ADR into a full 12-section design doc
- Writing a runbook like an essay instead of an action checklist
- Mixing internal developer guidance with customer-facing tutorial tone
- Using `technical-writing` as a fallback when the request is actually about API publishing or changelog upkeep
