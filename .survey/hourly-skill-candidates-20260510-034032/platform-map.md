# Platform Map: oh-my-skills hourly survey loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lanes | yes | yes | yes | fixed five lanes |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | block without checks | block without checks | block without checks | required |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly cron | survey+artifacts | survey+artifacts | survey+artifacts | same contract |

## Platform Gaps
1. Missing CI check configuration causes repeated merge blockers.

Provenance: thin evidence and indexed snippet.
