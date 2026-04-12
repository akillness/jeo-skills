---
name: state-management
description: >
  Design React state boundaries before picking libraries. Use when the user needs
  to decide whether data should stay local, be lifted/shared via Context, live in
  URL or form state, move into a client store like Zustand / Redux Toolkit /
  Jotai, or stay in a server-state cache such as TanStack Query. Triggers on:
  global state, prop drilling, Context vs Zustand, Redux Toolkit vs Zustand,
  server state vs client state, React state architecture, shared state, optimistic
  updates, and too much state in one store.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for React, Next.js, and frontend/fullstack TypeScript repos that need a
  decision-first state architecture layer. Not for raw performance tuning,
  backend API design, or writing a full app from scratch without a state-boundary
  question.
license: MIT
metadata:
  tags: state-management, react, context, redux-toolkit, zustand, jotai, tanstack-query, client-state, server-state
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# State Management

Use this skill when the main question is **"what kind of state is this, who should own it, and what is the smallest tool that fits?"**

The job is not to dump boilerplate for Redux, Context, or Zustand.
The job is to:
1. classify the state category first,
2. choose the narrowest ownership layer,
3. keep server-state caching separate from client UI/global state,
4. pick a store only when React built-ins stop being enough,
5. route adjacent concerns to the right neighboring skill.

Read [references/decision-matrix.md](references/decision-matrix.md) before handling a mixed client/server workflow or a cross-page architecture decision.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `state-management`, `react-best-practices`, `api-design`, `debugging`, or `ui-component-patterns` should own the next step.

## When to use this skill
- Decide whether a React problem is local state, shared UI state, form state, URL state, client global state, or server state
- Turn vague requests like “we need state management” into a concrete architecture recommendation
- Choose between Context, Zustand, Redux Toolkit, Jotai, or a query cache without treating them as interchangeable
- Fix prop-drilling complaints without defaulting to a global store
- Separate API/cache concerns from UI/workflow state in frontend or fullstack apps
- Decide whether optimistic updates, cache invalidation, or synchronization requirements mean the real problem is server state
- Produce a short state-boundary brief for implementation or review

## When not to use this skill
- **The main task is React/Next.js rendering performance, waterfalls, hydration, or rerender behavior** → use `react-best-practices`
- **The main task is API contract design, mutation shape, or backend ownership** → use `api-design`
- **The main task is debugging why existing state code is broken or racey** → use `debugging`
- **The main task is component API design or reusable UI primitives** → use `ui-component-patterns` or `design-system`
- **The main task is just writing one reducer/store file after the architecture is already chosen**; in that case implement directly instead of re-running the whole decision flow
- **The user has not described any shared ownership, data lifecycle, or coordination problem yet**; clarify the actual state symptom first

## Instructions

### Step 1: Classify the state type before naming any library
Do not start with “use Redux” or “use Zustand.” Start by classifying the data.

Use these buckets:
- **Local UI state** — input values, open/closed toggles, hover, tab selection, temporary wizard step
- **Shared UI state** — theme, auth session snapshot, modal coordination, command palette visibility, feature flags consumed across multiple branches of the tree
- **Form state** — validation, dirty fields, touched state, submission lifecycle
- **URL/navigation state** — filters, sort order, tabs, pagination, deep-linkable view state
- **Server state** — fetched remote data, caching, invalidation, background refetching, optimistic updates, stale/fresh data rules
- **Long-lived client workflow state** — drafts, multi-step local workflows, offline edits, cross-page state machines, collaborative client-side coordination

If a request mixes multiple buckets, split them explicitly instead of forcing one owner.

Quick framing template:
```markdown
State buckets:
- Server state: project list, status counts, notifications
- Shared UI state: active modal, selected workspace, command palette
- URL state: filters and pagination
- Local state: inline edit open/close
```

### Step 2: Choose the smallest ownership layer
Apply the narrowest possible owner first.

#### Keep it local when
- only one component or one tight subtree needs it
- the state dies when the component unmounts
- syncing it globally would add indirection without reuse

Typical tools:
- `useState`
- `useReducer`
- lifted state to the nearest common parent

#### Use URL or form ownership when
- the value should survive refresh, deep links, or browser navigation
- the state is fundamentally part of a form lifecycle rather than app-wide coordination

Do not hide these inside a general-purpose global store unless you have a clear reason.

#### Use Context when
- consumers need one shared source of truth across a moderate subtree
- write frequency is modest
- you want dependency-free shared state such as theme, auth snapshot, locale, or feature switches
- the real problem is ownership, not advanced store tooling

Context is a distribution mechanism, not proof that the app needs a full global-state framework.

### Step 3: Separate server state from client state
If the problem involves fetching, caching, invalidation, background refetching, stale/fresh policies, or optimistic mutation behavior, classify it as **server state first**.

That usually means:
- keep remote data in TanStack Query or an equivalent query/cache layer
- avoid duplicating fetched entities into a generic client store unless there is a strong offline/workflow reason
- keep ephemeral UI state next to the UI or in a small client store if needed

Good pattern:
```markdown
TanStack Query owns:
- fetching projects
- cache invalidation after mutation
- optimistic update rollback

Client state owns:
- open/closed inspector panel
- selected local draft mode
- non-URL UI toggles
```

Bad pattern:
```markdown
Fetch everything with a query library,
then immediately mirror the whole server cache into Zustand/Redux
just so one store appears to own everything.
```

### Step 4: Choose the right client-state tool only after the boundary is clear
When React built-ins or Context are no longer enough, choose the store by coordination cost.

#### Prefer React built-ins / Context when
- the shared surface is small to medium
- update flows are understandable without event/reducer machinery
- the main pain is prop drilling, not complex cross-feature workflows

