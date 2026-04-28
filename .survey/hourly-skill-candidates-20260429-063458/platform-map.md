# Platform Map: hourly skill candidate survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search source | gh search repos | gh search repos | gh search repos | GitHub API/CLI |
| Artifact packaging | Markdown + JSON | Markdown + JSON | Markdown + JSON | .survey/<slug>/ |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator --require-provenance |
| Platform topic map | required | required | required | validator --platform-topic |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR checks | validator + diff check | validator + diff check | validator + diff check | quality gates |
| Merge decision | checks green only | checks green only | checks green only | no-green-no-merge |

## Platform Gaps
1. CI/check absence blocks safe auto-merge despite valid artifacts.
2. Graphify query path may fail under schema drift and needs deterministic fallback.

Provenance: indexed snippet
