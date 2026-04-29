# Platform Map: hourly skill maintenance (hourly-skill-candidates-20260426-081527)

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifacts | `.survey/<slug>/` | `.survey/<slug>/` | `.survey/<slug>/` | 동일 산출물 계약 |
| PR workflow | gh CLI | gh CLI | gh CLI | branch→PR→checks→merge |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator 허용 라벨 사용 |
| Merge gate | checks green only | checks green only | checks green only | 실패시 non-merge |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| hourly trigger | cron | cron | cron | 동일 주기 실행 |
| fallback | file-write fallback | file-write fallback | file-write fallback | headless 안전성 확보 |

## Platform Gaps
1. 일부 런타임에서 Graphify/Obsidian CLI가 미설치일 수 있어 fallback 필요.
2. PR checks 미구성 저장소에서는 자동 merge 완료율이 낮다.
