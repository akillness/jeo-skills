# Handoff Boundaries for `state-management`

Use `state-management` when the main question is **who should own this data and what layer fits**.

## Stay in `state-management` when
- the user asks whether data is local, shared, URL-backed, form-owned, server-owned, or client-workflow state
- the user wants Context vs Zustand vs Redux Toolkit vs Jotai vs query/router guidance
- the user is mixing query caching, route data, and client stores and needs a boundary recommendation
- the user wants an architecture brief before implementation or review

## Route to `react-best-practices` when
- the main pain is rerender churn, hydration mismatch, client/server component boundaries, waterfalls, or slow UI updates
- the recommendation already exists and the next step is performance implementation or verification

## Route to `api-design` when
- the disagreement is really about mutation shape, response contracts, optimistic-write API design, or backend/client responsibility
- the issue is not who owns state in React, but what the API should return or accept

## Route to `debugging` when
- the current app already has stale closures, race conditions, broken optimistic updates, inconsistent synchronization, or weird store behavior and needs diagnosis
- the user needs reproduction, isolation, or verification of a bug rather than a fresh architecture choice

## Route to `ui-component-patterns` when
- the main task is controlled/uncontrolled component APIs, reusable primitives, slots, compound components, or one component family's interface
- state ownership is subordinate to component contract design

## Route to `design-system` when
- the task is really about shared breakpoint policy, theme/density governance, token rules, or cross-product preference strategy
- the runtime owner is secondary to the system-level rule or governance decision

## Route to `responsive-design` when
- the main question is viewport adaptation, layout collapse, overflow, breakpoint behavior, or mobile/tablet strategy
- state ownership matters only as one detail inside a broader responsive layout decision

## Rule of thumb
- **Which owner should this state have?** → `state-management`
- **Why is the current state code malfunctioning?** → `debugging`
- **Why is this UI slow or rerendering too much?** → `react-best-practices`
- **What should the API or mutation contract look like?** → `api-design`
- **How should the component interface behave?** → `ui-component-patterns`
- **What system rule should multiple products/components follow?** → `design-system`
- **How should the layout adapt across widths/devices?** → `responsive-design`
