# Solution Landscape: state-management modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| React built-ins (`useState`, `useReducer`, lift state up, Context) | Native component/local/shared state tools | Zero dependency, matches React docs, best default for small shared state | Easy to overuse Context for high-churn app state; does not solve async cache concerns by itself | Best first decision layer, not a complete answer for every app |
| Redux Toolkit | Structured global client state with strong ecosystem/devtools | Mature patterns, explicit reducer/event model, strong tooling, recommended by Redux maintainers | More ceremony than lightweight stores; overkill for many apps | Use for complex cross-app state or when traceability/devtools matter most |
| Zustand | Minimal global client store | Low boilerplate, approachable, flexible slices, easy incremental adoption | Easy to create ad hoc store sprawl; still not a server-state cache | Good fit for shared client/UI state, not a catch-all replacement for every lane |
| Jotai | Atom-based state composition | Fine-grained composition, feels close to React primitives, useful for modular state graphs | Different mental model; can add fragmentation if used without boundaries | Better framed as an atomic client-state option than a universal recommendation |
| TanStack Query | Async server-state fetching/caching/synchronization | Excellent for remote data lifecycle, cache invalidation, stale/fresh handling, optimistic UI support | Not a full replacement for all client/UI state | Should usually be routed as server-state infrastructure, not lumped into generic global-state advice |

## Categories
- **Structure-first / no extra library:** React built-ins, lifting state up, Context.
- **Structured global client state:** Redux Toolkit.
- **Lightweight global client state:** Zustand.
- **Atomic / composable client state:** Jotai.
- **Server-state cache and synchronization:** TanStack Query.

## What People Actually Use
Current practice is not “pick one state library for everything.” The recurring real-world pattern is:
1. keep local component state local;
2. lift or share only when multiple components need the same source of truth;
3. use TanStack Query (or equivalent) for async server data;
4. add Zustand or Redux Toolkit only for cross-cutting client state that does not belong in the query cache or URL.

That workflow shows up both in official docs and in community discussion snippets recovered this run.

## Frequency Ranking
1. React built-ins / Context as the baseline decision layer
2. Redux Toolkit as the structured complex-app option
3. Zustand as the lighter shared client-state option
4. TanStack Query as the server-state/cache layer that modern teams increasingly separate out
5. Jotai as the narrower atomic alternative

## Key Gaps
- The current repo skill does not force a **state-type classification** before suggesting a library.
- It does not clearly separate **server state** from **client UI/global state**.
- It does not give agents a **decision matrix** for Context vs Zustand vs Redux Toolkit vs Jotai.
- It lacks `references/` and `evals/`, so the skill is harder to maintain and easier to over-trigger.
- Discovery docs still position the skill as a generic “Redux/Context/Zustand patterns” page rather than a boundary-setting frontend architecture skill.

## Contradictions
- Marketed library comparisons often frame the choice as a winner-take-all store decision, while actual practice keeps multiple layers: React built-ins for local state, query cache for server state, and a separate client-state store only if needed.
- Legacy Redux tutorials imply Redux itself is the main object to learn, while Redux’s own modern docs steer users to Redux Toolkit.

## Key Insight
The best upgrade is not adding another frontend skill. It is rewriting `state-management` into a **decision-first state-boundary skill**: classify the state type first, route server state away from generic global-state answers, then choose the narrowest viable client-state tool. That is more transferable, more modern, and less duplication-prone than preserving the current library-tour format.
