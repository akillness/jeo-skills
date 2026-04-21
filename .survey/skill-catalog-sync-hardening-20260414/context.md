# Context: skill catalog sync hardening

## Workflow Context
The repository currently has multiple discovery surfaces for the same skill catalog: live `./.agent-skills/*/SKILL.md` folders, `.agent-skills/skills.json`, `skill-query-handler.py`, README inventory tables, and `setup-all-skills-prompt.md`. A recent structural scan showed these surfaces no longer move together. In practice, the drift is visible in at least three ways:

1. Live filesystem count and manifest count disagree.
2. Renamed/removed skills remain in the manifest.
3. Game-development specialist skills exist on disk but are missing from key catalog/setup surfaces.

The failure mode is subtle: users trust the repo docs and query tools, but those surfaces can omit real skills or rank stale ones.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep skills installable, discoverable, and coherent across docs + manifests | Intermediate–advanced |
| Agent user | Find the right skill quickly from catalog text and setup prompts | Beginner–intermediate |
| Automation/tooling author | Build selection/query tooling on top of shipped skill metadata | Advanced |
| Contributor adding a skill | Update the repo without accidentally creating drift | Intermediate |

## Current Workarounds
1. Manually compare folder names against `skills.json` after a change.
2. Trust README/setup surfaces even when they are stale.
3. Read the filesystem directly when the manifest or prompt looks suspicious.
4. Fix one visible mismatch at a time without a reusable validator.

## Adjacent Problems
- Canonical-vs-alias renames are easy to document incompletely.
- Search quality degrades when runtime discovery trusts stale manifests.
- Inventory counts in README/setup become misleading after repo growth.
- High-value specialist clusters can remain effectively hidden even when the skill folders are healthy.

## User Voices
- `skill-query-handler.py` currently loads `skills.json` first and only falls back to filesystem discovery if the manifest is missing or invalid. Source: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/skill-query-handler.py`
- `README.md` currently says `85 local skill folders = 85 total installable skills`, while the live repo scan shows 89 skill folders. Source: `/Users/jang_jennie/projects/oh-my-skills/README.md`
- `setup-all-skills-prompt.md` still advertises `Install ALL 85 skills` and `Skill Inventory (85 skills)` while the repo contains additional game-development skills. Source: `/Users/jang_jennie/projects/oh-my-skills/setup-all-skills-prompt.md`
- External pattern references favor filesystem- or schema-derived catalogs over hand-maintained central registries: Astro content collections (`https://docs.astro.build/en/guides/content-collections/`), Contentlayer files source (`https://contentlayer.dev/docs/sources/files/generated-data-bd588cf1`), Backstage software catalog descriptors (`https://backstage.io/docs/features/software-catalog/descriptor-format`), Remix route/file conventions (`https://v2.remix.run/docs/file-conventions/routes/`). These were recorded as direct reference URLs because live `web_search`/`web_extract` returned `401 Invalid API key` in this environment.
