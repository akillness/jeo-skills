# React / Next.js performance triage modes

Use this file to classify the request before you touch `AGENTS.md`.

## 1. Waterfalls / async sequencing
Use when the page waits on independent fetches, late-started async work, or nested Suspense boundaries that serialize unnecessarily.

**Signals**
- “slow because it waits on three API calls”
- server components or loaders start work too late
- route HTML or data is delayed by sequential awaits

**First fixes**
- start independent work early
- use `Promise.all` for truly independent fetches
- move awaited work closer to the branch that needs it
- use Suspense for streaming instead of blocking the whole route

**Primary references**
- `AGENTS.md` waterfall rules
- <https://nextjs.org/docs/app/guides/lazy-loading>

## 2. Bundle weight / lazy loading
Use when too much JavaScript ships to the route, heavy components load eagerly, or third-party packages dominate the bundle.

**Signals**
- “bundle bloat”, “too much JS”, “dashboard route is huge”
- heavy editors/charts/modals loaded on first paint
- barrel imports or oversized icon/component packages

**First fixes**
- dynamic import heavy client components
- remove barrel imports and import narrower entry points
- defer third-party code until interaction or post-hydration
- re-check route JS with bundle analysis before and after

**Primary references**
- <https://nextjs.org/docs/app/guides/lazy-loading>
- <https://nextjs.org/docs/app/guides/package-bundling>
- <https://vercel.com/blog/how-we-optimized-package-imports-in-next-js>

## 3. RSC / server-client boundary mistakes
Use when the app pushes too much work to Client Components, serializes too much data, or confuses server-owned and client-owned logic.

**Signals**
- “client component too heavy”
- App Router route regressed after moving logic across the boundary
- lots of props or fetched data shipped only to support tiny client interactivity

**First fixes**
- move static / data-heavy work back to the server when possible
- minimize serialized props crossing the boundary
- isolate client-only instrumentation or interactivity into narrow islands
- avoid widening the client tree for analytics or convenience hooks

**Primary references**
- `AGENTS.md` server rules
- <https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals>
- <https://nextjs.org/docs/app/guides/analytics>

## 4. Rerender churn / memoization
Use when UI interactions feel sluggish because components, contexts, or callbacks trigger repeated render work.

**Signals**
- “rerenders too much”
- expensive child trees update when unrelated state changes
- context updates fan out across large subtrees

**First fixes**
- measure with React Profiler first
- reduce context spread and unnecessary parent updates
- use stable callback / memo patterns only where measurements justify them
- keep React Compiler in mind before prescribing blanket `memo` / `useCallback`

**Primary references**
- <https://react.dev/reference/react/Profiler>
- <https://react.dev/reference/react/memo>
- <https://react.dev/reference/react/useCallback>
- <https://react.dev/learn/react-compiler>

## 5. Hydration / script cost / third-party side effects
Use when the page flashes, mismatches, or slows down because browser-only code, analytics, chat widgets, or script injection happen at the wrong time.

**Signals**
- hydration mismatch warnings
- slow interaction after third-party scripts load
- layout shifts or client-only values cause flicker

**First fixes**
- isolate browser-only logic carefully
- move or defer scripts with Next script guidance
- separate user-visible hydration problems from broader state or accessibility issues
- verify whether the real issue is third-party script cost, not React rerenders

**Primary references**
- <https://nextjs.org/docs/app/guides/scripts>
- <https://nextjs.org/docs/app/guides/analytics>

## 6. Measurement-first unknowns
Use when the request only says “the page is slow” or “this route feels bad” and the bottleneck is not obvious.

**Default workflow**
1. collect the visible symptom and route scope
2. choose one measurement surface from `measurement-and-tooling-checklist.md`
3. classify into one dominant packet above
4. only then recommend specific fixes

## Route-outs
- app-wide client/server state ownership → `../state-management/SKILL.md`
- accessibility-specific failures → `../web-accessibility/SKILL.md`
- layout adaptation / overflow / reflow → `../responsive-design/SKILL.md`
- non-React-wide bottleneck or mixed backend/db/runtime issue → `../performance-optimization/SKILL.md`
