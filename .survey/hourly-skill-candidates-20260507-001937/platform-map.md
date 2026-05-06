# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact contract | markdown 중심 | markdown 중심 | markdown 중심 | validator-required headings |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | validator 호환 라벨 사용 | validator 호환 라벨 사용 | validator 호환 라벨 사용 | direct page retrieval / indexed snippet |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly loop | cron + gh | cron + gh | cron + gh | evidence.json + validator gate |

## Platform Gaps
1. CI checks 미보고(no checks reported) 상태에서는 자동 merge를 진행할 수 없다.
2. lane별 검색 품질 편차가 커서 recovery 단계가 필수다.
