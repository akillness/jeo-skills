# Platform Map: oh-my-skills hourly survey run hourly-skill-candidates-20260425-112704

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly scheduling | external cron + prompt packet | external cron + prompt packet | external cron + prompt packet | timestamped branch/run-slug policy |
| Evidence retrieval | search/web + fallback | gh/native retrieval allowed | web/browser retrieval | provenance labels + evidence.json contract |
| Artifact validation | validator script | validator script | validator script | `.survey/{slug}` fixed schema |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Keyword coverage | 5 mandatory lanes | 5 mandatory lanes | 5 mandatory lanes | agentic/frontend/backend/cli/game |
| Relevance gate | license/freshness/signal | license/freshness/signal | license/freshness/signal | metadata minimum + risk note |
| Merge gate | green validation only | green validation only | green validation only | no merge on failed checks |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-implement | survey artifacts | survey artifacts | survey artifacts | backlog gate + lane metrics |
| Pre-merge | self-review checklist | self-review checklist | self-review checklist | explicit rollback plan |
| Post-run | wiki/log update | wiki/log update | wiki/log update | compounding knowledge trail |

## Platform Gaps
1. Toolchain availability differs for RTK/Graphify/Obsidian CLI binaries in headless runners; each run needs fallback paths.
2. Search quality variability across providers increases noise in agentic lane; deterministic rescue templates reduce drift.
3. GitHub self-approval limits require comment-based self-review instead of formal approval.
