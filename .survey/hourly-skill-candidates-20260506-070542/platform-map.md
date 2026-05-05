# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey source | gh search + web fallback | gh search + web fallback | gh search + web fallback | GitHub API/CLI |
| Provenance policy | required | required | required | validator labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Lane completeness | 5 mandatory lanes | 5 mandatory lanes | 5 mandatory lanes | recovery stages documented |
| Promotion gate | strict token/signal/freshness/license | strict token/signal/freshness/license | strict token/signal/freshness/license | unified criteria |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| PR creation | gh pr create | gh pr create | gh pr create | summary+risk+rollback |
| Validation | script + diff check | script + diff check | script + diff check | pass before merge |

## Platform Gaps
1. `gh pr checks` can report no checks; this blocks merge despite valid artifacts.
