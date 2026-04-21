# Solution Landscape: state-management structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| React local / lifted state | Keep ownership near the feature tree | Smallest default owner; endorsed by React docs | Breaks down with far-apart consumers and repeated prop threading | Baseline first choice |
| React Context | Tree-scoped shared state | Good for theme/auth/locale-style shared access | Provider sprawl, wider rerenders, harder reuse when overused | Distribution mechanism, not proof of global-state need |
| Redux Toolkit | Structured client-state store | Explicit event model, team conventions, devtools, auditability | Heavier ceremony; not ideal for all local/form/remote cache needs | Official Redux path today |
| Zustand | Lightweight client-state store | Small, fast, incremental adoption, no required providers | Easy to let store sprawl or mirror server cache into it | Strong positive ecosystem momentum |
| Jotai | Atom-based client-state composition | Fine-grained composition; useful when atom model fits | More specialized mental model; not default for every app | Best when state composes as many small units |
| TanStack Query | Server-state cache and sync layer | Fetching, caching, invalidation, optimistic update workflows | Not a replacement for synchronous client-only state | Strongest repeated server-state boundary source |
| React Router / URL state | Route/search-param/server-data ownership | Keeps shareable or navigation-backed state in the URL / loaders / actions | Not a generic in-memory client workflow store | Important alternative the current skill under-emphasizes |
| Form-local state / React Hook Form | Form lifecycle ownership | Great for dirty/touched/validation/submit cycles; minimizes rerenders | Too narrow for broader app architecture questions | Helps keep form state out of global stores |
| XState / state machines | Explicit workflow orchestration | Useful for long-lived cross-page workflows and state machines | More complex than typical store needs | Gap candidate: mentioned in problem shapes, not in current chooser |

## Categories
- **Local UI state** — `useState`, `useReducer`, lifted state.
- **Tree-shared state** — Context.
- **Client workflow state** — Redux Toolkit, Zustand, Jotai.
- **Server state / cache** — TanStack Query, router-native data APIs.
- **URL/navigation state** — search params, route state, sessions, cookies.
- **Form state** — local reducers, React Hook Form.
- **Workflow orchestration** — state machines / actors when the real problem is process logic, not generic global state.

## What People Actually Use
The strongest repeated pattern is not “pick one winner” but mixed ownership: local/lifted state stays the default, query/store hybrids are normal, URL state remains common for filters and deep links, and form state often stays local or in a form-specific library. State of React 2024 shows Zustand with very strong positive momentum while Redux remains widely used but less loved (`https://2024.stateofreact.com/en-US/libraries/state-management/`, `https://2023.stateofreact.com/en-US/libraries/state-management/`). TanStack Query explicitly expects to coexist with client stores (`https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state`). React Router argues many apps can skip traditional client caches when route-native data/state APIs already own the problem (`https://reactrouter.com/explanation/state-management`).

## Frequency Ranking
1. React built-ins / lifted state
2. Context for subtree-shared state
3. Server-state tools separate from client-state tools
4. Dedicated client stores: Zustand / Redux Toolkit / Jotai
5. URL/router state and form state as separate ownership layers
6. State machines for narrower workflow-heavy cases

Popularity cues from npm weekly downloads during research:
- `react-hook-form`: ~48.2M/week
- `@tanstack/react-query`: ~45.8M/week
- `zustand`: ~30.6M/week
- `@reduxjs/toolkit`: ~17.7M/week
- `jotai`: ~3.8M/week

## Key Gaps
- The existing skill under-emphasizes **router-native / URL-backed ownership** relative to TanStack Query.
- It mentions **cross-page state machines** as a symptom but does not surface a state-machine alternative when that is the real workflow shape.
- Route-outs to adjacent repo skills are incomplete or one-way, especially around `responsive-design`, `design-system`, `api-design`, and `debugging`.
- URL/form state are classified today but their support surface is thinner than neighboring frontend skills.

## Contradictions
- React Router pushes more state into URL / loaders / actions, while TanStack Query positions itself as the async cache layer; real apps often need both rather than a single universal answer.
- Redux says local state is fine and not everything belongs in Redux, yet Redux is still frequently treated as the default comparison point in teams and tutorials.
- Context is documented as a targeted sharing tool, but user voices show teams often stretch it into app-wide infrastructure and then hit provider sprawl.

## Key Insight
The durable maintenance win is not to add another state-library skill. It is to tighten `state-management` into a classification-first router that starts from ownership packets—local, URL/form, server cache, client workflow, and only then library choice—while explicitly routing perf, debugging, API-contract, component-API, and design-system questions outward. That matches both the current ecosystem and the repo’s existing canonical-boundary strategy.
