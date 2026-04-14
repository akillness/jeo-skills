# Context: database-schema-design modernization

## Workflow Context
Modern schema design work is part of normal delivery, not a one-time ERD exercise. Teams move from product requirements to data-model choices, then through migration authoring, rollout safety review, staging validation, backfills, and cleanup. Martin Fowler's *Evolutionary Database Design* frames schema change as an iterative process rather than a big up-front design step (https://martinfowler.com/articles/evodb.html). Prisma's migration mental-model docs describe the day-to-day reality as schema-as-code plus explicit migration history (https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model). Atlas makes the declarative-vs-versioned split explicit, which is a useful lens for this skill because modern teams often need both a desired-state model and a reviewed migration sequence (https://atlasgo.io/concepts/declarative-vs-versioned).

Direct page retrieval this run confirmed those pages are actually centered on the right concepts: Prisma's page title is "A mental model for Prisma Migrate," Atlas's page title is "Declarative (State-based) vs Versioned Migrations," and PostgreSQL's DDL docs foreground constraints and other schema-definition mechanics (browser-like HTML retrieval via `python3`/`urllib`). Rails and Django migration docs likewise frame schema evolution as an ongoing application workflow rather than pure one-off modeling.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend engineer | Owns tables, constraints, indexes, migrations, and production-safe rollout sequencing | Intermediate to advanced DB familiarity |
| Fullstack/product engineer | Changes schema through ORM/app models while shipping features quickly | Broad app knowledge, uneven DB depth |
| Platform/DBA/SRE | Reviews lock risk, replication impact, backfills, rollback path, and operational safety | Advanced |
| Data/analytics engineer | Consumes renamed fields, event/model drift, denormalization choices, and source-of-truth boundaries | Intermediate |

## Current Workarounds
1. Teams use schema-as-code or migration tools such as Prisma Migrate, Rails/Django migrations, Flyway, and Liquibase to make changes reviewable, but still hand-patch risky SQL and rollout order later.
2. Upstream design often happens in diagrams/docs first, then gets translated into ORM models or SQL migrations. DBML and dbdiagram remain popular because they are lightweight and collaborative, even though they are not the deployment source of truth (https://dbml.dbdiagram.io/docs, https://dbdiagram.io/docs).
3. Zero-downtime changes rely on expand-and-contract patterns: add nullable columns, dual write, backfill, tighten constraints later, remove legacy fields last.
4. Reviewers keep out-of-band checklists for indexes, constraints, lock risk, and rollback because generated migrations rarely encode all of that operational judgment.

## Adjacent Problems
- Schema drift between ORM models, migration files, and live databases.
- Poor separation between conceptual design, migration authoring, and production rollout.
- Weak reviewability for data backfills, index timing, constraint validation, and destructive changes.
- Performance and correctness tradeoffs getting buried inside generic "design the tables" advice.
- Cross-functional coordination gaps between app engineers, DB specialists, and analytics consumers.

## User Voices
> Because API-backed web search/extract failed in this environment, these are source-backed workflow themes grounded by direct primary-page retrieval and stable docs rather than fresh quote extraction.

- Fowler's canonical position is that database design must be evolutionary, not treated as a one-shot upfront artifact: https://martinfowler.com/articles/evodb.html
- Prisma's migrate docs emphasize maintaining migration history and reconciling schema drift/troubleshooting rather than assuming generators solve rollout correctness: https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model and https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting
- Rails and Django docs both normalize model-first/migration-first workflows, which reinforces that developers usually evolve schema through app delivery tooling rather than a separate database-design phase: https://guides.rubyonrails.org/active_record_migrations.html and https://docs.djangoproject.com/en/stable/topics/migrations/
- PostgreSQL's DDL chapter remains the authoritative reference for constraints and schema semantics that ORMs frequently abstract away: https://www.postgresql.org/docs/current/ddl.html
