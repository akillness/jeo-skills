# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Cron survey automation | Supported | Supported | Supported | Keep artifact schema stable |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | no checks => block merge | no checks => block merge | no checks => block merge | deterministic blocker comment |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | optional hooks | optional hooks | optional hooks | validator + diff-check mandatory |

## Platform Gaps
1. CI/check wiring is repo-specific and can be absent, requiring blocker-only cadence.
