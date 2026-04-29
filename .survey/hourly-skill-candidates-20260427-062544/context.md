# Context: hourly-skill-candidates

## Workflow Context
This run executed the mandatory five keyword lanes and applied recovery where needed, then gated keeps by freshness, license specificity, and signal floor. Provenance labels were retained in each lane (indexed snippet / feed recovery).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Merge safe survey-driven improvements | Advanced |
| Skill contributor | Author or harden survey skill docs/rules | Intermediate |
| Automation runner | Execute hourly cron and inspect artifacts | Intermediate |

## Current Workarounds
1. Manual scanning of GitHub search pages when lane results are low-quality.
2. Ad hoc filtering by stars/license without fixed evidence schema.

## Adjacent Problems
- Lane-level degraded states can be under-reported.
- Single-lane recommendation concentration can appear healthy without broad coverage.

## User Voices
- "😎 Awesome lists about all kinds of interesting topics" — sindresorhus/awesome (indexed snippet)
- "Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞 " — openclaw/openclaw (indexed snippet)
- "The agent harness performance optimization system. Skills, instincts, memory, security, and research-first development f" — affaan-m/everything-claude-code (indexed snippet)
- "100+ AI Agent & RAG apps you can actually run — clone, customize, ship." — Shubhamsaboo/awesome-llm-apps (indexed snippet)
- "A Collection of application ideas which can be used to improve your coding skills." — florinpop17/app-ideas (indexed snippet)
