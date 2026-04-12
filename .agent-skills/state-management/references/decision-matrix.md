# State Management Decision Matrix

Use this matrix after classifying the state type.

| State category | Default owner | Escalate when | Typical anti-pattern |
|---|---|---|---|
| Local UI state | `useState` / `useReducer` | multiple distant consumers need it or state survives route changes | putting every toggle and input into a global store |
| Shared UI state | lift state / Context | write frequency, cross-page coordination, or event complexity outgrow Context | introducing Redux/Zustand before proving Context is insufficient |
| URL/navigation state | router/search params | deep-linkability or browser back/forward matters | hiding shareable filters/tabs only inside a store |
| Form state | form library or local reducer | complex validation / async submission lifecycle needs dedicated handling | storing touched/errors/submission status in the global app store |
| Server state | TanStack Query or equivalent query cache | offline drafts or workflow staging require a separate client layer too | mirroring the full server cache into Zustand/Redux just for one-store aesthetics |
| Long-lived client workflow state | Zustand or Redux Toolkit | auditability, event modeling, or cross-feature coupling grows | forcing complex workflow state into Context with ad hoc setters |

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

## Mixed-mode defaults
- Dashboard: URL state + TanStack Query + local UI state
- Authenticated SaaS app: Context for auth/theme + TanStack Query for data + optional Zustand for cross-panel coordination
- Complex product workflow: TanStack Query for remote entities + Redux Toolkit or Zustand for client workflow state

## Red flags
- “Everything goes in one store” with no lifecycle distinction
- fetched API data duplicated into a second store without a clear reason
- Context used for high-churn complex workflow state just because it is dependency-free
- Redux chosen from habit even though the real issue is only prop drilling
