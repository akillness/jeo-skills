# State Management Decision Matrix

Use this matrix after classifying the ownership packet.

| Ownership packet | Default owner | Escalate when | Typical anti-pattern |
|---|---|---|---|
| Local UI state | `useState` / `useReducer` / lifted state | multiple distant consumers need it or the state survives feature boundaries | putting every toggle and inline input into a global store |
| Shared subtree state | lift state / Context | write frequency, cross-page coordination, or event complexity outgrow Context | jumping to Redux/Zustand before proving Context is insufficient |
| URL/navigation state | router/search params/session-backed route state | deep-linkability, back/forward behavior, or framework-native data ownership matters | hiding shareable filters/tabs only inside a client store |
| Form state | form library or local reducer | validation, async submission, or dirty/touched lifecycle becomes non-trivial | storing touched/errors/submission status in the app-wide store |
| Server state | TanStack Query or router-native data/cache layer | offline drafts or long-lived client workflow staging require a separate client layer too | mirroring the full remote cache into Zustand/Redux for one-store aesthetics |
| Client workflow state | Zustand or Redux Toolkit | auditability, event modeling, transition complexity, or cross-feature coupling grows | forcing long-lived workflow state into Context with ad hoc setters |
| Explicit workflow / state machine | state-machine layer plus the relevant client/server owners | guards, transitions, retries, and multi-step flows dominate the reasoning | pretending a complex state machine is just another blob in one store |

## Quick chooser

### Context is usually enough when
- the shared surface is small to medium
- write frequency is moderate
- the problem is ownership and access, not workflow orchestration
- examples: theme, auth snapshot, locale, feature flags

### Zustand is usually enough when
- the app needs lightweight shared client state across distant branches
- slices are relatively independent
- developer speed and low ceremony matter more than strict event modeling
- examples: panel coordination, client-only drafts, editor UI state, cross-page transient workflow state

### Redux Toolkit is worth it when
- many contributors need explicit event-based structure
- the workflow has coupled transitions and richer debugging needs
- action history and disciplined patterns matter
- examples: complex admin workflows, multi-surface editing tools, high-coupling business processes

### Jotai fits when
- atom-level composition matches the mental model of the app
- different state units evolve semi-independently
- the team can maintain discipline around atom boundaries

### Router-native data/state is enough when
- the framework already owns loaders/actions/search params/sessions cleanly
- the main value is deep-linkability or route-driven revalidation
- adding a separate cache/store would duplicate what the router already knows

## Mixed-mode defaults
- Dashboard: URL state + TanStack Query + local UI state
- Authenticated SaaS app: Context for auth/theme + TanStack Query for data + optional Zustand for cross-panel coordination
- Complex product workflow: TanStack Query for remote entities + Redux Toolkit or Zustand for client workflow state
- Search/results app: router/search params + route data layer + local form state

## Red flags
- “Everything goes in one store” with no lifecycle distinction
- fetched API data duplicated into a second store without a clear reason
- Context used for high-churn complex workflow state just because it is dependency-free
- Redux chosen from habit when the real issue is only prop drilling
- URL/search-param state hidden in memory even though shareability and back/forward matter
