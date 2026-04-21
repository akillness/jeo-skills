# Context: state-management next ratchet

## Workflow Context
State-management questions still show up as library debates even though the durable frontend/fullstack pattern is narrower: lift or localize state first, use URL/router ownership when the state is navigation-shaped, use server-state caches only when async data really needs cache semantics, and keep client workflow state separate from remote entities. React and React Router now both reinforce that the real job is ownership clarity, not picking a universal store.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend developer | Decide where UI, URL, form, server, and workflow state should live | Intermediate |
| Fullstack engineer | Split router/server-state ownership from client workflow state | Intermediate–advanced |
| Reviewer / agent | Reject overbuilt store choices and recommend the smallest viable owner | Intermediate–advanced |

## Current Workarounds
1. Start from a Zustand/Redux/Query comparison before classifying the state packet.
2. Duplicate remote entities into client stores so one tool appears to own everything.
3. Keep shareable filters/pagination in component or global state instead of URL/search params.
4. Use state-architecture debates to mask performance or debugging problems.

## Adjacent Problems
- Duplicate or contradictory state shapes create drift and stale UI bugs.
- Route-native data ownership gets skipped when teams assume every async path needs a separate cache/store.
- Performance, design-system, and debugging concerns keep leaking into state-architecture requests.

## User Voices
- “We need state management” often hides a smaller ownership problem rather than a need for a universal store.
  - Source: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills-wiki/queries/state-management-structural-hardening-2026-04-18.md`
- React: “remove state from both of them, move it to their closest common parent, and then pass it down to them via props.”
  - Source: https://react.dev/learn/sharing-state-between-components
- React: “Avoid contradictions in state… Avoid redundant state… Avoid duplication in state.”
  - Source: https://react.dev/learn/choosing-the-state-structure
- React Router: “most of the traditional caching solutions become redundant” for many apps because loaders/actions/forms already synchronize server data.
  - Source: https://reactrouter.com/explanation/state-management
