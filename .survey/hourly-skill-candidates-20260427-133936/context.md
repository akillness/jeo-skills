# Context: oh-my-skills hourly survey quality hardening

## Workflow Context
This run executed the mandatory five keyword families and produced `.survey/hourly-skill-candidates-20260427-133936/evidence.json` with lane-level metrics and recommendation candidates.
- agentic-ai-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=3810, zero_star_raw=0 (provenance: indexed snippet)
- web-frontend-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=29, zero_star_raw=0 (provenance: indexed snippet)
- web-backend-skill: lane_status=pass, kept_count=1, raw_count=15, median_stars_raw=9, zero_star_raw=2 (provenance: indexed snippet)
- cli-open-source-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=26, zero_star_raw=0 (provenance: indexed snippet)
- game-development-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=22, zero_star_raw=0 (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repository maintainer | Merge hourly quality PRs and keep skill catalog trustworthy | Advanced |
| Automation reviewer | Validate evidence fidelity and lane-health trends | Intermediate |
| Downstream skill users | Reuse curated skill recommendations safely | Mixed |

## Current Workarounds
1. Manual reviewer inspection of top recommendations to catch semantic false positives.
2. Ad-hoc notes in PR comments when keyword overlap is present but intent is negated (provenance: indexed snippet).

## Adjacent Problems
- License/freshness filtering already reduces noise but does not catch negated-intent text.
- Single-token overlap can be gamed by descriptions containing anti-claims like "no cli".

## User Voices
- "Skill Compose ... No CLI." appeared in a candidate that otherwise passed token overlap, indicating lexical overlap alone is insufficient (source: https://github.com/dp-archive/archive, provenance: indexed snippet)
- "Open-source marketplace ... ccpi CLI" represents a true-positive CLI lane candidate with explicit CLI utility (source: https://github.com/jeremylongshore/claude-code-plugins-plus-skills, provenance: indexed snippet)
