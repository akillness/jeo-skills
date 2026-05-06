# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey evidence path | .survey/<slug>/evidence.json | same | same | slug 고정 사용 |
| Provenance labels | required | required | required | validator 기준 준수 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Lane coverage | 5 lanes mandatory | 5 lanes mandatory | 5 lanes mandatory | stage1/stage2 recovery |
| Merge gate | checks green only | checks green only | checks green only | no-checks block |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| PR comment | self-review checklist | self-review checklist | self-review checklist | blocker remediation steps |

## Platform Gaps
1. gh pr checks가 no checks reported를 반환하면 자동 merge 불가
2. 검색 결과 품질 편차가 lane별로 큼 (provenance: browser-rendered indexed snippet)
