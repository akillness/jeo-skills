# Context: state-management modernization

## Workflow Context
State-management work shows up when a frontend app starts mixing multiple kinds of state under one vague label: ephemeral component state, shared UI state, form state, URL/navigation state, async server state, and long-lived client state. React’s own docs still teach first principles like choosing minimal state structure and keeping a single source of truth before reaching for global stores. In practice, modern React teams also split server-state fetching/caching from client-state coordination instead of forcing one store to own everything.

Primary sources:
- React — Managing State: https://react.dev/learn/managing-state
- React — Choosing the State Structure: https://react.dev/learn/choosing-the-state-structure
- React — Sharing State Between Components: https://react.dev/learn/sharing-state-between-components
- Redux — Getting Started / Should You Use Redux?: https://redux.js.org/introduction/getting-started
- Redux — Why Redux Toolkit is How To Use Redux Today: https://redux.js.org/introduction/why-rtk-is-redux-today
- TanStack Query React Overview: https://tanstack.com/query/latest/docs/framework/react/overview
- Jotai home/docs: https://jotai.org/
- TkDodo — React Query as a State Manager: https://tkdodo.eu/blog/react-query-as-a-state-manager

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend engineer | Choose state boundaries, avoid over-centralized stores, and keep components predictable | Intermediate to advanced |
| Fullstack engineer | Separate server cache concerns from UI state while wiring APIs into React apps | Intermediate |
| Tech lead / reviewer | Decide when Context is enough, when a store is justified, and when async data should stay in a query cache | Advanced |
| Agent maintaining a React codebase | Route the request into the correct state lane instead of defaulting to a generic Redux/Zustand answer | Intermediate |

## Current Workarounds
1. Default to a single global store even when the real problem is local state structure or lifting state up.
2. Treat server fetching/caching as if it were ordinary client state, then duplicate cache data inside Zustand/Redux stores.
3. Mix URL state, form state, and transient UI flags into one catch-all store because the skill does not force a boundary decision first.
4. Ask for “state management” when the real need is query caching, optimistic updates, or controlled form handling.

## Adjacent Problems
- Overlap with `react-best-practices` on component composition and render boundaries.
- Overlap with backend/fullstack work when API caching and optimistic updates are mis-modeled as generic global state.
- Debugging complexity increases when the chosen state layer does not match the actual data lifecycle.
- Review quality drops when agents recommend libraries before classifying the state category.

## User Voices
- React docs emphasize state structure first: “Choosing the State Structure” and “A single source of truth for each state” frame the problem as ownership and minimization before tooling. Sources: https://react.dev/learn/choosing-the-state-structure and https://react.dev/learn/sharing-state-between-components
- Redux’s own docs keep the boundary question explicit with “Should You Use Redux?” and position Redux Toolkit as the current recommended Redux path, not raw Redux-core boilerplate. Sources: https://redux.js.org/introduction/getting-started and https://redux.js.org/introduction/why-rtk-is-redux-today
- TanStack Query describes itself as the missing data-fetching library for web apps and focuses on fetching, caching, synchronizing, and updating async data. Source: https://tanstack.com/query/latest/docs/framework/react/overview
- TkDodo’s “React Query as a State Manager” argues that React Query is an async state manager and a data-synchronization tool, which is the clearest articulation of the server-state/client-state split in this lane. Source: https://tkdodo.eu/blog/react-query-as-a-state-manager
- Yahoo Japan indexed Reddit snippets show the same practical split in community usage: “Tanstack Query is a state management tool, but it’s an async state management tool” and “Use Tanstack Query for data fetched from the server. Use Zustand for UI data.” Evidence type: Yahoo Japan indexed snippet from `search.yahoo.co.jp` results for `React state management TanStack Query Zustand Reddit` on 2026-04-13; confidence: high (URL + snippet recovered in the same run).
- Yahoo Japan indexed Reddit snippets also show the Redux Toolkit vs Zustand tradeoff recurring in practice: “Zustand: Clean API, great performance, minimal boilerplate. Redux Toolkit: Best for complex apps, time-travel debugging.” Evidence type: Yahoo Japan indexed snippet from `search.yahoo.co.jp` results for `Redux Toolkit vs Zustand Jotai React state management Reddit` on 2026-04-13; confidence: high (URL + snippet recovered in the same run).
