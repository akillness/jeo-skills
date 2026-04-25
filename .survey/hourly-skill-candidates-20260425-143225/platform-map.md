# Platform Map: oh-my-skills hourly candidate sweep

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact contract | `.survey/{slug}` markdown package | 동일 | 동일 | 템플릿 고정 + validator 실행 |
| Evidence retrieval | web/API 혼합 가능 | `gh search repos` fallback 강함 | 웹 검색 중심 | provenance label로 근거 레벨 명시 |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required lanes | 5 keyword lane 매 실행 | 동일 | 동일 | agentic/frontend/backend/cli/game 고정 |
| Metadata gate | license/pushed_at/archived/fit rationale | 동일 | 동일 | recommendation-grade keep 조건 |
| Provenance | direct/feed/indexed labels | 동일 | 동일 | `--require-provenance` validator 통과 |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Post-survey processing | RTK -> Graphify -> Obsidian -> LLM-Wiki | 동일 | 동일 | 실행 산출물 누적 관리 |

## Platform Gaps
1. 검색 API 품질 편차 시 lane raw_count 변동이 커질 수 있어 recovery query cookbook이 필요하다.
2. Obsidian CLI가 없는 런타임은 vault 파일 직접 쓰기 fallback이 필수다.
