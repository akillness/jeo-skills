# Solution Landscape: react-best-practices support hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| React official docs | API and architecture guidance for memoization, effects, profiling, compiler direction | Highest-trust guidance for rerender and profiling basics; current on React Compiler direction | Distributed across many pages; not packaged for repo-local routing | <https://react.dev/reference/react/memo>, <https://react.dev/reference/react/useCallback>, <https://react.dev/reference/react/Profiler>, <https://react.dev/learn/you-might-not-need-an-effect>, <https://react.dev/learn/react-compiler> |
| Next.js official docs | Framework-native guidance for lazy loading, package bundling, analytics, scripts, and production checks | Strong on App Router, bundle shaping, web vitals, and deployment-adjacent defaults | Still manual and fragmented for day-to-day triage | <https://nextjs.org/docs/app/guides/lazy-loading>, <https://nextjs.org/docs/app/guides/package-bundling>, <https://nextjs.org/docs/app/guides/analytics>, <https://nextjs.org/docs/app/guides/scripts>, <https://nextjs.org/docs/app/guides/production-checklist> |
| Vercel guidance | Operational blogs, Speed Insights, Conformance Rules | Useful for package imports, dashboard-scale perf, and platform-aware checks | Over-indexes on Next/Vercel assumptions; not always the root-cause workflow | <https://vercel.com/blog/how-we-optimized-package-imports-in-next-js>, <https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast>, <https://vercel.com/docs/speed-insights>, <https://vercel.com/docs/conformance/rules> |
| Bundle / vitals / profiler tooling | Lighthouse, CWV, bundle analyzer, React Profiler, Chrome Performance | How teams actually detect and localize regressions | Fragmented; snapshots do not automatically become a triage packet | <https://nextjs.org/docs/14/pages/building-your-application/optimizing/bundle-analyzer>, <https://web.dev/articles/vitals>, <https://www.debugbear.com/blog/measuring-react-app-performance> |
| Ecosystem helpers | why-did-you-render, TanStack Query render optimization docs, SWR, better-all | Fill operational gaps around render diagnostics, cache/render behavior, or promise orchestration | Tool-specific and sometimes stale relative to React Compiler or framework evolution | <https://github.com/welldone-software/why-did-you-render>, <https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations>, <https://swr.vercel.app>, <https://github.com/shuding/better-all> |
| Current repo skill shape | One `SKILL.md` plus one giant `AGENTS.md` | Rich deep reference already exists | Poor day-to-day routing surface; no focused `references/` packet; weaker support symmetry than peer frontend anchors | `.agent-skills/react-best-practices/SKILL.md`, `.agent-skills/react-best-practices/AGENTS.md` |

## Categories
- **Official docs** — React and Next.js docs remain the primary trusted sources.
- **Platform/vendor guidance** — Vercel docs matter most for package imports, CWV telemetry, and Next-specific operating constraints.
- **Tooling / measurement** — teams repeatedly rely on profilers, bundle analyzers, and vitals tools.
- **Community / ecosystem references** — useful for deeper render, cache, and workflow details, but not the canonical first stop.
- **Repo-local packaging** — this repo’s stronger modernized skills usually expose small `references/` docs for modes, checklists, and route-outs instead of one monolith.

## What People Actually Use
Teams do not rely on one “React performance” playbook. They layer CWV/Lighthouse detection, bundle analyzers, React Profiler / Chrome Performance traces, and PR-level bundle checks. Next.js still documents manual analyzer review “regularly while you develop and before deploying,” while HashiCorp’s `nextjs-bundle-analysis` action exists because teams want CI comments and budgets rather than ad hoc local checks (<https://nextjs.org/docs/14/pages/building-your-application/optimizing/bundle-analyzer>, <https://github.com/hashicorp/nextjs-bundle-analysis>). That makes a mode/checklist-style reference bundle more useful than a single deep narrative file.

## Frequency Ranking
1. React official docs
2. Next.js official docs
3. Vercel platform guidance
4. Profiler / bundle / vitals tooling docs
5. Community helpers and library-specific render docs

## Key Gaps
- The current skill has depth but weak packaging for rapid triage.
- Manual workflow fragmentation is not reflected in the current skill surface; there is no focused packet for measurement-first triage, bundle analysis, or route-outs.
- React Compiler changes make old blanket memoization advice easy to over-apply without an updated repo-local summary.

## Contradictions
- React still documents `memo`, `useMemo`, and `useCallback`, but the React Compiler docs explicitly reduce the need for blanket manual memoization (<https://react.dev/learn/react-compiler>).
- Next.js and Vercel market strong automatic optimizations, but their own docs still rely on manual lazy-loading, bundle-inspection, and script-placement discipline (<https://nextjs.org/docs/app/guides/lazy-loading>, <https://nextjs.org/docs/app/guides/package-bundling>, <https://nextjs.org/docs/app/guides/scripts>).
- React-specific profiling tools remain valuable, but GitHub issues show that profilers can freeze or be difficult to trust on large apps (<https://github.com/facebook/react/issues/31133>, <https://github.com/facebook/react/issues/31401>, <https://github.com/facebook/react/issues/31977>).

## Key Insight
The best bounded improvement is not another frontend skill and not more alias polishing. It is to harden `react-best-practices` in place with a small `references/` bundle that matches how teams actually work: classify the bottleneck first, use measurement and bundle tools intentionally, and keep route-outs to state, accessibility, and general performance explicit.
