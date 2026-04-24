# Platform Map: hourly-skill-candidates maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search tooling availability | web_search may fail by key/env | same risk in shared env | same risk | fallback to GitHub API direct retrieval |
| Artifact validation | Python validator | Python validator | Python validator | identical `.survey/<slug>` contract |
| Knowledge sinks | Obsidian/LLM-Wiki optional | same | same | markdown-first persistence |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Candidate discovery mode | survey-first | survey-first | survey-first | required keyword sweep + provenance |
| Merge gate | validation + review checklist | validation + review checklist | validation + review checklist | no merge on failed verification |
| Change scope | small reversible patch | small reversible patch | small reversible patch | rollback = single commit revert |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Post-survey validation | optional hook | manual command | optional hook | `validate_survey_artifacts.py` |
| PR self-review | optional | manual | optional | checklist documented in artifact |
| Knowledge sync | optional integrations | manual CLI | optional integrations | write markdown artifacts persistently |

## Platform Gaps
1. web_search API key 상태가 런타임 환경 의존적이라 fallback 경로가 항상 필요하다.
2. Obsidian/LLM-Wiki 통합은 플랫폼 공통 표준 도구가 아니므로 degrade-safe 문서화가 필요하다.
3. Graph query 스키마 차이(`edges` vs `links`)는 run-local normalization 절차가 필요하다.
