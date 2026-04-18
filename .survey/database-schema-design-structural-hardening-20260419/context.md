# Context: database-schema-design structural hardening

## Workflow Context
Storage-design requests show up before or alongside backend implementation when a team must choose between relational, document-heavy, or hybrid models, justify constraints/indexes, and plan rollout-safe schema changes. PostgreSQL's DDL docs center tables, defaults, generated columns, and constraints as first-class design choices rather than afterthoughts ([PostgreSQL DDL](https://www.postgresql.org/docs/current/ddl.html)). Prisma's data-model guide frames relationships and foreign keys as the structure-defining layer for application data ([Prisma Data Guide](https://www.prisma.io/dataguide/datamodeling/making-connections)). MongoDB and Firestore both explicitly teach model choice around access patterns, aggregate boundaries, and flexible-vs-queryable fields rather than a one-size-fits-all schema story ([MongoDB data modeling](https://www.mongodb.com/docs/manual/data-modeling/), [Firestore structure-data](https://firebase.google.com/docs/firestore/manage-data/structure-data)). These same pressures recur in product/ops systems, marketing/customer-data pipelines, and game/live-ops telemetry where stable ownership and reporting fields must coexist with flexible metadata ([Stripe metadata](https://docs.stripe.com/metadata), [PlayFab player data](https://learn.microsoft.com/en-us/gaming/playfab/features/playerdata/)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend/fullstack engineer | Turn product features into tables/collections, constraints, and staged migrations | Intermediate–advanced |
| Tech lead / architect | Set storage boundaries and prevent long-term integrity drift | Advanced |
| Product / ops builder | Model internal tools, workflow state, audit history, or admin data without overfitting UI objects | Intermediate |
| Marketing / revops / analytics engineer | Keep customer/account/event data queryable while preserving flexible campaign metadata | Intermediate |
| Game backend / live-ops engineer | Model player/account/inventory/live-event data plus telemetry or player-data payloads safely | Intermediate–advanced |

## Current Workarounds
1. Start from ORM entities or JSON blobs, then retrofit constraints/indexes only after bugs or performance issues appear.
2. Keep the true data-design rationale in ADRs/docs while migrations/ORM schemas become the de facto source of truth.
3. Use flexible JSON/document fields for speed, then manually promote search/reporting-critical fields into columns later.
4. Split responsibilities awkwardly across schema docs, API tickets, auth decisions, and dashboard specs instead of one bounded storage-design packet.

## Adjacent Problems
- API contract shape often gets mixed into schema design even though interface decisions belong to `api-design`.
- User/org/session ownership can drift into auth architecture instead of staying a clean route-out to `authentication-setup`.
- Analytics/dashboard and telemetry visibility needs can pull storage design into reporting or monitoring decisions better handled by `looker-studio-bigquery` or `monitoring-observability`.
- Migration verification and regression coverage can bloat the storage-design lane unless explicitly routed to `backend-testing`.

## User Voices
- Direct community quotes were not recovered in this cron run because the standard web search/extract tools returned API-key errors. For this pass, the durable evidence comes from primary product/documentation sources that explicitly encode the recurring design tensions: constraints and relationships in PostgreSQL/Prisma, access-pattern-led modeling in MongoDB/Firestore, flexible metadata in Stripe, and player-data boundaries in PlayFab.
