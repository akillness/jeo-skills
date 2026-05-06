# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Non-interactive cron | yes | yes | yes | 승인질문 없이 완료 |
| GitHub PR flow | gh/curl | gh/curl | gh/curl | checks gate 필요 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | enforced | enforced | enforced | validator with --require-provenance |
| Merge policy | green only | green only | green only | no-checks => block |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| discovery | keyword lanes | keyword lanes | keyword lanes | evidence.json |
| validation | artifact validator | artifact validator | artifact validator | strict flags |

## Platform Gaps
1. gh pr checks 가 no checks reported 를 반환하면 자동 머지 불가.
2. 외부 도구(rtk/graphify/obsidian) 미설치 환경에서 대체 산출물 필요.

Provenance: indexed snippet, thin evidence
