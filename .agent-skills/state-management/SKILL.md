---
name: state-management
description: >
  Classify React and fullstack state ownership before picking libraries. Use when
  the user needs to decide whether data should stay local, be lifted/shared via
  Context, live in URL or form state, use a client store like Zustand / Redux
  Toolkit / Jotai, or stay in a server-state cache such as TanStack Query or a
  router-native data layer. Triggers on: global state, prop drilling, Context vs
  Zustand, Redux Toolkit vs Zustand, server state vs client state, React state
  architecture, optimistic updates, URL state, form state, and too much state in
  one store.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for React, Next.js, Remix/React Router, and frontend/fullstack TypeScript
  repos that need a decision-first ownership layer. Not for raw performance
  tuning, backend API contract design, or debugging already-broken state code.
license: MIT
metadata:
  tags: state-management, react, context, redux-toolkit, zustand, jotai, tanstack-query, client-state, server-state
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  source: akillness/oh-my-skills
---

# State Management

Use this skill when the main question is:

**What kind of state is this, who should own it, and what is the smallest viable layer?**

The job is not to dump boilerplate for Redux, Zustand, or Context.
The job is to classify the ownership packet first, keep unlike lifecycles apart, and route neighboring frontend work to the right skill.

Read [references/decision-matrix.md](references/decision-matrix.md) after classifying the problem.
Read [references/ownership-packets-and-route-outs.md](references/ownership-packets-and-route-outs.md) when the request mixes URL/router state, server caches, client workflow state, and neighboring skills.

## When to use this skill
- Decide whether a React problem is local UI state, shared subtree state, URL/navigation state, form state, server state, or long-lived client workflow state
- Turn vague requests like “we need state management” into a concrete ownership recommendation
- Choose between Context, Zustand, Redux Toolkit, Jotai, TanStack Query, or router-native data ownership without treating them as interchangeable
- Fix prop-drilling complaints without defaulting to a universal global store
- Separate API/cache concerns from UI/workflow state in frontend or fullstack apps
- Decide whether optimistic updates, invalidation, or route-native data loading mean the real problem is server state first
- Produce a short ownership brief before implementation or code review

## When not to use this skill
- **The main task is rerender churn, hydration mismatch, waterfalls, bundle cost, or client/server performance behavior** → use `react-best-practices`
- **The main task is mutation shape, response contracts, backend ownership, or optimistic-write API design** → use `api-design`
- **The main task is debugging stale closures, races, broken optimistic updates, or existing state bugs** → use `debugging`
- **The main task is controlled/uncontrolled component APIs, reusable primitives, slots, or design-system governance** → use `ui-component-patterns` or `design-system`
- **The main task is viewport adaptation, layout collapse, or mobile/tablet behavior** → use `responsive-design`
- **The architecture choice is already made and the user only needs store/reducer code written** → implement directly instead of re-running the whole chooser

## Instructions

### Step 1: Classify the ownership packet before naming any library
Do not start with “use Redux” or “use Zustand.” Start by naming the state category.

Use these packets:
- **Local UI state** — toggles, open/closed panels, inline edit state, hovered row, active tab inside one feature subtree
- **Shared subtree state** — theme, auth snapshot, locale, feature flags, command palette visibility, modal coordination used across a moderate tree
- **URL/navigation state** — filters, sort order, pagination, tab choice, deep-linkable or back/forward-aware view state
- **Form state** — dirty/touched state, validation, submission lifecycle, async form errors
- **Server state** — fetched remote data, caching, revalidation, invalidation, optimistic updates, stale/fresh rules
- **Client workflow state** — multi-step drafts, cross-page editing flows, offline edits, long-lived client coordination, state machines

If a request mixes packets, split them explicitly instead of forcing one owner.

Quick framing template:
```markdown
Ownership packets:
- Server state: project list, unread counts, remote entity details
- URL state: filters, pagination, active tab
- Shared subtree state: command palette visibility, selected workspace shell state
- Local UI state: row expansion, hover/edit toggles
```

### Step 2: Choose the smallest owner first
Start with the narrowest owner that matches the lifecycle.

#### Keep it local when
- only one component or tight subtree needs the value
- the state dies when the feature unmounts
- global sharing would add indirection without real reuse

Typical owners:
- `useState`
- `useReducer`
- lifted state to the nearest common parent

#### Prefer URL or form ownership when
- the value should survive refresh, deep links, or browser navigation
- the state is really part of a form lifecycle rather than app-wide coordination
- router-native search params, actions, loaders, or sessions already own the problem

Do not hide shareable filters, tabs, or submission state inside a generic client store without a clear reason.

#### Prefer Context when
- consumers need one shared source of truth across a moderate subtree
- write frequency is modest
- the real pain is ownership/access, not workflow orchestration
- examples: theme, auth snapshot, locale, feature switches, moderate shell state

Context is a distribution mechanism, not proof that the app needs a full state framework.

### Step 3: Separate server state from client state
If the problem involves fetching, caching, invalidation, background refetching, stale/fresh policies, optimistic mutation behavior, or route-native revalidation, classify it as **server state first**.

Healthy defaults:
- **TanStack Query or equivalent** owns fetched entities, cache invalidation, optimistic rollback, and refetch rules
- **Router-native data APIs** can own URL-driven data loading and mutation flows when the framework already provides them
- **Client state** should own only the remaining local UI/workflow coordination

Bad pattern:
```markdown
Fetch everything remotely,
then mirror the whole remote cache into Zustand/Redux
just so one store appears to own everything.
```

### Step 4: Pick the client-state tool only after the boundary is clear
When React built-ins or Context stop being enough, choose the store by coordination cost.

