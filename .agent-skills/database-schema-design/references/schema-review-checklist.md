# Schema Review Checklist

Use this before finalizing a storage design packet or approving a risky schema change.

## Domain and boundaries
- Are the core entities/collections named after business concepts rather than current UI code objects?
- Are ownership and tenant boundaries explicit?
- Are mutable state, history/audit data, and derived/cache data separated clearly?

## Integrity rules
- Which fields must be unique?
- Which relationships need database-enforced foreign keys or equivalent ownership guarantees?
- Are nullability and defaults honest, or are they placeholders for missing product decisions?
- Are soft-delete, archival, and retention rules explicit?

## Access patterns and indexes
- Can the team name the primary reads, writes, joins, and filters?
- Does every major index map to a real query pattern?
- Are any indexes missing for foreign keys, status/timestamp filters, or tenant scoping?
- Is denormalization or JSON usage justified by access patterns rather than convenience?

## Migration safety
- Is the change additive, staged, backfill-heavy, or destructive?
- Can the rollout use expand-and-contract instead of a risky one-shot cutover?
- Are index build cost, lock risk, and backfill duration called out?
- Are cleanup/removal conditions explicit instead of assumed?

## Adjacency and handoffs
- Should API contract updates be handed to `api-design`?
- Should auth-owned users/orgs/session decisions be handed to `authentication-setup`?
- Should migration/repository verification be handed to `backend-testing`?
- Should hardening beyond integrity rules be handed to `security-best-practices`?
