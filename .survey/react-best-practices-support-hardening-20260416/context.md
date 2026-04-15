# Context: react-best-practices support hardening

## Workflow Context
React / Next.js performance work shows up in ordinary product delivery rather than rare optimization sprints. Next.js documents built-in performance reporting via `useReportWebVitals` and the analytics guide, with explicit advice to isolate the metrics component behind its own client boundary so analytics code does not expand the client-rendered tree unnecessarily (<https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals>, <https://nextjs.org/docs/app/guides/analytics>). Next’s lazy-loading guide frames `next/dynamic`, `React.lazy`, and Suspense as routine route-weight controls, while the image-optimization docs connect image handling directly to LCP and layout stability (<https://nextjs.org/docs/app/guides/lazy-loading>, <https://nextjs.org/docs/14/app/building-your-application/optimizing/images>). React’s `<Profiler>` docs position subtree measurement as a normal debugging tool rather than a niche workflow (<https://react.dev/reference/react/Profiler>). Vercel’s Core Web Vitals guidance keeps the work tied to business-facing metrics such as LCP, CLS, and INP (<https://vercel.com/guides/optimizing-core-web-vitals-in-2024>).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend / product engineer | Diagnose slow Next.js pages, client/server boundary mistakes, and rerender churn | Intermediate to advanced |
| React / Next.js reviewer | Audit PRs for waterfalls, bundle regressions, hydration risk, and expensive client code | Intermediate to advanced |
| Staff / lead engineer | Set the measurement workflow, performance budgets, and route-outs to broader perf or accessibility lanes | Advanced |
| End-user-facing product team | Feel the downstream impact through CWV regressions, slower pages, and dev-loop instability | Mixed |

## Current Workarounds
1. Isolate client-only instrumentation in a tiny metrics component to avoid widening the client tree (<https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals>).
2. Use `next/dynamic`, Suspense, and route-level lazy loading to defer heavy client code (<https://nextjs.org/docs/app/guides/lazy-loading>).
3. Use React `memo`, `useMemo`, `useCallback`, and `<Profiler>` for rerender control and measurement, while recognizing React Compiler is changing how much manual memoization remains necessary (<https://react.dev/reference/react/memo>, <https://react.dev/reference/react/useCallback>, <https://react.dev/reference/react/Profiler>, <https://react.dev/learn/react-compiler>).
4. Fall back to bundle analyzers, Lighthouse/Core Web Vitals, and Chrome DevTools when React-only profiling is insufficient (<https://nextjs.org/docs/14/pages/building-your-application/optimizing/bundle-analyzer>, <https://web.dev/articles/vitals>, <https://www.debugbear.com/blog/measuring-react-app-performance>).
5. Compare framework versions, dev servers, or toolchains when local-dev regressions dominate, especially in App Router / Turbopack complaints (<https://github.com/vercel/next.js/issues/48748>, <https://github.com/vercel/next.js/issues/78069>, <https://github.com/vercel/next.js/issues/81161>).

## Adjacent Problems
- Dev-loop performance is adjacent to runtime UX: Next.js issues show route compilation, memory spikes, and CPU churn can become the primary pain before end-user tuning even starts (<https://github.com/vercel/next.js/issues/48748>, <https://github.com/vercel/next.js/issues/78069>, <https://github.com/vercel/next.js/issues/81161>).
- Hydration and render regressions are often experienced as framework-version or architecture problems rather than isolated component bugs (<https://github.com/vercel/next.js/issues/55414>).
- Context-driven rerenders and memoization limits remain a sharp edge in real apps (<https://github.com/facebook/react/issues/15156>).
- Observability and attribution are adjacent skills: Next.js analytics and `webVitalsAttribution` solve measurement localization, not React-specific code structure (<https://nextjs.org/docs/app/guides/analytics>, <https://nextjs.org/docs/app/api-reference/config/next-config-js/webVitalsAttribution>).

## User Voices
- “I expected that NextJS didn't use 10GB.” — App Router / Turbo dev-memory complaint (<https://github.com/vercel/next.js/issues/78069>)
- “Turbopack dev server consumes a huge amount of RAM and CPU… After visiting 15 blank routes, the dev server process takes ~8000 MB.” (<https://github.com/vercel/next.js/issues/81161>)
- “I would expect hydration and render time in Next 13 to be on par or better than in Next 12. However, I get slower times.” (<https://github.com/vercel/next.js/issues/55414>)
- “I can't rely on data from context API by using (useContext hook) to prevent unnecessary rerenders with React.memo.” (<https://github.com/facebook/react/issues/15156>)
