# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifacts | `.survey/{slug}` 생성 후 검증 | 동일 | 동일 | 동일 파일명/헤딩 계약 유지 |
| Provenance labels | validator 허용 라벨 사용 | 동일 | 동일 | `direct page retrieval`/`indexed snippet` 우선 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory 5 lanes | 지원 | 지원 | 지원 | 5개 키워드 lane 강제 |
| Quality gate | validator + diff check | validator + diff check | validator + diff check | 실패 시 non-merge |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR checks | 가능 | 가능 | 가능 | validate_survey_artifacts + git diff --check |
| Post-PR self-review | 가능 | 가능 | 가능 | 체크리스트 코멘트 남김 |

## Platform Gaps
1. Headless 환경에서 Obsidian URI 기반 작성 실패 가능성이 있어 파일 직접쓰기 fallback 필요.
2. Graphify query 스키마 불일치(`links` key) 시 fallback graph 생성이 필요.
