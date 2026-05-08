# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Discovery lanes | supported | supported | supported | five mandatory keyword lanes |
| Provenance | required | required | required | validator labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | checks green only | checks green only | checks green only | no checks reported => blocker |
| Recommendation gate | token+signal+freshness | token+signal+freshness | token+signal+freshness | deterministic |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly cron | yes | yes | yes | run artifacts + blocker comment |

## Platform Gaps
1. Branch-level check reporting may be absent; runs must keep cadence without merging.
