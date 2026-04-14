# Solution Landscape: database-schema-design modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Prisma Schema + Prisma Migrate | App/schema-as-code plus generated migration history | Strong TypeScript/fullstack ergonomics; clear schema + migration workflow; common modern default | Drift troubleshooting and production rollout judgment still require manual review | https://www.prisma.io/docs/orm/prisma-schema/overview · https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/overview |
| Rails Active Record Migrations | Framework-native model + migration flow | Mature migration workflow; familiar to app teams; schema dumps help readability | Long histories still get noisy; generated diffs do not replace operational review | https://guides.rubyonrails.org/active_record_migrations.html |
| Django Migrations | Model-first migration generation | Strong framework convention; common Python workflow | Manual migration edits still needed for unusual or risky changes | https://docs.djangoproject.com/en/stable/topics/migrations/ |
| Liquibase | Database change-management platform | Strong enterprise posture; changelogs, history, drift-oriented workflows | Heavier than app-team-native tools; can feel process-heavy for simple app work | https://docs.liquibase.com/home.html |
| Flyway | SQL-first migration tooling | Clear versioned migration workflow; common across JVM/platform teams | Less guidance on modeling itself; teams still need separate design artifacts | https://documentation.red-gate.com/fd |
| DBML | Schema DSL / model notation | Lightweight collaborative modeling; maps well to relational structure | Not the production rollout source of truth | https://dbml.dbdiagram.io/docs |
| dbdiagram | ERD collaboration tool | Fast visual communication and early design alignment | Diagram-first, not rollout-first | https://dbdiagram.io/docs |
| PostgreSQL DDL docs | Vendor-native schema reference | Authoritative on constraints, generated columns, table semantics | Not a workflow tool; assumes the team already knows what to design | https://www.postgresql.org/docs/current/ddl.html |
| EF Core / TypeORM migrations | ORM-first schema evolution | Representative of common app-driven practice outside Rails/Django | Generated migrations frequently need hand-tuning | https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/ · https://typeorm.io/docs/advanced-topics/migrations/ |

## Categories
- **Conceptual modeling / ERD tools:** DBML, dbdiagram
- **Framework-native schema-as-code:** Prisma, Rails, Django, EF Core, TypeORM
- **Migration/change-management systems:** Flyway, Liquibase, Prisma Migrate
- **Vendor-native correctness references:** PostgreSQL docs

## What People Actually Use
Teams rarely use one perfect end-to-end database design product. The common pattern is diagram or doc first, then ORM models or versioned migrations, then manual review for indexes, constraints, lock risk, and rollout order. In other words: schema thinking is collaborative and messy upstream, migration tooling is the durable execution layer, and production safety remains a manual judgment step.

## Frequency Ranking
1. Prisma / ORM-first schema-as-code workflows in modern app teams
2. Rails / Django migrations as framework defaults
3. Flyway / Liquibase for SQL-first or enterprise change management
4. DBML / dbdiagram for concept and review communication
5. Vendor docs for final correctness checks

## Key Gaps
- Existing tools split modeling from rollout safety; few help users decide both the data model and the operational migration sequence in one workflow.
- Teams still need explicit prompts for constraints, indexes, data retention, naming, soft-delete/audit choices, and backfill/rollback planning.
- Most tools help generate artifacts, but not decide when to normalize, denormalize, partition, or route to adjacent skills like API design, auth ownership, or testing.

## Contradictions
- Marketed reality: schema-as-code tools imply a clean single source of truth.
- User reality: production databases, migration histories, app models, and analytics consumers drift unless humans keep reconciling them.

- Marketed reality: ERD/modeling tools make design collaborative.
- User reality: the final safe rollout still lives in migrations, review checklists, and staged deployment choreography.

## Key Insight
The strongest modernization path is not another generic SQL/NoSQL example dump. `database-schema-design` should become the storage-model decision and migration-safety anchor for application teams: choose entity boundaries, cardinality, integrity rules, indexing and lifecycle policies, then explicitly hand off rollout sequencing, API contract implications, auth-data ownership, and verification to neighboring backend skills.
