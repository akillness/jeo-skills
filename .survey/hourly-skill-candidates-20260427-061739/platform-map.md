# Platform Map: hourly survey fallback execution

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search transport fallback | Use GitHub-native CLI when web search fails | Same | Same | `gh search repos` + `gh api` with evidence logging |
| Evidence storage | `.survey/<slug>/evidence.json` + markdown artifacts | Same | Same | Stable artifact contract + validator |
| Provenance labels | direct page retrieval / indexed snippet | Same | Same | Validator-supported labels only |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required keyword families | 5-lane hourly sweep | 5-lane hourly sweep | 5-lane hourly sweep | agentic/web-frontend/web-backend/cli/game |
| Quality gate | relevance + freshness + signal floor | same | same | lane_status + degraded_causes + metrics |
| Transport outage handling | switch retrieval, keep run alive | same | same | explicit fallback and error artifact |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Survey step | run lane sweep + quality gate | same | same | write triage/context/solutions/platform-map |
| Validation step | run `validate_survey_artifacts.py` | same | same | enforce heading/provenance contract |
| Reporting step | include transport status + lane health | same | same | merge-safe factual report |

## Platform Gaps
1. Search backend credential failures can occur independently from GitHub API access.
2. Without explicit `transport` degraded-cause taxonomy, reviewers may misread degraded lanes as ecosystem absence.
3. Obsidian CLI may be unavailable in headless cron; direct vault file write is needed as fallback.

## Sources
- https://github.com/cli/cli#readme (indexed snippet)
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/SKILL.md (direct page retrieval)
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md (direct page retrieval)
