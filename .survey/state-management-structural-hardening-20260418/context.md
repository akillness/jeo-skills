# Context: state-management structural hardening

## Workflow Context
React’s own guidance still starts with ownership, not libraries: lift shared state to the closest common ancestor before escalating (`https://legacy.reactjs.org/docs/lifting-state-up.html`). Context is still a subtree-sharing tool, but React warns to apply it sparingly because it hurts reuse when overused (`https://legacy.reactjs.org/docs/context.html`). In modern Next.js work the problem is sharper because Server Components are the default and Context is client-only, so state questions now cross server/client boundaries (`https://nextjs.org/docs/app/getting-started/server-and-client-components`). TanStack Query and React Router both reinforce that remote/server-state lifecycle is a different ownership problem from synchronous client UI/workflow state (`https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state`, `https://reactrouter.com/explanation/state-management`).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend React developer | Decide whether state stays local, is lifted, or needs Context/store/query ownership | Intermediate |
| Next.js / fullstack engineer | Split server-component data flow from client-component shared state | Intermediate to advanced |
| Staff / lead frontend engineer | Set team conventions for Context vs store vs server-cache boundaries | Advanced |
| Product/dashboard app builder | Coordinate filters, modals, drafts, caches, and optimistic updates without flattening them into one store | Intermediate |
| Repo-maintenance agent | Route state-boundary requests to `state-management` instead of nearby perf/debug/API skills | Intermediate |

## Current Workarounds
1. Lift state only to the nearest shared owner before adding new tooling (`https://legacy.reactjs.org/docs/lifting-state-up.html`).
2. Use Context narrowly for theme/auth/locale-style subtree sharing while avoiding global-store sprawl (`https://legacy.reactjs.org/docs/context.html`).
3. Keep non-critical UI and most form state local instead of pushing every keystroke through a global store (`https://redux.js.org/faq/organizing-state/`).
4. Put remote entities, invalidation, and optimistic updates in a server-state cache such as TanStack Query, then keep only the remaining tiny client state elsewhere (`https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state`).
5. Use URL search params, cookies, sessions, and router-native data APIs when the URL or route layer is the real state owner (`https://reactrouter.com/explanation/state-management`, `https://nextjs.org/docs/app/api-reference/functions/use-search-params`).
6. Introduce lightweight client stores like Zustand only when shared client workflow state remains after the server-state / URL / form split (`https://github.com/pmndrs/zustand`).

## Adjacent Problems
- Prop drilling is often a symptom of ownership or composition mistakes, not proof that Redux or Zustand is required (`https://legacy.reactjs.org/docs/context.html`).
- Context/provider sprawl creates maintenance overhead and “context hell” in inherited codebases (`https://stackoverflow.com/questions/67467924/how-to-reduce-react-context-hell`, `https://github.com/facebook/react/issues/14620`).
- Server Components reintroduce boundary confusion because context providers must live on the client side (`https://nextjs.org/docs/app/getting-started/server-and-client-components`).
- Optimistic UI often sits on the seam between API contract design and state ownership, which is why route-outs to `api-design` matter.
- Rerender churn and hydration mistakes can look like state problems even when the real task belongs to `react-best-practices`.

## User Voices
- “This has resulted in what might be described as ‘context hell’ … causing considerable cognitive overhead” — Stack Overflow on nested provider sprawl (`https://stackoverflow.com/questions/67467924/how-to-reduce-react-context-hell`).
- “How do you provide context to server components?” — Stack Overflow on Next.js Server Component boundaries (`https://stackoverflow.com/questions/75771459/how-to-provide-context-to-react-server-components-next-js-13-2-e-g-theme`).
- “We can't use context … How can I do it without polluting it with prop drilling?” — Stack Overflow on server-tree state sharing (`https://stackoverflow.com/questions/77622053/how-to-pass-data-to-child-server-components-without-prop-drilling-and-using-cont`).
- Enterprise React apps still fall back to extensive prop drilling when cross-instance ownership is hard to model (`https://github.com/facebook/react/issues/27754`).
