# Platform Map: Oh-My-Skills survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey querying | Equivalent keyword lanes | Equivalent keyword lanes | Equivalent keyword lanes | GitHub search + provenance |
| Artifact validation | heading/provenance checks | heading/provenance checks | heading/provenance checks | validator script |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | block on missing checks | block on missing checks | block on missing checks | no-checks-reported is hard block |
| Evidence | include links + labels | include links + labels | include links + labels | indexed snippet labels required |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly cron | run survey + PR | run survey + PR | run survey + PR | same five lanes |
| Degraded mode | report blockers | report blockers | report blockers | deterministic degraded causes |

## Platform Gaps
1. CI checks are frequently unconfigured on hourly branches, preventing merge completion.
2. Graph tooling availability differs by runtime; fallback artifacts are required.
