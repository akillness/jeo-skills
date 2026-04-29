# Platform Map: oh-my-skills survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| 검색 실행 | gh/web 도구 호출 | gh/web 도구 호출 | gh/web 도구 호출 | survey lane contract |
| 증거 저장 | markdown/json 아티팩트 | markdown/json 아티팩트 | markdown/json 아티팩트 | `.survey/<slug>/` 구조 |
| 검증 | validator + 체크리스트 | validator + 체크리스트 | validator + 체크리스트 | `--require-provenance` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| 필수 lane 5개 | 준수 | 준수 | 준수 | agentic/web FE/web BE/cli/game |
| provenance 라벨 | 준수 | 준수 | 준수 | indexed snippet, feed recovery 등 |
| 머지 게이트 | checks green일 때만 | checks green일 때만 | checks green일 때만 | 실패 시 non-merge |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| 조사 시작 | lane 검색 실행 | lane 검색 실행 | lane 검색 실행 | evidence.json 생성 |
| PR 생성 전 | validator 실행 | validator 실행 | validator 실행 | 품질 게이트 |
| 머지 직전 | checks 확인 | checks 확인 | checks 확인 | green gate 필요 |

## Platform Gaps
1. Graphify schema drift 발생 시 query 실패 가능 (fallback 필요)
2. headless 환경에서 Obsidian URI 실패 가능 (파일 직접쓰기 fallback)
3. CI checks 미설정 repo에서는 자동 머지 블로킹 필요
