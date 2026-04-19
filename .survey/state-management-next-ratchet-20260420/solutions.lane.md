## Solutions
- **React built-ins / lifted state / Context** — still the default for local and moderate shared-subtree ownership.
  - Evidence: React’s docs emphasize lifting state to the closest common parent and grouping related state while avoiding contradiction, redundancy, duplication, and deep nesting.
  - Sources: https://react.dev/learn/sharing-state-between-components , https://react.dev/learn/choosing-the-state-structure
- **Router-native state/data ownership** — increasingly the natural home for URL/navigation state and some server-backed flows.
  - Evidence: React Router explicitly reframes much “state management” as cache management and says most React Router apps can forgo traditional caching libraries entirely.
  - Source: https://reactrouter.com/explanation/state-management
- **TanStack Query** — the mainstream server-state/cache answer when a dedicated async cache really is needed.
  - Evidence: TanStack Query positions itself around fetching, caching, syncing, and updating async data.
  - Source: https://tanstack.com/query/latest/docs/framework/react/overview
- **Zustand** — the low-ceremony client-store option for lightweight shared/workflow state.
  - Evidence: Zustand’s introduction still sells a small, scalable bearer-store model with less boilerplate than larger frameworks.
  - Source: https://zustand.docs.pmnd.rs/getting-started/introduction
- **Redux Toolkit** — the structured, explicit event-modeling option when larger teams or more coupled workflows need conventions.
  - Evidence: Redux’s own docs say RTK is the official recommended way to write Redux logic today.
  - Source: https://redux.js.org/introduction/why-rtk-is-redux-today
- **Jotai** — a fine-grained atom model when the app’s mental model really is many semi-independent units.
  - Source: https://jotai.org/

## Frequency Ranking
1. React built-ins + lifted/shared state for local/default ownership.
2. Router-native data and URL ownership for fullstack route-driven apps.
3. TanStack Query for remote/server state.
4. Zustand for lightweight client workflow/shared state.
5. Redux Toolkit for explicit larger-scale workflow coordination.
6. Jotai as a narrower atom-first option.

## Categories
- Built-in ownership: lifted state, `useState`, `useReducer`, Context
- Router-native ownership: search params, loaders/actions/revalidation, navigation/form state
- Server-state caches: TanStack Query
- Lightweight client stores: Zustand
- Structured workflow stores: Redux Toolkit
- Fine-grained atom stores: Jotai

## Curated Sources
- https://react.dev/learn/sharing-state-between-components
- https://react.dev/learn/choosing-the-state-structure
- https://reactrouter.com/explanation/state-management
- https://tanstack.com/query/latest/docs/framework/react/overview
- https://zustand.docs.pmnd.rs/getting-started/introduction
- https://redux.js.org/introduction/why-rtk-is-redux-today
- https://jotai.org/
