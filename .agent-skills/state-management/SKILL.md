---
name: state-management
description: >
  Choose the smallest viable React/fullstack state owner before comparing libraries.
  Use when the user needs to classify local UI state, shared subtree/Context state,
  URL or form state, server-state caches, or client workflow stores such as
  Zustand / Redux Toolkit / Jotai. Triggers on: global state, prop drilling,
  Context vs Zustand, Redux Toolkit vs Zustand, server state vs client state,
  React Router state management, optimistic updates, URL state, form state, and
  too much state in one store.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for React, Next.js, Remix/React Router, and frontend/fullstack TypeScript
  repos that need a decision-first ownership layer. Not for raw performance
  tuning, backend API contract design, or debugging already-broken state code.
license: MIT
metadata:
  tags: state-management, react, context, redux-toolkit, zustand, jotai, tanstack-query, client-state, server-state
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.2"
  source: akillness/jeo-skills
---

# State Management

Use this skill when the real question is:

**What packet is this state, who should own it, and what tempting wrong owner should we avoid?**

Do **not** start with a library debate. Start by naming one primary packet, then choose the smallest owner that matches its lifecycle.

Read [references/ownership-packets-and-route-outs.md](references/ownership-packets-and-route-outs.md) before handling a mixed or ambiguous request.
Read [references/decision-matrix.md](references/decision-matrix.md) when the packet is clear and you need to compare likely owners.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when the request may actually belong to `react-best-practices`, `api-design`, `debugging`, `ui-component-patterns`, `design-system`, or `responsive-design`.

## When to use this skill
- Decide whether a frontend problem is local UI state, shared subtree state, URL/navigation state, form state, server state, or long-lived client workflow state.
- Turn vague requests like “we need state management” into a concrete ownership recommendation.
- Choose between Context, Zustand, Redux Toolkit, Jotai, TanStack Query, or router-native ownership without treating them as interchangeable.
- Stop “one store for everything” proposals before implementation starts.
- Produce a short ownership brief for implementation or review.

## When not to use this skill
- **The main task is rerender churn, hydration mismatch, waterfalls, or client/server performance behavior** → use `react-best-practices`.
- **The main task is mutation shape, backend ownership, or optimistic-write API design** → use `api-design`.
- **The main task is debugging stale closures, races, broken optimistic updates, or existing state bugs** → use `debugging`.
- **The main task is controlled/uncontrolled component APIs, primitives, slots, or reusable component contracts** → use `ui-component-patterns`.
- **The main task is visual system governance or shared preference policy** → use `design-system`.
- **The main task is viewport adaptation or layout collapse** → use `responsive-design`.
- **The architecture choice is already made and the user just needs code** → implement directly instead of re-running the chooser.

## Instructions

### Step 1: Pick one primary packet
Choose the main packet before naming any tool:
- **local-ui** — toggles, open panels, inline edit state, active row, one-feature transient state
- **shared-subtree** — theme, auth snapshot, locale, feature flags, moderate shell state
- **url-navigation** — filters, sort order, pagination, selected tab, deep-linkable view state
- **form-lifecycle** — dirty/touched state, validation, submission lifecycle, async submit errors
- **server-state** — fetched data, caching, invalidation, revalidation, optimistic server updates
- **client-workflow** — cross-page drafts, undo, multi-step coordination, offline edits, long-lived workflow state

Optional: list one or two secondary packets, but force a single **primary** packet.

Quick frame:
```markdown
Primary packet: server-state
Secondary packets: url-navigation, local-ui
Decision pressure: shareable filters + remote list freshness
```

### Step 2: Choose the smallest owner
Use the narrowest owner that matches the packet:
- **local-ui** → local state, lifted state, or `useReducer`
- **shared-subtree** → Context when one moderate tree needs a shared source of truth
- **url-navigation** → router/search params when refresh, deep links, and back/forward should work naturally
- **form-lifecycle** → form-layer ownership, not app-wide global state
- **server-state** → TanStack Query or router-native data APIs when cache/revalidation rules dominate
- **client-workflow** → Zustand, Redux Toolkit, Jotai, or explicit state-machine modeling only after the earlier packets are separated

Rule: if the state is really route-shaped or server-shaped, do not hide it in a generic client store just because the store already exists.

### Step 3: Run the anti-pattern check
Call out the most likely wrong owner explicitly:
- one universal store for unrelated lifecycles
- mirroring server cache into a client store without an offline/workflow reason
- hiding shareable filters or tabs outside the URL
- pushing form dirty/touched/submit lifecycle into global app state
- treating every slow or buggy UI issue as a state-architecture problem

