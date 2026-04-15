# Measurement and tooling checklist

Use this file when the bottleneck is unclear or when you need evidence before recommending a refactor.

## 1. Choose the measurement surface

### React subtree cost
Use when the complaint is rerender churn, expensive state updates, or interaction lag inside a known subtree.
- React DevTools Profiler / `<Profiler>`
- focus on which interactions are slow and which subtree re-renders repeatedly
- remember large apps can make profiling brittle; if the profiler freezes, fall back to broader browser traces

Source: <https://react.dev/reference/react/Profiler>

### Route JS / dependency weight
Use when the page ships too much JavaScript or heavy components load on first render.
- Next bundle analyzer or equivalent bundle diff tooling
- compare before/after route weight and lazy-loaded splits
- if the team works through PRs, favor diff/budget tooling instead of one-off local screenshots

Sources:
- <https://nextjs.org/docs/14/pages/building-your-application/optimizing/bundle-analyzer>
- <https://github.com/hashicorp/nextjs-bundle-analysis>
- <https://nextjs.org/docs/app/guides/package-bundling>

### User-facing page quality
Use when the symptom is poor LCP, CLS, INP, or a release readiness question.
- Core Web Vitals / field-vs-lab checks
- Next analytics or `useReportWebVitals`
- Speed Insights or another RUM surface when available

Sources:
- <https://web.dev/articles/vitals>
- <https://nextjs.org/docs/app/guides/analytics>
- <https://vercel.com/docs/speed-insights>

### Hydration / script placement issues
Use when the issue is mismatch warnings, flicker, or degraded interaction after third-party scripts load.
- inspect script placement and loading strategy
- verify whether the problem is hydration, script cost, or a broader client-boundary mistake

Source: <https://nextjs.org/docs/app/guides/scripts>

## 2. Ask the minimum evidence questions
- Which route or interaction is slow?
- Is the complaint initial load, interaction lag, or dev-loop slowness?
- Do we already have profiler, CWV, or bundle evidence?
- Did the regression start after a routing, data-fetching, or third-party script change?

## 3. Pick the first tool, not every tool
- unknown symptom → CWV/Lighthouse or route-level reproduction first
- known large bundle → bundle analyzer first
- rerender suspicion → React Profiler first
- hydration/script warning → script and client-boundary review first
- mixed or inconclusive signal → browser performance trace after the first pass

## 4. Common real-world workflow
1. detect regression with CWV, Lighthouse, or user report
2. localize with React Profiler, bundle analyzer, or browser trace
3. classify into the triage modes
4. recommend the smallest high-impact fix first
5. re-measure after the fix instead of stacking speculative optimizations

## 5. Pitfalls
- Do not default to `memo` / `useCallback` before measuring.
- Do not treat all slow routes as bundle problems; waterfalls and boundary mistakes often dominate.
- Do not trust a single profiler screenshot as complete truth on very large pages.
- Do not keep React-specific work when the real issue is accessibility, layout, API latency, or database/runtime pressure.
