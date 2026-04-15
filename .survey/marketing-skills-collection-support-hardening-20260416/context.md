# Context: marketing-skills-collection support hardening

## Workflow Context
`marketing-skills-collection` is intentionally a compatibility alias, not a peer marketing skill. Its job is to catch legacy references, preserve the old name when useful, and immediately hand execution to the canonical `marketing-automation` router so the output still becomes one KPI-aware **Marketing Routing Brief** with one chosen lane.

This matters because broad marketing requests still arrive as mixed packets — signup funnel + onboarding emails, launch brief + messaging + measurement, homepage traffic + flat conversions — and the repository has already decided that one canonical router is better than multiple peer default skills. The alias exists to reduce migration friction across old prompt packs, docs, setup surfaces, and manifests that still reference the legacy name.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Legacy prompt-pack / catalog users | Invoke `marketing-skills-collection` by exact historical name and need compatibility-safe routing | Mixed |
| Product / growth / lifecycle operators | Need one clear broad-marketing intake path that narrows to one lane | Mixed |
| Founders / PMs / cross-functional requesters | Submit messy launch / conversion / onboarding asks that need canonical routing | Low to medium |
| Skill maintainers | Keep alias/canonical boundaries aligned across docs, manifests, compact variants, and evals | High |

## Current Workarounds
1. The alias `SKILL.md` itself catches the old name and maps it to `marketing-automation`.
2. README / README.ko / setup prompt / `skills.json` keep the alias visible but explicitly label it as a compatibility alias.
3. The alias relies on the canonical skill's support bundle (`marketing-automation/references/*`) instead of carrying its own migration-safe support packet.
4. Existing evals protect the basic behavior: accept the old name, mention the canonical mapping, choose one primary lane, and keep the output in canonical brief format.
5. In practice, maintainers currently have to trust the main `SKILL.md` more than the compact discovery layer, because the compact marketing entries still drift toward the old “23 sub-skills” peer-skill framing.

## Adjacent Problems
- Compact/runtime discovery drift: `marketing-automation/SKILL.toon`, `marketing-skills-collection/SKILL.toon`, and `.agent-skills/skills.toon` still describe the old 23-sub-skill marketing model rather than the current canonical-router + alias boundary.
- Alias support-gap status: `graphify-out/GRAPH_REPORT.md` still lists `marketing-skills-collection` as a remaining `references/` holdout.
- Discovery-surface sync burden: docs and manifests are high-degree nodes, so even small wording drift can reintroduce peer-skill ambiguity.
- Boundary confusion: the broad marketing lane must still route out game-specific launch/store work to `steam-store-launch-ops` instead of absorbing it.

## User Voices
> "Use marketing-skills-collection to help me decide what to do with our signup funnel and onboarding emails."
- Source: `.agent-skills/marketing-skills-collection/SKILL.md`, `.agent-skills/marketing-skills-collection/evals/evals.json`

> "Our team docs still mention marketing-skills-collection. Can you use it for this launch brief?"
- Source: `.agent-skills/marketing-skills-collection/SKILL.md`, `.agent-skills/marketing-skills-collection/evals/evals.json`

> "What is the highest-leverage bounded fix for the `marketing-automation` / `marketing-skills-collection` overlap?"
- Source: `.agent-skills-wiki/queries/marketing-skill-canonicalization-2026-04-12.md`

## Sources
- `.agent-skills/marketing-skills-collection/SKILL.md`
- `.agent-skills/marketing-skills-collection/evals/evals.json`
- `.agent-skills/marketing-automation/SKILL.md`
- `.agent-skills/marketing-automation/references/routing-heuristics.md`
- `.agent-skills/marketing-automation/references/measurement-handoff.md`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `graphify-out/GRAPH_REPORT.md`
- `.agent-skills-wiki/queries/marketing-skill-canonicalization-2026-04-12.md`
- `.agent-skills-wiki/concepts/marketing-cluster.md`
