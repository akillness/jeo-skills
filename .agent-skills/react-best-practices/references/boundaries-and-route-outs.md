# Boundaries and route-outs

Use this note to keep `react-best-practices` sharp instead of letting it absorb all frontend or performance work.

## This skill owns
- React / Next.js performance triage for waterfalls, bundle weight, server-client boundaries, hydration/script cost, and rerender churn
- measurement-first audits of slow routes, heavy client components, and App Router performance regressions
- code-level React / Next.js performance refactors once the dominant bottleneck is clear

## Route out to nearby skills

### `state-management`
Use when the main problem is choosing where state should live or which store/query layer should own the data flow.

Examples:
- Context vs Zustand vs Redux Toolkit vs TanStack Query
- URL/form/local/shared/server-state ownership
- architectural state boundaries before performance tuning

### `web-accessibility`
Use when the visible issue is keyboard/focus/semantics/aria/accessibility compliance.

Examples:
- focus traps, missing labels, screen-reader flow
- interactive semantics broken after a UI refactor
- accessibility verification is the primary ask

### `responsive-design`
Use when the core task is layout adaptation, overflow, reflow, breakpoint/container logic, or mobile-first rendering behavior.

Examples:
- cards overflow on tablet
- layout collapses on small screens
- issue is primarily responsive adaptation, not route JS cost

### `performance-optimization`
Use when the bottleneck is broader than React or spans backend, database, capacity, network, worker, or mixed runtime concerns.

Examples:
- slow API/database dominates the route
- memory, CPU, queue, or infra bottlenecks
- performance packet needs cross-stack tuning rather than React-specific guidance

## Alias boundary
`vercel-react-best-practices` is a compatibility alias only. Use it when exact-name legacy tooling or user wording requires the old name. Ordinary React / Next.js performance requests should activate `react-best-practices` directly.

## Practical rule
If you cannot name a specifically React / Next.js performance symptom, you probably need a different anchor first.
