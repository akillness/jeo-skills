# Platform Map: hourly skill survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| hourly survey lanes | supported | supported | supported | gh search repos |
| provenance labels | supported | supported | supported | validator labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| open PR gate | enforce | enforce | enforce | no new PR when open>=1 |
| checks gate | enforce | enforce | enforce | no merge when checks missing |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| pre-PR | open PR scan | open PR scan | open PR scan | gh pr list |
| validate | survey validator | survey validator | survey validator | validate_survey_artifacts.py |

## Platform Gaps
1. checks 미보고 브랜치는 자동 병합 판단이 불가능하다.
2. lane 검색 API는 질의별로 0건 편차가 있어 recovery가 필요하다.
