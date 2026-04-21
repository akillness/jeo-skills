---
name: react-best-practices
description: >
  Run measurement-led React and Next.js performance audits for waterfalls, bundle size,
  RSC/server-client boundaries, hydration mismatch, rerender churn, script cost, and slow
  page interactions. Use when the user needs help diagnosing or refactoring a slow React UI,
  App Router route, heavy client component, or Next.js page with excess JavaScript or weak
  client/server boundaries. Triggers on: React perf, Next.js perf, waterfall, bundle size,
  hydration, rerender, client component too heavy, slow route, React profiler, web vitals.
license: MIT
metadata:
  author: vercel
  version: 1.1.0
  tags: React, Next.js, performance, optimization, vercel, waterfalls, bundle-size, RSC
  platforms: Claude, ChatGPT, Gemini
---


# Vercel React Best Practices

Measurement-led React and Next.js performance skill for routing slow-page work into the right packet before refactoring. The canonical focus is waterfalls, bundle weight, RSC or client-boundary mistakes, hydration/script cost, and rerender churn; the deep `AGENTS.md` remains available, but day-to-day use should start from the lighter reference bundle and route-outs.

## When to use this skill

Reference these guidelines when:
- Writing new React components or Next.js pages
- Implementing data fetching (client or server-side)
- Reviewing code for performance issues
- Refactoring existing React/Next.js code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use Promise.all() for independent operations
- `async-dependencies` - Use better-all for partial dependencies
- `async-api-routes` - Start promises early, await late in API routes
- `async-suspense-boundaries` - Use Suspense to stream content

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-dynamic-imports` - Use next/dynamic for heavy components
- `bundle-defer-third-party` - Load analytics/logging after hydration
- `bundle-conditional` - Load modules only when feature is activated
- `bundle-preload` - Preload on hover/focus for perceived speed

### 3. Server-Side Performance (HIGH)

- `server-cache-react` - Use React.cache() for per-request deduplication
- `server-cache-lru` - Use LRU cache for cross-request caching
- `server-serialization` - Minimize data passed to client components
- `server-parallel-fetching` - Restructure components to parallelize fetches
- `server-after-nonblocking` - Use after() for non-blocking operations

### 4. Client-Side Data Fetching (MEDIUM-HIGH)

- `client-swr-dedup` - Use SWR for automatic request deduplication
- `client-event-listeners` - Deduplicate global event listeners

### 5. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-transitions` - Use startTransition for non-urgent updates

### 6. Rendering Performance (MEDIUM)

- `rendering-animate-svg-wrapper` - Animate div wrapper, not SVG element
- `rendering-content-visibility` - Use content-visibility for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-svg-precision` - Reduce SVG coordinate precision
- `rendering-hydration-no-flicker` - Use inline script for client-only data
- `rendering-activity` - Use Activity component for show/hide
- `rendering-conditional-render` - Use ternary, not && for conditionals

### 7. JavaScript Performance (LOW-MEDIUM)

- `js-batch-dom-css` - Group CSS changes via classes or cssText
- `js-index-maps` - Build Map for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in module-level Map
- `js-cache-storage` - Cache localStorage/sessionStorage reads
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist RegExp creation outside loops
- `js-min-max-loop` - Use loop for min/max instead of sort
- `js-set-map-lookups` - Use Set/Map for O(1) lookups
- `js-tosorted-immutable` - Use toSorted() for immutability

### 8. Advanced Patterns (LOW)

- `advanced-event-handler-refs` - Store event handlers in refs
- `advanced-use-latest` - useLatest for stable callback refs

## Instructions

### Step 1: Classify the primary bottleneck before suggesting fixes
Start with `references/perf-triage-modes.md` and put the task into one dominant packet:
- waterfalls / async sequencing
- bundle weight / lazy loading
- RSC / server-client boundary mistakes
- rerender churn / memoization / context spread
- hydration or third-party script cost
- measurement-first unknowns

### Step 2: Use the smallest support packet that answers the question
- `references/perf-triage-modes.md` — choose the main React / Next.js perf mode and first fixes
- `references/measurement-and-tooling-checklist.md` — decide what to measure with React Profiler, bundle analyzers, Web Vitals, or PR budget tooling
- `references/boundaries-and-route-outs.md` — keep the boundary with `state-management`, `web-accessibility`, `responsive-design`, and `performance-optimization` explicit
- `AGENTS.md` — deep rule catalog when a code generation or large refactor pass needs the full 45-rule reference

### Step 3: Prefer measurement-led fixes over blanket cargo culting
Use the measurement checklist before recommending broad memoization or cache-heavy rewrites. React Compiler, bundle analyzers, and web vitals instrumentation have changed which old React performance heuristics are still worth applying blindly.

### Step 4: Prioritize high-impact fixes first
1. Remove waterfalls and late-started async work.
2. Cut route JS and heavy client boundaries.
3. Fix hydration or script-placement mistakes.
4. Address rerender churn once the larger loading and boundary costs are understood.

### Step 5: Route adjacent work out instead of absorbing everything
- App-wide state model choice → `../state-management/SKILL.md`
- Accessibility-specific failures → `../web-accessibility/SKILL.md`
- Layout adaptation / overflow / reflow work → `../responsive-design/SKILL.md`
- Non-React or cross-stack bottlenecks → `../performance-optimization/SKILL.md`

## Examples

### Promise.all for Independent Operations (CRITICAL)

```typescript
// ❌ Sequential: 3 round trips
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()

