# Platform Map: oh-my-skills hourly survey loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly sweep lanes | manual instruction | manual instruction | manual instruction | 5-lane mandatory query set |
| Artifact validation | script-driven | script-driven | script-driven | `validate_survey_artifacts.py` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator-accepted labels only |
| Merge gate | checks green only | checks green only | checks green only | no-checks => block merge |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | parallel web/github retrieval | parallel web/github retrieval | parallel web/github retrieval | evidence.json with lane metrics |
| Packaging | PR body + checklist | PR body + checklist | PR body + checklist | risk/rollback/validation sections |

## Platform Gaps
1. 일부 런타임에서 CLI(예: graphify/obsidian/rtk) 미설치 가능성이 있어 fallback 파일 생성이 필요하다.
2. `gh pr checks`의 no-checks 상태는 자동 merge 경로를 차단한다.
