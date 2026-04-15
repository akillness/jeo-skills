# Repo Shape Decision Guide

Use this quick ladder before proposing a folder tree.

## 1. Start with the narrowest valid default
- **Meta-framework frontend / fullstack app** → keep framework routing/layout conventions first.
- **Backend service** → keep framework/module defaults first.
- **Docs repo** → organize by reader task and document type.
- **Game repo** → start from engine-required roots and special folders.

## 2. Escalate only when a clear pressure appears
| Pressure | Escalate to |
|----------|-------------|
| Route or page code is sprawling | route colocation + feature/domain folders |
| One workflow touches UI/state/api/tests/docs together | feature/domain mode |
| Multiple deployables or reusable packages exist | `apps/` + `packages/libs/` |
| Documentation paths reflect org history, not user need | docs taxonomy mode |
| Engine-required folders conflict with clean feature grouping | engine-aware hybrid mode |

## 3. Delay extraction of shared code
A folder/package becomes `shared` only when:
- reuse is proven across more than one area,
- its owner is identifiable,
- its public API is small enough to describe,
- moving it will not create a permanent junk drawer.

## 4. Prefer these top-level buckets
Use only the buckets the repo can explain clearly.

### Common valid buckets
- `app/` or `src/app/` — route/layout entrypoints
- `features/` — product or domain slices
- `shared/` or `ui/` — only truly shared primitives
- `apps/` — deployable applications
- `packages/` or `libs/` — stable shared packages
- `docs/` — documentation
- `scripts/` — repo utilities and entrypoints
- `tools/` — project tooling with clear ownership
- `Assets/`, `Content/`, `Scenes/`, `Prefabs/` — game/content structures when engine conventions support them

## 5. Avoid these anti-patterns
- `misc/`, `common/`, `helpers/`, `temp/` with no owner
- top-level folders whose names explain file type but not responsibility
- extracting packages before a stable boundary exists
- barrels at every folder level
- generated or cache folders treated like source architecture

## 6. Choose the migration scope
- **Greenfield**: define the target shape up front.
- **Incremental**: put new work in the new structure first.
- **Targeted reorg**: move one hot path or feature area; clean old buckets later.