// ✅ Parallel: 1 round trip
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```

### Avoid Barrel File Imports (CRITICAL)

```tsx
// ❌ Imports entire library (200-800ms import cost)
import { Check, X, Menu } from 'lucide-react'

// ✅ Imports only what you need
import Check from 'lucide-react/dist/esm/icons/check'
import X from 'lucide-react/dist/esm/icons/x'
```

### Dynamic Imports for Heavy Components (CRITICAL)

```tsx
// ❌ Monaco bundles with main chunk ~300KB
import { MonacoEditor } from './monaco-editor'

// ✅ Monaco loads on demand
import dynamic from 'next/dynamic'
const MonacoEditor = dynamic(
  () => import('./monaco-editor').then(m => m.MonacoEditor),
  { ssr: false }
)
```

### Use Functional setState (MEDIUM)

```tsx
// ❌ Requires state as dependency, stale closure risk
const addItems = useCallback((newItems) => {
  setItems([...items, ...newItems])
}, [items])

// ✅ Stable callback, no stale closures
const addItems = useCallback((newItems) => {
  setItems(curr => [...curr, ...newItems])
}, [])
```

## Best practices

1. Start with the lightest support packet that matches the problem; use `AGENTS.md` only when the smaller references are not enough.
2. Prefer evidence-led fixes: React Profiler, bundle analyzers, and Web Vitals should shape the recommendation before you prescribe memoization or caching.
3. Treat React Compiler as a live constraint on old memoization folklore; do not default to “wrap everything in `memo`”.
4. Keep React-specific advice separate from broader frontend concerns: use `state-management` for app-wide state choices, `web-accessibility` for WCAG remediation, and `performance-optimization` for non-React-wide bottlenecks.
5. Escalate to the compatibility alias `vercel-react-best-practices` only when an existing workflow explicitly requires that exact name.
6. Keep PR-budget and bundle-diff workflows in mind for real team usage; the skill should help with operational audits, not just code-level micro-fixes.

## Constraints

### Required Rules (MUST)

1. **Eliminate waterfalls**: Use Promise.all, Suspense
2. **Bundle optimization**: Prohibit barrel imports, use dynamic imports
3. **RSC boundaries**: Serialize only the data you need

### Prohibited (MUST NOT)

1. **Sequential await**: Do not run independent fetches sequentially
2. **Array mutations**: Use toSorted() instead of sort()
3. **Inline objects in React.cache**: Causes cache misses

## References

- `references/perf-triage-modes.md`
- `references/measurement-and-tooling-checklist.md`
- `references/boundaries-and-route-outs.md`
- `AGENTS.md`
- [React Documentation](https://react.dev)
- [Next.js Documentation](https://nextjs.org)
- [SWR](https://swr.vercel.app)
- [better-all](https://github.com/shuding/better-all)
- [Vercel Blog: Optimizing Package Imports](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [Vercel Blog: Dashboard Performance](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)

## Metadata

### Version
- **Current version**: 1.1.0
- **Last updated**: 2026-04-16
- **Supported platforms**: Claude, ChatGPT, Gemini
- **Source**: vercel/agent-skills

### Related Skills
- [performance-optimization](../performance-optimization/SKILL.md): General performance optimization
- [state-management](../state-management/SKILL.md): State management

### Tags
`#React` `#Next.js` `#performance` `#optimization` `#vercel` `#waterfalls` `#bundle-size` `#RSC` `#frontend`