#### Prefer React built-ins / Context when
- the shared surface is small to medium
- update flows stay understandable without event machinery
- the main pain is prop drilling, not complex workflow logic

#### Prefer Zustand when
- you need lightweight cross-component or cross-page client state
- slices are fairly independent
- low ceremony and incremental adoption matter
- you want a small store, not a full event-modeling system

Watch out for store sprawl and server-cache duplication.

#### Prefer Redux Toolkit when
- workflows are coupled, long-lived, or require explicit event modeling
- richer devtools, conventions, and auditability matter
- many contributors need predictable reducer/action boundaries
- cross-feature state interactions are hard to reason about with ad hoc setters

Use Redux Toolkit, not legacy Redux-core advice.

#### Consider Jotai when
- atom-level composition actually matches the app’s mental model
- state is easier to model as many semi-independent units than as one store tree
- the team can keep atom boundaries coherent

#### Consider explicit workflow/state-machine modeling when
- transitions, guards, and multi-step client workflows dominate the problem
- the real need is orchestration clarity, not just a generic shared store

### Step 5: Name mixed architectures directly
Many real apps need more than one owner. Say so plainly.

Healthy combinations:
- **URL state + query cache + local UI state** — dashboards, admin tools, search/filter pages
- **Context + query cache** — auth/theme plus remote entities
- **Zustand + query cache** — lightweight client workflow state plus remote cache
- **Redux Toolkit + query cache** — complex client workflows plus structured remote-data boundaries
- **Form state + URL state + query cache** — multi-step search/forms with shareable results

Example brief:
```markdown
Recommendation:
- URL owns filters and pagination
- TanStack Query owns fetched lists and invalidation
- Zustand owns transient cross-panel coordination
- local state owns per-row expansion and inline edit toggles
```

If the user asks for one universal store, explain what would be lost by flattening unlike lifecycles together.

### Step 6: Route adjacent concerns correctly
This skill owns **ownership decisions**, not every downstream frontend task.

Route out when the next step is:
- **`react-best-practices`** — rerender churn, hydration mismatch, server/client boundary cost, waterfalls, or performance tuning
- **`api-design`** — mutation contracts, optimistic-write API shape, backend/client responsibility, resource shape
- **`debugging`** — stale closures, race conditions, broken optimistic updates, inconsistent synchronization, existing bugs
- **`ui-component-patterns`** — controlled/uncontrolled APIs, reusable component contracts, primitives, slots, compound components
- **`design-system`** — breakpoint policy, token governance, cross-product visual rules, system-level preference strategy
- **`responsive-design`** — viewport adaptation, layout collapse, overflow behavior, mobile/tablet strategy

If the question is “which owner should this state have?”, stay here.
If the question is “why is the current code broken or slow?”, route out.

### Step 7: Produce the ownership brief
End with a short recommendation an implementer or reviewer can act on.

Use this format:
```markdown
Ownership packets:
- Local UI:
- Shared subtree:
- URL/form:
- Server state:
- Client workflow state:

Recommended owners:
- local / lifted / Context / router / form layer / TanStack Query / Zustand / Redux Toolkit / Jotai

Why this is the smallest viable split:
- ...

Avoid:
- ...

Route-out note:
- ...

Next implementation step:
- ...
```

A good answer names both the chosen owner and the tempting wrong owner.

## Output format
Return a concise ownership recommendation with:
1. packets identified
2. chosen owners per packet
3. one-paragraph rationale
4. explicit anti-patterns to avoid
5. route-out note if another skill should own the next step

## Examples

### Example 1: Dashboard filters and API data
**Input:** “Should this dashboard use Zustand or TanStack Query for project data, filters, and modal state?”

**Good output shape:**
- project data = server state → TanStack Query
- filters = URL state if shareable/bookmarkable
- modal state = local/shared client state → local state or Zustand only if coordination spans distant branches
- avoid mirroring fetched entities into Zustand without an offline/workflow reason

### Example 2: Prop drilling complaint
**Input:** “Theme and auth are passed through five levels. Do we need Redux?”

**Good output shape:**
- classify as shared subtree state, not complex workflow state
- recommend Context first
- reject Redux unless broader coordination/debugging needs are also present

### Example 3: Cross-page editing flow
**Input:** “We have optimistic updates, undo, cross-page drafts, and complex workflow transitions. Which state approach fits?”

**Good output shape:**
- split server state from client workflow state
- use TanStack Query or router-native data ownership for remote entities/invalidation
- compare Zustand vs Redux Toolkit based on workflow coupling, auditability, and event-model clarity
- mention explicit state-machine modeling if transitions/guards dominate

## Best practices
1. Classify the ownership packet before comparing libraries.
2. Keep server-state caching out of generic client stores unless there is a strong reason.
3. Prefer URL/form ownership when navigation or submission lifecycle is the real product surface.
4. Use the smallest viable owner, not the most famous tool.
5. Name mixed architectures explicitly instead of pretending one store should own everything.
6. Treat prop drilling as a symptom, not a library requirement.
7. End with a brief the implementer can act on immediately.

## References
- [React — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
- [React — Context](https://react.dev/learn/passing-data-deeply-with-context)
- [Redux FAQ — Organizing State](https://redux.js.org/faq/organizing-state)
- [Redux — Why Redux Toolkit is How To Use Redux Today](https://redux.js.org/introduction/why-rtk-is-redux-today)
- [TanStack Query — Does this replace client state managers?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state)
- [React Router — State Management](https://reactrouter.com/explanation/state-management)
- [Zustand](https://github.com/pmndrs/zustand)
- [Jotai](https://jotai.org/docs/basics/comparison)
