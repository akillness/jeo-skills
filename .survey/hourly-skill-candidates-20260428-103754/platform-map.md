# Platform Map: oh-my-skills survey pipeline

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence collection | Search APIs + web scrape | Search APIs + gh search | Search APIs | Survey artifact schema with provenance labels |
| Knowledge storage | Markdown notes | Markdown notes | Markdown notes | .survey/<slug>/ + wiki append |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Candidate promotion | lane + quality gates | lane + quality gates | lane + quality gates | no archived, non-unknown license, <=24 months stale, intent overlap |
| Validation | artifact validator | artifact validator | artifact validator | --platform-topic --require-provenance |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Post-survey summary | RTK | RTK | RTK | rtk-summary.md |
| Graph refinement | Graphify | Graphify | Graphify | graphify-refined.json fallback on query failure |

## Platform Gaps
1. Graphify query schema drift (links vs edges) can break unattended runs; fallback artifact is mandatory.
2. Obsidian CLI may be unavailable in headless environments; direct vault write is required fallback.
