# Context: Frontend alias support hardening

## Workflow Context
The repo already settled the structural question on 2026-04-12: `design-system` is the canonical UI-system skill and `frontend-design-system` is only a compatibility alias; `react-best-practices` is the canonical React/Next.js performance skill and `vercel-react-best-practices` is only a compatibility alias. The remaining issue is support quality, not taxonomy. Current graph output still lists both alias skills among the last `references/` holdouts, and `skills.toon` still describes both aliases like ordinary frontend skills instead of migration-safe redirect layers. That creates a mismatch between runtime manifest truth (`skills.json`), top-level docs, and the compact discovery surface.

Official source pressure points reinforce the same pattern. npm recommends deprecation messaging instead of deletion because installs should continue to work while warning users toward the supported package or version (<https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions>). React’s `<Profiler>` docs frame performance work as measurement first, not generic folklore (<https://react.dev/reference/react/Profiler>). Next.js lazy-loading guidance keeps bundle reduction and dynamic imports as concrete packetized tactics rather than broad “optimize React” advice (<https://nextjs.org/docs/app/guides/lazy-loading>). That means the aliases should stay thin and compatibility-focused while the canonical skills keep the substantive guidance.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | Keep canonical-vs-alias boundaries consistent across SKILL.md, compact variants, manifests, and docs | Advanced |
| Agent using compact discovery | Choose the right frontend skill from terse catalog surfaces like `skills.toon` | Intermediate |
| Legacy workflow owner | Preserve exact-name compatibility for older prompts, setup scripts, or folder-name assumptions | Intermediate |
| Frontend implementer | Reach the canonical design-system or React performance guidance quickly without accidental alias activation | Intermediate |

## Current Workarounds
1. Read the full `SKILL.md` file to discover that `frontend-design-system` is just a redirect, because the compact surface still sounds like a general UI-system skill.
2. Read the full `SKILL.md` file to discover that `vercel-react-best-practices` is only an alias, because the compact surface still sounds like the old canonical Vercel guidance.
3. Infer support boundaries from nearby canonical skills (`design-system`, `react-best-practices`) because the alias folders themselves do not ship focused `references/` packets.
4. Rely on wiki memory or graph reports to remember that these are the last frontend alias support gaps instead of making the folders self-explanatory.

## Adjacent Problems
- Compact discovery drift undermines the repo-wide catalog-sync hardening work.
- Thin alias folders make future contributors more likely to re-promote aliases into peer skills.
- Weak alias support increases the odds of adding new overlapping frontend wrappers instead of improving the canonical pair.
- Frontend cluster maintenance gets harder when canonical docs are accurate but compact surfaces lag behind.

## User Voices
- npm docs: deprecating a package lets installs keep working while printing a message that can point users to “a specific version, or an alternate, supported package” — a direct model for compatibility aliases that preserve old entry points while steering to the canonical target (<https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions>). Source type: browser-rendered primary page evidence.
- React docs: `<Profiler>` “lets you measure rendering performance of a React tree programmatically,” reinforcing that the React performance lane should stay measurement-led in the canonical skill rather than getting re-bloated inside its alias (<https://react.dev/reference/react/Profiler>). Source type: browser-rendered primary page evidence.
- Next.js docs: the lazy-loading guide centers `next/dynamic`, deferred loading, and reduced initial JS, which supports keeping React performance tactics in focused packets and leaving the alias as a routing shell (<https://nextjs.org/docs/app/guides/lazy-loading>). Source type: browser-rendered primary page evidence.
- Carbon content guidance emphasizes consistency and interoperability across offerings, which maps well to why the design-system alias should preserve continuity without becoming a second competing UI-system source of truth (<https://carbondesignsystem.com/guidelines/content/overview/>). Source type: browser-rendered primary page evidence.
