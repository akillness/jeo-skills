# Boundary Decision Matrix

Use this when choosing the main organizing unit.

| Pressure | Primary boundary | Why | Common mistake |
|---|---|---|---|
| Business-domain code is scattered across `components/`, `hooks/`, `utils/`, `store/` | Feature folder | Keeps related change together | Keeping technical folders as the long-term top-level architecture |
| Router/layout/file-convention semantics shape placement | Route segment + colocation | Works with framework rules instead of against them | Treating route folders as the only architecture and burying unrelated logic there |
| Reusable code is truly shared across multiple features/apps | Shared layer | Makes reuse explicit and governed | Promoting almost everything into `shared/` too early |
| Multiple runnable apps/services or reusable libraries need independent boundaries | Workspace package | Matches dependency/runtime/deploy boundaries | Creating packages to compensate for unclear feature ownership |
| Repo already knows the target but the move is risky | Migration audit | Reduces import/test/docs breakage | Doing a giant rename without staged verification |

## Fast heuristics
- If one user-facing change touches five technical folders, start with **feature modularization**.
- If the framework already reserves file names/locations, respect those constraints first.
- If `shared/` keeps growing faster than features, your shared criteria are too weak.
- If a package would only contain one folder moved for tidiness, you probably do **not** need a package yet.
- If the team cannot explain what belongs in a folder in one sentence, that folder is not a reliable boundary.

## Adjacent-skill handoffs
- Component API and reusable primitive design → `ui-component-patterns`
- Design-token and library governance → `design-system`
- State/caching ownership → `state-management`
- Toolchain/services/runtime setup → `system-environment-setup`
- Task runners / hooks / bootstrap automation → `workflow-automation`
