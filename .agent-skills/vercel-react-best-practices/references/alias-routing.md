# Vercel React best practices alias routing

`vercel-react-best-practices` is a compatibility alias for `react-best-practices`.

## Use this alias when
- a user explicitly asks for `vercel-react-best-practices`
- a legacy setup surface or prompt pack still names the Vercel folder directly
- an exact-name compatibility requirement matters more than normal discovery behavior

## Route to the canonical skill when
- the request is a general React or Next.js performance audit
- the work is about waterfalls, bundle size, client/server boundaries, hydration cost, rerender churn, Web Vitals, or React Profiler usage
- the user did not explicitly depend on the legacy alias name

Canonical target: `../react-best-practices/SKILL.md`

## Required response pattern
1. Acknowledge the alias name if it triggered the skill.
2. State that the canonical guidance now lives in `react-best-practices`.
3. Continue the substantive performance work from the canonical skill and its support files.
4. Preserve the alias name only where workflow compatibility actually requires it.

## Why this exists
The repo keeps the alias to avoid breaking exact-name workflows while preventing the old Vercel-branded entry from competing with the canonical measurement-led React performance skill.
