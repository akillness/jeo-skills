# Solution Landscape: database-schema-design structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| PostgreSQL relational DDL | Tables, constraints, indexes, staged migration primitives | Strong integrity, explicit constraints, queryability | Can be over-modeled if teams ignore workload reality | Best default for stable relational cores ([docs](https://www.postgresql.org/docs/current/ddl.html)) |
| Prisma relational modeling | ORM + schema file + migration mental model | Clear entity relationships, app-facing schema ergonomics | Risks mirroring code objects unless domain boundaries stay explicit | Useful for app-owned relational design ([guide](https://www.prisma.io/dataguide/datamodeling/making-connections)) |
| MongoDB document modeling | Flexible document/aggregate-first modeling | Great for variable shapes and aggregate reads | Cross-document invariants and reporting can drift to app logic | Good for content-heavy or ingestion-heavy zones ([docs](https://www.mongodb.com/docs/manual/data-modeling/)) |
| Firestore structure guidance | Collection/document/subcollection modeling around access patterns | Honest about nested vs root collections and document boundaries | Query/reporting constraints can force later reshaping | Relevant for app/mobile/backend hybrid stacks ([docs](https://firebase.google.com/docs/firestore/manage-data/structure-data)) |
| Stripe-style metadata extension | Stable core objects plus flexible metadata side-channel | Lets teams preserve queryable core entities while keeping some extensibility | Easy to overuse and hide business-critical fields in opaque metadata | Strong analogy for marketing/customer-data and ops systems ([docs](https://docs.stripe.com/metadata)) |
| PlayFab player-data model | Game/live-ops split between player data and other service-owned objects | Helps separate game-owned player payloads from broader backend services | Can tempt teams to stuff too much mutable product state into generic player data | Relevant for game/live-ops schema boundaries ([docs](https://learn.microsoft.com/en-us/gaming/playfab/features/playerdata/)) |

## Categories
- Relational-first integrity and staged migration
- Document-heavy / aggregate-first modeling
- Hybrid relational core + flexible metadata payloads
- Domain overlays: customer-data / attribution metadata and game live-ops / player-data boundaries

## What People Actually Use
Most teams do not use a single perfect schema-design system. They combine framework or database docs, ORMs, migration tooling, ADRs/specs, and ad hoc design notes. In practice, the recurring job is choosing one honest lane, naming query-critical fields, and separating storage modeling from adjacent API/auth/reporting/testing work.

## Frequency Ranking
1. Relational-first schema + migration workflow for stable product/account/billing data
2. Hybrid relational core + JSON/document sidecar for flexible metadata
3. Document-heavy modeling for content/aggregate-centric domains
4. Service-specific data containers (for example metadata or player-data surfaces) layered on top of the above

## Key Gaps
- Vendor docs explain their own storage surface well, but not the route-outs to API contracts, auth ownership, test strategy, reporting, or observability.
- Teams still need a portable packet that works across SaaS/backend, internal ops, marketing/customer-data, and game/live-ops contexts.
- Derived discovery surfaces (`SKILL.toon`, `skills.json`, README/setup blurbs) can quietly lag behind a sharpened `SKILL.md`, weakening trigger quality.

## Contradictions
- Vendor docs encourage flexible modeling, but downstream reporting/search/monitoring needs still force explicit queryable fields.
- Teams want one schema skill to answer everything, yet real usefulness improves when storage design routes adjacent jobs outward instead of absorbing them.

## Key Insight
The best bounded improvement is not another database wrapper. It is to keep `database-schema-design` as the canonical storage-design anchor while shrinking it into a routing-first packet selector: one workload/data lane, one smallest useful artifact, explicit migration safety, and explicit route-outs to API, auth, testing, reporting, and observability neighbors.
