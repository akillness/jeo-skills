# Vercel React alias: measurement and route-outs

The alias should stay thin because the real React/Next.js performance work is measurement-led and already lives in `react-best-practices`.

## Canonical packets to use after alias handoff
- `../react-best-practices/references/perf-triage-modes.md`
- `../react-best-practices/references/measurement-and-tooling-checklist.md`
- `../react-best-practices/references/boundaries-and-route-outs.md`
- `../react-best-practices/AGENTS.md` for the deep 45-rule catalog

## Route-outs that must stay explicit
- App-wide state ownership or context spread decisions → `../state-management/SKILL.md`
- Accessibility-specific failures → `../web-accessibility/SKILL.md`
- Broad non-React bottlenecks or cross-stack performance work → `../performance-optimization/SKILL.md`
- Layout adaptation and viewport-specific issues → `../responsive-design/SKILL.md`

## Compact-surface rule
`SKILL.toon` and any other short-form inventory should describe this folder as a compatibility alias for `react-best-practices`, not as the main React optimization skill.

## Why this matters
React performance maintenance gets noisier when the alias looks canonical. The measured tactics — Profiler, bundle analysis, lazy loading, and route-boundary triage — belong in the canonical skill, while the alias exists only to catch exact-name legacy activation.
