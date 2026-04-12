# Handoff Boundaries for `state-management`

Use `state-management` when the main question is **who should own this data and what state layer fits**.

## Stay in `state-management` when
- the user asks whether data is local vs shared vs server state
- the user wants Context vs Zustand vs Redux Toolkit vs Jotai guidance
- the user is mixing query caching with client stores and needs a boundary recommendation
- the user wants an architecture brief before implementation

## Route to `react-best-practices` when
- the main pain is rerender storms, hydration mismatch, client/server component boundaries, waterfalls, or slow UI updates
- the recommendation already exists and the next step is performance implementation

## Route to `api-design` when
- the disagreement is really about mutation shape, response contracts, optimistic-write API design, or backend/client responsibility
- the issue is not who owns state in React, but what the API should return or accept

## Route to `debugging` when
- the current app already has stale closures, race conditions, broken optimistic updates, or inconsistent synchronization and needs diagnosis
- the user needs reproduction, isolation, or verification of a bug rather than a fresh architecture choice

## Route to `ui-component-patterns` or `design-system` when
- the question is mostly about controlled/uncontrolled components, reusable primitives, compound components, or component API shape
- state ownership is subordinate to component contract design

## Rule of thumb
- **Which owner should this state have?** → `state-management`
- **Why is this current state code malfunctioning?** → `debugging`
- **Why is this UI slow or rerendering too much?** → `react-best-practices`
- **What should the API or mutation contract look like?** → `api-design`
- **How should the component interface behave?** → `ui-component-patterns`
