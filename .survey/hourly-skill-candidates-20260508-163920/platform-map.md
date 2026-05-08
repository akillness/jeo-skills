# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| GitHub search lanes | tool command patterns | gh CLI query sweep | gh/API fallback | five mandatory lanes + staged recovery |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | Block on no checks reported | Block on no checks reported | Block on no checks reported | merge only with green checks |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly cron | branch carry-forward updates | survey artifact generation | blocker comment refresh | deterministic slug + validators |

## Platform Gaps
1. PR checks not configured, causing repeated merge blocking despite valid artifacts.
