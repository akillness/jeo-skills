# Context: oh-my-skills hourly survey maintenance

## Workflow Context
Hourly cron run scans five required keyword families, applies relevance/freshness/signal gates, and promotes recommendation-grade candidates into low-risk repository improvements.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Approve and merge survey-backed improvements | advanced |
| Automation agent | Collect evidence, implement hardening, open PR | advanced |
| Skill consumers | Reuse stabilized workflows in daily tasks | intermediate |

## Current Workarounds
1. Manual ad-hoc repo search without stable gating.
2. Single-query discovery that overweights noisy low-signal hits.
3. Inconsistent provenance notation across artifacts.

## Adjacent Problems
- `agentic-ai-skill` lane_status: **pass** | kept_count=31 raw_count=70 median_stars_raw=142.5 zero_star_raw=25 | degraded_causes=license,low-signal
- `web-frontend-skill` lane_status: **pass** | kept_count=5 raw_count=23 median_stars_raw=36 zero_star_raw=3 | degraded_causes=license,low-signal,stale
- `web-backend-skill` lane_status: **degraded** | kept_count=0 raw_count=6 median_stars_raw=167.5 zero_star_raw=0 | degraded_causes=license,low-fit,stale
- `cli-open-source-skill` lane_status: **pass** | kept_count=8 raw_count=9 median_stars_raw=87 zero_star_raw=0 | degraded_causes=license,stale
- `game-development-skill` lane_status: **pass** | kept_count=1 raw_count=35 median_stars_raw=0 zero_star_raw=22 | degraded_causes=archived,license,low-signal,stale

## User Voices
- "github/awesome-copilot remains actively maintained and maps to agentic-ai-skill." — https://github.com/github/awesome-copilot (indexed snippet)
- "zarazhangrui/frontend-slides remains actively maintained and maps to web-frontend-skill." — https://github.com/zarazhangrui/frontend-slides (indexed snippet)
- "jeremylongshore/claude-code-plugins-plus-skills remains actively maintained and maps to cli-open-source-skill." — https://github.com/jeremylongshore/claude-code-plugins-plus-skills (indexed snippet)
- "tjboudreaux/cc-plugin-unity-gamedev remains actively maintained and maps to game-development-skill." — https://github.com/tjboudreaux/cc-plugin-unity-gamedev (indexed snippet)
