## Workflow Context
State-ownership decisions still appear before library choice. React’s current state docs keep the core framing simple: lift state up to the closest common parent when multiple components must change together, and keep state structure simple enough to avoid contradiction and duplication rather than reaching for a global store first. React Router’s state-management explanation sharpens the same point for fullstack apps: many “state management” problems are really cache/URL/network synchronization questions, not client-store questions.

Sources:
- React, “Sharing State Between Components” — https://react.dev/learn/sharing-state-between-components
- React, “Choosing the State Structure” — https://react.dev/learn/choosing-the-state-structure
- React Router, “State Management” — https://reactrouter.com/explanation/state-management

## Affected Users
- Frontend developers deciding whether state stays local, shared, URL-backed, form-owned, server-cached, or client-workflow scoped.
- Fullstack teams using React Router / Next.js style data loading where server-state ownership competes with client-store habits.
- Reviewers and agents trying to stop “just use Zustand/Redux” answers from flattening unlike lifecycles.

## Current Workarounds
1. Start with a store/library debate before naming the actual state packet.
2. Mirror remote/server data into a client store so one tool appears to own everything.
3. Hide shareable filters, tab state, and pagination inside local or global client state instead of URL/navigation ownership.
4. Treat performance or stale-state debugging as if they were architecture-choice questions.

## Adjacent Problems
- Duplicated or contradictory state shapes create synchronization bugs.
- Router-native data APIs get underused when teams think every async boundary needs a client cache wrapper.
- Performance and rerender complaints leak into architecture selection and blur the boundary with `react-best-practices`.
- Broken optimistic updates and stale closures leak into architecture selection and blur the boundary with `debugging`.

## User Voices
- Repo-local prior survey and wiki evidence still show the same recurring user voice pattern: “we need state management” usually hides a smaller ownership problem rather than a universal-store requirement.
  - Source: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills-wiki/queries/state-management-structural-hardening-2026-04-18.md`
