## JTBD Alternatives
- Keep state local/lifted and avoid any new shared-state layer.
- Use router-native ownership for URL/search-param and route-data flows instead of a client store.
- Use a server-state cache for remote entities and keep client workflow state separate.
- Use a lightweight client store only for leftover cross-component workflow state.
- Use a structured workflow store only when event modeling and team-scale conventions justify it.

## Cross-Industry Substitutes
- Admin/dashboard apps: URL params + query cache + local UI state.
- Consumer apps: local UI state + Context for modest shared state, with selective query-cache use.
- Internal tools: router state for filters/navigation plus a small store for cross-panel coordination.
- Fullstack route-first apps: loaders/actions/forms as the default ownership layer for server-backed state.

## Indirect Competitors
- “Just use Context everywhere” guidance.
- “Put everything in Redux/Zustand” guidance.
- Framework-native route-data systems that make standalone client-cache or global-store advice less central.

## Key Gap
The solution market is not missing libraries; it is missing faster ownership classification. The remaining opportunity in `state-management` is to make packet selection and exclusions even faster so users do not re-open the same library-first debate.
