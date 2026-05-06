# Platform Map: oh-my-skills hourly survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lanes | supported | supported | supported | same 5-lane contract |
| Provenance labels | supported | supported | supported | validator accepted labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Keep criteria | metadata + intent | metadata + intent | metadata + intent | freshness<=24 months, non-archived, licensed |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| PR loop | create/check/merge | create/check/merge | create/check/merge | merge only on green checks |

## Platform Gaps
1. Some environments have missing CI check reports.
2. Graphify/RTK command-surface drift can require fallback artifacts.
