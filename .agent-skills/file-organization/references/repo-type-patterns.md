# Repo Type Patterns

## Frontend / meta-framework app
Default first:
- framework routing/layout conventions
- route colocation
- small intentional shared UI layer

Escalate when:
- `components/` and `hooks/` stop communicating ownership
- feature work touches UI, state, tests, and data together

## Backend service
Default first:
- framework/module/package conventions
- explicit homes for migrations, scripts, jobs, and operational docs

Escalate when:
- one module keeps crossing controllers/services/schemas/jobs unnecessarily
- a global `common/` bucket starts owning domain logic

## Fullstack monorepo
Default first:
- `apps/` + `packages/` / `libs/`
- shared code extracted only after repeated reuse
- docs/scripts/tooling placed as first-class peers when important

Escalate when:
- package boundaries no longer match ownership
- shared packages are mostly wrappers around one app's needs

## Docs / ops repo
Default first:
- content organized by user task and document type
- runbooks, architecture notes, onboarding, and reference separated when audiences differ

Escalate when:
- readers cannot predict where a document belongs
- publishing history dominates the folder tree

## Game-development repo
Default first:
- engine-required roots and special folders
- clear separation of scenes/levels, prefabs/assets, scripts/tools, and generated outputs
- naming and ownership rules for cross-discipline collaboration

Escalate when:
- asset sprawl makes ownership unclear
- feature/system grouping is needed on top of engine-required buckets

## Boundary reminders
- `codebase-search` finds current files; it does not design structure.
- `workflow-automation` enforces or scaffolds a chosen structure; it does not choose the structure.
- `system-environment-setup` makes the repo runnable; it does not decide folder ownership.
- `state-management` and `design-system` own subsystem-specific structure inside a broader repo shape.
