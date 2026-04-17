# Context: performance-optimization structural hardening

> Research note: normal `web_search` / `web_extract` failed in this environment, so this survey used repo-local evidence, direct primary-page retrieval, and GitHub issue/discussion fallbacks.

## Workflow Context
Measurement-led performance work keeps showing up in five recurring lanes:

1. **CLI / developer workflow** — shell startup, local rebuild/reload speed, benchmark loops, and CI runtime complaints still start with timing evidence (`hyperfine`, CI regressions, profiler output) before any rewrite decision.
2. **Web frontend / backend / fullstack** — browser traces, Lighthouse audits, APM traces, query plans, and flame graphs are standard artifacts, but users still need help deciding whether the next owner is optimization, debugging, observability, refactoring, or schema work.
3. **Product / UX / ops** — teams increasingly care about field data, before/after validation, and SLO-ish regressions rather than generic “make it faster” advice.
4. **Marketing / content / automation** — Core Web Vitals, landing-page speed, SEO-oriented page audits, and spreadsheet-driven PageSpeed reviews often arrive as reports or dashboards instead of engineering-style tuning briefs.
5. **Game development** — Unity Profiler, Unreal Insights, stat overlays, and device-specific frame captures are the real intake packets; once the issue is clearly engine-specific, routing to `game-performance-profiler` matters.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend / fullstack engineer | Diagnose slow interactions, page loads, or heavy route transitions | Intermediate–advanced |
| Backend / API engineer | Isolate endpoint, DB, queue, or runtime hot paths | Intermediate–advanced |
| Developer experience / CI owner | Compare benchmark regressions and slow automation loops | Intermediate |
| Product / growth / content stakeholder | Track CWV, page speed, and field-performance impact | Beginner–intermediate |
| Game engineer / technical artist | Interpret frame-time, streaming, memory, and device-budget evidence | Intermediate–advanced |

## Current Workarounds
1. Bounce between traces, audits, APM dashboards, query plans, and profiler screenshots, then summarize the bottleneck manually.
2. Keep ad hoc before/after notes in docs, tickets, Notion, or spreadsheets rather than a repeatable tuning packet.
3. Use tool-specific compare views (`Lighthouse`, `WebPageTest`, `k6`, `Dalibo Explain`, flamegraphs, Unity/Unreal captures) without a consistent cross-tool handoff format.
4. Route too early to neighboring skills like `monitoring-observability`, `debugging`, or `code-refactoring` because the intake artifact is real but the next owner is not explicit.
5. For marketing/content and game workflows, fall back to domain-specific reports or screenshots that a generic optimization skill can mis-handle unless its route-outs stay sharp.

## Adjacent Problems
- **Observability vs tuning** — sometimes the real gap is missing telemetry, not optimization.
- **Debugging vs performance work** — “slow” complaints can still be correctness or environment-diff issues first.
- **Structural cleanup vs bounded tuning** — once a hotspot is proven, the next job may become refactoring, indexing, asset changes, or architecture work.
- **Environment mismatch** — local, CI, staging, production, and target hardware often expose different bottlenecks.
- **Artifact mismatch** — teams often arrive with whatever artifact they already have, not the one an ideal optimization intake would request.

## User Voices
- “**Eventually startup takes forever** ...” — oh-my-zsh issue #13505  
  https://github.com/ohmyzsh/ohmyzsh/issues/13505
- “**It takes about 30 seconds to do a full reload** ...” — Next.js discussion #17977  
  https://github.com/vercel/next.js/discussions/17977
- A step taking **less than a second** can take **10s of minutes or even hours** to complete — GitHub Actions runner issue #1031  
  https://github.com/actions/runner/issues/1031
- “**What is the best way to measure improvement in Core Web Vitals?**” — WordPress Performance issue #1426  
  https://github.com/WordPress/performance/issues/1426
