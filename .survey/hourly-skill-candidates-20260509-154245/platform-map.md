# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence schema | yes | yes | yes | JSON contract validator |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance | required | required | required | indexed snippet / direct page retrieval |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | yes | yes | yes | survey + validation + PR gating |

## Platform Gaps
1. Missing CI checks on active carry-forward PR blocks merge.
