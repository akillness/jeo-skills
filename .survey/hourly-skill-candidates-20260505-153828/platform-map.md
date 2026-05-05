# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| artifact schema | markdown fixed headings | markdown fixed headings | markdown fixed headings | validate_survey_artifacts.py |
| provenance labels | required | required | required | validator-approved label set |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| mandatory lanes | 5 lane sweep | 5 lane sweep | 5 lane sweep | same query family |
| degraded taxonomy | pass/degraded + causes | same | same | license/stale/low-fit/archived/low-signal/no-results |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| pre-PR validation | script execution | script execution | script execution | --platform-topic --require-provenance |
| check gating | CI check before merge | CI check before merge | CI check before merge | no checks => merge block |

## Platform Gaps
1. Graphify/RTK/Obsidian CLI 가용성 차이로 fallback 파일 생성이 필요하다. (provenance: thin evidence)
2. 검색 API 응답 스키마 차이로 필드 정규화가 필요하다. (provenance: indexed snippet)