#### Prefer Zustand when
- you need lightweight cross-component or cross-page client state
- state slices are fairly independent
- you want low boilerplate and incremental adoption
- the app benefits from reading/writing state outside deeply nested component chains

Watch out for:
- store sprawl
- silently mixing server-cache data into the store
- unclear derived-state ownership

#### Prefer Redux Toolkit when
- workflows are complex, highly coupled, or long-lived
- auditability, action history, or richer devtools matter
- many contributors need explicit conventions and predictability
- you have cross-feature state interactions where event-based modeling helps more than ad hoc setters

Use Redux Toolkit, not hand-rolled legacy Redux-core patterns.

#### Consider Jotai when
- the app benefits from atom-level composition
- state is easier to model as small independent units than as one store tree
- the team already understands the atom mental model and can keep it coherent

Do not force Jotai just because it looks elegant in isolated examples.

### Step 5: Handle mixed-mode architectures explicitly
Many real apps need more than one layer.

Common healthy combinations:
- **Local/Context + TanStack Query** — the default for many apps
- **Zustand + TanStack Query** — shared client workflow state plus remote cache
- **Redux Toolkit + TanStack Query** — complex client workflows plus structured async cache boundaries
- **URL state + query cache + local UI state** — dashboards, search pages, admin tools

Name the split directly:
```markdown
Recommendation:
- URL owns filters and pagination
- TanStack Query owns fetched lists and invalidation
- Zustand owns transient cross-panel UI coordination
- local state owns per-row expansion and hover/edit toggles
```

If the user asks for one universal store, explain what would be lost by flattening those layers together.

### Step 6: Route adjacent concerns correctly
This skill owns state-boundary decisions, not every downstream concern.

Typical handoffs:
- **`react-best-practices`** — rerender behavior, hydration, server/client component boundaries, waterfalls, caching/perf issues
- **`api-design`** — mutation contracts, resource shape, backend/client boundary design
- **`debugging`** — race conditions, stale closures, broken synchronization, weird rerender loops, or state bugs already happening
- **`ui-component-patterns`** — component APIs, controlled/uncontrolled boundaries, reusable UI primitives
- **`responsive-design`** — layout/breakpoint state only when the main problem is viewport behavior rather than app architecture

If the user asks “which state layer should own this?” stay here.
If they ask “why is this current state code failing?” route to debugging.

### Step 7: Produce the state-boundary brief
End with a short recommendation the implementer can act on.

Use this format:
```markdown
State categories:
- Local UI:
- Shared client state:
- URL/form state:
- Server state:

Recommended ownership:
- local / lifted / Context / Zustand / Redux Toolkit / Jotai / TanStack Query

Why this is the smallest viable choice:
- ...

Avoid:
- ...

Next implementation step:
- ...
```

A good answer names both the chosen owner and the tempting wrong owner.

## Decision heuristics
- Prefer **fewer owners** only when the data lifecycles genuinely match.
- Prefer **local state** over shared state until reuse or coordination pressure proves otherwise.
- Prefer **Context** over a store when the app only needs shared access, not heavy event modeling.
- Prefer **TanStack Query** for remote data lifecycle problems.
- Prefer **Redux Toolkit** when explicit structure, tooling, and cross-feature coordination outweigh ceremony cost.
- Prefer **Zustand** when you need a small-to-medium client store without Redux-style ceremony.
- Prefer **Jotai** when atom composition is a real fit, not just a novelty.

## Output format
Return a concise architecture recommendation with:
1. state categories identified
2. chosen owners per category
3. one-paragraph rationale
4. explicit anti-patterns to avoid
5. route-out note if another skill should own the next step

## Examples

### Example 1: Query cache vs UI store
**Input:** “Should this dashboard use Zustand or TanStack Query for project data, filters, and modal state?”

**Good output shape:**
- project data = server state → TanStack Query
- modal state = shared UI state → local state or Zustand if coordination spans distant branches
- filters = URL state if shareable/bookmarkable, otherwise local/shared UI state
- avoid mirroring fetched entities into Zustand unless offline workflow needs it

### Example 2: Prop drilling complaint
**Input:** “Theme and auth are passed through five levels. Do we need Redux?”

**Good output shape:**
- classify as shared UI/app context, not complex global workflow state
- recommend Context first
- reject Redux unless broader coordination/debugging complexity is also present

### Example 3: Complex product workflow
**Input:** “We have optimistic updates, undo, cross-page drafts, and complicated workflow transitions.”

**Good output shape:**
- split server state from client workflow state
- use TanStack Query for remote entities/invalidation
- evaluate Zustand vs Redux Toolkit based on workflow coupling, devtools needs, and event-model clarity

## Best practices
1. Classify the state category before comparing libraries.
2. Keep server-state caching out of generic client stores unless there is a strong reason.
3. Use the smallest viable owner, not the most famous tool.
4. Name mixed architectures explicitly instead of pretending one store should own everything.
5. Treat “prop drilling” as a symptom, not a library requirement.
6. Prefer Redux Toolkit over legacy Redux-core guidance when structured Redux is truly needed.
7. End with a brief the implementer can act on immediately.

## References
- [React — Managing State](https://react.dev/learn/managing-state)
- [React — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [React — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
- [Redux — Getting Started / Should You Use Redux?](https://redux.js.org/introduction/getting-started)
- [Redux — Why Redux Toolkit is How To Use Redux Today](https://redux.js.org/introduction/why-rtk-is-redux-today)
- [TanStack Query React Overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Jotai](https://jotai.org/)
- [TkDodo — React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager)
