## What People Actually Use
People still mix owners in practice: local/lifted state for narrow UI, URL or router state for shareable navigation state, query/cache tools for remote entities, and a smaller client store only for leftover workflow coordination. Official React Router guidance goes further and says many apps can avoid separate cache-management libraries entirely when loaders/actions/forms already keep server data synchronized.

## Common Workarounds
- “One universal store” proposals that mirror server cache, URL state, and UI state together.
- Query/cache tools used correctly for remote entities, but followed by unnecessary duplication into Zustand/Redux for convenience.
- Router-appropriate filters and tabs hidden in component/store state instead of URL/search params.
- Architecture debates standing in for performance triage or stale-state debugging.

## Pain Points With Current Solutions
- Library-first conversations keep returning even when the real answer is ownership classification.
- Query/cache + store combinations are easy to overbuild when teams dislike split ownership.
- The boundary between route-native/server state and client workflow state is still where confusion concentrates.

## Sources
- React Router, “State Management” — https://reactrouter.com/explanation/state-management
- TanStack Query overview — https://tanstack.com/query/latest/docs/framework/react/overview
- Repo-local prior state-management hardening note — `/Users/jang_jennie/projects/oh-my-skills/.agent-skills-wiki/queries/state-management-structural-hardening-2026-04-18.md`
