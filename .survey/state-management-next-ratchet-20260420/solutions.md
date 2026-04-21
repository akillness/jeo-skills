# Solution Landscape: state-management next ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| React built-ins / lifted state | Local or lifted ownership | Lowest ceremony; matches narrow UI ownership | Breaks down if cross-tree workflow coordination grows | Still the default answer for many packets |
| Context | Shared subtree distribution | Good for moderate shared state like theme/auth snapshot | Easy to overuse as pseudo-global store | Distribution mechanism, not proof of app-wide complexity |
| Router-native state/data | URL/search-param and route-data ownership | Keeps navigation/server sync close to the framework | Underused when teams start from store comparisons | Stronger fit for shareable filters and route-driven flows |
| TanStack Query | Server-state cache | Clear model for fetching/caching/updating async data | Easy to duplicate into client stores unnecessarily | Best when async cache semantics really matter |
| Zustand | Lightweight client store | Low ceremony, easy incremental adoption | Store sprawl and server-cache duplication | Best for leftover cross-component workflow state |
| Redux Toolkit | Structured workflow store | Strong conventions, auditability, richer event modeling | More ceremony than lighter options | Best when team scale and coupling justify it |
| Jotai | Atom-based state composition | Fine-grained composition for the right mental model | Can get noisy without coherent atom boundaries | Niche, not default |

## Categories
- Built-in ownership: local state, lifted state, reducer-local patterns
- Shared subtree ownership: Context
- Router-native ownership: URL/search params, loaders/actions/revalidation
- Server-state caches: TanStack Query
- Client workflow stores: Zustand, Redux Toolkit, Jotai

## What People Actually Use
The durable real-world pattern is mixed ownership, not one library. Teams combine URL/router state, query/cache tools, and a much smaller client-state layer. The main persistent mistake is flattening unlike lifecycles back into one store for convenience.

## Frequency Ranking
1. Built-in/local/lifted state
2. Router-native ownership for route-shaped state
3. TanStack Query for remote/server state
4. Zustand for lightweight client workflow state
5. Redux Toolkit for larger structured workflows
6. Jotai for narrower atom-based composition

## Key Gaps
- Faster packet classification still matters more than another library comparison.
- Users need clearer anti-pattern warnings for cache duplication, URL-state hiding, and “one store for everything” drift.
- The current skill can probably route perf/debugging/component/API/layout near-misses faster with less inline exposition.

## Contradictions
- Marketing language around stores suggests centralization and simplicity, while current official framework docs increasingly push ownership toward local/lifted, router-native, or server-state-specific layers.
- Users ask for a single tool, but the healthiest implementations keep multiple owners with sharper boundaries.

## Key Insight
The market is not missing a state-management library; it is missing a faster classifier. `state-management` is already the right canonical skill, but the next win is to make packet selection, anti-pattern warnings, and route-outs even faster so the skill closes the library-first debate earlier.
