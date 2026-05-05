# Platform Map: hourly skill survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| 증적 수집 | gh search + artifact | gh search + artifact | gh search + artifact | provenance labels required |
| 리스크 보고 | PR comment | PR comment | PR comment | merge gate block on degraded checks |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| 필수 lane | 5 lanes mandatory | 5 lanes mandatory | 5 lanes mandatory | no-results면 recovery 시도 필수 |
| 추천 승격 | token overlap + negation guard | token overlap + negation guard | token overlap + negation guard | stars/license/freshness gate |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Survey | evidence.json 생성 | evidence.json 생성 | evidence.json 생성 | slug 고정 및 재사용 |
| Validation | validator 실행 | validator 실행 | validator 실행 | --platform-topic --require-provenance |
| PR | self-review 코멘트 | self-review 코멘트 | self-review 코멘트 | checks green only merge |

## Platform Gaps
1. 검색 API 노이즈가 lane 적합도에 큰 영향
2. 일부 lane은 최신 기간 조건에서 결과가 없을 수 있음 (degraded_causes: no-results)