A good answer names both the chosen owner **and** the tempting wrong owner.

### Step 4: Compare client-store options only if a client-workflow packet remains
After local/shared/URL/form/server packets are separated:
- **Context** when the real pain is access/distribution across a moderate tree
- **Zustand** when you need low-ceremony cross-component or cross-page workflow state
- **Redux Toolkit** when workflows are coupled, event-heavy, or need stronger conventions and auditability
- **Jotai** when fine-grained atom composition truly matches the app’s mental model
- **State machines / explicit workflow modeling** when transitions, guards, and multi-step coordination dominate

Do not compare stores for packets that already belong to URL/form/server ownership.

### Step 5: Name mixed architectures directly
Healthy combinations are normal:
- URL state + query/router data + local UI state
- Context + query/router data
- Zustand + query/router data
- Redux Toolkit + query/router data
- form state + URL state + query/router data

If the request asks for one universal store, explain what gets worse when unlike lifecycles are flattened together.

### Step 6: Route adjacent work out immediately
Stay here only while choosing ownership.

Route out when the next step is:
- **`react-best-practices`** for rerender/hydration/waterfall/perf issues
- **`api-design`** for mutation contracts or backend/client responsibility
- **`debugging`** for already-broken state behavior
- **`ui-component-patterns`** for component API ownership
- **`design-system`** for system-level preference/governance rules
- **`responsive-design`** for layout/viewport behavior

### Step 7: Produce one ownership brief
Use this format:
```markdown
Primary packet:
Secondary packets:

Recommended owners:
- ...

Why this is the smallest viable split:
- ...

Avoid:
- ...

Route-out note:
- ...

Next implementation step:
- ...
```

Keep it short. If the honest answer is “do less and keep the state closer to where it lives,” say that directly.

## Output format
Return a concise ownership recommendation with:
1. one primary packet and any secondary packets
2. chosen owners per packet
3. one-paragraph rationale
4. explicit anti-patterns to avoid
5. route-out note if another skill should own the next step

## Examples

### Example 1: Dashboard data, filters, and modals
**Input:** “Should this dashboard use Zustand or TanStack Query for project data, filters, and modal state?”

**Good output shape:**
- primary packet = server-state
- secondary packets = url-navigation, local-ui
- project data = TanStack Query or router-native data ownership
- filters = URL/search params if shareable/bookmarkable
- modal state = local or lightweight client state only if coordination spans distant branches
- avoid mirroring fetched entities into Zustand without an offline/workflow reason

### Example 2: Prop drilling theme and auth
**Input:** “Theme and auth are passed through five levels. Do we need Redux?”

**Good output shape:**
- primary packet = shared-subtree
- recommend Context first
- reject Redux unless broader coupled workflow state also exists

### Example 3: React Router app storing filters and loader data in Zustand
**Input:** “Our React Router app stores filters and loader data in Zustand. Is that fine?”

**Good output shape:**
- primary packet = url-navigation or server-state, not client-workflow
- move shareable filters into URL/search params
- keep loader/action data in router-native data ownership unless a separate cache need is real
- use Zustand only for leftover workflow coordination

### Example 4: Broken optimistic updates
**Input:** “The state code is buggy and optimistic updates are broken—what skill owns the next step?”

**Good output shape:**
- identify that ownership choice is secondary to active failure diagnosis
- route the next step to `debugging`
- mention `api-design` if the optimistic-write contract itself is the real dispute

## Best practices
1. Pick the packet before the tool.
2. Use the smallest viable owner.
3. Keep URL/form/server/client workflow lifecycles separate unless there is a strong reason not to.
4. Call out the wrong owner explicitly.
5. Treat mixed ownership as normal, not as a failure to standardize.
6. End with a brief that an implementer or reviewer can act on immediately.

## References
- [React — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
- [React — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [React — Context](https://react.dev/learn/passing-data-deeply-with-context)
- [Redux FAQ — Organizing State](https://redux.js.org/faq/organizing-state)
- [Redux — Why Redux Toolkit is How To Use Redux Today](https://redux.js.org/introduction/why-rtk-is-redux-today)
- [TanStack Query — Does this replace client state managers?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state)
- [React Router — State Management](https://reactrouter.com/explanation/state-management)
- [Zustand](https://github.com/pmndrs/zustand)
- [Jotai](https://jotai.org/docs/basics/comparison)
