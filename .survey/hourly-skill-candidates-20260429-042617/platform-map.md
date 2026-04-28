# Platform Map: oh-my-skills automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Research lanes | yes | yes | yes | 5 mandatory lanes |
| Artifact contract | yes | yes | yes | validator headings |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator-gated |
| Merge gate | green checks only | green checks only | green checks only | no-checks blocks merge |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Survey | tool search | tool search | tool search | evidence.json |
| PR | gh cli | gh cli | gh cli | checklist comment |

## Platform Gaps
1. 검색 API 스키마 drift 시 lane 품질 저하 가능.
2. headless 환경에서 Obsidian URI 호출 실패 가능.
