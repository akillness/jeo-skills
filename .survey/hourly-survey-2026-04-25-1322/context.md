# Context: hourly-survey-2026-04-25-1322

## Workflow Context
This survey run used the required 5 keyword families first, then recovery templates and GitHub-native fallback (`gh search`, `gh repo view`) when web search was unavailable.

Provenance labels used in this run:
- browser-rendered retrieval (keyword sweep outputs)
- direct page retrieval (GitHub repo metadata via `gh repo view`)
- thin evidence (for failing web search endpoint access)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Decide hourly keep/drop candidates and land safe PR updates | Advanced |
| Automation operator | Keep cron survey loops deterministic under tool degradation | Advanced |
| Skill consumers | Depend on stable, auditable survey artifact contracts | Intermediate |

## Current Workarounds
1. Run all five keyword families with `gh search repos` when external web search fails.
2. Apply rescue seeds from `keyword-sweep-and-relevance-rescue.md` to prevent empty lanes.
3. Manually annotate degraded causes in free text when transport/auth failure occurs.

## Adjacent Problems
- Lane quality drift is measurable (`median_stars_raw`, `zero_star_raw`) but degraded-cause taxonomy is incomplete.
- Web search API auth failures can look like low-fit unless explicitly tracked as infra/tooling issues.
- Hourly reports become noisy when degraded causes are not normalized.

## User Voices
- "Error searching web: ... 401 ... INVALID_API_KEY" — tool output during this run
- "Unknown JSON field: nameWithOwner" — initial `gh search repos` schema mismatch, corrected with supported fields
