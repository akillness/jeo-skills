# Platform Map: Hourly Survey Automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Discovery lanes | prompt/policy | prompt/policy | prompt/policy | fixed 5-lane hourly sweep |
| Provenance labels | markdown tags | markdown tags | markdown tags | validator-required labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory lanes | yes | yes | yes | 5-lane contract |
| Degraded handling | explicit causes | explicit causes | explicit causes | no-results/low-fit taxonomy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | local script | local script | local script | validate_survey_artifacts.py |
| Merge decision | checks gate | checks gate | checks gate | green-only merge |

## Platform Gaps
1. gh 검색 메타 필드 shape 차이로 license 오탐 가능
2. CI checks 미보고 상태 자동화 난해

Provenance: indexed snippet
