# Platform Map: hourly-skill-candidates

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey Query | GitHub 검색 | GitHub 검색 | GitHub 검색 | 5개 lane 고정 |
| Provenance | markdown 라벨 | markdown 라벨 | markdown 라벨 | validator --require-provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Lane Coverage | 5 lane 필수 | 5 lane 필수 | 5 lane 필수 | no-results 시 recovery |
| Quality Gate | checks green 필요 | checks green 필요 | checks green 필요 | no checks면 merge 금지 |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Artifact Generation | evidence + md | evidence + md | evidence + md | .survey/<slug>/ |
| PR Lifecycle | create/comment/checks | create/comment/checks | create/comment/checks | squash merge on green |

## Platform Gaps
1. GraphQL/API 일시 오류 시 default branch 조회가 실패할 수 있어 git remote HEAD fallback 필요.
2. check 미보고 상태가 지속되면 자동 머지 루프가 중단된다.
