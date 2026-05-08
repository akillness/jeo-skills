# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifacts | supported | supported | supported | .survey/<slug>/ contract |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | validator labels required | validator labels required | validator labels required | accepted-label contract |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| hourly run | cron invocations | cron invocations | cron invocations | open-PR gate first |

## Platform Gaps
1. Checks visibility differs by repo CI setup and can block unattended merge decisions.

Provenance: direct page retrieval
